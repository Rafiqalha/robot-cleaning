// Generator PPT UAS (pptxgenjs) — identitas visual sama dengan PPT UTS (Georgia + Courier New, palet Anthropic).
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const IMG = (n) => path.join(ROOT, 'docs_build', 'img', n);
const SHOT = (n) => path.join(ROOT, 'docs', 'screenshots', n);
const FIG = (n) => path.join(ROOT, 'results', 'figures', n);
const BLN = (n) => path.join(ROOT, 'docs', 'blender_previews', n);
const OUT = process.argv[2] || path.join(ROOT, '..', 'UAS_AI_Mini_Project_Kelompok6_CleanBot3D.pptx');

const C = { ink: '141413', paper: 'FAF9F5', card: 'F0EEE6', orange: 'D97757', blue: '6A9BCC', green: '788C5D', pink: 'C46686', sage: 'BCD1CA', tan: 'D4A27F', mid: '5E5D59', gray: 'B0AEA5', line: 'D9D6CB', white: 'FFFFFF' };
const HEAD = 'Georgia', BODY = 'Georgia', MONO = 'Courier New';

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'benchmark_skenario.json'), 'utf8'));
const srows = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'benchmark_skalabilitas.json'), 'utf8'));
const get = (sid, cfg, key) => rows.find((r) => r.scenario === sid && r.config === cfg)[key];
const SIDS = ['S1', 'S2', 'S3', 'S4'];
const fmt = (n) => Number(n).toLocaleString('id-ID');
function scal(cfg, k, key) {
  const xs = srows.filter((r) => r.config === cfg && r.k === k).map((r) => r[key]);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
const KS = [...new Set(srows.map((r) => r.k))].sort((a, b) => a - b);

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.title = 'Perencanaan Rute Robot Pembersih di Ruang Kelas — UAS AI';
pres.author = 'Kelompok 6 · AI-D · UIN Malang';
pres.company = 'UIN Malang';
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

// Placeholder judul harus berada di dalam `objects` (bukan kunci `placeholders`) agar terdaftar di layout.
const titlePh = (color) => ({ placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 11.2, h: 1.0, fontFace: HEAD, fontSize: 28, color, align: 'left', valign: 'middle', margin: 0 }, text: '' } });
pres.defineSlideMaster({
  title: 'CONTENT', background: { color: C.paper },
  objects: [{ image: { path: IMG('robot_icon.png'), x: 12.1, y: 0.42, w: 0.6, h: 0.6 } }, titlePh(C.ink)],
  slideNumber: { x: 12.3, y: 6.98, w: 0.6, h: 0.3, color: '8F8D84', fontFace: MONO, fontSize: 11, align: 'right' },
});
pres.defineSlideMaster({
  title: 'DARK', background: { color: C.ink },
  objects: [{ image: { path: IMG('robot_icon.png'), x: 12.1, y: 0.42, w: 0.6, h: 0.6 } }, titlePh(C.paper)],
  slideNumber: { x: 12.3, y: 6.98, w: 0.6, h: 0.3, color: '8F8D84', fontFace: MONO, fontSize: 11, align: 'right' },
});
pres.defineSlideMaster({ title: 'COVER', background: { color: C.ink } });

// ---------------------------------------------------------------- gambar (versi JPEG teroptimasi bila ada: deck_img/)
const OPT_DIR = path.join(ROOT, 'docs_build', 'deck_img');
function opt(p) {
  const j = path.join(OPT_DIR, path.basename(p).replace(/\.png$/i, '.jpg'));
  return /\.png$/i.test(p) && fs.existsSync(j) ? j : p;
}
function imageSize(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; // PNG: header IHDR
  let i = 2; // JPEG: cari penanda SOFn
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('Ukuran gambar tidak terbaca: ' + p);
}

