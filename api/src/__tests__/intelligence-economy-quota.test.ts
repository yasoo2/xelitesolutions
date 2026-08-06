/**
 * THE DAY THE QUOTA DIED BECAUSE WE WERE IMPATIENT.
 *
 * His log, in order:
 *
 *     [LocalBrain] ⏱️ qwen2.5-coder:7b answered a one-token prompt in 2661ms
 *                     — the router sizes its patience from this.
 *     💰 internal reasoning → local brain first (daily quota reserved for the final answer)
 *     Local (Auto) failed or timed out: TIMEOUT
 *     🧠 local brain PAUSED for 20m — 3 consecutive timeouts
 *     ⏭️ skipping the local brain (paused 589s more) — going straight to the mesh.
 *     🔄 Attempting provider: Groq (Free)... ✅
 *     [Groq] API call failed: 429 — Rate limit reached …
 *
 * Two faults, in sequence.
 *
 * The leash for internal reasoning was `one-token warm-up × 6`. A one-token
 * probe says how fast the model STARTS, not how long it takes to write a page
 * of planning JSON, so a 7B model on a CPU was given 25 seconds, timed out,
 * and was declared dead — twice.
 *
 * And once it was "dead", every internal call went to the very quota the line
 * above says is being reserved for the final answer, until 429.
 */
import {
    internalLeashMs,
    localLeashState,
    noteInternalLeashTimeout,
    noteLocalDuration,
    resetLocalBrainBreaker,
} from '../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';

const ROUTER = () => fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');

describe('the patience is measured from this machine, and it learns', () => {
    beforeEach(() => resetLocalBrainBreaker());

    it('never gives a local model less than thirty seconds to think', () => {
        expect(internalLeashMs(0)).toBeGreaterThanOrEqual(30_000);
        // His exact warm-up: 1491ms × 6 = 8.9s, which used to floor at 25s.
        expect(internalLeashMs(1491)).toBeGreaterThanOrEqual(30_000);
    });

    it('a slow starter buys more patience, not less', () => {
        expect(internalLeashMs(12_000)).toBeGreaterThan(internalLeashMs(2_000));
    });

    it('and never waits absurdly long', () => {
        expect(internalLeashMs(600_000)).toBeLessThanOrEqual(120_000);
    });

    it('a timeout raises the floor — being wrong costs one call, not a day', () => {
        const before = internalLeashMs(1491);
        noteInternalLeashTimeout(before);
        const after = internalLeashMs(1491);
        expect(after).toBeGreaterThan(before);
        expect(after).toBeLessThanOrEqual(120_000);
    });

    it('and keeps raising it until the model gets its chance', () => {
        let leash = internalLeashMs(1491);
        for (let i = 0; i < 5; i++) { noteInternalLeashTimeout(leash); leash = internalLeashMs(1491); }
        expect(leash).toBe(120_000);
    });

    it('what the machine really takes sets the wait once it answers', () => {
        noteLocalDuration(40_000);
        expect(internalLeashMs(1491)).toBeGreaterThanOrEqual(60_000);
        expect(localLeashState().observedMs).toBe(40_000);
    });

    it('a fast machine is not slowed down by one slow call', () => {
        noteLocalDuration(40_000);
        for (let i = 0; i < 6; i++) noteLocalDuration(3_000);
        expect(localLeashState().observedMs).toBeLessThan(10_000);
        expect(internalLeashMs(1491)).toBe(30_000);   // back to the floor
    });

    it('and a reset forgets what it learned', () => {
        noteLocalDuration(40_000);
        noteInternalLeashTimeout(90_000);
        resetLocalBrainBreaker();
        expect(localLeashState()).toEqual({ observedMs: 0, floorMs: 0, leashMs: 30_000 });
    });

    it('the router asks for the measured leash, not warm-up × 6', () => {
        const src = ROUTER();
        expect(src).toMatch(/timeoutValue = Math\.min\(timeoutValue, internalLeashMs\(/);
        expect(src).not.toMatch(/Math\.max\(25_000, Math\.round\(measured \* 6\)\)/);
    });

    it('and records how long the local call really took', () => {
        const src = ROUTER();
        expect(src).toMatch(/if \(p\.name === 'Local \(Auto\)'\) noteLocalDuration\(Date\.now\(\) - attemptStartedAt\);/);
    });

    it('and blames its own patience before it blames the engine', () => {
        const src = ROUTER();
        const at = src.indexOf("if (p.name === 'Local (Auto)' && /TIMEOUT/i.test(");
        const block = src.slice(at, at + 500);
        expect(block.indexOf('noteInternalLeashTimeout')).toBeLessThan(block.indexOf('noteLocalBrainTimeout'));
    });
});

describe('a paused local brain does not spend the answer\'s quota', () => {
    it('internal reasoning pushes Groq to the END of the mesh', () => {
        const src = ROUTER();
        expect(src).toMatch(/if \(internalCall && !isLocalBrainReady\(\)\) \{/);
        const at = src.indexOf('if (internalCall && !isLocalBrainReady()) {');
        const block = src.slice(at, at + 700);
        expect(block).toMatch(/findIndex\(p => p\.name === 'Groq \(Free\)'\)/);
        expect(block).toMatch(/meshProviders\.push\(groq\)/);
    });

    it('but never removes it — the keyless mesh may all be down', () => {
        const at = ROUTER().indexOf('if (internalCall && !isLocalBrainReady()) {');
        const block = ROUTER().slice(at, at + 700);
        expect(block).toMatch(/meshProviders\.length > 1/);
        expect(block).not.toMatch(/splice\([^)]*\)\s*;\s*\}/);   // not dropped on the floor
    });

    it('and says so, so the economy is visible in the log', () => {
        expect(ROUTER()).toMatch(/local brain unavailable — internal reasoning goes to the keyless mesh/);
    });

    it('while a FINAL answer still goes to Groq first', () => {
        // The reorder is gated on internalCall; the user-facing answer is
        // exactly what the quota is being saved for.
        const src = ROUTER();
        const at = src.indexOf('if (internalCall && !isLocalBrainReady()) {');
        expect(src.slice(at - 400, at)).not.toMatch(/!internalCall && !isLocalBrainReady/);
    });
});

describe('the polled endpoints stop drowning the terminal', () => {
    const APP = () => fs.readFileSync(path.join(__dirname, '..', 'api', 'app.ts'), 'utf-8');

    it('git/status and health are skipped when they are boring', () => {
        expect(APP()).toMatch(/const QUIET_POLLS = \/\^\\\/api\\\/\(git\\\/status\|health\)\$\//);
        expect(APP()).toMatch(/skip: \(req, res\) => QUIET_POLLS\.test\(/);
    });

    it('but a failing poll still prints — that is news', () => {
        expect(APP()).toMatch(/res\.statusCode < 400/);
    });

    it('and it matches originalUrl, because the mount prefix is gone by then', () => {
        // `req.path` reads «/health» at response time: `app.use('/api', apiRouter)`
        // strips its prefix, and the first version of this silenced nothing.
        const src = APP();
        const at = src.indexOf('skip: (req, res) => QUIET_POLLS.test(');
        expect(src.slice(at, at + 200)).toMatch(/originalUrl/);
        expect(src.slice(at, at + 200)).not.toMatch(/\)\.path\b/);
    });
});
