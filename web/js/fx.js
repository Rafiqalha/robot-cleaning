// Sistem partikel ringan (Points + shader): debu terhisap, kilau, mote di sinar matahari.
import * as THREE from 'three';
import { smoothstep } from './utils.js';
import { makeGlowTexture } from './textures.js';

const VERT = /* glsl */ `
  uniform float uScale;
  attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.15, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

export class Particles {
  constructor(stage, { max = 512, additive = true } = {}) {
    this.stage = stage;
    this.max = max;
    this.n = 0;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.att = new Float32Array(max * 4); // x,y,z,k  (k>0 = tarik ke titik)
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uMap: { value: makeGlowTexture() } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.userData.noAO = true;
    stage.scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit({ x, y, z, vx = 0, vy = 0, vz = 0, life = 1, size = 0.1, color = '#ffffff', alpha = 1, grow = 0, attract = null, k = 0, drag = 0, gravity = 0 }) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.n = Math.min(this.max, this.n + 1);
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this._c.set(color);
    this.col.set([this._c.r, this._c.g, this._c.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.size[i] = size;
    this.base[i] = alpha;
    this.alpha[i] = 0;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.grav[i] = gravity;
    if (attract) this.att.set([attract.x, attract.y, attract.z, k], i * 4);
    else this.att[i * 4 + 3] = 0;
  }

  update(dt) {
    this.mat.uniforms.uScale.value = this.stage.pixelScale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const u = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const p3 = i * 3;
      const k = this.att[i * 4 + 3];
      if (k > 0) {
        this.vel[p3] += (this.att[i * 4] - this.pos[p3]) * k * dt;
        this.vel[p3 + 1] += (this.att[i * 4 + 1] - this.pos[p3 + 1]) * k * dt;
        this.vel[p3 + 2] += (this.att[i * 4 + 2] - this.pos[p3 + 2]) * k * dt;
      }
      this.vel[p3 + 1] -= this.grav[i] * dt;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[p3] *= damp; this.vel[p3 + 1] *= damp; this.vel[p3 + 2] *= damp;
      this.pos[p3] += this.vel[p3] * dt;
      this.pos[p3 + 1] += this.vel[p3 + 1] * dt;
      this.pos[p3 + 2] += this.vel[p3 + 2] * dt;
      this.alpha[i] = this.base[i] * smoothstep(0, 0.1, u) * (1 - smoothstep(0.55, 1, u));
      this.size[i] = this.size0[i] * (1 + this.grow[i] * u);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

/** Mote debu melayang di ruangan (menampakkan berkas sinar matahari). */
export class DustMotes {
  constructor(stage, room) {
    this.stage = stage;
    this.room = room;
    this.p = new Particles(stage, { max: 220 });
    this.t = 0;
    this.accum = 0;
  }
  update(dt) {
    this.t += dt;
    this.accum += dt;
    const { W, H } = this.room;
    while (this.accum > 0.07) {
      this.accum -= 0.07;
      this.p.emit({
        x: (Math.random() - 0.5) * W * 0.9, y: 0.3 + Math.random() * 2.2, z: (Math.random() - 0.5) * H * 0.9,
        vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.3) * 0.03, vz: (Math.random() - 0.5) * 0.05,
        life: 10 + Math.random() * 8, size: 0.018 + Math.random() * 0.02, color: '#fff2d0', alpha: 0.22 + Math.random() * 0.2,
      });
    }
    this.p.update(dt);
  }
}

/** Kumpulan efek tingkat tinggi yang dipakai Litter / Director. */
export class FX {
  constructor(stage, room) {
    this.stage = stage;
    this.p = new Particles(stage, { max: 900 });
    this.motes = new DustMotes(stage, room);
  }
  setRoom(room) {
    this.motes.room = room;
  }
  dustPuff(from, to) {
    this.p.emit({
      x: from.x + (Math.random() - 0.5) * 0.08, y: from.y + 0.04, z: from.z + (Math.random() - 0.5) * 0.08,
      vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4,
      life: 0.75, size: 0.05 + Math.random() * 0.04, color: '#e6dfcf', alpha: 0.75, attract: to, k: 26, drag: 1.6,
    });
  }
  dustBurst(at, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.p.emit({ x: at.x, y: at.y + 0.04, z: at.z, vx: Math.cos(a) * 0.5, vy: 0.2 + Math.random() * 0.5, vz: Math.sin(a) * 0.5, life: 0.5, size: 0.05, color: '#bfe8ff', alpha: 0.8, drag: 3, grow: 1.2 });
    }
  }
  sparkles(pos) {
    const cols = ['#b9ff9f', '#ffffff', '#7de8ff', '#ffe27a'];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 1.1;
      this.p.emit({
        x: pos.x, y: 0.15, z: pos.z, vx: Math.cos(a) * s, vy: 1.0 + Math.random() * 1.6, vz: Math.sin(a) * s,
        life: 1.1 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.06, color: cols[i % cols.length], alpha: 1, gravity: 2.4, drag: 0.8,
      });
    }
  }
  confetti(pos) {
    const cols = ['#D97757', '#6A9BCC', '#788C5D', '#C46686', '#D4A27F', '#FAF9F5'];
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.6;
      this.p.emit({
        x: pos.x + (Math.random() - 0.5) * 0.4, y: 0.4, z: pos.z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * s, vy: 2.5 + Math.random() * 3.5, vz: Math.sin(a) * s,
        life: 2.2 + Math.random() * 1.2, size: 0.07 + Math.random() * 0.07, color: cols[i % cols.length], alpha: 1, gravity: 3.4, drag: 0.6,
      });
    }
  }
  update(dt) {
    this.motes.update(dt);
    this.p.update(dt);
  }
}
