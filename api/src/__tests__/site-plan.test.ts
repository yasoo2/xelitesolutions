/**
 * Planning a site of linked pages.
 *
 * Joe built exactly one HTML file, while the header of a "complete store" said
 * «المنتجات · من نحن · تواصل» and every one of those links went nowhere. These
 * tests cover the decision (when is a site warranted), the shared navigation,
 * and the check that the links between Joe's own pages actually resolve.
 */

import { planSite, siteNav, siteNavCss, verifyInternalLinks, targetPage } from '../core/design/site-plan';

describe('planSite decides, and says why', () => {
    it.each([
        ['اعمل موقع كامل لمتجر عطور', 'store'],
        ['ابن متجر كامل من عدة صفحات', 'store'],
        ['build a full website for a restaurant', 'restaurant'],
        ['موقع متعدد الصفحات لشركة برمجيات', 'landing'],
    ])('builds a site for %s', (request, kind) => {
        const plan = planSite(kind as any, request, true);
        expect(plan.multiPage).toBe(true);
        expect(plan.pages.length).toBeGreaterThan(2);
        expect(plan.pages[0].file).toBe('index.html');
        expect(plan.reason).toContain('linked pages');
    });

    it.each([
        ['اعمل صفحة هبوط لشركة', 'landing'],
        ['ابن متجر', 'store'],
        ['a landing page for a clinic', 'landing'],
    ])('stays on one page for %s, because N pages costs N times the model calls', (request, kind) => {
        const plan = planSite(kind as any, request, true);
        expect(plan.multiPage).toBe(false);
        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0].file).toBe('index.html');
        expect(plan.reason).toMatch(/single page/);
    });

    it('honours an explicit request for a single page even when it says "موقع"', () => {
        expect(planSite('store', 'اعمل موقع كامل لكن صفحة واحدة فقط', true).multiPage).toBe(false);
    });

    it('does not invent a site shape for a kind that is one page by nature', () => {
        const plan = planSite('dashboard', 'اعمل موقع كامل لوحة تحكم', true);
        expect(plan.multiPage).toBe(false);
        expect(plan.reason).toMatch(/single page by nature/);
    });

    it('every planned page has a distinct filename and a purpose to write to', () => {
        const plan = planSite('store', 'موقع كامل لمتجر', true);
        expect(new Set(plan.pages.map(p => p.file)).size).toBe(plan.pages.length);
        for (const p of plan.pages.slice(1)) {
            expect(p.file).toMatch(/^[a-z-]+\.html$/);
            expect(p.purpose.length).toBeGreaterThan(10);
        }
    });

    it('titles follow the language of the request', () => {
        expect(planSite('store', 'موقع كامل', true).pages.map(p => p.title)).toContain('المنتجات');
        expect(planSite('store', 'full site', false).pages.map(p => p.title)).toContain('Products');
    });
});

describe('the shared navigation', () => {
    const pages = planSite('store', 'موقع كامل لمتجر', true).pages;
    const nav = siteNav(pages, 'products.html', 'دار العُود');

    it('links to every page in the plan', () => {
        for (const p of pages) expect(nav).toContain(`href="${p.file}"`);
    });

    it('marks the page you are on', () => {
        expect(nav).toMatch(/href="products\.html"\s+aria-current="page"/);
        expect((nav.match(/aria-current="page"/g) || []).length).toBe(1);
    });

    it('never emits a dead href', () => {
        expect(nav).not.toMatch(/href="#"/);
        expect(nav).not.toMatch(/href=""/);
    });

    it('escapes a brand name instead of letting it break the header', () => {
        const evil = siteNav(pages, 'index.html', 'A <script>alert(1)</script> "shop"');
        expect(evil).not.toContain('<script>');
        expect(evil).toContain('&lt;script&gt;');
    });

    it('ships styling for the active state, so "you are here" is visible', () => {
        const css = siteNavCss();
        expect(css).toContain('aria-current="page"');
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });
});

describe('verifyInternalLinks', () => {
    const page = (links: string[]) => `<html><body><nav>${links.map(h => `<a href="${h}">x</a>`).join('')}</nav></body></html>`;

    it('passes when every internal link lands on a file that exists', () => {
        const files = new Map([
            ['index.html', page(['products.html', 'about.html'])],
            ['products.html', page(['index.html'])],
            ['about.html', page(['index.html'])],
        ]);
        const r = verifyInternalLinks(files);
        expect(r.dead).toEqual([]);
        expect(r.checked).toBe(4);
    });

    it('names the page and the href when a link goes nowhere', () => {
        const files = new Map([
            ['index.html', page(['products.html', 'missing.html'])],
            ['products.html', page(['index.html'])],
        ]);
        const r = verifyInternalLinks(files);
        expect(r.dead).toEqual([{ from: 'index.html', href: 'missing.html' }]);
    });

    it('ignores anchors, external links, mail and tel', () => {
        const files = new Map([['index.html', page(['#section', 'https://example.org', 'mailto:a@b.c', 'tel:+123'])]]);
        const r = verifyInternalLinks(files);
        expect(r.checked).toBe(0);
        expect(r.dead).toEqual([]);
    });

    it('resolves a link that carries an anchor or a query', () => {
        const files = new Map([
            ['index.html', page(['products.html#top', 'about.html?ref=nav'])],
            ['products.html', ''], ['about.html', ''],
        ]);
        expect(verifyInternalLinks(files).dead).toEqual([]);
    });
});

describe('targetPage picks which page a follow-up is about', () => {
    const pages = planSite('store', 'موقع كامل لمتجر', true).pages;
    const file = (req: string) => targetPage(req, pages)?.file ?? null;

    it.each([
        ['عدّل صفحة المنتجات', 'products.html'],
        ['غيّر النص في «من نحن»', 'about.html'],
        ['أضف خريطة في صفحة التواصل', 'contact.html'],
        ['حسّن الصفحة الرئيسية', 'index.html'],
        ['edit products.html', 'products.html'],
        ['change the contact page', 'contact.html'],
    ])('%s -> %s', (req, expected) => expect(file(req as string)).toBe(expected));

    it.each([
        'اجعل الخط أكبر',
        'غيّر ألوان الموقع',
        'حسّن التصميم',
    ])('returns null for %s, so the caller uses the entry page instead of guessing', (req) => {
        expect(targetPage(req, pages)).toBeNull();
    });

    it('refuses to choose when two pages match equally', () => {
        expect(targetPage('عدّل من نحن وتواصل معنا', pages)).toBeNull();
    });

    it('does not match a page that is not in this site', () => {
        const small = planSite('blog', 'موقع كامل لمدونة', true).pages;
        expect(targetPage('عدّل صفحة المنتجات', small)).toBeNull();
    });
});
