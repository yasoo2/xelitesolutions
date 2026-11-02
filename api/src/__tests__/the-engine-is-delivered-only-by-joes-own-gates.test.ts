/**
 * THE ENGINE'S task_finish IS JUDGED BY JOE'S OWN DELIVERY GATES.
 *
 * Small projects written by hand, the way the general engine's model writes
 * them — a static site, a tiny Express API, a command-line program, a page a
 * Python server renders — each with the request it was written for. Each is
 * verified for real: project_run starts it, quality_run builds and tests it,
 * the acceptance judge reads its source, and the verdict is deliveryVerdict
 * over one ledger. The only stand-ins are the model (a deterministic one that
 * answers the reader and the judge in their own formats, quoting real source
 * lines), the Browser panel the visible QA runs in, and the run's process
 * registry.
 *
 * Each project passes when the request is met, and fails on the instrument
 * that measured what is wrong: a requested item missing (acceptance, and the
 * records for an API), a build that fails (build), a server that does not
 * start (live), a program whose own tests fail (program). Without a panel
 * watcher Browser QA is not run and the delivery is not verified — never
 * passed.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createVerifier, deliveryOutput, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { EngineResult, ProcessInfo, ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(240_000);

const TOOL_CONTEXT = { sessionId: 'joe-eng-verify-session', workspaceId: 'joe-eng-verify', userId: 'joe-eng-verify-user', runId: 'joe-eng-verify-run' };
const workspace = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-verify-'));

/**
 * Express, installed for the API fixtures the way npm would install it: a real
 * copy of the package and the packages it needs, in the workspace's own
 * node_modules (Node finds it from every project folder below). Real files,
 * never a link, so removing the workspace removes only the copy.
 */
