// What a language-model agent reads, and how its reply is turned into an action. Pure text in,
// plain objects out: the network call lives in bench/llm.ts. Both LLM agents get the same rules and
// the same state text; only the way they answer differs:
//   free   answers in free text with one JSON action, which the harness checks;
//   typed  picks one numbered legal action, with output constrained to a JSON schema;
//   decision  a decision model scores the numbered legal actions as the options of one choice question.
import { describeObservation } from '../observation';
import type { Observation } from '../engine';
import { UNIT_STATS, UNIT_TYPES } from '../rules';
import type { Action } from '../state';

const unitLine = UNIT_TYPES.map((t) => {
  const s = UNIT_STATS[t];
  return `${t}: attack ${s.attack}, defence ${s.defence}, move ${s.movement}, range ${s.range}, health ${s.health}, cost ${s.cost}${s.tech ? `, needs ${s.tech}` : ''}`;
}).join('; ');

export const RULES_TEXT = `You play hexfolk, a turn-based strategy game for 2 players on an 11x11 hex map (axial coordinates q, r).
Goal: capture the enemy capital (it eliminates them), or have the higher score after the last round.
Score: 5 per city, 1 per population, 2 per tech, 1 per unit.
Each turn you get stars from your cities. Spend them to train units in your cities, research techs (4 stars each:
hunting, fishing, riding, climbing, archery, fortification), harvest resources next to your cities (2 stars, +1 population),
build roads (2 stars) or walls (needs fortification).
Units: ${unitLine}.
A unit standing on a city it does not own can capture it. Attacks are deterministic: stronger, healthier units deal more damage.
You act one action at a time; the turn passes when you send end_turn. An invalid action ends your turn.`;

export const ACTION_FORMAT = `Actions (JSON):
{"type":"move","unit":ID,"to":{"q":Q,"r":R}}
{"type":"attack","unit":ID,"target":{"q":Q,"r":R}}
{"type":"capture","unit":ID}
{"type":"train","city":ID,"unit":"warrior"|"archer"|"rider"|"defender"}
{"type":"research","tech":"hunting"|"fishing"|"riding"|"climbing"|"archery"|"fortification"}
{"type":"harvest","at":{"q":Q,"r":R}}
{"type":"build_road","at":{"q":Q,"r":R}}
{"type":"build_walls","city":ID}
{"type":"end_turn"}`;

/** The state as text: the observation summary plus the terrain and the resources on the map. */
export function stateText({ you, state }: Observation): string {
  const terrain = new Map<number, string[]>();
  for (const t of state.tiles) terrain.set(t.r, [...(terrain.get(t.r) ?? []), `${t.q}:${t.terrain[0]}`]);
  const rows = [...terrain].sort((a, b) => a[0] - b[0]).map(([r, cells]) => `r=${r} ${cells.join(' ')}`);
  const resources = state.tiles.filter((t) => t.resource).map((t) => `${t.resource}@${t.q},${t.r}`);
  return [
    describeObservation(state, you),
    'Terrain (q:letter, g grass, f forest, h hill, m mountain, w water):',
    ...rows,
    `Resources not yet harvested: ${resources.join(' ') || 'none'}.`,
  ].join('\n');
}

export function freePrompt(view: Observation): { system: string; user: string } {
  return {
    system: `${RULES_TEXT}\n\n${ACTION_FORMAT}\n\nReply with exactly one action as a JSON object and nothing else.`,
    user: stateText(view),
  };
}

export function typedPrompt(view: Observation, legal: Action[]): { system: string; user: string } {
  return {
    system: `${RULES_TEXT}\n\nChoose one of the numbered legal actions. Reply as JSON: {"choice":"N"}.`,
    user: `${stateText(view)}\n\nLegal actions:\n${legal.map((a, i) => `${i}: ${JSON.stringify(a)}`).join('\n')}`,
  };
}

/** The System One request body (without the model) for a decision agent: same rules and state text as the others. */
export function decisionRequest(view: Observation, legal: Action[]): Record<string, unknown> {
  return {
    state: `${RULES_TEXT}\n\n${stateText(view)}`,
    questions: {
      move: {
        type: 'choice',
        instructions: `You are player ${view.you}. Choose the legal action that best helps you win the game.`,
        criteria: Object.fromEntries(legal.map((a, i) => [String(i), JSON.stringify(a)])),
      },
    },
  };
}

/** JSON schema for the typed reply: the choice is one of the legal indices. */
export function choiceSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: { choice: { type: 'string', enum: Array.from({ length: count }, (_, i) => String(i)) } },
    required: ['choice'],
    additionalProperties: false,
  };
}

/** The first JSON object in a free reply (code fences and prose around it are allowed), or null. */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < reply.length; i++) {
    const ch = reply[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(reply.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The legal action a typed reply points to, or the reply itself when it does not (so the harness logs it as malformed). */
export function resolveChoice(reply: string, legal: Action[]): unknown {
  const parsed = extractJson(reply) as { choice?: unknown } | null;
  const n = typeof parsed?.choice === 'string' || typeof parsed?.choice === 'number' ? Number(parsed.choice) : NaN;
  return Number.isInteger(n) && n >= 0 && n < legal.length ? legal[n] : { invalidChoice: parsed?.choice ?? reply.slice(0, 100) };
}
