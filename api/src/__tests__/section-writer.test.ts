/**
 * Writing a page one section at a time, and editing one section of a page.
 *
 * Both exist because a real page does not fit in one completion. Both take
 * whatever a weak model returns and have to make a valid document out of it, so
 * the interesting cases are all the ways a model gets it wrong.
 */

import { planSections, extractSection, assemblePage, shouldWriteSectionwise, sectionPrompt, type WrittenSection } from '../core/design/section-writer';
import { splitIntoSections, targetSections, extractEditedSection, spliceSections } from '../core/design/section-editor';
import { blueprintSections, kindLabel, detectPageKind, imageBudget } from '../core/design/blueprints';

describe('planSections', () => {
    const plans = planSections(blueprintSections('store'));

    it('produces one plan per blueprint section, numbered from 1', () => {
        expect(plans.length).toBe(blueprintSections('store').length);
        expect(plans.map(p => p.index)).toEqual(plans.map((_, i) => i + 1));
    });

    it('gives every section a distinct, url-safe id', () => {
        for (const p of plans) expect(p.id).toMatch(/^[a-z0-9-]+$/);
        expect(new Set(plans.map(p => p.id)).size).toBe(plans.length);
    });

    it('cuts ids at word boundaries, never mid-word', () => {
        // "customer-reviews-with-na" was a real anchor a visitor would have seen.
        for (const p of plans) {
            expect(p.id).not.toMatch(/-$/);
            expect(p.id.length).toBeLessThanOrEqual(24);
        }
        expect(plans.map(p => p.id)).toContain('customer-reviews-names');
    });
});

describe('extractSection survives what models actually return', () => {
    const ID = 'product-grid';

    it('accepts clean markup', () => {
        const r = extractSection('<section class="section" id="product-grid"><div class="wrap"><h2>x</h2></div></section>', ID);
        expect(r.ok).toBe(true);
        expect(r.html).toContain('<h2>x</h2>');
    });

    it('strips markdown fences', () => {
        const r = extractSection('```html\n<section class="section"><p>محتوى</p></section>\n```', ID);
        expect(r.ok).toBe(true);
        expect(r.html).not.toContain('```');
    });

    it('keeps only the body when the model returned a whole document', () => {
        const r = extractSection(
            '<!DOCTYPE html><html><head><title>x</title><style>a{}</style></head><body><section><p>محتوى</p></section></body></html>', ID);
        expect(r.ok).toBe(true);
        expect(r.html).not.toMatch(/<html|<head|<style|<!DOCTYPE/i);
        expect(r.html).toContain('محتوى');
    });

    it('closes a section the model left open, rather than discarding usable work', () => {
        const r = extractSection('<section class="section"><div class="wrap"><h2>المنتجات</h2>', ID);
        expect(r.ok).toBe(true);
        expect((r.html.match(/<section/gi) || []).length).toBe((r.html.match(/<\/section>/gi) || []).length);
    });

    it('rejects prose instead of markup', () => {
        const r = extractSection('Sure! Here is the section you asked for.', ID);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/no section markup/i);
    });

    it('rejects an empty response', () => {
        expect(extractSection('   ', ID).ok).toBe(false);
    });

    it('sets the anchor id without producing a duplicate id attribute', () => {
        // A browser keeps the FIRST id, so appending a second one would have
        // pointed every nav link at nothing.
        const r = extractSection('<section class="section" id="whatever-the-model-chose"><p>x</p></section>', ID);
        expect(r.ok).toBe(true);
        expect((r.html.match(/\bid\s*=/g) || []).length).toBe(1);
        expect(r.html).toContain(`id="${ID}"`);
    });

    it('leaves an id that is already correct alone', () => {
        const r = extractSection(`<section id="${ID}" class="section"><p>x</p></section>`, ID);
        expect((r.html.match(/\bid\s*=/g) || []).length).toBe(1);
    });
});

