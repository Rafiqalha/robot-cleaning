"""Bangun semua aset 3D CleanBot di Blender (headless) lalu ekspor ke .glb.

Contoh::

    blender --background --factory-startup --python blender/build_assets.py -- --only robot
    blender --background --factory-startup --python blender/build_assets.py            (semua)

Opsi (setelah tanda "--"): --only robot|props|litter|all   --no-render
"""
from __future__ import annotations

import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import lib  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT_MODELS = os.path.join(ROOT, "web", "assets", "models")
OUT_PREVIEW = os.path.join(ROOT, "docs", "blender_previews")


def parse_args() -> dict:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"only": "all", "render": True}
    i = 0
    while i < len(argv):
        if argv[i] == "--only":
            opts["only"] = argv[i + 1]
            i += 1
        elif argv[i] == "--no-render":
            opts["render"] = False
        i += 1
    return opts


def run_robot(render: bool) -> None:
    lib.reset_scene()
    from asset_robot import build_robot

    robot = build_robot()
    lib.export_glb(os.path.join(OUT_MODELS, "robot.glb"), [robot])
    if render:
        lib.setup_stage(res=(1100, 760))
        c = (0.0, 0.0, 0.22)
        lib.render_view(os.path.join(OUT_PREVIEW, "robot_depan.png"), c, 1.55, azim=62, elev=20, lens=60)
        lib.render_view(os.path.join(OUT_PREVIEW, "robot_belakang.png"), c, 1.55, azim=-140, elev=24, lens=60)
        lib.render_view(os.path.join(OUT_PREVIEW, "robot_samping.png"), c, 1.7, azim=90, elev=6, lens=70)
        lib.render_view(os.path.join(OUT_PREVIEW, "robot_atas.png"), c, 1.5, azim=0, elev=88, lens=60)


def run_props(render: bool) -> None:
    lib.reset_scene()
    from asset_props import build_props

    assets = build_props()
    lib.export_glb(os.path.join(OUT_MODELS, "props.glb"), assets)
    if render:
        from asset_props import render_props

        render_props(assets, OUT_PREVIEW)


def run_litter(render: bool) -> None:
    lib.reset_scene()
    from asset_litter import build_litter

    assets = build_litter()
    lib.export_glb(os.path.join(OUT_MODELS, "litter.glb"), assets)
    if render:
        lib.setup_stage(res=(1100, 560))
        lib.render_view(os.path.join(OUT_PREVIEW, "litter.png"), (0.9, 0, 0.04), 1.9, azim=15, elev=38, lens=60)


def main() -> None:
    opts = parse_args()
    steps = {"robot": run_robot, "props": run_props, "litter": run_litter}
    todo = list(steps) if opts["only"] == "all" else [opts["only"]]
    for name in todo:
        t0 = time.time()
        print(f"\n=== {name} ===")
        try:
            steps[name](opts["render"])
            print(f"=== {name} selesai ({time.time() - t0:.1f}s)")
        except Exception:
            traceback.print_exc()
            print(f"!!! {name} GAGAL")
            if len(todo) == 1:
                sys.exit(1)


if __name__ == "__main__":
    main()
