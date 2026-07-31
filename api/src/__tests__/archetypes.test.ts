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

import {
    pickArchetype, layoutCss, layoutBrief, pickTypePair, ownedSurfaces, type Archetype,
} from '../core/design/layouts';
import { paletteForHue, paletteCss, darkTokenBlock, lightTokenBlock, darkFirstCss, contrastRatio } from '../core/design/design-system';
import { siteNavCss } from '../core/design/site-plan';
import { reviewHtml } from '../core/quality/html-qa';

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

describe('a band recolours everything on it, not just its prose', () => {
    /**
     * A band is a brand gradient. Everything on it that keeps a light-page
     * colour is the brand on itself. The common layer tinted the lede and the
     * eyebrow and stopped there — Joe's own audit measured the ghost button at
     * 1.6:1 on six of the seven compositions once both instruments were pointed
     * at the same fixtures.
     */
    it.each(ALL)('%s recolours the ghost button on a band', a => {
        expect(layoutCss(a)).toMatch(/\.band \.btn-ghost\{[^}]*color:var\(--(on-brand|bg)\)/);
    });

    it.each(ALL)('%s recolours the figures on a band', a => {
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

describe('a tinted surface is picked as a PAIR, never half at a time', () => {
    /**
     * The site header's "you are here" link went wrong twice, in opposite
     * directions, because its colour and its background were chosen separately.
     *
     *   1. var(--brand) on a 12% brand wash measured 4.12:1 in a browser — below
     *      AA — at the hues that happened to land there. Changed to
     *      var(--brand-dark), which is fitted to 7:1 against WHITE.
     *   2. …which in dark mode is a deep blue on a near-black header: 1.97:1, on
     *      every page of every site Joe builds.
     *
     * --tint and --on-tint are DEFINED against each other and proven AA at every
     * hue in both schemes. That is the whole reason the pair exists.
     */
    it('uses the pair for the current page and for hover', () => {
        const css = siteNavCss();
        expect(css).toMatch(/a\[aria-current="page"\]\{[^}]*color:var\(--on-tint\)[^}]*background:var\(--tint\)/);
        expect(css).toMatch(/a:hover\{[^}]*color:var\(--on-tint\)[^}]*background:var\(--tint\)/);
    });

    it('never hand-picks one half of a tinted surface', () => {
        // --brand-dark is fitted against white; on a tint in dark mode it is the
        // 1.97:1 defect above. If it comes back here, so does that.
        // Comments are stripped first — the rule this guards is written down
        // right there in one, and asserting against prose is not a check.
        const declarations = siteNavCss().replace(/\/\*[\s\S]*?\*\//g, '');
        expect(declarations).not.toMatch(/--brand-dark/);
    });
});

describe('a background and its text colour are one decision', () => {
    /**
     * The design brief says never to hardcode a colour and a weak model does it
     * anyway — `.hero{background:linear-gradient(135deg,#f8fafc,#eef2ff)}` is the
     * shape it writes. That background is FIXED while every text token follows
     * the colour scheme, so the page reads in light mode and goes blank the
     * moment the visitor flips to dark. Measured in a browser across all seven
     * compositions: 1.02:1 on the heading, 1.73:1 on the lede, 2.96:1 on the
     * ghost button — and 1.0:1, literally white on white, when the composition
     * was the inverted one.
     *
     * The defect existed before the dark-mode switch; the switch is what made it
     * reachable.
     */
    it('re-pairs a surface the model painted with a literal colour', () => {
        const r = reviewHtml(
            `<!DOCTYPE html><html><head><style>
             .hero{background:linear-gradient(135deg,#f8fafc,#eef2ff)}
             </style></head><body><section class="hero"><h1>x</h1></section></body></html>`,
            true, { ownedSurfaces: ownedSurfaces('split') });
        expect(r.html).toContain('Joe surface re-pairing');
        expect(r.html).toMatch(/\.hero h1[^{]*\{color:#0f172a\}|\.hero h1[^,]*,/);
    });

    it('picks the ink from the background that is actually there', () => {
        const dark = reviewHtml(
            `<html><head><style>.cta{background:#111827}</style></head><body><div class="cta">x</div></body></html>`,
            true, { ownedSurfaces: [] });
        expect(dark.html).toMatch(/\.cta\{color:#ffffff\}/);
    });

    it('leaves a TOKEN background alone — those already flip correctly', () => {
        const r = reviewHtml(
            `<html><head><style>.hero{background:var(--bg)}</style></head><body><div class="hero">x</div></body></html>`,
            true, { ownedSurfaces: [] });
        expect(r.html).not.toContain('Joe surface re-pairing');
    });

    it('never touches a surface the pairing layer owns', () => {
        // Two repairs describing different backgrounds is worse than either
        // alone: it measured ten nodes at 2.31:1 on a band.
        const r = reviewHtml(
            `<html><head><style>.band{background:#f1f5f9}</style></head><body><div class="band">x</div></body></html>`,
            true, { ownedSurfaces: ownedSurfaces('split') });
        expect(r.html).not.toContain('Joe surface re-pairing');
    });

    it('stops at a nested surface that paints its own background', () => {
        // The overlap hero holds a .hero-panel on var(--surface); painting
        // through it put dark ink on a dark panel in dark mode, at 1.06:1.
        const r = reviewHtml(
            `<html><head><style>.hero{background:#f8fafc}</style></head><body><div class="hero">x</div></body></html>`,
            true, { ownedSurfaces: [] });
        expect(r.html).toMatch(/:not\(:is\([^)]*\.hero-panel[^)]*\) \*\)/);
    });

    it('every kit surface that paints a background states its text colour', () => {
        // A background without a colour beside it is the whole defect class.
        // Only rules that actually PAINT count — `.hero-panel` also has a
        // geometry-only rule inside a media query, and demanding a colour there
        // would be demanding a declaration that means nothing.
        let checked = 0;
        for (const a of ALL) {
            for (const m of layoutCss(a).matchAll(/\.(?:card|hero-panel)\{([^}]*)\}/g)) {
                if (!/background\s*:/.test(m[1])) continue;
                checked++;
                expect(m[1]).toMatch(/color:/);
            }
        }
        expect(checked).toBeGreaterThan(0);   // the loop must have found something
    });
});
