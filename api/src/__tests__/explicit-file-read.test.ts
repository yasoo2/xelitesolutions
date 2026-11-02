/** Actual parser/planner consumers with closed external-effect boundaries. */
const mockForbidden = jest.fn(() => { throw new Error('No provider, tool, filesystem or inferred capability permitted'); });
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
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden, generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));

import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { parseExplicitFileReadRequest } from '../core/orchestrator/file-intent';
import { hasRequestedAction } from '../core/intelligence/requested-action';

describe('standalone explicit file reads precede filename capability keywords', () => {
    beforeEach(() => mockForbidden.mockClear());
    test.each([
        ['Read the file reports/joe-status-20261011.json and report its exact content.', 'reports/joe-status-20261011.json'],
        ['Read file invoices/total.txt.', 'invoices/total.txt'],
        ['Please read the file "report.txt" and show its contents.', 'report.txt'],
        ['Read the file source/main.ts', 'source/main.ts'],
        ['اقرأ الملف reports/status.json واعرض محتواه', 'reports/status.json'],
        ['اقرا ملف نتيجة.txt', 'نتيجة.txt'],
    ])('full front doors preserve precise read: %s', async (goal, file) => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['read_file']);
        const plan = await PlanningEngine.generatePlan({ intent: { ...intent, rawIntent: { ...intent.rawIntent, capabilityCandidate: 'joe_engineering_report' } } });
        expect(plan.metadata?.matchedBy).toBe('explicit-read-file-contract');
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'read_file', input: { path: file, request: goal }, dependsOn: [] });
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Read the file report.txt. Answer only.',
        'Read the file report.txt. Do not execute.',
        'اقرأ الملف تقرير.txt. أجب فقط.',
    ])('existing explicit denial keeps priority: %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(intent.requiredTools).toEqual(['central_answer']);
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test('no file changes permits the one explicitly requested read', async () => {
        const goal = 'Read the file report.txt. No file changes.';
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(intent.goal).toBe(goal);
        expect(intent.requiredTools).toEqual(['read_file']);
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'read_file', input: { path: 'report.txt', request: goal }, dependsOn: [] });
        expect(plan.steps.filter(step => /write|edit|delete|shell|run|install|npm/i.test(step.tool))).toHaveLength(0);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Read the file ../notes.txt',
        'Read the file /notes.txt',
        'Read the file C:/notes.txt',
        'Read the file \\notes.txt',
        'Read the file "report.txt!"',
        'Read the file https://example.com/report.txt',
        'Read the file notes.txt and delete it',
        'Read the file notes.txt then write new.txt',
        'Read the file notes.txt and run npm install',
        'Read the file notes.txt and deploy it',
        'Read the files notes.txt and status.json',
        'Explain how to read the file notes.txt',
        'Could you explain reading the file notes.txt?',
        '"Read the file notes.txt"',
        'اقرأ الملف نتيجة.txt ثم احذفه',
        'اقرأ الملف نتيجة.txt واكتب ملفاً آخر',
        'Read the file',
        'Read the file ' + 'x'.repeat(513),
    ])('mixed, quoted, ambiguous or escaping request is not the standalone contract: %s', goal => {
        expect(parseExplicitFileReadRequest(goal)).toBeNull();
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each(['أجب فقط', 'اجب فقط', 'أَجِبْ فقط'])('Arabic answer denial remains global: %s', denial => {
        expect(hasRequestedAction(`اقرأ الملف نتيجة.txt. ${denial}.`)).toMatchObject({ isAnswerOnly: true, hasDenial: true });
    });
    test('quoted Arabic copy does not grant a global execution denial', () => {
        expect(hasRequestedAction('Create a file named label.txt with content "أجب فقط".')).toMatchObject({ isAnswerOnly: false });
    });
});
