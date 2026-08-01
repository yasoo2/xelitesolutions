/**
 * The self-check script every delivered site carries: activation-gated,
 * self-contained, localized — and measuring, never guessing.
 */
import { selfCheckScript } from '../core/design/self-check';

describe('self-check script generation', () => {
    const ar = selfCheckScript(true);
    const en = selfCheckScript(false);

    test('activates ONLY behind the ?joe-check flag — visitors see nothing', () => {
        expect(ar).toContain('joe-check');
        expect(ar).toMatch(/if \(!\/\[\?&#\]joe-check\/.test\(location\.search \+ location\.hash\)\) return;/);
    });

    test('is fully self-contained: no external requests of any kind', () => {
        for (const s of [ar, en]) {
            expect(s).not.toMatch(/https?:\/\//);
            expect(s).not.toMatch(/\bfetch\s*\(/);
            expect(s).not.toMatch(/XMLHttpRequest/);
            expect(s).not.toMatch(/import\s/);
        }
    });

    test('measures real facts: broken images, dead anchors, unlabeled fields, js errors', () => {
        expect(ar).toContain('naturalWidth === 0');
        expect(ar).toContain('a[href^="#"]');
        expect(ar).toContain('aria-label');
        expect(ar).toContain("addEventListener('error'");
    });

    test('Arabic build speaks Arabic and lays out RTL; English build does not', () => {
        expect(ar).toContain('فحص جو الذاتي');
        expect(ar).toContain('"rtl"');
        expect(en).toContain('Joe self-check');
        expect(en).toContain('"ltr"');
        expect(en).not.toMatch(/[؀-ۿ]/);
    });

    test('the overlay panel is inline-styled (survives any site CSS)', () => {
        expect(ar).toContain('position:fixed');
        expect(ar).toContain('z-index:2147483000');
    });
});
