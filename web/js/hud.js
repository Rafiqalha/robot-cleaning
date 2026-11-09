// HUD / antarmuka presentasi: kontrol, tahapan agen, PEAS, formulasi masalah, metrik, rencana, Lab.
import { ACTION_GLYPH, ACTION_LABEL, ALGO_LABEL, HEUR_LABEL } from './config.js';
import { getBenchmark, isStatic, saveScreenshot } from './api.js';
import { clamp } from './utils.js';

const ALGO_NOTE = {
  astar: '<b>A*</b> memilih simpul dengan f(n) = g(n) + h(n) terkecil. Dengan heuristik admissible hasilnya <b>optimal</b> dan jauh lebih hemat state.',
  ucs: '<b>UCS</b> memperluas simpul dengan g(n) terkecil. Optimal, tetapi “buta arah” karena tanpa heuristik.',
  bfs: '<b>BFS</b> memperluas simpul per lapisan. Optimal untuk biaya satuan, tetapi paling boros state.',
  greedy: '<b>Greedy Best-First</b> hanya memakai h(n): cepat, namun <b>tidak menjamin optimal</b>.',
  nn: '<b>Nearest-Neighbor</b>: selalu ke target terdekat. Bukan pencarian ruang-state; sering lebih mahal dari rencana optimal.',
};
const HEUR_NOTE = {
  mst: 'h = MST(target ∪ titik awal) + jarak ke simpul terdekat + jumlah target. <b>Paling informatif</b>, admissible & consistent.',
  max: 'h = jarak (BFS) terjauh: robot → target → titik awal, + jumlah target. Admissible & consistent.',
  manhattan: 'Seperti “jarak-max” tetapi memakai jarak Manhattan (mengabaikan rintangan). Lebih longgar, tetap admissible.',
};
const ALGO_COLOR = { bfs: '#6A9BCC', ucs: '#D4A27F', astar_manhattan: '#C46686', astar_max: '#788C5D', astar_mst: '#D97757', greedy_mst: '#8F8D84', nn: '#6b6a64' };

