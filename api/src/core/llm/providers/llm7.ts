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

const LLM7_BASE_URL = (process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1').trim();
const PREFERRED_MODELS = [
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
    private discovered: string[] | null = null;
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

    private async getAvailableModels(): Promise<string[]> {
        const now = Date.now();
        if (this.discovered && (now - this.discoveredAt) < 600000) return this.discovered;
        try {
            const res = await fetch(`${LLM7_BASE_URL}/models`, { headers: { 'Authorization': `Bearer ${this.apiKey}` } } as any);
            if (res.ok) {
                const data: any = await res.json();
                const ids: string[] = (data?.data || data?.models || [])
                    .map((m: any) => (typeof m === 'string' ? m : m?.id))
                    .filter((x: any) => typeof x === 'string' && x.length > 0);
                if (ids.length > 0) { this.discovered = ids; this.discoveredAt = now; return ids; }
            }
        } catch { /* fall back */ }
        return [];
    }

    private async buildCandidates(forced?: string): Promise<string[]> {
        const available = await this.getAvailableModels();
        const out: string[] = [];
        const ok = (m?: string) => !!m && !this.blocked.has(m) && !out.includes(m);
        const push = (m?: string) => { if (ok(m)) out.push(m as string); };
        push(forced);
        push((process.env.LLM7_MODEL || '').trim());
        if (available.length > 0) {
            for (const p of PREFERRED_MODELS) if (available.includes(p)) push(p);
            for (const a of available) if (!this.isPremium(a) && !this.isNonChat(a)) push(a);
        } else {
            for (const p of PREFERRED_MODELS) push(p);
        }
        return out.slice(0, 6);
    }

    async chatComplete(
        messages: any[],
        model?: string,
        tools?: any[],
        options?: { timeoutMs?: number; signal?: AbortSignal; maxCompletionTokens?: number }
    ): Promise<string> {
        const candidates = await this.buildCandidates(model);
        const timeoutMs = Number(options?.timeoutMs) > 0
            ? Math.min(120000, Math.max(1000, Math.floor(Number(options?.timeoutMs))))
            : 30000;
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
            try {
                const completion = await (this.client.chat.completions.create as any)(
                    body(m),
                    { timeout: timeoutMs, signal: options?.signal }
                );
                const message = completion.choices[0]?.message;
                if (message?.tool_calls && message.tool_calls.length > 0) return JSON.stringify({ type: 'tool_calls', tool_calls: message.tool_calls });
                const content = message?.content || '';
                if (content && content.length >= 2) return content;
                lastErr = new Error('LLM7 empty response');
            } catch (error: any) {
                lastErr = error;
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
        throw new Error(`LLM7 keyless gateway failed: ${lastErr?.message || 'unknown error'}`);
    }
}

export const llm7Provider = new LLM7Provider();
