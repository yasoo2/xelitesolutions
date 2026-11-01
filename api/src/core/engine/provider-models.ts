/**
 * THE MODELS EACH PROVIDER REALLY OFFERS, FOR THE PROVIDER BUTTON.
 *
 * Measured on 2026-11-01: the provider panel had one free-text «Model ID»
 * field, and Claude's held a model retired long ago (claude-3-opus-20240229).
 * The owner's rule: every provider offers a list, and the user picks the
 * right model for it.
 *
 * The list comes from the provider itself whenever it can: its own models
 * endpoint (OpenAI-compatible providers), the models installed in the local
 * Ollama, the priced Claude models the engine runs. The key is the user's
 * typed key or the server's key for that provider, and it never leaves the
 * server. When the provider cannot be asked (no key, no network), a short
 * suggested list stands in, and the answer says so.
 */
import { CLAUDE_MODELS } from './anthropic';

export interface ProviderModels {
    models: string[];
    /** 'live': the provider's own list. 'catalog': suggestions, the provider was not asked. */
    source: 'live' | 'catalog';
    /** Why the provider was not asked, or what went wrong when it was. */
    note?: string;
}

const BASE_URL: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    mistral: 'https://api.mistral.ai/v1',
    deepseek: 'https://api.deepseek.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    grok: 'https://api.x.ai/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

const KEY_ENV: Record<string, string> = {
    openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', cerebras: 'CEREBRAS_API_KEY', mistral: 'MISTRAL_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY', openrouter: 'OPENROUTER_API_KEY', grok: 'XAI_API_KEY', gemini: 'GEMINI_API_KEY',
};

/** Suggestions when the provider cannot be asked. The provider's own list replaces them whenever it answers. */
const SUGGESTED: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'],
    cerebras: ['llama-3.3-70b', 'llama3.1-8b', 'gpt-oss-120b', 'qwen-3-32b'],
    mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    openrouter: ['moonshotai/kimi-k2:free', 'deepseek/deepseek-chat', 'openai/gpt-4o-mini'],
    grok: ['grok-3', 'grok-3-mini'],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};

const PLACEHOLDER_KEYS = new Set(['', 'auto-mode', 'free-mode', 'free', 'dummy', 'ollama', 'server-key']);

export interface ProviderModelsDeps {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}

function catalog(provider: string, note: string): ProviderModels {
    return { models: SUGGESTED[provider] ? [...SUGGESTED[provider]] : [], source: 'catalog', note };
}

export async function providerModels(
    input: { provider?: unknown; apiKey?: unknown; baseUrl?: unknown },
    deps: ProviderModelsDeps = {},
): Promise<ProviderModels> {
    const provider = String(input?.provider || '').trim().toLowerCase();
    const env = deps.env ?? process.env;
    const doFetch = deps.fetch ?? fetch;
    const timeoutMs = deps.timeoutMs ?? 8_000;

    if (provider === 'anthropic' || provider === 'claude') return { models: [...CLAUDE_MODELS], source: 'live' };

    if (provider === 'local' || provider === 'ollama') {
        try {
            const res = await doFetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok) return { models: [], source: 'catalog', note: `the local model server answered ${res.status}` };
            const body: any = await res.json();
            const models = (Array.isArray(body?.models) ? body.models : []).map((m: any) => String(m?.name || '').trim()).filter(Boolean);
            return { models, source: 'live', ...(models.length ? {} : { note: 'no model is installed in the local model server' }) };
        } catch (e: any) {
            return { models: [], source: 'catalog', note: `the local model server is not running (${String(e?.name || e?.message || e).slice(0, 80)})` };
        }
    }

    const base = String(input?.baseUrl || '').trim().replace(/\/+$/, '') || BASE_URL[provider];
    if (!base) return { models: [], source: 'catalog', note: `no models address is known for ${provider || 'this provider'}` };
    const typed = String(input?.apiKey || '').trim();
    const key = (!PLACEHOLDER_KEYS.has(typed) && !/[^\x00-\x7F]/.test(typed) ? typed : '') || String(env[KEY_ENV[provider]] || '').trim();
    if (!key) return catalog(provider, `${provider} needs its key to list its models; these are suggestions`);
    try {
        const res = await doFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return catalog(provider, `${provider} refused the list (${res.status}); these are suggestions`);
        const body: any = await res.json();
        const ids = (Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [])
            .map((m: any) => String(m?.id || m?.name || '').replace(/^models\//, '').trim())
            .filter(Boolean);
        const unique = [...new Set<string>(ids)].sort((a, b) => a.localeCompare(b));
        return unique.length ? { models: unique, source: 'live' } : catalog(provider, `${provider} listed no models; these are suggestions`);
    } catch (e: any) {
        return catalog(provider, `${provider} could not be reached (${String(e?.name || e?.message || e).slice(0, 80)}); these are suggestions`);
    }
}
