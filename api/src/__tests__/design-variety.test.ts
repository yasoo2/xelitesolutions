/**
 * Two different businesses must not get the same page.
 *
 * «في كل مرة أطلب من جو بناء موقع فإنه يعطي نفس التصميم ونفس الحركات ونفس
 * اللون» — and it was true, three times over:
 *
 *   COLOUR — the sector table mapped every technology company to hue 218, the
 *   identical blue. The sector is a constraint, not an answer: it should rule
 *   pink OUT for a consultancy, not pick one exact blue for all of them.
 *   MOTION — one 26px fade-up existed. Every page ever built moved the same way.
 *   TYPE   — every brief the sector table did not recognise got one fallback
 *   pairing.
 *
 * Variety must never cost stability: the same brief has to rebuild the same
 * identity, or a follow-up edit becomes a redesign. Both properties are
 * asserted, on every axis.
 */

import { pickHue, buildPalette, contrastRatio } from '../core/design/design-system';
import { pickRevealStyle, revealCss, REVEAL_STYLES } from '../core/design/theme';
import { pickTypePair } from '../core/design/layouts';

const TECH_BRIEFS = [
    'ابني موقعا لشركة تقنية اسمها xelitesolutions للاستشارات البرمجية',
    'موقع لشركة برمجيات ناشئة اسمها نوفا تك',
    'شركة تقنية متخصصة في الذكاء الاصطناعي اسمها عقول',
    'ابني صفحة لشركة استشارات تقنية اسمها المسار',
    'موقع شركة SaaS اسمها سحابة الأعمال',
    'شركة تطوير تطبيقات اسمها بكسل',
];

describe('colour: a sector is a constraint, not an answer', () => {
    it('gives different tech companies different hues', () => {
        const hues = new Set(TECH_BRIEFS.map(pickHue));
        expect(hues.size).toBeGreaterThan(3);
    });

    it('keeps every one of them inside the sector band', () => {
        // Different, not random: a consultancy must still never come out pink.
        for (const b of TECH_BRIEFS) {
            const h = pickHue(b);
            expect(h).toBeGreaterThanOrEqual(196);
            expect(h).toBeLessThan(256);
        }
    });

    it('rebuilds the same brief to the same hue', () => {
        for (const b of TECH_BRIEFS) expect(pickHue(b)).toBe(pickHue(b));
    });

    it('still obeys a colour the user actually named', () => {
        // «أزرق» is an instruction, not a suggestion — the band must not move it.
        expect(pickHue('موقع لشركة تقنية بلون أزرق')).toBe(218);
        expect(pickHue('a green tech startup site')).toBe(152);
    });

    it('every hue in every band still yields an AA palette', () => {
        for (const b of TECH_BRIEFS) {
            const p = buildPalette(b);
            expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe('motion: five arrivals, not one', () => {
    it('spreads briefs across the styles', () => {
        const seen = new Set(TECH_BRIEFS.map(pickRevealStyle));
        expect(seen.size).toBeGreaterThan(2);
    });

    it('is stable per brief', () => {
        for (const b of TECH_BRIEFS) expect(pickRevealStyle(b)).toBe(pickRevealStyle(b));
    });

    it.each(REVEAL_STYLES)('style "%s" starts hidden and ends exactly in place', style => {
        const css = revealCss(style);
        expect(css).toMatch(/\[data-reveal-section\]\{opacity:0/);
        // Ending anywhere but transform:none leaves content displaced forever.
        expect(css).toMatch(/\.is-in\]?\{[^}]*transform:none/);
    });

    it.each(REVEAL_STYLES)('style "%s" leaves content VISIBLE under reduced motion', style => {
        const css = revealCss(style);
        const block = css.slice(css.indexOf('prefers-reduced-motion'));
        expect(block).toMatch(/opacity:1/);
        expect(block).toMatch(/transform:none/);
        expect(block).toMatch(/clip-path:none/);
    });

    it('slides from the reading direction on an RTL page', () => {
        const css = revealCss('slide');
        expect(css).toContain('--reveal-dir');
        expect(css).toMatch(/\[dir="rtl"\]\{--reveal-dir:-1\}/);
    });
});

describe('type: the fallback is a choice, not a constant', () => {
    it('gives unrecognised briefs more than one pairing', () => {
        const briefs = [
            'موقع لمشتل نباتات', 'صفحة لنادي قراءة', 'موقع لورشة نجارة',
            'صفحة لفرقة موسيقية', 'موقع لمغسلة سيارات', 'صفحة لمربي نحل',
        ];
        const seen = new Set(briefs.map(b => pickTypePair(b).note));
        expect(seen.size).toBeGreaterThan(1);
    });

    it('is stable per brief', () => {
        expect(pickTypePair('موقع لمشتل نباتات').note).toBe(pickTypePair('موقع لمشتل نباتات').note);
    });

    it('a sector match still wins — a law firm gets its serif', () => {
        expect(pickTypePair('موقع مكتب محاماة').note).toBe('serif authority');
    });
});
