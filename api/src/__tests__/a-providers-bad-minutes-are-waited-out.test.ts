/**
 * A PROVIDER'S BAD MINUTES ARE WAITED OUT, NOT TURNED INTO A FAILED RUN.
 *
 * The 500-prompt exam on Claude, 2026-11-12/13: P231 («Connection error») and
 * P394, P444 («503 credential validation failed», one incident seven minutes
 * long) ended as failed after three model calls in a row failed, with no wait
 * between them beyond the SDK's own. Here a fake provider fails the way those
 * did, and a fake clock and wait stand in for the minutes: no model is called,
 * nothing sleeps.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mapApiError } from '../core/engine/anthropic';
import { runEngine, retryAfterMs, transientModelFailure, TRANSIENT_WAITS_MS, MODEL_FAILURE_LIMIT, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import type { BrowserSession, ChatMessage, EngineEvent, EngineModel, EngineRequest, ModelStep, ProcessRegistry, ToolSchema, VerificationReport } from '../core/engine/types';

const roots: string[] = [];
function projectDir(): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-engine-waits-'));
    roots.push(dir);
    return dir;
}
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

const failure = (msg: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(msg), extra);
/** As anthropic.ts mapApiError hands them to the loop. */
const http503 = () => failure('The Claude API call failed (503): credential validation failed', { code: 'PROVIDER_FAILURE', status: 503 });
const connection = () => failure('The Claude API call failed: Connection error.', { code: 'PROVIDER_FAILURE', status: NaN });
const http400 = () => failure('The Claude API call failed (400): messages: text content blocks must be non-empty', { code: 'PROVIDER_FAILURE', status: 400 });

/** A provider that throws the given failures, then finishes the task. */
function provider(failures: Array<() => Error>) {
    let i = 0;
    const model: EngineModel = {
        label: 'fake:provider',
        vision: false,
        contextTokens: () => 64_000,
        async step(_m: ChatMessage[], _t: ToolSchema[]): Promise<ModelStep> {
            const k = i++;
            if (k < failures.length) throw failures[k]();
            return { text: 'done', toolCalls: [{ id: `c${k}`, name: 'task_finish', arguments: JSON.stringify({ summary: 'done' }) }], durationMs: 1 };
        },
    };
    return { model, calls: () => i };
}

const passing: Verifier = async () => ({ passed: true, checks: [{ id: 'requirements', status: 'passed', detail: 'ok' }], unproven: [], at: 0 } as VerificationReport);

function setup(model: EngineModel, clock: { t: number }) {
    const waits: number[] = [];
    const reg: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
        logs() { return undefined; },
        async stop() { return true; },
        list() { return []; },
        async stopAll() { /* nothing runs */ },
    };
    const browser = (): BrowserSession => ({ async open() { throw new Error('unused'); }, async act() { throw new Error('unused'); }, async screenshot() { return ''; }, async close() { /* unused */ } });
    const d: EngineDeps = {
        model, tools: [planUpdateTool, finishTool(passing)], processes: reg, browser,
        machine: { platform: 'linux', shell: 'bash' },
        now: () => clock.t,
        wait: async (ms) => { waits.push(ms); clock.t += ms; },
    };
    return { d, waits };
}

function request(dir: string, events: EngineEvent[], over: Partial<EngineRequest> = {}): EngineRequest {
    return {
        runId: 'run-waits', request: 'Build a page with a booking button', language: 'en',
        projectDir: dir, deadlineAt: 60 * 60_000, signal: new AbortController().signal,
        emit: e => events.push(e), joe: {}, ...over,
    };
}

const thoughts = (events: EngineEvent[]) => events.filter((e): e is Extract<EngineEvent, { type: 'thought' }> => e.type === 'thought').map(e => e.text);

