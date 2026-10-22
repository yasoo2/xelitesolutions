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
import { parseExplicitAppendFileRequest } from '../core/orchestrator/file-intent';


describe('literal file contracts keep their deterministic plan before inferred capabilities', () => {
    beforeEach(() => mockForbidden.mockClear());
    const appends = [
        ['Append the second line "Verified" to the file notes.txt. Read the file back.', 'notes.txt', 'Verified'],
        ['Add a new line "Item" to inventory.txt. Read the file back.', 'inventory.txt', 'Item'],
        ['Append line "done" to reports/status.txt. Read the file back.', 'reports/status.txt', 'done'],
        ['أضف السطر "الإضافة تعمل بدون موافقة" إلى الملف joe-independent-notes-20261011.txt واقرأ الملف', 'joe-independent-notes-20261011.txt', 'الإضافة تعمل بدون موافقة'],
        ['اضف سطر "تم" الى الملف نتيجة.txt واقرا الملف', 'نتيجة.txt', 'تم'],
        ['ألحق السطر "جاهز" في الملف سجل.txt واقرأ الملف', 'سجل.txt', 'جاهز'],
    ];
    test.each(appends)('real front doors preserve append contract: %s', async (goal, path, content) => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['write_file', 'read_file']);
        expect(intent.rawIntent.appendFileRequest).toMatchObject({path, content, readBack: true});
        const plan = await PlanningEngine.generatePlan({intent: {...intent, rawIntent: {...intent.rawIntent, capabilityCandidate:'ai_write_file'}}});
        expect(plan.metadata?.matchedBy).toBe('explicit-file-append-contract');
        expect(plan.steps.map(s => s.tool)).toEqual(['write_file', 'read_file']);
        expect(plan.steps[0].input).toMatchObject({path, content, mode:'append', requireExisting:true, ensureSingleAppend:true});
        expect(plan.steps[1]).toMatchObject({input:{path}, dependsOn:['file_append']});
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        ['Create a file named new.txt with content "hello". Then read the file back.', 'new.txt'],
        ['أنشئ ملف باسم نتيجة.txt بمحتوى "نجح" ثم اقرأ الملف', 'نتيجة.txt'],
    ])('complete create contract beats inferred candidate: %s', async (goal, path) => {
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({intent:{...intent,rawIntent:{...intent.rawIntent,capabilityCandidate:'ai_write_file'}}});
        expect(plan.metadata?.matchedBy).toBe('explicit-file-contract');
        expect(plan.steps.map(s => s.tool)).toEqual(['write_file','read_file']);
        expect(plan.steps[0].input.path).toBe(path);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Append line "hi" to notes.txt. No file changes.',
        'Append line "hi" to notes.txt. Answer only.',
        'أضف السطر "تم" إلى الملف نتيجة.txt. لا تعدل الملفات.',
        'Create a file named notes.txt with content "hi". Do not execute.',
    ])('explicit denial still wins: %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({intent:{...intent,rawIntent:{...intent.rawIntent,capabilityCandidate:'ai_write_file'}}});
        expect(plan.steps.map(s => s.tool)).toEqual(['central_answer']);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Append line "hi" to ../notes.txt',
        'Append line "hi" to /notes.txt',
        'Append line "hi" to C:/notes.txt',
        'Append line "hi"',
        'Append to notes.txt',
        'أضف السطر إلى الملف نتيجة.txt',
    ])('incomplete/escaping append stays outside literal contract: %s', goal => {
        expect(parseExplicitAppendFileRequest(goal)).toBeNull();
        expect(mockForbidden).not.toHaveBeenCalled();
    });
    test.each([
        'Explain how to append a line to a file.',
        'اشرح كيف تضيف سطراً إلى ملف نصي.',
    ])('knowledge request stays answer-only at parser: %s', async goal => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
        expect(mockForbidden).not.toHaveBeenCalled();
    });
});
