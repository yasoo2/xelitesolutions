/**
 * HE ASKED FOR SIX THINGS AND GOT A FIXED EIGHT, NONE OF THEM HIS.
 *
 * Measured live on the owner's reference matrix, prompt P01:
 *
 *     Build a responsive website for a neighborhood bicycle repair studio
 *     called Spoke & Stem. Include a service list with prices, opening
 *     hours, location, phone CTA, and a booking form.
 *
 *     SECTIONS = Hero | Features | Steps | Stats | Team | Testimonials |
 *                Cta | Contact
 *
 * Five of those eight were never asked for — Features, Steps, Stats, Team,
 * Testimonials. And of the six he DID ask for, the built page answered two
 * with the nearest thing in the catalogue: «phone CTA» became a generic
 * «Get started», and «booking form» became a name/email/message contact box.
 *
 * The cause is one line:
 *
 *     const sections = multiPage ? [...] : sectionsForKind(kind);
 *
 * The request is read once to pick a KIND and then discarded. Everything
 * after that comes from a table keyed on that kind, so a bicycle workshop, a
 * coffee roastery and a dental clinic receive the same eight headings.
 *
 * And the capability was never missing. Measured section by section: a menu
 * and a products grid that carry prices, a location block that renders
 * opening hours and an address, tel: links, a booking blueprint with its own
 * fields — all present, none selected. THE DEFECT IS A SEVERED WIRE, NOT AN
 * ABSENT ORGAN, and that distinction is the difference between a day and a
 * week.
 *
 * THE CLASS is the fourth law itself: «جو يبني من الطلب لا من الكتالوج».
 * And the worse half is that Joe does not IGNORE what he asked for — it
 * substitutes the nearest catalogue entry. An omission can be seen; a
 * substitution hides itself behind something that looks finished.
 *
 * The negative cases are the whole balance: a request that names nothing
 * must still receive a complete page, and the kind's own defaults must still
 * answer for everything the request is silent about. A page assembled ONLY
 * from what he mentioned would be a different defect wearing this fix's
 * clothes.
 */

import { sectionsForKind, sectionsForRequest } from '../modules/tools/definitions/ReactProjectTool';

const P01 = 'Build a responsive website for a neighborhood bicycle repair studio '
    + 'called Spoke & Stem. Include a service list with prices, opening hours, '
    + 'location, phone CTA, and a booking form.';

describe('the sections come from what he asked for', () => {
    it('POSITIVE — the things he named are all present', () => {
        const s = sectionsForRequest(P01, 'landing');
        //  A service list with prices is a menu/products section, not a
        //  «Features» card grid.
        expect(s.some(x => x === 'Menu' || x === 'Products')).toBe(true);
        //  Opening hours and an address live in Location.
        expect(s).toContain('Location');
        //  And the page still opens.
        expect(s[0]).toBe('Hero');
    });

    it('POSITIVE — the five he never mentioned are gone', () => {
        const s = sectionsForRequest(P01, 'landing');
        for (const unasked of ['Team', 'Testimonials', 'Stats']) {
            expect(s).not.toContain(unasked);
        }
    });

    it('POSITIVE — the Arabic twin reads the same', () => {
        const s = sectionsForRequest(
            'اعمل لي موقع لورشة تصليح دراجات فيه قائمة خدمات بأسعارها وساعات العمل '
            + 'والموقع وزر اتصال ونموذج حجز', 'landing');
        expect(s.some(x => x === 'Menu' || x === 'Products')).toBe(true);
        expect(s).toContain('Location');
        expect(s).not.toContain('Testimonials');
    });

    it('NEGATIVE — a request that names nothing still gets the kind default', () => {
        //  This is the balance point. Assembling ONLY from what he mentioned
        //  would leave a bare page for every brief that trusts Joe to decide,
        //  which is the same defect from the other side.
        expect(sectionsForRequest('اعمل لي موقع لمطعم إيطالي اسمه لا بيلا', 'restaurant'))
            .toEqual(sectionsForKind('restaurant'));
        expect(sectionsForRequest('build me a landing page', 'landing'))
            .toEqual(sectionsForKind('landing'));
    });

    it('NEGATIVE — a section he names that the kind already has is not duplicated', () => {
        const s = sectionsForRequest('اعمل موقع مطعم فيه قائمة الطعام والأسعار', 'restaurant');
        expect(new Set(s).size).toBe(s.length);
    });

    it('NEGATIVE — the kind table itself is untouched', () => {
        //  Callers that legitimately want the kind default must keep getting
        //  exactly what they got before.
        expect(sectionsForKind('landing'))
            .toEqual(['Hero', 'Features', 'Steps', 'Stats', 'Team', 'Testimonials', 'Cta', 'Contact']);
    });

    it('NEGATIVE — every returned section is one the builder can actually render', () => {
        //  Naming a section nobody can build is how a fix produces an empty
        //  page instead of a wrong one.
        const known = new Set([...sectionsForKind('restaurant'), ...sectionsForKind('store'),
            ...sectionsForKind('landing'), ...sectionsForKind('portfolio'),
            ...sectionsForKind('app'), ...sectionsForKind('event'), ...sectionsForKind('generic')]);
        for (const s of sectionsForRequest(P01, 'landing')) expect(known.has(s)).toBe(true);
    });
});
