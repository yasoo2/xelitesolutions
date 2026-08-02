/**
 * Local Brain — intelligence layer on top of the local (Ollama) provider.
 *
 * Solves three things the user asked for, all FREE / keyless:
 *   1. AUTO-DETECT  — query Ollama's /api/tags and discover which models are
 *      actually installed, so Joe never tries to use a model that isn't there.
 *   2. WARM-UP      — on boot, send one tiny request so the model is resident in
 *      RAM before the user's first message (kills the slow cold-load).
 *   3. TASK ROUTING — pick a fast small model for chat and the strongest coding
 *      model for build tasks, from whatever is installed (and auto-upgrade to a
 *      bigger model when Joe later runs on a GPU server — no code change needed).
 *
 * Everything is best-effort: if Ollama is not running, every function degrades
 * quietly and Joe falls back to the keyless provider mesh.
 */

export interface LocalBrainState {
    available: boolean;
    host: string | null;
    models: string[];
    chatModel: string | null;
    codeModel: string | null;
    detectedAt: number;
}

const state: LocalBrainState = {
    available: false,
    host: null,
    models: [],
    chatModel: null,
    codeModel: null,
    detectedAt: 0,
};

/** Derive Ollama's native host (http://localhost:11434) from LOCAL_LLM_BASE_URL. */
function ollamaHost(): string | null {
    const raw = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
    if (!raw) return null;
    try {
        const u = new URL(raw.endsWith('/') ? raw.slice(0, -1) : raw);
        // Strip any /v1 (or other) path — /api/tags lives at the root.
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
}

/** True once we've detected a running Ollama with at least one model. */
export function isLocalBrainReady(): boolean {
    return state.available && state.models.length > 0;
}

export function getLocalBrainState(): LocalBrainState {
    return { ...state, models: [...state.models] };
}

/**
 * Rank a coding model: bigger parameter count wins, coder-tuned models win over
 * general ones. Returns a comparable score (higher = better for coding).
 */
function codeScore(name: string): number {
    const n = name.toLowerCase();
    let score = 0;
    if (/coder|code|deepseek|starcoder|codestral/.test(n)) score += 1000;
    if (/qwen/.test(n)) score += 200;               // qwen2.5-coder is excellent
    const b = n.match(/(\d+(?:\.\d+)?)\s*b/);         // parameter size, e.g. "7b", "32b"
    if (b) score += Math.min(parseFloat(b[1]), 200) * 10;
    return score;
}

/** Rank a chat model: SMALLER + instruct-tuned wins (we want speed for chat). */
function chatScore(name: string): number {
    const n = name.toLowerCase();
    let score = 0;
    const b = n.match(/(\d+(?:\.\d+)?)\s*b/);
    const size = b ? parseFloat(b[1]) : 8;
    // Prefer a small-but-not-tiny model: 3-8B is the sweet spot on a CPU laptop.
    score += Math.max(0, 100 - Math.abs(size - 4) * 8);
    if (/instruct|chat|llama|qwen|gemma|mistral|phi/.test(n)) score += 30;
    return score;
}

/**
 * Detect installed Ollama models. Populates `state` and, when the env vars are
 * not explicitly set, chooses sensible defaults so LOCAL_LLM_MODEL always points
 * at a model that actually exists.
 */
export async function detectLocalModels(timeoutMs = 4000): Promise<LocalBrainState> {
    const host = ollamaHost();
    state.host = host;
    if (!host) { state.available = false; return getLocalBrainState(); }

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal }).catch(() => null);
        clearTimeout(t);
        if (!res || !res.ok) { state.available = false; return getLocalBrainState(); }

        const data: any = await res.json().catch(() => ({}));
        const models: string[] = Array.isArray(data?.models)
            ? data.models.map((m: any) => String(m?.name || m?.model || '')).filter(Boolean)
            : [];

        state.models = models;
        state.available = models.length > 0;
        state.detectedAt = Date.now();

        if (models.length > 0) {
            // Strongest coding model (auto-upgrades to e.g. qwen2.5-coder:32b on a GPU box).
            state.codeModel = [...models].sort((a, b) => codeScore(b) - codeScore(a))[0] || null;
            // Fastest reasonable chat model.
            state.chatModel = [...models].sort((a, b) => chatScore(b) - chatScore(a))[0] || null;

            // Only fill in env defaults the user hasn't set explicitly.
            if (!String(process.env.LOCAL_LLM_MODEL || '').trim() && state.codeModel) {
                process.env.LOCAL_LLM_MODEL = state.codeModel;
            }
        }
    } catch {
        state.available = false;
    }
    return getLocalBrainState();
}

