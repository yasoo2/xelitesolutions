/**
 * SECOND DEEP PASS on the delivered build (joe-6a6ff28f) — five defects read
 * out of the shipped bytes:
 *
 * (1) The surface-pairing CSS was appended into "the last </style>" on every
 *     write: after the first contrast repair that block IS the removable
 *     <style id="joe-contrast-fix">, so the pairing was wiped on the next
 *     repair round — and nothing deduplicated it, so the shipped styles.css
 *     carried the same .band.band rule three times.
 * (2) .eyebrow ships letter-spacing:.12em + uppercase — Latin conventions
 *     that pull connected Arabic letters apart and mean nothing in Arabic.
 * (3) The hero photograph — the Largest Contentful Paint — was lazy-loaded.
 * (4) The charts runtime redraws on the OS scheme change but ignored the
 *     page's own theme switch (which writes data-theme, no media event).
 * (5) The footer's «المشاريع» was demoted to a <span> while the top nav had
 *     a live «المشاريع» → #portfolio link on the same page.
 */
import { applySurfacePairing, surfacePairingCss } from '../core/design/layouts';
import { applyMechanicalRepairs } from '../core/quality/repair-engine';
import { bidiCss } from '../core/design/language';
import { hardenImgTags, type ResolvedImage } from '../core/design/images';
import { chartRuntime } from '../core/design/dataviz';
import { repairDeadAnchors } from '../core/design/chrome';

