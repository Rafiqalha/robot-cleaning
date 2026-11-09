"""Sampah / kotoran yang dibersihkan robot: bola kertas, bungkus, pensil, penghapus, kotak jus,
remah, tumpahan, dan gumpalan debu. Semua berada di dekat lantai (z >= 0)."""
from __future__ import annotations

import math
import random
from math import cos, pi, sin

from lib import Asset, material


def wrapper_mesh(L=0.14, W=0.09, nu=9, nv=6, seed=3):
    rng = random.Random(seed)
    verts, faces = [], []
    ph = rng.uniform(0, 6)
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = i / nu, j / nv
            x, y = (u - 0.5) * L, (v - 0.5) * W
            z = 0.010 + 0.011 * math.sin(7 * u + ph) * math.cos(4 * v + ph * 0.5) + rng.uniform(-0.003, 0.003) + 0.006 * (1 - abs(2 * u - 1))
            verts.append((x, y, z))
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.append((a, a + nv + 1, a + nv + 2, a + 1))
    return verts, faces


def spill_mesh(seed=2, n=30, r0=0.10):
    rng = random.Random(seed)
    phases = [rng.uniform(0, 6.28) for _ in range(3)]
    verts = [(0, 0, 0.0055)]
    for k in range(n):
        th = 2 * pi * k / n
        r = r0 * (1 + 0.30 * sin(2 * th + phases[0]) + 0.18 * sin(3 * th + phases[1]) + 0.10 * sin(5 * th + phases[2]))
        verts.append((r * cos(th), r * sin(th), 0.003))
    faces = [(0, 1 + (k + 1) % n, 1 + k) for k in range(n)]
    return verts, faces


def build_litter():
    out = []
    paper = [material("Paper_White", "#F2F0E8", roughness=0.9), material("Paper_Blue", "#CFE0EE", roughness=0.9), material("Paper_Yellow", "#F2E6B1", roughness=0.9)]
    for i, (m, seed) in enumerate(zip(paper, (1, 2, 3))):
        A = Asset(f"litter_paper_{'abc'[i]}", loc=(i * 0.4, 0, 0))
        A.ico(m, 0.060, loc=(0, 0, 0.052), scale=(1, 1, 0.9), subdiv=2, jitter=0.22, seed=seed, flat=True, name="Ball")
        A.ico(m, 0.036, loc=(0.075, 0.03, 0.028), scale=(1, 1, 0.8), subdiv=1, jitter=0.25, seed=seed + 10, flat=True, name="Ball2")
        A.finalize()
        out.append(A)

    A = Asset("litter_wrapper", loc=(1.3, 0, 0))
    wm = material("Wrapper_Red", "#C8352B", metallic=0.45, roughness=0.25)
    v, f = wrapper_mesh()
    A.mesh(wm, v, f, rot=(0, 0, 0.5), flat=False, smooth=45, name="Foil")
    A.finalize()
    out.append(A)

    A = Asset("litter_pencil", loc=(1.7, 0, 0))
    yel, wood, gra, fer, ers = (material("Pencil_Yellow", "#F2C230", roughness=0.45), material("Pencil_Wood", "#E3B98A", roughness=0.7),
                                material("Pencil_Lead", "#222222", roughness=0.5), material("Pencil_Ferrule", "#C9CBCD", metallic=1.0, roughness=0.3),
                                material("Pencil_Eraser", "#E38BA0", roughness=0.8))
    r = 0.0046
    A.cyl(yel, r, 0.15, loc=(0, 0, r), rot=(0, pi / 2, 0), seg=6, name="Body")
    A.cyl(wood, r, 0.022, r2=0.0009, loc=(0.086, 0, r), rot=(0, -pi / 2, 0), seg=6, name="Tip")
    A.cyl(gra, 0.0012, 0.006, loc=(0.1145, 0, r), rot=(0, pi / 2, 0), seg=6, name="Lead")
    A.cyl(fer, r * 1.02, 0.012, loc=(-0.081, 0, r), rot=(0, pi / 2, 0), seg=10, name="Ferrule")
    A.cyl(ers, r * 0.95, 0.011, loc=(-0.0925, 0, r), rot=(0, pi / 2, 0), seg=10, name="Eraser")
    A.finalize()
    out.append(A)

    A = Asset("litter_eraser", loc=(2.1, 0, 0))
    A.box(material("Eraser_White", "#F4F2EC", roughness=0.8), (0.046, 0.022, 0.013), loc=(0, 0, 0.0065), bevel=0.002, name="Block")
    A.box(material("Eraser_Sleeve", "#4F7FB5", roughness=0.7), (0.024, 0.0235, 0.0138), loc=(0.004, 0, 0.0066), bevel=0.001, name="Sleeve")
    A.finalize()
    out.append(A)

    A = Asset("litter_juice", loc=(2.5, 0, 0))
    jm, jw, straw = material("Juice_Orange", "#E8742B", roughness=0.4), material("Juice_White", "#F4F2EC", roughness=0.4), material("Straw_Red", "#C23B2E", roughness=0.4)
    A.box(jm, (0.062, 0.040, 0.030), loc=(0, 0, 0.020), rot=(0, 0, 0.35), bevel=0.003, name="Box")
    A.box(jw, (0.064, 0.0415, 0.010), loc=(0, 0, 0.020), rot=(0, 0, 0.35), bevel=0.002, name="Band")
    A.cyl(straw, 0.0026, 0.10, loc=(0.075, 0.03, 0.006), rot=(0, pi / 2, 0.8), seg=8, name="Straw")
    A.finalize()
    out.append(A)

    A = Asset("litter_crumbs", loc=(2.9, 0, 0))
    cm = material("Crumb", "#C89A5B", roughness=0.9)
    rng = random.Random(9)
    for _ in range(16):
        a, d = rng.uniform(0, 2 * pi), rng.uniform(0, 0.08)
        s = rng.uniform(0.004, 0.009)
        A.ico(cm, s, loc=(d * cos(a), d * sin(a), s * 0.7), subdiv=1, jitter=0.3, seed=rng.randint(0, 99), flat=True, name="Crumb")
    A.finalize()
    out.append(A)

    A = Asset("litter_spill", loc=(3.3, 0, 0))
    lm = material("Liquid_Orange", "#E07A1F", roughness=0.04, coat=1.0, coat_rough=0.02, alpha=0.72)
    v, f = spill_mesh()
    A.mesh(lm, v, f, smooth=80, name="Puddle")
    A.finalize()
    out.append(A)

    A = Asset("litter_dust", loc=(3.7, 0, 0))
    dm = material("Dust", "#8E8A82", roughness=1.0)
    A.ico(dm, 0.07, loc=(0, 0, 0.018), scale=(1.1, 1, 0.35), subdiv=2, jitter=0.2, seed=7, flat=False, name="Pile")
    for k, (dx, dy) in enumerate(((0.07, 0.03), (-0.05, 0.06), (0.02, -0.07))):
        A.ico(dm, 0.03, loc=(dx, dy, 0.008), scale=(1, 1, 0.4), subdiv=1, jitter=0.25, seed=20 + k, name="Tuft")
    A.finalize()
    out.append(A)
    return out
