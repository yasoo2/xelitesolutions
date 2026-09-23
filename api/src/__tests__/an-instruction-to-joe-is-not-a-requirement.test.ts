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
import { acceptanceFor } from '../core/quality/acceptance';

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
            'then one final full verification. Report which checks ran',
            'Run focused checks, then one final verification',
            'inspect the result in the browser. Do not deploy anything.',
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

    it('NEGATIVE — procedural noun phrases are not acceptance criteria', () => {
        for (const t of [
            'to build it and run the preview',
            'to test it in the browser on the phone and desktop',
            'an exploratory test',
            'to check the fields with correct and incorrect values',
            'to press the buttons',
            'to observe visual errors, the console, and the network',
            'to fix any real problems before the report',
            'قم باختبار الصفحة في المتصفح',
            'يجب فحص الحقول',
        ]) {
            expect({ t, judgeable: isJudgeable(t) }).toEqual({ t, judgeable: false });
        }
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

    it('rejects execution instructions even when the model paraphrases their text', async () => {
        const request = [
            'Build a library checkout board with borrower and due date.',
            'Report which checks ran and which were reused.',
            'Open and inspect the result in the browser.',
            'Do not deploy anything.',
        ].join(' ');
        const r = await namedRequirements(request, false, async () => JSON.stringify({
            requirements: [
                { text: 'borrower', quote: 'borrower' },
                { text: 'which checks ran and which were reused', quote: 'Report which checks ran and which were reused' },
                { text: 'browser inspection of the result', quote: 'Open and inspect the result in the browser' },
                { text: 'no deployment', quote: 'Do not deploy anything' },
            ],
        }));
        expect(r.requirements.map(x => x.text)).toEqual(['borrower']);
        expect(r.rejected).toHaveLength(3);
        expect(r.rejected.every(x => x.reason.includes('an instruction to me'))).toBe(true);
    });

    it('does not promote the project subject or a run instruction into named acceptance', async () => {
        const request = [
            'Create a compact browser-based reading queue with title and reader.',
            'Run focused checks, then one final verification.',
        ].join(' ');
        const r = await namedRequirements(request, false, async () => JSON.stringify({
            requirements: [
                { text: 'a compact browser-based reading queue', quote: 'Create a compact browser-based reading queue' },
                { text: 'title', quote: 'title' },
                { text: 'Run focused checks, then one final verification', quote: 'Run focused checks, then one final verification' },
            ],
        }));
        expect(r.requirements.map(item => item.text)).toEqual(['title']);
        expect(r.rejected.map(item => item.reason)).toEqual([
            expect.stringContaining('thing you asked for'),
            expect.stringContaining('instruction to me'),
        ]);
    });

    it('keeps test and deployment instructions out of the product acceptance contract', async () => {
        const request = [
            'Build a library board with borrower and due date.',
            'Use focused checks while editing, then one final full verification.',
            'Do not deploy anything.',
        ].join(' ');
        const r = await namedRequirements(request, false, async () => JSON.stringify({
            requirements: [
                { text: 'borrower and due date', quote: 'borrower and due date' },
                { text: 'Use focused checks while editing, then one final full verification', quote: 'Use focused checks while editing, then one final full verification' },
                { text: 'then one final full verification', quote: 'then one final full verification' },
            ],
        }));
        expect(r.requirements.map(x => x.text)).toEqual(['borrower and due date']);
        expect(acceptanceFor(request).filter(c => c.expectedRule).map(c => c.expectedRule?.text)).not.toContain('Do not deploy anything');
    });

    it('keeps an Arabic no-publish instruction out while retaining the requested product work', () => {
        const request = 'ابنِ تطبيق مخزون عربي مع بحث وتصفية. لا تنشر شيئاً.';
        const criteria = acceptanceFor(request);
        expect(criteria.map(c => c.id)).toEqual(expect.arrayContaining(['search', 'filter', 'rtl']));
        expect(criteria.some(c => c.expectedRule?.text === 'لا تنشر شيئاً')).toBe(false);
    });

    it('preserves product constraints expressed as imperatives, verbatim or paraphrased', async () => {
        const requirements = [
            { text: 'record deletion restricted to its owner', quote: "Ensure users cannot delete another user's records" },
            { text: 'nonnegative amounts', quote: 'Do not allow negative amounts' },
            { text: 'deletion confirmation', quote: 'Confirm deletion before removing a record' },
            { text: 'duplicate prevention', quote: 'Avoid duplicate reservations' },
            { text: 'required email validation', quote: 'Make sure email is valid before saving' },
            { text: 'external links open in a new tab', quote: 'Open external links in a new tab' },
            { text: 'booking availability validation', quote: 'Check availability before confirming a booking' },
            { text: 'keyboard form submission', quote: 'Submit the form when Enter is pressed' },
            { text: 'record reload after saving', quote: 'Refresh the records after saving' },
        ];
        const request = requirements.map(r => r.quote).join('. ');
        for (const paraphrased of [true, false]) {
            const entries = requirements.map(r => ({ ...r, text: paraphrased ? r.text : r.quote }));
            const result = await namedRequirements(request, false, async () => JSON.stringify({ requirements: entries }));
            expect(result.requirements.map(r => r.text)).toEqual(entries.map(r => r.text));
            expect(result.rejected).toEqual([]);
        }
    });

    it('still excludes explicit builder workflow behind ambiguous prefixes', () => {
        for (const text of [
            'Ensure all tests pass', 'Confirm the final verification result',
            'Make sure you inspect the result', 'Do not deploy anything',
            'Avoid claiming success', 'Skip the tests',
        ]) {
            expect({ text, judgeable: isJudgeable(text) }).toEqual({ text, judgeable: false });
        }
    });
});
