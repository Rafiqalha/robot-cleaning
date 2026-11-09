// Pustaka kecil pembangun laporan .docx (docx-js): gaya, paragraf, tabel, gambar, kode, penomoran referensi silang.
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Footer, HeadingLevel, ImageRun, LevelFormat, PageNumber, Paragraph, ShadingType, Tab, TabStopType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType,
} = require('docx');

const FONT = 'Times New Roman';
const MONO = 'Courier New';
const PAGE = { w: 11906, h: 16838 }; // A4
const MARGIN = { top: 1701, bottom: 1701, left: 2268, right: 1701 }; // 3 cm, 3 cm, 4 cm, 3 cm
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right; // 7937 DXA (~14 cm)
const IMG_DIR = path.join(__dirname, 'report_img');
const SIZES = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'sizes.json'), 'utf8'));

// ------------------------------------------------------------------ registri referensi silang
const registry = { fig: {}, tab: {}, lst: {} };

function assignLabels(blocks) {
  let ch = 0;
  const cnt = { fig: 0, tab: 0, lst: 0 };
  for (const b of blocks) {
    if (b.t === 'h1' && b.chapter) {
      ch = b.chapter;
      cnt.fig = cnt.tab = cnt.lst = 0;
    }
    if (b.t === 'h1' && b.appendix) {
      ch = b.appendix; // huruf lampiran: A, B, ...
      cnt.fig = cnt.tab = cnt.lst = 0;
    }
    if (b.t === 'fig') registry.fig[b.key] = b.label = `Gambar ${ch}.${++cnt.fig}`;
    if (b.t === 'tab') registry.tab[b.key] = b.label = `Tabel ${ch}.${++cnt.tab}`;
    if (b.t === 'code' && b.caption) registry.lst[b.key] = b.label = `Kode ${ch}.${++cnt.lst}`;
  }
}

function resolveRefs(text) {
  return text.replace(/\{(fig|tab|lst):([a-z0-9_]+)\}/gi, (_, kind, key) => {
    const v = registry[kind.toLowerCase()][key];
    if (!v) throw new Error(`Referensi silang tidak ditemukan: ${kind}:${key}`);
    return v;
  });
}

// ------------------------------------------------------------------ teks bergaya
// penanda: **tebal**, __miring__, `kode`, ^{atas}, _{bawah}. Tanda * tunggal (mis. A*) aman dipakai apa adanya.
function runs(text, base = {}) {
  text = resolveRefs(text);
  const out = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\^\{[^}]+\}|_\{[^}]+\})/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), ...base, bold: true }));
    else if (tok.startsWith('__')) out.push(new TextRun({ text: tok.slice(2, -2), ...base, italics: true }));
    else if (tok.startsWith('`')) out.push(new TextRun({ text: tok.slice(1, -1), ...base, font: MONO, size: Math.max(16, (base.size || 24) - 3) }));
    else if (tok.startsWith('^')) out.push(new TextRun({ text: tok.slice(2, -1), ...base, superScript: true }));
    else out.push(new TextRun({ text: tok.slice(2, -1), ...base, subScript: true }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

// ------------------------------------------------------------------ blok
const para = (text, o = {}) =>
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 567 }, spacing: { line: 360, after: 120 }, children: runs(text), ...o });

const plain = (text, o = {}) => new Paragraph({ spacing: { line: 360, after: 120 }, alignment: AlignmentType.JUSTIFIED, children: runs(text), ...o });

function h1(b) {
  const label = b.chapter ? `BAB ${b.roman}` : b.appendix ? `LAMPIRAN ${b.appendix}` : null;
  const kids = [];
  if (label) {
    kids.push(new TextRun({ text: label + ' ' }));
    kids.push(new TextRun({ text: b.text.toUpperCase(), break: 1 }));
  } else {
    kids.push(new TextRun({ text: b.text.toUpperCase() }));
  }
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: kids });
}
const h2 = (b) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.text })] });
const h3 = (b) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: b.text })] });
const front = (text) => new Paragraph({ style: 'JudulBagianDepan', children: [new TextRun({ text: text.toUpperCase() })] });