// ---------------------------------------------------------------- helpers
let n = 0;
function slide(title, { dark = false, notes = '' } = {}) {
  const s = pres.addSlide({ masterName: dark ? 'DARK' : 'CONTENT' });
  s.addText(title, { placeholder: 'title' });
  if (notes) s.addNotes(notes);
  n++;
  return s;
}
const txt = (s, text, o) => s.addText(text, { fontFace: BODY, color: C.ink, margin: 0, valign: 'top', isTextBox: true, ...o });
const mono = (s, text, o) => s.addText(text, { fontFace: MONO, color: C.ink, margin: 0, isTextBox: true, ...o });
function card(s, x, y, w, h, { fill = C.card, line = C.line } = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 0.75 }, rectRadius: 0.12 });
}
function label(s, text, x, y, w, color = C.orange) {
  mono(s, text.toUpperCase(), { x, y, w, h: 0.28, fontSize: 11, color, charSpacing: 3 });
}
function numItem(s, num, head, body, x, y, w, { hs = 20, bs = 14, numColor = C.orange, dark = false, gap = 0.62 } = {}) {
  txt(s, String(num), { x, y, w: 0.6, h: 0.7, fontSize: 38, color: numColor, valign: 'top' });
  txt(s, head, { x: x + gap, y: y + 0.02, w: w - gap, h: 0.4, fontSize: hs, bold: false, color: dark ? C.paper : C.ink });
  txt(s, body, { x: x + gap, y: y + 0.44, w: w - gap, h: 0.95, fontSize: bs, color: dark ? 'D8D6CC' : C.mid });
}
function img(s, p, x, y, w, h, o = {}) {
  s.addImage({ path: opt(p), x, y, w, h, ...o });
}
// Ukuran piksel PNG dibaca dari header IHDR (sinkron, tanpa dependensi).
// Gambar memenuhi kotak (x,y,w,h) dengan pemotongan (cover) tanpa distorsi.
// pptxgenjs menghitung potongan dari rasio w/h gambar, jadi w/h gambar harus mengikuti rasio aslinya.
function coverImage(s, p, x, y, w, h) {
  p = opt(p);
  const { w: iw, h: ih } = imageSize(p);
  s.addImage({ path: p, x, y, w: (h * iw) / ih, h, sizing: { type: 'cover', w, h } });
}
// Foto berbingkai; `cover: true` memotong gambar agar pas dengan kotak (tanpa distorsi).
function photo(s, p, x, y, w, h, { cover = false } = {}) {
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, shadow: { type: 'outer', color: '000000', opacity: 0.18, blur: 8, offset: 2, angle: 90 } });
  if (cover) coverImage(s, p, x, y, w, h);
  else s.addImage({ path: opt(p), x, y, w, h });
}
function bullets(s, items, x, y, w, h, { size = 15, color = C.ink, gap = 7 } = {}) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: i < items.length - 1 } })), {
    x, y, w, h, fontFace: BODY, fontSize: size, color, margin: 0, valign: 'top', paraSpaceAfter: gap, isTextBox: true,
  });
}
function callout(s, num, x, y) {
  s.addShape(pres.shapes.OVAL, { x: x - 0.17, y: y - 0.17, w: 0.34, h: 0.34, fill: { color: C.orange }, line: { color: C.white, width: 1.5 } });
  s.addText(String(num), { x: x - 0.17, y: y - 0.17, w: 0.34, h: 0.34, fontFace: MONO, fontSize: 12, bold: true, color: '1A1816', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
}
const chartBase = {
  catAxisLabelFontFace: BODY, valAxisLabelFontFace: BODY, legendFontFace: BODY, dataLabelFontFace: BODY, titleFontFace: HEAD,
  catAxisLabelFontSize: 13, valAxisLabelFontSize: 11, legendFontSize: 12, catAxisLabelColor: C.ink, valAxisLabelColor: C.mid,
  valGridLine: { color: 'E3E1D8', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 'b', legendColor: C.ink,
};

// ================================================================ 1. COVER
{
  const s = pres.addSlide({ masterName: 'COVER' });
  n++;
  coverImage(s, SHOT('follow_cleaning.png'), 6.9, 0, 6.433, 7.5);
  s.addShape(pres.shapes.RECTANGLE, { x: 6.9, y: 0, w: 0.04, h: 7.5, fill: { color: C.ink }, line: { color: C.ink, width: 0 } });
  mono(s, 'UAS ARTIFICIAL INTELLIGENCE', { x: 0.7, y: 0.78, w: 6, h: 0.3, fontSize: 12, color: C.blue, charSpacing: 3 });
  txt(s, 'Perencanaan Rute Robot Pembersih di Ruang Kelas', { x: 0.7, y: 1.35, w: 6.0, h: 2.6, fontSize: 40, color: C.paper });
  txt(s, 'Simulasi 3D dengan algoritma A* — Python, Blender, dan three.js', { x: 0.7, y: 4.0, w: 5.8, h: 0.9, fontSize: 18, italic: true, color: C.gray });
  mono(s, 'KELOMPOK 6  \\  KELAS AI - D  \\  UIN MALANG', { x: 0.7, y: 5.1, w: 6, h: 0.3, fontSize: 12, color: C.orange, charSpacing: 2 });
  const mem = [['Rafiq Alhariri Andriansyah', '240605110178'], ['Ahmad Zamroni', '240605110216'], ['Afzaal Abrar Hidayat', '240605110206']];
  mem.forEach(([nm, nim], i) => {
    const y = 5.55 + i * 0.4;
    s.addShape(pres.shapes.LINE, { x: 0.7, y, w: 5.9, h: 0, line: { color: '3D3D3A', width: 0.75 } });
    txt(s, String(i + 1), { x: 0.7, y: y + 0.07, w: 0.3, h: 0.3, fontSize: 13, color: C.orange });
    txt(s, nm, { x: 1.1, y: y + 0.06, w: 3.6, h: 0.3, fontSize: 15, color: C.paper });
    mono(s, nim, { x: 4.7, y: y + 0.09, w: 1.9, h: 0.3, fontSize: 12, color: C.gray, align: 'right' });
  });
  s.addNotes('Selamat pagi/siang. Kami Kelompok 6 kelas AI-D. Pada UTS kami merancang agen pembersih ruang kelas dengan A*; pada UAS rancangan itu kami wujudkan menjadi sistem lengkap: inti AI di Python, aset 3D di Blender, dan simulasi 3D real-time di three.js. Gambar di kanan adalah tangkapan layar langsung dari aplikasi kami.');
}

// ================================================================ 2. LATAR BELAKANG
{
  const s = slide('Ruang Kelas Perlu Dibersihkan Setelah Kegiatan Belajar', {
    notes: 'Latar belakang: setelah pelajaran, sampah tersebar di beberapa titik kelas. Robot harus memutuskan urutan kunjungan dan jalur yang menghindari meja dan lemari. Usulan kami: agen berbasis pencarian yang menyusun rangkaian aksi dengan biaya minimum. Pada UAS, hasilnya divisualkan dalam simulasi 3D.' });
  numItem(s, 1, 'Kebutuhan', 'Beberapa lokasi dalam ruangan perlu dibersihkan setelah digunakan.', 0.6, 1.75, 6.2);
  numItem(s, 2, 'Keputusan rute', 'Perabot dan lokasi target yang tersebar membuat robot perlu memilih urutan kunjungan serta jalur yang sesuai.', 0.6, 3.15, 6.2);
  numItem(s, 3, 'Usulan solusi', 'Agen berbasis pencarian menyusun rangkaian tindakan agar seluruh target selesai dengan biaya perjalanan minimum dalam model simulasi.', 0.6, 4.55, 6.2);
  photo(s, IMG('route_S3_crop.png'), 7.15, 1.7, 5.55, 3.2);
  card(s, 7.15, 5.15, 5.55, 1.45, { fill: C.card });
  label(s, 'Pada UAS', 7.4, 5.3, 4);
  txt(s, 'Rencana A* dari inti AI Python divisualkan sebagai simulasi 3D realistis (Blender + three.js) yang menampilkan proses berpikir dan eksekusi robot.', { x: 7.4, y: 5.6, w: 5.1, h: 0.95, fontSize: 14, color: C.mid });
}

// ================================================================ 3. TUJUAN
{
  const s = slide('Tujuan, Manfaat, dan Batasan Proyek', {
    notes: 'Empat tujuan: memodelkan tugas dengan PEAS dan lima komponen formulasi; menghasilkan rencana yang mengunjungi semua target dan kembali; mengevaluasi pada beberapa skenario; dan pada UAS ditambah memvisualkan proses pencarian dan eksekusi dalam simulasi 3D. Batasan penting: fokus pada titik kotoran yang diketahui, biaya 1 per aksi adalah asumsi.' });
  label(s, 'Tujuan', 0.6, 1.62, 3);
  const T = ['Memodelkan tugas robot pembersih menggunakan PEAS dan lima komponen formulasi masalah.', 'Menghasilkan rencana perjalanan yang mengunjungi seluruh target dan kembali ke titik awal.', 'Mengevaluasi keberhasilan tugas serta biaya perjalanan pada beberapa skenario denah.', 'Memvisualkan proses pencarian dan eksekusi rencana dalam simulasi 3D yang realistis dan interaktif.'];
  T.forEach((t, i) => {
    const y = 2.0 + i * 1.18;
    txt(s, String(i + 1), { x: 0.6, y, w: 0.5, h: 0.6, fontSize: 34, color: C.orange });
    txt(s, t, { x: 1.2, y: y + 0.04, w: 5.9, h: 1.0, fontSize: 16, color: C.ink });
  });
  card(s, 7.6, 1.7, 5.1, 2.1);
  label(s, 'Manfaat', 7.85, 1.85, 3);
  txt(s, 'Pengelola fasilitas dan operator robot kebersihan mendapat rencana rute terstruktur dengan biaya minimum dalam model simulasi; mahasiswa memahami AI search lewat visualisasi.', { x: 7.85, y: 2.2, w: 4.6, h: 1.55, fontSize: 14, color: C.mid });
  card(s, 7.6, 4.05, 5.1, 2.7);
  label(s, 'Batasan', 7.85, 4.2, 3, C.blue);
  bullets(s, ['Fokus pada titik kotoran yang sudah diketahui, bukan seluruh permukaan lantai.', 'Ruang kelas adalah skenario simulasi; biaya 1 satuan per aksi adalah asumsi.', 'Lingkungan statis dan teramati penuh (kecuali uji replanning).'], 7.85, 4.55, 4.65, 2.1, { size: 14, color: C.mid, gap: 5 });
}

// ================================================================ 4. METODE
{
  const s = slide('Metode: Dari Agen ke Problem Solving', {
    notes: 'Alur problem-solving agent dari materi: rumuskan tujuan, rumuskan masalah, cari, lalu eksekusi. Di aplikasi, lima tahap ini tampil sebagai stepper di bagian bawah layar. Pseudokode di bawah adalah SIMPLE-PROBLEM-SOLVING-AGENT dari buku Russell dan Norvig, dan sudah kami implementasikan persis di kelas CleaningAgent pada Python.' });
  const steps = [['1', 'Rumuskan tujuan', 'Semua target bersih dan robot kembali ke titik awal.'], ['2', 'Rumuskan masalah', 'State, aksi, model transisi, uji tujuan, dan biaya.'], ['3', 'Cari', 'A* (BFS dan UCS sebagai pembanding) menyusun urutan aksi.'], ['4', 'Rencana', 'Deretan aksi ↑ → ↓ ← dan ✦ (bersihkan) berbiaya minimum.'], ['5', 'Eksekusi', 'Robot menjalankan aksi; rintangan baru → rencanakan ulang.']];
  steps.forEach(([num, h, t], i) => {
    const x = 0.6 + i * 2.45;
    card(s, x, 1.65, 2.3, 2.35, { fill: i === 2 ? 'F6E3DA' : C.card, line: i === 2 ? C.orange : C.line });
    txt(s, num, { x: x + 0.2, y: 1.75, w: 0.6, h: 0.7, fontSize: 36, color: C.orange });
    txt(s, h, { x: x + 0.2, y: 2.42, w: 2.0, h: 0.4, fontSize: 15, color: C.ink });
    txt(s, t, { x: x + 0.2, y: 2.85, w: 1.95, h: 1.1, fontSize: 13, color: C.mid });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.25, w: 12.13, h: 2.55, fill: { color: C.ink }, line: { color: C.ink, width: 0 }, rectRadius: 0.1 });
  const code = [
    'function SIMPLE-PROBLEM-SOLVING-AGENT(percept) returns an action',
    '    state   <- UPDATE-STATE(state, percept)                 # posisi, sensor jarak & debu',
    '    if seq is empty then',
    '        goal    <- FORMULATE-GOAL(state)                    # semua bersih & kembali',
    '        problem <- FORMULATE-PROBLEM(state, goal)           # s = (posisi, target tersisa)',
    '        seq     <- SEARCH(problem)                          # A* / UCS / BFS',
    '    action <- FIRST(seq);  seq <- REST(seq)',
    '    return action                                           # ↑ → ↓ ←  atau  ✦ bersihkan',
  ];
  s.addText(code.map((l, i) => ({ text: l, options: { breakLine: i < code.length - 1 } })), { x: 0.85, y: 4.4, w: 11.7, h: 2.3, fontFace: MONO, fontSize: 13, color: 'E8E6DC', margin: 0, valign: 'top', isTextBox: true, paraSpaceAfter: 2 });
}

// ================================================================ 5. PEAS
{
  const s = slide('Agen Pembersih Dirancang Melalui PEAS', {
    notes: 'PEAS: Performance adalah semua target bersih, tanpa menabrak, kembali ke titik awal dengan biaya minimum. Environment adalah satu ruang kelas dengan perabot sebagai rintangan. Actuators adalah roda dan sikat/hisap. Sensors adalah posisi, sensor jarak/LiDAR dan sensor debu. Di sebelah kanan terlihat panel PEAS pada aplikasi yang diperbarui langsung setiap langkah robot.' });
  const P = [['P', 'Performance', 'Seluruh target dibersihkan, robot menghindari sel terlarang, kembali ke titik awal, dan meminimalkan biaya perjalanan.', C.orange], ['E', 'Environment', 'Satu ruang kelas, perabot sebagai rintangan, lokasi target pembersihan, dan titik awal robot.', C.blue], ['A', 'Actuators', 'Bergerak atas, bawah, kiri, kanan (roda) serta membersihkan (sikat dan hisap).', C.green], ['S', 'Sensors', 'Posisi robot, sensor jarak/LiDAR, sensor debu, dan data denah. Kamera fisik menjadi pengembangan berikutnya.', C.pink]];
  P.forEach(([l, h, t, col], i) => {
    const x = 0.6 + (i % 2) * 4.4, y = 1.65 + Math.floor(i / 2) * 2.7;
    card(s, x, y, 4.2, 2.5);
    s.addShape(pres.shapes.OVAL, { x: x + 0.22, y: y + 0.22, w: 0.62, h: 0.62, fill: { color: col }, line: { color: col, width: 0 } });
    txt(s, l, { x: x + 0.22, y: y + 0.22, w: 0.62, h: 0.62, fontSize: 22, bold: true, color: C.white, align: 'center', valign: 'middle' });
    txt(s, h, { x: x + 1.0, y: y + 0.3, w: 3.0, h: 0.4, fontSize: 20 });
    txt(s, t, { x: x + 0.25, y: y + 1.0, w: 3.75, h: 1.4, fontSize: 14, color: C.mid });
  });
  // panel PEAS pada aplikasi (347x530 px)
  photo(s, IMG('panel_peas_top.png'), 9.75, 1.69, 3.0, (3.0 * 530) / 347);
  txt(s, 'Panel PEAS pada aplikasi: nilai diperbarui langsung setiap langkah robot', { x: 9.6, y: 6.35, w: 3.3, h: 0.5, fontSize: 11, italic: true, color: C.mid, align: 'center' });
}

// ================================================================ 6. FORMULASI
{
  const s = slide('Problem Solving: Lima Komponen Formulasi Masalah', {
    notes: 'State kami berupa pasangan posisi robot dan himpunan target yang belum dibersihkan, direpresentasikan bitmask. Lima komponen: initial state, actions, transition model, goal test, dan path cost 1 per aksi. Ukuran ruang state paling banyak jumlah sel bebas dikali dua pangkat jumlah target; misalnya S1 hanya 272 state sedangkan S4 3.264 state.' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.6, w: 7.6, h: 0.62, fill: { color: C.paper }, line: { color: C.ink, width: 1 }, rectRadius: 0.14 });
  mono(s, 's = (posisi robot, target belum dibersihkan)', { x: 0.6, y: 1.6, w: 7.6, h: 0.62, fontSize: 17, align: 'center', valign: 'middle' });
  const F = [['Initial State', 'Robot berada di titik awal dengan seluruh target belum dibersihkan.'], ['Actions', 'Bergerak ke sel tetangga yang valid atau membersihkan target di posisi saat ini.'], ['Transition Model', 'Gerakan mengubah posisi; pembersihan menghapus lokasi dari daftar target tersisa.'], ['Goal Test', 'Semua target sudah bersih dan robot kembali ke titik awal.'], ['Path Cost', 'Total biaya gerakan dan pembersihan; 1 unit per aksi sebagai asumsi simulasi.']];
  F.forEach(([h, t], i) => {
    const x = 0.6 + i * 2.45;
    card(s, x, 2.55, 2.3, 3.0);
    txt(s, String(i + 1), { x: x + 0.2, y: 2.65, w: 0.6, h: 0.7, fontSize: 38, color: C.orange });
    txt(s, h, { x: x + 0.2, y: 3.38, w: 1.95, h: 0.4, fontSize: 17 });
    txt(s, t, { x: x + 0.2, y: 3.85, w: 1.95, h: 1.65, fontSize: 13, color: C.mid });
  });
  card(s, 0.6, 5.8, 12.13, 0.95, { fill: 'F6E3DA', line: C.orange });
  label(s, 'Ukuran ruang state ≤ (sel bebas) × 2^k', 0.85, 5.9, 6);
  mono(s, `S1: 34×2³ = ${fmt(get('S1', 'bfs', 'state_space'))}   ·   S2: 24×2³ = ${fmt(get('S2', 'bfs', 'state_space'))}   ·   S3: 34×2⁵ = ${fmt(get('S3', 'bfs', 'state_space'))}   ·   S4: 51×2⁶ = ${fmt(get('S4', 'bfs', 'state_space'))}`, { x: 0.85, y: 6.22, w: 11.6, h: 0.4, fontSize: 15 });
}

// ================================================================ 7. ALGORITMA
{
  const s = slide('A* Memandu Robot dengan Dua Pertimbangan Biaya', {
    notes: 'BFS memperluas simpul terdangkal; optimal karena semua aksi berbiaya 1, tetapi memeriksa banyak state. UCS memilih biaya g terkecil. A* menambahkan perkiraan biaya ke tujuan h: f sama dengan g ditambah h. Jika h admissible, A* tetap optimal tetapi terarah ke target sehingga jauh lebih sedikit state. Greedy dan Nearest-Neighbor kami tambahkan sebagai pembanding non-optimal.' });
  const cols = [['BFS', 'Memperluas simpul terdangkal lebih dulu (antrian FIFO).', 'Optimal bila semua aksi berbiaya sama (di sini 1).', 'Memeriksa state paling banyak; tak punya arah.', C.blue, false], ['UCS', 'Memperluas simpul dengan biaya g(n) terkecil (antrian prioritas).', 'Optimal untuk biaya aksi berbeda-beda.', 'Seperti BFS pada biaya satuan: buta arah.', C.tan, false], ['A*', 'Memperluas simpul dengan f(n) = g(n) + h(n) terkecil.', 'Optimal bila h admissible (dan consistent).', 'Terarah ke target: jauh lebih sedikit state.', C.orange, true]];
  cols.forEach(([h, a, b, c, col, hl], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.7, 3.9, 3.9, { fill: hl ? 'F6E3DA' : C.card, line: hl ? C.orange : C.line });
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.92, w: 0.22, h: 0.22, fill: { color: col }, line: { color: col, width: 0 } });
    txt(s, h, { x: x + 0.6, y: 1.8, w: 3, h: 0.5, fontSize: 26 });
    label(s, 'Memilih simpul', x + 0.25, 2.55, 3.3, C.mid);
    txt(s, a, { x: x + 0.25, y: 2.83, w: 3.45, h: 0.85, fontSize: 14, color: C.ink });
    label(s, 'Optimal?', x + 0.25, 3.7, 3.3, C.mid);
    txt(s, b, { x: x + 0.25, y: 3.98, w: 3.45, h: 0.7, fontSize: 14, color: C.ink });
    label(s, 'Catatan', x + 0.25, 4.62, 3.3, C.mid);
    txt(s, c, { x: x + 0.25, y: 4.9, w: 3.45, h: 0.65, fontSize: 14, color: C.ink });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 5.85, w: 12.13, h: 0.95, fill: { color: C.ink }, line: { color: C.ink, width: 0 }, rectRadius: 0.1 });
  mono(s, 'f(n) = g(n) + h(n)', { x: 0.9, y: 5.85, w: 4.6, h: 0.95, fontSize: 26, color: C.orange, valign: 'middle' });
  txt(s, 'g(n): biaya yang sudah ditempuh · h(n): perkiraan biaya yang masih diperlukan · f(n): prioritas pemilihan langkah.  Pembanding tambahan: Greedy Best-First dan Nearest-Neighbor (tidak optimal).', { x: 5.5, y: 5.93, w: 7.0, h: 0.8, fontSize: 13, color: 'D8D6CC', valign: 'middle' });
}

