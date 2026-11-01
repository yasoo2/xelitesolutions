/**
 * THE PLAN'S R1…Rn AND THE FINAL VERDICT TALK ABOUT THE SAME THINGS.
 *
 * The engine's requirement ledger is seeded by readRequestRequirements — the
 * reader the acceptance judge uses — and every seed keeps the reader's own id
 * and quote, so the verifier judges exactly those requirements and maps each
 * verdict back to R1…Rn. Around that, the cases that must never pass: a judge
 * that could rule on nothing, a request nobody could read, and a partial
 * delivery. And the result the orchestrator, the receipt and the exam read.
 *
 * Projects here are small and real (a command-line program proven by its own
 * tests, a static site), run through Joe's real tools; the model is a
 * deterministic stand-in that answers in the formats Joe's parsers read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createVerifier, deliveryOutput, measureProjectSource, panelBrowserQa, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { EngineEvent, ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { namedRequirements } from '../core/quality/named-requirements';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(180_000);

const TOOL_CONTEXT = { sessionId: 'joe-eng-verify-plan-session', workspaceId: 'joe-eng-verify', userId: 'joe-eng-verify-user', runId: 'joe-eng-verify-plan-run' };
const workspace = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-verify-plan-'));

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-eng-verify-plan-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

let projects = 0;
function project(files: Record<string, string>): string {
    const dir = path.join(workspace, `project-${++projects}`);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    project_run: () => new ProjectRunTool(),
    project_stop: () => new ProjectStopTool(),
    quality_run: () => new QualityRunTool(),
    shell_execute: () => new ShellExecuteTool(),
};
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`unexpected tool ${tool}`);
    return executionFirewall.runInContext(`joe-eng-verify-plan-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};

interface Wanted { text: string; quote: string; line: string }

/** The reader answers with `wanted`; the judge rules from the source lines, unless told it cannot be reached. */
function model(wanted: Wanted[], opts: { reader?: 'answers' | 'down'; judge?: 'answers' | 'down' } = {}) {
    const asked: string[] = [];
    const ask = async (prompt: string): Promise<string> => {
        if (prompt.startsWith('Read this request')) {
            asked.push('read');
            if (opts.reader === 'down') throw new Error('ECONNREFUSED 127.0.0.1:11434');
            return JSON.stringify({ requirements: wanted.map(w => ({ text: w.text, quote: w.quote })) });
        }
        if (prompt.startsWith('Here is the source')) {
            asked.push('judge');
            if (opts.judge === 'down') throw new Error('ECONNREFUSED 127.0.0.1:11434');
            const source = prompt.slice(prompt.indexOf('SOURCE:\n') + 'SOURCE:\n'.length, prompt.indexOf('\n\nFor each requirement below'));
            const verdicts = [...prompt.matchAll(/^\s+\d+\. \[([^\]]+)\] (.+?) {3}\(he wrote: «/gmu)].map(m => {
                const want = wanted.find(w => w.text === m[2]);
                const line = want ? source.split('\n').find(l => l.includes(want.line)) : undefined;
                return line
                    ? { id: m[1], verdict: 'met', evidence: line.trim(), why: `the source carries «${want!.line}»` }
                    : { id: m[1], verdict: 'unmet', evidence: '', why: `no line of the source delivers ${m[2]}` };
            });
            return JSON.stringify({ verdicts });
        }
        throw new Error('unexpected prompt');
    };
    return { ask, asked };
}

const processes: ProcessRegistry = {
    async start() { throw new Error('not used'); }, logs: () => undefined, async stop() { return false; }, list: () => [], async stopAll() { /* none */ },
};

function runContext(dir: string, request: string, seeds: Array<{ text: string; quote?: string; key?: string }>, events: EngineEvent[] = []): ToolContext {
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };
    return {
        runId: 'joe-eng-verify-plan-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + 15 * 60_000, language: 'en', request, processes,
        browser: () => { throw new Error('not used'); },
        state, emit: e => events.push(e), joe: {},
    };
}

const watched: BrowserQa = {
    async watcher() { return { sessionId: 'joe-eng-verify-plan-panel', watching: true }; },
    async audit() { return { score: 100, findings: [] }; },
};

