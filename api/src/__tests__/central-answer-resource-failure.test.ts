jest.mock('../core/llm/intelligent-router', () => ({
    ...jest.requireActual('../core/llm/intelligent-router'), routeToModel: jest.fn(),
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { ResourceAdmissionError, ResourceAdmissionCode } from '../core/resources/RequestResourceManager';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';

const router = routeToModel as jest.Mock;
const codes: ResourceAdmissionCode[] = ['RESOURCE_LOW_MEMORY', 'RESOURCE_MEMORY_UNAVAILABLE',
    'RESOURCE_CONTEXT_OVERFLOW', 'RESOURCE_QUEUE_FULL', 'RESOURCE_QUEUE_TIMEOUT',
    'RESOURCE_CANCELLED', 'RESOURCE_SCOPE_CLOSED', 'RESOURCE_CLEANUP_FAILED'];

describe('resource admission survives the direct-answer boundary', () => {
    beforeEach(() => { jest.useFakeTimers(); router.mockReset(); });
    afterEach(() => { jest.useRealTimers(); });

    it.each(codes)('publishes only typed %s without retry or private details', async code => {
        router.mockRejectedValue(new ResourceAdmissionError(code, { private: 'PRIVATE-DETAIL', availableBytes: 1 }));
        const result = await new CentralAnswerTool().execute({ question: 'Explain why memory admission matters.' }, { language: 'en' });
        expect(result).toMatchObject({ ok: false, output: { nonRecoverable: true, status: 'failed',
            reason: 'resource_admission_failed', resourceCode: code } });
        expect(router).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain('PRIVATE-DETAIL');
        expect(JSON.stringify(result)).not.toContain('availableBytes');
        expect(jest.getTimerCount()).toBe(0);
    });

    it.each(['ar', 'en'])('shows a memory-specific failure in %s', async language => {
        router.mockRejectedValue(new ResourceAdmissionError('RESOURCE_LOW_MEMORY'));
        const result = await new CentralAnswerTool().execute({ question: language === 'ar' ? 'لماذا نفحص الذاكرة قبل الاستدلال؟' : 'Why check memory before inference?' }, { language });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(language === 'ar' ? /الذاكرة المتاحة أقل من الحد الآمن/ : /available memory is below the safe limit/);
        expect(String(result.error)).not.toMatch(/المزوّد|provider/i);
    });

    it('does not trust a provider exception that merely spoofs a resource code', async () => {
        router.mockRejectedValue(Object.assign(new Error('PRIVATE-PROVIDER-DIAGNOSTIC'), { code: 'RESOURCE_LOW_MEMORY' }));
        const result = await new CentralAnswerTool().execute({ question: 'Explain memory admission.' }, { language: 'en' });
        expect(result).toMatchObject({ ok: false, output: { reason: 'answer_provider_failed' } });
        expect(JSON.stringify(result)).not.toContain('PRIVATE-PROVIDER-DIAGNOSTIC');
        expect(router).toHaveBeenCalledTimes(1);
    });

    it('keeps owner cancellation ahead of an admission refusal', async () => {
        const owner = new AbortController();
        router.mockImplementation(async () => { owner.abort(new Error('PRIVATE-OWNER-REASON')); throw new ResourceAdmissionError('RESOURCE_LOW_MEMORY'); });
        const result = await new CentralAnswerTool().execute({ question: 'Explain memory admission.' }, { language: 'en', signal: owner.signal });
        expect(result).toMatchObject({ ok: false, output: { reason: 'cancelled' } });
        expect(JSON.stringify(result)).not.toContain('PRIVATE-OWNER-REASON');
        expect(jest.getTimerCount()).toBe(0);
    });

    it.each(['RESOURCE_LOW_MEMORY', 'RESOURCE_MEMORY_UNAVAILABLE', 'RESOURCE_QUEUE_FULL', 'RESOURCE_QUEUE_TIMEOUT'] as ResourceAdmissionCode[])
    ('describes the refused correction step accurately for %s', async code => {
        router.mockResolvedValueOnce('PRIVATE-DRAFT: Memory admission protects the machine.');
        router.mockRejectedValueOnce(new ResourceAdmissionError(code, { private: 'PRIVATE-CORRECTION' }));
        const result = await new CentralAnswerTool().execute({ question: 'اشرح أهمية فحص الذاكرة.' }, { language: 'ar' });
        expect(result).toMatchObject({ ok: false, output: { reason: 'resource_admission_failed', resourceCode: code } });
        expect(router).toHaveBeenCalledTimes(2);
        expect(String(result.error)).toMatch(/خطوة الاستدلال/);
        expect(String(result.error)).not.toMatch(/لم أشغّل النموذج|لم أبدأ هذا الطلب/);
        expect(JSON.stringify(result)).not.toMatch(/PRIVATE-DRAFT|PRIVATE-CORRECTION/);
        expect(jest.getTimerCount()).toBe(0);
    });
});
