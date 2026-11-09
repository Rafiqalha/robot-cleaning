// Pembangun Laporan Mini Project (docx-js). Daftar isi/gambar/tabel diisi oleh Word (docs_build/word_finalize.py).
//   node docs_build/make_report.js "D:/.../Laporan.docx"
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, SectionType, NumberFormat } = require('docx');
const lib = require('./report_lib');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '..', 'Laporan_Mini_Project_UAS_AI_Kelompok6.docx');
const J = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

// ------------------------------------------------------------------ data
const rows = J('results', 'benchmark_skenario.json');
const srows = J('results', 'benchmark_skalabilitas.json');
const rd = J('docs_build', 'report_data.json');
const meta = J('web', 'data', 'meta.json');

const SIDS = ['S1', 'S2', 'S3', 'S4'];
const CFG = [['bfs', 'BFS'], ['ucs', 'UCS'], ['astar_manhattan', 'A* (Manhattan)'], ['astar_max', 'A* (jarak-max)'], ['astar_mst', 'A* (MST)'], ['greedy_mst', 'Greedy (MST)'], ['nn', 'Nearest-Neighbor']];
const KS = [...new Set(srows.map((r) => r.k))].sort((a, b) => a - b);
const fmt = (n) => Number(n).toLocaleString('id-ID');
const dec = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
const g = (sid, cfg, key) => rows.find((r) => r.scenario === sid && r.config === cfg)[key];
const S = (cfg, k, key) => {
  const xs = srows.filter((r) => r.config === cfg && r.k === k).map((r) => r[key]);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};
const k9 = KS[KS.length - 1];
const spaces = { ratio9: String(Math.round(S('bfs', k9, 'expanded') / S('astar_mst', k9, 'expanded'))) };
const scenarios = meta.scenarios.map((s) => ({ id: s.id, name: s.name, width: s.width, height: s.height, free: s.width * s.height - s.obstacles.length, targets: s.targets.map((t) => [t.x, t.y]) }));
const D = { fmt, dec, g, S, KS, rd, CFG, SIDS, spaces, scenarios, rows };

// ------------------------------------------------------------------ isi
const { front, bodyA } = require('./report_content_a')(D);
const { bodyB } = require('./report_content_b')(D);
const body = [...bodyA, ...bodyB];

lib.assignLabels([...front, ...body]);

// ------------------------------------------------------------------ sampul
const C = (children, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 276, after: 120 }, children, ...o });
const T = (text, o = {}) => new TextRun({ text, font: lib.FONT, ...o });
const PH = (text, o = {}) => new TextRun({ text, font: lib.FONT, highlight: 'yellow', ...o });
const icon = path.join(__dirname, 'img', 'robot_icon.png');
const members = [['Rafiq Alhariri Andriansyah', '240605110178'], ['Ahmad Zamroni', '240605110216'], ['Afzaal Abrar Hidayat', '240605110206']];

const cover = [
  C([T('LAPORAN MINI PROJECT', { bold: true, size: 34 })], { spacing: { before: 200, after: 160 } }),
  C([T('MATA KULIAH KECERDASAN BUATAN', { bold: true, size: 26 })], { spacing: { after: 40 } }),
  C([T('(ARTIFICIAL INTELLIGENCE)', { size: 24 })], { spacing: { after: 40 } }),
  C([T('Ujian Akhir Semester (UAS)', { size: 24 })], { spacing: { after: 520 } }),
  C([new ImageRun({ type: 'png', data: fs.readFileSync(icon), transformation: { width: 118, height: 118 }, altText: { name: 'ikon', title: 'Ikon CleanBot', description: 'Ikon robot pembersih CleanBot' } })], { spacing: { after: 360 } }),
  C([T('PERENCANAAN RUTE ROBOT PEMBERSIH DI RUANG KELAS MENGGUNAKAN ALGORITMA A* DENGAN SIMULASI 3D', { bold: true, size: 30 })], { spacing: { line: 336, after: 100 } }),
  C([T('(Python, Blender, dan three.js)', { italics: true, size: 26 })], { spacing: { after: 560 } }),
  C([T('Disusun oleh:', { size: 24 })], { spacing: { after: 100 } }),
  C([T('Kelompok 6 — Kelas AI-D', { bold: true, size: 24 })], { spacing: { after: 140 } }),
  ...members.map(([n, nim]) => C([T(`${n}  (${nim})`, { size: 24 })], { spacing: { line: 300, after: 40 } })),
  C([T('Dosen Pengampu:', { size: 24 })], { spacing: { before: 360, after: 40 } }),
  C([PH('[Nama Dosen Pengampu]', { size: 24 })], { spacing: { after: 560 } }),
  C([T('UNIVERSITAS ISLAM NEGERI MAULANA MALIK IBRAHIM MALANG', { bold: true, size: 26 })], { spacing: { after: 40 } }),
  C([PH('[Program Studi / Fakultas]', { size: 24 })], { spacing: { after: 40 } }),
  C([T('2026', { bold: true, size: 26 })], { spacing: { after: 0 } }),
];

// tanda tangan kata pengantar
const sign = [
  new Paragraph({ indent: { left: 4700 }, spacing: { before: 240, after: 0, line: 300 }, children: [T('Malang, November 2026', { size: 24 })] }),
  new Paragraph({ indent: { left: 4700 }, spacing: { after: 0, line: 300 }, children: [T('Penulis,', { size: 24 })] }),
  new Paragraph({ indent: { left: 4700 }, spacing: { before: 600, after: 0, line: 300 }, children: [T('Kelompok 6', { size: 24, bold: true })] }),
];
const frontFixed = front.map((b) => (b.t === 'raw' && b.nodes === 'KATA_PENGANTAR_TTD' ? { t: 'raw', nodes: sign } : b));

// ------------------------------------------------------------------ dokumen
const page = (extra = {}) => ({ size: { width: lib.PAGE.w, height: lib.PAGE.h }, margin: lib.MARGIN, ...extra });
const doc = new Document({
  creator: 'Kelompok 6 — Kelas AI-D',
  title: 'Perencanaan Rute Robot Pembersih di Ruang Kelas Menggunakan Algoritma A* dengan Simulasi 3D',
  description: 'Laporan Mini Project UAS Kecerdasan Buatan',
  styles: lib.styles,
  numbering: lib.numbering,
  sections: [
    { properties: { page: page() }, children: cover },
    { properties: { type: SectionType.NEXT_PAGE, page: page({ pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } }) }, footers: { default: lib.footer() }, children: lib.render(frontFixed, true) },
    { properties: { type: SectionType.NEXT_PAGE, page: page({ pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }) }, footers: { default: lib.footer() }, children: lib.render(body, true) },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('Tersimpan:', OUT, `(${(buf.length / 1e6).toFixed(2)} MB)`);
  console.log('Gambar:', Object.keys(lib.registry.fig).length, '· Tabel:', Object.keys(lib.registry.tab).length, '· Kode:', Object.keys(lib.registry.lst).length);
});
