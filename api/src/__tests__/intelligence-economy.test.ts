/**
 * THE INTELLIGENCE ECONOMY — the daily quota belongs to the USER'S ANSWERS.
 *
 * Field-measured: Groq's 100k tokens/day died by mid-session, and the
 * biggest spender was Joe's own INTERNAL reasoning — intent parsing,
 * planning, tool selection, narration — calls the user never reads. By
 * evening every visible reply fell to the weakest keyless provider.
 *
 * The contract locked here:
 *   1. context.purpose === 'internal' exists and routes to the local brain
 *      first — skipping the custom (Groq) route AND the Groq happy path
 *      while the local brain is available.
 *   2. The internal mesh keeps Local FIRST even when a cloud key exists.
 *   3. A 429 quota error pauses the custom route for the window the error
 *      itself names (customRouteCooldownUntil), instead of re-hammering.
 *   4. The known internal call sites are actually marked 'internal'.
 */
import fs from 'fs';
import path from 'path';
import { retryAfterMsFrom, customRouteCooldownUntil } from '../core/llm/intelligent-router';
import { detectLocalModels } from '../core/llm/local-brain';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('the router understands internal vs answer', () => {
    const router = () => read('core', 'llm', 'intelligent-router.ts');

    it('purpose plumbing exists and gates the custom route', () => {
        const src = router();
        expect(src).toContain("(context as any)?.purpose || '') === 'internal'");
        expect(src).toContain('internalCall && isLocalBrainReady()');
        expect(src).toContain('daily quota reserved for the final answer');
    });

    it('the Groq happy path also yields to the local brain for internal calls', () => {
        const src = router();
        expect(src).toMatch(/!isProviderCoolingDown\('Groq \(Free\)'\)\s*\n\s*&& !\(internalCall && isLocalBrainReady\(\)\)/);
    });

    it('internal calls keep Local FIRST in the mesh even with a cloud key', () => {
        expect(router()).toContain('if (hasFastCloud && !internalCall)');
    });

    it('Auto selection keeps Ollama ahead of a cloud happy path and fallback mesh', () => {
        const src = router();
        expect(src).toMatch(/const autoLocalPreferred = .*provider.*=== 'auto'.*hasLocal/);
        expect(src).toMatch(/&& !autoLocalPreferred\)/);
        expect(src).toContain('LOCAL_BRAIN_FIRST || autoLocalPreferred');
        expect(src).toContain("p.name === 'Local (Auto)' && isLocalBrainOpen()");
        expect(src).toContain('skipping the local brain (paused');
        expect(src).toContain('Math.max(measuredLeash, autoPlanningFloor)');
        expect(src).toContain('(LOCAL_BRAIN_FIRST || autoLocalPreferred)');
        expect(src).toContain('(requestedTimeout ? Math.min(autoPlanningLeash, requestedTimeout) : autoPlanningLeash)');
        expect(src).toContain('? (requestedTimeout ? Math.min(autoPlanningLeash, requestedTimeout) : autoPlanningLeash)');
        expect(src).toContain(': Math.min(timeoutValue, measuredLeash)');
        expect(src).toContain("detail: 'local_ready_after_warmup'");
    });

    it('advanced analysis respects local-first mode instead of bypassing the router', () => {
        const src = router();
        expect(src).toContain("const localFirst = LOCAL_BRAIN_FIRST || !!String(process.env.LOCAL_LLM_BASE_URL || '').trim()");
        expect(src).toContain('if (!hasGroq && !localFirst)');
        expect(src).toContain('internalCall: true');
        expect(src).toMatch(/\? await routeToModel\([\s\S]*?\)\s*:\s*await callGroq\(analyst/);
    });

    it('039 records every provider attempt and reserves Ollama before keyless Offline fallbacks', () => {
        const src = router();
        expect(src).toContain('export interface ProviderAttempt');
        expect(src).toContain('const providerAttempts: ProviderAttempt[] = [];');
        expect(src).toContain('context.providerAttempts = providerAttempts');
        expect(src).toContain("recordProviderAttempt(p.name, false, e?.message || e)");
        expect(src).toContain("recordProviderAttempt(p.name, true)");
        expect(src).toContain("p.name === 'LLM7 (Keyless)'");
        expect(src).toContain("p.name === 'Local (Auto)'");
        expect(src).toContain('Ollama/Local (Auto) is reserved before keyless');
        expect(src).toContain('providerAttempts=${JSON.stringify(providerAttempts)}');
    });

    it('039 keeps Gemini explicitly in the configured provider chain', () => {
        const src = router();
        expect(src).toContain("name: 'Gemini (Free)'");
        expect(src).toContain('geminiProvider.chatComplete');
    });

    it('a quota 429 pauses the custom route for the window the error names', () => {
        const src = router();
        expect(src).toContain('export const customRouteCooldownUntil');
        expect(src).toMatch(/status === 429 \|\| \/rate limit\|tokens per day\|TPD\/i\.test\(msg\)/);
        expect(src).toContain('customRouteCooldownUntil.set(routeKey, Date.now() + waitMs)');
        // …and the entry gate actually honours the pause.
        expect(src).toContain('quotaPausedUntil > Date.now()');
    });
});

