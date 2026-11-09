"""Fungsi heuristik h(n) untuk A* pada masalah pembersihan multi-target.

Semua heuristik di sini *admissible* (tidak pernah melebihi biaya sisa yang
sebenarnya) dan *consistent*, sehingga A* menjamin solusi optimal.

Notasi: pos = posisi robot, R = himpunan target tersisa, home = titik kembali,
d(a, b) = jarak terpendek pada grid (BFS), |R| = jumlah target tersisa
(setiap target butuh tepat satu aksi "Bersihkan").

* zero       : h = 0                                  (A* menjadi UCS)
* manhattan  : max_t [ |pos-t| + |t-home| ]_manhattan + |R|
* max        : max_t [ d(pos,t) + d(t,home) ] + |R|    (jarak sebenarnya)
* mst        : MST(R U {home}) + min_s d(pos,s) + |R|  (paling informatif)

Alasan admissible ``mst``: setelah langkah pertama dari pos ke simpul terdekat s,
robot masih harus mengunjungi semua simpul R U {home}; biaya sebuah jalan yang
menyinggung semua simpul tidak mungkin lebih kecil daripada Minimum Spanning Tree
simpul-simpul tersebut.
"""
from __future__ import annotations

from typing import Callable

from .problem import INF, CleaningProblem, State, popcount

Heuristic = Callable[[State], int]

HEURISTIC_LABEL = {
    "mst": "MST + jarak terdekat",
    "max": "Jarak terjauh (BFS)",
    "manhattan": "Jarak terjauh (Manhattan)",
    "zero": "h(n) = 0 (setara UCS)",
}


def _bits(mask: int, k: int) -> list[int]:
    return [i for i in range(k) if mask >> i & 1]


def make_heuristic(problem: CleaningProblem, name: str = "mst") -> Heuristic:
    name = name.lower()
    k = problem.k
    mc, cc = problem.move_cost, problem.clean_cost
    W = problem.width

    if name == "zero":
        return lambda s: 0

    targets = problem.targets
    home = problem.home

    if name == "manhattan":
        hx, hy = home

        def h_manhattan(s: State) -> int:
            if s.mask == 0:
                return mc * (abs(s.x - hx) + abs(s.y - hy))
            best = 0
            for i in _bits(s.mask, k):
                tx, ty = targets[i]
                v = abs(s.x - tx) + abs(s.y - ty) + abs(tx - hx) + abs(ty - hy)
                if v > best:
                    best = v
            return mc * best + cc * popcount(s.mask)

        return h_manhattan

    # Heuristik berbasis jarak sebenarnya (BFS) -----------------------------
    fields_t = [problem.distance_field(t) for t in targets]
    field_home = problem.distance_field(home)
    idx_t = [problem.index(t) for t in targets]
    idx_home = problem.index(home)

    if name == "max":

        def h_max(s: State) -> int:
            p = s.y * W + s.x
            if s.mask == 0:
                return mc * field_home[p]
            best = 0
            for i in _bits(s.mask, k):
                v = fields_t[i][p] + field_home[idx_t[i]]
                if v > best:
                    best = v
            return mc * best + cc * popcount(s.mask)

        return h_max

    if name == "mst":
        mst_cache: dict[int, int] = {}

        def mst_weight(mask: int) -> int:
            """MST (algoritma Prim) atas simpul R U {home} dengan bobot jarak BFS."""
            cached = mst_cache.get(mask)
            if cached is not None:
                return cached
            nodes = _bits(mask, k)  # indeks target; -1 = home

            def dist(a: int, b: int) -> int:
                if a == -1 and b == -1:
                    return 0
                if a == -1:
                    return fields_t[b][idx_home]
                if b == -1:
                    return fields_t[a][idx_home]
                return fields_t[a][idx_t[b]]

            all_nodes = [-1] + nodes
            in_tree = {all_nodes[0]}
            best = {n: dist(all_nodes[0], n) for n in all_nodes[1:]}
            total = 0
            while best:
                nxt = min(best, key=best.get)
                total += best.pop(nxt)
                in_tree.add(nxt)
                for n in best:
                    d = dist(nxt, n)
                    if d < best[n]:
                        best[n] = d
            mst_cache[mask] = total
            return total

        def h_mst(s: State) -> int:
            p = s.y * W + s.x
            near = field_home[p]
            for i in _bits(s.mask, k):
                d = fields_t[i][p]
                if d < near:
                    near = d
            return mc * (mst_weight(s.mask) + near) + cc * popcount(s.mask)

        return h_mst

    raise ValueError(f"Heuristik tidak dikenal: {name!r}")
