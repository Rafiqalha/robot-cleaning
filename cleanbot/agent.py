"""Agen pembersih: PEAS + SIMPLE-PROBLEM-SOLVING-AGENT.

Modul ini menerjemahkan materi "Agent -> Problem Solving" ke kode:

PEAS
----
* Performance : semua target bersih, tidak menabrak, kembali ke titik awal,
                biaya perjalanan minimum.
* Environment : satu ruang kelas, perabot sebagai rintangan, titik kotoran.
* Actuators   : roda (U/R/D/L) dan sikat/penyedot (C = Bersihkan).
* Sensors     : posisi robot, sensor jarak/LiDAR (sel tetangga terhalang?),
                sensor debu (ada kotoran di sel ini?).

Program agen (AIMA, Gambar 3.1) -- agen pemecah masalah sederhana::

    function SIMPLE-PROBLEM-SOLVING-AGENT(percept) returns an action
        state <- UPDATE-STATE(state, percept)
        if seq is empty then
            goal    <- FORMULATE-GOAL(state)
            problem <- FORMULATE-PROBLEM(state, goal)
            seq     <- SEARCH(problem)
        action <- FIRST(seq);  seq <- REST(seq)
        return action
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .problem import MOVES, CleaningProblem
from .scenarios import Cell, Scenario
from .search import SearchResult, solve


@dataclass
class Percept:
    step: int
    position: Cell
    dust_here: bool
    blocked: dict[str, bool]  # arah -> sel tetangga terhalang (rintangan / dinding)


class ClassroomEnvironment:
    """Lingkungan simulasi: menjalankan aksi, menghitung ukuran performa."""

    def __init__(self, scenario: Scenario, hidden_obstacles: dict[int, Cell] | None = None) -> None:
        self.scenario = scenario
        self.pos: Cell = scenario.start
        self.dirty: set[Cell] = set(scenario.targets)
        self.obstacles: set[Cell] = set(scenario.obstacles)
        self.hidden = dict(hidden_obstacles or {})  # {langkah: sel} rintangan yang muncul tiba-tiba
        self.step_no = 0
        self.moves = 0
        self.cleans = 0
        self.collisions = 0
        self.cost = 0

    def _blocked(self, cell: Cell) -> bool:
        x, y = cell
        return not (0 <= x < self.scenario.width and 0 <= y < self.scenario.height) or cell in self.obstacles

    def percept(self) -> Percept:
        blocked = {}
        for a, (dx, dy) in MOVES.items():
            blocked[a] = self._blocked((self.pos[0] + dx, self.pos[1] + dy))
        return Percept(self.step_no, self.pos, self.pos in self.dirty, blocked)

    def execute(self, action: str) -> None:
        self.step_no += 1
        if action == "C":
            self.cost += 1
            if self.pos in self.dirty:
                self.dirty.discard(self.pos)
                self.cleans += 1
        elif action in MOVES:
            self.cost += 1
            dx, dy = MOVES[action]
            nxt = (self.pos[0] + dx, self.pos[1] + dy)
            if self._blocked(nxt):
                self.collisions += 1  # menabrak -> tidak berpindah
            else:
                self.pos = nxt
                self.moves += 1
        # kejadian dinamis: rintangan baru muncul setelah langkah ke-n
        ev = self.hidden.pop(self.step_no, None)
        if ev is not None and ev != self.pos:
            self.obstacles.add(ev)
            self.dirty.discard(ev)

    @property
    def done(self) -> bool:
        return not self.dirty and self.pos == self.scenario.start


class CleaningAgent:
    """Agen berbasis tujuan (goal-based) yang memecahkan masalah dengan pencarian."""

    def __init__(self, scenario: Scenario, algorithm: str = "astar", heuristic: str = "mst") -> None:
        self.algorithm = algorithm
        self.heuristic = heuristic
        self.width, self.height = scenario.width, scenario.height
        self.home: Cell = scenario.start
        # Pengetahuan awal agen: peta denah + lokasi target dari tugas.
        self.known_obstacles: set[Cell] = set(scenario.obstacles)
        self.targets_left: list[Cell] = list(scenario.targets)
        self.target_ids = {t: i + 1 for i, t in enumerate(scenario.targets)}
        self.pos: Cell = scenario.start
        self.seq: list[str] = []
        self.last_action: str | None = None
        self.replans = 0
        self.last_result: SearchResult | None = None
        self.search_log: list[SearchResult] = []

    # ---- komponen program agen ------------------------------------------
    def update_state(self, p: Percept) -> None:
        """UPDATE-STATE: gabungkan percept ke keyakinan agen."""
        self.pos = p.position
        if self.last_action == "C" and self.pos in self.targets_left and not p.dust_here:
            self.targets_left.remove(self.pos)
        if self.pos in self.targets_left and self.last_action != "C" and not p.dust_here and self.seq and self.seq[0] == "C":
            # sensor debu: ternyata sudah bersih -> hapus dari tujuan
            self.targets_left.remove(self.pos)
            self.seq = []
        for a, blocked in p.blocked.items():
            if blocked:
                dx, dy = MOVES[a]
                cell = (self.pos[0] + dx, self.pos[1] + dy)
                if 0 <= cell[0] < self.width and 0 <= cell[1] < self.height and cell not in self.known_obstacles:
                    self.known_obstacles.add(cell)  # temuan rintangan baru
                    self.seq = []  # rencana lama tidak valid -> rencanakan ulang

    def formulate_goal(self) -> str:
        return "semua target bersih dan robot kembali ke titik awal"

    def formulate_problem(self) -> CleaningProblem:
        remaining = [t for t in self.targets_left if t not in self.known_obstacles]
        return CleaningProblem(
            self.width,
            self.height,
            self.known_obstacles,
            start=self.pos,
            targets=remaining,
            home=self.home,
            target_ids=[self.target_ids[t] for t in remaining],
        )

    def search(self, problem: CleaningProblem) -> SearchResult:
        res = solve(problem, self.algorithm, self.heuristic)
        self.last_result = res
        self.search_log.append(res)
        return res

    # ---- fungsi agen ------------------------------------------------------
    def __call__(self, p: Percept) -> str:
        self.update_state(p)
        if not self.seq:
            self.formulate_goal()
            problem = self.formulate_problem()
            res = self.search(problem)
            if not res.success:
                self.last_action = "NOOP"
                return "NOOP"
            self.seq = list(res.actions)
            self.replans += 1
        action = self.seq.pop(0) if self.seq else "NOOP"
        self.last_action = action
        return action


@dataclass
class Trace:
    steps: list[dict] = field(default_factory=list)
    success: bool = False
    cost: int = 0
    moves: int = 0
    cleans: int = 0
    collisions: int = 0
    replans: int = 0


def run_episode(env: ClassroomEnvironment, agent: CleaningAgent, max_steps: int = 1000) -> Trace:
    """Siklus persepsi-aksi hingga tugas selesai (atau melebihi ``max_steps``)."""
    trace = Trace()
    while not env.done and env.step_no < max_steps:
        percept = env.percept()
        action = agent(percept)
        if action == "NOOP":
            break
        env.execute(action)
        trace.steps.append(
            {
                "step": env.step_no,
                "action": action,
                "position": env.pos,
                "dirty_left": len(env.dirty),
                "cost": env.cost,
            }
        )
    trace.success = env.done
    trace.cost, trace.moves, trace.cleans, trace.collisions = env.cost, env.moves, env.cleans, env.collisions
    trace.replans = agent.replans
    return trace
