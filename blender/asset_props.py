"""Perabot & properti ruang kelas (meja, kursi, lemari, rak buku, papan tulis, pintu, jendela, dll).

Konvensi: bagian "depan" setiap properti menghadap -Y (Blender). Setelah ekspor Y-up ini
menjadi +Z (selatan) di dunia three.js; three.js memutar properti sesuai dinding yang dihadapi.
Satu sel grid = 1 m.
"""
from __future__ import annotations

import math
import random
from math import cos, pi, radians, sin

import lib
from lib import Asset, material

# ------------------------------------------------------------------ material
def mats() -> dict:
    return dict(
        wood=material("Wood_Oak", "#FFFFFF", roughness=0.52, texture="wood_oak.jpg"),
        wood_edge=material("Wood_Edge", "#B88A57", roughness=0.6),
        steel=material("Steel_Dark", "#2B2C2E", metallic=0.8, roughness=0.45),
        chrome=material("Chrome", "#D0D2D4", metallic=1.0, roughness=0.22),
        blue=material("Paint_Blue", "#6A9BCC", metallic=0.12, roughness=0.42, coat=0.3, coat_rough=0.15),
        blue_dark=material("Paint_Blue_Dark", "#4D7BA8", metallic=0.12, roughness=0.5),
        chair=material("Chair_Plastic", "#6A9BCC", roughness=0.45),
        white=material("Paint_White", "#F1EFE8", roughness=0.5),
        board=material("Whiteboard", "#F8F8F6", roughness=0.16, coat=0.4, coat_rough=0.1),
        alu=material("Aluminium", "#BFC2C6", metallic=1.0, roughness=0.35),
        glass=material("Glass_Window", "#CFE6F5", roughness=0.04, alpha=0.12, ior=1.5),
        light=material("Light_Emissive", "#FFFFFF", emission="#FFF1D8", emission_strength=8.0),
        green_plastic=material("Plastic_Green", "#4F6B45", roughness=0.5),
        clay=material("Clay", "#B8603E", roughness=0.8),
        soil=material("Soil", "#2E241C", roughness=1.0),
        leaf_a=material("Leaf_A", "#4C7A38", roughness=0.55),
        leaf_b=material("Leaf_B", "#5F8F42", roughness=0.55),
        door=material("Door_Paint", "#8A5F3C", roughness=0.5, coat=0.15),
        frame=material("Frame_Paint", "#E8E4DA", roughness=0.55),
        screen=material("Screen_Blue", "#0A1830", emission="#2E6BFF", emission_strength=1.4),
        ceramic=material("Ceramic_White", "#F5F4EF", roughness=0.25, coat=0.5),
        graphite=material("Graphite", "#2A2A28", roughness=0.55),
        rubber=material("Rubber", "#161615", roughness=0.92),
        led_green=material("LED_Green", "#0A2A14", emission="#33FF77", emission_strength=4.0),
        face=material("Clock_Face", "#F7F6F1", roughness=0.4),
        black=material("Black_Plastic", "#101011", roughness=0.4),
        red=material("Clock_Red", "#C23B2E", roughness=0.4),
        paper_w=material("Paper_White", "#F2F0E8", roughness=0.9),
    )


BOOK_COLORS = ["#D97757", "#6A9BCC", "#788C5D", "#D4A27F", "#C46686", "#F1EFE8", "#3D3D3A", "#E8C25A"]


# ------------------------------------------------------------------ builders
def make_table(M, x0):
    A = Asset("prop_table", loc=(x0, 0, 0))
    top_z = 0.74
    A.box(M["wood"], (1.90, 0.68, 0.032), loc=(0, 0, top_z - 0.016), bevel=0.008, uv_scale=0.9, uv_off=(0.13, 0.4), name="Top")
    A.box(M["wood_edge"], (1.86, 0.64, 0.004), loc=(0, 0, top_z - 0.034), name="Underside")
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.box(M["steel"], (0.040, 0.040, 0.70), loc=(sx * 0.86, sy * 0.27, 0.35), bevel=0.004, name="Leg")
            A.cyl(M["rubber"], 0.022, 0.012, loc=(sx * 0.86, sy * 0.27, 0.006), seg=16, name="Foot")
    for sy in (-1, 1):
        A.box(M["steel"], (1.72, 0.024, 0.06), loc=(0, sy * 0.27, 0.68), name="Apron")
        A.box(M["steel"], (1.72, 0.020, 0.030), loc=(0, sy * 0.27, 0.22), name="RailLow")
    for sx in (-1, 1):
        A.box(M["steel"], (0.024, 0.54, 0.06), loc=(sx * 0.86, 0, 0.68), name="ApronSide")
        A.box(M["steel"], (0.020, 0.54, 0.030), loc=(sx * 0.86, 0, 0.22), name="RailSide")
    A.box(M["wood_edge"], (1.60, 0.30, 0.016), loc=(0, 0.10, 0.50), bevel=0.004, name="Rack")
    return A


