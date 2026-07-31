/**
 * Three defects found by reading a page Joe actually shipped.
 *
 * The build reported 81/100 visually and 40/100 on interaction, and named the
 * cause itself:
 *
 *     أخطاء JavaScript: Identifier 'cards' has already been declared
 *     4 من 10 أزرار لا تفعل شيئًا عند الضغط
 *
 * Those are one defect, not two. The page is written section by section, each
 * section's <script> is spliced into the document at top level, and two sections
 * both opened with `const cards = document.querySelectorAll('.card')`. A
 * duplicate top-level `const` is a SyntaxError, and a SyntaxError in one script
 * tag is not contained to that tag's feature — the parse fails, and with it goes
 * every control on the page, including Joe's own runtimes.
 *
 * The other two came from the same page: a <title> that was the user's prompt
 * truncated mid-word, and an accessibility "fix" that painted white text onto a
 * near-white surface.
 */

import { extractSection, assemblePage } from '../core/design/section-writer';
import { splitIntoSections, sectionsForFindings, spliceSections } from '../core/design/section-editor';
import { reviewHtml } from '../core/quality/html-qa';
import { brandFrom, pageTitle } from '../core/design/page-head';

const sectionWithScript = (id: string, decl: string) =>
    `<section class="section" id="${id}"><div class="wrap"><div class="card">x</div></div>
<script>
  ${decl}
  cards.forEach(function (c) { c.addEventListener('mouseover', function () { c.dataset.hot = '1'; }); });
</script>
</section>`;

/** Evaluate the page's inline scripts the way a browser parses them: together. */
const parsesAsOneDocument = (html: string) => {
    const bodies = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    try {
        // Not executed — only parsed. A duplicate top-level declaration is a
        // SyntaxError at parse time, which is exactly the failure being tested.
        new Function(bodies.join('\n'));
        return { ok: true, error: '' };
    } catch (e: any) {
        return { ok: false, error: String(e && e.message) };
    }
};

