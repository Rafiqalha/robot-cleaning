// Konfigurasi global CleanBot 3D
export const CELL = 1.0; // 1 sel grid = 1 m
export const ROOM_H = 3.0; // tinggi ruangan (m)
export const WALL_T = 0.2; // tebal dinding (m)
export const ROBOT_SCALE = 1.3;

// Palet sama dengan PPT UTS (Anthropic brand palette)
export const PALETTE = {
  ink: '#141413',
  paper: '#FAF9F5',
  card: '#F0EEE6',
  orange: '#D97757',
  blue: '#6A9BCC',
  green: '#788C5D',
  pink: '#C46686',
  sage: '#BCD1CA',
  tan: '#D4A27F',
};

export const QUALITY = {
  rendah: { pixelRatio: 1, shadow: 1024, ao: false, bloom: false, msaa: 0 },
  sedang: { pixelRatio: 1.25, shadow: 2048, ao: false, bloom: true, msaa: 2 },
  tinggi: { pixelRatio: 1.75, shadow: 2048, ao: true, bloom: true, msaa: 4 },
  ultra: { pixelRatio: 2, shadow: 4096, ao: true, bloom: true, msaa: 4 },
};

export const ALGO_LABEL = { astar: 'A*', ucs: 'UCS', bfs: 'BFS', greedy: 'Greedy', nn: 'Nearest-Neighbor' };
export const HEUR_LABEL = { mst: 'MST + terdekat', max: 'Jarak terjauh', manhattan: 'Manhattan', zero: 'h = 0' };
export const ACTION_LABEL = { U: 'Atas', R: 'Kanan', D: 'Bawah', L: 'Kiri', C: 'Bersihkan' };
export const ACTION_GLYPH = { U: '↑', R: '→', D: '↓', L: '←', C: '✦' };
export const DIRS = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
