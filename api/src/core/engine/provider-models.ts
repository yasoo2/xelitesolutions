/**
 * THE MODELS EACH PROVIDER REALLY OFFERS, FOR THE PROVIDER BUTTON.
 *
 * Measured on 2026-11-01: the provider panel had one free-text «Model ID»
 * field, and Claude's held a model retired long ago (claude-3-opus-20240229).
 * The owner's rule: every provider offers a list, and the user picks the
 * right model for it.
 *
 * The list comes from the provider itself whenever it can: its own models
 * endpoint (OpenAI-compatible providers), Anthropic's Models API for Claude
 * (the models the user's own account offers), the models installed in the
 * local Ollama. The key is the user's typed key or the server's key for that
 * provider, and it never leaves the server. When the provider cannot be
 * asked (no key, no network), a short suggested list stands in, and the
 * answer says so.
 *
 * Every note also carries a `reason` code, so the interface says it in the
 * user's language; the English `note` is for logs.
 */
import { CLAUDE_MODELS, listClaudeModels, serverClaudeKey, type ClaudeModelInfo } from './anthropic';

export type ModelsReason =
    | 'needs_key'       // the provider lists its models only with a key
    | 'refused'         // the provider refused the key (status)
    | 'unreachable'     // no answer (network, timeout)
    | 'empty'           // the provider listed nothing
    | 'no_address'      // no models address is known for this provider
    | 'local_down'      // the local model server is not running
    | 'local_empty'     // the local model server has no model installed
    | 'none_runnable';  // the Claude account offers none of the models Joe runs

export interface ProviderModels {
    models: string[];
    /** 'live': the provider's own list. 'catalog': suggestions, the provider was not asked. */
    source: 'live' | 'catalog';
    /** Why the provider was not asked, or what went wrong when it was (English, for logs). */
    note?: string;
    reason?: { code: ModelsReason; status?: number };
    /** Display names, where the provider gives them. */
    names?: Record<string, string>;
    /** Models the account offers that Joe does not run (no checked price, or a request shape it does not send). */
    unsupported?: string[];
    /** The provider marks these models as headed for retirement. */
    deprecated?: string[];
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

const KEY_ENV: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'], groq: ['GROQ_API_KEY'], cerebras: ['CEREBRAS_API_KEY'], mistral: ['MISTRAL_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'], openrouter: ['OPENROUTER_API_KEY'], grok: ['XAI_API_KEY'], gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
};

/**
 * Suggestions when the provider cannot be asked, and the order a live list is
 * shown in (these first, when the provider still serves them). The provider's
 * own list replaces them whenever it answers.
 *
 * ⛔ The previous list named models the vendors had retired, and the menu's
 * defaults were among them: grok-beta, kimi-k2:free, gemini-2.0-flash,
 * Cerebras' llama-3.3-70b, deepseek-chat
 * (audited 2026-11-02 against each vendor's models and deprecation pages, and
 * OpenRouter's live catalog). A model the vendor no longer serves cannot turn
 * green, whatever the key.
 */
const SUGGESTED: Record<string, string[]> = {
    openai: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-terra'],
    groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'qwen/qwen3.8-27b'],
    cerebras: ['gpt-oss-120b', 'qwen-3.8-27b'],
    mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
    deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
    openrouter: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
    grok: ['grok-4.7', 'grok-4.6', 'grok-4.3'],
    gemini: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon'],
};

/**
 * Models a chat cannot run on: speech, images, video, embeddings, safety
 * classifiers. A vendor's models endpoint lists them beside its chat models
 * (Groq's whisper and tts, OpenAI's embeddings and dall-e, Gemini's imagen and
 * veo, Mistral's ocr); chosen, they could only fail.
 */
const NOT_CHAT = /embed|whisper|tts\b|-tts|dall-e|gpt-image|imagen|-image|image-|veo-|\bveo\b|audio|transcribe|moderation|guard|rerank|speech|realtime|sora|\baqa\b|ocr|lyria|playai|orpheus|voxtral|babbage|davinci/i;

/** A live list in the order the panel shows it: chat models only, the recommended first. */
function chatModelsFirst(provider: string, ids: string[]): string[] {
    const chat = [...new Set(ids)].filter(id => !NOT_CHAT.test(id)).sort((a, b) => a.localeCompare(b));
    const preferred = (SUGGESTED[provider] || []).filter(id => chat.includes(id));
    //  OpenRouter serves hundreds; its free ones come first after the recommended.
    const free = provider === 'openrouter' ? chat.filter(id => /:free$/.test(id) && !preferred.includes(id)) : [];
    return [...preferred, ...free, ...chat.filter(id => !preferred.includes(id) && !free.includes(id))];
}

const PLACEHOLDER_KEYS = new Set(['', 'auto-mode', 'free-mode', 'free', 'dummy', 'ollama', 'server-key']);

export interface ProviderModelsDeps {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    /** Lists the Claude account's models (Anthropic's Models API); a test hands in a fake. */
    claudeModels?: (apiKey: string) => Promise<ClaudeModelInfo[]>;
}

