/**
 * A HEADING THAT IS ACTUALLY A HEADING.
 *
 * He watched this exact line survive build after build, at 97/100, with the
 * repair loop never running once:
 *
 *     • Largest heading 17px against 14px body (ratio 1.21) — no visual hierarchy
 *
 * Three names for one defect across three modules is why. The design audit
 * emits `flat_hierarchy`; the gate's hand-written list knew thirteen ids and
 * not that one; and the repairer answered `type_scale_drift`, which is a
 * DIFFERENT defect — it pulls stray sizes back onto the scale, it does not
 * make a heading out of one.
 *
 * I said in a commit comment that `type_scale_drift` «is that heading finding
 * by name». That was wrong, and I had not read it when I wrote it. The
 * correction is this file and the repair beside it: `flat_hierarchy` had no
 * fix at all, so one is written.
 *
 * The fix is arithmetic on the audit's own numbers, and it escalates with the
 * round — 1.5, 1.75, 2.0 — because a round that repeats itself is not a round
 * and the loop would rightly roll it back.
 */

import { repairFlatHierarchy } from '../core/quality/ui-repair';
import { worthRepairing } from '../core/quality/self-repair';

const HIS_CASE = [{ headingPx: 17, bodyPx: 14, ratio: 1.21 }];
const h1Of = (css: string): number => Number((css.match(/h1 \{ font-size: (\d+)px/) || [])[1] || 0);

describe('the heading is raised until there is a hierarchy', () => {
    // POSITIVE — his measured case, and the escalation across rounds.
    it.each([
        [1, 1.5],
        [2, 1.75],
        [3, 2],
    ])('round %i clears a ratio of %s', (round, want) => {
        const out = repairFlatHierarchy('body{font-size:14px}', HIS_CASE, round);
        expect(out.repairs).toHaveLength(1);
        expect(h1Of(out.text) / 14).toBeGreaterThanOrEqual(want);
    });

    // POSITIVE — and the gate lets it through, which is the half that failed.
    it('flat_hierarchy opens the repair gate', () => {
        expect(worthRepairing([{ id: 'flat_hierarchy' }])).toBe(true);
    });

    // POSITIVE — the repair names itself, so the loop can see it was answered.
    it('the repair reports its own id', () => {
        expect(repairFlatHierarchy('body{}', HIS_CASE, 1).repairs[0].id).toBe('flat_hierarchy');
    });

    // NEGATIVE — a page that already has a hierarchy is left alone.
    it('a 36px heading over 16px body is not touched', () => {
        expect(repairFlatHierarchy('body{}', [{ headingPx: 36, bodyPx: 16, ratio: 2.25 }], 1).repairs).toEqual([]);
    });

    // NEGATIVE — with no measurement it invents nothing.
    it.each([
        ['no evidence', []],
        ['evidence without sizes', [{ ratio: 1.2 }]],
    ])('%s changes nothing', (_label, evidence) => {
        expect(repairFlatHierarchy('body{}', evidence as any[], 1).repairs).toEqual([]);
    });

    // NEGATIVE — and it never writes the same block twice.
    it('a second pass over its own output does nothing', () => {
        const once = repairFlatHierarchy('body{}', HIS_CASE, 1);
        expect(repairFlatHierarchy(once.text, HIS_CASE, 1).repairs).toEqual([]);
    });
});
