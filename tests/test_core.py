"""Uji inti AI: optimalitas, admissibility heuristik, agen, dan penanganan kasus tepi."""
from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cleanbot import (  # noqa: E402
    ClassroomEnvironment,
    CleaningAgent,
    CleaningProblem,
    catalog,
    random_scenario,
    run_episode,
    solve,
)
from cleanbot.api import build_problem, plan_payload  # noqa: E402
from cleanbot.benchmark import problem_from_scenario  # noqa: E402
from cleanbot.heuristics import make_heuristic  # noqa: E402
from cleanbot.problem import State  # noqa: E402

SCENARIOS = list(catalog().values())


def replay(problem: CleaningProblem, actions: list[str]) -> State:
    s = problem.initial_state()
    for a in actions:
        assert a in problem.actions(s), f"aksi ilegal {a} di {s}"
        s = problem.result(s, a)
    return s


@pytest.mark.parametrize("sc", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_all_optimal_algorithms_agree_and_reach_goal(sc):
    problem = problem_from_scenario(sc)
    costs = {}
    for algo, heur in [("bfs", None), ("ucs", None), ("astar", "manhattan"), ("astar", "max"), ("astar", "mst"), ("astar", "zero")]:
        res = solve(problem, algo, heur or "mst")
        assert res.success, (algo, heur)
        final = replay(problem, res.actions)
        assert problem.goal_test(final)
        assert res.cost == len(res.actions)  # biaya 1 per aksi
        costs[(algo, heur)] = res.cost
    assert len(set(costs.values())) == 1, costs


@pytest.mark.parametrize("sc", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_astar_expands_fewer_states_than_uninformed(sc):
    problem = problem_from_scenario(sc)
    bfs = solve(problem, "bfs")
    ucs = solve(problem, "ucs")
    a_mst = solve(problem, "astar", "mst")
    assert a_mst.expanded <= ucs.expanded
    assert a_mst.expanded < bfs.expanded
    assert solve(problem, "astar", "mst").cost == bfs.cost


def test_heuristics_are_admissible_and_consistent():
    """h(s) <= biaya-sisa-optimal(s) dan h(s) <= c + h(s') pada banyak state acak."""
    for seed in range(6):
        sc = random_scenario(6, 5, 3, seed)
        problem = problem_from_scenario(sc)
        # biaya sisa optimal dari tiap state = UCS mundur; hitung via UCS maju dari tiap state sampel
        rng = random.Random(seed)
        cells = [c for c in sc.free_cells()]
        for name in ("manhattan", "max", "mst"):
            h = make_heuristic(problem, name)
            for _ in range(25):
                cell = rng.choice(cells)
                mask = rng.randrange(0, problem.full_mask + 1)
                s = State(cell[0], cell[1], mask)
                sub = CleaningProblem(
                    problem.width, problem.height, problem.obstacles, cell,
                    [problem.targets[i] for i in range(problem.k) if mask >> i & 1],
                    home=problem.home,
                )
                best = solve(sub, "ucs")
                assert best.success
                assert h(s) <= best.cost, (name, s, h(s), best.cost)
                for a, s2, c in problem.successors(s):
                    assert h(s) <= c + h(s2), (name, s, a)


def test_goal_state_has_zero_heuristic():
    sc = catalog()["S1"]
    problem = problem_from_scenario(sc)
    for name in ("manhattan", "max", "mst", "zero"):
        h = make_heuristic(problem, name)
        assert h(State(problem.home[0], problem.home[1], 0)) == 0


def test_no_targets_returns_empty_plan():
    p = CleaningProblem(4, 3, [], (0, 2), [])
    for algo in ("bfs", "ucs", "astar", "greedy", "nn"):
        res = solve(p, algo)
        assert res.success and res.actions == []


def test_start_equals_target():
    p = CleaningProblem(4, 3, [], (0, 2), [(0, 2)])
    res = solve(p, "astar")
    assert res.actions == ["C"] and res.cost == 1


def test_unreachable_target_is_reported_and_skipped():
    spec = {
        "width": 5, "height": 3,
        "obstacles": [[2, 0], [2, 1], [2, 2]],  # tembok pemisah
        "start": [0, 2],
        "targets": [{"id": 1, "x": 1, "y": 2}, {"id": 2, "x": 4, "y": 0}],
    }
    problem, skipped = build_problem(spec)
    assert skipped == [2]
    payload = plan_payload(spec, "astar", "mst")
    assert payload["ok"] and payload["skipped"] == [2]
    # tanpa pelewatan, solver langsung gagal dengan pesan jelas
    raw = CleaningProblem(5, 3, [(2, 0), (2, 1), (2, 2)], (0, 2), [(1, 2), (4, 0)])
    res = solve(raw, "astar")
    assert not res.success and "tidak dapat dijangkau" in res.message


def test_nearest_neighbor_never_beats_optimal():
    worse_somewhere = False
    for seed in range(15):
        sc = random_scenario(8, 6, 5, seed)
        problem = problem_from_scenario(sc)
        opt = solve(problem, "astar", "mst").cost
        nn = solve(problem, "nn")
        assert nn.success
        assert replay(problem, nn.actions) and problem.goal_test(replay(problem, nn.actions))
        assert nn.cost >= opt
        worse_somewhere |= nn.cost > opt
    assert worse_somewhere, "NN seharusnya tidak optimal pada setidaknya satu denah acak"


@pytest.mark.parametrize("sc", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_agent_completes_task_with_optimal_cost(sc):
    env = ClassroomEnvironment(sc)
    agent = CleaningAgent(sc, "astar", "mst")
    trace = run_episode(env, agent)
    assert trace.success and trace.collisions == 0
    assert trace.cost == solve(problem_from_scenario(sc), "astar", "mst").cost
    assert agent.replans == 1


def test_agent_replans_when_obstacle_appears():
    sc = catalog()["S1"]
    plan = solve(problem_from_scenario(sc), "astar", "mst")
    # letakkan rintangan pada sel di tengah rute (bukan sel awal/target) setelah beberapa langkah
    route = [(s.x, s.y) for s in plan.states]
    blocked_cell = next(c for c in route[6:] if c != sc.start and c not in sc.targets)
    env = ClassroomEnvironment(sc, hidden_obstacles={2: blocked_cell})
    agent = CleaningAgent(sc, "astar", "mst")
    trace = run_episode(env, agent)
    assert trace.success
    assert agent.replans >= 2  # rencana awal + perencanaan ulang
    assert trace.collisions == 0  # sensor jarak mencegah tabrakan


def test_catalog_matches_uts_designs():
    cat = catalog()
    assert [(c.width, c.height) for c in list(cat.values())[:3]] == [(8, 5)] * 3
    assert [len(c.targets) for c in list(cat.values())[:3]] == [3, 3, 5]
    assert all(c.start == (0, 4) for c in list(cat.values())[:3])