describe('(1) the surface pairing is ONE addressable block that repairs cannot eat', () => {
    const page = '<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body><section class="band">نص</section></body></html>';

    it('injects a single identified block holding .band.band', () => {
        const out = applySurfacePairing(page, 'overlap');
        expect(out.match(/<style id="joe-surface-pairing">/g)?.length).toBe(1);
        expect(out.match(/\.band\.band\{/g)?.length).toBe(1);
    });
    it('is idempotent — a second (and third) application changes nothing', () => {
        const once = applySurfacePairing(page, 'overlap');
        const thrice = applySurfacePairing(applySurfacePairing(once, 'overlap'), 'overlap');
        expect(thrice).toBe(once);
    });
    it('sweeps the legacy copies the old bug planted — including the one inside joe-contrast-fix', () => {
        // The delivered file's exact shape: the pairing inside the contrast-fix
        // block AND duplicated at the end of the page stylesheet.
        const legacy = '<!DOCTYPE html><html><head><style>.x{color:red}\n'
            + '/* Joe surface pairing — a background and its text colour are one decision */\n'
            + '.band.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}\n</style>\n'
            + '<style id="joe-contrast-fix">\n#stat{color:rgb(161,122,230) !important}\n\n'
            + '/* Joe surface pairing — a background and its text colour are one decision */\n'
            + '.band.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}\n</style>\n'
            + '</head><body></body></html>';
        const out = applySurfacePairing(legacy, 'overlap');
        expect(out.match(/\.band\.band\{/g)?.length).toBe(1);
        expect(out).toContain('<style id="joe-surface-pairing">');
        // The contrast repair's own rule survives the sweep.
        expect(out).toContain('#stat{color:rgb(161,122,230) !important}');
    });
    it('survives a contrast-repair round (the round that used to wipe it)', () => {
        const paired = applySurfacePairing(page, 'overlap');
        const repaired = applyMechanicalRepairs(paired, [
            { code: 'contrast', data: [{ sel: '.x', fg: [120, 120, 120], bg: [255, 255, 255], need: 4.5, ratio: 3.9, text: 'x' }] },
        ]).html;
        expect(repaired).toContain('<style id="joe-surface-pairing">');
        expect(repaired.match(/\.band\.band\{/g)?.length).toBe(1);
        // …and repairing AGAIN (the rebuild) still leaves the pairing standing.
        const again = applyMechanicalRepairs(repaired, [
            { code: 'contrast', data: [{ sel: '.x', fg: [120, 120, 120], bg: [255, 255, 255], need: 4.5, ratio: 3.9, text: 'x' }] },
        ]).html;
        expect(again.match(/\.band\.band\{/g)?.length).toBe(1);
    });
    it('the contrast archetype still gets its inverted hero rules', () => {
        expect(surfacePairingCss('contrast')).toContain('.hero.hero{background:var(--text)');
        expect(applySurfacePairing(page, 'contrast')).toContain('.hero.hero{background:var(--text)');
    });
});

describe('(2) Arabic keeps its letters connected', () => {
    it('RTL zeroes the tracking the kit sets for Latin', () => {
        const css = bidiCss();
        expect(css).toMatch(/\[dir="rtl"\] :is\(\.eyebrow,h1,h2,h3,h4,\.display,\.hero h1,\.brand-name\)\{letter-spacing:0\}/);
        expect(css).toContain('[dir="rtl"] .eyebrow{text-transform:none}');
    });
});

describe('(3) the first photograph loads eager and high-priority', () => {
    const img = (src: string): [string, ResolvedImage] => [src, { query: 'q', src, alt: 'صورة', fromCache: false } as ResolvedImage];
    const map = new Map<string, ResolvedImage>([img('/artifacts/images/hero.jpg'), img('/artifacts/images/card.jpg')]);

    it('first photo: eager + fetchpriority=high; later photos: lazy', () => {
        const html = '<img src="/artifacts/images/hero.jpg"><img src="/artifacts/images/card.jpg">';
        const out = hardenImgTags(html, map);
        const [hero, card] = out.match(/<img\b[^>]*>/g)!;
        expect(hero).toContain('fetchpriority="high"');
        expect(hero).toContain('loading="eager"');
        expect(card).toContain('loading="lazy"');
        expect(card).not.toContain('fetchpriority');
    });
    it('a lazy the model wrote on the FIRST photo is overridden — lazy LCP is never right', () => {
        const out = hardenImgTags('<img loading="lazy" src="/artifacts/images/hero.jpg">', map);
        expect(out).not.toContain('loading="lazy"');
        expect(out).toContain('fetchpriority="high"');
    });
    it('images Joe did not source are untouched', () => {
        const html = '<img loading="lazy" src="https://elsewhere.example/x.jpg">';
        expect(hardenImgTags(html, map)).toBe(html);
    });
});

describe('(4) charts follow the page theme switch, not only the OS', () => {
    it('the runtime watches data-theme on <html> and redraws', () => {
        const rt = chartRuntime('ar');
        expect(rt).toContain('MutationObserver');
        expect(rt).toContain("attributeFilter: ['data-theme']");
        expect(rt).toContain('redrawAll');
        // The OS listener still exists too — both paths redraw.
        expect(rt).toContain("matchMedia('(prefers-color-scheme: dark)')");
    });
});

describe('(5) a dead link with a LIVING TWIN adopts its destination', () => {
    const page = (footerLink: string) => `<!DOCTYPE html><html><body>
<nav><a href="#portfolio">المشاريع</a><a href="#about">من نحن</a></nav>
<section id="portfolio"><h2>أعمالنا</h2></section>
<section id="about"><h2>من نحن</h2></section>
<footer><ul><li>${footerLink}</li></ul></footer>
</body></html>`;

    it('the footer «المشاريع» adopts the nav\'s #portfolio instead of dying (the shipped defect)', () => {
        const out = repairDeadAnchors(page('<a href="#">المشاريع</a>')).html;
        expect(out).toContain('href="#portfolio">المشاريع</a>');
        expect(out).not.toContain('<span>المشاريع</span>');
    });
    it('«المشاريع» also matches a heading «مشاريعنا» once the article is normalised', () => {
        const html = '<body><section id="works"><h2>مشاريعنا</h2></section><a href="#">المشاريع</a></body>';
        expect(repairDeadAnchors(html).html).toContain('href="#works"');
    });
    it('a label with no target and no twin is still honestly demoted', () => {
        const out = repairDeadAnchors(page('<a href="#">الوظائف</a>')).html;
        expect(out).toContain('<span>الوظائف</span>');
    });
});
