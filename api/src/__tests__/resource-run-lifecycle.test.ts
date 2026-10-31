import { RequestResourceManager, ResourceAdmissionError } from '../core/resources/RequestResourceManager';
import { AgentLoopService } from '../modules/services/AgentLoopService';
import { requestResourceManager } from '../core/resources/RequestResourceManager';
import { broadcast } from '../api/ws';
import { isRunning, registerRun } from '../core/session/attended-run';
import * as vision from '../shared/vision';

// Import graphs use the synthetic test environment, never the owner's .env.
jest.mock('dotenv', () => ({ __esModule: true, default: { config: () => ({ parsed: {} }) } }));
jest.mock('../api/ws', () => ({
    broadcast: jest.fn(), broadcastThinkingDetail: jest.fn(),
    registerRunOwner: jest.fn(), registerSessionOwner: jest.fn(),
    addRunEventListener: jest.fn(), removeRunEventListener: jest.fn(),
    registerRunSession: jest.fn(), unregisterRunSession: jest.fn(),
}));
jest.mock('../shared/run-evidence-store', () => ({
    appendRunEvidenceEvent: jest.fn(async () => {}), createRunEvidence: jest.fn(async () => {}),
    saveRunReceipt: jest.fn(async () => {}),
}));
jest.mock('../api/chat-store', () => ({ flushChatStores: jest.fn(), usesLocalChatStore: () => true }));

describe('same-run resource failure delivery and cancellation ownership', () => {
    afterEach(() => jest.restoreAllMocks());

    test('an early vision admission failure ends the same run exactly once and releases its handle', async () => {
        const runId = 'resource-lifecycle-early';
        const sessionId = 'resource-lifecycle-session';
        const handle = registerRun(runId, sessionId);
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockRejectedValue(new ResourceAdmissionError('RESOURCE_LOW_MEMORY'));
        await expect(AgentLoopService.execute('Inspect the attached screenshot', {
            runId, sessionId, userId: 'fixture-owner', language: 'ar', cancellationHandle: handle,
        })).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        const terminal = (broadcast as jest.Mock).mock.calls.map(call => call[0])
            .filter(frame => frame.type === 'run_finished' && frame.runId === runId);
        expect(terminal).toHaveLength(1);
        expect(terminal[0]).toMatchObject({ sessionId, data: { runId, sessionId, ok: false } });
        expect(isRunning(runId)).toBe(false);
        expect(isRunning(sessionId)).toBe(false);
        expect(requestResourceManager.status().activeRequests).toBe(0);
        expect(requestResourceManager.status().heavy).toEqual({ active: 0, queued: 0 });
    });

    test('the inner terminal handler is not duplicated by the outer resource scope', async () => {
        const runId = 'resource-lifecycle-inner';
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockImplementation(async (_goal: any, options: any) => {
            options.resourceLifecycle.handlerInstalled = true;
            broadcast({ type: 'run_finished', runId, data: { runId, ok: false, sessionId: options.sessionId } } as any);
            throw new ResourceAdmissionError('RESOURCE_CONTEXT_OVERFLOW');
        });
        await expect(AgentLoopService.execute('Explain the request', { runId, sessionId: 'inner-session' }))
            .rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        expect((broadcast as jest.Mock).mock.calls.map(call => call[0])
            .filter(frame => frame.type === 'run_finished' && frame.runId === runId)).toHaveLength(1);
        expect(requestResourceManager.status().activeRequests).toBe(0);
    });

    test('the actual pre-orchestration image boundary propagates admission failure and finishes once', async () => {
        const runId = 'resource-lifecycle-real-vision';
        const sessionId = 'resource-image-session';
        const image = jest.spyOn(vision, 'describeImageAttachments')
            .mockRejectedValue(new ResourceAdmissionError('RESOURCE_LOW_MEMORY'));
        await expect(AgentLoopService.execute('Describe the attached screenshot.', {
            runId, sessionId, userId: 'image-owner', language: 'en',
            attachments: [{ name: 'screen.png', mimeType: 'image/png', path: 'inert-image-fixture.png', size: 1, content: '' }],
        })).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(image).toHaveBeenCalledTimes(1);
        expect(image.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
        expect((broadcast as jest.Mock).mock.calls.map(call => call[0])
            .filter(frame => frame.type === 'run_finished' && frame.runId === runId)).toHaveLength(1);
        expect(isRunning(runId)).toBe(false);
        expect(requestResourceManager.status().activeRequests).toBe(0);
    });

    test.each(['RESOURCE_LOW_MEMORY', 'RESOURCE_CONTEXT_OVERFLOW', 'RESOURCE_QUEUE_TIMEOUT', 'RESOURCE_CANCELLED'])
    ('%s is explained without claiming another model or application was changed', code => {
        const text = AgentLoopService.humanizeFailure(code, 'ar');
        expect(text).toMatch(/[ء-ي]/);
        expect(text).not.toContain(code);
    });

    test('measurement uses available physical memory, never the total/pagefile capacity', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => ({
            totalBytes: 128 * 1024 ** 3, freeBytes: 128 * 1024 ** 2, availableBytes: 128 * 1024 ** 2,
        }) });
        const work = jest.fn(async () => 'not started');
        await expect(manager.withHeavy(work)).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
    });

    test.each([
        ['اشرح بالعربية فائدة قياس الذاكرة.', 'en', /أنتظر انتهاء المهمة الثقيلة/, /الذاكرة المتاحة/],
        ['Answer in English: explain memory admission.', 'ar', /Waiting for the current heavy task/, /Available memory/],
    ])('resource details follow the resolved language and exact run: %s', async (goal, uiLanguage, queuedText, memoryText) => {
        const runId = `resource-language-${uiLanguage}`;
        const sessionId = 'same-resource-language-session';
        jest.spyOn(requestResourceManager, 'run').mockImplementation(async (scope: any, work: any) => {
            scope.notify({ lane: 'heavy', state: 'queued', kind: 'inference' });
            scope.notify({ lane: 'inference', state: 'started', availableBytes: 1304 * 1048576, contextTokens: 2048 });
            return work();
        });
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockImplementation(async (_goal: any, options: any) => {
            options.resourceLifecycle.handlerInstalled = true;
            return { ok: true };
        });
        await AgentLoopService.execute(String(goal), { runId, sessionId, userId: 'language-owner', language: String(uiLanguage) });
        const details = (broadcast as jest.Mock).mock.calls.map(call => call[0])
            .filter(frame => frame.type === 'thinking_detail' && frame.runId === runId);
        expect(details).toHaveLength(2);
        expect(details[0]).toMatchObject({ sessionId, runId, data: { sessionId } });
        expect(details[0].data.detail).toMatch(queuedText as RegExp);
        expect(details[1].data.detail).toMatch(memoryText as RegExp);
        expect(details[1].data.detail).toMatch(/1304.*2048/);
        expect(new Set(details.map(frame => frame.id)).size).toBe(2);
        expect(isRunning(runId)).toBe(false);
    });
});
