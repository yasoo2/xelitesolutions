import {
    gotoResilient,
    invalidNavigationTarget,
    transientNavigationError,
    type NavigablePage,
} from '../modules/browser/navigation';

type GotoScript = Array<{ throw?: string } | { status?: number } | { ok?: boolean }>;

function fakePage(script: Record<string, GotoScript>, readiness: Array<{ rs: string; body: number } | { throw: true }> = [{ rs: 'complete', body: 3 }]) {
    const gotoCalls: string[] = [];
    const sleeps: number[] = [];
    let clock = 1000;
    const perUrlCount = new Map<string, number>();
    const page: NavigablePage = {
        goto: async (url: string) => {
            gotoCalls.push(url);
            const steps = script[url] ?? [{ ok: true }];
            const step = steps[Math.min(perUrlCount.get(url) ?? 0, steps.length - 1)];
            perUrlCount.set(url, (perUrlCount.get(url) ?? 0) + 1);
            if ('throw' in step && step.throw !== undefined) throw new Error(step.throw);
            if ('status' in step && step.status !== undefined) return { status: () => step.status as number };
            return { status: () => 200 };
        },
        evaluate: (async () => {
            const next = readiness[Math.min((page as any).__polls ?? 0, readiness.length - 1)];
            (page as any).__polls = ((page as any).__polls ?? 0) + 1;
            if (next && 'throw' in next) throw new Error('page closed');
            return next;
        }) as any,
        url: () => gotoCalls[gotoCalls.length - 1] ?? '',
    };
    const sleep = async (ms: number): Promise<void> => {
        sleeps.push(ms);
        clock += ms;
    };
    return { page, gotoCalls, sleeps, sleep, now: () => clock };
}

