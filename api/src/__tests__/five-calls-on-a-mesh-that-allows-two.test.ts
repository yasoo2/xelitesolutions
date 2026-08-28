/**
 * FIVE CALLS ON A MESH THAT ALLOWS TWO.
 *
 * The whole chain of his complaints traces to one line on his own screen:
 *
 *     acceptance denominator: 5 (known-features list — your request was not read)
 *
 * ⛔ AND IT WAS FALSE. Measured against the real model, on his machine:
 *
 *     READ: 5 named in 2 call(s)
 *       «a hero with the dish name» · «an ingredients list» ·
 *       «a numbered steps list» · «a servings counter…» · «a print button»
 *       rejected: 0, in 1226ms
 *
 * **His request was read perfectly, five out of five.** What failed was the
 * stage after it:
 *
 *     [LLM7] rate-limited (429). Cooling down 59s
 *     Pollinations Chat Failed: 402 … 429
 *     VERIFY: 5 verdicts in 33553ms   blind=true
 *       [unprovable] × 5 — the model returned no verdict for this item
 *
 * `verifyNamed` spends ONE CALL PER REQUIREMENT, on top of the reader's two.
 * Seven calls on a free mesh that rate-limits after about two. So the ledger
 * fell back to the known-features list, and the sentence he was shown blamed
 * the reader for a failure one stage further on — sending him to rewrite a
 * request that was never the problem.
 *
 * ⛔ THE ONE-AT-A-TIME DESIGN IS NOT WRONG, AND ITS COMMENT SAYS WHY: a brain
 * that can answer three of five DOES, instead of one malformed answer taking
 * all five down. That reasoning was measured and it stands. What it assumed is
 * that a call is AVAILABLE.
 *
 * So one call is tried first, and the per-requirement road is kept for exactly
 * the requirements that call did not answer. Nothing about the isolation is
 * given up: a malformed batch answers nobody and everything takes the old road.
 *
 * ⛔ AND WHAT THE LIVE RE-MEASUREMENT ACTUALLY SHOWED, published because the
 * numbers alone would read as a clean win:
 *
 *     VERIFY: 5 verdicts in 35147ms using 6 call(s)  blind=false
 *
 * `blind` went from true to false — the ledger is judged from his words again.
 * **But the batch call was itself rate-limited**, so it produced nothing and
 * cost one extra call; the two verdicts that got through came from the
 * fallback. On a healthy mesh this is one call instead of five. On the mesh he
 * is actually on, it is six instead of five, and the real ceiling is
 * elsewhere: his machine has a local brain with no quota at all, and the
 * router reaches for the keyless remote mesh before it. That is the next
 * repair, and it is named here rather than claimed as done.
 */

import fs from 'fs';
import path from 'path';
import { verifyNamed } from '../core/quality/named-requirements';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'named-requirements.ts'), 'utf-8',
);
const CODE = SRC.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const reqs = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `req-${i}`,
    text: `a widget number ${i}`,
})) as any;

/** A source that contains every requirement's words, so slicing cannot hide them. */
const source = Array.from({ length: 5 }, (_, i) => `a widget number ${i} lives here`).join('\n');

describe('the judge asks once before it asks five times', () => {
    it('⛔ POSITIVE — one call answers all of them, and no more are spent', async () => {
        //  The whole point: on a healthy brain this is a single call.
        let calls = 0;
        const answers = reqs(5).map((r: any) => ({
            id: r.id, verdict: 'met', evidence: `a widget number ${r.id.slice(4)} lives here`, why: 'present',
        }));
        const call = async () => { calls++; return JSON.stringify({ verdicts: answers }); };
        const out = await verifyNamed(reqs(5), source, false, call);
        expect(calls).toBe(1);
        expect(out.map(v => v.verdict)).toEqual(['met', 'met', 'met', 'met', 'met']);
    });

    it('⛔ POSITIVE — what the batch missed still gets its own call', async () => {
        //  The isolation the original design bought is not given up. Two
        //  answered in the batch, three did not, so three calls follow — not
        //  five, and not zero.
        let calls = 0;
        const call = async (prompt: string) => {
            calls++;
            if (calls === 1) {
                return JSON.stringify({
                    verdicts: [
                        { id: 'req-0', verdict: 'met', evidence: 'a widget number 0 lives here', why: 'present' },
                        { id: 'req-1', verdict: 'met', evidence: 'a widget number 1 lives here', why: 'present' },
                    ],
                });
            }
            const id = (prompt.match(/req-\d/) || [''])[0];
            return JSON.stringify({ id, verdict: 'met', evidence: `a widget number ${id.slice(4)} lives here`, why: 'present' });
        };
        const out = await verifyNamed(reqs(5), source, false, call);
        expect(calls).toBe(4);
        expect(out.filter(v => v.verdict === 'met')).toHaveLength(5);
    });

    it('⛔ NEGATIVE — a batch that throws costs nothing but one call', async () => {
        //  A malformed or refused batch must answer nobody, and every
        //  requirement must take the road it always took.
        let calls = 0;
        const call = async (prompt: string) => {
            calls++;
            if (calls === 1) throw new Error('rate-limited (429)');
            const id = (prompt.match(/req-\d/) || [''])[0];
            return JSON.stringify({ id, verdict: 'met', evidence: `a widget number ${id.slice(4)} lives here`, why: 'present' });
        };
        const out = await verifyNamed(reqs(5), source, false, call);
        expect(calls).toBe(6);
        expect(out.filter(v => v.verdict === 'met')).toHaveLength(5);
    });

    it('⛔ NEGATIVE — a single requirement is never batched', async () => {
        //  One requirement in a "batch" is the same call twice. The guard is
        //  cheap and the waste would be permanent.
        let calls = 0;
        const call = async () => {
            calls++;
            return JSON.stringify({ id: 'req-0', verdict: 'met', evidence: 'a widget number 0 lives here', why: 'present' });
        };
        await verifyNamed(reqs(1), source, false, call);
        expect(calls).toBe(1);
    });

    it('⛔ NEGATIVE — a verdict from the batch that names nobody is refused', async () => {
        //  Cross-attribution is the one thing worse than an empty line: the
        //  ledger stays full and starts lying about WHICH thing was proven.
        //  The batch path enforces the same id rule as the single path.
        expect(CODE).toContain('if (v.id && reqs.some(r => r.id === v.id)) fromBatch.set(v.id, v);');
    });

    it('⛔ NEGATIVE — «could not be reached» still means NOTHING got through', async () => {
        //  A batch that succeeded must stop the run being reported as an
        //  unreachable provider, or a working brain is blamed for a silence
        //  that did not happen.
        expect(CODE).toContain('if (!fromBatch.size && !answers.some(a => !a.error)) {');
    });
});
