"""Benchmark: membandingkan BFS, UCS, A* (3 heuristik), Greedy, dan Nearest-Neighbor.

Jalankan::

    python -m cleanbot.benchmark            # tulis results/*.csv|json + gambar

Metrik (sesuai rancangan evaluasi UTS): tugas selesai, total gerakan, total
biaya, jumlah state yang diperiksa, dan waktu komputasi.
"""
from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path

from .api import build_problem
from .problem import CleaningProblem
from .scenarios import catalog, random_scenario
from .search import ALGORITHM_LABEL, solve

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"

# (id konfigurasi, algoritma, heuristik, label singkat)
CONFIGS = [
    ("bfs", "bfs", None, "BFS"),
    ("ucs", "ucs", None, "UCS"),
    ("astar_manhattan", "astar", "manhattan", "A* (Manhattan)"),
    ("astar_max", "astar", "max", "A* (Jarak-max)"),
    ("astar_mst", "astar", "mst", "A* (MST)"),
    ("greedy_mst", "greedy", "mst", "Greedy"),
    ("nn", "nn", None, "Nearest-Neighbor"),
]


def problem_from_scenario(sc) -> CleaningProblem:
    spec = sc.to_dict()
    spec["obstacles"] = [list(c) for c in sc.obstacles]
    problem, _ = build_problem(spec)
    return problem


def run_config(problem: CleaningProblem, algo: str, heur: str | None, repeats: int = 5):
    times, res = [], None
    for _ in range(repeats):
        res = solve(problem, algo, heur or "mst", log_limit=0)
        times.append(res.time_ms)
    return res, statistics.median(times)


def benchmark_scenarios(ids=("S1", "S2", "S3", "S4"), repeats: int = 5) -> list[dict]:
    rows = []
    cat = catalog()
    for sid in ids:
        sc = cat[sid]
        problem = problem_from_scenario(sc)
        opt = None
        for cid, algo, heur, label in CONFIGS:
            res, t_med = run_config(problem, algo, heur, repeats)
            if cid == "astar_mst":
                opt = res.cost
            rows.append(
                {
                    "scenario": sid,
                    "scenario_name": sc.name,
                    "config": cid,
                    "label": label,
                    "success": res.success,
                    "cost": res.cost,
                    "moves": res.moves,
                    "cleans": res.cleans,
                    "expanded": res.expanded,
                    "generated": res.generated,
                    "max_frontier": res.max_frontier,
                    "time_ms": round(t_med, 3),
                    "state_space": problem.state_space_size,
                    "visit_order": " > ".join(map(str, res.visit_order)),
                }
            )
        for r in rows:
            if r["scenario"] == sid and opt:
                r["gap_pct"] = round(100.0 * (r["cost"] - opt) / opt, 1) if r["success"] else None
    return rows


def benchmark_scalability(width=10, height=7, ks=range(2, 10), seeds=range(5), repeats: int = 1) -> list[dict]:
    rows = []
    for k in ks:
        for seed in seeds:
            sc = random_scenario(width, height, k, seed)
            if len(sc.targets) < k:
                continue
            problem = problem_from_scenario(sc)
            opt = None
            for cid, algo, heur, label in CONFIGS:
                res, t_med = run_config(problem, algo, heur, repeats)
                if cid == "astar_mst":
                    opt = res.cost
                rows.append(
                    {
                        "k": k,
                        "seed": seed,
                        "config": cid,
                        "label": label,
                        "cost": res.cost,
                        "expanded": res.expanded,
                        "time_ms": round(t_med, 3),
                        "state_space": problem.state_space_size,
                        "success": res.success,
                        "opt": opt,
                    }
                )
            for r in rows:
                if r["k"] == k and r["seed"] == seed:
                    r["opt"] = opt
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return
    keys = list(rows[0].keys())
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    print("Benchmark skenario S1-S4 ...")
    rows = benchmark_scenarios()
    write_csv(rows, RESULTS / "benchmark_skenario.csv")
    (RESULTS / "benchmark_skenario.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"{'Skenario':<9}{'Algoritma':<18}{'Cost':>6}{'Gerak':>7}{'Expanded':>10}{'Generated':>10}{'ms':>9}{'Gap%':>7}  Urutan")
    for r in rows:
        print(
            f"{r['scenario']:<9}{r['label']:<18}{r['cost']:>6}{r['moves']:>7}{r['expanded']:>10}"
            f"{r['generated']:>10}{r['time_ms']:>9.2f}{(r.get('gap_pct') if r.get('gap_pct') is not None else float('nan')):>7.1f}  {r['visit_order']}"
        )

    print("\nBenchmark skalabilitas (acak, grid 10x7) ...")
    srows = benchmark_scalability()
    write_csv(srows, RESULTS / "benchmark_skalabilitas.csv")
    (RESULTS / "benchmark_skalabilitas.json").write_text(json.dumps(srows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  {len(srows)} baris ditulis.")

    try:
        from . import plots

        plots.make_all(rows, srows)
        print("Gambar tersimpan di", RESULTS / "figures")
    except Exception as exc:  # pragma: no cover
        print("Gagal membuat gambar:", exc)


if __name__ == "__main__":
    main()
