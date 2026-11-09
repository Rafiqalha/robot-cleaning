// Panggung render: renderer PBR, bayangan matahari, IBL, post-processing (AO + bloom), kontrol orbit.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './config.js';
import { makeBackgroundTexture } from './textures.js';

export class Stage {
  constructor(canvas, qualityName = 'tinggi') {
    this.canvas = canvas;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = makeBackgroundTexture();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 300);
    this.camera.position.set(9, 8, 10);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 40;
    this.controls.target.set(0, 0.3, 0);

    RectAreaLightUniformsLib.init();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0xd6cdbb, 0.26);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffeccc, 4.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 4;
    this.sun.shadow.blurSamples = 12;
    this.scene.add(this.sun, this.sun.target);

    this.insets = { l: 0, r: 0, t: 0, b: 0 }; // area yang tertutup panel HUD (px)
    this.hooks = []; // fungsi (dt) dipanggil tiap frame sebelum render
    this.composer = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.qualityName = null;
    this.frameMs = 16;
    this._last = performance.now();
    this._size = new THREE.Vector2();

    this.setQuality(qualityName);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Posisi matahari & jangkauan bayangan menyesuaikan ukuran ruangan. */
  fitToRoom(W, H) {
    const R = Math.hypot(W, H) / 2 + 2.5;
    const dir = new THREE.Vector3(0.5, 0.78, 1.0).normalize();
    this.sun.position.copy(dir.multiplyScalar(36));
    this.sun.target.position.set(0, 0, 0);
    const cam = this.sun.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.near = 4; cam.far = 90;
    cam.updateProjectionMatrix();
  }

  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.tinggi;
    this.qualityName = QUALITY[name] ? name : 'tinggi';
    this.q = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    if (this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    }
    this.buildComposer();
    this.resize();
  }

  buildComposer() {
    const q = this.q;
    this.composer?.dispose();
    const composer = (this.composer = new EffectComposer(this.renderer));
    composer.renderTarget1.samples = q.msaa;
    composer.renderTarget2.samples = q.msaa;
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.aoPass = null;
    this.bloomPass = null;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (q.ao) {
      const ao = (this.aoPass = new GTAOPass(this.scene, this.camera, size.x, size.y));
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.3, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
      ao.blendIntensity = 0.95;
      // lewati objek overlay/transparan (dinding hantu, langit, kaca, sprite, plafon) saat membangun G-buffer
      const original = ao._overrideVisibility.bind(ao);
      ao._overrideVisibility = function () {
        original();
        this.scene.traverse((o) => {
          if (!o.visible) return;
          const m = o.material;
          const skip = o.userData?.noAO || o.isSprite || (m && !Array.isArray(m) && ((m.transparent && m.opacity < 0.99) || m.colorWrite === false));
          if (skip && (o.isMesh || o.isSprite)) {
            this._visibilityCache.push(o);
            o.visible = false;
          }
        });
      };
      composer.addPass(ao);
    }
    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.24, 0.55, 1.9);
      composer.addPass(this.bloomPass);
    }
    composer.addPass(new OutputPass());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyInsets(w, h);
    this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.renderer.getDrawingBufferSize(this._size);
    this.hooks.forEach((fn) => fn.onResize?.(w, h, this._size));
  }

  /** Geser pusat proyeksi agar adegan terpusat di area bebas di antara panel HUD. */
  setInsets(i) {
    this.insets = i;
    this.applyInsets();
    this.camera.updateProjectionMatrix();
    this.hooks.forEach((fn) => fn.onInsets?.());
  }

  applyInsets(w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight) {
    const { l, r, t, b } = this.insets;
    const cx = (l + (w - r)) / 2, cy = (t + (h - b)) / 2;
    const sx = w / 2 - cx, sy = h / 2 - cy;
    if (Math.abs(sx) < 1 && Math.abs(sy) < 1) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, sx, sy, w, h);
  }

  render(dt) {
    for (const fn of this.hooks) if (typeof fn === 'function') fn(dt);
    if (this.controls.enabled) this.controls.update();
    this.composer.render(dt);
  }

  /** Ambil tangkapan layar canvas (PNG data-URL), dirender ulang di tick yang sama. */
  capture() {
    this.composer.render(0);
    return this.canvas.toDataURL('image/png');
  }

  get pixelScale() {
    // piksel per satuan dunia pada jarak 1 (untuk ukuran titik partikel)
    return (this.renderer.getDrawingBufferSize(this._size).y) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }
}