function installExpress(into: string): void {
    const apiRoot = path.resolve(__dirname, '..', '..');
    const top = fs.realpathSync(path.join(apiRoot, 'node_modules'));
    /** Where Node finds `name` from `from`: its own node_modules, then each parent's. */
    const locate = (name: string, from: string): string => {
        for (let dir = from; ; dir = path.dirname(dir)) {
            const base = path.basename(dir) === 'node_modules' ? dir : path.join(dir, 'node_modules');
            if (fs.existsSync(path.join(base, name, 'package.json'))) return fs.realpathSync(path.join(base, name));
            if (path.dirname(dir) === dir) throw new Error(`${name} is not installed`);
        }
    };
    const seen = new Set<string>();
    const visit = (name: string, from: string) => {
        const dir = locate(name, from);
        if (seen.has(dir)) return;
        seen.add(dir);
        const rel = path.relative(top, dir);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${name} resolved outside node_modules: ${dir}`);
        //  A package nested in another one's node_modules came with its parent's copy.
        if (!rel.split(path.sep).includes('node_modules')) {
            fs.cpSync(dir, path.join(into, 'node_modules', rel), { recursive: true, dereference: true });
        }
        const deps = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies || {};
        for (const dep of Object.keys(deps)) visit(dep, dir);
    };
    visit('express', apiRoot);
}
installExpress(workspace);

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-eng-verify-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
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

/** Joe's tools, run the way ToolService runs them: inside the execution firewall, with the run's context. */
const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    project_run: () => new ProjectRunTool(),
    project_stop: () => new ProjectStopTool(),
    quality_run: () => new QualityRunTool(),
    shell_execute: () => new ShellExecuteTool(),
};
const calls: Array<{ tool: string; input: any }> = [];
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    calls.push({ tool, input });
    return executionFirewall.runInContext(`joe-eng-verify-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
beforeEach(() => { calls.length = 0; });

interface Wanted { text: string; quote: string; line: string }

/**
 * A deterministic model in the shapes Joe's own parsers read. The reader is
 * answered with the requirements the test names, each quoted from the
 * request. The judge is answered per requirement it was shown: «met» with the
 * source line that carries the wanted text — copied out of the source the
 * prompt holds — or «unmet» when no line does.
 */
function model(wanted: Wanted[]) {
    const asked: string[] = [];
    const ask = async (prompt: string): Promise<string> => {
        if (prompt.startsWith('Read this request')) {
            asked.push('read');
            return JSON.stringify({ requirements: wanted.map(w => ({ text: w.text, quote: w.quote })) });
        }
        if (prompt.startsWith('Here is the source')) {
            asked.push('judge');
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
        throw new Error('the test model was asked something it does not answer');
    };
    return { ask, asked };
}

/** The Browser panel the visible QA runs in: watched, and its audit's result given. */
function panel(opts: { watching: boolean; findings?: any[] }): BrowserQa & { audits: Array<{ dir: string; opts: any }> } {
    const audits: Array<{ dir: string; opts: any }> = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-eng-verify-panel', watching: opts.watching }; },
        async audit(dir, auditOpts) {
            audits.push({ dir, opts: auditOpts });
            return { score: opts.findings?.length ? 72 : 100, findings: opts.findings || [] };
        },
    };
}

/** The run's process registry, holding what the test says the run started; stop() is recorded. */
function registry(running: ProcessInfo[] = []): ProcessRegistry & { stopped: string[] } {
    const stopped: string[] = [];
    return {
        stopped,
        async start() { throw new Error('not used'); },
        logs: () => undefined,
        async stop(name: string) {
            const p = running.find(x => x.name === name && x.running);
            if (!p) return false;
            p.running = false;
            stopped.push(name);
            return true;
        },
        list: () => running.map(p => ({ ...p })),
        async stopAll() { for (const p of running) p.running = false; },
    };
}

/** The run's context as the loop builds it, with the requirement ledger seeded by the engine's own seeder. */
async function runContext(dir: string, request: string, ask: (p: string) => Promise<string>, processes: ProcessRegistry = registry()): Promise<ToolContext> {
    const seeds = await seedRequirementsFromRequest(request, 'en', ask);
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };
    return {
        runId: 'joe-eng-verify-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + 15 * 60_000, language: 'en', request, processes,
        browser: () => { throw new Error('not used'); },
        state, emit: () => undefined, joe: {},
    };
}

async function verify(dir: string, request: string, wanted: Wanted[], qa: BrowserQa, processes?: ProcessRegistry): Promise<{ report: DeliveryVerification; ctx: ToolContext }> {
    const { ask } = model(wanted);
    const ctx = await runContext(dir, request, ask, processes);
    //  task_finish as the engine runs it: inside the orchestrator's execution context, like every tool of the run.
    const report = await executionFirewall.runInContext('joe-eng-verify-finish', () => createVerifier({ ask, runTool, browserQa: qa })(ctx, { summary: 'done' })) as DeliveryVerification;
    return { report, ctx };
}

/** What runEngine returns after this verification was its last task_finish. */
function engineResult(report: DeliveryVerification, summary = 'The page is live.'): EngineResult {
    return {
        status: report.passed ? 'delivered' : 'failed',
        summary: report.passed ? summary : 'the model stopped calling tools before the checks passed',
        ...(report.passed ? {} : { reason: 'the model stopped calling tools before the checks passed' }),
        verification: report, filesChanged: [], served: [], steps: 4, model: 'test',
    };
}

/** Does anything answer at this address now? */
function answers(url: string): Promise<boolean> {
    return new Promise(resolve => {
        const req = http.get(url, { timeout: 2500 }, res => { res.resume(); resolve(true); });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

const check = (report: DeliveryVerification, id: string) => report.checks.find(c => c.id === id);
const failedChecks = (report: DeliveryVerification) => report.checks.filter(c => c.status === 'failed').map(c => c.id);

/* ───────────────────────── a static site ───────────────────────── */

const SITE_REQUEST = 'Build a one-page website for Maple Coffee House that shows the opening hours, a menu of drinks with prices, and the phone number.';
const SITE_WANTED: Wanted[] = [
    { text: 'opening hours', quote: 'the opening hours', line: 'Open every day from 7:00 to 19:00' },
    { text: 'a menu of drinks with prices', quote: 'a menu of drinks with prices', line: 'Maple latte — $4.80' },
    { text: 'the phone number', quote: 'the phone number', line: 'href="tel:+15550142"' },
];
const SERVE_JS = [
    "const http = require('http');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css' };",
    'http.createServer((req, res) => {',
    "  const name = decodeURIComponent(String(req.url || '/').split('?')[0]);",
    "  const file = path.join(__dirname, name === '/' ? 'index.html' : name);",
    '  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {',
    "    res.writeHead(404, { 'content-type': 'text/plain' });",
    "    return res.end('not found');",
    '  }',
    "  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });",
    '  res.end(fs.readFileSync(file));',
    "}).listen(Number(process.env.PORT) || 4173, '127.0.0.1');",
    '',
].join('\n');

const PAGE_BODY = [
    '<header><h1>Maple Coffee House</h1></header>',
    '<main>',
    '<section id="hours"><h2>Opening hours</h2>',
    '<p class="hours">Open every day from 7:00 to 19:00</p>',
    '</section>',
    '<section id="menu"><h2>Menu</h2>',
    '<ul class="menu">',
    '<li>Espresso — $3.00</li>',
    '<li>Flat white — $4.20</li>',
    '<li>Maple latte — $4.80</li>',
    '</ul>',
    '</section>',
];

function sitePage(opts: { phone?: boolean } = {}): string {
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Maple Coffee House</title>',
        '<link rel="stylesheet" href="styles.css">',
        '</head>',
        '<body>',
        ...PAGE_BODY,
        ...(opts.phone === false ? [] : ['<section id="call"><h2>Call us</h2>', '<a class="phone" href="tel:+15550142">+1 555 0142</a>', '</section>']),
        '</main>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}

function site(opts: { phone?: boolean; build?: string } = {}): string {
    return project({
        'index.html': sitePage(opts),
        'styles.css': 'body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 42rem; padding: 1rem; }\n',
        'serve.js': SERVE_JS,
        'package.json': JSON.stringify({ name: 'maple-coffee-house', version: '1.0.0', private: true, scripts: { start: 'node serve.js', ...(opts.build ? { build: 'node build.js' } : {}) } }, null, 2),
        ...(opts.build ? { 'build.js': opts.build } : {}),
    });
}

describe('a static site', () => {
    it('is delivered when the page shows what was asked, it runs, and the watched panel found nothing to fix', async () => {
        const qa = panel({ watching: true });
        const { report } = await verify(site(), SITE_REQUEST, SITE_WANTED, qa);
        expect(failedChecks(report)).toEqual([]);
        expect(report.passed).toBe(true);
        expect(report.unproven).toEqual([]);
        expect(report.delivery.deliveryStatus).toBe('delivered');
        expect(check(report, 'live')?.status).toBe('passed');
        // A server still running the code before the last edit is never adopted: project_run restarts it.
        expect(calls).toContainEqual({ tool: 'project_run', input: { cwd: report.delivery.projectRoot, restart: true } });
        expect(check(report, 'acceptance')?.requirementIds).toEqual(['R1', 'R2', 'R3']);
        expect(check(report, 'build')?.status).toBe('skipped');
        // Its one script was parsed for real, by the goal Node runs it with.
        expect(check(report, 'source')).toEqual({ id: 'source', status: 'passed', detail: 'parsed 1 JavaScript file(s)' });
        // The visible audit ran in the panel, on the address project_run confirmed.
        expect(qa.audits).toHaveLength(1);
        expect(qa.audits[0].opts).toMatchObject({ requireVisibleBrowser: true, serveUrl: report.delivery.liveUrl, watchSessionId: 'joe-eng-verify-panel' });
        expect(report.delivery.required).toEqual(expect.arrayContaining(['acceptance', 'browser']));
        // A delivered project keeps its server: it is the live preview.
        expect(calls.some(c => c.tool === 'project_stop')).toBe(false);
        expect(await answers(String(report.delivery.liveUrl))).toBe(true);
        // And the orchestrator, the receipt and the exam read it as delivered.
        const out = deliveryOutput({ result: engineResult(report), projectRoot: report.delivery.projectRoot, request: SITE_REQUEST });
        expect(out.ok).toBe(true);
        expect(out.output).toMatchObject({ verified: true, deliveryStatus: 'delivered', pipelineFinal: true, liveUrl: report.delivery.liveUrl, engineStatus: 'delivered' });
        expect(out.output.summary).toMatch(/^The page is live\.\n\n✅ Joe's delivery checks verified it \(/);
        expect(out.output.results[0]).toMatchObject({ phaseName: 'delivery verification', status: 'completed', projectRootRuntimeBound: true, projectRoot: report.delivery.projectRoot });
        expect(out.output.results[0].taskReceipts.map((r: any) => r.tool)).toEqual(expect.arrayContaining(['delivery:live', 'delivery:acceptance', 'delivery:browser']));
        expect(out.output.results[0].taskReceipts.every((r: any) => r.ok)).toBe(true);
    });

    it('is refused on acceptance when a requested item is missing, says which requirement, and stops the server it started', async () => {
        const qa = panel({ watching: true });
        const { report } = await verify(site({ phone: false }), SITE_REQUEST, SITE_WANTED, qa);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['acceptance']);
        expect(report.unproven).toEqual([{ id: 'R3', text: 'the phone number', reason: expect.stringMatching(/^not met: no line of the source delivers the phone number/) }]);
        expect(report.delivery.verdict.firstError).toMatch(/^acceptance_criteria_unmet: /);
        // A refused delivery is never rescued by Browser QA.
        expect(qa.audits).toHaveLength(0);
        expect(check(report, 'browser')?.detail).toMatch(/never runs to rescue a refused delivery/);
        // The model goes on fixing: the server project_run started is gone, so the port is free for its own.
        expect(calls.filter(c => c.tool === 'project_stop')).toHaveLength(1);
        expect(await answers(String(report.delivery.liveUrl))).toBe(false);
        expect(check(report, 'live')?.detail).toMatch(/was stopped again, because the delivery is not verified/);
        const out = deliveryOutput({ result: engineResult(report), projectRoot: report.delivery.projectRoot, request: SITE_REQUEST });
        expect(out.ok).toBe(false);
        expect(out.output.liveUrl).toBeUndefined();
        expect(out.output.firstError).toMatch(/^acceptance_criteria_unmet: /);
        expect(out.output.summary).toMatch(/^⚠️ Not delivered: Joe's delivery checks did not verify it — acceptance_criteria_unmet: /);
        expect(out.output.summary).toContain('- R3 the phone number: not met: ');
    });

    it('is refused on the build when the build the request names fails', async () => {
        const qa = panel({ watching: true });
        const failing = "console.error('build.js: the dist folder could not be written');\nprocess.exit(1);\n";
        const request = `${SITE_REQUEST} Its build step (npm run build) writes the page into dist/.`;
        const { report } = await verify(site({ build: failing }), request, SITE_WANTED, qa);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['build']);
        expect(check(report, 'build')?.detail).toMatch(/the build failed \(the request names the build\)/);
        expect(report.delivery.verdict.firstError).toMatch(/^the build failed/);
        expect(calls.some(c => c.tool === 'quality_run' && c.input.tasks?.[0] === 'build')).toBe(true);
        expect(qa.audits).toHaveLength(0);
    });

    it('without anyone watching the panel, Browser QA is not run and the delivery is not verified — never passed', async () => {
        const qa = panel({ watching: false });
        const { report } = await verify(site(), SITE_REQUEST, SITE_WANTED, qa);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual([]);
        expect(report.delivery.verdict.unmeasured).toEqual(['browser']);
        expect(check(report, 'browser')).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/^not measured, and the delivery needs it: visible Browser QA runs only in the Browser panel, and no one is watching it/) });
        expect(qa.audits).toHaveLength(0);
        expect(report.delivery.measurements.some(m => m.instrument === 'browser')).toBe(false);
        const out = deliveryOutput({ result: engineResult(report), projectRoot: report.delivery.projectRoot, request: SITE_REQUEST });
        expect(out.ok).toBe(false);
        expect(out.output.deliveryStatus).toBe('not_verified');
        const failed = out.output.results[0].taskReceipts.find((r: any) => r.ok === false);
        expect(failed).toMatchObject({ tool: 'delivery:browser', error: expect.stringMatching(/^browser not measured: /) });
    });

    it('is refused on browser when the visible audit finds something, and the finding reaches the model', async () => {
        const qa = panel({ watching: true, findings: [{ id: 'h1_count', severity: 'low', detail: 'عنوانان رئيسيان', detailEn: 'the page has two h1 headings', evidence: ['h1'] }] });
        const { report } = await verify(site(), SITE_REQUEST, SITE_WANTED, qa);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['browser']);
        expect(check(report, 'browser')?.detail).toMatch(/browser QA found 1 blocking finding\(s\): h1_count — the page has two h1 headings/);
    });

    it('a site whose own start script dies is still served, by project_run\'s static server, and the check says which served it', async () => {
        const dir = site();
        fs.writeFileSync(path.join(dir, 'serve.js'), "throw new Error('the port setting is missing');\n");
        const qa = panel({ watching: true });
        const { report } = await verify(dir, SITE_REQUEST, SITE_WANTED, qa);
        // A page asked for on its own needs no server of its own: the fallback is kept (round 15, finding 28).
        expect(check(report, 'live')).toMatchObject({ status: 'passed', detail: expect.stringMatching(/answers at http:\/\/[^ ]+ \(static-site\)$/) });
        expect(qa.audits).toHaveLength(1);
        expect(report.passed).toBe(true);
    });

    it('a check that raises is a failure in its own name, never a pass', async () => {
        const qa: BrowserQa = {
            async watcher() { return { sessionId: 'joe-eng-verify-panel', watching: true }; },
            async audit() { throw new Error('the panel browser crashed'); },
        };
        const { report } = await verify(site(), SITE_REQUEST, SITE_WANTED, qa);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['browser']);
        expect(check(report, 'browser')?.detail).toBe('the browser check could not run: the panel browser crashed');
    });

    it('a server that answers the address but serves no page is refused on browser when the request asks for an interface', async () => {
        const dir = project({
            'server.js': [
                "const express = require('express');",
                'const app = express();',
                "app.get('/', (req, res) => res.json({ hours: 'Open every day from 7:00 to 19:00', menu: ['Maple latte — $4.80'], phone: 'href=\"tel:+15550142\"' }));",
                "app.listen(Number(process.env.PORT) || 3000, '127.0.0.1');",
                '',
            ].join('\n'),
            'package.json': JSON.stringify({ name: 'maple-json', version: '1.0.0', private: true, scripts: { start: 'node server.js' }, dependencies: { express: '^5.2.1' } }, null, 2),
        });
        const qa = panel({ watching: true });
        const { report } = await verify(dir, SITE_REQUEST, SITE_WANTED, qa);
        expect(check(report, 'live')?.status).toBe('passed');
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['browser']);
        expect(check(report, 'browser')?.detail).toBe('the request asks for an interface, but no delivered part serves one (no page is served at the live address)');
        expect(qa.audits).toHaveLength(0);
    });
});