// ================================================================ 8. HEURISTIK
{
  const s = slide('Tiga Heuristik h(n) yang Admissible dan Consistent', {
    notes: 'Kami menguji tiga heuristik. Manhattan memakai jarak Manhattan dan mengabaikan rintangan. Jarak-max memakai jarak terpendek sebenarnya dari BFS. MST plus terdekat memakai pohon rentang minimum atas target tersisa dan titik awal ditambah jarak ke simpul terdekat; ini paling informatif. Ketiganya tidak pernah melebihi biaya sisa sebenarnya sehingga A* tetap optimal; kami verifikasi dengan pengujian otomatis.' });
  const H = [['Manhattan', 'h = max_t [ |pos−t| + |t−awal| ] + |R|', 'Mengabaikan rintangan; sangat cepat dihitung.'], ['Jarak-max (BFS)', 'h = max_t [ d(pos,t) + d(t,awal) ] + |R|', 'Memakai jarak terpendek sebenarnya pada grid.'], ['MST + terdekat', 'h = MST(R ∪ {awal}) + min_s d(pos,s) + |R|', 'Pohon rentang minimum atas target tersisa — paling informatif saat target banyak.']];
  H.forEach(([h, f, t], i) => {
    const y = 1.65 + i * 1.62;
    card(s, 0.6, y, 8.1, 1.45, { fill: i === 2 ? 'F6E3DA' : C.card, line: i === 2 ? C.orange : C.line });
    txt(s, h, { x: 0.85, y: y + 0.14, w: 3, h: 0.4, fontSize: 19 });
    mono(s, f, { x: 0.85, y: y + 0.58, w: 7.7, h: 0.35, fontSize: 15, color: C.orange });
    txt(s, t, { x: 0.85, y: y + 0.98, w: 7.7, h: 0.4, fontSize: 13, color: C.mid });
  });
  mono(s, '|R| = target tersisa (tiap target 1 aksi bersihkan) · d = jarak terpendek (BFS)', { x: 0.6, y: 6.55, w: 8.1, h: 0.3, fontSize: 11, color: C.mid });
  card(s, 9.0, 1.65, 3.73, 4.7, { fill: C.ink, line: C.ink });
  label(s, 'Verifikasi pengujian', 9.25, 1.85, 3.3, C.orange);
  txt(s, 'h(s) ≤ biaya sisa optimal', { x: 9.25, y: 2.25, w: 3.3, h: 0.4, fontSize: 17, color: C.paper });
  txt(s, 'h(s) ≤ c(s,a,s′) + h(s′)', { x: 9.25, y: 2.7, w: 3.3, h: 0.4, fontSize: 17, color: C.paper });
  txt(s, 'Diuji otomatis (pytest) pada 450 sampel state acak (6 denah × 3 heuristik × 25 state): admissible (A* optimal) dan consistent (tanpa pembukaan ulang simpul).', { x: 9.25, y: 3.3, w: 3.3, h: 1.6, fontSize: 14, color: 'D8D6CC' });
  txt(s, '20 / 20 uji lolos', { x: 9.25, y: 5.2, w: 3.3, h: 0.6, fontSize: 24, color: C.green });
}

