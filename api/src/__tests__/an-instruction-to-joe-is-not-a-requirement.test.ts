/**
 * HIS PROMPT TOLD JOE HOW TO WORK, AND JOE COUNTED IT AS THINGS TO BUILD.
 *
 * Seen on the owner's own screen, in his own Logs panel, from a prompt he wrote
 * himself — copied out of the running interface, not reconstructed:
 *
 *     ?? Actually use the browser — I did not inspect it
 *     ?? OPEN — ?? NAVIGATE — ?? CLICK — ?? TYPE — ?? SUBMIT — ?? OBSERVE
 *     ?? INSPECT — ?? FIND PROBLEM — ?? FIX — ?? RELOAD — ?? TEST AGAIN — ?? VERIFY
 *     ?? Number of browser actions performed — ?? Pages tested — ?? Forms tested
 *     ?? Buttons tested — ?? Errors discovered — ?? Errors fixed
 *
 *     Error: delivery_acceptance_unmapped:req-j47i,req-k0k7,req-el2o,req-hktl,
 *       req-hmho,req-14y,req-7gz5,req-jz53,req-c89t,req-2t10,req-7g7q,req-a1uj,req-dzpk
 *
 * Twenty-odd acceptance criteria, not one of them a thing the built site can
 * HAVE, and fourteen ids flooding the delivery layer.
 *
 * ⛔ THE DISTINCTION IS CLEAN AND WAS NOT ENCODED: a requirement is something
 * the ARTEFACT has; «CLICK» is something JOE does. `isJudgeable` refused the
 * subject of the request — `build a website`, «متجر مجوهرات فاخر» — and had
 * nothing to say about an instruction addressed to the builder itself.
 *
 * ⛔ AND NOTE WHERE IT WAS FOUND. Every prompt tested all night, mine and the
 * gate's, was a clean five-clause build request. **The owner writes real
 * prompts with real procedural preambles, and this defect exists only there.**
 * No unit guard could have produced its shape — watching him use it did. That
 * is twice in one day that his own usage found what neither instrument was
 * looking for, and the standing lesson is that our test prompts are too clean
 * to be evidence.
 */

import { isJudgeable, namedRequirements } from '../core/quality/named-requirements';

/** His actual prompt, in the shape he writes them. */
const HIS = [
    'IMPORTANT:',
    'Do not merely tell me that the browser works.',
    'Actually use the browser.',
    'I want to see real browser interaction:',
    'OPEN → NAVIGATE → CLICK → TYPE → SUBMIT → OBSERVE → INSPECT → FIND PROBLEM → FIX → RELOAD → TEST AGAIN → VERIFY',
    'At the end, provide a concise report containing:',
    'Number of browser actions performed, Pages tested, Forms tested, Buttons tested',
    '',
    'Build a simple web-based Online Shopping Research Assistant with a product list and a compare button.',
].join('\n');

describe('an instruction to Joe is not a requirement of the project', () => {
    it('⛔ NEGATIVE — every line from his Logs panel is refused', () => {
        //  Verbatim from the running interface. These are the exact strings
        //  that became acceptance criteria on his machine.
        for (const t of [
            'Actually use the browser', 'OPEN', 'NAVIGATE', 'CLICK', 'TYPE', 'SUBMIT',
            'OBSERVE', 'INSPECT', 'FIND PROBLEM', 'FIX', 'RELOAD', 'TEST AGAIN', 'VERIFY',
            'Number of browser actions performed', 'Pages tested', 'Forms tested',
            'Buttons tested', 'Errors discovered', 'Errors fixed', 'Final verification result',
            'Do not claim success based only on code inspection',
        ]) {
            expect({ t, judgeable: isJudgeable(t) }).toEqual({ t, judgeable: false });
        }
    });

    it('⛔ POSITIVE — and the actual product requirements still pass', () => {
        //  The line that must not move. A filter wide enough to swallow «a
        //  compare button» would cost him the very things he asked for, which
        //  is a worse failure than the one being fixed and a silent one.
        for (const t of [
            'a product list', 'a compare button', 'a booking form', 'opening hours',
            'a service list with prices', 'a phone CTA', 'سلة مشتريات', 'صفحة منتجات',
        ]) {
            expect({ t, judgeable: isJudgeable(t) }).toEqual({ t, judgeable: true });
        }
    });

    it('⛔ NEGATIVE — «test the API» is an instruction; «a test page» is not', () => {
        //  The boundary case. The verb opening the phrase is what addresses
        //  Joe; the same word inside a noun phrase describes an artefact.
        expect(isJudgeable('Test the API before delivering')).toBe(false);
        expect(isJudgeable('a test page for the staging build')).toBe(true);
        expect(isJudgeable('Verify the counter increments')).toBe(false);
        expect(isJudgeable('a verified badge on each product')).toBe(true);
    });

    it('⛔ the refusal names WHICH mistake, because they are two different ones', async () => {
        //  «you asked me to do this» and «this is the thing you asked for» are
        //  different errors in his sentence, and he can only correct the one he
        //  is told about.
        const r = await namedRequirements(HIS, false, async () => JSON.stringify({
            requirements: [
                { text: 'CLICK', quote: 'CLICK' },
                { text: 'build a simple web-based Online Shopping Research Assistant', quote: 'Build a simple web-based Online Shopping Research Assistant' },
                { text: 'a product list', quote: 'a product list' },
                { text: 'a compare button', quote: 'a compare button' },
            ],
        }));
        expect(r.requirements.map(x => x.text)).toEqual(['a product list', 'a compare button']);
        const why = Object.fromEntries(r.rejected.map(x => [x.text, x.reason]));
        expect(why['CLICK']).toContain('an instruction to me');
        expect(why['build a simple web-based Online Shopping Research Assistant'])
            .toContain('the thing you asked for');
    });

    it('NEGATIVE — a preamble of pure instructions yields an empty, honest reading', async () => {
        //  Not a crash, not a catalogue fallback dressed as success: nothing
        //  nameable, said plainly, with every refusal listed.
        const r = await namedRequirements(HIS, false, async () => JSON.stringify({
            requirements: [{ text: 'OPEN', quote: 'OPEN' }, { text: 'VERIFY', quote: 'VERIFY' }],
        }));
        expect(r.requirements).toEqual([]);
        expect(r.rejected.length).toBe(2);
        expect(r.rejected.every(x => x.reason.includes('an instruction to me'))).toBe(true);
    });
});
