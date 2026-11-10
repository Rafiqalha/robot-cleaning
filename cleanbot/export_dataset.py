"""Ekspor dataset proyek ke folder dataset/ (JSON dan CSV terbuka; CSV dapat dibuka langsung di Excel).

CleanBot memakai metode pencarian (A*), bukan pembelajaran mesin, sehingga "dataset"-nya adalah:
  masukan : instans masalah = denah kelas + titik awal + titik kotoran (4 denah rancangan sendiri + 40 denah acak)
  keluaran: hasil benchmark 7 konfigurasi algoritma pada instans-instans tersebut

    python -m cleanbot.benchmark          # (sekali) menghasilkan results/*.csv
    python -m cleanbot.export_dataset     # menulis folder dataset/ lalu memverifikasinya terhadap kode pencarian

Skrip ini deterministik: dijalankan ulang menghasilkan berkas yang identik.
"""
from __future__ import annotations

import csv
import json
import shutil
import statistics
import sys
from pathlib import Path

from .api import build_problem
from .benchmark import CONFIGS
from .scenarios import Scenario, catalog, random_scenario
from .search import solve

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"
OUT = ROOT / "dataset"

# Parameter denah acak: harus sama dengan benchmark.benchmark_scalability()
RANDOM_W, RANDOM_H = 10, 7
RANDOM_KS = range(2, 10)
RANDOM_SEEDS = range(5)


# --------------------------------------------------------------------------- penulis berkas
def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def write_json_lines(path: Path, items: list[dict]) -> None:
    """JSON array dengan satu instans per baris (mudah dibaca dan dibandingkan)."""
    body = ",\n".join(json.dumps(it, ensure_ascii=False) for it in items)
    path.write_text("[\n" + body + "\n]\n", encoding="utf-8")


# --------------------------------------------------------------------------- isi dataset
def grid_rows(sc: Scenario) -> list[dict]:
    """Satu baris per sel grid: tipe sel (kosong / rintangan / awal / target), jenis perabot, nomor target."""
    furniture = {c: f.kind for f in sc.furniture for c in f.cells()}
    target_id = {t: i + 1 for i, t in enumerate(sc.targets)}
    rows = []
    for y in range(sc.height):
        for x in range(sc.width):
            c = (x, y)
            if c in furniture:
                tipe = "rintangan"
            elif c == sc.start:
                tipe = "awal"
            elif c in target_id:
                tipe = "target"
            else:
                tipe = "kosong"
            rows.append({"skenario": sc.id, "x": x, "y": y, "tipe": tipe, "perabot": furniture.get(c, ""), "target_id": target_id.get(c, "")})
    return rows


def random_instances() -> list[dict]:
    """Denah acak uji skalabilitas, dengan aturan yang sama seperti benchmark (lewati bila sel terjangkau kurang dari k)."""
    items = []
    for k in RANDOM_KS:
        for seed in RANDOM_SEEDS:
            sc = random_scenario(RANDOM_W, RANDOM_H, k, seed)
            if len(sc.targets) < k:
                continue
            d = sc.to_dict()
            d.update({"k": k, "seed": seed})
            items.append(d)
    return items


# --------------------------------------------------------------------------- verifikasi
def astar_cost(spec: dict) -> int:
    problem, _ = build_problem(spec)
    return solve(problem, "astar", "mst", log_limit=0).cost


def verify(manual: list[dict], random_items: list[dict], res_scn: list[dict], res_scal: list[dict]) -> list[str]:
    """Cocokkan biaya optimal A*(MST) setiap instans dengan hasil benchmark; kembalikan daftar masalah (kosong = lolos)."""
    problems = []
    opt_scn = {r["scenario"]: int(r["cost"]) for r in res_scn if r["config"] == "astar_mst"}
    for d in manual:
        if astar_cost(d) != opt_scn.get(d["id"]):
            problems.append(f"{d['id']}: biaya A* tidak sama dengan benchmark_skenario.csv")
    opt_scal = {(int(r["k"]), int(r["seed"])): int(r["opt"]) for r in res_scal if r["config"] == "astar_mst"}
    if set(opt_scal) != {(d["k"], d["seed"]) for d in random_items}:
        problems.append("himpunan (k, seed) denah acak berbeda dari benchmark_skalabilitas.csv")
    else:
        for d in random_items:
            if astar_cost(d) != opt_scal[(d["k"], d["seed"])]:
                problems.append(f"{d['id']}: biaya A* tidak sama dengan kolom opt")
    return problems


