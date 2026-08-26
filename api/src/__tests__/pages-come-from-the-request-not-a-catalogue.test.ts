/**
 * THE PAGES COME FROM HIS SENTENCE, NOT FROM A LIST SOMEONE WROTE DOWN.
 *
 * planSite used to hold a catalogue and nothing else. Measured before the fix:
 *
 *   «اعمل لي صفحة هبوط وصفحة تواصل»                     -> 1 page
 *   «صفحة من نحن وصفحة خدمات وصفحة اتصل بنا»            -> 1 page
 *   «اعمل متجر فيه صفحة المنتجات وصفحة الشحن»           -> 1 page
 *   'a pricing page and a docs page'                    -> 1 page
 *   «أريد موقعا كاملا لمطعم» (naming nothing)           -> 4 pages, one of
 *                                                          them a booking
 *                                                          page never asked for
 *
 * Two failures in one: pages he NAMED were dropped, and pages he did NOT name
 * appeared. And the deeper one — a page whose name was on no list could not be
 * produced at all, however plainly he asked for it. `pricing` and `docs` are in
 * no SITE_SHAPES entry anywhere in this file; that is why they are the test.
 *
 * The rule this guards: every page in a plan is there for a stated reason —
 * he named it, or the shape supplied it and the plan SAYS the shape supplied
 * it, or it is the home page to enter from. A page that appears for no stated
 * reason is the catalogue talking.
 */

import { planSite, thePagesHeNamed } from '../core/design/site-plan';

const fold = (s: string) => s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');

describe('he named the pages, so he gets the pages', () => {
    it('two pages in one sentence are two pages', () => {
        const plan = planSite('landing', 'اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف', true);
        expect(plan.multiPage).toBe(true);
        expect(plan.pages.map(p => p.file)).toEqual(['index.html', 'contact.html']);
    });

    it('three named pages are three pages, and the home page is declared as added', () => {
        const plan = planSite('landing', 'ابني موقع شركة فيه صفحة من نحن وصفحة خدمات وصفحة اتصل بنا', true);
        expect(plan.pages.map(p => p.file)).toEqual(['index.html', 'about.html', 'services.html', 'contact.html']);
        expect(plan.reason).toContain('3 named in the request');
        expect(plan.reason).toContain('home page');
    });

    it('a page on no list is still built, and keeps the words he used', () => {
        const plan = planSite('landing', 'اعمل صفحة سياسة الخصوصية وصفحة الشروط', true);
        expect(plan.multiPage).toBe(true);
        const titles = plan.pages.map(p => p.title);
        expect(titles).toContain('سياسة الخصوصية');
        expect(titles).toContain('الشروط');
    });

    it('English names that appear in NO site shape are produced anyway', () => {
        const plan = planSite('landing', 'Build a site with a pricing page and a docs page', false);
        const files = plan.pages.map(p => p.file);
        expect(files).toContain('pricing.html');
        expect(files).toContain('docs.html');
    });

    it('«الشحن والاسترجاع» is one page, not «الشحن» and a dangling word', () => {
        const plan = planSite('store', 'اعمل متجر فيه صفحة المنتجات وصفحة الشحن والاسترجاع', true);
        expect(plan.pages.map(p => p.file)).toEqual(['index.html', 'products.html', 'shipping.html']);
        expect(plan.pages.find(p => p.file === 'shipping.html')!.title).toBe('الشحن والاسترجاع');
    });

    it('one named page keeps his title instead of being renamed «الرئيسية»', () => {
        const plan = planSite('landing', 'اعمل صفحة سياسة الخصوصية', true);
        expect(plan.multiPage).toBe(false);
        expect(plan.pages[0].file).toBe('index.html');
        expect(plan.pages[0].title).toBe('سياسة الخصوصية');
    });
});

describe('and the reader does NOT invent pages he never named', () => {
    it.each([
        ['اعمل لي صفحة واحدة فقط', 'a count is not a name'],
        ['موقع من عدة صفحات', '«صفحات» plural is not a page called «عدة»'],
        ['I want multiple pages', 'the counting word before «pages» is not a name'],
        ['أريد موقعا كاملا لمطعم', 'no page is named at all'],
        ['اعمل موقع كامل لمتجر عطور', 'the kind is not a page name'],
    ])('%s — %s', (request) => {
        expect(thePagesHeNamed(fold(request))).toEqual([]);
    });

    it('a request that names nothing gets the shape, and the plan SAYS it is a default', () => {
        const plan = planSite('restaurant', 'أريد موقعا كاملا لمطعم', true);
        expect(plan.multiPage).toBe(true);
        expect(plan.reason).toContain('named no pages');
        expect(plan.reason).toContain('default shape');
    });

    it('«صفحة واحدة» still outranks a request that also says «موقع كامل»', () => {
        expect(planSite('store', 'اعمل موقع كامل لكن صفحة واحدة فقط', true).multiPage).toBe(false);
    });
});

describe('the class: no page appears without a stated reason', () => {
    const CASES: Array<[string, any, boolean]> = [
        ['اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف', 'landing', true],
        ['ابني موقع شركة فيه صفحة من نحن وصفحة خدمات وصفحة اتصل بنا', 'landing', true],
        ['اعمل متجر فيه صفحة المنتجات وصفحة الشحن والاسترجاع', 'store', true],
        ['أريد موقعا كاملا لمطعم', 'restaurant', true],
        ['اعمل موقع كامل لمتجر عطور', 'store', true],
        ['Build a site with a pricing page and a docs page', 'landing', false],
    ];

    it.each(CASES)('%s', (request, kind, isArabic) => {
        const plan = planSite(kind, request, isArabic);
        const named = thePagesHeNamed(fold(request)).map(n => n.title);
        for (const page of plan.pages) {
            const heNamedIt = named.includes(page.title);
            const itIsTheEntry = page.file === 'index.html';
            //  Anything else must be the shape, and the plan must SAY so.
            const declared = /default shape|shape adds/.test(plan.reason);
            expect(heNamedIt || itIsTheEntry || declared).toBe(true);
        }
    });

    it('when he named pages, every one of them survives into the plan', () => {
        for (const [request, kind, isArabic] of CASES) {
            const named = thePagesHeNamed(fold(request));
            if (named.length < 2) continue;
            const plan = planSite(kind, request, isArabic);
            const titles = plan.pages.map(p => p.title);
            for (const n of named) {
                //  «هبوط» becomes the home page and is titled as one; every
                //  other name he used has to be findable in the plan.
                if (n.slug === 'index') continue;
                expect(titles).toContain(n.title);
            }
        }
    });
});
