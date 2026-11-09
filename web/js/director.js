// Director: alur "agen pemecah masalah" — rumuskan tujuan -> rumuskan masalah -> cari (A*) -> eksekusi.
import * as THREE from 'three';
import { ALGO_LABEL, CELL, DIRS, HEUR_LABEL } from './config.js';
import { requestPlan } from './api.js';
import { angleDiff, clamp, easeInOutCubic, headingFor } from './utils.js';

export class Director {
  constructor(app) {
    this.app = app;
    this.state = 'idle'; // idle | formulating | searching | planned | executing | paused | done | error
    this.algo = 'astar';
    this.heur = 'mst';
    this.speed = 1;
    this.stepMode = false;
    this.autoCam = false;
    this.paused = false;
    this.timers = [];
    this.exec = null;
    this.plan = null;
    this.scn = null;
    this.runId = 0;
    this.states = [];
    this.handlers = {};
    this.motorT = 0;
  }

  // ---------------------------------------------------------------- event
  on(evt, fn) {
    (this.handlers[evt] ||= []).push(fn);
    return this;
  }
  emit(evt, data) {
    (this.handlers[evt] || []).forEach((fn) => fn(data));
  }
  setState(s) {
    this.state = s;
    this.emit('state', s);
  }
  toast(text, kind = 'info') {
    this.emit('toast', { text, kind });
  }

  // ------------------------------------------------------------- skenario
  loadScenario(scn, { keepRun = false } = {}) {
    const a = this.app;
    this.scn = JSON.parse(JSON.stringify(scn));
    this.scn.scenarioId = scn.scenarioId ?? scn.id;
    this.scn.pristine = scn.pristine ?? true;
    this.ensureObstacles();
    a.room.build(this.scn);
    a.fx.setRoom(a.room);
    a.viz.build();
    a.litter.build(this.scn);
    a.robot.placeAtCell(this.scn.start[0], this.scn.start[1], 0);
    a.rig.onResize();
    if (!keepRun) this.resetRun();
    this.emit('scenario', this.scn);
  }