def make_chair(M, x0):
    A = Asset("prop_chair", loc=(x0, 0, 0))
    A.box(M["chair"], (0.40, 0.40, 0.030), loc=(0, 0, 0.435), bevel=0.012, seg=3, name="Seat")
    A.box(M["chair"], (0.38, 0.022, 0.20), loc=(0, -0.19, 0.68), bevel=0.009, seg=3, name="Back")
    for sx in (-1, 1):
        A.cyl(M["chrome"], 0.011, 0.78, loc=(sx * 0.16, -0.19, 0.39), seg=14, name="RearLeg")
        A.cyl(M["chrome"], 0.011, 0.42, loc=(sx * 0.16, 0.17, 0.21), seg=14, name="FrontLeg")
        A.cyl(M["chrome"], 0.009, 0.36, loc=(sx * 0.16, -0.01, 0.20), rot=(pi / 2, 0, 0), seg=12, name="Brace")
        for sy in (-0.19, 0.17):
            A.cyl(M["rubber"], 0.014, 0.012, loc=(sx * 0.16, sy, 0.006), seg=12, name="Foot")
    A.box(M["chrome"], (0.34, 0.018, 0.018), loc=(0, -0.19, 0.30), bevel=0.004, name="BackBar")
    return A


def make_cabinet(M, x0):
    A = Asset("prop_cabinet", loc=(x0, 0, 0))
    W, D, H = 0.98, 0.48, 1.86
    A.box(M["blue"], (W, D - 0.02, H - 0.08), loc=(0, 0.01, 0.08 + (H - 0.08) / 2), bevel=0.006, name="Carcass")
    A.box(M["steel"], (W - 0.04, D - 0.06, 0.08), loc=(0, 0.0, 0.04), name="Plinth")
    dw = (W - 0.02 - 0.006) / 2
    for sx in (-1, 1):
        A.box(M["blue"], (dw, 0.018, H - 0.22), loc=(sx * (dw / 2 + 0.003), -0.239, 0.94), bevel=0.004, name="Door")
        A.box(M["chrome"], (0.012, 0.022, 0.20), loc=(sx * 0.035, -0.262, 0.95), bevel=0.004, name="Handle")
        for i in range(6):
            A.box(M["blue_dark"], (dw - 0.14, 0.004, 0.010), loc=(sx * (dw / 2 + 0.003), -0.2495, 1.58 + i * 0.022), name="Louver")
    A.box(M["blue_dark"], (W, D, 0.012), loc=(0, 0, H + 0.0), bevel=0.003, name="TopCap")
    return A