describe('local Ollama discovery is explicit and portable', () => {
    const savedEnv = () => ({
        baseUrl: process.env.LOCAL_LLM_BASE_URL,
        ollamaHost: process.env.OLLAMA_HOST,
        model: process.env.LOCAL_LLM_MODEL,
    });
    const restoreEnv = (env: ReturnType<typeof savedEnv>) => {
        if (env.baseUrl === undefined) delete process.env.LOCAL_LLM_BASE_URL;
        else process.env.LOCAL_LLM_BASE_URL = env.baseUrl;
        if (env.ollamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = env.ollamaHost;
        if (env.model === undefined) delete process.env.LOCAL_LLM_MODEL;
        else process.env.LOCAL_LLM_MODEL = env.model;
    };

    it('discovers the standard local daemon when Joe-specific variables are absent', async () => {
        const env = savedEnv();
        const originalFetch = global.fetch;
        delete process.env.LOCAL_LLM_BASE_URL;
        delete process.env.OLLAMA_HOST;
        delete process.env.LOCAL_LLM_MODEL;
        const fetchMock = jest.fn(async (url: string) => {
            if (url === 'http://127.0.0.1:11434/api/tags') {
                return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5-coder:3b' }] }) } as any;
            }
            return { ok: false, json: async () => ({}) } as any;
        });
        global.fetch = fetchMock as any;
        try {
            const state = await detectLocalModels(50);
            expect(state.available).toBe(true);
            expect(state.host).toBe('http://127.0.0.1:11434');
            expect(state.codeModel).toBe('qwen2.5-coder:3b');
            expect(process.env.LOCAL_LLM_BASE_URL).toBe('http://127.0.0.1:11434');
            expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.anything());
        } finally {
            global.fetch = originalFetch;
            restoreEnv(env);
        }
    });

    it('returns an explicit unavailable state when no candidate daemon responds', async () => {
        const env = savedEnv();
        const originalFetch = global.fetch;
        delete process.env.LOCAL_LLM_BASE_URL;
        delete process.env.OLLAMA_HOST;
        const fetchMock = jest.fn(async () => { throw new Error('connection refused'); });
        global.fetch = fetchMock as any;
        try {
            const state = await detectLocalModels(10);
            expect(state.available).toBe(false);
            expect(state.host).toBe('http://127.0.0.1:11434');
            expect(state.models).toEqual([]);
            expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.anything());
        } finally {
            global.fetch = originalFetch;
            restoreEnv(env);
        }
    });
});

