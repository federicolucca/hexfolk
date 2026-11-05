// hexfolk MCP server over stdio. All logic is in handlers.ts; this file only registers the tools
// with the official SDK. Never write to stdout except through the transport (stdio is the protocol).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MatchStore, ToolError } from './handlers';

const store = new MatchStore();
const server = new McpServer({ name: 'hexfolk', version: '0.1.0' });

type Result = { content: { type: 'text'; text: string }[]; isError?: true };

/** Runs a handler and returns its result as JSON text; a ToolError becomes an error result. */
async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn()) }] };
  } catch (err) {
    if (err instanceof ToolError) return { content: [{ type: 'text', text: err.message }], isError: true };
    console.error(err);
    return { content: [{ type: 'text', text: 'internal error' }], isError: true };
  }
}

const matchId = z.string().describe('The id returned by create_match');
const seat = z.number().int().min(0).max(3).describe('Seat number, 0-based (turn order)');

server.registerTool(
  'create_match',
  {
    description: 'Create a hexfolk match (2 to 4 players). Seats nobody joins are played by the built-in greedy AI once the match has started.',
    inputSchema: {
      seed: z.number().int().min(0).max(4294967295).optional().describe('Map seed; random if omitted'),
      players: z.number().int().min(2).max(4).describe('Number of seats'),
      turn_limit: z.number().int().min(1).max(200).describe('Rounds before the score decides the winner (the game default is 30)'),
      difficulty: z.enum(['easy', 'normal']).optional().describe('Strength of the built-in AI seats (default normal)'),
      turn_timeout_ms: z.number().int().min(1).max(3600000).optional().describe('Time a joined seat has per turn before the turn ends by default (default 120000)'),
    },
  },
  (args) => run(() => store.createMatch(args)),
);

server.registerTool(
  'join_match',
  {
    description: 'Take a seat. The match starts at the first join, so join every seat you play before ending your first turn.',
    inputSchema: { match_id: matchId, seat, name: z.string().max(40).optional().describe('A label for the replay') },
  },
  (args) => run(() => store.joinMatch(args)),
);

server.registerTool(
  'get_observation',
  {
    description: 'The current position: a short text summary and a compact JSON view. hexfolk has no fog of war, so this is the whole board. Coordinates are axial (q, r).',
    inputSchema: { match_id: matchId, seat },
  },
  (args) => run(() => store.getObservation(args)),
);

server.registerTool(
  'list_legal_actions',
  {
    description: 'Every legal action for the seat right now (empty when it is not its turn).',
    inputSchema: { match_id: matchId, seat },
  },
  (args) => run(() => store.listLegalActions(args)),
);

server.registerTool(
  'submit_actions',
  {
    description:
      'Apply actions in order. Illegal ones are rejected with a reason and skipped. Include {"type":"end_turn"} to finish the turn; you may also submit in several calls. Action shapes: move {unit,to:{q,r}}, attack {unit,target:{q,r}}, capture {unit}, train {city,unit}, research {tech}, harvest {at:{q,r}}, build_walls {city}, end_turn.',
    inputSchema: { match_id: matchId, seat, actions: z.array(z.object({ type: z.string() }).passthrough()).max(200) },
  },
  (args) => run(() => store.submitActions(args)),
);

server.registerTool(
  'get_match_status',
  { description: 'Status of the match: lobby, in_progress or finished; whose turn it is; the winner; per-seat counters.', inputSchema: { match_id: matchId } },
  (args) => run(() => store.getMatchStatus(args)),
);

server.registerTool(
  'get_replay',
  { description: 'The replay so far as JSONL (header, one line per turn, result). Load it in the game with ?replay=<url> or the Replay button.', inputSchema: { match_id: matchId } },
  (args) => run(() => store.getReplay(args)),
);

await server.connect(new StdioServerTransport());