def make_shelf(M, x0):
    A = Asset("prop_shelf", loc=(x0, 0, 0))
    W, D, H = 0.98, 0.30, 1.62
    for sx in (-1, 1):
        A.box(M["wood"], (0.022, D, H), loc=(sx * (W / 2 - 0.011), 0, H / 2), bevel=0.003, uv_scale=0.8, uv_off=(sx * 0.2, 0.1), name="Side")
    A.box(M["wood"], (W, D, 0.026), loc=(0, 0, H - 0.013), bevel=0.003, uv_scale=0.8, name="Top")
    A.box(M["wood_edge"], (W - 0.04, D - 0.02, 0.08), loc=(0, 0, 0.04), name="Plinth")
    A.box(M["wood_edge"], (W - 0.04, 0.008, H - 0.04), loc=(0, D / 2 - 0.006, H / 2), name="Back")
    levels = [0.08, 0.44, 0.80, 1.16]
    for z in levels[1:]:
        A.box(M["wood"], (W - 0.04, D - 0.01, 0.022), loc=(0, 0, z), bevel=0.002, uv_scale=0.8, uv_off=(0.3, z), name="Board")
    rng = random.Random(21)
    book_mats = [material(f"Book_{i}", c, roughness=0.7) for i, c in enumerate(BOOK_COLORS)]
    for z in levels:
        base = z + 0.011 if z > 0.1 else 0.082
        cur = -0.45 + rng.uniform(0, 0.03)
        while cur < 0.40:
            if rng.random() < 0.1:
                cur += rng.uniform(0.05, 0.12)
                continue
            t = rng.uniform(0.018, 0.042)
            h = rng.uniform(0.19, 0.30)
            d = rng.uniform(0.17, 0.22)
            tilt = radians(rng.uniform(-14, 14)) if rng.random() < 0.10 else 0.0
            m = rng.choice(book_mats)
            A.box(m, (t, d, h), loc=(cur + t / 2, 0.008 + rng.uniform(-0.008, 0.008), base + h / 2), rot=(0, tilt, 0), bevel=0.0015, seg=2, name="Book")
            cur += t + 0.002
    return A


def make_teacher(M, x0):
    A = Asset("prop_teacher", loc=(x0, 0, 0))
    A.box(M["wood"], (1.90, 0.80, 0.035), loc=(0, 0, 0.7225), bevel=0.008, uv_scale=0.8, uv_off=(0.5, 0.2), name="Top")
    A.box(M["wood_edge"], (0.46, 0.72, 0.68), loc=(-0.72, 0, 0.34), bevel=0.004, name="Pedestal")
    for i, z in enumerate((0.13, 0.36, 0.59)):
        A.box(M["wood"], (0.42, 0.018, 0.20), loc=(-0.72, -0.369, z), bevel=0.004, uv_scale=1.2, uv_off=(i * 0.3, 0), name="Drawer")
        A.box(M["chrome"], (0.12, 0.014, 0.014), loc=(-0.72, -0.388, z + 0.05), bevel=0.005, name="Pull")
    A.box(M["steel"], (0.04, 0.72, 0.70), loc=(0.88, 0, 0.35), bevel=0.003, name="PanelLeg")
    A.box(M["wood_edge"], (1.30, 0.02, 0.45), loc=(0.15, 0.34, 0.48), name="Modesty")
    # laptop (layar menghadap guru di sisi +Y)
    A.box(M["alu"], (0.34, 0.23, 0.014), loc=(0.40, 0.00, 0.7425 + 0.007), bevel=0.003, name="LaptopBase")
    A.box(M["alu"], (0.34, 0.008, 0.22), loc=(0.40, -0.115, 0.7425 + 0.014 + 0.105), rot=(radians(14), 0, 0), bevel=0.002, name="LaptopLid")
    A.box(M["screen"], (0.31, 0.002, 0.19), loc=(0.40, -0.1105, 0.7425 + 0.014 + 0.105), rot=(radians(14), 0, 0), name="LaptopScreen")
    # mug, buku, pensil
    A.cyl(M["ceramic"], 0.04, 0.09, loc=(-0.20, 0.18, 0.7425 + 0.045), seg=24, bevel=0.003, name="Mug")
    A.box(M["ceramic"], (0.012, 0.03, 0.05), loc=(-0.158, 0.18, 0.7425 + 0.047), bevel=0.004, name="MugHandle")
    for i, (c, rz) in enumerate((("#6A9BCC", 6), ("#D97757", -4), ("#F1EFE8", 10))):
        bm = material(f"Notebook_{i}", c, roughness=0.7)
        A.box(bm, (0.21, 0.30, 0.016), loc=(0.02 + i * 0.01, 0.10, 0.7425 + 0.008 + i * 0.016), rot=(0, 0, radians(rz)), bevel=0.002, name="Notebook")
    A.cyl(M["graphite"], 0.030, 0.10, loc=(0.78, 0.22, 0.7425 + 0.05), seg=16, bevel=0.002, name="PenCup")
    for k, (dx, dy) in enumerate(((0.01, 0.0), (-0.01, 0.01), (0.0, -0.012))):
        A.cyl(M["red"], 0.004, 0.14, loc=(0.78 + dx, 0.22 + dy, 0.7425 + 0.13), rot=(radians(8 * (k - 1)), radians(6 * (1 - k)), 0), seg=8, name="Pen")
    return A


