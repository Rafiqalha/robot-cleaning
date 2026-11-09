"""Render halaman PDF menjadi lembar kontak (PNG) untuk pemeriksaan visual.

    python docs_build/pdf_sheets.py laporan.pdf docs_build/qa/lap [kolom=3] [baris=2] [lebar=560]
    python docs_build/pdf_sheets.py laporan.pdf docs_build/qa/lap --page 12 [dpi]
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageDraw


def main() -> None:
    pdf = Path(sys.argv[1])
    prefix = Path(sys.argv[2])
    prefix.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    if "--page" in sys.argv:
        i = int(sys.argv[sys.argv.index("--page") + 1])
        dpi = int(sys.argv[sys.argv.index("--page") + 2]) if len(sys.argv) > sys.argv.index("--page") + 2 else 110
        pix = doc[i - 1].get_pixmap(dpi=dpi)
        out = f"{prefix}_p{i:02d}.png"
        pix.save(out)
        print(out, pix.width, pix.height)
        return
    args = [a for a in sys.argv[3:] if not a.startswith("--")]
    cols = int(args[0]) if len(args) > 0 else 3
    rows = int(args[1]) if len(args) > 1 else 2
    width = int(args[2]) if len(args) > 2 else 560
    per = cols * rows
    n = len(doc)
    for s in range(0, n, per):
        tiles = []
        for i in range(s, min(s + per, n)):
            pix = doc[i].get_pixmap(dpi=int(round(72 * width / doc[i].rect.width)))
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            ImageDraw.Draw(im).text((6, 4), f"p{i + 1}", fill=(200, 0, 0))
            tiles.append(im)
        h = max(t.height for t in tiles)
        sheet = Image.new("RGB", (cols * (width + 8) + 8, rows * (h + 8) + 8), (90, 90, 90))
        for j, t in enumerate(tiles):
            sheet.paste(t, (8 + (j % cols) * (width + 8), 8 + (j // cols) * (h + 8)))
        out = f"{prefix}_sheet{s // per + 1:02d}.png"
        sheet.save(out)
        print(out, sheet.size)
    print("halaman:", n)


if __name__ == "__main__":
    main()