describe('assemblePage', () => {
    const sections: WrittenSection[] = [
        { index: 1, spec: 'header', id: 'site-header', html: '<header id="site-header"><div class="wrap">ر</div></header>', ok: true },
        { index: 2, spec: 'hero', id: 'hero', html: '<section id="hero"><div class="wrap"><h1>ع</h1></div></section>', ok: true },
        { index: 3, spec: 'gone', id: 'missing', html: '', ok: false, reason: 'the model returned nothing' },
    ];
    const page = assemblePage({
        title: 'متجر', isArabic: true, tokenCss: ':root{--brand:#06c}',
        baseLayer: '/* Joe UI kit — base layer */', sections, sprite: '<svg id="sprite"></svg>', script: '<script>1</script>',
    });

    it('produces a closed document with the head Joe controls', () => {
        expect(page).toMatch(/^<!DOCTYPE html>/);
        expect(page).toMatch(/<\/html>\s*$/);
        expect(page).toContain('<meta charset="UTF-8">');
        expect(page).toContain('name="viewport"');
    });

    it('carries the language and direction of the request', () => {
        expect(page).toContain('lang="ar"');
        expect(page).toContain('dir="rtl"');
        expect(assemblePage({ ...{ title: 'x', isArabic: false, tokenCss: '', baseLayer: '', sections: [], sprite: '', script: '' } }))
            .not.toContain('dir="rtl"');
    });

    it('includes only the sections that arrived', () => {
        expect(page).toContain('id="site-header"');
        expect(page).toContain('id="hero"');
        expect(page).not.toContain('id="missing"');
    });

    it('injects the base layer and the token block exactly once', () => {
        expect((page.match(/Joe UI kit/g) || []).length).toBe(1);
        expect((page.match(/--brand:#06c/g) || []).length).toBe(1);
    });

    it('escapes the title instead of letting a brief break the head', () => {
        const p = assemblePage({
            title: 'a <script>alert(1)</script> "quoted"', isArabic: false, tokenCss: '', baseLayer: '',
            sections: [], sprite: '', script: '',
        });
        expect(p).not.toMatch(/<title>[^<]*<script>/);
    });
});

describe('shouldWriteSectionwise', () => {
    const withEnv = (v: string | undefined, fn: () => void) => {
        const old = process.env.JOE_SECTIONWISE;
        if (v === undefined) delete process.env.JOE_SECTIONWISE; else process.env.JOE_SECTIONWISE = v;
        try { fn(); } finally { if (old === undefined) delete process.env.JOE_SECTIONWISE; else process.env.JOE_SECTIONWISE = old; }
    };

    it('is on for long blueprints and off for short ones', () => {
        withEnv(undefined, () => {
            expect(shouldWriteSectionwise(blueprintSections('store'))).toBe(true);
            expect(shouldWriteSectionwise(blueprintSections('landing'))).toBe(true);
            expect(shouldWriteSectionwise(blueprintSections('docs'))).toBe(false);
        });
    });

    it('can be forced either way', () => {
        withEnv('0', () => expect(shouldWriteSectionwise(blueprintSections('store'))).toBe(false));
        withEnv('1', () => expect(shouldWriteSectionwise(blueprintSections('docs'))).toBe(true));
    });
});

describe('sectionPrompt', () => {
    const plans = planSections(blueprintSections('store'));
    const prompt = sectionPrompt({
        plan: plans[3], total: plans.length, kindLabel: kindLabel('store'), request: 'متجر عطور فاخرة',
        isArabic: true, designBrief: '<DESIGN>', written: ['sticky header', 'hero banner'],
        photosLeft: 4, imageSubjects: ['perfume bottle studio'],
    });

    it('states the one section it wants and where it sits', () => {
        expect(prompt).toContain('SECTION 4 OF 8');
        expect(prompt).toContain(plans[3].id);
    });

    it('carries the design system and the business, not just the instruction', () => {
        expect(prompt).toContain('<DESIGN>');
        expect(prompt).toContain('متجر عطور فاخرة');
    });

    it('names what has already been written so the page does not repeat itself', () => {
        expect(prompt).toContain('sticky header');
        expect(prompt).toContain('hero banner');
    });

    it('asks for Arabic copy on an Arabic build', () => {
        expect(prompt).toMatch(/natural Arabic/i);
    });

    it('does not offer a photo budget to a page type that takes no photographs', () => {
        const noPhotos = sectionPrompt({
            plan: plans[0], total: 1, kindLabel: kindLabel('dashboard'), request: 'لوحة تحكم',
            isArabic: true, designBrief: '', written: [], photosLeft: 0, imageSubjects: [],
        });
        expect(noPhotos).toMatch(/No photographs/i);
        expect(imageBudget('dashboard')).toBe(0);
    });
});

/* ---------- editing ---------------------------------------------------------- */

const storePage = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><style>a{}</style></head><body>
<header class="site-header" id="sticky-header"><div class="wrap"><nav><a href="#pricing">الأسعار</a></nav></div></header>
<section class="hero" id="hero-banner"><div class="wrap"><h1>عطور تُروى</h1></div></section>
<section class="section" id="product-grid"><div class="wrap"><h2>منتجاتنا</h2><div class="card">أ</div><div class="card">ب</div></div></section>
<section class="section" id="pricing"><div class="wrap"><h2>الباقات</h2><div class="card">الفضية ٢٩٩</div><div class="card">الذهبية ٥٩٩</div></div></section>
<section class="section" id="customer-reviews"><div class="wrap"><h2>آراء العملاء</h2><div class="card">سارة</div></div></section>
<footer id="site-footer"><div class="wrap"><p>©</p></div></footer>
</body></html>`;

describe('splitIntoSections', () => {
    const secs = splitIntoSections(storePage);

    it('finds every top-level block in document order', () => {
        expect(secs.map(s => s.id)).toEqual([
            'sticky-header', 'hero-banner', 'product-grid', 'pricing', 'customer-reviews', 'site-footer',
        ]);
    });

    it('captures each block whole, with its headings', () => {
        const pricing = secs.find(s => s.id === 'pricing')!;
        expect(pricing.html).toMatch(/^<section/);
        expect(pricing.html).toMatch(/<\/section>$/);
        expect(pricing.headings).toContain('الباقات');
        expect(pricing.html).toContain('الذهبية ٥٩٩');
    });

    it('records offsets that address the original document exactly', () => {
        for (const s of secs) expect(storePage.slice(s.start, s.end)).toBe(s.html);
    });

    it('handles nested same-tag blocks without stopping at the first close', () => {
        const nested = '<section id="outer"><div><section id="inner"><p>x</p></section></div><p>tail</p></section>';
        const out = splitIntoSections(nested);
        expect(out.length).toBe(1);
        expect(out[0].id).toBe('outer');
        expect(out[0].html).toContain('tail');
    });

    it('ignores an unterminated block rather than swallowing the rest of the page', () => {
        expect(splitIntoSections('<section id="broken"><p>x</p>')).toEqual([]);
    });
});

describe('targetSections', () => {
    const secs = splitIntoSections(storePage);
    const ids = (req: string) => targetSections(req, secs).map(s => s.id);

    it.each([
        ['غيّر ألوان الأزرار في قسم الأسعار', ['pricing']],
        ['أضف تقييم بالنجوم لآراء العملاء', ['customer-reviews']],
        ['زد عدد المنتجات في الشبكة', ['product-grid']],
        ['عدّل الفوتر ليحوي روابط التواصل', ['site-footer']],
        ['change the pricing section', ['pricing']],
    ])('%s -> %s', (req, expected) => expect(ids(req as string)).toEqual(expected));

    it('finds the section by a heading the user quoted', () => {
        expect(ids('غيّر عنوان «عطور تُروى»')).toEqual(['hero-banner']);
    });

    it.each([
        'اجعل كل الصفحة أغمق',
        'اجعل الخط أكبر',
        'حسّن التصميم',
        'make the whole page darker',
    ])('falls back to a whole-page edit for %s', (req) => {
        expect(ids(req)).toEqual([]);
    });

    it('refuses rather than guessing when a request would touch most of the page', () => {
        expect(ids('عدّل الأسعار والمنتجات والآراء والفوتر والهيدر')).toEqual([]);
    });
});

describe('extractEditedSection', () => {
    const pricing = splitIntoSections(storePage).find(s => s.id === 'pricing')!;

    it('accepts a fenced, complete replacement', () => {
        const r = extractEditedSection(
            '```html\n' + pricing.html.replace('</div></section>', '<div class="card">البلاتينية ٩٩٩</div></div></section>') + '\n```',
            pricing);
        expect(r.ok).toBe(true);
        expect(r.html).toContain('البلاتينية');
    });

    it('rejects a section that came back a fraction of its size — that is forgetting, not editing', () => {
        const r = extractEditedSection('<section id="pricing"></section>', pricing);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/came back \d+% of its size/);
    });

    it('rejects unbalanced tags', () => {
        expect(extractEditedSection('<section id="pricing"><div>x</div>', pricing).ok).toBe(false);
    });

    it('rejects prose', () => {
        expect(extractEditedSection('Sure, here you go', pricing).ok).toBe(false);
    });

    it('rejects an empty answer', () => {
        expect(extractEditedSection('', pricing).ok).toBe(false);
    });
});

describe('spliceSections', () => {
    const secs = splitIntoSections(storePage);
    const pricing = secs.find(s => s.id === 'pricing')!;
    const grid = secs.find(s => s.id === 'product-grid')!;

    it('replaces one section and leaves every other byte alone', () => {
        const replacement = pricing.html.replace('الذهبية ٥٩٩', 'الذهبية ٦٩٩');
        const out = spliceSections(storePage, [{ section: pricing, html: replacement }]);
        expect(out).toContain('الذهبية ٦٩٩');
        expect(out).not.toContain('الذهبية ٥٩٩');
        for (const other of secs.filter(s => s.id !== 'pricing')) expect(out).toContain(other.html);
        expect(splitIntoSections(out).map(s => s.id)).toEqual(secs.map(s => s.id));
    });

    it('applies several edits without corrupting offsets', () => {
        const out = spliceSections(storePage, [
            { section: grid, html: grid.html.replace('منتجاتنا', 'كل المنتجات') },
            { section: pricing, html: pricing.html.replace('الباقات', 'خططنا') },
        ]);
        expect(out).toContain('كل المنتجات');
        expect(out).toContain('خططنا');
        expect(splitIntoSections(out).length).toBe(secs.length);
        expect(out).toMatch(/<\/html>\s*$/);
    });

    it('keeps the document parseable when the replacement is longer than the original', () => {
        const big = pricing.html.replace('</div></section>', '<div class="card">x</div>'.repeat(20) + '</div></section>');
        const out = spliceSections(storePage, [{ section: pricing, html: big }]);
        expect(splitIntoSections(out).map(s => s.id)).toEqual(secs.map(s => s.id));
    });
});

describe('detectPageKind decides what is being built', () => {
    it.each([
        ['ابن لي متجر إلكتروني لبيع العطور', 'store'],
        ['اعمل مطعم إيطالي مع قائمة الطعام', 'restaurant'],
        ['أريد لوحة تحكم للمبيعات', 'dashboard'],
        ['صفحة هبوط لشركة برمجيات', 'landing'],
        ['معرض أعمالي كمصور', 'portfolio'],
        ['مدونة شخصية', 'blog'],
        ['صفحة مؤتمر تقني', 'event'],
        ['توثيق الـ API', 'docs'],
    ])('%s -> %s', (req, kind) => expect(detectPageKind(req as string)).toBe(kind));

    it('does not read a sales dashboard as a shop just because «مبيعات» contains «بيع»', () => {
        expect(detectPageKind('لوحة تحكم مبيعات')).toBe('dashboard');
    });

    it('survives Arabic spelling variation', () => {
        expect(detectPageKind('انشيء متجر')).toBe('store');
        expect(detectPageKind('انشئ متجر')).toBe('store');
    });
});
