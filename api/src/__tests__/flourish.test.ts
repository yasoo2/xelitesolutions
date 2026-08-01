/**
 * The flourish layer — shaped hero edges, drawn heading accents, brand glow —
 * follows the same laws as every other design decision in this system:
 *
 *   STABLE: the same brief always produces the same shapes (an edit must not
 *   reshape the header), including across Arabic spelling variants.
 *   VARIED: different briefs draw different shapes — a system, not a template.
 *   HONEST: the shapes are CSS on the page's own palette tokens; no external
 *   assets that can 404, no colours baked outside the theme system.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pickFlourish, flourishCss, flourishBrief, type FlourishStyle } from '../core/design/flourish';

describe('pickFlourish — stable, varied, and obedient', () => {
    it('the same brief always gets the same shapes', () => {
        const req = 'ابني موقعاً لشركة تقنية اسمها Nova';
        expect(pickFlourish('landing', req)).toBe(pickFlourish('landing', req));
    });

    it('re-typing the request with hamza/diacritics is not a redesign', () => {
        expect(pickFlourish('landing', 'أريد موقعاً لمطعم شرقي'))
            .toBe(pickFlourish('landing', 'اريد موقعا لمطعم شرقي'));
    });

    it('different briefs reach different shapes across a sample', () => {
        const briefs = [
            'موقع لمطعم بحري', 'صفحة لشركة عقارات', 'متجر ملابس رجالية',
            'موقع لعيادة أسنان', 'صفحة لمصور فوتوغرافي', 'موقع لمكتب محاماة',
            'landing page for a coffee brand', 'site for a travel agency',
        ];
        const styles = new Set(briefs.map(b => pickFlourish('landing', b)));
        expect(styles.size).toBeGreaterThanOrEqual(2);
    });

    it('an explicit ask wins: «خطوط مموجة» forces the wave', () => {
        expect(pickFlourish('landing', 'موقع بخطوط مموجة في الهيدر')).toBe('wave');
        expect(pickFlourish('landing', 'a site with a wavy header')).toBe('wave');
    });

    it('curved and diagonal and flat are all reachable by name', () => {
        expect(pickFlourish('landing', 'اريد حواف منحنية')).toBe('curve');
        expect(pickFlourish('landing', 'تصميم بقصّات قطرية diagonal')).toBe('tilt');
        expect(pickFlourish('landing', 'بدون زخارف نهائياً')).toBe('none');
    });

    it('tools stay clean: dashboards and apps default to none', () => {
        expect(pickFlourish('dashboard', 'لوحة تحكم للمبيعات')).toBe('none');
        expect(pickFlourish('app', 'تطبيق ملاحظات')).toBe('none');
    });

    it('but an explicit ask overrides even a dashboard', () => {
        expect(pickFlourish('dashboard', 'لوحة تحكم بهيدر مموج')).toBe('wave');
    });
});

describe('flourishCss — the shapes are real CSS on palette tokens', () => {
    it('wave: the hero edge is a MASK (cannot 404, cannot overlap the next section)', () => {
        const css = flourishCss('wave');
        expect(css).toContain('mask-image');
        expect(css).toContain('data:image/svg+xml');
        expect(css).toContain('section:first-of-type');
        // Extra bottom room so the wave never cuts into a button.
        expect(css).toMatch(/padding-bottom:clamp\(/);
    });

    it('curve and tilt shape the edge with clip-path', () => {
        expect(flourishCss('curve')).toMatch(/clip-path:ellipse/);
        expect(flourishCss('tilt')).toMatch(/clip-path:polygon/);
    });

    it('the diagonal flips for RTL — direction is a design property, not an accident', () => {
        expect(flourishCss('tilt')).toMatch(/\[dir=rtl\] section:first-of-type\{clip-path:polygon/);
    });

    it('every accent and glow is painted with var(--tint) — never a baked colour', () => {
        for (const s of ['wave', 'curve', 'tilt'] as FlourishStyle[]) {
            const css = flourishCss(s);
            expect(css).toContain('var(--tint');
            // No hex colours anywhere: the palette owns colour, in both schemes.
            expect(css).not.toMatch(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])[^)]*\)/);
        }
    });

    it('the squiggle under headings is a masked block, so it recolors with the theme', () => {
        const css = flourishCss('wave');
        expect(css).toMatch(/h2::after/);
        expect(css).toMatch(/mask:.*data:image\/svg\+xml/);
    });

    it('a centered composition centers its accents; others align to text start', () => {
        expect(flourishCss('wave', { centered: true })).toContain('margin-inline:auto');
        expect(flourishCss('wave', { centered: false })).not.toContain('margin-inline:auto');
    });

    it('none means none — not a hidden empty layer', () => {
        expect(flourishCss('none')).toBe('');
        expect(flourishBrief('none')).toBe('');
    });
});

describe('the model is told the layer exists, so it does not fight it', () => {
    it('the brief forbids home-made dividers and underlines', () => {
        const brief = flourishBrief('wave');
        expect(brief).toContain('do not rebuild');
        expect(brief.toLowerCase()).toContain('divider');
        expect(brief.toLowerCase()).toContain('underline');
    });

    it('the builder wires the layer into every page assembly and every design brief', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'),
            'utf-8'
        );
        expect((src.match(/\$\{flourishLayer\}/g) || []).length).toBeGreaterThanOrEqual(3);
        expect((src.match(/flourishBrief\(flourish\)/g) || []).length).toBeGreaterThanOrEqual(6);
        // Stable on edits: the choice is stored with the session like the archetype.
        expect(src).toMatch(/\(prev as any\)\?\.flourish/);
        expect(src).toMatch(/archetype, typePair, flourish/);
    });
});
