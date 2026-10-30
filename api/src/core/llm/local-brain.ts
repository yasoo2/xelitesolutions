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

/**
 * Vision models small enough for a CPU laptop to answer with BEFORE the
 * timeout. llava:latest (7B) was installed on the user's machine and still
 * timed out at 180s — heavy eyes are treated as absent for warm-up and
 * auto-pull decisions. Mirrors FAST_VISION_ID in shared/vision.ts.
 */
const FAST_VISION = /moondream|minicpm|llava-phi/i;

const state: LocalBrainState = {
    available: false,
    host: null,
    models: [],
    chatModel: null,
    codeModel: null,
    detectedAt: 0,
};

/** Normalize an Ollama URL or host into the native root used by /api/tags. */
function normalizeOllamaHost(raw: string): string | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    try {
        const u = new URL(withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol);
        if (!/^https?:$/i.test(u.protocol) || !u.host) return null;
        // Strip any /v1 (or other) path — /api/tags lives at the root.
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
}

/**
 * Candidate Ollama endpoints, ordered from explicit configuration to the
 * standard local daemon. The last candidate makes local discovery work on a
 * clean install where no Joe-specific environment variable was exported.
 */
function ollamaCandidates(): string[] {
    const candidates = [
        normalizeOllamaHost(process.env.LOCAL_LLM_BASE_URL || ''),
        normalizeOllamaHost(process.env.OLLAMA_HOST || ''),
        'http://127.0.0.1:11434',
    ].filter((host): host is string => Boolean(host));
    return [...new Set(candidates)];
}

/** Derive the first configured Ollama host without probing the network. */
function ollamaHost(): string | null {
    return ollamaCandidates()[0] || null;
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
    const candidates = ollamaCandidates();
    state.host = candidates[0] || null;
    state.available = false;
    state.models = [];
    state.chatModel = null;
    state.codeModel = null;
    state.detectedAt = Date.now();

    for (const host of candidates) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs));
        try {
            const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal }).catch(() => null);
            if (!res || !res.ok) continue;

            const data: any = await res.json().catch(() => ({}));
            const models: string[] = Array.isArray(data?.models)
                ? data.models.map((m: any) => String(m?.name || m?.model || '')).filter(Boolean)
                : [];

            // A responding daemon is still useful diagnostic state even when it
            // has no models; keep probing only when the endpoint is unavailable.
            state.host = host;
            state.models = models;
            state.available = models.length > 0;
            state.detectedAt = Date.now();
            if (models.length === 0) continue;

            // Make the discovered daemon visible to LocalProvider. Explicit
            // LOCAL_LLM_BASE_URL always wins; otherwise use the native root and
            // let LocalProvider append /v1 for its OpenAI-compatible client.
            if (!String(process.env.LOCAL_LLM_BASE_URL || '').trim()) {
                process.env.LOCAL_LLM_BASE_URL = host;
            }

            // Strongest coding model (auto-upgrades to e.g. qwen2.5-coder:32b on a GPU box).
            state.codeModel = [...models].sort((a, b) => codeScore(b) - codeScore(a))[0] || null;
            // Fastest reasonable chat model.
            state.chatModel = [...models].sort((a, b) => chatScore(b) - chatScore(a))[0] || null;

            // Only fill in env defaults the user hasn't set explicitly.
            if (!String(process.env.LOCAL_LLM_MODEL || '').trim() && state.codeModel) {
                process.env.LOCAL_LLM_MODEL = state.codeModel;
            }
            return getLocalBrainState();
        } catch {
            // Try the next candidate; unavailable local inference must remain a
            // recorded diagnostic state, never a reason to skip the whole mesh.
        } finally {
            clearTimeout(timer);
        }
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
/**
 * HOW SLOW IS THIS MACHINE, REALLY?
 *
 * The router gave every local call the same guessed leash — 25 seconds for an
 * internal planning prompt. On the user's laptop qwen2.5-coder:7b never
 * answered inside it, so EVERY internal call timed out, the local brain was
 * paused for ten then twenty minutes, the whole load moved to Groq, and the
 * daily quota died — after which a keyless gateway answered his builds. The
 * leash was never measured against the machine it runs on.
 *
 * The warm-up already loads the model; it now TIMES that load and publishes
 * the number, so the leash can follow the hardware instead of a guess.
 */
