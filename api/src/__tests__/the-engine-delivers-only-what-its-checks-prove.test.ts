/**
 * THE NEW ENGINE'S LOOP, DRIVEN BY A SCRIPTED MODEL.
 *
 * The first engine could not look at what it wrote: a defect was met by asking
 * the same model the same question again. The new engine is a loop: the
 * model calls a tool, sees what really happened, and calls the next one. It
 * is done only when task_finish passes Joe's checks.
 *
 * Each test below scripts the model's turns, so it pins what the LOOP does
 * with them: what it runs, what it shows the model, when it stops, and what it
 * reports. No network, no model, no browser.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runEngine, REPEAT_LIMIT, IDLE_LIMIT, REFUSAL_LIMIT, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import type {
    BrowserSession, ChatMessage, EngineEvent, EngineModel, EngineRequest, EngineTool, ModelStep,
    ProcessInfo, ProcessRegistry, ToolSchema, VerificationReport,
} from '../core/engine/types';

const roots: string[] = [];
function projectDir(): string {
    const parent = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
    const dir = fs.mkdtempSync(path.join(parent, 'joe-engine-loop-'));
    roots.push(dir);
    return dir;
}
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

type Turn = { text?: string; calls?: Array<{ name: string; args: unknown }>; raw?: string; throws?: Error & { code?: string } };

/** A model that plays a script and records every prompt it was sent. */
function scriptedModel(turns: Turn[], opts: { window?: number; vision?: boolean } = {}) {
    const prompts: ChatMessage[][] = [];
    let i = 0;
    const model: EngineModel = {
        label: 'scripted:test',
        vision: opts.vision ?? false,
        contextTokens: () => opts.window ?? 64_000,
        async step(messages: ChatMessage[], _tools: ToolSchema[]): Promise<ModelStep> {
            prompts.push(JSON.parse(JSON.stringify(messages)));
            const t = turns[Math.min(i, turns.length - 1)];
            i++;
            if (t.throws) throw t.throws;
            return {
                text: t.text ?? '',
                toolCalls: (t.calls ?? []).map((c, k) => ({ id: `c${i}_${k}`, name: c.name, arguments: JSON.stringify(c.args) })),
                durationMs: 1,
            };
        },
    };
    return { model, prompts, turnsTaken: () => i };
}

/** A file tool that writes into the project folder for real. */
const writeTool: EngineTool<{ path: string; content: string }> = {
    name: 'file_write',
    description: 'write a file',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    parse(a: any) {
        if (!a || typeof a.path !== 'string' || typeof a.content !== 'string') return { ok: false, error: 'file_write needs "path" and "content".' };
        return { ok: true, value: { path: a.path, content: a.content } };
    },
    async run(a, ctx) {
        const full = path.join(ctx.projectDir, a.path);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        const existed = fs.existsSync(full);
        fs.writeFileSync(full, a.content);
        return { ok: true, output: `wrote ${a.path}`, facts: { filesChanged: [{ path: a.path, change: existed ? 'modified' : 'created', bytes: a.content.length }] } };
    },
};

/** A tool that always fails the same way. */
const brokenTool: EngineTool<{ command: string }> = {
    name: 'shell_run',
    description: 'run',
    parameters: { type: 'object', properties: { command: { type: 'string' } } },
    parse(a: any) { return { ok: true, value: { command: String(a?.command ?? '') } }; },
    async run(a) { return { ok: false, output: `exit 1: ${a.command}: command not found`, facts: { command: { command: a.command, cwd: '.', exitCode: 1, durationMs: 1 } } }; },
};

function registry() {
    const calls = { stopAll: 0 };
    const reg: ProcessRegistry = {
        async start(spec) { const p: ProcessInfo = { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0 }; return { ...p, output: '' }; },
        logs() { return undefined; },
        async stop() { return true; },
        list() { return []; },
        async stopAll() { calls.stopAll++; },
    };
    return { reg, calls };
}

function browser() {
    const calls = { opened: 0, closed: 0 };
    const factory = (): BrowserSession => {
        calls.opened++;
        return {
            async open() { throw new Error('not used'); },
            async act() { throw new Error('not used'); },
            async screenshot() { return ''; },
            async close() { calls.closed++; },
        };
    };
    return { factory, calls };
}

