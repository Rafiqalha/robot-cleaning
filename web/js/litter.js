// Titik kotoran (target): sampah 3D hasil Blender + penanda bernomor ala UTS + animasi tersedot robot.
import * as THREE from 'three';
import { cloneLitter } from './assets.js';
import { makeBadgeTexture, makeGlowTexture, makeTagTexture } from './textures.js';
import { clamp, easeInCubic, easeOutBack, easeOutCubic, mulberry32 } from './utils.js';

const PATTERNS = [
  ['paper_a', 'paper_b', 'crumbs', 'pencil'],
  ['wrapper', 'juice', 'spill', 'crumbs'],
  ['paper_c', 'eraser', 'dust', 'paper_a'],
  ['juice', 'paper_b', 'wrapper', 'pencil'],
  ['spill', 'paper_a', 'eraser', 'crumbs', 'paper_c'],
  ['dust', 'pencil', 'paper_b', 'wrapper'],
];
const LITTER_SCALE = 2.0;

export class Litter {
  constructor(stage, room, fx) {
    this.stage = stage;
    this.room = room;
    this.fx = fx;
    this.group = new THREE.Group();
    this.group.name = 'litter';
    stage.scene.add(this.group);
    this.targets = new Map();
    this.suctions = [];
    this.pops = [];
    this.t = 0;
    this.glowTex = makeGlowTexture();
    this.ringGeo = new THREE.RingGeometry(0.30, 0.355, 56);
    this.discGeo = new THREE.CircleGeometry(0.34, 40);
    this.badgeCache = new Map();
    this.checkTex = makeBadgeTexture('', { check: true, fill: '#5E8F3E', rays: false });
  }

  badge(id, done = false) {
    const key = `${id}`;
    if (!this.badgeCache.has(key)) this.badgeCache.set(key, makeBadgeTexture(id));
    return this.badgeCache.get(key);
  }

  clear() {
    for (const t of this.targets.values()) this.group.remove(t.root);
    this.targets.clear();
    this.suctions.length = 0;
    this.pops.length = 0;
    this.group.clear();
  }

  build(scn) {
    this.clear();
    for (const t of scn.targets) this.makeTarget(t);
  }