// ================================================================ 9. ARSITEKTUR
{
  const s = slide('Arsitektur Sistem: Python, Blender, dan three.js', {
    notes: 'Arsitektur tiga lapis. Python adalah otak: formulasi masalah, algoritma pencarian, agen, dan server FastAPI. Blender membuat aset 3D lewat skrip bpy dan mengekspornya sebagai GLB. Browser memakai three.js untuk merender dunia 3D dan menganimasikan robot berdasarkan rencana yang dihitung Python. Bila server mati, aplikasi tetap bisa memutar rencana tersimpan.' });
  photo(s, FIG('arsitektur_sistem.png'), 0.6, 1.6, 9.0, 4.93);
  bullets(s, ['Python menghitung rencana; browser hanya memvisualkan.', 'Blender (bpy) membuat model robot, perabot, dan sampah → berkas .glb.', 'FastAPI: /api/plan, /api/meta, /api/benchmark.', 'Data statis cadangan bila server tidak aktif.'], 9.95, 1.7, 2.8, 4.8, { size: 14, gap: 10 });
}

// ================================================================ 10. BLENDER ASET
{
  const s = slide('Aset 3D Dibuat dengan Blender (Python / bpy)', {
    notes: 'Seluruh aset dibuat dengan skrip Python di Blender 5.2 secara headless, tanpa menggambar manual. Robot CleanBot memiliki bodi dengan clearcoat, seam LED, lidar berputar, roda bertapak, sikat samping dan roller. Perabot memakai tekstur kayu yang dibangkitkan dengan numpy. Semua material PBR diekspor ke glTF dan dimuat langsung oleh three.js.' });
  photo(s, BLN('robot_depan.png'), 0.6, 1.62, 3.9, 2.69);
  photo(s, BLN('props_lemari_rak.png'), 4.72, 1.62, 3.9, 2.69);
  photo(s, BLN('props_meja_kursi.png'), 8.84, 1.62, 3.9, 2.69);
  bullets(s, ['Skrip headless: blender --background --python build_assets.py', 'Robot CleanBot: 25 mesh, 14 material PBR, ±16,6 ribu segitiga (bodi clearcoat, LED, lidar, roda, sikat)', 'Material PBR (Principled BSDF) → glTF: roughness, metallic, clearcoat, emissive'], 0.6, 4.7, 6.0, 2.1, { size: 14, gap: 8 });
  bullets(s, ['Perabot: meja kayu bertekstur (numpy), kursi, lemari, rak ±80 buku, papan tulis, pintu, jendela', 'Sampah: bola kertas, bungkus, pensil, kotak jus, remah, tumpahan, debu', 'Tiga berkas .glb (±1,9 MB; total ±46 ribu segitiga) dimuat langsung oleh three.js'], 6.85, 4.7, 5.9, 2.1, { size: 14, gap: 8 });
}

// ================================================================ 11. CYCLES
{
  const s = slide('Python → Blender: Render Cycles dari Rencana A*', {
    notes: 'Selain ekspor aset, skrip kedua membaca rencana A* dari Python lalu menyusun ruang kelas, rute, titik kotoran, dan posisi robot di Blender, kemudian merender dengan Cycles di GPU. Ini membuktikan alur penuh dari keluaran AI menjadi gambar fotorealistis.' });
  const pc = fs.existsSync(BLN('blender_cycles_S3.png')) ? BLN('blender_cycles_S3.png') : BLN('props_meja_kursi.png');
  const pr = fs.existsSync(BLN('blender_cycles_S4_robot.png')) ? BLN('blender_cycles_S4_robot.png') : BLN('robot_depan.png');
  photo(s, pc, 0.6, 1.65, 7.7, 4.33);
  photo(s, pr, 8.55, 1.65, 4.2, 2.36);
  bullets(s, ['Rencana A* (JSON) dibaca skrip bpy: perabot, rute, target, dan robot disusun otomatis', 'Cycles (OptiX GPU), 160 sampel + denoise', 'Dinding & plafon dibuat tak terlihat kamera tetapi tetap memblokir cahaya'], 8.55, 4.3, 4.2, 2.6, { size: 13, gap: 7 });
  txt(s, 'Render Blender Cycles: skenario S3 (kiri) dan close-up robot pada skenario S4 (kanan)', { x: 0.6, y: 6.2, w: 7.7, h: 0.3, fontSize: 12, italic: true, color: C.mid });
}