/** A verifier that reads the project folder: it passes when index.html holds the word «Book». */
const fileVerifier: Verifier = async (ctx) => {
    const file = path.join(ctx.projectDir, 'index.html');
    const ok = fs.existsSync(file) && /Book/.test(fs.readFileSync(file, 'utf8'));
    const report: VerificationReport = {
        passed: ok,
        checks: [{ id: 'requirements', status: ok ? 'passed' : 'failed', detail: ok ? 'R1 found in index.html' : 'R1 "a booking button" is not in index.html', requirementIds: ['R1'] }],
        unproven: ok ? [] : [{ id: 'R1', text: 'a booking button', reason: 'not found in the source' }],
        at: 0,
    };
    return report;
};

function request(dir: string, events: EngineEvent[], over: Partial<EngineRequest> = {}): EngineRequest {
    return {
        runId: 'run-test', request: 'Build a page with a booking button', language: 'en',
        projectDir: dir, deadlineAt: Date.now() + 60_000, signal: new AbortController().signal,
        emit: e => events.push(e), joe: {}, ...over,
    };
}

function deps(model: EngineModel, tools: EngineTool[], verifier: Verifier = fileVerifier, over: Partial<EngineDeps> = {}) {
    const r = registry();
    const b = browser();
    const d: EngineDeps = {
        model, tools: [planUpdateTool, ...tools, finishTool(verifier)],
        processes: r.reg, browser: b.factory,
        machine: { platform: 'linux', shell: 'bash' },
        seedRequirements: async () => [{ text: 'a booking button', quote: 'a booking button' }],
        ...over,
    };
    return { d, registry: r.calls, browser: b.calls };
}

describe('the run stops when the checks keep refusing the same thing', () => {
    const refusing = (detail: (n: number) => string): Verifier => {
        let n = 0;
        return async () => {
            n++;
            return { passed: false, checks: [{ id: 'scope', status: 'failed', detail: detail(n) }], unproven: [], at: 0 } as VerificationReport;
        };
    };
    const finishes = (count: number) => Array.from({ length: count }, (_, i) => ({ calls: [{ name: 'task_finish', args: { summary: `attempt ${i + 1}` } }] }));

    it('four identical refusals end the run, and the reason names what was refused', async () => {
        const dir = projectDir();
        const { model, turnsTaken } = scriptedModel(finishes(10));
        const { d } = deps(model, [writeTool], refusing(() => 'artifact coverage 75% — missing: product catalogue'));
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(new RegExp(`refused the same thing ${REFUSAL_LIMIT} times in a row: scope: artifact coverage 75% — missing: product catalogue`));
        expect(turnsTaken()).toBe(REFUSAL_LIMIT);
    });

    it('refusals that change (the work moves) do not stop it; only counts are folded', async () => {
        const dir = projectDir();
        const { model, turnsTaken } = scriptedModel(finishes(6));
        // Counts differ but read alike: still the same refusal.
        const counts = refusing(n => `${12 - n} tap targets under 40px`);
        const { d } = deps(model, [writeTool], counts);
        const r1 = await runEngine(request(dir, []), d);
        expect(r1.reason).toMatch(/refused the same thing/);
        // Different findings each time: no stop from this rule.
        const dir2 = projectDir();
        const moving = scriptedModel(finishes(6));
        const { d: d2 } = deps(moving.model, [writeTool], refusing(n => ['missing: catalogue, filtering', 'missing: catalogue', 'missing: filtering', 'missing: search', 'missing: cart', 'missing: totals'][n - 1]));
        const r2 = await runEngine(request(dir2, []), d2);
        expect(r2.reason || '').not.toMatch(/refused the same thing/);
        expect(moving.turnsTaken()).toBeGreaterThan(REFUSAL_LIMIT);
    });

    it('the judge refusing the same requirement in new words each time is the same refusal', async () => {
        //  The ladder's L150, 2026-11-08: «R2» refused for two hours and 88 steps, never twice alike.
        const dir = projectDir();
        const { model, turnsTaken } = scriptedModel(finishes(10));
        const words = [
            'R2 نقل الأقسام بين الأعمدة: القسم خاصية في البطاقة، والأعمدة حالات',
            'R2 not proven: the columns hold statuses, the departments are a field',
            'R2: moving departments between the columns is not shown on the board',
            'R2 لم يثبت: السحب ينقل البطاقة لا القسم',
            'R2 still unproven',
        ];
        const { d } = deps(model, [writeTool], refusing(n => words[(n - 1) % words.length]));
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/refused the same thing 4 times in a row/);
        expect(turnsTaken()).toBe(REFUSAL_LIMIT);
        //  Another requirement refused is another refusal.
        const { refusalSignature } = require('../core/engine/loop');
        expect(refusalSignature({ checks: [{ id: 'acceptance', status: 'failed', detail: 'R2 x' }] }))
            .not.toBe(refusalSignature({ checks: [{ id: 'acceptance', status: 'failed', detail: 'R3 x' }] }));
    });
});

