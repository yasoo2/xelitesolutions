import {
    compareTypeEffect,
    type ClickContext,
    type ClickFingerprint,
    type KeyContext,
    type KeyFocus,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/harbor-manifest',
        title: 'Harbor manifest',
        elements: 31,
        textLength: 420,
        htmlHash: 'dock41',
        ...over,
    };
}

function page(over: Partial<ClickContext> = {}): ClickContext {
    return { fingerprint: fingerprint(), errors: { js: 0, console: 0, network: 0 }, ...over };
}

function focus(over: Partial<KeyFocus> = {}): KeyFocus {
    return {
        hasFocus: true, tag: 'INPUT', idLen: 4, classLen: 0, nameLen: 7, valueLen: 0, isBody: false,
        ...over,
    };
}

function body(over: Partial<KeyFocus> = {}): KeyFocus {
    return {
        hasFocus: true, tag: 'BODY', idLen: 0, classLen: 0, nameLen: 0, valueLen: 0, isBody: true,
        ...over,
    };
}

function ctx(p: ClickContext | null, f: KeyFocus | null): KeyContext | null {
    if (!p && !f) return null;
    return { page: p, focus: f };
}

describe('locatorless type/fill effect evidence', () => {
    describe('compareTypeEffect', () => {
        it('confirms an append that grew the focused field by the text length', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 3 })),
                ctx(page(), focus({ valueLen: 11 })),
                8, 'append',
            );
            expect(effect).toMatchObject({
                readOk: true, focusReadOk: true, focusChanged: true,
                valueApplied: true, typedIntoVoid: false, effectObserved: true,
            });
        });

        it('names a global type into the page body as void with the value unapplied', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), body()),
                8, 'append',
            );
            expect(effect).toMatchObject({
                readOk: true, valueApplied: false, typedIntoVoid: true, effectObserved: false,
            });
        });

        it('confirms a coordinate set by the after-length alone, whatever the field held before', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 5 })),
                ctx(page(), focus({ valueLen: 8 })),
                8, 'set',
            );
            expect(effect).toMatchObject({ valueApplied: true, typedIntoVoid: false });
        });

        it('names a coordinate type into a dead region as void', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), body()),
                8, 'set',
            );
            expect(effect).toMatchObject({ valueApplied: false, typedIntoVoid: true });
        });

        it('leaves the value verdict unmeasured in keys mode but still calls a no-op void', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), body()),
                1, 'keys',
            );
            expect(effect.valueApplied).toBeUndefined();
            expect(effect).toMatchObject({ typedIntoVoid: true, effectObserved: false });
        });

        it('reads a Tab that reached a field as focus movement, not void', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), focus({ valueLen: 0 })),
                1, 'keys',
            );
            expect(effect.valueApplied).toBeUndefined();
            expect(effect).toMatchObject({ focusChanged: true, typedIntoVoid: false, effectObserved: true });
        });

        it('reads a Backspace that shortened the field as focus movement with no value verdict', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 5 })),
                ctx(page(), focus({ valueLen: 4 })),
                1, 'keys',
            );
            expect(effect.valueApplied).toBeUndefined();
            expect(effect).toMatchObject({ focusChanged: true, typedIntoVoid: false });
        });

        it('does not call a form submit void: navigation counts as an effect', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/harbor-manifest?saved=1' }) }), body()),
                1, 'keys',
            );
            expect(effect).toMatchObject({ navigated: true, typedIntoVoid: false, effectObserved: true });
        });

        it('does not call body-focus text with a DOM change void: something observably moved', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page({ fingerprint: fingerprint({ textLength: 428, htmlHash: 'dock42' }) }), body()),
                8, 'append',
            );
            expect(effect).toMatchObject({
                domChanged: true, valueApplied: false, typedIntoVoid: false, effectObserved: true,
            });
        });

        it('detects a truncated append: focus moved but the length disagrees', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 0 })),
                ctx(page(), focus({ valueLen: 5 })),
                8, 'append',
            );
            expect(effect).toMatchObject({
                focusChanged: true, valueApplied: false, typedIntoVoid: false, effectObserved: true,
            });
        });

        it('leaves the value verdict unmeasured for empty text but still judges the void', () => {
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), body()),
                0, 'append',
            );
            expect(effect.valueApplied).toBeUndefined();
            expect(effect).toMatchObject({ typedIntoVoid: true });
        });

        it('degrades to undefined verdicts when both snapshots are missing', () => {
            const effect = compareTypeEffect(null, null, 8, 'append');
            expect(effect).toMatchObject({ readOk: false, effectObserved: false });
            expect(effect.valueApplied).toBeUndefined();
            expect(effect.typedIntoVoid).toBeUndefined();
            expect(effect.runtimeErrors).toBeUndefined();
        });

        it('degrades the value and void verdicts when the focus is unreadable', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 0 })),
                ctx(page(), null),
                8, 'append',
            );
            expect(effect).toMatchObject({ readOk: true, focusReadOk: false });
            expect(effect.valueApplied).toBeUndefined();
            expect(effect.typedIntoVoid).toBeUndefined();
        });

        it('still judges the value from focus alone when the page is unreadable, but not the void', () => {
            const effect = compareTypeEffect(
                ctx(null, focus({ valueLen: 0 })),
                ctx(null, focus({ valueLen: 8 })),
                8, 'append',
            );
            expect(effect).toMatchObject({ readOk: false, focusReadOk: true, valueApplied: true });
            expect(effect.typedIntoVoid).toBeUndefined();
        });

        it('counts new runtime errors during the type without touching the value verdict', () => {
            const effect = compareTypeEffect(
                ctx(page(), focus({ valueLen: 0 })),
                ctx(page({ errors: { js: 1, console: 1, network: 0 } }), focus({ valueLen: 8 })),
                8, 'append',
            );
            expect(effect).toMatchObject({ valueApplied: true, typedIntoVoid: false, runtimeErrors: 2 });
        });

        it('reports booleans and the runtime delta only: no lengths, no secret content', () => {
            const secret = 'harbor-night-watch-042';
            const effect = compareTypeEffect(
                ctx(page(), body()),
                ctx(page(), focus({ tag: 'INPUT', idLen: 9, classLen: 0, nameLen: 8, valueLen: secret.length })),
                secret.length, 'set',
            );
            expect(effect).toMatchObject({ valueApplied: true, typedIntoVoid: false });
            const allowed = new Set([
                'readOk', 'navigated', 'domChanged', 'focusChanged', 'focusReadOk',
                'effectObserved', 'runtimeErrors', 'valueApplied', 'typedIntoVoid',
            ]);
            for (const key of Object.keys(effect)) expect(allowed.has(key)).toBe(true);
            const serialised = JSON.stringify(effect);
            expect(serialised).not.toContain(secret);
            expect(serialised).not.toMatch(/Len|len|ength/);
            for (const [key, value] of Object.entries(effect)) {
                if (typeof value === 'number') expect(key).toBe('runtimeErrors');
            }
        });
    });
});
