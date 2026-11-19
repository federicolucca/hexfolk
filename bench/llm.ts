// Language-model agents over the OpenRouter chat API. The key is read from the OPENROUTER_API_KEY
// environment variable only; it is never written to a log, a file or an error message.
import type { Observation } from '../src/core/engine';
import type { Decision, StepAgent, Usage } from '../src/core/bench/harness';
import { choiceSchema, decisionRequest, extractJson, freePrompt, resolveChoice, typedPrompt } from '../src/core/bench/prompt';
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

/** Local models served by Ollama (OpenAI-compatible API) at $OLLAMA_URL, e.g. http://host:11434. No key, no cost. */
export const LOCAL_MODELS: Readonly<Record<string, string>> = {
  localllama8b: 'llama3.1:8b',
  localqwen7b: 'qwen2.5:7b',
};

function ollamaUrl(): string {
  const url = process.env.OLLAMA_URL;
  if (!url) throw new Error('OLLAMA_URL is not set');
  return url.replace(/\/+$/, '');
}

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
    if (!MODELS[alias] && !LOCAL_MODELS[alias]) throw new Error(`unknown model ${alias}; known: ${[...Object.keys(MODELS), ...Object.keys(LOCAL_MODELS)].join(', ')}`);
    this.name = `${alias}-${mode}`;
  }

  async choose(view: Observation, legal: Action[]): Promise<Decision> {
    const prompt = this.mode === 'free' ? freePrompt(view) : typedPrompt(view, legal);
    const body: Record<string, unknown> = {
      model: MODELS[this.alias] ?? LOCAL_MODELS[this.alias],
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
      if (!LOCAL_MODELS[this.alias]) body.provider = { require_parameters: true };
    }
    const data = await this.post(body);
    const raw = data.choices?.[0]?.message?.content ?? '';
    const usage: Usage = { tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0, costUsd: data.usage?.cost ?? 0 };
    const action = this.mode === 'free' ? extractJson(raw) : resolveChoice(raw, legal);
    return { action, raw, usage };
  }

  /** Retries network and server errors (not the model's answers); a reply that never comes is an agent error. */
  private async post(body: Record<string, unknown>): Promise<ChatResponse> {
    const local = Boolean(LOCAL_MODELS[this.alias]);
    const endpoint = local ? `${ollamaUrl()}/v1/chat/completions` : ENDPOINT;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Title': 'hexfolk-bench' };
    if (!local) headers.Authorization = `Bearer ${apiKey()}`;
    let last = '';
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers,
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

// Decision agents (protocol v2): a native decision model ("System One" API) scores the legal actions
// as the options of one choice question and the agent plays the most likely one. No text is
// generated, so a reply can only name one of the options or fail.
interface DecisionProvider {
  endpoint: string;
  model: string;
  keyVar: string;
}

export const DECISION_MODELS: Readonly<Record<string, DecisionProvider>> = {
  gemini: { endpoint: 'https://openrouter.ai/api/v1/systemone', model: 'google/gemini-decision-1', keyVar: 'OPENROUTER_API_KEY' },
  nimble: { endpoint: 'https://api.bespokelabs.ai/v1/systemone', model: 'nimble-v4-max', keyVar: 'BESPOKE_API_KEY' },
  // Open-weights Nimble on the local Ollama server ($OLLAMA_URL); the model tag is set when the server is up.
  localnimble: { endpoint: 'ollama:/v1/systemone', model: process.env.OLLAMA_NIMBLE_TAG ?? 'nimble', keyVar: '' },
};

/** Most options one choice question may carry; a position with more is not sent and is logged as malformed. */
export const MAX_DECISION_OPTIONS = 255;

interface DecisionResponse {
  detail?: unknown;
  answers?: Record<string, { choice?: string; probabilities?: Record<string, number> }>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

export class DecisionStepAgent implements StepAgent {
  readonly name: string;
  private readonly provider: DecisionProvider;
  private readonly fetchFn: typeof fetch;
  constructor(alias: string, fetchFn: typeof fetch = fetch) {
    const provider = DECISION_MODELS[alias];
    if (!provider) throw new Error(`unknown decision model ${alias}; known: ${Object.keys(DECISION_MODELS).join(', ')}`);
    this.provider = provider;
    this.fetchFn = fetchFn;
    this.name = `${alias}-decision`;
  }

  async choose(view: Observation, legal: Action[]): Promise<Decision> {
    // One legal action leaves nothing to decide (some APIs refuse a one-option question): play it, no call.
    if (legal.length === 1) return { action: legal[0], raw: 'forced: one legal action' };
    if (legal.length > MAX_DECISION_OPTIONS) return { action: { tooManyOptions: legal.length }, raw: `not sent: ${legal.length} legal actions` };
    const body = { model: this.provider.model, ...decisionRequest(view, legal) };
    const data = await this.post(body);
    const answer = data.answers?.move;
    const choice = answer?.choice ?? '';
    const p = answer?.probabilities?.[choice];
    const usage: Usage = { tokensIn: data.usage?.input_tokens ?? 0, tokensOut: data.usage?.output_tokens ?? 0, costUsd: data.usage?.cost ?? 0 };
    // The chosen option's probability is kept in the raw reply for the exploratory calibration measure.
    return { action: resolveChoice(JSON.stringify({ choice }), legal), raw: JSON.stringify({ choice, p }), usage };
  }

  private async post(body: Record<string, unknown>): Promise<DecisionResponse> {
    const local = this.provider.endpoint.startsWith('ollama:');
    const endpoint = local ? `${ollamaUrl()}${this.provider.endpoint.slice('ollama:'.length)}` : this.provider.endpoint;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Title': 'hexfolk-bench' };
    if (!local) {
      const key = process.env[this.provider.keyVar];
      if (!key) throw new Error(`${this.provider.keyVar} is not set`);
      headers.Authorization = `Bearer ${key}`;
    }
    let last = '';
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as DecisionResponse;
        if (res.ok && !data.error) return data;
        last = `HTTP ${res.status}: ${data.error?.message ?? (data.detail ? JSON.stringify(data.detail).slice(0, 200) : 'no message')}`;
        if (res.status < 500 && res.status !== 429) break;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error(`decision call failed: ${last}`);
  }
}
