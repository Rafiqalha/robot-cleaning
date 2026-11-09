"""Algoritma pencarian: BFS, UCS, A*, Greedy Best-First, dan pembanding Nearest-Neighbor.

Semua algoritma pencarian bekerja pada ruang state ``(x, y, mask)`` dari
``CleaningProblem`` dan mengembalikan ``SearchResult`` yang memuat rencana
aksi serta metrik evaluasi (jumlah state diperiksa, waktu komputasi, biaya).

Catatan implementasi (mengikuti Russell & Norvig, AIMA 4th ed.):
* BFS            : antrian FIFO, uji tujuan saat state dibangkitkan (early goal test).
* UCS            : antrian prioritas berdasarkan g(n); uji tujuan saat diperluas.
* A*             : prioritas f(n) = g(n) + h(n); uji tujuan saat diperluas.
* Greedy         : prioritas h(n) saja (cepat, tetapi tidak menjamin optimal).
* Nearest-Neighbor: BUKAN pencarian ruang-state; selalu menuju target terdekat
                   (pembanding "heuristik rakus" yang tidak optimal).
"""
from __future__ import annotations

import heapq
import itertools
import time
from collections import deque
from dataclasses import dataclass, field

from .heuristics import HEURISTIC_LABEL, Heuristic, make_heuristic
from .problem import ACTION_ORDER, INF, MOVES, CleaningProblem, State

ALGORITHM_LABEL = {
    "bfs": "BFS",
    "ucs": "UCS",
    "astar": "A*",
    "greedy": "Greedy Best-First",
    "nn": "Nearest-Neighbor",
}
OPTIMAL_ALGORITHMS = {"bfs", "ucs", "astar"}  # optimal untuk biaya satuan / heuristik admissible


@dataclass
class SearchResult:
    algorithm: str
    heuristic: str | None
    success: bool
    actions: list[str] = field(default_factory=list)
    states: list[State] = field(default_factory=list)
    cost: int = 0
    expanded: int = 0
    generated: int = 0
    max_frontier: int = 0
    reached: int = 0
    time_ms: float = 0.0
    setup_ms: float = 0.0
    expansion_cells: list[int] = field(default_factory=list)  # indeks sel (y*W+x) tiap state yang diperluas
    heat: list[int] = field(default_factory=list)  # jumlah ekspansi per sel
    visit_order: list[int] = field(default_factory=list)  # id target menurut urutan dibersihkan
    message: str = ""

    @property
    def moves(self) -> int:
        return sum(1 for a in self.actions if a != "C")

    @property
    def cleans(self) -> int:
        return sum(1 for a in self.actions if a == "C")

    @property
    def label(self) -> str:
        base = ALGORITHM_LABEL.get(self.algorithm, self.algorithm)
        if self.heuristic and self.algorithm in ("astar", "greedy"):
            return f"{base} ({self.heuristic})"
        return base


# ---------------------------------------------------------------------------
# utilitas
# ---------------------------------------------------------------------------
def _reconstruct(parent: dict, goal: State) -> tuple[list[str], list[State]]:
    actions: list[str] = []
    states: list[State] = [goal]
    s = goal
    while parent[s] is not None:
        prev, a = parent[s]
        actions.append(a)
        states.append(prev)
        s = prev
    actions.reverse()
    states.reverse()
    return actions, states


def _visit_order(problem: CleaningProblem, actions: list[str], states: list[State]) -> list[int]:
    order = []
    for a, s in zip(actions, states):
        if a == "C":
            t = problem.targets.index((s.x, s.y))
            order.append(problem.target_ids[t])
    return order


class _Recorder:
    """Mencatat state yang diperluas (untuk heat-map & animasi pencarian)."""

    def __init__(self, problem: CleaningProblem, limit: int) -> None:
        self.W = problem.width
        self.heat = [0] * (problem.width * problem.height)
        self.cells: list[int] = []
        self.limit = limit

    def add(self, s: State) -> None:
        i = s.y * self.W + s.x
        self.heat[i] += 1
        if len(self.cells) < self.limit:
            self.cells.append(i)


