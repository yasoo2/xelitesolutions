/**
 * THE SAME SENTENCE, THE SAME CODE, READ FIVE ONE TIME AND ONE THE NEXT.
 *
 * Measured twice on the owner's machine, hours apart, on the identical request:
 *
 *     read from your request: 5 named — a service list with prices · opening
 *       hours · location · phone CTA · a booking form
 *     read from your request: 1 named — a service list with prices
 *
 * ⛔ AND IT WAS NOT THE FILTER. Every rejection this reader makes is printed by
 * name; the regressed run printed exactly one, the same one as the good run.
 * Four swallowed requirements would have printed four refusals. And `git diff`
 * showed `extractionPrompt`, `isJudgeable`, `groundedIn` and
 * `parseRequirements` byte-identical between the two builds.
 *
 * **The model simply never returned them.** The reader is not weak — it is
 * UNSTABLE: the same question answered differently on consecutive asks. A
 * single call to a nondeterministic source is a sample, not a measurement, and
 * this whole layer exists because a ledger can be no better than the reading it
 * is handed.
 *
 * ⛔ THE REPAIR RELAXES NOTHING. Every candidate from every pass still has to be
 * judgeable and still has to be quoted from HIS sentence. Asking twice widens
 * what is SEEN, never what is ADMITTED — nothing invented can enter through a
 * second door that could not enter through the first. That is the property the
 * negatives below exist to hold, because a union is exactly where a guard gets
 * quietly loosened to make the numbers look better.
 */

import { namedRequirements } from '../core/quality/named-requirements';

const HIS = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

const FIVE = [
    { text: 'a service list with prices', quote: 'a service list with prices' },
    { text: 'opening hours', quote: 'opening hours' },
    { text: 'location', quote: 'location' },
    { text: 'a phone CTA', quote: 'phone CTA' },
    { text: 'a booking form', quote: 'a booking form' },
];

/** The measured failure: one pass reads everything, the next reads almost nothing. */
const unstable = (...payloads: any[]) => {
    let n = 0;
    return async () => JSON.stringify(payloads[Math.min(n++, payloads.length - 1)]);
};

describe('an unstable reader is asked more than once', () => {
    it('⛔ POSITIVE — a pass that reads one and a pass that reads five union to five', async () => {
        //  The exact shape measured on his machine, in the order it happened.
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: [FIVE[0]] },
            { requirements: FIVE },
        ));
        expect(r.requirements.map(x => x.text)).toEqual(FIVE.map(x => x.text));
        expect(r.passes).toBe(2);
    });

    it('⛔ POSITIVE — and in the other order, because instability has no order', async () => {
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: FIVE },
            { requirements: [FIVE[0]] },
        ));
        expect(r.requirements.length).toBe(5);
    });

    it('⛔ POSITIVE — two partial readings recover what neither saw alone', async () => {
        //  Neither pass is complete. This is the case a single call can never
        //  reach, and the reason the repair is a union rather than a retry.
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: [FIVE[0], FIVE[1]] },
            { requirements: [FIVE[2], FIVE[3], FIVE[4]] },
        ));
        expect(r.requirements.map(x => x.text).sort()).toEqual(FIVE.map(x => x.text).sort());
    });

    it('⛔ NEGATIVE — the second pass admits NOTHING the first could not', async () => {
        //  The property that matters. A union is exactly where a guard gets
        //  quietly loosened so the count looks better, so: an invented
        //  requirement arriving only in pass two is refused by name, precisely
        //  as it would have been in pass one.
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: [FIVE[0]] },
            { requirements: [FIVE[0], { text: 'a customer login', quote: 'a customer login area' }] },
        ));
        expect(r.requirements.map(x => x.text)).toEqual(['a service list with prices']);
        expect(r.rejected.map(x => x.text)).toContain('a customer login');
    });

    it('⛔ NEGATIVE — and the scaffolding filter still fires on the second pass', async () => {
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: [FIVE[0]] },
            { requirements: [{ text: 'build a responsive website', quote: 'Build a responsive website' }] },
        ));
        expect(r.requirements.map(x => x.text)).toEqual(['a service list with prices']);
        expect(r.rejected[0].reason).toContain('not something it must do');
    });

    it('NEGATIVE — the same thing seen twice is counted once', async () => {
        //  Two passes that agree must not double the denominator. A count that
        //  grows with the number of asks measures the asking, not the request.
        const r = await namedRequirements(HIS, false, unstable(
            { requirements: FIVE },
            { requirements: FIVE },
        ));
        expect(r.requirements.length).toBe(5);
    });

    it('⛔ NEGATIVE — one dead pass does not lose the reading', async () => {
        //  A provider that drops one call in two would otherwise take the whole
        //  request down with it — the failure this repair exists to survive.
        let n = 0;
        const r = await namedRequirements(HIS, false, async () => {
            n += 1;
            if (n === 1) throw new Error('provider hiccup');
            return JSON.stringify({ requirements: FIVE });
        });
        expect(r.requirements.length).toBe(5);
        expect(r.passes).toBe(1);
    });

    it('⛔ NEGATIVE — every pass dead is still an honest nothing', async () => {
        //  Certifies nothing, condemns nothing, and says which provider error
        //  it was — the rule this file has held all along.
        const r = await namedRequirements(HIS, false, async () => { throw new Error('all providers unavailable'); });
        expect(r.requirements).toEqual([]);
        expect(r.rejected[0].reason).toContain('could not be reached');
    });
});