const check = (report: DeliveryVerification, id: string) => report.checks.find(c => c.id === id);
/** task_finish as the engine runs it: inside the orchestrator's execution context, like every tool of the run. */
const finish = (deps: Parameters<typeof createVerifier>[0], ctx: ToolContext) =>
    executionFirewall.runInContext('joe-eng-verify-plan-finish', () => createVerifier(deps)(ctx, { summary: 'done' })) as Promise<DeliveryVerification>;

/* A command-line program, proven by its own tests: no server, no page. */
const CLI_REQUEST = 'Write a command-line tool in Node.js that converts Celsius to Fahrenheit and Fahrenheit to Celsius, with unit tests.';
const CLI_WANTED: Wanted[] = [
    { text: 'converts Celsius to Fahrenheit', quote: 'converts Celsius to Fahrenheit', line: 'return celsius * 9 / 5 + 32;' },
    { text: 'converts Fahrenheit to Celsius', quote: 'Fahrenheit to Celsius', line: 'return (fahrenheit - 32) * 5 / 9;' },
];
function cli(): string {
    return project({
        'convert.js': 'function toFahrenheit(celsius) {\n  return celsius * 9 / 5 + 32;\n}\nfunction toCelsius(fahrenheit) {\n  return (fahrenheit - 32) * 5 / 9;\n}\nmodule.exports = { toFahrenheit, toCelsius };\n',
        'test/convert.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { toFahrenheit, toCelsius } = require('../convert');\ntest('100 Celsius is 212 Fahrenheit', () => { assert.strictEqual(toFahrenheit(100), 212); });\ntest('32 Fahrenheit is 0 Celsius', () => { assert.strictEqual(toCelsius(32), 0); });\n",
        'package.json': JSON.stringify({ name: 'tempconv', version: '1.0.0', private: true, scripts: { test: 'node --test' } }, null, 2),
    });
}

describe('the ledger is seeded by the judge\'s own reader', () => {
    it('each seed carries the reader\'s id and quote, and the plan numbers them R1…Rn in reading order', async () => {
        const { ask } = model(CLI_WANTED);
        const seeds = await seedRequirementsFromRequest(CLI_REQUEST, 'en', ask);
        const read = await namedRequirements(CLI_REQUEST, false, model(CLI_WANTED).ask);
        expect(seeds).toEqual(read.requirements.map(r => ({ text: r.text, quote: r.quote, key: r.id })));
        expect(seeds.map(s => s.key)).toEqual([expect.stringMatching(/^req-/), expect.stringMatching(/^req-/)]);
        const plan = newPlan(seededRequirements(seeds));
        expect(plan.requirements.map(r => [r.id, r.text, r.key])).toEqual([
            ['R1', 'converts Celsius to Fahrenheit', seeds[0].key],
            ['R2', 'converts Fahrenheit to Celsius', seeds[1].key],
        ]);
    });

    it('with no model to ask, the request\'s own explicit clauses still seed the ledger', async () => {
        const request = 'Build a small page for my bakery. Add a booking form, show the opening hours.';
        const seeds = await seedRequirementsFromRequest(request, 'en', model([], { reader: 'down' }).ask);
        expect(seeds.length).toBeGreaterThan(0);
        expect(seeds.every(s => /^request-clause-/.test(String(s.key)))).toBe(true);
        expect(seeds.map(s => s.text)).toEqual(expect.arrayContaining(['Add a booking form', 'show the opening hours']));
    });

    it('the verdict maps back to the plan\'s ids, and a plan the seeding left empty is filled by the same reader', async () => {
        const dir = cli();
        fs.writeFileSync(path.join(dir, 'convert.js'), 'function toFahrenheit(celsius) {\n  return celsius * 9 / 5 + 32;\n}\nfunction toCelsius(fahrenheit) {\n  return fahrenheit - 32;\n}\nmodule.exports = { toFahrenheit, toCelsius };\n');
        fs.writeFileSync(path.join(dir, 'test/convert.test.js'), "const test = require('node:test');\nconst assert = require('node:assert');\nconst { toFahrenheit } = require('../convert');\ntest('100 Celsius is 212 Fahrenheit', () => { assert.strictEqual(toFahrenheit(100), 212); });\n");
        const events: EngineEvent[] = [];
        const { ask } = model(CLI_WANTED);
        const ctx = runContext(dir, CLI_REQUEST, [], events);
        const report = await finish({ ask, runTool, browserQa: watched }, ctx);
        // The seeding had read nothing; the verifier read the request and entered what it read.
        expect(ctx.state.plan.requirements.map(r => [r.id, r.text, r.fromRequest])).toEqual([
            ['R1', 'converts Celsius to Fahrenheit', true],
            ['R2', 'converts Fahrenheit to Celsius', true],
        ]);
        expect(events.some(e => e.type === 'plan')).toBe(true);
        expect(report.passed).toBe(false);
        expect(report.unproven).toEqual([{ id: 'R2', text: 'converts Fahrenheit to Celsius', reason: expect.stringMatching(/^not met: /) }]);
        expect(report.delivery.acceptance.requirements.map(r => [r.id, r.key, r.verdict])).toEqual([
            ['R1', ctx.state.plan.requirements[0].key, 'met'],
            ['R2', ctx.state.plan.requirements[1].key, 'unmet'],
        ]);
    });
});

