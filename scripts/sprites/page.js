// Runs in headless Chromium: renders one sprite per call with a fixed camera and fixed lights.
// Driven by scripts/render-sprites.mjs, which passes the camera settings and the sprite specs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(`/assets-src/kaykit/${path}`));
  return cache.get(path);
}

let renderer;

function setUp(view) {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setSize(view.frameWidth * view.supersample, view.frameHeight * view.supersample, false);
}

function makeCamera(view) {
  // Orthographic, so every tile has the same footprint wherever it sits on the map.
  const halfWidth = view.worldWidth / 2;
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, view.top, view.bottom, 0.1, 100);
  const elevation = THREE.MathUtils.degToRad(view.elevationDeg);
  camera.position.set(0, Math.sin(elevation) * 30, Math.cos(elevation) * 30);
  camera.lookAt(0, 0, 0);
  return camera;
}

function makeLights(scene, light) {
  scene.add(new THREE.HemisphereLight(light.sky, light.ground, light.hemiIntensity));
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(...light.sunDirection).normalize().multiplyScalar(20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = light.shadowRadius;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const s = sun.shadow.camera;
  s.left = -4;
  s.right = 4;
  s.top = 6;
  s.bottom = -4;
  s.near = 0.1;
  s.far = 60;
  scene.add(sun);
}

const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 4;

/** Moves UVs from one swatch cell of the 8x4 colour atlas to another (glTF UVs: v = 0 at the top). */
function remapUvCells(geometry, remap) {
  const copy = geometry.clone();
  const uv = copy.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const col = Math.min(ATLAS_COLUMNS - 1, Math.floor(u * ATLAS_COLUMNS));
    const row = Math.min(ATLAS_ROWS - 1, Math.floor(v * ATLAS_ROWS));
    const rule = remap.find((r) => r.from[0] === col && r.from[1] === row);
    if (rule) uv.setXY(i, u + (rule.to[0] - col) / ATLAS_COLUMNS, v + (rule.to[1] - row) / ATLAS_ROWS);
  }
  uv.needsUpdate = true;
  return copy;
}

/** Renders one sprite and returns a PNG data URL plus its size and the hex-centre anchor. */
async function renderSprite(view, light, spec) {
  if (!renderer) setUp(view);
  const scene = new THREE.Scene();
  makeLights(scene, light);
  // Only the top of each tile's side wall shows, so tiles read as thin slabs.
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -view.clipY)];

  for (const layer of spec.layers) {
    const gltf = await loadModel(layer.model);
    const object = gltf.scene.clone(true);
    object.position.set(...(layer.position ?? [0, 0, 0]));
    object.rotation.y = THREE.MathUtils.degToRad(layer.rotationDeg ?? 0);
    object.scale.setScalar(layer.scale ?? 1);
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (layer.uvRemap) node.geometry = remapUvCells(node.geometry, layer.uvRemap);
      node.material = node.material.clone();
      node.material.clippingPlanes = clip;
    });
    scene.add(object);
  }

  renderer.render(scene, makeCamera(view));

  // Downsample the supersampled frame, then trim empty rows from the top.
  const out = document.createElement('canvas');
  out.width = view.frameWidth;
  out.height = view.frameHeight;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, out.width, out.height);
  const { data } = ctx.getImageData(0, 0, out.width, out.height);
  let firstRow = 0;
  rows: for (; firstRow < out.height; firstRow++) {
    for (let x = 0; x < out.width; x++) {
      if (data[(firstRow * out.width + x) * 4 + 3] > 0) break rows;
    }
  }
  const top = Math.max(0, firstRow - view.padding);
  const trimmed = document.createElement('canvas');
  trimmed.width = out.width;
  trimmed.height = out.height - top;
  trimmed.getContext('2d').drawImage(out, 0, -top);

  scene.traverse((node) => {
    if (node.isMesh) node.material.dispose();
  });
  return {
    dataUrl: trimmed.toDataURL('image/png'),
    width: trimmed.width,
    height: trimmed.height,
    anchor: { x: view.anchorX, y: view.anchorY - top },
  };
}

window.renderSprite = renderSprite;
window.spriteRendererReady = true;
