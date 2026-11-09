"""Jembatan antara inti AI (Python) dan aplikasi 3D (three.js): spesifikasi JSON -> rencana JSON."""
from __future__ import annotations

import math
from typing import Any

from .heuristics import HEURISTIC_LABEL, make_heuristic
from .problem import CleaningProblem
from .scenarios import catalog
from .search import ALGORITHM_LABEL, OPTIMAL_ALGORITHMS, SearchResult, solve

MAX_GRID = 40
MAX_TARGETS = 12


def _cell(v: Any) -> tuple[int, int]:
    if isinstance(v, dict):
        return int(v["x"]), int(v["y"])
    return int(v[0]), int(v[1])


def build_problem(spec: dict) -> tuple[CleaningProblem, list[int]]:
    """Bangun CleaningProblem dari spesifikasi JSON. Target yang tak terjangkau dilewati (dilaporkan)."""
    w, h = int(spec["width"]), int(spec["height"])
    if not (2 <= w <= MAX_GRID and 2 <= h <= MAX_GRID):
        raise ValueError("Ukuran grid di luar batas (2..40).")
    obstacles = {_cell(o) for o in spec.get("obstacles", [])}
    start = _cell(spec["start"])
    home = _cell(spec["home"]) if spec.get("home") is not None else start
    raw_targets = spec.get("targets", [])
    targets, ids = [], []
    for i, t in enumerate(raw_targets):
        targets.append(_cell(t))
        ids.append(int(t["id"]) if isinstance(t, dict) and "id" in t else i + 1)
    if len(targets) > MAX_TARGETS:
        raise ValueError(f"Terlalu banyak target (maks {MAX_TARGETS}).")
    for name, c in (("start", start), ("home", home)):
        if not (0 <= c[0] < w and 0 <= c[1] < h) or c in obstacles:
            raise ValueError(f"Posisi {name} tidak valid.")

    full = CleaningProblem(w, h, obstacles, start, targets, home=home, target_ids=ids)
    bad = set(full.unreachable_targets())
    # target di atas rintangan / luar ruangan juga dianggap tak terjangkau
    for i, t in enumerate(targets):
        if not full.is_free(t):
            bad.add(i)
    skipped = [ids[i] for i in sorted(bad)]
    if bad:
        keep = [i for i in range(len(targets)) if i not in bad]
        problem = CleaningProblem(
            w, h, obstacles, start, [targets[i] for i in keep], home=home, target_ids=[ids[i] for i in keep]
        )
    else:
        problem = full
    return problem, skipped


def result_payload(problem: CleaningProblem, res: SearchResult, skipped: list[int] | None = None) -> dict:
    cells = []
    for s in res.states:
        cells.append([s.x, s.y])
    h_path = None
    if res.success and res.algorithm in ("astar", "greedy") and res.heuristic:
        h = make_heuristic(problem, res.heuristic)
        h_path = [h(s) for s in res.states]
    order = res.expansion_cells
    if len(order) > 3000:
        step = math.ceil(len(order) / 3000)
        order = order[::step]
    return {
        "ok": res.success,
        "message": res.message,
        "algorithm": res.algorithm,
        "heuristic": res.heuristic,
        "label": res.label,
        "width": problem.width,
        "height": problem.height,
        "start": list(problem.start),
        "home": list(problem.home),
        "actions": "".join(res.actions),
        "cells": cells,
        "order": res.visit_order,
        "h_path": h_path,
        "skipped": skipped or [],
        "stats": {
            "cost": res.cost,
            "moves": res.moves,
            "cleans": res.cleans,
            "expanded": res.expanded,
            "generated": res.generated,
            "max_frontier": res.max_frontier,
            "reached": res.reached,
            "time_ms": round(res.time_ms, 3),
            "setup_ms": round(res.setup_ms, 3),
            "state_space": problem.state_space_size,
            "optimal_guarantee": res.algorithm in OPTIMAL_ALGORITHMS
            and (res.algorithm != "astar" or res.heuristic in HEURISTIC_LABEL),
        },
        "explore": {"heat": res.heat, "order": order, "total": len(res.expansion_cells)},
    }


def plan_payload(spec: dict, algorithm: str = "astar", heuristic: str = "mst") -> dict:
    problem, skipped = build_problem(spec)
    res = solve(problem, algorithm, heuristic, max_expand=250_000)
    return result_payload(problem, res, skipped)


def meta_payload() -> dict:
    return {
        "scenarios": [sc.to_dict() for sc in catalog().values()],
        "algorithms": [{"id": k, "label": v} for k, v in ALGORITHM_LABEL.items()],
        "heuristics": [{"id": k, "label": v} for k, v in HEURISTIC_LABEL.items()],
    }
