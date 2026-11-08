// Flat vector placeholders for the resources, number tokens and roads, drawn in code in the palette
// colours until Gemini art exists (docs/ART.md). Pure drawing: no game logic.
import type { Resource } from '../core/map';
import { PALETTE } from './palette';
import type { Point } from './layout';

const TAU = Math.PI * 2;

function outline(ctx: CanvasRenderingContext2D, fill: string, width: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.ink;
  ctx.stroke();
}

/** A resource symbol centred on (x, y) that fits a box of `size` px. */
export function drawResource(ctx: CanvasRenderingContext2D, kind: Resource, x: number, y: number, size: number): void {
  const u = size / 32;
  const c = PALETTE.resource;
  const lw = 2 * u;
  ctx.save();
  ctx.translate(x, y);
  switch (kind) {
    case 'grain': {
      // Three stalks with ear shapes.
      for (const dx of [-9, 0, 9]) {
        ctx.beginPath();
        ctx.moveTo(dx * u, 14 * u);
        ctx.lineTo(dx * u, -2 * u);
        ctx.strokeStyle = c.grainDark;
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(dx * u, -8 * u, 4 * u, 9 * u, 0, 0, TAU);
        outline(ctx, c.grain, lw);
      }
      break;
    }
    case 'sheep': {
      ctx.beginPath();
      ctx.arc(-4 * u, 0, 9 * u, 0, TAU);
      ctx.arc(4 * u, -4 * u, 8 * u, 0, TAU);
      ctx.arc(6 * u, 4 * u, 8 * u, 0, TAU);
      outline(ctx, c.sheepWool, lw);
      ctx.beginPath();
      ctx.ellipse(-12 * u, 2 * u, 5 * u, 6 * u, 0, 0, TAU);
      outline(ctx, c.sheepFace, lw);
      break;
    }
    case 'wood': {
      ctx.beginPath();
      ctx.rect(-3 * u, 4 * u, 6 * u, 10 * u);
      outline(ctx, c.woodTrunk, lw);
      ctx.beginPath();
      ctx.moveTo(0, -15 * u);
      ctx.lineTo(11 * u, 6 * u);
      ctx.lineTo(-11 * u, 6 * u);
      ctx.closePath();
      outline(ctx, c.woodLeaf, lw);
      break;
    }
    case 'stone': {
      ctx.beginPath();
      ctx.moveTo(-13 * u, 10 * u);
      ctx.lineTo(-8 * u, -6 * u);
      ctx.lineTo(2 * u, -12 * u);
      ctx.lineTo(13 * u, -2 * u);
      ctx.lineTo(10 * u, 10 * u);
      ctx.closePath();
      outline(ctx, c.stone, lw);
      ctx.beginPath();
      ctx.moveTo(2 * u, -12 * u);
      ctx.lineTo(0, 10 * u);
      ctx.moveTo(-8 * u, -6 * u);
      ctx.lineTo(0, 2 * u);
      ctx.strokeStyle = c.stoneDark;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      break;
    }
    case 'fish': {
      ctx.beginPath();
      ctx.ellipse(-2 * u, 0, 11 * u, 6 * u, 0, 0, TAU);
      outline(ctx, '#5aa9d6', lw);
      ctx.beginPath();
      ctx.moveTo(8 * u, 0);
      ctx.lineTo(15 * u, -6 * u);
      ctx.lineTo(15 * u, 6 * u);
      ctx.closePath();
      outline(ctx, '#5aa9d6', lw);
      break;
    }
  }
  ctx.restore();
}

/** A number token: a round disc with its number; `paying` marks a harvested tile. */
export function drawToken(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, radius: number, paying: boolean): void {
  const t = PALETTE.token;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = paying ? t.paying : t.face;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, radius * 0.16);
  ctx.strokeStyle = t.ring;
  ctx.stroke();
  ctx.fillStyle = n === 6 || n === 8 ? t.hot : t.text;
  ctx.font = `bold ${Math.round(radius * 1.15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + radius * 0.06);
}

/** Road pieces from a tile centre toward each linked neighbour (halfway), as flat two-tone lines. */
export function drawRoad(ctx: CanvasRenderingContext2D, centre: Point, toward: Point[], width: number): void {
  const spokes = toward.length > 0 ? toward : [centre];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [colour, w] of [
    [PALETTE.road.edge, width + 4],
    [PALETTE.road.fill, width],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const p of spokes) {
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo((centre.x + p.x) / 2, (centre.y + p.y) / 2);
    }
    ctx.stroke();
  }
}
