/**
 * ⛔ AN AUDIT THAT HOLDS ONLY TOLD LINES IS DELIVERED ON EVERY PATH (review r40-2, 2026-11-15).
 *
 * Design v3 (D:\Joe\eval\egm\designs\2026-11-15-ui-inspection-revival-v3.md): what the
 * inspector writes (INSPECTOR_TOLD) is told with the delivery — at every severity. Five
 * places judge a browser audit: verify.ts, the pipeline, project_repair, the edit path
 * and the React build (its improve loop, its model rounds and its qualityDeliveryBlocked
 * gate). Each one is handed here the same audit — contrast, a table spilling off the
 * phone, small phone targets, a broken phone header, no <main> — and none of them may
 * refuse it, open a repair round on it, ask a model about it, or mend it.
 *
 * verify.ts and project_repair are driven whole. The pipeline's, the edit path's and
 * the build's judgements are driven through the very expressions their code runs
 * (anchored below), because each of those tools needs a real npm build to reach them.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { refuses, refusingMeasurement, mendable } from '../core/engine/browser-mend';
import { createVerifier, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { improveUntilItStops } from '../core/quality/improve-loop';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { ProjectRepairTool } from '../modules/tools/definitions/ProjectRepairTool';
import { modelRepairable, reactLoopMeasurement, reactQualityGate } from '../modules/tools/definitions/ReactProjectTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(240_000);

/** Only told lines, at every severity the inspector writes. */
const TOLD = () => [
    { id: 'low_contrast', severity: 'high', detail: 'تباين ضعيف', detailEn: 'Low contrast: Opening hours may change', evidence: [{ sel: 'p.pale' }] },
    { id: 'mobile_overflow', severity: 'high', detail: 'يفيض الجدول', detailEn: 'The table spills off the phone', evidence: [{ sel: 'table' }] },
    { id: 'mobile_tap_targets', severity: 'medium', detail: 'أهداف لمس صغيرة', detailEn: '3 tap targets on the phone', evidence: [{ sel: 'a.more' }] },
    { id: 'mobile_header_fragmented', severity: 'medium', detail: 'الرأس متكسر', detailEn: 'The header breaks on the phone', evidence: [] },
    { id: 'a11y_no_main', severity: 'low', detail: 'لا main', detailEn: 'No <main> landmark', evidence: [] },
];
const toldAudit = () => ({ score: 100 - 15 - 15 - 8 - 8 - 3, findings: TOLD() });

const code = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** The repairing models: never asked about a told line, on any path. */
const modelRound = require('../core/quality/model-round');
let askForCss: jest.SpyInstance;
let askForHandler: jest.SpyInstance;
beforeEach(() => {
    askForCss = jest.spyOn(modelRound, 'askForCss').mockImplementation(async () => { throw new Error('the CSS model was asked'); });
    askForHandler = jest.spyOn(modelRound, 'askForHandler').mockImplementation(async () => { throw new Error('the handler model was asked'); });
});
afterEach(() => {
    expect(askForCss).not.toHaveBeenCalled();
    expect(askForHandler).not.toHaveBeenCalled();
});

/** A loop driven the way every builder drives it, with a repair that must never run. */
async function loopOn(first: { score: number; findingIds: string[]; findings: any[] }) {
    const repair = jest.fn(async () => ['src/index.css']);
    const measure = jest.fn(async () => first);
    const r = await improveUntilItStops(first, {
        repair, measure, rebuild: async () => true, rollback: async () => true, snapshot: () => 'snap',
    });
    return { r, repair, measure };
}

/* ───────────────────────── verify.ts, driven whole ───────────────────────── */

