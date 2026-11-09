// Rig kamera: overview / atas / ikuti / robot (FPV) / sinema, dengan transisi halus.
import * as THREE from 'three';
import { damp, easeInOutCubic } from './utils.js';

export class CameraRig {
  constructor(stage, room, getRobot) {
    this.stage = stage;
    this.room = room;
    this.getRobot = getRobot;
    this.mode = 'overview';
    this.tween = null;
    this.fpos = new THREE.Vector3();
    this.flook = new THREE.Vector3();
    this.t = 0;
    this.cinemaAngle = 0.7;
    this.listeners = [];
    this.fov = stage.camera.fov;
    this.userMoved = false;
    stage.canvas.addEventListener('pointerdown', () => {
      if (['follow', 'fpv', 'cinema'].includes(this.mode)) this.setMode('free');
      this.userMoved = true;
    });
    stage.hooks.push({ onResize: () => this.onResize(), onInsets: () => this.onResize() });
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  get R() {
    return Math.max(this.room.W, this.room.H);
  }

  poseFor(mode) {
    const { W, H } = this.room;
    const R = this.R;
    const cam = this.stage.camera;
    const { fw, fh, vh } = this.freeArea();
    const t19 = Math.tan(THREE.MathUtils.degToRad(19));
    if (mode === 'top') {
      const tv = t19 * (fh / vh), th = t19 * (fw / vh);
      const d = Math.max(H / 2 / tv, W / 2 / th) * 1.1 + 0.6;
      return { pos: new THREE.Vector3(0, d, 0.001), target: new THREE.Vector3(0, 0, 0), fov: 38 };
    }
    // jarak agar seluruh ruangan muat di area bebas (di antara panel HUD) pada rasio layar apa pun
    const m = Math.min(t19 * (fh / vh), t19 * (fw / vh));
    const rho = Math.hypot(W, H, 2.4) / 2;
    const d = (0.86 * rho * Math.sqrt(1 + m * m)) / m;
    const dir = new THREE.Vector3(0.62, 0.74, 1.0).normalize();
    return { pos: dir.multiplyScalar(d).add(new THREE.Vector3(0, 0.2, 0)), target: new THREE.Vector3(0, 0.25, 0), fov: 38 };
  }

  freeArea() {
    const cv = this.stage.canvas;
    const vw = cv.clientWidth || window.innerWidth, vh = cv.clientHeight || window.innerHeight;
    const { l, r, t, b } = this.stage.insets;
    return { fw: Math.max(240, vw - l - r), fh: Math.max(200, vh - t - b), vw, vh };
  }

  /** Susun ulang pose bila ukuran jendela berubah (hanya saat belum digerakkan pengguna). */
  onResize() {
    if (this.tween || this.userMoved) return;
    if (this.mode === 'overview' || this.mode === 'top') {
      const p = this.poseFor(this.mode);
      this.startTween(p.pos, p.target, p.fov, 0);
    }
  }

  startTween(pos, target, fov, duration) {
    const cam = this.stage.camera;
    const ctl = this.stage.controls;
    if (duration <= 0) {
      cam.position.copy(pos);
      ctl.target.copy(target);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.lookAt(target);
      ctl.update();
      this.tween = null;
      return;
    }
    this.tween = {
      t: 0, d: duration,
      p0: cam.position.clone(), p1: pos.clone(),
      l0: ctl.target.clone(), l1: target.clone(),
      f0: cam.fov, f1: fov,
    };
  }

  setMode(mode, { duration = 1.5 } = {}) {
    this.mode = mode;
    this.stage.rigMode = mode;
    if (mode === 'overview' || mode === 'top') this.userMoved = false;
    const cam = this.stage.camera;
    const ctl = this.stage.controls;
    cam.near = mode === 'fpv' ? 0.02 : 0.05;
    cam.updateProjectionMatrix();
    if (mode === 'overview' || mode === 'top') {
      const p = this.poseFor(mode);
      ctl.enabled = false;
      this.startTween(p.pos, p.target, p.fov, duration);
    } else if (mode === 'free') {
      ctl.enabled = true;
      const look = new THREE.Vector3();
      cam.getWorldDirection(look);
      ctl.target.copy(cam.position).addScaledVector(look, 6);
      ctl.target.y = Math.max(0, ctl.target.y);
      this.tween = null;
    } else {
      ctl.enabled = false;
      this.tween = null;
      this.fpos.copy(cam.position);
      cam.getWorldDirection(this.flook);
      this.flook.multiplyScalar(5).add(cam.position);
    }
    this.listeners.forEach((fn) => fn(mode));
  }

  /** Fly-in sinematik dari luar jendela menuju tampilan overview. */
  flyIn(duration = 3.6) {
    const R = this.R;
    const cam = this.stage.camera;
    cam.position.set(-0.7 * R, 0.3 * R, 1.55 * R);
    cam.fov = 46;
    cam.updateProjectionMatrix();
    this.stage.controls.target.set(0, 0.8, 0);
    this.setMode('overview', { duration });
  }

  update(dt) {
    this.t += dt;
    const cam = this.stage.camera;
    const ctl = this.stage.controls;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = easeInOutCubic(Math.min(1, tw.t / tw.d));
      cam.position.lerpVectors(tw.p0, tw.p1, k);
      ctl.target.lerpVectors(tw.l0, tw.l1, k);
      cam.fov = tw.f0 + (tw.f1 - tw.f0) * k;
      cam.updateProjectionMatrix();
      cam.lookAt(ctl.target);
      if (tw.t >= tw.d) {
        this.tween = null;
        if (this.mode === 'overview' || this.mode === 'top') ctl.enabled = true;
        ctl.update();
      }
      return;
    }
    const robot = this.getRobot();
    if (!robot) return;
    const fwd = robot.forward();
    if (this.mode === 'follow') {
      const pos = robot.position.clone().addScaledVector(fwd, -2.5).add(new THREE.Vector3(0, 1.65, 0));
      const look = robot.position.clone().addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 0.2, 0));
      this.fpos.lerp(pos, 1 - Math.exp(-3.0 * dt));
      this.flook.lerp(look, 1 - Math.exp(-4.0 * dt));
      cam.position.copy(this.fpos);
      cam.lookAt(this.flook);
      cam.fov = damp(cam.fov, 46, 3, dt);
      cam.updateProjectionMatrix();
    } else if (this.mode === 'fpv') {
      const s = robot.scale;
      const pos = robot.position.clone().addScaledVector(fwd, 0.26 * s).add(new THREE.Vector3(0, 0.40 * s, 0));
      const look = robot.position.clone().addScaledVector(fwd, 3.2).add(new THREE.Vector3(0, 0.12, 0));
      this.fpos.lerp(pos, 1 - Math.exp(-14 * dt));
      this.flook.lerp(look, 1 - Math.exp(-9 * dt));
      cam.position.copy(this.fpos);
      cam.lookAt(this.flook);
      cam.fov = damp(cam.fov, 74, 4, dt);
      cam.updateProjectionMatrix();
    } else if (this.mode === 'cinema') {
      this.cinemaAngle += dt * 0.13;
      const R = this.R;
      const rad = R * 1.08 + Math.sin(this.t * 0.21) * 0.8;
      const h = R * 0.46 + Math.sin(this.t * 0.33) * 0.7 + 0.8;
      const pos = new THREE.Vector3(Math.cos(this.cinemaAngle) * rad, h, Math.sin(this.cinemaAngle) * rad);
      const look = new THREE.Vector3(0, 0.5, 0).lerp(robot.position, 0.45);
      this.fpos.lerp(pos, 1 - Math.exp(-1.6 * dt));
      this.flook.lerp(look, 1 - Math.exp(-2.5 * dt));
      cam.position.copy(this.fpos);
      cam.lookAt(this.flook);
      cam.fov = damp(cam.fov, 36, 2, dt);
      cam.updateProjectionMatrix();
    }
  }
}
