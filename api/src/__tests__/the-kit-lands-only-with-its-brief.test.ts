/**
 * THE PRINT KIT LANDS ONLY WITH ITS BRIEF, BETWEEN STEPS, AND NEVER IN A RUN THAT ENDED
 * (review 4 of r40: S5, M4, M5).
 *
 * - S5: the run-start scan placed the kit (public/vendor/joe-kit) the moment it answered,
 *   while the run went on: during a step (a build, `git add`, the verification walk), in a
 *   run that finished on its first step or was delivered from Joe's book before the brief
 *   was ever given, and a copy under way when the run ended still wrote after the end.
 *   Now the scan returns only its decision; the loop places the kit when it gives the
 *   brief (the first message or a step's end), and the copy checks the abort before every
 *   write and takes back what it wrote.
 * - M5: the scan and its abort listener were set up before the run's try, so a throw in
 *   between (the conversation's set-up) left the scan running, and its answer placed the
 *   kit into the failed run's project.
 * - M4: every run wrote its run-start record through one fixed `.tmp` name, and two runs
 *   on one project each read, added and wrote back: one run's record was lost.
 *
 * No model is called. The request's scan is held by the test (its answer comes exactly
 * when the test says), so every moment below is exact.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getEventListeners } from 'events';
import { findJoeAsset } from '../core/quality/outside-scan';
import { placeAppKit, KIT_FILES, KIT_FONTS } from '../core/engine/app-kit';
import { rememberPdfsAtRunStart, RUN_START_FILE } from '../core/quality/outside-probe';
import { runEngine, type EngineDeps } from '../core/engine/loop';
import { finishTool, type Verifier } from '../core/engine/finish';
import { planUpdateTool } from '../core/engine/plan';
import type { BrowserSession, ChatMessage, EngineEvent, EngineModel, ModelStep, ProcessRegistry, ToolSchema, VerificationReport } from '../core/engine/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const outsideScan = require('../core/quality/outside-scan') as typeof import('../core/quality/outside-scan');

jest.setTimeout(120_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r40-kit-brief-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
let n = 0;
const project = () => { const dir = path.join(tmp, `p${++n}`); fs.mkdirSync(dir, { recursive: true }); return dir; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const kitOf = (dir: string) => path.join(dir, 'vendor', 'joe-kit', 'print.css');
const hasKit = () => !!findJoeAsset(path.join('app-kit', 'print.css'));

/** The request's scan, held until the test answers it: an Arabic request that asks to print. */
function holdScan() {
    let answer!: () => void;
    const answered = new Promise<void>(r => { answer = r; });
    const signals: Array<AbortSignal | undefined> = [];
    const spy = jest.spyOn(outsideScan, 'scanText').mockImplementation((async (items: any[], opts: any) => {
        signals.push(opts?.signal);
        await answered;                                  // the decision arrives when the test says, abort or not
        return items.map((_: unknown, i: number) => ({ i, asksPdf: true, speaksRtl: true, ms: 1 }));
    }) as any);
    return { answer: () => answer(), signals, calls: () => spy.mock.calls.length, restore: () => spy.mockRestore() };
}

function deps(model: EngineModel, extra: Partial<EngineDeps> = {}): EngineDeps {
    const passing: Verifier = async () => ({ passed: true, checks: [{ id: 'requirements', status: 'passed', detail: 'ok' }], unproven: [], at: 0 } as VerificationReport);
    const reg: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
        logs() { return undefined; }, async stop() { return true; }, list() { return []; }, async stopAll() { /* nothing runs */ },
    };
    const browser = (): BrowserSession => ({ async open() { throw new Error('unused'); }, async act() { throw new Error('unused'); }, async screenshot() { return ''; }, async close() { /* unused */ } });
    return { model, tools: [planUpdateTool, finishTool(passing)], processes: reg, browser, machine: { platform: 'linux', shell: 'bash' }, ...extra };
}
const model = (step: (k: number, text: string) => Promise<ModelStep>, more: Partial<EngineModel> = {}): EngineModel => {
    let k = 0;
    return {
        label: 'fake:kit', vision: false, contextTokens: () => 64_000,
        async step(messages: ChatMessage[], _t: ToolSchema[]) { return step(k++, messages.map(m => typeof m.content === 'string' ? m.content : '').join('\n')); },
        ...more,
    };
};
const finish = (k: number): ModelStep => ({ text: 'done', toolCalls: [{ id: `f${k}`, name: 'task_finish', arguments: JSON.stringify({ summary: 'done' }) }], durationMs: 1 });
const run = (dir: string, d: EngineDeps, signal = new AbortController().signal) => runEngine({
    runId: `run-${path.basename(dir)}`, request: 'اعمل تطبيق فواتير مع زر طباعة', language: 'ar', projectDir: dir,
    deadlineAt: Date.now() + 5 * 60_000, signal, emit: (_e: EngineEvent) => { /* unused */ }, joe: {},
} as any, d);

