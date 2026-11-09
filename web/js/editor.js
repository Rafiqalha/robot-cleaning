// Editor denah: klik lantai untuk menambah/menghapus kotoran & perabot, lalu biarkan A* merencanakan ulang.
import * as THREE from 'three';
import { mulberry32 } from './utils.js';

const TOOLS = [
  ['dirt', 'Kotoran'],
  ['desk', 'Meja'],
  ['cabinet', 'Lemari'],
  ['erase', 'Hapus'],
];

export class Editor {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.tool = 'dirt';
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.94),
      new THREE.MeshBasicMaterial({ color: '#D97757', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.position.y = 0.03;
    this.cursor.visible = false;
    this.cursor.userData.noAO = true;
    app.stage.scene.add(this.cursor);
    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = () => (this.dragging = false);
  }

  setActive(on, host) {
    const a = this.app;
    this.active = on;
    if (on) {
      this.host = host;
      host.innerHTML = `
        <div class="note" style="margin-top:8px">Klik sel lantai untuk menerapkan alat. Hasil langsung dihitung ulang oleh A* saat <b>Mulai</b>.</div>
        <div class="seg tool-seg" id="ed-tools" style="margin-top:8px">${TOOLS.map(([k, v]) => `<button data-v="${k}" class="${k === this.tool ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="btn-row" style="margin-top:8px"><button class="btn" id="ed-rand">🎲 Acak denah</button><button class="btn" id="ed-clear">Kosongkan</button></div>
        <div class="note" id="ed-info"></div>`;
      host.querySelector('#ed-tools').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.tool = b.dataset.v;
        host.querySelectorAll('#ed-tools button').forEach((x) => x.classList.toggle('on', x === b));
      });
      host.querySelector('#ed-rand').addEventListener('click', () => this.randomize());
      host.querySelector('#ed-clear').addEventListener('click', () => this.clearAll());
      const cv = a.stage.canvas;
      cv.addEventListener('pointerdown', this._down);
      cv.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      a.rig.setMode('top');
      a.room.setGridVisible(true);
      a.director.toast('Mode Editor: pilih alat lalu klik lantai. Kotoran maksimal 12 titik.');
      this.info();
    } else {
      const cv = a.stage.canvas;
      cv.removeEventListener('pointerdown', this._down);
      cv.removeEventListener('pointermove', this._move);
      window.removeEventListener('pointerup', this._up);
      this.cursor.visible = false;
      const gridOn = document.querySelector('[data-tgl="grid"]')?.classList.contains('on');
      a.room.setGridVisible(!!gridOn);
      if (a.rig.mode === 'top') a.rig.setMode('overview');
    }
  }

  cellAt(e) {
    const cv = this.app.stage.canvas;
    const r = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.app.stage.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    const [gx, gy] = this.app.room.grid.toCell(p.x, p.z);
    return this.app.room.grid.inBounds(gx, gy) ? [gx, gy] : null;
  }

  onMove(e) {
    const c = this.cellAt(e);
    if (!c) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    this.cursor.position.copy(this.app.room.grid.toWorld(c[0], c[1], 0.03));
    if (this.dragging && this.tool !== 'desk' && this.tool !== 'cabinet') this.apply(c, true);
  }

  onDown(e) {
    if (e.button !== 0) return;
    const c = this.cellAt(e);
    if (!c) return;
    this.dragging = true;
    this.apply(c, false);
  }

  furnitureAt(x, y) {
    return this.app.director.scn.furniture.findIndex((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
  }

  apply(c, drag) {
    const d = this.app.director;
    if (!['idle', 'done', 'error'].includes(d.state)) return;
    const scn = d.scn;
    const [x, y] = c;
    if (x === scn.start[0] && y === scn.start[1]) return;
    const fi = this.furnitureAt(x, y);
    const ti = scn.targets.findIndex((t) => t.x === x && t.y === y);
    let changed = false;
    if (this.tool === 'dirt') {
      if (fi >= 0) return;
      if (ti >= 0) { if (drag) return; scn.targets.splice(ti, 1); changed = true; }
      else if (scn.targets.length < 12) { scn.targets.push({ id: 0, x, y }); changed = true; }
    } else if (this.tool === 'desk' || this.tool === 'cabinet') {
      if (fi >= 0) { scn.furniture.splice(fi, 1); changed = true; }
      else {
        if (ti >= 0) scn.targets.splice(ti, 1);
        scn.furniture.push({ kind: this.tool, x, y, w: 1, h: 1 });
        changed = true;
      }
    } else if (this.tool === 'erase') {
      if (fi >= 0) { scn.furniture.splice(fi, 1); changed = true; }
      else if (ti >= 0) { scn.targets.splice(ti, 1); changed = true; }
    }
    if (changed) {
      this.renumber();
      this.app.sfx.click();
      d.applyEdit();
      this.info();
    }
  }

  renumber() {
    this.app.director.scn.targets.forEach((t, i) => (t.id = i + 1));
  }

  info() {
    const s = this.app.director.scn;
    const el = this.host?.querySelector('#ed-info');
    if (!el) return;
    // periksa keterjangkauan target (BFS sederhana)
    const obs = new Set(s.obstacles.map((o) => `${o[0]},${o[1]}`));
    const seen = new Set([`${s.start[0]},${s.start[1]}`]);
    const q = [s.start];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height || obs.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    const bad = s.targets.filter((t) => !seen.has(`${t.x},${t.y}`)).map((t) => t.id);
    el.innerHTML = `Target: <b>${s.targets.length}</b> · Perabot: <b>${s.furniture.length}</b>${bad.length ? ` · <span style="color:#ffb199">Target ${bad.join(', ')} tak terjangkau</span>` : ''}`;
  }

  clearAll() {
    const d = this.app.director;
    d.scn.furniture = [];
    d.scn.targets = [];
    d.applyEdit();
    this.info();
  }

  randomize() {
    const d = this.app.director;
    const s = d.scn;
    const rnd = mulberry32((Math.random() * 1e9) | 0);
    const occ = new Set([`${s.start[0]},${s.start[1]}`]);
    const furn = [];
    const free = (x, y, w, h) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cx = x + i, cy = y + j;
        if (cx < 0 || cy < 0 || cx >= s.width || cy >= s.height || occ.has(`${cx},${cy}`)) return false;
      }
      return true;
    };
    const put = (kind, x, y, w, h) => {
      furn.push({ kind, x, y, w, h });
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) occ.add(`${x + i},${y + j}`);
    };
    const nDesk = Math.max(2, Math.round((s.width * s.height) / 14));
    for (let t = 0, n = 0; n < nDesk && t < 300; t++) {
      const x = 1 + Math.floor(rnd() * (s.width - 2)), y = Math.floor(rnd() * s.height);
      if (free(x, y, 2, 1)) { put('desk', x, y, 2, 1); n++; }
    }
    const cy = Math.floor(rnd() * (s.height - 1));
    if (free(s.width - 1, cy, 1, 2)) put('cabinet', s.width - 1, cy, 1, 2);
    s.furniture = furn;
    s.obstacles = [];
    d.ensureObstacles();
    // sel terjangkau
    const obs = new Set(s.obstacles.map((o) => `${o[0]},${o[1]}`));
    const seen = new Set([`${s.start[0]},${s.start[1]}`]);
    const q = [s.start];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height || obs.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    const cells = [...seen].map((k) => k.split(',').map(Number)).filter((c) => !(c[0] === s.start[0] && c[1] === s.start[1]));
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const k = 4 + Math.floor(rnd() * 3);
    const picked = [];
    for (const c of cells) {
      if (picked.length >= k) break;
      if (picked.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) >= 2)) picked.push(c);
    }
    s.targets = picked.map((c, i) => ({ id: i + 1, x: c[0], y: c[1] }));
    d.applyEdit();
    this.info();
    this.app.sfx.plan();
  }
}
