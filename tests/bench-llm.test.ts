import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionStepAgent, LlmStepAgent, MAX_DECISION_OPTIONS } from '../bench/llm';
import { choiceSchema, extractJson, resolveChoice, stateText, typedPrompt } from '../src/core/bench/prompt';
import { legalActions, newGame, observe } from '../src/core/engine';

const state = newGame({ seed: 3, players: 2 });
const legal = legalActions(state, 0);
const SECRET = 'sk-test-secret-value';

function fakeFetch(reply: string, status = 200) {
  const calls: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ body: JSON.parse(init.body), headers: init.headers });
    const data = status === 200 ? { choices: [{ message: { content: reply } }], usage: { prompt_tokens: 100, completion_tokens: 5, cost: 0.0001 } } : { error: { message: 'bad request' } };
    return new Response(JSON.stringify(data), { status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('language-model agents', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('the typed agent sends a JSON schema over the legal choices and returns the chosen legal action', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const f = fakeFetch('{"choice":"0"}');
    const d = await new LlmStepAgent('llama8b', 'typed', 1, f.fn).choose(observe(state, 0), legal);
    expect(d.action).toEqual(legal[0]);
    expect(d.usage).toEqual({ tokensIn: 100, tokensOut: 5, costUsd: 0.0001 });
    expect(f.calls[0]!.body).toMatchObject({ temperature: 0, seed: 1, response_format: { type: 'json_schema' } });
  });

  it('the free agent sends no schema and passes on whatever JSON the model wrote', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const f = fakeFetch('I will capture: {"type":"capture","unit":0}');
    const d = await new LlmStepAgent('ministral3b', 'free', 1, f.fn).choose(observe(state, 0), legal);
    expect(d.action).toEqual({ type: 'capture', unit: 0 });
    expect(f.calls[0]!.body.response_format).toBeUndefined();
  });

  it('reads the key from the environment only and never puts it in an error', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const f = fakeFetch('', 400);
    const err = await new LlmStepAgent('llama8b', 'free', 1, f.fn).choose(observe(state, 0), legal).catch((e: Error) => e);
    expect(String(err)).not.toContain(SECRET);
    expect(f.calls[0]!.headers.Authorization).toBe(`Bearer ${SECRET}`);
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(new LlmStepAgent('llama8b', 'free', 1, f.fn).choose(observe(state, 0), legal)).rejects.toThrow(/not set/);
  });
});

describe('decision agents', () => {
  afterEach(() => vi.unstubAllEnvs());

  function decisionFetch(choice: string) {
    const calls: Record<string, unknown>[] = [];
    const fn = vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      const data = { answers: { move: { type: 'choice', choice, probabilities: { [choice]: 0.9 }, confidence: 0.9 } }, usage: { input_tokens: 300, output_tokens: 0, cost: 0.00003 } };
      return new Response(JSON.stringify(data), { status: 200 });
    });
    return { fn: fn as unknown as typeof fetch, calls };
  }

  it('sends the legal actions as the options of one choice question and plays the chosen one', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const f = decisionFetch('1');
    const d = await new DecisionStepAgent('gemini', f.fn).choose(observe(state, 0), legal);
    expect(d.action).toEqual(legal[1]);
    expect(d.usage).toEqual({ tokensIn: 300, tokensOut: 0, costUsd: 0.00003 });
    expect(d.raw).toBe('{"choice":"1","p":0.9}');
    const q = (f.calls[0]!.questions as { move: { type: string; criteria: Record<string, string> } }).move;
    expect(f.calls[0]!.model).toBe('google/gemini-decision-1');
    expect(q.type).toBe('choice');
    expect(Object.keys(q.criteria)).toHaveLength(legal.length);
  });

  it('an answer outside the options stays visibly wrong', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const d = await new DecisionStepAgent('gemini', decisionFetch('9999').fn).choose(observe(state, 0), legal);
    expect(d.action).toEqual({ invalidChoice: '9999' });
  });

  it('does not call the model when there are more legal actions than options allowed', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', SECRET);
    const f = decisionFetch('0');
    const many = Array.from({ length: MAX_DECISION_OPTIONS + 1 }, () => legal[0]!);
    const d = await new DecisionStepAgent('gemini', f.fn).choose(observe(state, 0), many);
    expect(d.action).toEqual({ tooManyOptions: MAX_DECISION_OPTIONS + 1 });
    expect(f.calls).toHaveLength(0);
  });

  it('each provider reads its own key from the environment', async () => {
    vi.stubEnv('BESPOKE_API_KEY', '');
    await expect(new DecisionStepAgent('nimble', decisionFetch('0').fn).choose(observe(state, 0), legal)).rejects.toThrow(/BESPOKE_API_KEY is not set/);
  });
});

describe('language-model prompts', () => {
  it('the state text names the seat, the map and the resources', () => {
    const text = stateText(observe(state, 0));
    expect(text).toContain('You are player 0');
    expect(text).toContain('Terrain');
    expect(text).toContain('Resources not yet harvested');
  });

  it('the typed prompt numbers every legal action and the schema allows exactly those numbers', () => {
    const p = typedPrompt(observe(state, 0), legal);
    expect(p.user).toContain(`${legal.length - 1}: `);
    const schema = choiceSchema(legal.length) as { properties: { choice: { enum: string[] } } };
    expect(schema.properties.choice.enum).toHaveLength(legal.length);
  });

  it('a free reply yields its first JSON object, even inside prose or fences', () => {
    expect(extractJson('Sure! ```json\n{"type":"capture","unit":2}\n``` done')).toEqual({ type: 'capture', unit: 2 });
    expect(extractJson('{"a":"}{"}')).toEqual({ a: '}{' });
    expect(extractJson('no json here')).toBeNull();
  });

  it('a typed choice maps to that legal action; anything else stays visibly wrong', () => {
    expect(resolveChoice('{"choice":"0"}', legal)).toEqual(legal[0]);
    expect(resolveChoice('{"choice":"9999"}', legal)).toEqual({ invalidChoice: '9999' });
    expect(resolveChoice('nonsense', legal)).toEqual({ invalidChoice: 'nonsense' });
  });
});
