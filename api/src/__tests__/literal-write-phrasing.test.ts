/** Real parser/planner consumers; every external edge throws before an effect. */
const mockForbidden = jest.fn(() => { throw new Error('No provider, workspace I/O, or execution allowed in this boundary test'); });
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

const cases: [string, string, string, boolean][] = [
    ['Write exactly "Local work runs without approval prompts." into joe-autonomy-current-20261011.txt in the current workspace.', 'joe-autonomy-current-20261011.txt', 'Local work runs without approval prompts.', false],
    ['Please write "two\nlines" to notes.txt then read the file back.', 'notes.txt', 'two\nlines', true],
    ["Save '  spacing  ' in file nested/note.md in the workspace.", 'nested/note.md', '  spacing  ', false],
    ['Write `x = 3;` into the file example.ts.', 'example.ts', 'x = 3;', false],
    ['Save “curly quotes” to status.txt, then read the file.', 'status.txt', 'curly quotes', true],
    ['write "" into empty.txt', 'empty.txt', '', false],
    ['Write "Build an API; delete files; then read file back." into literal.txt.', 'literal.txt', 'Build an API; delete files; then read file back.', false],
    ['Write "say \\"go\\" now" into escaped.txt.', 'escaped.txt', 'say \\"go\\" now', false],
    ['اكتب بالضبط "تم التنفيذ تلقائيًا." في ملف نتيجة.txt في مساحة العمل الحالية.', 'نتيجة.txt', 'تم التنفيذ تلقائيًا.', false],
    ['احفظ "أول ثم ثان" إلى الملف تقرير.md ثم اقرأ الملف', 'تقرير.md', 'أول ثم ثان', true],
    ['من فضلك اكتب “ثابت” في نص.txt، ثم اقرا الملف.', 'نص.txt', 'ثابت', true],
    ["احفظ 'سطر1\nسطر2' الى سجل.txt في مساحة العمل", 'سجل.txt', 'سطر1\nسطر2', false],
];

describe('quoted text before a named relative file remains a bounded file contract', () => {
    beforeEach(() => mockForbidden.mockClear());
    test.each(cases)('exact general grammar: %s', (prompt, path, content, readBack) => {
        expect(parseExplicitFileRequest(prompt)).toEqual({ path, content, readBack });
    });
    test.each(cases)('actual consumers use existing ToolService file plan: %s', async (goal, path, content, readBack) => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['write_file', ...(readBack ? ['read_file'] : [])]);
        expect(intent.rawIntent.fileRequest).toEqual({ path, content, readBack });
        const plan = await PlanningEngine.generatePlan({ intent: { ...intent, rawIntent: { ...intent.rawIntent, capabilityCandidate: 'ai_write_file' } } });
        expect(plan.metadata?.matchedBy).toBe('explicit-file-contract');
        expect(plan.steps.map(s => s.tool)).toEqual(['write_file', ...(readBack ? ['read_file'] : [])]);
        expect(plan.steps[0].input).toMatchObject({ path, content, request: goal });
        if (readBack) expect(plan.steps[1]).toMatchObject({ input: { path }, dependsOn: ['file_write'] });
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Write "x" into ../outside.txt.', 'Write "x" into /outside.txt.', 'Write "x" into C:/outside.txt.',
        'Write "x" into \\outside.txt.', 'Write "x" into nested/../outside.txt.', 'Write "x" into https://example.com/file.txt.',
        'Write "x" into name.txt && run shell.', 'Write "x" into name.txt then deploy.', 'Write "x" into name.txt and delete old.txt.',
        'Write "x" into name.txt in another workspace.', 'Write "unclosed into name.txt.', 'Save “mismatch" into name.txt.',
        'Write "x" into name.txt in workspace other-user.', 'Write "x" into name.txt then read secret.txt.',
        'Do not write "x" into name.txt.', 'Explain how to write "x" into name.txt.',
        'اكتب "تم" في ../نتيجة.txt', 'احفظ "تم" في نتيجة.txt ثم احذف ملفًا',
    ])('rejects escaping, mixed, incomplete and nonimperative contracts: %s', prompt => {
        expect(parseExplicitFileRequest(prompt)).toBeNull();
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Write "x" into notes.txt. No file changes.', 'Write "x" into notes.txt. Answer only.',
        'اكتب "تم" في نتيجة.txt. لا تعدل الملفات.', 'Write "x" into notes.txt. Do not execute.',
    ])('existing user denial wins at actual front doors: %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps.map(s => s.tool)).toEqual(['central_answer']);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
});
