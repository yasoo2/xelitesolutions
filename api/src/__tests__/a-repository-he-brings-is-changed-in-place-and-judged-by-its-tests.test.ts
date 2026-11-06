/**
 * A REPOSITORY HE BRINGS IS CHANGED IN PLACE, AND JUDGED BY ITS OWN TESTS.
 *
 * The Codex exam (2026-11-06): an existing repository Joe did not write, and
 * an issue. Three things stood between Joe and the work:
 *
 *  - routing: the engine changes a folder in place only for a project it
 *    built in the chat, and only when the message opens with a change verb;
 *    an issue («Bug: invoice totals are wrong…», «CI is red…», «عند وجود
 *    فاصلة…») became a new build, or went to the old planner;
 *  - registration: an import landed beside the workspace and was recorded
 *    nowhere; a change run's re-registration would forget where it came from;
 *  - the verdict: a library with no server could not pass the live run, its
 *    own tests were never the verdict, and a source problem it already had
 *    blocked a correct change.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { agentEngineRoute, chatProjectOrigin, isRepositoryWork } from '../core/engine/select';
import { projectOriginFor, registerImportedProject, registerProjectFolder } from '../core/engine/run';
import { writeJoeProject } from '../api/page-store';
import { previewKey } from '../modules/tools/preview-site';
import { createVerifier, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(240_000);
const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-repo-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }));
const AGENT = { JOE_ENGINE: 'agent' } as NodeJS.ProcessEnv;

const ISSUES = [
    'Bug: invoice totals are wrong when an invoice has both a discount and tax. An invoice of 100.00 with a 10% discount and 5% tax should total 94.50, but invoiceTotal returns 95.00.',
    'خطأ في قراءة ملف الرحلات: عندما يحتوي حقل على فاصلة بين علامتي تنصيص ينقسم الحقل إلى حقلين وتختلط الأعمدة.',
    'Feature request for this CLI: `todo list --json` should print the tasks as a JSON array.',
    'CI is red on this repository: the test suite in tests/ fails. Make the whole suite pass by fixing the library code.',
    'Performance: importing a CRM file of 200,000 customers hangs for minutes in findDuplicates.',
    'أضف ترقيم الصفحات إلى نقطة GET /api/trips في هذا الخادم مع المعاملين page و limit.',
    'Customers complain that coupons stop working one day early.',
    'Security issue: the /download endpoint lets a client read files outside the uploads folder.',
];

function chat(sessionId: string, origin?: 'imported' | 'built'): string {
    const dir = path.join(root, `repo-${sessionId}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# a repository\n');
    writeJoeProject(previewKey(sessionId), { dir, type: 'agent', updatedAt: Date.now(), ...(origin ? { origin } : {}) }, 'run-earlier');
    return dir;
}

describe('an issue in a chat whose project is his repository changes that repository', () => {
    it('every issue of the exam is work on the repository', () => {
        for (const issue of ISSUES) expect([issue, isRepositoryWork(issue)]).toEqual([issue, true]);
    });

    it('a question, a greeting, or a new project is not', () => {
        for (const text of ['ما الفرق بين localStorage و sessionStorage؟', 'hello there Joe', 'build me a new booking app for a salon']) {
            expect([text, isRepositoryWork(text)]).toEqual([text, false]);
        }
    });

    it('routed into his folder when the chat imported it', async () => {
        const dir = chat('chat-imported', 'imported');
        expect(chatProjectOrigin('chat-imported')).toBe('imported');
        for (const issue of ISSUES) {
            expect(await agentEngineRoute(issue, { sessionId: 'chat-imported' }, AGENT)).toEqual({ kind: 'change', path: dir });
        }
    });

    it('a project Joe built keeps its own rule: an issue without a change verb is not read as a change of it', async () => {
        chat('chat-built', 'built');
        const route = await agentEngineRoute(ISSUES[6], { sessionId: 'chat-built' }, AGENT);
        expect(route?.kind).not.toBe('change');
    });

    it('a new project asked for in his chat is still a new build', async () => {
        chat('chat-imported-2', 'imported');
        const route = await agentEngineRoute('Build me a new booking app for a hair salon with a calendar.', { sessionId: 'chat-imported-2' }, AGENT);
        expect(route).toEqual({ kind: 'build' });
    });
});

describe('the chat remembers where its project came from', () => {
    it('an import is his repository, and a change run does not forget it', () => {
        const dir = path.join(root, 'imported-1');
        fs.mkdirSync(dir, { recursive: true });
        registerImportedProject('chat-reg', dir);
        expect(projectOriginFor('chat-reg', dir)).toBe('imported');
        registerProjectFolder('chat-reg', 'run-change', dir, 'fix the totals');
        expect(projectOriginFor('chat-reg', dir)).toBe('imported');
    });

    it('a new folder registered in the chat is not his repository', () => {
        const other = path.join(root, 'joe-app-new');
        fs.mkdirSync(other, { recursive: true });
        registerProjectFolder('chat-reg', 'run-build', other, 'build a site');
        expect(projectOriginFor('chat-reg', other)).toBeUndefined();
    });
});

/* ───────────── the verdict on a change of his repository ───────────── */

