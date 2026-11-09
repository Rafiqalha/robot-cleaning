"""Ekspor data statis (cadangan bila server tidak tersedia): skenario + rencana semua kombinasi.

    python -m cleanbot.export_static

Menulis web/data/meta.json, web/data/plans/<skenario>_<algo>_<heuristik>.json, web/data/benchmark.json
"""
from __future__ import annotations

import json
from pathlib import Path

from .api import meta_payload, plan_payload
from .benchmark import benchmark_scenarios

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "data"

COMBOS = [("bfs", "none"), ("ucs", "none"), ("astar", "mst"), ("astar", "max"), ("astar", "manhattan"), ("greedy", "mst"), ("nn", "none")]


def main() -> None:
    (DATA / "plans").mkdir(parents=True, exist_ok=True)
    meta = meta_payload()
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    n = 0
    for sc in meta["scenarios"]:
        spec = {
            "width": sc["width"],
            "height": sc["height"],
            "obstacles": sc["obstacles"],
            "start": sc["start"],
            "targets": sc["targets"],
        }
        for algo, heur in COMBOS:
            payload = plan_payload(spec, algo, heur if heur != "none" else "mst")
            (DATA / "plans" / f"{sc['id']}_{algo}_{heur}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            n += 1
    bench = {"scenarios": benchmark_scenarios(repeats=3), "scalability": []}
    sj = ROOT / "results" / "benchmark_skalabilitas.json"
    if sj.exists():
        from collections import defaultdict
        from statistics import mean

        agg: dict = defaultdict(lambda: defaultdict(list))
        for r in json.loads(sj.read_text(encoding="utf-8")):
            agg[r["config"]][r["k"]].append(r)
        for cfg, by_k in agg.items():
            for k, rs in sorted(by_k.items()):
                bench["scalability"].append({"config": cfg, "label": rs[0]["label"], "k": k, "expanded": mean(x["expanded"] for x in rs), "time_ms": mean(x["time_ms"] for x in rs)})
    (DATA / "benchmark.json").write_text(json.dumps(bench, ensure_ascii=False), encoding="utf-8")
    print(f"{n} rencana + meta + benchmark ditulis ke {DATA}")


if __name__ == "__main__":
    main()
