/**
 * LLM7 Provider (KEYLESS) - free anonymous OpenAI-compatible gateway (llm7.io).
 * Discovers models from /v1/models, skips premium/paid models, remembers 401s.
 * Overrides: LLM7_BASE_URL, LLM7_MODEL, LLM7_API_KEY, LLM7_DISABLE=1
 */
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

/** Where the refusals live between runs — beside Joe's other durable memory. */
const BLOCKED_FILE = path.join(process.env.JOE_DATA_DIR || path.join(process.cwd(), 'data'), 'llm7-blocked.json');
function loadBlockedModels(): string[] {
    try {
        const raw = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf-8'));
        // A refusal is not forever: a gateway can open a model up again, so the
        // memory expires after a week rather than blacklisting it for good.
        if (raw && Array.isArray(raw.models) && Date.now() - Number(raw.at || 0) < 7 * 24 * 3600_000) {
            return raw.models.filter((m: any) => typeof m === 'string').slice(0, 200);
        }
    } catch { /* first run, or the file was removed on purpose */ }
    return [];
}
function saveBlockedModels(set: Set<string>): void {
    try {
        fs.mkdirSync(path.dirname(BLOCKED_FILE), { recursive: true });
        fs.writeFileSync(BLOCKED_FILE, JSON.stringify({ at: Date.now(), models: [...set] }, null, 2), 'utf-8');
    } catch { /* read-only disk — the in-memory set still serves this run */ }
}

interface LLM7ModelDescriptor {
    id: string;
    usageBasedOnly?: boolean;
    modelType?: string;
    toolsCalling?: boolean;
}

