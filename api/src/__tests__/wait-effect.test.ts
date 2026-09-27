import {
    compareWaitEffect,
    type ClickContext,
    type ClickFingerprint,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/waiting-room',
        title: 'Waiting room',
        elements: 23,
        textLength: 310,
        htmlHash: 'wait13',
        ...over,
    };
}

function page(over: Partial<ClickContext> = {}): ClickContext {
    return { fingerprint: fingerprint(), errors: { js: 0, console: 0, network: 0 }, ...over };
}

describe('wait effect evidence', () => {
    describe('compareWaitEffect', () => {
        it('reports a quiet wait as honestly no-effect with measured elapsed', () => {
            const effect = compareWaitEffect(page(), page(), 812);
            expect(effect).toMatchObject({
                readOk: true, navigated: false, domChanged: false,
                effectObserved: false, elapsedMs: 812, runtimeErrors: 0,
            });
        });

        it('names a DOM that settled mid-wait', () => {
            const effect = compareWaitEffect(
                page(),
                page({ fingerprint: fingerprint({ elements: 24, textLength: 341, htmlHash: 'wait13b' }) }),
                1200,
            );
            expect(effect).toMatchObject({ readOk: true, navigated: false, domChanged: true, effectObserved: true, elapsedMs: 1200 });
        });

        it('names an unexpected navigation during the wait', () => {
            const effect = compareWaitEffect(
                page(),
                page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/waiting-room#late' }) }),
                600,
            );
            expect(effect).toMatchObject({ navigated: true, effectObserved: true, elapsedMs: 600 });
        });

        it('counts runtime errors thrown during the wait', () => {
            const effect = compareWaitEffect(
                page(),
                page({ errors: { js: 1, console: 2, network: 0 } }),
                450,
            );
            expect(effect).toMatchObject({ runtimeErrors: 3, elapsedMs: 450 });
        });

        it('records a zero-length wait as elapsed rather than absent', () => {
            const effect = compareWaitEffect(page(), page(), 0);
            expect(effect.elapsedMs).toBe(0);
        });

        it('rounds fractional elapsed to whole milliseconds', () => {
            const effect = compareWaitEffect(page(), page(), 812.6);
            expect(effect.elapsedMs).toBe(813);
        });

        it('leaves elapsed absent when unmeasurable', () => {
            for (const bad of [NaN, -5, Infinity, -Infinity]) {
                const effect = compareWaitEffect(page(), page(), bad);
                expect(effect.elapsedMs).toBeUndefined();
                expect(effect.readOk).toBe(true);
            }
        });

        it('never invents an effect from unreadable halves', () => {
            const effect = compareWaitEffect(null, null, 300);
            expect(effect).toMatchObject({ readOk: false, navigated: false, domChanged: false, effectObserved: false });
            expect(effect.runtimeErrors).toBeUndefined();
        });

        it('still records elapsed when the page is unreadable', () => {
            const effect = compareWaitEffect(page(), null, 300);
            expect(effect).toMatchObject({ readOk: false, elapsedMs: 300 });
        });

        it('leaves runtimeErrors absent when telemetry halves are missing', () => {
            const effect = compareWaitEffect(
                page({ errors: null }),
                page({ errors: null }),
                200,
            );
            expect(effect).toMatchObject({ readOk: true });
            expect(effect.runtimeErrors).toBeUndefined();
        });

        it('leaves runtimeErrors absent when a counter reset makes the delta meaningless', () => {
            const effect = compareWaitEffect(
                page({ errors: { js: 4, console: 0, network: 0 } }),
                page({ errors: { js: 1, console: 0, network: 0 } }),
                200,
            );
            expect(effect.runtimeErrors).toBeUndefined();
        });

        it('delegates fingerprint truth to the shared click comparator', () => {
            // Title-only change: the same signal clicks use, no wait-specific logic.
            const effect = compareWaitEffect(
                page(),
                page({ fingerprint: fingerprint({ title: 'Waiting room (2)' }) }),
                100,
            );
            expect(effect).toMatchObject({ domChanged: true, navigated: false, effectObserved: true });
        });
    });
});
