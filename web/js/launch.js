// Mode video peluncuran (?launch=live untuk pratinjau, ?launch=1 dikendalikan tools/record_launch.py): panggung studio,
// rig kamera berbasis waktu, dan anotasi (titik + gelembung penjelasan). Semua keadaan visual adalah fungsi dari waktu
// timeline `t` (lewat launch.frame(t, dt)) sehingga hasilnya deterministik.
import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { clamp, damp, lerp } from './utils.js';

// ------------------------------------------------------------------ utilitas
const sm = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }; // smootherstep (C2)
const eo = (x) => { x = clamp(x, 0, 1); return 1 - (1 - x) * (1 - x) * (1 - x); }; // ease-out kubik
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const win = (t, a, b, fin = 0.5, fout = 0.45) => sm(seg(t, a, a + fin)) * (1 - sm(seg(t, b - fout, b)));
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ jadwal (detik)
const T = {
  toClass: 13.0, // pergantian studio -> kelas (layar hitam)
  runStart: 13.1, // agen mulai merencanakan
  follow: [15.7, 17.1], // peralihan kamera lebar -> ikuti robot
  jump: 21.5, // lompat (fast-forward) ke keadaan selesai
};

function dipAt(t) {
  let o = 1 - sm(seg(t, 0.0, 1.25)); // fade-in dari hitam
  o = Math.max(o, sm(seg(t, 12.35, 12.95)) * (1 - sm(seg(t, 13.25, 13.95)))); // studio -> kelas
  o = Math.max(o, sm(seg(t, 20.8, 21.35)) * (1 - sm(seg(t, 21.6, 22.2)))); // lompat ke selesai
  o = Math.max(o, sm(seg(t, 29.35, 30.0))); // fade-out akhir
  return o;
}

// Kunci kamera babak 1 relatif terhadap robot. az = derajat dari +X (depan robot) menuju +Z (sisi kanan robot).
// Kolom: [detik, az, el, jarak, target(x,y,z), fov, geser-layar(fraksi lebar; + = subjek ke kanan)]
const K1 = [
  [0.0, -26, 4, 5.4, [0.04, 0.29, 0], 24, 0.1],
  [2.7, 28, 11, 2.35, [0.02, 0.27, 0], 24, 0.17], // hero + pin
  [3.5, 14, 15, 1.3, [-0.1, 0.45, 0], 24, -0.15], // LiDAR (tiba)
  [5.0, 30, 18, 1.1, [-0.1, 0.46, 0], 24, -0.15], // LiDAR (akhir)
  [5.55, 22, 11, 2.2, [0.02, 0.28, 0], 24, 0.0], // zoom-out: seluruh robot
  [6.15, 9, 4, 1.5, [0.27, 0.28, 0], 24, 0.17], // wajah (tiba)
  [7.5, -6, 5, 1.38, [0.27, 0.28, 0], 24, 0.17], // wajah (akhir)
  [8.0, 20, 10, 2.1, [0.12, 0.22, 0.06], 24, 0.0], // zoom-out
  [8.5, 50, 14, 1.08, [0.27, 0.07, 0.12], 24, -0.15], // sikat (tiba)
  [10.0, 66, 16, 0.96, [0.27, 0.07, 0.12], 24, -0.15], // sikat (akhir)
  [10.45, 80, 9, 2.0, [0.1, 0.18, 0.15], 24, 0.0], // zoom-out
  [10.95, 92, 4, 1.16, [-0.05, 0.1, 0.31], 24, 0.16], // roda (tiba)
  [12.4, 104, 6, 1.0, [-0.05, 0.1, 0.31], 24, 0.16], // roda (akhir)
  [13.0, 78, 10, 3.0, [0, 0.25, 0], 24, 0.0], // mundur saat layar hitam
].map(([t, az, el, r, g, fov, shift]) => ({ t, v: [az, el, r, g[0], g[1], g[2], fov, shift] }));

// Kunci kamera babak 2 (koordinat dunia). Kolom: [detik, posisi, target, fov]
const KC1 = [
  [13.2, [3.6, 8.8, 13.6], [-0.2, 0.3, 0.3], 30],
  [16.0, [1.6, 6.2, 10.0], [-1.1, 0.3, 0.9], 30],
].map(([t, p, g, fov]) => ({ t, v: [...p, ...g, fov] }));
const KC2 = [
  [21.6, [5.4, 7.4, 11.2], [0.0, 0.2, 0.3], 34],
  [30.0, [8.6, 10.6, 15.4], [0.0, 0.2, 0.3], 34],
].map(([t, p, g, fov]) => ({ t, v: [...p, ...g, fov] }));

/** Spline kardinal (Hermite): kecepatan kontinu di tiap kunci -> gerak kamera mengalir tanpa berhenti-jalan. */
function spline(keys, t, tension = 0.35) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const h = b.t - a.t, u = (t - a.t) / h;
  const slope = (k, j) => {
    if (j === 0 || j === n - 1) return 0;
    return ((1 - tension) * (keys[j + 1].v[k] - keys[j - 1].v[k])) / (keys[j + 1].t - keys[j - 1].t);
  };
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return a.v.map((_, k) => h00 * a.v[k] + h10 * h * slope(k, i) + h01 * b.v[k] + h11 * h * slope(k, i + 1));
}