# --------------------------------------------------------------------------- README (kamus data)
README = """# Dataset CleanBot 3D

## Apa yang dimaksud "dataset" di proyek ini

CleanBot menyelesaikan masalah dengan **metode pencarian (search)**, yaitu A\\* sebagai agen pemecah masalah, bukan dengan
pembelajaran mesin. Karena itu tidak ada data latih. Dataset proyek ini terdiri dari dua bagian:

* **Masukan = instans masalah**: denah ruang kelas (ukuran grid, perabot sebagai rintangan, titik awal robot, titik kotoran).
  Ada @N_MANUAL@ denah rancangan sendiri (S1-S3 dari proposal UTS, S4 tambahan) dan @N_RANDOM@ denah acak dari generator
  ber-seed, sehingga dapat dibuat ulang persis.
* **Keluaran = hasil benchmark**: biaya rencana, jumlah state yang diperiksa, dan waktu komputasi dari 7 konfigurasi
  algoritma pada setiap instans.

Semua data dibuat sendiri oleh kelompok (tidak diunduh) dan tidak memuat data pribadi. Folder ini adalah ekspor dari kode:
denah berasal dari `cleanbot/scenarios.py`, hasil dari `cleanbot/benchmark.py`. Format `skenario_*.json` sama dengan masukan
`build_problem()` di `cleanbot/api.py`, sehingga dapat langsung diberikan ke algoritma (lihat "Contoh pemakaian" di bawah).

## Isi folder

| Berkas | Peran | Isi | Jumlah |
|---|---|---|---|
| `skenario_kelas.json` | masukan | denah S1-S4 lengkap: ukuran, titik awal, perabot, sel rintangan, target | @N_MANUAL@ instans |
| `peta_grid_S1-S4.csv` | masukan | denah yang sama dalam bentuk tabel, satu baris per sel grid | @N_GRID@ baris |
| `skenario_acak.json` | masukan | denah acak uji skalabilitas: grid 10 x 7, k = 2..9 target, seed 0..4 | @N_RANDOM@ instans |
| `hasil_benchmark_skenario.csv` | keluaran | 7 konfigurasi algoritma x S1-S4 | @N_RES_SCN@ baris |
| `hasil_benchmark_skalabilitas.csv` | keluaran | 7 konfigurasi algoritma x @N_RANDOM@ denah acak | @N_RES_SCAL@ baris |

Rencana rute lengkap tiap kombinasi (urutan sel, aksi, urutan target, data heat-map) ada di `../web/data/plans/` (@N_PLANS@ berkas JSON).

## Kamus data

Konvensi denah: `x` = kolom (0 di kiri/barat), `y` = baris (0 di atas, dekat papan tulis), 1 sel = 1 m x 1 m, robot bergerak
4 arah. Biaya rencana = 1 per aksi (gerak maupun bersihkan).

### `peta_grid_S1-S4.csv`

| Kolom | Arti |
|---|---|
| `skenario` | S1, S2, S3, atau S4 |
| `x`, `y` | koordinat sel |
| `tipe` | `kosong`, `rintangan`, `awal` (posisi dok/awal robot), atau `target` (titik kotoran) |
| `perabot` | jenis perabot bila `tipe` = rintangan: `desk`, `cabinet`, `shelf`, `teacher`, `bin` |
| `target_id` | nomor target (1..k) bila `tipe` = target |

### `skenario_kelas.json` dan `skenario_acak.json`

Larik objek, satu instans per baris. Kolom: `id`, `name`, `description`, `note`, `width`, `height`, `start` ([x, y]),
`furniture` (daftar {`kind`, `x`, `y`, `w`, `h`}), `obstacles` (daftar [x, y]), `targets` (daftar {`id`, `x`, `y`}).
`skenario_acak.json` menambah `k` (jumlah target) dan `seed` (benih generator `random_scenario`).

### `hasil_benchmark_skenario.csv`

| Kolom | Arti |
|---|---|
| `scenario`, `scenario_name` | instans (S1-S4) dan namanya |
| `config`, `label` | konfigurasi algoritma (tabel di bawah) |
| `success` | rencana ditemukan (True/False) |
| `cost` | total biaya rencana |
| `moves`, `cleans` | jumlah gerakan dan jumlah aksi bersihkan |
| `expanded` | jumlah state yang diperiksa (diperluas) |
| `generated` | jumlah state yang dibangkitkan |
| `max_frontier` | ukuran antrean terbesar selama pencarian |
| `time_ms` | waktu komputasi, median dari 5 kali jalan (milidetik) |
| `state_space` | batas atas ruang state = sel bebas x 2^k |
| `visit_order` | urutan target yang dibersihkan |
| `gap_pct` | selisih biaya terhadap biaya optimal (A\\* MST), dalam persen |

### `hasil_benchmark_skalabilitas.csv`

| Kolom | Arti |
|---|---|
| `k`, `seed` | jumlah target dan benih denah acak (kunci ke `skenario_acak.json`) |
| `config`, `label` | konfigurasi algoritma |
| `cost`, `expanded` | biaya rencana dan jumlah state yang diperiksa |
| `time_ms` | waktu komputasi, satu kali jalan (milidetik) |
| `state_space` | batas atas ruang state |
| `success` | rencana ditemukan |
| `opt` | biaya optimal denah itu (hasil A\\* MST) |

### Konfigurasi algoritma (`config` / `label`)

| `config` | `label` | Menjamin optimal? |
|---|---|---|
| `bfs`, `ucs` | BFS, UCS | ya |
| `astar_manhattan`, `astar_max`, `astar_mst` | A\\* dengan tiga heuristik (admissible dan consistent) | ya |
| `greedy_mst`, `nn` | Greedy, Nearest-Neighbor | tidak |

## Cuplikan temuan dari dataset

* S4 (10 x 7, 6 target): BFS memeriksa @S4_BFS@ state, A\\* (MST) hanya @S4_ASTAR@ state (@S4_X@x lebih sedikit) dengan biaya sama (@S4_COST@).
* Denah acak dengan 9 target: rata-rata BFS @K9_BFS@ state, A\\* (MST) @K9_ASTAR@ state (@K9_X@x).
* Greedy dan Nearest-Neighbor pada S4 menghasilkan biaya @S4_GREEDY@, yaitu @S4_GAP@% lebih mahal dari optimal.

## Membuat ulang

```bash
python -m cleanbot.benchmark          # menghasilkan results/*.csv dan *.json
python -m cleanbot.export_dataset     # menulis ulang folder ini dan memverifikasinya terhadap kode pencarian
```

## Contoh pemakaian

```python
import json
from cleanbot.api import build_problem
from cleanbot.search import solve

s4 = {s["id"]: s for s in json.load(open("dataset/skenario_kelas.json", encoding="utf-8"))}["S4"]
problem, _ = build_problem(s4)
hasil = solve(problem, "astar", "mst", log_limit=0)
print(hasil.cost, hasil.expanded)      # @S4_COST@ @S4_ASTAR@
```
"""