/**
 * Pick the best installed local model for a given task type. Coding/build tasks
 * get the coder model; everything else gets the fast chat model. Falls back to
 * LOCAL_LLM_MODEL when detection hasn't run.
 */
export function pickLocalModel(taskType?: string): string | undefined {
    const isCode = taskType === 'code_generation' || taskType === 'data_analysis';
    if (isLocalBrainReady()) {
        const chosen = isCode ? state.codeModel : state.chatModel;
        if (chosen) return chosen;
    }
    const env = String(process.env.LOCAL_LLM_MODEL || '').trim();
    return env || undefined;
}

/**
 * Warm up the chosen model so the first real request is fast. Sends a 1-token
 * generation via Ollama's native /api/generate with keep_alive so the model
 * stays resident. Completely non-blocking / best-effort.
 */
export async function warmUpLocalBrain(): Promise<void> {
    const host = state.host || ollamaHost();
    if (!host) return;
    const models = new Set<string>();
    if (state.codeModel) models.add(state.codeModel);
    if (state.chatModel) models.add(state.chatModel);
    const envModel = String(process.env.LOCAL_LLM_MODEL || '').trim();
    if (envModel) models.add(envModel);
    if (models.size === 0) return;

    for (const model of models) {
        try {
            await fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt: 'hi', stream: false, keep_alive: -1, options: { num_predict: 1 } }),
            }).catch(() => null);
        } catch { /* best-effort */ }
    }
}

/**
 * LOCAL EYES, INSTALLED WHILE NOBODY WAITS.
 *
 * Field-measured: the user's Groq plan carries ZERO vision models and the
 * daily quota was spent — so «حلل هذه الصورة» had no eyes anywhere. Ollama
 * is already running on that machine; moondream (~1.7GB, 1.8B params) gives
 * it vision that works offline, quota-free, on a CPU laptop. Pulled ONCE,
 * in the background, never blocking startup; every later image analysis is
 * then fully local. Disable with JOE_VISION_AUTOPULL=0. A failed pull only
 * logs — the mesh still answers text as before.
 */
export function ensureLocalVisionModel(): void {
    if (String(process.env.JOE_VISION_AUTOPULL || '1') === '0') return;
    if (!state.available || !state.host) return;
    const VISION = /llava|moondream|bakllava|minicpm|vision|[-_.]vl\b|vl[-_.:]|qwen.*vl/i;
    if (state.models.some(m => VISION.test(m))) return;   // eyes already installed
    const host = state.host;
    console.info('[LocalBrain] no vision model installed — pulling moondream (~1.7GB) in the background so attached images can be analyzed offline…');
    // Ollama pulls models over its OWN HTTP API — no shell, no child process.
    // (The first draft spawned `ollama pull` and the ExecutionEnforcer rightly
    // blocked the whole server from starting: direct process execution is
    // architecturally banned here. The registry download happens inside the
    // Ollama daemon either way; this is the same pull, minus the violation.)
    void (async () => {
        try {
            const res = await fetch(`${host}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'moondream', stream: false }),
            });
            const body: any = await res.json().catch(() => ({}));
            if (res.ok && String(body?.status || '').includes('success')) {
                console.info('[LocalBrain] ✅ moondream installed — attached images will now be analyzed locally.');
                await detectLocalModels();   // refresh the model list
            } else {
                console.warn(`[LocalBrain] moondream pull answered ${res.status} (${String(body?.error || body?.status || '')}) — run manually: ollama pull moondream`);
            }
        } catch (e: any) {
            console.warn(`[LocalBrain] moondream pull failed (${e?.message || e}) — run manually: ollama pull moondream`);
        }
    })();
}

/**
 * Full boot sequence: detect models, then warm them up in the background.
 * Returns a short human-readable summary for the startup log.
 */
export async function initLocalBrain(): Promise<string> {
    await detectLocalModels();
    if (!isLocalBrainReady()) {
        return state.host
            ? `Local brain: no Ollama models detected at ${state.host} (using keyless free AI mesh).`
            : 'Local brain: LOCAL_LLM_BASE_URL not set (using keyless free AI mesh).';
    }
    // Warm up in the background — don't block server readiness.
    void warmUpLocalBrain();
    // …and make sure the brain has EYES (background pull, never blocks).
    ensureLocalVisionModel();
    return `Local brain ready: ${state.models.length} model(s) — chat=${state.chatModel}, code=${state.codeModel}. Warming up in background.`;
}
