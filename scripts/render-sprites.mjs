#!/usr/bin/env node
// Pre-renders KayKit glTF models into 2D sprites (public/sprites/*.png plus manifest.json).
// Uses three.js inside headless Chromium (playwright-core), with one fixed camera and fixed lights.
// Needs the glTF sources: run ./scripts/fetch-assets.sh first.
//
// Chromium: playwright-core uses the browsers already in ~/.cache/ms-playwright. If none is there,
// run `npx playwright-core install chromium-headless-shell`, or set CHROME_PATH to a local Chrome.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = join(ROOT, 'public', 'sprites');
const ASSETS = join(ROOT, 'assets-src', 'kaykit');

// A KayKit hex is 2 units flat-to-flat (x) and 2.31 units point-to-point (z): seen from +z it is
// pointy-top. PIXELS_PER_UNIT = 128 makes a tile 256 px wide.
const PIXELS_PER_UNIT = 128;
const HEX_RADIUS = 2 / Math.sqrt(3); // centre to corner, in world units
const VIEW = {
  elevationDeg: 40,
  worldWidth: 2,
  top: 4.2, // world units above the hex centre, in screen space: room for the castle
  bottom: -1.2,
  clipY: -0.4, // tile side walls are cut 0.4 units below the grass surface
  supersample: 2,
  padding: 2,
};
VIEW.frameWidth = Math.round(VIEW.worldWidth * PIXELS_PER_UNIT);
VIEW.frameHeight = Math.round((VIEW.top - VIEW.bottom) * PIXELS_PER_UNIT);
VIEW.anchorX = VIEW.frameWidth / 2;
VIEW.anchorY = Math.round(VIEW.top * PIXELS_PER_UNIT);

const LIGHT = {
  sky: '#ffffff',
  ground: '#b9a98a',
  hemiIntensity: 1.35,
  sun: '#ffffff',
  sunIntensity: 2.0,
  sunDirection: [-2, 4, 2.5], // from the upper left, slightly in front
  shadowRadius: 4,
};

const COLOURS = ['blue', 'red', 'yellow', 'green'];
const GRASS = { model: 'tiles/base/hex_grass.gltf' };

// The texture atlas is an 8x4 grid of colour swatches; models pick their colours by UV cell.
// Blue buildings use cells (1, 1) and (0, 3) for the team colour. [column, row], row 0 at the top.
const NEUTRAL_UV_REMAP = [
  { from: [1, 1], to: [5, 1] }, // roofs: blue -> thatch tan
  { from: [0, 3], to: [6, 1] }, // trims and flags: dark blue -> stone grey
];

function village(colour, uvRemap) {
  const extra = uvRemap ? { uvRemap } : {};
  return [
    GRASS,
    { model: `buildings/${colour}/building_home_A_${colour}.gltf`, position: [-0.42, 0, -0.25], rotationDeg: 30, scale: 0.7, ...extra },
    { model: `buildings/${colour}/building_home_B_${colour}.gltf`, position: [0.38, 0, -0.1], rotationDeg: -30, scale: 0.7, ...extra },
    { model: `buildings/${colour}/building_well_${colour}.gltf`, position: [-0.05, 0, 0.5], scale: 0.6, ...extra },
  ];
}

/** Each sprite is a stack of models; positions are in world units, relative to the hex centre. */
const SPRITES = [
  { name: 'terrain-grass', layers: [GRASS] },
  { name: 'terrain-forest', layers: [GRASS, { model: 'decoration/nature/trees_A_large.gltf' }] },
  { name: 'terrain-mountain', layers: [GRASS, { model: 'decoration/nature/mountain_B.gltf' }] },
  { name: 'terrain-water', layers: [{ model: 'tiles/base/hex_water.gltf' }] },
  ...COLOURS.map((c) => ({
    name: `capital-${c}`,
    layers: [GRASS, { model: `buildings/${c}/building_castle_${c}.gltf`, scale: 0.62 }],
  })),
  ...COLOURS.map((c) => ({ name: `village-${c}`, layers: village(c) })),
  // The pack has no neutral houses: reuse the blue ones with the team colour swapped for thatch.
  { name: 'village-neutral', layers: village('blue', NEUTRAL_UV_REMAP) },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const SERVED = ['/scripts/sprites/', '/node_modules/three/', '/assets-src/kaykit/'];

function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!SERVED.some((prefix) => path.startsWith(prefix))) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function main() {
  if (!existsSync(ASSETS)) {
    console.error('Missing assets-src/kaykit: run ./scripts/fetch-assets.sh first.');
    process.exit(1);
  }
  for (const sprite of SPRITES) {
    for (const layer of sprite.layers) {
      if (!existsSync(join(ASSETS, layer.model))) throw new Error(`Missing model ${layer.model}`);
    }
  }

  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => console.error('page error:', err.message));
    page.on('console', (msg) => msg.type() === 'error' && console.error('page:', msg.text()));
    await page.goto(`http://127.0.0.1:${server.address().port}/scripts/sprites/page.html`);
    await page.waitForFunction(() => window.spriteRendererReady === true);

    await mkdir(OUT_DIR, { recursive: true });
    for (const file of await readdir(OUT_DIR)) {
      if (file.endsWith('.png') || file === 'manifest.json') await rm(join(OUT_DIR, file));
    }

    const sprites = [];
    for (const spec of SPRITES) {
      const result = await page.evaluate(([view, light, s]) => window.renderSprite(view, light, s), [VIEW, LIGHT, spec]);
      const file = `${spec.name}.png`;
      await writeFile(join(OUT_DIR, file), Buffer.from(result.dataUrl.split(',')[1], 'base64'));
      sprites.push({ name: spec.name, file, width: result.width, height: result.height, anchor: result.anchor });
      console.log(`${file.padEnd(24)} ${result.width}x${result.height}`);
    }

    const sin = Math.sin((VIEW.elevationDeg * Math.PI) / 180);
    const manifest = {
      // anchor: the pixel that sits on the centre of the hex's top face.
      // tile: how hexes tile on screen, in sprite pixels (for drawing a pointy-top grid).
      tile: {
        width: VIEW.frameWidth,
        columnStep: VIEW.frameWidth,
        rowStep: Math.round(1.5 * HEX_RADIUS * sin * PIXELS_PER_UNIT * 100) / 100,
        faceHeight: Math.round(2 * HEX_RADIUS * sin * PIXELS_PER_UNIT * 100) / 100,
      },
      sprites,
    };
    await writeFile(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${sprites.length} sprites and manifest.json to public/sprites/`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
