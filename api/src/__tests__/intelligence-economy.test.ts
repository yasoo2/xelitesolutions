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

    it('a quota 429 pauses the custom route for the window the error names', () => {
        const src = router();
        expect(src).toContain('export const customRouteCooldownUntil');
        expect(src).toMatch(/status === 429 \|\| \/rate limit\|tokens per day\|TPD\/i\.test\(msg\)/);
        expect(src).toContain('customRouteCooldownUntil.set(routeKey, Date.now() + waitMs)');
        // …and the entry gate actually honours the pause.
        expect(src).toContain('quotaPausedUntil > Date.now()');
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
    it('the router caps the Local timeout for internal purpose', () => {
        const src = read('core', 'llm', 'intelligent-router.ts');
        expect(src).toContain('if (internalCall) {');
        expect(src).toMatch(/internalCall\)\s*\{\s*\n\s*timeoutValue = Math\.min\(timeoutValue, 25_000\)/);
    });
    it('the leash lives INSIDE the Local (Auto) branch — cloud timeouts untouched', () => {
        const src = read('core', 'llm', 'intelligent-router.ts');
        const local = src.indexOf("p.name === 'Local (Auto)'", src.indexOf('for (const p of orderedProviders)'));
        const leash = src.indexOf('timeoutValue = Math.min(timeoutValue, 25_000)');
        const keyless = src.indexOf("p.name === 'LLM7 (Keyless)'", local);
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
        expect(src).toContain('private blocked = new Set<string>()');
        expect(src).toMatch(/status === 401 \|\| status === 402 \|\| status === 403\) this\.blocked\.add\(m\)/);
        expect(src).toMatch(/!this\.blocked\.has\(m\)/);
    });
});
