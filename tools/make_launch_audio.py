"""Sintesis trek audio video peluncuran CleanBot 3D (30 detik) — murni numpy/scipy, tanpa sampel berhak cipta.

Isi: bantalan (pad) akor yang bergerak, petikan arpeggio, "whoosh" untuk gerak kamera, dentuman di pergantian babak,
"pop" saat gelembung penjelasan muncul, bunyi centang saat rencana ditemukan, serta lonceng penutup.
Waktu peristiwa mengikuti timeline di web/js/launch.js. Keluaran: docs_build/launch_audio.m4a (dipakai record_launch.py).

    python tools/make_launch_audio.py
"""
from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)


def mtof(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


class Bus:
    def __init__(self) -> None:
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, sig: np.ndarray, t0: float, pan: float = 0.0, gain: float = 1.0) -> None:
        i0 = int(t0 * SR)
        if i0 >= N or i0 < 0:
            return
        n = min(len(sig), N - i0)
        a = (pan + 1) * np.pi / 4
        self.l[i0:i0 + n] += sig[:n] * gain * np.cos(a)
        self.r[i0:i0 + n] += sig[:n] * gain * np.sin(a)


# empat bus: musik (kering/pantul) dan efek (kering/pantul); musik diotomasi level-nya per detik
mus_dry, mus_wet, fx_dry, fx_wet = Bus(), Bus(), Bus(), Bus()


def lp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def sweep_filter(x: np.ndarray, f0: float, f1: float, q: float = 0.9) -> np.ndarray:
    """Penyaring band-pass dengan pusat bergeser (blok demi blok, keadaan filter dibawa)."""
    out = np.zeros_like(x)
    blk = 256
    zi = np.zeros(2)
    for i in range(0, len(x), blk):
        u = i / max(1, len(x))
        fc = f0 * (f1 / f0) ** u
        w0 = 2 * np.pi * fc / SR
        alpha = np.sin(w0) / (2 * q)
        b = np.array([alpha, 0, -alpha])
        a = np.array([1 + alpha, -2 * np.cos(w0), 1 - alpha])
        b, a = b / a[0], a / a[0]
        seg_, zi = signal.lfilter(b, a, x[i:i + blk], zi=zi)
        out[i:i + blk] = seg_
    return out


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e * rel


# ------------------------------------------------------------------ instrumen musik
def pad(freqs: list[float], t0: float, dur: float, gain: float = 0.05) -> None:
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = adsr(n, min(1.6, dur * 0.35), 0.1, 1.0, min(1.8, dur * 0.4))
    for k, f in enumerate(freqs):
        v = np.zeros(n)
        for det in (-0.0016, 0.0, 0.0016):
            ph = rng.uniform(0, 2 * np.pi)
            v += np.sin(2 * np.pi * f * (1 + det) * t + ph) + 0.3 * np.sin(2 * np.pi * 2 * f * (1 + det) * t + ph)
        v *= 1 + 0.12 * np.sin(2 * np.pi * (0.17 + 0.03 * k) * t + k)
        v = lp(v, 1800) * env * gain / 3
        pan = -0.55 + 1.1 * (k % 4) / 3
        mus_dry.add(v, t0, pan, 0.75)
        mus_wet.add(v, t0, -pan, 0.9)


def bass(f: float, t0: float, dur: float, gain: float = 0.16) -> None:
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = adsr(n, 0.8, 0.2, 0.9, 1.0)
    pulse = 0.78 + 0.22 * np.sin(2 * np.pi * 1.0 * t - np.pi / 2)  # napas 60 bpm
    v = (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)) * env * pulse * gain
    mus_dry.add(v, t0, 0.0)


def pluck(f: float, t0: float, gain: float = 0.07, pan: float = 0.0, dur: float = 0.7, bright: float = 2600, bus: str = "mus") -> None:
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 7.5) * np.minimum(1, t / 0.004)
    v = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 14) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 22)
    v = lp(v, bright) * env * gain
    d, w = (mus_dry, mus_wet) if bus == "mus" else (fx_dry, fx_wet)
    d.add(v, t0, pan, 0.8)
    w.add(v, t0, -pan, 1.0)


# ------------------------------------------------------------------ efek suara
def bell(f: float, t0: float, gain: float = 0.08, dur: float = 2.4, pan: float = 0.0) -> None:
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 1.9) * np.minimum(1, t / 0.003)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.4 * np.exp(-t * 5)
    v = lp((np.sin(2 * np.pi * f * t + mod) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) * env * gain, 7000)
    fx_dry.add(v, t0, pan, 0.6)
    fx_wet.add(v, t0, -pan, 1.2)


def pop(t0: float, f0: float = 520, f1: float = 800, gain: float = 0.075, pan: float = 0.0) -> None:
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 30))
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-t * 26) * np.minimum(1, t / 0.002) * gain
    fx_dry.add(v, t0, pan)
    fx_wet.add(v, t0, -pan, 0.8)


