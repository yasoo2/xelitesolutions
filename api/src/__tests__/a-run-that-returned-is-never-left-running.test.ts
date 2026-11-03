/**
 * ⛔ A RUN THAT RETURNED IS NEVER LEFT «RUNNING» — AND A THIN REQUEST IS BUILT, NOT QUESTIONED.
 *
 * The 500-prompt exam, 2026-11-03, P454: «ابني صفحة روبوت محادثة لخدمة عملاء
 * نادي رياضي يجاوب على الأسئلة الشائعة …، ويسمح للمستخدم بحجز أو إلغاء
 * الاشتراكات …، ويحفظ سجل المحادثة». The clarify gate read it as thin and
 * asked «ما الذي تريد تسجيله لكل واحد من «رياضي يجاوب»؟» — and the run that
 * asked announced its end under another id (`clarify-…`), so its own record
 * said `running` and the client waiting on it polled for eight hours.
 *
 * Three facts, each measured here:
 *   1. a request that says this much is not thin;
 *   2. a thin request is built with Joe's own choices, never stopped on a
 *      question (the owner, the same day: «بدون تدخل بشري»);
 *   3. whatever way a run's execution returns, its record is closed — and a
 *      record its receipt already closed is left exactly as it was.
 */
import { clarifyGate, isVagueBuildRequest } from '../core/orchestrator/clarify';
import { AgentLoopService } from '../modules/services/AgentLoopService';
import { registerRun } from '../core/session/attended-run';
import * as store from '../shared/run-evidence-store';

jest.mock('dotenv', () => ({ __esModule: true, default: { config: () => ({ parsed: {} }) } }));
jest.mock('../api/ws', () => ({
    broadcast: jest.fn(), broadcastThinkingDetail: jest.fn(),
    registerRunOwner: jest.fn(), registerSessionOwner: jest.fn(),
    addRunEventListener: jest.fn(), removeRunEventListener: jest.fn(),
    registerRunSession: jest.fn(), unregisterRunSession: jest.fn(),
}));
jest.mock('../api/chat-store', () => ({ flushChatStores: jest.fn(), usesLocalChatStore: () => true }));

const P454 = 'ابني صفحة روبوت محادثة لخدمة عملاء نادي رياضي يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء الاشتراكات من خلال المحادثة، ويحفظ سجل المحادثة.';

describe('a request that says this much is built, and a thin one is built too', () => {
    it('P454 is not thin: nothing is asked and nothing is decided for it', () => {
        expect(isVagueBuildRequest(P454)).toBe(false);
        expect(clarifyGate(P454, 'ar')).toEqual({ kind: 'pass' });
    });

    it('a thin request is decided — Joe says what he is choosing — and never asked', () => {
        const decided = clarifyGate('بدي شي أتابع فيه ديوني', 'ar');
        expect(decided.kind).toBe('decide');
        expect((decided as any).note).toMatch(/أختار بنفسي/);
        expect((decided as any).note).not.toMatch(/[؟?]/);
    });

    it('…and the four-word tracking request is still recognised as thin', () => {
        //  The negative of the P454 repair: describing words, not the length
        //  of the sentence, decide it — four of them is still thin.
        expect(isVagueBuildRequest('بدي شي أتابع فيه ديوني')).toBe(true);
    });
});

describe('the record of a run whose execution returned', () => {
    const rid = (label: string) => `run-left-open-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    it('a record still «running» is closed with the status and the reason', async () => {
        const runId = rid('open');
        await store.createRunEvidence(runId, { sessionId: 'left-open' });
        expect((await store.getRunEvidence(runId))?.status).toBe('running');
        await store.closeRunEvidenceIfOpen(runId, 'done', 'the execution returned without saving its receipt');
        const closed = await store.getRunEvidence(runId);
        expect(closed?.status).toBe('done');
        expect(closed?.events?.at(-1)).toMatchObject({ type: 'run_closed', data: { status: 'done', reason: 'the execution returned without saving its receipt' } });
    });

    it('a record its receipt closed is left exactly as it was', async () => {
        const runId = rid('receipt');
        await store.createRunEvidence(runId, { sessionId: 'left-open' });
        await store.saveRunReceipt(runId, { status: 'failed' } as any, 'failed');
        const before = await store.getRunEvidence(runId);
        await store.closeRunEvidenceIfOpen(runId, 'done', 'must not apply');
        expect(await store.getRunEvidence(runId)).toEqual(before);
    });

    it('an execution that returns early, throws, or was cancelled closes its own record', async () => {
        const early = rid('early');
        await store.createRunEvidence(early, { sessionId: 's-early' });
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockResolvedValueOnce({ ok: true, result: { answer: 'answered without a receipt' } });
        await AgentLoopService.execute('hello', { runId: early, sessionId: 's-early' });
        expect((await store.getRunEvidence(early))?.status).toBe('done');

        const thrown = rid('thrown');
        await store.createRunEvidence(thrown, { sessionId: 's-thrown' });
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockImplementationOnce(async (_g: any, options: any) => {
            options.resourceLifecycle.handlerInstalled = true;
            throw new Error('boom');
        });
        await expect(AgentLoopService.execute('hello', { runId: thrown, sessionId: 's-thrown' })).rejects.toThrow('boom');
        expect((await store.getRunEvidence(thrown))?.status).toBe('failed');

        const stopped = rid('stopped');
        await store.createRunEvidence(stopped, { sessionId: 's-stopped' });
        const handle = registerRun(stopped, 's-stopped');
        jest.spyOn(AgentLoopService as any, 'executeScoped').mockImplementationOnce(async () => {
            handle.cancel();
            return { ok: false, result: { answer: 'stopped' } };
        });
        //  A stop may surface as the resource manager's cancellation: either
        //  way the record must say what happened.
        await AgentLoopService.execute('hello', { runId: stopped, sessionId: 's-stopped', cancellationHandle: handle }).catch(() => undefined);
        expect((await store.getRunEvidence(stopped))?.status).toBe('cancelled');
    });
});