let _warmupMs = 0;
export function localWarmupMs(): number { return _warmupMs; }

export async function warmUpLocalBrain(): Promise<void> {
    const host = state.host || ollamaHost();
    if (!host) return;
    const models = new Set<string>();
    if (state.codeModel) models.add(state.codeModel);
    if (state.chatModel) models.add(state.chatModel);
    const envModel = String(process.env.LOCAL_LLM_MODEL || '').trim();
    if (envModel) models.add(envModel);
    // The FAST vision model stays warm too (moondream is ~1.7GB resident —
    // affordable). Cold-loading eyes at question time is part of why llava
    // burned its entire timeout before producing a word. Heavy vision models
    // (llava 7B+) are deliberately NOT pinned: on a 16GB laptop that would
    // evict the chat/code models the user talks to every minute.
    // A CPU-only machine must not keep the vision model resident beside the
    // coding model: both Ollama workers compete for the same cores and turn a
    // short artifact generation into a timeout. Vision remains installed and
    // is loaded on demand by the vision path; opt in to boot pinning when the
    // machine has enough memory/CPU for concurrent models.
    const warmVision = String(process.env.JOE_VISION_WARMUP || '0') === '1';
    if (warmVision) {
        const fastEyes = state.models.find(m => FAST_VISION.test(m));
        if (fastEyes) models.add(fastEyes);
    }
    if (models.size === 0) return;

    for (const model of models) {
        const startedAt = Date.now();
        try {
            const res = await fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt: 'hi', stream: false, keep_alive: -1, options: { num_predict: 1 } }),
            }).catch(() => null);
            // The CHAT/CODE model's own warm-up is the honest yardstick — the
            // vision model's load says nothing about a planning call.
            if (res?.ok && (model === state.chatModel || model === state.codeModel)) {
                _warmupMs = Math.max(_warmupMs, Date.now() - startedAt);
                console.info(`[LocalBrain] ⏱️ ${model} answered a one-token prompt in ${_warmupMs}ms — the router sizes its patience from this.`);
            }
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
    // ALWAYS say what the eyes situation is. A silent early-return here left
    // the user reading a boot log that answered nothing — vision state is now
    // one explicit line in every single boot.
    const eyes = state.models.filter(m => VISION.test(m));
    const fastEyes = eyes.find(m => FAST_VISION.test(m));
    if (fastEyes) {
        console.info(`[LocalBrain] 👁️ vision model already installed: ${fastEyes} — attached images are analyzed locally.`);
        return;
    }
    const host = state.host;
    if (eyes.length) {
        // Having ONLY a heavy vision model is the field failure this line
        // answers: llava:latest was installed and still timed out at 180s on
        // the user's CPU — eyes that never finish are no eyes. moondream is
        // pulled alongside it and, being FAST, gets tried first from now on.
        console.info(`[LocalBrain] 👁️ vision model installed (${eyes[0]}) but it is too heavy for a CPU to answer in time — pulling moondream (~1.7GB) in the background as the fast local eyes…`);
    } else {
        console.info('[LocalBrain] no vision model installed — pulling moondream (~1.7GB) in the background so attached images can be analyzed offline…');
    }
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
                void warmUpLocalBrain();     // load the new eyes into RAM now, not at question time
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
            ? `Local brain unavailable: no Ollama models detected at ${state.host} (using keyless free AI mesh).`
            : 'Local brain unavailable: no reachable Ollama host detected (using keyless free AI mesh).';
    }
    // Warm up in the background — don't block server readiness.
    void warmUpLocalBrain();
    // …and make sure the brain has EYES (background pull, never blocks).
    ensureLocalVisionModel();
    return `Local brain ready: ${state.models.length} model(s) — chat=${state.chatModel}, code=${state.codeModel}. Warming up in background.`;
}
