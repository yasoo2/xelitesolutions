import {
    compareTraversalEffect,
    TRAVERSAL_IDENTITY_SCRIPT,
    type ClickContext,
    type ClickFingerprint,
    type TraversalContext,
    type TraversalIdentity,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/reading-room',
        title: 'Reading room',
        elements: 41,
        textLength: 512,
        htmlHash: 'trav12',
        ...over,
    };
}

function page(over: Partial<ClickContext> = {}): ClickContext {
    return { fingerprint: fingerprint(), errors: { js: 0, console: 0, network: 0 }, ...over };
}

function identity(over: Partial<TraversalIdentity> = {}): TraversalIdentity {
    return { loadStamp: 1000, navType: 'navigate', ...over };
}

function traversal(over: Partial<TraversalContext> = {}): TraversalContext {
    return { page: page(), identity: identity(), ...over };
}

describe('traversal effect evidence', () => {
    describe('compareTraversalEffect', () => {
        it('reports an empty-history no-op as honestly no-effect', () => {
            const effect = compareTraversalEffect(traversal(), traversal(), false);
            expect(effect).toMatchObject({
                readOk: true, navigated: false, domChanged: false,
                identityReadOk: true, documentChanged: false,
                navigationError: false, effectObserved: false, runtimeErrors: 0,
            });
        });

        it('names a full back/forward through the document identity', () => {
            const moved = compareTraversalEffect(
                traversal(),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/landing' }) }),
                    identity: identity({ loadStamp: 2000, navType: 'back_forward' }),
                }),
                false,
            );
            expect(moved).toMatchObject({ navigated: true, documentChanged: true, effectObserved: true, navigationError: false });
        });

        it('names a same-URL reload the fingerprint alone cannot see', () => {
            const reloaded = compareTraversalEffect(
                traversal(),
                traversal({ identity: identity({ loadStamp: 3000, navType: 'reload' }) }),
                false,
            );
            expect(reloaded).toMatchObject({ navigated: false, domChanged: false, documentChanged: true, effectObserved: true });
        });

        it('names a same-document move through the URL alone', () => {
            const moved = compareTraversalEffect(
                traversal(),
                traversal({ page: page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/reading-room#annex' }) }) }),
                false,
            );
            expect(moved).toMatchObject({ navigated: true, documentChanged: false, effectObserved: true });
        });

        it('records a thrown traverse call without failing the evidence', () => {
            const errored = compareTraversalEffect(traversal(), traversal(), true);
            expect(errored).toMatchObject({ navigationError: true, effectObserved: false });
        });

        it('reports the page effect even when the traverse call threw', () => {
            // A timeout after a successful navigation: the error is real and
            // so is the new document. Both are reported; nothing is failed.
            const errored = compareTraversalEffect(
                traversal(),
                traversal({ identity: identity({ loadStamp: 4000 }) }),
                true,
            );
            expect(errored).toMatchObject({ navigationError: true, documentChanged: true, effectObserved: true });
        });

        it('never invents an effect from unreadable halves', () => {
            expect(compareTraversalEffect(null, traversal(), false))
                .toMatchObject({ readOk: false, identityReadOk: false, effectObserved: false });
            expect(compareTraversalEffect(traversal(), null, false))
                .toMatchObject({ readOk: false, identityReadOk: false, effectObserved: false });
            expect(compareTraversalEffect(null, null, false))
                .toMatchObject({ readOk: false, navigated: false, domChanged: false, documentChanged: false, effectObserved: false });
        });

        it('never counts two unreadable clocks as a document change', () => {
            const effect = compareTraversalEffect(
                traversal({ identity: identity({ loadStamp: 0, navType: '' }) }),
                traversal({ identity: identity({ loadStamp: 0, navType: '' }) }),
                false,
            );
            expect(effect).toMatchObject({ identityReadOk: true, documentChanged: false, effectObserved: false });
        });

        it('reports identity evidence even when the page itself is unreadable', () => {
            const effect = compareTraversalEffect(
                traversal({ page: null }),
                traversal({ page: null, identity: identity({ loadStamp: 5000, navType: 'reload' }) }),
                false,
            );
            expect(effect).toMatchObject({ readOk: false, identityReadOk: true, documentChanged: true, effectObserved: true });
        });

        it('reports page evidence when the identity is unreadable', () => {
            const effect = compareTraversalEffect(
                traversal({ identity: null }),
                traversal({ identity: null, page: page({ fingerprint: fingerprint({ title: 'Changed' }) }) }),
                false,
            );
            expect(effect).toMatchObject({ readOk: true, identityReadOk: false, documentChanged: false, domChanged: true, effectObserved: true });
        });

        it('counts new runtime error signals across the step', () => {
            const effect = compareTraversalEffect(
                traversal({ page: page({ errors: { js: 0, console: 1, network: 0 } }) }),
                traversal({ page: page({ errors: { js: 2, console: 1, network: 0 } }) }),
                false,
            );
            expect(effect.runtimeErrors).toBe(2);
        });

        it('keeps the receipt free of page content', () => {
            const effect = compareTraversalEffect(
                traversal({ page: page({ fingerprint: fingerprint({ title: 's3cret-title' }) }) }),
                traversal({
                    page: page({ fingerprint: fingerprint({ title: 's3cret-title-next' }) }),
                    identity: identity({ loadStamp: 6000 }),
                }),
                false,
            );
            expect(effect).toMatchObject({ domChanged: true, documentChanged: true });
            expect(JSON.stringify(effect)).not.toContain('s3cret');
        });
    });

    describe('identity script', () => {
        it('is a self-contained IIFE readable by page.evaluate', () => {
            const script = TRAVERSAL_IDENTITY_SCRIPT.trim();
            expect(script.startsWith('(() => {')).toBe(true);
            expect(script.endsWith('})()')).toBe(true);
            expect(script).toContain('timeOrigin');
            expect(script).toContain('getEntriesByType');
        });

        it('extracts the load stamp and navigation type when executed', () => {
            const run = new Function('performance', `return (${TRAVERSAL_IDENTITY_SCRIPT});`) as (perf: any) => any;
            const id = run({ timeOrigin: 1727.4, getEntriesByType: () => [{ type: 'back_forward' }] });
            expect(id).toMatchObject({ loadStamp: 1727, navType: 'back_forward' });
        });

        it('degrades to zeros on a partial performance object instead of throwing', () => {
            const run = new Function('performance', `return (${TRAVERSAL_IDENTITY_SCRIPT});`) as (perf: any) => any;
            expect(run({})).toMatchObject({ loadStamp: 0, navType: '' });
            expect(run(undefined)).toMatchObject({ loadStamp: 0, navType: '' });
        });
    });
});

