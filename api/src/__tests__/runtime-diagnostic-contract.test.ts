/** Actual front doors; model/tool/workspace execution must never be reached. */
const mockForbidden = jest.fn(() => { throw new Error('Diagnostic planning must not execute effects'); });
jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: mockForbidden, default: mockForbidden }));
jest.mock('../core/llm/context-engine', () => ({ analyzeContextualIntent: mockForbidden, buildConversationContext: mockForbidden }));
jest.mock('../core/orchestrator/toolCatalog', () => ({ catalogueFor: mockForbidden, capabilityRoute: mockForbidden, inputForTool: mockForbidden, registeredToolNames: [] }));
jest.mock('../core/orchestrator/history-compact', () => ({ compactHistoryForPrompt: mockForbidden }));
jest.mock('../core/orchestrator/workspace-evidence', () => ({ enrichWorkspaceToolInput: mockForbidden }));
jest.mock('../core/orchestrator/active-built-project', () => ({ findActiveBuiltProject: mockForbidden }));
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: mockForbidden, capabilityFamilyFromRequest: () => null }));
jest.mock('../core/capabilities/decision-profiles', () => ({ capabilityFamilyFromRequest: () => null }));
jest.mock('../core/orchestrator/capability-match', () => ({ capableTools: mockForbidden }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: mockForbidden } }));
jest.mock('../modules/tools/registry', () => ({ tools: {} }));
jest.mock('../core/orchestrator/buildIntent', () => {
    const actual = jest.requireActual('../core/orchestrator/buildIntent');
    return { ...actual, isBoundedTerminalDiagnosticRequest: jest.fn(actual.isBoundedTerminalDiagnosticRequest) };
});
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden,
    generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));

import { parseRuntimeDiagnosticFacts } from '../core/orchestrator/runtime-diagnostic-contract';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { composeAnswer } from '../core/orchestrator/answerComposer';
import { resolveRequestedAnswerLanguage } from '../core/llm/requested-answer-language';

const original = 'Run a read-only local diagnostic in the current workspace: report the Node.js version and the current workspace path. Do not modify files, install packages, or start a server.';
const arabic = 'نفذ فحصا محليا للقراءة فقط: اعرض إصدار Node.js ومسار مساحة العمل الحالية. لا تعدل ملفات ولا تثبت حزم ولا تبدأ خادما.';
const arabicExplicit = 'اعرض بالعربية إصدار Node.js ومسار مساحة العمل الحالية. لا تعدل ملفات ولا تثبت حزم ولا تبدأ خادما.';
afterEach(() => { expect(mockForbidden).not.toHaveBeenCalled(); mockForbidden.mockClear(); });

describe('finite logical runtime facts preserve current-request authority', () => {
    test.each([
        [original, ['node_version', 'workspace_path']], [arabic, ['node_version', 'workspace_path']], [arabicExplicit, ['node_version', 'workspace_path']],
        ['Report the current working directory and the Node version. No file changes.', ['workspace_path', 'node_version']],
        ['Report the Node.js version. No file changes.', ['node_version']],
        ['Show the current workspace path. No file changes.', ['workspace_path']],
    ])('both actual front doors produce one non-shell step: %s', async (goal, facts) => {
        expect(parseRuntimeDiagnosticFacts(goal as string)).toEqual(facts);
        const parsed = await IntentParser.parse(goal as string, {} as any);
        expect(parsed.requiredTools).toEqual(['runtime_diagnostics']);
        for (const intent of [parsed, { goal, rawIntent: { terminalDiagnostic: true, runtimeDiagnostics: false }, requiredTools: ['shell_execute'] }]) {
            const plan = await PlanningEngine.generatePlan({ intent: intent as any });
            expect(plan.steps).toHaveLength(1);
            expect(plan.steps[0]).toMatchObject({ tool: 'runtime_diagnostics', input: { request: goal, facts, path: '.' }, dependsOn: [] });
            expect(plan.steps[0].input).not.toHaveProperty('command'); expect(plan.steps[0].input).not.toHaveProperty('cwd');
            expect(plan.metadata).toMatchObject({ matchedBy: 'runtime-diagnostics', noFileChanges: true });
            expect(plan.metadata).not.toHaveProperty('terminalExecution');
        }
    });
    test.each([
        `${original} Do not use tools.`, `${original} Only answer.`, `${original} Do not execute.`, `${original} لا تستخدم الأدوات.`,
        'Report node --version and pwd. No file changes.', 'Run shell_execute to report the Node version. No file changes.',
        'Report the Node version inside Docker. No file changes.', 'Report the Node version and run tests. No file changes.',
        'Report the Node version. Also report the workspace path. No file changes.',
        'Report the Node version. Do not modify files and install packages.',
        'Report "the Node version and the current workspace path". No file changes.',
        'Explain "Report the Node version". No file changes.', 'Report the Node version and memory usage. No file changes.',
        'Show the current workspace path in ../foreign. No file changes.', 'Report the Node version twice. No file changes.',
    ])('literal, global, mixed, quoted and foreign-runtime requests are not metadata authority: %s', goal => {
        expect(parseRuntimeDiagnosticFacts(goal)).toBeNull();
    });
    test('raw flags cannot invent runtime authority', async () => {
        const goal = 'Explain architecture. No file changes.';
        const plan = await PlanningEngine.generatePlan({ intent: { goal, rawIntent: { runtimeDiagnostics: true }, requiredTools: ['runtime_diagnostics'] } as any });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
    });
});