  ensureObstacles() {
    const set = new Set();
    for (const f of this.scn.furniture) for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) set.add(`${f.x + dx},${f.y + dy}`);
    this.scn.obstacles = [...set].map((s) => s.split(',').map(Number));
  }

  /** Dipanggil editor setelah denah diubah (tanpa membangun ulang cangkang ruangan). */
  applyEdit() {
    const a = this.app;
    this.scn.pristine = false;
    this.ensureObstacles();
    a.room.buildDynamic(this.scn);
    a.litter.build(this.scn);
    this.resetRun({ rebuildLitter: false });
    this.emit('scenario', this.scn);
  }

  spec() {
    const s = this.scn;
    return {
      width: s.width, height: s.height, obstacles: s.obstacles, start: s.start,
      targets: s.targets.map((t) => ({ id: t.id, x: t.x, y: t.y })),
    };
  }

  get label() {
    const a = ALGO_LABEL[this.algo] ?? this.algo;
    return ['astar', 'greedy'].includes(this.algo) ? `${a} (${HEUR_LABEL[this.heur] ?? this.heur})` : a;
  }

  // ---------------------------------------------------------------- reset
  resetRun({ rebuildLitter = true } = {}) {
    const a = this.app;
    this.runId++;
    this.exec = null;
    this.timers.forEach((t) => t.resolve());
    this.timers = [];
    this.paused = false;
    this.plan = null;
    this.states = [];
    a.viz.clear();
    if (rebuildLitter) a.litter.build(this.scn);
    a.robot.placeAtCell(this.scn.start[0], this.scn.start[1], 0);
    a.robot.setMode('idle');
    a.sfx.setMotor(0);
    this.setState('idle');
    this.emit('stage', 0);
    this.emit('reset');
    this.toast('Siap. Tekan Mulai (Spasi) untuk menjalankan agen.');
  }

  wait(sec) {
    return new Promise((resolve) => this.timers.push({ left: sec / Math.max(1, this.speed * 0.7), resolve }));
  }

  // ---------------------------------------------------------------- alur
  async start() {
    if (['formulating', 'searching', 'planned', 'executing'].includes(this.state)) return;
    const a = this.app;
    a.sfx.ensure();
    this.resetRun();
    const me = this.runId;
    const alive = () => this.runId === me;

    this.setState('formulating');
    this.emit('stage', 1);
    this.toast('① Merumuskan tujuan: semua target bersih dan robot kembali ke titik awal.');
    a.robot.setMode('thinking');
    a.sfx.click();
    const planP = requestPlan(this.spec(), this.algo, this.heur, this.scn.pristine ? this.scn.scenarioId : null).catch((error) => ({ error }));
    await this.wait(1.4);
    if (!alive()) return;

    this.emit('stage', 2);
    this.emit('focus-formulation');
    this.toast('② Merumuskan masalah: state, aksi, model transisi, uji tujuan, dan biaya langkah.');
    await this.wait(1.7);
    if (!alive()) return;

    this.emit('stage', 3);
    this.setState('searching');
    this.toast(`③ Mencari rencana dengan ${this.label}…`);
    const plan = await planP;
    if (!alive()) return;
    if (plan.error || !plan.ok) {
      const msg = plan.error ? String(plan.error.message ?? plan.error) : plan.message || 'Tidak ada solusi.';
      a.robot.setMode('alert');
      a.sfx.error();
      this.setState('error');
      this.toast(`Gagal: ${msg}`, 'error');
      this.emit('plan-error', msg);
      return;
    }
    this.plan = plan;
    this.prepareRun(plan);
    if (plan.skipped?.length) {
      a.litter.markSkipped(plan.skipped);
      this.toast(`Target ${plan.skipped.join(', ')} tidak terjangkau (dilewati).`, 'warn');
    }
    this.emit('plan', plan);

    const secs = clamp(1.7 + Math.log10(plan.explore.total + 10) * 0.9, 1.9, 4.6) / Math.max(1, this.speed * 0.6);
    await a.viz.playSearch(plan.explore, secs, (k, n) => {
      this.emit('search-progress', { k, n, plan });
      if (Math.random() < 0.08) a.sfx.think();
    });
    if (!alive()) return;
    a.sfx.plan();
    a.viz.setRoute(plan.cells);
    a.litter.setOrder(plan.order);
    this.emit('stage', 3.5);
    this.toast(`Rencana ditemukan: biaya ${plan.stats.cost} · ${plan.stats.moves} gerakan · ${plan.stats.expanded} state diperiksa (${plan.stats.time_ms} ms).`, 'ok');
    this.setState('planned');
    await a.viz.growRoute(1.5 / Math.max(1, this.speed * 0.6));
    if (!alive()) return;
    await this.wait(0.9);
    if (!alive()) return;

    this.emit('stage', 4);
    this.setState('executing');
    a.viz.heatTarget = a.viz.heatEnabled ? 0.18 : 0;
    a.robot.setMode('moving');
    if (this.autoCam) a.rig.setMode('follow');
    this.toast(`④ Eksekusi rencana ${this.label}.`);
    await this.execute(plan);
    if (!alive()) return;
    this.finish();
  }

  prepareRun(plan) {
    const ids = this.scn.targets.map((t) => t.id).filter((id) => !(plan.skipped ?? []).includes(id));
    const remaining = new Set(ids);
    const states = [{ pos: plan.cells[0], remaining: [...remaining] }];
    let ci = 0;
    for (let i = 0; i < plan.actions.length; i++) {
      if (plan.actions[i] === 'C') remaining.delete(plan.order[ci++]);
      states.push({ pos: plan.cells[i + 1], remaining: [...remaining] });
    }
    this.states = states;
  }

  buildSegments(plan, merge) {
    const grid = this.app.room.grid;
    const cells = plan.cells, acts = plan.actions;
    const segs = [];
    let heading = this.app.robot.heading;
    let ci = 0, moved = 0;
    for (let i = 0; i < acts.length; ) {
      const a = acts[i];
      if (a === 'C') {
        segs.push({ type: 'clean', actionStart: i, actionCount: 1, targetId: plan.order[ci++], dur: 1.95, t: 0 });
        i++;
        continue;
      }
      const [dx, dy] = DIRS[a];
      let n = 1;
      if (merge) while (i + n < acts.length && acts[i + n] === a) n++;
      const th = headingFor(dx, dy);
      if (Math.abs(angleDiff(heading, th)) > 1e-3) {
        const d = Math.abs(angleDiff(heading, th));
        segs.push({ type: 'turn', from: heading, to: th, dur: d / 3.4 + 0.14, t: 0, actionStart: i, actionCount: 0 });
        heading = th;
      }
      const from = grid.toWorld(cells[i][0], cells[i][1]);
      const to = grid.toWorld(cells[i + n][0], cells[i + n][1]);
      segs.push({ type: 'move', from, to, heading: th, n, dur: (n * CELL) / 1.85 + 0.24, t: 0, actionStart: i, actionCount: n, baseMoved: moved });
      moved += n;
      i += n;
    }
    if (Math.abs(angleDiff(heading, 0)) > 1e-3) {
      segs.push({ type: 'turn', from: heading, to: 0, dur: Math.abs(angleDiff(heading, 0)) / 3.4 + 0.14, t: 0, actionStart: acts.length, actionCount: 0, final: true });
    }
    return { segs, totalMoves: moved };
  }

  execute(plan) {
    return new Promise((resolve) => {
      const { segs, totalMoves } = this.buildSegments(plan, !this.stepMode);
      this.exec = { segs, i: 0, plan, resolve, cursor: 0, totalMoves };
      this.emitStep(0);
    });
  }

  emitStep(i) {
    const p = this.plan;
    if (!p) return;
    const st = this.states[clamp(i, 0, this.states.length - 1)];
    const g = i;
    const h = p.h_path ? p.h_path[i] : null;
    this.emit('step', {
      index: i, total: p.actions.length, action: i > 0 ? p.actions[i - 1] : null, next: p.actions[i] ?? null,
      state: st, g, h, f: h == null ? null : g + h,
    });
  }

  finish() {
    const a = this.app;
    const p = this.plan;
    this.exec = null;
    a.robot.setMode('done');
    a.sfx.setMotor(0);
    a.sfx.done();
    a.fx.confetti(a.robot.position);
    a.viz.setProgress(p.stats.moves);
    this.emit('stage', 5);
    this.setState('done');
    if (this.autoCam) a.rig.setMode('overview');
    this.toast(`Selesai! Semua target bersih dan robot kembali ke titik awal. Biaya total = ${p.stats.cost}.`, 'ok');
    this.emit('result', { plan: p, label: this.label });
  }

  // ------------------------------------------------------------- kontrol
  pause() {
    if (!['executing', 'formulating', 'searching', 'planned'].includes(this.state)) return;
    this.paused = true;
    this.app.sfx.setMotor(0);
    this.setState('paused');
    this.emit('paused', true);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.paused = false;
    this.setState(this.exec ? 'executing' : 'searching');
    this.emit('paused', false);
  }
  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }
  /** mode langkah: lanjutkan sampai segmen berikutnya selesai lalu jeda lagi */
  stepOnce() {
    if (this.state === 'paused' && this.exec) {
      this.paused = false;
      this.stepPending = true;
      this.setState('executing');
    } else if (this.state === 'idle') {
      this.stepMode = true;
      this.start();
    }
  }

  // --------------------------------------------------------------- frame
  update(dt) {
    if (!this.paused && this.timers.length) {
      for (const t of this.timers) t.left -= dt;
      const ready = this.timers.filter((t) => t.left <= 0);
      this.timers = this.timers.filter((t) => t.left > 0);
      ready.forEach((t) => t.resolve());
    }
    const a = this.app;
    this.motorT += dt;
    if (this.motorT > 0.08) {
      this.motorT = 0;
      a.sfx.setMotor(this.paused ? 0 : clamp(Math.abs(a.robot.speed) / 2.2 + Math.abs(a.robot.yawRate) / 8, 0, 1));
    }
    const ex = this.exec;
    if (!ex || this.paused) return;
    const seg = ex.segs[ex.i];
    if (!seg) {
      const done = ex.resolve;
      this.exec = null;
      done();
      return;
    }
    const robot = a.robot;
    if (!seg.started) {
      seg.started = true;
      if (seg.type === 'clean') {
        robot.setMode('cleaning');
        a.sfx.suction(1.3);
        a.litter.startSuction(seg.targetId, robot.intakeWorld(), () => a.sfx.ding());
      } else robot.setMode('moving');
    }
    seg.t += dt * this.speed;
    const k = clamp(seg.t / seg.dur, 0, 1);
    if (seg.type === 'turn') {
      const h = seg.from + angleDiff(seg.from, seg.to) * easeInOutCubic(k);
      robot.setPose(robot.position.x, robot.position.z, h);
    } else if (seg.type === 'move') {
      const e = k * k * (3 - 2 * k);
      const x = seg.from.x + (seg.to.x - seg.from.x) * e;
      const z = seg.from.z + (seg.to.z - seg.from.z) * e;
      robot.setPose(x, z, seg.heading);
      a.viz.setProgress(seg.baseMoved + seg.n * e);
      const idx = seg.actionStart + Math.floor(seg.n * e + 1e-6);
      if (idx > ex.cursor) {
        ex.cursor = idx;
        this.emitStep(idx);
      }
    }
    if (k >= 1) {
      if (seg.type === 'move') {
        robot.setPose(seg.to.x, seg.to.z, seg.heading);
        ex.cursor = seg.actionStart + seg.n;
        this.emitStep(ex.cursor);
      } else if (seg.type === 'clean') {
        ex.cursor = seg.actionStart + 1;
        this.emitStep(ex.cursor);
      } else if (seg.type === 'turn') {
        robot.setPose(robot.position.x, robot.position.z, seg.to);
      }
      ex.i++;
      if ((this.stepMode || this.stepPending) && ex.i < ex.segs.length && seg.type !== 'turn') {
        this.stepPending = false;
        this.pause();
      }
    }
  }

  /** Sensor simulasi pada sel (untuk panel PEAS). */
  sensorsAt(cell) {
    const obs = new Set(this.scn.obstacles.map((o) => `${o[0]},${o[1]}`));
    const blocked = {};
    for (const [k, [dx, dy]] of Object.entries(DIRS)) {
      const x = cell[0] + dx, y = cell[1] + dy;
      blocked[k] = x < 0 || y < 0 || x >= this.scn.width || y >= this.scn.height || obs.has(`${x},${y}`);
    }
    return blocked;
  }
}
