"""Tekstur prosedural (numpy + Pillow): ubin lantai, kayu meja, plester dinding.

Semua noise dibuat lewat filter Gaussian di domain frekuensi (FFT) sehingga
otomatis *tileable* (bisa diulang tanpa sambungan terlihat).

Jalankan::

    python blender/make_textures.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WEB_TEX = ROOT / "web" / "assets" / "textures"
BLENDER_TEX = ROOT / "blender" / "textures"


def fft_noise(h: int, w: int, sx: float, sy: float, rng: np.random.Generator) -> np.ndarray:
    """Noise halus periodik ternormalisasi ke [0, 1]; sx/sy = sigma Gaussian (piksel)."""
    f = np.fft.fft2(rng.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * np.pi**2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    out = np.real(np.fft.ifft2(f * g))
    out -= out.min()
    out /= out.max() + 1e-9
    return out


def fbm(h: int, w: int, rng, base: float = 64.0, octaves: int = 5, aniso: tuple[float, float] = (1.0, 1.0)) -> np.ndarray:
    acc = np.zeros((h, w))
    amp, tot, s = 1.0, 0.0, base
    for _ in range(octaves):
        acc += amp * (fft_noise(h, w, s * aniso[0], s * aniso[1], rng) - 0.5)
        tot += amp
        amp *= 0.55
        s = max(s / 2, 0.6)
    return acc / tot


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    """Peta normal (konvensi OpenGL, +Y ke atas) dari peta tinggi periodik."""
    dh_dcol = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    dh_drow = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    nx = -dh_dcol * strength
    ny = dh_drow * strength  # v ke atas = baris ke atas -> tanda dibalik
    nz = np.ones_like(nx)
    ln = np.sqrt(nx**2 + ny**2 + nz**2)
    n = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def save(arr: np.ndarray, name: str, quality: int = 92, also_blender: bool = False) -> None:
    WEB_TEX.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(arr)
    path = WEB_TEX / name
    if name.lower().endswith(".jpg"):
        img.save(path, quality=quality, subsampling=0)
    else:
        img.save(path, optimize=True)
    if also_blender:
        BLENDER_TEX.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, BLENDER_TEX / name)
    print(f"  {name:<24}{path.stat().st_size / 1024:8.0f} KB")


def make_floor(size: int = 1024, tiles: int = 4, grout: int = 6, seed: int = 11) -> None:
    rng = np.random.default_rng(seed)
    tile = size // tiles
    yy, xx = np.mgrid[0:size, 0:size]
    ty, tx = yy // tile, xx // tile
    ly, lx = yy % tile, xx % tile
    edge = np.minimum.reduce([lx, tile - 1 - lx, ly, tile - 1 - ly]).astype(float)
    groove = np.clip(1.0 - edge / grout, 0.0, 1.0) ** 0.8  # 1 di tengah nat, 0 di dalam ubin
    chamfer = np.exp(-((edge - grout - 2.5) ** 2) / 8.0)  # pita terang tipis di tepi ubin

    tile_off = rng.normal(0, 4.0, (tiles, tiles))
    tile_tint = rng.normal(0, 2.0, (tiles, tiles, 3))
    mottling = fbm(size, size, rng, base=70, octaves=4) * 16
    speck = fbm(size, size, rng, base=1.8, octaves=3) * 26
    base = np.array([206.0, 203.0, 194.0])
    albedo = base[None, None, :] + (tile_off[ty, tx] + mottling + speck)[..., None] + tile_tint[ty, tx]
    albedo += (chamfer * 9.0)[..., None]
    grout_col = np.array([152.0, 149.0, 140.0]) + fbm(size, size, rng, base=1.5, octaves=2)[..., None] * 30
    albedo = albedo * (1 - groove[..., None]) + grout_col * groove[..., None]
    save(albedo.clip(0, 255).astype(np.uint8), "floor_albedo.jpg")

    rough = 0.34 + 0.05 * fbm(size, size, rng, base=40, octaves=3) * 2 + 0.06 * fbm(size, size, rng, base=2, octaves=2)
    rough = rough * (1 - groove) + 0.88 * groove
    r8 = (rough.clip(0, 1) * 255).astype(np.uint8)
    save(np.stack([r8, r8, r8], axis=-1), "floor_roughness.jpg", quality=90)

    height = 1.0 - 0.85 * groove + 0.02 * fbm(size, size, rng, base=1.5, octaves=3)
    height = height + 0.0 * chamfer
    save(normal_from_height(height, strength=14.0), "floor_normal.png")


def make_wood(size: int = 1024, seed: int = 7) -> None:
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, size)[:, None]
    x = np.linspace(0, 1, size)[None, :]
    warp = fbm(size, size, rng, base=90, octaves=3)
    rings = np.sin(2 * np.pi * (y * 12 + warp * 3.4 + 0.18 * np.sin(2 * np.pi * x * 0.8)))
    streak = fbm(size, size, rng, base=1.3, octaves=3, aniso=(36, 1))
    pores = (fbm(size, size, rng, base=1.0, octaves=2, aniso=(10, 1)) > 0.12).astype(float) * 0.0
    t = 0.52 + 0.20 * rings + 1.15 * streak - pores
    t = t.clip(0, 1)[..., None]
    dark = np.array([171.0, 124.0, 78.0])
    light = np.array([226.0, 189.0, 136.0])
    wood = dark * (1 - t) + light * t
    save(wood.clip(0, 255).astype(np.uint8), "wood_oak.jpg", quality=93, also_blender=True)


def make_plaster(size: int = 512, seed: int = 5) -> None:
    rng = np.random.default_rng(seed)
    height = fbm(size, size, rng, base=3.2, octaves=3) + 0.35 * fbm(size, size, rng, base=14, octaves=2)
    save(normal_from_height(height, strength=2.2), "plaster_normal.png")


def main() -> None:
    print("Membuat tekstur prosedural ...")
    make_floor()
    make_wood()
    make_plaster()


if __name__ == "__main__":
    main()
