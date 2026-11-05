// A minimal MCP client: connects to the built server over stdio, takes seat 0 of a 2-player match
// against the built-in AI and just ends every turn. Use it as a smoke test and as a template for a
// real agent (replace the "end_turn" line with your own decisions).
//   node packages/mcp/examples/pass-client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../dist/server.js', import.meta.url));
const client = new Client({ name: 'pass-client', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};

const { match_id, seed } = await call('create_match', { seed: 7, players: 2, turn_limit: 10, difficulty: 'easy' });
await call('join_match', { match_id, seat: 0, name: 'pass-client' });
for (;;) {
  const obs = await call('get_observation', { match_id, seat: 0 });
  if (!obs.your_turn) break;
  await call('submit_actions', { match_id, seat: 0, actions: [{ type: 'end_turn' }] });
}
const status = await call('get_match_status', { match_id });
console.log(`seed ${seed}: ${status.status}, winner ${status.winner}, reason ${status.reason}, round ${status.turn}`);
const replay = await call('get_replay', { match_id });
console.log(`replay: ${replay.turns} turns`);
await client.close();