// ================================================================ 12. THREEJS VISUAL
{
  const s = slide('Visual Real-Time yang Realistis dengan three.js', {
    notes: 'Aplikasi three.js merender secara real-time dengan material PBR, pencahayaan berbasis gambar, bayangan matahari yang masuk lewat jendela, ambient occlusion, dan bloom. Robot dianimasikan: roda berputar sesuai jarak, bodi miring saat akselerasi, lidar berputar, sikat berputar, dan layar wajah berubah ekspresi. Ada lima mode kamera termasuk kamera sudut pandang robot.' });
  photo(s, SHOT('follow_cleaning.png'), 0.6, 1.6, 7.6, 4.275);
  photo(s, SHOT('robot_face_cleaning.png'), 8.5, 1.6, 4.23, 2.38);
  photo(s, SHOT('fpv_run.png'), 8.5, 4.2, 4.23, 2.38);
  bullets(s, ['PBR + IBL, bayangan matahari lewat jendela, AO (GTAO), bloom', 'Roda, sikat, lidar, bodi miring saat akselerasi, wajah ekspresif (>  <)'], 0.6, 6.1, 7.6, 0.85, { size: 14, gap: 4 });
  txt(s, 'Kanan atas: wajah robot saat membersihkan · kanan bawah: kamera sudut pandang robot (FPV)', { x: 8.5, y: 6.62, w: 4.23, h: 0.4, fontSize: 10, italic: true, color: C.mid });
}

// ================================================================ 13. APLIKASI
{
  const s = slide('Aplikasi: Proses Berpikir dan Eksekusi Terlihat Langsung', {
    notes: 'Ini tampilan aplikasi saat robot mengeksekusi rencana A*. Stepper di bawah menunjukkan tahap agen. Heat-map di lantai memperlihatkan state yang diperiksa algoritma, dan rute menyala memperlihatkan rencana. Panel kanan menampilkan state saat ini, serta g, h, dan f; pada rencana optimal f tidak pernah menurun dan berakhir sama dengan biaya optimal.' });
  photo(s, SHOT('ui_exec_S3.png'), 0.6, 1.6, 8.7, 4.89);
  callout(s, 1, 0.6 + 8.7 * 0.5, 1.6 + 4.89 * 0.955);
  callout(s, 2, 0.6 + 8.7 * 0.46, 1.6 + 4.89 * 0.58);
  callout(s, 3, 0.6 + 8.7 * 0.93, 1.6 + 4.89 * 0.26);
  callout(s, 4, 0.6 + 8.7 * 0.08, 1.6 + 4.89 * 0.3);
  const L = [['Stepper tahap agen', 'Tujuan → Masalah → Pencarian → Eksekusi → Selesai'], ['Heat-map & rute di lantai', 'State yang diperiksa A* dan rute yang menyala'], ['Panel kanan', 'PEAS, state s, g(n) h(n) f(n), metrik, daftar aksi'], ['Panel kiri', 'Skenario, algoritma, heuristik, kecepatan, kamera']];
  L.forEach(([h, t], i) => {
    const y = 1.7 + i * 1.28;
    callout(s, i + 1, 9.72, y + 0.2);
    txt(s, h, { x: 10.05, y, w: 2.7, h: 0.4, fontSize: 15 });
    txt(s, t, { x: 10.05, y: y + 0.4, w: 2.7, h: 0.75, fontSize: 12, color: C.mid });
  });
}

// ================================================================ 14. SKENARIO
{
  const s = slide('Rancangan Simulasi Menguji Tiga Skenario Denah (+ Bonus S4)', {
    notes: 'Tiga skenario sama persis dengan rancangan UTS: sedikit rintangan, banyak rintangan, dan target tersebar, semuanya grid 8 kali 5 dengan robot berangkat dari pintu di kiri bawah. Kami menambahkan S4, kelas penuh 10 kali 7 dengan enam target, untuk menguji skalabilitas dan sebagai showcase 3D. Garis oranye pada gambar adalah rute optimal A*.' });
  photo(s, FIG('rute_S1-S3.png'), 0.6, 1.6, 12.13, 3.07);
  const D = [['1. Sedikit Rintangan', 'Perabot minimal, jalur terbuka bagi robot. 3 target, biaya optimal 23.'], ['2. Banyak Rintangan', 'Perabot rapat, koridor sempit membatasi jalur. 3 target, biaya optimal 21.'], ['3. Target Tersebar', 'Titik kotoran berjauhan di berbagai sudut ruangan. 5 target, biaya optimal 31.']];
  D.forEach(([h, t], i) => {
    const x = 0.6 + i * 4.1;
    txt(s, h, { x, y: 4.95, w: 3.9, h: 0.4, fontSize: 18 });
    txt(s, t, { x, y: 5.4, w: 3.8, h: 0.9, fontSize: 14, color: C.mid });
  });
  card(s, 0.6, 6.15, 12.13, 0.62, { fill: 'F6E3DA', line: C.orange });
  txt(s, 'Bonus S4 · Kelas Penuh 10×7 m: enam meja panjang, meja guru, lemari, rak, tempat sampah, 6 target — biaya optimal 38.', { x: 0.85, y: 6.15, w: 11.7, h: 0.62, fontSize: 14, valign: 'middle' });
}

// ================================================================ 15. METRIK
{
  const s = slide('Keberhasilan Diukur dari Tugas Selesai dan Biaya Perjalanan', {
    notes: 'Metrik evaluasi mengikuti rancangan UTS: tugas selesai, total gerakan, total biaya, jumlah state yang diperiksa, dan waktu komputasi. Kami menambah selisih biaya terhadap rencana optimal untuk menilai kualitas algoritma non-optimal.' });
  const M = [['Tugas Selesai', 'Seluruh target dibersihkan dan robot kembali ke titik awal.', C.orange, 'selesai = (tersisa=∅) ∧ (pos=awal)'], ['Total Gerakan', 'Jumlah langkah yang ditempuh robot sepanjang rencana.', C.blue, 'gerak = jumlah aksi ↑ → ↓ ←'], ['Total Biaya', 'Akumulasi biaya gerakan dan pembersihan, 1 unit per aksi.', C.green, 'biaya = Σ c(s,a,s′) = gerak+bersih'], ['Jumlah State', 'State yang diperiksa (diperluas) algoritma pencarian.', C.pink, 'diperiksa = |state yang di-expand|'], ['Waktu Komputasi', 'Lama pencarian rencana (median 5 kali jalan, milidetik).', C.tan, 'waktu = median(5 kali jalan)'], ['Selisih Biaya', 'Persen biaya dibanding rencana optimal A* (kualitas rencana).', C.mid, 'selisih = (biaya−biaya*) / biaya*']];
  M.forEach(([h, t, col, f], i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.7 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.9, 2.35);
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.28, w: 0.5, h: 0.5, fill: { color: col }, line: { color: col, width: 0 } });
    txt(s, String(i + 1), { x: x + 0.25, y: y + 0.28, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.white, align: 'center', valign: 'middle' });
    txt(s, h, { x: x + 0.95, y: y + 0.3, w: 2.8, h: 0.45, fontSize: 19 });
    txt(s, t, { x: x + 0.25, y: y + 1.0, w: 3.45, h: 0.8, fontSize: 14, color: C.mid });
    s.addShape(pres.shapes.LINE, { x: x + 0.25, y: y + 1.78, w: 3.4, h: 0, line: { color: C.line, width: 0.75 } });
    mono(s, f, { x: x + 0.25, y: y + 1.88, w: 3.45, h: 0.3, fontSize: 11, color: C.orange });
  });
}

// ================================================================ 16. HASIL STATE (chart)
{
  const s = slide('Hasil 1: A* Memeriksa Jauh Lebih Sedikit State', {
    notes: 'Semua algoritma optimal menghasilkan biaya yang sama pada setiap skenario, sehingga perbandingan adil. A* dengan heuristik MST memeriksa 50 state pada S1 dibanding 270 untuk BFS, kira-kira lima kali lebih sedikit. Pada S4 hanya 96 state dibanding 3.254, sekitar 34 kali lebih sedikit. Sumbu vertikal berskala logaritmik.' });
  // UCS dihilangkan dari grafik: pada biaya aksi seragam hasilnya hampir identik dengan BFS (selisih ≤ 6 state) dan label saling menimpa.
  const cfgs = [['bfs', 'BFS (≈ UCS)', C.blue], ['astar_max', 'A* (jarak-max)', C.green], ['astar_mst', 'A* (MST)', C.orange]];
  const data = cfgs.map(([c, name]) => ({ name, labels: ['S1 Sedikit Rintangan', 'S2 Banyak Rintangan', 'S3 Target Tersebar', 'S4 Kelas Penuh'], values: SIDS.map((sid) => get(sid, c, 'expanded')) }));
  s.addChart(pres.charts.BAR, data, {
    ...chartBase, x: 0.6, y: 1.55, w: 8.6, h: 5.25, barDir: 'col', barGrouping: 'clustered', chartColors: cfgs.map((c) => c[2]),
    valAxisLogScaleBase: 10, valAxisMinVal: 10, valAxisMaxVal: 10000, showValue: true, dataLabelFontSize: 11, dataLabelPosition: 'outEnd', dataLabelColor: C.ink, dataLabelFormatCode: '#,##0', valAxisLabelFormatCode: '#,##0',
    showTitle: true, title: 'Jumlah state yang diperiksa (skala log) — makin kecil makin efisien', titleFontSize: 14, titleColor: C.mid,
  });
  const ratios = SIDS.map((sid) => [sid, get(sid, 'bfs', 'expanded') / get(sid, 'astar_mst', 'expanded')]);
  label(s, 'BFS ÷ A* (MST)', 9.6, 1.7, 3);
  ratios.forEach(([sid, r], i) => {
    const y = 2.1 + i * 1.18;
    txt(s, `${r >= 10 ? r.toFixed(0) : r.toFixed(1).replace('.', ',')}×`, { x: 9.6, y, w: 1.9, h: 0.9, fontSize: 46, color: i === 3 ? C.orange : C.ink, valign: 'middle' });
    txt(s, `${sid} · ${fmt(get(sid, 'bfs', 'expanded'))} → ${get(sid, 'astar_mst', 'expanded')} state`, { x: 11.45, y: y + 0.22, w: 1.35, h: 0.5, fontSize: 11, color: C.mid });
  });
}

