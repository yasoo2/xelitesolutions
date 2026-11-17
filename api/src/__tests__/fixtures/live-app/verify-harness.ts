/**
 * A REAL VERIFICATION OF THE OWNER'S LIVE APP, FOR THE STEP-1 TESTS (design v13.3 §12; agent H).
 *
 * `createVerifier` runs as the engine runs it: Joe's own `project_run` / `project_stop` / `quality_run` /
 * `shell_execute` tools start, stop and test the project for real; only the model is a test one, and the Browser
 * panel is given by the test — a fake walk that writes what the QA's forms would write, or the real `auditBuiltApp`
 * with the panel's watcher count given.
 */
import fs from 'fs';
import path from 'path';
import { createVerifier, deliveryOutput, type BrowserQa, type DeliveryVerification } from '../../../core/engine/verify';
import { seedRequirementsFromRequest } from '../../../core/engine/seed';
import { newPlan, seededRequirements } from '../../../core/engine/plan';
import type { EngineResult, ProcessRegistry, RunState, ToolContext } from '../../../core/engine/types';
import type { FinishArgs } from '../../../core/engine/finish';
import { ProjectRunTool, ProjectStopTool } from '../../../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../../../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../../../modules/tools/definitions/SystemTools';
import { executionFirewall } from '../../../orchestration/AgentExecutionFirewall';

export interface ToolCall { tool: string; input: any; at: number; done?: number; result?: any }

export interface Harness {
    calls: ToolCall[];
    runTool(tool: string, input: any): Promise<any>;
    verify(dir: string, qa: BrowserQa, opts?: { deadlineMs?: number; claim?: Partial<FinishArgs>; request?: string }): Promise<DeliveryVerification>;
    summaryOf(report: DeliveryVerification, request?: string): string;
    stop(): Promise<void>;
}

/**
 * `around(tool, input, run)` lets a test act before or after one of Joe's tool calls (the owner writing while
 * the server starts, or while it is stopped for the put-back).
 */
export function verifyHarness(o: { name: string; request: string; toolContext: Record<string, string>; around?: (tool: string, input: any, run: () => Promise<any>) => Promise<any> }): Harness {
    const calls: ToolCall[] = [];
    const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
        project_run: () => new ProjectRunTool(),
        project_stop: () => new ProjectStopTool(),
        quality_run: () => new QualityRunTool(),
        shell_execute: () => new ShellExecuteTool(),
    };
    const runTool = async (tool: string, input: any) => {
        const make = TOOLS[tool];
        if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
        const call: ToolCall = { tool, input, at: Date.now() };
        calls.push(call);
        const run = () => executionFirewall.runInContext(`${o.name}-${tool}`, () => make().execute(input, o.toolContext));
        const result = o.around ? await o.around(tool, input, run) : await run();
        call.done = Date.now();
        call.result = result;
        return result;
    };
    //  The test model: it reads the request as naming nothing the source is judged against.
    const ask = async (prompt: string): Promise<string> => {
        if (prompt.startsWith('Read this request')) return JSON.stringify({ requirements: [] });
        if (prompt.startsWith('Here is the source')) return JSON.stringify({ verdicts: [] });
        throw new Error('the test model was asked something it does not answer');
    };
    const noProcesses: ProcessRegistry = {
        async start() { throw new Error('not used'); }, logs: () => undefined,
        async stop() { return false; }, list: () => [], async stopAll() { /* none */ },
    };
    const verify = async (dir: string, qa: BrowserQa, v: { deadlineMs?: number; claim?: Partial<FinishArgs>; request?: string } = {}) => {
        const request = v.request || o.request;
        const seeds = await seedRequirementsFromRequest(request, 'en', ask);
        const state: RunState = {
            plan: newPlan(seededRequirements(seeds)),
            files: new Map(), commands: [], served: [], pages: [], verifications: [],
            steps: 0, modelMs: 0, toolMs: 0,
        };
        const ctx: ToolContext = {
            runId: `${o.name}-run`, projectDir: dir, stateDir: path.join(dir, '.joe'),
            signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
            deadlineAt: Date.now() + (v.deadlineMs ?? 15 * 60_000), language: 'en', request, processes: noProcesses,
            browser: () => { throw new Error('not used'); },
            state, emit: () => undefined, joe: {},
        };
        return executionFirewall.runInContext(`${o.name}-finish`, () => createVerifier({ ask, runTool, browserQa: qa, mend: null })(ctx, { summary: 'done', ...(v.claim || {}) } as FinishArgs)) as Promise<DeliveryVerification>;
    };
    const summaryOf = (report: DeliveryVerification, request?: string) => {
        const result = { status: 'delivered', summary: 'Changed the app.', verification: report, filesChanged: [], served: [], steps: 3, model: 'test' } as unknown as EngineResult;
        return String(deliveryOutput({ result, projectRoot: report.delivery.projectRoot, request: request || o.request, language: 'en' }).output.summary);
    };
    const stop = async () => {
        await executionFirewall.runInContext(`${o.name}-stop`, () => new ProjectStopTool().execute({}, o.toolContext)).catch(() => undefined);
    };
    return { calls, runTool, verify, summaryOf, stop };
}

/** The real walk, through the panel the test says is watched (`watching`), its frames swallowed by the test's mocks. */
export function realPanel(sessionId: string, watching = true): BrowserQa & { audits: any[]; results: any[] } {
    const audits: any[] = [];
    const results: any[] = [];
    return {
        audits, results,
        async watcher() { return { sessionId, watching }; },
        async audit(dir, opts) {
            audits.push(opts);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const a = await require('../../../core/quality/app-audit').auditBuiltApp(dir, opts);
            results.push(a);
            return a;
        },
    };
}

/** Whether a folder exists and holds anything. */
export const hasFiles = (dir: string): boolean => { try { return fs.readdirSync(dir).length > 0; } catch { return false; } };