/* ───────────────────────── a tiny Express API ───────────────────────── */

const API_REQUEST = 'Build a REST API for a small bookshop with endpoints for books and authors.';
const API_WANTED: Wanted[] = [
    { text: 'endpoints for books', quote: 'endpoints for books', line: "app.get('/api/books'" },
    { text: 'endpoints for authors', quote: 'books and authors', line: "app.get('/api/authors'" },
];

function api(opts: { authors?: boolean; crash?: boolean } = {}): string {
    const server = [
        "const express = require('express');",
        '',
        'const books = [',
        "  { id: 1, title: 'The Left Hand of Darkness', authorId: 1 },",
        "  { id: 2, title: 'Kindred', authorId: 2 },",
        '];',
        'const authors = [',
        "  { id: 1, name: 'Ursula K. Le Guin' },",
        "  { id: 2, name: 'Octavia E. Butler' },",
        '];',
        '',
        'const app = express();',
        "app.get('/api/books', (req, res) => res.json(books));",
        ...(opts.authors === false ? [] : ["app.get('/api/authors', (req, res) => res.json(authors));"]),
        '',
        ...(opts.crash ? ["throw new Error('the bookshop database file is missing');"] : []),
        "app.listen(Number(process.env.PORT) || 3000, '127.0.0.1');",
        '',
    ].join('\n');
    return project({
        'server.js': server,
        'package.json': JSON.stringify({ name: 'bookshop-api', version: '1.0.0', private: true, scripts: { start: 'node server.js' }, dependencies: { express: '^5.2.1' } }, null, 2),
    });
}