// ------------------------------------------------------------------ konten anotasi
const CALLOUTS = [
  { id: 'lidar', n: '01', col: '#27d4ff', tag: 'Sensor', title: 'LiDAR 2D', label: 'LiDAR', body: '<u>120 sinar</u> memindai rintangan hingga <u>4,2 m</u>.',
    space: 'robot', anchor: [-0.1, 0.5, 0], pin: [2.0, 3.1], pinSide: 'r', card: [3.2, 5.3], side: 'r', dx: 360, dy: -20 },
  { id: 'face', n: '02', col: '#7DB5F0', tag: 'Antarmuka', title: 'Wajah ekspresif', label: 'Wajah', body: '<u>6 ekspresi</u> menampilkan keadaan agen secara langsung.',
    space: 'robot', anchor: [0.28, 0.3, 0.07], pin: [2.0, 3.1], pinSide: 'r', card: [5.8, 7.9], side: 'l', dx: 330, dy: -30 },
  { id: 'brush', n: '03', col: '#9BD67A', tag: 'Pembersih', title: 'Sikat & penghisap', label: 'Sikat', body: 'Sikat dan roller berputar <u>lebih cepat</u> saat membersihkan.',
    space: 'robot', anchor: [0.27, 0.075, 0.19], pin: [2.0, 3.1], pinSide: 'l', card: [8.2, 10.3], side: 'r', dx: 340, dy: -90 },
  { id: 'wheel', n: '04', col: '#FF9466', tag: 'Penggerak', title: 'Roda bertapak karet', label: 'Roda', body: 'Bodi <u>miring halus</u> saat berakselerasi.',
    space: 'robot', anchor: [-0.05, 0.1, 0.36], pin: [2.0, 3.1], pinSide: 'l', card: [10.7, 12.5], side: 'l', dx: 340, dy: -60 },
  { id: 'astar', n: '05', col: '#FF9466', tag: 'Otak AI', title: 'A* menyusun rute', body: 'Biaya <u>38 aksi</u> (optimal). <u>96 state</u> diperiksa; BFS: 3.254.',
    space: 'world', anchor: [-2.0, 0.05, 1.5], card: [13.9, 16.5], side: 'r', dx: 320, dy: -150 },
  { id: 'exec', n: '06', col: '#9BD67A', tag: 'Eksekusi', title: 'Presisi tinggi', body: '<u>32 langkah</u> sesuai rencana, <u>6 target</u> bersih.',
    space: 'robot', anchor: [0, 0.5, 0], card: [17.0, 20.6], side: 'r', dx: 300, dy: -150 },
];

const STATS = [
  { num: '33,9', small: '×', lab: 'lebih sedikit state daripada BFS', col: '#FF9466' },
  { num: '0,6', small: 'ms', lab: 'waktu perencanaan A* (S4)', col: '#7DB5F0' },
  { num: '0', small: '', lab: 'tabrakan · 20 dari 20 uji lulus', col: '#9BD67A' },
];

const ICON = '<svg class="ic" viewBox="0 0 64 64"><rect x="9" y="12" width="46" height="36" rx="9" fill="#D97757" stroke="#fff" stroke-width="3"/><path d="M22 25l9 6-9 6M42 25l-9 6 9 6" stroke="#141413" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="17" y="48" width="9" height="11" rx="2" fill="#D97757" stroke="#fff" stroke-width="2.5"/><rect x="38" y="48" width="9" height="11" rx="2" fill="#D97757" stroke="#fff" stroke-width="2.5"/></svg>';

