import {
    compareClickEffect,
    compareKeyEffect,
    KEY_FOCUS_SCRIPT,
    type ClickContext,
    type ClickFingerprint,
    type KeyContext,
    type KeyFocus,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/depot',
        title: 'Depot',
        elements: 57,
        textLength: 1024,
        htmlHash: 'key11',
        ...over,
    };
}

function page(over: Partial<ClickContext> = {}): ClickContext {
    return { fingerprint: fingerprint(), errors: { js: 0, console: 0, network: 0 }, ...over };
}

function focus(over: Partial<KeyFocus> = {}): KeyFocus {
    return { hasFocus: true, tag: 'BODY', idLen: 0, classLen: 0, nameLen: 0, valueLen: 0, isBody: true, ...over };
}

function keyContext(over: Partial<KeyContext> = {}): KeyContext {
    return { page: page(), focus: focus(), ...over };
}

describe('key effect evidence', () => {
    describe('compareKeyEffect', () => {
        it('reports no effect when page and focus are unchanged', () => {
            const effect = compareKeyEffect(keyContext(), keyContext());
            expect(effect).toMatchObject({ readOk: true, navigated: false, domChanged: false, focusChanged: false, focusReadOk: true, effectObserved: false, runtimeErrors: 0 });
        });

        it('names a Tab-order move through focus alone', () => {
            const moved = compareKeyEffect(
                keyContext(),
                keyContext({ focus: focus({ tag: 'INPUT', idLen: 9, isBody: false }) }),
            );
            expect(moved).toMatchObject({ readOk: true, navigated: false, domChanged: false, focusChanged: true, focusReadOk: true, effectObserved: true });
        });

        it('names typed text through the focus value length', () => {
            const typed = compareKeyEffect(
                keyContext({ focus: focus({ tag: 'INPUT', idLen: 9, valueLen: 0, isBody: false }) }),
                keyContext({ focus: focus({ tag: 'INPUT', idLen: 9, valueLen: 1, isBody: false }) }),
            );
            expect(typed).toMatchObject({ focusChanged: true, effectObserved: true, domChanged: false });
        });

        it('names page change with an unmoved focus', () => {
            const changed = compareKeyEffect(
                keyContext(),
                keyContext({ page: page({ fingerprint: fingerprint({ elements: 58, htmlHash: 'key12' }) }) }),
            );
            expect(changed).toMatchObject({ domChanged: true, focusChanged: false, effectObserved: true });
        });

        it('names navigation like the click comparator', () => {
            const moved = compareKeyEffect(
                keyContext(),
                keyContext({ page: page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/counter' }) }) }),
            );
            expect(moved).toMatchObject({ navigated: true, effectObserved: true });
        });

        it('never invents an effect from unreadable halves', () => {
            expect(compareKeyEffect(null, keyContext())).toMatchObject({ readOk: false, focusReadOk: false, effectObserved: false });
            expect(compareKeyEffect(keyContext(), null)).toMatchObject({ readOk: false, focusReadOk: false, effectObserved: false });
            expect(compareKeyEffect(null, null)).toMatchObject({ readOk: false, navigated: false, domChanged: false, focusChanged: false, effectObserved: false });
        });

        it('reports focus evidence even when the page itself is unreadable', () => {
            const effect = compareKeyEffect(
                keyContext({ page: null }),
                keyContext({ page: null, focus: focus({ tag: 'BUTTON', isBody: false }) }),
            );
            expect(effect).toMatchObject({ readOk: false, focusReadOk: true, focusChanged: true, effectObserved: true });
        });

        it('reports page evidence when the focus is unreadable', () => {
            const effect = compareKeyEffect(
                keyContext({ focus: null }),
                keyContext({ focus: null, page: page({ fingerprint: fingerprint({ title: 'Changed' }) }) }),
            );
            expect(effect).toMatchObject({ readOk: true, focusReadOk: false, focusChanged: false, domChanged: true, effectObserved: true });
        });

        it('counts new runtime error signals across the step', () => {
            const effect = compareKeyEffect(
                keyContext({ page: page({ errors: { js: 0, console: 1, network: 0 } }) }),
                keyContext({ page: page({ errors: { js: 2, console: 1, network: 0 } }) }),
            );
            expect(effect.runtimeErrors).toBe(2);
        });

        it('leaves runtimeErrors absent when telemetry resets mid-step', () => {
            const effect = compareKeyEffect(
                keyContext({ page: page({ errors: { js: 4, console: 0, network: 0 } }) }),
                keyContext({ page: page({ errors: { js: 0, console: 0, network: 0 } }) }),
            );
            expect(effect.runtimeErrors).toBeUndefined();
            expect(effect.readOk).toBe(true);
        });

        it('carries booleans and counts only, never page content', () => {
            const effect = compareKeyEffect(
                keyContext(),
                keyContext({
                    page: page({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/s3cret-path' }) }),
                    focus: focus({ tag: 'INPUT', idLen: 6, valueLen: 12, isBody: false }),
                }),
            );
            expect(effect).toMatchObject({ navigated: true, focusChanged: true });
            expect(JSON.stringify(effect)).not.toContain('s3cret');
        });
    });

    describe('focus script', () => {
        it('is a self-contained IIFE readable by page.evaluate', () => {
            const script = KEY_FOCUS_SCRIPT.trim();
            expect(script.startsWith('(() => {')).toBe(true);
            expect(script.endsWith('})()')).toBe(true);
            expect(script).toContain('activeElement');
            expect(script).toContain('baseVal');
        });

        it('extracts lengths and booleans when executed', () => {
            const run = new Function('document', `return (${KEY_FOCUS_SCRIPT});`) as (doc: any) => any;
            const fd = run({
                activeElement: {
                    tagName: 'input',
                    id: 'search-box',
                    className: 'wide',
                    getAttribute: (n: string) => (n === 'name' ? 'q' : null),
                    value: 'hello',
                },
            });
            expect(fd).toEqual({ hasFocus: true, tag: 'INPUT', idLen: 10, classLen: 4, nameLen: 1, valueLen: 5, isBody: false });
        });

        it('degrades on a missing focus instead of throwing', () => {
            const run = new Function('document', `return (${KEY_FOCUS_SCRIPT});`) as (doc: any) => any;
            expect(run({ activeElement: null })).toEqual({ hasFocus: false, tag: '', idLen: 0, classLen: 0, nameLen: 0, valueLen: 0, isBody: false });
            expect(run({})).toMatchObject({ hasFocus: false });
        });

        it('reads SVG class names through baseVal without leaking them', () => {
            const run = new Function('document', `return (${KEY_FOCUS_SCRIPT});`) as (doc: any) => any;
            const fd = run({ activeElement: { tagName: 'svg', className: { baseVal: 'icon' } } });
            expect(fd).toMatchObject({ tag: 'SVG', classLen: 4 });
            expect(JSON.stringify(fd)).not.toContain('icon');
        });

        it('treats body focus as the unfocused baseline', () => {
            const run = new Function('document', `return (${KEY_FOCUS_SCRIPT});`) as (doc: any) => any;
            const fd = run({ activeElement: { tagName: 'body', id: '', className: '' } });
            expect(fd).toMatchObject({ hasFocus: true, tag: 'BODY', isBody: true });
        });
    });
});

describe('hover effect evidence', () => {
    it('reuses the shared click comparator, so a revealed menu reads as domChanged', () => {
        const before = page();
        const after = page({ fingerprint: fingerprint({ elements: 63, htmlHash: 'menu1' }) });
        expect(compareClickEffect(before, after)).toMatchObject({ readOk: true, domChanged: true, effectObserved: true });
        expect(compareClickEffect(before, before)).toMatchObject({ effectObserved: false });
    });
});

// The comparators are pure; the executor must actually call them on the
// key and hover paths, with before-snapshots ahead of the action and the
// compare behind the settle wait. Pin the wiring by stable anchors.
describe('key/hover effect wiring contract', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'executor.ts'), 'utf8');

    it('snapshots page and focus before the keypress, compares after the settle', () => {
        expect(executor).toContain('page: await snapshotClickContext(page, sessionId)');
        expect(executor).toContain('focus: await snapshotKeyFocus(page)');
        expect(executor).toContain('const keyEffect = compareKeyEffect(keyBefore, keyAfter);');
        const beforeAt = executor.indexOf('const keyBefore: KeyContext');
        const pressAt = executor.indexOf('await page.keyboard.press(key);');
        const compareAt = executor.indexOf('compareKeyEffect(keyBefore, keyAfter)');
        expect({ beforeFound: beforeAt > 0, pressFound: pressAt > 0, compareFound: compareAt > 0 })
            .toEqual({ beforeFound: true, pressFound: true, compareFound: true });
        expect({ snapshotFirst: beforeAt < pressAt, compareAfterPress: pressAt < compareAt })
            .toEqual({ snapshotFirst: true, compareAfterPress: true });
    });

    it('carries the focus field on the key success receipt', () => {
        expect(executor).toMatch(/results\.push\(\{ stepId: sid, name, ok: true, navigated: keyNavigated, domChanged: keyDomChanged, focusChanged: keyFocusChanged, effectObserved: keyEffectObserved, runtimeErrors: keyRuntimeErrors \}\);/);
    });

    it('snapshots before the hover, compares after the settle', () => {
        expect(executor).toContain('const hoverBefore = await snapshotClickContext(page, sessionId);');
        expect(executor).toContain('const hoverEffect = compareClickEffect(hoverBefore, hoverAfter);');
        const beforeAt = executor.indexOf('const hoverBefore');
        const hoverAt = executor.indexOf("await interactions.hover(page, 'hover', cx, cy, 300);");
        const compareAt = executor.indexOf('compareClickEffect(hoverBefore, hoverAfter)');
        expect({ beforeFound: beforeAt > 0, hoverFound: hoverAt > 0, compareFound: compareAt > 0 })
            .toEqual({ beforeFound: true, hoverFound: true, compareFound: true });
        expect({ snapshotFirst: beforeAt < hoverAt, compareAfterHover: hoverAt < compareAt })
            .toEqual({ snapshotFirst: true, compareAfterHover: true });
    });

    it('carries the effect fields on the hover success receipt', () => {
        expect(executor).toMatch(/results\.push\(\{ stepId: sid, name, ok: true, navigated: hoverNavigated, domChanged: hoverDomChanged, effectObserved: hoverEffectObserved, runtimeErrors: hoverRuntimeErrors \}\);/);
    });
});
