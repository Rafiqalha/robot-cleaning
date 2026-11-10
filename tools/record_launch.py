"""Rekam video peluncuran produk CleanBot 3D (30 detik) secara deterministik.

Mode `?launch=1` pada aplikasi web membangun panggung studio, rig kamera, dan anotasi (titik + gelembung penjelasan)
sebagai fungsi dari waktu timeline. Skrip ini menggerakkan simulasi secara manual: tiap bingkai video memanggil
`launch.frame(t, dt)` (satu langkah dt = 1/fps, tanpa bergantung pada tick requestAnimationFrame), mengambil satu
tangkapan layar, lalu ffmpeg menyatukannya (H.264, BT.709) bersama audio hasil `make_launch_audio.py`.
Bagian agen yang dipercepat (lompat ke selesai) dijalankan saat layar hitam tanpa merender sehingga tidak muncul di video.

Prasyarat: server berjalan (python server.py), `pip install playwright`, ffmpeg di PATH.

    python tools/record_launch.py                       # 1080p, 60 fps -> docs/launch_cleanbot_30s.mp4 (+ _720p)
    python tools/record_launch.py --fps 30              # lebih cepat dirender
    python tools/record_launch.py --stills 2.5,6,15,23  # PNG uji pada detik tertentu -> docs_build/stills (tanpa video)
    python tools/record_launch.py --test                # uji singkat 3 detik
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


def encode(frames: Path, fps: int, out: Path, audio: Path | None) -> None:
    ff = shutil.which("ffmpeg")
    if not ff:
        print("ffmpeg tidak ditemukan; bingkai tersimpan di", frames)
        return
    src = [ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(frames / "%05d.jpg")]
    if audio and audio.exists():
        src += ["-i", str(audio)]
    amap = ["-c:a", "aac", "-b:a", "192k", "-shortest"] if audio and audio.exists() else []
    # JPEG = YCbCr BT.601 rentang penuh -> H.264 BT.709 rentang TV agar warna/kontras benar di semua pemutar
    conv = "scale=in_range=full:in_color_matrix=bt601:out_range=limited:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int"
    tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    meta = ["-metadata", "title=CleanBot 3D - Video Peluncuran Produk", "-metadata", "artist=Kelompok 6 AI-D, UIN Malang", "-metadata", "comment=Dibuat otomatis: tools/record_launch.py"]
    vid = ["-c:v", "libx264", "-preset", "slow", "-x264-params", "aq-mode=3:aq-strength=0.9", "-movflags", "+faststart"] + tags + meta
    subprocess.run(src + ["-vf", conv + ",format=yuv420p"] + vid + ["-crf", "20", "-maxrate", "30M", "-bufsize", "60M"] + amap + [str(out)], check=True)
    out720 = out.with_name(out.stem + "_720p.mp4")
    subprocess.run(src + ["-vf", "scale=1280:720:flags=lanczos:in_range=full:in_color_matrix=bt601:out_range=limited:out_color_matrix=bt709,format=yuv420p"] + vid + ["-crf", "22"] + amap + [str(out720)], check=True)
    print("video:", out, f"({out.stat().st_size / 1e6:.1f} MB)", "·", out720.name, f"({out720.stat().st_size / 1e6:.1f} MB)")


def fast_forward(page) -> int:
    """Percepat agen sampai selesai tanpa merender (layar sedang hitam), lalu biarkan animasi sisa mengendap."""
    page.evaluate("() => { window.launch.fastForward(); return 1; }")
    return 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--dur", type=float, default=30.0, help="durasi video (detik)")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--dsf", type=float, default=1.0, help="device scale factor (2 = supersampling 4K lalu perkecil)")
    ap.add_argument("--quality", default="ultra")
    ap.add_argument("--scenario", default="S4")
    ap.add_argument("--out", default=str(ROOT / "docs" / "launch_cleanbot_30s.mp4"))
    ap.add_argument("--audio", default=str(ROOT / "docs_build" / "launch_audio.m4a"))
    ap.add_argument("--stills", default="", help="daftar detik (koma) -> PNG di docs_build/stills, tanpa video")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--test", action="store_true", help="uji singkat 3 detik, tanpa menyandikan video")
    ap.add_argument("--js", default="", help="JavaScript yang dijalankan setelah halaman siap (untuk menyetel nilai saat uji)")
    args = ap.parse_args()

    stills = sorted({float(x) for x in args.stills.split(",") if x.strip()})
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames = ROOT / "docs_build" / ("stills" if stills else "frames_launch")
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True, exist_ok=True)
    fps = args.fps
    total = round((min(args.dur, 3.0) if args.test else args.dur) * fps)
    still_frames = {round(t * fps): t for t in stills}
    if stills:
        total = max(still_frames) + 1

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        page = browser.new_page(viewport={"width": args.width, "height": args.height}, device_scale_factor=args.dsf)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.clock.install()
        page.goto(f"{BASE}?quality={args.quality}&nointro=1&scenario={args.scenario}&launch=1")
        page.wait_for_function("window.launch && window.launch.ready", timeout=90000, polling=200)
        time.sleep(2.0)  # biarkan aset, tekstur, dan bayangan selesai dimuat
        if args.js:
            page.evaluate("() => { " + args.js + " ; return 1; }")
        now = page.evaluate("() => Date.now()")
        page.clock.pause_at(now + 200)  # bekukan jam; simulasi digerakkan manual lewat launch.frame

        dt = 1.0 / fps
        ran = False
        t_wall = time.time()
        for n in range(total):
            t = n / fps
            want = (not stills) or (n in still_frames)
            info = page.evaluate("([t, dt, r]) => window.launch.frame(t, dt, r)", [t, dt, want])
            if info["run"] and not ran:
                ran = True
                time.sleep(0.8)  # permintaan /api/plan berjalan pada waktu nyata: pastikan tiba sebelum simulasi maju
            if info["ff"]:
                k = fast_forward(page)
                print(f"  [fast-forward] t={t:5.2f}s selesai")
                page.evaluate("([t, dt, r]) => window.launch.frame(t, dt, r)", [t, dt, want])
            if want:
                if stills:
                    page.screenshot(path=str(frames / f"s_{still_frames[n]:06.2f}.png"), type="png")
                else:
                    page.screenshot(path=str(frames / f"{n:05d}.jpg"), type="jpeg", quality=93)
            if n % fps == 0 and (not stills or want or n % (fps * 5) == 0):
                st = page.evaluate("() => { const a = window.cleanbot; return a.director.state + ' · robot ' + a.robot.group.position.x.toFixed(2) + ',' + a.robot.group.position.z.toFixed(2); }")
                print(f"  t={t:5.1f}s  bingkai={n}  {st}  ({(time.time() - t_wall) / (n + 1) * 1000:.0f} ms/bingkai)")
        print("alur agen:", page.evaluate("() => window.launch.log.join(' | ')"))
        print("bingkai:", total, "· durasi:", f"{total / fps:.1f} s", "· galat halaman:", errors[:4])
        browser.close()

    if stills:
        print("PNG uji ada di", frames)
        return
    if args.test:
        print("uji selesai; contoh bingkai:", frames / "00000.jpg", frames / f"{total - 1:05d}.jpg")
        return
    encode(frames, fps, out, Path(args.audio))
    if not args.keep_frames:
        shutil.rmtree(frames, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
