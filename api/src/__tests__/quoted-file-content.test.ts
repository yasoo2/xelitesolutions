/** Literal content and follow-up commands remain distinct at the real planner front doors. */
const mockForbidden = jest.fn(() => { throw new Error('No provider, workspace I/O or execution permitted'); });
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

import { parseExplicitFileRequest } from '../core/orchestrator/file-intent';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const literalCases: [string, string][] = [
    ['أنشئ ملف باسم proof.txt بمحتوى "Workspace verification passed." ثم اقرأ الملف', 'Workspace verification passed.'],
    ['أنشئ ملف باسم proof.txt بمحتوى "تم؟". ثم اقرأ الملف', 'تم؟'],
    ['Create a file named proof.txt with content "Completed.". Then read the file back.', 'Completed.'],
    ['Create a file named proof.txt with content "text" then read the file back.', 'text'],
    ['أنشئ ملف باسم proof.txt بمحتوى “جاهز” ثم اقرأ الملف', 'جاهز'],
    ['أنشئ ملف باسم proof.txt بمحتوى “ثابت” بعد ذلك اقرأ الملف', 'ثابت'],
    ["Create a file named proof.txt with content 'single quoted' then read the file back.", 'single quoted'],
    ['Create a file named proof.txt with content `code()` then read the file back.', 'code()'],
    ['Create a file named proof.txt with content "" then read the file back.', ''],
    ['Create a file named proof.txt with content "first then second" then read the file back.', 'first then second'],
    ['أنشئ ملف باسم proof.txt بمحتوى "أول ثم ثان" ثم اقرأ الملف', 'أول ثم ثان'],
    ['Create a file named proof.txt with content "line one\nline two" then read the file back.', 'line one\nline two'],
    ['Create a file named proof.txt with content "  exact spaces  " then read the file back.', '  exact spaces  '],
    ['Create a file named proof.txt with content "say \\"go\\" now" then read the file back.', 'say \\"go\\" now'],
];

describe('quoted content is literal, commands are outside its delimiters', () => {
    beforeEach(() => mockForbidden.mockClear());
    test.each(literalCases)('preserves literal bytes: %s', (prompt, content) => {
        expect(parseExplicitFileRequest(prompt)).toEqual({ path: 'proof.txt', content, readBack: true });
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        ['أنشئ ملف باسم plain.txt بمحتوى نص ثابت ثم اقرأ الملف', 'نص ثابت'],
        ['أنشئ ملف باسم plain.txt بمحتوى نص ثابت. بعد ذلك اقرأ الملف', 'نص ثابت'],
        ['Create a file named plain.txt with content plain text then read the file back.', 'plain text'],
        ['Create a file named plain.txt with content exactly two lines: one; two. Then read the file back.', 'one\ntwo'],
    ])('retains unquoted contracts: %s', (prompt, content) => {
        expect(parseExplicitFileRequest(prompt)).toEqual({ path: 'plain.txt', content, readBack: true });
    });
    test.each([
        'Create a file named literal.txt with content "read the file back"',
        'أنشئ ملف باسم literal.txt بمحتوى "اقرأ الملف"',
        'Create a file named literal.txt with content "then read the file back"',
        'أنشئ ملف باسم literal.txt بمحتوى "ثم اقرأ الملف"',
    ])('does not grant read-back from literal content: %s', prompt => {
        expect(parseExplicitFileRequest(prompt)?.readBack).toBe(false);
    });
    test.each([
        'Create a file named bad.txt with content "unclosed then read the file back.',
        'أنشئ ملف باسم bad.txt بمحتوى “غير مغلق ثم اقرأ الملف',
        "Create a file named bad.txt with content 'mismatch\" then read the file back.",
        'Create a file named bad.txt with content `unclosed then read the file back.',
    ])('rejects unclosed literal contracts: %s', prompt => {
        expect(parseExplicitFileRequest(prompt)).toBeNull();
    });
    test.each(['../outside.txt', '/outside.txt', 'C:/outside.txt', 'nested/../outside.txt'])('preserves path rejection: %s', path => {
        expect(parseExplicitFileRequest(`Create a file named ${path} with content "safe" then read the file back.`)).toBeNull();
    });
    test.each([literalCases[0], literalCases[2], literalCases[4], literalCases[9], literalCases[10], literalCases[12]])('actual front doors preserve exact content: %s', async (goal, content) => {
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent: { ...intent, rawIntent: { ...intent.rawIntent, capabilityCandidate: 'ai_write_file' } } });
        expect(plan.metadata?.matchedBy).toBe('explicit-file-contract');
        expect(plan.steps.map(step => step.tool)).toEqual(['write_file', 'read_file']);
        expect(plan.steps[0].input).toMatchObject({ path: 'proof.txt', content });
        expect(plan.steps[1]).toMatchObject({ input: { path: 'proof.txt' }, dependsOn: ['file_write'] });
        expect(mockForbidden).not.toHaveBeenCalled();
    });
});
