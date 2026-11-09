"""Grafik untuk laporan & presentasi (gaya visual sama dengan PPT UTS)."""
from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path
from statistics import mean

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Rectangle  # noqa: E402

from .benchmark import problem_from_scenario  # noqa: E402
from .scenarios import catalog  # noqa: E402
from .search import solve  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "results" / "figures"

INK = "#141413"
PAPER = "#FAF9F5"
CARD = "#F0EEE6"
ORANGE = "#D97757"
BLUE = "#6A9BCC"
GREEN = "#788C5D"
PINK = "#C46686"
SAGE = "#BCD1CA"
TAN = "#D4A27F"
GRAY = "#B0AEA5"
MID = "#5E5D59"

KIND_COLOR = {"desk": SAGE, "teacher": SAGE, "cabinet": BLUE, "shelf": TAN, "bin": GRAY}
CONFIG_COLOR = {
    "bfs": BLUE,
    "ucs": TAN,
    "astar_manhattan": PINK,
    "astar_max": GREEN,
    "astar_mst": ORANGE,
    "greedy_mst": "#8F8D84",
    "nn": "#4A4944",
}

plt.rcParams.update(
    {
        "figure.facecolor": PAPER,
        "axes.facecolor": PAPER,
        "savefig.facecolor": PAPER,
        "font.family": ["Arial", "DejaVu Sans"],
        "axes.edgecolor": MID,
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "text.color": INK,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)
TITLE_FONT = {"fontfamily": ["Georgia", "DejaVu Serif"], "fontsize": 15, "color": INK}


# ---------------------------------------------------------------------------
# Peta denah gaya UTS
# ---------------------------------------------------------------------------
def draw_robot(ax, cx, cy, s=1.0, z=8):
    body = FancyBboxPatch((cx - 0.30 * s, cy - 0.24 * s), 0.60 * s, 0.46 * s, boxstyle="round,pad=0,rounding_size=0.07",
                          fc=ORANGE, ec="white", lw=2.0, zorder=z)
    ax.add_patch(body)
    for dx in (-0.17, 0.09):
        ax.add_patch(Rectangle((cx + dx * s, cy + 0.20 * s), 0.08 * s, 0.14 * s, fc=ORANGE, ec="white", lw=1.2, zorder=z))
    ax.text(cx - 0.12 * s, cy - 0.02 * s, ">", color=INK, ha="center", va="center", fontsize=9 * s, fontweight="bold", zorder=z + 1)
    ax.text(cx + 0.12 * s, cy - 0.02 * s, "<", color=INK, ha="center", va="center", fontsize=9 * s, fontweight="bold", zorder=z + 1)


def draw_target(ax, cx, cy, label, z=7, r=0.24):
    for k in range(8):
        a = k * math.pi / 4 + 0.2
        ax.plot([cx + math.cos(a) * (r + 0.07), cx + math.cos(a) * (r + 0.15)],
                [cy + math.sin(a) * (r + 0.07), cy + math.sin(a) * (r + 0.15)], color=GREEN, lw=1.6, solid_capstyle="round", zorder=z)
    ax.add_patch(Circle((cx, cy), r, fc=GREEN, ec=INK, lw=1.6, zorder=z + 1))
    ax.text(cx, cy + 0.01, str(label), color="white", ha="center", va="center", fontsize=11, fontweight="bold", zorder=z + 2)


def draw_map(ax, sc, route=None, heat=None, title=None, order=None, vmax=None):
    W, H = sc.width, sc.height
    ax.set_xlim(-0.2, W + 0.2)
    ax.set_ylim(H + 0.2, -0.2)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(Rectangle((0, 0), W, H, fc="white", ec=INK, lw=2.6, zorder=1))
    obstacles = sc.obstacles
    if heat is not None:
        cmap = LinearSegmentedColormap.from_list("heat", ["#FFFFFF", "#F6D9CC", ORANGE, "#8A3A1F"])
        top = vmax if vmax else max(heat) or 1
        for y in range(H):
            for x in range(W):
                if (x, y) in obstacles:
                    continue
                v = heat[y * W + x]
                if v:
                    t = math.log1p(v) / math.log1p(top)
                    ax.add_patch(Rectangle((x, y), 1, 1, fc=cmap(t), ec="none", zorder=2))
                    ax.text(x + 0.5, y + 0.5, str(v), ha="center", va="center", fontsize=7, color=INK if t < 0.6 else "white", zorder=3)
    for y in range(H):
        for x in range(W):
            if (x, y) not in obstacles and (heat is None or not heat[y * W + x]):
                ax.plot(x + 0.5, y + 0.5, ".", color="#CFCDC4", ms=3, zorder=2)
    for f in sc.furniture:
        ax.add_patch(FancyBboxPatch((f.x + 0.08, f.y + 0.12), f.w - 0.16, f.h - 0.24, boxstyle="round,pad=0,rounding_size=0.06",
                                    fc=KIND_COLOR.get(f.kind, SAGE), ec=INK, lw=1.6, zorder=4))
    if route:
        xs = [c[0] + 0.5 for c in route]
        ys = [c[1] + 0.5 for c in route]
        ax.plot(xs, ys, color=ORANGE, lw=4.2, solid_capstyle="round", solid_joinstyle="round", alpha=0.88, zorder=5)
        for i in range(0, len(route) - 1):
            (x0, y0), (x1, y1) = route[i], route[i + 1]
            if (x0, y0) == (x1, y1):
                continue
            mx, my = (x0 + x1) / 2 + 0.5, (y0 + y1) / 2 + 0.5
            ax.add_patch(FancyArrowPatch((mx - (x1 - x0) * 0.12, my - (y1 - y0) * 0.12), (mx + (x1 - x0) * 0.12, my + (y1 - y0) * 0.12),
                                         arrowstyle="-|>", mutation_scale=7, color="white", lw=0.8, zorder=6))
    for i, (tx, ty) in enumerate(sc.targets):
        draw_target(ax, tx + 0.5, ty + 0.5, i + 1)
    if order:
        for rank, tid in enumerate(order, start=1):
            tx, ty = sc.targets[tid - 1]
            ax.text(tx + 0.86, ty + 0.18, f"ke-{rank}", ha="center", va="center", fontsize=7.5, color="white", fontweight="bold",
                    bbox=dict(boxstyle="round,pad=0.18", fc=INK, ec="none"), zorder=12)
    draw_robot(ax, sc.start[0] + 0.5, sc.start[1] + 0.5)
    if title:
        ax.set_title(title, pad=8, **TITLE_FONT)


def _save(fig, name: str) -> Path:
    FIG.mkdir(parents=True, exist_ok=True)
    path = FIG / name
    fig.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)
    return path


