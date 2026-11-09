"""Siapkan gambar turunan untuk PPT/laporan: potongan panel HUD, ikon robot, kolase."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs_build" / "img"
OUT.mkdir(parents=True, exist_ok=True)


def crop(src: str, box: tuple[int, int, int, int], dst: str) -> None:
    im = Image.open(SHOTS / src).convert("RGB")
    im.crop(box).save(OUT / dst)
    print("  ", dst, box)


def robot_icon(size: int = 256) -> None:
    s = size / 64
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    orange, white, ink = (217, 119, 87, 255), (255, 255, 255, 255), (20, 20, 19, 255)
    d.rounded_rectangle([9 * s, 12 * s, 55 * s, 48 * s], radius=9 * s, fill=orange, outline=white, width=int(3 * s))
    for pts in (((22, 25), (31, 31), (22, 37)), ((42, 25), (33, 31), (42, 37))):
        d.line([(x * s, y * s) for x, y in pts], fill=ink, width=int(3.4 * s), joint="curve")
    for x0 in (17, 38):
        d.rounded_rectangle([x0 * s, 48 * s, (x0 + 9) * s, 59 * s], radius=2 * s, fill=orange, outline=white, width=int(2.5 * s))
    im.save(OUT / "robot_icon.png")
    print("   robot_icon.png")


def deck_images() -> None:
    """Versi JPEG ringan (lebar maks 1600 px) untuk PPT agar berkasnya kecil; dipakai otomatis oleh make_deck.js."""
    out = ROOT / "docs_build" / "deck_img"
    out.mkdir(exist_ok=True)
    srcs = list(SHOTS.glob("*.png")) + list((ROOT / "docs" / "blender_previews").glob("*.png")) + [p for p in OUT.glob("*.png") if p.name != "robot_icon.png" and p.stat().st_size > 150_000]
    for p in srcs:
        im = Image.open(p).convert("RGB")
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(out / f"{p.stem}.jpg", quality=88, optimize=True)
    print("   deck_img:", len(srcs), "gambar")


def main() -> None:
    robot_icon()
    # panel kanan HUD (PEAS / Masalah / Metrik) dan panel kiri, adegan 3D saja
    right = (1555, 82, 1902, 1000)
    left = (18, 82, 314, 1000)
    scene = (322, 76, 1546, 1010)
    if (SHOTS / "ui_peas_S3.png").exists():
        crop("ui_peas_S3.png", right, "panel_peas.png")
    if (SHOTS / "ui_exec_S3.png").exists():
        crop("ui_exec_S3.png", right, "panel_masalah.png")
        crop("ui_exec_S3.png", scene, "scene_exec_S3.png")
        crop("ui_exec_S3.png", left, "panel_kontrol.png")
    if (SHOTS / "ui_search_S3.png").exists():
        crop("ui_search_S3.png", right, "panel_metrik.png")
        crop("ui_search_S3.png", scene, "scene_search_S3.png")
    if (SHOTS / "ui_plan_S3.png").exists():
        crop("ui_plan_S3.png", right, "panel_rencana.png")
    # bagian atas panel PEAS (hanya empat kartu P-E-A-S) dan potongan tengah adegan 3D
    if (SHOTS / "ui_peas_S3.png").exists():
        crop("ui_peas_S3.png", (1555, 82, 1902, 612), "panel_peas_top.png")
    for src in ("heat3d_bfs_S4", "heat3d_astar_S4", "route_S3", "route_S4"):
        if (SHOTS / f"{src}.png").exists():
            crop(f"{src}.png", (150, 100, 1770, 1070), f"{src}_crop.png")
    deck_images()


if __name__ == "__main__":
    main()
