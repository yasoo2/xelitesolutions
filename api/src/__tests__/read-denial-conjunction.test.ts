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
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const actual = 'Read file package.json and report only version and license. Do not modify files or run commands.';
afterEach(() => { expect(mockForbidden).not.toHaveBeenCalled(); mockForbidden.mockClear(); });

describe('read authority under operation-specific OR prohibitions', () => {
    test.each([
        [actual, 'package.json'],
        ['Read file config/service.json and tell me the service name only. Do not write files or install packages.', 'config/service.json'],
        ['Read file notes.txt. Do not edit files or delete files.', 'notes.txt'],
        ["Read file settings.json and report its contents. Don't modify files or run commands.", 'settings.json'],
        ['Read file docs/info.txt and report its title. Never write files or install packages.', 'docs/info.txt'],
        ['Read file notes.txt and report its contents. Do not run commands or modify files.', 'notes.txt'],
        ['Read file notes.txt and report whether it contains "then please run tests". Do not modify files or run commands.', 'notes.txt'],
        ['Read file notes.txt and report whether it contains "or use any tools". Do not modify files or run commands.', 'notes.txt'],
        ['Read file notes.txt and report its contents. No writes, runs or installs.', 'notes.txt'],
        ['اقرأ ملف package.json وأخبرني بالإصدار والترخيص فقط. لا تعدل الملفات أو تشغل أو تثبت شيئا.', 'package.json'],
        ['اقرأ ملف config/service.json وأخبرني باسم الخدمة فقط. لا تكتب الملفات ولا تشغل أي برنامج.', 'config/service.json'],
        ['اقرأ ملف نتيجة.txt وأخبرني هل يحتوي على "ثم شغل الاختبارات". لا تعدل الملفات أو تشغل أي برنامج.', 'نتيجة.txt'],
    ])('current parser and planner retain exactly one guarded read: %s', async (goal, file) => {
        expect(parseExplicitFileReadRequest(goal)).toBe(file);
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['read_file']);
        expect(parsed.goal).toBe(goal);
        for (const intent of [parsed, { goal, rawIntent: {} }]) {
            const plan = await PlanningEngine.generatePlan({ intent: intent as any });
            expect(plan.steps).toHaveLength(1);
            expect(plan.steps[0]).toMatchObject({ tool: 'read_file', input: { path: file, request: goal }, dependsOn: [] });
            expect(plan.steps[0].input.command).toBeUndefined();
        }
    });

    test.each([
        'Do not modify files and run commands.',
        'Do not modify files or please run commands.',
        'Do not modify files or use any tools.',
        'Do not modify files or call any tools.',
        'Do not modify files or access files.',
        'Do not modify files or read files.',
        'Do not modify files or invoke a callback.',
        'Do not modify files or perform an unknown operation.',
        'Do not modify files or notify another user.',
        'Do not modify files or run commands with an unknown callback.',
        'Do not modify files or run commands, and please install packages.',
        'Do not modify files or run commands then write notes.txt.',
        'Do not modify files or run commands but delete notes.txt.',
        'Do not modify files or run commands. Also open a browser.',
        'Do not modify files or run commands after installing dependencies.',
        'Do not modify files or read secrets.txt.',
        'Do not modify files or run commands. Do not use any tools.',
        'Do not modify files or run commands. Do not read files.',
        'Do not modify files or run commands. Only answer.',
        'لا تعدل الملفات وشغل الاختبارات.',
        'لا تعدل الملفات أو شغل الاختبارات.',
        'لا تعدل الملفات أو تشغل أي برنامج ثم احذف الملف.',
        'لا تعدل الملفات أو تشغل أي برنامج لكن ثبت الحزم.',
        'لا تعدل الملفات أو تشغل أي برنامج ولا تستخدم الأدوات.',
        'لا تعدل الملفات أو تشغل أي برنامج. لا تقرأ الملفات.',
        'لا تعدل الملفات أو تشغل أي برنامج. أجب فقط.',
        'لا تعدل الملفات أو تستخدم الأدوات.',
        'لا تعدل الملفات أو تستدعي الأدوات.',
        'لا تعدل الملفات أو تقرأ الملفات.',
        'لا تعدل الملفات أو تنفذ عملية مجهولة.',
    ])('mixed or global-denied requests cannot borrow the read exception: %s', async tail => {
        const goal = `Read file notes.txt and report its contents. ${tail}`;
        expect(parseExplicitFileReadRequest(goal)).toBeNull();
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['central_answer']);
        for (const intent of [parsed, { goal, rawIntent: { noFileChanges: true, readOnly: true }, requiredTools: ['read_file'] }]) {
            const plan = await PlanningEngine.generatePlan({ intent: intent as any });
            expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
        }
    });

    test.each([
        'Read file ../other/package.json and report its name. Do not modify files or run commands.',
        'Read file C:/other/package.json and report its name. Do not modify files or run commands.',
        'Read file /other/package.json and report its name. Do not modify files or run commands.',
        'Read file notes.txt and report its contents or run tests. Do not modify files or run commands.',
        'اقرأ ملف نتيجة.txt وأخبرني بمحتواه أو شغل الاختبارات. لا تعدل الملفات أو تشغل أي برنامج.',
        'Explain "Read file package.json and report version. Do not modify files or run commands." No file changes.',
    ])('paths and quoted/affirmative report instructions stay bounded: %s', async goal => {
        expect(parseExplicitFileReadRequest(goal)).toBeNull();
        const parsed = await IntentParser.parse(goal, {} as any);
        expect(parsed.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({ intent: { goal, rawIntent: { noFileChanges: true } } as any });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
    });
});

