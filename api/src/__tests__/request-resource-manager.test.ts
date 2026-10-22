import { RequestResourceManager, ResourceAdmissionError, ResourceEvent } from '../core/resources/RequestResourceManager';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const reading = (available = 8 * GiB) => ({ totalBytes: 16 * GiB, freeBytes: available, availableBytes: available, rssBytes: 100 * MiB });
const deferred = <T = void>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(finish => { resolve = finish; });
    return { promise, resolve };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('request resource admission and ownership', () => {
    afterEach(() => { jest.useRealTimers(); });

    it.each([[GiB, 2048], [2 * GiB, 4096], [4 * GiB, 4096]])('uses measured available RAM %i for default context tier %i', async (free, expected) => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading(free) });
        const result = await manager.withInference(async budget => {
            expect(budget.memory.availableBytes).toBe(free);
            expect(budget.reservedMemoryBytes).toBe(768 * MiB);
            expect(budget.estimated).toBe(true);
            return budget.contextTokens;
        }, { promptEstimatedTokens: 100, requestedOutputTokens: 512 });
        expect(result).toBe(expected);
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
        expect(manager.status().inference).toEqual({ active: 0, queued: 0 });
    });

    it('permits 8192 only as an explicit trusted constructor policy with unverified runtime estimates', async () => {
        const manager = new RequestResourceManager({ maxContextTokens: 8192, sampleMemory: () => reading(4 * GiB) });
        await manager.withInference(async budget => {
            expect(budget.contextTokens).toBe(8192);
            expect(budget.estimated).toBe(true);
        }, { promptEstimatedTokens: 100 });
        const defaultPolicy = new RequestResourceManager({ sampleMemory: () => reading(8 * GiB) });
        await defaultPolicy.withInference(async budget => { expect(budget.contextTokens).toBe(4096); },
            { promptEstimatedTokens: 100, requestedContextTokens: 8192 });
    });

    it('uses the smaller valid availability reading and provider cap, never total memory', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => ({ ...reading(8 * GiB), totalBytes: 200 * GiB, availableBytes: GiB }) });
        await manager.withInference(async budget => {
            expect(budget.contextTokens).toBe(2048);
            expect(budget.memory.availableBytes).toBe(GiB);
        }, { promptEstimatedTokens: 100, requestedContextTokens: 4096 });
        const capped = new RequestResourceManager({ maxContextTokens: 4096, sampleMemory: () => reading(8 * GiB) });
        await capped.withInference(async budget => { expect(budget.contextTokens).toBe(4096); },
            { promptEstimatedTokens: 100, requestedContextTokens: 100000 });
    });

    it('rejects oversized prompt/output estimates without invoking inference or shrinking output', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading(GiB) });
        const work = jest.fn(async () => 'unexpected');
        await expect(manager.withInference(work, { promptEstimatedTokens: 1800, requestedOutputTokens: 512 }))
            .rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW', details: { contextTokens: 2048, requestedOutputTokens: 512 } });
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().heavy.active).toBe(0);
        expect(manager.status().inference.active).toBe(0);
    });

    it.each([NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid prompt estimate %s', async promptEstimatedTokens => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        await expect(manager.withInference(async () => undefined, { promptEstimatedTokens })).rejects.toMatchObject({ code: 'RESOURCE_INVALID_BUDGET' });
    });

    it('fails closed on unavailable telemetry and refuses low RAM before heavy work', async () => {
        const work = jest.fn(async () => undefined);
        const unavailable = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: NaN, availableBytes: 0 }) });
        await expect(unavailable.withHeavy(work)).rejects.toMatchObject({ code: 'RESOURCE_MEMORY_UNAVAILABLE' });
        const low = new RequestResourceManager({ sampleMemory: () => reading(900 * MiB) });
        await expect(low.withHeavy(work)).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        const throws = new RequestResourceManager({ sampleMemory: () => { throw new Error('sampler failure'); } });
        await expect(throws.run({ requestId: 'sampling' }, work)).rejects.toMatchObject({ code: 'RESOURCE_MEMORY_UNAVAILABLE' });
        expect(work).not.toHaveBeenCalled();
        expect(unavailable.status().activeRequests).toBe(0);
        expect(low.status().heavy.active).toBe(0);
    });

    it('rechecks RAM after queued admission instead of using the initial request snapshot', async () => {
        let free = 8 * GiB;
        let samples = 0;
        const manager = new RequestResourceManager({ sampleMemory: () => { samples++; return reading(free); } });
        const entered = deferred();
        const finish = deferred();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
        await entered.promise;
        const work = jest.fn(async () => 'should not run');
        const queued = manager.withHeavy(work);
        const rejected = expect(queued).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(manager.status().heavy.queued).toBe(1);
        free = 500 * MiB;
        finish.resolve();
        await first;
        await rejected;
        expect(samples).toBeGreaterThanOrEqual(4);
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
    });

    it.each([{ freeBytes: 8 * GiB, availableBytes: 0 }, { freeBytes: 0, availableBytes: 8 * GiB },
        { freeBytes: 0, availableBytes: 0 }])('includes real zero availability in the conservative admission minimum: %j', async counters => {
        const manager = new RequestResourceManager({ sampleMemory: () => counters });
        const work = jest.fn(async () => undefined);
        await expect(manager.withHeavy(work)).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY', details: { availableBytes: 0 } });
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().lastMemory?.availableBytes).toBe(0);
    });

    it('uses the free-memory fallback only when the optional available-memory counter is absent', async () => {
        const oldRuntime = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 4 * GiB }) });
        await expect(oldRuntime.withHeavy(async () => 'fallback')).resolves.toBe('fallback');
        const unavailableCounter = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 4 * GiB, availableBytes: NaN }) });
        await expect(unavailableCounter.withHeavy(async () => undefined)).rejects.toMatchObject({ code: 'RESOURCE_MEMORY_UNAVAILABLE' });
    });

    it.each(['heavy', 'inference'] as const)('does not start %s work when its started notifier cancels the request', async lane => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const controller = new AbortController();
        const work = jest.fn(async () => 'must not start');
        const result = manager.run({ requestId: 'notifier-cancel', signal: controller.signal, notify: event => {
            if (event.lane === lane && event.state === 'started') controller.abort();
        } }, () => lane === 'heavy' ? manager.withHeavy(work) : manager.withInference(work, { promptEstimatedTokens: 100 }));
        await expect(result).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
        expect(manager.status().inference).toEqual({ active: 0, queued: 0 });
    });

    it('does not invoke request work when the measured notifier cancels its scope', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const controller = new AbortController();
        const work = jest.fn(async () => undefined);
        await expect(manager.run({ requestId: 'measured-cancel', signal: controller.signal,
            notify: event => { if (event.state === 'measured') controller.abort(); } }, work))
            .rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(work).not.toHaveBeenCalled();
    });

    it('preserves FIFO order with one active heavy callback across distinct requests', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const finish = deferred();
        const entered = deferred();
        let active = 0;
        let peak = 0;
        const order: number[] = [];
        const work = (id: number, wait?: Promise<void>) => manager.run({ requestId: `run-${id}` }, () => manager.withHeavy(async () => {
            active++; peak = Math.max(peak, active); order.push(id);
            if (id === 1) entered.resolve();
            if (wait) await wait;
            active--;
        }));
        const first = work(1, finish.promise);
        await entered.promise;
        const second = work(2);
        const third = work(3);
        expect(manager.status().heavy).toEqual({ active: 1, queued: 2 });
        finish.resolve();
        await Promise.all([first, second, third]);
        expect(order).toEqual([1, 2, 3]);
        expect(peak).toBe(1);
        expect(manager.status().activeRequests).toBe(0);
    });

    it('removes only a cancelled waiter and bounds the queue without executing rejected work', async () => {
        const manager = new RequestResourceManager({ maxQueued: 1, sampleMemory: () => reading() });
        const entered = deferred();
        const finish = deferred();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
        await entered.promise;
        const cancellation = new AbortController();
        const cancelledWork = jest.fn(async () => undefined);
        const queued = manager.withHeavy(cancelledWork, { signal: cancellation.signal });
        const cancelled = expect(queued).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        await expect(manager.withHeavy(async () => undefined)).rejects.toMatchObject({ code: 'RESOURCE_QUEUE_FULL' });
        cancellation.abort();
        await cancelled;
        expect(manager.status().heavy.queued).toBe(0);
        const survivor = jest.fn(async () => 'survived');
        const next = manager.withHeavy(survivor);
        finish.resolve();
        await first;
        await expect(next).resolves.toBe('survived');
        expect(cancelledWork).not.toHaveBeenCalled();
        expect(survivor).toHaveBeenCalledTimes(1);
    });

    it('times out a queued waiter and clears only its timer and listener', async () => {
        jest.useFakeTimers();
        const manager = new RequestResourceManager({ queueTimeoutMs: 25, sampleMemory: () => reading() });
        const entered = deferred();
        const finish = deferred();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
        await entered.promise;
        const signal = new AbortController().signal;
        const add = jest.spyOn(signal, 'addEventListener');
        const remove = jest.spyOn(signal, 'removeEventListener');
        const work = jest.fn(async () => undefined);
        const queued = manager.withHeavy(work, { signal });
        const timeout = expect(queued).rejects.toMatchObject({ code: 'RESOURCE_QUEUE_TIMEOUT' });
        await jest.advanceTimersByTimeAsync(25);
        await timeout;
        expect(manager.status().heavy.queued).toBe(0);
        expect(jest.getTimerCount()).toBe(0);
        expect(add).toHaveBeenCalled();
        expect(remove).toHaveBeenCalled();
        expect(work).not.toHaveBeenCalled();
        finish.resolve();
        await first;
    });

    it('holds an aborted active lease until the underlying callback actually settles', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const entered = deferred();
        const finish = deferred();
        const cancellation = new AbortController();
        const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; }, { signal: cancellation.signal });
        const cancelled = expect(first).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        await entered.promise;
        cancellation.abort();
        const secondWork = jest.fn(async () => undefined);
        const second = manager.withHeavy(secondWork);
        await tick();
        expect(secondWork).not.toHaveBeenCalled();
        expect(manager.status().heavy).toEqual({ active: 1, queued: 1 });
        finish.resolve();
        await cancelled;
        await second;
        expect(secondWork).toHaveBeenCalledTimes(1);
    });

    it('retains the global heavy lease while sibling inference children remain serialized', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const firstEntered = deferred();
        const firstFinish = deferred();
        let active = 0;
        let peak = 0;
        const order: number[] = [];
        await manager.run({ requestId: 'engineering' }, () => manager.withHeavy(async () => {
            await manager.withHeavy(async () => { expect(manager.status().heavy.active).toBe(1); });
            const first = manager.withInference(async () => {
                active++; peak = Math.max(peak, active); order.push(1); firstEntered.resolve();
                await firstFinish.promise; active--;
            }, { promptEstimatedTokens: 100 });
            await firstEntered.promise;
            const second = manager.withInference(async () => { active++; peak = Math.max(peak, active); order.push(2); active--; }, { promptEstimatedTokens: 100 });
            expect(manager.status().inference).toEqual({ active: 1, queued: 0 });
            expect(manager.status().heavyChildren).toEqual({ active: 1, queued: 1 });
            firstFinish.resolve();
            await Promise.all([first, second]);
        }));
        expect(order).toEqual([1, 2]);
        expect(peak).toBe(1);
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
        expect(manager.status().inference).toEqual({ active: 0, queued: 0 });
    });

    it('serializes mixed heavy siblings under one parent and samples memory for every admitted child', async () => {
        let samples = 0;
        const manager = new RequestResourceManager({ sampleMemory: () => { samples++; return reading(); } });
        const entered = deferred();
        const finish = deferred();
        const order: string[] = [];
        let active = 0;
        let peak = 0;
        await manager.withHeavy(async () => {
            const first = manager.withHeavy(async () => {
                active++; peak = Math.max(peak, active); order.push('browser'); entered.resolve();
                await finish.promise; active--;
            }, { kind: 'browser' });
            await entered.promise;
            const second = manager.withHeavy(async () => {
                active++; peak = Math.max(peak, active); order.push('ocr'); active--;
            }, { kind: 'ocr' });
            const third = manager.withInference(async () => {
                active++; peak = Math.max(peak, active); order.push('inference'); active--;
            }, { promptEstimatedTokens: 100 });
            expect(manager.status().heavyChildren).toEqual({ active: 1, queued: 2 });
            finish.resolve();
            await Promise.all([first, second, third]);
        });
        expect(order).toEqual(['browser', 'ocr', 'inference']);
        expect(peak).toBe(1);
        expect(samples).toBeGreaterThanOrEqual(6);
        expect(manager.status().heavyChildren).toEqual({ active: 0, queued: 0 });
    });

    it('allows legitimate nested child work up to depth 16 and stops deeper work without deadlock', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const descend = (remaining: number): Promise<string> => manager.withHeavy(async () =>
            remaining ? descend(remaining - 1) : 'nested');
        await expect(descend(16)).resolves.toBe('nested');
        await expect(descend(17)).rejects.toMatchObject({ code: 'RESOURCE_HEAVY_DEPTH_LIMIT', details: { maximumDepth: 16 } });
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
        expect(manager.status().heavyChildren).toEqual({ active: 0, queued: 0 });
        await expect(manager.withHeavy(async () => 'after-depth-failure')).resolves.toBe('after-depth-failure');
    });

    it('removes only a cancelled nested waiter and retains its parent and active child leases', async () => {
        const manager = new RequestResourceManager({ maxQueued: 1, sampleMemory: () => reading() });
        const entered = deferred();
        const finish = deferred();
        const cancellation = new AbortController();
        const cancelledWork = jest.fn(async () => undefined);
        await manager.withHeavy(async () => {
            const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
            await entered.promise;
            const cancelled = manager.withHeavy(cancelledWork, { signal: cancellation.signal });
            const rejected = expect(cancelled).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
            await expect(manager.withHeavy(async () => undefined)).rejects.toMatchObject({ code: 'RESOURCE_QUEUE_FULL' });
            cancellation.abort();
            await rejected;
            expect(manager.status().heavy).toEqual({ active: 1, queued: 0 });
            expect(manager.status().heavyChildren).toEqual({ active: 1, queued: 0 });
            const survivor = jest.fn(async () => 'survivor');
            const next = manager.withHeavy(survivor);
            finish.resolve();
            await first;
            await expect(next).resolves.toBe('survivor');
            expect(survivor).toHaveBeenCalledTimes(1);
        });
        expect(cancelledWork).not.toHaveBeenCalled();
        expect(manager.status().heavyChildren).toEqual({ active: 0, queued: 0 });
    });

    it('rechecks RAM when a nested child finally acquires its parent lane', async () => {
        let free = 8 * GiB;
        const manager = new RequestResourceManager({ sampleMemory: () => reading(free) });
        const entered = deferred();
        const finish = deferred();
        const work = jest.fn(async () => undefined);
        await manager.withHeavy(async () => {
            const first = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
            await entered.promise;
            const waiting = manager.withHeavy(work);
            const denied = expect(waiting).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
            free = 500 * MiB;
            finish.resolve();
            await first;
            await denied;
        });
        expect(work).not.toHaveBeenCalled();
        expect(manager.status().heavyChildren).toEqual({ active: 0, queued: 0 });
    });

    it('keeps the global parent permit until an admitted child settles even if the parent callback returns', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const entered = deferred();
        const finish = deferred();
        let child!: Promise<void>;
        const parent = manager.withHeavy(async () => {
            child = manager.withHeavy(async () => { entered.resolve(); await finish.promise; });
            await entered.promise;
            return 'parent-result';
        });
        await entered.promise;
        const otherWork = jest.fn(async () => 'other');
        const other = manager.withHeavy(otherWork);
        await tick();
        expect(otherWork).not.toHaveBeenCalled();
        expect(manager.status().heavy).toEqual({ active: 1, queued: 1 });
        finish.resolve();
        await child;
        await expect(parent).resolves.toBe('parent-result');
        await expect(other).resolves.toBe('other');
        expect(manager.status().heavyChildren).toEqual({ active: 0, queued: 0 });
    });

    it('rejects truly nested inference promptly without deadlocking its existing lease', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        await manager.withInference(async () => {
            await expect(manager.withInference(async () => undefined, { promptEstimatedTokens: 100 }))
                .rejects.toMatchObject({ code: 'RESOURCE_INFERENCE_REENTRANT' });
            expect(manager.status().inference.active).toBe(1);
        }, { promptEstimatedTokens: 100 });
        expect(manager.status().inference.active).toBe(0);
        await expect(manager.withInference(async () => 'later', { promptEstimatedTokens: 100 })).resolves.toBe('later');
    });

    it('merges scope and per-inference cancellation into the callback signal', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const scopeAbort = new AbortController();
        const callAbort = new AbortController();
        const entered = deferred();
        const finish = deferred();
        const run = manager.run({ requestId: 'merged', signal: scopeAbort.signal }, () => manager.withInference(async budget => {
            expect(budget.signal).not.toBe(scopeAbort.signal);
            entered.resolve();
            await finish.promise;
            expect(budget.signal.aborted).toBe(true);
        }, { promptEstimatedTokens: 100, signal: callAbort.signal }));
        const cancelled = expect(run).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        await entered.promise;
        callAbort.abort();
        expect(scopeAbort.signal.aborted).toBe(false);
        finish.resolve();
        await cancelled;
        expect(manager.status().heavy.active).toBe(0);
        expect(manager.status().inference.active).toBe(0);
    });

    it('exposes only the current combined cancellation signal and has no signal outside a scope', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const owner = new AbortController();
        const call = new AbortController();
        expect(manager.currentSignal()).toBeUndefined();
        await expect(manager.run({ requestId: 'signal-accessor', signal: owner.signal }, () => manager.withHeavy(async () => {
            const signal = manager.currentSignal();
            expect(signal).toBeDefined();
            expect(signal).not.toBe(owner.signal);
            expect(signal).not.toBe(call.signal);
            expect(signal?.aborted).toBe(false);
            call.abort();
            expect(signal?.aborted).toBe(true);
            expect(owner.signal.aborted).toBe(false);
        }, { signal: call.signal }))).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(manager.currentSignal()).toBeUndefined();
    });

    it('denies signal access from a retained asynchronous context after its owned scope closes', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const release = deferred();
        let late!: Promise<AbortSignal | undefined>;
        await manager.run({ requestId: 'closed-signal' }, async () => {
            late = release.promise.then(() => manager.currentSignal());
        });
        const rejected = expect(late).rejects.toMatchObject({ code: 'RESOURCE_SCOPE_CLOSED' });
        release.resolve();
        await rejected;
        expect(manager.currentSignal()).toBeUndefined();
    });

    it('attempts all owned cleanups, preserves the original error and isolates notifier data', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const events: ResourceEvent[] = [];
        const cleanups: string[] = [];
        const failure = new Error('real helper failure');
        await expect(manager.run({ requestId: 'private-request', userId: 'private-user', workspaceId: 'private-workspace', notify: e => events.push(e) }, async () => {
            manager.registerCleanup(async () => { cleanups.push('first'); throw new Error('cleanup one'); });
            manager.registerCleanup(async () => { cleanups.push('second'); throw new Error('cleanup two'); });
            throw failure;
        })).rejects.toBe(failure);
        expect(cleanups).toEqual(['second', 'first']);
        expect(events.some(e => e.state === 'cleanup_failed')).toBe(true);
        expect(JSON.stringify(events)).not.toMatch(/private-user|private-workspace|private-request|helper failure|cleanup one/);
        expect(JSON.stringify(manager.status())).not.toMatch(/private-user|private-workspace|private-request/);
        expect(manager.status().activeRequests).toBe(0);
        await expect(manager.withHeavy(async () => 'next')).resolves.toBe('next');
    });

    it('reports owned cleanup failure after success and unregisters only the chosen callback', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const removed = jest.fn();
        const retained = jest.fn(() => { throw new Error('cleanup'); });
        await expect(manager.run({ requestId: 'cleanup' }, async () => {
            const unregister = manager.registerCleanup(removed);
            manager.registerCleanup(retained);
            unregister(); unregister();
            return 'success';
        })).rejects.toMatchObject({ code: 'RESOURCE_CLEANUP_FAILED', details: { count: 1 } });
        expect(removed).not.toHaveBeenCalled();
        expect(retained).toHaveBeenCalledTimes(1);
    });

    it('starts every owned cleanup before waiting for a slow cleanup to finish', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const finish = deferred();
        const other = jest.fn();
        const result = manager.run({ requestId: 'slow-cleanup' }, async () => {
            manager.registerCleanup(other);
            manager.registerCleanup(() => finish.promise);
        });
        await tick();
        expect(other).toHaveBeenCalledTimes(1);
        finish.resolve();
        await result;
        expect(manager.status().activeRequests).toBe(0);
    });

    it('cleans acquired leases after real callback errors without relabeling the error as provider quota', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const failure = new Error('application error');
        await expect(manager.withInference(async () => { throw failure; }, { promptEstimatedTokens: 100 })).rejects.toBe(failure);
        expect(failure).not.toBeInstanceOf(ResourceAdmissionError);
        expect(manager.status().heavy).toEqual({ active: 0, queued: 0 });
        expect(manager.status().inference).toEqual({ active: 0, queued: 0 });
        await expect(manager.withInference(async () => 'recovered', { promptEstimatedTokens: 100 })).resolves.toBe('recovered');
    });

    it('keeps request cleanups distinct across concurrent scopes and does not let notifier exceptions stop work', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading() });
        const firstFinish = deferred();
        const firstEntered = deferred();
        const cleaned: string[] = [];
        const first = manager.run({ requestId: 'one', notify: () => { throw new Error('optional UI'); } }, async () => {
            manager.registerCleanup(() => { cleaned.push('one'); });
            firstEntered.resolve(); await firstFinish.promise;
        });
        await firstEntered.promise;
        await manager.run({ requestId: 'two' }, async () => { manager.registerCleanup(() => { cleaned.push('two'); }); });
        expect(cleaned).toEqual(['two']);
        firstFinish.resolve();
        await first;
        expect(cleaned).toEqual(['two', 'one']);
    });
});