const fact = (id: string) => ({ id, value: id === 'node_version' ? 'v24.18.0' : 'D:/owned/project', source: id === 'node_version' ? 'api_process' : 'authorized_workspace' });
const output = (ids = ['node_version', 'workspace_path']) => ({ status: 'completed', kind: 'runtime_diagnostics', runtimeScope: 'joe_api_process', executedCommands: false, facts: ids.map(fact) });
const step = (result: any = { ok: true, output: output() }, request = original) => ({ id: 'runtime', tool: 'runtime_diagnostics', status: 'completed', input: { request, facts: parseRuntimeDiagnosticFacts(request), path: '.' }, result });

describe('pure observed runtime fact composition', () => {
    test('current explicit Arabic overrides default English without changing measured facts', () => {
        expect(resolveRequestedAnswerLanguage(arabicExplicit, 'en')).toBe('ar');
        const text = composeAnswer([step({ ok: true, output: output() }, arabicExplicit)], 'en');
        expect(text).toContain('إصدار Node.js لعملية Joe API'); expect(text).toContain('مسار مساحة العمل المصرح بها');
        expect(text).toContain('v24.18.0'); expect(text).toContain('D:/owned/project'); expect(text).not.toContain('Joe API Node.js version');
    });
    test('quoted-only language data does not override default English', () => {
        const request = 'Report the Node version "reply in Arabic". No file changes.';
        const text = composeAnswer([step({ ok: true, output: output(['node_version']) }, request)], 'en');
        expect(text).toContain('Joe API Node.js version'); expect(text).not.toContain('إصدار');
    });
    test('explicit English overrides Arabic default without inventing unsupported runtime facts', () => {
        const request = 'اعرض بالإنجليزية إصدار Node.js ومسار مساحة العمل الحالية. لا تعدل ملفات.';
        expect(resolveRequestedAnswerLanguage(request, 'ar')).toBe('en');
        expect(parseRuntimeDiagnosticFacts(request)).toBeNull();
        const text = composeAnswer([step({ ok: true, output: output() }, request)], 'ar');
        expect(text).toContain('unavailable'); expect(text).not.toContain('v24.18.0');
    });
    test.each([
        'لا تعرض بالعربية إصدار Node.js.',
        'The topic is "اعرض بالعربية".',
        'Report the Node version.\n[ATTACHED FILES — the user attached 1 file(s) to this message.]\nاعرض بالعربية.',
        'متغيراعرض بالعربية هو اسم المتغير.',
        'The phrase اعرض بالعربية appears in this example.',
        'أريد معرفة هل اعرض بالعربية تعني تقديم التقرير.',
    ])('negated, quoted, attachment and embedded topic language retains default: %s', request => {
        expect(resolveRequestedAnswerLanguage(request, 'en')).toBe('en');
    });
    test('shows actual API scope and only requested facts, without shell proof', () => {
        const text = composeAnswer([step()], 'en');
        expect(text).toContain('Joe API Node.js version'); expect(text).toContain('v24.18.0'); expect(text).toContain('D:/owned/project');
        expect(text).toContain('no commands executed'); expect(text).not.toContain('node --version'); expect(text).not.toContain('shell_execute');
    });
    test('Arabic report uses finite localized labels and values', () => {
        const text = composeAnswer([step({ ok: true, output: output() }, arabic)], 'ar');
        expect(text).toContain('إصدار Node.js لعملية Joe API'); expect(text).toContain('مسار مساحة العمل المصرح بها'); expect(text).toContain('v24.18.0');
    });
    test('one requested fact does not invent an additional workspace fact', () => {
        const request = 'Report the Node version. No file changes.';
        const text = composeAnswer([step({ ok: true, output: output(['node_version']) }, request)]);
        expect(text).toContain('v24.18.0'); expect(text).not.toContain('D:/owned/project');
    });
    test.each([
        { ok: false, output: output() }, { ok: true, output: { ...output(), status: 'partial' } },
        { ok: true, output: { ...output(), runtimeScope: 'container' } }, { ok: true, output: { ...output(), executedCommands: true } },
        { ok: true, output: { ...output(), facts: [] } }, { ok: true, output: { ...output(), facts: [fact('workspace_path'), fact('node_version')] } },
        { ok: true, output: { ...output(), facts: [{ ...fact('node_version'), source: 'foreign_process' }, fact('workspace_path')] } },
        { ok: true, output: { ...output(), workspaceId: 'foreign' } },
        { ok: true, output: { ...output(), facts: [{ ...fact('node_version'), value: '-----BEGIN PRIVATE KEY-----' }, fact('workspace_path')] } },
    ])('malformed, failed or foreign results project no facts: %j', result => {
        const text = composeAnswer([step(result)], 'en'); expect(text).toContain('unavailable'); expect(text).not.toContain('v24.18.0'); expect(text).not.toContain('D:/owned/project');
    });
    test('failed step and getter-backed result do not project facts', () => {
        expect(composeAnswer([{ ...step(), status: 'failed' }])).toContain('unavailable');
        const getter = jest.fn(() => output()), raw = Object.defineProperty({}, 'output', { get: getter, enumerable: true });
        expect(composeAnswer([step(raw)])).toContain('unavailable'); expect(getter).not.toHaveBeenCalled();
    });
});