describe('a tiny Express API', () => {
    it('is delivered when it starts and serves every record the request named', async () => {
        const qa = panel({ watching: true });
        const { report } = await verify(api(), API_REQUEST, API_WANTED, qa);
        expect(failedChecks(report)).toEqual([]);
        expect(report.passed).toBe(true);
        expect(check(report, 'coverage')?.status).toBe('passed');
        expect(report.delivery.requestCoverage?.records.map(r => [r.key, r.served])).toEqual([['books', true], ['authors', true]]);
        expect(check(report, 'service')?.status).toBe('passed');
        // An API serves no page: there is nothing for Browser QA to open, and it is not required.
        expect(check(report, 'browser')).toMatchObject({ status: 'skipped', detail: 'no interface is delivered, so there is no page to open' });
        expect(report.delivery.required).not.toContain('browser');
        expect(qa.audits).toHaveLength(0);
    });

    it('is refused on the records and on acceptance when a requested record is not served', async () => {
        const { report } = await verify(api({ authors: false }), API_REQUEST, API_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['coverage', 'acceptance']);
        expect(check(report, 'coverage')?.detail).toMatch(/^requested_entities_not_delivered: authors\b[^|]*\(not served\)/);
        expect(report.unproven.map(u => u.id)).toEqual(['R2']);
        expect(report.delivery.deliveryStatus).toBe('blocked');
        // The records come first in the verdict's own priority.
        expect(report.delivery.verdict.firstError).toMatch(/^requested_entities_not_delivered: authors/);
    });

    it('is refused on the build when the build the request names fails', async () => {
        const dir = api();
        fs.writeFileSync(path.join(dir, 'build.js'), "console.error('build.js: the route table could not be generated');\nprocess.exit(1);\n");
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        manifest.scripts.build = 'node build.js';
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
        const request = `${API_REQUEST} Run its build step (npm run build) before it starts.`;
        const { report } = await verify(dir, request, API_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['build']);
        expect(check(report, 'build')?.detail).toMatch(/^the build failed \(the request names the build\): .*the route table could not be generated/s);
        expect(report.delivery.verdict.firstError).toMatch(/^the build failed/);
    });

    it('is refused on the live run when the server does not start, and says what project_run saw', async () => {
        const { report } = await verify(api({ crash: true }), API_REQUEST, API_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['live']);
        expect(check(report, 'live')?.detail).toMatch(/answered on no port/);
        // What only a running server can show is not judged on a dead one.
        expect(check(report, 'coverage')).toMatchObject({ status: 'skipped', detail: 'not measured: the live run failed' });
        expect(check(report, 'quality')?.detail).toMatch(/^not judged: the live run failed first/);
        // The source still proves what it proves.
        expect(check(report, 'acceptance')?.status).toBe('passed');
        const out = deliveryOutput({ result: engineResult(report), projectRoot: report.delivery.projectRoot, request: API_REQUEST });
        expect(out.output.results[0].taskReceipts.find((r: any) => r.ok === false)?.tool).toBe('delivery:live');
        expect(out.output.decisionEvidence.honestBlocker).toMatch(/^live_run: /);
    });
});