// The comparator is pure; the executor must actually run every traversal
// through the shared observer, which snapshots before, records the thrown
// outcome, probes readiness and compares after. Pin the wiring by its
// stable anchors, not line numbers.
describe('traversal effect wiring contract', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'executor.ts'), 'utf8');
    const navigation = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'navigation.ts'), 'utf8');

    it('routes back, forward and reload through the shared observer', () => {
        const calls = executor.match(/await observeTraversalStep\(page, sessionId, \(\) =>/g) || [];
        expect(calls.length).toBe(3);
        expect(executor).toContain('page.goBack({ waitUntil:');
        expect(executor).toContain('page.goForward({ waitUntil:');
        expect(executor).toContain('page.reload({ waitUntil:');
    });

    it('captures the thrown outcome instead of swallowing it', () => {
        const observerAt = executor.indexOf('async function observeTraversalStep');
        expect(observerAt).toBeGreaterThan(0);
        const observer = executor.slice(observerAt, observerAt + 2500);
        expect(observer).toContain('let threw = false');
        expect(observer).toContain('} catch { threw = true; }');
        expect(observer).toContain('compareTraversalEffect(before, after, threw)');
        expect(observer).not.toContain('.catch(() => null)');
    });

    it('probes readiness instead of a fixed sleep on the traversal path', () => {
        expect(navigation).toContain('export async function probeNavigationReadiness');
        const observerAt = executor.indexOf('async function observeTraversalStep');
        const observer = executor.slice(observerAt, observerAt + 2500);
        expect(observer).toContain('await probeNavigationReadiness(page, {})');
        expect(observer).not.toContain('waitForTimeout(250)');
    });

    it('carries the traversal fields on every traversal success receipt', () => {
        const receipts = executor.match(/results\.push\(\{ stepId: sid, name, ok: true, navigated: observed\.navigated, domChanged: observed\.domChanged, documentChanged: observed\.documentChanged, effectObserved: observed\.effectObserved, navigationError: observed\.navigationError, runtimeErrors: observed\.runtimeErrors \}\);/g) || [];
        expect(receipts.length).toBe(3);
    });
});
