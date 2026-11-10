"""Buat salinan PPT untuk laporan progres: slide yang tidak dipakai DISEMBUNYIKAN (bukan dihapus).

Mode tayang (F5) melewati slide tersembunyi otomatis; di editor slide itu tampak redup dan dapat ditampilkan lagi
(klik kanan > Hide Slide). Dokumen asli tidak diubah; catatan pembicara dan video tertanam tetap ada.

    python docs_build/make_progress_deck.py                       # keluaran: ../Presentasi_Progress1_CleanBot3D_Kelompok6.pptx
    python docs_build/make_progress_deck.py --keep 1,2,5,14,20    # pilih slide sendiri
"""
from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dokumen" / "UAS_AI_Mini_Project_Kelompok6_CleanBot3D.pptx"
OUT = ROOT.parent / "Presentasi_Progress1_CleanBot3D_Kelompok6.pptx"
# Cover, latar belakang, PEAS, formulasi masalah, arsitektur (peta source code), skenario (dataset masukan),
# hasil A* vs BFS, skalabilitas (dataset acak), kesimpulan, penutup
KEEP = "1,2,5,6,9,14,16,20,24,27"

NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def slide_parts(z: zipfile.ZipFile) -> list[str]:
    """Nama bagian slide menurut URUTAN tayang (bukan urutan nomor berkas)."""
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("ppt/_rels/presentation.xml.rels")).iter(f"{{{NS_REL}}}Relationship")}
    parts = []
    for sld in pres.find(f"{{{NS_P}}}sldIdLst"):
        target = rels[sld.get(f"{{{NS_R}}}id")].lstrip("/")
        parts.append(target if target.startswith("ppt/") else "ppt/" + target)
    return parts


def set_hidden(xml: bytes, hidden: bool) -> bytes:
    """Tambah/hapus atribut show="0" pada elemen akar <p:sld>."""
    text = xml.decode("utf-8")
    tag = re.search(r"<p:sld\b[^>]*>", text).group(0)
    new = re.sub(r'\sshow="[^"]*"', "", tag)
    if hidden:
        new = new[:-1] + ' show="0">'
    return text.replace(tag, new, 1).encode("utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(SRC))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--keep", default=KEEP, help="nomor slide yang ditayangkan, dipisah koma")
    args = ap.parse_args()
    keep = {int(x) for x in args.keep.split(",") if x.strip()}

    with zipfile.ZipFile(args.src) as zin:
        parts = slide_parts(zin)
        if not keep <= set(range(1, len(parts) + 1)):
            sys.exit(f"Nomor slide di luar 1..{len(parts)}: {sorted(keep - set(range(1, len(parts) + 1)))}")
        hide_parts = {p for i, p in enumerate(parts, 1) if i not in keep}
        show_parts = set(parts) - hide_parts
        with zipfile.ZipFile(args.out, "w") as zout:
            for zi in zin.infolist():
                data = zin.read(zi.filename)
                if zi.filename in hide_parts:
                    data = set_hidden(data, True)
                elif zi.filename in show_parts:
                    data = set_hidden(data, False)
                zout.writestr(zi, data, compress_type=zi.compress_type)

    # verifikasi: arsip utuh, XML sah, dan python-pptx dapat membukanya
    with zipfile.ZipFile(args.out) as z:
        assert z.testzip() is None, "arsip rusak"
        for i, p in enumerate(slide_parts(z), 1):
            root = ET.fromstring(z.read(p))
            assert (root.get("show") == "0") == (i not in keep), f"atribut show salah pada slide {i}"
    from pptx import Presentation

    prs = Presentation(args.out)
    print(f"{args.out}  ({Path(args.out).stat().st_size / 1e6:.1f} MB), {len(prs.slides)} slide, {len(keep)} ditayangkan")
    for i, s in enumerate(prs.slides, 1):
        title = next((sh.text_frame.text.strip().split("\n")[0] for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()), "")
        notes = "catatan" if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip() else "-"
        print(f"  {'TAYANG ' if i in keep else 'sembunyi'} {i:>2}. {title[:70]}  [{notes}]")


if __name__ == "__main__":
    main()