/* ───────────────────────── a page its own Python server renders ───────────────────────── */

const PYTHON_SERVER = [
    'import os',
    'from http.server import BaseHTTPRequestHandler, HTTPServer',
    '',
    'PAGE = """<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Maple Coffee House</title></head>',
    '<body>',
    ...PAGE_BODY,
    '<section id="call"><h2>Call us</h2>',
    '<a class="phone" href="tel:+15550142">+1 555 0142</a>',
    '</section>',
    '</main>',
    '</body>',
    '</html>',
    '"""',
    '',
    '',
    'class Page(BaseHTTPRequestHandler):',
    '    def do_GET(self):',
    "        if self.path.split('?')[0] != '/':",
    '            self.send_response(404)',
    '            self.end_headers()',
    '            return',
    "        body = PAGE.encode('utf-8')",
    '        self.send_response(200)',
    "        self.send_header('Content-Type', 'text/html; charset=utf-8')",
    "        self.send_header('Content-Length', str(len(body)))",
    '        self.end_headers()',
    '        self.wfile.write(body)',
    '',
    '    def log_message(self, *args):',
    '        pass',
    '',
    '',
    "HTTPServer(('127.0.0.1', int(os.environ.get('PORT', '8000'))), Page).serve_forever()",
    '',
].join('\n');