def make_bin(M, x0):
    A = Asset("prop_bin", loc=(x0, 0, 0))
    prof = [(0.0, 0.0), (0.125, 0.0), (0.165, 0.45), (0.178, 0.50), (0.178, 0.512), (0.168, 0.512), (0.158, 0.50), (0.122, 0.03), (0.0, 0.03)]
    A.lathe(M["green_plastic"], prof, seg=36, name="Shell")
    A.ico(M["paper_w"], 0.06, loc=(0.02, 0.0, 0.50), scale=(1, 1, 0.9), subdiv=2, jitter=0.22, seed=4, flat=True, name="Ball")
    A.ico(M["paper_w"], 0.045, loc=(-0.07, 0.05, 0.48), subdiv=1, jitter=0.25, seed=8, flat=True, name="Ball")
    return A


def make_whiteboard(M, x0):
    A = Asset("prop_whiteboard", loc=(x0, 0, 0))
    A.box(M["wood_edge"], (3.0, 0.028, 1.2), loc=(0, 0.0, 0.6), name="Backing")
    A.quad(M["board"], [(-1.5, -0.0165, 0.0), (1.5, -0.0165, 0.0), (1.5, -0.0165, 1.2), (-1.5, -0.0165, 1.2)], [(0, 0), (1, 0), (1, 1), (0, 1)], name="Board")
    A.box(M["alu"], (3.08, 0.044, 0.04), loc=(0, -0.004, 1.22), bevel=0.006, name="FrameTop")
    A.box(M["alu"], (3.08, 0.044, 0.04), loc=(0, -0.004, -0.02), bevel=0.006, name="FrameBot")
    for sx in (-1, 1):
        A.box(M["alu"], (0.04, 0.044, 1.28), loc=(sx * 1.52, -0.004, 0.6), bevel=0.006, name="FrameSide")
    A.box(M["alu"], (2.6, 0.07, 0.025), loc=(0, -0.045, -0.045), bevel=0.005, name="Tray")
    for i, c in enumerate(("#141413", "#6A9BCC", "#C23B2E", "#788C5D")):
        mm = material(f"Marker_{i}", c, roughness=0.4)
        A.cyl(mm, 0.009, 0.12, loc=(-0.5 + i * 0.07, -0.050, -0.018), rot=(0, pi / 2, 0), seg=12, name="Marker")
    A.box(M["steel"], (0.11, 0.05, 0.04), loc=(0.55, -0.05, -0.012), bevel=0.006, name="Eraser")
    return A


def make_door(M, x0):
    A = Asset("prop_door", loc=(x0, 0, 0))
    for sx in (-1, 1):
        A.box(M["frame"], (0.06, 0.12, 2.1), loc=(sx * 0.49, 0, 1.05), bevel=0.004, name="Jamb")
    A.box(M["frame"], (1.04, 0.12, 0.06), loc=(0, 0, 2.08), bevel=0.004, name="Head")
    A.box(M["steel"], (0.92, 0.12, 0.012), loc=(0, 0, 0.006), name="Threshold")
    D = A.sub("DoorLeaf", loc=(-0.45, 0, 0))
    D.box(M["door"], (0.90, 0.040, 2.02), loc=(0.45, 0, 1.02), bevel=0.004, name="Leaf")
    D.box(M["glass"], (0.22, 0.006, 0.62), loc=(0.45, -0.022, 1.52), name="Vision")
    D.box(M["alu"], (0.26, 0.010, 0.66), loc=(0.45, -0.0205, 1.52), bevel=0.003, name="VisionFrame")
    D.cyl(M["chrome"], 0.012, 0.05, loc=(0.80, -0.045, 1.0), rot=(pi / 2, 0, 0), seg=14, name="HandleRose")
    D.box(M["chrome"], (0.11, 0.012, 0.012), loc=(0.75, -0.068, 1.0), bevel=0.004, name="Lever")
    D.box(M["alu"], (0.08, 0.004, 0.30), loc=(0.82, -0.022, 1.0), bevel=0.001, name="Plate")
    return A


