/**
 * A JUDGE SHOWN 27% OF A PROJECT SAID FIVE THINGS WERE ABSENT. ALL FIVE WERE
 * PRESENT.
 *
 * Measured on `react-spoke-stem-c66ce8a2` by grepping the built source rather
 * than believing the ledger:
 *
 *     full source    = 67522 chars
 *     bounded source = 17936 chars   (27%)
 *
 *     requirement                   in full   in head+tail   in ITS slice
 *     a service list with prices      yes        yes            yes
 *     opening hours                   yes        NO             yes
 *     location                        yes        yes            yes
 *     a phone CTA                     yes        NO             yes
 *     a booking form                  yes        yes            yes
 *
 * The two whose evidence the old slice cut away are exactly the two the judge
 * declared missing with confident, specific reasons: «The source does not
 * contain any CTA specifically for phone numbers» — while
 * `<a href={'tel:' + content.contact.phone}>` sat in the discarded 73%.
 *
 * ⛔ A HEAD-AND-TAIL SLICE IS BLIND BY CONSTRUCTION: it keeps the same 27%
 * whatever is being asked. The slice must be chosen FOR the question.
 *
 * ⛔ AND THE BRIEF ALREADY FORBADE THE GUESS. It says «the source above may be
 * CUT — if the part you need is missing, say unprovable rather than guessing».
 * The model did not obey. **An instruction is not an enforcement**, and this
 * repository spent a whole day proving a claim must be checked rather than
 * trusted — then leaned on a sentence in a prompt to hold the line.
 *
 * A false NEGATIVE is worse than a false positive here: it sends the reader
 * hunting a builder defect that does not exist. It sent me — I published «Joe
 * built a site with none of the five things he asked for» and had to withdraw
 * it after grepping the source myself.
 */

import {
    sliceFor,
    boundedSource,
    sliceCoversRequirement,
    verifyNamed,
    NamedRequirement,
} from '../core/quality/named-requirements';

/** A source big enough to be cut, with the evidence deliberately in the middle. */
const HEAD = 'import React from "react";\n'.repeat(600);
const MIDDLE = `
export function Contact() {
  return <a href={'tel:' + content.contact.phone}>Call the workshop</a>;
}
export function Hours() {
  return <p>Opening hours: Mon–Fri 9–6</p>;
}
`;
const TAIL = 'export const filler = 1;\n'.repeat(600);
const BIG = HEAD + MIDDLE + TAIL;

const PHONE: NamedRequirement = { id: 'req-p', text: 'a phone CTA', quote: 'phone CTA' };
const HOURS: NamedRequirement = { id: 'req-h', text: 'opening hours', quote: 'opening hours' };

describe('the slice is chosen for the question', () => {
    it('⛔ POSITIVE — evidence in the middle survives, where head+tail lost it', () => {
        //  The measured failure, reproduced: the old slice keeps the same
        //  fixed ends no matter what is asked, so anything central is gone.
        expect(BIG.length).toBeGreaterThan(20000);
        expect(boundedSource(BIG)).not.toContain("tel:");
        expect(sliceFor(PHONE, BIG)).toContain("tel:");
        expect(sliceFor(HOURS, BIG)).toContain('Opening hours');
    });

    it('POSITIVE — a source that fits is never cut at all', () => {
        expect(sliceFor(PHONE, MIDDLE)).toBe(MIDDLE);
    });

    it('POSITIVE — the slice stays within the budget', () => {
        //  Widening the window until everything fits would put us back at 68k
        //  in one prompt, which is where this began.
        expect(sliceFor(PHONE, BIG).length).toBeLessThanOrEqual(18_000);
    });

    it('NEGATIVE — a requirement whose words appear nowhere is reported as uncovered', () => {
        //  This is the fact the enforcement rests on, so it is asserted
        //  directly rather than inferred from a verdict.
        const ghost: NamedRequirement = { id: 'req-g', text: 'a wishlist', quote: 'a wishlist' };
        expect(sliceCoversRequirement(ghost, MIDDLE)).toBe(false);
        expect(sliceCoversRequirement(PHONE, MIDDLE)).toBe(true);
    });
});

describe('a cut cannot speak as an absence', () => {
    it('⛔ NEGATIVE — «not present» over an unshown slice becomes «I could not tell»', async () => {
        //  The enforcement. The model returns a confident absence; the code
        //  refuses to publish it, because none of the requirement's own words
        //  were in what the model actually saw.
        const ghost: NamedRequirement = { id: 'req-g', text: 'a wishlist', quote: 'a wishlist' };
        const judged = await verifyNamed([ghost], BIG, false, async () => JSON.stringify({
            'req-g': { met: false, evidence: '', why: 'The source does not contain a wishlist.' },
        }));
        expect(judged[0].verdict).toBe('unprovable');
        expect(judged[0].why).toContain('never shown');
    });

    it('⛔ POSITIVE — a real absence over a slice that DID cover it still stands', async () => {
        //  The enforcement must not swallow true findings. «booking» words
        //  appear nowhere in a source that has none — but when the source is
        //  small enough to be shown whole, the absence is real and reportable.
        const booking: NamedRequirement = { id: 'req-b', text: 'a booking form', quote: 'a booking form' };
        const small = 'export function Hero() { return <h1>Spoke &amp; Stem booking is closed</h1>; }';
        const judged = await verifyNamed([booking], small, false, async () => JSON.stringify({
            'req-b': { met: false, evidence: '', why: 'there is no form element anywhere' },
        }));
        expect(judged[0]).toMatchObject({ verdict: 'unmet', why: 'there is no form element anywhere' });
    });

    it('⛔ NEGATIVE — and a false «met» is still downgraded, as before', async () => {
        //  Both directions keep their guards. Fixing the negative side must not
        //  quietly loosen the positive one.
        const judged = await verifyNamed([PHONE], BIG, false, async () => JSON.stringify({
            'req-p': { met: true, evidence: '<a href="tel:+15550000000">Call now</a>', why: 'it is there' },
        }));
        expect(judged[0].verdict).toBe('unprovable');
        expect(judged[0].why).toContain('not in the source');
    });

    it('NEGATIVE — an uncut source reports absences normally', async () => {
        //  The enforcement is scoped to the case that caused it. When nothing
        //  was cut, a «not present» is exactly what it says.
        const judged = await verifyNamed([HOURS], MIDDLE.replace('Opening hours: Mon–Fri 9–6', 'nothing here'), false,
            async () => JSON.stringify({ 'req-h': { met: false, evidence: '', why: 'no hours anywhere' } }));
        expect(judged[0].verdict).toBe('unmet');
    });
});
