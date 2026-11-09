"""Tangkapan layar otomatis aplikasi CleanBot 3D (Playwright + Chrome, GPU) untuk PPT/laporan/README.

Prasyarat: server berjalan (python server.py --dev) dan `pip install playwright`.
Pemakaian:
    python tools/capture.py all
    python tools/capture.py ui_idle ui_search route
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
BASE = "http://localhost:8765/"
W, H = 1920, 1080

HELPERS = """
window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
window.__waitFor = (fn, to = 40000) => new Promise(r => { const t0 = performance.now(); const i = setInterval(() => { let ok = false; try { ok = fn(); } catch (e) {} if (ok || performance.now() - t0 > to) { clearInterval(i); r(ok); } }, 40); });
window.__cam = (px, py, pz, tx, ty, tz, fov = 38) => { const a = window.cleanbot; a.rig.setMode('free'); a.stage.controls.enabled = false; const c = a.stage.camera; c.position.set(px, py, pz); a.stage.controls.target.set(tx, ty, tz); c.lookAt(tx, ty, tz); c.fov = fov; c.updateProjectionMatrix(); };
"""


def open_page(p, query: str = "", hud: bool = True, dsf: float = 1.0):
    b = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
    pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=dsf)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.add_init_script(HELPERS)
    pg.goto(f"{BASE}?quality=ultra&nointro=1{'&' if query else ''}{query}")
    pg.wait_for_function("window.cleanbot && window.cleanbot.director && window.cleanbot.hud", timeout=90000)
    pg.evaluate("() => window.__sleep(1800)")
    if not hud:
        pg.evaluate("() => document.body.classList.add('clean')")
        pg.evaluate("() => window.__sleep(900)")
    return b, pg, errors


def shot(pg, name: str):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    pg.screenshot(path=str(path))
    print("  ->", path.name)


# ----------------------------------------------------------------------------
def ui_idle(p):
    b, pg, err = open_page(p, "scenario=S1")
    shot(pg, "ui_idle_S1")
    b.close()


def ui_run(p):
    """HUD saat pencarian (heat-map) dan saat eksekusi."""
    b, pg, err = open_page(p, "scenario=S3&algo=astar&heur=mst")
    pg.evaluate("() => { const d = window.cleanbot.director; d.speed = 1; d.start(); return 1; }")
    pg.wait_for_function("window.cleanbot.viz.play && window.cleanbot.viz.play.t / window.cleanbot.viz.play.seconds > 0.6", timeout=60000)
    shot(pg, "ui_search_S3")
    pg.evaluate("() => { window.cleanbot.hud.tab('masalah'); }")
    pg.wait_for_function("window.cleanbot.director.state === 'executing' && window.cleanbot.director.exec && window.cleanbot.director.exec.cursor >= 14", timeout=90000)
    shot(pg, "ui_exec_S3")
    pg.evaluate("() => { window.cleanbot.hud.tab('rencana'); }")
    pg.evaluate("() => window.__sleep(500)")
    shot(pg, "ui_plan_S3")
    pg.evaluate("() => { window.cleanbot.hud.tab('peas'); }")
    pg.evaluate("() => window.__sleep(300)")
    shot(pg, "ui_peas_S3")
    pg.wait_for_function("window.cleanbot.director.state === 'done'", timeout=120000)
    pg.evaluate("() => window.__sleep(1800)")
    shot(pg, "ui_done_S3")
    print("  galat:", err[:3])
    b.close()


def ui_metrik(p):
    """Panel Metrik setelah pencarian selesai (nilai akhir, bukan hitungan animasi)."""
    b, pg, err = open_page(p, "scenario=S3&algo=astar&heur=mst")
    pg.evaluate("() => { const d = window.cleanbot.director; d.speed = 2; d.start(); return 1; }")
    pg.wait_for_function("window.cleanbot.director.state === 'executing'", timeout=90000)
    pg.evaluate("() => { window.cleanbot.hud.tab('metrik'); return window.__sleep(900); }")
    shot(pg, "ui_metrik_S3")
    print("  galat:", err[:3])
    b.close()


def ui_lab(p):
    b, pg, err = open_page(p, "scenario=S1")
    pg.evaluate("() => window.cleanbot.hud.openLab()")
    pg.wait_for_selector("#lab-body table.bench", timeout=60000)
    pg.evaluate("() => window.__sleep(700)")
    shot(pg, "ui_lab")
    b.close()


def ui_editor(p):
    b, pg, err = open_page(p, "scenario=S1")
    pg.evaluate("() => { const a = window.cleanbot; a.hud.setMode('editor'); return 1; }")
    pg.evaluate("() => window.__sleep(2200)")
    pg.evaluate("""() => { const e = window.cleanbot.editor; e.tool='dirt'; e.apply([6,4]); e.apply([0,0]); e.tool='desk'; e.apply([4,2]); e.apply([5,2]); e.tool='cabinet'; e.apply([7,3]); return 1; }""")
    pg.evaluate("() => window.__sleep(900)")
    shot(pg, "ui_editor")
    b.close()


def ui_game(p):
    b, pg, err = open_page(p, "scenario=S1")
    pg.evaluate("() => { window.cleanbot.hud.setMode('game'); return 1; }")
    pg.evaluate("() => window.__sleep(1500)")
    pg.evaluate("""async () => { const a = window.cleanbot; const spec = a.director.spec();
      const plan = await (await fetch('/api/plan', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...spec, algorithm:'astar', heuristic:'mst'})})).json();
      let n = 0; for (const act of plan.actions) { if (n++ > 14) break; if (act === 'C') await a.game.clean(); else await a.game.move(act); } return 1; }""")
    shot(pg, "ui_game_play")
    pg.evaluate("""async () => { const a = window.cleanbot; const spec = a.director.spec();
      const plan = await (await fetch('/api/plan', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...spec, algorithm:'astar', heuristic:'mst'})})).json();
      const rest = plan.actions.slice(15); for (const act of rest) { if (act === 'C') await a.game.clean(); else await a.game.move(act); } await window.__sleep(1500); return 1; }""")
    shot(pg, "ui_game_result")
    b.close()


def hero(p):
    """Gambar tanpa HUD: rute tiap skenario, heat-map BFS vs A*, close-up robot."""
    b, pg, err = open_page(p, "scenario=S4", hud=False)
    for sid in ("S1", "S2", "S3", "S4"):
        pg.evaluate(f"""() => {{ const a = window.cleanbot, d = a.director; d.speed = 4; d.algo='astar'; d.heur='mst'; d.loadScenario(a.meta.scenarios.find(s => s.id === '{sid}')); a.rig.setMode('overview', {{duration: 0}}); return 1; }}""")
        pg.evaluate("() => window.__sleep(1200)")
        pg.evaluate("() => { window.cleanbot.director.start(); return 1; }")
        pg.wait_for_function("window.cleanbot.viz.uniforms.uReveal.value > 1 && window.cleanbot.director.state === 'executing'", timeout=60000)
        pg.evaluate("() => window.__sleep(350)")
        shot(pg, f"route_{sid}")
        pg.evaluate("() => window.cleanbot.director.resetRun()")
    # heat-map BFS vs A* pada S4 (kamera overview)
    pg.evaluate("""() => { const a = window.cleanbot, d = a.director; d.loadScenario(a.meta.scenarios.find(s => s.id === 'S4')); a.rig.setMode('overview', {duration: 0}); a.viz.setRouteEnabled(false); return 1; }""")
    for algo in ("bfs", "ucs", "astar"):
        pg.evaluate(f"() => {{ const d = window.cleanbot.director; d.speed = 4; d.algo = '{algo}'; d.heur = 'mst'; d.resetRun(); return 1; }}")
        pg.evaluate("() => window.__sleep(700)")
        pg.evaluate("() => { window.cleanbot.director.start(); return 1; }")
        pg.wait_for_function("window.cleanbot.director.state === 'planned'", timeout=60000)
        pg.evaluate("() => window.__sleep(900)")
        shot(pg, f"heat3d_{algo}_S4")
    pg.evaluate("() => { const a = window.cleanbot; a.viz.setRouteEnabled(true); a.director.resetRun(); return 1; }")
    print("  galat:", err[:3])
    b.close()


def closeups(p):
    b, pg, err = open_page(p, "scenario=S3", hud=False)
    # robot wajah (cleaning ala ikon UTS) di dock
    pg.evaluate("""() => { const a = window.cleanbot; a.robot.setMode('cleaning'); const q = a.robot.position; window.__cam(q.x + 1.55, 0.68, q.z - 0.15, q.x, 0.24, q.z, 34); return 1; }""")
    pg.evaluate("() => window.__sleep(1200)")
    shot(pg, "robot_face_cleaning")
    pg.evaluate("""() => { const a = window.cleanbot; a.robot.setMode('idle'); const q = a.robot.position; window.__cam(q.x + 1.5, 0.9, q.z + 1.7, q.x, 0.2, q.z, 36); return 1; }""")
    pg.evaluate("() => window.__sleep(900)")
    shot(pg, "robot_dock_3q")
    # cleaning follow-cam: jalankan A* dan ambil saat hisap
    pg.evaluate("""() => { const a = window.cleanbot, d = a.director; a.rig.setMode('overview', {duration:0}); d.speed = 2.5; d.start(); return 1; }""")
    pg.wait_for_function("window.cleanbot.litter.suctions.length > 0", timeout=90000)
    pg.evaluate("() => { window.cleanbot.rig.setMode('follow', {duration: 0}); return 1; }")
    pg.evaluate("() => window.__sleep(900)")
    shot(pg, "follow_cleaning")
    # kamera robot (FPV) saat bergerak setelah target pertama
    pg.evaluate("() => { window.cleanbot.rig.setMode('fpv'); return 1; }")
    pg.evaluate("() => window.__sleep(2600)")
    shot(pg, "fpv_run")
    pg.evaluate("() => { window.cleanbot.rig.setMode('cinema'); return 1; }")
    pg.evaluate("() => window.__sleep(3500)")
    shot(pg, "cinema_run")
    pg.wait_for_function("window.cleanbot.director.state === 'done'", timeout=120000)
    pg.evaluate("() => { window.cleanbot.rig.setMode('overview'); return window.__sleep(2500); }")
    shot(pg, "done_overview")
    print("  galat:", err[:3])
    b.close()


JOBS = {"ui_idle": ui_idle, "ui_run": ui_run, "ui_metrik": ui_metrik, "ui_lab": ui_lab, "ui_editor": ui_editor, "ui_game": ui_game, "hero": hero, "closeups": closeups}


def main() -> None:
    names = sys.argv[1:] or ["all"]
    if "all" in names:
        names = list(JOBS)
    with sync_playwright() as p:
        for n in names:
            t0 = time.time()
            print(f"== {n}")
            JOBS[n](p)
            print(f"   ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
