/**
 * THE CONTRAST RULE WAS CHECKED BY SPELLING.
 *
 * Second stop in the sweep of the class that produced the design defect: a
 * rule inside `page.evaluate` cannot be unit-tested, so nothing watches it.
 * Thirty-one such decisions; this is the highest-stakes of them, because
 * `low_contrast` is in REPAIRS_THIS_FILE_CAN_MAKE — **a threshold that is
 * wrong by a little does not merely misreport, it sends the repairer to
 * change the colours of a page that was already correct.**
 *
 * ⛔ AND THE ONLY THING GUARDING IT WAS A SPELL-CHECK. `deep-self-qa.test.ts`
 * asserted that the SOURCE TEXT contains
 *
 *     /0\.2126 \* a\[0\] \+ 0\.7152 \* a\[1\] \+ 0\.0722 \* a\[2\]/
 *     /\(size >= 24 \|\| \(size >= 18\.66 && bold\)\) \? 3 : 4\.5/
 *
 * Those coefficients could be perfect while the branch above them inverted,
 * the sRGB linearisation used the wrong cutoff, or the ratio divided the wrong
 * way round — and every one of those tests would still be green. It is the
 * same shape as `min:` passing for any digit: a guard that reads the words of
 * a claim instead of testing the claim.
 *
 * The arithmetic and the verdict are functions in Node now, and **every number
 * below is published by the W3C, not by this repository.** That is the point:
 * a test whose expected values come from the thing under test proves only that
 * it is consistent with itself.
 */

import {
    relativeLuminance, contrastRatio, requiredRatio, judgeContrast, contrastSeverity,
} from '../core/quality/ui-inspection';

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

describe('the arithmetic answers to a published table', () => {
    it('⛔ POSITIVE — relative luminance of the two anchors', () => {
        //  WCAG defines white as 1.0 and black as 0.0 exactly.
        expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
        expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
    });

    /**
     *  ⛔ AND A CLAIM I HAD TO WITHDRAW TWICE WHILE PROVING THIS FILE.
     *
     *  First I asserted the exact cutoff constant was observable, offering
     *  `[10,10,10]` and `[11,11,11]`. I changed 0.03928 to 0.04045 on purpose
     *  and **nothing went red.** Rather than loosen the test, I measured:
     *  0.03928 x 255 = 10.02 and 0.04045 x 255 = 10.31, and **there is no
     *  integer between them.** For 8-bit colour the two published constants
     *  are the same function; the argument over which is right has no
     *  observable consequence here.
     *
     *  Then I asserted the two roads diverge at `[10,10,10]` by more than
     *  0.002. Measured: **0.00000075.** The piecewise function is CONTINUOUS
     *  at the cutoff — that is the whole point of the cutoff — so of course
     *  the roads agree beside it. Wrong again, for the opposite reason.
     *
     *  So I measured the whole neighbourhood instead of guessing at it:
     *
     *      rgb    piecewise      power-only     difference
     *        0    0.00000000     0.00083381     0.00083381
     *        1    0.00030353     0.00098368     0.00068015
     *        5    0.00151763     0.00173331     0.00021568
     *       10    0.00303527     0.00303452     0.00000075
     *      128    0.21586050     0.21586050     0.00000000
     *
     *  **The branch exists for the darkest few values and nothing else.** Its
     *  one consequence that matters is that black is EXACTLY zero — which is
     *  what makes black-on-white exactly 21:1, the number every accessibility
     *  tool in the world agrees on. At rgb 1 the roads still differ threefold;
     *  by rgb 10 they have met.
     */
    it('⛔ POSITIVE — the linear road is taken at the dark end, where it matters', () => {
        //  Measured, not assumed. The power road gives 0.00098368 here — more
        //  than three times as much — and a build using it for everything
        //  would also make black non-zero and 21:1 unreachable.
        expect(relativeLuminance([1, 1, 1])).toBeCloseTo(0.00030353, 8);
        const powerRoad = Math.pow((1 / 255 + 0.055) / 1.055, 2.4);
        expect(powerRoad / relativeLuminance([1, 1, 1])).toBeGreaterThan(3);
    });

    it('⛔ POSITIVE — and the power road everywhere above it', () => {
        //  Mid-grey, to eight places. The linear road would give 0.03886.
        expect(relativeLuminance([128, 128, 128])).toBeCloseTo(0.21586050, 7);
    });

    it('⛔ POSITIVE — black on white is 21:1, the maximum WCAG defines', () => {
        expect(near(contrastRatio(BLACK, WHITE), 21)).toBe(true);
        //  and order does not matter, which is what max/min are for
        expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(contrastRatio(BLACK, WHITE), 9);
    });

    it('⛔ NEGATIVE — a colour on itself is 1:1, not 0 and not Infinity', () => {
        //  The +0.05 on both sides exists for this. Dropping it makes white on
        //  white divide by zero, and the finding would fire on everything.
        expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 9);
        expect(contrastRatio(BLACK, BLACK)).toBeCloseTo(1, 9);
    });

    it('⛔ THE PAIR EITHER SIDE OF THE LINE — #767676 passes, #777777 does not', () => {
        //  The W3C's own worked example for AA body text on white. These two
        //  greys differ by one step and sit either side of 4.5, which is why
        //  they are the pair that proves the arithmetic rather than echoes it.
        const pass = contrastRatio([0x76, 0x76, 0x76], WHITE);
        const fail = contrastRatio([0x77, 0x77, 0x77], WHITE);
        expect(near(pass, 4.54, 0.02)).toBe(true);
        expect(near(fail, 4.48, 0.02)).toBe(true);
        expect(pass).toBeGreaterThanOrEqual(4.5);
        expect(fail).toBeLessThan(4.5);
    });
});