describe('a judgement that could not be made never passes', () => {
    it('a judge that could rule on nothing blocks, and every requirement is named as not provable', async () => {
        const { ask } = model(CLI_WANTED, { judge: 'down' });
        const seeds = await seedRequirementsFromRequest(CLI_REQUEST, 'en', ask);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(cli(), CLI_REQUEST, seeds));
        expect(check(report, 'program')?.status).toBe('passed');
        expect(report.passed).toBe(false);
        expect(check(report, 'acceptance')?.status).toBe('failed');
        expect(report.unproven.map(u => u.id)).toEqual(['R1', 'R2']);
        expect(report.unproven.every(u => /^not provable: I did not inspect it — the model could not be reached/.test(u.reason))).toBe(true);
    });

    it('a request nobody could read blocks as unread — never as «nothing was asked»', async () => {
        const request = 'Write a command-line tool in Node.js for converting temperatures, with unit tests.';
        const { ask } = model([], { reader: 'down' });
        const seeds = await seedRequirementsFromRequest(request, 'en', ask);
        expect(seeds).toEqual([]);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(cli(), request, seeds));
        expect(report.passed).toBe(false);
        expect(report.delivery.acceptance.requestUnread).toBe(true);
        expect(check(report, 'acceptance')?.detail).toMatch(/^acceptance_unverified: request_not_read — the model could not be reached: ECONNREFUSED/);
    });

    it('a request the model read and found nothing judgeable in has nothing to block on', async () => {
        const request = 'Write a command-line tool in Node.js for converting temperatures, with unit tests.';
        const { ask } = model([]);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(cli(), request, []));
        expect(report.delivery.acceptance.requestUnread).toBe(false);
        expect(check(report, 'acceptance')).toMatchObject({ status: 'passed', detail: 'the request was read and names nothing the source can be judged against' });
        expect(report.passed).toBe(true);
    });
});