const TOOL_CONTEXT = { sessionId: 'joe-told-session', workspaceId: 'joe-told', userId: 'joe-told-user', runId: 'joe-told-run' };
const workspace = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-told-'));
afterAll(() => { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

const SERVER = [
    "require('http').createServer((req, res) => {",
    "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
    "  res.end('<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>My notes</title></head><body><h1>My notes</h1><p>Buy milk</p></body></html>');",
    "}).listen(Number(process.env.PORT) || 4173, '127.0.0.1');",
    '',
].join('\n');
const REQUEST = 'Build a page that shows my notes.';
const WANTED = [{ text: 'my notes', quote: 'my notes', line: '<h1>My notes</h1>' }];

const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    project_run: () => new ProjectRunTool(),
    project_stop: () => new ProjectStopTool(),
    quality_run: () => new QualityRunTool(),
    shell_execute: () => new ShellExecuteTool(),
};
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    return executionFirewall.runInContext(`joe-told-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
async function ask(prompt: string): Promise<string> {
    if (prompt.startsWith('Read this request')) return JSON.stringify({ requirements: WANTED.map(w => ({ text: w.text, quote: w.quote })) });
    if (prompt.startsWith('Here is the source')) {
        const verdicts = [...prompt.matchAll(/^\s+\d+\. \[([^\]]+)\] (.+?) {3}\(he wrote: «/gmu)]
            .map(m => ({ id: m[1], verdict: 'met', evidence: WANTED[0].line, why: 'the page carries its heading' }));
        return JSON.stringify({ verdicts });
    }
    throw new Error('the test model was asked something it does not answer');
}
const noProcesses: ProcessRegistry = {
    async start() { throw new Error('not used'); }, logs: () => undefined,
    async stop() { return false; }, list: () => [], async stopAll() { /* none */ },
};

describe('an audit holding only told lines', () => {
    afterEach(async () => {
        await executionFirewall.runInContext('joe-told-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    });

    it('⛔ verify.ts — delivered, measured once, nothing mended', async () => {
        const root = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace);
        const dir = path.join(workspace, 'notes');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'server.js'), SERVER);
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-notes', version: '1.0.0', private: true, scripts: { start: 'node server.js' } }, null, 2));
        const walks: any[] = [];
        const qa: BrowserQa = {
            async watcher() { return { sessionId: 'joe-told-panel', watching: true }; },
            async audit() { const a = { ...toldAudit(), uiInspection: 'complete' }; walks.push(a); return a as any; },
        };
        const mend = jest.fn(async () => null);
        const seeds = await seedRequirementsFromRequest(REQUEST, 'en', ask);
        const state: RunState = {
            plan: newPlan(seededRequirements(seeds)),
            files: new Map(), commands: [], served: [], pages: [], verifications: [],
            steps: 0, modelMs: 0, toolMs: 0,
        };
        const ctx: ToolContext = {
            runId: 'joe-told-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
            signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
            deadlineAt: Date.now() + 15 * 60_000, language: 'en', request: REQUEST, processes: noProcesses,
            browser: () => { throw new Error('not used'); },
            state, emit: () => undefined, joe: {},
        };
        const report = await executionFirewall.runInContext('joe-told-finish',
            () => createVerifier({ ask, runTool, browserQa: qa, mend })(ctx, { summary: 'done' })) as DeliveryVerification;
        expect(report.passed).toBe(true);
        expect(walks).toHaveLength(1);
        expect(mend).not.toHaveBeenCalled();
        root.mockRestore();
    });

    it('⛔ the pipeline — nothing blocks, so project_repair is never called', () => {
        const browserQa = toldAudit();
        //  the pipeline's own expressions (ProjectPipelineTool.ts), anchored below
        const blocking = browserQa.findings.filter(refuses);
        expect(blocking).toEqual([]);
        expect(mendable(blocking)).toBe(false);
        const p = code('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
        expect((p.match(/blocking = browserQa\.findings\.filter\(refuses\);/g) || []).length).toBe(3);
        expect(p).toContain('const projectRepairFindings = blocking.filter(');
    });

    it('⛔ project_repair — accepted, no round, measured once', async () => {
        const appAudit = require('../core/quality/app-audit');
        const loop = require('../core/quality/improve-loop');
        const dir = fs.mkdtempSync(path.join(workspace, 'repair-'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body><h1>Notes</h1></body></html>');
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => toldAudit());
        const round = jest.spyOn(loop, 'repairRound').mockImplementation(async () => ({ changed: ['index.html'], repairs: [] }));
        //  the panel browser is not warmed for a measurement that is not taken in it
        const warm = jest.spyOn(require('../modules/browser/manager'), 'warmBrowserSession').mockImplementation(() => undefined);
        try {
            const r: any = await new ProjectRepairTool().execute({ projectDir: dir, auditDir: dir }, { sessionId: 'joe-told-repair', language: 'en' });
            expect(r.ok).toBe(true);
            expect(round).not.toHaveBeenCalled();
            expect(audit).toHaveBeenCalledTimes(1);
            expect(r.output.rounds).toEqual([]);
            expect(r.output.told).toEqual(TOLD().map(f => f.id));
            expect(r.output.verificationFailed).toBe(false);
        } finally { audit.mockRestore(); round.mockRestore(); warm.mockRestore(); }
    });

    it('⛔ the edit path — its loop is handed nothing, so no round runs', async () => {
        const { r, repair, measure } = await loopOn(refusingMeasurement(toldAudit()));
        expect(repair).not.toHaveBeenCalled();
        expect(measure).not.toHaveBeenCalled();
        expect(r.rounds).toEqual([]);
        const e = code('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        expect(e).toContain('worthRepairing((audit?.findings || []).filter(refuses))');
        expect(e).toContain('const firstMeasurement = refusingMeasurement(audit);');
        expect(e).toContain('const reading = refusingMeasurement(measured);');
    });

    it('⛔ the React build — no round, no model road, and the qualityDeliveryBlocked gate stays open', async () => {
        const audit = toldAudit();
        //  the door to the repair round (ReactProjectTool.ts)
        expect(audit.findings.filter(refuses)).toEqual([]);
        expect(modelRepairable(audit)).toEqual({ behaviour: [], css: [] });
        //  the loop, with no terminal failure
        const { r, repair } = await loopOn(reactLoopMeasurement(audit, [], n => n));
        expect(repair).not.toHaveBeenCalled();
        expect(r.rounds).toEqual([]);
        //  the gate: nothing open and nothing blocking, so qualityDeliveryBlocked has no quality reason
        const gate = reactQualityGate(audit);
        expect(gate.open).toEqual([]);
        expect(gate.blockers).toEqual([]);
        const b = code('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(b).toContain('worthRepairing(audit.findings.filter(refuses))');
        expect(b).toContain('const openQualityFindings = qualityGate.open;');
        expect(b).toMatch(/qualityDeliveryBlocked = buildVerificationBlocked \|\| openQualityFindings\.length > 0/);
    });
});