def _finish(problem: CleaningProblem, res: SearchResult, rec: _Recorder | None, parent: dict | None, goal: State | None) -> None:
    if rec is not None:
        res.heat = rec.heat
        res.expansion_cells = rec.cells
    if goal is not None and parent is not None:
        res.success = True
        res.actions, res.states = _reconstruct(parent, goal)
        res.cost = sum(problem.clean_cost if a == "C" else problem.move_cost for a in res.actions)
        res.visit_order = _visit_order(problem, res.actions, res.states)
    res.reached = len(parent) if parent is not None else 0


# ---------------------------------------------------------------------------
# BFS
# ---------------------------------------------------------------------------
def _bfs(problem: CleaningProblem, res: SearchResult, log_limit: int, max_expand: int | None = None) -> None:
    rec = _Recorder(problem, log_limit)
    start = problem.initial_state()
    parent: dict[State, tuple[State, str] | None] = {start: None}
    if problem.goal_test(start):
        _finish(problem, res, rec, parent, start)
        return
    frontier = deque([start])
    generated = expanded = max_frontier = 0
    goal: State | None = None
    while frontier and goal is None:
        if max_expand is not None and expanded >= max_expand:
            res.message = "Batas ekspansi terlampaui (ruang state terlalu besar)."
            break
        s = frontier.popleft()
        expanded += 1
        rec.add(s)
        for a, s2, _c in problem.successors(s):
            if s2 not in parent:
                parent[s2] = (s, a)
                generated += 1
                if problem.goal_test(s2):
                    goal = s2
                    break
                frontier.append(s2)
        if len(frontier) > max_frontier:
            max_frontier = len(frontier)
    res.expanded, res.generated, res.max_frontier = expanded, generated, max_frontier
    _finish(problem, res, rec, parent, goal)


# ---------------------------------------------------------------------------
# UCS / A* / Greedy  (best-first search generik)
# ---------------------------------------------------------------------------
def _best_first(problem: CleaningProblem, res: SearchResult, log_limit: int, mode: str, h: Heuristic | None, max_expand: int | None = None) -> None:
    rec = _Recorder(problem, log_limit)
    start = problem.initial_state()
    counter = itertools.count()
    best_g: dict[State, int] = {start: 0}
    parent: dict[State, tuple[State, str] | None] = {start: None}
    h_cache: dict[State, int] = {}

    def hv(s: State) -> int:
        v = h_cache.get(s)
        if v is None:
            v = h(s) if h is not None else 0
            h_cache[s] = v
        return v

    def key(g: int, s: State) -> tuple:
        if mode == "ucs":
            return (g,)
        if mode == "astar":
            hs = hv(s)
            return (g + hs, hs)  # seri -> pilih h lebih kecil (lebih dekat ke tujuan)
        return (hv(s),)  # greedy

    frontier: list = []
    heapq.heappush(frontier, (key(0, start), next(counter), 0, start))
    expanded = generated = max_frontier = 0
    goal: State | None = None
    closed: set[State] = set()
    while frontier:
        _k, _n, g, s = heapq.heappop(frontier)
        if s in closed:
            continue
        if g > best_g.get(s, INF) and mode != "greedy":
            continue
        if problem.goal_test(s):
            goal = s
            break
        if max_expand is not None and expanded >= max_expand:
            res.message = "Batas ekspansi terlampaui (ruang state terlalu besar)."
            break
        closed.add(s)
        expanded += 1
        rec.add(s)
        for a, s2, c in problem.successors(s):
            g2 = g + c
            if mode == "greedy":
                if s2 in best_g:
                    continue
            elif g2 >= best_g.get(s2, INF):
                continue
            best_g[s2] = g2
            parent[s2] = (s, a)
            generated += 1
            heapq.heappush(frontier, (key(g2, s2), next(counter), g2, s2))
        if len(frontier) > max_frontier:
            max_frontier = len(frontier)
    res.expanded, res.generated, res.max_frontier = expanded, generated, max_frontier
    _finish(problem, res, rec, parent, goal)


