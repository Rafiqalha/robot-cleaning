// Wajah robot: layar emisif 2D yang berubah ekspresi (idle, berpikir, bergerak, bersih, senang, siaga).
import * as THREE from 'three';

const COLORS = {
  idle: '#7de8ff', thinking: '#9db4ff', moving: '#7de8ff', cleaning: '#c9ffd9', happy: '#b6ff9f', alert: '#ffb36b', sleep: '#5a7f8a',
};

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.anisotropy = 4;
    this.expr = 'idle';
    this.prev = 'idle';
    this.pop = 1;
    this.t = 0;
    this.blinkAt = 2.5;
    this.blink = 0;
    this.acc = 0;
    this.look = { x: 0, y: 0 };
    this.draw();
  }

  set(expr) {
    if (expr === this.expr) return;
    this.prev = this.expr;
    this.expr = expr;
    this.pop = 0;
  }

  update(dt, look = null) {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 6);
    if (this.t > this.blinkAt) {
      this.blink = 0.001;
      this.blinkAt = this.t + 2.2 + Math.random() * 3;
    }
    if (this.blink > 0) {
      this.blink += dt * 7;
      if (this.blink >= 2) this.blink = 0;
    }
    if (look) {
      this.look.x += (look.x - this.look.x) * Math.min(1, dt * 8);
      this.look.y += (look.y - this.look.y) * Math.min(1, dt * 8);
    }
    this.acc += dt;
    if (this.acc >= 1 / 30) {
      this.acc = 0;
      this.draw();
      this.texture.needsUpdate = true;
    }
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, w, h);
    const col = COLORS[this.expr] || COLORS.idle;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const sc = 0.55 + 0.45 * easeOutBack(this.pop);
    ctx.scale(sc, sc);
    ctx.translate(-w / 2, -h / 2);
    ctx.shadowColor = col;
    ctx.shadowBlur = 26;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lx = this.look.x * 24, ly = this.look.y * 16;
    const blinkK = this.blink > 0 ? Math.abs(1 - this.blink) : 1; // 1 -> 0 -> 1
    const eye = (cx, cy, ew, eh) => {
      const hh = Math.max(6, eh * (this.expr === 'sleep' ? 0.08 : blinkK));
      this.rr(cx - ew / 2 + lx, cy - hh / 2 + ly, ew, hh, Math.min(ew, hh) * 0.42);
      ctx.fill();
    };
    switch (this.expr) {
      case 'thinking': {
        const sx = Math.sin(this.t * 2.2) * 26;
        eye(170 + sx * 0.6, 104, 80, 82);
        eye(342 + sx * 0.6, 104, 80, 82);
        for (let i = 0; i < 3; i++) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 5 - i * 0.9));
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(216 + i * 40, 204, 11, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'cleaning': {
        ctx.lineWidth = 26;
        ctx.beginPath(); ctx.moveTo(120, 74); ctx.lineTo(205, 116); ctx.lineTo(120, 158); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(392, 74); ctx.lineTo(307, 116); ctx.lineTo(392, 158); ctx.stroke();
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.arc(256, 176, 34, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
        this.sparkle(86, 56, 0.0); this.sparkle(430, 196, 1.3); this.sparkle(440, 52, 2.1);
        break;
      }
      case 'happy': {
        ctx.lineWidth = 24;
        ctx.beginPath(); ctx.arc(160, 150, 52, 1.12 * Math.PI, 1.88 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(352, 150, 52, 1.12 * Math.PI, 1.88 * Math.PI); ctx.stroke();
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.arc(256, 168, 46, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
        this.sparkle(78, 60, 0.4); this.sparkle(436, 70, 1.7);
        break;
      }
      case 'alert': {
        ctx.lineWidth = 22;
        for (const cx of [170, 342]) {
          ctx.beginPath(); ctx.moveTo(cx - 36, 74); ctx.lineTo(cx + 36, 146); ctx.moveTo(cx + 36, 74); ctx.lineTo(cx - 36, 146); ctx.stroke();
        }
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(206, 200); ctx.quadraticCurveTo(256, 176, 306, 200); ctx.stroke();
        break;
      }
      case 'sleep': {
        eye(170, 120, 92, 92);
        eye(342, 120, 92, 92);
        ctx.font = 'bold 54px Georgia, serif';
        ctx.fillText('z', 410 + Math.sin(this.t * 2) * 6, 70);
        break;
      }
      default: {
        const moving = this.expr === 'moving';
        eye(170, 118, 84, moving ? 96 : 108);
        eye(342, 118, 84, moving ? 96 : 108);
        if (moving) {
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 10;
          ctx.beginPath(); ctx.moveTo(226, 196); ctx.lineTo(286, 196); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
    // garis pindai (scanline) agar terasa seperti layar LED
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.6);
    ctx.globalAlpha = 1;
  }

  sparkle(x, y, phase) {
    const { ctx } = this;
    const s = 10 + 8 * Math.max(0, Math.sin(this.t * 6 + phase));
    ctx.save();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
    ctx.restore();
  }

  rr(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