const LLM7_BASE_URL = (process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1').trim();
const MAX_LLM7_TIMEOUT_MS = 180_000;
const PREFERRED_MODELS = [
    'deepseek-v4-flash:0731', 'deepseek-v4-flash-0731', 'codestral-latest',
    'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano', 'deepseek-v3', 'deepseek-r1',
    'mistral-small-2503', 'mistral-small-3.1-24b-instruct-2503', 'qwen2.5-coder-32b-instruct',
    'qwen2.5-72b-instruct', 'gemini', 'nova-fast', 'openai-fast', 'openai', 'openai-large'
];
const PREMIUM_PREFIXES = ['claude', 'gpt-5', 'o1', 'o3', 'o4', 'grok', 'gemini-2.5-pro'];
// Image / video / audio / embedding models are NOT chat models — trying them for
// text completion returns 400 and wastes the (limited) keyless quota.
const NON_CHAT_PATTERNS = ['image', 'img', 'flux', 'dall', 'sdxl', 'stable-diffusion',
    'stable-diff', 'firefly', 'imagen', 'kontext', 'video', 'veo', 'sora', 'audio',
    'tts', 'whisper', 'voice', 'speech', 'embed', 'rerank', 'moderation'];

export class LLM7Provider {
    private client: OpenAI;
    private apiKey: string;
    private discovered: LLM7ModelDescriptor[] | null = null;
    private discoveredAt = 0;
    /**
     * Models this gateway has refused, REMEMBERED ACROSS RESTARTS.
     *
     * Measured in the field: every single run began «Inkling failed: 401,
     * Inkling-Small failed: 401, L3-8B-Lunaris failed: 401, MiMo failed: 401,
     * MiMo-Pro failed: 401» before a working model was reached — five dead
     * HTTP calls per fallback, on the exact path Joe takes when Groq's quota
     * is already gone and the user is waiting. The set was in memory only, so
     * a restart forgot every refusal and paid for the lesson again.
     */
    private blocked = new Set<string>(loadBlockedModels());
    private cooldownUntil = 0; // set when the gateway returns 429 (global rate limit)

    /**
     * LLM7's anonymous gateway rate-limits concurrent chat requests per client.
     * Joe can have several internal phases in flight after a tool completes, so
     * a per-instance lock is not enough: all provider instances in this process
     * must share the same FIFO gate.  The gate is deliberately around only the
     * completion request, not model discovery, and queued callers honour their
     * own AbortSignal instead of creating stale work after the router deadline.
     */
    private static gatewayTail: Promise<void> = Promise.resolve();

    private static async withGatewayTurn<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
        let release!: () => void;
        const turn = new Promise<void>(resolve => { release = resolve; });
        const previous = LLM7Provider.gatewayTail;
        LLM7Provider.gatewayTail = previous.then(() => turn, () => turn);

        let abortHandler: (() => void) | undefined;
        const aborted = signal
            ? new Promise<never>((_, reject) => {
                abortHandler = () => reject(signal.reason || new Error('Request was aborted'));
                if (signal.aborted) abortHandler();
                else signal.addEventListener('abort', abortHandler, { once: true });
            })
            : undefined;

        try {
            await (aborted ? Promise.race([previous, aborted]) : previous);
        } catch (error) {
            if (signal?.aborted) {
                // Keep the FIFO chain intact, but do not start work for a caller
                // whose router deadline has already expired.
                void previous.then(release, release);
            } else {
                release();
            }
            throw error;
        } finally {
            if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        }

        if (signal?.aborted) {
            release();
            throw signal.reason || new Error('Request was aborted');
        }

        try {
            return await work();
        } finally {
            release();
        }
    }

    constructor() {
        this.apiKey = (process.env.LLM7_API_KEY || 'unused').trim() || 'unused';
        this.client = new OpenAI({ apiKey: this.apiKey, baseURL: LLM7_BASE_URL });
    }

    isAvailable(): boolean {
        if (String(process.env.LLM7_DISABLE || '').trim() === '1') return false;
        if (Date.now() < this.cooldownUntil) return false; // still rate-limited
        return true;
    }

    private isPremium(id: string): boolean {
        const low = id.toLowerCase();
        return PREMIUM_PREFIXES.some(p => low.startsWith(p) || low.includes(p));
    }

    private isNonChat(id: string): boolean {
        const low = id.toLowerCase();
        return NON_CHAT_PATTERNS.some(p => low.includes(p));
    }

    private isUsableModel(model: LLM7ModelDescriptor, allowPaid = false): boolean {
        const id = String(model?.id || '').trim();
        if (!id || this.isNonChat(id)) return false;
        if (model.modelType && model.modelType.toLowerCase() !== 'chat') return false;
        if (!allowPaid && (model.usageBasedOnly === true || this.isPremium(id))) return false;
        return true;
    }

    private async getAvailableModels(timeoutMs = 8000, parentSignal?: AbortSignal): Promise<LLM7ModelDescriptor[]> {
        const now = Date.now();
        if (this.discovered && (now - this.discoveredAt) < 600000) return this.discovered;

        // Model discovery is part of the provider call, not an unbounded
        // pre-flight request. Without this boundary a hanging /models endpoint
        // bypasses both the router's Promise.race and OpenAI SDK timeout, which
        // can freeze a large planning run before the first completion starts.
        const configured = Number(process.env.LLM7_MODELS_TIMEOUT_MS);
        const discoveryMs = Number.isFinite(configured) && configured > 0
            ? Math.min(10000, Math.max(50, Math.floor(configured)))
            : Math.min(10000, Math.max(50, Math.floor(Number(timeoutMs) > 0 ? timeoutMs : 8000)));
        const controller = new AbortController();
        const abortFromParent = () => controller.abort(parentSignal?.reason);
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (parentSignal?.aborted) {
            controller.abort(parentSignal.reason);
        } else {
            parentSignal?.addEventListener('abort', abortFromParent, { once: true });
        }
        timer = setTimeout(() => controller.abort(new Error(`LLM7 model discovery exceeded ${discoveryMs}ms`)), discoveryMs);
        try {
            const res = await fetch(`${LLM7_BASE_URL}/models`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                signal: controller.signal,
            } as any);
            if (res.ok) {
                const data: any = await res.json();
                const models: LLM7ModelDescriptor[] = (data?.data || data?.models || [])
                    .map((m: any) => {
                        if (typeof m === 'string') return { id: m };
                        const id = typeof m?.id === 'string' ? m.id : '';
                        return {
                            id,
                            usageBasedOnly: typeof m?.usage_based_only === 'boolean' ? m.usage_based_only : undefined,
                            modelType: typeof m?.model_type === 'string' ? m.model_type : undefined,
                            toolsCalling: typeof m?.tools_calling === 'boolean' ? m.tools_calling : undefined,
                        };
                    })
                    .filter((m: LLM7ModelDescriptor) => Boolean(m.id));
                if (models.length > 0) { this.discovered = models; this.discoveredAt = now; return models; }
            }
        } catch { /* fall back to the bounded preferred-model list */ }
        finally {
            if (timer) clearTimeout(timer);
            parentSignal?.removeEventListener('abort', abortFromParent);
        }
        return [];
    }

    private async buildCandidates(forced?: string, timeoutMs = 8000, signal?: AbortSignal): Promise<string[]> {
        const available = await this.getAvailableModels(timeoutMs, signal);
        const out: string[] = [];
        const explicit = [forced, (process.env.LLM7_MODEL || '').trim()]
            .map(value => String(value || '').trim())
            .filter(Boolean);
        const push = (m?: string) => {
            if (m && !this.blocked.has(m) && !out.includes(m)) out.push(m);
        };
        const pushDescriptor = (descriptor?: LLM7ModelDescriptor, allowPaid = false) => {
            if (descriptor && this.isUsableModel(descriptor, allowPaid)) push(descriptor.id);
        };

        if (available.length > 0) {
            const byId = new Map(available.map(model => [model.id, model]));
            // A configured model is an explicit user choice, but it still must
            // exist in the live catalogue. This prevents stale defaults such as
            // gpt-4.1-mini from consuming the whole timeout before a real model
            // is attempted. Explicit paid models remain opt-in only.
            for (const modelId of explicit) pushDescriptor(byId.get(modelId), true);

            for (const preferred of PREFERRED_MODELS) {
                pushDescriptor(byId.get(preferred), false);
            }

            // Prefer models advertising tool calling because Joe's engineering
            // loop uses structured tool calls, then preserve the gateway order.
            for (const descriptor of [...available].sort((a, b) =>
                Number(b.toolsCalling === true) - Number(a.toolsCalling === true))) {
                pushDescriptor(descriptor, false);
            }
        } else {
            // Discovery itself can be unavailable. In that case retain the
            // historical bounded fallback list; the completion call remains the
            // source of truth and records the actual provider error.
            for (const modelId of explicit) push(modelId);
            for (const preferred of PREFERRED_MODELS) push(preferred);
        }

        /**
         * A BLOCKLIST THAT EMPTIES THE LIST IS WORSE THAN NO BLOCKLIST.
         *
         * The memory of refusals is per-model and lasts a week, and `push`
         * above obeys it without exception. So a gateway that refuses
         * everything for one bad hour — expired anonymous quota, a proxy in
         * the way — writes every candidate into the file, and from then on
         * this function returns an EMPTY list: no request is made, no error is
         * produced by any attempt, and Joe loses a whole provider to a stale
         * file until the week runs out.
         *
         * That is not hypothetical. `data/llm7-blocked.json` on the machine
         * this was written on holds all fourteen models of the previous
         * preferred list, and a probe against this exact code returns
         * «candidates: 0».
         *
         * So the memory ADVISES; it does not veto. When it has eliminated
         * everything, the catalogue's own usable models are tried anyway — and
         * failing that, the preferred list. A wrong guess costs one request and
         * rewrites the memory honestly; an empty list costs the provider.
         */
        if (out.length === 0) {
            for (const descriptor of available) {
                if (this.isUsableModel(descriptor, false) && !out.includes(descriptor.id)) out.push(descriptor.id);
            }
            for (const preferred of PREFERRED_MODELS) if (!out.includes(preferred)) out.push(preferred);
        }

        return out.slice(0, 6);
    }

    async chatComplete(
        messages: any[],
        model?: string,
        tools?: any[],
        options?: { timeoutMs?: number; signal?: AbortSignal; maxCompletionTokens?: number }
    ): Promise<string> {
        const timeoutMs = Number(options?.timeoutMs) > 0
            ? Math.min(MAX_LLM7_TIMEOUT_MS, Math.max(1000, Math.floor(Number(options?.timeoutMs))))
            : 30000;
        const candidates = await this.buildCandidates(model, timeoutMs, options?.signal);
        if (options?.signal?.aborted) {
            throw options.signal.reason || new Error('Request was aborted');
        }
        let lastErr: any = null;
        const body = (m: string): any => {
            const b: any = {
                model: m,
                messages: messages.map(msg => ({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) })),
                temperature: 0.7,
                max_tokens: Number(options?.maxCompletionTokens) > 0
                    ? Math.min(12000, Math.max(256, Math.floor(Number(options?.maxCompletionTokens))))
                    : 4096,
            };
            if (tools && tools.length > 0) {
                b.tools = tools.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.inputSchema || { type: 'object', properties: {} } } }));
                b.tool_choice = 'auto';
            }
            return b;
        };
        for (const m of candidates) {
            if (options?.signal?.aborted) {
                throw options.signal.reason || new Error('Request was aborted');
            }
            try {
                // The gateway client is reached through `as any`, and an `any`
                // argument infers the generic as `unknown` — which made every
                // read off the completion a type error. Pinned explicitly.
                const completion = await LLM7Provider.withGatewayTurn<any>(options?.signal, () =>
                    (this.client.chat.completions.create as any)(
                        body(m),
                        { timeout: timeoutMs, signal: options?.signal }
                    )
                );
                const message = completion.choices[0]?.message;
                if (message?.tool_calls && message.tool_calls.length > 0) return JSON.stringify({ type: 'tool_calls', tool_calls: message.tool_calls });
                const content = message?.content || '';
                if (content && content.length >= 2) return content;
                lastErr = new Error('LLM7 empty response');
            } catch (error: any) {
                lastErr = error;
                if (options?.signal?.aborted) throw error;
                const status = error?.status || 0;
                if (status === 401 || status === 402 || status === 403) {
                    this.blocked.add(m);
                    saveBlockedModels(this.blocked);
                }
                if (status === 429) {
                    // Global rate limit — remember the cooldown so the router skips
                    // LLM7 entirely (via isAvailable) instead of retrying every model.
                    const retry = /retry after (\d+)/i.exec(String(error?.message || ''));
                    const secs = retry ? Math.min(parseInt(retry[1], 10), 900) : 60;
                    this.cooldownUntil = Date.now() + secs * 1000;
                    console.warn(`[LLM7] rate-limited (429). Cooling down ${secs}s and falling back to other providers.`);
                    break;
                }
                console.warn(`[LLM7] model "${m}" failed: ${status || error.message}`);
            }
        }
        // «unknown error» is what this said whenever the loop never ran, which
        // is precisely the case a reader most needs named. An error that cannot
        // be acted on is a failure report with the evidence removed.
        throw new Error(lastErr?.message
            ? `LLM7 keyless gateway failed: ${lastErr.message}`
            : `LLM7 keyless gateway failed: no candidate model was reachable (${candidates.length} tried)`);
    }
}

export const llm7Provider = new LLM7Provider();

/**
 * Exported so the gate that guards the refusal memory can build the exact
 * blocklist that once emptied the candidate list, instead of copying the names
 * into the test and drifting the moment a model is added here.
 */
export const PREFERRED_MODELS_FOR_TEST: readonly string[] = PREFERRED_MODELS;