def make_window(M, x0):
    A = Asset("prop_window", loc=(x0, 0, 0))
    W, H = 1.6, 1.3
    for sx in (-1, 1):
        A.box(M["frame"], (0.05, 0.09, H), loc=(sx * (W / 2 - 0.025), 0, H / 2), bevel=0.003, name="Side")
    A.box(M["frame"], (W, 0.09, 0.05), loc=(0, 0, H - 0.025), bevel=0.003, name="Top")
    A.box(M["frame"], (W, 0.09, 0.05), loc=(0, 0, 0.025), bevel=0.003, name="Bottom")
    A.box(M["frame"], (0.04, 0.08, H - 0.08), loc=(0, 0, H / 2), name="Mullion")
    A.box(M["frame"], (W - 0.08, 0.07, 0.04), loc=(0, 0, 0.88), name="Transom")
    A.box(M["glass"], (W - 0.1, 0.006, H - 0.1), loc=(0, 0, H / 2), name="Pane")
    A.box(M["frame"], (W + 0.2, 0.20, 0.035), loc=(0, -0.07, -0.0175), bevel=0.006, name="Sill")
    for sx in (-1, 1):
        A.box(M["chrome"], (0.012, 0.03, 0.09), loc=(sx * 0.05, -0.05, 0.62), bevel=0.003, name="Latch")
    return A


def make_clock(M, x0):
    A = Asset("prop_clock", loc=(x0, 0, 0))
    A.cyl(M["black"], 0.17, 0.035, loc=(0, 0, 0), rot=(pi / 2, 0, 0), bevel=0.006, seg=48, name="Frame")
    A.cyl(M["face"], 0.158, 0.004, loc=(0, -0.0165, 0), rot=(pi / 2, 0, 0), seg=48, name="Face")
    for k in range(12):
        th = 2 * pi * k / 12
        big = k % 3 == 0
        A.box(M["black"], (0.008 if big else 0.005, 0.002, 0.026 if big else 0.016), loc=(0.130 * sin(th), -0.0195, 0.130 * cos(th)), rot=(0, th, 0), name="Tick")
    for nm, w, ln, yo, mm in (("ClockHour", 0.012, 0.085, -0.0215, M["black"]), ("ClockMinute", 0.008, 0.125, -0.0235, M["black"]), ("ClockSecond", 0.003, 0.14, -0.0255, M["red"])):
        H = A.sub(nm, loc=(0, yo, 0))
        H.box(mm, (w, 0.002, ln), loc=(0, 0, ln / 2 - 0.012), name="Hand")
    A.cyl(M["black"], 0.010, 0.012, loc=(0, -0.0245, 0), rot=(pi / 2, 0, 0), seg=16, name="Hub")
    return A


def make_ac(M, x0):
    A = Asset("prop_ac", loc=(x0, 0, 0))
    A.box(M["white"], (0.95, 0.24, 0.30), loc=(0, 0, 0.15), bevel=0.05, seg=6, name="Body")
    A.box(M["graphite"], (0.84, 0.02, 0.022), loc=(0, -0.118, 0.045), bevel=0.004, name="Louver")
    A.box(M["frame"], (0.80, 0.006, 0.014), loc=(0, -0.121, 0.125), name="Seam")
    A.box(M["led_green"], (0.014, 0.004, 0.014), loc=(0.36, -0.122, 0.20), name="Led")
    A.box(M["graphite"], (0.12, 0.003, 0.02), loc=(-0.32, -0.121, 0.20), name="Label")
    return A


def make_light(M, x0):
    A = Asset("prop_light", loc=(x0, 0, 0))
    A.box(M["white"], (1.22, 0.32, 0.045), loc=(0, 0, -0.0225), bevel=0.006, name="Frame")
    A.box(M["light"], (1.16, 0.26, 0.004), loc=(0, 0, -0.047), name="Diffuser")
    return A


def make_dock(M, x0):
    A = Asset("prop_dock", loc=(x0, 0, 0))
    A.rprism(M["graphite"], 0.56, 0.46, 0.0, 0.014, r=0.08, seg=8, bevel_top=0.004, name="Base")
    A.rprism(M["white"], 0.14, 0.34, 0.0, 0.20, r=0.04, cx=-0.21, seg=6, bevel_top=0.02, name="Unit")
    A.box(M["led_green"], (0.004, 0.10, 0.012), loc=(-0.139, 0, 0.15), name="Led")
    A.text(M["graphite"], "DOCK", 0.022, loc=(-0.139, 0, 0.10), rot=(pi / 2, 0, pi / 2), name="Label")
    for sy in (-1, 1):
        A.box(M["chrome"], (0.03, 0.04, 0.004), loc=(-0.12, sy * 0.07, 0.016), name="Contact")
    return A


