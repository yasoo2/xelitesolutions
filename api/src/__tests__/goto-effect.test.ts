import {
    compareGotoEffect,
    normalizeGotoLanding,
    type ClickContext,
    type ClickFingerprint,
    type TraversalContext,
    type TraversalIdentity,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/signal-loft',
        title: 'Signal loft',
        elements: 37,
        textLength: 420,
        htmlHash: 'goto11',
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

const REQUESTED = 'http://127.0.0.1:9/lantern-ledger';

describe('goto effect evidence', () => {
    describe('normalizeGotoLanding', () => {
        it('treats a bare host and its trailing-slash landing as the same place', () => {
            expect(normalizeGotoLanding('http://127.0.0.1:9')).toBe(normalizeGotoLanding('http://127.0.0.1:9/'));
        });

        it('is case-insensitive on scheme and host but not on path', () => {
            expect(normalizeGotoLanding('HTTP://127.0.0.1:9/Ledger')).toBe('http://127.0.0.1:9/Ledger');
            expect(normalizeGotoLanding('http://127.0.0.1:9/ledger')).not.toBe(normalizeGotoLanding('http://127.0.0.1:9/Ledger'));
        });

        it('ignores default ports but keeps the query and hash', () => {
            expect(normalizeGotoLanding('http://127.0.0.1:80/a')).toBe(normalizeGotoLanding('http://127.0.0.1/a'));
            expect(normalizeGotoLanding('http://127.0.0.1:9/a?x=1#f')).toBe('http://127.0.0.1:9/a?x=1#f');
        });

        it('degrades to a trimmed string for non-URL landings instead of throwing', () => {
            expect(normalizeGotoLanding('about:blank')).toBe('about:blank');
            expect(normalizeGotoLanding('  about:blank/  ')).toBe('about:blank');
            expect(normalizeGotoLanding('')).toBe('');
        });
    });

    describe('compareGotoEffect', () => {
        it('names a full navigation: new document at the requested URL', () => {
            const effect = compareGotoEffect(
                traversal({
                    page: page({ fingerprint: fingerprint({ url: 'about:blank', title: '', elements: 0, textLength: 0, htmlHash: 'blank0' }) }),
                    identity: identity({ loadStamp: 500, navType: '' }),
                }),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: REQUESTED, title: 'Lantern ledger' }) }),
                    identity: identity({ loadStamp: 2000, navType: 'navigate' }),
                }),
                REQUESTED,
                200,
            );
            expect(effect).toMatchObject({
                readOk: true, navigated: true, domChanged: true,
                identityReadOk: true, documentChanged: true,
                landedOnRequested: true, httpStatus: 200, effectObserved: true, runtimeErrors: 0,
            });
        });

        it('names a same-URL re-goto the fingerprint alone cannot see', () => {
            const effect = compareGotoEffect(
                traversal({ page: page({ fingerprint: fingerprint({ url: REQUESTED }) }) }),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: REQUESTED }) }),
                    identity: identity({ loadStamp: 3000, navType: 'navigate' }),
                }),
                REQUESTED,
                200,
            );
            expect(effect).toMatchObject({
                navigated: false, domChanged: false, documentChanged: true,
                landedOnRequested: true, httpStatus: 200, effectObserved: true,
            });
        });

        it('reports a fallback win as landed elsewhere, not as requested', () => {
            // The www/http fallback candidates can win the race: the browser
            // moved, but not to the URL the step asked for. The attempts array
            // names the winner; the receipt only says it differs.
            const effect = compareGotoEffect(
                traversal(),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/other-dock' }) }),
                    identity: identity({ loadStamp: 4000 }),
                }),
                REQUESTED,
                200,
            );
            expect(effect).toMatchObject({
                navigated: true, documentChanged: true, landedOnRequested: false,
                httpStatus: 200, effectObserved: true,
            });
        });

        it('names an HTTP error landing: right address, server verdict, new document', () => {
            // gotoResilient treats 4xx/5xx as failure, but the browser DID
            // navigate to the error page. The evidence must say so, so the
            // planner can tell "reached server, page missing" from "never left".
            const effect = compareGotoEffect(
                traversal(),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: REQUESTED, title: 'Not found', elements: 5, textLength: 40, htmlHash: 'err404' }) }),
                    identity: identity({ loadStamp: 5000 }),
                }),
                REQUESTED,
                404,
            );
            expect(effect).toMatchObject({
                navigated: true, domChanged: true, documentChanged: true,
                landedOnRequested: true, httpStatus: 404, effectObserved: true,
            });
        });

        it('reports a guarded no-op as honestly no-effect', () => {
            // The closed-port guard refuses the attempt before goto runs: the
            // page cannot have moved, and the receipt says so.
            const effect = compareGotoEffect(traversal(), traversal(), REQUESTED);
            expect(effect).toMatchObject({
                readOk: true, navigated: false, domChanged: false,
                identityReadOk: true, documentChanged: false,
                landedOnRequested: false, effectObserved: false, runtimeErrors: 0,
            });
            expect(effect.httpStatus).toBeUndefined();
        });

        it('never invents an effect from unreadable halves', () => {
            expect(compareGotoEffect(null, traversal(), REQUESTED, 200))
                .toMatchObject({ readOk: false, identityReadOk: false, landedOnRequested: false, effectObserved: false, httpStatus: 200 });
            expect(compareGotoEffect(traversal(), null, REQUESTED, 200))
                .toMatchObject({ readOk: false, identityReadOk: false, landedOnRequested: false, effectObserved: false, httpStatus: 200 });
            expect(compareGotoEffect(null, null, REQUESTED))
                .toMatchObject({
                    readOk: false, navigated: false, domChanged: false,
                    identityReadOk: false, documentChanged: false,
                    landedOnRequested: false, effectObserved: false,
                });
        });

        it('never counts two unreadable clocks as a document change', () => {
            const effect = compareGotoEffect(
                traversal({ identity: identity({ loadStamp: 0, navType: '' }) }),
                traversal({ identity: identity({ loadStamp: 0, navType: '' }) }),
                REQUESTED,
            );
            expect(effect).toMatchObject({ identityReadOk: true, documentChanged: false, effectObserved: false });
        });

        it('reports identity evidence even when the page itself is unreadable', () => {
            const effect = compareGotoEffect(
                traversal({ page: null }),
                traversal({ page: null, identity: identity({ loadStamp: 6000, navType: 'navigate' }) }),
                REQUESTED,
            );
            expect(effect).toMatchObject({ readOk: false, identityReadOk: true, documentChanged: true, landedOnRequested: false, effectObserved: true });
        });

        it('validates the HTTP verdict instead of passing transport noise through', () => {
            for (const bad of [NaN, 99, 600, 200.5, Number.POSITIVE_INFINITY]) {
                expect(compareGotoEffect(traversal(), traversal(), REQUESTED, bad).httpStatus).toBeUndefined();
            }
            expect(compareGotoEffect(traversal(), traversal(), REQUESTED, 500).httpStatus).toBe(500);
        });

        it('counts new runtime error signals across the step', () => {
            const effect = compareGotoEffect(
                traversal({ page: page({ errors: { js: 0, console: 1, network: 0 } }) }),
                traversal({ page: page({ errors: { js: 2, console: 1, network: 0 } }) }),
                REQUESTED,
                200,
            );
            expect(effect.runtimeErrors).toBe(2);
        });

        it('keeps the receipt free of page content', () => {
            const effect = compareGotoEffect(
                traversal({ page: page({ fingerprint: fingerprint({ title: 's3cret-title' }) }) }),
                traversal({
                    page: page({ fingerprint: fingerprint({ url: REQUESTED, title: 's3cret-title-next' }) }),
                    identity: identity({ loadStamp: 7000 }),
                }),
                REQUESTED,
                200,
            );
            expect(effect).toMatchObject({ domChanged: true, documentChanged: true, landedOnRequested: true });
            expect(JSON.stringify(effect)).not.toContain('s3cret');
        });
    });
});