const TEMPLATE = `
<header class="topbar">
  <div class="brand">
    <svg class="brand-bot" viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="12" width="46" height="36" rx="9" fill="#D97757" stroke="#fff" stroke-width="3"/><path d="M22 25l9 6-9 6M42 25l-9 6 9 6" stroke="#141413" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="17" y="48" width="9" height="11" rx="2" fill="#D97757" stroke="#fff" stroke-width="2.5"/><rect x="38" y="48" width="9" height="11" rx="2" fill="#D97757" stroke="#fff" stroke-width="2.5"/></svg>
    <div class="brand-text"><b>CleanBot 3D</b><span>Rute robot pembersih kelas · A* · Kelompok 6</span></div>
  </div>
  <div class="top-actions">
    <button class="btn" data-act="lab">Lab algoritma</button>
    <button class="btn" data-act="shot" title="Simpan gambar (P)">Foto</button>
    <button class="btn" data-act="fullscreen">Layar penuh</button>
    <button class="btn" data-act="hide" title="Sembunyikan panel (H)">Sembunyikan panel</button>
    <button class="btn" data-act="about">Tentang</button>
  </div>
</header>

<aside class="panel left" id="panel-left">
  <div class="sec">
    <h3>Skenario <em id="scn-tag"></em></h3>
    <div class="seg" id="seg-scn"></div>
    <div class="scn-card"><b id="scn-name"></b><span id="scn-desc"></span></div>
  </div>
  <div class="sec">
    <h3>Algoritma pencarian</h3>
    <div class="seg" id="seg-algo">
      <button data-v="astar">A*</button><button data-v="ucs">UCS</button><button data-v="bfs">BFS</button><button data-v="greedy">Greedy</button><button data-v="nn">NN</button>
    </div>
    <div class="note" id="algo-note"></div>
  </div>
  <div class="sec" id="sec-heur">
    <h3>Heuristik h(n)</h3>
    <div class="seg" id="seg-heur"><button data-v="mst">MST</button><button data-v="max">Jarak-max</button><button data-v="manhattan">Manhattan</button></div>
    <div class="note" id="heur-note"></div>
  </div>
  <div class="sec">
    <h3>Kecepatan <em id="speed-val">1.0×</em></h3>
    <input class="range" id="speed" type="range" min="0.5" max="4" step="0.5" value="1" autocomplete="off" />
    <div class="chips" style="margin-top:8px"><span class="tgl" data-tgl="step">Mode langkah</span><span class="tgl" data-tgl="autocam">Kamera otomatis</span></div>
  </div>
  <div class="sec">
    <h3>Kamera</h3>
    <div class="seg" id="seg-cam"><button data-v="overview">Overview</button><button data-v="top">Atas</button><button data-v="follow">Ikuti</button><button data-v="fpv">Robot</button><button data-v="cinema">Sinema</button></div>
  </div>
  <div class="sec">
    <h3>Tampilan</h3>
    <div class="chips">
      <span class="tgl" data-tgl="grid">Grid</span><span class="tgl on" data-tgl="heat">Heat-map</span><span class="tgl on" data-tgl="route">Rute</span>
      <span class="tgl on" data-tgl="lidar">LiDAR</span><span class="tgl on" data-tgl="sound">Suara</span>
    </div>
    <div style="margin-top:9px"><select id="quality" autocomplete="off"><option value="ultra">Kualitas: Ultra</option><option value="tinggi" selected>Kualitas: Tinggi</option><option value="sedang">Kualitas: Sedang</option><option value="rendah">Kualitas: Rendah</option></select></div>
  </div>
  <div class="sec">
    <h3>Kontrol</h3>
    <div class="btn-row">
      <button class="btn primary" id="btn-start">▶ Mulai</button>
      <button class="btn" id="btn-step">⏭ Langkah</button>
      <button class="btn" id="btn-reset">↺ Reset</button>
    </div>
  </div>
  <div class="sec">
    <h3>Mode</h3>
    <div class="seg" id="seg-mode"><button data-v="normal" class="on">Normal</button><button data-v="editor">Editor</button><button data-v="game">Game</button></div>
    <div id="mode-extra"></div>
  </div>
</aside>

<aside class="panel right" id="panel-right">
  <div class="tabs" id="tabs">
    <button data-tab="peas" class="on">Agen (PEAS)</button><button data-tab="masalah">Masalah</button><button data-tab="metrik">Metrik</button><button data-tab="rencana">Rencana</button>
  </div>

  <div class="tab on" id="tab-peas">
    <div class="peas">
      <div class="card"><div class="letter" style="background:#D97757">P</div><div><h4>Performance</h4><p>Semua target bersih, tanpa menabrak, kembali ke titik awal, biaya perjalanan minimum.</p>
        <div class="live"><span>Bersih: <b id="pf-clean">0/0</b> · Biaya g = <b id="pf-cost">0</b></span></div></div></div>
      <div class="card"><div class="letter" style="background:#6A9BCC">E</div><div><h4>Environment</h4><p id="env-text">Satu ruang kelas, perabot sebagai rintangan, titik kotoran, titik awal robot.</p></div></div>
      <div class="card"><div class="letter" style="background:#788C5D">A</div><div><h4>Actuators</h4><p>Roda (atas · kanan · bawah · kiri), sikat samping & roller, hisap (bersihkan).</p>
        <div class="live"><span>Aksi: <b id="ac-action" class="pill">—</b></span><span>Mode: <b id="ac-mode">siaga</b></span></div></div></div>
      <div class="card"><div class="letter" style="background:#C46686">S</div><div><h4>Sensors</h4><p>LiDAR / sensor jarak, sensor debu, posisi robot, peta denah.</p>
        <div class="live"><span>Posisi: <b id="se-pos">(0,0)</b></span><span>Jarak <span class="dirs" id="se-dirs"></span></span><span>Sensor debu: <b id="se-dust" class="pill">tidak ada</b></span></div></div></div>
    </div>
  </div>

  <div class="tab" id="tab-masalah">
    <div class="formul">
      <div class="state"><small>STATE SAAT INI</small><span id="state-line">s = ((0,0), {…})</span></div>
      <div class="fgh"><div><small>g(n)</small><b id="g-val">0</b></div><div><small>h(n)</small><b id="h-val">–</b></div><div class="f"><small>f = g + h</small><b id="f-val">–</b></div></div>
      <div class="comp" data-i="0"><div class="n">1</div><div><b>Initial state</b><span>Robot di titik awal, semua target belum dibersihkan.</span></div></div>
      <div class="comp" data-i="1"><div class="n">2</div><div><b>Actions</b><span>Gerak ke sel tetangga valid (↑ → ↓ ←) atau membersihkan target di posisi saat ini.</span></div></div>
      <div class="comp" data-i="2"><div class="n">3</div><div><b>Transition model</b><span>Gerak mengubah posisi; membersihkan menghapus target dari himpunan sisa.</span></div></div>
      <div class="comp" data-i="3"><div class="n">4</div><div><b>Goal test</b><span>Semua target bersih dan robot kembali ke titik awal.</span></div></div>
      <div class="comp" data-i="4"><div class="n">5</div><div><b>Path cost</b><span>1 satuan per aksi (gerak maupun bersihkan).</span></div></div>
    </div>
  </div>

  <div class="tab" id="tab-metrik">
    <div class="stats">
      <div class="stat hero"><small>State diperiksa</small><b id="st-expanded">–</b><span id="st-space"></span></div>
      <div class="stat"><small>Dibangkitkan</small><b id="st-generated">–</b><span id="st-frontier"></span></div>
      <div class="stat"><small>Waktu komputasi</small><b id="st-time">–</b><span>milidetik</span></div>
      <div class="stat hero"><small>Total biaya</small><b id="st-cost">–</b><span id="st-optimal"></span></div>
      <div class="stat"><small>Gerakan</small><b id="st-moves">–</b><span>langkah</span></div>
      <div class="stat"><small>Pembersihan</small><b id="st-clean">–</b><span>target</span></div>
    </div>
    <div class="meter"><i id="search-meter"></i></div>
    <div class="note" id="metrik-note">Jalankan agen untuk melihat metrik pencarian.</div>
  </div>

  <div class="tab" id="tab-rencana">
    <div class="note" style="margin:0 0 8px">Urutan aksi hasil pencarian — ↑ → ↓ ← gerak, ✦ bersihkan.</div>
    <div class="plan" id="plan-list"></div>
    <div class="order" id="order-line"></div>
  </div>
</aside>

<div class="subtitle" id="subtitle"></div>
<div class="stepper" id="stepper">
  <div class="step" data-s="1"><i>1</i><span>Tujuan</span></div>
  <div class="step" data-s="2"><i>2</i><span>Masalah</span></div>
  <div class="step" data-s="3"><i>3</i><span>Pencarian</span></div>
  <div class="step" data-s="4"><i>4</i><span>Eksekusi</span></div>
  <div class="step" data-s="5"><i>✓</i><span>Selesai</span></div>
</div>
<div class="hintbar"><b>Spasi</b> mulai/jeda · <b>R</b> reset · <b>1–5</b> kamera · <b>G</b> grid · <b>H</b> sembunyikan panel · <b>M</b> suara · <b>P</b> foto</div>

<div class="result-card" id="result"></div>

<div class="modal" id="modal-lab"><div class="modal-card">
  <button class="btn modal-x" data-close="modal-lab">Tutup ✕</button>
  <h2>Lab perbandingan algoritma</h2>
  <p class="sub">BFS, UCS, A* (tiga heuristik), Greedy, dan Nearest-Neighbor diuji pada skenario S1–S4. Data dari inti AI Python.</p>
  <div id="lab-body">Memuat…</div>
</div></div>

<div class="modal" id="modal-about"><div class="modal-card" style="max-width:720px">
  <button class="btn modal-x" data-close="modal-about">Tutup ✕</button>
  <h2>CleanBot 3D</h2>
  <p class="sub">Perencanaan Rute Robot Pembersih di Ruang Kelas — menangani beberapa titik kotoran dengan algoritma A*</p>
  <p><b>UAS Artificial Intelligence · Kelompok 6 · Kelas AI-D · UIN Malang</b></p>
  <p>Rafiq Alhariri Andriansyah (240605110178) · Ahmad Zamroni (240605110216) · Afzaal Abrar Hidayat (240605110206)</p>
  <p style="color:#b7b5ab">Inti AI ditulis dengan <b>Python</b> (formulasi masalah, BFS/UCS/A*, agen PEAS, FastAPI). Model robot & perabot dibuat dengan <b>Blender (bpy)</b> dan diekspor ke GLB. Visual realistis & animasi dirender real-time dengan <b>three.js</b> (PBR, bayangan matahari, ambient occlusion, bloom).</p>
</div></div>
`;

