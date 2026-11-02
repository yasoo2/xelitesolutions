/** Real front doors; no model, filesystem, capability, or tool execution permitted. */
const mockForbidden = jest.fn(() => { throw new Error('Read routing must not invoke a provider or execute effects'); });
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
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden,
    generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));

import { parseExplicitFileReadRequest } from '../core/orchestrator/file-intent';
import { isKnowledgeQuestionStructural } from '../core/intelligence/intent-classifier';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { resolveRequestedAnswerLanguage } from '../core/llm/requested-answer-language';

const reported = 'اقرأ ملف package.json من المشروع المحدد، وأخبرني باللغة العربية باسم المشروع وأمر تشغيل الاختبارات فقط. لا تعدّل أي ملف ولا تشغّل أو تثبّت شيئًا.';
afterEach(() => { expect(mockForbidden).not.toHaveBeenCalled(); mockForbidden.mockClear(); });

describe('bounded file read plus result reporting retains its operation', () => {
    test.each([
        [reported, 'package.json'],
        ['اقرأ ملف config/service.json من المشروع الحالي، وأخبرني باللغة العربية باسم الخدمة فقط. لا تعدل أي ملف ولا تشغل أي برنامج.', 'config/service.json'],
        ['اقرأ الملف نتيجة.txt وأخبرني بمحتواه فقط. لا تكتب أي ملفات.', 'نتيجة.txt'],
        ['Read file config/service.json from the selected project and tell me the service name and test command only. No writes, runs or installs.', 'config/service.json'],
        ['Read the file settings.json and report the environment name. Do not write any files. Do not run commands.', 'settings.json'],
        ['Read file notes.txt. No file changes.', 'notes.txt'],
        ['Read file notes.txt and report whether it contains "then please run tests". No writes.', 'notes.txt'],
        ['Read file notes.txt and report whether it contains "without using tools".', 'notes.txt'],
    ])('actual parser and planner preserve one guarded read: %s', async (goal, file) => {
        expect(parseExplicitFileReadRequest(goal)).toBe(file);
        expect(isKnowledgeQuestionStructural(goal)).toBe(false);
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.goal).toBe(goal);
        expect(intent.requiredTools).toEqual(['read_file']);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'read_file', input: { path: file, request: goal }, dependsOn: [] });
    });
    test.each([
        'Read file notes.txt and report its contents only answer.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه، أجب فقط.',
        'Read file notes.txt and report its contents but don’t access files.',
        'Read file notes.txt and report its contents without using tools.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه ولا تستخدم الأدوات.',
    ])('actual front doors retain global read/tool denial: %s', async goal => {
        expect(parseExplicitFileReadRequest(goal)).toBeNull();
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
        const direct = await PlanningEngine.generatePlan({ intent: { goal, rawIntent: {} } as any });
        expect(direct.steps.map(step => step.tool)).toEqual(['central_answer']);
    });
    test.each([
        'Read file notes.txt and report its contents without using tools.',
        'Read file notes.txt and report its contents. Do not execute any tools.',
        'Read file notes.txt and report its contents. Do not access files.',
        'Read file notes.txt and report its contents. Answer only.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه ولا تستخدم الأدوات.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه. لا تقرأ الملفات.',
        'Read file notes.txt and report its contents, then run tests.',
        'Read file notes.txt and report its contents, then please run tests.',
        'Read file notes.txt and report its contents and also install dependencies.',
        'Read file notes.txt and report the title after installing dependencies.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه ومن فضلك شغل الاختبارات.',
        'Read file notes.txt and report its contents. Then delete it.',
        'Read file notes.txt and report its contents. Do not write files but install dependencies.',
        'Read file notes.txt and report its contents. Do not write files and also run tests.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه. لا تكتب الملفات وشغل الاختبارات.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه وشغّل الاختبارات.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه ثم اكتب ملفا آخر.',
        'Read file notes.txt and report its contents. Send an email.',
        'Read file ../notes.txt and tell me the title.',
        'Read file /notes.txt and tell me the title.',
        'Read file C:/notes.txt and tell me the title.',
        '"Read file notes.txt and report its contents"',
    ])('global denials, extra actions and escaping paths cannot borrow the read contract: %s', goal => {
        expect(parseExplicitFileReadRequest(goal)).toBeNull();
    });
});

describe('Arabic inform/report output-language framing', () => {
    test.each([
        [reported, 'ar'],
        ['أخبرني باللغة العربية عن نتيجة التحقق.', 'ar'],
        ['اقرأ النتيجة وأخبرنا باللغة العربية.', 'ar'],
        ['قل لي باللغة العربية ما النتيجة.', 'ar'],
        ['لا تخبرني باللغة العربية.', 'en'],
        ['The label is "أخبرني باللغة العربية".', 'en'],
        ['The variable مخبرني باللغة العربية appears here.', 'en'],
        ['أخبرني باللغة العربية. Answer in English.', 'en'],
    ])('honors bounded directive while retaining negation/quotation: %s', (goal, language) => {
        expect(resolveRequestedAnswerLanguage(goal, 'en')).toBe(language);
    });
});
