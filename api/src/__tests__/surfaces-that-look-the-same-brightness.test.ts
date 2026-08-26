/**
 * EVERY SUBJECT GETS A DIFFERENT COLOUR AND THE SAME WASHED-OUT PAGE.
 *
 * The owner's words about what Joe produces: «every prompt designs the same
 * design and the same movements, in an old style, and it does not attract
 * users». The palette now follows the subject, and the page still reads flat.
 * Measured, on the hues Joe's own sector table lands on:
 *
 *     coffee     card=#fbf7f4   perceived L 0.9784
 *     clinic     card=#f4fbf9   perceived L 0.9823
 *     jewellery  card=#f9f4fb   perceived L 0.9730
 *     tech       card=#f4f6fb   perceived L 0.9730
 *         -> spread across subjects: 0.0093
 *
 * Two defects in those numbers.
 *
 * ONE — THEY ARE ALL NEARLY WHITE. The reference storefront the owner showed
 * grounds itself near 0.91: paper, not the absence of colour. Joe's surfaces
 * sit at 0.97-0.98, which is why every output reads pale whatever its subject.
 *
 * TWO — AND THEY ARE NOT EVEN THE SAME PALENESS. HSL lightness is a number,
 * not a perception: hsl(60,70%,50%) and hsl(240,70%,50%) carry the same L and
 * are nowhere near the same brightness to an eye. So one subject's page is
 * visibly brighter than another's while the code says they match, and nothing
 * in the source looks wrong.
 *
 * OKLCH's lightness IS perceptual by construction. Measured on the same hues,
 * same code path: spread 0.0017 — five and a half times tighter — and cards
 * that are visibly the subject's own paper. Contrast is not paid for it:
 * text on those cards measures above 15:1 either way.
 *
 * LAW SIX, AND ITS WARNING. A ready tool is mandatory when it is proven by
 * measurement, and reputation is not evidence. Three were measured before one
 * was adopted, and the best-known of them — Google's own colour utilities —
 * could not be imported at all: its dynamiccolor module requires a path with
 * no extension and Node's ESM resolver refuses it. culori imports, has zero
 * dependencies, and gave the numbers above.
 */

import { buildPalette, paletteCss } from '../core/design/design-system';

const { converter, wcagContrast } = require('culori');
const oklch = converter('oklch');

/** The hues Joe's sector table actually lands on for these subjects. */
const SUBJECTS: Record<string, string> = {
    coffee: 'اعمل لي متجر قهوة مختصة ومحمصة',
    clinic: 'اعمل لي نظام مواعيد عيادة أسنان',
    jewellery: 'اعمل لي متجر مجوهرات ذهب',
    legal: 'اعمل لي موقع مكتب محاماة',
    beauty: 'اعمل لي موقع صالون تجميل',
};

const valueOf = (css: string, token: string) =>
    (new RegExp(token + '\\s*:\\s*([^;]+);').exec(css) || [])[1]?.trim() || '';

const cardsFor = () => Object.entries(SUBJECTS).map(([name, request]) => {
    const css = paletteCss(buildPalette(request));
    return { name, card: valueOf(css, '--card'), panel: valueOf(css, '--panel') };
});

describe('the page is the subject\'s own paper, and the same paper for each', () => {
    it('POSITIVE — perceived lightness barely moves between subjects', () => {
        //  The claim is about the EYE, so it is measured in the space built
        //  for the eye. HSL would report these as identical and they are not.
        const ls = cardsFor().map(c => oklch(c.card).l);
        const spread = Math.max(...ls) - Math.min(...ls);
        expect({ spread: spread < 0.004, ls: ls.length }).toEqual({ spread: true, ls: 5 });
    });

    it('POSITIVE — and the card is paper, not the absence of colour', () => {
        //  Near-white is what made every output read pale. The reference the
        //  owner showed grounds near 0.91; this asks only that Joe leave the
        //  0.97-0.98 band it sat in.
        for (const c of cardsFor()) {
            const l = oklch(c.card).l;
            expect({ name: c.name, tinted: l < 0.972 }).toEqual({ name: c.name, tinted: true });
        }
    });

    it('POSITIVE — the panel sits a real step below the card', () => {
        //  A card that cannot be told from the page behind it is one surface,
        //  not two, and depth is most of what «designed» looks like.
        for (const c of cardsFor()) {
            const gap = oklch(c.card).l - oklch(c.panel).l;
            expect({ name: c.name, stepped: gap > 0.015 }).toEqual({ name: c.name, stepped: true });
        }
    });

    it('NEGATIVE — text on every card is still far above AA', () => {
        //  A prettier ground that costs legibility is not prettier. This is
        //  the boundary the whole change is allowed to move inside.
        for (const c of cardsFor()) {
            const css = paletteCss(buildPalette(SUBJECTS[c.name]));
            const text = valueOf(css, '--text');
            expect({ name: c.name, aa: wcagContrast(text, c.card) >= 4.5 })
                .toEqual({ name: c.name, aa: true });
        }
    });

    it('NEGATIVE — two subjects still get two different papers', () => {
        //  Evening the lightness must not even out the colour: that would
        //  close this defect by reopening the one before it.
        const cards = cardsFor().map(c => c.card);
        expect(new Set(cards).size).toBe(cards.length);
    });

    it('NEGATIVE — the same request still rebuilds the same paper', () => {
        const a = paletteCss(buildPalette(SUBJECTS.coffee));
        const b = paletteCss(buildPalette(SUBJECTS.coffee));
        expect(valueOf(a, '--card')).toBe(valueOf(b, '--card'));
    });
});
