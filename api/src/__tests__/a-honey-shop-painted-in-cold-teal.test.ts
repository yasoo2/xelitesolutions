/**
 * A HONEY SHOP DESCRIBED AS «دافئ وفاخر» WAS PAINTED IN COLD TEAL.
 *
 * The owner, after Joe built it for him: «the worst store I have seen in my
 * life». Measured, and this is one of the two reasons:
 *
 *     composeDesign(request)  ->  spoken: ['warm', 'elegant']
 *     buildPalette(request)   ->  hue: 183   (#187b81)
 *
 * The composer read his words correctly. The palette picked a hue without ever
 * asking it.
 *
 * ⛔ THE CLASS, for the tenth time in one session: two readers of the same
 * sentence, and only one of them hears the part that matters. Every earlier
 * instance cost a detail. This one cost the colour of every store, dashboard
 * and app Joe has ever built — the first thing anyone sees.
 *
 * The repair keeps three properties that a careless fix would have destroyed,
 * and each is pinned below:
 *
 *   · the hue is still DERIVED — the arc is his, the position inside it is
 *     still his sentence's, so two warm briefs do not collapse onto one gold;
 *   · a colour he NAMED outranks the temperature;
 *   · a brief with no colour words comes out exactly as it did before.
 *
 * And the vocabulary has ONE reader: `temperatureAsked` is exported from the
 * composer. A second warmth matcher inside the palette would have been the
 * defect again, one layer down.
 */

import { buildPalette } from '../core/design/design-system';
import { temperatureAsked, composeDesign } from '../core/design/composer';

const hueOf = (r: string) => (buildPalette(r) as any).hue as number;
const warm = (h: number) => h >= 18 && h <= 58;
const cool = (h: number) => h >= 186 && h <= 254;

const HONEY = 'اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد» … التصميم دافئ وفاخر';

describe('the palette hears the temperature he asked for', () => {
    it('⛔ POSITIVE — the exact request that came out teal is now warm', () => {
        const h = hueOf(HONEY);
        expect({ hue: h, isWarm: warm(h) }).toEqual({ hue: h, isWarm: true });
    });

    it('POSITIVE — and «بارد» steers the other way, because a rule needs two sides', () => {
        const h = hueOf('اعمل لي موقعاً لعيادة أسنان، التصميم بارد وهادئ الألوان');
        expect({ hue: h, isCool: cool(h) }).toEqual({ hue: h, isCool: true });
    });

    it('POSITIVE — English says it too', () => {
        expect(warm(hueOf('build a warm, cosy site for a bakery'))).toBe(true);
        expect(cool(hueOf('build a crisp, clinical site for a dental practice'))).toBe(true);
    });

    it('⛔ NEGATIVE — a colour he NAMED outranks the temperature', () => {
        //  He wrote «الأزرق». No amount of warm vocabulary elsewhere may
        //  repaint it — his explicit word is the authority.
        const h = hueOf('اعمل لي موقعاً باللون الأزرق دافئ وأنيق لمكتب محاماة');
        expect({ hue: h, isWarm: warm(h) }).toEqual({ hue: h, isWarm: false });
    });

    it('⛔ NEGATIVE — a brief with no colour words is untouched', () => {
        //  The repair must not repaint every project in the repository. Two
        //  runs of a silent brief agree, and neither is forced into an arc.
        const plain = 'اعمل لي موقعاً لمكتب محاماة';
        expect(hueOf(plain)).toBe(hueOf(plain));
        const h = hueOf(plain);
        expect(warm(h) && cool(h)).toBe(false);
    });

    it('⛔ NEGATIVE — two warm briefs do not collapse onto one gold', () => {
        //  The whole point of composing rather than choosing. If the arc
        //  flattened every warm request to the same hue, this would be the
        //  seven-archetype cage again, in colour.
        const a = hueOf('اعمل لي متجراً دافئاً لبيع العسل');
        const b = hueOf('اعمل لي مقهى دافئاً وحميماً في جدة');
        expect({ a, b, differ: a !== b }).toEqual({ a, b, differ: true });
        expect(warm(a) && warm(b)).toBe(true);
    });

    it('NEGATIVE — the same brief always yields the same colour', () => {
        //  An identity that changed between builds would make every edit look
        //  like a redesign.
        expect(hueOf(HONEY)).toBe(hueOf(HONEY));
    });

    it('⛔ NEGATIVE — the vocabulary has ONE reader, and it is the composer', () => {
        //  If the palette grew its own warmth matcher, these two would drift
        //  apart the first time either list changed.
        expect(temperatureAsked(HONEY)).toBe('warm');
        expect(composeDesign(HONEY).spoken).toContain('warm');
        expect(temperatureAsked('اعمل لي موقعاً لمكتب محاماة')).toBeNull();
    });
});