let numInstance = 0;
function bullets(items) {
  return items.map((t, i) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 340, after: i === items.length - 1 ? 140 : 60 }, children: runs(t) }));
}
function numbered(items) {
  const inst = ++numInstance;
  return items.map((t, i) => new Paragraph({ numbering: { reference: 'numbers', level: 0, instance: inst }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 340, after: i === items.length - 1 ? 140 : 60 }, children: runs(t) }));
}

function equation(text, no) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.CENTER, position: Math.round(CONTENT_W / 2) }, { type: TabStopType.RIGHT, position: CONTENT_W }],
    spacing: { line: 300, before: 80, after: 160 },
    children: [new TextRun({ children: [new Tab()] }), ...runs(text, { italics: true }), new TextRun({ children: [new Tab(), `(${no})`] })],
  });
}

// gambar ------------------------------------------------------------------------------------
function figure(b) {
  const file = b.file;
  const [iw, ih] = SIZES[file];
  const w = Math.round((b.width || 520));
  const h = Math.round((w * ih) / iw);
  const ext = path.extname(file).slice(1).toLowerCase() === 'jpg' ? 'jpg' : 'png';
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60, line: 240 },
      children: [new ImageRun({ type: ext, data: fs.readFileSync(path.join(IMG_DIR, file)), transformation: { width: w, height: h }, altText: { name: b.key, title: b.caption, description: b.caption } })],
    }),
    new Paragraph({ style: 'KeteranganGambar', children: [new TextRun({ text: `${b.label} `, bold: true }), ...runs(b.caption)] }),
  ];
}

// tabel -------------------------------------------------------------------------------------
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '7F7F7F' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text, w, { head = false, align = AlignmentType.LEFT, fill, size = 21, bold = false, mono = false, span, keep = false } = {}) {
  const base = { size };
  if (head || bold) base.bold = true;
  if (mono) base.font = MONO;
  const lines = String(text).split('\n');
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: BORDERS, verticalAlign: VerticalAlign.CENTER, columnSpan: span,
    shading: head ? { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' } : fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: lines.map((ln) => new Paragraph({ alignment: head ? AlignmentType.CENTER : align, spacing: { line: 252, after: 0 }, keepNext: keep, children: runs(ln, base) })),
  });
}

function table(b) {
  const total = b.widths.reduce((a, c) => a + c, 0);
  if (total !== CONTENT_W) {
    // normalisasi agar jumlah kolom tepat selebar area teks
    const k = CONTENT_W / total;
    b.widths = b.widths.map((x) => Math.round(x * k));
    b.widths[b.widths.length - 1] += CONTENT_W - b.widths.reduce((a, c) => a + c, 0);
  }
  const size = b.size || 21;
  const aligns = (b.align || []).map((a) => (a === 'r' ? AlignmentType.RIGHT : a === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT));
  const rows = [];
  const keepAll = b.rows.length <= 9;
  rows.push(new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((t, i) => cell(t, b.widths[i], { head: true, size, keep: true })) }));
  b.rows.forEach((r, ri) => {
    const fill = b.highlight && b.highlight(r, ri) ? 'FBE9E1' : b.zebra && ri % 2 ? 'F5F5F5' : undefined;
    rows.push(new TableRow({
      cantSplit: true,
      children: r.map((t, i) => cell(t, b.widths[i], { align: aligns[i] || AlignmentType.LEFT, size, fill, mono: b.mono && b.mono.includes(i), bold: b.boldFirst && i === 0, keep: keepAll ? (ri < b.rows.length - 1 || !!b.note) : ri === 0 })),
    }));
  });
  const out = [
    new Paragraph({ style: 'KeteranganTabel', keepNext: true, children: [new TextRun({ text: `${b.label} `, bold: true }), ...runs(b.caption)] }),
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: b.widths, layout: TableLayoutType.FIXED, rows }),
  ];
  out.push(new Paragraph({ spacing: { before: 60, after: b.note ? 40 : 200, line: 240 }, children: b.note ? runs(b.note, { size: 20, italics: true }) : [] }));
  if (b.note) out.push(new Paragraph({ spacing: { after: 160, line: 120 }, children: [] }));
  return out;
}

