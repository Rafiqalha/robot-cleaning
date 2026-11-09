// CleanBot 3D — titik masuk aplikasi.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Room } from './room.js';
import { CameraRig } from './camerarig.js';
import { loadAssets } from './assets.js';
import { getMeta, saveScreenshot } from './api.js';
import { FX } from './fx.js';
import { Robot } from './robot.js';
import { Litter } from './litter.js';
import { SearchViz } from './searchviz.js';
import { Lidar } from './lidar.js';
import { Sfx } from './audio.js';
import { Director } from './director.js';
import { HUD } from './hud.js';
import { Editor } from './editor.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const $loaderBar = document.getElementById('loader-bar');
const $loaderMsg = document.getElementById('loader-msg');
const setLoad = (p, msg) => {
  $loaderBar.style.width = `${Math.round(p * 100)}%`;
  if (msg) $loaderMsg.textContent = msg;
};

async function boot() {
  setLoad(0.05, 'Menyiapkan renderer…');
  const stage = new Stage(document.getElementById('view'), params.get('quality') || 'tinggi');
  const app = { stage, THREE, params };
  window.cleanbot = app;

  setLoad(0.15, 'Memuat model Blender (robot, perabot, sampah)…');
  await loadAssets();
  setLoad(0.55, 'Memuat tekstur lantai & dinding…');
  await Room.loadTextures();
  setLoad(0.75, 'Menghubungi inti AI Python…');
  const meta = (app.meta = await getMeta());
  const sid = params.get('scenario') || 'S1';
  const scn = meta.scenarios.find((s) => s.id === sid) || meta.scenarios[0];

  setLoad(0.9, 'Membangun ruang kelas, robot, dan efek…');
  const room = (app.room = new Room(stage));
  // bangun dulu agar objek lain memiliki grid & ukuran ruangan
  room.build(scn);
  app.fx = new FX(stage, room);
  app.sfx = new Sfx();
  app.robot = new Robot(stage, room);
  app.litter = new Litter(stage, room, app.fx);
  app.viz = new SearchViz(stage, room);
  app.lidar = new Lidar(stage, room, app.robot);
  app.rig = new CameraRig(stage, room, () => app.robot);
  app.director = new Director(app);
  const d = app.director;
  d.algo = params.get('algo') || 'astar';
  d.heur = params.get('heur') || 'mst';
  app.editor = new Editor(app);
  app.game = new Game(app);
  app.hud = new HUD(app);
  d.loadScenario(scn);
  app.rig.setMode(params.get('cam') || 'overview', { duration: 0 });
  if (params.get('hud') === '0') document.body.classList.add('clean');
  if (!params.has('nointro') && !params.has('cam')) app.rig.flyIn(3.8);

  stage.hooks.push((dt) => {
    d.update(dt);
    app.robot.update(dt);
    app.litter.update(dt);
    app.viz.update(dt);
    app.lidar.update(dt);
    app.fx.update(dt);
    app.rig.update(dt);
    room.update(dt, stage.camera);
  });

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    stage.frameMs += (dt * 1000 - stage.frameMs) * 0.05;
    stage.render(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__shot = async (name = 'shot') => saveScreenshot(name, stage.capture());
  setLoad(1, 'Siap');
  document.body.classList.remove('loading');
  if (params.get('auto') === '1') setTimeout(() => d.start(), 800);
}

boot().catch((err) => {
  console.error(err);
  $loaderMsg.textContent = 'Gagal memuat: ' + err.message;
  $loaderMsg.style.color = '#ff8a7a';
});
