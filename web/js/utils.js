import * as THREE from 'three';
import { CELL } from './config.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * Math.max(0, dt)));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
export const angleDiff = (from, to) => wrapAngle(to - from);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Konversi koordinat grid (gx, gy) <-> dunia 3D. Pusat ruangan = (0,0,0); y grid -> sumbu z. */
export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
  }
  toWorld(gx, gy, y = 0, out = new THREE.Vector3()) {
    return out.set((gx - this.w / 2 + 0.5) * CELL, y, (gy - this.h / 2 + 0.5) * CELL);
  }
  toCell(x, z) {
    return [Math.floor(x / CELL + this.w / 2), Math.floor(z / CELL + this.h / 2)];
  }
  inBounds(gx, gy) {
    return gx >= 0 && gy >= 0 && gx < this.w && gy < this.h;
  }
}

/** Heading robot (rad, rotasi sumbu Y) untuk arah gerak grid (dx, dy). Depan model = +X. */
export function headingFor(dx, dy) {
  return Math.atan2(-dy, dx);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