function catalog(provider: string, note: string, reason: ProviderModels['reason']): ProviderModels {
    return { models: SUGGESTED[provider] ? [...SUGGESTED[provider]] : [], source: 'catalog', note, reason };
}

function typedKeyOf(raw: unknown): string {
    const typed = String(raw || '').trim();
    return !PLACEHOLDER_KEYS.has(typed) && !/[^\x00-\x7F]/.test(typed) ? typed : '';
}

/**
 * Claude: the models the account behind the key offers, asked of Anthropic.
 * Listing spends nothing. The models Joe runs are offered to choose; the
 * account's others are named as not run, never silently dropped.
 */
async function claudeModels(input: { apiKey?: unknown }, env: NodeJS.ProcessEnv, list: (apiKey: string) => Promise<ClaudeModelInfo[]>): Promise<ProviderModels> {
    const typed = typedKeyOf(input?.apiKey);
    const server = !typed && String(input?.apiKey || '').trim() === 'server-key' ? await serverClaudeKey(env) : '';
    const key = typed || (typeof server === 'string' ? server : '');
    if (!key) {
        return { models: [...CLAUDE_MODELS], source: 'catalog', note: 'Claude lists the models of your account once your key is added; these are the models Joe runs', reason: { code: 'needs_key' } };
    }
    try {
        const all = await list(key);
        const runs = all.filter(m => m.runs);
        const out: ProviderModels = {
            models: runs.map(m => m.id),
            source: 'live',
            names: Object.fromEntries(all.map(m => [m.id, m.name])),
            unsupported: all.filter(m => !m.runs).map(m => m.id),
            deprecated: all.filter(m => m.lifecycle === 'deprecated').map(m => m.id),
        };
        if (!runs.length) Object.assign(out, { note: 'the account offers none of the Claude models Joe runs', reason: { code: 'none_runnable' } });
        return out;
    } catch (e: any) {
        const status = Number(e?.status) || undefined;
        if (status) return { models: [...CLAUDE_MODELS], source: 'catalog', note: `Anthropic refused the list (${status}); these are the models Joe runs`, reason: { code: 'refused', status } };
        return { models: [...CLAUDE_MODELS], source: 'catalog', note: `Anthropic could not be reached (${String(e?.name || e?.message || e).slice(0, 80)}); these are the models Joe runs`, reason: { code: 'unreachable' } };
    }
}

export async function providerModels(
    input: { provider?: unknown; apiKey?: unknown; baseUrl?: unknown },
    deps: ProviderModelsDeps = {},
): Promise<ProviderModels> {
    const provider = String(input?.provider || '').trim().toLowerCase();
    const env = deps.env ?? process.env;
    const doFetch = deps.fetch ?? fetch;
    const timeoutMs = deps.timeoutMs ?? 8_000;

    if (provider === 'anthropic' || provider === 'claude') return claudeModels(input, env, deps.claudeModels ?? (key => listClaudeModels(key)));

    if (provider === 'local' || provider === 'ollama') {
        try {
            const res = await doFetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok) return { models: [], source: 'catalog', note: `the local model server answered ${res.status}`, reason: { code: 'refused', status: res.status } };
            const body: any = await res.json();
            const models = (Array.isArray(body?.models) ? body.models : []).map((m: any) => String(m?.name || '').trim()).filter(Boolean);
            return { models, source: 'live', ...(models.length ? {} : { note: 'no model is installed in the local model server', reason: { code: 'local_empty' as const } }) };
        } catch (e: any) {
            return { models: [], source: 'catalog', note: `the local model server is not running (${String(e?.name || e?.message || e).slice(0, 80)})`, reason: { code: 'local_down' } };
        }
    }

    const base = String(input?.baseUrl || '').trim().replace(/\/+$/, '') || BASE_URL[provider];
    if (!base) return { models: [], source: 'catalog', note: `no models address is known for ${provider || 'this provider'}`, reason: { code: 'no_address' } };
    const key = typedKeyOf(input?.apiKey) || (KEY_ENV[provider] || []).map(name => String(env[name] || '').trim()).find(Boolean) || '';
    //  OpenRouter lists its models to anyone (measured: 452, with or without a
    //  key); chatting needs a key, free models included, and the note says so.
    const publicList = provider === 'openrouter';
    if (!key && !publicList) return catalog(provider, `${provider} needs its key to list its models; these are suggestions`, { code: 'needs_key' });
    try {
        const res = await doFetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return catalog(provider, `${provider} refused the list (${res.status}); these are suggestions`, { code: 'refused', status: res.status });
        const body: any = await res.json();
        const ids = (Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [])
            .map((m: any) => String(m?.id || m?.name || '').replace(/^models\//, '').trim())
            .filter(Boolean);
        const models = chatModelsFirst(provider, ids);
        if (!models.length) return catalog(provider, `${provider} listed no chat models; these are suggestions`, { code: 'empty' });
        return key ? { models, source: 'live' }
            : { models, source: 'live', note: `${provider} lists its models to anyone; chatting needs its key, free models too`, reason: { code: 'needs_key' } };
    } catch (e: any) {
        return catalog(provider, `${provider} could not be reached (${String(e?.name || e?.message || e).slice(0, 80)}); these are suggestions`, { code: 'unreachable' });
    }
}
