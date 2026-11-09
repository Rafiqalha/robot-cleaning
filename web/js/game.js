// Mode game "Kamu vs AI": kendalikan robot dengan keyboard, lalu bandingkan biaya dengan rencana optimal A*.
import { requestPlan } from './api.js';
import { DIRS } from './config.js';
import { headingFor } from './utils.js';

const KEYMAP = { arrowup: 'U', w: 'U', arrowright: 'R', d: 'R', arrowdown: 'D', s: 'D', arrowleft: 'L', a: 'L' };

export class Game {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.busy = false;
    this.finished = false;
    this.optimal = null;
  }

  setActive(on, host) {
    const a = this.app;
    this.active = on;
    if (on) {
      this.host = host;
      host.innerHTML = `
        <div class="gamebox">
          <b>Kamu vs AI</b> — bersihkan semua titik kotoran lalu kembali ke dock dengan biaya sekecil mungkin.<br>
          Gerak: <span class="kbd">←↑↓→</span> / <span class="kbd">WASD</span> · Bersihkan: <span class="kbd">Spasi</span> · Ulang: <span class="kbd">R</span>
        </div>
        <div class="stats" style="margin-top:8px">
          <div class="stat hero"><small>Biayamu</small><b id="g-cost">0</b><span id="g-detail">0 gerak · 0 bersih</span></div>
          <div class="stat"><small>Optimal (A*)</small><b id="g-opt">…</b><span id="g-left">sisa target</span></div>
        </div>
        <div class="btn-row" style="margin-top:8px"><button class="btn" id="g-restart">↺ Main lagi</button><button class="btn" id="g-ai">🤖 Lihat AI</button></div>`;
      host.querySelector('#g-restart').addEventListener('click', () => this.reset());
      host.querySelector('#g-ai').addEventListener('click', () => this.showAI());
      a.sfx.ensure();
      a.rig.setMode('overview');
      this.reset();
    } else {
      this.finished = true;
      a.director.resetRun();
    }
  }

  reset() {
    const a = this.app, d = a.director;
    d.resetRun();
    const s = d.scn;
    this.pos = [s.start[0], s.start[1]];
    this.heading = 0;
    this.remaining = new Set(s.targets.map((t) => t.id));
    this.cost = this.moves = this.cleans = this.bumps = 0;
    this.busy = false;
    this.finished = false;
    this.optimal = null;
    this.obs = new Set(s.obstacles.map((o) => `${o[0]},${o[1]}`));
    a.hud.hideResult();
    this.refresh();
    d.toast('Giliranmu! Gerakkan robot dengan panah/WASD, tekan Spasi untuk membersihkan.');
    requestPlan(d.spec(), 'astar', 'mst', s.pristine ? s.scenarioId : null)
      .then((p) => {
        if (p.ok) {
          this.optimal = p;
          this.refresh();
        }
      })
      .catch(() => {});
  }

  refresh() {
    const q = (id) => this.host?.querySelector(id);
    if (!q('#g-cost')) return;
    q('#g-cost').textContent = this.cost;
    q('#g-detail').textContent = `${this.moves} gerak · ${this.cleans} bersih${this.bumps ? ` · ${this.bumps} tabrak` : ''}`;
    q('#g-opt').textContent = this.optimal ? this.optimal.stats.cost : '…';
    q('#g-left').textContent = `sisa ${this.remaining.size} target`;
    const dir = { pos: this.pos, remaining: [...this.remaining] };
    this.app.hud.renderState(dir, { g: this.cost, h: null, f: null, action: null });
    const total = this.app.director.scn.targets.length;
    this.app.hud.setPerformance(total - this.remaining.size, total, this.cost);
  }

  handleKey(e) {
    if (!this.active) return false;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) {
      e.preventDefault();
      this.move(KEYMAP[k]);
      return true;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      this.clean();
      return true;
    }
    if (k === 'r') {
      this.reset();
      return true;
    }
    return false;
  }

  async move(dir) {
    if (this.busy || this.finished) return;
    const a = this.app, r = a.robot;
    const [dx, dy] = DIRS[dir];
    const nx = this.pos[0] + dx, ny = this.pos[1] + dy;
    const s = a.director.scn;
    const blocked = nx < 0 || ny < 0 || nx >= s.width || ny >= s.height || this.obs.has(`${nx},${ny}`);
    const h = headingFor(dx, dy);
    this.busy = true;
    r.setMode('moving');
    if (blocked) {
      // putar menghadap rintangan lalu "tersentak" mundur sedikit
      const p = r.position.clone();
      await r.goStep(p.x, p.z, h, { turn: 0.18, move: 0.05 });
      a.sfx.error();
      r.setMode('alert');
      this.bumps++;
      a.director.toast('Terhalang! Sensor jarak mendeteksi rintangan di arah itu.', 'warn');
      await new Promise((res) => setTimeout(res, 380));
      r.setMode('idle');
      this.busy = false;
      this.refresh();
      return;
    }
    const to = a.room.grid.toWorld(nx, ny);
    await r.goStep(to.x, to.z, h);
    this.pos = [nx, ny];
    this.moves++;
    this.cost++;
    r.setMode('idle');
    this.busy = false;
    this.refresh();
    this.checkDone();
  }

  async clean() {
    if (this.busy || this.finished) return;
    const a = this.app, r = a.robot;
    const t = a.director.scn.targets.find((q) => q.x === this.pos[0] && q.y === this.pos[1] && this.remaining.has(q.id));
    this.busy = true;
    this.cost++;
    if (!t) {
      a.sfx.error();
      a.director.toast('Tidak ada kotoran di sel ini — aksi bersihkan sia-sia (+1 biaya).', 'warn');
      this.busy = false;
      this.refresh();
      return;
    }
    r.setMode('cleaning');
    a.sfx.suction(1.3);
    await new Promise((res) => a.litter.startSuction(t.id, r.intakeWorld(), () => { a.sfx.ding(); res(); }));
    this.remaining.delete(t.id);
    this.cleans++;
    await new Promise((res) => setTimeout(res, 250));
    r.setMode('idle');
    this.busy = false;
    this.refresh();
    this.checkDone();
  }

  checkDone() {
    const s = this.app.director.scn;
    if (this.remaining.size === 0 && this.pos[0] === s.start[0] && this.pos[1] === s.start[1]) this.finish();
  }

  async finish() {
    const a = this.app;
    this.finished = true;
    a.robot.setMode('done');
    a.sfx.done();
    a.fx.confetti(a.robot.position);
    if (!this.optimal) {
      try { this.optimal = await requestPlan(a.director.spec(), 'astar', 'mst', a.director.scn.pristine ? a.director.scn.scenarioId : null); } catch { /* abaikan */ }
    }
    const opt = this.optimal?.stats?.cost ?? null;
    let title = 'Selesai!', msg = `Biayamu ${this.cost}.`;
    if (opt != null) {
      if (this.cost <= opt) { title = 'Setara AI! 🏆'; msg = `Biayamu ${this.cost} = optimal A* (${opt}). Luar biasa!`; }
      else {
        const gap = Math.round(((this.cost - opt) / opt) * 100);
        title = 'Bagus!';
        msg = `Biayamu ${this.cost}, optimal A* ${opt} — AI lebih hemat ${this.cost - opt} aksi (${gap}%).`;
      }
    }
    this.refresh();
    a.hud.showCard(
      `<div class="kick">KAMU VS AI</div><h2>${title}</h2><p>${msg}</p>
       <div class="stats"><div class="stat hero"><small>Biayamu</small><b>${this.cost}</b><span>${this.moves} gerak · ${this.cleans} bersih</span></div>
       <div class="stat"><small>Optimal A*</small><b>${opt ?? '–'}</b><span>${this.optimal ? this.optimal.stats.expanded + ' state diperiksa' : ''}</span></div></div>
       <div class="btns"><button class="btn primary" data-r="ai">🤖 Lihat AI menjalankannya</button><button class="btn" data-r="again">↺ Main lagi</button><button class="btn" data-r="close">Tutup</button></div>`,
      (act) => {
        a.hud.hideResult();
        if (act === 'again') this.reset();
        else if (act === 'ai') this.showAI();
      },
      0,
    );
  }

  showAI() {
    const a = this.app;
    a.hud.hideResult();
    a.hud.setMode('normal');
    a.director.resetRun();
    a.director.start();
  }
}
