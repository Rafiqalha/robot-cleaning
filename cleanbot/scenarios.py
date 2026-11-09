"""Denah ruang kelas untuk simulasi robot pembersih.

Skenario S1-S3 sama persis dengan rancangan simulasi pada UTS
(grid 8 kolom x 5 baris, robot berangkat dari pintu di pojok kiri-bawah).
Skenario S4 adalah denah tambahan (bonus) yang lebih besar untuk menguji
skalabilitas sekaligus sebagai "showcase" visual 3D.

Konvensi koordinat
------------------
(x, y) dengan x = kolom (0 di kiri/barat) dan y = baris (0 di atas/utara,
dekat papan tulis). Satu sel = 1 m x 1 m pada dunia 3D.
"""
from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass, field

Cell = tuple[int, int]

KIND_LABEL = {
    "desk": "Meja",
    "cabinet": "Lemari",
    "shelf": "Rak buku",
    "teacher": "Meja guru",
    "bin": "Tempat sampah",
}


@dataclass(frozen=True)
class Furniture:
    """Perabot persegi panjang yang menempati sel-sel grid (= rintangan)."""

    kind: str
    x: int
    y: int
    w: int = 1
    h: int = 1

    def cells(self) -> list[Cell]:
        return [(self.x + dx, self.y + dy) for dy in range(self.h) for dx in range(self.w)]

    def to_dict(self) -> dict:
        return {"kind": self.kind, "x": self.x, "y": self.y, "w": self.w, "h": self.h}


@dataclass
class Scenario:
    id: str
    name: str
    description: str
    width: int
    height: int
    start: Cell
    furniture: list[Furniture]
    targets: list[Cell]
    note: str = ""
    extra: dict = field(default_factory=dict)

    # ------------------------------------------------------------------ util
    @property
    def obstacles(self) -> frozenset[Cell]:
        return frozenset(c for f in self.furniture for c in f.cells())

    def in_bounds(self, cell: Cell) -> bool:
        return 0 <= cell[0] < self.width and 0 <= cell[1] < self.height

    def free_cells(self) -> list[Cell]:
        obs = self.obstacles
        return [(x, y) for y in range(self.height) for x in range(self.width) if (x, y) not in obs]

    def reachable_from(self, source: Cell) -> set[Cell]:
        obs = self.obstacles
        seen = {source}
        queue = deque([source])
        while queue:
            x, y = queue.popleft()
            for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
                n = (x + dx, y + dy)
                if self.in_bounds(n) and n not in obs and n not in seen:
                    seen.add(n)
                    queue.append(n)
        return seen

    def validate(self) -> None:
        """Pastikan denah konsisten dan semua target bisa dicapai robot."""
        seen: set[Cell] = set()
        for f in self.furniture:
            for c in f.cells():
                if not self.in_bounds(c):
                    raise ValueError(f"{self.id}: perabot {f} keluar dari ruangan")
                if c in seen:
                    raise ValueError(f"{self.id}: perabot bertumpuk di sel {c}")
                seen.add(c)
        if self.start in seen:
            raise ValueError(f"{self.id}: titik awal berada di atas perabot")
        if len(set(self.targets)) != len(self.targets):
            raise ValueError(f"{self.id}: ada target kembar")
        reach = self.reachable_from(self.start)
        for t in self.targets:
            if t in seen or not self.in_bounds(t):
                raise ValueError(f"{self.id}: target {t} berada di atas perabot / di luar ruangan")
            if t not in reach:
                raise ValueError(f"{self.id}: target {t} tidak dapat dijangkau")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "note": self.note,
            "width": self.width,
            "height": self.height,
            "start": list(self.start),
            "furniture": [f.to_dict() for f in self.furniture],
            "obstacles": sorted([list(c) for c in self.obstacles]),
            "targets": [{"id": i + 1, "x": t[0], "y": t[1]} for i, t in enumerate(self.targets)],
        }


# --------------------------------------------------------------------------
# Katalog skenario (S1-S3 = rancangan UTS, S4 = bonus)
# --------------------------------------------------------------------------
def _s1() -> Scenario:
    return Scenario(
        id="S1",
        name="Sedikit Rintangan",
        description="Perabot minimal, jalur terbuka bagi robot.",
        width=8,
        height=5,
        start=(0, 4),
        furniture=[
            Furniture("desk", 2, 1, 2, 1),
            Furniture("desk", 5, 3, 2, 1),
            Furniture("cabinet", 7, 0, 1, 2),
        ],
        targets=[(3, 3), (6, 1), (4, 0)],
        note="Skenario UTS no. 1",
    )


