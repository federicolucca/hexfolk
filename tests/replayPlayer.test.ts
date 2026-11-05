import { describe, expect, it } from 'vitest';
import { GreedyAgent } from '../src/core/ai';
import { runMatch } from '../src/core/match';
import { parseReplay, serializeReplay } from '../src/core/replay';
import { ReplayPlayer } from '../src/ui/replayPlayer';

describe('ReplayPlayer', () => {
  it('steps forward and back through every turn and ends on the final state', async () => {
    const { match, replay } = await runMatch({ seed: 3, players: 2, turnLimit: 8, agents: [new GreedyAgent(), new GreedyAgent('easy')] });
    const player = new ReplayPlayer(parseReplay(serializeReplay(replay)));
    expect(player.atStart).toBe(true);
    expect(player.prev()).toBe(false);
    expect(player.describe().title).toBe(`Replay 0/${replay.turns.length}`);
    while (player.next());
    expect(player.atEnd).toBe(true);
    expect(player.next()).toBe(false);
    expect(player.state).toEqual(match.state);
    expect(player.describe().detail).toContain('Result:');
    player.seek(-5);
    expect(player.index).toBe(0);
    player.seek(1);
    expect(player.describe().detail).toMatch(/^Round 1: /);
  });

  it('refuses a corrupt replay', () => {
    expect(() => parseReplay('{"type":"turn"}')).toThrow(/header|bad turn/);
    expect(() => parseReplay('not json')).toThrow(/not valid JSON/);
    expect(() => parseReplay('')).toThrow(/no header/);
  });
});
