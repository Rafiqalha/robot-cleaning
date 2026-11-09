"""Demo agen PEAS di terminal (ASCII).

    python -m cleanbot.demo S3 --algo astar --heur mst
    python -m cleanbot.demo S1 --obstacle 4,3@6      # rintangan tiba-tiba muncul di (4,3) setelah langkah ke-6 -> replanning
"""
from __future__ import annotations

import argparse
import time

from .agent import ClassroomEnvironment, CleaningAgent
from .benchmark import problem_from_scenario
from .problem import ACTION_NAME
from .scenarios import catalog
from .search import ALGORITHM_LABEL, solve


def draw(sc, env) -> str:
    rows = []
    for y in range(sc.height):
        row = ""
        for x in range(sc.width):
            c = (x, y)
            if c == env.pos:
                ch = "R"
            elif c in env.obstacles:
                ch = "#"
            elif c in env.dirty:
                ch = str(sc.targets.index(c) + 1) if c in sc.targets else "*"
            elif c == sc.start:
                ch = "H"
            else:
                ch = "."
            row += ch + " "
        rows.append(row)
    return "\n".join(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description="Demo agen pembersih (PEAS) di terminal")
    ap.add_argument("scenario", nargs="?", default="S1", choices=list(catalog()))
    ap.add_argument("--algo", default="astar", choices=list(ALGORITHM_LABEL))
    ap.add_argument("--heur", default="mst", choices=["mst", "max", "manhattan", "zero"])
    ap.add_argument("--obstacle", default=None, help="x,y@langkah : rintangan tak terduga")
    ap.add_argument("--delay", type=float, default=0.0, help="jeda antar-langkah (detik)")
    args = ap.parse_args()

    sc = catalog()[args.scenario]
    hidden = {}
    if args.obstacle:
        cell, step = args.obstacle.split("@")
        x, y = map(int, cell.split(","))
        hidden[int(step)] = (x, y)
    env = ClassroomEnvironment(sc, hidden_obstacles=hidden)
    agent = CleaningAgent(sc, args.algo, args.heur)

    print(f"\n=== {sc.id} · {sc.name}  |  {ALGORITHM_LABEL[args.algo]}" + (f" ({args.heur})" if args.algo in ('astar', 'greedy') else ""))
    print("R robot · H titik awal · # perabot · angka = target kotor\n")
    print(draw(sc, env))
    replans = 0
    while not env.done and env.step_no < 400:
        p = env.percept()
        before = agent.replans
        a = agent(p)
        if a == "NOOP":
            print("Agen berhenti: tidak ada rencana.")
            break
        if agent.replans > before:
            res = agent.last_result
            replans += 1
            print(f"\n[perencanaan #{agent.replans}] {agent.formulate_goal()} -> {len(res.actions)} aksi, "
                  f"{res.expanded} state diperiksa, {res.time_ms:.2f} ms")
        dust = "ADA" if p.dust_here else "-"
        blocked = "".join(k for k, v in p.blocked.items() if v) or "-"
        env.execute(a)
        print(f"langkah {env.step_no:>3}  aksi={ACTION_NAME[a]:<9} pos={env.pos}  terhalang={blocked:<4} debu={dust:<3} sisa={len(env.dirty)}  biaya={env.cost}")
        if args.delay:
            time.sleep(args.delay)
    print()
    print(draw(sc, env))
    print(f"\nSelesai={env.done}  biaya={env.cost}  gerak={env.moves}  bersih={env.cleans}  tabrakan={env.collisions}  perencanaan={agent.replans}")

    if not hidden:
        print("\nPerbandingan algoritma (rencana awal):")
        problem = problem_from_scenario(sc)
        for algo, heur in [("bfs", "mst"), ("ucs", "mst"), ("astar", "mst"), ("greedy", "mst"), ("nn", "mst")]:
            r = solve(problem, algo, heur)
            print(f"  {r.label:<26} biaya={r.cost:<3} diperiksa={r.expanded:<5} waktu={r.time_ms:6.2f} ms")


if __name__ == "__main__":
    main()
