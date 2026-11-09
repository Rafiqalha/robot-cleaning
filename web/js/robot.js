// CleanBot: model Blender + animasi (roda, sikat, lidar, kemiringan bodi, wajah, LED).
import * as THREE from 'three';
import { cloneRobot } from './assets.js';
import { ROBOT_SCALE } from './config.js';
import { Face } from './face.js';
import { angleDiff, clamp, damp, easeInOutCubic, wrapAngle } from './utils.js';

const MODE_STYLE = {
  idle: { led: '#27d4ff', face: 'idle', brush: 1.5 },
  thinking: { led: '#8aa8ff', face: 'thinking', brush: 0.8 },
  moving: { led: '#27d4ff', face: 'moving', brush: 6 },
  cleaning: { led: '#6cff9a', face: 'cleaning', brush: 24 },
  done: { led: '#9bff7a', face: 'happy', brush: 3 },
  alert: { led: '#ffa14a', face: 'alert', brush: 0.4 },
  sleep: { led: '#27d4ff', face: 'sleep', brush: 0 },
};

export class Robot {
  constructor(stage, room) {
    this.stage = stage;
    this.room = room;
    this.scale = ROBOT_SCALE;
    this.group = new THREE.Group();
    this.group.name = 'robot';
    this.tilt = new THREE.Group();
    this.model = cloneRobot();
    this.model.scale.setScalar(ROBOT_SCALE);
    this.tilt.add(this.model);
    this.group.add(this.tilt);
    stage.scene.add(this.group);

    const g = (n) => this.model.getObjectByName(n);
    this.parts = { wheelL: g('Wheel_L'), wheelR: g('Wheel_R'), brushL: g('SideBrush_L'), brushR: g('SideBrush_R'), main: g('MainBrush'), lidar: g('LidarTurret') };

    this.face = new Face();
    this.ledMats = [];
    this.beacon = null;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.name === 'Face_Display') {
        o.material = new THREE.MeshPhysicalMaterial({
          color: 0x030304, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
          emissive: 0xffffff, emissiveMap: this.face.texture, emissiveIntensity: 1.9,
        });
      } else if (m.name === 'Paint_Orange') {
        m.clearcoat = 0.7;
      } else if (m.name === 'LED_Cyan') this.ledMats.push(m);
      else if (m.name === 'LED_Beacon') this.beacon = m;
    });

    this.glow = new THREE.PointLight(0x27d4ff, 0.8, 2.4, 2);
    this.glow.position.set(0, 0.04, 0);
    this.group.add(this.glow);

    this.mode = 'idle';
    this.modeT = 0;
    this.heading = 0;
    this.speed = 0;
    this.yawRate = 0;
    this._accel = 0;
    this._last = { x: 0, z: 0, h: 0 };
    this.t = 0;
    this.tw = null;
    this.ledColor = new THREE.Color('#27d4ff');
    this.ledTarget = new THREE.Color('#27d4ff');
    this.cleanBoost = 0;
  }

  get position() {
    return this.group.position;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  /** Titik hisap (mulut sikat depan) dalam koordinat dunia. */
  intakeWorld(out = new THREE.Vector3()) {
    const f = this.forward(out);
    return out.multiplyScalar(0.3 * this.scale).add(this.group.position).setY(0.06);
  }

  placeAtCell(gx, gy, heading = 0) {
    const p = this.room.grid.toWorld(gx, gy);
    this.setPose(p.x, p.z, heading);
    this._last = { x: p.x, z: p.z, h: heading };
    this.speed = 0;
    this.yawRate = 0;
  }

  setPose(x, z, heading) {
    this.group.position.set(x, 0, z);
    this.heading = wrapAngle(heading);
    this.group.rotation.y = this.heading;
  }

  setMode(mode) {
    if (!MODE_STYLE[mode] || mode === this.mode) return;
    this.mode = mode;
    this.modeT = 0;
    this.face.set(MODE_STYLE[mode].face);
    this.ledTarget.set(MODE_STYLE[mode].led);
  }

  /** Gerak satu langkah (mode manual): putar di tempat lalu maju. Mengembalikan Promise. */
  goStep(toX, toZ, heading, { turn = 0.2, move = 0.36 } = {}) {
    return new Promise((resolve) => {
      this.tw = {
        t: 0, turn: Math.abs(angleDiff(this.heading, heading)) > 1e-3 ? turn : 0, move,
        x0: this.group.position.x, z0: this.group.position.z, h0: this.heading, x1: toX, z1: toZ, h1: heading, resolve,
      };
    });
  }

  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    this.modeT += dt;
    const tw = this.tw;
    if (tw) {
      tw.t += dt;
      const tt = tw.t;
      if (tt < tw.turn) {
        const k = easeInOutCubic(tt / tw.turn);
        this.setPose(tw.x0, tw.z0, tw.h0 + angleDiff(tw.h0, tw.h1) * k);
      } else {
        const k = Math.min(1, (tt - tw.turn) / tw.move);
        const e = k * k * (3 - 2 * k);
        this.setPose(tw.x0 + (tw.x1 - tw.x0) * e, tw.z0 + (tw.z1 - tw.z0) * e, tw.h1);
        if (k >= 1) {
          this.tw = null;
          tw.resolve();
        }
      }
    }
    // kinematika diturunkan dari perubahan pose
    const p = this.group.position;
    const dx = p.x - this._last.x, dz = p.z - this._last.z;
    const hMid = this._last.h;
    const dist = dx * Math.cos(hMid) + dz * -Math.sin(hMid);
    const dyaw = angleDiff(this._last.h, this.heading);
    this._last = { x: p.x, z: p.z, h: this.heading };
    const v = dist / dt;
    const w = dyaw / dt;
    const prevSpeed = this.speed;
    this.speed = damp(this.speed, v, 18, dt);
    this.yawRate = damp(this.yawRate, w, 18, dt);
    this._accel = damp(this._accel, (this.speed - prevSpeed) / dt, 10, dt);

    const s = this.scale;
    const wr = 0.078 * s, half = 0.236 * s;
    const left = dist - dyaw * half, right = dist + dyaw * half;
    this.parts.wheelL.rotation.z -= left / wr;
    this.parts.wheelR.rotation.z -= right / wr;

    const style = MODE_STYLE[this.mode];
    const moving = Math.abs(this.speed) > 0.05 || Math.abs(this.yawRate) > 0.2;
    const bs = style.brush + (moving ? 7 : 0);
    this.cleanBoost = damp(this.cleanBoost, this.mode === 'cleaning' ? 1 : 0, 6, dt);
    this.parts.brushL.rotation.y += bs * dt;
    this.parts.brushR.rotation.y -= bs * dt;
    this.parts.main.rotation.z -= (bs * 0.9 + 3) * dt;
    this.parts.lidar.rotation.y += (this.mode === 'thinking' ? 14 : 6.5) * dt;

    // bodi miring saat akselerasi + getaran halus
    const pitch = clamp(this._accel * 0.010, -0.05, 0.05);
    this.tilt.rotation.z = damp(this.tilt.rotation.z, pitch, 9, dt);
    const vib = Math.min(1, Math.abs(this.speed) * 0.7 + this.cleanBoost * 0.8);
    this.tilt.rotation.x = Math.sin(this.t * 41) * 0.0022 * vib;
    this.tilt.position.y = Math.sin(this.t * 53) * 0.0009 * vib;

    // wajah: mata melirik ke arah belok
    this.face.update(dt, { x: -clamp(this.yawRate * 0.35, -1, 1), y: this.mode === 'thinking' ? -0.4 : 0 });

    // LED seam + beacon + lampu pendar
    this.ledColor.lerp(this.ledTarget, 1 - Math.exp(-8 * dt));
    const pulse = 1 + 0.25 * Math.sin(this.t * (this.mode === 'thinking' ? 9 : 3.2));
    for (const m of this.ledMats) {
      m.emissive.copy(this.ledColor);
      m.emissiveIntensity = 3.0 * pulse;
    }
    if (this.beacon) {
      this.beacon.emissive.copy(this.ledColor);
      this.beacon.emissiveIntensity = Math.sin(this.t * 7.5) > 0.2 ? 7 : 1.2;
    }
    this.glow.color.copy(this.ledColor);
    this.glow.intensity = 0.55 + 0.2 * pulse + this.cleanBoost * 0.6;
  }
}
