/**
 * SEVEN DESIGNS IS A CATALOGUE, AND THE OWNER SAID SO.
 *
 * «You are putting Joe inside limits and imprisoning him. It makes no sense
 * for a system as large as Joe to own seven designs while you assign each
 * design to a particular prompt.»
 *
 * He is right, and the criticism lands on his own fourth law. Wiring the
 * seven-archetype table into the project generator did not fix the class; it
 * moved it one layer up. Every request still landed on one of seven pages,
 * and the eighth business he describes tomorrow was never on the list.
 *
 * SO THE TEST OF THIS FIX IS NOT «does one request work». It is: how many
 * DIFFERENT pages do many different requests produce? A selector answers with
 * at most as many as it holds. A composer answers with as many as there are
 * distinct requests.
 *
 * The three that matter, and they pull against each other:
 *
 *   DIVERSITY   many requests, many designs — otherwise it is a template.
 *   STABILITY   one request, one design, for ever — otherwise an edit
 *               becomes a redesign and nothing can be measured twice.
 *   BOUNDS      every design inside a band a designer would work in —
 *               otherwise synthesis produces unreadable pages, which is
 *               worse than repetitive ones.
 *
 * A fix that wins any two of those and loses the third is not a fix, so all
 * three are asserted here.
 */

import { composeDesign, composedCss, type DesignGenome } from '../core/design/composer';

/** Enough real briefs to tell a space from a shelf. */
const REQUESTS = [
    'اعمل لي موقع لمحمصة قهوة مختصة اسمها إمبرلاين',
    'اعمل لي موقع مكتب محاماة تجاري في الرياض',
    'اعمل لي موقع عيادة أسنان ومواعيد المرضى',
    'اعمل لي متجر مجوهرات ذهب وألماس',
    'اعمل لي موقع مدرسة لغات للأطفال',
    'اعمل لي موقع ورشة تصليح دراجات',
    'اعمل لي موقع مزرعة عضوية تبيع الخضار',
    'اعمل لي موقع استوديو تصوير أعراس',
    'اعمل لي موقع صالة رياضية ولياقة',
    'اعمل لي موقع مطعم إيطالي في جدة',
    'build a website for a specialty coffee roastery',
    'build a website for a commercial law firm',
    'build a site for a ceramics studio and kiln',
    'build a site for a bookshop with a reading room',
    'build a site for a bicycle repair workshop',
    'اعمل لي موقع لمكتب هندسة معمارية',
    'اعمل لي موقع لمشتل نباتات داخلية',
    'اعمل لي موقع لشركة شحن وتوصيل',
    'اعمل لي موقع لمركز تدريب سباحة',
    'اعمل لي موقع لمتجر عطور شرقية',
];

const fingerprint = (g: DesignGenome) => [
    g.rhythm, g.measure, g.split, g.align, g.radius,
    g.weight, g.elevation, g.accent, g.density, g.texture,
].join('|');

describe('a design is composed from his sentence, not picked off a shelf', () => {
    it('POSITIVE — twenty requests do not collapse onto seven pages', () => {
        const seen = new Set(REQUESTS.map(r => fingerprint(composeDesign(r))));
        //  The old table held seven. Anything at or below that is the same
        //  defect with more code.
        expect({ distinct: seen.size, requests: REQUESTS.length, beatsTheTable: seen.size > 7 })
            .toEqual({ distinct: seen.size, requests: REQUESTS.length, beatsTheTable: true });
        //  And in practice they should be nearly all different.
        expect(seen.size).toBeGreaterThanOrEqual(REQUESTS.length - 2);
    });

    it('POSITIVE — the dimensions move INDEPENDENTLY', () => {
        //  Ten knobs wired to one knob is seven templates with extra steps.
        //  Each dimension must take more than one value across the set.
        const values: Record<string, Set<string>> = {};
        for (const r of REQUESTS) {
            const g = composeDesign(r) as unknown as Record<string, unknown>;
            for (const k of ['rhythm', 'measure', 'split', 'align', 'radius', 'weight', 'elevation', 'accent', 'density', 'texture']) {
                (values[k] ||= new Set()).add(String(g[k]));
            }
        }
        for (const [k, set] of Object.entries(values)) {
            expect({ dimension: k, varies: set.size > 1 }).toEqual({ dimension: k, varies: true });
        }
    });

    it('POSITIVE — what he SAYS overrides what the fingerprint guessed', () => {
        //  «بسيط» is not a subject; it names a decision. Reading it is reading
        //  the request.
        const minimal = composeDesign('اعمل لي موقع بسيط جداً لمحمصة قهوة');
        expect(minimal.density).toBe('airy');
        expect(minimal.texture).toBe('none');
        expect(minimal.weight).toBe(1);

        const bold = composeDesign('اعمل لي موقع جريء وصارخ لمحمصة قهوة');
        expect(bold.weight).toBe(3);
        expect(bold.accent).toBe('block');

        const centered = composeDesign('اعمل لي موقع بتصميم مركز بالوسط');
        expect(centered.align).toBe('center');
        expect(centered.split).toBe(0.5);
    });

    it('NEGATIVE — the same request rebuilds the same design, exactly', () => {
        //  Without this it is not a system, and an edit becomes a redesign.
        for (const r of REQUESTS.slice(0, 6)) {
            expect(fingerprint(composeDesign(r))).toBe(fingerprint(composeDesign(r)));
        }
    });

    it('NEGATIVE — every design lands inside a band a designer would work in', () => {
        //  Freedom is WHERE in the band, never whether to leave it. Synthesis
        //  without bounds makes unreadable pages, which is worse than
        //  repetitive ones.
        for (const r of REQUESTS) {
            const g = composeDesign(r);
            expect({ r, ok: g.rhythm >= 4 && g.rhythm <= 10 }).toEqual({ r, ok: true });
            expect({ r, ok: g.measure >= 56 && g.measure <= 76 }).toEqual({ r, ok: true });
            expect({ r, ok: g.split >= 0.3 && g.split <= 0.7 }).toEqual({ r, ok: true });
            expect({ r, ok: g.radius >= 0 && g.radius <= 22 }).toEqual({ r, ok: true });
            expect({ r, ok: g.weight >= 1 && g.weight <= 3 }).toEqual({ r, ok: true });
        }
    });

    it('NEGATIVE — every composition still emits a readable page', () => {
        //  A page with no wrapper, no measure and no section rhythm would be
        //  worse than one layout for everything.
        for (const r of REQUESTS.slice(0, 8)) {
            const css = composedCss(composeDesign(r));
            //  The claim is that a section rhythm EXISTS, not how it is spelled.
            //  The selector moved to `main > section` when the stylesheet was
            //  retargeted at the markup the generator really writes.
            expect({ r, wrap: css.includes('.wrap{'), section: css.includes('main > section{'), measure: css.includes('--measure:') })
                .toEqual({ r, wrap: true, section: true, measure: true });
        }
    });

    it('NEGATIVE — an empty request still yields a whole, valid design', () => {
        const g = composeDesign('');
        expect(g.rhythm).toBeGreaterThanOrEqual(4);
        expect(composedCss(g)).toContain('.wrap{');
    });
});
