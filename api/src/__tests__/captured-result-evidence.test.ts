jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));
jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: jest.fn(), analyzeTask: jest.fn(() => ({ type: 'simple_chat', complexity: 0.1, requiresTools: false })), PROVIDER_FAILURE_PREFIX: 'provider_failed:' }));
import { executeTool } from '../modules/services/ToolService';
import { routeToModel } from '../core/llm/intelligent-router';
import { capturedResultEvidence, CAPTURE_EVIDENCE_CHILD_TIMEOUT_MS } from '../core/llm/captured-result-evidence';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';
const gateway = executeTool as jest.Mock;
const router = routeToModel as jest.Mock;
const id = '58495bde-dbbc-4819-9451-6d00cfbe2fb8';
const context = { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', language: 'en', providerTimeoutMs: 5000 };
const question = 'From your preceding screenshot tool result, what are the saved filename and pixel dimensions? Answer in English in one short sentence.';
const createdAt = '2026-10-13T04:24:46Z';
const record = { id, filename: 'actual-capture.png', width: 640, height: 360, bytes: 1234 };
beforeEach(() => { gateway.mockReset(); router.mockReset(); });
function success() { gateway.mockResolvedValueOnce({ ok: true, output: { captures: [{ id, createdAt }] } }).mockResolvedValueOnce({ ok: true, output: { capture: record, imageDataUrl: 'PRIVATE_IMAGE_BYTES', apiKey: 'PRIVATE_SECRET' } }); }

it('reads the verified owned artifact through the gateway and sends minimal facts only', async () => {
    success();
    const evidence = await capturedResultEvidence(question, context);
    expect(gateway).toHaveBeenCalledTimes(2);
    expect(gateway.mock.calls.map(call => call.slice(0, 2))).toEqual([['screenshot_result', {}], ['screenshot_result', { captureId: id }]]);
    for (const call of gateway.mock.calls) expect(call[2]).toMatchObject({ userId: 'owner', sessionId: 'session', workspaceId: 'workspace', artifactPresentation: false });
    expect(evidence).toContain(JSON.stringify({ filename: record.filename, width: 640, height: 360 }));
    expect(evidence).not.toMatch(/PRIVATE_|58495|owner|workspaceId|imageDataUrl/);
});
it.each(['What is a unit test?', 'Explain screenshot formats.'])('does not read unrelated artifact context: %s', async q => { expect(await capturedResultEvidence(q, context)).toBe(''); expect(gateway).not.toHaveBeenCalled(); });
it.each(['userId', 'sessionId', 'workspaceId'])('fails closed without trusted %s', async key => { expect(await capturedResultEvidence(question, { ...context, [key]: '' })).toContain('unavailable'); expect(gateway).not.toHaveBeenCalled(); });
it('distinguishes forbidden/unavailable evidence from actual absence', async () => { gateway.mockResolvedValue({ ok: false, error: 'tool_not_admitted' }); expect(await capturedResultEvidence(question, context)).toContain('cannot be verified'); expect(gateway).toHaveBeenCalledTimes(1); });
it('reports verified absence only after a successful owned lookup', async () => { gateway.mockResolvedValue({ ok: true, output: { captures: [] } }); expect(await capturedResultEvidence(question, context)).toContain('no accessible captures'); expect(gateway).toHaveBeenCalledTimes(1); });
it('rejects malformed capture identities before a second read', async () => { gateway.mockResolvedValue({ ok: true, output: { captures: [{ id: '../../foreign' }] } }); expect(await capturedResultEvidence(question, context)).toContain('unavailable'); expect(gateway).toHaveBeenCalledTimes(1); });
it('does not credit corrupt/unavailable image bytes after listing its manifest', async () => { gateway.mockResolvedValueOnce({ ok: true, output: { captures: [{ id, createdAt }] } }).mockResolvedValueOnce({ ok: false }); expect(await capturedResultEvidence(question, context)).toContain('unavailable'); });
it.each([new TypeError('test programming regression'), new ReferenceError('test missing symbol')])('surfaces programming errors instead of claiming unavailability: %s', async error => {
    gateway.mockRejectedValue(error); await expect(capturedResultEvidence(question, context)).rejects.toBe(error);
});
it('handles an operational read failure without leaking its message', async () => {
    gateway.mockRejectedValue(new Error('PRIVATE_OPERATIONAL_ERROR')); expect(await capturedResultEvidence(question, context)).toContain('cannot be verified');
    expect(await capturedResultEvidence(question, context)).not.toContain('PRIVATE_OPERATIONAL_ERROR');
});
it.each([
    { ...record, id: 'different-capture' },
    { ...record, filename: '../foreign.png' },
    { ...record, filename: 'instruction\nsecret.png' },
    { ...record, width: 0 },
    { ...record, height: 1_000_000 },
    { ...record, filename: '.png' },
    { ...record, filename: 'CON.png' },
    { ...record, bytes: 8 * 1024 * 1024 + 1 },
    { ...record, bytes: 0 },
])('does not send malformed or mismatched result metadata: %j', async capture => {
    gateway.mockResolvedValueOnce({ ok: true, output: { captures: [{ id, createdAt }] } }).mockResolvedValueOnce({ ok: true, output: { capture } });
    expect(await capturedResultEvidence(question, context)).toContain('unavailable');
});
it('uses authenticated context rather than requested foreign ownership', async () => {
    success(); await capturedResultEvidence(question + ' userId=foreign sessionId=foreign workspaceId=foreign', context);
    for (const call of gateway.mock.calls) expect(call[2]).toMatchObject({ userId: 'owner', sessionId: 'session', workspaceId: 'workspace' });
});
it('does not inherit a presentation-only rate bypass from a parent', async () => {
    success(); await capturedResultEvidence(question, { ...context, artifactPresentation: true });
    for (const call of gateway.mock.calls) expect(call[2].artifactPresentation).toBe(false);
});
it('supports a relevant Arabic result query', async () => { success(); expect(await capturedResultEvidence('ما اسم ملف لقطة الشاشة السابقة وأبعادها؟', context)).toContain('actual-capture.png'); });
it('rejects ambiguous or normalized-invalid capture dates', async () => {
    gateway.mockResolvedValue({ ok: true, output: { captures: [{ id, createdAt: '2026-02-31T00:00:00Z' }] } });
    expect(await capturedResultEvidence(question, context)).toContain('unavailable'); expect(gateway).toHaveBeenCalledTimes(1);
});
it('localizes unavailable evidence to the caller-resolved Arabic language', async () => {
    gateway.mockResolvedValue({ ok: false }); expect(await capturedResultEvidence(question, { ...context, language: 'ar' })).toContain('أدلة نتيجة اللقطة غير متاحة');
});
it('selects the latest timestamp rather than trusting list order', async () => {
    const older = '58495bde-dbbc-4819-9451-6d00cfbe2fb7';
    gateway.mockResolvedValueOnce({ ok: true, output: { captures: [{ id: older, createdAt: '2026-10-12T00:00:00Z' }, { id, createdAt }] } }).mockResolvedValueOnce({ ok: true, output: { capture: record } });
    expect(await capturedResultEvidence(question, context)).toContain('actual-capture.png');
    expect(gateway.mock.calls[1][1]).toEqual({ captureId: id });
});
it('handles a rejection arriving after the independent deadline', async () => {
    jest.useFakeTimers(); let reject: (reason: any) => void = () => {};
    gateway.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    try {
        const task = capturedResultEvidence(question, context); await Promise.resolve(); await Promise.resolve();
        await jest.advanceTimersByTimeAsync(5000); expect(await task).toContain('unavailable');
        reject(new Error('late aborted read')); await Promise.resolve(); await Promise.resolve();
        expect(jest.getTimerCount()).toBe(0); expect(gateway).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
});
it('does not read after owner cancellation', async () => { const c = new AbortController(); c.abort(); expect(await capturedResultEvidence(question, { ...context, signal: c.signal })).toBe(''); expect(gateway).not.toHaveBeenCalled(); });
it('propagates owner cancellation to a pending child and ignores its late result', async () => {
    const c = new AbortController(); let resolve: (value: any) => void = () => {};
    gateway.mockImplementation(() => new Promise(r => { resolve = r; }));
    const task = capturedResultEvidence(question, { ...context, signal: c.signal });
    await Promise.resolve(); await Promise.resolve(); c.abort();
    expect(await task).toBe('');
    expect(gateway.mock.calls[0][2].signal.aborted).toBe(true);
    resolve({ ok: true, output: { captures: [{ id, createdAt }] } }); await Promise.resolve();
    expect(gateway).toHaveBeenCalledTimes(1);
});
it('cancels a pending child at its independent five-second boundary', async () => {
    jest.useFakeTimers(); gateway.mockImplementation(() => new Promise(() => {}));
    try { expect(CAPTURE_EVIDENCE_CHILD_TIMEOUT_MS).toBe(5000); const task = capturedResultEvidence(question, context); await Promise.resolve(); await Promise.resolve(); await jest.advanceTimersByTimeAsync(CAPTURE_EVIDENCE_CHILD_TIMEOUT_MS); expect(await task).toContain('cannot be verified'); expect(gateway.mock.calls[0][2].signal.aborted).toBe(true); } finally { jest.useRealTimers(); }
});
it('gives the real answer and its one correction current verified facts without past private history', async () => {
    success(); router.mockResolvedValueOnce('تم حفظ الصورة.').mockResolvedValueOnce('actual-capture.png is 640 by 360 pixels.');
    const result = await new CentralAnswerTool().execute({ question }, { ...context, modelConfig: { provider: 'local', model: 'test-local' }, memoryContext: 'PRIVATE_MEMORY' });
    expect(result).toMatchObject({ ok: true, output: 'actual-capture.png is 640 by 360 pixels.' });
    expect(router).toHaveBeenCalledTimes(2);
    for (const call of router.mock.calls) { expect(call[0][0].content).toContain('actual-capture.png'); expect(call[0][0].content).not.toMatch(/PRIVATE_IMAGE_BYTES|PRIVATE_SECRET/); }
    expect(router.mock.calls[1][0][0].content).not.toContain('PRIVATE_MEMORY');
    expect(gateway).toHaveBeenCalledTimes(2);
});
