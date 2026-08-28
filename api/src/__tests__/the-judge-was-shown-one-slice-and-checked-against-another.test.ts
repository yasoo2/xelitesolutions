/**
 * THE JUDGE WAS SHOWN ONE SLICE AND ITS ANSWER WAS CHECKED AGAINST ANOTHER.
 *
 * `sliceFor` was written to end blind cutting, with its measurement in the
 * comment above it — and was never wired to the prompt. `verifyNamed` computed
 * `shownFor` for every requirement, then built both calls from the FULL source,
 * where `verificationPrompt` blind-cut it head-and-tail. So two windows of the
 * same source were maintained apart with nothing forcing them to agree.
 *
 * Measured by the owner on `react-saffron-table-e9da8816`, watching the build
 * live and then reading the DOM himself:
 *
 *     source = 128539 chars · shown to the judge = 18000 (14%)
 *
 *     MISSING an ingredients list        — "no ingredients list"
 *     ?? changes the ingredient quantities — "the component files … were cut
 *                                            from the shown source"
 *     ?? a servings counter               — "its evidence is not in the source"
 *
 *     in the DOM of that same build: three ingredient lists, a counter that
 *     took 4 → 7 and rescaled every quantity (2 cups → 4, 800 g → 1400 g),
 *     three buttons that called window.print(). ALL THREE PRESENT.
 *
 * ⛔ TWO FAILURE MODES, ONE GAP. Code cut from the prompt reads «unmet»;
 * evidence quoted from the head the judge WAS shown fails `foundInSource`
 * against a keyword slice it was never shown, and a true «met» is downgraded.
 * Delivery was blocked on features that worked.
 *
 * ⛔ THE CLAIM THIS GUARD MAKES IS ABOUT THE WIRING, NOT THE FUNCTION. There is
 * already a guard proving `sliceFor` picks the right window; it stayed green
 * through every one of those runs, because the defect was never in the slicing.
 * So this file asserts through `verifyNamed`: what a call SHOWS is what its
 * answers are CHECKED against.
 *
 * ⛔ BROKEN ON PURPOSE BEFORE BEING BELIEVED. Reverting the batch call to
 * `verificationPrompt(reqs, src, …)` — the one line of the defect — turns the
 * first two tests red. Reverting only `shownFor` turns the third red.
 */

import { verifyNamed, sliceForMany, MAX_SOURCE_CHARS, NamedRequirement } from '../core/quality/named-requirements';

/** Big enough to be cut, with every requirement's evidence in the middle. */
//  A line only a BLIND head-cut can show: far from every requirement word, so
//  no keyword window reaches it. Under the defect it is the first thing the
//  judge sees; under the fix it is never shown at all.
const HEAD_MARKER = 'const distantHeadMarkerNobodyAskedAbout = 12345;\n';
//  Sized past the ceiling on purpose: with the cut at MAX_SOURCE_CHARS the
//  head and the tail together cover the first and last 20000 characters, and
//  BOTH components sit outside them — which is the shape of a real Joe
//  project that outgrew the window, and the only shape where a blind cut and
//  a chosen window disagree.
const HEAD = HEAD_MARKER + 'import React from "react";\n'.repeat(1850);
//  ⛔ THE TWO REQUIREMENTS SIT FAR APART ON PURPOSE. With their windows
//  disjoint, the batch slice is strictly larger than either one's own slice —
//  so a `shownFor` recomputed per requirement is a DIFFERENT window from the
//  one the batch call showed, and the guard can see the difference.
const INGREDIENTS_SRC = `
export function IngredientsList({ servings }) {
  return <li>Basmati rice — {scale(2, servings)} cups</li>;
}
`;
const GAP = 'export const spacer = 1;\n'.repeat(2000);
const COUNTER_SRC = `
export function ServingsCounter({ onPlus }) {
  return <button aria-label="Increase servings" onClick={onPlus}>+</button>;
}
`;
const MIDDLE = INGREDIENTS_SRC + GAP + COUNTER_SRC;
const TAIL = 'export const filler = 1;\n'.repeat(2000);
const BIG = HEAD + MIDDLE + TAIL;

const INGREDIENTS: NamedRequirement = {
    id: 'req-7kjq', text: 'an ingredients list', quote: 'an ingredients list',
};
const COUNTER: NamedRequirement = {
    id: 'req-cnhh', text: 'a servings counter with plus and minus buttons',
    quote: 'a servings counter with plus and minus buttons',
};
const REQS = [INGREDIENTS, COUNTER];

