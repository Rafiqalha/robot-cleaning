"""Pustaka kecil pembangun model (bmesh) + material PBR + ekspor GLB + render pratinjau.

Dipakai oleh build_assets.py. Berjalan di dalam Blender (bpy), diuji pada Blender 5.2.
Konvensi: Z ke atas, satuan meter. Saat ekspor glTF (Y-up) sumbu berubah menjadi
(x, y, z)_blender -> (x, z, -y)_three.
"""
from __future__ import annotations

import math
import os
import random
from collections import defaultdict

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
MATS: dict[str, bpy.types.Material] = {}
STAGE: dict = {}


# ---------------------------------------------------------------------------
# Warna & material
# ---------------------------------------------------------------------------
def srgb(hex_str: str, a: float = 1.0) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), a)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


def material(
    name: str,
    color: str = "#CCCCCC",
    metallic: float = 0.0,
    roughness: float = 0.5,
    coat: float = 0.0,
    coat_rough: float = 0.08,
    emission: str | None = None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
    texture: str | None = None,
    ior: float = 1.45,
    transmission: float = 0.0,
) -> bpy.types.Material:
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")

    def setv(key: str, value) -> None:
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value

    setv("Base Color", srgb(color))
    setv("Metallic", metallic)
    setv("Roughness", roughness)
    setv("IOR", ior)
    if coat:
        setv("Coat Weight", coat)
        setv("Coat Roughness", coat_rough)
    if transmission:
        setv("Transmission Weight", transmission)
    if emission:
        setv("Emission Color", srgb(emission))
        setv("Emission Strength", emission_strength)
    if alpha < 1.0:
        setv("Alpha", alpha)
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    if texture:
        img = bpy.data.images.load(os.path.join(TEX_DIR, texture))
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    MATS[name] = m
    return m


# ---------------------------------------------------------------------------
# Geometri dasar
# ---------------------------------------------------------------------------
def _shade(bm: bmesh.types.BMesh, angle: float = 35.0, flat: bool = False) -> None:
    thr = math.radians(angle)
    for f in bm.faces:
        f.smooth = not flat
    if not flat:
        for e in bm.edges:
            if len(e.link_faces) == 2:
                e.smooth = e.calc_face_angle(0.0) < thr


def _box_uv(bm: bmesh.types.BMesh, scale: float = 1.0, offset: tuple[float, float] = (0.0, 0.0)) -> None:
    uvl = bm.loops.layers.uv.verify()
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            p = loop.vert.co
            if ax == 2:
                u, v = p.x, p.y
            elif ax == 1:
                u, v = p.x, p.z
            else:
                u, v = p.y, p.z
            loop[uvl].uv = (u * scale + offset[0], v * scale + offset[1])


def _rounded_rect(sx: float, sy: float, r: float, seg: int) -> list[tuple[float, float]]:
    r = max(1e-4, min(r, sx / 2 - 1e-4, sy / 2 - 1e-4))
    cx, cy = sx / 2 - r, sy / 2 - r
    pts = []
    for qx, qy, a0 in ((cx, cy, 0), (-cx, cy, 90), (-cx, -cy, 180), (cx, -cy, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((qx + r * math.cos(a), qy + r * math.sin(a)))
    return pts


def _xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)) -> Matrix:
    return Matrix.LocRotScale(Vector(loc), Euler(rot).to_quaternion(), Vector(scale))