// ================================================================ 17. TABEL
{
  const s = slide('Hasil 2: Biaya Sama pada Semua Algoritma Optimal', {
    notes: 'Tabel merangkum biaya, gerakan, jumlah state, dan waktu. BFS, UCS, dan A* selalu menghasilkan biaya yang sama, yaitu 23, 21, 31, dan 38. Greedy sangat cepat tetapi pada S4 menghasilkan biaya 42, lebih mahal 10,5 persen dari optimal.' });
  const head = ['Skenario', 'Algoritma', 'Biaya', 'Gerak', 'Diperiksa', 'Dibangkitkan', 'Waktu (ms)', 'Selisih'].map((t, i) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.ink }, align: i < 2 ? 'left' : 'right', fontFace: MONO, fontSize: 11 } }));
  const body = [];
  const show = [['bfs', 'BFS'], ['ucs', 'UCS'], ['astar_mst', 'A* (MST)'], ['greedy_mst', 'Greedy']];
  SIDS.forEach((sid, si) => {
    show.forEach(([c, name], ci) => {
      const hl = c === 'astar_mst';
      const o = (extra = {}) => ({ fontFace: MONO, fontSize: 12, color: C.ink, fill: { color: hl ? 'F6E3DA' : si % 2 ? 'F4F2EA' : C.paper }, valign: 'middle', border: { type: 'solid', pt: 0.5, color: C.line }, ...extra });
      const gap = get(sid, c, 'gap_pct');
      body.push([
        { text: ci === 0 ? `${sid}` : '', options: o({ bold: true, color: C.orange }) }, { text: name, options: o({ bold: hl }) },
        { text: String(get(sid, c, 'cost')), options: o({ align: 'right' }) }, { text: String(get(sid, c, 'moves')), options: o({ align: 'right' }) },
        { text: fmt(get(sid, c, 'expanded')), options: o({ align: 'right', bold: hl }) }, { text: fmt(get(sid, c, 'generated')), options: o({ align: 'right' }) },
        { text: get(sid, c, 'time_ms').toFixed(2).replace('.', ','), options: o({ align: 'right' }) }, { text: gap ? `+${String(gap).replace('.', ',')}%` : '0%', options: o({ align: 'right', color: gap ? C.pink : C.green, bold: !!gap }) },
      ]);
    });
  });
  s.addTable([head, ...body], { x: 0.6, y: 1.55, w: 12.13, colW: [1.2, 2.3, 1.1, 1.1, 1.5, 1.9, 1.7, 1.33], rowH: 0.29, margin: [0, 0.08, 0, 0.08] });
}

// ================================================================ 18. WAKTU & KUALITAS
{
  const s = slide('Hasil 3: Waktu Komputasi dan Kualitas Rencana', {
    notes: 'Kiri: waktu komputasi dalam milidetik; semua di bawah 10 ms sehingga layak untuk replanning real-time, dan A* lebih cepat daripada BFS dan UCS pada keempat skenario, dengan selisih terbesar pada S4. Kanan: kualitas rencana; heuristik rakus Greedy dan Nearest-Neighbor menghasilkan biaya 42 pada S4, 10,5 persen di atas optimal 38. Jadi urutan kunjungan benar-benar menentukan biaya total.' });
  const cfgs = [['bfs', 'BFS', C.blue], ['ucs', 'UCS', C.tan], ['astar_mst', 'A* (MST)', C.orange], ['greedy_mst', 'Greedy', '8F8D84']];
  s.addChart(pres.charts.BAR, cfgs.map(([c, name]) => ({ name, labels: SIDS, values: SIDS.map((sid) => get(sid, c, 'time_ms')) })), {
    ...chartBase, x: 0.6, y: 1.55, w: 6.0, h: 4.6, barDir: 'col', barGrouping: 'clustered', chartColors: cfgs.map((c) => c[2]),
    showValue: true, dataLabelFontSize: 9, dataLabelFormatCode: '0.0', dataLabelPosition: 'outEnd', showTitle: true, title: 'Waktu komputasi (ms, median)', titleFontSize: 14, titleColor: C.mid,
  });
  const q = [['astar_mst', 'A* (optimal)', C.orange], ['greedy_mst', 'Greedy', '8F8D84'], ['nn', 'Nearest-Neighbor', '4A4944']];
  s.addChart(pres.charts.BAR, q.map(([c, name]) => ({ name, labels: SIDS, values: SIDS.map((sid) => get(sid, c, 'cost')) })), {
    ...chartBase, x: 6.8, y: 1.55, w: 5.93, h: 4.6, barDir: 'col', barGrouping: 'clustered', chartColors: q.map((c) => c[2]),
    showValue: true, dataLabelFontSize: 11, dataLabelPosition: 'outEnd', valAxisMinVal: 0, showTitle: true, title: 'Total biaya rencana (aksi)', titleFontSize: 14, titleColor: C.mid,
  });
  card(s, 0.6, 6.3, 12.13, 0.5, { fill: 'F6E3DA', line: C.orange });
  txt(s, 'S4: Greedy dan Nearest-Neighbor menghasilkan biaya 42 — 10,5% lebih mahal dari optimal (38).', { x: 0.85, y: 6.3, w: 11.7, h: 0.5, fontSize: 14, valign: 'middle' });
}

// ================================================================ 19. HEAT-MAP 3D
{
  const s = slide('Heat-Map Ekspansi di Lantai: BFS Menyapu Semua, A* Terarah', {
    notes: 'Ini visualisasi 3D di kelas S4. Setiap petak berwarna adalah sel yang diperiksa algoritma; makin merah makin sering. BFS pada gambar kiri memeriksa hampir seluruh lantai, 3.254 state. A* di kanan hanya 96 state dan tertuju ke arah target. Inilah alasan visual mengapa heuristik penting.' });
  photo(s, IMG('heat3d_bfs_S4_crop.png'), 0.6, 1.6, 5.95, 3.56);
  photo(s, IMG('heat3d_astar_S4_crop.png'), 6.78, 1.6, 5.95, 3.56);
  txt(s, `BFS — ${fmt(get('S4', 'bfs', 'expanded'))} state diperiksa`, { x: 0.6, y: 5.42, w: 5.95, h: 0.4, fontSize: 20, color: C.blue });
  txt(s, 'Hampir seluruh lantai diperiksa; pencarian meluas ke segala arah tanpa petunjuk.', { x: 0.6, y: 5.9, w: 5.9, h: 0.9, fontSize: 14, color: C.mid });
  txt(s, `A* (MST) — ${fmt(get('S4', 'astar_mst', 'expanded'))} state diperiksa`, { x: 6.78, y: 5.42, w: 5.95, h: 0.4, fontSize: 20, color: C.orange });
  txt(s, 'Pencarian terarah ke target oleh h(n); hanya sel di sekitar rute yang diperiksa.', { x: 6.78, y: 5.9, w: 5.9, h: 0.9, fontSize: 14, color: C.mid });
}