describe('S5 — the kit lands only when the brief is given, between steps', () => {
    it('the scan answers during the first step: no kit during that step; kit and brief arrive together at its end', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        const seen: { kitInStep0?: boolean; briefAt?: number; kitWithBrief?: boolean } = {};
        try {
            const result = await run(dir, deps(model(async (k, text) => {
                if (k === 0) {
                    scan.answer();
                    await sleep(400);                      // the tool of this step is still running
                    seen.kitInStep0 = fs.existsSync(kitOf(dir));
                    return { text: '', toolCalls: [{ id: 'c0', name: 'nothing_here', arguments: '{}' }], durationMs: 1 };
                }
                if (/joe-kit/u.test(text) && seen.briefAt === undefined) { seen.briefAt = k; seen.kitWithBrief = fs.existsSync(kitOf(dir)); }
                return finish(k);
            })));
            expect(result.status).toBe('delivered');
            expect(seen.kitInStep0).toBe(false);
            expect(seen.briefAt).toBe(1);
            expect(seen.kitWithBrief).toBe(true);
        } finally { scan.restore(); }
    });

    it('a run that finishes on its first step: the scan answered during it, nothing is placed and nothing is said', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        const seen: { kitInStep0?: boolean } = {};
        try {
            const result = await run(dir, deps(model(async k => {
                scan.answer();
                await sleep(400);
                seen.kitInStep0 = fs.existsSync(kitOf(dir));
                return finish(k);
            })));
            expect(result.status).toBe('delivered');
            await sleep(400);
            expect(seen.kitInStep0).toBe(false);
            expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit'))).toBe(false);
        } finally { scan.restore(); }
    });

    it('a run Joe\'s book delivers before any model call (deps.before): the scan answered meanwhile, no kit', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        let modelCalls = 0;
        try {
            const result = await run(dir, deps(model(async k => { modelCalls++; return finish(k); }), {
                before: async () => { scan.answer(); await sleep(400); return { finish: 'done again from Joe\'s book' }; },
            }));
            expect(result.status).toBe('delivered');
            expect(modelCalls).toBe(0);
            await sleep(400);
            expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit'))).toBe(false);
        } finally { scan.restore(); }
    });

    it('the scan answered during the work before the model: no kit during that work; kit and brief come with the first message', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        const seen: { kitInBefore?: boolean; firstHasBrief?: boolean; kitAtFirstCall?: boolean } = {};
        try {
            const result = await run(dir, deps(model(async (k, text) => {
                if (k === 0) { seen.firstHasBrief = /joe-kit/u.test(text); seen.kitAtFirstCall = fs.existsSync(kitOf(dir)); }
                return finish(k);
            }), {
                before: async () => { scan.answer(); await sleep(400); seen.kitInBefore = fs.existsSync(kitOf(dir)); return null; },
            }));
            expect(result.status).toBe('delivered');
            expect(seen.kitInBefore).toBe(false);
            expect(seen.firstHasBrief).toBe(true);
            expect(seen.kitAtFirstCall).toBe(true);
        } finally { scan.restore(); }
    });

    it('a decision that arrives after the last step places nothing', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        try {
            const result = await run(dir, deps(model(async k => finish(k))));
            expect(result.status).toBe('delivered');
            scan.answer();
            await sleep(400);
            expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit'))).toBe(false);
        } finally { scan.restore(); }
    });

    it('a copy under way when the run ends writes nothing after the end, and takes back what it wrote', async () => {
        if (!hasKit()) return;
        const dir = project();
        const stop = new AbortController();
        const original = fs.promises.writeFile;
        const writes: string[] = [];
        const spy = jest.spyOn(fs.promises, 'writeFile').mockImplementation((async (file: any, ...rest: any[]) => {
            if (String(file).startsWith(dir)) {
                writes.push(String(file));
                if (writes.length === 1) stop.abort();     // the run ends while the first file is written
            }
            return (original as any).call(fs.promises, file, ...rest);
        }) as any);
        try {
            const kit = await placeAppKit(dir, stop.signal);
            expect(kit.dir).toBe('');
            expect(writes.length).toBe(1);
            expect(fs.existsSync(path.join(dir, 'vendor'))).toBe(false);
        } finally { spy.mockRestore(); }
        //  Without an abort the kit is whole.
        const whole = await placeAppKit(dir, new AbortController().signal);
        expect(whole.written.length).toBe(KIT_FILES.length + Object.keys(KIT_FONTS).length);
    });
});

