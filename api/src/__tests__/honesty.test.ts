/**
 * The rules that stop Joe reporting things that did not happen.
 *
 * Each block here corresponds to a defect that was found in the running system,
 * not to a hypothetical. They are grouped together because they are one rule
 * wearing different clothes: an operation that failed, was skipped, or was never
 * attempted must never be presented as a fact.
 */

import { isProviderFailure, PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';
import { licenceAllows, availableSources } from '../core/design/photo-sources';
import { findReferenceUrl, paletteFromReference, referenceSummary } from '../core/design/reference';
import { buildPalette } from '../core/design/design-system';
import { isSpecificEnough, groundSubject, buildImageBrief, scoreCandidate } from '../core/design/image-brief';

describe('a provider failure is never mistaken for content', () => {
    it('recognises the router\'s no-provider notice', () => {
        // ai_write_file wrote this very string into a source file as its
        // contents, and the page builder would have shipped it as a website.
        expect(isProviderFailure(PROVIDER_FAILURE_PREFIX + ' (لم يستجب أي مزوّد). لم أستطع تنفيذ الطلب.')).toBe(true);
        expect(isProviderFailure('\n  ' + PROVIDER_FAILURE_PREFIX + ' ولم يُنفَّذ الطلب.')).toBe(true);
    });

    it('does not flag real content that merely mentions a warning', () => {
        expect(isProviderFailure('<!DOCTYPE html><html>…</html>')).toBe(false);
        expect(isProviderFailure('نص عادي فيه ⚠️ تحذير في منتصفه')).toBe(false);
        expect(isProviderFailure('')).toBe(false);
        expect(isProviderFailure(null)).toBe(false);
        expect(isProviderFailure(undefined)).toBe(false);
        expect(isProviderFailure(123)).toBe(false);
    });
});

describe('photo licences that forbid the use are refused at the source', () => {
    it.each([
        ['CC0', true], ['BY', true], ['BY-SA', true], ['CC BY-SA 4.0', true],
        ['Public domain', true], ['', true],
    ])('allows %s', (lic, expected) => expect(licenceAllows(lic as string)).toBe(expected));

    it.each([
        ['BY-NC', 'commercial use is forbidden and a business site is commercial'],
        ['BY-NC-ND', 'both clauses fail'],
        ['CC BY-ND 3.0', 'no-derivatives forbids the cropping every layout does'],
        ['Fair use', 'not a licence Joe can grant'],
    ])('refuses %s (%s)', (lic) => expect(licenceAllows(lic as string)).toBe(false));

    it('names the archives that are dormant instead of quietly using fewer', () => {
        const { active, dormant } = availableSources();
        expect(active).toContain('openverse');
        expect(active).toContain('wikimedia');
        // Without keys these must be reported as dormant, never silently dropped.
        const names = dormant.map(d => d.name);
        if (!process.env.PEXELS_API_KEY) expect(names).toContain('pexels');
        if (!process.env.UNSPLASH_ACCESS_KEY) expect(names).toContain('unsplash');
        for (const d of dormant) expect(d.needs).toMatch(/_API_KEY|_ACCESS_KEY/);
    });
});

describe('a style reference is only claimed when one was actually asked for', () => {
    it.each([
        ['اعمل صفحة بأسلوب موقع stripe.com', 'https://stripe.com'],
        ['ابن متجر مثل موقع https://www.apple.com/', 'https://www.apple.com/'],
        ['build a landing page inspired by linear.app', 'https://linear.app'],
        ['زي موقع notion.so بالضبط', 'https://notion.so'],
    ])('%s', (req, expected) => expect(findReferenceUrl(req as string)).toBe(expected));

    it.each([
        ['شركتنا اسمها acme.com واريد صفحة تعريفية', 'a bare domain with no style cue is the business, not a reference'],
        ['صفحة عادية بدون مرجع', 'nothing to find'],
        ['راجع http://localhost:5002/artifacts/x.html', 'Joe\'s own preview is not a design reference'],
        ['افتح index.html', 'a filename is not a domain'],
    ])('returns null for %s (%s)', (req) => expect(findReferenceUrl(req as string)).toBeNull());

    it('borrows the hue but re-derives the contrast', () => {
        const fallback = buildPalette('شركة برمجيات');
        const tokens: any = {
            url: 'https://example.org', title: 't', brand: '#635bff', accents: [], backgrounds: [],
            textColors: [], fonts: [], typeScale: [], radius: 18, depth: 'border', contentWidth: 1080, mood: 'light',
        };
        const { palette, borrowed } = paletteFromReference(tokens, fallback);
        expect(borrowed).toBe(true);
        expect(palette.hue).toBeGreaterThan(230);       // the reference's indigo
        expect(palette.hue).toBeLessThan(255);
        expect(palette.primary).not.toBe('#635bff');     // but at an accessible lightness
    });

    it('does not borrow a colourless reference, and says so', () => {
        const fallback = buildPalette('شركة برمجيات');
        const grey: any = { url: 'u', title: '', brand: '#808080', accents: [], backgrounds: [], textColors: [], fonts: [], typeScale: [], radius: 0, depth: 'flat', contentWidth: 0, mood: 'light' };
        const { palette, borrowed } = paletteFromReference(grey, fallback);
        expect(borrowed).toBe(false);
        expect(palette).toBe(fallback);
    });

    it('reports an unreachable reference as unreachable, not as a style it copied', () => {
        const line = referenceSummary('https://example.org', { ok: false, reason: 'the domain does not resolve' }, false);
        expect(line).toMatch(/تعذّرت قراءته/);
        expect(line).toMatch(/the domain does not resolve/);
    });
});

describe('photo subjects are grounded in the business, not in stock-photo filler', () => {
    const brief = buildImageBrief('شركة استشارات برمجية');

    it('builds a vocabulary from what the business actually does', () => {
        expect(brief.suggestions.length).toBeGreaterThan(0);
        expect(brief.vocabulary.length).toBeGreaterThan(0);
    });

    it.each(['business', 'office', 'team', 'people', 'corporate', 'modern', 'business people'])(
        'rejects the generic subject "%s"', (s) => expect(isSpecificEnough(s, brief)).toBe(false));

    it('accepts a subject that names the work', () => {
        expect(isSpecificEnough('software developer pair programming', brief)).toBe(true);
    });

    it('replaces a generic subject with an on-topic one', () => {
        const grounded = groundSubject('business people', brief, 0);
        expect(grounded).not.toBe('business people');
        expect(brief.suggestions).toContain(grounded);
    });

    it('leaves a specific subject untouched', () => {
        const s = 'business consultant strategy meeting';
        expect(groundSubject(s, brief, 0)).toBe(s);
    });

    describe('candidate ranking prefers the right subject in the right shape', () => {
        const relevant = { title: 'Chef plating a dish in a restaurant kitchen', tags: [{ name: 'chef' }, { name: 'kitchen' }] };
        const irrelevant = { title: '7th Army Training Command exercise', tags: [{ name: 'military' }] };

        it('a relevant photo outranks an irrelevant one of the same shape', () => {
            const subject = 'restaurant kitchen chef';
            expect(scoreCandidate(subject, 'hero', relevant, { width: 1600, height: 900 }))
                .toBeGreaterThan(scoreCandidate(subject, 'hero', irrelevant, { width: 1600, height: 900 }));
        });

        it('a correctly shaped photo outranks a portrait for a wide hero', () => {
            const subject = 'restaurant kitchen chef';
            expect(scoreCandidate(subject, 'hero', relevant, { width: 1600, height: 900 }))
                .toBeGreaterThan(scoreCandidate(subject, 'hero', relevant, { width: 800, height: 1600 }));
        });

        it('a large enough photo outranks a thumbnail for a hero', () => {
            const subject = 'restaurant kitchen chef';
            expect(scoreCandidate(subject, 'hero', relevant, { width: 2400, height: 1350 }))
                .toBeGreaterThan(scoreCandidate(subject, 'hero', relevant, { width: 400, height: 225 }));
        });

        it('a square photo is right for a gallery slot and wrong for a banner', () => {
            const square = { width: 1200, height: 1200 };
            expect(scoreCandidate('plated dish', 'gallery', relevant, square))
                .toBeGreaterThan(scoreCandidate('plated dish', 'banner', relevant, square));
        });
    });
});