const TOOL_CONTEXT = { sessionId: 'joe-repo-verify', workspaceId: 'joe-repo-verify', userId: 'joe-repo-user', runId: 'joe-repo-run' };
const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    quality_run: () => new QualityRunTool(), shell_execute: () => new ShellExecuteTool(),
    project_run: () => new ProjectRunTool(), project_stop: () => new ProjectStopTool(),
};
const calls: string[] = [];
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    calls.push(tool);
    return executionFirewall.runInContext(`joe-repo-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
beforeEach(() => { calls.length = 0; jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root); });
afterEach(() => jest.restoreAllMocks());

const ISSUE = 'Bug: invoice totals are wrong when an invoice has both a discount and tax: the discount must come off the subtotal before tax.';
const WANTED = [{ text: 'the discount comes off the subtotal before tax', quote: 'the discount must come off the subtotal before tax', line: 'const base = sub - pct(sub, inv.discountPct)' }];
function model() {
    return async (prompt: string): Promise<string> => {
        if (prompt.startsWith('Read this request')) return JSON.stringify({ requirements: WANTED.map(w => ({ text: w.text, quote: w.quote })) });
        if (prompt.startsWith('Here is the source')) {
            const source = prompt.slice(prompt.indexOf('SOURCE:\n') + 'SOURCE:\n'.length, prompt.indexOf('\n\nFor each requirement below'));
            const verdicts = [...prompt.matchAll(/^\s+\d+\. \[([^\]]+)\] (.+?) {3}\(he wrote: «/gmu)].map(m => {
                const line = source.split('\n').find(l => l.includes(WANTED[0].line));
                return line ? { id: m[1], verdict: 'met', evidence: line.trim(), why: 'the discounted base is taxed' } : { id: m[1], verdict: 'unmet', evidence: '', why: 'tax is still on the subtotal' };
            });
            return JSON.stringify({ verdicts });
        }
        throw new Error('not asked here');
    };
}
const noPanel: BrowserQa = { async watcher() { return { sessionId: '', watching: false }; }, async audit() { throw new Error('no Browser QA on a repository change'); } } as any;
const processes: ProcessRegistry = { async start() { throw new Error('not used'); }, logs: () => undefined, async stop() { return false; }, list: () => [], async stopAll() { /* none */ } } as any;

let n = 0;
function repo(invoice: string, test: string, extra: Record<string, string> = {}): string {
    const dir = path.join(root, `invoice-kit-${++n}`);
    const files: Record<string, string> = {
        'package.json': JSON.stringify({ name: 'invoice-kit', private: true, scripts: { test: 'node --test' } }),
        'src/invoice.js': invoice,
        'test/invoice.test.js': test,
        ...extra,
    };
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}
const FIXED = [
    "'use strict';",
    'const roundCents = x => Math.floor(x + 0.5);',
    'const pct = (amount, p) => roundCents(amount * (p || 0) / 100);',
    'function invoiceTotal(inv) {',
    '  const sub = inv.lines.reduce((s, l) => s + l.qty * l.unitCents, 0);',
    '  const base = sub - pct(sub, inv.discountPct);',
    '  return base + pct(base, inv.taxPct);',
    '}',
    'module.exports = { invoiceTotal };',
].join('\n');
const TEST = [
    "const test = require('node:test'); const assert = require('node:assert');",
    "const { invoiceTotal } = require('../src/invoice');",
    "test('discount before tax', () => assert.strictEqual(invoiceTotal({ lines: [{ qty: 1, unitCents: 10000 }], discountPct: 10, taxPct: 5 }), 9450));",
].join('\n');

async function verifyChange(dir: string, baselineSourceProblems: string[] = []): Promise<DeliveryVerification> {
    const ask = model();
    const seeds = await seedRequirementsFromRequest(ISSUE, 'en', ask);
    const state: RunState = { plan: newPlan(seededRequirements(seeds)), files: new Map(), commands: [], served: [], pages: [], verifications: [], steps: 0, modelMs: 0, toolMs: 0 };
    const ctx: ToolContext = {
        runId: 'joe-repo-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + 10 * 60_000, language: 'en', request: ISSUE, processes,
        browser: () => { throw new Error('not used'); }, state, emit: () => undefined, joe: {},
        change: { history: [], repository: { baselineSourceProblems } },
    };
    return executionFirewall.runInContext('joe-repo-finish', () => createVerifier({ ask, runTool, browserQa: noPanel })(ctx, { summary: 'fixed' })) as Promise<DeliveryVerification>;
}
const status = (r: DeliveryVerification, id: string) => r.checks.find(c => c.id === id)?.status;

describe('a change to his repository is judged by its own tests', () => {
    it('a library with no server: its tests pass and the judge finds the fix — delivered, with no live run', async () => {
        const report = await verifyChange(repo(FIXED, TEST));
        expect(report.passed).toBe(true);
        expect(status(report, 'program')).toBe('passed');
        expect(calls).not.toContain('project_run');
    });

    it('its own tests failing is what refuses the change', async () => {
        const report = await verifyChange(repo(FIXED.replace('base + pct(base, inv.taxPct)', 'sub + pct(sub, inv.taxPct) - pct(sub, inv.discountPct)'), TEST));
        expect(report.passed).toBe(false);
        expect(status(report, 'program')).toBe('failed');
    });

    it('a source problem the repository already had is its own, and a new one is the change\'s', async () => {
        //  A stray script the repository carried, broken long before this change.
        const broken = { 'scripts/old_migrate.py': 'def migrate(:\n    pass\n' };
        const before = repo(FIXED, TEST, broken);
        const { measureProjectSource } = require('../core/engine/verify');
        const baseline = (await measureProjectSource(before, Date.now() + 60_000)).problems;
        expect(baseline.length).toBeGreaterThan(0);
        const inherited = await verifyChange(before, baseline);
        expect(status(inherited, 'source')).not.toBe('failed');
        expect(inherited.passed).toBe(true);
        const fresh = await verifyChange(repo(FIXED, TEST, broken), []);
        expect(status(fresh, 'source')).toBe('failed');
    });
});