// ================================================================ 20. SKALABILITAS
{
  const s = slide('Skalabilitas: Selisih Makin Besar Saat Target Bertambah', {
    notes: 'Kami juga menguji denah acak 10 kali 7 dengan jumlah target dari 2 sampai 9, rata-rata beberapa seed. Jumlah state BFS dan UCS tumbuh eksponensial, kira-kira dua kali lipat setiap tambahan satu target. A* dengan heuristik MST tumbuh jauh lebih lambat. Pada sembilan target, A* dengan heuristik MST hanya memeriksa sekitar 470 state, sedangkan BFS sekitar 29 ribu state: kira-kira 62 kali lebih sedikit.' });
  const cf = [['bfs', 'BFS', C.blue], ['ucs', 'UCS', C.tan], ['astar_max', 'A* (jarak-max)', C.green], ['astar_mst', 'A* (MST)', C.orange]];
  s.addChart(pres.charts.LINE, cf.map(([c, name]) => ({ name, labels: KS.map(String), values: KS.map((k) => Math.round(scal(c, k, 'expanded'))) })), {
    ...chartBase, x: 0.6, y: 1.55, w: 8.2, h: 5.25, chartColors: cf.map((c) => c[2]), lineSize: 3, lineDataSymbol: 'circle', lineDataSymbolSize: 8,
    valAxisLogScaleBase: 10, valAxisMinVal: 10, valAxisMaxVal: 100000, showCatAxisTitle: true, catAxisTitle: 'Jumlah target kotoran (k)', catAxisTitleFontSize: 12, catAxisTitleColor: C.mid,
    showTitle: true, title: 'Rata-rata state diperiksa (skala log)', titleFontSize: 14, titleColor: C.mid,
  });
  const k9 = KS[KS.length - 1];
  label(s, `Pada k = ${k9} target`, 9.2, 1.7, 3.5);
  [['BFS', 'bfs', C.blue], ['UCS', 'ucs', C.tan], ['A* (jarak-max)', 'astar_max', C.green], ['A* (MST)', 'astar_mst', C.orange]].forEach(([nm, c, col], i) => {
    const y = 2.1 + i * 0.95;
    txt(s, fmt(Math.round(scal(c, k9, 'expanded'))), { x: 9.2, y, w: 1.9, h: 0.6, fontSize: 32, color: col, valign: 'middle' });
    txt(s, `${nm}\nstate rata-rata`, { x: 11.15, y: y + 0.03, w: 1.6, h: 0.6, fontSize: 11, color: C.mid });
  });
  txt(s, `Denah acak 10×7, k = 2…9, rata-rata 5 seed. BFS/UCS tumbuh ≈ 2× tiap tambahan satu target; pada k = ${k9} A* (MST) ${(scal('bfs', k9, 'expanded') / scal('astar_mst', k9, 'expanded')).toFixed(0)}× lebih hemat dari BFS.`, { x: 9.2, y: 5.95, w: 3.5, h: 0.95, fontSize: 12, color: C.mid });
}

// ================================================================ 21. INTERAKTIF
{
  const s = slide('Mode Interaktif: Editor, Game “Kamu vs AI”, dan Replanning', {
    notes: 'Aplikasi bisa dipakai interaktif. Di mode Editor, kita klik lantai untuk menambah kotoran atau perabot, lalu A* menghitung ulang. Di mode Game, pemain mengendalikan robot dengan keyboard dan hasilnya dibandingkan dengan biaya optimal A*; memainkan rencana optimal menghasilkan kartu Setara AI. Di sisi Python, agen melakukan replanning ketika sensor jarak mendeteksi rintangan baru, dan ini diuji otomatis tanpa tabrakan.' });
  photo(s, SHOT('ui_editor.png'), 0.6, 1.6, 5.95, 3.35);
  photo(s, SHOT('ui_game_result.png'), 6.78, 1.6, 5.95, 3.35);
  txt(s, 'Mode Editor', { x: 0.6, y: 5.15, w: 5.95, h: 0.4, fontSize: 19, color: C.orange });
  txt(s, 'Klik lantai untuk menambah/menghapus kotoran dan perabot, atau acak denah; A* langsung merencanakan ulang.', { x: 0.6, y: 5.58, w: 5.9, h: 0.85, fontSize: 13, color: C.mid });
  txt(s, 'Game “Kamu vs AI”', { x: 6.78, y: 5.15, w: 5.95, h: 0.4, fontSize: 19, color: C.orange });
  txt(s, 'Kendalikan robot dengan keyboard; biayamu dibandingkan dengan rencana optimal A*.', { x: 6.78, y: 5.58, w: 5.9, h: 0.85, fontSize: 13, color: C.mid });
  card(s, 0.6, 6.4, 12.13, 0.45, { fill: C.card });
  txt(s, 'Replanning agen (Python): rintangan tak terduga terdeteksi sensor jarak → rencana disusun ulang → 0 tabrakan (diuji otomatis).', { x: 0.85, y: 6.4, w: 11.7, h: 0.45, fontSize: 13, valign: 'middle' });
}

// ================================================================ 21b. VIDEO DEMO (cadangan bila demo langsung bermasalah)
{
  const s = slide('Cuplikan Demo: A* Membersihkan Kelas Penuh (S4)', {
    notes: 'Video ini adalah rekaman aplikasi yang sama dengan demo langsung, dibuat otomatis oleh skrip tools/record_demo.py agar tetap mulus. Urutannya: pencarian dengan heat-map ekspansi, rencana ditemukan dengan biaya 38, robot mengeksekusi rencana dengan kamera ikuti, kamera robot, dan kamera sinema, lalu kartu Kelas bersih. Video tanpa suara; narasi dibawakan langsung. Bila demo langsung bermasalah, putar video ini sebagai cadangan.' });
  const mp4 = path.join(ROOT, 'docs', 'demo_S4_720p.mp4');
  const posterFile = fs.existsSync(IMG('demo_poster.png')) ? IMG('demo_poster.png') : SHOT('follow_cleaning.png');
  const poster = 'data:image/' + (posterFile.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(posterFile).toString('base64');
  if (fs.existsSync(mp4)) s.addMedia({ type: 'video', path: mp4, x: 0.6, y: 1.6, w: 8.6, h: 4.84, cover: poster });
  else photo(s, posterFile, 0.6, 1.6, 8.6, 4.84);
  const T = [['0–9 dtk', 'Pencarian A*: heat-map ekspansi menyebar di lantai; rencana biaya 38 ditemukan.', C.blue], ['9–19 dtk', 'Kamera ikuti: robot menyedot sampah satu per satu.', C.orange], ['19–25 dtk', 'Kamera robot (FPV) dengan rute menyala di lantai.', C.green], ['25–36 dtk', 'Kamera sinema, lalu kartu “Kelas bersih!”.', C.pink]];
  T.forEach(([t, d, col], i) => {
    const y = 1.62 + i * 1.22;
    s.addShape(pres.shapes.OVAL, { x: 9.6, y: y + 0.06, w: 0.2, h: 0.2, fill: { color: col }, line: { color: col, width: 0 } });
    mono(s, t, { x: 9.95, y, w: 2.8, h: 0.3, fontSize: 13, color: col });
    txt(s, d, { x: 9.95, y: y + 0.34, w: 2.8, h: 0.85, fontSize: 13, color: C.mid });
  });
  mono(s, 'Berkas: docs/demo_S4_720p.mp4 (tanpa suara, 36 dtk)', { x: 0.6, y: 6.6, w: 8.6, h: 0.3, fontSize: 11, color: C.mid });
}

// ================================================================ 22. ANALISIS
{
  const s = slide('Analisis dan Pembahasan', {
    notes: 'Empat temuan utama. Pertama efisiensi: A* jauh lebih hemat state dengan biaya identik. Kedua kualitas heuristik: pada target sedikit, jarak-max sudah cukup; pada target banyak, MST lebih informatif. Ketiga, urutan kunjungan menentukan biaya, terlihat dari Greedy yang 10,5 persen lebih mahal. Keempat keterbatasan: ruang state tumbuh eksponensial terhadap jumlah target; pada data kami BFS dan UCS sekitar dua kali lipat per target, A* dengan MST sekitar satu setengah kali.' });
  const A = [['Efisiensi', `A* memeriksa 4–34× lebih sedikit state daripada BFS/UCS dengan biaya rencana identik (optimal). Selisih makin besar saat target bertambah.`, C.orange], ['Kualitas heuristik', 'Pada S1–S2 (3 target) jarak-max sudah cukup (40 dan 29 state). Pada S3–S4 (5–6 target) MST lebih informatif: 144 vs 239 dan 96 vs 332 state.', C.green], ['Urutan kunjungan', 'Nearest-Neighbor dan Greedy menghasilkan biaya 42 pada S4 (+10,5%). Menuju target terdekat tidak menjamin tur terpendek — butuh pencarian.', C.pink], ['Keterbatasan', 'Ruang state tumbuh 2^k: BFS/UCS ≈ 2× per target tambahan, A* (MST) ≈ 1,5×; aplikasi dibatasi 12 target. Lingkungan statis & diketahui penuh; biaya 1 per aksi adalah asumsi simulasi.', C.blue]];
  A.forEach(([h, t, col], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.65 + Math.floor(i / 2) * 2.65;
    card(s, x, y, 5.95, 2.45);
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.28, w: 0.2, h: 0.2, fill: { color: col }, line: { color: col, width: 0 } });
    txt(s, h, { x: x + 0.6, y: y + 0.17, w: 4.5, h: 0.45, fontSize: 21 });
    txt(s, t, { x: x + 0.3, y: y + 0.8, w: 5.4, h: 1.6, fontSize: 16, color: C.mid });
  });
}