const served = (over: Partial<ProcessInfo> & { name: string }): ProcessInfo => ({
    command: 'python serve.py', cwd: '.', running: true, url: 'http://127.0.0.1:8000/', startedAt: Date.now(), ...over,
});

describe('a server Joe has no start command for', () => {
    it('is started with the command this run\'s own server was seen serving with, after that server is stopped', async () => {
        const dir = project({ 'serve.py': PYTHON_SERVER });
        const processes = registry([
            served({ name: 'site' }),
            // A process that serves no address (a database, a watcher) keeps running: the project may need it.
            served({ name: 'db', command: 'python db.py', url: undefined }),
            // One outside the project folder is not this project's to stop.
            served({ name: 'elsewhere', cwd: '../other' }),
        ]);
        const qa = panel({ watching: true });
        const { report } = await verify(dir, SITE_REQUEST, SITE_WANTED, qa, processes);
        expect(processes.stopped).toEqual(['site']);
        expect(calls).toContainEqual({ tool: 'project_run', input: { cwd: dir, restart: true, command: 'python serve.py' } });
        expect(failedChecks(report)).toEqual([]);
        expect(check(report, 'live')?.detail).toMatch(/answers at http:\/\/[^ ]+ \(override\)/);
        expect(check(report, 'live')?.detail).toMatch(/this run's own server\(s\) site were stopped first/);
        expect(check(report, 'live')?.detail).toMatch(/started with the command this run's server site was seen serving with: python serve\.py/);
        // The page the server renders is the interface; its Python source is what the judge read.
        expect(qa.audits).toHaveLength(1);
        expect(report.delivery.acceptance.requirements.map(r => r.verdict)).toEqual(['met', 'met', 'met']);
        expect(report.delivery.stoppedServers).toEqual(['site']);
        expect(report.passed).toBe(true);
    });

    it('is never guessed: with no server of this run seen serving, project_run gets no command and the live run fails', async () => {
        const dir = project({ 'serve.py': PYTHON_SERVER });
        const { report } = await verify(dir, SITE_REQUEST, SITE_WANTED, panel({ watching: true }), registry([]));
        expect(calls.filter(c => c.tool === 'project_run').map(c => c.input)).toEqual([{ cwd: dir, restart: true }]);
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['live']);
    });
});

/* ───────────────────────── a command-line program ───────────────────────── */

const CLI_REQUEST = 'Write a command-line tool in Node.js that converts Celsius to Fahrenheit and Fahrenheit to Celsius, with unit tests.';
const CLI_WANTED: Wanted[] = [
    { text: 'converts Celsius to Fahrenheit', quote: 'converts Celsius to Fahrenheit', line: 'return celsius * 9 / 5 + 32;' },
    { text: 'converts Fahrenheit to Celsius', quote: 'Fahrenheit to Celsius', line: 'return (fahrenheit - 32) * 5 / 9;' },
];

function cli(opts: { toCelsius?: boolean; wrongTest?: boolean; build?: string } = {}): string {
    const both = opts.toCelsius !== false;
    return project({
        'convert.js': [
            'function toFahrenheit(celsius) {',
            '  return celsius * 9 / 5 + 32;',
            '}',
            ...(both ? ['function toCelsius(fahrenheit) {', '  return (fahrenheit - 32) * 5 / 9;', '}'] : []),
            `module.exports = { toFahrenheit${both ? ', toCelsius' : ''} };`,
            '',
        ].join('\n'),
        'cli.js': [
            '#!/usr/bin/env node',
            `const { toFahrenheit${both ? ', toCelsius' : ''} } = require('./convert');`,
            'const [direction, value] = process.argv.slice(2);',
            'const degrees = Number(value);',
            `if (!['c2f'${both ? ", 'f2c'" : ''}].includes(direction) || !Number.isFinite(degrees)) {`,
            `  console.error('usage: tempconv c2f${both ? '|f2c' : ''} <degrees>');`,
            '  process.exit(2);',
            '}',
            `console.log(${both ? "direction === 'c2f' ? toFahrenheit(degrees) : toCelsius(degrees)" : 'toFahrenheit(degrees)'});`,
            '',
        ].join('\n'),
        'test/convert.test.js': [
            "const test = require('node:test');",
            "const assert = require('node:assert');",
            `const { toFahrenheit${both ? ', toCelsius' : ''} } = require('../convert');`,
            `test('100 Celsius is 212 Fahrenheit', () => { assert.strictEqual(toFahrenheit(100), ${opts.wrongTest ? 211 : 212}); });`,
            ...(both ? ["test('32 Fahrenheit is 0 Celsius', () => { assert.strictEqual(toCelsius(32), 0); });"] : []),
            '',
        ].join('\n'),
        'package.json': JSON.stringify({
            name: 'tempconv', version: '1.0.0', private: true, bin: { tempconv: 'cli.js' },
            scripts: { test: 'node --test', ...(opts.build ? { build: 'node build.js' } : {}) },
        }, null, 2),
        ...(opts.build ? { 'build.js': opts.build } : {}),
    });
}

describe('a command-line program', () => {
    it('is delivered by its own passing tests, with no address to confirm', async () => {
        const { report } = await verify(cli(), CLI_REQUEST, CLI_WANTED, panel({ watching: true }));
        expect(failedChecks(report)).toEqual([]);
        expect(report.passed).toBe(true);
        expect(report.delivery.primary).toBe('program');
        expect(check(report, 'program')?.status).toBe('passed');
        expect(check(report, 'quality')?.status).toBe('passed');
        expect(check(report, 'live')?.status).toBe('skipped');
        expect(calls.some(c => c.tool === 'project_run')).toBe(false);
    });

    it('is refused on acceptance when one of the requested conversions is missing', async () => {
        const { report } = await verify(cli({ toCelsius: false }), CLI_REQUEST, CLI_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['acceptance']);
        expect(report.unproven.map(u => [u.id, u.text])).toEqual([['R2', 'converts Fahrenheit to Celsius']]);
    });

    it('is refused on the program when its own tests fail', async () => {
        const { report } = await verify(cli({ wrongTest: true }), CLI_REQUEST, CLI_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['program']);
        expect(check(report, 'program')?.detail).toMatch(/the program's own tests did not pass/);
    });

    it('is refused on the build when the request names a build and it fails', async () => {
        const failing = "console.error('build.js: the bundle step failed');\nprocess.exit(1);\n";
        const request = `${CLI_REQUEST} Package it with npm run build.`;
        const { report } = await verify(cli({ build: failing }), request, CLI_WANTED, panel({ watching: true }));
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['build']);
        expect(report.delivery.verdict.verified).toBe(false);
    });
});

/* ───────────────────────── a requirement about the look ───────────────────────── */

const LOOK_REQUEST = 'Build a one-page website for Maple Coffee House with an elegant design that shows the opening hours, a menu of drinks with prices, and the phone number.';
const LOOK_WANTED: Wanted[] = [...SITE_WANTED, { text: 'an elegant design', quote: 'an elegant design', line: 'NOT_A_LINE_OF_ANY_SOURCE' }];

/** The watched panel, saving the landing screenshot where the verifier asked. */
function panelWithEyes(): BrowserQa & { audits: Array<{ dir: string; opts: any }> } {
    const audits: Array<{ dir: string; opts: any }> = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-eng-verify-panel', watching: true }; },
        async audit(dir, auditOpts) {
            audits.push({ dir, opts: auditOpts });
            if (!auditOpts.lookPath) return { score: 100, findings: [] };
            fs.mkdirSync(path.dirname(auditOpts.lookPath), { recursive: true });
            fs.writeFileSync(auditOpts.lookPath, Buffer.from('the landing view'));
            return { score: 100, findings: [], look: { path: auditOpts.lookPath, url: String(auditOpts.serveUrl) } };
        },
    };
}

