// Pemuat aset GLB (hasil Blender): robot, properti kelas, sampah.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const assets = { robot: null, props: {}, litter: {}, ready: false };

const loader = new GLTFLoader();
const loadOne = (url, onProgress) =>
  new Promise((resolve, reject) => loader.load(url, resolve, (e) => onProgress?.(url, e), reject));

function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const isGlass = mats.some((m) => m.name === 'Glass_Window' || (m.transparent && m.opacity < 0.5));
    o.castShadow = !isGlass;
    o.receiveShadow = !mats.some((m) => m.name === 'Liquid_Orange');
    for (const m of mats) {
      if (m.map) m.map.anisotropy = 8;
    }
  });
}

export async function loadAssets(onProgress) {
  const [r, p, l] = await Promise.all([
    loadOne('assets/models/robot.glb', onProgress),
    loadOne('assets/models/props.glb', onProgress),
    loadOne('assets/models/litter.glb', onProgress),
  ]);
  prepare(r.scene);
  prepare(p.scene);
  prepare(l.scene);
  assets.robot = r.scene;
  for (const n of p.scene.children) if (n.name.startsWith('prop_')) assets.props[n.name.slice(5)] = n;
  for (const n of l.scene.children) if (n.name.startsWith('litter_')) assets.litter[n.name.slice(7)] = n;
  assets.ready = true;
  return assets;
}

function reset(o) {
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.scale.set(1, 1, 1);
  return o;
}

/** Klon properti; opsi `ownMaterials` = salin material (agar warna bisa diubah per-instance). */
export function cloneProp(name, { ownMaterials = false } = {}) {
  const src = assets.props[name];
  if (!src) throw new Error(`Properti tidak ditemukan: ${name}`);
  const o = reset(src.clone(true));
  if (ownMaterials) {
    o.traverse((m) => {
      if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    });
  }
  return o;
}

export function cloneLitter(name) {
  const src = assets.litter[name];
  if (!src) throw new Error(`Sampah tidak ditemukan: ${name}`);
  return reset(src.clone(true));
}

export function cloneRobot() {
  // material robot dipakai bersama: face & LED akan diganti/diubah oleh kelas Robot.
  const o = assets.robot.clone(true);
  o.traverse((m) => {
    if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
  });
  return o;
}

export const PROP_NAMES = () => Object.keys(assets.props);
export const LITTER_NAMES = () => Object.keys(assets.litter);
export { THREE };
