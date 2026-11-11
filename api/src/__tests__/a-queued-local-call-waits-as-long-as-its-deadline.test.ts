import { RequestResourceManager } from '../core/resources/RequestResourceManager';

/**
 * Eval round 6, 2026-10-23: a compact plan with a 30-minute deadline queued
 * behind another local call and failed with RESOURCE_QUEUE_TIMEOUT at
 * 300 013 ms. On a CPU one plan runs ~16 min; the queue wait is bounded by
 * the caller's own deadline, not a second fixed 300 s cap.
 */
const GiB = 1024 ** 3;
const reading = () => ({ totalBytes: 16 * GiB, freeBytes: 8 * GiB, availableBytes: 8 * GiB, rssBytes: 1 });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

describe('a queued local call waits as long as its deadline', () => {
    afterEach(() => jest.useRealTimers());

    it('an explicit 20-minute wait survives a 10-minute call ahead of it', async () => {
        jest.useFakeTimers();
        const manager = new RequestResourceManager({ sampleMemory: reading });
        const entered = deferred();
        const finish = deferred();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
        await entered.promise;
        const queued = manager.withHeavy(async () => 'ran', { queueTimeoutMs: 20 * 60_000 });
        let settled = false;
        queued.then(() => { settled = true; }, () => { settled = true; });
        await jest.advanceTimersByTimeAsync(10 * 60_000);
        expect(settled).toBe(false);
        finish.resolve();
        await first;
        await expect(queued).resolves.toBe('ran');
    });

    it('the wait is still bounded: it ends at its own deadline', async () => {
        jest.useFakeTimers();
        const manager = new RequestResourceManager({ sampleMemory: reading });
        const entered = deferred();
        const finish = deferred();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
        await entered.promise;
        const queued = manager.withHeavy(async () => 'ran', { queueTimeoutMs: 20 * 60_000 });
        const timeout = expect(queued).rejects.toMatchObject({ code: 'RESOURCE_QUEUE_TIMEOUT' });
        await jest.advanceTimersByTimeAsync(20 * 60_000);
        await timeout;
        finish.resolve();
        await first;
    });
});
