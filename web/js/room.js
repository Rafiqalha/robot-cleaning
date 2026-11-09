// Ruang kelas 3D: lantai ubin, dinding berlubang (jendela/pintu), plafon, lampu, perabot dari denah, dekorasi.
import * as THREE from 'three';
import { CELL, ROOM_H, WALL_T } from './config.js';
import { Grid, damp, mulberry32, smoothstep, clamp } from './utils.js';
import { cloneProp } from './assets.js';
import { makePosterTexture, makeSkyTexture, makeWallTexture, makeWhiteboardTexture } from './textures.js';

const FACING_ANGLE = { S: 0, W: -Math.PI / 2, E: Math.PI / 2, N: Math.PI };
const DIR_VEC = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const OPPOSITE = { N: 'S', S: 'N', W: 'E', E: 'W' };
const CHAIR_COLORS = ['#6A9BCC', '#D97757', '#788C5D', '#D4A27F', '#C46686'];

export class Room {
  static tex = null;

  static async loadTextures() {
    if (Room.tex) return Room.tex;
    const loader = new THREE.TextureLoader();
    const L = (u, srgb) =>
      loader.loadAsync(u).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
    const [albedo, rough, normal, plaster] = await Promise.all([
      L('assets/textures/floor_albedo.jpg', true),
      L('assets/textures/floor_roughness.jpg', false),
      L('assets/textures/floor_normal.png', false),
      L('assets/textures/plaster_normal.png', false),
    ]);
    Room.tex = { albedo, rough, normal, plaster };
    return Room.tex;
  }

  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    this.root.name = 'room';
    this.dynamic = new THREE.Group();
    this.dynamic.name = 'dynamic';
    stage.scene.add(this.root);
    this.walls = [];
    this.scn = null;
  }

  // ------------------------------------------------------------------ build
  build(scn) {
    this.dispose();
    this.scn = scn;
    this.W = scn.width;
    this.H = scn.height;
    this.grid = new Grid(this.W, this.H);
    this.root.add(this.dynamic);
    this.walls = [];
    this.fixtures = new THREE.Group();
    this.lights = [];
    this.attached = { N: [], S: [], W: [], E: [] };
    this.buildFloor();
    this.buildWalls();
    this.buildCeiling();
    this.buildDecor();
    this.buildGrid();
    this.buildDynamic(scn);
    this.stage.fitToRoom(this.W, this.H);
    this.startWorld = this.grid.toWorld(scn.start[0], scn.start[1]);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
    });
    this.root.clear();
    this.dynamic = new THREE.Group();
    this.dynamic.name = 'dynamic';
  }

  buildFloor() {
    const { W, H } = this;
    const T = Room.tex;
    const rep = new THREE.Vector2(W / 2.4, H / 2.4);
    const mk = (t) => {
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.copy(rep);
      return c;
    };
    const mat = new THREE.MeshPhysicalMaterial({
      map: mk(T.albedo), roughnessMap: mk(T.rough), normalMap: mk(T.normal),
      normalScale: new THREE.Vector2(0.85, 0.85), roughness: 1.0, metalness: 0.0,
      clearcoat: 0.45, clearcoatRoughness: 0.14,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    floor.userData.ownGeo = true;
    this.floor = floor;
    this.root.add(floor);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(W + 2 * WALL_T + 0.6, 0.6, H + 2 * WALL_T + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.6, metalness: 0.2 }),
    );
    plinth.position.y = -0.3 - 0.002;
    plinth.receiveShadow = true;
    plinth.userData.noAO = false;
    this.root.add(plinth);
  }

  wallGeometry(L, holes, notches) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (const n of [...notches].sort((a, b) => a.u0 - b.u0)) {
      shape.lineTo(n.u0, 0);
      shape.lineTo(n.u0, n.v1);
      shape.lineTo(n.u1, n.v1);
      shape.lineTo(n.u1, 0);
    }
    shape.lineTo(L, 0);
    shape.lineTo(L, ROOM_H);
    shape.lineTo(0, ROOM_H);
    shape.closePath();
    for (const h of holes) {
      const p = new THREE.Path();
      p.moveTo(h.u0, h.v0); p.lineTo(h.u0, h.v1); p.lineTo(h.u1, h.v1); p.lineTo(h.u1, h.v0); p.closePath();
      shape.holes.push(p);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false, curveSegments: 1 });
  }

  wallMaterial(L) {
    const T = Room.tex;
    if (!this._wallBase) this._wallBase = makeWallTexture();
    const map = this._wallBase.clone();
    map.needsUpdate = true;
    map.repeat.set(1 / L, 1 / ROOM_H);
    const normal = T.plaster.clone();
    normal.needsUpdate = true;
    normal.repeat.set(L / 1.4, ROOM_H / 1.4);
    return new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.92, metalness: 0 });
  }

  addWall(name, L, holes, notches, pos, rotY, normal, dist) {
    const mat = this.wallMaterial(L);
    const mesh = new THREE.Mesh(this.wallGeometry(L, holes, notches), mat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.ownGeo = true;
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2b2c31, roughness: 0.5, metalness: 0.2 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, WALL_T), capMat);
    cap.userData.ownGeo = true;
    cap.castShadow = true;
    cap.position.set(L / 2, ROOM_H + 0.025, WALL_T / 2);
    mesh.add(cap);
    this.root.add(mesh);
    this.walls.push({ key: name, mesh, mat, capMat, n: new THREE.Vector2(normal[0], normal[1]), d: dist, op: 1 });
  }

  buildWalls() {
    const { W, H, scn } = this;
    const t = WALL_T;
    const doorZ = this.grid.toWorld(scn.start[0], scn.start[1]).z;
    const nWin = Math.max(2, Math.round((W - 0.5) / 2.6));
    this.windows = [];
    const holesS = [];
    for (let i = 0; i < nWin; i++) {
      const xc = -W / 2 + ((i + 0.5) * W) / nWin;
      this.windows.push(xc);
      const u0 = xc - 0.8 + W / 2 + t;
      holesS.push({ u0, u1: u0 + 1.6, v0: 0.9, v1: 2.2 });
    }
    const uc = H / 2 - doorZ;
    const doorNotch = { u0: Math.max(0.03, uc - 0.46), u1: uc + 0.46, v1: 2.1 };
    this.addWall('N', W + 2 * t, [], [], new THREE.Vector3(-W / 2 - t, 0, -H / 2 - t), 0, [0, -1], H / 2);
    this.addWall('S', W + 2 * t, holesS, [], new THREE.Vector3(-W / 2 - t, 0, H / 2), 0, [0, 1], H / 2);
    this.addWall('W', H, [], [doorNotch], new THREE.Vector3(-W / 2 - t, 0, H / 2), Math.PI / 2, [-1, 0], W / 2);
    this.addWall('E', H, [], [], new THREE.Vector3(W / 2 + t, 0, -H / 2), -Math.PI / 2, [1, 0], W / 2);
  }

  buildCeiling() {
    const { W, H } = this;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.95, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * WALL_T, H + 2 * WALL_T), mat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM_H;
    ceil.castShadow = true;
    ceil.userData.noAO = true;
    ceil.userData.ownGeo = true;
    this.ceiling = ceil;
    this.root.add(ceil);

    // panel lampu langit-langit + RectAreaLight
    const nx = clamp(Math.round(W / 3), 2, 3);
    const ny = H >= 4 ? 2 : 1;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = -W / 2 + ((i + 0.5) * W) / nx;
        const z = -H / 2 + ((j + 0.5) * H) / ny;
        const fx = cloneProp('light');
        fx.position.set(x, ROOM_H, z);
        this.fixtures.add(fx);
        const rl = new THREE.RectAreaLight(0xfff1d8, 8, 1.16, 0.26);
        rl.position.set(x, ROOM_H - 0.06, z);
        rl.lookAt(x, 0, z);
        this.root.add(rl);
        this.lights.push(rl);
      }
    }
    this.root.add(this.fixtures);
  }

  buildGrid() {
    const { W, H } = this;
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x - W / 2, 0.006, -H / 2, x - W / 2, 0.006, H / 2);
    for (let y = 0; y <= H; y++) pts.push(-W / 2, 0.006, y - H / 2, W / 2, 0.006, y - H / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    lines.visible = false;
    lines.userData.noAO = true;
    lines.userData.ownGeo = true;
    this.gridLines = lines;
    this.root.add(lines);
  }

  setGridVisible(v) {
    if (this.gridLines) this.gridLines.visible = v;
  }

  buildDecor() {
    const { W, H, scn } = this;
    const doorZ = this.grid.toWorld(scn.start[0], scn.start[1]).z;

    // papan tulis di dinding utara (+ coretan spidol)
    const wb = cloneProp('whiteboard', { ownMaterials: true });
    wb.traverse((m) => {
      if (m.isMesh && m.material.name === 'Whiteboard') {
        m.material.map = makeWhiteboardTexture(scn);
        m.material.color.set(0xffffff);
        m.material.needsUpdate = true;
      }
    });
    wb.position.set(0, 0.95, -H / 2);
    wb.scale.x = Math.min(1, (W - 1.0) / 3.1);
    this.root.add(wb);
    this.attached.N.push(wb);

    const clock = cloneProp('clock');
    clock.position.set(0, 2.55, -H / 2 + 0.0175);
    this.root.add(clock);
    this.attached.N.push(clock);
    this.clock = {
      h: clock.getObjectByName('ClockHour'),
      m: clock.getObjectByName('ClockMinute'),
      s: clock.getObjectByName('ClockSecond'),
    };

    const ac = cloneProp('ac');
    ac.position.set(Math.min(W / 2 - 1.0, 2.7), 2.4, -H / 2 + 0.12);
    this.root.add(ac);
    this.attached.N.push(ac);

    // jendela + langit di luar (dinding selatan)
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 5.2), new THREE.MeshBasicMaterial({ map: makeSkyTexture(), toneMapped: false }));
    sky.material.color.setScalar(1.35);
    sky.position.set(0, 1.55, H / 2 + 0.95);
    sky.rotation.y = Math.PI;
    sky.userData.noAO = true;
    sky.userData.ownGeo = true;
    this.root.add(sky);
    this.attached.S.push(sky);
    for (const xc of this.windows) {
      const wnd = cloneProp('window');
      wnd.position.set(xc, 0.9, H / 2 + 0.1);
      wnd.rotation.y = Math.PI;
      this.root.add(wnd);
      this.attached.S.push(wnd);
    }
    const plant = cloneProp('plant');
    plant.position.set(this.windows[0] + 0.45, 0.935, H / 2 + 0.03);
    this.root.add(plant);
    this.attached.S.push(plant);

    // pintu (dinding barat, sejajar baris titik awal)
    const door = cloneProp('door');
    door.position.set(-W / 2 - 0.1, 0, doorZ);
    door.rotation.y = Math.PI / 2;
    this.root.add(door);
    this.attached.W.push(door);

    // poster (dinding barat, setengah utara)
    [['astar', -H / 2 + 1.05], ['peas', -H / 2 + 2.15]].forEach(([kind, z]) => {
      if (z > doorZ - 1.2) return;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.02), new THREE.MeshStandardMaterial({ map: makePosterTexture(kind), roughness: 0.6 }));
      p.position.set(-W / 2 + 0.012, 1.6, z);
      p.rotation.y = Math.PI / 2;
      p.receiveShadow = true;
      p.userData.ownGeo = true;
      this.root.add(p);
      this.attached.W.push(p);
    });
  }

  // ------------------------------------------------------------ dinamis
  clearDynamic() {
    this.dynamic.traverse((o) => {
      if (o.isMesh && o.userData.ownMat) o.material.dispose?.();
    });
    this.dynamic.clear();
  }

  nearestWall(f) {
    const d = { W: f.x, E: this.W - (f.x + f.w), N: f.y, S: this.H - (f.y + f.h) };
    return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  }

  buildDynamic(scn) {
    this.scn = scn;
    this.clearDynamic();
    const rnd = mulberry32(1234 + scn.furniture.length * 31);
    const g = this.grid;
    const addGroup = (pos, facing) => {
      const grp = new THREE.Group();
      grp.position.copy(pos);
      grp.rotation.y = FACING_ANGLE[facing];
      this.dynamic.add(grp);
      return grp;
    };
    for (const f of scn.furniture) {
      const cx = f.x + (f.w - 1) / 2, cy = f.y + (f.h - 1) / 2;
      const c = g.toWorld(cx, cy);
      const horizontal = f.w >= f.h;
      const len = horizontal ? f.w : f.h;
      if (f.kind === 'desk' || f.kind === 'teacher') {
        const facing = horizontal ? 'S' : cx < this.W / 2 ? 'E' : 'W';
        const grp = addGroup(c, facing);
        const t = cloneProp(f.kind === 'desk' ? 'table' : 'teacher');
        t.scale.x = len / 2;
        grp.add(t);
        if (f.kind === 'desk') {
          for (let k = 0; k < len; k++) {
            const chair = cloneProp('chair', { ownMaterials: true });
            const col = CHAIR_COLORS[Math.floor(rnd() * CHAIR_COLORS.length)];
            chair.traverse((m) => {
              if (m.isMesh && m.material.name === 'Chair_Plastic') m.material.color.set(col);
            });
            chair.position.set((k - (len - 1) / 2) * CELL + (rnd() - 0.5) * 0.1, 0, 0.2 + rnd() * 0.075);
            chair.rotation.y = (rnd() - 0.5) * 0.22;
            grp.add(chair);
          }
        }
      } else if (f.kind === 'cabinet' || f.kind === 'shelf') {
        const wall = this.nearestWall(f);
        const facing = OPPOSITE[wall];
        const depth = f.kind === 'cabinet' ? 0.48 : 0.3;
        const off = 0.5 - depth / 2 - 0.01;
        const wv = DIR_VEC[wall];
        for (let k = 0; k < len; k++) {
          const px = horizontal ? f.x + k : f.x;
          const py = horizontal ? f.y : f.y + k;
          const p = g.toWorld(px, py);
          p.x += wv[0] * off;
          p.z += wv[1] * off;
          const grp = addGroup(p, facing);
          grp.add(cloneProp(f.kind));
        }
      } else if (f.kind === 'bin') {
        const p = g.toWorld(f.x, f.y);
        const wall = this.nearestWall(f);
        const v = DIR_VEC[wall];
        p.x += v[0] * 0.22;
        p.z += v[1] * 0.22;
        const b = cloneProp('bin');
        b.position.copy(p);
        b.scale.setScalar(1.15);
        this.dynamic.add(b);
      }
    }
    // dock pengisian di titik awal (punggung dock ke dinding terdekat)
    const sw = g.toWorld(scn.start[0], scn.start[1]);
    const dock = cloneProp('dock');
    dock.position.copy(sw);
    const wall = this.nearestWall({ x: scn.start[0], y: scn.start[1], w: 1, h: 1 });
    // model dock: punggung di -X (barat). Putar agar punggung menghadap dinding terdekat.
    dock.rotation.y = { W: 0, E: Math.PI, N: -Math.PI / 2, S: Math.PI / 2 }[wall];
    this.dynamic.add(dock);
    this.dockWall = wall;
    this.dockObj = dock;
    this.startWorld = sw;
    this.rebuildObstacles();
  }

  rebuildObstacles() {
    const g = this.grid;
    this.aabbs = [];
    for (const [x, y] of this.scn.obstacles ?? this.computeObstacles()) {
      const c = g.toWorld(x, y);
      this.aabbs.push([c.x - 0.46, c.z - 0.46, c.x + 0.46, c.z + 0.46]);
    }
  }

  computeObstacles() {
    const out = [];
    for (const f of this.scn.furniture) for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) out.push([f.x + dx, f.y + dy]);
    return out;
  }

  // ------------------------------------------------------------- per frame
  update(dt, camera) {
    const p = camera.position;
    for (const w of this.walls) {
      const s = p.x * w.n.x + p.z * w.n.y - w.d;
      const target = 1 - 0.95 * smoothstep(-0.35, 0.9, s);
      w.op = damp(w.op, target, 9, dt || 0.016);
      const ghost = w.op < 0.995;
      w.mat.opacity = w.op;
      if (w.mat.transparent !== ghost) {
        w.mat.transparent = ghost;
        w.mat.needsUpdate = true;
      }
      w.mat.depthWrite = !ghost;
      const capOp = 0.1 + 0.9 * w.op;
      w.capMat.opacity = capOp;
      w.capMat.transparent = capOp < 0.995;
      w.capMat.depthWrite = capOp >= 0.995;
      const hide = w.op < 0.4;
      for (const o of this.attached[w.key]) o.visible = !hide;
    }
    const inside = p.y < ROOM_H - 0.05 && Math.abs(p.x) < this.W / 2 + 0.2 && Math.abs(p.z) < this.H / 2 + 0.2;
    this.ceiling.material.colorWrite = inside;
    this.ceiling.material.depthWrite = inside;
    this.fixtures.visible = inside;
    if (this.clock) {
      const now = new Date();
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      if (this.clock.s) this.clock.s.rotation.z = (s / 60) * Math.PI * 2;
      if (this.clock.m) this.clock.m.rotation.z = (m / 60) * Math.PI * 2;
      if (this.clock.h) this.clock.h.rotation.z = (h / 12) * Math.PI * 2;
    }
  }
}