describe('what AA asks depends on the text, at the boundaries the spec names', () => {
    it('⛔ POSITIVE — 18pt is 24px, and it is inclusive', () => {
        expect(requiredRatio(24, false)).toBe(3);
        expect(requiredRatio(23.99, false)).toBe(4.5);
    });

    it('⛔ POSITIVE — 14pt bold is 18.66px, and only when bold', () => {
        expect(requiredRatio(18.66, true)).toBe(3);
        expect(requiredRatio(18.66, false)).toBe(4.5);
        expect(requiredRatio(18.65, true)).toBe(4.5);
    });

    it('⛔ NEGATIVE — ordinary body text gets no discount for being bold', () => {
        //  Bold alone is not large text. A rule that gave 3:1 to every bold
        //  span would silently pass most unreadable buttons on the web.
        expect(requiredRatio(16, true)).toBe(4.5);
        expect(requiredRatio(14, true)).toBe(4.5);
    });
});

describe('the verdict he reads', () => {
    const s = (over: Partial<any> = {}) => ({
        text: 'Read more', fg: [0x77, 0x77, 0x77], bg: WHITE, size: 16, bold: false,
        x: 0, y: 0, width: 80, height: 20, ...over,
    });

    it('⛔ POSITIVE — a failing sample is reported with its ratio and its need', () => {
        const [f] = judgeContrast([s()]);
        expect(f.need).toBe(4.5);
        expect(near(f.ratio, 4.48, 0.02)).toBe(true);
    });

    it('preserves the measured selector so the repair can reach the real rule', () => {
        const [f] = judgeContrast([s({ sel: 'main > button.counter-button' })]);
        expect(f.sel).toBe('main > button.counter-button');
        expect(f.fg).toEqual([0x77, 0x77, 0x77]);
        expect(f.bg).toEqual(WHITE);
    });

    it('⛔ NEGATIVE — a passing sample is not reported at all', () => {
        expect(judgeContrast([s({ fg: [0x76, 0x76, 0x76] })])).toEqual([]);
        expect(judgeContrast([])).toEqual([]);
        expect(judgeContrast(undefined)).toEqual([]);
    });

    it('⛔ NEGATIVE — large text is judged by ITS rule, not the body rule', () => {
        //  #949494 on white is about 3.1:1 — a failure for body text and a
        //  pass for a 24px heading. Judging both by 4.5 is how a report fills
        //  with complaints about headings that are fine.
        const grey = [0x94, 0x94, 0x94];
        expect(judgeContrast([s({ fg: grey, size: 16 })]).length).toBe(1);
        expect(judgeContrast([s({ fg: grey, size: 24 })])).toEqual([]);
    });

    it('⛔ the worst one is first, because the sentence quotes fails[0]', () => {
        //  The finding says «worst ${fails[0].ratio}:1». Before this it was
        //  whichever failure came first down the page, and the word "worst"
        //  was a claim nothing kept.
        const out = judgeContrast([
            s({ text: 'mild', fg: [0x77, 0x77, 0x77] }),
            s({ text: 'awful', fg: [0xdd, 0xdd, 0xdd] }),
        ]);
        expect(out[0].text).toBe('awful');
        expect(out[0].ratio).toBeLessThan(out[1].ratio);
    });

    it('⛔ NEGATIVE — the same text at the same ratio is one complaint, not thirty', () => {
        //  A nav repeated on every card would otherwise fill the twelve slots
        //  and hide every other failure on the page.
        const many = Array.from({ length: 30 }, () => s());
        expect(judgeContrast(many).length).toBe(1);
    });

    it('⛔ NEGATIVE — and the list is capped, so a broken theme cannot flood it', () => {
        const many = Array.from({ length: 40 }, (_, i) =>
            s({ text: `item ${i}`, fg: [0x77 + (i % 9), 0x77, 0x77] }));
        expect(judgeContrast(many).length).toBe(12);
    });

    it('⛔ NEGATIVE — a malformed sample is skipped, never scored', () => {
        //  A gradient background arrives as null from the page and is counted
        //  as unmeasurable there. Anything else malformed must not become a
        //  confident 1.05:1, which is the false blocker he was shown before.
        expect(judgeContrast([{ text: 'x' } as any, s({ fg: null as any })])).toEqual([]);
    });
});