// kode --------------------------------------------------------------------------------------
function code(b) {
  const lines = b.lines;
  const keep = b.keep !== false;
  const out = [];
  if (b.caption) out.push(new Paragraph({ style: 'KeteranganKode', keepNext: true, children: [new TextRun({ text: `${b.label} `, bold: true }), ...runs(b.caption)] }));
  lines.forEach((ln, i) => {
    out.push(new Paragraph({
      keepLines: true, keepNext: keep && i < lines.length - 1, indent: { left: 113, right: 113 },
      shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D97757', space: 4 } },
      spacing: { line: 232, after: 0, before: i === 0 ? 40 : 0 },
      children: [new TextRun({ text: ln.length ? ln : ' ', font: MONO, size: b.size || 17 })],
    }));
  });
  out.push(new Paragraph({ spacing: { after: 160, line: 120 }, children: [] }));
  return out;
}

function reference(text) {
  return new Paragraph({ indent: { left: 567, hanging: 567 }, spacing: { line: 276, after: 140 }, alignment: AlignmentType.LEFT, children: runs(text) });
}

function placeholder(tag) {
  return new Paragraph({ children: [new TextRun({ text: tag })] });
}

// ------------------------------------------------------------------ gaya dokumen
const styles = {
  default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360 } } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: 300 }, keepNext: true, pageBreakBefore: true, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 280, after: 120, line: 300 }, keepNext: true, outlineLevel: 1 } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, italics: true }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 200, after: 100, line: 300 }, keepNext: true, outlineLevel: 2 } },
    { id: 'JudulBagianDepan', name: 'Judul Bagian Depan', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 28, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: 300 }, keepNext: true, pageBreakBefore: true, outlineLevel: 0 } },
    { id: 'KeteranganGambar', name: 'Keterangan Gambar', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22 }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240, line: 252 } } },
    { id: 'KeteranganTabel', name: 'Keterangan Tabel', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22 }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80, line: 252 }, keepNext: true } },
    { id: 'KeteranganKode', name: 'Keterangan Kode', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22 }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80, line: 252 }, keepNext: true } },
    { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 24 }, paragraph: { spacing: { before: 30, after: 10, line: 250 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: 'dot' }] } },
    { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 24 }, paragraph: { indent: { left: 340 }, spacing: { before: 0, after: 10, line: 250 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: 'dot' }] } },
    { id: 'TOC3', name: 'toc 3', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 24 }, paragraph: { indent: { left: 680 }, spacing: { before: 0, after: 0, line: 250 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: 'dot' }] } },
  ],
};

const numbering = {
  config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 794, hanging: 397 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 794, hanging: 454 } } } }] },
  ],
};

const footer = () =>
  new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] });

// ------------------------------------------------------------------ render blok -> elemen docx
function render(blocks, labelled = false) {
  if (!labelled) assignLabels(blocks);
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h1': out.push(h1(b)); break;
      case 'h2': out.push(h2(b)); break;
      case 'h3': out.push(h3(b)); break;
      case 'front': out.push(front(b.text)); break;
      case 'p': out.push(para(b.text, b.opts)); break;
      case 'plain': out.push(plain(b.text, b.opts)); break;
      case 'bul': out.push(...bullets(b.items)); break;
      case 'num': out.push(...numbered(b.items)); break;
      case 'eq': out.push(equation(b.text, b.no)); break;
      case 'fig': out.push(...figure(b)); break;
      case 'tab': out.push(...table(b)); break;
      case 'code': out.push(...code(b)); break;
      case 'ref': out.push(reference(b.text)); break;
      case 'ph': out.push(placeholder(b.tag)); break;
      case 'raw': out.push(...b.nodes); break;
      default: throw new Error(`Jenis blok tidak dikenal: ${b.t}`);
    }
  }
  return out;
}

module.exports = { FONT, MONO, PAGE, MARGIN, CONTENT_W, styles, numbering, footer, render, runs, para, plain, registry, assignLabels };