# ---------------------------------------------------------------------------
# Nearest-Neighbor (pembanding non-optimal)
# ---------------------------------------------------------------------------
def _bfs_path(problem: CleaningProblem, src: tuple[int, int], dst: tuple[int, int]) -> list[str] | None:
    if src == dst:
        return []
    parent: dict = {src: None}
    queue = deque([src])
    while queue:
        c = queue.popleft()
        for a, n in problem._nbrs[c]:
            if n not in parent:
                parent[n] = (c, a)
                if n == dst:
                    path = []
                    cur = n
                    while parent[cur] is not None:
                        prev, act = parent[cur]
                        path.append(act)
                        cur = prev
                    path.reverse()
                    return path
                queue.append(n)
    return None


def _nearest_neighbor(problem: CleaningProblem, res: SearchResult) -> None:
    pos = problem.start
    remaining = list(range(problem.k))
    actions: list[str] = []
    ok = True
    while remaining:
        field_ = problem.distance_field(pos)
        nxt = min(remaining, key=lambda i: field_[problem.index(problem.targets[i])])
        if field_[problem.index(problem.targets[nxt])] >= INF:
            ok = False
            break
        actions += _bfs_path(problem, pos, problem.targets[nxt]) or []
        actions.append("C")
        pos = problem.targets[nxt]
        remaining.remove(nxt)
    if ok:
        back = _bfs_path(problem, pos, problem.home)
        if back is None:
            ok = False
        else:
            actions += back
    if not ok:
        res.message = "Nearest-Neighbor gagal: ada target yang tak terjangkau."
        return
    # bangun deretan state dari aksi
    s = problem.initial_state()
    states = [s]
    for a in actions:
        s = problem.result(s, a)
        states.append(s)
    res.success = True
    res.actions = actions
    res.states = states
    res.cost = sum(problem.clean_cost if a == "C" else problem.move_cost for a in actions)
    res.visit_order = _visit_order(problem, actions, states[:-1])
    res.heat = [0] * (problem.width * problem.height)


# ---------------------------------------------------------------------------
# API utama
# ---------------------------------------------------------------------------
def solve(
    problem: CleaningProblem,
    algorithm: str = "astar",
    heuristic: str = "mst",
    log_limit: int = 60000,
    max_expand: int | None = None,
) -> SearchResult:
    """Jalankan algoritma ``algorithm`` pada ``problem`` dan kembalikan SearchResult."""
    algo = algorithm.lower()
    if algo not in ALGORITHM_LABEL:
        raise ValueError(f"Algoritma tidak dikenal: {algorithm!r}")
    hname = heuristic if algo in ("astar", "greedy") else None
    res = SearchResult(algorithm=algo, heuristic=hname, success=False)

    t0 = time.perf_counter()
    h: Heuristic | None = None
    if hname is not None:
        h = make_heuristic(problem, hname)
    t1 = time.perf_counter()

    if problem.initial_state().mask and problem.unreachable_targets():
        res.message = "Ada target yang tidak dapat dijangkau robot (terhalang perabot)."
        res.heat = [0] * (problem.width * problem.height)
        res.setup_ms = (t1 - t0) * 1000
        res.time_ms = (time.perf_counter() - t0) * 1000
        return res

    if algo == "bfs":
        _bfs(problem, res, log_limit, max_expand)
    elif algo == "ucs":
        _best_first(problem, res, log_limit, "ucs", None, max_expand)
    elif algo == "astar":
        _best_first(problem, res, log_limit, "astar", h, max_expand)
    elif algo == "greedy":
        _best_first(problem, res, log_limit, "greedy", h, max_expand)
    else:
        _nearest_neighbor(problem, res)

    t2 = time.perf_counter()
    res.setup_ms = (t1 - t0) * 1000
    res.time_ms = (t2 - t0) * 1000
    if not res.success and not res.message:
        res.message = "Tidak ditemukan solusi."
    return res


def describe_algorithm(algorithm: str, heuristic: str | None) -> str:
    base = ALGORITHM_LABEL.get(algorithm, algorithm)
    if algorithm in ("astar", "greedy") and heuristic:
        return f"{base} · h = {HEURISTIC_LABEL.get(heuristic, heuristic)}"
    return base


__all__ = [
    "ALGORITHM_LABEL",
    "OPTIMAL_ALGORITHMS",
    "SearchResult",
    "solve",
    "describe_algorithm",
    "ACTION_ORDER",
    "MOVES",
]
