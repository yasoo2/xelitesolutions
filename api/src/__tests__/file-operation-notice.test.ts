/** Real AgentLoop entry, real explicit-file parsers and notice, with external edges closed.
 * Cancellation stops before orchestration; this proves the announcement boundary, not file execution.
 */
const mockMessages: string[] = [];
const mockBuilding = jest.fn(() => true);
const mockOrchestrator = jest.fn(() => { throw new Error('orchestration must remain closed'); });
jest.mock('../shared/models/run', () => ({ Run: { create: () => { throw new Error('no DB'); } } }));
jest.mock('../orchestration/AgentOrchestrator', () => ({ AgentOrchestrator: mockOrchestrator }));
jest.mock('../api/ws', () => ({
    broadcastThinkingDetail: (_sid: string, message: string) => mockMessages.push(message),
    broadcast: jest.fn(), registerRunSession: jest.fn(), unregisterRunSession: jest.fn(),
    addRunEventListener: jest.fn(), removeRunEventListener: jest.fn(),
}));
jest.mock('../modules/services/RepairTicketService', () => ({}));
jest.mock('../modules/services/SelfFixService', () => ({}));
jest.mock('../modules/services/SelfFixExecutionService', () => ({}));
jest.mock('../modules/services/ToolService', () => ({ executeTool: () => { throw new Error('no tool execution'); } }));
jest.mock('../core/api-discovery/integration-profiles', () => ({}));
jest.mock('../core/quality/verification-ledger', () => ({}));
jest.mock('../orchestration/AgentExecutionFirewall', () => ({}));
jest.mock('../core/memory/long-term-memory', () => ({}));
jest.mock('../shared/utils/language', () => ({ languageName: () => 'English' }));
jest.mock('../shared/attachments', () => ({ formatAttachmentsBlock: () => '' }));
jest.mock('../shared/vision', () => ({ describeImageAttachments: () => { throw new Error('no provider'); } }));
jest.mock('../shared/utils/deadline', () => ({}));
jest.mock('../api/chat-store', () => ({ usesLocalChatStore: () => true }));
jest.mock('../core/orchestrator/clarify', () => ({ clarifyGate: () => ({ kind: 'pass' }) }));
jest.mock('../core/orchestrator/phaseAnnounce', () => ({ phaseDetail: () => 'Reading the request' }));
jest.mock('../core/orchestrator/answerComposer', () => ({}));
jest.mock('../core/orchestrator/ExecutionMemory', () => ({}));
jest.mock('../modules/tools/definitions/ProjectPipelineTool', () => ({}));
jest.mock('../shared/run-evidence-store', () => ({ createRunEvidence: async () => undefined }));
jest.mock('../core/session/attended-run', () => ({ releaseHandle: jest.fn() }));
jest.mock('../core/orchestrator/PlanningEngine', () => ({ PlanningEngine: { looksLikeBuild: mockBuilding } }));
// Controlled generic classifier facts; existing scaffold suites separately cover real classifier outcomes.
jest.mock('../core/design/blueprints', () => ({ detectPageKind: () => 'generic' }));
jest.mock('../core/design/app-blueprints', () => ({ detectAppKind: () => null, uncoveredFeatures: () => [] }));
jest.mock('../core/design/section-name', () => ({ buildableFromWords: () => [], sectionNameFor: () => '' }));
jest.mock('../core/design/subject-phrase', () => ({ subjectPhrase: () => 'requested outcome' }));
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: () => null }));

import { AgentLoopService } from '../modules/services/AgentLoopService';
import { parseExplicitFileRequest, parseExplicitAppendFileRequest } from '../core/orchestrator/file-intent';

const rows = [
    { goal: 'Create a file named notes.txt with content "Useful text". Then read the file back.', file: true },
    { goal: 'Write a file named reports/status.json with content {"ready":true}. Then read it back.', file: true },
    { goal: 'أنشئ ملف باسم نتيجة.txt بمحتوى "نجح التنفيذ"', file: true },
    { goal: 'Save a file named list.txt containing exactly two lines: one; two', file: true },
    { goal: 'Append the second line "Verified" to the file notes.txt. Read the file back.', file: true },
    { goal: 'Add a new line "Item" to inventory.txt', file: true },
    { goal: 'أضف السطر "تم التحقق" إلى الملف نتيجة.txt واقرأ الملف', file: true },
    { goal: 'Build an unfamiliar interactive instrument for measuring poetry', file: false },
    { goal: 'Make a new application with an unusual interaction model', file: false },
    { goal: 'ابنِ أداة لقياس إيقاع القصيدة العربية', file: false },
    { goal: 'Create a page about how to write a file', file: false },
    { goal: 'Create a file', file: false },
    { goal: 'Create a file named notes.txt', file: false },
    { goal: 'Read notes.txt', file: false, building: false },
    { goal: 'Explain how file creation works', file: false, building: false },
    { goal: 'Answer only: what is a text file?', file: false, building: false },
];

describe('file operation announcement matches the chosen route', () => {
    beforeEach(() => { mockMessages.length = 0; mockOrchestrator.mockClear(); mockBuilding.mockReset(); });
    test.each(rows)('$goal', async ({ goal, file, building = true }) => {
        mockBuilding.mockReturnValue(building);
        expect(!!(parseExplicitFileRequest(goal) || parseExplicitAppendFileRequest(goal))).toBe(file);
        const result = await AgentLoopService.execute(goal, {
            sessionId: 'synthetic-session', workspaceId: 'synthetic-workspace', userId: 'synthetic-owner',
            language: 'en', runId: 'synthetic-run', cancellationHandle: { cancelled: true } as any,
        });
        expect(result).toMatchObject({ ok: false, result: { cancelled: true } });
        const notices = mockMessages.filter(message => message.includes('generic structure'));
        expect(notices).toHaveLength(building && !file ? 1 : 0);
        expect(mockMessages).toContain('Reading the request');
        expect(mockOrchestrator).not.toHaveBeenCalled();
    });
});
