"""Server lokal CleanBot 3D (FastAPI): melayani aplikasi web 3D + API inti AI Python.

Jalankan::

    python server.py              # lalu buka http://localhost:8765
    python server.py --open       # sekaligus membuka browser

Endpoint
--------
GET  /api/meta        daftar skenario, algoritma, heuristik
POST /api/plan        rencana dari spesifikasi denah (JSON) -> aksi + metrik + data pencarian
GET  /api/benchmark   perbandingan algoritma pada skenario S1-S4 (+ ringkasan skalabilitas)
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from cleanbot.api import meta_payload, plan_payload

# Windows kadang memetakan .js ke text/plain -> modul ES gagal dimuat. Paksa tipe yang benar.
for ext, mime in ((".js", "application/javascript"), (".mjs", "application/javascript"), (".glb", "model/gltf-binary"), (".json", "application/json"), (".wasm", "application/wasm")):
    mimetypes.add_type(mime, ext)

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DEV = os.environ.get("CLEANBOT_DEV") == "1"

app = FastAPI(title="CleanBot 3D", version="1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def revalidate(request: Request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache"  # selalu validasi (ETag) -> perubahan kode langsung terlihat
    return resp


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "dev": DEV}


@app.get("/api/meta")
def meta() -> dict:
    return meta_payload()


@app.post("/api/plan")
async def plan(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Body harus JSON.")
    algorithm = str(body.get("algorithm", "astar"))
    heuristic = str(body.get("heuristic", "mst"))
    try:
        t0 = time.perf_counter()
        payload = await run_in_threadpool(plan_payload, body, algorithm, heuristic)
        payload["server_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        return payload
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(400, f"Spesifikasi tidak valid: {exc}")


_bench_cache: dict = {}


@app.get("/api/benchmark")
async def benchmark(repeats: int = 3):
    key = max(1, min(repeats, 9))
    if key not in _bench_cache:
        from cleanbot.benchmark import benchmark_scenarios

        rows = await run_in_threadpool(benchmark_scenarios, ("S1", "S2", "S3", "S4"), key)
        scal = []
        sj = ROOT / "results" / "benchmark_skalabilitas.json"
        if sj.exists():
            from collections import defaultdict
            from statistics import mean

            agg: dict = defaultdict(lambda: defaultdict(list))
            for r in json.loads(sj.read_text(encoding="utf-8")):
                agg[r["config"]][r["k"]].append(r)
            for cfg, by_k in agg.items():
                for k, rs in sorted(by_k.items()):
                    scal.append({"config": cfg, "label": rs[0]["label"], "k": k, "expanded": mean(x["expanded"] for x in rs), "time_ms": mean(x["time_ms"] for x in rs)})
        _bench_cache[key] = {"scenarios": rows, "scalability": scal}
    return _bench_cache[key]


async def run_in_threadpool(fn, *args):
    from starlette.concurrency import run_in_threadpool as _rt

    return await _rt(fn, *args)


@app.post("/api/screenshot")
async def screenshot(request: Request):
    """(Hanya mode pengembangan: --dev) simpan tangkapan layar PNG dari canvas ke docs/screenshots."""
    if not (DEV or getattr(app.state, "dev", False)):
        raise HTTPException(403, "Aktifkan dengan: python server.py --dev")
    body = await request.json()
    name = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(body.get("name", "shot")))[:60]
    data = str(body.get("dataUrl", ""))
    if not data.startswith("data:image/png;base64,"):
        raise HTTPException(400, "dataUrl tidak valid")
    out = ROOT / "docs" / "screenshots"
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{name}.png"
    path.write_bytes(base64.b64decode(data.split(",", 1)[1]))
    return {"saved": str(path), "bytes": path.stat().st_size}


app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")


def main() -> None:
    ap = argparse.ArgumentParser(description="Server CleanBot 3D")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true", help="buka browser otomatis")
    ap.add_argument("--dev", action="store_true", help="aktifkan endpoint pengembangan (simpan screenshot)")
    args = ap.parse_args()
    app.state.dev = args.dev
    url = f"http://{'localhost' if args.host == '127.0.0.1' else args.host}:{args.port}"
    print(f"\n  CleanBot 3D berjalan di {url}   (Ctrl+C untuk berhenti)\n")
    if args.open:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