class Asset:
    """Sekumpulan bagian mesh (dikelompokkan per material lalu di-join) di bawah satu Empty."""

    def __init__(self, name: str, loc=(0, 0, 0), rot=(0, 0, 0), parent: "Asset | None" = None) -> None:
        self.name = name
        self.root = bpy.data.objects.new(name, None)
        self.root.empty_display_type = "PLAIN_AXES"
        bpy.context.scene.collection.objects.link(self.root)
        self.root.location = loc
        self.root.rotation_euler = rot
        if parent is not None:
            self.root.parent = parent.root
        self.groups: dict[str, list[bpy.types.Object]] = defaultdict(list)
        self.children_assets: list[Asset] = []
        if parent is not None:
            parent.children_assets.append(self)
        self._n = 0

    # -- infrastruktur -----------------------------------------------------
    def sub(self, name: str, loc=(0, 0, 0), rot=(0, 0, 0)) -> "Asset":
        return Asset(name, loc, rot, parent=self)

    def _add(self, bm: bmesh.types.BMesh, mat: bpy.types.Material, name: str) -> bpy.types.Object:
        self._n += 1
        mesh = bpy.data.meshes.new(f"{self.name}_{name}_{self._n}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        self.groups[mat.name].append(obj)
        return obj

    def finalize(self) -> None:
        for sub in self.children_assets:
            sub.finalize()
        for mname, objs in list(self.groups.items()):
            if len(objs) > 1:
                bpy.ops.object.select_all(action="DESELECT")
                for o in objs:
                    o.select_set(True)
                bpy.context.view_layer.objects.active = objs[0]
                bpy.ops.object.join()
                joined = bpy.context.view_layer.objects.active
            else:
                joined = objs[0]
            joined.name = f"{self.name}_{mname}"
            joined.data.name = joined.name
            joined.parent = self.root
        self.groups.clear()

    # -- primitif ----------------------------------------------------------
    def box(self, mat, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, seg=3, uv_scale=1.0, uv_off=(0.0, 0.0), smooth=35, name="box"):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
        if bevel > 0:
            b = min(bevel, min(size) / 2 * 0.95)
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=seg, profile=0.5, affect="EDGES")
        _box_uv(bm, uv_scale, uv_off)
        _shade(bm, smooth)
        bm.transform(_xform(loc, rot))
        return self._add(bm, mat, name)

    def cyl(self, mat, r, h, loc=(0, 0, 0), rot=(0, 0, 0), r2=None, seg=28, bevel=0.0, bevel_seg=2, smooth=40, name="cyl", caps=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h)
        if bevel > 0:
            edges = [e for e in bm.edges if abs(abs(e.verts[0].co.z) - h / 2) < 1e-6 and abs(abs(e.verts[1].co.z) - h / 2) < 1e-6]
            bmesh.ops.bevel(bm, geom=edges, offset=min(bevel, r * 0.9), segments=bevel_seg, profile=0.5, affect="EDGES")
        _box_uv(bm, 1.0)
        _shade(bm, smooth)
        bm.transform(_xform(loc, rot))
        return self._add(bm, mat, name)

    def sphere(self, mat, r, loc=(0, 0, 0), scale=(1, 1, 1), seg=20, rings=12, rot=(0, 0, 0), name="sphere"):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        _box_uv(bm, 1.0)
        _shade(bm, 80)
        bm.transform(_xform(loc, rot, scale))
        return self._add(bm, mat, name)

    def ico(self, mat, r, loc=(0, 0, 0), scale=(1, 1, 1), subdiv=2, jitter=0.0, seed=0, flat=False, rot=(0, 0, 0), name="ico"):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        if jitter:
            rng = random.Random(seed)
            for v in bm.verts:
                v.co *= 1.0 + (rng.random() - 0.5) * 2 * jitter
        _box_uv(bm, 1.0)
        _shade(bm, 50, flat=flat)
        bm.transform(_xform(loc, rot, scale))
        return self._add(bm, mat, name)

    def rprism(self, mat, sx, sy, z0, z1, r, cx=0.0, cy=0.0, seg=6, bevel_top=0.0, bevel_bot=0.0, bevel_seg=3, smooth=40, uv_scale=1.0, name="rprism"):
        """Prisma persegi panjang bersudut membulat (kontur konsisten antar-lapisan)."""
        bm = bmesh.new()
        pts = _rounded_rect(sx, sy, r, seg)
        n = len(pts)
        bot = [bm.verts.new((x + cx, y + cy, z0)) for x, y in pts]
        top = [bm.verts.new((x + cx, y + cy, z1)) for x, y in pts]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for z, b in ((z0, bevel_bot), (z1, bevel_top)):
            if b > 0:
                edges = [e for e in bm.edges if abs(e.verts[0].co.z - z) < 1e-6 and abs(e.verts[1].co.z - z) < 1e-6]
                bmesh.ops.bevel(bm, geom=edges, offset=min(b, (z1 - z0) * 0.45), segments=bevel_seg, profile=0.5, affect="EDGES")
        _box_uv(bm, uv_scale)
        _shade(bm, smooth)
        return self._add(bm, mat, name)

    def lathe(self, mat, profile, seg=36, loc=(0, 0, 0), rot=(0, 0, 0), smooth=50, name="lathe"):
        """Benda putar dari profil [(r, z), ...]; r = 0 berarti titik pada sumbu."""
        bm = bmesh.new()
        rings = []
        for r, z in profile:
            if r < 1e-6:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)])
        for a, b in zip(rings[:-1], rings[1:]):
            for k in range(seg):
                k2 = (k + 1) % seg
                if len(a) == 1:
                    bm.faces.new((a[0], b[k], b[k2]))
                elif len(b) == 1:
                    bm.faces.new((a[k], a[k2], b[0]))
                else:
                    bm.faces.new((a[k], a[k2], b[k2], b[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _box_uv(bm, 1.0)
        _shade(bm, smooth)
        bm.transform(_xform(loc, rot))
        return self._add(bm, mat, name)

    def plane(self, mat, w, h, loc=(0, 0, 0), rot=(0, 0, 0), name="plane"):
        """Bidang 2D di bidang YZ (normal +X), UV 0..1: u searah +Y, v searah +Z."""
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.verify()
        vs = [bm.verts.new(p) for p in ((0, -w / 2, -h / 2), (0, w / 2, -h / 2), (0, w / 2, h / 2), (0, -w / 2, h / 2))]
        f = bm.faces.new(vs)
        for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uvl].uv = uv
        f.smooth = True
        bm.transform(_xform(loc, rot))
        return self._add(bm, mat, name)

    def mesh(self, mat, verts, faces, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), flat=False, smooth=60, name="mesh"):
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            try:
                bm.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _box_uv(bm, 1.0)
        _shade(bm, smooth, flat=flat)
        bm.transform(_xform(loc, rot, scale))
        return self._add(bm, mat, name)


    def quad(self, mat, pts, uvs, name="quad"):
        """Satu bidang 4 titik dengan UV eksplisit (urutan titik berlawanan arah jarum jam dari sisi depan)."""
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.verify()
        vs = [bm.verts.new(p) for p in pts]
        f = bm.faces.new(vs)
        for loop, uv in zip(f.loops, uvs):
            loop[uvl].uv = uv
        f.smooth = True
        return self._add(bm, mat, name)

    def text(self, mat, body, size, loc=(0, 0, 0), rot=(0, 0, 0), extrude=0.0008, name="text"):
        """Teks 3D (font bawaan Blender) -> mesh."""
        cu = bpy.data.curves.new(f"{self.name}_txt", "FONT")
        cu.body = body
        cu.size = size
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        cu.extrude = extrude
        ob = bpy.data.objects.new(cu.name, cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        bm.transform(_xform(loc, rot))
        return self._add(bm, mat, name)


# ---------------------------------------------------------------------------
# Ekspor
# ---------------------------------------------------------------------------
def export_glb(path: str, assets: list[Asset]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for a in assets:
        a.root.select_set(True)
        for c in a.root.children_recursive:
            c.select_set(True)
    full = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    try:
        bpy.ops.export_scene.gltf(**full)
    except TypeError as exc:
        print("[export] parameter ditolak, mencoba minimal:", exc)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True)
    print(f"[export] {path}  ({os.path.getsize(path) / 1024:.0f} KB)")


# ---------------------------------------------------------------------------
# Render pratinjau (EEVEE) -- dipakai untuk memeriksa model & gambar laporan
# ---------------------------------------------------------------------------
def setup_stage(res=(1000, 700), floor_color="#E9E6DD", samples=48) -> None:
    scn = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            continue
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    try:
        scn.eevee.taa_render_samples = samples
    except Exception:
        pass
    for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
        try:
            scn.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    world = bpy.data.worlds.new("StageWorld")
    scn.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.86, 0.88, 0.92, 1.0)
    bg.inputs["Strength"].default_value = 0.85

    # lantai
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    mesh = bpy.data.meshes.new("StageFloor")
    bm.to_mesh(mesh)
    bm.free()
    floor = bpy.data.objects.new("StageFloor", mesh)
    bpy.context.scene.collection.objects.link(floor)
    floor.data.materials.append(material("Stage_Floor", floor_color, roughness=0.55))
    rig = bpy.data.objects.new("StageRig", None)
    bpy.context.scene.collection.objects.link(rig)
    floor.parent = rig
    STAGE["rig"] = rig

    def add_light(name, kind, loc, energy, size=3.0, color=(1, 1, 1), target=(0, 0, 0.3)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == "AREA":
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = loc
        d = Vector(target) - Vector(loc)
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        lo.parent = rig
        return lo

    add_light("Key", "AREA", (2.8, -3.2, 3.6), 520, size=3.2, color=(1.0, 0.95, 0.88))
    add_light("Fill", "AREA", (-3.4, -1.5, 2.2), 160, size=3.0, color=(0.82, 0.9, 1.0))
    add_light("Rim", "AREA", (-1.0, 3.4, 2.6), 260, size=2.4, color=(1.0, 1.0, 1.0))


def render_view(path: str, center, distance: float, azim: float = 35, elev: float = 22, lens: float = 50) -> None:
    scn = bpy.context.scene
    rig = STAGE.get("rig")
    if rig is not None:
        rig.location = (center[0], center[1], 0.0)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    a, e = math.radians(azim), math.radians(elev)
    c = Vector(center)
    cam.location = c + Vector((distance * math.cos(e) * math.sin(a), -distance * math.cos(e) * math.cos(a), distance * math.sin(e)))
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    scn.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    print("[render]", path)