def tick(t0: float, gain: float = 0.006, pan: float = 0.0) -> None:
    n = int(0.008 * SR)
    v = lp(hp(rng.standard_normal(n), 2500), 6000) * np.exp(-np.arange(n) / SR * 700) * gain
    fx_dry.add(v, t0, pan)


def whoosh(t0: float, dur: float, up: bool = True, gain: float = 0.11, f0: float = 250, f1: float = 3600) -> None:
    n = int(dur * SR)
    x = rng.standard_normal(n)
    y = sweep_filter(x, f0, f1, 0.7) if up else sweep_filter(x, f1, f0, 0.7)
    u = np.linspace(0, 1, n)
    env = np.sin(np.pi * u) ** (1.6 if up else 1.2)
    env = env * (u ** 0.6 if up else (1 - u) ** 0.3)
    v = lp(y * env, 5000)
    v = v / (np.max(np.abs(v)) + 1e-9) * gain
    sh = int(0.0007 * SR)  # lebar stereo: kanal kanan sedikit tertunda
    fx_dry.add(v, t0, -0.25, 1.0)
    fx_dry.add(np.concatenate([np.zeros(sh), v[:-sh]]), t0, 0.25, 1.0)
    fx_wet.add(v, t0, 0.0, 0.5)


def boom(t0: float, gain: float = 0.3, dur: float = 1.8) -> None:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 38 + 70 * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-t * 2.4) * np.minimum(1, t / 0.003) * gain
    v += lp(rng.standard_normal(n), 500) * np.exp(-t * 7) * gain * 0.3
    fx_dry.add(v, t0, 0.0)
    fx_wet.add(v * 0.3, t0, 0.0)


# ------------------------------------------------------------------ komposisi
chords = {
    "Dadd9": ([mtof(50), mtof(57), mtof(64), mtof(66), mtof(69)], mtof(38)),
    "Bm7": ([mtof(47), mtof(54), mtof(62), mtof(66), mtof(69)], mtof(35)),
    "Gmaj7": ([mtof(55), mtof(59), mtof(62), mtof(66), mtof(71)], mtof(31)),
    "A": ([mtof(52), mtof(57), mtof(61), mtof(64), mtof(69)], mtof(33)),
    "Dmaj9": ([mtof(50), mtof(57), mtof(61), mtof(64), mtof(66)], mtof(38)),
}
plan = [("Dadd9", 0.0, 6.6), ("Bm7", 6.4, 7.0), ("Gmaj7", 13.0, 4.6), ("A", 17.2, 4.6), ("Dmaj9", 21.5, 8.5)]
for name, t0, dur in plan:
    notes, root = chords[name]
    pad(notes, t0, dur + 1.2, 0.07)
    bass(root, t0, dur + 0.6, 0.15)

# arpeggio petikan (8th note ~118 bpm) — hening saat layar hitam / pengantar / penutup
step = 60 / 118 / 2
arps = {
    "Dadd9": [62, 66, 69, 74, 69, 66, 64, 66],
    "Bm7": [59, 62, 66, 71, 66, 62, 69, 66],
    "Gmaj7": [67, 71, 74, 78, 74, 71, 69, 71],
    "A": [64, 69, 73, 76, 73, 69, 71, 73],
    "Dmaj9": [62, 66, 69, 73, 74, 73, 69, 66],
}


def active(t: float) -> bool:
    return not (t < 2.5 or 12.5 < t < 13.9 or 20.7 < t < 21.9 or t > 26.0)


k = 0
t = 2.6
cur = "Dadd9"
while t < 26.0:
    for name, t0, dur in plan:
        if t0 <= t < t0 + dur:
            cur = name
    if active(t):
        lvl = 0.5 + 0.5 * min(1, (t - 2.6) / 4)
        pluck(mtof(arps[cur][k % 8]), t, 0.05 * lvl, pan=(-0.4 if k % 2 == 0 else 0.4))
    k += 1
    t += step

# 'komputasi' cepat saat pencarian A* (13.85-14.83): 16th-note naik pentatonik (efek, tidak diotomasi)
for i in range(int((14.83 - 13.85) / (step / 2))):
    tm = 13.85 + i * step / 2
    m = [74, 78, 81, 85, 86, 90][i % 6] - 12 * (i % 2 == 0)
    pluck(mtof(m), tm, 0.035, pan=float(np.sin(i)), dur=0.35, bright=4200, bus="fx")

# gerak kamera & transisi
for t0, d, up in [(0.1, 2.6, True), (2.9, 0.8, True), (5.0, 1.0, True), (7.5, 1.0, True), (10.0, 1.0, True),
                  (11.8, 1.2, False), (13.3, 0.9, True), (15.5, 1.5, True), (20.5, 1.0, True), (21.5, 0.9, False),
                  (21.85, 1.1, True), (25.4, 1.1, True)]:
    whoosh(t0, d, up, gain=0.11 if d > 1 else 0.085)