def _route(problem, res):
    return [(s.x, s.y) for s in res.states]


def fig_routes():
    cat = catalog()
    paths = []
    for sid, sc in cat.items():
        problem = problem_from_scenario(sc)
        res = solve(problem, "astar", "mst")
        fig, ax = plt.subplots(figsize=(6.4, 4.4 if sc.width == 8 else 4.9))
        draw_map(ax, sc, _route(problem, res), title=f"{sid} · {sc.name}", order=res.visit_order)
        ax.text(sc.width / 2, sc.height + 0.55, f"Biaya optimal = {res.cost}   ·   gerakan = {res.moves}   ·   state diperiksa = {res.expanded}",
                ha="center", va="top", fontsize=9, color=MID)
        paths.append(_save(fig, f"rute_{sid}.png"))
    fig, axes = plt.subplots(1, 3, figsize=(17, 4.3))
    for ax, sid in zip(axes, ("S1", "S2", "S3")):
        sc = cat[sid]
        problem = problem_from_scenario(sc)
        res = solve(problem, "astar", "mst")
        draw_map(ax, sc, _route(problem, res), title=f"{sid} · {sc.name}", order=res.visit_order)
        ax.text(sc.width / 2, sc.height + 0.6, f"biaya = {res.cost}", ha="center", va="top", fontsize=10, color=MID)
    fig.tight_layout()
    paths.append(_save(fig, "rute_S1-S3.png"))
    return paths


def fig_heatmaps():
    cat = catalog()
    out = []
    for sid in ("S3", "S4"):
        sc = cat[sid]
        problem = problem_from_scenario(sc)
        runs = [("BFS", solve(problem, "bfs")), ("UCS", solve(problem, "ucs")), ("A* (MST)", solve(problem, "astar", "mst"))]
        top = max(max(r.heat) for _, r in runs)
        fig, axes = plt.subplots(1, 3, figsize=(17, 3.9 if sid == "S3" else 4.4))
        for ax, (label, res) in zip(axes, runs):
            draw_map(ax, sc, None, heat=res.heat, vmax=top, title=f"{label}  ·  {res.expanded} state diperiksa")
        fig.suptitle(f"Heat-map ekspansi state pada {sid} ({sc.name}) — angka = berapa kali sel tersebut diperluas", fontsize=11, color=MID, y=0.02)
        fig.tight_layout()
        out.append(_save(fig, f"heatmap_{sid}.png"))
    return out


