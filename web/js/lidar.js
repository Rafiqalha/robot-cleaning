// Visualisasi sensor jarak (LiDAR 2D): kipas pindai di lantai + titik hantam pada perabot/dinding.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const N = 120;
const RANGE = 4.2;

export class Lidar {
  constructor(stage, room, robot) {
    this.stage = stage;
    this.room = room;
    this.robot = robot;
    this.enabled = true;
    this.t = 0;
    const fanPos = new Float32Array((N + 1) * 3);
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setIndex(idx);
    this.fan = new THREE.Mesh(
      fg,
      new THREE.MeshBasicMaterial({ color: '#27d4ff', transparent: true, opacity: 0.085, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.fan.frustumCulled = false;
    this.fan.userData.noAO = true;
    const ptsPos = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ color: '#8cecff', size: 9, map: makeGlowTexture(), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }),
    );
    this.points.frustumCulled = false;
    this.points.userData.noAO = true;
    this.sweep = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: '#aef3ff', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.sweep.frustumCulled = false;
    this.sweep.userData.noAO = true;
    this.group = new THREE.Group();
    this.group.add(this.fan, this.points, this.sweep);
    stage.scene.add(this.group);
  }

  setEnabled(v) {
    this.enabled = v;
    this.group.visible = v && !this.hideFirstPerson;
  }

  rayDist(px, pz, dx, dz) {
    const { W, H, aabbs } = this.room;
    let t = RANGE;
    // dinding ruangan
    if (dx > 1e-6) t = Math.min(t, (W / 2 - px) / dx);
    else if (dx < -1e-6) t = Math.min(t, (-W / 2 - px) / dx);
    if (dz > 1e-6) t = Math.min(t, (H / 2 - pz) / dz);
    else if (dz < -1e-6) t = Math.min(t, (-H / 2 - pz) / dz);
    for (const [x0, z0, x1, z1] of aabbs) {
      let tmin = 0, tmax = t;
      if (Math.abs(dx) < 1e-8) {
        if (px < x0 || px > x1) continue;
      } else {
        let a = (x0 - px) / dx, b = (x1 - px) / dx;
        if (a > b) [a, b] = [b, a];
        tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-8) {
        if (pz < z0 || pz > z1) continue;
      } else {
        let a = (z0 - pz) / dz, b = (z1 - pz) / dz;
        if (a > b) [a, b] = [b, a];
        tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
        if (tmin > tmax) continue;
      }
      if (tmin < t && tmin >= 0) t = tmin;
    }
    return Math.max(0.05, t);
  }

  update(dt) {
    const fpv = this.stage.rigMode === 'fpv';
    if (fpv !== !!this.hideFirstPerson) {
      this.hideFirstPerson = fpv;
      this.group.visible = this.enabled && !fpv;
    }
    if (!this.enabled || fpv) return;
    this.t += dt;
    const p = this.robot.position;
    const fp = this.fan.geometry.attributes.position.array;
    const pp = this.points.geometry.attributes.position.array;
    const y0 = 0.30 * this.robot.scale;
    fp[0] = p.x; fp[1] = 0.025; fp[2] = p.z;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const d = this.rayDist(p.x, p.z, dx, dz);
      const hx = p.x + dx * d, hz = p.z + dz * d;
      fp[3 + i * 3] = hx; fp[4 + i * 3] = 0.025; fp[5 + i * 3] = hz;
      const hit = d < RANGE - 0.01;
      pp[i * 3] = hit ? hx : p.x; pp[i * 3 + 1] = hit ? y0 * (0.45 + 0.55 * ((i * 7) % 5) / 4) : y0; pp[i * 3 + 2] = hit ? hz : p.z;
    }
    this.fan.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = true;
    // garis penyapu berputar
    const sa = this.t * 6.5;
    const d = this.rayDist(p.x, p.z, Math.cos(sa), Math.sin(sa));
    const sp = this.sweep.geometry.attributes.position.array;
    sp[0] = p.x; sp[1] = y0; sp[2] = p.z;
    sp[3] = p.x + Math.cos(sa) * d; sp[4] = 0.04; sp[5] = p.z + Math.sin(sa) * d;
    this.sweep.geometry.attributes.position.needsUpdate = true;
  }
}