boom(13.1)  # pergantian ke ruang kelas (di layar hitam)
boom(21.55, 0.26)  # selesai
boom(26.1, 0.28)  # logo

# pin muncul (4 nada cepat) dan gelembung penjelasan
for i, m in enumerate([72, 76, 79, 83]):
    pop(2.0 + i * 0.09, mtof(m) * 0.8, mtof(m), 0.05, pan=-0.3 + 0.2 * i)
cards = [(3.2, 5.3, 90), (5.8, 7.9, 90), (8.2, 10.3, 90), (10.7, 12.5, 90), (13.9, 16.5, 90), (17.0, 20.6, 90)]
for i, (t0, t1, cps) in enumerate(cards):
    pan_ = 0.35 if i % 2 == 0 else -0.35
    pop(t0 + 0.05, 520, 800, 0.07, pan=pan_)
    pop(t1 - 0.4, 800, 420, 0.035, pan=pan_)
    for c in range(0, 52, 3):  # ketikan halus (tiap 3 huruf)
        tick(t0 + 0.5 + c / cps, 0.006, pan=pan_ * 0.8)

# rencana ditemukan, eksekusi mulai, selesai (perayaan), kartu statistik, logo
bell(mtof(93), 14.83, 0.045, 1.6, -0.2)
bell(mtof(100), 14.95, 0.035, 1.6, 0.2)
pluck(mtof(69), 15.97, 0.07, 0.0, 1.0, bus="fx")
for i, m in enumerate([74, 78, 81, 86, 90]):
    bell(mtof(m), 21.65 + i * 0.1, 0.065, 2.6, -0.4 + 0.2 * i)
for i, m in enumerate([81, 85, 88]):
    pluck(mtof(m), 22.4 + i * 0.16, 0.085, 0.0, 0.9, bright=3800, bus="fx")
bell(mtof(74), 27.0, 0.085, 3.0, -0.2)
bell(mtof(81), 27.12, 0.065, 3.0, 0.2)
bell(mtof(86), 27.25, 0.055, 3.2, 0.0)

# ------------------------------------------------------------------ reverb & mastering
ir_n = int(1.9 * SR)
ir_t = np.arange(ir_n) / SR
irs = []
for _ in range(2):
    ir = lp(rng.standard_normal(ir_n) * np.exp(-ir_t * 2.6), 5500)
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    irs.append(ir / (np.sqrt(np.sum(ir ** 2)) / 3.5))


def rev(bus: Bus) -> tuple[np.ndarray, np.ndarray]:
    return signal.fftconvolve(bus.l, irs[0])[:N] * 0.30, signal.fftconvolve(bus.r, irs[1])[:N] * 0.30


ml, mr = rev(mus_wet)
fl, fr = rev(fx_wet)
tt_ = np.arange(N) / SR
# otomasi level musik (dB): intro pelan, ruang gelap lebih rendah agar efek menonjol, penutup menguat
pts_t = [0.0, 1.0, 2.7, 12.3, 13.0, 13.5, 14.0, 20.6, 21.3, 22.0, 26.0, 27.0, 29.0, 30.0]
pts_db = [-60, -16, -9, -9, -20, -20, -10, -9, -22, -9, -9, -7, -7, -20]
gm = 10 ** (np.interp(tt_, pts_t, pts_db) / 20)
L = (mus_dry.l + ml) * gm + (fx_dry.l + fl)
R = (mus_dry.r + mr) * gm + (fx_dry.r + fr)

fade = np.ones(N)
fi, fo = int(0.5 * SR), int(1.2 * SR)
fade[:fi] = np.linspace(0, 1, fi) ** 2
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
L, R = L * fade, R * fade
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = np.tanh(L / peak * 1.4) / np.tanh(1.4), np.tanh(R / peak * 1.4) / np.tanh(1.4)  # kompresi lunak
L, R = hp(L, 28, 1), hp(R, 28, 1)
scale = 0.76 / max(np.max(np.abs(L)), np.max(np.abs(R)))
stereo = np.stack([L, R], axis=1) * scale
pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")

out_dir = ROOT / "docs_build"
out_dir.mkdir(exist_ok=True)
wav = out_dir / "launch_audio.wav"
with wave.open(str(wav), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
ff = shutil.which("ffmpeg")
if ff:
    m4a = out_dir / "launch_audio.m4a"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "192k", str(m4a)], check=True)
    print("audio:", m4a, f"({m4a.stat().st_size / 1e3:.0f} KB)", "· puncak", f"{20 * np.log10(np.max(np.abs(stereo))):.1f} dBFS")
else:
    print("ffmpeg tidak ditemukan; WAV di", wav)
