import {
    CLICK_FINGERPRINT_SCRIPT,
    compareClickEffect,
    type ClickContext,
    type ClickFingerprint,
} from '../modules/browser/actionVerification';

function fingerprint(over: Partial<ClickFingerprint> = {}): ClickFingerprint {
    return {
        url: 'http://127.0.0.1:9/start',
        title: 'Start',
        elements: 41,
        textLength: 512,
        htmlHash: 'abc123',
        ...over,
    };
}

function context(over: Partial<ClickContext> = {}): ClickContext {
    return { fingerprint: fingerprint(), errors: { js: 0, console: 0, network: 0 }, ...over };
}

describe('click effect evidence', () => {
    describe('compareClickEffect', () => {
        it('reports no effect when nothing changed', () => {
            const effect = compareClickEffect(context(), context());
            expect(effect).toMatchObject({ readOk: true, navigated: false, domChanged: false, effectObserved: false, runtimeErrors: 0 });
        });

        it('names navigation, including a same-page anchor jump', () => {
            const moved = compareClickEffect(context(), context({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/second' }) }));
            expect(moved).toMatchObject({ readOk: true, navigated: true, effectObserved: true });
            const anchor = compareClickEffect(context(), context({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/start#section' }) }));
            expect(anchor).toMatchObject({ navigated: true, effectObserved: true });
        });

        it('names DOM change through any fingerprint signal', () => {
            for (const over of [
                { title: 'Changed' },
                { elements: 42 },
                { textLength: 513 },
                { htmlHash: 'zzz999' },
            ]) {
                const effect = compareClickEffect(context(), context({ fingerprint: fingerprint(over) }));
                expect({ over, effect }).toMatchObject({ effect: { readOk: true, navigated: false, domChanged: true, effectObserved: true } });
            }
        });

        it('never invents an effect from an unreadable page', () => {
            expect(compareClickEffect(null, context())).toMatchObject({ readOk: false, effectObserved: false });
            expect(compareClickEffect(context(), null)).toMatchObject({ readOk: false, effectObserved: false });
            expect(compareClickEffect(null, null)).toMatchObject({ readOk: false, navigated: false, domChanged: false, effectObserved: false });
            expect(compareClickEffect(
                context({ fingerprint: null }),
                context({ fingerprint: fingerprint({ url: 'http://127.0.0.1:9/elsewhere' }) }),
            )).toMatchObject({ readOk: false, navigated: false, effectObserved: false });
        });

        it('counts new runtime error signals across the step', () => {
            const effect = compareClickEffect(
                context({ errors: { js: 1, console: 0, network: 0 } }),
                context({ errors: { js: 2, console: 1, network: 0 } }),
            );
            expect(effect.runtimeErrors).toBe(2);
        });

        it('leaves runtimeErrors absent when telemetry resets mid-step', () => {
            // Counters are cumulative; a lower after-reading means telemetry
            // was re-created, so any delta would be a lie.
            const effect = compareClickEffect(
                context({ errors: { js: 5, console: 0, network: 0 } }),
                context({ errors: { js: 0, console: 0, network: 0 } }),
            );
            expect(effect.runtimeErrors).toBeUndefined();
            expect(effect.readOk).toBe(true);
        });

        it('leaves runtimeErrors absent when there is no telemetry', () => {
            expect(compareClickEffect(context({ errors: null }), context()).runtimeErrors).toBeUndefined();
            expect(compareClickEffect(context(), context({ errors: null })).runtimeErrors).toBeUndefined();
        });

        it('reports runtime errors even when the DOM itself is unreadable', () => {
            // A click that kills the page can still leave its error behind.
            const effect = compareClickEffect(
                context({ fingerprint: null, errors: { js: 0, console: 0, network: 0 } }),
                context({ fingerprint: null, errors: { js: 1, console: 0, network: 0 } }),
            );
            expect(effect).toMatchObject({ readOk: false, effectObserved: false, runtimeErrors: 1 });
        });

        it('carries booleans and counts only, never page content', () => {
            const effect = compareClickEffect(
                context(),
                context({
                    fingerprint: fingerprint({ url: 'http://127.0.0.1:9/s3cret-path', title: 's3cret title' }),
                    errors: { js: 0, console: 0, network: 1 },
                }),
            );
            expect(effect).toMatchObject({ navigated: true, runtimeErrors: 1 });
            expect(JSON.stringify(effect)).not.toContain('s3cret');
        });
    });

    describe('fingerprint script', () => {
        it('is a self-contained IIFE readable by page.evaluate', () => {
            const script = CLICK_FINGERPRINT_SCRIPT.trim();
            expect(script.startsWith('(() => {')).toBe(true);
            expect(script.endsWith('})()')).toBe(true);
            expect(script).toContain('outerHTML');
            expect(script).toContain('getElementsByTagName');
            expect(script).toContain('innerText');
        });

        it('extracts the documented fields when executed', () => {
            const run = new Function('document', `return (${CLICK_FINGERPRINT_SCRIPT});`) as (doc: any) => any;
            const fp = run({
                location: { href: 'http://127.0.0.1:9/start' },
                title: 'Start',
                getElementsByTagName: () => ({ length: 7 }),
                body: { innerText: 'hello' },
                documentElement: { outerHTML: '<html><body>hello</body></html>' },
            });
            expect(fp).toMatchObject({ url: 'http://127.0.0.1:9/start', title: 'Start', elements: 7, textLength: 5 });
            expect(typeof fp.htmlHash).toBe('string');
            expect(fp.htmlHash.length).toBeGreaterThan(0);
        });

        it('degrades to zeros on a partial document instead of throwing', () => {
            const run = new Function('document', `return (${CLICK_FINGERPRINT_SCRIPT});`) as (doc: any) => any;
            const fp = run({ location: {}, title: '', getElementsByTagName: () => ({ length: 0 }) });
            expect(fp).toMatchObject({ url: '', title: '', elements: 0, textLength: 0 });
            expect(typeof fp.htmlHash).toBe('string');
        });
    });
});

// The comparator is pure; the executor must actually call it on the click
// path, with the before-snapshot ahead of the click and the compare behind
// the settle wait. Pin the wiring by its stable anchors, not line numbers.
describe('click effect wiring contract', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'executor.ts'), 'utf8');
    const telemetry = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'telemetry.ts'), 'utf8');

    it('snapshots before the click attempt, compares after the settle', () => {
        expect(executor).toContain("name === 'click' ? await snapshotClickContext(page, sessionId)");
        const beforeAt = executor.indexOf('clickBefore');
        const clickAt = executor.indexOf("'selector_click'");
        const compareAt = executor.indexOf('compareClickEffect(clickBefore');
        expect({ beforeFound: beforeAt > 0, clickFound: clickAt > 0, compareFound: compareAt > 0 })
            .toEqual({ beforeFound: true, clickFound: true, compareFound: true });
        expect({ snapshotFirst: beforeAt < clickAt, compareAfterClick: clickAt < compareAt })
            .toEqual({ snapshotFirst: true, compareAfterClick: true });
    });

    it('carries the effect fields on the click success receipt', () => {
        expect(executor).toMatch(/results\.push\(\{ stepId: sid, name, ok: true, verified, valueMatch, repaired, navigated, domChanged, effectObserved, runtimeErrors \}\);/);
    });

    it('feeds the delta from cumulative telemetry counters, not the windowed snapshot', () => {
        expect(telemetry).toContain('export function getBrowserTelemetryErrorCounts');
        expect(telemetry).toContain('js: state.jsErrors, console: state.consoleErrors, network: state.networkErrors');
        expect(executor).toContain('getBrowserTelemetryErrorCounts(sessionId)');
    });
});