/**
 *  ⛔ AND THE DEFECT NO UNIT TEST IN THIS SUITE COULD HAVE FOUND.
 *
 *  Everything above was green, and every test agreed with the rule, because
 *  the rule was about a number none of them questioned:
 *
 *      severity: c.fails.length >= 4 ? 'major' : 'minor'
 *
 *  Then the real audit ran against a page with defects planted by hand, and
 *  printed this:
 *
 *      low    low_contrast   2 text element(s) fail WCAG AA (worst 1.16:1)
 *
 *  **1.16:1 is near-white text on white — nobody can read it** — and it came
 *  back `minor`, which maps to `low`, which is not in `blockers`
 *  (severity `high`), so the build is delivered as fine. Four elements at
 *  4.4:1, barely under the line and readable by almost everyone, would have
 *  been `major`.
 *
 *  The count says how WIDESPREAD it is. Severity is a claim about how BAD it
 *  is. They are different questions and only one was being asked.
 *
 *  Measured again after the fix, on the same page: `high`, and the score fell
 *  from 57 to 45.
 */
describe('severity says how bad it is, not only how many there are', () => {
    it('⛔ POSITIVE — one unreadable element is critical on its own', () => {
        //  Below 3:1 fails for the largest, boldest text WCAG defines. There
        //  is no size at which it is acceptable, so the count is irrelevant.
        expect(contrastSeverity([{ ratio: 1.16 }])).toBe('critical');
        expect(contrastSeverity([{ ratio: 2.99 }])).toBe('critical');
    });

    it('⛔ NEGATIVE — a near miss stays minor, however close it is', () => {
        //  4.4:1 is readable by almost everyone. Blocking a delivery on it
        //  would be the false blocker he has been shown before, and a report
        //  that blocks on everything is a report he learns to ignore.
        expect(contrastSeverity([{ ratio: 4.49 }])).toBe('minor');
        expect(contrastSeverity([{ ratio: 3.0 }])).toBe('minor');
    });

    it('⛔ POSITIVE — and breadth still counts, as it did before', () => {
        //  The old rule is not deleted, it is joined. Four near-misses is a
        //  theme, and a theme is worth a stronger word than one.
        const four = [{ ratio: 4.4 }, { ratio: 4.3 }, { ratio: 4.2 }, { ratio: 4.1 }];
        expect(contrastSeverity(four)).toBe('major');
        expect(contrastSeverity(four.slice(0, 3))).toBe('minor');
    });

    it('⛔ NEGATIVE — no failures is not a severity at all', () => {
        expect(contrastSeverity([])).toBe('minor');
        expect(contrastSeverity(undefined as any)).toBe('minor');
    });

    it('⛔ the WORST decides, not the first or the average', () => {
        //  Three fine-ish and one invisible must be critical: averaging or
        //  reading fails[0] would bury the only one that matters.
        expect(contrastSeverity([{ ratio: 4.4 }, { ratio: 4.3 }, { ratio: 1.1 }])).toBe('critical');
    });
});
