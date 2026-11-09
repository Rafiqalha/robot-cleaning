"""Model 3D robot pembersih "CleanBot" (identitas visual sama dengan ikon robot di PPT UTS).

Arah depan robot = +X (Blender). Bagian yang dianimasikan di three.js dipisah menjadi
node sendiri: Wheel_L/R, SideBrush_L/R, MainBrush, LidarTurret. Material penting yang
diubah lewat kode: Face_Display (layar wajah), LED_Cyan (seam), LED_Beacon (antena).
"""
from __future__ import annotations

import math
from math import cos, pi, sin

from lib import Asset, material


def build_robot() -> Asset:
    paint = material("Paint_Orange", "#D97757", roughness=0.33, coat=0.85, coat_rough=0.05)
    graphite = material("Graphite", "#2A2A28", roughness=0.55)
    graphite2 = material("Graphite_Metal", "#3A3B3D", metallic=0.85, roughness=0.38)
    roof_m = material("Roof_Black", "#101011", roughness=0.18, coat=1.0, coat_rough=0.03)
    rubber = material("Rubber", "#161615", roughness=0.92)
    face_m = material("Face_Display", "#050507", roughness=0.06, coat=1.0, coat_rough=0.02)
    bezel = material("Bezel", "#0B0B0C", roughness=0.15, coat=1.0)
    led = material("LED_Cyan", "#0A2A30", roughness=0.4, emission="#27D4FF", emission_strength=5.0)
    beacon = material("LED_Beacon", "#0A2A30", roughness=0.3, emission="#27D4FF", emission_strength=6.0)
    silver = material("Silver", "#C9CBCD", metallic=1.0, roughness=0.28)
    white = material("White_Plastic", "#F4F2EB", roughness=0.4, coat=0.3)
    bristle = material("Bristle", "#EDE3CC", roughness=0.95)
    bristle_o = material("Bristle_Orange", "#E8905F", roughness=0.9)
    laser = material("Laser_Window", "#2A0507", roughness=0.2, emission="#FF2A3A", emission_strength=2.5)

    R = Asset("Robot")

    # ---- sasis, rok karet, bodi ------------------------------------------------
    R.rprism(graphite, 0.46, 0.40, 0.055, 0.145, r=0.085, seg=8, bevel_top=0.012, bevel_bot=0.012, name="Chassis")
    R.rprism(rubber, 0.485, 0.425, 0.036, 0.062, r=0.095, seg=8, bevel_top=0.006, bevel_bot=0.006, name="Skirt")
    R.rprism(paint, 0.425, 0.362, 0.145, 0.285, r=0.075, cx=-0.004, seg=8, bevel_top=0.010, bevel_bot=0.010, name="Body")
    R.rprism(led, 0.431, 0.368, 0.285, 0.2925, r=0.078, cx=-0.004, seg=8, name="LedRing")
    R.rprism(roof_m, 0.421, 0.358, 0.2925, 0.322, r=0.073, cx=-0.004, seg=8, bevel_top=0.014, bevel_seg=4, name="Roof")

    # ---- wajah (layar) ---------------------------------------------------------
    fx = 0.2085
    R.box(bezel, (0.006, 0.190, 0.100), loc=(fx + 0.001, 0, 0.215), bevel=0.003, name="FaceBezel")
    R.plane(face_m, 0.168, 0.082, loc=(fx + 0.0045, 0, 0.215), name="Face")

    # ---- detail bodi -----------------------------------------------------------
    for side in (1, -1):
        for i in range(4):
            R.box(graphite, (0.060, 0.003, 0.006), loc=(-0.105, side * 0.1815, 0.172 + i * 0.016), name="Vent")
        R.box(white, (0.095, 0.002, 0.030), loc=(0.06, side * 0.1815, 0.215), bevel=0.004, name="Badge")
        R.text(graphite, "CLEANBOT", 0.0125, loc=(0.06, side * 0.1828, 0.215), rot=(pi / 2, 0, pi if side > 0 else 0), name="Logo")
    R.cyl(white, 0.014, 0.004, loc=(0.085, 0, 0.324), bevel=0.001, name="Button")

    # ---- lidar ----------------------------------------------------------------
    R.cyl(graphite, 0.052, 0.020, loc=(-0.075, 0, 0.332), bevel=0.003, name="LidarBase")
    L = R.sub("LidarTurret", loc=(-0.075, 0, 0.342))
    L.cyl(graphite2, 0.042, 0.030, loc=(0, 0, 0.015), bevel=0.004, name="Drum")
    L.cyl(laser, 0.0426, 0.006, loc=(0, 0, 0.016), name="Window")
    L.cyl(silver, 0.020, 0.006, loc=(0, 0, 0.033), bevel=0.002, name="Cap")
    L.box(graphite, (0.014, 0.020, 0.014), loc=(0.040, 0, 0.018), bevel=0.002, name="Emitter")

    # ---- antena + beacon ------------------------------------------------------
    R.cyl(graphite, 0.0035, 0.16, loc=(-0.175, 0.125, 0.402), seg=12, name="AntennaRod")
    R.sphere(beacon, 0.011, loc=(-0.175, 0.125, 0.490), seg=16, rings=10, name="AntennaTip")

    # ---- sikat roller depan -----------------------------------------------------
    B = R.sub("MainBrush", loc=(0.238, 0, 0.047))
    B.cyl(graphite, 0.012, 0.30, rot=(pi / 2, 0, 0), seg=16, name="Core")
    for k in range(12):
        th = 2 * pi * k / 12
        B.box(bristle_o, (0.020, 0.27, 0.004), loc=(0.020 * cos(th), 0, 0.020 * sin(th)), rot=(0, -th, 0), name="Fin")

    # ---- roda -----------------------------------------------------------------
    for side, nm in ((1, "Wheel_L"), (-1, "Wheel_R")):
        W = R.sub(nm, loc=(-0.04, 0.236 * side, 0.078))
        W.cyl(rubber, 0.078, 0.052, rot=(pi / 2, 0, 0), bevel=0.009, seg=40, name="Tire")
        for k in range(22):
            th = 2 * pi * k / 22
            W.box(rubber, (0.010, 0.054, 0.020), loc=(0.080 * cos(th), 0, 0.080 * sin(th)), rot=(0, -th, 0), name="Rib")
        W.cyl(silver, 0.048, 0.050, loc=(0, side * 0.003, 0), rot=(pi / 2, 0, 0), bevel=0.004, seg=32, name="Hub")
        W.cyl(paint, 0.031, 0.058, loc=(0, side * 0.006, 0), rot=(pi / 2, 0, 0), bevel=0.006, seg=28, name="Cap")
        for k in range(5):
            th = 2 * pi * k / 5
            W.cyl(silver, 0.0045, 0.064, loc=(0.039 * cos(th), side * 0.004, 0.039 * sin(th)), rot=(pi / 2, 0, 0), seg=10, name="Nut")

    # ---- sikat samping ----------------------------------------------------------
    for side, nm in ((1, "SideBrush_L"), (-1, "SideBrush_R")):
        S = R.sub(nm, loc=(0.205, 0.145 * side, 0.047))
        S.cyl(graphite, 0.016, 0.018, seg=18, name="Hub")
        for k in range(3):
            ph = 2 * pi * k / 3 + (0.0 if side > 0 else pi / 3)
            S.box(graphite, (0.080, 0.007, 0.005), loc=(0.040 * cos(ph), 0.040 * sin(ph), 0), rot=(0, 0, ph), name="Arm")
            S.cyl(bristle, 0.015, 0.022, r2=0.008, loc=(0.082 * cos(ph), 0.082 * sin(ph), 0.003), seg=12, name="Tuft")

    R.finalize()
    return R
