jest.mock('../core/llm/intelligent-router', () => ({
  ...jest.requireActual('../core/llm/intelligent-router'), routeToModel: jest.fn(),
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';

const router = routeToModel as jest.Mock;
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function begin(context: any = {}, question = 'Explain test isolation. Answer only.') {
  let result: any;
  const promise = new CentralAnswerTool().execute({ question }, { language: 'en', ...context }).then(r => { result = r; return r; });
  return { promise, get result() { return result; } };
}
describe('bounded answer cancellation and terminal evidence', () => {
  beforeEach(() => { jest.useFakeTimers(); router.mockReset(); router.mockImplementation(() => new Promise(() => {})); });
  afterEach(() => { jest.useRealTimers(); });

  it('ends an uncooperative provider at the whole-answer deadline', async () => {
    const run = begin(); await flush();
    await jest.advanceTimersByTimeAsync(44999); expect(run.result).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(await run.promise).toMatchObject({ ok: false, output: { nonRecoverable: true, reason: 'answer_deadline_exceeded' } });
    expect(router.mock.calls[0][7].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('respects the tighter caller budget', async () => {
    const run = begin({ providerTimeoutMs: 3000, plannerTimeoutMs: 1000 }); await flush();
    await jest.advanceTimersByTimeAsync(999); expect(run.result).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1); expect((await run.promise).ok).toBe(false);
    expect(router.mock.calls[0][7].providerTimeoutMs).toBe(1000);
  });
  it('bridges owner cancellation even when the provider ignores abort', async () => {
    let cancel!: () => void;
    const cancellation = new Promise<void>(resolve => { cancel = resolve; });
    const run = begin({ cancellation }); await flush(); cancel();
    expect(await run.promise).toMatchObject({ ok: false, output: { nonRecoverable: true, reason: 'cancelled' } });
    expect(router.mock.calls[0][7].signal.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  });
  it('keeps a private abort reason out of public evidence', async () => {
    const controller = new AbortController(); const run = begin({ signal: controller.signal }); await flush();
    controller.abort(new Error('PRIVATE-OWNER-REASON'));
    const result = await run.promise; expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE-OWNER-REASON'); expect(jest.getTimerCount()).toBe(0);
  });
  it('shares the original deadline with an Arabic rewrite', async () => {
    router.mockResolvedValueOnce('A clear English explanation.');
    const run = begin({ language: 'ar' }, 'اشرح أهمية عزل الاختبارات.'); await flush();
    expect(router).toHaveBeenCalledTimes(2);
    expect(router.mock.calls[0][7].signal).toBe(router.mock.calls[1][7].signal);
    await jest.advanceTimersByTimeAsync(45000);
    expect(await run.promise).toMatchObject({ ok: false, output: { reason: 'answer_deadline_exceeded' } });
  });
  it('keeps successful answers and provider evidence, and makes late cancellation inert', async () => {
    let cancel!: () => void; const cancellation = new Promise<void>(resolve => { cancel = resolve; });
    const ledger = [{ provider: 'test-only', success: true }];
    router.mockImplementation(async (...args) => { args[7].providerAttempts = ledger; return 'A clear answer.'; });
    const context: any = { language: 'en', cancellation };
    const result = await new CentralAnswerTool().execute({ question: 'Explain test isolation.' }, context);
    expect(result).toMatchObject({ ok: true, output: 'A clear answer.' }); expect(context.providerAttempts).toBe(ledger);
    cancel(); await flush(); expect(router.mock.calls[0][7].signal.aborted).toBe(false); expect(jest.getTimerCount()).toBe(0);
  });
  it.each([{ aborted: false }, { aborted: false, addEventListener: true, removeEventListener: true }])('fails closed for malformed cancellation signal %p', async signal => {
    const run = begin({ signal });
    expect(await run.promise).toMatchObject({ ok: false, output: { nonRecoverable: true, reason: 'invalid_cancellation_context' } });
    expect(router).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
  it('owner stop wins over an instant greeting without any provider call', async () => {
    expect(await begin({ isCancelled: () => true }, 'hello').promise).toMatchObject({ ok: false });
    expect(router).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
});
