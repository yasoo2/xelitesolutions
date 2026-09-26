import crypto from 'crypto';

/** Policy/state for the existing router; this module never calls a provider. */
export type ProviderState = 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'AUTH_FAILED' | 'TEMPORARILY_UNAVAILABLE';
type Circuit = { state: ProviderState; retryAt: number; probingUntil: number; lease?: number };
let nextProbeLease = 0;
const MAX_CIRCUITS = 512;
let capacityRetryAt = 0;
const circuits = new Map<string, Circuit>();
const identityKey = crypto.randomBytes(32);
export const PROVIDER_RECOVERY_TIMEOUT_MS = 30_000;

const aliases: Record<string, string> = {
    google: 'gemini', claude: 'anthropic', xai: 'grok',
    'Groq (Free)': 'groq', 'Gemini (Free)': 'gemini', 'Cerebras (Free)': 'cerebras',
    'OpenRouter (Free)': 'openrouter', 'Mistral (Free)': 'mistral', 'HuggingFace (Free)': 'huggingface',
    'OpenAI (Direct)': 'openai', 'Local (Auto)': 'local', 'LLM7 (Keyless)': 'llm7',
    'DuckAI (Keyless)': 'duckai', 'DeepSeek (Pollinations)': 'pollinations',
    'Pollinations (Backup)': 'pollinations', 'Pollinations (Forced)': 'pollinations',
};
const hosts: Record<string, string> = {
    groq: 'api.groq.com', gemini: 'generativelanguage.googleapis.com', cerebras: 'api.cerebras.ai',
    openrouter: 'openrouter.ai', mistral: 'api.mistral.ai', huggingface: 'router.huggingface.co',
    openai: 'api.openai.com', anthropic: 'api.anthropic.com', grok: 'api.x.ai', deepseek: 'api.deepseek.com',
};
const envKeys: Record<string, string[]> = {
    groq: ['GROQ_API_KEY'], gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'], cerebras: ['CEREBRAS_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'], mistral: ['MISTRAL_API_KEY'],
    huggingface: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'], openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'], grok: ['XAI_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'],
};
function canonicalProvider(provider: string): string { return aliases[provider] || provider.toLowerCase(); }

export function aiCostPolicy(): 'free_only' | 'allow_paid' {
    return String(process.env.AI_COST_POLICY || '').trim().toLowerCase() === 'allow_paid' ? 'allow_paid' : 'free_only';
}

/** Unknown endpoints and paid model variants need the operator's explicit paid policy. */
export function providerAllowedByCost(provider: string, model = '', baseUrl = ''): boolean {
    if (aiCostPolicy() === 'allow_paid') return true;
    const name = canonicalProvider(provider);
    if (provider === 'DeepSeek (Pollinations)' && String(process.env.DEEPSEEK_API_KEY || '').trim()) return false;
    if (name === 'local') baseUrl = baseUrl || String(process.env.LOCAL_LLM_BASE_URL || '').trim();
    if (baseUrl) {
        try {
            const url = new URL(baseUrl);
            if (url.username || url.password || url.search || url.hash) return false;
            if (name === 'local') return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
            if (url.protocol !== 'https:' || url.hostname !== hosts[name]) return false;
        } catch { return false; }
    }
    if (name === 'openrouter') return /:free$/i.test(model || 'google/gemma-2-9b-it:free');
    if (name === 'llm7' && (String(process.env.LLM7_API_KEY || '').trim() && process.env.LLM7_API_KEY !== 'unused'
        || process.env.LLM7_BASE_URL && process.env.LLM7_BASE_URL.replace(/\/$/, '') !== 'https://api.llm7.io/v1')) return false;
    if (['local', 'llm7', 'duckai', 'pollinations'].includes(name)) return true;
    // Keys do not prove free billing. Operators may attest an existing vendor's
    // free account; request/model context cannot change this policy.
    const approved = String(process.env.AI_FREE_PROVIDERS || '').split(',').map(value => value.trim().toLowerCase());
    return ['groq', 'gemini', 'cerebras', 'mistral', 'huggingface'].includes(name) && approved.includes(name);
}

/** A quota belongs to a provider credential, never to an individual model. */
export function providerCircuitKey(provider: string, config?: {
    apiKey?: string; baseUrl?: string; workspaceId?: string; userId?: string; sessionId?: string;
}): string {
    const name = canonicalProvider(provider);
    const keys = (envKeys[name] || []).map(key => String(process.env[key] || '').trim()).filter(Boolean);
    const credential = config ? String(config.apiKey || '').trim() : keys[0] || '';
    const usesEnvironment = !config || keys.includes(credential);
    const scope = usesEnvironment ? 'environment' : JSON.stringify([
        config?.userId || '', config?.workspaceId || '',
        config?.userId || config?.workspaceId ? '' : config?.sessionId || '',
    ]);
    let endpoint = hosts[name] || name;
    if (config?.baseUrl) {
        try { endpoint = new URL(config.baseUrl).host.toLowerCase(); }
        catch { endpoint = config.baseUrl; }
    }
    // No raw credentials or guessable hashes are persisted, logged, or exposed.
    return crypto.createHmac('sha256', identityKey).update(JSON.stringify([name, endpoint, scope, credential])).digest('hex');
}

