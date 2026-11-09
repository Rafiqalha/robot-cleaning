// Visualisasi pencarian AI: heat-map ekspansi state + pita rute yang menyala di lantai.
import * as THREE from 'three';
import { clamp, easeOutBack, easeOutCubic, smoothstep } from './utils.js';

const RAMP = [
  [0.0, new THREE.Color('#6A9BCC')],
  [0.35, new THREE.Color('#9BB8A8')],
  [0.55, new THREE.Color('#D4A27F')],
  [0.8, new THREE.Color('#D97757')],
  [1.0, new THREE.Color('#E0507A')],
];
function ramp(t, out) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const k = (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]);
      return out.copy(RAMP[i - 1][1]).lerp(RAMP[i][1], k);
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

const RIBBON_V = /* glsl */ `
  attribute float aU; attribute float aSide; attribute float aProg;
  varying float vU; varying float vSide; varying float vProg;
  void main() { vU = aU; vSide = aSide; vProg = aProg; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_F = /* glsl */ `
  uniform float uProgress; uniform float uTime; uniform float uReveal; uniform vec3 uDone; uniform vec3 uTodo; uniform float uOpacity;
  varying float vU; varying float vSide; varying float vProg;
  void main() {
    if (vProg > uReveal) discard;
    float edge = smoothstep(1.0, 0.45, abs(vSide));
    float flow = 0.5 + 0.5 * sin(vU * 7.0 - uTime * 4.0);
    float done = step(vProg, uProgress);
    float head = exp(-abs(vProg - uReveal) * 55.0) * step(uReveal, 0.999);
    vec3 col = mix(uTodo, uDone, done) * (0.85 + 0.55 * flow) + vec3(1.0, 0.9, 0.7) * head * 1.2;
    float a = edge * mix(0.30 + 0.38 * flow, 0.95, done) + head * 0.6;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
  }`;

export class SearchViz {
  constructor(stage, room) {
    this.stage = stage;
    this.room = room;
    this.group = new THREE.Group();
    this.group.name = 'searchviz';
    stage.scene.add(this.group);
    this.tiles = null;
    this.ribbon = null;
    this.play = null;
    this.heatOpacity = 0;
    this.heatTarget = 0;
    this.heatEnabled = true;
    this.routeEnabled = true;
    this.t = 0;
    this._c = new THREE.Color();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    this.revealAnim = null;
    this.uniforms = {
      uProgress: { value: 0 }, uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 1 },
      uDone: { value: new THREE.Color('#ff9a63') }, uTodo: { value: new THREE.Color('#9fd8ff') },
    };
  }

  build() {
    this.clear(true);
    const { W, H, grid } = this.room;
    const n = W * H;
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false });
    this.tiles = new THREE.InstancedMesh(geo, mat, n);
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.tiles.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.tiles.frustumCulled = false;
    this.tiles.userData.noAO = true;
    this.counts = new Int32Array(n);
    this.born = new Float32Array(n).fill(-1);
    const p = new THREE.Vector3();
    this.cellPos = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      grid.toWorld(x, y, 0.016, p);
      this.cellPos.push(p.clone());
    }
    this.resetTiles();
    this.group.add(this.tiles);
  }

  resetTiles() {
    if (!this.tiles) return;
    const n = this.counts.length;
    const m = this._m;
    for (let i = 0; i < n; i++) {
      this.counts[i] = 0;
      this.born[i] = -1;
      m.compose(this.cellPos[i], this._q, new THREE.Vector3(0.0001, 0.0001, 0.0001));
      this.tiles.setMatrixAt(i, m);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor.needsUpdate = true;
  }

  clear(silent = false) {
    this.play = null;
    if (this.tiles) {
      this.group.remove(this.tiles);
      this.tiles.geometry.dispose();
      this.tiles.material.dispose();
      this.tiles = null;
    }
    this.clearRoute();
    this.heatOpacity = 0;
    this.heatTarget = 0;
    this.uniforms.uProgress.value = 0;
    if (!silent) this.build();
  }

  // ------------------------------------------------------------ heat-map
  /** Animasikan ekspansi state (urutan sel yang diperiksa algoritma). Mengembalikan Promise saat selesai. */
  playSearch(explore, seconds, onProgress) {
    this.resetTiles();
    const order = explore.order ?? [];
    const total = explore.total ?? order.length;
    return new Promise((resolve) => {
      this.play = { order, total, seconds: Math.max(0.4, seconds), t: 0, idx: 0, onProgress, resolve, heat: explore.heat };
      this.heatTarget = this.heatEnabled ? 0.62 : 0;
      this.tiles.material.opacity = 0;
    });
  }

  finishSearchInstant(explore) {
    const play = { order: explore.order ?? [], idx: 0 };
    this.applyUntil(play, play.order.length, 99);
  }

  applyUntil(play, upto, now) {
    const order = play.order;
    while (play.idx < upto) {
      const c = order[play.idx++];
      if (this.born[c] < 0) this.born[c] = now;
      this.counts[c]++;
    }
  }

  refreshTiles(now) {
    if (!this.tiles) return;
    let max = 1;
    for (let i = 0; i < this.counts.length; i++) if (this.counts[i] > max) max = this.counts[i];
    const m = this._m, sc = new THREE.Vector3();
    const lm = Math.log1p(max);
    for (let i = 0; i < this.counts.length; i++) {
      const c = this.counts[i];
      if (c === 0) continue;
      const age = now - this.born[i];
      const grow = easeOutBack(clamp(age / 0.35, 0, 1));
      sc.setScalar(Math.max(0.0001, grow));
      m.compose(this.cellPos[i], this._q, sc);
      this.tiles.setMatrixAt(i, m);
      ramp(Math.log1p(c) / lm, this._c);
      const flash = Math.max(0, 1 - age / 0.35);
      this._c.offsetHSL(0, 0, flash * 0.25);
      this.tiles.setColorAt(i, this._c);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor.needsUpdate = true;
  }

  setHeatEnabled(v) {
    this.heatEnabled = v;
    if (!v) this.heatTarget = 0;
    else if (this.counts && this.counts.some((c) => c > 0)) this.heatTarget = 0.5;
  }

  fadeHeat() {
    this.heatTarget = this.heatEnabled ? 0.0 : 0.0;
  }

  // ------------------------------------------------------------- rute
  clearRoute() {
    if (this.ribbon) {
      this.group.remove(this.ribbon);
      this.ribbon.geometry.dispose();
      this.ribbon.material.dispose();
      this.ribbon = null;
    }
    this.totalMoves = 0;
    this.uniforms.uProgress.value = 0;
    this.uniforms.uReveal.value = 0;
  }

  /** cells: [[x,y]...] posisi setelah tiap aksi (termasuk awal). */
  setRoute(cells) {
    this.clearRoute();
    const pts = [];
    for (const [x, y] of cells) {
      const p = this.room.grid.toWorld(x, y, 0.028);
      if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > 1e-6) pts.push(p);
    }
    this.totalMoves = Math.max(1, pts.length - 1);
    if (pts.length < 2) return;
    const w = 0.085;
    const pos = [], aU = [], aS = [], aP = [], idx = [];
    let acc = 0;
    const segLen = [];
    for (let i = 0; i < pts.length - 1; i++) segLen.push(pts[i].distanceTo(pts[i + 1]));
    const total = segLen.reduce((a, b) => a + b, 0);
    const perp = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a).normalize();
      return new THREE.Vector3(-d.z, 0, d.x);
    };
    for (let i = 0; i < pts.length; i++) {
      let n;
      if (i === 0) n = perp(pts[0], pts[1]);
      else if (i === pts.length - 1) n = perp(pts[i - 1], pts[i]);
      else {
        const n1 = perp(pts[i - 1], pts[i]), n2 = perp(pts[i], pts[i + 1]);
        n = n1.clone().add(n2);
        if (n.lengthSq() < 1e-4) n = n1.clone();
        else {
          n.normalize();
          const dot = Math.max(0.55, n.dot(n1));
          n.multiplyScalar(1 / dot);
        }
      }
      if (i > 0) acc += segLen[i - 1];
      for (const side of [-1, 1]) {
        const p = pts[i].clone().addScaledVector(n, w * side);
        pos.push(p.x, p.y, p.z);
        aU.push(acc);
        aS.push(side);
        aP.push(acc / total);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(aS, 1));
    g.setAttribute('aProg', new THREE.Float32BufferAttribute(aP, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: RIBBON_V, fragmentShader: RIBBON_F,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ribbon = new THREE.Mesh(g, mat);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 3;
    this.ribbon.userData.noAO = true;
    this.ribbon.visible = this.routeEnabled;
    this.uniforms.uReveal.value = 0;
    this.group.add(this.ribbon);
  }

  growRoute(seconds = 1.4) {
    return new Promise((resolve) => {
      this.revealAnim = { t: 0, d: seconds, resolve };
    });
  }

  showRouteInstant() {
    this.uniforms.uReveal.value = 1.01;
  }

  setProgress(movedCells) {
    this.uniforms.uProgress.value = clamp(movedCells / Math.max(1, this.totalMoves), 0, 1.0001);
  }

  setRouteEnabled(v) {
    this.routeEnabled = v;
    if (this.ribbon) this.ribbon.visible = v;
  }

  // ------------------------------------------------------------- frame
  update(dt) {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    if (this.revealAnim) {
      const r = this.revealAnim;
      r.t += dt;
      const k = clamp(r.t / r.d, 0, 1);
      this.uniforms.uReveal.value = easeOutCubic(k) * 1.02;
      if (k >= 1) {
        this.revealAnim = null;
        this.uniforms.uReveal.value = 1.01;
        r.resolve();
      }
    }
    if (this.play) {
      const p = this.play;
      p.t += dt;
      const k = clamp(p.t / p.seconds, 0, 1);
      const upto = Math.floor(smoothstep(0, 1, k * 0.15 + k * 0.85) * p.order.length);
      this.applyUntil(p, upto, this.t);
      this.refreshTiles(this.t);
      p.onProgress?.(k, Math.round(k * p.total));
      if (k >= 1) {
        this.applyUntil(p, p.order.length, this.t);
        this.refreshTiles(this.t);
        p.onProgress?.(1, p.total);
        const done = p.resolve;
        this.play = null;
        done();
      }
    } else if (this.tiles && this.heatOpacity > 0.001) {
      this.refreshTiles(this.t);
    }
    if (this.tiles) {
      this.heatOpacity += (this.heatTarget - this.heatOpacity) * (1 - Math.exp(-dt * 5));
      this.tiles.material.opacity = this.heatOpacity;
      this.tiles.visible = this.heatOpacity > 0.004;
    }
  }
}