async function verifyLook(answer: { verdict: string; why: string } | null) {
    const { ask: answers } = model(LOOK_WANTED);
    const judged: string[] = [];
    const ask = async (prompt: string) => {
        if (prompt.startsWith('Here is the source')) judged.push(prompt);
        return answers(prompt);
    };
    const shown: Array<{ prompt: string; image: { mime: string; data: string } }> = [];
    const look = answer && (async (prompt: string, image: { mime: string; data: string }) => {
        shown.push({ prompt, image });
        const id = /\[([^\]]+)\] an elegant design/u.exec(prompt)?.[1];
        return JSON.stringify({ verdicts: [{ id, ...answer }] });
    });
    const ctx = await runContext(site(), LOOK_REQUEST, ask);
    const qa = panelWithEyes();
    const report = await executionFirewall.runInContext('joe-eng-verify-finish', () =>
        createVerifier({ ask, runTool, browserQa: qa, ...(look ? { look } : {}) })(ctx, { summary: 'done' })) as DeliveryVerification;
    return { report, judged, shown, qa };
}

describe('a requirement about how the page looks (2026-11-02: «التصميم أنيق» refused a working page)', () => {
    it('is judged on the page\'s screenshot, never on the source, and a page that looks so is delivered', async () => {
        const { report, judged, shown, qa } = await verifyLook({ verdict: 'met', why: 'warm colours, clear type and generous spacing' });
        expect(report.passed).toBe(true);
        expect(failedChecks(report)).toEqual([]);
        expect(report.unproven).toEqual([]);
        //  The source judge was never asked about the look.
        expect(judged.length).toBeGreaterThan(0);
        for (const p of judged) expect(p).not.toContain('an elegant design');
        //  The audit was asked for the landing view, and that picture was shown.
        expect(qa.audits[0].opts.lookPath).toMatch(/[\\/]look[\\/]page-\d+\.jpg$/u);
        expect(shown).toHaveLength(1);
        expect(shown[0].image).toEqual({ mime: 'image/jpeg', data: Buffer.from('the landing view').toString('base64') });
        expect(shown[0].prompt).toContain('A preference is not a defect');
        expect(report.delivery.acceptance.requirements).toContainEqual(expect.objectContaining({ id: 'R4', verdict: 'met', judgedBy: 'sight' }));
        expect(check(report, 'browser')?.detail).toContain('seen on the page\'s screenshot: R4 warm colours');
    });

    it('a visible defect the judge names blocks the delivery as a Browser QA failure, with the requirement', async () => {
        const { report } = await verifyLook({ verdict: 'unmet', why: 'the menu is light grey on white and cannot be read' });
        expect(report.passed).toBe(false);
        expect(failedChecks(report)).toEqual(['browser']);
        expect(check(report, 'browser')?.detail).toContain('R4 «an elegant design» does not look as he asked: the menu is light grey on white');
        expect(report.unproven).toEqual([{ id: 'R4', text: 'an elegant design', reason: 'not met, seen on the page: the menu is light grey on white and cannot be read' }]);
    });

    it('a model that cannot see leaves it unjudged by eye, says so, and does not block', async () => {
        const { report, shown } = await verifyLook(null);
        expect(shown).toHaveLength(0);
        expect(report.passed).toBe(true);
        expect(report.unproven).toEqual([{ id: 'R4', text: 'an elegant design', reason: expect.stringMatching(/^not judged by eye \(this does not block the delivery\): the chosen model cannot see images/u) }]);
    });
});