// The comparator is pure; the executor must actually run every goto outcome
// through it — landed, error page, and guarded no-op alike — and carry the
// fields on the receipt. Pin the wiring by its stable anchors.
describe('goto effect wiring contract', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'executor.ts'), 'utf8');

    it('snapshots the page and document identity around the navigation attempt', () => {
        const snapshots = executor.match(/const gotoBefore: TraversalContext = \{/g) || [];
        expect(snapshots.length).toBe(1);
        const at = executor.indexOf('const gotoBefore: TraversalContext = {');
        const block = executor.slice(at, at + 400);
        expect(block).toContain('snapshotClickContext(page, sessionId)');
        expect(block).toContain('snapshotTraversalIdentity(page)');
        // The snapshot precedes the resilient navigation call it brackets.
        expect(executor.indexOf('await gotoResilient(page, gotoCandidates')).toBeGreaterThan(at);
    });

    it('compares all three attempt outcomes through the shared comparator', () => {
        const calls = executor.match(/compareGotoEffect\(gotoBefore, /g) || [];
        expect(calls.length).toBe(3);
    });

    it('packs every goto receipt through the shared packer', () => {
        const packs = executor.match(/packGotoReceipt\(/g) || [];
        // One definition plus three call sites (landed, failed, guarded).
        expect(packs.length).toBe(4);
        const defAt = executor.indexOf('function packGotoReceipt');
        expect(defAt).toBeGreaterThan(0);
        const def = executor.slice(defAt, defAt + 1200);
        expect(def).toContain('landedOnRequested: effect.landedOnRequested');
        expect(def).toContain('httpStatus: effect.httpStatus');
    });

    it('keeps the navigation diagnostics on the success report', () => {
        expect(executor).toContain('attempts: nav.attempts, readiness: nav.readiness');
    });
});
