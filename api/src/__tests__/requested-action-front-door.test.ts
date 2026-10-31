/** Full current consumer methods; external edges throw before any side effect.
 * This exercises planning boundaries, not real provider execution or browser navigation.
 */
const mockForbidden = jest.fn(() => { throw new Error('No provider, workspace I/O, tool or external analysis permitted'); });
jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: mockForbidden, default: mockForbidden }));
jest.mock('../core/llm/context-engine', () => ({ analyzeContextualIntent: mockForbidden, buildConversationContext: mockForbidden }));
jest.mock('../core/orchestrator/toolCatalog', () => ({ catalogueFor: mockForbidden, capabilityRoute: mockForbidden, inputForTool: mockForbidden, registeredToolNames: [] }));
jest.mock('../core/orchestrator/history-compact', () => ({ compactHistoryForPrompt: mockForbidden }));
jest.mock('../core/orchestrator/workspace-evidence', () => ({ enrichWorkspaceToolInput: mockForbidden }));
jest.mock('../core/orchestrator/active-built-project', () => ({ findActiveBuiltProject: mockForbidden }));
jest.mock('../core/orchestrator/buildIntent', () => ({
    isBoundedTerminalDiagnosticRequest: mockForbidden,
    isKnowledgeQuestion: jest.requireActual('../core/orchestrator/buildIntent').isKnowledgeQuestion,
    isReadOnlyRequest: jest.requireActual('../core/orchestrator/buildIntent').isReadOnlyRequest,
}));
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: mockForbidden, capabilityFamilyFromRequest: mockForbidden }));
jest.mock('../core/capabilities/decision-profiles', () => ({ capabilityFamilyFromRequest: mockForbidden }));
jest.mock('../core/orchestrator/capability-match', () => ({ capableTools: mockForbidden }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: mockForbidden } }));
jest.mock('../modules/tools/registry', () => ({ tools: {} }));
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden, generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));

import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { boundedReadNavigationUnderFileConstraint } from '../core/intelligence/bounded-read-navigation';

describe('canonical denial reaches the real planning front doors', () => {
    beforeEach(() => mockForbidden.mockClear());
    test.each([
        'Build a system with users: name, email, role, status. No file changes.',
        'Build a tool. Answer only.',
        'Build a dashboard. Do not create a database. Do not execute anything.',
        'Create a working app. Do not create or change any files.',
        'Describe the architecture without making any file changes.',
        'اشرح الكود بدون أي تعديل على الملفات',
        'أنشئ متجراً دون إنشاء ملفات',
        'Build a production-grade autonomous system from scratch with real working code and a complete API. '
            + 'Use architecture planning, tests, deployment and all engineering capabilities. '
            + 'The specification is intentionally long to reach the engineering shortcut. Do not execute.',
    ])('%s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'central_answer', input: { question: goal } });
        expect(plan.metadata?.deterministic).toBe(true);
        expect(mockForbidden).not.toHaveBeenCalled();
    });

    test.each([
        ['Open https://example.com. No file changes.', true],
        ['Open https://example.com. Do not create or change any files.', true],
        ['Open https://example.com. No file changes. Do not execute.', false],
        ['Open https://example.com. No file changes. Answer only.', false],
        ['Open https://example.com and click submit. No file changes.', false],
        ['Open https://example.com and log in. No file changes.', false],
        ['Explain how to open https://example.com. No file changes.', false],
        ['Open https://example.com and https://example.org. No file changes.', false],
    ])('file constraint grants only bounded observation: %s', (goal, expected) => {
        expect(boundedReadNavigationUnderFileConstraint(goal as string)).toBe(expected);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
});
