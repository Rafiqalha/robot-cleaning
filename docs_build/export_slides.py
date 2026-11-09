"""Ekspor setiap slide PPTX menjadi PNG lewat PowerPoint (COM) untuk pemeriksaan visual.

    python docs_build/export_slides.py "D:/.../deck.pptx" docs_build/qa 1600
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path


def strip_dir_entries(pptx: Path) -> None:
    """Hapus entri folder di dalam ZIP (beberapa layanan cloud menolaknya)."""
    tmp = pptx.with_suffix(".tmp")
    with zipfile.ZipFile(pptx) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.endswith("/"):
                continue
            zout.writestr(item, zin.read(item.filename))
    tmp.replace(pptx)


def export(pptx: Path, out: Path, width: int) -> int:
    import win32com.client  # type: ignore

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("slide_*.png"):
        old.unlink()
    app = win32com.client.Dispatch("PowerPoint.Application")
    pres = app.Presentations.Open(str(pptx.resolve()), ReadOnly=True, Untitled=False, WithWindow=False)
    try:
        w = pres.PageSetup.SlideWidth
        h = pres.PageSetup.SlideHeight
        height = int(round(width * h / w))
        n = pres.Slides.Count
        for i in range(1, n + 1):
            pres.Slides(i).Export(str((out / f"slide_{i:02d}.png").resolve()), "PNG", width, height)
        return n
    finally:
        pres.Close()
        app.Quit()


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    wid = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
    if "--strip" in sys.argv:
        strip_dir_entries(src)
        print("entri folder dihapus")
    print("slide diekspor:", export(src, dst, wid))
