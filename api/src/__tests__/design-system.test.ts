/**
 * The palette promises "AA contrast by construction" in every build summary.
 *
 * That is a claim made to the user on every single page, so it is worth holding
 * to across all 360 hues rather than the handful anyone would try by hand. The
 * defect that motivated this was measured, not imagined: a built page put
 * var(--text) on var(--brand) at 2.79:1 against a 4.5:1 requirement.
 */

import { buildPalette, paletteForHue, contrastRatio, paletteCss, darkFirstCss } from '../core/design/design-system';

const ALL_HUES = Array.from({ length: 360 }, (_, i) => i);

describe('palette contrast is guaranteed by construction', () => {
    it.each([
        ['text on the brand colour', (p: any) => contrastRatio(p.onPrimary, p.primary), 4.5],
        ['body text on the surface', (p: any) => contrastRatio(p.text, p.surface), 7],
        ['muted text on the surface', (p: any) => contrastRatio(p.textMuted, p.surface), 4.5],
        ['white on the secondary colour', (p: any) => contrastRatio('#ffffff', p.secondary), 4.5],
        ['white on the accent colour', (p: any) => contrastRatio('#ffffff', p.accent), 4.5],
        ['dark-mode text on the dark surface', (p: any) => contrastRatio(p.darkText, p.darkSurface), 7],
        ['dark-mode muted text on the dark surface', (p: any) => contrastRatio(p.darkTextMuted, p.darkSurface), 4.5],
    ])('%s clears its threshold at every hue', (_label, measure, threshold) => {
        const failures = ALL_HUES
            .map(h => ({ hue: h, ratio: measure(paletteForHue(h)) }))
            .filter(r => r.ratio < threshold);

        expect(failures.map(f => `hue ${f.hue}: ${f.ratio.toFixed(2)}:1`)).toEqual([]);
    });

    it('body text clears AAA on the page background too, not just the surface', () => {
        const failures = ALL_HUES
            .map(h => ({ hue: h, ratio: contrastRatio(paletteForHue(h).text, paletteForHue(h).bg) }))
            .filter(r => r.ratio < 7);
        expect(failures).toEqual([]);
    });
});

describe('contrastRatio itself', () => {
    it('is symmetric', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 10);
    });

    it('gives the known extremes', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
        expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    });

    it('accepts three-digit hex', () => {
        expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
    });
});

describe('the palette is a decision, not a dice roll', () => {
    it('is stable: the same brief produces the same colours', () => {
        const a = buildPalette('متجر عطور فاخرة');
        const b = buildPalette('متجر عطور فاخرة');
        expect(a).toEqual(b);
    });

    it('honours a colour the user names, in Arabic or English', () => {
        expect(buildPalette('صفحة شركة باللون الأزرق').hue).toBe(218);
        expect(buildPalette('a landing page in blue').hue).toBe(218);
        expect(buildPalette('موقع باللون الأخضر').hue).toBe(152);
    });

    it('falls back to a sector default when no colour is named', () => {
        // A restaurant is warm; a clinic is not. These used to be EXACT hues,
        // which is why every restaurant Joe built wore the identical orange —
        // «يعطي نفس اللون في كل مرة». The sector now guarantees the RANGE and
        // the brief picks the exact value inside it, stably.
        const r = buildPalette('مطعم إيطالي').hue;
        expect(r).toBeGreaterThanOrEqual(8); expect(r).toBeLessThan(44);      // warm
        const c = buildPalette('عيادة أسنان').hue;
        expect(c).toBeGreaterThanOrEqual(150); expect(c).toBeLessThan(192);   // clinical
        // Two different restaurants are recognisably different restaurants.
        expect(buildPalette('مطعم إيطالي').hue).not.toBe(buildPalette('مطعم يمني شعبي').hue);
    });

    it('different briefs do not all collapse to one hue', () => {
        const hues = new Set(['متجر ملابس', 'مطعم', 'عيادة', 'شركة برمجيات', 'صالون تجميل']
            .map(r => buildPalette(r).hue));
        expect(hues.size).toBeGreaterThan(2);
    });
});

describe('the emitted CSS', () => {
    const css = paletteCss(buildPalette('شركة برمجيات'));

    it('declares every token the UI kit and layouts reference', () => {
        for (const token of [
            '--brand', '--brand-dark', '--brand-light', '--secondary', '--accent', '--on-brand',
            '--bg', '--surface', '--text', '--text-muted', '--border',
            '--radius', '--radius-lg', '--radius-pill', '--shadow-sm', '--shadow-md', '--shadow-lg',
            '--space-1', '--space-24', '--step--1', '--step-5', '--maxw',
        ]) {
            expect(css).toContain(`${token}:`);
        }
    });

    it('ships a dark scheme with the page', () => {
        expect(css).toContain('prefers-color-scheme:dark');
    });

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });
});

describe('dark-first override', () => {
    const p = buildPalette('تطبيق ليلي');
    const css = darkFirstCss(p);

    it('applies to everyone, not only to viewers who asked for dark', () => {
        // The reference site is dark at noon on a light-mode laptop; matching it
        // means no prefers-color-scheme escape hatch back to light.
        expect(css).toContain(p.darkBg);
        const lightBlock = css.match(/@media\s*\(prefers-color-scheme:light\)\{[^}]*\}/)?.[0] || '';
        expect(lightBlock).toContain(p.darkBg);
        expect(lightBlock).not.toContain(`--bg:${p.bg}`);
    });

    it('keeps the contrast guarantees it inherited', () => {
        expect(contrastRatio(p.darkText, p.darkSurface)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
    });
});
