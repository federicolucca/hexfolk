// Language-model agents over the OpenRouter chat API. The key is read from the OPENROUTER_API_KEY
// environment variable only; it is never written to a log, a file or an error message.
import type { Observation } from '../src/core/engine';
import type { Decision, StepAgent, Usage } from '../src/core/bench/harness';
import { choiceSchema, extractJson, freePrompt, resolveChoice, typedPrompt } from '../src/core/bench/prompt';
import type { Action } from '../src/core/state';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOKENS = { free: 200, typed: 20 } as const;
const RETRIES = 3;

export type LlmMode = 'free' | 'typed';

/** The models in the benchmark: small and cheap, all with JSON-schema output on OpenRouter. */
export const MODELS: Readonly<Record<string, string>> = {
  llama8b: 'meta-llama/llama-3.1-8b-instruct',
  ministral3b: 'mistralai/ministral-3b-2512',
};

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  return key;
}

export class LlmStepAgent implements StepAgent {
  readonly name: string;
  readonly alias: string;
  readonly mode: LlmMode;
  private readonly seed: number;
  private readonly fetchFn: typeof fetch;
  constructor(alias: string, mode: LlmMode, seed: number, fetchFn: typeof fetch = fetch) {
    this.alias = alias;
    this.mode = mode;
    this.seed = seed;
    this.fetchFn = fetchFn;
    if (!MODELS[alias]) throw new Error(`unknown model ${alias}; known: ${Object.keys(MODELS).join(', ')}`);
    this.name = `${alias}-${mode}`;
  }

  async choose(view: Observation, legal: Action[]): Promise<Decision> {
    const prompt = this.mode === 'free' ? freePrompt(view) : typedPrompt(view, legal);
    const body: Record<string, unknown> = {
      model: MODELS[this.alias],
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      seed: this.seed,
      max_tokens: MAX_TOKENS[this.mode],
      usage: { include: true },
    };
    if (this.mode === 'typed') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'choice', strict: true, schema: choiceSchema(legal.length) } };
      body.provider = { require_parameters: true };
    }
    const data = await this.post(body);
    const raw = data.choices?.[0]?.message?.content ?? '';
    const usage: Usage = { tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0, costUsd: data.usage?.cost ?? 0 };
    const action = this.mode === 'free' ? extractJson(raw) : resolveChoice(raw, legal);
    return { action, raw, usage };
  }

  /** Retries network and server errors (not the model's answers); a reply that never comes is an agent error. */
  private async post(body: Record<string, unknown>): Promise<ChatResponse> {
    const key = apiKey();
    let last = '';
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const res = await this.fetchFn(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'hexfolk-bench' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as ChatResponse;
        if (res.ok && !data.error) return data;
        last = `HTTP ${res.status}: ${data.error?.message ?? 'no message'}`;
        if (res.status < 500 && res.status !== 429) break;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error(`OpenRouter call failed: ${last}`);
  }
}
