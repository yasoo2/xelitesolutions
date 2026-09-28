import { boundedLocalRecoveryProbe } from '../core/llm/intelligent-router';

describe('bounded local recovery probe', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('aborts a stalled provider request at the deadline', async () => {
        let signal: AbortSignal | undefined;
        let activeRequests = 0;
        const probe = boundedLocalRecoveryProbe((requestSignal) => {
            signal = requestSignal;
            activeRequests += 1;
            return new Promise<string>((_, reject) => {
                requestSignal.addEventListener('abort', () => {
                    activeRequests -= 1;
                    reject(new Error('provider aborted'));
                }, { once: true });
            });
        }, 1_000);
        const outcome = expect(probe).rejects.toThrow('local recovery probe timeout');

        await jest.advanceTimersByTimeAsync(999);
        expect(signal?.aborted).toBe(false);
        expect(activeRequests).toBe(1);

        await jest.advanceTimersByTimeAsync(1);
        await outcome;
        expect(signal?.aborted).toBe(true);
        expect(activeRequests).toBe(0);
    });

    it('does not abort a successful probe after it returns', async () => {
        let signal: AbortSignal | undefined;
        const answer = await boundedLocalRecoveryProbe((requestSignal) => {
            signal = requestSignal;
            return Promise.resolve('OK');
        }, 1_000);

        expect(answer).toBe('OK');
        await jest.advanceTimersByTimeAsync(1_000);
        expect(signal?.aborted).toBe(false);
    });
});
