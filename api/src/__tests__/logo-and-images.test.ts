/**
 * Two defects from a build the user ran and reported.
 *
 *   👁️ الفحص البصري: 27/100
 *      • أخطاء JavaScript: Failed to load resource: 404 (Not Found)   ×6
 *   … and: «لم تظهر الصور في الموقع» · «لم يصمم لوجو لاسم الشركة»
 *
 * The 404s were not a network problem. `{{IMAGE:hero|…}}` shipped verbatim in a
 * src attribute, so the browser requested a URL with braces in it. And the
 * header carried the company name as bold text, which is not a mark.
 */

import { IMAGE_MARKER, gradientPlaceholder } from '../core/design/images';
import { logoMark, logoLockup, logoCss, ensureLogo } from '../core/design/logo';

describe('an unresolved image marker must never reach the browser', () => {
    const page = `<main><img src="{{IMAGE:hero|a consultant at work}}" alt="a">
<img src="{{ IMAGE: card | a team meeting }}" alt="b"></main>`;

    it('the sweep replaces every marker with the page gradient', () => {
        // The exact operation the builder performs after image sourcing,
        // whatever happened during it.
        const out = page.replace(IMAGE_MARKER, (_f, q: string) =>
            gradientPlaceholder(String(q).split('|').pop()!.trim(), 218));

        expect(out).not.toMatch(/\{\{/);
        expect(out).not.toMatch(/IMAGE:/);
        expect((out.match(/data:image\/svg\+xml/g) || []).length).toBe(2);
    });

    it('the marker pattern catches the spacing a model actually writes', () => {
        for (const m of ['{{IMAGE:hero|x}}', '{{ IMAGE : card | a long subject }}', '{{IMAGE:avatar|y}}']) {
            expect(new RegExp(IMAGE_MARKER.source, 'i').test(m)).toBe(true);
        }
    });

    it('the gradient is self-contained, so it cannot 404 in turn', () => {
        const g = gradientPlaceholder('a consultant at work', 218);
        expect(g.startsWith('data:image/svg+xml')).toBe(true);
        expect(g).not.toMatch(/https?:\/\//);
    });
});

describe('the corner of the page carries a mark', () => {
    it('draws a monogram from the brand, not a description of one', () => {
        const svg = logoMark({ brand: 'Xelite Solutions', hue: 218, isArabic: false });
        expect(svg).toContain('<svg');
        expect(svg).toContain('>XS<');
        // Drawn, not fetched — a model asked for a logo returns an <img> whose
        // URL does not exist, which is how every image on that page 404'd.
        expect(svg).not.toMatch(/<img|https?:\/\//);
    });

    it('takes two letters from a single-word Latin brand', () => {
        expect(logoMark({ brand: 'xelitesolutions', hue: 1, isArabic: false })).toContain('>XE<');
    });

    it('takes ONE letter from an Arabic word, because two would join', () => {
        // Two Arabic letters in a 40px box form a ligature and stop reading as
        // initials.
        const svg = logoMark({ brand: 'نجمة', hue: 1, isArabic: true });
        expect(svg).toMatch(/>ن</);
    });

    it('skips the words that are not the name', () => {
        // «الرؤية الرقمية» taken naively gives «اا» — two identical alifs from
        // the definite article, which say nothing about the business.
        expect(logoMark({ brand: 'شركة الرؤية الرقمية', hue: 1, isArabic: true })).toMatch(/>ر</);
        expect(logoMark({ brand: 'The Acme Group', hue: 1, isArabic: false })).toContain('>AG<');
    });

    it('uses the page palette so the mark belongs to the page', () => {
        const svg = logoMark({ brand: 'Acme Labs', hue: 218, isArabic: false });
        expect(svg).toContain('var(--brand)');
        expect(svg).toContain('var(--brand-dark)');
        // The monogram takes the one colour guaranteed readable on the tile.
        expect(svg).toContain('fill="var(--on-brand)"');
    });

    it('is hidden from a screen reader, which reads the name beside it', () => {
        const lockup = logoLockup({ brand: 'Acme Labs', hue: 1, isArabic: false });
        expect(lockup).toContain('aria-hidden="true"');
        expect(lockup).toContain('aria-label="Acme Labs"');
        expect(lockup).toContain('<span class="brand-name">Acme Labs</span>');
    });

    it('escapes a brand that contains markup', () => {
        expect(logoLockup({ brand: '<script>x</script>', hue: 1, isArabic: false })).not.toContain('<script>');
    });
});

describe('the mark is added to a header that has none', () => {
    const header = '<header class="site-header"><div class="wrap header-inner">'
        + '<a class="brand" href="index.html">إكس إيليت</a></div></header>';

    it('upgrades the existing brand link in place, not beside it', () => {
        const got = ensureLogo(header, { brand: 'إكس إيليت', hue: 218, isArabic: true });
        expect(got.added).toBe(true);
        expect((got.html.match(/class="brand"/g) || []).length).toBe(1);
        expect(got.html).toContain('<svg class="brand-mark"');
        expect(got.html).toContain('إكس إيليت');
    });

    it('keeps the name the header already used, not the one guessed from the request', () => {
        const got = ensureLogo(header, { brand: 'A Different Name', hue: 1, isArabic: true });
        expect(got.html).toContain('إكس إيليت');
        expect(got.html).not.toContain('A Different Name');
    });

    it('leaves a real logo alone', () => {
        const withLogo = '<header><a class="brand" href="/"><img src="/logo.svg" alt="x"></a></header>';
        expect(ensureLogo(withLogo, { brand: 'x', hue: 1, isArabic: false }).added).toBe(false);
        const withSvg = '<header><a class="brand" href="/"><svg viewBox="0 0 1 1"></svg></a></header>';
        expect(ensureLogo(withSvg, { brand: 'x', hue: 1, isArabic: false }).added).toBe(false);
    });

    it('does nothing when there is no brand link to upgrade', () => {
        const bare = '<header><nav><a href="#a">A</a></nav></header>';
        expect(ensureLogo(bare, { brand: 'x', hue: 1, isArabic: false })).toEqual({ html: bare, added: false });
    });
});

describe('the mark styling', () => {
    const css = logoCss();

    it('has balanced braces and uses logical properties', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
        expect(css).toContain('margin-inline-end:auto');
        expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    });

    it('drops the name on a narrow phone so the hamburger keeps its row', () => {
        expect(css).toMatch(/@media \(max-width:420px\)\{\.brand-name\{display:none\}\}/);
    });
});
