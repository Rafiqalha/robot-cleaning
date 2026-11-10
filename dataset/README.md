# Dataset CleanBot 3D

## Apa yang dimaksud "dataset" di proyek ini

CleanBot menyelesaikan masalah dengan **metode pencarian (search)**, yaitu A\* sebagai agen pemecah masalah, bukan dengan
pembelajaran mesin. Karena itu tidak ada data latih. Dataset proyek ini terdiri dari dua bagian:

* **Masukan = instans masalah**: denah ruang kelas (ukuran grid, perabot sebagai rintangan, titik awal robot, titik kotoran).
  Ada 4 denah rancangan sendiri (S1-S3 dari proposal UTS, S4 tambahan) dan 40 denah acak dari generator
  ber-seed, sehingga dapat dibuat ulang persis.
* **Keluaran = hasil benchmark**: biaya rencana, jumlah state yang diperiksa, dan waktu komputasi dari 7 konfigurasi
  algoritma pada setiap instans.

Semua data dibuat sendiri oleh kelompok (tidak diunduh) dan tidak memuat data pribadi. Folder ini adalah ekspor dari kode:
denah berasal dari `cleanbot/scenarios.py`, hasil dari `cleanbot/benchmark.py`. Format `skenario_*.json` sama dengan masukan
`build_problem()` di `cleanbot/api.py`, sehingga dapat langsung diberikan ke algoritma (lihat "Contoh pemakaian" di bawah).

## Isi folder

| Berkas | Peran | Isi | Jumlah |
|---|---|---|---|
| `skenario_kelas.json` | masukan | denah S1-S4 lengkap: ukuran, titik awal, perabot, sel rintangan, target | 4 instans |
| `peta_grid_S1-S4.csv` | masukan | denah yang sama dalam bentuk tabel, satu baris per sel grid | 190 baris |
| `skenario_acak.json` | masukan | denah acak uji skalabilitas: grid 10 x 7, k = 2..9 target, seed 0..4 | 40 instans |
| `hasil_benchmark_skenario.csv` | keluaran | 7 konfigurasi algoritma x S1-S4 | 28 baris |
| `hasil_benchmark_skalabilitas.csv` | keluaran | 7 konfigurasi algoritma x 40 denah acak | 280 baris |

Rencana rute lengkap tiap kombinasi (urutan sel, aksi, urutan target, data heat-map) ada di `../web/data/plans/` (28 berkas JSON).

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
| `gap_pct` | selisih biaya terhadap biaya optimal (A\* MST), dalam persen |

### `hasil_benchmark_skalabilitas.csv`

| Kolom | Arti |
|---|---|
| `k`, `seed` | jumlah target dan benih denah acak (kunci ke `skenario_acak.json`) |
| `config`, `label` | konfigurasi algoritma |
| `cost`, `expanded` | biaya rencana dan jumlah state yang diperiksa |
| `time_ms` | waktu komputasi, satu kali jalan (milidetik) |
| `state_space` | batas atas ruang state |
| `success` | rencana ditemukan |
| `opt` | biaya optimal denah itu (hasil A\* MST) |

### Konfigurasi algoritma (`config` / `label`)

| `config` | `label` | Menjamin optimal? |
|---|---|---|
| `bfs`, `ucs` | BFS, UCS | ya |
| `astar_manhattan`, `astar_max`, `astar_mst` | A\* dengan tiga heuristik (admissible dan consistent) | ya |
| `greedy_mst`, `nn` | Greedy, Nearest-Neighbor | tidak |

## Cuplikan temuan dari dataset

* S4 (10 x 7, 6 target): BFS memeriksa 3.254 state, A\* (MST) hanya 96 state (33,9x lebih sedikit) dengan biaya sama (38).
* Denah acak dengan 9 target: rata-rata BFS 29.256 state, A\* (MST) 470 state (62,3x).
* Greedy dan Nearest-Neighbor pada S4 menghasilkan biaya 42, yaitu 10,5% lebih mahal dari optimal.

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
print(hasil.cost, hasil.expanded)      # 38 96
```