export class HUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.root.innerHTML = TEMPLATE;
    this.q = (s) => this.root.querySelector(s);
    this.qa = (s) => [...this.root.querySelectorAll(s)];
    this.mode = 'normal';
    this.build();
    this.bind();
    this.bindDirector();
    this.setAlgo(app.director.algo, true);
    this.setHeur(app.director.heur, true);
    this.q('#speed').value = '1';
    app.director.speed = 1;
    window.addEventListener('resize', () => this.updateInsets());
    new MutationObserver(() => this.updateInsets()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    requestAnimationFrame(() => this.updateInsets());
  }

  updateInsets() {
    const clean = document.body.classList.contains('clean');
    const vis = (el) => el && getComputedStyle(el).display !== 'none';
    const L = this.q('#panel-left'), R = this.q('#panel-right'), T = this.q('.topbar'), S = this.q('#stepper');
    const i = { l: 0, r: 0, t: 0, b: 0 };
    if (!clean) {
      if (vis(L)) i.l = L.getBoundingClientRect().right + 14;
      if (vis(R)) i.r = window.innerWidth - R.getBoundingClientRect().left + 14;
      i.t = T.getBoundingClientRect().bottom + 6;
      i.b = window.innerHeight - S.getBoundingClientRect().top + 8;
    }
    this.app.stage.setInsets(i);
  }

  build() {
    const seg = this.q('#seg-scn');
    for (const s of this.app.meta.scenarios) {
      const b = document.createElement('button');
      b.dataset.v = s.id;
      b.textContent = s.id;
      b.title = s.name;
      seg.appendChild(b);
    }
    this.camButtons = this.qa('#seg-cam button');
    this.app.rig.onChange((m) => this.markSeg('#seg-cam', m));
    this.markSeg('#seg-cam', this.app.rig.mode);
  }

  markSeg(sel, v) {
    this.qa(`${sel} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }

  // ---------------------------------------------------------------- bind
  bind() {
    const a = this.app, d = a.director;
    this.q('#seg-scn').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      a.sfx.click();
      this.setMode('normal');
      d.loadScenario(a.meta.scenarios.find((s) => s.id === b.dataset.v));
    });
    this.q('#seg-algo').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.setAlgo(b.dataset.v);
    });
    this.q('#seg-heur').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.setHeur(b.dataset.v);
    });
    this.q('#seg-cam').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) a.rig.setMode(b.dataset.v);
    });
    this.q('#seg-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.setMode(b.dataset.v);
    });
    this.q('#speed').addEventListener('input', (e) => {
      d.speed = parseFloat(e.target.value);
      this.q('#speed-val').textContent = `${d.speed.toFixed(1)}×`;
    });
    this.q('#quality').addEventListener('change', (e) => a.stage.setQuality(e.target.value));
    this.qa('[data-tgl]').forEach((el) => el.addEventListener('click', () => this.toggle(el.dataset.tgl, el)));
    this.q('#btn-start').addEventListener('click', () => this.startPressed());
    this.q('#btn-step').addEventListener('click', () => d.stepOnce());
    this.q('#btn-reset').addEventListener('click', () => {
      a.sfx.click();
      this.hideResult();
      d.resetRun();
    });
    this.q('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.tab(b.dataset.tab);
    });
    this.qa('[data-act]').forEach((el) => el.addEventListener('click', () => this.action(el.dataset.act)));
    this.qa('[data-close]').forEach((el) => el.addEventListener('click', () => this.q('#' + el.dataset.close).classList.remove('open')));
    this.qa('.modal').forEach((m) => m.addEventListener('pointerdown', (e) => { if (e.target === m) m.classList.remove('open'); }));
    window.addEventListener('keydown', (e) => this.onKey(e));
    // rampingkan pointer pada panel agar tidak memutar kamera
    ['wheel'].forEach((ev) => this.root.querySelectorAll('.panel').forEach((p) => p.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })));
  }

  toggle(key, el) {
    const a = this.app, d = a.director;
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    a.sfx.click();
    if (key === 'grid') a.room.setGridVisible(on);
    else if (key === 'heat') a.viz.setHeatEnabled(on);
    else if (key === 'route') a.viz.setRouteEnabled(on);
    else if (key === 'lidar') a.lidar.setEnabled(on);
    else if (key === 'sound') a.sfx.setEnabled(on);
    else if (key === 'step') d.stepMode = on;
    else if (key === 'autocam') d.autoCam = on;
  }

  setAlgo(v, silent = false) {
    const d = this.app.director;
    d.algo = v;
    this.markSeg('#seg-algo', v);
    this.q('#algo-note').innerHTML = ALGO_NOTE[v] ?? '';
    this.q('#sec-heur').classList.toggle('hidden', !['astar', 'greedy'].includes(v));
    if (!silent) {
      this.app.sfx.click();
      this.hideResult();
      d.resetRun();
    }
  }

  setHeur(v, silent = false) {
    const d = this.app.director;
    d.heur = v;
    this.markSeg('#seg-heur', v);
    this.q('#heur-note').innerHTML = HEUR_NOTE[v] ?? '';
    if (!silent) {
      this.app.sfx.click();
      this.hideResult();
      d.resetRun();
    }
  }

  setMode(m) {
    if (m === this.mode) return;
    const a = this.app;
    if (this.mode === 'editor') a.editor?.setActive(false);
    if (this.mode === 'game') a.game?.setActive(false);
    this.mode = m;
    this.markSeg('#seg-mode', m);
    this.q('#mode-extra').innerHTML = '';
    this.hideResult();
    if (m === 'editor') a.editor?.setActive(true, this.q('#mode-extra'));
    if (m === 'game') a.game?.setActive(true, this.q('#mode-extra'));
    a.sfx.click();
  }

  tab(name) {
    this.qa('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    this.qa('.tab').forEach((t) => t.classList.toggle('on', t.id === `tab-${name}`));
  }

  startPressed() {
    const d = this.app.director;
    this.app.sfx.ensure();
    this.hideResult();
    if (this.mode === 'game') return;
    if (d.state === 'paused') d.resume();
    else if (['executing', 'formulating', 'searching', 'planned'].includes(d.state)) d.pause();
    else d.start();
  }

  action(act) {
    const a = this.app;
    if (act === 'lab') this.openLab();
    else if (act === 'about') this.q('#modal-about').classList.add('open');
    else if (act === 'hide') document.body.classList.toggle('clean');
    else if (act === 'fullscreen') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } else if (act === 'shot') this.photo();
  }

  async photo() {
    const a = this.app;
    const url = a.stage.capture();
    const name = `cleanbot-${a.director.scn.id}-${a.director.algo}-${Date.now()}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
    this.subtitle('Gambar disimpan ke folder Unduhan.', 'ok');
    saveScreenshot(name, url).catch(() => {});
  }

  onKey(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = this.app, d = a.director;
    const k = e.key.toLowerCase();
    if (this.mode === 'game' && a.game?.handleKey(e)) return;
    if (k === ' ') { e.preventDefault(); this.startPressed(); }
    else if (k === 'r') { this.hideResult(); d.resetRun(); }
    else if (k === 's') d.stepOnce();
    else if (k >= '1' && k <= '5') a.rig.setMode(['overview', 'top', 'follow', 'fpv', 'cinema'][+k - 1]);
    else if (k === 'g') this.qa('[data-tgl="grid"]')[0].click();
    else if (k === 'l') this.qa('[data-tgl="lidar"]')[0].click();
    else if (k === 'm') this.qa('[data-tgl="sound"]')[0].click();
    else if (k === 'h') document.body.classList.toggle('clean');
    else if (k === 'p') this.photo();
    else if (k === 'escape') this.qa('.modal.open').forEach((m) => m.classList.remove('open'));
    else if (k === '+' || k === '=') this.bumpSpeed(0.5);
    else if (k === '-') this.bumpSpeed(-0.5);
  }

  bumpSpeed(delta) {
    const el = this.q('#speed');
    el.value = clamp(parseFloat(el.value) + delta, 0.5, 4);
    el.dispatchEvent(new Event('input'));
  }

  // ----------------------------------------------------------- director
  bindDirector() {
    const d = this.app.director;
    d.on('scenario', (s) => this.onScenario(s));
    d.on('state', (s) => this.onState(s));
    d.on('stage', (n) => this.onStage(n));
    d.on('toast', ({ text, kind }) => this.subtitle(text, kind));
    d.on('plan', (p) => this.onPlan(p));
    d.on('search-progress', (p) => this.onSearch(p));
    d.on('step', (e) => this.onStep(e));
    d.on('reset', () => this.onReset());
    d.on('result', (r) => this.showResult(r));
    d.on('focus-formulation', () => this.focusFormulation());
    d.on('paused', () => {});
  }

  onScenario(s) {
    this.markSeg('#seg-scn', s.pristine === false ? '' : s.scenarioId ?? s.id);
    this.q('#scn-name').textContent = s.pristine === false ? `${s.name} (diubah)` : s.name;
    this.q('#scn-desc').textContent = `${s.width}×${s.height} sel · ${s.targets.length} target · ${s.obstacles.length} sel rintangan. ${s.description ?? ''}`;
    this.q('#scn-tag').textContent = s.note || '';
    this.q('#env-text').textContent = `Ruang kelas ${s.width}×${s.height} m, ${s.obstacles.length} sel terisi perabot, ${s.targets.length} titik kotoran, titik awal di (${s.start[0]},${s.start[1]}).`;
    this.q('#pf-clean').textContent = `0/${s.targets.length}`;
    this.renderState({ pos: s.start, remaining: s.targets.map((t) => t.id) }, { g: 0, h: null, f: null, action: null });
  }

  onState(s) {
    const btn = this.q('#btn-start');
    const label = { idle: '▶ Mulai', formulating: '⏸ Jeda', searching: '⏸ Jeda', planned: '⏸ Jeda', executing: '⏸ Jeda', paused: '▶ Lanjutkan', done: '↺ Ulangi', error: '↺ Coba lagi' }[s] ?? '▶ Mulai';
    btn.textContent = label;
    const modeLabel = { idle: 'siaga', formulating: 'merumuskan', searching: 'berpikir', planned: 'siap jalan', executing: 'bergerak', paused: 'jeda', done: 'selesai', error: 'siaga (galat)' }[s];
    this.q('#ac-mode').textContent = modeLabel ?? s;
  }

  onStage(n) {
    this.qa('.step').forEach((el) => {
      const i = +el.dataset.s;
      el.classList.toggle('active', n >= 1 && Math.floor(n) === i && !(n === 5));
      el.classList.toggle('done', n > i || (n === 5 && i <= 5));
      if (n === 5 && i === 5) el.classList.add('active');
    });
    if (n === 0) this.qa('.step').forEach((el) => el.classList.remove('active', 'done'));
  }

  subtitle(text, kind = 'info') {
    const el = this.q('#subtitle');
    el.textContent = text;
    el.className = `subtitle show ${kind}`;
    clearTimeout(this._st);
    this._st = setTimeout(() => el.classList.remove('show'), kind === 'info' ? 6500 : 9000);
  }

  focusFormulation() {
    this.tab('masalah');
    const comps = this.qa('.comp');
    comps.forEach((c, i) => {
      setTimeout(() => c.classList.add('flash'), i * 260);
      setTimeout(() => c.classList.remove('flash'), i * 260 + 700);
    });
  }

  onPlan(p) {
    const s = p.stats;
    this.q('#st-time').textContent = s.time_ms.toFixed(2);
    this.q('#st-cost').textContent = s.cost;
    this.q('#st-moves').textContent = s.moves;
    this.q('#st-clean').textContent = s.cleans;
    this.q('#st-space').textContent = `dari ≤ ${s.state_space} state`;
    this.q('#st-frontier').textContent = `frontier maks ${s.max_frontier}`;
    this.q('#st-optimal').textContent = s.optimal_guarantee ? 'optimal ✓ (terjamin)' : 'tanpa jaminan optimal';
    this.q('#st-expanded').textContent = '0';
    this.q('#st-generated').textContent = '0';
    this.q('#metrik-note').innerHTML = `<b>${p.label}</b> memeriksa <b>${s.expanded}</b> state dan membangkitkan <b>${s.generated}</b> state untuk menemukan rencana berbiaya <b>${s.cost}</b>.`;
    const list = this.q('#plan-list');
    list.innerHTML = [...p.actions].map((a, i) => `<span class="a ${a === 'C' ? 'c' : ''}" data-i="${i}" title="${ACTION_LABEL[a]}">${ACTION_GLYPH[a]}</span>`).join('');
    this.q('#order-line').innerHTML = p.order.length ? `Urutan kunjungan: <b>${p.order.join(' → ')}</b> → titik awal` : '';
    this.tab('metrik');
  }

  onSearch({ k, n, plan }) {
    const s = plan.stats;
    this.q('#st-expanded').textContent = Math.round(k * s.expanded);
    this.q('#st-generated').textContent = Math.round(k * s.generated);
    this.q('#search-meter').style.width = `${Math.round(k * 100)}%`;
  }

  onStep(ev) {
    this.renderState(ev.state, ev);
    const list = this.q('#plan-list');
    [...list.children].forEach((c, i) => {
      c.classList.toggle('done', i < ev.index);
      c.classList.toggle('cur', i === ev.index);
    });
    const cur = list.children[ev.index];
    if (cur) cur.scrollIntoView?.({ block: 'nearest' });
    const total = this.app.director.scn.targets.length - (this.app.director.plan?.skipped?.length ?? 0);
    const cleaned = total - ev.state.remaining.length;
    this.q('#pf-clean').textContent = `${cleaned}/${total}`;
    this.q('#pf-cost').textContent = ev.g;
  }

  setPerformance(cleaned, total, cost) {
    this.q('#pf-clean').textContent = `${cleaned}/${total}`;
    this.q('#pf-cost').textContent = cost;
  }

  renderState(st, ev) {
    const d = this.app.director;
    const rem = st.remaining.length ? `{${st.remaining.join(', ')}}` : '{}';
    this.q('#state-line').textContent = `s = ((${st.pos[0]}, ${st.pos[1]}), ${rem})`;
    this.q('#g-val').textContent = ev.g ?? 0;
    this.q('#h-val').textContent = ev.h == null ? '–' : ev.h;
    this.q('#f-val').textContent = ev.f == null ? '–' : ev.f;
    this.q('#se-pos').textContent = `(${st.pos[0]}, ${st.pos[1]})`;
    const blocked = d.sensorsAt(st.pos);
    this.q('#se-dirs').innerHTML = ['U', 'R', 'D', 'L'].map((k) => `<i class="${blocked[k] ? 'blocked' : ''}">${ACTION_GLYPH[k]}</i>`).join('');
    const dust = d.scn.targets.some((t) => t.x === st.pos[0] && t.y === st.pos[1] && st.remaining.includes(t.id));
    const el = this.q('#se-dust');
    el.textContent = dust ? 'ADA kotoran' : 'tidak ada';
    el.className = `pill ${dust ? 'warn' : ''}`;
    const act = this.q('#ac-action');
    act.textContent = ev.action ? `${ACTION_GLYPH[ev.action]} ${ACTION_LABEL[ev.action]}` : '—';
    act.className = `pill ${ev.action === 'C' ? 'ok' : ''}`;
  }

  onReset() {
    this.q('#st-expanded').textContent = '–';
    this.q('#st-generated').textContent = '–';
    this.q('#st-time').textContent = '–';
    this.q('#st-cost').textContent = '–';
    this.q('#st-moves').textContent = '–';
    this.q('#st-clean').textContent = '–';
    this.q('#st-space').textContent = '';
    this.q('#st-frontier').textContent = '';
    this.q('#st-optimal').textContent = '';
    this.q('#search-meter').style.width = '0';
    this.q('#plan-list').innerHTML = '';
    this.q('#order-line').innerHTML = '';
    this.q('#metrik-note').textContent = 'Jalankan agen untuk melihat metrik pencarian.';
    const s = this.app.director.scn;
    this.q('#pf-clean').textContent = `0/${s.targets.length}`;
    this.q('#pf-cost').textContent = '0';
    this.renderState({ pos: s.start, remaining: s.targets.map((t) => t.id) }, { g: 0, h: null, f: null, action: null });
    this.onStage(0);
  }

  // ------------------------------------------------------------- hasil
  showCard(html, onAction, ms = 14000) {
    const el = this.q('#result');
    el.innerHTML = html;
    el.classList.add('show');
    el.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (b) onAction(b.dataset.r);
    };
    clearTimeout(this._rt);
    if (ms) this._rt = setTimeout(() => this.hideResult(), ms);
  }

  showResult({ plan, label }) {
    const s = plan.stats;
    const el = this.q('#result');
    el.innerHTML = `
      <div class="kick">MISI SELESAI</div>
      <h2>Kelas bersih!</h2>
      <p>${label} merencanakan rute yang membersihkan ${s.cleans} target lalu kembali ke titik awal.</p>
      <div class="stats">
        <div class="stat hero"><small>Total biaya</small><b>${s.cost}</b><span>${s.moves} gerak + ${s.cleans} bersih</span></div>
        <div class="stat"><small>State diperiksa</small><b>${s.expanded}</b><span>${s.time_ms.toFixed(2)} ms</span></div>
      </div>
      <div class="btns"><button class="btn primary" data-r="again">↺ Ulangi</button><button class="btn" data-r="lab">Bandingkan algoritma</button><button class="btn" data-r="close">Tutup</button></div>`;
    el.classList.add('show');
    el.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      if (b.dataset.r === 'again') { this.hideResult(); this.app.director.start(); }
      else if (b.dataset.r === 'lab') { this.hideResult(); this.openLab(); }
      else this.hideResult();
    };
    clearTimeout(this._rt);
    this._rt = setTimeout(() => this.hideResult(), 14000);
  }

  hideResult() {
    this.q('#result').classList.remove('show');
  }

  // --------------------------------------------------------------- lab
  async openLab() {
    const modal = this.q('#modal-lab');
    modal.classList.add('open');
    const body = this.q('#lab-body');
    if (!this.labData) {
      body.textContent = 'Menjalankan benchmark di server Python…';
      try {
        this.labData = await getBenchmark();
      } catch (e) {
        body.textContent = 'Gagal memuat benchmark: ' + e.message;
        return;
      }
    }
    const rows = this.labData.scenarios;
    const sids = [...new Set(rows.map((r) => r.scenario))];
    const maxE = Math.max(...rows.map((r) => r.expanded)) || 1;
    let html = '';
    for (const sid of sids) {
      const rs = rows.filter((r) => r.scenario === sid);
      html += `<h4 style="font:400 18px Georgia,serif;margin:14px 0 6px">${sid} · ${rs[0].scenario_name} <span style="font:11px 'Courier New';color:#a5a399">(ruang state ≤ ${rs[0].state_space})</span></h4><div class="bars">`;
      for (const r of rs) {
        if (r.config === 'nn') continue;
        const w = Math.max(1.5, (Math.log10(r.expanded + 1) / Math.log10(maxE + 1)) * 100);
        html += `<div class="bar-row"><span>${r.label}</span><div class="track"><div class="fill" style="width:${w}%;background:${ALGO_COLOR[r.config]}"></div></div><span>${r.expanded}</span></div>`;
      }
      html += '</div>';
    }
    html += `<table class="bench"><tr><th>Skenario / algoritma</th><th>Biaya</th><th>Gerak</th><th>Diperiksa</th><th>Dibangkitkan</th><th>ms</th><th>Selisih biaya</th></tr>`;
    for (const sid of sids) {
      const rs = rows.filter((r) => r.scenario === sid);
      html += `<tr class="grp"><td colspan="7">${sid} · ${rs[0].scenario_name}</td></tr>`;
      for (const r of rs) {
        html += `<tr class="${r.config === 'astar_mst' ? 'hl' : ''}"><td>${r.label}</td><td>${r.cost}</td><td>${r.moves}</td><td>${r.config === 'nn' ? '–' : r.expanded}</td><td>${r.config === 'nn' ? '–' : r.generated}</td><td>${r.time_ms.toFixed(2)}</td><td>${r.gap_pct == null ? '–' : (r.gap_pct > 0 ? '+' : '') + r.gap_pct + '%'}</td></tr>`;
      }
    }
    html += '</table><div class="lab-grid"><div><h4>Skalabilitas: state diperiksa</h4><canvas class="chart" id="ch-exp" width="860" height="480"></canvas></div><div><h4>Skalabilitas: waktu (ms)</h4><canvas class="chart" id="ch-time" width="860" height="480"></canvas></div></div>';
    html += `<p class="note">${isStatic() ? 'Mode statis (server tidak aktif) — memakai data tersimpan.' : 'Data dihitung langsung oleh server Python (median 3 kali jalan).'} Skalabilitas: denah acak 10×7, k = 2…9 target, rata-rata beberapa seed.</p>`;
    body.innerHTML = html;
    this.drawScaling('ch-exp', 'expanded');
    this.drawScaling('ch-time', 'time_ms');
  }

  drawScaling(id, key) {
    const cv = this.q('#' + id);
    if (!cv || !this.labData.scalability?.length) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, P = { l: 70, r: 20, t: 20, b: 50 };
    const want = ['bfs', 'ucs', 'astar_max', 'astar_mst'];
    const pts = this.labData.scalability.filter((p) => want.includes(p.config));
    const ks = [...new Set(pts.map((p) => p.k))].sort((a, b) => a - b);
    const vals = pts.map((p) => Math.max(1e-3, p[key]));
    const lo = Math.floor(Math.log10(Math.min(...vals))), hi = Math.ceil(Math.log10(Math.max(...vals)));
    const X = (k) => P.l + ((k - ks[0]) / (ks[ks.length - 1] - ks[0] || 1)) * (W - P.l - P.r);
    const Y = (v) => H - P.b - ((Math.log10(Math.max(1e-3, v)) - lo) / (hi - lo || 1)) * (H - P.t - P.b);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '22px "Courier New"';
    ctx.fillStyle = '#a5a399';
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 1;
    for (let e = lo; e <= hi; e++) {
      const y = Y(10 ** e);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
      ctx.fillText(`10^${e}`, 8, y + 7);
    }
    ks.forEach((k) => ctx.fillText(String(k), X(k) - 6, H - 18));
    ctx.fillText('jumlah target (k)', W / 2 - 90, H - 0);
    for (const c of want) {
      const line = pts.filter((p) => p.config === c).sort((a, b) => a.k - b.k);
      ctx.strokeStyle = ALGO_COLOR[c];
      ctx.lineWidth = c === 'astar_mst' ? 5 : 3;
      ctx.beginPath();
      line.forEach((p, i) => (i ? ctx.lineTo(X(p.k), Y(p[key])) : ctx.moveTo(X(p.k), Y(p[key]))));
      ctx.stroke();
      ctx.fillStyle = ALGO_COLOR[c];
      line.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.k), Y(p[key]), 5, 0, Math.PI * 2); ctx.fill(); });
    }
    let lx = P.l + 10;
    for (const c of want) {
      ctx.fillStyle = ALGO_COLOR[c];
      ctx.fillRect(lx, 12, 22, 8);
      ctx.fillStyle = '#d8d6cc';
      const name = { bfs: 'BFS', ucs: 'UCS', astar_max: 'A* (max)', astar_mst: 'A* (MST)' }[c];
      ctx.fillText(name, lx + 28, 24);
      lx += 40 + ctx.measureText(name).width + 24;
    }
  }
}