def build_readme(manual, random_items, grid, res_scn, res_scal) -> str:
    by = {(r["scenario"], r["config"]): r for r in res_scn}
    s4_bfs, s4_ast, s4_gr = by[("S4", "bfs")], by[("S4", "astar_mst")], by[("S4", "greedy_mst")]

    def mean_exp(cfg: str, k: int) -> float:
        return statistics.mean(int(r["expanded"]) for r in res_scal if r["config"] == cfg and int(r["k"]) == k)

    k9_b, k9_a = mean_exp("bfs", 9), mean_exp("astar_mst", 9)
    fmt = lambda v: f"{v:,.0f}".replace(",", ".")  # noqa: E731  (pemisah ribuan gaya Indonesia)
    x_fmt = lambda v: f"{v:.1f}".replace(".", ",")  # noqa: E731
    tokens = {
        "N_MANUAL": len(manual),
        "N_RANDOM": len(random_items),
        "N_GRID": len(grid),
        "N_RES_SCN": len(res_scn),
        "N_RES_SCAL": len(res_scal),
        "N_PLANS": len(list((ROOT / "web" / "data" / "plans").glob("*.json"))),
        "S4_BFS": fmt(int(s4_bfs["expanded"])),
        "S4_ASTAR": fmt(int(s4_ast["expanded"])),
        "S4_X": x_fmt(int(s4_bfs["expanded"]) / int(s4_ast["expanded"])),
        "S4_COST": s4_ast["cost"],
        "S4_GREEDY": s4_gr["cost"],
        "S4_GAP": x_fmt(float(s4_gr["gap_pct"])),
        "K9_BFS": fmt(k9_b),
        "K9_ASTAR": fmt(k9_a),
        "K9_X": x_fmt(k9_b / k9_a),
    }
    text = README
    for key, val in tokens.items():
        text = text.replace(f"@{key}@", str(val))
    return text


def main() -> None:
    src_scn, src_scal = RESULTS / "benchmark_skenario.csv", RESULTS / "benchmark_skalabilitas.csv"
    if not (src_scn.exists() and src_scal.exists()):
        sys.exit("results/*.csv belum ada. Jalankan dulu: python -m cleanbot.benchmark")
    OUT.mkdir(exist_ok=True)

    manual = [sc.to_dict() for sc in catalog().values()]
    write_json_lines(OUT / "skenario_kelas.json", manual)
    grid = [row for sc in catalog().values() for row in grid_rows(sc)]
    write_csv(OUT / "peta_grid_S1-S4.csv", grid)
    random_items = random_instances()
    write_json_lines(OUT / "skenario_acak.json", random_items)
    shutil.copyfile(src_scn, OUT / "hasil_benchmark_skenario.csv")
    shutil.copyfile(src_scal, OUT / "hasil_benchmark_skalabilitas.csv")

    res_scn, res_scal = read_csv(src_scn), read_csv(src_scal)
    (OUT / "README.md").write_text(build_readme(manual, random_items, grid, res_scn, res_scal), encoding="utf-8")

    labels = ", ".join(label for _, _, _, label in CONFIGS)
    print(f"dataset/ ditulis: {len(manual)} denah manual, {len(grid)} sel grid, {len(random_items)} denah acak, "
          f"{len(res_scn)} + {len(res_scal)} baris hasil ({len(CONFIGS)} konfigurasi: {labels})")
    problems = verify(manual, random_items, res_scn, res_scal)
    if problems:
        print("VERIFIKASI GAGAL:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(f"verifikasi lolos: biaya optimal A* (MST) cocok untuk {len(manual)} + {len(random_items)} instans")


if __name__ == "__main__":
    main()