describe('the source is read in the language it was written in', () => {
    const PY_REQUEST = 'Write a command-line tool in Python that converts Celsius to Fahrenheit and Fahrenheit to Celsius, with unit tests.';
    const PY_WANTED: Wanted[] = [
        { text: 'converts Celsius to Fahrenheit', quote: 'converts Celsius to Fahrenheit', line: 'return celsius * 9 / 5 + 32' },
        { text: 'converts Fahrenheit to Celsius', quote: 'Fahrenheit to Celsius', line: 'return (fahrenheit - 32) * 5 / 9' },
    ];
    const python = (extra: Record<string, string> = {}) => project({
        'convert.py': 'def to_fahrenheit(celsius):\n    return celsius * 9 / 5 + 32\n\n\ndef to_celsius(fahrenheit):\n    return (fahrenheit - 32) * 5 / 9\n',
        'test_convert.py': 'import unittest\nfrom convert import to_fahrenheit, to_celsius\n\n\nclass ConvertTest(unittest.TestCase):\n    def test_c_to_f(self):\n        self.assertEqual(to_fahrenheit(100), 212)\n\n    def test_f_to_c(self):\n        self.assertEqual(to_celsius(32), 0)\n\n\nif __name__ == "__main__":\n    unittest.main()\n',
        ...extra,
    });

    it('a Python program\'s requirements are judged on its Python source, and its own tests prove it runs', async () => {
        const { ask } = model(PY_WANTED);
        const seeds = await seedRequirementsFromRequest(PY_REQUEST, 'en', ask);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(python(), PY_REQUEST, seeds));
        expect(report.checks.filter(c => c.status === 'failed').map(c => c.id)).toEqual([]);
        expect(check(report, 'source')?.detail).toMatch(/2 Python file\(s\)/);
        expect(check(report, 'program')?.status).toBe('passed');
        expect(report.delivery.acceptance.requirements.map(r => r.verdict)).toEqual(['met', 'met']);
        expect(report.passed).toBe(true);
    });

    it('a source file too large to hand to the judge is named in the acceptance check, never dropped in silence', async () => {
        const { ask } = model(PY_WANTED);
        const seeds = await seedRequirementsFromRequest(PY_REQUEST, 'en', ask);
        const dir = python({ 'readings.py': `READINGS = [\n${'    21.5,\n'.repeat(110_000)}]\n` });
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(dir, PY_REQUEST, seeds));
        expect(fs.statSync(path.join(dir, 'readings.py')).size).toBeGreaterThan(1_000_000);
        expect(check(report, 'acceptance')).toMatchObject({ status: 'passed', detail: expect.stringMatching(/ \| not handed to the judge \(over 1000000 bytes each\): readings\.py$/) });
    });

    it('the Python compile check writes nothing into the project it reads', async () => {
        const dir = python();
        const source = await measureProjectSource(dir, Date.now() + 60_000);
        expect(source).toEqual({ measured: ['2 Python file(s)'], problems: [], notMeasured: [] });
        expect(fs.existsSync(path.join(dir, '__pycache__'))).toBe(false);
    });

    it('a Python file that does not compile is a source failure, named by the compiler', async () => {
        const { ask } = model(PY_WANTED);
        const seeds = await seedRequirementsFromRequest(PY_REQUEST, 'en', ask);
        const dir = python({ 'broken.py': 'def oops(:\n    pass\n' });
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(dir, PY_REQUEST, seeds));
        expect(report.passed).toBe(false);
        expect(report.checks.filter(c => c.status === 'failed').map(c => c.id)).toEqual(['source']);
        expect(check(report, 'source')?.detail).toMatch(/Python: .*broken\.py/s);
    });

    it('a JavaScript file that does not parse is a source failure, by the parser\'s own words', async () => {
        const dir = cli();
        fs.writeFileSync(path.join(dir, 'format.js'), 'const = 1;\nmodule.exports = {};\n');
        const { ask } = model(CLI_WANTED);
        const seeds = await seedRequirementsFromRequest(CLI_REQUEST, 'en', ask);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(dir, CLI_REQUEST, seeds));
        expect(report.passed).toBe(false);
        expect(report.checks.filter(c => c.status === 'failed').map(c => c.id)).toEqual(['source']);
        expect(check(report, 'source')?.detail).toMatch(/format\.js(?::\d+)?: SyntaxError/);
    });

    it('a JavaScript check that could not run is named as not measured — never counted as parsed', async () => {
        // Outside the orchestrator's execution context Joe's firewall refuses every process, so the parser cannot run.
        const dir = cli();
        fs.writeFileSync(path.join(dir, 'format.js'), 'const = 1;\nmodule.exports = {};\n');
        const source = await measureProjectSource(dir, Date.now() + 60_000);
        expect(source.measured).toEqual([]);
        expect(source.problems).toEqual([]);
        expect(source.notMeasured).toEqual([expect.stringMatching(/^JavaScript \([^)]+\): the check could not run: /)]);
    });

    it('a script a page hands to something that is not a JavaScript engine is named as not parsed', async () => {
        const dir = project({
            'index.html': '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>x</title></head><body><div id="root"></div>\n<script type="text/x-handlebars-template" src="card.js"></script>\n</body></html>\n',
            'card.js': '<article class="card">{{title}}</article>\n',
        });
        const source = await measureProjectSource(dir, Date.now() + 60_000);
        expect(source.problems).toEqual([]);
        expect(source.notMeasured).toEqual([expect.stringMatching(/^card\.js: a page loads it as <script type="text\/x-handlebars-template">, which no JavaScript engine runs as written$/)]);
    });
});