describe('a transient provider failure is waited out', () => {
    it('three 503s in a row (P394, P444) are waited 30 s, 2 min and 5 min, and the run then delivers', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider([http503, http503, http503]);
        const { d, waits } = setup(model, clock);
        const events: EngineEvent[] = [];
        const result = await runEngine(request(projectDir(), events), d);
        expect(result.status).toBe('delivered');
        expect(waits).toEqual([...TRANSIENT_WAITS_MS]);
        expect(calls()).toBe(4);
        //  The chat says what is happening while Joe waits.
        const said = thoughts(events).filter(t => t.startsWith('⏳'));
        expect(said).toHaveLength(3);
        expect(said[0]).toMatch(/waiting 30 s, then asking again/);
        expect(said[1]).toMatch(/waiting 2 min/);
        expect(said[2]).toMatch(/waiting 5 min/);
    });

    it('the chat is told in Arabic when the user speaks Arabic', async () => {
        const clock = { t: 0 };
        const { model } = provider([connection]);
        const { d } = setup(model, clock);
        const events: EngineEvent[] = [];
        const result = await runEngine(request(projectDir(), events, { language: 'ar', replyLanguage: 'ar' }), d);
        expect(result.status).toBe('delivered');
        expect(thoughts(events).find(t => t.startsWith('⏳'))).toMatch(/أنتظر 30 ثانية ثم أعيد المحاولة/);
    });

    it('a provider still failing after every wait ends the run, saying how long Joe waited', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider(Array.from({ length: 10 }, () => connection));
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), []), d);
        expect(result.status).toBe('failed');
        expect(waits).toHaveLength(TRANSIENT_WAITS_MS.length);
        expect(calls()).toBe(TRANSIENT_WAITS_MS.length + 1);
        expect(result.reason).toMatch(/the model call failed 4 times in a row \(Joe waited 30 s, 2 min, 5 min between them\): .*Connection error/);
    });

    it('the server\'s Retry-After is waited when it asks for longer than the schedule', async () => {
        const clock = { t: 0 };
        const { model } = provider([() => failure('rate limited', { status: 429, headers: { 'retry-after': '90' } })]);
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), []), d);
        expect(result.status).toBe('delivered');
        expect(waits).toEqual([90_000]);
    });

    it('a wait that would pass the run\'s deadline ends the run now', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider([http503, http503, http503]);
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), [], { deadlineAt: 2 * 60_000 }), d);
        expect(result.status).toBe('failed');
        expect(waits).toEqual([30_000]);
        expect(calls()).toBe(2);
        expect(result.reason).toMatch(/waiting 2 min for it would pass the run's deadline/);
    });

    it('a cancel during the wait ends the run as cancelled', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider([http503, http503]);
        const ac = new AbortController();
        const { d } = setup(model, clock);
        d.wait = async () => { ac.abort(); };
        const result = await runEngine(request(projectDir(), [], { signal: ac.signal }), d);
        expect(result.status).toBe('cancelled');
        expect(calls()).toBe(1);
    });
});

describe('a refusal the provider means is not waited on', () => {
    it('a 400 fails the run after three calls, as before, with no wait', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider(Array.from({ length: 5 }, () => http400));
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), []), d);
        expect(result.status).toBe('failed');
        expect(waits).toEqual([]);
        expect(calls()).toBe(MODEL_FAILURE_LIMIT);
        expect(result.reason).toMatch(/failed 3 times in a row: .*\(400\)/);
    });

    it('a refused key ends the run at once', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider([() => failure('The Claude API refused the key (401): invalid x-api-key', { code: 'MODEL_AUTH', status: 401 })]);
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), []), d);
        expect(result.status).toBe('failed');
        expect(waits).toEqual([]);
        expect(calls()).toBe(1);
        expect(result.reason).toMatch(/cannot go on \(MODEL_AUTH\)/);
    });

    it('the budget guard\'s refusal ends the run at once, never waited on', async () => {
        const clock = { t: 0 };
        const { model, calls } = provider([() => failure('the engine budget for this run is spent', { code: 'ENGINE_BUDGET_EXHAUSTED', status: 503 })]);
        const { d, waits } = setup(model, clock);
        const result = await runEngine(request(projectDir(), []), d);
        expect(result.status).toBe('failed');
        expect(waits).toEqual([]);
        expect(calls()).toBe(1);
    });
});

describe('which failures are transient', () => {
    it('rate limits, server trouble and dropped connections are; the client\'s own errors and a refused connection are not', () => {
        for (const status of [408, 429, 500, 502, 503, 504, 529]) expect(transientModelFailure({ status, message: 'x' })).toBe(true);
        for (const status of [400, 401, 403, 404, 413, 422]) expect(transientModelFailure({ status, message: 'x' })).toBe(false);
        expect(transientModelFailure(connection())).toBe(true);
        expect(transientModelFailure(new Error('Request timed out.'))).toBe(true);
        expect(transientModelFailure(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(true);
        expect(transientModelFailure(new Error('direct_provider_check_failed: connect ECONNREFUSED 127.0.0.1:11434'))).toBe(false);
        expect(transientModelFailure(new Error('the tool arguments were not valid'))).toBe(false);
    });

    it('Retry-After is read in seconds, as a date, or as retry-after-ms', () => {
        expect(retryAfterMs({ headers: { 'retry-after': '12' } }, 0)).toBe(12_000);
        expect(retryAfterMs({ headers: new Map([['retry-after-ms', '1500']]) }, 0)).toBe(1_500);
        const now = Date.parse('2026-11-13T10:12:00Z');
        expect(retryAfterMs({ headers: { 'retry-after': 'Fri, 13 Nov 2026 10:14:00 GMT' } }, now)).toBe(120_000);
        expect(retryAfterMs({ retryAfterMs: 5_000 }, 0)).toBe(5_000);
        expect(retryAfterMs(new Error('no header'), 0)).toBe(0);
    });
});

describe('the Retry-After Claude sends reaches the loop', () => {
    it('mapApiError keeps the response headers, so a 429 waits as long as the API asked', () => {
        const sdkError = Object.assign(new Error('rate limited'), { status: 429, headers: { 'retry-after': '42' } });
        const mapped = mapApiError(sdkError);
        expect((mapped as any).code).toBe('PROVIDER_FAILURE');
        expect(retryAfterMs(mapped, 0)).toBe(42_000);
        expect(retryAfterMs(mapApiError(Object.assign(new Error('x'), { status: 529 })), 0)).toBe(0);
    });
});
