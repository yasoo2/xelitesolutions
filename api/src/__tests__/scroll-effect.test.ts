import {
    buildScrollIntoViewEval,
    buildScrollTargetReadEval,
    compareScrollEffect,
    isRectInViewport,
    SCROLL_SNAPSHOT_SCRIPT,
    type ScrollSnapshot,
    type ViewportRect,
} from '../modules/browser/actionVerification';

const SNAP = (over: Partial<ScrollSnapshot> = {}): ScrollSnapshot => ({
    x: 0,
    y: 0,
    innerW: 1280,
    innerH: 800,
    scrollW: 1280,
    scrollH: 3000,
    ...over,
});

const RECT = (over: Partial<ViewportRect> = {}): ViewportRect => ({
    top: 100,
    left: 100,
    bottom: 200,
    right: 300,
    width: 200,
    height: 100,
    ...over,
});

/** The builders bake args as a trailing JSON literal: `(fn)({...})`. */
function bakedArgs(src: string): any {
    const start = src.lastIndexOf('({');
    expect(start).toBeGreaterThan(0);
    return JSON.parse(src.slice(start + 1, src.length - 1));
}

describe('scroll + scroll_to_element effect evidence', () => {
    describe('compareScrollEffect', () => {
        it('reports a downward move with a positive delta', () => {
            const fx = compareScrollEffect(SNAP({ y: 0 }), SNAP({ y: 400 }));
            expect(fx).toEqual({ readOk: true, moved: true, deltaX: 0, deltaY: 400, atTop: false, atBottom: false });
        });

        it('reports an upward move with a negative delta', () => {
            const fx = compareScrollEffect(SNAP({ y: 900 }), SNAP({ y: 500 }));
            expect(fx.moved).toBe(true);
            expect(fx.deltaY).toBe(-400);
            expect(fx.atTop).toBe(false);
        });

        it('reports no movement when the snapshots match', () => {
            const fx = compareScrollEffect(SNAP({ y: 300 }), SNAP({ y: 300 }));
            expect(fx.readOk).toBe(true);
            expect(fx.moved).toBe(false);
            expect(fx.deltaY).toBe(0);
        });

        it('pins atTop at the top and atBottom at the bottom', () => {
            expect(compareScrollEffect(SNAP({ y: 500 }), SNAP({ y: 0 })).atTop).toBe(true);
            const bottom = SNAP({ y: 2200 }); // 2200 + 800 == scrollH 3000
            const fx = compareScrollEffect(SNAP({ y: 0 }), bottom);
            expect(fx.atBottom).toBe(true);
            expect(fx.atTop).toBe(false);
        });

        it('pins both edges on a page that cannot scroll', () => {
            const short = SNAP({ scrollH: 600 });
            const fx = compareScrollEffect(short, { ...short });
            expect(fx.readOk).toBe(true);
            expect(fx.moved).toBe(false);
            expect(fx.atTop).toBe(true);
            expect(fx.atBottom).toBe(true);
        });

        it('absorbs 1px of subpixel rounding at the bottom edge', () => {
            const almost = SNAP({ y: 2199 }); // 2199 + 800 = 2999, one short
            expect(compareScrollEffect(SNAP({ y: 0 }), almost).atBottom).toBe(true);
            const clearly = SNAP({ y: 2198 });
            expect(compareScrollEffect(SNAP({ y: 0 }), clearly).atBottom).toBe(false);
        });

        it('degrades to readOk:false when either snapshot is missing', () => {
            expect(compareScrollEffect(null, SNAP()).readOk).toBe(false);
            expect(compareScrollEffect(SNAP(), null).readOk).toBe(false);
            expect(compareScrollEffect(null, null).moved).toBe(false);
        });
    });

    describe('isRectInViewport', () => {
        it('accepts a fully visible box', () => {
            expect(isRectInViewport(RECT(), 1280, 800)).toBe(true);
        });

        it('accepts a partially visible box on any edge', () => {
            expect(isRectInViewport(RECT({ top: -50, bottom: 50 }), 1280, 800)).toBe(true);
            expect(isRectInViewport(RECT({ top: 750, bottom: 900 }), 1280, 800)).toBe(true);
            expect(isRectInViewport(RECT({ left: -40, right: 60 }), 1280, 800)).toBe(true);
            expect(isRectInViewport(RECT({ left: 1200, right: 1400 }), 1280, 800)).toBe(true);
        });

        it('rejects a box fully outside on any side', () => {
            expect(isRectInViewport(RECT({ top: -200, bottom: -10 }), 1280, 800)).toBe(false);
            expect(isRectInViewport(RECT({ top: 810, bottom: 900 }), 1280, 800)).toBe(false);
            expect(isRectInViewport(RECT({ left: -300, right: -5 }), 1280, 800)).toBe(false);
            expect(isRectInViewport(RECT({ left: 1290, right: 1400 }), 1280, 800)).toBe(false);
        });

        it('rejects zero-area boxes such as display:none', () => {
            expect(isRectInViewport(RECT({ width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 }), 1280, 800)).toBe(false);
            expect(isRectInViewport(RECT({ width: 200, height: 0 }), 1280, 800)).toBe(false);
        });

        it('rejects nullish and non-finite inputs instead of throwing', () => {
            expect(isRectInViewport(null, 1280, 800)).toBe(false);
            expect(isRectInViewport(undefined, 1280, 800)).toBe(false);
            expect(isRectInViewport({} as ViewportRect, 1280, 800)).toBe(false);
            expect(isRectInViewport(RECT(), NaN, 800)).toBe(false);
            expect(isRectInViewport(RECT(), 0, 800)).toBe(false);
        });
    });

    describe('SCROLL_SNAPSHOT_SCRIPT', () => {
        it('is a standalone IIFE returning scroll geometry numbers', () => {
            const run: (w: any, d: any) => any = new Function(
                'window',
                'document',
                `return (${SCROLL_SNAPSHOT_SCRIPT});`,
            ) as any;
            const out = run(
                { scrollX: 0, scrollY: 321, innerWidth: 1280, innerHeight: 800 },
                { documentElement: { scrollWidth: 1280, scrollHeight: 3000 } },
            );
            expect(out).toEqual({ x: 0, y: 321, innerW: 1280, innerH: 800, scrollW: 1280, scrollH: 3000 });
        });

        it('degrades to zeros when the globals are missing', () => {
            const run: (w: any, d: any) => any = new Function(
                'window',
                'document',
                `return (${SCROLL_SNAPSHOT_SCRIPT});`,
            ) as any;
            expect(run(undefined, undefined)).toEqual({ x: 0, y: 0, innerW: 0, innerH: 0, scrollW: 0, scrollH: 0 });
        });
    });

    describe('buildScrollTargetReadEval', () => {
        it('builds syntactically valid standalone JavaScript', () => {
            const src = buildScrollTargetReadEval('#target');
            expect(() => new Function(`return (${src});`)).not.toThrow();
        });

        it('embeds the live viewport source so unit tests and the page share one truth', () => {
            const src = buildScrollTargetReadEval('#target');
            expect(src).toContain(isRectInViewport.toString());
        });

        it('bakes a hostile selector as an inert JSON literal', () => {
            const hostile = `#x"]);</script><script>alert(1)</script>`;
            const src = buildScrollTargetReadEval(hostile);
            expect(bakedArgs(src)).toEqual({ selector: hostile });
            expect(() => new Function(`return (${src});`)).not.toThrow();
        });
    });

    describe('buildScrollIntoViewEval', () => {
        it('builds syntactically valid standalone JavaScript baking selector and mode', () => {
            const smooth = buildScrollIntoViewEval('#target', false);
            expect(() => new Function(`return (${smooth});`)).not.toThrow();
            expect(bakedArgs(smooth)).toEqual({ selector: '#target', instant: false });
            const instant = buildScrollIntoViewEval('#target', true);
            expect(() => new Function(`return (${instant});`)).not.toThrow();
            expect(bakedArgs(instant)).toEqual({ selector: '#target', instant: true });
        });
    });
});
