// Klien API: server Python (FastAPI) + cadangan data statis bila server tidak tersedia.
const cache = new Map();
let staticMode = false;

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

export const isStatic = () => staticMode;

export async function getMeta() {
  try {
    const m = await getJSON('/api/meta');
    staticMode = false;
    return m;
  } catch {
    staticMode = true;
    return getJSON('data/meta.json');
  }
}

/** spec: {width,height,obstacles,start,home?,targets:[{id,x,y}]} ; scenarioId = id skenario bawaan (tanpa perubahan) */
export async function requestPlan(spec, algorithm, heuristic, scenarioId = null) {
  const key = JSON.stringify([spec, algorithm, heuristic]);
  if (cache.has(key)) return cache.get(key);
  let plan;
  if (!staticMode) {
    try {
      plan = await getJSON('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...spec, algorithm, heuristic }),
      });
    } catch (e) {
      console.warn('API gagal, beralih ke data statis:', e);
      staticMode = true;
    }
  }
  if (!plan) {
    if (!scenarioId) throw new Error('Server Python tidak tersedia; denah kustom butuh server (python server.py).');
    const h = ['astar', 'greedy'].includes(algorithm) ? heuristic : 'none';
    plan = await getJSON(`data/plans/${scenarioId}_${algorithm}_${h}.json`);
  }
  cache.set(key, plan);
  return plan;
}

export async function getBenchmark() {
  try {
    return await getJSON('/api/benchmark?repeats=3');
  } catch {
    return getJSON('data/benchmark.json');
  }
}

/** (mode --dev) kirim tangkapan layar ke server agar tersimpan sebagai file PNG. */
export async function saveScreenshot(name, dataUrl) {
  const r = await fetch('/api/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, dataUrl }),
  });
  return r.ok ? r.json() : null;
}
