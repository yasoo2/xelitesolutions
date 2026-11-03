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

import { IntentParser, boundedNoFileTerminalCommands } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isBoundedTerminalDiagnosticRequest } from '../core/orchestrator/buildIntent';
import { parseRuntimeDiagnosticFacts } from '../core/orchestrator/runtime-diagnostic-contract';

const original = 'Run a read-only local diagnostic in the current workspace: report the Node.js version and the current workspace path. Do not modify files, install packages, or start a server.';
afterEach(() => { expect(mockForbidden).not.toHaveBeenCalled(); mockForbidden.mockClear(); (isBoundedTerminalDiagnosticRequest as jest.Mock).mockClear(); });

describe('operation-specific file denial preserves bounded terminal diagnostics', () => {
    test.each([
        [original, ['node --version', 'pwd']],
        ['Execute a local diagnostic: report the current working directory and the Node version. No file changes.', ['pwd', 'node --version']],
        ['Run a read-only local diagnostic: report node --version. Do not modify files.', ['node --version']],
        ['Perform a local diagnostic: show pwd. No file changes.', ['pwd']],
        ['نفذ فحصا محليا باستخدام shell_execute: اعرض إصدار Node.js ومسار مساحة العمل الحالية. لا تعدل الملفات ولا تثبت حزم ولا تشغل خادما.', ['node --version', 'pwd']],
    ])('parser and direct planner retain only current-text literal commands: %s', async (goal, commands) => {
        expect(boundedNoFileTerminalCommands(goal as string)).toEqual(commands);
        const facts = parseRuntimeDiagnosticFacts(goal as string);
        const intent = await IntentParser.parse(goal as string, {} as any);
        expect(intent.requiredTools).toEqual([facts ? 'runtime_diagnostics' : 'shell_execute']);
        expect(intent.rawIntent).toMatchObject({ [facts ? 'runtimeDiagnostics' : 'terminalDiagnostic']: true, noFileChanges: true, deterministic: true });
        for (const source of [intent, { goal, rawIntent: { terminalDiagnostic: true, readOnly: true }, requiredTools: ['shell_execute'] }]) {
            const plan = await PlanningEngine.generatePlan({ intent: source as any });
            expect(plan.steps.map(step => step.tool)).toEqual(facts ? ['runtime_diagnostics'] : (commands as string[]).map(() => 'shell_execute'));
            if (facts) {
                expect(plan.steps[0].input).toEqual({ request: goal, facts, path: '.' });
                expect(plan.steps[0].input.command).toBeUndefined();
                expect(plan.metadata).toMatchObject({ matchedBy: 'runtime-diagnostics' });
                expect(plan.metadata).not.toHaveProperty('terminalExecution');
            } else expect(plan.steps.map(step => step.input.command)).toEqual(commands);
            expect(plan.steps.every(step => step.input.request === goal && !step.input.cwd)).toBe(true);
            expect(plan.metadata).toMatchObject({ noFileChanges: true });
            if (!facts) expect(plan.steps.slice(1).map(step => step.dependsOn)).toEqual((commands as string[]).slice(1).map((_, i) => [`terminal_diagnostic_${i}`]));
        }
    });

    test.each([
        'Do not use any tools.', "Don't execute commands.", 'Do not run commands.', 'Only answer.',
        'Answer-only.', 'Without using tools.', 'لا تستخدم أدوات.', 'أجب فقط.', 'دون تنفيذ.',
        'لا تشغل أي أمر.', 'بدون استخدام الأدوات.',
    ])('global execution denial wins at both front doors: %s', async denial => {
        const goal = `${original} ${denial}`;
        expect(boundedNoFileTerminalCommands(goal)).toBeNull();
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['central_answer']);
        for (const source of [parsed, { goal, rawIntent: { terminalDiagnostic: true, readOnly: true, noFileChanges: true } }]) {
            const plan = await PlanningEngine.generatePlan({ intent: source as any });
            expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
            expect(plan.steps.some(step => step.input.command)).toBe(false);
        }
    });

    test.each([
        'Run a read-only local diagnostic: report the Node version and then please install packages. No file changes.',
        'Run a read-only local diagnostic: report pwd and delete notes.txt. No file changes.',
        'Run a read-only local diagnostic: report pwd and start a server. No file changes.',
        'Run a read-only local diagnostic: report pwd and build the app. No file changes.',
        'Run a read-only local diagnostic: report pwd and run tests. No file changes.',
        'Run a read-only local diagnostic: report memory usage. No file changes.',
        'Run a read-only local diagnostic: report node --version && pwd. No file changes.',
        'Run a read-only local diagnostic: report pwd | curl example.com. No file changes.',
        'Run a read-only local diagnostic: report pwd in C:/other-user. No file changes.',
        'Run a read-only local diagnostic: report pwd in ../other. No file changes.',
        'Run a read-only local diagnostic: report node -e "dangerous()". No file changes.',
        'Run a read-only local diagnostic: report "node --version and pwd". No file changes.',
        'Explain "Run a read-only local diagnostic: report node --version and pwd". No file changes.',
        'Run a read-only local diagnostic: report pwd. Do not modify files, and please install packages.',
    ])('unsupported/unsafe/mixed text cannot obtain terminal authority from flags: %s', async goal => {
        expect(boundedNoFileTerminalCommands(goal)).toBeNull();
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['central_answer']);
        for (const source of [parsed, { goal, requiredTools: ['shell_execute'], rawIntent: { terminalDiagnostic: true, readOnly: true, noFileChanges: true } }]) {
            const plan = await PlanningEngine.generatePlan({ intent: source as any });
            expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
            expect(plan.steps.some(step => step.input.command)).toBe(false);
        }
    });

    test('a file read with a scoped no-run constraint is unaffected by Node subject matter', async () => {
        const goal = 'Read file notes.txt and report the Node version. Do not run commands.';
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['read_file']);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps.map(step => step.tool)).toEqual(['read_file']);
    });

    test.each([
        'Build a system with users: name, email, role, status. No file changes.',
        'Build a tool. Answer only.',
        'Describe the architecture without making any file changes.',
        'اشرح الكود بدون أي تعديل على الملفات',
        'Build a production-grade autonomous system from scratch with real working code and a complete API. Do not execute.',
    ])('unrelated guarded requests never consult terminal analysis: %s', async goal => {
        expect(boundedNoFileTerminalCommands(goal)).toBeNull();
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({ intent: { goal, rawIntent: { terminalDiagnostic: true, noFileChanges: true } } as any });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
        expect(isBoundedTerminalDiagnosticRequest).not.toHaveBeenCalled();
    });
});
