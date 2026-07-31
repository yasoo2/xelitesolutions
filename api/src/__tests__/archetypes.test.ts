/**
 * Seven compositions instead of one per page kind.
 *
 * The complaint was «لم يستخدم التصاميم العالمية لأي موقع» — every landing page
 * Joe built came out as the same arrangement, because the archetype was a fixed
 * default per page kind. Two companies asking for the same kind of page got a
 * pixel-identical skeleton.
 *
 * Two properties have to hold together, and they pull against each other:
 *
 *   STABLE — the same brief must produce the same page, or a follow-up edit
 *   turns into a redesign and the user loses the site they approved.
 *   VARIED — different briefs must produce different pages, or it is a template
 *   with a colour picker.
 *
 * A hash of the request gives both. What it cannot give is a guarantee that the
 * new arrangements are READABLE; that is measured in a browser by
 * `npm run verify:layouts`, which renders all seven in light and dark, at
 * desktop and phone, and checks every text node against what is painted behind
 * it. This file covers what is true without a browser.
 */

import { pickArchetype, layoutCss, layoutBrief, pickTypePair, type Archetype } from '../core/design/layouts';
import { paletteForHue, paletteCss, darkTokenBlock, lightTokenBlock, darkFirstCss, contrastRatio } from '../core/design/design-system';

const ALL: Archetype[] = ['split', 'centered', 'bento', 'editorial', 'showcase', 'overlap', 'contrast'];

describe('every archetype is a complete composition', () => {
    it.each(ALL)('%s emits CSS and a brief that names its own classes', a => {
        const css = layoutCss(a);
        expect(css.length).toBeGreaterThan(400);
        expect(css).toContain('.hero');
        expect(layoutBrief(a, pickTypePair('شركة')).length).toBeGreaterThan(200);
    });

    it.each(ALL)('%s collapses to one column before it reaches a phone', a => {
        // Every multi-column rule must be inside a min-width query, so the
        // mobile-first default cannot be a grid nobody can read on a phone.
        const css = layoutCss(a);
        for (const m of css.matchAll(/grid-template-columns:\s*(?!1fr\b)([^;}]+)/g)) {
            const upTo = css.slice(0, m.index);
            const lastQuery = upTo.lastIndexOf('@media');
            const lastClose = upTo.lastIndexOf('}\n');
            expect(lastQuery).toBeGreaterThan(-1);
            expect(css.slice(lastQuery, lastQuery + 40)).toMatch(/min-width/);
            expect(lastClose).toBeLessThan(css.length);
        }
    });
});

describe('the same brief always builds the same page', () => {
    const brief = 'اريد موقعا لشركة استشارات هندسية اسمها الرؤية';

    it('is stable across calls', () => {
        const first = pickArchetype('landing', brief);
        for (let i = 0; i < 20; i++) expect(pickArchetype('landing', brief)).toBe(first);
    });

    it('is stable under an Arabic spelling that means the same thing', () => {
        // The normaliser runs before the hash, so «موقعًا» and «موقعا» are one
        // request — an edit typed slightly differently must not redesign the site.
        expect(pickArchetype('landing', 'اريد موقعا لشركة استشارات'))
            .toBe(pickArchetype('landing', 'أريد موقعاً لشركة استشارات'));
    });
});

describe('different briefs build different pages', () => {
    it('spreads real requests across the shapes a landing page can wear', () => {
        const requests = [
            'شركة استشارات هندسية', 'مكتب محاماة في جدة', 'شركة برمجيات ناشئة',
            'عيادة أسنان', 'شركة مقاولات', 'وكالة تسويق رقمي', 'مركز تدريب',
            'شركة شحن وتوصيل', 'استوديو تصوير', 'مصنع أثاث',
        ];
        const seen = new Set(requests.map(r => pickArchetype('landing', r)));
        expect(seen.size).toBeGreaterThan(1);
    });

    it('only ever picks a shape that suits the kind', () => {
        // A dashboard must not come out editorial, whatever the request hashes to.
        for (const r of ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي']) {
            expect(pickArchetype('dashboard', r)).toBe('bento');
            expect(['editorial', 'overlap', 'contrast']).toContain(pickArchetype('portfolio', r));
        }
    });
});

describe('a named shape beats the default', () => {
    it.each([
        ['اريد تصميما بسيطا', 'centered'],
        ['موقع بأسلوب مجلة', 'editorial'],
        ['تصميم بينتو', 'bento'],
        ['تصميم متداخل الطبقات', 'overlap'],
        ['اريد تصميما جريئا عالي التباين', 'contrast'],
        ['a bold high-contrast site', 'contrast'],
        ['a layered overlap hero', 'overlap'],
    ])('%s → %s', (request, want) => {
        expect(pickArchetype('landing', request)).toBe(want);
    });
});

describe('the inverted composition inverts its controls too', () => {
    /**
     * `contrast` paints its hero and its bands with var(--text) and writes with
     * var(--bg). Every control the kit ships was written for the other way
     * round, so each one lands on a surface it was never checked against —
     * measured in a browser, the ghost button and the figures under a band were
     * both below AA before these rules existed.
     */
    const css = layoutCss('contrast');

    it('gives a ghost button the surface it is actually standing on', () => {
        expect(css).toMatch(/\.hero \.btn-ghost,\.band \.btn-ghost\{[^}]*color:var\(--bg\)/);
    });

    it('gives the figures under a band the same treatment as the lede', () => {
        expect(css).toMatch(/\.band \.stat b,\.band \.stat-value\{color:var\(--bg\)\}/);
    });

    it('is square by design, everywhere it says so', () => {
        expect(css).toMatch(/\.btn\{border-radius:0\}/);
        expect(css).toMatch(/\.card\{border-radius:0/);
    });
});

describe('a band never keeps light-mode figures on a brand gradient', () => {
    // The common layer tinted a band's lede and eyebrow and forgot the numbers,
    // so .stat span kept --text-muted — a mid grey — on a saturated gradient.
    it.each(ALL)('%s carries the rule', a => {
        expect(layoutCss(a)).toMatch(/\.band [^{]*\.stat span/);
    });
});

describe('the brand colour used as TEXT is fitted for that job', () => {
    /**
     * --brand is fitted to 4.5:1 against WHITE, because its job is a button
     * carrying white text. The eyebrow above every section heading and every
     * ghost button borrowed it as a FOREGROUND, and in dark mode that put a
     * mid-tone on a near-black surface: 3.85:1, measured in a browser, on every
     * dark-mode page Joe has ever built.
     */
    it('clears AA on its own surface, in both schemes, at every hue', () => {
        for (let hue = 0; hue < 360; hue += 11) {
            const p = paletteForHue(hue);
            expect(contrastRatio(p.brandText, p.surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(p.darkBrandText, p.darkSurface)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('ships in every token block a page can end up with', () => {
        const p = paletteForHue(214);
        expect(paletteCss(p)).toContain(`--brand-text:${p.brandText}`);
        expect(darkTokenBlock(p)).toContain(`--brand-text:${p.darkBrandText}`);
        expect(lightTokenBlock(p)).toContain(`--brand-text:${p.brandText}`);
        expect(darkFirstCss(p)).toContain(`--brand-text:${p.darkBrandText}`);
    });

    it('is what the eyebrow actually uses', () => {
        expect(layoutCss('split')).toMatch(/\.eyebrow\{[^}]*color:var\(--brand-text/);
    });
});
