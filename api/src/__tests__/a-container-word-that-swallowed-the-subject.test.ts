/**
 * «متجر قهوة» IS PAINTED PURPLE. «coffee roastery» IS PAINTED BROWN.
 *
 * The owner showed a coffee storefront and asked why Joe cannot build one.
 * Measured before answering, on his own words and their English twin:
 *
 *     متجر قهوة مختصة محمصة        ->  hue 286   #b131d8   purple
 *     coffee roastery specialty     ->  hue  18   #bc5224   roasted brown
 *
 * The same shop, two languages, and only one of them gets coffee's colour.
 *
 * The cause is the ORDER of the sector table, and the first match winning:
 *
 *     [/متجر|تسوق|shop|store|ecommerce/  ->  246-292 ]   <- matches «متجر»
 *     [/مطعم|كافيه|قهوة|food|cafe|coffee/ ->    8-44  ]   <- never reached
 *
 * «متجر» says what FORM the thing takes. «قهوة» says what it is ABOUT. The
 * table asked which pattern matched first and got the form, and the English
 * sentence escaped only because it happens not to contain a form word — so
 * the defect is invisible in English and painted on every Arabic request.
 *
 * THE CLASS is the night's second, and its fifth appearance: A DECISION TAKEN
 * FROM A FRAGMENT WHEN THE AUTHORITY IS THE WHOLE REQUEST. It is also the
 * container trap already closed once in the page reader, where «صفحة» and
 * «قائمة» name the vessel and not the content — closed there, open here,
 * because closing an instance never closes the class.
 *
 * A container sector may only answer when NOTHING else in the request does.
 */

import { buildPalette, pickHue } from '../core/design/design-system';

describe('the subject names the colour, not the vessel it comes in', () => {
    it('POSITIVE — a coffee shop is coffee-coloured in Arabic, as it already was in English', () => {
        const ar = buildPalette('اعمل لي متجر قهوة مختصة ومحمصة');
        const en = buildPalette('build a coffee roastery shop with specialty beans');
        //  8-44 is the food/coffee band. Both languages must land inside it.
        expect(ar.hue).toBeGreaterThanOrEqual(8);
        expect(ar.hue).toBeLessThanOrEqual(44);
        expect(en.hue).toBeGreaterThanOrEqual(8);
        expect(en.hue).toBeLessThanOrEqual(44);
    });

    it('POSITIVE — every subject beats the container word that sits beside it', () => {
        //  One case is an anecdote. The claim is about the class, so it is
        //  asserted across the sectors the table actually carries.
        const cases: Array<[string, [number, number]]> = [
            //  ⛔ «متجر ورود» was here first and it was an INVENTED criterion:
            //  flowers name no sector this table carries, so falling to
            //  commerce is the correct answer, not the defect. A second
            //  case must be stricter than the first or it becomes
            //  invention — so it is replaced by a subject the table
            //  really knows.
            ['متجر مستحضرات تجميل', [312, 348]],   // beauty band
            ['متجر أدوية وعيادة', [150, 192]],        // health band
            ['متجر كتب ودورات تعليمية', [222, 268]],  // education band
            ['store selling medical supplies for a clinic', [150, 192]],
        ];
        for (const [request, [lo, hi]] of cases) {
            const h = pickHue(request);
            expect({ request, h }).toEqual({ request, h: expect.any(Number) });
            expect(h).toBeGreaterThanOrEqual(lo);
            expect(h).toBeLessThanOrEqual(hi);
        }
    });

    it('NEGATIVE — a shop that is ONLY a shop still gets the commerce colour', () => {
        //  The container sector is not deleted; it is demoted. A request that
        //  names no subject at all must still land in the commerce band, or
        //  the fix has thrown away a real answer to reach a better one.
        const h = pickHue('اعمل لي متجر إلكتروني للتسوق');
        expect(h).toBeGreaterThanOrEqual(246);
        expect(h).toBeLessThanOrEqual(292);
    });

    it('NEGATIVE — a colour he NAMED still outranks every sector', () => {
        //  «أزرق» means blue, exactly — and a shop-versus-subject rule must
        //  never come between him and a colour he asked for by name.
        const named = buildPalette('اعمل لي متجر قهوة بلون أزرق');
        expect(named.hue).toBeGreaterThan(190);
        expect(named.hue).toBeLessThan(260);
    });

    it('NEGATIVE — the same request still rebuilds the same colour', () => {
        expect(pickHue('اعمل لي متجر قهوة مختصة')).toBe(pickHue('اعمل لي متجر قهوة مختصة'));
    });
});