describe('the receipt says what the run did to each file', () => {
    it('a file the run created and then edited is reported as created', async () => {
        const dir = projectDir();
        const { model } = scriptedModel([
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<h1>Hello</h1>' } }] },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<h1>Hello</h1><button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'done' } }] },
        ]);
        const { d } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('delivered');
        expect(result.filesChanged).toEqual([expect.objectContaining({ path: 'index.html', change: 'created' })]);
    });
});

describe('the loop is done only when the checks pass', () => {
    it('a claim the checks refute goes back to the model, and the corrected work is delivered', async () => {
        const dir = projectDir();
        const { model, prompts } = scriptedModel([
            { calls: [{ name: 'plan_update', args: { steps: [{ title: 'Write the page', status: 'in_progress' }] } }] },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<h1>Hello</h1>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'done' } }] },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<h1>Hello</h1><button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'The page has a booking button.' } }] },
        ]);
        const events: EngineEvent[] = [];
        const { d, registry: reg } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, events), d);

        expect(result.status).toBe('delivered');
        expect(result.summary).toBe('The page has a booking button.');
        expect(result.verification?.passed).toBe(true);
        expect(result.filesChanged.map(f => f.path)).toEqual(['index.html']);
        // The refuted claim was shown to the model, with what failed.
        const sawRefusal = prompts[3].some(m => m.role === 'tool' && /NOT VERIFIED/.test(m.content) && /a booking button/.test(m.content));
        expect(sawRefusal).toBe(true);
        // Two verifications ran, the first failed.
        expect(events.filter(e => e.type === 'verification').map(e => (e as any).report.passed)).toEqual([false, true]);
        expect(reg.stopAll).toBe(1);
        // The run left its record on disk.
        expect(JSON.parse(fs.readFileSync(path.join(dir, '.joe', 'result.json'), 'utf8')).status).toBe('delivered');
        expect(fs.readFileSync(path.join(dir, '.joe', 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean).length).toBeGreaterThan(5);
    });

    it('the request\'s items are in the first message, and the plan is recited every few steps', async () => {
        const dir = projectDir();
        const writes = [1, 2, 3, 4, 5].map(n => ({ calls: [{ name: 'file_write', args: { path: `part${n}.html`, content: `<p>${n}</p>` } }] }));
        const { model, prompts } = scriptedModel([
            { calls: [{ name: 'plan_update', args: { steps: [{ title: 'Write the page', status: 'in_progress' }] } }] },
            ...writes,
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'ok' } }] },
        ]);
        const { d } = deps(model, [writeTool]);
        await runEngine(request(dir, []), d);
        const first = prompts[0][1];
        expect(first.role).toBe('user');
        expect(String(first.content)).toContain('R1: a booking button');
        expect(String(first.content)).toContain('Build a page with a booking button');
        // The step that called plan_update read the plan in its own result: no recital there.
        const planResult = prompts[1].filter(m => m.role === 'tool').pop() as any;
        expect(planResult.content).not.toMatch(/\[Status ·/);
        // Five steps later the plan and the time left ride on that step's last result.
        const results = prompts[6].filter(m => m.role === 'tool') as any[];
        expect(results[results.length - 1].content).toMatch(/\[Status · step 6 · \d+ min left\]/);
        expect(results[results.length - 1].content).toContain('[>] Write the page');
        expect(results[results.length - 1].content).toContain('[ ] R1: a booking button');
        expect(results.slice(0, -1).some(r => /\[Status ·/.test(r.content))).toBe(false);
    });

    it('every prompt is the previous prompt plus what happened since', async () => {
        const dir = projectDir();
        const { model, prompts } = scriptedModel([
            { calls: [{ name: 'plan_update', args: { steps: [{ title: 'a', status: 'in_progress' }] } }] },
            { text: 'Writing the page now.', calls: [{ name: 'file_write', args: { path: 'index.html', content: 'x' } }] },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'ok' } }] },
        ]);
        const { d } = deps(model, [writeTool]);
        await runEngine(request(dir, []), d);
        for (let k = 1; k < prompts.length; k++) {
            expect(prompts[k].slice(0, prompts[k - 1].length)).toEqual(prompts[k - 1]);
        }
    });
});

