"""Finalisasi laporan di Microsoft Word (COM): isi daftar isi/gambar/tabel, perbarui nomor halaman, simpan, ekspor PDF.

    python docs_build/word_finalize.py "D:/.../Laporan.docx" ["D:/.../Laporan.pdf"]

Daftar isi berupa field Word asli (dapat diperbarui lewat klik kanan > Update Field).
"""
from __future__ import annotations

import os
import sys
import zipfile


def strip_dir_entries(path: str) -> None:
    tmp = path + ".tmp"
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.endswith("/"):
                continue
            zout.writestr(item, zin.read(item.filename))
    os.replace(tmp, path)


def detect_separator(word) -> str:
    """Pemisah gaya,level pada saklar \\t bergantung pada pengaturan regional (',' atau ';'): uji pada dokumen sementara."""
    tmp = word.Documents.Add()
    try:
        tmp.Styles.Add("Keterangan Gambar", 1)
        tmp.Content.Text = "Gambar 1.1 Contoh"
        tmp.Paragraphs(1).Style = "Keterangan Gambar"
        for sep in (",", ";"):
            rng = tmp.Content
            rng.Collapse(0)
            fld = tmp.Fields.Add(Range=rng, Type=-1, Text=f'TOC \\h \\z \\t "Keterangan Gambar{sep}1"', PreserveFormatting=False)
            fld.Update()
            ok = "Error" not in fld.Result.Text
            fld.Delete()
            if ok:
                return sep
    finally:
        tmp.Close(False)
    return ","


def finalize(docx_path: str, pdf_path: str | None = None) -> None:
    import win32com.client  # type: ignore

    docx_path = os.path.abspath(docx_path)
    pdf_path = os.path.abspath(pdf_path or os.path.splitext(docx_path)[0] + ".pdf")
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(docx_path)
        sep = detect_separator(word)
        print("pemisah daftar:", repr(sep))
        codes = {
            "{{TOC}}": 'TOC \\o "1-3" \\h \\z \\u',
            "{{LOF}}": f'TOC \\h \\z \\t "Keterangan Gambar{sep}1"',
            "{{LOT}}": f'TOC \\h \\z \\t "Keterangan Tabel{sep}1"',
        }
        for tag, code in codes.items():
            rng = doc.Content
            if rng.Find.Execute(FindText=tag, MatchCase=True, Forward=True, Wrap=0):
                rng.Text = ""
                doc.Fields.Add(Range=rng, Type=-1, Text=code, PreserveFormatting=False)
                print("field disisipkan:", tag)
            else:
                print("PERINGATAN: penanda tidak ditemukan:", tag)
        for _ in range(2):  # dua putaran: panjang daftar memengaruhi penomoran halaman
            doc.Repaginate()
            doc.Fields.Update()
            for t in doc.TablesOfContents:
                t.Update()
        print("jumlah daftar isi/gambar/tabel:", doc.TablesOfContents.Count)
        print("halaman:", doc.ComputeStatistics(2), "· kata:", doc.ComputeStatistics(0))
        for i in range(1, doc.TablesOfContents.Count + 1):
            txt = doc.TablesOfContents(i).Range.Text
            print(f"--- daftar {i}: {len(txt.splitlines())} baris; awal:")
            print("\n".join(txt.splitlines()[:4]))
            if "Error" in txt:
                print("PERINGATAN: ada galat pada daftar", i)
        doc.Save()
        try:
            doc.ExportAsFixedFormat(OutputFileName=pdf_path, ExportFormat=17, OpenAfterExport=False, OptimizeFor=0, CreateBookmarks=1, DocStructureTags=True, BitmapMissingFonts=True)
        except Exception as exc:  # noqa: BLE001
            print("ekspor dengan penanda gagal, coba sederhana:", exc)
            doc.ExportAsFixedFormat(pdf_path, 17)
        print("PDF:", pdf_path, os.path.getsize(pdf_path))
        doc.Close(False)
    finally:
        try:
            word.Quit()
        except Exception as exc:  # noqa: BLE001
            print("Word.Quit:", exc)
    strip_dir_entries(docx_path)


if __name__ == "__main__":
    finalize(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