# ---------------------------------------------------------------------------
# Diagram batang
# ---------------------------------------------------------------------------
def _grouped(ax, cats, series, colors, log=False, fmt="{:g}", ylabel=""):
    n = len(series)
    width = 0.8 / n
    for i, (label, vals) in enumerate(series.items()):
        xs = [c + (i - (n - 1) / 2) * width for c in range(len(cats))]
        bars = ax.bar(xs, vals, width * 0.92, label=label, color=colors[label], edgecolor=INK, linewidth=0.6, zorder=3)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v * (1.07 if log else 1) + (0 if log else 0.01), fmt.format(v), ha="center",
                    va="bottom", fontsize=7.5, color=INK, rotation=90 if n > 4 else 0)
    ax.set_xticks(range(len(cats)))
    ax.set_xticklabels(cats)
    if log:
        ax.set_yscale("log")
    ax.set_ylabel(ylabel)
    ax.grid(axis="y", color="#E3E1D8", zorder=0)
    ax.legend(frameon=False, ncol=3, loc="upper left", fontsize=8.5)


def fig_bars(rows):
    sids = sorted({r["scenario"] for r in rows})
    names = {r["scenario"]: r["scenario_name"] for r in rows}
    cats = [f"{s}\n{names[s]}" for s in sids]
    use = [("bfs", "BFS"), ("ucs", "UCS"), ("astar_manhattan", "A* (Manhattan)"), ("astar_max", "A* (Jarak-max)"),
           ("astar_mst", "A* (MST)"), ("greedy_mst", "Greedy")]
    colors = {label: CONFIG_COLOR[cid] for cid, label in use}

    def series(key):
        return {label: [next(r[key] for r in rows if r["scenario"] == s and r["config"] == cid) for s in sids] for cid, label in use}

    out = []
    fig, ax = plt.subplots(figsize=(10.5, 4.8))
    _grouped(ax, cats, series("expanded"), colors, log=True, fmt="{:g}", ylabel="Jumlah state diperiksa (skala log)")
    ax.set_title("Jumlah state yang diperiksa — makin kecil makin efisien", loc="left", **TITLE_FONT)
    ax.set_ylim(top=ax.get_ylim()[1] * 4)
    out.append(_save(fig, "states_diperiksa.png"))

    fig, ax = plt.subplots(figsize=(10.5, 4.8))
    _grouped(ax, cats, series("time_ms"), colors, log=False, fmt="{:.2f}", ylabel="Waktu komputasi (ms, median 5 kali)")
    ax.set_title("Waktu komputasi pencarian rencana", loc="left", **TITLE_FONT)
    ax.set_ylim(top=ax.get_ylim()[1] * 1.25)
    out.append(_save(fig, "waktu_komputasi.png"))

    use2 = [("astar_mst", "A* (optimal)"), ("greedy_mst", "Greedy"), ("nn", "Nearest-Neighbor")]
    colors2 = {"A* (optimal)": ORANGE, "Greedy": "#8F8D84", "Nearest-Neighbor": "#4A4944"}
    ser = {label: [next(r["cost"] for r in rows if r["scenario"] == s and r["config"] == cid) for s in sids] for cid, label in use2}
    fig, ax = plt.subplots(figsize=(8.5, 4.4))
    _grouped(ax, cats, ser, colors2, fmt="{:g}", ylabel="Total biaya rencana (aksi)")
    ax.set_title("Kualitas rencana: A* vs heuristik rakus", loc="left", **TITLE_FONT)
    ax.set_ylim(top=ax.get_ylim()[1] * 1.2)
    out.append(_save(fig, "biaya_perbandingan.png"))
    return out


def fig_scalability(srows):
    agg = defaultdict(lambda: defaultdict(list))
    for r in srows:
        agg[r["config"]][r["k"]].append(r)
    use = [("bfs", "BFS"), ("ucs", "UCS"), ("astar_max", "A* (Jarak-max)"), ("astar_mst", "A* (MST)")]
    out = []
    for key, ylabel, fname, title in (
        ("expanded", "Rata-rata state diperiksa (log)", "skalabilitas_states.png", "Skalabilitas: state diperiksa vs jumlah target"),
        ("time_ms", "Rata-rata waktu komputasi (ms, log)", "skalabilitas_waktu.png", "Skalabilitas: waktu komputasi vs jumlah target"),
    ):
        fig, ax = plt.subplots(figsize=(8.2, 4.6))
        for cid, label in use:
            ks = sorted(agg[cid])
            ys = [mean(r[key] for r in agg[cid][k]) for k in ks]
            ax.plot(ks, ys, marker="o", lw=2.4 if cid == "astar_mst" else 1.8, color=CONFIG_COLOR[cid], label=label, zorder=3)
        ax.set_yscale("log")
        ax.set_xlabel("Jumlah target kotoran (k)")
        ax.set_ylabel(ylabel)
        ax.grid(color="#E3E1D8", zorder=0)
        ax.legend(frameon=False)
        ax.set_title(title, loc="left", **TITLE_FONT)
        out.append(_save(fig, fname))
    return out