describe('M5 — a run that throws before its first step stops its scan and never gets the kit', () => {
    it('the conversation\'s set-up throws: the scan is stopped, its listener removed, and its late answer places nothing', async () => {
        if (!hasKit()) return;
        const dir = project();
        const scan = holdScan();
        const ac = new AbortController();
        try {
            const broken = model(async k => finish(k), { contextTokens: () => { throw new Error('the window could not be read'); } });
            await expect(run(dir, deps(broken), ac.signal)).rejects.toThrow('the window could not be read');
            expect(scan.signals.length).toBe(1);
            expect(scan.signals[0]?.aborted).toBe(true);
            //  Only the run's own `cancelled` listener stays on the request's signal; the PDF one is gone.
            expect(getEventListeners(ac.signal, 'abort').length).toBe(1);
            scan.answer();
            await sleep(400);
            expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit'))).toBe(false);
        } finally { scan.restore(); }
    });
});

describe('M4 — the run-start record keeps every run', () => {
    const runsOnDisk = (stateDir: string) => JSON.parse(fs.readFileSync(path.join(stateDir, RUN_START_FILE), 'utf8')).runs.map((r: any) => r.runId).sort();

    it('two runs on one project writing at once: both records are kept, through two different temporary names', async () => {
        for (let round = 0; round < 3; round++) {
            const dir = project();
            const stateDir = path.join(dir, '.joe');
            const original = fs.promises.writeFile;
            const temps: string[] = [];
            const spy = jest.spyOn(fs.promises, 'writeFile').mockImplementation((async (file: any, ...rest: any[]) => {
                if (String(file).startsWith(stateDir)) temps.push(String(file));
                return (original as any).call(fs.promises, file, ...rest);
            }) as any);
            try {
                await Promise.all([rememberPdfsAtRunStart(`a${round}`, dir, stateDir), rememberPdfsAtRunStart(`b${round}`, dir, stateDir)]);
            } finally { spy.mockRestore(); }
            expect(runsOnDisk(stateDir)).toEqual([`a${round}`, `b${round}`]);
            expect(new Set(temps).size).toBe(2);
            expect(fs.readdirSync(stateDir).filter(f => f.endsWith('.tmp'))).toEqual([]);
        }
    });

    it('many runs at once: none is lost', async () => {
        const dir = project();
        const stateDir = path.join(dir, '.joe');
        const ids = Array.from({ length: 8 }, (_, i) => `run${i}`);
        await Promise.all(ids.map(id => rememberPdfsAtRunStart(id, dir, stateDir)));
        expect(runsOnDisk(stateDir)).toEqual([...ids].sort());
    });

    it('Windows refuses the rename for a moment (EPERM, EBUSY): the record is still written', async () => {
        const dir = project();
        const stateDir = path.join(dir, '.joe');
        const original = fs.promises.rename;
        let refused = 0;
        const spy = jest.spyOn(fs.promises, 'rename').mockImplementation((async (from: any, to: any) => {
            if (String(to).startsWith(stateDir) && refused < 2) {
                refused++;
                throw Object.assign(new Error(`${refused === 1 ? 'EPERM' : 'EBUSY'}: operation not permitted, rename`), { code: refused === 1 ? 'EPERM' : 'EBUSY' });
            }
            return (original as any).call(fs.promises, from, to);
        }) as any);
        try { await rememberPdfsAtRunStart('held-open', dir, stateDir); } finally { spy.mockRestore(); }
        expect(refused).toBe(2);
        expect(runsOnDisk(stateDir)).toEqual(['held-open']);
        expect(fs.readdirSync(stateDir).filter(f => f.endsWith('.tmp'))).toEqual([]);
    });
});
