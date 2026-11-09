"""Siapkan gambar, diagram, dan data tambahan untuk Laporan Mini Project (docx).

    python docs_build/prep_report.py

Keluaran: docs_build/report_img/*.{png,jpg} dan docs_build/report_data.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from cleanbot.agent import ClassroomEnvironment, CleaningAgent, run_episode  # noqa: E402
from cleanbot.benchmark import problem_from_scenario  # noqa: E402
from cleanbot.plots import BLUE, CARD, GRAY, GREEN, INK, MID, ORANGE, PAPER, PINK, SAGE, TAN  # noqa: E402
from cleanbot.scenarios import catalog  # noqa: E402
from cleanbot.search import solve  # noqa: E402

SHOTS = ROOT / "docs" / "screenshots"
BLN = ROOT / "docs" / "blender_previews"
FIGS = ROOT / "results" / "figures"
IMG = ROOT / "docs_build" / "img"
OUT = ROOT / "docs_build" / "report_img"
OUT.mkdir(parents=True, exist_ok=True)

SERIF = ["Georgia", "DejaVu Serif"]


# ---------------------------------------------------------------- gambar
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for name in (("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans.ttf"):
        for base in ("C:/Windows/Fonts/", ""):
            try:
                return ImageFont.truetype(base + name, size)
            except OSError:
                continue
    return ImageFont.load_default()


def load(path: Path, crop: tuple[int, int, int, int] | None = None) -> Image.Image:
    im = Image.open(path).convert("RGB")
    return im.crop(crop) if crop else im


def fit_width(im: Image.Image, w: int) -> Image.Image:
    if im.width <= w:
        return im
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def save_jpg(im: Image.Image, name: str, max_w: int = 1500, q: int = 88) -> None:
    fit_width(im, max_w).save(OUT / name, quality=q, optimize=True)
    print("  ", name, fit_width(im, max_w).size)


def label_tile(im: Image.Image, text: str) -> Image.Image:
    im = im.copy()
    d = ImageDraw.Draw(im, "RGBA")
    f = font(max(20, im.width // 24), True)
    tw = d.textlength(text, font=f)
    pad = f.size * 0.45
    d.rounded_rectangle([14, im.height - f.size - 2 * pad - 14, 14 + tw + 2 * pad, im.height - 14], radius=10, fill=(20, 20, 19, 205))
    d.text((14 + pad, im.height - f.size - pad - 14 - f.size * 0.1), text, font=f, fill=(255, 255, 255, 255))
    return im


def collage(tiles: list[Image.Image], cols: int, tile_w: int, gap: int = 14, bg=(250, 249, 245), labels: list[str] | None = None) -> Image.Image:
    rows = (len(tiles) + cols - 1) // cols
    scaled = [t.resize((tile_w, round(t.height * tile_w / t.width)), Image.LANCZOS) for t in tiles]
    if labels:
        scaled = [label_tile(t, lb) for t, lb in zip(scaled, labels)]
    row_h = [max(t.height for t in scaled[r * cols:(r + 1) * cols]) for r in range(rows)]
    W = cols * tile_w + (cols + 1) * gap
    H = sum(row_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (W, H), bg)
    y = gap
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if i < len(scaled):
                sheet.paste(scaled[i], (gap + c * (tile_w + gap), y))
        y += row_h[r] + gap
    return sheet


def build_images() -> None:
    print("== gambar")
    # render Blender: robot (2x2), properti (2x3), Cycles
    robot = [load(BLN / f"robot_{v}.png") for v in ("depan", "belakang", "samping", "atas")]
    save_jpg(collage(robot, 2, 760, labels=["Depan", "Belakang", "Samping", "Atas"]), "fig_robot_blender.jpg", 1560)
    props = [load(BLN / n) for n in ("props_meja_kursi.png", "props_lemari_rak.png", "props_papan_pintu_jendela.png", "props_ac_jam_lampu.png", "props_guru_tong_tanaman.png", "litter.png")]
    save_jpg(collage(props, 3, 520, labels=["Meja & kursi", "Lemari & rak buku", "Papan tulis, pintu, jendela", "AC, jam, lampu", "Meja guru, tong sampah, tanaman", "Sampah (target)"]), "fig_props_blender.jpg", 1600)
    save_jpg(load(BLN / "blender_cycles_S3.png"), "fig_cycles_S3.jpg", 1500)
    save_jpg(load(BLN / "blender_cycles_S4.png"), "fig_cycles_S4.jpg", 1500)
    save_jpg(collage([load(BLN / "blender_cycles_S3_robot.png"), load(BLN / "blender_cycles_S4_robot.png")], 2, 760), "fig_cycles_robot.jpg", 1560)

    # aplikasi three.js
    save_jpg(load(SHOTS / "ui_idle_S1.png"), "fig_ui_idle.jpg", 1500)
    save_jpg(load(SHOTS / "ui_exec_S3.png"), "fig_ui_exec.jpg", 1500)
    save_jpg(load(SHOTS / "ui_lab.png"), "fig_ui_lab.jpg", 1500)
    save_jpg(load(SHOTS / "ui_editor.png"), "fig_ui_editor.jpg", 1500)
    save_jpg(load(SHOTS / "ui_game_result.png"), "fig_ui_game.jpg", 1500)
    # panel HUD (4 tab): PEAS, Masalah, Metrik, Rencana
    right = (1555, 82, 1902, 1000)
    peas = load(SHOTS / "ui_peas_S3.png", (1555, 82, 1902, 600))
    masalah = load(SHOTS / "ui_exec_S3.png", (1555, 82, 1902, 600))
    metrik = load(SHOTS / "ui_metrik_S3.png", (1555, 82, 1902, 600)) if (SHOTS / "ui_metrik_S3.png").exists() else load(SHOTS / "ui_search_S3.png", (1555, 82, 1902, 600))
    rencana = load(SHOTS / "ui_plan_S3.png", (1555, 82, 1902, 600))
    save_jpg(collage([peas, masalah, metrik, rencana], 4, 347, gap=12, bg=(20, 20, 19)), "fig_panels.jpg", 1500, 92)
    # kamera
    cams = [load(SHOTS / n) for n in ("done_overview.png", "follow_cleaning.png", "fpv_run.png", "cinema_run.png")]
    save_jpg(collage(cams, 2, 760, labels=["Overview", "Ikuti", "Robot (FPV)", "Sinema"]), "fig_kamera.jpg", 1560)
    save_jpg(collage([load(SHOTS / "robot_face_cleaning.png"), load(SHOTS / "robot_dock_3q.png")], 2, 760), "fig_robot_threejs.jpg", 1560)
    # rute 3D S1..S4 dan heat-map 3D
    routes = [load(SHOTS / f"route_S{i}.png", (150, 100, 1770, 1070)) for i in range(1, 5)]
    save_jpg(collage(routes, 2, 760, labels=["S1 · Sedikit Rintangan", "S2 · Banyak Rintangan", "S3 · Target Tersebar", "S4 · Kelas Penuh"]), "fig_rute3d.jpg", 1560)
    heat = [load(SHOTS / f"heat3d_{a}_S4.png", (150, 100, 1770, 1070)) for a in ("bfs", "astar")]
    save_jpg(collage(heat, 2, 760, labels=["BFS · 3.254 state", "A* (MST) · 96 state"]), "fig_heat3d.jpg", 1560)
    # figur matplotlib: salin apa adanya (PNG)
    for n in ("rute_S1-S3.png", "rute_S4.png", "arsitektur_sistem.png", "states_diperiksa.png", "waktu_komputasi.png", "biaya_perbandingan.png", "skalabilitas_states.png", "skalabilitas_waktu.png"):
        im = load(FIGS / n)
        fit_width(im, 1700).save(OUT / n, optimize=True)
        print("  ", n, im.size)


# ---------------------------------------------------------------- diagram
def _box(ax, x, y, w, h, title, lines=(), fc=CARD, ec=INK, tsize=11.5, lsize=9, lw=1.5):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.4", fc=fc, ec=ec, lw=lw, zorder=2))
    ax.text(x + w / 2, y + h - 3.0, title, ha="center", va="center", fontsize=tsize, fontweight="bold", color=INK, zorder=3)
    for i, ln in enumerate(lines):
        ax.text(x + w / 2, y + h - 7.2 - i * 3.6, ln, ha="center", va="center", fontsize=lsize, color=INK, zorder=3)


def _arrow(ax, p, q, label="", dx=0.0, dy=1.8, color=ORANGE, fs=8.6, rad=0.0):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=16, lw=1.9, color=color, zorder=4, connectionstyle=f"arc3,rad={rad}"))
    if label:
        ax.text((p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy, label, ha="center", va="center", fontsize=fs, color=MID, zorder=5)


def _save(fig, name: str) -> None:
    fig.savefig(OUT / name, dpi=200, bbox_inches="tight", facecolor=PAPER)
    plt.close(fig)
    print("  ", name)


def diagram_agent() -> None:
    fig, ax = plt.subplots(figsize=(10.5, 5.0))
    ax.set_xlim(0, 105)
    ax.set_ylim(-17, 46)
    ax.axis("off")
    _box(ax, 1, 6, 30, 32, "LINGKUNGAN", ["Ruang kelas (grid 1 m × 1 m)", "Perabot = rintangan", "Titik kotoran = target", "Titik awal (pintu)"], fc="#F6D9CC", tsize=12.5, lsize=8.8)
    _box(ax, 62, 6, 42, 32, "AGEN  (CleanBot)", [], fc=SAGE, tsize=12.5)
    ax.text(83, 26.0, "Program agen", ha="center", fontsize=9.6, color=MID)
    ax.text(83, 22.0, "SIMPLE-PROBLEM-SOLVING-AGENT", ha="center", fontsize=9.2, fontweight="bold", family="DejaVu Sans Mono", color=INK)
    ax.text(83, 15.8, "tujuan → masalah → pencarian → rencana", ha="center", fontsize=9.2, color=INK)
    ax.text(83, 12.0, "(A*, BFS, UCS) → eksekusi aksi", ha="center", fontsize=9.2, color=INK)
    _arrow(ax, (31, 31), (62, 31))
    ax.text(46.5, 35.4, "Percept", ha="center", fontsize=9.4, fontweight="bold", color=INK)
    ax.text(46.5, 33.0, "posisi · jarak (LiDAR) · debu", ha="center", fontsize=8.4, color=MID)
    _arrow(ax, (62, 13), (31, 13))
    ax.text(46.5, 18.2, "Aksi", ha="center", fontsize=9.4, fontweight="bold", color=INK)
    ax.text(46.5, 15.8, "↑ → ↓ ←  ·  ✦ bersihkan", ha="center", fontsize=8.4, color=MID)
    # legenda PEAS di bawah diagram
    items = [("P", ORANGE, "Performance: semua target bersih, biaya minimum"), ("E", BLUE, "Environment: satu ruang kelas, perabot, kotoran"),
             ("A", GREEN, "Actuators: roda (U/R/D/L), sikat & hisap (C)"), ("S", PINK, "Sensors: posisi, LiDAR/jarak, sensor debu")]
    for i, (ch, col, txt) in enumerate(items):
        x = 2 + (i % 2) * 52
        y = -3.0 - (i // 2) * 7.5
        ax.add_patch(Circle((x + 1.8, y), 2.1, fc=col, ec="white", lw=1.2, zorder=3))
        ax.text(x + 1.8, y - 0.1, ch, ha="center", va="center", color="white", fontsize=10.5, fontweight="bold", zorder=4)
        ax.text(x + 5.2, y, txt, ha="left", va="center", fontsize=9.2, color=INK)
    _save(fig, "diag_agen_lingkungan.png")


def _numbered_box(ax, x, y, w, h, n, title, lines, fc, tsize=8.9, lsize=8.5):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.4", fc=fc, ec=INK, lw=1.5, zorder=2))
    ax.text(x + w / 2, y + h - 5.2, title, ha="center", va="center", fontsize=tsize, fontweight="bold", color=INK, zorder=3)
    for i, ln in enumerate(lines):
        ax.text(x + w / 2, y + h - 10.4 - i * 3.7, ln, ha="center", va="center", fontsize=lsize, color=INK, zorder=3)
    ax.add_patch(Circle((x + 2.4, y + h), 2.0, fc=ORANGE, ec="white", lw=1.2, zorder=5))
    ax.text(x + 2.4, y + h - 0.1, str(n), ha="center", va="center", color="white", fontsize=9.4, fontweight="bold", zorder=6)


def diagram_problem_solving() -> None:
    fig, ax = plt.subplots(figsize=(11.4, 4.6))
    ax.set_xlim(0, 118)
    ax.set_ylim(-2, 46)
    ax.axis("off")
    steps = [("UPDATE-STATE", ["percept → keyakinan", "agen (posisi, rintangan)"], CARD),
             ("FORMULATE-GOAL", ["semua target bersih", "& kembali ke awal"], CARD),
             ("FORMULATE-PROBLEM", ["s = (x, y, mask)", "5 komponen formulasi"], CARD),
             ("SEARCH", ["A* / UCS / BFS", "→ urutan aksi (rencana)"], "#F6D9CC"),
             ("FIRST(seq)", ["jalankan aksi pertama", "di lingkungan"], "#E4ECD8")]
    w, g = 20.4, 3.4
    for i, (t, ls, fc) in enumerate(steps):
        x = 1 + i * (w + g)
        _numbered_box(ax, x, 22, w, 20, i + 1, t, ls, fc)
        if i < len(steps) - 1:
            _arrow(ax, (x + w, 32), (x + w + g, 32))
    ax.add_patch(FancyArrowPatch((1 + 4 * (w + g) + w / 2, 22), (1 + 1 * (w + g) + w / 2, 22), arrowstyle="-|>", mutation_scale=16, lw=1.9, color=PINK, zorder=4, connectionstyle="arc3,rad=-0.26"))
    ax.text(58, 6.2, "rencana habis atau rintangan baru terdeteksi sensor → rumuskan ulang (replanning)", ha="center", va="center", fontsize=9.4, color=PINK, fontstyle="italic")
    _save(fig, "diag_problem_solving.png")


def diagram_metodologi() -> None:
    fig, ax = plt.subplots(figsize=(11.4, 4.2))
    ax.set_xlim(0, 118)
    ax.set_ylim(-8, 38)
    ax.axis("off")
    steps = [("Analisis", ["Latar belakang,", "tujuan, PEAS"], CARD), ("Formulasi", ["5 komponen,", "s = (x, y, mask)"], CARD),
             ("Perancangan", ["skenario S1–S4,", "algoritma, arsitektur"], CARD), ("Implementasi", ["Python · Blender", "· three.js"], "#F6D9CC"),
             ("Pengujian", ["pytest, benchmark,", "skalabilitas"], "#E4ECD8"), ("Analisis hasil", ["pembahasan,", "kesimpulan, saran"], "#DCE6F2")]
    w, g = 16.4, 3.5
    for i, (t, ls, fc) in enumerate(steps):
        x = 1 + i * (w + g)
        _numbered_box(ax, x, 10, w, 22, i + 1, t, ls, fc, tsize=9.6, lsize=8.2)
        if i < len(steps) - 1:
            _arrow(ax, (x + w, 21), (x + w + g, 21))
    ax.add_patch(FancyArrowPatch((1 + 4 * (w + g) + w / 2, 10), (1 + 2 * (w + g) + w / 2, 10), arrowstyle="-|>", mutation_scale=15, lw=1.7, color=GRAY, zorder=4, connectionstyle="arc3,rad=-0.4"))
    ax.text(58, -5.2, "iterasi: hasil pengujian memperbaiki implementasi dan desain heuristik", ha="center", va="center", fontsize=9, color=MID, fontstyle="italic")
    _save(fig, "diag_metodologi.png")


# ---------------------------------------------------------------- data
def replanning_experiment() -> list[dict]:
    """Rintangan tak terduga muncul di tengah rute: agen harus mendeteksinya dengan sensor dan merencanakan ulang."""
    print("== replanning")
    out = []
    for sid in ("S1", "S3", "S4"):
        sc = catalog()[sid]
        plan = solve(problem_from_scenario(sc), "astar", "mst")
        route = [(s.x, s.y) for s in plan.states]
        # sel pada rute (bukan awal / target) yang akan 'tertutup' setelah langkah ke-2
        candidates = [c for c in route[6:] if c != sc.start and c not in sc.targets]
        result = None
        for cell in candidates:
            env = ClassroomEnvironment(sc, hidden_obstacles={2: cell})
            agent = CleaningAgent(sc, "astar", "mst")
            tr = run_episode(env, agent)
            if tr.success:
                result = dict(scenario=sid, blocked=list(cell), base_cost=plan.cost, final_cost=tr.cost, replans=agent.replans, collisions=tr.collisions, success=True,
                              expanded=[r.expanded for r in agent.search_log])
                break
        if result is None:
            result = dict(scenario=sid, success=False)
        print("  ", result)
        out.append(result)
    return out


def heuristic_values() -> dict:
    """Nilai h(s0) tiap heuristik dibanding biaya optimal C* pada tiap skenario (ketatnya batas bawah)."""
    from cleanbot.heuristics import make_heuristic

    print("== heuristik di state awal")
    out = {}
    for sid, sc in catalog().items():
        problem = problem_from_scenario(sc)
        s0 = problem.initial_state()
        opt = solve(problem, "astar", "mst").cost
        out[sid] = {"optimal": opt, **{n: make_heuristic(problem, n)(s0) for n in ("manhattan", "max", "mst")}}
        print("  ", sid, out[sid])
    return out


def visit_orders() -> dict:
    """Urutan kunjungan target: rencana optimal A* vs Nearest-Neighbor."""
    print("== urutan kunjungan")
    out = {}
    for sid, sc in catalog().items():
        problem = problem_from_scenario(sc)
        a = solve(problem, "astar", "mst")
        n = solve(problem, "nn")
        out[sid] = {"astar": a.visit_order, "nn": n.visit_order, "astar_cost": a.cost, "nn_cost": n.cost}
        print("  ", sid, out[sid])
    return out


def write_sizes() -> None:
    """Ukuran piksel tiap gambar laporan (dibaca report_lib.js untuk menghitung rasio gambar)."""
    sizes = {f.name: list(Image.open(f).size) for f in sorted(OUT.glob("*")) if f.suffix.lower() in (".png", ".jpg")}
    (OUT / "sizes.json").write_text(json.dumps(sizes, indent=1), encoding="utf-8")
    print("   sizes.json:", len(sizes), "gambar")


def main() -> None:
    only_data = "data" in sys.argv[1:]
    if not only_data:
        build_images()
        print("== diagram")
        diagram_agent()
        diagram_problem_solving()
        diagram_metodologi()
        write_sizes()
    data = {"replanning": replanning_experiment(), "heuristics": heuristic_values(), "visit_orders": visit_orders()}
    (ROOT / "docs_build" / "report_data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("selesai ->", OUT)


if __name__ == "__main__":
    main()