# ---------------------------------------------------------------------------
# Diagram arsitektur sistem
# ---------------------------------------------------------------------------
def fig_architecture():
    fig, ax = plt.subplots(figsize=(11.5, 6.3))
    ax.set_xlim(0, 115)
    ax.set_ylim(0, 63)
    ax.axis("off")

    def box(x, y, w, h, title, lines, fc):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.6", fc=fc, ec=INK, lw=1.6, zorder=2))
        ax.text(x + w / 2, y + h - 3.6, title, ha="center", va="center", fontsize=11.5, fontweight="bold", color=INK, zorder=3)
        step = min(3.7, (h - 10.5) / max(len(lines) - 1, 1))
        for i, ln in enumerate(lines):
            ax.text(x + 2.4, y + h - 9.0 - i * step, "• " + ln, ha="left", va="center", fontsize=8.6, color=INK, zorder=3)

    top, bot, H = 35, 4, 24
    box(2, top, 30, H, "BLENDER (bpy)", ["Model robot CleanBot", "Meja, kursi, lemari, rak", "Sampah (kertas, bungkus)", "Material PBR + tekstur", "Ekspor .glb (robot, props, litter)"], "#F6D9CC")
    box(44, top, 32, H, "THREE.JS (Browser)", ["Render PBR, bayangan, AO", "Animasi robot & efek hisap", "Heat-map pencarian A*", "HUD: PEAS, state, metrik", "Mode game: Kamu vs AI"], SAGE)
    box(86, top, 27, H, "FASTAPI (Python)", ["GET /api/meta", "POST /api/plan", "GET /api/benchmark", "Melayani file web statis"], CARD)
    box(2, bot, 30, H, "TEKSTUR PROSEDURAL", ["Ubin lantai, kayu meja, plester", "numpy + Pillow → PNG", "Dipakai Blender & three.js"], "#FFFFFF")
    box(44, bot, 32, H, "ANALISIS & GRAFIK", ["Benchmark 4 skenario", "Uji skalabilitas (denah acak)", "matplotlib → grafik laporan", "pytest: uji otomatis"], "#DCE6F2")
    box(86, bot, 27, H, "INTI AI (Python)", ["CleaningProblem (5 komponen)", "BFS · UCS · A* · Greedy · NN", "Heuristik: Manhattan, max, MST", "Agen PEAS + replanning"], "#E4ECD8")

    def arrow(p, q, label="", dx=0.0, dy=1.9):
        ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=15, lw=1.9, color=ORANGE, zorder=4))
        if label:
            ax.text((p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy, label, ha="center", va="center", fontsize=8.2, color=MID, zorder=5)

    arrow((32, 49), (44, 49), "GLB")
    arrow((76, 52), (86, 52), "permintaan")
    arrow((86, 44), (76, 44), "rencana\n(JSON)", dy=-3.4)
    arrow((99.5, 35), (99.5, 28), "memanggil", dx=7.5, dy=0)
    arrow((86, 16), (76, 16), "hasil")
    arrow((17, 28), (17, 35), "tekstur", dx=6, dy=0)
    ax.text(57.5, 61.2, "Arsitektur Sistem CleanBot 3D", ha="center", fontsize=13.5, fontweight="bold", fontfamily=["Georgia", "DejaVu Serif"])
    return _save(fig, "arsitektur_sistem.png")


def make_all(rows, srows):
    fig_routes()
    fig_heatmaps()
    fig_bars(rows)
    fig_scalability(srows)
    fig_architecture()


if __name__ == "__main__":
    import json

    rows = json.loads((ROOT / "results" / "benchmark_skenario.json").read_text(encoding="utf-8"))
    srows = json.loads((ROOT / "results" / "benchmark_skalabilitas.json").read_text(encoding="utf-8"))
    make_all(rows, srows)
    print("OK ->", FIG)