// ================================================================ 23. KESIMPULAN
{
  const s = slide('Kesimpulan', {
    dark: true,
    notes: 'Kesimpulan: pertama, masalah dimodelkan sebagai problem solving dengan PEAS dan lima komponen formulasi. Kedua, A* menghasilkan rencana optimal yang jauh lebih efisien daripada BFS dan UCS. Ketiga, heuristik MST admissible, consistent, dan paling efisien saat target banyak. Keempat, pipeline Python, Blender, dan three.js menghasilkan simulasi 3D realistis dan interaktif yang menjelaskan proses berpikir AI secara visual.' });
  const K = ['Masalah pembersihan ruang kelas dimodelkan sebagai problem solving melalui PEAS dan lima komponen formulasi: state, aksi, model transisi, uji tujuan, dan biaya.', 'A* menyusun rencana optimal yang mengunjungi seluruh target dan kembali ke titik awal; BFS dan UCS berbiaya sama tetapi memeriksa 4–34× lebih banyak state.', 'Heuristik MST + terdekat admissible dan consistent (diverifikasi uji otomatis) serta paling efisien saat target banyak; urutan kunjungan menentukan biaya.', 'Pipeline Python → Blender → three.js menghasilkan simulasi 3D realistis dan interaktif yang menjelaskan proses berpikir AI secara visual.'];
  K.forEach((t, i) => {
    const y = 1.6 + i * 1.3;
    s.addShape(pres.shapes.LINE, { x: 0.6, y: y - 0.1, w: 11.95, h: 0, line: { color: '3D3D3A', width: 0.75 } });
    txt(s, String(i + 1), { x: 0.6, y, w: 0.7, h: 0.9, fontSize: 40, color: C.orange });
    txt(s, t, { x: 1.5, y: y + 0.08, w: 10.9, h: 1.0, fontSize: 18, color: C.paper, valign: 'top' });
  });
}

// ================================================================ 24. SARAN
{
  const s = slide('Saran Pengembangan', {
    notes: 'Pengembangan berikutnya: baterai dan stasiun pengisian sebagai tujuan tambahan; beberapa robot dengan pembagian zona memakai K-Means; rintangan dinamis memakai D* Lite; coverage path planning untuk seluruh lantai; heuristik lebih kuat atau IDA* untuk target lebih banyak; dan uji pada robot nyata dengan ROS dan LiDAR.' });
  const S = [['Baterai & pengisian', 'Tambahkan kapasitas baterai; dock menjadi tujuan antara bila energi menipis.'], ['Banyak robot', 'Bagi target ke beberapa robot dengan K-Means (cluster-first, route-second).'], ['Rintangan dinamis', 'Replanning inkremental (D* Lite) saat siswa atau kursi berpindah.'], ['Cakupan lantai', 'Coverage path planning untuk membersihkan seluruh permukaan, bukan hanya titik.'], ['Skala lebih besar', 'Heuristik lebih kuat, IDA*, atau pembagian zona untuk puluhan target.'], ['Robot nyata', 'Uji pada robot sungguhan (ROS + LiDAR + kamera deteksi kotoran).']];
  S.forEach(([h, t], i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.7 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.9, 2.35);
    txt(s, String(i + 1), { x: x + 0.25, y: y + 0.18, w: 0.6, h: 0.7, fontSize: 34, color: C.orange });
    txt(s, h, { x: x + 0.25, y: y + 0.88, w: 3.45, h: 0.4, fontSize: 18 });
    txt(s, t, { x: x + 0.25, y: y + 1.32, w: 3.45, h: 0.95, fontSize: 13, color: C.mid });
  });
}

// ================================================================ 25. REFERENSI
{
  const s = slide('Referensi', {
    notes: 'Referensi utama adalah buku Russell dan Norvig edisi keempat untuk agen, formulasi masalah, dan algoritma pencarian; makalah A* oleh Hart, Nilsson, dan Raphael; serta rujukan robot pembersih dari UTS. Perangkat lunak: Blender, three.js, glTF, dan FastAPI.' });
  const R = ['Russell, S., & Norvig, P. (2021). Artificial Intelligence: A Modern Approach (4th ed.). Pearson.', 'Hart, P. E., Nilsson, N. J., & Raphael, B. (1968). A Formal Basis for the Heuristic Determination of Minimum Cost Paths. IEEE Transactions on Systems Science and Cybernetics, 4(2), 100–107.', 'Moon, W., Park, B., Nengroo, S. H., Kim, T., & Har, D. (2022). Path Planning of Cleaning Robot with Reinforcement Learning. arXiv:2208.08211.', 'NIST. Mobility Performance of Robotic Systems. National Institute of Standards and Technology.', 'UC Berkeley CS188. Introduction to Artificial Intelligence: Uninformed Search dan Informed Search.', 'Blender Foundation. Blender 5.2 Python API Documentation (bpy) — docs.blender.org.', 'mrdoob & kontributor. three.js documentation (r187) — threejs.org.', 'Khronos Group. glTF 2.0 Specification — khronos.org/gltf.'];
  s.addText(R.map((t, i) => ({ text: t, options: { bullet: { type: 'number' }, breakLine: i < R.length - 1 } })), { x: 0.6, y: 1.65, w: 12.1, h: 5.2, fontFace: BODY, fontSize: 16, color: C.ink, margin: 0, valign: 'top', paraSpaceAfter: 12, isTextBox: true });
}

// ================================================================ 26. PENUTUP
{
  const s = pres.addSlide({ masterName: 'COVER' });
  n++;
  coverImage(s, SHOT('cinema_run.png'), 6.4, 0, 6.933, 7.5);
  mono(s, 'TERIMA KASIH', { x: 0.7, y: 1.0, w: 5.5, h: 0.3, fontSize: 12, color: C.blue, charSpacing: 3 });
  txt(s, 'Demo langsung dan tanya jawab', { x: 0.7, y: 1.5, w: 5.5, h: 1.9, fontSize: 40, color: C.paper });
  txt(s, 'Kelompok 6 · Kelas AI-D · UIN Malang', { x: 0.7, y: 3.55, w: 5.5, h: 0.5, fontSize: 17, italic: true, color: C.gray });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 4.4, w: 5.3, h: 2.1, fill: { color: '1F1F1D' }, line: { color: '3D3D3A', width: 0.75 }, rectRadius: 0.1 });
  mono(s, 'cd UAS_CleanBot3D', { x: 0.95, y: 4.58, w: 4.9, h: 0.3, fontSize: 14, color: C.orange });
  mono(s, 'python server.py --open', { x: 0.95, y: 4.95, w: 4.9, h: 0.3, fontSize: 14, color: C.orange });
  mono(s, 'Spasi mulai · 1–5 kamera · H panel', { x: 0.95, y: 5.45, w: 4.9, h: 0.3, fontSize: 12, color: C.gray });
  mono(s, 'Lab algoritma · Editor · Game', { x: 0.95, y: 5.8, w: 4.9, h: 0.3, fontSize: 12, color: C.gray });
  s.addNotes('Terima kasih. Kami siap mendemokan aplikasi secara langsung: jalankan server Python, buka browser, tekan Spasi untuk memulai agen. Silakan beri tantangan: tambah kotoran lewat Editor atau coba mode Game Kamu vs AI.');
}

pres.writeFile({ fileName: OUT }).then((f) => console.log('Tersimpan:', f, '— slide:', n));