// ------------------------------------------------------------------ modul utama
export async function initLaunch(app) {
  const { stage, robot, room, director } = app;
  const scene = stage.scene, camera = stage.camera;
  const L = { t: 0, act: 1, ffRequested: false, ffDone: false, ffActive: false, runT0: null, execSpeedSet: false, events: [], log: [] };
  window.launch = L;

  document.body.classList.add('launch');
  // muat stylesheet dulu: ukuran kartu diukur setelah gaya berlaku
  await new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/launch.css';
    css.onload = css.onerror = resolve;
    document.head.appendChild(css);
  });

  // kamera bebas: kendali penuh milik modul ini
  app.rig.setMode('free', { duration: 0 });
  stage.controls.enabled = false;
  camera.near = 0.04;

  const P0 = robot.group.position.clone(); // titik awal robot (dok) = pusat studio
  const vw = () => window.innerWidth, vh = () => window.innerHeight; // viewport nyata (kamera)
  const K = () => window.innerHeight / 1080; // skala overlay: tata letak dirancang untuk tinggi 1080 px
  const ow = () => window.innerWidth / K(), oh = () => 1080; // ukuran overlay dalam px virtual
  director.on('state', (s) => L.log.push(`${L.t.toFixed(2)} ${s}`));

  // ============================================================== studio
  const saved = { bg: scene.background, env: scene.environmentIntensity, hemi: stage.hemi.intensity, sunI: stage.sun.intensity, sunC: stage.sun.color.clone(), vis: new Map() };
  const studio = new THREE.Group(); // statis di dunia: lantai, partikel
  studio.position.copy(P0);
  scene.add(studio);
  const rig = new THREE.Group(); // mengikuti robot: lampu, cincin, kipas LiDAR
  scene.add(rig);

  const radialTex = (stops, size = 512, srgb = true) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // latar belakang: gradasi radial gelap
  const bgTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 576;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(560, 250, 20, 512, 300, 720);
    g.addColorStop(0, '#2a2d35');
    g.addColorStop(0.45, '#14161b');
    g.addColorStop(1, '#040405');
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 576);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  // lantai glossy bergaris halus (agar gerak robot terbaca) dengan tepi memudar
  const gridTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#0c0d11';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#2a2f39';
    x.lineWidth = 3;
    x.strokeRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 36); // 0,5 m per kotak
    tex.anisotropy = stage.renderer.capabilities.getMaxAnisotropy();
    return tex;
  })();
  const floorAlpha = radialTex([[0, '#fff'], [0.5, '#d0d0d0'], [0.82, '#303030'], [1, '#000']]);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 128),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: gridTex, roughness: 0.42, metalness: 0.15, transparent: true, opacity: 0.92, alphaMap: floorAlpha, depthWrite: false, envMap: scene.environment, envMapIntensity: 0.18 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.0005;
  floor.receiveShadow = true;
  floor.renderOrder = 2;
  floor.userData.noAO = true;
  floor.userData.dofDepth = true;
  studio.add(floor);

  // cincin tipis bercahaya di lantai (aksen)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.628, 160),
    new THREE.MeshBasicMaterial({ color: 0x27d4ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  ring.renderOrder = 3;
  ring.userData.noAO = true;
  rig.add(ring);

  // kolam cahaya lembut di bawah robot
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 64),
    new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(190,210,255,.13)'], [0.5, 'rgba(190,210,255,.05)'], [1, 'rgba(190,210,255,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.0015;
  pool.renderOrder = 3;
  pool.userData.noAO = true;
  rig.add(pool);

  // kipas pindai LiDAR + cincin gema di lantai
  const sweepGeo = (R, arc, n = 72) => {
    const pos = [0, 0, 0], aA = [1], aR = [0], idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, th = -arc * (1 - u);
      pos.push(Math.cos(th) * R, 0, -Math.sin(th) * R);
      aA.push(u); aR.push(1);
      if (i > 0) idx.push(0, i, i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 1));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
    g.setIndex(idx);
    return g;
  };
  const sweepMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x27d4ff) }, uOp: { value: 0 } },
    vertexShader: 'attribute float aA; attribute float aR; varying float vA; varying float vR; void main(){ vA = aA; vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying float vA; varying float vR; void main(){ float u = clamp(vA, 0.0, 1.0); float r = clamp(vR, 0.0, 1.0); float a = pow(u, 2.6) * (1.0 - 0.6 * r) * 0.26 + smoothstep(0.985, 1.0, u) * 0.5; gl_FragColor = vec4(uColor * 1.15, clamp(a * uOp, 0.0, 1.0)); }',
  });
  const sweep = new THREE.Mesh(sweepGeo(1.7, 1.15), sweepMat);
  sweep.position.y = 0.006;
  sweep.renderOrder = 4;
  sweep.userData.noAO = true;
  rig.add(sweep);
  const echoes = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 160), new THREE.MeshBasicMaterial({ color: 0x27d4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.005;
    m.renderOrder = 4;
    m.userData.noAO = true;
    rig.add(m);
    return m;
  });

  // lampu: kunci (softbox) + lampu tepi berwarna rendah agar pantulan di atap tidak silau (tanpa spot: tidak ada kilap titik)
  const key = new THREE.RectAreaLight(0xf3f6ff, 12, 1.8, 1.8);
  key.position.set(0.7, 3.0, 1.3);
  key.lookAt(0, 0.2, 0);
  const rimC = new THREE.RectAreaLight(0x35d6ff, 1.3, 1.8, 0.6);
  rimC.position.set(-1.6, 0.9, -2.0);
  rimC.lookAt(0, 0.3, 0);
  const rimO = new THREE.RectAreaLight(0xff9460, 3, 2.2, 0.9);
  rimO.position.set(2.4, 0.9, -1.6);
  rimO.lookAt(0, 0.3, 0);
  rig.add(key, rimC, rimO);
  L.lights = { key, rimC, rimO, floor, ring, pool, sweep, echoes, sun: stage.sun }; // pegangan untuk menyetel saat uji

  // partikel debu halus (bokeh), statis di dunia agar gerak robot terlihat berparalaks
  const dotTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']], 128);
  const bokeh = [];
  const rng = (() => { let s = 1337; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  for (const [size, count, op] of [[0.05, 70, 0.55], [0.1, 44, 0.4], [0.2, 22, 0.22]]) {
    const geo = new THREE.BufferGeometry();
    const base = new Float32Array(count * 3), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, r = 0.7 + rng() * 4.6;
      base.set([Math.cos(a) * r + 0.6, 0.08 + rng() * 2.6, Math.sin(a) * r], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: dotTex, size, sizeAttenuation: true, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xc7e7ff });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.noAO = true;
    studio.add(pts);
    bokeh.push({ pts, base, pos, count, ph: rng() * 6 });
  }

  // pantulan lantai: salinan robot yang dicerminkan (disinkronkan tiap frame)
  const mirror = new THREE.Group();
  const mTilt = robot.tilt.clone(true);
  mTilt.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noAO = true; } });
  mirror.add(mTilt);
  mirror.scale.y = -1;
  scene.add(mirror);
  const mParts = ['Wheel_L', 'Wheel_R', 'SideBrush_L', 'SideBrush_R', 'MainBrush', 'LidarTurret'].map((n) => [n, mTilt.getObjectByName(n), robot.model.getObjectByName(n)]);

  // ---- masuk / keluar studio
  function enterStudio() {
    L.act = 1;
    scene.children.forEach((o) => {
      if (o === robot.group || o === studio || o === rig || o === mirror || o.isLight || o === stage.sun.target) return;
      saved.vis.set(o, o.visible);
      o.visible = false;
    });
    scene.background = bgTex;
    scene.environmentIntensity = 0.5;
    stage.hemi.intensity = 0.06;
    stage.sun.color.set(0xfff0dc);
    stage.sun.intensity = 0.5;
    const dir = new THREE.Vector3(-0.55, 0.85, 0.75).normalize();
    stage.sun.position.copy(P0).addScaledVector(dir, 9);
    stage.sun.target.position.copy(P0);
    const sc = stage.sun.shadow.camera;
    sc.left = -2.6; sc.right = 2.6; sc.top = 2.6; sc.bottom = -2.6; sc.near = 3; sc.far = 18;
    sc.updateProjectionMatrix();
    studio.visible = true;
    rig.visible = true;
    mirror.visible = true;
    robot.setMode('idle');
  }

  function leaveStudio() {
    saved.vis.forEach((v, o) => { o.visible = v; });
    scene.background = saved.bg;
    scene.environmentIntensity = saved.env;
    stage.hemi.intensity = saved.hemi;
    stage.sun.color.copy(saved.sunC);
    stage.sun.intensity = saved.sunI;
    stage.fitToRoom(room.W, room.H);
    studio.visible = false;
    rig.visible = false;
    mirror.visible = false;
    L.act = 2;
    director.resetRun();
    robot.setMode('idle');
  }

  // kedalaman bidang (hanya babak studio): fokus selalu ke robot, latar & lantai jauh melembut
  const dof = new BokehPass(scene, camera, { focus: 1.2, aperture: 0.0045, maxblur: 0.014 });
  {
    const comp = stage.composer;
    const ib = stage.bloomPass ? comp.passes.indexOf(stage.bloomPass) : comp.passes.length - 1;
    comp.insertPass(dof, ib);
  }
  L.dof = dof;
  {
    const baseRender = dof.render.bind(dof);
    dof.render = function (...args) {
      const hidden = [];
      scene.traverse((o) => {
        if (!o.visible || o.userData.dofDepth) return;
        const m = o.material;
        const skip = o.isSprite || o.isPoints || o.isLine || (m && !Array.isArray(m) && ((m.transparent && m.opacity < 0.99) || m.colorWrite === false || m.blending === THREE.AdditiveBlending));
        if (skip && (o.isMesh || o.isSprite || o.isPoints || o.isLine)) { hidden.push(o); o.visible = false; }
      });
      baseRender(...args);
      for (const o of hidden) o.visible = true;
    };
  }

  // ============================================================== overlay DOM
  const root = document.createElement('div');
  root.id = 'lv-root';
  root.innerHTML = '<div class="lv-layer" id="lv-vig"></div><svg id="lv-lines"></svg>';
  document.body.appendChild(root);
  const svg = root.querySelector('#lv-lines');
  const mk = (cls, html = '', parent = root) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };

  const parseBody = (s) => { const out = []; s.split(/(<u>.*?<\/u>)/).forEach((p) => { if (!p) return; const m = p.match(/^<u>(.*)<\/u>$/); out.push(m ? { t: m[1], hl: true } : { t: p, hl: false }); }); return out; };
  const typed = (segs, n) => { let left = n, h = ''; for (const s of segs) { if (left <= 0) break; const part = s.t.slice(0, left); left -= part.length; h += s.hl ? `<u>${part}</u>` : part; } return h; };

  for (const c of CALLOUTS) {
    c.segs = parseBody(c.body);
    c.len = c.segs.reduce((a, s) => a + s.t.length, 0);
    c.dotEl = mk('lv-dot', '<b></b><i></i>');
    c.dotEl.style.setProperty('--c', c.col);
    if (c.pin) { c.pinEl = mk('lv-pin', `<em>${c.n}</em>${c.label}`); c.pinEl.style.setProperty('--c', c.col); }
    c.cardEl = mk(`lv-card ${c.side}`, `<div class="hd">${ICON}<span class="tag">${c.tag}</span><span class="no">${c.n}</span></div><h4>${c.title}</h4><p></p><div class="lv-typing"><span></span><span></span><span></span></div>`);
    c.cardEl.style.setProperty('--c', c.col);
    c.p = c.cardEl.querySelector('p');
    c.typing = c.cardEl.querySelectorAll('.lv-typing span');
    c.typingEl = c.cardEl.querySelector('.lv-typing');
    c.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    c.path.setAttribute('stroke', c.col);
    c.path.setAttribute('stroke-width', '2.5');
    svg.appendChild(c.path);
    // ukur tinggi kartu dengan teks penuh agar tata letak tidak melompat saat mengetik
    c.p.innerHTML = typed(c.segs, 999);
    c.h = c.cardEl.offsetHeight;
    c.w = c.cardEl.offsetWidth;
    c.p.innerHTML = '';
    for (const e of [c.dotEl, c.pinEl, c.cardEl]) if (e) e.style.opacity = 0;
    c.path.style.opacity = 0;
    c.lastN = -1;
  }

  const titleEl = mk('lv-title', '<div class="kick">UAS ARTIFICIAL INTELLIGENCE · KELOMPOK 6</div><h1>CleanBot</h1><p>Robot pembersih kelas yang <b>berpikir</b> sebelum bergerak.</p>');
  const statsEl = mk('lv-stats', '');
  const statEls = STATS.map((s) => { const e = mk('lv-stat', `<div class="num">${s.num}<small>${s.small}</small></div><div class="lab">${s.lab}</div>`, statsEl); e.style.setProperty('--c', s.col); return e; });
  const shadeEl = mk('lv-layer', '', root); shadeEl.id = 'lv-shade';
  const outroEl = mk('lv-outro', `${ICON}<h2>CleanBot 3D</h2><div class="sub">Perencanaan rute robot pembersih dengan A*</div><div class="chips"><span>Python</span><span>Blender</span><span>three.js</span></div><div class="foot">KELOMPOK 6 · KELAS AI-D · UIN MALANG</div>`);
  const grainEl = mk('lv-layer', '', root); grainEl.id = 'lv-grain';
  grainEl.style.backgroundImage = (() => {
    // derau halus nol-rata-rata (titik putih/hitam beralfa kecil): melawan banding gradasi gelap pada H.264
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const im = x.createImageData(256, 256);
    let s = 99;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 256 * 256; i++) {
      const v = r() > 0.5 ? 255 : 0;
      im.data.set([v, v, v, Math.floor(r() * 7)], i * 4);
    }
    x.putImageData(im, 0, 0);
    return `url(${c.toDataURL()})`;
  })();
  const dipEl = mk('lv-layer', '', root); dipEl.id = 'lv-dip';

  // ============================================================== kamera
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _tgt = new THREE.Vector3();
  const follow = { tgt: new THREE.Vector3(), init: false };
  L.focus = 3; // jarak fokus (untuk kedalaman bidang bila diaktifkan)

  function updateCamera(t, dt) {
    let shift = 0;
    if (L.act === 1) {
      const s = spline(K1, Math.min(t, T.toClass));
      const base = robot.group.position;
      _tgt.set(base.x + s[3], base.y + s[4], base.z + s[5]);
      const az = s[0] * D2R, el = s[1] * D2R, r = s[2];
      camera.position.set(_tgt.x + r * Math.cos(el) * Math.cos(az), _tgt.y + r * Math.sin(el), _tgt.z + r * Math.cos(el) * Math.sin(az));
      camera.fov = s[6];
      shift = s[7];
    } else if (!L.ffDone) {
      const c1 = spline(KC1, Math.min(t, KC1[1].t), 0.0);
      const rp = robot.group.position;
      const u = sm(seg(t, T.follow[0], T.follow[1]));
      // pose ikuti: azimut tetap di dunia (berputar pelan), target mengikuti robot dengan redaman
      const az = (48 + (t - T.follow[0]) * 7) * D2R, el = 22 * D2R, r = 3.3;
      _w.set(rp.x, 0.24, rp.z);
      if (!follow.init) { follow.tgt.copy(_w); follow.init = true; }
      follow.tgt.set(damp(follow.tgt.x, _w.x, 5, dt), damp(follow.tgt.y, _w.y, 5, dt), damp(follow.tgt.z, _w.z, 5, dt));
      _v.set(follow.tgt.x + r * Math.cos(el) * Math.cos(az), follow.tgt.y + r * Math.sin(el), follow.tgt.z + r * Math.cos(el) * Math.sin(az));
      camera.position.set(lerp(c1[0], _v.x, u), lerp(c1[1], _v.y, u), lerp(c1[2], _v.z, u));
      _tgt.set(lerp(c1[3], follow.tgt.x, u), lerp(c1[4], follow.tgt.y, u), lerp(c1[5], follow.tgt.z, u));
      camera.fov = lerp(c1[6], 30, u);
    } else {
      const k = eo(seg(t, KC2[0].t, KC2[1].t));
      const c2 = KC2[0].v.map((a, i) => lerp(a, KC2[1].v[i], k));
      camera.position.set(c2[0], c2[1], c2[2]);
      _tgt.set(c2[3], c2[4], c2[5]);
      camera.fov = c2[6];
    }
    camera.lookAt(_tgt);
    L.focus = camera.position.distanceTo(_tgt);
    const apIn = L.act === 1 ? 0.0045 : L.ffDone ? 0 : 0.0042 * sm(seg(t, T.follow[0] + 0.3, T.follow[1]));
    dof.enabled = apIn > 1e-5 && !L.noDof;
    dof.uniforms.aperture.value = apIn;
    dof.uniforms.focus.value = L.focus;
    const W = vw(), H = vh();
    if (Math.abs(shift) > 1e-4) camera.setViewOffset(W, H, -shift * W, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  // ============================================================== robot & studio per frame
  function updateStudio(t) {
    if (L.act === 2) {
      const u = sm(seg(t, T.follow[0], T.follow[1]));
      for (const tg of app.litter.targets.values()) {
        tg.tag.visible = false;
        tg.badge.scale.multiplyScalar(Math.max(0.0001, 1 - u));
      }
      return;
    }
    if (L.act !== 1) return;
    // putaran halus & deterministik (mengganti hasil robot.update untuk bagian berputar)
    const p = robot.parts;
    const cleaning = t >= 7.9 && t < 12.9;
    p.lidar.rotation.y = t * 2.4;
    p.brushL.rotation.y = t * (cleaning ? 5.4 : 1.6);
    p.brushR.rotation.y = -t * (cleaning ? 5.4 : 1.6);
    p.main.rotation.z = -t * (cleaning ? 7.0 : 2.0);
    robot.glow.intensity *= 0.4; // pendar bawah robot lebih lembut di studio
    // mengemudi lurus pelan saat sorotan roda
    const d = 1.15 * sm(seg(t, 10.15, 13.0));
    robot.setPose(P0.x + d, P0.z, 0);
    // sinkron pantulan
    mirror.position.copy(robot.group.position);
    mirror.rotation.y = robot.group.rotation.y;
    mTilt.position.copy(robot.tilt.position);
    mTilt.rotation.copy(robot.tilt.rotation);
    for (const [, m, r] of mParts) if (m && r) m.rotation.copy(r.rotation);
    // lampu, cincin, dan kipas LiDAR mengikuti robot
    rig.position.set(robot.group.position.x, 0, robot.group.position.z);
    // kipas pindai LiDAR sinkron dengan menara sensor, tampil hanya saat sorotan LiDAR
    const sv = win(t, 2.6, 5.5, 0.6, 0.6);
    sweepMat.uniforms.uOp.value = sv;
    sweep.position.x = -0.1;
    sweep.rotation.y = t * 2.4;
    echoes.forEach((m, i) => {
      const ph = (t * 0.55 + i / 3) % 1;
      const r = 0.18 + ph * 1.55;
      m.scale.set(r, r, 1);
      m.position.x = -0.1;
      m.material.opacity = sv * 0.4 * Math.pow(1 - ph, 1.5) * sm(ph * 6);
    });
    // partikel debu
    for (const b of bokeh) {
      for (let i = 0; i < b.count; i++) {
        const k = b.ph + i * 1.7;
        b.pos[i * 3] = b.base[i * 3] + Math.sin(t * 0.21 + k) * 0.35;
        b.pos[i * 3 + 1] = b.base[i * 3 + 1] + Math.sin(t * 0.33 + k * 1.3) * 0.22;
        b.pos[i * 3 + 2] = b.base[i * 3 + 2] + Math.cos(t * 0.17 + k) * 0.35;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
    }
    ring.material.opacity = 0.3 + 0.12 * Math.sin(t * 1.6);
  }

  // ============================================================== overlay per frame
  function projectAnchor(c, out) {
    if (c.space === 'robot') robot.group.localToWorld(out.set(...c.anchor));
    else out.set(...c.anchor);
    out.project(camera);
    return { x: (out.x * 0.5 + 0.5) * ow(), y: (-out.y * 0.5 + 0.5) * oh(), ok: out.z > -1 && out.z < 1 };
  }

  const CPS = 90; // karakter per detik pada efek mengetik
  function updateOverlay(t) {
    const W = ow(), H = oh();
    root.style.width = `${W.toFixed(1)}px`;
    root.style.height = `${H}px`;
    root.style.transform = `scale(${K().toFixed(5)})`;
    for (const c of CALLOUTS) {
      const pinV = c.pin ? win(t, c.pin[0], c.pin[1], 0.45, 0.4) : 0;
      const cardV = win(t, c.card[0], c.card[1], 0.55, 0.45);
      const any = Math.max(pinV, cardV);
      if (any <= 0.001) { c.dotEl.style.opacity = 0; if (c.pinEl) c.pinEl.style.opacity = 0; c.cardEl.style.opacity = 0; c.path.style.opacity = 0; continue; }
      const a = projectAnchor(c, _v);
      if (!a.ok) { c.dotEl.style.opacity = 0; c.cardEl.style.opacity = 0; c.path.style.opacity = 0; if (c.pinEl) c.pinEl.style.opacity = 0; continue; }
      // titik
      const pulse = (t * 0.9 + Number(c.n) * 0.37) % 1;
      c.dotEl.style.opacity = any;
      c.dotEl.style.transform = `translate(${a.x.toFixed(2)}px, ${a.y.toFixed(2)}px) scale(${(0.55 + 0.45 * sm(any * 1.4)).toFixed(3)})`;
      const ringEl = c.dotEl.firstChild;
      ringEl.style.transform = `scale(${(0.7 + 0.9 * pulse).toFixed(3)})`;
      ringEl.style.opacity = (0.8 * (1 - pulse)).toFixed(3);
      // pin kecil (tampilan awal)
      if (c.pinEl) {
        const side = c.pinSide === 'l' ? -1 : 1;
        const pw = c.pinEl.offsetWidth || 120;
        const px = side > 0 ? a.x + 28 : a.x - 28 - pw;
        const k = pinV * (1 - cardV);
        c.pinEl.style.opacity = k;
        c.pinEl.style.transform = `translate(${px.toFixed(2)}px, ${(a.y - 22 + (1 - sm(pinV)) * 10).toFixed(2)}px)`;
      }
      // kartu
      if (cardV > 0.001) {
        const side = c.side === 'r' ? 1 : -1;
        let left = side > 0 ? a.x + c.dx : a.x - c.dx - c.w;
        let top = a.y + c.dy - c.h / 2;
        left = clamp(left, 70, W - 70 - c.w);
        top = clamp(top, 60, H - 60 - c.h);
        const attachX = side > 0 ? left : left + c.w;
        const attachY = top + c.h / 2;
        const slide = (1 - sm(cardV)) * 26 * side;
        c.cardEl.style.opacity = sm(cardV);
        c.cardEl.style.transform = `translate(${(left - slide).toFixed(2)}px, ${top.toFixed(2)}px) scale(${(0.955 + 0.045 * sm(cardV)).toFixed(4)})`;
        c.cardEl.style.transformOrigin = side > 0 ? 'left center' : 'right center';
        // garis penunjuk (tergambar bertahap)
        const ex = attachX - side * 54;
        c.path.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${ex.toFixed(1)} ${attachY.toFixed(1)} L${attachX.toFixed(1)} ${attachY.toFixed(1)}`);
        const len = c.path.getTotalLength();
        const draw = sm(seg(t, c.card[0] + 0.05, c.card[0] + 0.5));
        c.path.style.strokeDasharray = `${len} ${len}`;
        c.path.style.strokeDashoffset = (len * (1 - draw)).toFixed(1);
        c.path.style.opacity = (0.9 * sm(cardV)).toFixed(3);
        // ketik: titik-titik mengetik lalu teks mengalir
        const t0 = c.card[0] + 0.5;
        const typingK = seg(t, c.card[0] + 0.12, t0);
        const n = clamp(Math.floor((t - t0) * CPS), 0, c.len);
        if (n !== c.lastN) { c.p.innerHTML = typed(c.segs, n); c.lastN = n; }
        const showDots = t < t0 + 0.1;
        c.typingEl.style.opacity = showDots ? sm(typingK) : 0;
        c.typing.forEach((s, i) => { s.style.transform = `translateY(${(-5 * Math.max(0, Math.sin(t * 9 - i * 0.9))).toFixed(2)}px)`; });
      } else {
        c.cardEl.style.opacity = 0;
        c.path.style.opacity = 0;
        c.lastN = -1;
      }
    }

    // judul pembuka
    const tv = win(t, 0.5, 2.6, 0.8, 0.5);
    titleEl.style.opacity = tv;
    titleEl.style.transform = `translateY(${((1 - sm(tv)) * 26).toFixed(2)}px)`;
    // kartu statistik
    STATS.forEach((s, i) => {
      const k = win(t, 22.4 + i * 0.16, 25.5, 0.6, 0.45);
      statEls[i].style.opacity = sm(k);
      statEls[i].style.transform = `translateY(${((1 - sm(k)) * 34).toFixed(2)}px) scale(${(0.96 + 0.04 * sm(k)).toFixed(4)})`;
    });
    // penutup
    shadeEl.style.opacity = (0.93 * sm(seg(t, 25.5, 26.5))).toFixed(3);
    const ov = sm(seg(t, 26.1, 27.2));
    outroEl.style.opacity = ov;
    outroEl.style.transform = `translateY(${((1 - ov) * 22).toFixed(2)}px) scale(${(0.985 + 0.015 * ov).toFixed(4)})`;
    dipEl.style.opacity = dipAt(t).toFixed(4);
  }

  // ============================================================== alur agen (babak 2)
  function manageRun() {
    if (L.runT0 == null || L.ffActive) return;
    const s = director.state;
    if (s === 'searching' || s === 'planned') director.speed = 3.4;
    else if (s === 'executing' && !L.execSpeedSet) { director.speed = 1.8; L.execSpeedSet = true; }
  }

  // ============================================================== peristiwa satu kali
  L.events = [
    { t: 5.85, fn: () => robot.setMode('thinking') }, // enam ekspresi wajah bergantian ~0,4 dtk (idle sudah tampil)
    { t: 6.25, fn: () => robot.setMode('moving') },
    { t: 6.65, fn: () => robot.setMode('cleaning') },
    { t: 7.05, fn: () => robot.setMode('done') },
    { t: 7.45, fn: () => robot.setMode('alert') },
    { t: 7.85, fn: () => robot.setMode('idle') },
    { t: 7.95, fn: () => robot.setMode('cleaning') },
    { t: 10.2, fn: () => robot.setMode('moving') },
    { t: T.toClass, fn: () => leaveStudio() },
    { t: T.runStart, fn: () => { director.algo = 'astar'; director.heur = 'mst'; director.autoCam = false; director.speed = 6; director.start(); L.runT0 = L.t; } },
    { t: T.jump, fn: () => { L.ffRequested = true; } },
  ].sort((a, b) => a.t - b.t);
  let ev = 0;

  L.seek = (t) => {
    L.t = t;
    while (ev < L.events.length && L.events[ev].t <= t) { L.events[ev].fn(); ev++; }
  };
  /** Dipanggil perekam: percepat simulasi sampai agen selesai (layar sedang hitam). */
  L.beginFF = () => { L.ffActive = true; director.speed = 16; };
  L.endFF = () => {
    L.ffActive = false; L.ffRequested = false; L.ffDone = true;
    app.fx.confetti(robot.position); // konfeti baru agar letusan terlihat tepat setelah layar kembali terang
  };
  // Simulasi digerakkan manual: tepat satu langkah dt per bingkai video (tanpa bergantung jumlah tick rAF),
  // sehingga gerak robot seragam dan deterministik. Loop rAF bawaan dimatikan agar tidak ikut merender.
  const renderOnce = stage.render.bind(stage);
  stage.render = () => {};
  /** Satu langkah simulasi (hook + render). render=false: hanya simulasi (lewati komposer) agar cepat. */
  L.step = (dt, render = true) => {
    if (render) renderOnce(dt);
    else for (const fn of stage.hooks) if (typeof fn === 'function') fn(dt);
  };
  /** Satu bingkai video: setel waktu timeline lalu maju satu langkah. Mengembalikan {ff} bila perlu lompat (fast-forward). */
  L.frame = (t, dt, render = true) => {
    L.seek(t);
    if (L.ffRequested) return { ff: true, run: L.runT0 != null };
    L.step(dt, render);
    return { ff: false, run: L.runT0 != null };
  };
  L.duration = 30;
  /** Lompat ke keadaan selesai (saat layar hitam): percepat agen tanpa merender, lalu biarkan animasi sisa mengendap. */
  L.fastForward = () => {
    L.beginFF();
    for (let i = 0; i < 600 && director.state !== 'done' && director.state !== 'error'; i++) for (let j = 0; j < 4; j++) L.step(0.05, false);
    for (let i = 0; i < 90; i++) L.step(1 / 60, false);
    L.endFF();
  };
  /** Putar langsung (waktu nyata) di peramban sebagai pratinjau: buka ?launch=live. */
  L.play = () => {
    let t0 = null, last = 0;
    const loop = (now) => {
      if (t0 == null) { t0 = now; last = now; }
      const t = Math.min(L.duration, (now - t0) / 1000);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      if (L.frame(t, dt).ff) {
        L.fastForward();
        t0 = performance.now() - t * 1000; // waktu yang dipakai lompatan tidak dihitung
        L.frame(t, dt);
        last = performance.now();
      }
      if (t < L.duration) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  L.info = () => ({ t: L.t, act: L.act, state: director.state, speed: director.speed, robot: robot.group.position.toArray(), ffRequested: L.ffRequested, ffDone: L.ffDone });

  // satu callback per frame render: dipanggil sebelum composer.render
  stage.hooks.push((dt) => {
    manageRun();
    updateCamera(L.t, dt);
    updateStudio(L.t);
    updateOverlay(L.t);
  });

  enterStudio();
  L.seek(0);
  L.ready = true;
  if (app.params.get('launch') === 'live') L.play();
}