export function providerFailureState(error: unknown): ProviderState | null {
    const raw = error as any;
    const code = Number(raw?.status || raw?.statusCode || raw?.response?.status || raw?.error?.status || 0);
    const message = [raw?.message, raw?.code, raw?.status, raw?.error?.message, raw?.error?.code,
        raw?.error?.status, raw?.response?.data?.error?.message, typeof error === 'string' ? error : ''].filter(Boolean).join(' ');
    if (code === 401 || code === 403 || /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid[_ -]?api[_ -]?key/i.test(message)) return 'AUTH_FAILED';
    if (/quota[\s_-]*(?:exhausted|exceeded)|insufficient_quota|resource_exhausted|tokens? per day|\bTPD\b|daily (?:token )?(?:quota|limit)/i.test(message)) return 'QUOTA_EXHAUSTED';
    if (code === 429 || /\b429\b|rate.?limit|too many requests/i.test(message)) return 'RATE_LIMITED';
    if (code >= 500 || /timeout|timed out|fetch failed|ECONN|temporarily unavailable|service unavailable/i.test(message)) return 'TEMPORARILY_UNAVAILABLE';
    return null; // Bad input/model errors do not disable an otherwise healthy provider.
}

export function providerRetryAfterMs(error: unknown, now = Date.now()): number | undefined {
    const raw = error as any;
    const headers = raw?.headers || raw?.response?.headers;
    const header = headers?.get?.('retry-after') ?? headers?.['retry-after'];
    if (header != null) {
        const seconds = Number(header);
        const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(header)) - now;
        if (Number.isFinite(ms) && ms > 0) return Math.min(ms, Number.MAX_SAFE_INTEGER - now);
    }
    const text = String(raw?.message || error || '');
    const seconds = text.match(/retry[-\s]?after\s*:?\s*(\d+(?:\.\d+)?)\s*(?:seconds?|s)?/i);
    if (seconds) return Math.min(Number(seconds[1]) * 1000, Number.MAX_SAFE_INTEGER - now) || undefined;
    const hms = text.match(/try again in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
    if (hms) return Math.min((Number(hms[1] || 0) * 3600 + Number(hms[2] || 0) * 60 + Number(hms[3])) * 1000, Number.MAX_SAFE_INTEGER - now) || undefined;
    return undefined;
}

export function recordProviderCircuitFailure(key: string, error: unknown, now = Date.now()): void {
    const state = providerFailureState(error);
    if (!state) return;
    const fallback = state === 'QUOTA_EXHAUSTED' ? 30 * 60_000 : state === 'AUTH_FAILED' ? 5 * 60_000 : 60_000;
    const previous = circuits.get(key);
    const retryAt = now + (providerRetryAfterMs(error, now) || fallback);
    if (previous && ['RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(previous.state) && previous.retryAt > now
        && (retryAt <= previous.retryAt || !['RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(state))) return;
    if (!circuits.has(key) && circuits.size >= MAX_CIRCUITS) {
        for (const [savedKey, saved] of circuits) {
            if (saved.retryAt <= now && !saved.probingUntil) circuits.delete(savedKey);
        }
        if (circuits.size >= MAX_CIRCUITS) {
            // Preserve active quotas. Saturation fails closed until the longest
            // outstanding reset, instead of evicting an active circuit.
            capacityRetryAt = Math.max(capacityRetryAt, now + (providerRetryAfterMs(error, now) || fallback),
                ...Array.from(circuits.values(), saved => saved.retryAt));
            return;
        }
    }
    circuits.set(key, { state, retryAt, probingUntil: previous?.probingUntil || 0, ...(previous?.lease ? { lease: previous.lease } : {}) });
}

export function providerCircuitStatus(key: string, now = Date.now()): { blocked: boolean; state?: ProviderState; retryAt?: number } {
    const circuit = circuits.get(key);
    return circuit ? { blocked: circuit.retryAt > now || circuit.probingUntil > 0, state: circuit.state, retryAt: circuit.retryAt }
        : capacityRetryAt > now ? { blocked: true, state: 'TEMPORARILY_UNAVAILABLE', retryAt: capacityRetryAt } : { blocked: false };
}

/** Only one concurrent request may probe a circuit after its reset window. */
export function claimProviderCircuit(key: string, now = Date.now()): { allowed: boolean; probe: boolean; lease?: number } {
    const circuit = circuits.get(key);
    if (!circuit) return { allowed: capacityRetryAt <= now, probe: false };
    if (circuit.retryAt > now || circuit.probingUntil > 0) return { allowed: false, probe: false };
    circuit.probingUntil = now + PROVIDER_RECOVERY_TIMEOUT_MS;
    circuit.lease = ++nextProbeLease;
    return { allowed: true, probe: true, lease: circuit.lease };
}
export function markProviderCircuitHealthy(key: string, lease?: number, now = Date.now()): void {
    const circuit = circuits.get(key);
    // Another in-flight request may have just reported a newer quota window.
    if (circuit && (circuit.retryAt > now || circuit.lease && circuit.lease !== lease)) return;
    circuits.delete(key);
}
export function releaseProviderCircuitProbe(key: string, lease?: number): void {
    const circuit = circuits.get(key);
    if (circuit && lease && circuit.lease === lease) { circuit.probingUntil = 0; delete circuit.lease; }
}
export function resetProviderContinuityForTests(): void { circuits.clear(); capacityRetryAt = 0; }

/** Evidence retains diagnoses, never credential text echoed by an upstream error. */
export function safeProviderError(error: unknown, customKey?: string): string {
    let message = String((error as any)?.message || error || '');
    const secrets = [customKey, ...Object.entries(process.env)
        .filter(([key]) => /(?:API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)).map(([, value]) => value)]
        .filter((value): value is string => typeof value === 'string' && value.length >= 4);
    for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
    return message.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]').slice(0, 240);
}
