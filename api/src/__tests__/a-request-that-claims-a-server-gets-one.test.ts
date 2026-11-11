const mockExecuteTool = jest.fn(), mockCallLLM = jest.fn(), mockVerify = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ TOOL_ALIASES: {}, executeTool: (...args: any[]) => mockExecuteTool(...args) }));
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));
jest.mock('../core/llm/intelligent-router', () => ({ isProviderFailure: () => false, retryAfterMsFrom: () => 0, verifyProviderDirect: (...args: any[]) => mockVerify(...args) }));
jest.mock('../modules/tools/registry', () => ({ tools: [] }));

import os from 'os';
import path from 'path';
import { ProjectPipelineTool, planBuildsAServer, planWithRequestedService, serverClaimingApplication } from '../modules/tools/definitions/ProjectPipelineTool';
import { stockEngineGaps } from '../core/design/app-blueprints';

/**
 * Eval round 20, finding 22 parts 2–3: P251 «… the owner sees all bookings»
 * got a browser-only plan where every booking lives in one customer's
 * browser, and the full-stack prompts spent a 40–70 minute local model plan
 * while api_project + react_project cover them. A greenfield application that
 * claims its own server is planned from those builders when they cover it;
 * whatever planned it, a plan for a server-claiming request builds a server.
 */
const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
const P152 = 'ابني نظام متكامل لـمدرسة خاصة: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلاب والصفوف والعلامات، وكل موظف يرى سجلاته فقط.';
const P251 = 'Build a booking web app for a dental clinic where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.';
const P252 = 'ابني تطبيق حجز لـمدرسة خاصة: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.';
const UNCOVERED = 'Build an admin dashboard for a dental clinic with user accounts to manage patients and appointments, with a summary page showing totals and a chart.';
const NO_SERVER = 'Build a habit tracking app for myself.';

const reactOnly = (request: string) => ({ ok: true, output: { projectName: 'model-plan', phases: [{ phaseNumber: 1, name: 'Application', tasks: [{ tool: 'react_project', description: request, args: { request } }] }] } });
const toolsOf = (phase: any) => (phase?.tasks || []).map((t: any) => t.tool);

async function plan(request: string) {
    mockExecuteTool.mockReset().mockImplementation(async (name: string, args: any) => {
        if (name === 'engineering_discovery') {
            return { ok: true, output: { evidence: {
                version: 1, mode: 'greenfield', workspaceRoot: path.join(os.tmpdir(), 'joe-claims-server'), instructionFiles: [],
                constraints: { localOnly: true, forbidDeploy: true, userRequestedExistingProject: false, createsNewProject: true },
                facts: [], blockers: [], referenceProjects: [],
            } } };
        }
        if (name === 'project_planner') return reactOnly(request);
        // Stop at the first phase: what was sent to execution is what is measured.
        if (name === 'phase_executor') return { ok: false, error: 'stopped by the test after planning', output: { status: 'failed', results: [] } };
        return { ok: false, error: `not in this test: ${name}` };
    });
    mockCallLLM.mockReset().mockRejectedValue(new Error('no model in this test'));
    mockVerify.mockReset().mockResolvedValue({ ok: true, provider: 'test', detail: 'healthy' });
    await new ProjectPipelineTool().execute({ request }, { sessionId: 'claims-server', workspaceId: 'claims-server', runId: 'run-claims-server', userId: 'owner', language: /[؀-ۿ]/.test(request) ? 'ar' : 'en' } as any).catch(() => undefined);
    const plannerCalls = mockExecuteTool.mock.calls.filter(call => call[0] === 'project_planner').length;
    const phases = mockExecuteTool.mock.calls.filter(call => call[0] === 'phase_executor').map(call => call[1]?.phase);
    return { plannerCalls, first: phases[0] };
}

jest.setTimeout(120_000);

describe('a covered application that claims its own server is planned from its builders, without a model', () => {
    it.each([['P151', P151], ['P152', P152], ['P251', P251], ['P252', P252]])('%s: the service is the first phase and no model plans it', async (_id, request) => {
        expect(serverClaimingApplication(request)).toBe(true);
        expect(stockEngineGaps(request, true)).toEqual([]);
        const { plannerCalls, first } = await plan(request);
        expect(plannerCalls).toBe(0);
        expect(toolsOf(first)).toEqual(['api_project']);
    });
});

describe('the backend is credited only with what it really builds', () => {
    it('per-user ownership is covered by the stock service in both languages; a records feature that mentions orders is not', () => {
        expect(stockEngineGaps(P151, true)).toEqual([]);
        expect(stockEngineGaps(P151, false)).toEqual(['each staff member only sees their own records']);
        expect(stockEngineGaps('Build an admin dashboard for a shop with user accounts to manage products: an orders report by month, export orders to CSV, and order status tracking.', true))
            .toEqual(['export orders to CSV']);
    });
});

describe('a server-claiming request the builders do not cover keeps the model plan, and gains the server it lacks', () => {
    it('the model plans it, its React phase is kept, and the service phase comes first', async () => {
        expect(serverClaimingApplication(UNCOVERED)).toBe(true);
        expect(stockEngineGaps(UNCOVERED, true).length).toBeGreaterThan(0);
        const { plannerCalls, first } = await plan(UNCOVERED);
        expect(plannerCalls).toBe(1);
        expect(toolsOf(first)).toEqual(['api_project']);
        const completed = planWithRequestedService(UNCOVERED, reactOnly(UNCOVERED).output.phases)!;
        expect(completed.map(toolsOf)).toEqual([['api_project'], ['react_project']]);
        expect(completed.map((phase: any) => phase.phaseNumber)).toEqual([1, 2]);
    });
});

describe('an application that claims no server gets none', () => {
    it('the habit tracker for himself is planned by the model and stays browser-only', async () => {
        expect(serverClaimingApplication(NO_SERVER)).toBe(false);
        const { plannerCalls, first } = await plan(NO_SERVER);
        expect(plannerCalls).toBe(1);
        expect(toolsOf(first)).toEqual(['react_project']);
        expect(planWithRequestedService(NO_SERVER, reactOnly(NO_SERVER).output.phases)).toBeNull();
    });
});

describe('a plan that already builds its server is left alone', () => {
    const write = (p: string, extra: any = {}) => ({ tool: 'ai_write_file', args: { path: p, ...extra } });
    it.each([
        ['an api_project phase', [{ phaseNumber: 1, tasks: [{ tool: 'api_project', args: { request: P251 } }] }]],
        ['server source files', [{ phaseNumber: 1, tasks: [write('clinic/server/index.js'), write('clinic/src/App.jsx')] }]],
        ['a manifest that depends on express', [{ phaseNumber: 1, tasks: [{ tool: 'scaffold_project', args: { structure: { 'package.json': '{"dependencies":{"express":"^4.19.0"}}', 'index.js': '' } } }] }]],
        ['an install of a server framework', [{ phaseNumber: 1, tasks: [{ tool: 'shell_execute', args: { command: 'npm install express cors' } }] }]],
    ])('%s', (_label, phases) => {
        expect(planBuildsAServer(P251, phases as any[])).toBe(true);
        expect(planWithRequestedService(P251, phases as any[])).toBeNull();
    });
    it('a command-line program that mentions a database is never given a server phase', () => {
        const cli = 'Write a bash script that backs up my PostgreSQL database every night.';
        expect(planWithRequestedService(cli, [{ phaseNumber: 1, tasks: [write('backup.sh')] }])).toBeNull();
    });
});