describe('a verification the run stopped is never a delivery', () => {
    it('cancelled after the program\'s tests passed, the requirements are never judged and the delivery is not verified', async () => {
        const { ask } = model(CLI_WANTED);
        const seeds = await seedRequirementsFromRequest(CLI_REQUEST, 'en', ask);
        const ctx = runContext(cli(), CLI_REQUEST, seeds);
        const controller = new AbortController();
        ctx.signal = controller.signal;
        const stopping = async (tool: string, input: any) => {
            const result = await runTool(tool, input);
            if (tool === 'quality_run') controller.abort();
            return result;
        };
        const report = await finish({ ask, runTool: stopping, browserQa: watched }, ctx);
        expect(check(report, 'program')?.status).toBe('passed');
        expect(check(report, 'acceptance')).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/the run was cancelled before this was measured/) });
        expect(report.delivery.verdict.unmeasured).toEqual(['acceptance']);
        expect(report.passed).toBe(false);
        // Nothing the request named was judged, so none of it is proven — each says why.
        expect(report.unproven).toEqual([
            { id: 'R1', text: 'converts Celsius to Fahrenheit', reason: 'not judged: the run was cancelled before this was measured' },
            { id: 'R2', text: 'converts Fahrenheit to Celsius', reason: 'not judged: the run was cancelled before this was measured' },
        ]);
    });
});

describe('a partial delivery is not a delivery', () => {
    it('everything passes but one named capability: the verdict is partial, the report does not pass, and the result is not ok', async () => {
        const request = 'Build a one-page website for Maple Coffee House that shows the opening hours, a menu of drinks with prices, the phone number, and a search box for the menu.';
        const wanted: Wanted[] = [
            { text: 'opening hours', quote: 'the opening hours', line: 'Open every day from 7:00 to 19:00' },
            { text: 'a menu of drinks with prices', quote: 'a menu of drinks with prices', line: 'Maple latte — $4.80' },
        ];
        const dir = project({
            'index.html': '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Maple Coffee House</title>\n</head>\n<body>\n<h1>Maple Coffee House</h1>\n<p class="hours">Open every day from 7:00 to 19:00</p>\n<ul class="menu">\n<li>Maple latte — $4.80</li>\n</ul>\n<a class="phone" href="tel:+15550142">+1 555 0142</a>\n</body>\n</html>\n',
            'serve.js': "const http = require('http');\nconst fs = require('fs');\nconst path = require('path');\nhttp.createServer((req, res) => {\n  if (String(req.url || '/').split('?')[0] !== '/') { res.writeHead(404); return res.end('not found'); }\n  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });\n  res.end(fs.readFileSync(path.join(__dirname, 'index.html')));\n}).listen(Number(process.env.PORT) || 4174, '127.0.0.1');\n",
            'package.json': JSON.stringify({ name: 'maple', version: '1.0.0', private: true, scripts: { start: 'node serve.js' } }, null, 2),
        });
        const { ask } = model(wanted);
        const seeds = await seedRequirementsFromRequest(request, 'en', ask);
        const report = await finish({ ask, runTool, browserQa: watched }, runContext(dir, request, seeds));
        expect(report.checks.filter(c => c.status === 'failed').map(c => c.id)).toEqual(['scope']);
        expect(report.delivery.verdict.partial).toBe(true);
        expect(report.passed).toBe(false);
        expect(report.delivery.deliveryStatus).toBe('partial');
        const out = deliveryOutput({ result: { status: 'failed', summary: 'x', reason: 'the deadline arrived before the checks passed', verification: report, filesChanged: [], served: [], steps: 9, model: 'test' }, projectRoot: dir, request });
        expect(out.ok).toBe(false);
        expect(out.output).toMatchObject({ verified: false, partialDelivery: true, deliveryStatus: 'partial' });
        expect(out.output.results[0].status).toBe('partial');
    });
});

