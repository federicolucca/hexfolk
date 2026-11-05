// Shape checks for actions that come from outside (an MCP client, a replay file). The engine decides
// whether an action is legal (checkAction); this only makes sure it is a well-formed Action, so the
// engine never sees a malformed object. Unknown fields are dropped.
import { TECH_IDS, UNIT_TYPES } from './rules';
import type { Action, HexRef } from './state';

export const MAX_ACTIONS_PER_SUBMIT = 200;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function hex(v: unknown): HexRef | null {
  return isObject(v) && isInt(v.q) && isInt(v.r) ? { q: v.q, r: v.r } : null;
}

/** A well-formed Action, or the reason it is not one. */
export function parseAction(raw: unknown): Parsed<Action> {
  if (!isObject(raw) || typeof raw.type !== 'string') return { ok: false, error: 'an action must be an object with a string "type"' };
  const bad = (what: string): Parsed<Action> => ({ ok: false, error: `${raw.type}: ${what}` });
  switch (raw.type) {
    case 'end_turn':
      return { ok: true, value: { type: 'end_turn' } };
    case 'move': {
      const to = hex(raw.to);
      return isInt(raw.unit) && to ? { ok: true, value: { type: 'move', unit: raw.unit, to } } : bad('needs integer "unit" and "to": {q, r}');
    }
    case 'capture':
      return isInt(raw.unit) ? { ok: true, value: { type: 'capture', unit: raw.unit } } : bad('needs integer "unit"');
    case 'attack': {
      const target = hex(raw.target);
      return isInt(raw.unit) && target ? { ok: true, value: { type: 'attack', unit: raw.unit, target } } : bad('needs integer "unit" and "target": {q, r}');
    }
    case 'harvest': {
      const at = hex(raw.at);
      return at ? { ok: true, value: { type: 'harvest', at } } : bad('needs "at": {q, r}');
    }
    case 'train': {
      const unit = UNIT_TYPES.find((u) => u === raw.unit);
      return isInt(raw.city) && unit ? { ok: true, value: { type: 'train', city: raw.city, unit } } : bad(`needs integer "city" and "unit" one of ${UNIT_TYPES.join(', ')}`);
    }
    case 'research': {
      const tech = TECH_IDS.find((t) => t === raw.tech);
      return tech ? { ok: true, value: { type: 'research', tech } } : bad(`needs "tech" one of ${TECH_IDS.join(', ')}`);
    }
    case 'build_walls':
      return isInt(raw.city) ? { ok: true, value: { type: 'build_walls', city: raw.city } } : bad('needs integer "city"');
    default:
      return { ok: false, error: `unknown action type "${raw.type}"` };
  }
}

/** A list of well-formed actions (at most MAX_ACTIONS_PER_SUBMIT), or the first problem found. */
export function parseActions(raw: unknown): Parsed<Action[]> {
  if (!Array.isArray(raw)) return { ok: false, error: '"actions" must be an array' };
  if (raw.length > MAX_ACTIONS_PER_SUBMIT) return { ok: false, error: `at most ${MAX_ACTIONS_PER_SUBMIT} actions per submission` };
  const actions: Action[] = [];
  for (const [i, item] of raw.entries()) {
    const parsed = parseAction(item);
    if (!parsed.ok) return { ok: false, error: `actions[${i}]: ${parsed.error}` };
    actions.push(parsed.value);
  }
  return { ok: true, value: actions };
}