describe('what the judge is shown is what its answer is checked against', () => {
    it('⛔ POSITIVE — the batch prompt carries every requirement\'s own window', async () => {
        //  The defect in one assertion: the source is far past the cap, so the
        //  prompt is a slice either way. The question is WHICH slice — and a
        //  blind head-and-tail of this input contains neither component.
        const prompts: string[] = [];
        await verifyNamed(REQS, BIG, false, async (p: string) => {
            prompts.push(p);
            return JSON.stringify({ verdicts: REQS.map(r => ({ id: r.id, verdict: 'unprovable', evidence: '', why: 'x' })) });
        });
        expect(prompts.length).toBe(1);
        expect(prompts[0].length).toBeLessThan(BIG.length);
        expect(prompts[0]).toContain('IngredientsList');
        expect(prompts[0]).toContain('ServingsCounter');
    });

    it('⛔ POSITIVE — a "met" quoting the slice it was shown is COUNTED, not downgraded', async () => {
        //  ⛔ THE COUPLING, ASSERTED WITHOUT NAMING EITHER WINDOW. The judge
        //  quotes the opening of whatever source it was handed — the honest
        //  thing a real one does. If the check runs against a DIFFERENT window,
        //  that line is "not in the source" and a working feature is refused.
        //
        //  Under the defect the prompt opened on `HEAD_MARKER`, which no
        //  keyword window contains, so this verdict was downgraded. That is the
        //  ?? the owner read against a counter that demonstrably worked.
        const judged = await verifyNamed(REQS, BIG, false, async (p: string) => {
            const body = p.slice(p.indexOf('SOURCE:') + 'SOURCE:'.length);
            const shown = body.slice(0, body.indexOf('For each requirement'));
            //  The LAST substantial line of what it was shown — inside the
            //  counter's window, which only the BATCH slice reaches. A
            //  `shownFor` recomputed for req-7kjq alone would not contain it.
            const lines = shown.split('\n').filter(l => l.trim().length >= 24);
            const quoted = lines[lines.length - 1];
            return JSON.stringify({
                verdicts: [
                    { id: 'req-7kjq', verdict: 'met', evidence: quoted, why: 'quoted from what I was shown' },
                    { id: 'req-cnhh', verdict: 'unprovable', evidence: '', why: 'x' },
                ],
            });
        });
        const ing = judged.find(j => j.id === 'req-7kjq');
        expect(ing!.verdict).toBe('met');
    });

    it('⛔ NEGATIVE — a "met" quoting a line that is in NO window is still refused', async () => {
        //  The fix must not buy its green by trusting the judge. An invented
        //  line stays unprovable — the enforcement this file exists to keep.
        const judged = await verifyNamed(REQS, BIG, false, async () =>
            JSON.stringify({
                verdicts: [
                    { id: 'req-7kjq', verdict: 'met', evidence: 'export function PrintButton() { window.print(); }', why: 'invented' },
                    { id: 'req-cnhh', verdict: 'unprovable', evidence: '', why: 'x' },
                ],
            }));
        const ing = judged.find(j => j.id === 'req-7kjq');
        expect(ing!.verdict).toBe('unprovable');
        expect(ing!.why).toContain('evidence is not in the source');
    });

    it('⛔ POSITIVE — the per-requirement fallback is sliced too, not just the batch', async () => {
        //  ⛔ REPAIRING ONE CALL AND NOT THE OTHER LEAVES THE DEFECT INTACT
        //  WHILE LOOKING FIXED — and the fallback is the road taken exactly
        //  when the mesh is degraded, which is when the owner is watching.
        //  A batch that answers nobody sends every requirement down it.
        const prompts: string[] = [];
        await verifyNamed(REQS, BIG, false, async (p: string) => {
            prompts.push(p);
            return prompts.length === 1 ? 'not json at all' : JSON.stringify({ verdicts: [] });
        });
        expect(prompts.length).toBe(1 + REQS.length);
        for (const p of prompts.slice(1)) {
            expect(p.length).toBeLessThan(BIG.length);
            expect(p).not.toContain('distantHeadMarkerNobodyAskedAbout');
        }
    });

    it('NEGATIVE — the batch slice stays inside the cap it exists to respect', () => {
        //  A union of five requirements' windows must not quietly reintroduce
        //  the 68000-character prompt that made the judge return nothing.
        //  Read from the constant, so raising the ceiling cannot leave a guard
        //  behind asserting the old one — the ceiling moved once already.
        expect(BIG.length).toBeGreaterThan(MAX_SOURCE_CHARS);
        expect(sliceForMany(REQS, BIG).length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
        //  And a source that already fits is passed through whole — no slice
        //  marks, no windows, nothing for a judge to call "cut".
        const SMALL = INGREDIENTS_SRC + COUNTER_SRC;
        expect(SMALL.length).toBeLessThan(MAX_SOURCE_CHARS);
        expect(sliceForMany(REQS, SMALL)).toBe(SMALL);
    });
});
