/**
 * THE BODY SIZE WAS WHATEVER CAME FIRST IN THE DOM.
 *
 * «ولا التصميم» — the last item on his list of what the browser QA did not
 * really check.
 *
 * The design audit asks five questions, and the fifth is whether there is any
 * visual hierarchy: a heading that is actually bigger than the text under it.
 * It asked it like this, inside the page:
 *
 *     const p = textEls.find(el => /^(P|LI|SPAN|DIV)$/.test(el.tagName));
 *     return p ? Math.round(parseFloat(getComputedStyle(p).fontSize)) : 16;
 *
 * ⛔ THE FIRST SUCH ELEMENT IN DOCUMENT ORDER. On a real page that is a nav
 * item, a badge, a breadcrumb, a skip link — almost never the body text. So
 * `flat_hierarchy` measured the heading against an arbitrary element, and it
 * was wrong in BOTH directions:
 *
 *   · a 20px h1 over 18px body, with an 11px «NEW» badge first
 *       real ratio 1.11 — flat, and this finding exists for exactly that
 *       measured 1.82 — silent. **It misses the case it was written for.**
 *
 *   · a 40px h1 over 16px body, with a 32px hero subtitle first
 *       real ratio 2.5 — fine
 *       measured 1.25 — FIRES. And `flat_hierarchy` is in
 *       REPAIRS_THIS_FILE_CAN_MAKE, so the repairer enlarges headings on a
 *       page that did not need it, on a build that was already right.
 *
 * Body text is the size the page is BUILT on — the one used most — and that
 * census was already being collected two functions up and thrown away.
 *
 * ⛔ AND THE DECISION MOVED OUT OF THE PAGE. A function serialised into a
 * browser cannot be unit-tested, so a rule living there drifts unwatched.
 * Everything below is a real call, not a reading of the source.
 */

import { bodyTextSize, judgeDesign } from '../core/quality/design-audit';

describe('body text is the size the page is built on', () => {
    it('⛔ POSITIVE — the most-used size wins, not the first one', () => {
        //  30 paragraphs at 16, one badge at 11, one h1 at 20. The badge is
        //  first in the DOM and used to decide the whole judgement.
        expect(bodyTextSize([[20, 1], [16, 30], [11, 1]])).toBe(16);
    });

    it('⛔ POSITIVE — a tie goes to the smaller size', () => {
        //  Body text is what a page is mostly made of; headings are the
        //  exception. When the census cannot separate them, the smaller size
        //  is the safer reading — it can only make the ratio LARGER, and this
        //  finding must not fire on a page that is fine.
        expect(bodyTextSize([[32, 5], [16, 5]])).toBe(16);
    });

    it('⛔ NEGATIVE — nothing to count falls back, it does not return 0', () => {
        //  A 0 here would make the ratio Infinity or NaN and the finding
        //  would either never fire or fire on everything.
        expect(bodyTextSize([])).toBe(16);
        expect(bodyTextSize(undefined)).toBe(16);
        expect(bodyTextSize([[0, 9], [-4, 3]] as any)).toBe(16);
    });

    it('⛔ NEGATIVE — junk entries are skipped, not counted', () => {
        expect(bodyTextSize([['x', 'y'], [null, 4], [18, 7]] as any)).toBe(18);
    });
});

describe('the hierarchy finding now fires on the case it was written for', () => {
    const judge = (m: any) => judgeDesign({ textNodes: 40, ...m }).findings.map(f => f.code);

    it('⛔ POSITIVE — a 20px heading over 18px body IS flat, and is now caught', () => {
        //  The badge is present and first; it must no longer decide anything.
        const codes = judge({ headingPx: 20, sizeCounts: [[20, 1], [18, 26], [11, 1]] });
        expect(codes).toContain('flat_hierarchy');
    });

    it('⛔ NEGATIVE — a 40px heading over 16px body is NOT flat, and is left alone', () => {
        //  This is the false positive that made the repairer enlarge headings
        //  on a page that was already right.
        const codes = judge({ headingPx: 40, sizeCounts: [[40, 1], [32, 1], [16, 24]] });
        expect(codes).not.toContain('flat_hierarchy');
    });

    it('⛔ NEGATIVE — no heading at all produces no hierarchy claim', () => {
        //  A page with no h1 or h2 is `h1_count`'s business, not this one.
        //  Two findings for one defect is how a report becomes noise.
        expect(judge({ headingPx: 0, sizeCounts: [[16, 20]] })).not.toContain('flat_hierarchy');
    });

    it('⛔ NEGATIVE — an empty page is judged not at all', () => {
        expect(judgeDesign({ textNodes: 0 }).findings).toEqual([]);
        expect(judgeDesign(null).findings).toEqual([]);
    });

    it('the reported numbers are the numbers it judged', () => {
        //  A sentence he reads that names a different body size than the one
        //  the decision used is a number without its input — the shape this
        //  repository has paid for more than any other.
        const r = judgeDesign({ textNodes: 40, headingPx: 20, sizeCounts: [[20, 1], [18, 26], [11, 1]] });
        const flat = r.findings.find(f => f.code === 'flat_hierarchy');
        expect(flat).toBeTruthy();
        expect(flat!.en).toContain('against 18px body');
        expect(flat!.en).toContain('ratio 1.11');
        expect(r.metrics.bodyPx).toBe(18);
        expect(r.metrics.ratio).toBe(1.11);
    });
});
