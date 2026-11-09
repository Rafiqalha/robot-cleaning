"""Rekam video demo CleanBot 3D (MP4) secara deterministik.

Cara kerja: jam virtual Playwright (page.clock) memajukan simulasi tepat 1/fps detik per bingkai, lalu satu
tangkapan layar diambil per bingkai (tanpa lompatan akibat lambatnya tangkapan layar), dan ffmpeg menyatukannya.
Hasilnya mulus walaupun perangkat tidak mampu merender 30 fps secara real-time.

Prasyarat: server berjalan (python server.py), `pip install playwright`, ffmpeg di PATH.

    python tools/record_demo.py                       # S4, A* (MST), 30 fps -> docs/demo_S4.mp4 (+ _720p)
    python tools/record_demo.py --scenario S3 --fps 24 --max-seconds 60
    python tools/record_demo.py --test                # uji singkat 4 detik
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://localhost:8765/"
W, H = 1920, 1080

# Koreografi kamera: (detik, mode). Mode 'overview' menampilkan heat-map pencarian; 'follow'/'fpv'/'cinema' saat eksekusi.
SHOTLIST = [(0.0, "overview"), (9.0, "follow"), (19.0, "fpv"), (25.0, "cinema"), (34.0, "overview")]


def encode(frames: Path, fps: int, out: Path) -> None:
    ff = shutil.which("ffmpeg")
    if not ff:
        print("ffmpeg tidak ditemukan; bingkai tersimpan di", frames)
        return
    base = [ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(frames / "%05d.jpg")]
    subprocess.run(base + ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium", "-movflags", "+faststart", str(out)], check=True)
    out720 = out.with_name(out.stem + "_720p.mp4")
    subprocess.run(base + ["-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium", "-movflags", "+faststart", str(out720)], check=True)
    print("video:", out, f"({out.stat().st_size / 1e6:.1f} MB)", "·", out720.name, f"({out720.stat().st_size / 1e6:.1f} MB)")
    # gambar sampul untuk slide video pada PPT (bingkai ke-13 detik)
    poster = ROOT / "docs_build" / "img" / "demo_poster.png"
    poster.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", "13", "-i", str(out), "-frames:v", "1", "-vf", "scale=1280:-2", str(poster)], check=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="S4")
    ap.add_argument("--algo", default="astar")
    ap.add_argument("--heur", default="mst")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--speed", type=float, default=1.6, help="kecepatan eksekusi robot")
    ap.add_argument("--max-seconds", type=float, default=70.0)
    ap.add_argument("--tail", type=float, default=2.5, help="detik tambahan setelah selesai")
    ap.add_argument("--out", default=str(ROOT / "docs" / "demo_S4.mp4"))
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--test", action="store_true", help="uji singkat 4 detik, tanpa menyandikan video")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames = ROOT / "docs_build" / "frames"
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True, exist_ok=True)
    step_ms = 1000.0 / args.fps

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1.0)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.clock.install()  # jam virtual (berjalan normal sampai dijeda)
        page.goto(f"{BASE}?quality=ultra&nointro=1&scenario={args.scenario}&algo={args.algo}&heur={args.heur}")
        page.wait_for_function("window.cleanbot && window.cleanbot.director && window.cleanbot.hud", timeout=90000, polling=200)
        time.sleep(2.0)  # biarkan aset, tekstur, dan bayangan selesai dimuat
        now = page.evaluate("() => Date.now()")
        page.clock.pause_at(now + 200)
        page.clock.run_for(500)

        page.evaluate(f"() => {{ const a = window.cleanbot, d = a.director; d.speed = {args.speed}; a.rig.setMode('overview', {{duration: 0}}); return 1; }}")
        page.clock.run_for(800)
        page.evaluate("() => { window.cleanbot.director.start(); return 1; }")
        time.sleep(0.6)  # permintaan /api/plan berjalan pada waktu nyata

        shots = list(SHOTLIST)
        t = 0.0
        n = 0
        prev_ms = 0
        done_at = None
        limit = 4.0 if args.test else args.max_seconds
        t_wall = time.time()
        while t < limit:
            while shots and t >= shots[0][0]:
                _, mode = shots.pop(0)
                page.evaluate(f"() => {{ window.cleanbot.rig.setMode('{mode}'); return 1; }}")
            target = round((n + 1) * step_ms)  # tick bilangan bulat dengan galat kumulatif nol
            page.clock.run_for(target - prev_ms)
            prev_ms = target
            page.screenshot(path=str(frames / f"{n:05d}.jpg"), type="jpeg", quality=92)
            n += 1
            t = n / args.fps
            if n % args.fps == 0:
                state = page.evaluate("() => window.cleanbot.director.state")
                print(f"  t={t:5.1f}s  bingkai={n}  keadaan={state}  ({(time.time() - t_wall) / n * 1000:.0f} ms/bingkai)")
                if state == "done" and done_at is None:
                    done_at = t
            if done_at is not None and t >= done_at + args.tail:
                break
        print("bingkai:", n, "· durasi:", f"{n / args.fps:.1f} s", "· galat halaman:", errors[:3])
        browser.close()

    if args.test:
        print("uji selesai; contoh bingkai:", frames / "00000.jpg", frames / f"{n - 1:05d}.jpg")
        return
    encode(frames, args.fps, out)
    if not args.keep_frames:
        shutil.rmtree(frames, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