describe('the loop stops honestly when no progress is possible', () => {
    it('the same failing call is made at most REPEAT_LIMIT times, and the reason says which', async () => {
        const dir = projectDir();
        const { model, prompts, turnsTaken } = scriptedModel([{ calls: [{ name: 'shell_run', args: { command: 'npm run biuld' } }] }]);
        const { d } = deps(model, [brokenTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/same failing call was made 4 times: shell_run/);
        expect(turnsTaken()).toBe(REPEAT_LIMIT);
        // At the second identical failure the model was told to stop repeating it.
        const warned = prompts[2].some(m => m.role === 'tool' && /failed twice\. Do not repeat it/.test(m.content));
        expect(warned).toBe(true);
    });

    it('a model that stops calling tools is nudged, then the run ends as failed, never as delivered', async () => {
        const dir = projectDir();
        const { model, prompts } = scriptedModel([{ text: 'All done! The page is ready.' }]);
        const { d } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/stopped calling tools/);
        expect(prompts.length).toBe(IDLE_LIMIT);
        expect(prompts[1].some(m => m.role === 'user' && /call task_finish so Joe can check it/.test(String(m.content)))).toBe(true);
    });

    it('a cancelled run stops at once, stops its processes and closes its browser', async () => {
        const dir = projectDir();
        const controller = new AbortController();
        const b = browser();
        const r = registry();
        const tool: EngineTool<{}> = {
            name: 'browser_open', description: 'open', parameters: { type: 'object', properties: {} },
            parse: () => ({ ok: true, value: {} }),
            async run(_a, ctx) { ctx.browser(); controller.abort(); return { ok: true, output: 'opened' }; },
        };
        const { model } = scriptedModel([{ calls: [{ name: 'browser_open', args: {} }] }, { calls: [{ name: 'browser_open', args: {} }] }]);
        const result = await runEngine(request(dir, [], { signal: controller.signal }), {
            model, tools: [tool], processes: r.reg, browser: b.factory, machine: { platform: 'linux', shell: 'bash' },
        });
        expect(result.status).toBe('cancelled');
        expect(r.calls.stopAll).toBe(1);
        expect(b.calls).toEqual({ opened: 1, closed: 1 });
    });

    it('a run past its deadline ends as failed with the reason', async () => {
        const dir = projectDir();
        const { model } = scriptedModel([{ calls: [{ name: 'file_write', args: { path: 'a.txt', content: 'a' } }] }]);
        let t = 0;
        const { d } = deps(model, [writeTool], fileVerifier, { now: () => (t += 40_000) });
        const result = await runEngine(request(dir, [], { deadlineAt: 100_000 }), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/deadline/);
    });

    it('a model that cannot be reached three times in a row ends the run with its error', async () => {
        const dir = projectDir();
        const { model } = scriptedModel([{ throws: Object.assign(new Error('direct_provider_check_failed: connect ECONNREFUSED'), {}) }]);
        const { d } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/failed 3 times in a row: direct_provider_check_failed/);
    });
});

describe('what the model is shown when it makes a mistake', () => {
    it('an unknown tool, unparseable arguments and invalid arguments each get an answer the model can act on', async () => {
        const dir = projectDir();
        const { model, prompts } = scriptedModel([
            { calls: [{ name: 'run_tests', args: {} }] },
            { raw: '', calls: [{ name: 'file_write', args: { path: 1 } }] },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'ok' } }] },
        ]);
        const { d } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('delivered');
        const tools = prompts[2].filter(m => m.role === 'tool').map(m => (m as any).content as string);
        expect(tools[0]).toMatch(/There is no tool "run_tests"\. The tools are: plan_update, file_write, task_finish/);
        expect(tools[1]).toMatch(/file_write needs "path" and "content"/);
    });

    it('a reply cut off by the output limit is not used, and the model is told to make smaller calls', async () => {
        const dir = projectDir();
        const { model, prompts } = scriptedModel([
            { throws: Object.assign(new Error('Local model reached its output budget'), { code: 'LOCAL_COMPLETION_LIMIT' }) },
            { calls: [{ name: 'file_write', args: { path: 'index.html', content: '<button>Book</button>' } }] },
            { calls: [{ name: 'task_finish', args: { summary: 'ok' } }] },
        ]);
        const { d } = deps(model, [writeTool]);
        const result = await runEngine(request(dir, []), d);
        expect(result.status).toBe('delivered');
        expect(prompts[1].some(m => m.role === 'user' && /last reply was cut off/.test(String(m.content)))).toBe(true);
    });
});
