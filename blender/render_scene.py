"""Render sinematik (Cycles) ruang kelas + robot dari rencana A* buatan Python.

Alur "Python -> Blender": membaca web/data/meta.json (denah) dan web/data/plans/<S>_astar_mst.json (rencana),
menyusun ruang kelas dari aset GLB, menggambar rute di lantai, lalu merender gambar beresolusi tinggi.

    blender --background --factory-startup --python blender/render_scene.py -- --scenario S3 --samples 96
"""
from __future__ import annotations

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

import lib  # noqa: E402

ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, "web", "assets", "models")
TEXDIR = os.path.join(ROOT, "web", "assets", "textures")
OUT = os.path.join(ROOT, "docs", "blender_previews")
ROOM_H, WALL_T = 3.0, 0.2


def arg(name, default, cast=str):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return cast(argv[argv.index(name) + 1]) if name in argv else default


def import_glb(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name))
    return [o for o in bpy.data.objects if o not in before]


def top_roots(objs, prefix):
    return {o.name[len(prefix):]: o for o in objs if o.parent is None and o.name.startswith(prefix)}


def clone(root, loc=(0, 0, 0), rot=0.0, scale=(1, 1, 1)):
    mp = {}
    new_root = root.copy()
    bpy.context.scene.collection.objects.link(new_root)
    new_root.parent = None
    mp[root] = new_root
    for ch in root.children_recursive:
        c = ch.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = mp[ch.parent]
        c.matrix_parent_inverse = ch.matrix_parent_inverse.copy()
        mp[ch] = c
    new_root.location = loc
    new_root.rotation_euler = (0, 0, rot)
    new_root.scale = scale
    for o in [new_root, *new_root.children_recursive]:
        o.hide_render = False
        o.hide_viewport = False
    return new_root


def hide_proto(objs):
    for o in objs:
        o.hide_render = True
        o.hide_viewport = True