describe('two sections cannot break each other\'s JavaScript', () => {
    it('survives the exact collision the shipped page died on', () => {
        // Both sections legitimately wanted "the cards in my section". Neither
        // is wrong on its own; the page is what breaks.
        const a = extractSection(sectionWithScript('services', "const cards = document.querySelectorAll('.card');"), 'services');
        const b = extractSection(sectionWithScript('testimonials', "const cards = document.querySelectorAll('.card');"), 'testimonials');
        expect(a.ok && b.ok).toBe(true);

        const page = assemblePage({
            title: 'T', isArabic: true, tokenCss: ':root{}', baseLayer: '',
            sections: [{ index: 1, spec: 's', id: 'services', ...a }, { index: 2, spec: 't', id: 'testimonials', ...b }],
            sprite: '', script: '',
        });

        const parsed = parsesAsOneDocument(page);
        expect(parsed.error).not.toMatch(/already been declared/);
        expect(parsed.ok).toBe(true);
    });

    it.each([
        ['const', "const cards = document.querySelectorAll('.card');"],
        ['let', "let cards = document.querySelectorAll('.card');"],
        ['class', 'class Widget {}\nvar cards = [];'],
        ['function', 'function init() { }\nvar cards = [];'],
    ])('a repeated top-level %s in two sections does not throw', (_label, decl) => {
        const a = extractSection(sectionWithScript('one', decl), 'one');
        const b = extractSection(sectionWithScript('two', decl), 'two');
        const page = assemblePage({
            title: 'T', isArabic: false, tokenCss: '', baseLayer: '',
            sections: [{ index: 1, spec: 'a', id: 'one', ...a }, { index: 2, spec: 'b', id: 'two', ...b }],
            sprite: '', script: '',
        });
        expect(parsesAsOneDocument(page).ok).toBe(true);
    });

    it('leaves the section markup itself untouched', () => {
        const got = extractSection(sectionWithScript('svc', 'const cards = [];'), 'svc');
        expect(got.html).toContain('<div class="card">x</div>');
        expect(got.html).toContain('id="svc"');
    });

    it('does not touch a JSON-LD block, which is data and not code', () => {
        const raw = `<section class="section" id="s"><div class="wrap">x</div>
<script type="application/ld+json">{"@context":"https://schema.org"}</script></section>`;
        const got = extractSection(raw, 's');
        expect(got.html).toContain('{"@context":"https://schema.org"}');
        expect(got.html).not.toMatch(/ld\+json[^>]*>\s*\(function/);
    });

    it('keeps a script that was already wrapped working', () => {
        const raw = `<section class="section" id="s"><div class="wrap">x</div>
<script>(function(){ var n = 1; })();</script></section>`;
        const got = extractSection(raw, 's');
        expect(parsesAsOneDocument(got.html).ok).toBe(true);
    });
});

describe('the page title is a title, not the prompt', () => {
    const request = 'ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة مختصة بالاستشارات البرمجية';

    it('never ships the raw request truncated mid-word', () => {
        // What the shipped page actually had in its <title>:
        //   "ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة "
        const title = pageTitle({ request, isArabic: true, kindLabel: 'landing' });
        expect(title).not.toContain('ابني');
        expect(title).not.toBe(request.slice(0, 60));
        expect(title.trim()).toBe(title);
        expect(title.length).toBeLessThanOrEqual(70);
    });

    it('leads with the brand name when the request names one', () => {
        expect(pageTitle({ request, isArabic: true, kindLabel: 'landing' })).toContain('xelitesolutions');
    });

    it.each([
        ['اسمها', 'شركة اسمها xelitesolutions تعمل في البرمجة', 'xelitesolutions'],
        ['اسمه', 'متجر اسمه نجمة الشرق لبيع العطور', 'نجمة الشرق'],
        ['«quoted»', 'ابن لي موقعًا لشركة «الرؤية الرقمية» للاستشارات', 'الرؤية الرقمية'],
        ['called', 'build a site for a company called Northwind Consulting', 'Northwind Consulting'],
        ['named', 'a landing page for a startup named Acme Labs', 'Acme Labs'],
    ])('reads the brand out of a request that uses %s', (_label, req, expected) => {
        expect(brandFrom(req, /[؀-ۿ]/.test(req))).toBe(expected);
    });

    it('says so plainly when no brand can be read, rather than inventing one', () => {
        expect(brandFrom('ابن لي صفحة هبوط جميلة', true)).toBe('');
        expect(pageTitle({ request: 'build me a nice landing page', isArabic: false, kindLabel: 'landing' }))
            .not.toMatch(/build me/i);
    });
});

describe('the contrast safety net must not create the failure it prevents', () => {
    const page = (css: string) => `<!DOCTYPE html><html lang="en"><head><style>${css}</style></head>
<body><main><h1>t</h1><table><thead><tr><th>Plan</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table></main></body></html>`;

    it('leaves a 6% brand TINT alone — white on it is invisible', () => {
        // Shipped verbatim, and this is what the page carried:
        //   th{background:color-mix(in srgb,var(--brand) 6%,transparent);…color:var(--on-brand);}
        // --on-brand is #ffffff. Every table header on the page disappeared.
        const out = reviewHtml(page('th{background:color-mix(in srgb,var(--brand) 6%,transparent);font-weight:650}'), false);
        expect(out.html).not.toMatch(/th\{[^}]*color:var\(--on-brand\)/);
    });

    it('still recolours a SOLID brand fill, which is what it exists for', () => {
        const out = reviewHtml(page('.band{background:var(--brand);padding:2rem}'), false);
        expect(out.html).toMatch(/\.band\{[^}]*color:var\(--on-brand\)/);
    });

    it('recolours a brand gradient too', () => {
        const out = reviewHtml(page('.hero{background:linear-gradient(135deg,var(--brand),var(--brand-dark))}'), false);
        expect(out.html).toMatch(/\.hero\{[^}]*color:var\(--on-brand\)/);
    });

    it('recolours a mix that is mostly brand', () => {
        const out = reviewHtml(page('.cta{background:color-mix(in srgb,var(--brand) 88%,black)}'), false);
        expect(out.html).toMatch(/\.cta\{[^}]*color:var\(--on-brand\)/);
    });

    it('never overrides a colour the author already set', () => {
        const out = reviewHtml(page('.band{background:var(--brand);color:#123456}'), false);
        expect(out.html).toContain('color:#123456');
        expect(out.html).not.toMatch(/\.band\{[^}]*--on-brand/);
    });
});

describe('a page too large to return whole is repaired section by section', () => {
    /** A page shaped like the one that shipped: a header, three sections, a footer. */
    const doc = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>t</title></head><body>
<header class="site-header" id="nav"><div class="wrap"><nav><a href="/about">من نحن</a>
<button class="cta">تسجيل دخول</button><button class="cta">تسجيل</button></nav></div></header>
<section class="section" id="hero"><div class="wrap"><h1>عنوان</h1><a class="btn" href="/contact">ابدأ الآن</a></div></section>
<section class="section" id="pricing"><div class="wrap"><h2>الأسعار</h2>
<button class="btn">Sign up</button><button class="btn">Sign up</button></div></section>
<section class="section" id="faq"><div class="wrap"><h2>أسئلة</h2><details><summary>س</summary><p>ج</p></details></div></section>
<footer><div class="wrap"><p>&copy; 2026</p></div></footer>
</body></html>`;

    const sections = splitIntoSections(doc);

    it('finds the sections holding the controls the browser said were dead', () => {
        // These are the labels the shipped build actually reported:
        //   «تسجيل»، «Sign up»، «Sign up»
        const got = sectionsForFindings(sections, ['تسجيل', 'Sign up', 'Sign up']);
        const ids = got.map(s => s.id);

        expect(ids).toContain('pricing');
        expect(ids).toContain('nav');
        // The sections with no dead control in them are not rewritten — every
        // section handed to the model is a section that can come back worse.
        expect(ids).not.toContain('faq');
    });

    it('returns them in document order, so the splice cannot cross itself', () => {
        const got = sectionsForFindings(sections, ['تسجيل', 'Sign up']);
        expect(got.map(s => s.index)).toEqual([...got.map(s => s.index)].sort((a, b) => a - b));
    });

    it('gives up rather than rewriting most of the document', () => {
        // If a probe matches nearly everything, this is the whole-page repair
        // with extra steps — and more chances to corrupt the splice.
        expect(sectionsForFindings(sections, ['wrap'])).toEqual([]);
    });

    it('gives up when nothing matches, so the caller can report honestly', () => {
        expect(sectionsForFindings(sections, ['a label that is not on this page'])).toEqual([]);
        expect(sectionsForFindings(sections, [])).toEqual([]);
        expect(sectionsForFindings([], ['تسجيل'])).toEqual([]);
    });

    it('splices a repaired section back without disturbing the rest', () => {
        const target = sections.find(s => s.id === 'pricing')!;
        const repaired = target.html.replace(/Sign up/g, 'اشترك الآن');

        const out = spliceSections(doc, [{ section: target, html: repaired }]);

        expect(out).toContain('اشترك الآن');
        expect(out).not.toContain('Sign up');
        // Everything outside the repaired section is byte-identical.
        expect(out).toContain('<section class="section" id="faq">');
        expect(out).toContain('تسجيل دخول');
        expect(out).toContain('<h1>عنوان</h1>');
        expect(splitIntoSections(out).length).toBe(sections.length);
    });
});
