"""Formulasi masalah (Agent -> Problem Solving).

Lima komponen formulasi masalah sesuai materi dan UTS:

1. Initial state  : robot di titik awal, semua target belum dibersihkan.
2. Actions        : bergerak ke sel tetangga yang valid (U/R/D/L) atau
                    membersihkan (C) target pada posisi saat ini.
3. Transition model: gerakan mengubah posisi; membersihkan menghapus target
                    dari himpunan target tersisa.
4. Goal test      : semua target bersih DAN robot kembali ke titik awal.
5. Path cost      : biaya gerakan + biaya membersihkan (default 1 per aksi).

State direpresentasikan sebagai ``s = (x, y, mask)`` dengan ``mask`` bitmask
target yang BELUM dibersihkan (bit i = 1 -> target ke-i masih kotor).
"""
from __future__ import annotations

from collections import deque
from typing import Iterable, NamedTuple

Cell = tuple[int, int]
INF = 10**9

# Urutan aksi tetap -> hasil pencarian deterministik.
MOVES: dict[str, tuple[int, int]] = {"U": (0, -1), "R": (1, 0), "D": (0, 1), "L": (-1, 0)}
ACTION_ORDER = ("C", "U", "R", "D", "L")
ACTION_NAME = {"U": "Atas", "R": "Kanan", "D": "Bawah", "L": "Kiri", "C": "Bersihkan"}


class State(NamedTuple):
    """Satu state: posisi robot + bitmask target yang belum dibersihkan."""

    x: int
    y: int
    mask: int


def popcount(mask: int) -> int:
    return bin(mask).count("1")


class CleaningProblem:
    """Masalah pembersihan multi-target pada grid ruang kelas."""

    def __init__(
        self,
        width: int,
        height: int,
        obstacles: Iterable[Cell],
        start: Cell,
        targets: Iterable[Cell],
        home: Cell | None = None,
        target_ids: Iterable[int] | None = None,
        move_cost: int = 1,
        clean_cost: int = 1,
    ) -> None:
        self.width = width
        self.height = height
        self.obstacles = frozenset(tuple(o) for o in obstacles)
        self.start: Cell = tuple(start)  # type: ignore[assignment]
        self.home: Cell = tuple(home) if home is not None else self.start  # type: ignore[assignment]
        self.targets: list[Cell] = [tuple(t) for t in targets]  # type: ignore[misc]
        self.target_ids: list[int] = list(target_ids) if target_ids is not None else list(range(1, len(self.targets) + 1))
        if len(self.target_ids) != len(self.targets):
            raise ValueError("target_ids harus sama panjang dengan targets")
        self.move_cost = move_cost
        self.clean_cost = clean_cost
        self.k = len(self.targets)
        self.full_mask = (1 << self.k) - 1
        self._bit: dict[Cell, int] = {c: 1 << i for i, c in enumerate(self.targets)}
        # Tabel tetangga valid per sel (percepatan pencarian).
        self._nbrs: dict[Cell, list[tuple[str, Cell]]] = {}
        for y in range(height):
            for x in range(width):
                if (x, y) in self.obstacles:
                    continue
                lst = []
                for a in ("U", "R", "D", "L"):
                    dx, dy = MOVES[a]
                    n = (x + dx, y + dy)
                    if self.is_free(n):
                        lst.append((a, n))
                self._nbrs[(x, y)] = lst
        self._fields: dict[Cell, list[int]] = {}

    # -------------------------------------------------------------- helpers
    def is_free(self, cell: Cell) -> bool:
        x, y = cell
        return 0 <= x < self.width and 0 <= y < self.height and cell not in self.obstacles

    def index(self, cell: Cell) -> int:
        return cell[1] * self.width + cell[0]

    def distance_field(self, source: Cell) -> list[int]:
        """BFS dari ``source``: jarak terpendek (jumlah langkah) ke setiap sel. INF bila tak terjangkau."""
        cached = self._fields.get(source)
        if cached is not None:
            return cached
        dist = [INF] * (self.width * self.height)
        if self.is_free(source):
            dist[self.index(source)] = 0
            queue = deque([source])
            while queue:
                c = queue.popleft()
                d = dist[self.index(c)]
                for _, n in self._nbrs[c]:
                    i = self.index(n)
                    if dist[i] == INF:
                        dist[i] = d + 1
                        queue.append(n)
        self._fields[source] = dist
        return dist

    def unreachable_targets(self) -> list[int]:
        """Indeks (0-based) target yang tidak bisa dijangkau dari titik awal / tidak bisa kembali ke home."""
        f_start = self.distance_field(self.start)
        f_home = self.distance_field(self.home)
        bad = []
        for i, t in enumerate(self.targets):
            if f_start[self.index(t)] >= INF or f_home[self.index(t)] >= INF:
                bad.append(i)
        return bad

    # ------------------------------------------- lima komponen formulasi
    def initial_state(self) -> State:
        return State(self.start[0], self.start[1], self.full_mask)

    def actions(self, s: State) -> list[str]:
        acts: list[str] = []
        if s.mask & self._bit.get((s.x, s.y), 0):
            acts.append("C")
        for a, _ in self._nbrs.get((s.x, s.y), ()):
            acts.append(a)
        return acts

    def result(self, s: State, a: str) -> State:
        if a == "C":
            return State(s.x, s.y, s.mask & ~self._bit.get((s.x, s.y), 0))
        dx, dy = MOVES[a]
        return State(s.x + dx, s.y + dy, s.mask)

    def goal_test(self, s: State) -> bool:
        return s.mask == 0 and (s.x, s.y) == self.home

    def step_cost(self, s: State, a: str, s2: State | None = None) -> int:
        return self.clean_cost if a == "C" else self.move_cost

    # Versi teroptimasi: semua suksesor sekaligus (dipakai algoritma pencarian).
    def successors(self, s: State) -> list[tuple[str, State, int]]:
        out: list[tuple[str, State, int]] = []
        bit = self._bit.get((s.x, s.y), 0)
        if s.mask & bit:
            out.append(("C", State(s.x, s.y, s.mask & ~bit), self.clean_cost))
        mask = s.mask
        mc = self.move_cost
        for a, (nx, ny) in self._nbrs.get((s.x, s.y), ()):
            out.append((a, State(nx, ny, mask), mc))
        return out

    # ------------------------------------------------------------ utilitas
    def describe(self, s: State) -> str:
        remaining = [self.target_ids[i] for i in range(self.k) if s.mask >> i & 1]
        return f"s = (({s.x},{s.y}), sisa target {remaining})"

    @property
    def state_space_size(self) -> int:
        """Batas atas jumlah state: sel bebas x 2^k."""
        return len(self._nbrs) * (1 << self.k)