describe('the internal call sites are actually marked', () => {
    const cases: Array<[string, string[]]> = [
        ['core/intelligence/IntentParser.ts', ['purpose: \'internal\'']],
        ['core/agents/JoeAgent-V2.ts', ['purpose: \'internal\'']],
        ['core/orchestrator/PlanningEngine.ts', ['purpose: \'internal\'']],
        ['orchestration/AgentOrchestrator.ts', ['purpose: \'internal\'']],
    ];
    for (const [file, needles] of cases) {
        it(`${file} spends local tokens, not the daily quota`, () => {
            const src = read(...file.split('/'));
            for (const n of needles) expect(src).toContain(n);
        });
    }
    it('PlanningEngine marks all three of its model calls', () => {
        const src = read('core', 'orchestrator', 'PlanningEngine.ts');
        expect((src.match(/purpose: 'internal'/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('retryAfterMsFrom reads the real Groq TPD message', () => {
    it('parses the daily-quota format from the field log', () => {
        const ms = retryAfterMsFrom(
            'Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 99577, Requested 804. Please try again in 5m29.184s.');
        expect(ms).toBeGreaterThan(5 * 60_000);
        expect(ms).toBeLessThan(6 * 60_000);
    });
    it('the cooldown map is a real, importable seam for the wire proof', () => {
        customRouteCooldownUntil.set('test:route', Date.now() + 1000);
        expect(customRouteCooldownUntil.get('test:route')).toBeGreaterThan(Date.now());
        customRouteCooldownUntil.delete('test:route');
    });
});

/**
 * THE INTERNAL LEASH — field log, batch 26: a planning call (internal) landed
 * while Ollama was busy describing a screenshot with moondream, and the run
 * froze for the FULL local window (up to 3 minutes) before falling to the
 * mesh. Internal reasoning gets a leash: at most 25s on the local brain,
 * then the mesh takes over. User-facing calls keep the generous window.
 */
describe('internal calls never wait the full local window', () => {
    /**
     * These used to pin the literal «25_000». That number was a GUESS, and on
     * the user's laptop it meant every internal call timed out, the local
     * brain was paused for ten then twenty minutes, and the whole load moved
     * to Groq until the daily quota died. The leash is now measured from the
     * machine's own warm-up — so the test states the PROPERTY (bounded, and
     * bounded inside the Local branch only) instead of the old constant.
     */
    it('the router leashes the Local timeout for internal purpose', () => {
        const src = read('core', 'llm', 'intelligent-router.ts');
        expect(src).toContain('if (internalCall) {');
        expect(src).toMatch(/localWarmupMs/);
        expect(src).toContain('const measuredLeash = internalLeashMs');
        expect(src).toContain('const autoPlanningLeash');
    });
    it('the leash is sized by a REAL measurement of this machine', () => {
        const brain = read('core', 'llm', 'local-brain.ts');
        expect(brain).toMatch(/export function localWarmupMs/);
        expect(brain).toMatch(/_warmupMs = Math\.max\(_warmupMs, Date\.now\(\) - startedAt\)/);
        /**
         * …and the FORMULA moved on, because the old one was measured wrong in
         * the field: `warm-up × 6` with a 25s floor read his 1491ms one-token
         * probe as «25 seconds is plenty», and a 7B model on a CPU cannot write
         * a page of planning JSON in 25 seconds. Every internal call timed out,
         * the breaker opened, and the load moved to Groq until 429.
         *
         * The property is now stated against the real function rather than a
         * copy of the constant: half a minute at minimum, more for a slow
         * starter, never absurd — and it LEARNS from what the machine does.
         */
        const { internalLeashMs, noteInternalLeashTimeout, resetLocalBrainBreaker } =
            require('../core/llm/intelligent-router');
        resetLocalBrainBreaker();
        expect(internalLeashMs(0)).toBeGreaterThanOrEqual(30_000);
        expect(internalLeashMs(1491)).toBeGreaterThanOrEqual(30_000);
        expect(internalLeashMs(20_000)).toBeGreaterThan(internalLeashMs(2_000));
        expect(internalLeashMs(600_000)).toBeLessThanOrEqual(120_000);
        const before = internalLeashMs(1491);
        noteInternalLeashTimeout(before);
        expect(internalLeashMs(1491)).toBeGreaterThan(before);
        resetLocalBrainBreaker();
    });
    it('the leash lives INSIDE the Local (Auto) branch — cloud timeouts untouched', () => {
        const src = read('core', 'llm', 'intelligent-router.ts');
        const local = src.indexOf("p.name === 'Local (Auto)'", src.indexOf('for (const p of orderedProviders)'));
        const leash = src.indexOf('const measuredLeash = internalLeashMs');
        const keyless = src.indexOf("if (p.name === 'LLM7 (Keyless)' || p.name === 'DuckAI (Keyless)')", local);
        expect(local).toBeGreaterThan(0);
        expect(leash).toBeGreaterThan(local);
        expect(leash).toBeLessThan(keyless);
    });
});

/**
 * LLM7 never re-tries a model that answered 401/402/403 — the dead-model
 * memory that stops the «gpt-5-chat 401 → try again next call» loop.
 */
describe('LLM7 remembers dead models', () => {
    it('401/402/403 add the model to the blocked set, and candidates skip it', () => {
        const src = read('core', 'llm', 'providers', 'llm7.ts');
        expect(src).toContain('private blocked = new Set<string>(loadBlockedModels())');
        expect(src).toMatch(/status === 401 \|\| status === 402 \|\| status === 403\) \{/);
        expect(src).toMatch(/this\.blocked\.add\(m\);/);
        expect(src).toMatch(/!this\.blocked\.has\(m\)/);
    });

    /**
     * …and it remembers them ACROSS RESTARTS. Measured in the field: every run
     * began with the same five 401s (Inkling, Inkling-Small, L3-8B-Lunaris,
     * MiMo, MiMo-Pro) because the set lived in memory only — five dead calls
     * on the exact path Joe takes when Groq's quota is already gone.
     */
    it('the refusals survive a restart, and expire after a week', () => {
        const src = read('core', 'llm', 'providers', 'llm7.ts');
        expect(src).toMatch(/llm7-blocked\.json/);
        expect(src).toMatch(/saveBlockedModels\(this\.blocked\)/);
        expect(src).toMatch(/7 \* 24 \* 3600_000/);
    });
});