describe('the result the orchestrator, the receipt and the exam read', () => {
    const measurement = (instrument: string, ok: boolean, error?: string) => ({ instrument, ok, ...(error ? { error } : {}), target: '' });
    const fake = (measurements: any[], verdict: any, unproven: any[] = []): any => ({
        passed: verdict.verified, checks: [], unproven, at: 0,
        delivery: {
            projectRoot: '/w/p', primary: 'live', required: ['acceptance'], measurements, verdict,
            executionStatus: verdict.verified ? 'completed' : 'failed', verificationStatus: verdict.verified ? 'passed' : 'failed', deliveryStatus: verdict.verified ? 'delivered' : 'blocked',
            ...(verdict.verified ? { liveUrl: 'http://127.0.0.1:4300/' } : {}),
            notMeasured: { browser: 'no one is watching the panel' }, acceptance: { requirements: [], requestUnread: false, whyNotRead: '' }, stoppedServers: [], log: [],
        },
    });
    const result = (verification: any, status: 'delivered' | 'failed' | 'cancelled', extra: Record<string, unknown> = {}): any => ({
        status, summary: 'Built the page.', verification, filesChanged: [], served: [], steps: 5, model: 'test', ...extra,
    });
    const refused = () => fake(
        [measurement('acceptance', false, 'acceptance_criteria_unmet: req-1'), measurement('live', true), measurement('quality', false, 'project quality contract failed — build script is a placeholder: echo'), measurement('source', false, 'the source does not parse')],
        { verified: false, partial: false, failures: [], unmeasured: ['browser'], coverageFailed: false, unread: [], unverified: [], firstError: 'the source does not parse' },
        [{ id: 'R1', text: 'a counter', reason: 'not met: no button changes a number' }],
    );
    const verifiedReport = () => fake(
        [measurement('live', true), measurement('acceptance', true), measurement('browser', true)],
        { verified: true, partial: false, failures: [], unmeasured: [], coverageFailed: false, unread: [], unverified: [], firstError: '' },
    );

    it('task receipts follow the verdict\'s priority, so the first failed one is the failure that matters most', () => {
        const out = deliveryOutput({ result: result(refused(), 'failed', { reason: 'the model stopped calling tools before the checks passed' }), projectRoot: '/w/p', request: 'Build a page with a counter.' });
        expect(out.ok).toBe(false);
        expect(out.error).toBe('the source does not parse');
        expect(out.output.firstError).toBe('the source does not parse');
        expect(out.output.results[0].taskReceipts.map((r: any) => `${r.tool}:${r.ok}`)).toEqual([
            'delivery:live:true', 'delivery:source:false', 'delivery:quality:false', 'delivery:acceptance:false', 'delivery:browser:false',
        ]);
        expect(out.output.results[0].taskReceipts.find((r: any) => r.ok === false)).toEqual({ tool: 'delivery:source', ok: false, error: 'the source does not parse' });
        expect(out.output.results[0].taskReceipts[4].error).toBe('browser not measured: no one is watching the panel');
        expect(out.output).toMatchObject({ pipelineFinal: true, honestBlocker: true, verificationFailed: true, engineStatus: 'failed' });
        // The first failure is named as the delivery's blocker, never as a live-run failure it was not.
        expect(out.output.decisionEvidence.honestBlocker).toBe('delivery verification: the source does not parse');
    });

    it('the summary he reads is in his request\'s language, and names what is not proven', () => {
        const ar = deliveryOutput({ result: result(refused(), 'failed', { reason: 'the model stopped calling tools before the checks passed' }), projectRoot: '/w/p', request: 'ابنِ صفحة فيها عدّاد يزيد عند الضغط على زر' });
        expect(ar.output.summary).toMatch(/^⚠️ لم يُسلَّم المشروع: لم تُثبت فحوص جو التسليم — the source does not parse/);
        expect(ar.output.summary).toContain('ما لم يثبت من طلبك:\n- R1 a counter: not met: no button changes a number');
        expect(ar.output.summary).toContain('توقّف التشغيل: the model stopped calling tools before the checks passed');
        const en = deliveryOutput({ result: result(refused(), 'failed'), projectRoot: '/w/p', request: 'Build a page with a counter.' });
        expect(en.output.summary).toMatch(/^⚠️ Not delivered: Joe's delivery checks did not verify it — the source does not parse/);
        // The interface language, when known, outranks the script of the request.
        const ui = deliveryOutput({ result: result(refused(), 'failed'), projectRoot: '/w/p', request: 'Build a page with a counter.', language: 'ar' });
        expect(ui.output.summary).toMatch(/^⚠️ لم يُسلَّم المشروع/);
        const done = deliveryOutput({ result: result(verifiedReport(), 'delivered'), projectRoot: '/w/p', request: 'ابنِ صفحة فيها عدّاد' });
        expect(done.ok).toBe(true);
        expect(done.output.summary).toBe('Built the page.\n\n✅ تحقّقت فحوص جو من التسليم (live، acceptance، browser) — المعاينة الحية: http://127.0.0.1:4300/');
    });

    it('a verified report from a run that did not end delivered is not a delivery', () => {
        const out = deliveryOutput({ result: result(verifiedReport(), 'cancelled', { reason: 'the run was cancelled' }), projectRoot: '/w/p', request: 'Build a page with a counter.' });
        expect(out.ok).toBe(false);
        expect(out.output).toMatchObject({ verified: false, deliveryStatus: 'not_verified', engineStatus: 'cancelled' });
        expect(out.error).toBe('the run ended cancelled after its last verification: the run was cancelled');
        expect(out.output.liveUrl).toBeUndefined();
    });

    it('a run that never reached task_finish has nothing verified, and says so', () => {
        const out = deliveryOutput({ result: result(undefined, 'failed', { reason: 'the deadline arrived before the checks passed' }), projectRoot: '/w/p', request: 'Build a page with a counter.' });
        expect(out.ok).toBe(false);
        expect(out.output).toMatchObject({ verified: false, deliveryStatus: 'not_verified', pipelineFinal: true, firstError: 'the deadline arrived before the checks passed' });
        expect(out.output.results[0]).toMatchObject({ phaseName: 'delivery verification', status: 'failed', projectRoot: '/w/p', projectRootRuntimeBound: true });
        expect(out.output.results[0].taskReceipts).toEqual([{ tool: 'delivery:verification', ok: false, error: 'the deadline arrived before the checks passed' }]);
        const none = deliveryOutput({ result: undefined, projectRoot: '/w/p', request: 'x' });
        expect(none).toMatchObject({ ok: false, error: 'the engine returned no result, so nothing was verified' });
    });
});

describe('Joe\'s own panel, when nobody is watching it', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ws = require('../api/ws');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manager = require('../modules/browser/manager');

    it('is asked to come forward in this run\'s chat only, waited for, and reports that no one is watching', async () => {
        const broadcast = jest.spyOn(ws, 'broadcast').mockImplementation(() => undefined);
        const warm = jest.spyOn(manager, 'warmBrowserSession').mockImplementation(() => undefined);
        const qa = panelBrowserQa({ watchBudgetMs: 250 });
        const ctx = runContext(workspace, 'x', []);
        ctx.joe = { toolContext: { sessionId: 'chat-1', browserSessionId: 'browser:chat-1' } };
        const started = Date.now();
        await expect(qa.watcher(ctx)).resolves.toEqual({ sessionId: 'browser:chat-1', watching: false });
        expect(Date.now() - started).toBeGreaterThanOrEqual(200);
        expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'panel_focus', sessionId: 'chat-1', data: expect.objectContaining({ panel: 'browser' }) }));
        expect(warm).toHaveBeenCalledWith('browser:chat-1');
    });

    it('a run whose tools carry no panel session uses the one Joe derives for its chat, never a shared one', async () => {
        jest.spyOn(ws, 'broadcast').mockImplementation(() => undefined);
        const warm = jest.spyOn(manager, 'warmBrowserSession').mockImplementation(() => undefined);
        const ctx = runContext(workspace, 'x', []);
        ctx.joe = { toolContext: { sessionId: 'chat-2' } };
        await expect(panelBrowserQa({ watchBudgetMs: 50 }).watcher(ctx)).resolves.toEqual({ sessionId: 'browser:chat-2', watching: false });
        expect(warm).toHaveBeenCalledWith('browser:chat-2');
    });

    it('a panel session with no chat to address is still waited for, but nothing is broadcast to every user', async () => {
        const broadcast = jest.spyOn(ws, 'broadcast').mockImplementation(() => undefined);
        const warm = jest.spyOn(manager, 'warmBrowserSession').mockImplementation(() => undefined);
        const ctx = runContext(workspace, 'x', []);
        ctx.joe = { toolContext: { browserSessionId: 'browser:headless-run' } };
        await expect(panelBrowserQa({ watchBudgetMs: 50 }).watcher(ctx)).resolves.toEqual({ sessionId: 'browser:headless-run', watching: false });
        expect(warm).toHaveBeenCalledWith('browser:headless-run');
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('a run with no session at all has no panel to watch: nothing is broadcast to every user, and nothing is waited for', async () => {
        const broadcast = jest.spyOn(ws, 'broadcast').mockImplementation(() => undefined);
        const warm = jest.spyOn(manager, 'warmBrowserSession').mockImplementation(() => undefined);
        const ctx = runContext(workspace, 'x', []);
        ctx.joe = {};
        await expect(panelBrowserQa({ watchBudgetMs: 5_000 }).watcher(ctx)).resolves.toEqual({ sessionId: '', watching: false });
        expect(broadcast).not.toHaveBeenCalled();
        expect(warm).not.toHaveBeenCalled();
    });
});