  makeTarget(t) {
    const root = new THREE.Group();
    const c = this.room.grid.toWorld(t.x, t.y);
    root.position.copy(c);
    this.group.add(root);

    // lingkaran target di lantai
    const ringMat = new THREE.MeshBasicMaterial({ color: '#b6d98f', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.014;
    ring.userData.noAO = true;
    const discMat = new THREE.MeshBasicMaterial({ color: '#9fc27a', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    const disc = new THREE.Mesh(this.discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.012;
    const rippleMat = ringMat.clone();
    const ripple = new THREE.Mesh(this.ringGeo, rippleMat);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.013;
    root.add(ring, disc, ripple);

    // sampah
    const rnd = mulberry32(t.id * 7919 + t.x * 31 + t.y * 17);
    const pattern = PATTERNS[(t.id - 1) % PATTERNS.length];
    const items = [];
    pattern.forEach((name, i) => {
      const o = cloneLitter(name);
      const a = rnd() * Math.PI * 2 + i * 1.7;
      const r = name === 'spill' || name === 'dust' ? rnd() * 0.08 : 0.07 + rnd() * 0.17;
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      o.rotation.y = rnd() * Math.PI * 2;
      const s = LITTER_SCALE * (0.9 + rnd() * 0.35);
      o.scale.setScalar(s);
      root.add(o);
      items.push({ obj: o, s0: s });
    });

    // penanda bernomor melayang (billboard)
    const mat = new THREE.SpriteMaterial({ map: this.badge(t.id), transparent: true, depthTest: false, depthWrite: false });
    const badge = new THREE.Sprite(mat);
    badge.position.set(0, 1.05, 0);
    badge.scale.setScalar(0.72);
    badge.renderOrder = 20;
    root.add(badge);

    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false, depthWrite: false }));
    tag.visible = false;
    tag.scale.set(0.62, 0.23, 1);
    tag.position.set(0.5, 1.42, 0);
    tag.renderOrder = 21;
    root.add(tag);

    this.targets.set(t.id, { id: t.id, cell: [t.x, t.y], root, items, ring, disc, ripple, ringMat, discMat, rippleMat, badge, tag, cleaned: false, seed: rnd() * 6 });
  }

  /** Tampilkan urutan kunjungan hasil rencana: tag "ke-1", "ke-2" ... */
  setOrder(order) {
    order.forEach((id, i) => {
      const t = this.targets.get(id);
      if (!t) return;
      t.tag.material.map = makeTagTexture(`ke-${i + 1}`);
      t.tag.material.needsUpdate = true;
      t.tag.visible = true;
    });
  }

  markSkipped(ids) {
    for (const id of ids) {
      const t = this.targets.get(id);
      if (!t) continue;
      t.badge.material.map = makeBadgeTexture(id, { fill: '#B04A3A' });
      t.badge.material.needsUpdate = true;
      t.ringMat.color.set('#ff8a7a');
      t.discMat.color.set('#ff8a7a');
      t.skipped = true;
    }
  }

  clearOrder() {
    for (const t of this.targets.values()) t.tag.visible = false;
  }

  /** Hisap sampah pada target `id` menuju titik hisap robot. */
  startSuction(id, intake, onDone) {
    const t = this.targets.get(id);
    if (!t || t.cleaned) return onDone?.();
    t.cleaned = true;
    const items = t.items.map((it, i) => ({
      ...it,
      start: it.obj.getWorldPosition(new THREE.Vector3()),
      delay: i * 0.13, dur: 0.85 + Math.random() * 0.3, t: 0,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() * 2 + 1, Math.random() - 0.5).multiplyScalar(9),
    }));
    // pindahkan item ke group dunia agar mudah dianimasikan
    for (const it of items) {
      this.group.attach(it.obj);
    }
    this.suctions.push({ target: t, items, intake: intake.clone(), done: onDone, finished: false, tAll: 0 });
    this.pops.push({ t: 0, target: t, kind: 'fade-markers' });
  }

  update(dt) {
    this.t += dt;
    const camPos = this.stage.camera.position;
    for (const t of this.targets.values()) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4 + t.seed);
      if (!t.cleaned) {
        t.ringMat.opacity = 0.55 + 0.35 * pulse;
        const rp = (this.t * 0.7 + t.seed) % 1;
        t.ripple.scale.setScalar(1 + rp * 0.9);
        t.rippleMat.opacity = (1 - rp) * 0.5;
        t.badge.position.y = 1.05 + Math.sin(this.t * 2.0 + t.seed) * 0.05;
        const d = camPos.distanceTo(t.root.position);
        const s = clamp(d * 0.052, 0.55, 1.2);
        t.badge.scale.setScalar(s);
        t.tag.scale.set(0.62 * s * 0.95, 0.23 * s * 0.95, 1);
        t.tag.position.set(0.52 * s, 1.0 + 0.5 * s, 0);
      }
    }
    // animasi hisap
    for (const s of this.suctions) {
      s.tAll += dt;
      let allDone = true;
      for (const it of s.items) {
        it.t += dt;
        const k = clamp((it.t - it.delay) / it.dur, 0, 1);
        if (it.t < it.delay) { allDone = false; continue; }
        if (k < 1) allDone = false;
        const e = easeInCubic(k);
        const mid = it.start.clone().lerp(s.intake, 0.5);
        mid.y += 0.5;
        const a = it.start.clone().lerp(mid, e), b = mid.clone().lerp(s.intake, e);
        it.obj.position.copy(a.lerp(b, e));
        it.obj.scale.setScalar(it.s0 * (1 - 0.92 * e));
        it.obj.rotation.x += it.spin.x * dt;
        it.obj.rotation.y += it.spin.y * dt;
        it.obj.rotation.z += it.spin.z * dt;
        if (k >= 1 && it.obj.visible) {
          it.obj.visible = false;
          this.fx?.dustBurst(s.intake, 6);
        }
        // partikel debu tersedot
        if (k < 0.9 && Math.random() < dt * 40) this.fx?.dustPuff(it.obj.position, s.intake);
      }
      if (allDone && !s.finished) {
        s.finished = true;
        this.group.remove(...s.items.map((i) => i.obj));
        this.celebrate(s.target);
        s.done?.();
      }
    }
    this.suctions = this.suctions.filter((s) => !(s.finished && s.tAll > 4));
    // penanda: memudar saat bersih
    for (const p of this.pops) {
      p.t += dt;
      const t = p.target;
      const k = clamp(p.t / 0.7, 0, 1);
      t.ringMat.opacity = 0.8 * (1 - k);
      t.discMat.opacity = 0.16 * (1 - k);
      t.rippleMat.opacity = 0;
      t.badge.material.opacity = 1 - easeOutCubic(clamp((p.t - 0.2) / 0.5, 0, 1));
    }
    this.pops = this.pops.filter((p) => p.t < 1.2);
    // check mark
    for (const c of this.checks ?? []) {
      c.t += dt;
      const k = clamp(c.t / 1.6, 0, 1);
      c.sprite.position.y = 0.8 + easeOutCubic(k) * 0.6;
      c.sprite.material.opacity = k < 0.15 ? k / 0.15 : 1 - clamp((k - 0.55) / 0.45, 0, 1);
      c.sprite.scale.setScalar(0.5 + 0.35 * easeOutBack(clamp(k * 3, 0, 1)));
      if (k >= 1) {
        c.root.remove(c.sprite);
        c.sprite.material.dispose();
      }
    }
    if (this.checks) this.checks = this.checks.filter((c) => c.t < 1.6);
  }

  celebrate(t) {
    t.badge.visible = false;
    t.tag.visible = false;
    t.ring.visible = false;
    t.ripple.visible = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.checkTex, transparent: true, depthTest: false, opacity: 0 }));
    sprite.renderOrder = 22;
    sprite.position.set(0, 0.8, 0);
    t.root.add(sprite);
    (this.checks ||= []).push({ sprite, root: t.root, t: 0 });
    this.fx?.sparkles(t.root.position);
  }

  remaining() {
    return [...this.targets.values()].filter((t) => !t.cleaned).map((t) => t.id);
  }
}
