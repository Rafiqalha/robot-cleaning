// Efek suara sintetis (WebAudio, tanpa berkas): dengung motor, bip, dentang, hisap.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.hum = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      // dengung motor
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const o1 = this.ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 62;
      const o2 = this.ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = 94;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.hum = { g, o1, o2, lp };
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  setMotor(level) {
    if (!this.hum || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.g.gain.setTargetAtTime(0.028 * level, t, 0.12);
    this.hum.o1.frequency.setTargetAtTime(58 + 55 * level, t, 0.15);
    this.hum.o2.frequency.setTargetAtTime(88 + 70 * level, t, 0.15);
    this.hum.lp.frequency.setTargetAtTime(380 + 500 * level, t, 0.15);
  }

  tone(freq, dur = 0.12, { type = 'sine', vol = 0.09, delay = 0, slideTo = null } = {}) {
    if (!this.ensure() || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  click() { this.tone(620, 0.05, { type: 'square', vol: 0.03 }); }
  think() { this.tone(520 + Math.random() * 380, 0.04, { type: 'triangle', vol: 0.025 }); }
  plan() { this.tone(520, 0.1, { type: 'triangle' }); this.tone(780, 0.14, { type: 'triangle', delay: 0.09 }); this.tone(1040, 0.2, { type: 'triangle', delay: 0.19 }); }
  ding() { this.tone(988, 0.16, { type: 'sine', vol: 0.11 }); this.tone(1480, 0.3, { type: 'sine', vol: 0.09, delay: 0.1 }); }
  error() { this.tone(220, 0.25, { type: 'sawtooth', vol: 0.07, slideTo: 140 }); }
  done() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.1, delay: i * 0.12 })); }

  suction(dur = 1.4) {
    if (!this.ensure() || !this.enabled) return;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    const t0 = c.currentTime;
    bp.frequency.setValueAtTime(400, t0);
    bp.frequency.exponentialRampToValueAtTime(1800, t0 + dur * 0.85);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t0);
  }
}
