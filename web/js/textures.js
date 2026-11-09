// Tekstur kanvas prosedural: dinding, langit, papan tulis, poster, badge target, glow.
import * as THREE from 'three';
import { PALETTE } from './config.js';

function canvasTexture(w, h, draw, { srgb = true, flipY = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = flipY;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export function makeBackgroundTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.46, 20, w / 2, h / 2, w * 0.78);
    g.addColorStop(0, '#32353d');
    g.addColorStop(0.5, '#1b1d22');
    g.addColorStop(1, '#0b0c0e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Cat dinding dua warna (wainscot sage + atas putih hangat). 512 px = 3 m tinggi. */
export function makeWallTexture() {
  return canvasTexture(8, 512, (ctx, w, h) => {
    const m = (meters) => (3 - meters) * (h / 3);
    const upper = ctx.createLinearGradient(0, 0, 0, m(1.1));
    upper.addColorStop(0, '#E6E2D6');
    upper.addColorStop(0.18, '#F0EDE3');
    upper.addColorStop(1, '#F3F0E7');
    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, w, m(1.1));
    const low = ctx.createLinearGradient(0, m(1.05), 0, m(0.12));
    low.addColorStop(0, '#C3D5CC');
    low.addColorStop(1, '#AFC4BA');
    ctx.fillStyle = low;
    ctx.fillRect(0, m(1.05), w, m(0.12) - m(1.05));
    ctx.fillStyle = '#93AA9E';
    ctx.fillRect(0, m(1.1), w, m(1.05) - m(1.1));
    ctx.fillStyle = 'rgba(40,60,50,0.22)';
    ctx.fillRect(0, m(1.05), w, 3);
    ctx.fillStyle = '#74897D';
    ctx.fillRect(0, m(0.12), w, m(0) - m(0.12));
  });
}

export function makeSkyTexture() {
  return canvasTexture(1024, 400, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5B97DA');
    g.addColorStop(0.55, '#9ACBF2');
    g.addColorStop(1, '#EAF6FF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // matahari + awan lembut
    const sun = ctx.createRadialGradient(w * 0.78, h * 0.28, 4, w * 0.78, h * 0.28, 150);
    sun.addColorStop(0, 'rgba(255,250,225,0.95)');
    sun.addColorStop(1, 'rgba(255,250,225,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, rx, ry] of [[160, 90, 110, 22], [420, 60, 140, 24], [690, 120, 120, 20], [900, 70, 90, 18]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    // garis pohon (dua lapis)
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (const [base, col, rmin, rmax] of [[h * 0.78, '#6F9A5A', 28, 52], [h * 0.9, '#4E7A3F', 34, 60]]) {
      ctx.fillStyle = col;
      for (let x = -20; x < w + 40; x += 34) {
        const r = rmin + rnd() * (rmax - rmin);
        ctx.beginPath();
        ctx.arc(x, base - r * 0.4 + rnd() * 10, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(0, base + 8, w, h - base);
    }
    ctx.fillStyle = '#6C8E4A';
    ctx.fillRect(0, h * 0.95, w, h * 0.05);
  });
}

const HAND = '"Segoe Print","Bradley Hand","Ink Free","Comic Sans MS",cursive';

/** Papan tulis dengan coretan spidol: rumus A*, state, dan sketsa denah + rute. */
export function makeWhiteboardTexture(scn) {
  return canvasTexture(2048, 820, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#FBFBF9');
    g.addColorStop(1, '#EFEFEC');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // sisa hapusan samar
    ctx.strokeStyle = 'rgba(160,165,170,0.10)';
    ctx.lineWidth = 36;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      const y = 80 + i * 90;
      ctx.moveTo(60 + (i % 3) * 120, y);
      ctx.bezierCurveTo(500, y - 60, 900, y + 70, 1500 + (i % 4) * 80, y - 20);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const text = (s, x, y, size, color) => {
      ctx.font = `${size}px ${HAND}`;
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };
    text('AI — Robot Pembersih Kelas', 90, 150, 104, '#2F5FA3');
    ctx.strokeStyle = '#2F5FA3';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(90, 178); ctx.quadraticCurveTo(520, 196, 1090, 172);
    ctx.stroke();
    text('s = ( (x, y), sisa target )', 90, 300, 78, '#1B1B1B');
    text('A*:   f(n) = g(n) + h(n)', 90, 430, 92, '#B8352B');
    ctx.strokeStyle = '#B8352B';
    ctx.lineWidth = 8;
    ctx.strokeRect(70, 345, 1060, 120);
    text('biaya = langkah + bersihkan', 90, 560, 70, '#3D6B2A');
    text('(1 aksi = 1 satuan)', 90, 650, 58, '#3D6B2A');
    text('Kelompok 6 · AI-D', 90, 760, 52, '#7A7A7A');

    // sketsa denah mini + rute
    const W = scn?.width ?? 8, H = scn?.height ?? 5;
    const cs = Math.min(560 / W, 360 / H);
    const ox = 1280, oy = 200;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 7;
    ctx.strokeRect(ox, oy, W * cs, H * cs);
    ctx.fillStyle = 'rgba(120,140,93,0.0)';
    for (const f of scn?.furniture ?? []) {
      ctx.strokeStyle = '#2F5FA3';
      ctx.lineWidth = 6;
      ctx.strokeRect(ox + f.x * cs + 5, oy + f.y * cs + 8, f.w * cs - 10, f.h * cs - 16);
    }
    ctx.strokeStyle = '#D97757';
    ctx.lineWidth = 10;
    ctx.beginPath();
    const sx = scn?.start?.[0] ?? 0, sy = scn?.start?.[1] ?? H - 1;
    ctx.moveTo(ox + (sx + 0.5) * cs, oy + (sy + 0.5) * cs);
    for (const t of scn?.targets ?? []) ctx.lineTo(ox + (t.x + 0.5) * cs, oy + (t.y + 0.5) * cs);
    ctx.lineTo(ox + (sx + 0.5) * cs, oy + (sy + 0.5) * cs);
    ctx.stroke();
    for (const t of scn?.targets ?? []) {
      ctx.fillStyle = '#3D6B2A';
      ctx.beginPath();
      ctx.arc(ox + (t.x + 0.5) * cs, oy + (t.y + 0.5) * cs, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    text('denah + rute?', ox + 20, oy + H * cs + 80, 60, '#7A7A7A');
  }, { flipY: false });
}

export function makePosterTexture(kind) {
  return canvasTexture(512, 720, (ctx, w, h) => {
    const bg = kind === 'astar' ? '#F4E3D8' : '#DDE8E1';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    if (kind === 'astar') {
      ctx.font = 'bold 78px Georgia, serif';
      ctx.fillText('A*', w / 2, 120);
      ctx.font = '32px Georgia, serif';
      ctx.fillText('Informed Search', w / 2, 168);
      ctx.fillStyle = PALETTE.orange;
      ctx.font = 'bold 54px "Courier New", monospace';
      ctx.fillText('f = g + h', w / 2, 270);
      ctx.fillStyle = PALETTE.ink;
      ctx.font = '26px Georgia, serif';
      ctx.fillText('g : biaya dari awal', w / 2, 330);
      ctx.fillText('h : perkiraan ke tujuan', w / 2, 366);
      const cs = 52, ox = (w - 6 * cs) / 2, oy = 420;
      ctx.lineWidth = 2;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
        ctx.strokeStyle = 'rgba(20,20,19,.25)';
        ctx.strokeRect(ox + x * cs, oy + y * cs, cs, cs);
      }
      ctx.fillStyle = '#BCD1CA';
      ctx.fillRect(ox + 2 * cs + 3, oy + 1 * cs + 3, 2 * cs - 6, cs - 6);
      ctx.fillRect(ox + 1 * cs + 3, oy + 3 * cs + 3, 2 * cs - 6, cs - 6);
      ctx.strokeStyle = PALETTE.orange;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox + 0.5 * cs, oy + 4.5 * cs);
      ctx.lineTo(ox + 0.5 * cs, oy + 2.5 * cs);
      ctx.lineTo(ox + 3.5 * cs, oy + 2.5 * cs);
      ctx.lineTo(ox + 5.5 * cs, oy + 0.5 * cs);
      ctx.stroke();
      ctx.fillStyle = PALETTE.green;
      ctx.beginPath();
      ctx.arc(ox + 5.5 * cs, oy + 0.5 * cs, 17, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.font = 'bold 74px Georgia, serif';
      ctx.fillText('PEAS', w / 2, 118);
      const rows = [['P', 'Performance', 'target bersih · biaya minimum'], ['E', 'Environment', 'ruang kelas + perabot'], ['A', 'Actuators', 'roda · sikat · hisap'], ['S', 'Sensors', 'LiDAR · sensor debu · posisi']];
      rows.forEach(([ch, name, desc], i) => {
        const y = 190 + i * 128;
        ctx.fillStyle = [PALETTE.orange, PALETTE.blue, PALETTE.green, PALETTE.pink][i];
        ctx.beginPath();
        ctx.arc(78, y + 28, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 44px Georgia, serif';
        ctx.fillText(ch, 78, y + 44);
        ctx.fillStyle = PALETTE.ink;
        ctx.textAlign = 'left';
        ctx.font = 'bold 30px Georgia, serif';
        ctx.fillText(name, 140, y + 22);
        ctx.font = '22px Georgia, serif';
        ctx.fillText(desc, 140, y + 56);
        ctx.textAlign = 'center';
      });
    }
  }, { flipY: true });
}

export function makeGlowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

/** Badge target bernomor ala UTS (blob hijau + sinar). */
export function makeBadgeTexture(label, { fill = PALETTE.green, rays = true, check = false } = {}) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    if (rays) {
      ctx.strokeStyle = fill;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 78, cy + Math.sin(a) * 78);
        ctx.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108);
        ctx.stroke();
      }
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#141413';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (check) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 16;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 28, cy + 2); ctx.lineTo(cx - 6, cy + 26); ctx.lineTo(cx + 32, cy - 22);
      ctx.stroke();
    } else {
      ctx.font = 'bold 84px Arial, sans-serif';
      ctx.fillText(String(label), cx, cy + 5);
    }
  });
}

export function makeTagTexture(text, color = PALETTE.orange) {
  return canvasTexture(192, 72, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(20,20,19,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    const r = 30;
    ctx.beginPath();
    ctx.moveTo(r, 4); ctx.lineTo(w - r, 4); ctx.quadraticCurveTo(w - 4, 4, w - 4, r);
    ctx.lineTo(w - 4, h - r); ctx.quadraticCurveTo(w - 4, h - 4, w - r, h - 4);
    ctx.lineTo(r, h - 4); ctx.quadraticCurveTo(4, h - 4, 4, h - r);
    ctx.lineTo(4, r); ctx.quadraticCurveTo(4, 4, r, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}