def _s2() -> Scenario:
    return Scenario(
        id="S2",
        name="Banyak Rintangan",
        description="Perabot rapat, koridor sempit membatasi jalur.",
        width=8,
        height=5,
        start=(0, 4),
        furniture=[
            Furniture("desk", 1, 0, 2, 1),
            Furniture("desk", 4, 0, 2, 1),
            Furniture("desk", 1, 2, 2, 1),
            Furniture("desk", 4, 2, 2, 1),
            Furniture("desk", 1, 4, 2, 1),
            Furniture("desk", 4, 4, 2, 1),
            Furniture("shelf", 7, 1, 1, 2),
            Furniture("cabinet", 7, 3, 1, 2),
        ],
        targets=[(3, 1), (6, 3), (3, 3)],
        note="Skenario UTS no. 2",
    )


def _s3() -> Scenario:
    return Scenario(
        id="S3",
        name="Target Tersebar",
        description="Titik kotoran berjauhan di berbagai sudut ruangan.",
        width=8,
        height=5,
        start=(0, 4),
        furniture=[
            Furniture("desk", 3, 1, 2, 1),
            Furniture("desk", 3, 3, 2, 1),
            Furniture("cabinet", 7, 2, 1, 2),
        ],
        targets=[(1, 0), (6, 0), (7, 4), (4, 2), (1, 2)],
        note="Skenario UTS no. 3",
    )


def _s4() -> Scenario:
    return Scenario(
        id="S4",
        name="Kelas Penuh (Bonus)",
        description="Ruang kelas 10 x 7 m dengan enam meja panjang dan enam titik kotoran.",
        width=10,
        height=7,
        start=(0, 6),
        furniture=[
            Furniture("teacher", 4, 0, 2, 1),
            Furniture("desk", 1, 2, 2, 1),
            Furniture("desk", 4, 2, 2, 1),
            Furniture("desk", 7, 2, 2, 1),
            Furniture("desk", 1, 4, 2, 1),
            Furniture("desk", 4, 4, 2, 1),
            Furniture("desk", 7, 4, 2, 1),
            Furniture("cabinet", 9, 1, 1, 2),
            Furniture("shelf", 9, 3, 1, 2),
            Furniture("bin", 9, 6, 1, 1),
        ],
        targets=[(2, 1), (8, 1), (6, 3), (1, 3), (3, 5), (8, 5)],
        note="Skenario tambahan (bonus) untuk uji skalabilitas",
    )


def catalog() -> dict[str, Scenario]:
    """Katalog skenario terurut: S1, S2, S3 (UTS) dan S4 (bonus)."""
    out = {}
    for fn in (_s1, _s2, _s3, _s4):
        sc = fn()
        sc.validate()
        out[sc.id] = sc
    return out


def get_scenario(scenario_id: str) -> Scenario:
    return catalog()[scenario_id]


# --------------------------------------------------------------------------
# Generator denah acak (dipakai untuk uji skalabilitas)
# --------------------------------------------------------------------------
def random_scenario(width: int, height: int, n_targets: int, seed: int, desk_rows: bool = True) -> Scenario:
    """Denah acak yang selalu solvable: perabot acak, target dipilih dari sel terjangkau."""
    rng = random.Random(seed)
    furniture: list[Furniture] = []
    start = (0, height - 1)
    occupied: set[Cell] = {start}

    def try_place(f: Furniture) -> bool:
        cells = f.cells()
        if any(not (0 <= c[0] < width and 0 <= c[1] < height) or c in occupied for c in cells):
            return False
        furniture.append(f)
        occupied.update(cells)
        return True

    n_desks = max(2, (width * height) // 14)
    attempts = 0
    while len([f for f in furniture if f.kind == "desk"]) < n_desks and attempts < 400:
        attempts += 1
        x, y = rng.randrange(1, width), rng.randrange(0, height)
        try_place(Furniture("desk", x, y, 2, 1))
    for _ in range(rng.randint(1, 2)):
        try_place(Furniture("cabinet", width - 1, rng.randrange(0, height - 1), 1, 2))

    sc = Scenario(
        id=f"R{width}x{height}k{n_targets}s{seed}",
        name="Acak",
        description="Denah acak",
        width=width,
        height=height,
        start=start,
        furniture=furniture,
        targets=[],
    )
    reach = sorted(sc.reachable_from(start) - {start})
    rng.shuffle(reach)
    sc.targets = reach[: min(n_targets, len(reach))]
    return sc
