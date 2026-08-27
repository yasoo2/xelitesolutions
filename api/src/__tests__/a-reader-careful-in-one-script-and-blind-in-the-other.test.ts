/**
 * THE SAME SENTENCE DERIVED A REQUIREMENT IN ARABIC AND NOTHING IN ENGLISH.
 *
 * From a real run that blocked a delivery. The owner's request:
 *
 *     Build a responsive website for a neighborhood bicycle repair studio
 *     called Spoke & Stem. Include a service list with prices, opening hours,
 *     location, phone CTA, and a booking form.
 *
 *     acceptanceFor(request) -> criteria: []
 *
 * A service list WITH PRICES, opening hours, a location, a phone CTA and a
 * booking form — and the ledger derived nothing, so it could prove nothing,
 * so the delivery was refused for having no proven criteria.
 *
 * Measured down to the character:
 *
 *     saysAny('add a phone cta', ['cta'])    -> true
 *     saysAny('add a phone CTA', ['cta'])    -> false
 *     saysAny('a button here',  ['button'])  -> true
 *     saysAny('a BUTTON here',  ['button'])  -> false
 *
 * He had capitalised CTA.
 *
 * ⛔ THE CLASS is one this repository already records — a requirement read in
 * one inflection and named in one language. `normalise()` folds hamzas, alef
 * maqsura and taa marbuta so that two spellings of one Arabic word read alike.
 * The Latin side folded NOTHING, so «CTA» and «cta» were two different words.
 * Seven catalogue entries were moved onto that reader, and every one of them
 * silently stopped seeing capitalised English the day it moved.
 *
 * The repair belongs beside the other foldings, not at the call sites: a
 * caller that must remember to lowercase is a caller that will forget, and six
 * of the seven already had.
 */

import { saysAny, saysWord } from '../core/language/arabic';
import { acceptanceFor } from '../core/quality/acceptance';

const HIS = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

describe('the word reader is as careful in Latin as it is in Arabic', () => {
    it('⛔ POSITIVE — his own request now derives a criterion', () => {
        expect(acceptanceFor(HIS).length).toBeGreaterThan(0);
        expect(acceptanceFor(HIS).map(c => c.id)).toContain('button');
    });

    it('⛔ POSITIVE — the four measurements that named the defect', () => {
        expect({
            lower: saysAny('add a phone cta', ['cta']),
            upper: saysAny('add a phone CTA', ['cta']),
            word_lower: saysAny('a button here', ['button']),
            word_upper: saysAny('a BUTTON here', ['button']),
        }).toEqual({ lower: true, upper: true, word_lower: true, word_upper: true });
    });

    it('POSITIVE — mixed case reads the same as either', () => {
        expect(saysAny('a Cta and a Button', ['cta'])).toBe(true);
        expect(saysWord('The Booking Form', 'booking')).toBe(true);
    });

    it('POSITIVE — and the candidate side folds too, not only the text', () => {
        //  A catalogue entry written as 'CTA' must read the same as one
        //  written 'cta', or the defect simply moves to whoever writes the list.
        expect(saysAny('add a phone cta', ['CTA'])).toBe(true);
        expect(saysAny('add a phone CTA', ['CTA'])).toBe(true);
    });

    it('⛔ NEGATIVE — Arabic still reads exactly as it did', () => {
        //  The foldings that were already there must survive: this repair adds
        //  a Latin rule, it does not rewrite the Arabic ones.
        expect(saysAny('اعمل لي موقعاً فيه زر اتصال', ['زر'])).toBe(true);
        expect(saysAny('اعمل لي موقعاً فيه أزرار', ['زر', 'أزرار'])).toBe(true);
        expect(acceptanceFor('اعمل لي موقعاً فيه زر اتصال ونموذج حجز').map(c => c.id)).toContain('button');
    });

    it('NEGATIVE — and a word that is simply absent is still absent', () => {
        //  Case folding widens spelling, never meaning. If this passed, the
        //  reader would be answering yes to everything.
        expect(saysAny('a quiet page with a photograph', ['cta', 'button'])).toBe(false);
        expect(saysAny('صفحة هادئة فيها صورة', ['زر', 'أزرار'])).toBe(false);
    });

    it('NEGATIVE — a word merely CONTAINED in another is not that word', () => {
        //  «buttonhole» is not a button. Folding case must not become folding
        //  boundaries — that would trade a blind reader for a credulous one.
        expect(saysAny('a buttonhole stitch', ['button'])).toBe(false);
    });
});