describe('navigation resilience', () => {
    describe('classification', () => {
        it('treats transport blips as transient only', () => {
            expect(transientNavigationError(new Error('net::ERR_CONNECTION_REFUSED at http://localhost:4305/'))).toBe(true);
            expect(transientNavigationError(new Error('page.goto: Timeout 20000ms exceeded'))).toBe(true);
            expect(transientNavigationError(new Error('HTTP 404 not found'))).toBe(false);
            expect(transientNavigationError(new Error('Invalid URL'))).toBe(false);
        });

        it('rejects non-http targets without an attempt', () => {
            expect(invalidNavigationTarget('')).toBe(true);
            expect(invalidNavigationTarget('not a url')).toBe(true);
            expect(invalidNavigationTarget('ftp://x/y')).toBe(true);
            expect(invalidNavigationTarget('http://localhost:3000/')).toBe(false);
        });
    });

    describe('gotoResilient', () => {
        it('succeeds first try with immediate readiness and no sleep', async () => {
            const fake = fakePage({ 'http://a/': [{ ok: true }] });
            const result = await gotoResilient(fake.page, ['http://a/'], { sleep: async () => { throw new Error('must not sleep'); } });
            expect(result.ok).toBe(true);
            expect(result.url).toBe('http://a/');
            expect(result.attempts).toHaveLength(1);
            expect(result.attempts[0]).toMatchObject({ url: 'http://a/', pass: 1, outcome: 'ok', httpStatus: 200 });
            expect(result.readiness).toMatchObject({ ready: true, readyState: 'complete', polls: 1 });
        });

        it('retries transient failures once after one bounded backoff', async () => {
            const fake = fakePage({ 'http://a/': [{ throw: 'page.goto: Timeout 5000ms exceeded' }, { ok: true }] });
            const result = await gotoResilient(fake.page, ['http://a/'], { sleep: fake.sleep, now: fake.now, backoffMs: 600 });
            expect(result.ok).toBe(true);
            expect(result.attempts.map(a => a.pass)).toEqual([1, 2]);
            expect(result.attempts[0].outcome).toBe('transient');
            expect(fake.sleeps).toEqual([600]);
            expect(fake.gotoCalls).toEqual(['http://a/', 'http://a/']);
        });

        it('records HTTP errors with status and never retries them', async () => {
            const fake = fakePage({ 'http://a/': [{ status: 404 }], 'http://b/': [{ status: 500 }] });
            const result = await gotoResilient(fake.page, ['http://a/', 'http://b/'], { sleep: fake.sleep, now: fake.now });
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('http_error');
            expect(fake.gotoCalls).toEqual(['http://a/', 'http://b/']);
            expect(fake.sleeps).toEqual([]);
            expect(result.attempts.map(a => a.outcome)).toEqual(['http_error', 'http_error']);
            expect(result.attempts.map(a => a.httpStatus)).toEqual([404, 500]);
        });

        it('falls back to the next candidate after an HTTP error', async () => {
            const fake = fakePage({ 'http://a/': [{ status: 404 }], 'http://b/': [{ ok: true }] });
            const result = await gotoResilient(fake.page, ['http://a/', 'http://b/'], { sleep: fake.sleep, now: fake.now });
            expect(result.ok).toBe(true);
            expect(result.url).toBe('http://b/');
            expect(fake.gotoCalls).toEqual(['http://a/', 'http://b/']);
        });

        it('stops after the second pass when everything stays transient', async () => {
            const fake = fakePage({ 'http://a/': [{ throw: 'net::ERR_CONNECTION_REFUSED' }] });
            const result = await gotoResilient(fake.page, ['http://a/'], { sleep: fake.sleep, now: fake.now, backoffMs: 400 });
            expect(result.ok).toBe(false);
            expect(fake.gotoCalls).toEqual(['http://a/', 'http://a/']);
            expect(fake.sleeps).toEqual([400]);
            expect(result.readiness).toBeNull();
        });

        it('never attempts invalid targets', async () => {
            const fake = fakePage({});
            const result = await gotoResilient(fake.page, ['notaurl', ''], { sleep: fake.sleep, now: fake.now });
            expect(result.ok).toBe(false);
            expect(fake.gotoCalls).toEqual([]);
            expect(fake.sleeps).toEqual([]);
            expect(result.attempts.every(a => a.outcome === 'error')).toBe(true);
        });

        it('waits for readiness with early exit and reports the observation', async () => {
            const fake = fakePage(
                { 'http://a/': [{ ok: true }] },
                [{ rs: 'loading', body: 0 }, { rs: 'interactive', body: 4 }, { rs: 'complete', body: 9 }],
            );
            const result = await gotoResilient(fake.page, ['http://a/'], {
                sleep: fake.sleep, now: fake.now, readinessBudgetMs: 2000, readinessPollMs: 120,
            });
            expect(result.ok).toBe(true);
            expect(result.readiness).toMatchObject({ ready: true, readyState: 'complete', bodyElements: 9, polls: 3 });
            expect(result.readiness?.waitedMs).toBeLessThanOrEqual(2000);
        });

        it('caps readiness waiting and still reports success', async () => {
            const fake = fakePage(
                { 'http://a/': [{ ok: true }] },
                [{ rs: 'loading', body: 0 }],
            );
            const result = await gotoResilient(fake.page, ['http://a/'], {
                sleep: fake.sleep, now: fake.now, readinessBudgetMs: 500, readinessPollMs: 120,
            });
            expect(result.ok).toBe(true);
            expect(result.readiness?.ready).toBe(false);
            expect(result.readiness?.waitedMs).toBeLessThanOrEqual(500);
        });

        it('survives a dead page during readiness probing', async () => {
            const fake = fakePage({ 'http://a/': [{ ok: true }] }, [{ throw: true }]);
            const result = await gotoResilient(fake.page, ['http://a/'], { sleep: fake.sleep, now: fake.now });
            expect(result.ok).toBe(true);
            expect(result.readiness?.ready).toBe(false);
        });

        it('clamps budgets so callers cannot request long sleeps', async () => {
            const fake = fakePage({ 'http://a/': [{ throw: 'timed out' }] });
            await gotoResilient(fake.page, ['http://a/'], { sleep: fake.sleep, now: fake.now, backoffMs: 999999 });
            expect(fake.sleeps).toEqual([5000]);
        });

        it('never throws on a hostile page object', async () => {
            const hostile = {
                goto: async () => { throw new Error('boom'); },
                evaluate: async () => { throw new Error('boom'); },
                url: () => { throw new Error('boom'); },
            } as any as NavigablePage;
            const result = await gotoResilient(hostile, ['http://a/'], { sleep: async () => { }, now: () => 0, backoffMs: 0 });
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('navigation_failed');
        });
    });
});
