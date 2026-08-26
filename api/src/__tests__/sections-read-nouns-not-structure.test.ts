/**
 * «A QUANDLE LIST WITH VORPS» IS STILL A LIST.
 *
 * A binding condition was put to this fix: replace every known noun in the
 * reference prompt with an invented word and prove the sections come out of
 * the same structural path, not out of a memorised vocabulary. It was
 * measured, and the fix failed it:
 *
 *   REAL  service list with prices, opening hours, location, phone CTA,
 *         booking form              ->  Hero · Location · Products · Cta · Contact
 *   FAKE  quandle list with vorps, plimming hours, drazak, phone CTA,
 *         snarfing form             ->  the fixed eight, none of them his
 *
 * And the limit was wider than the challenge said. The invented sentence
 * still carried «list», «hours», «CTA» and «form» — every one of them
 * STRUCTURAL — and not one was read. Joe was reading the names of sections,
 * never the shape of the sentence.
 *
 * THE DISTINCTION THAT MAKES THIS FIXABLE WITHOUT A CATALOGUE:
 *
 *   «coffee» -> brown            is a fact about a SUBJECT. Listing those is
 *                                the catalogue the fourth law forbids: the
 *                                next subject he names will not be on it.
 *
 *   «<anything> list»            is a fact about SHAPE. «list» does not name
 *                                what the thing is about; it names what form
 *                                it takes. That is grammar, and grammar is
 *                                finite in a way subjects are not.
 *
 * So the shape words are read, and the noun beside them is left alone — it
 * can be a service, a quandle, or a word he invents tomorrow, and the section
 * is a listing either way.
 *
 * The negative cases hold the line: a shape word must not be found inside a
 * longer word, a request that names no shape at all must still get a whole
 * page from its kind, and the real prompt must not lose anything it already
 * derived.
 */

import { sectionsForRequest, sectionsForKind } from '../modules/tools/definitions/ReactProjectTool';

const REAL = 'Build a responsive website for a neighborhood bicycle repair studio '
    + 'called Spoke & Stem. Include a service list with prices, opening hours, '
    + 'location, phone CTA, and a booking form.';

/** Every noun that names a SUBJECT replaced; every word that names a SHAPE kept. */
const FAKE = 'Build a responsive glorbix for a neighborhood zibbet frobnar studio '
    + 'called Spoke & Stem. Include a quandle list with vorps, plimming hours, '
    + 'drazak, phone CTA, and a snarfing form.';

describe('the shape of the sentence is read, not the names in it', () => {
    it('POSITIVE — invented nouns still yield the shapes he asked for', () => {
        const s = sectionsForRequest(FAKE, 'landing');
        //  «quandle list» is a listing whatever a quandle is.
        expect(s.some(x => x === 'Products' || x === 'Menu')).toBe(true);
        //  «plimming hours» is still hours.
        expect(s).toContain('Location');
    });

    it('POSITIVE — and the fixed eight are no longer imposed on it', () => {
        const s = sectionsForRequest(FAKE, 'landing');
        for (const unasked of ['Team', 'Testimonials', 'Stats']) {
            expect({ unasked, present: s.includes(unasked) }).toEqual({ unasked, present: false });
        }
    });

    it('POSITIVE — the Arabic shape words read the same way', () => {
        //  «قائمة» and «نموذج» and «ساعات» name shapes, not subjects.
        const s = sectionsForRequest(
            'اعمل لي موقع فيه قائمة زقنبوت بأسعارها وساعات الفرقعة ونموذج طنجرة', 'landing');
        expect(s.some(x => x === 'Products' || x === 'Menu')).toBe(true);
        expect(s).toContain('Location');
        expect(s).not.toContain('Testimonials');
    });

    it('NEGATIVE — the real prompt loses nothing it already derived', () => {
        const s = sectionsForRequest(REAL, 'landing');
        expect(s.some(x => x === 'Products' || x === 'Menu')).toBe(true);
        expect(s).toContain('Location');
        expect(s[0]).toBe('Hero');
    });

    it('NEGATIVE — a request naming no shape at all still gets a whole page', () => {
        //  Reading shapes must not turn silence into a bare page. That is the
        //  same defect from the other side.
        expect(sectionsForRequest('اعمل لي موقع لمطعم إيطالي اسمه لا بيلا', 'restaurant'))
            .toEqual(sectionsForKind('restaurant'));
    });

    it('NEGATIVE — a shape word is not found inside a longer word', () => {
        //  «list» lives inside «listen» and «realistic»; «form» inside
        //  «information» and «performance»; «ساعات» must not be found by a
        //  bare «ساعة» either. Arabic has no \b, so this is the trap this
        //  repository has closed five times.
        const s = sectionsForRequest(
            'build a landing page about performance information and listening habits', 'landing');
        expect(s).toEqual(sectionsForKind('landing'));
    });
});
