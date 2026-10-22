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
// Pure family recognition runs before intent classification; this fixture has no family.
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: mockForbidden, capabilityFamilyFromRequest: () => null }));
jest.mock('../core/capabilities/decision-profiles', () => ({ capabilityFamilyFromRequest: () => null }));
jest.mock('../core/orchestrator/capability-match', () => ({ capableTools: mockForbidden }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: mockForbidden } }));
jest.mock('../modules/tools/registry', () => ({ tools: {} }));
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden, generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));

import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { classifyIntent } from '../core/intelligence/intent-classifier';

describe('knowledge answers reach the existing planner without optional model planning', () => {
    beforeEach(() => mockForbidden.mockClear());
    test.each([
        'What does an API do? Reply in one English sentence.',
        'ما فائدة النسخة الاحتياطية للملفات؟ أجب بجملة واحدة.',
        'Compare RAM and disk storage. Reply in one sentence.',
        'Why are separate project workspaces useful?',
        'How does a cache reduce response time?',
        'اشرح كيف تضيف سطراً إلى ملف نصي.',
        'Explain the phrase "create a file" without doing it.',
        'What is the difference between an interface and an implementation?',
    ])('full consumers make a single answer plan for %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'central_answer', agent: 'General', input: { question: goal }, dependsOn: [] });
        expect(plan.metadata?.answerOnly).toBe(true);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Explain what an API is, then build a working REST API.',
        'What is a dashboard? Create an app for it.',
        'Explain caching, then implement a cache in this project.',
        'Compare memory and disk, then build a monitoring dashboard.',
    ])('affirmative work is not discarded as knowledge: %s', async goal => {
        const classification = await classifyIntent(goal);
        expect(classification.isBuild).toBe(true);
        expect(classification.isKnowledgeQuestion).toBe(false);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Explain an API. Answer only; do not execute anything.',
        'Create a file named notes.txt with content "hi". Do not execute.',
    ])('explicit no-execution remains stronger than work language: %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
});