def leaf_mesh(length, width, droop, fold, nu=7, nv=5):
    verts, faces = [], []
    for i in range(nu + 1):
        u = i / nu
        w = width * (math.sin(math.pi * u ** 0.75) ** 0.85) * 0.5
        if u < 0.12:
            w *= 0.35 + 0.65 * u / 0.12
        for j in range(nv + 1):
            v = (j / nv) * 2 - 1
            verts.append((u * length, v * w, -droop * u * u + fold * (1 - abs(v)) * math.sin(math.pi * u) - 0.06 * abs(v) * w))
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.append((a, a + nv + 1, a + nv + 2, a + 1))
    return verts, faces


def make_plant(M, x0):
    A = Asset("prop_plant", loc=(x0, 0, 0))
    A.lathe(M["clay"], [(0, 0), (0.045, 0), (0.066, 0.115), (0.074, 0.126), (0.074, 0.136), (0.065, 0.136), (0.063, 0.122), (0, 0.122)], seg=28, name="Pot")
    A.cyl(M["soil"], 0.062, 0.006, loc=(0, 0, 0.122), seg=24, name="Soil")
    rng = random.Random(5)
    for k in range(11):
        az = 2 * pi * k / 11 + rng.uniform(-0.2, 0.2)
        pitch = radians(rng.uniform(32, 68))
        L = rng.uniform(0.15, 0.24)
        v, f = leaf_mesh(L, L * 0.52, droop=L * rng.uniform(0.10, 0.30), fold=0.012)
        A.mesh(M["leaf_a"] if k % 2 else M["leaf_b"], v, f, loc=(0, 0, 0.125), rot=(rng.uniform(-0.2, 0.2), -pitch, az), name="Leaf")
    return A


# ------------------------------------------------------------------ rakitan
BUILDERS = [
    ("table", make_table, 0.0),
    ("chair", make_chair, 2.3),
    ("teacher", make_teacher, 4.9),
    ("bin", make_bin, 7.2),
    ("plant", make_plant, 8.4),
    ("dock", make_dock, 9.6),
    ("cabinet", make_cabinet, 0.0),
    ("shelf", make_shelf, 1.5),
    ("ac", make_ac, 3.2),
    ("clock", make_clock, 4.6),
    ("light", make_light, 5.9),
    ("whiteboard", make_whiteboard, 8.4),
    ("door", make_door, 11.2),
    ("window", make_window, 13.4),
]
ROW2_Y = 6.0
GROUPS = {
    "meja_kursi": ["table", "chair"],
    "guru_tong_tanaman": ["teacher", "bin", "plant", "dock"],
    "lemari_rak": ["cabinet", "shelf"],
    "papan_pintu_jendela": ["whiteboard", "door", "window"],
    "ac_jam_lampu": ["ac", "clock", "light"],
}


def build_props():
    M = mats()
    out = []
    for name, fn, x0 in BUILDERS:
        try:
            a = fn(M, x0)
            if name in ("cabinet", "shelf", "ac", "clock", "light", "whiteboard", "door", "window"):
                a.root.location.y = ROW2_Y
            a.finalize()
            out.append(a)
        except Exception as exc:  # satu aset gagal tidak menghentikan yang lain
            import traceback

            traceback.print_exc()
            print(f"!!! properti {name} gagal: {exc}")
    return out


def render_props(assets, out_dir):
    import os

    lib.setup_stage(res=(1100, 700))
    pos = {a.name.replace("prop_", ""): a.root.location.copy() for a in assets}
    for gname, members in GROUPS.items():
        pts = [pos[m] for m in members if m in pos]
        if not pts:
            continue
        xs = [p.x for p in pts]
        cx = (min(xs) + max(xs)) / 2
        cy = pts[0].y
        span = max(xs) - min(xs)
        dist = max(3.2, span * 1.25 + 2.6)
        lib.render_view(os.path.join(out_dir, f"props_{gname}.png"), (cx, cy, 0.85 if gname != "ac_jam_lampu" else 0.4), dist, azim=-28, elev=14, lens=42)