def set_color_mat(obj, color):
    for slot in obj.material_slots:
        m = slot.material
        if m and m.name.startswith("Chair_Plastic"):
            nm = m.copy()
            b = next(n for n in nm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Base Color"].default_value = lib.srgb(color)
            slot.material = nm


def box(name, size, loc, mat, cut_camera=False):
    me = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    lib._box_uv(bm, 1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def tex_material(name, albedo, normal=None, rough=None, scale=(1, 1), base="#CCCCCC"):
    m = lib.material(name, base, roughness=0.5)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale[0], scale[1], 1)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    def img(path, nonc=False):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(TEXDIR, path))
        if nonc:
            t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs["Vector"], t.inputs["Vector"])
        return t

    nt.links.new(img(albedo).outputs["Color"], bsdf.inputs["Base Color"])
    if rough:
        nt.links.new(img(rough, True).outputs["Color"], bsdf.inputs["Roughness"])
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.6
        nt.links.new(img(normal, True).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def boolean_cut(wall, cutters):
    for i, c in enumerate(cutters):
        md = wall.modifiers.new(f"cut{i}", "BOOLEAN")
        md.operation = "DIFFERENCE"
        md.object = c
        md.solver = "EXACT"
    bpy.context.view_layer.objects.active = wall
    for md in list(wall.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)
    for c in cutters:
        bpy.data.objects.remove(c)


def main():
    sid = arg("--scenario", "S3")
    samples = arg("--samples", 96, int)
    resx, resy = arg("--resx", 1920, int), arg("--resy", 1080, int)
    progress = arg("--progress", 0.42, float)
    meta = json.load(open(os.path.join(ROOT, "web", "data", "meta.json"), encoding="utf-8"))
    scn = next(s for s in meta["scenarios"] if s["id"] == sid)
    plan = json.load(open(os.path.join(ROOT, "web", "data", "plans", f"{sid}_astar_mst.json"), encoding="utf-8"))
    W, H = scn["width"], scn["height"]

    lib.reset_scene()
    S = bpy.context.scene

    def world(gx, gy, z=0.0):
        return Vector((gx - W / 2 + 0.5, -(gy - H / 2 + 0.5), z))

    # ---- aset ----------------------------------------------------------------
    r_objs = import_glb("robot.glb")
    p_objs = import_glb("props.glb")
    l_objs = import_glb("litter.glb")
    robot_p = next(o for o in r_objs if o.parent is None and o.name == "Robot")
    props = top_roots(p_objs, "prop_")
    litter = top_roots(l_objs, "litter_")
    hide_proto(r_objs + p_objs + l_objs)

    # ---- lantai & dinding ---------------------------------------------------------
    floor_m = tex_material("Floor_Tile", "floor_albedo.jpg", "floor_normal.png", "floor_roughness.jpg", scale=(1 / 2.4, 1 / 2.4))
    b = next(n for n in floor_m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Coat Weight"].default_value = 0.4
    floor = box("Floor", (W, H, 0.02), (0, 0, -0.01), floor_m)
    # UV lantai agar tekstur terpetakan: pakai UV kubus bawaan (0..1 per sisi) -> skala dikoreksi lewat Mapping
    wall_m = lib.material("Wall_Paint", "#EFEBE0", roughness=0.9)
    wain_m = lib.material("Wall_Wainscot", "#B9CDC4", roughness=0.85)
    walls = []
    south_holes = []
    nwin = max(2, round((W - 0.5) / 2.6))
    win_x = [-W / 2 + (i + 0.5) * W / nwin for i in range(nwin)]
    for xc in win_x:
        south_holes.append(box("hole", (1.6, WALL_T * 3, 1.3), (xc, -(H / 2 + WALL_T / 2), 0.9 + 0.65), wall_m))
    sx, sy = scn["start"]
    door_hole = box("hole", (WALL_T * 3, 0.92, 2.1), (-(W / 2 + WALL_T / 2), world(sx, sy).y, 1.05), wall_m)
    wN = box("Wall_N", (W + 2 * WALL_T, WALL_T, ROOM_H), (0, H / 2 + WALL_T / 2, ROOM_H / 2), wall_m)
    wS = box("Wall_S", (W + 2 * WALL_T, WALL_T, ROOM_H), (0, -(H / 2 + WALL_T / 2), ROOM_H / 2), wall_m)
    wW = box("Wall_W", (WALL_T, H, ROOM_H), (-(W / 2 + WALL_T / 2), 0, ROOM_H / 2), wall_m)
    wE = box("Wall_E", (WALL_T, H, ROOM_H), (W / 2 + WALL_T / 2, 0, ROOM_H / 2), wall_m)
    boolean_cut(wS, south_holes)
    boolean_cut(wW, [door_hole])
    # wainscot (pita bawah) menempel di sisi dalam
    for nm, size, loc in (("Wain_N", (W, 0.02, 1.05), (0, H / 2 - 0.01, 0.525)), ("Wain_W", (0.02, H, 1.05), (-W / 2 + 0.01, 0, 0.525)), ("Wain_E", (0.02, H, 1.05), (W / 2 - 0.01, 0, 0.525))):
        box(nm, size, loc, wain_m)
    ceiling = box("Ceiling", (W + 2 * WALL_T, H + 2 * WALL_T, 0.1), (0, 0, ROOM_H + 0.05), wall_m)
    # dinding/ plafon yang menghadap kamera: tak terlihat oleh kamera tetapi tetap menghalangi cahaya
    for o in (wS, wE, ceiling):
        o.visible_camera = False
    # plinth gelap
    box("Plinth", (W + 2 * WALL_T + 0.6, H + 2 * WALL_T + 0.6, 0.6), (0, 0, -0.32), lib.material("Plinth", "#1B1C20", roughness=0.6, metallic=0.2))

    # ---- perabot dari denah ---------------------------------------------------------
    facing = {"S": 0.0, "W": -math.pi / 2, "E": math.pi / 2, "N": math.pi}
    import random

    rnd = random.Random(7)
    chair_cols = ["#6A9BCC", "#D97757", "#788C5D", "#D4A27F", "#C46686"]
    for f in scn["furniture"]:
        cx, cy = f["x"] + (f["w"] - 1) / 2, f["y"] + (f["h"] - 1) / 2
        c = world(cx, cy)
        horiz = f["w"] >= f["h"]
        ln = f["w"] if horiz else f["h"]
        if f["kind"] in ("desk", "teacher"):
            ang = 0.0 if horiz else (math.pi / 2 if cx < W / 2 else -math.pi / 2)
            t = clone(props["table" if f["kind"] == "desk" else "teacher"], c, ang, (ln / 2, 1, 1))
            if f["kind"] == "desk":
                for k in range(ln):
                    off = Vector(((k - (ln - 1) / 2) + (rnd.random() - 0.5) * 0.1, -(0.2 + rnd.random() * 0.075), 0))
                    off = Euler((0, 0, ang)).to_matrix() @ off
                    ch = clone(props["chair"], c + off, ang + (rnd.random() - 0.5) * 0.22)
                    set_color_mat(ch, rnd.choice(chair_cols))
        elif f["kind"] in ("cabinet", "shelf"):
            d = {"W": f["x"], "E": W - (f["x"] + f["w"]), "N": f["y"], "S": H - (f["y"] + f["h"])}
            wall = min(d, key=d.get)
            fac = {"W": "E", "E": "W", "N": "S", "S": "N"}[wall]
            depth = 0.48 if f["kind"] == "cabinet" else 0.3
            off = 0.5 - depth / 2 - 0.01
            wv = {"N": (0, 1), "S": (0, -1), "W": (-1, 0), "E": (1, 0)}[wall]  # arah ke dinding (koordinat Blender)
            for k in range(ln):
                px, py = (f["x"] + k, f["y"]) if horiz else (f["x"], f["y"] + k)
                p = world(px, py)
                p.x += wv[0] * off
                p.y += wv[1] * off
                clone(props[f["kind"]], p, facing[fac])
        elif f["kind"] == "bin":
            clone(props["bin"], c + Vector((0.22, -0.22, 0)), 0, (1.15, 1.15, 1.15))
    # dock, papan tulis, jam, AC, pintu, jendela
    clone(props["dock"], world(sx, sy), 0)
    clone(props["whiteboard"], Vector((0, H / 2, 0.95)), 0)
    clone(props["clock"], Vector((0, H / 2 - 0.0175, 2.55)), 0)
    clone(props["ac"], Vector((min(W / 2 - 1.0, 2.7), H / 2 - 0.12, 2.4)), 0)
    clone(props["door"], Vector((-(W / 2 + 0.1), world(sx, sy).y, 0)), math.pi / 2)
    cam_hidden = []
    for xc in win_x:
        cam_hidden.append(clone(props["window"], Vector((xc, -(H / 2 + 0.1), 0.9)), math.pi))
    cam_hidden.append(clone(props["plant"], Vector((win_x[0] + 0.45, -(H / 2 + 0.03), 0.935)), 0))
    for root in cam_hidden:  # menempel pada dinding yang disembunyikan dari kamera
        for o in [root, *root.children_recursive]:
            o.visible_camera = False

    # ---- target + sampah + rute --------------------------------------------------------
    pats = [["paper_a", "paper_b", "crumbs", "pencil"], ["wrapper", "juice", "spill", "crumbs"], ["paper_c", "eraser", "dust", "paper_a"], ["juice", "paper_b", "wrapper", "pencil"], ["spill", "paper_a", "eraser", "crumbs", "paper_c"], ["dust", "pencil", "paper_b", "wrapper"]]
    ring_m = lib.material("Target_Ring", "#9FC27A", emission="#B6D98F", emission_strength=2.2, roughness=0.5)
    for t in scn["targets"]:
        c = world(t["x"], t["y"])
        r2 = random.Random(t["id"] * 31 + t["x"])
        for i, nm in enumerate(pats[(t["id"] - 1) % len(pats)]):
            a = r2.random() * 6.28 + i * 1.7
            rad = 0.07 + r2.random() * 0.17 if nm not in ("spill", "dust") else r2.random() * 0.08
            s = 2.0 * (0.9 + r2.random() * 0.35)
            clone(litter[nm], c + Vector((math.cos(a) * rad, math.sin(a) * rad, 0)), r2.random() * 6.28, (s, s, s))
        bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.012, location=c + Vector((0, 0, 0.012)), major_segments=64, minor_segments=8)
        bpy.context.active_object.data.materials.append(ring_m)
    # rute oranye menyala
    pts = []
    for gx, gy in plan["cells"]:
        p = world(gx, gy, 0.02)
        if not pts or (pts[-1] - p).length > 1e-6:
            pts.append(p)
    cu = bpy.data.curves.new("Route", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.035
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p.x, p.y, p.z, 1)
    route = bpy.data.objects.new("Route", cu)
    S.collection.objects.link(route)
    route.data.materials.append(lib.material("Route_Glow", "#D97757", emission="#FF7A3D", emission_strength=7.0, roughness=0.4))

    # ---- robot di sepanjang rute ---------------------------------------------------------
    cells = plan["cells"]
    i = min(len(cells) - 2, max(1, int(progress * len(cells))))
    while i < len(cells) - 2 and cells[i] == cells[i + 1]:
        i += 1
    a, b2 = cells[i], cells[i + 1]
    d = (b2[0] - a[0], -(b2[1] - a[1]))
    ang = math.atan2(d[1], d[0]) if d != (0, 0) else 0
    rb = clone(robot_p, world(*a), ang, (1.3, 1.3, 1.3))

    # ---- cahaya ------------------------------------------------------------------------------
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.0
    sun.angle = math.radians(1.2)
    sun.color = (1.0, 0.93, 0.8)
    so = bpy.data.objects.new("Sun", sun)
    S.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(32))  # datang dari tenggara, masuk lewat jendela selatan
    for k in range(2):
        al = bpy.data.lights.new(f"Panel{k}", "AREA")
        al.energy = 140
        al.size, al.size_y = 1.2, 0.3
        al.shape = "RECTANGLE"
        ao = bpy.data.objects.new(f"Panel{k}", al)
        S.collection.objects.link(ao)
        ao.location = (-W / 4 + k * W / 2, 0, ROOM_H - 0.06)
        ao.rotation_euler = (0, 0, 0)
    S.world = bpy.data.worlds.new("Sky")
    S.world.use_nodes = True
    nt = S.world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeBackground")
    sky.inputs["Color"].default_value = (0.42, 0.62, 1.0, 1)
    sky.inputs["Strength"].default_value = 1.1
    dark = nt.nodes.new("ShaderNodeBackground")
    dark.inputs["Color"].default_value = (0.012, 0.013, 0.018, 1)
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    wout = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(sky.outputs["Background"], mix.inputs[1])
    nt.links.new(dark.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], wout.inputs["Surface"])

    # ---- kamera & render ----------------------------------------------------------------------
    R = max(W, H)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 32
    cam = bpy.data.objects.new("Cam", cam_d)
    S.collection.objects.link(cam)
    cam.location = Vector((0.74 * R, -1.12 * R, 0.86 * R))
    cam.rotation_euler = (Vector((0, 0, 0.3)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    S.camera = cam

    S.render.engine = "CYCLES"
    S.cycles.samples = samples
    S.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev_type in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.type == dev_type for d in prefs.devices):
                    for d_ in prefs.devices:
                        d_.use = d_.type == dev_type
                    S.cycles.device = "GPU"
                    print("[cycles] GPU", dev_type)
                    break
            except Exception:
                continue
    except Exception as exc:
        print("[cycles] GPU tidak tersedia:", exc)
    S.view_settings.exposure = -0.55
    S.render.resolution_x, S.render.resolution_y = resx, resy
    S.render.resolution_percentage = 100
    for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
        try:
            S.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    out = os.path.join(OUT, f"blender_cycles_{sid}.png")
    os.makedirs(OUT, exist_ok=True)
    S.render.filepath = out
    bpy.ops.render.render(write_still=True)

    # close-up robot (kamera lebih dekat)
    cam_d.lens = 50
    rp = rb.location
    # pilih sudut kamera yang bebas dari perabot/dinding (mencegah kamera terjebak di dalam meja atau rak)
    obst = {(int(c[0]), int(c[1])) for c in scn["obstacles"]}
    obst_xy = [world(ox, oy) for ox, oy in obst]

    def clearance(p):
        gx, gy = int(math.floor(p.x + W / 2)), int(math.floor(-p.y + H / 2))
        if not (0 <= gx < W and 0 <= gy < H) or (gx, gy) in obst:
            return -1.0
        near = min([math.hypot(p.x - q.x, p.y - q.y) for q in obst_xy] + [9.0])
        wall = min(p.x + W / 2, W / 2 - p.x, p.y + H / 2, H / 2 - p.y) + 0.6
        return min(near, wall)

    pref = math.atan2(-1.5, 0.9)
    best, best_score = None, -9.0
    for k in range(24):
        az = math.radians(15 * k)
        for dist in (1.5, 1.8, 2.1):
            pos = rp + Vector((dist * math.cos(az), dist * math.sin(az), 0.75))
            c = clearance(Vector((pos.x, pos.y, 0)))
            mid = clearance(Vector((rp.x + 0.5 * dist * math.cos(az), rp.y + 0.5 * dist * math.sin(az), 0)))
            dphi = abs((az - pref + math.pi) % (2 * math.pi) - math.pi)
            score = min(c, mid, 1.0) - 0.15 * dphi
            if c > 0.45 and mid > 0.3 and score > best_score:
                best, best_score = pos, score
    cam.location = best if best is not None else rp + Vector((0.9, -1.5, 0.75))
    print("[closeup] kamera:", tuple(round(v, 2) for v in cam.location), "skor", round(best_score, 2))
    cam.rotation_euler = (rp + Vector((0, 0, 0.25)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    S.render.filepath = os.path.join(OUT, f"blender_cycles_{sid}_robot.png")
    bpy.ops.render.render(write_still=True)
    print("[ok]", out)


if __name__ == "__main__":
    main()
