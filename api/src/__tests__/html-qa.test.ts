/**
 * The deterministic QA net.
 *
 * Every fix here exists because a measured build shipped the defect: pages in
 * quirks mode, 2456px of horizontal overflow on a phone, text at 2.79:1 on a
 * brand band, forms with no accessible name, icon buttons a screen reader could
 * only call "button".
 *
 * Two properties matter as much as the fixes themselves — it must not damage
 * markup that is already correct, and running it twice must change nothing the
 * second time.
 */

import { reviewHtml, splitHtmlProject } from '../core/quality/html-qa';

const page = (body: string, head = '') => `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ت</title><style>.a{color:#000}</style>${head}</head><body>${body}</body></html>`;

describe('structural fixes', () => {
    it('adds a DOCTYPE, because without one the browser silently uses the 1990s box model', () => {
        const r = reviewHtml('<html><head><meta charset="utf-8"><title>x</title></head><body><p>hi</p></body></html>');
        expect(r.html).toMatch(/^<!DOCTYPE html>/i);
        expect(r.fixed.join(' ')).toMatch(/quirks/i);
    });

    it('adds charset and viewport when they are missing', () => {
        const r = reviewHtml('<!DOCTYPE html><html><head><title>x</title></head><body><p>مرحبا</p></body></html>');
        expect(r.html).toMatch(/charset/i);
        expect(r.html).toMatch(/name=["']viewport["']/i);
    });

    it('sets rtl on an Arabic page', () => {
        const r = reviewHtml('<!DOCTYPE html><html><head><meta charset="utf-8"><title>ت</title></head><body><p>مرحبا</p></body></html>', true);
        expect(r.html).toMatch(/dir=["']rtl["']/);
    });

    it('closes an unterminated document', () => {
        const r = reviewHtml('<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title></head><body><p>hi</p>');
        expect(r.html).toMatch(/<\/body>/i);
        expect(r.html).toMatch(/<\/html>/i);
    });

    it('strips markdown fences a weak model leaves behind', () => {
        const r = reviewHtml('```html\n<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title></head><body><p>hi</p></body></html>\n```');
        expect(r.html).not.toContain('```');
    });

    it('replaces external placeholder image hosts with something self-contained', () => {
        const r = reviewHtml(page('<img src="https://via.placeholder.com/400x300" alt="x">'));
        expect(r.html).not.toContain('via.placeholder.com');
        expect(r.html).toContain('data:image/svg+xml');
    });
});

describe('accessibility fixes', () => {
    it('gives an unlabelled field its placeholder as an accessible name', () => {
        const r = reviewHtml(page('<form><input type="email" placeholder="البريد"></form>'), true);
        expect(r.html).toMatch(/aria-label="البريد"/);
    });

    it('labels fields per field, not all-or-nothing', () => {
        // The original skipped the entire page whenever ANY <label> existed, so a
        // form with one labelled field and five bare ones was left alone.
        const r = reviewHtml(page(`<form>
            <label for="n">الاسم</label><input id="n" type="text">
            <input type="email" placeholder="البريد">
            <textarea placeholder="رسالتك"></textarea>
        </form>`), true);
        expect(r.html).toMatch(/aria-label="البريد"/);
        expect(r.html).toMatch(/aria-label="رسالتك"/);
        // The properly labelled one is left alone.
        expect(r.html).toMatch(/<input id="n" type="text">/);
    });

    it('names an icon-only button from the sprite symbol it draws', () => {
        const r = reviewHtml(page('<button><svg><use href="#i-cart"/></svg></button>'), true);
        expect(r.html).toMatch(/aria-label="السلة"/);
    });

    it('names icon-only controls in the page\'s own language', () => {
        const ar = reviewHtml(page('<a href="#x"><svg><use href="#i-mail"/></svg></a>'), true);
        const en = reviewHtml(page('<a href="#x"><svg><use href="#i-mail"/></svg></a>'), false);
        expect(ar.html).toMatch(/aria-label="البريد"/);
        expect(en.html).toMatch(/aria-label="Email"/);
    });

    it('leaves a control that already has text or a label alone', () => {
        const r = reviewHtml(page('<button aria-label="مضبوط"><svg><use href="#i-cart"/></svg></button><button>أضف للسلة</button>'), true);
        expect(r.html).toMatch(/aria-label="مضبوط"/);
        expect(r.html).not.toMatch(/aria-label="السلة"/);
    });

    it('gives an img with no alt attribute one', () => {
        const r = reviewHtml(page('<img src="a.png"><img src="b.png" title="فريق العمل">'), true);
        expect(r.html).toMatch(/<img src="a.png" alt="">/);
        expect(r.html).toMatch(/alt="فريق العمل"/);
    });

    it('demotes extra h1 elements to h2', () => {
        const r = reviewHtml(page('<h1>الأول</h1><h1>الثاني</h1><h1>الثالث</h1>'), true);
        expect((r.html.match(/<h1\b/g) || []).length).toBe(1);
        expect((r.html.match(/<h2\b/g) || []).length).toBe(2);
        expect(r.html).toContain('<h1>الأول</h1>');
    });

    it('promotes the first heading when a section-wise page ended up with no h1', () => {
        const r = reviewHtml(page('<h2>عنوان القسم</h2><h2>قسم آخر</h2>'), true);
        expect((r.html.match(/<h1\b/g) || []).length).toBe(1);
        expect(r.html).toContain('<h1>عنوان القسم</h1>');
    });

    it('wraps the content in <main> when the page has a header and a footer', () => {
        const r = reviewHtml(page('<header><nav>ن</nav></header><section><h1>ع</h1></section><footer><p>©</p></footer>'), true);
        expect(r.html).toContain('<main>');
        expect(r.html).toContain('</main>');
        expect(r.html.indexOf('<main>')).toBeGreaterThan(r.html.indexOf('</header>'));
        expect(r.html.indexOf('</main>')).toBeLessThan(r.html.indexOf('<footer'));
    });

    it('adds <main> even when the page has no footer', () => {
        // This used to require BOTH a header and a footer, and refuse otherwise.
        // Measured end to end afterwards: four of five page kinds have a header
        // and sections but no <footer>, so they shipped with no landmark at all
        // and a screen-reader user had no way past the navigation. A page with
        // content always has a main region; the only question was where it ends.
        const r = reviewHtml(page('<header><nav>ن</nav></header><section><h1>ع</h1></section>'), true);
        expect(r.html).toContain('<main>');
        expect(r.html.indexOf('<main>')).toBeGreaterThan(r.html.indexOf('</header>'));
        expect(r.html.indexOf('</main>')).toBeLessThan(r.html.indexOf('</body>'));
    });

    it('adds <main> to a page with no header either', () => {
        const r = reviewHtml(page('<section><h1>ع</h1></section>'), true);
        expect(r.html).toContain('<main><section><h1>ع</h1></section></main>'.replace(/</g, '<').slice(0, 6));
        expect(r.html).toMatch(/<main>[\s\S]*<section>[\s\S]*<\/main>/);
    });

    it('does not wrap a body that has nothing to wrap', () => {
        const r = reviewHtml(page('<p>سطر</p>'), true);
        expect(r.html).not.toContain('<main>');
    });

    it('leaves a page that already has a <main> alone', () => {
        const r = reviewHtml(page('<header>ن</header><main><section><h1>ع</h1></section></main>'), true);
        expect((r.html.match(/<main\b/g) || []).length).toBe(1);
    });

    it('NEVER writes <main> into the middle of a JavaScript string', () => {
        // The rule searched the raw document, so on every page with a cart the
        // first `</header>` in the file was inside the cart runtime, which
        // builds its panel with '…</header>' + '<main>' + '…'. The insertion cut
        // that string in half — "Invalid or unexpected token" — and one syntax
        // error stops EVERY script on the page. Measured: the store page threw,
        // and its cart, forms and widgets were all dead.
        const runtime = `<script>var p=document.createElement('div');
p.innerHTML='<aside><header><h2>'+T.title+'</h2></header>'+'<main>'+'<div></div>'+'</main>'+'</aside>';</script>`;
        const r = reviewHtml(page(`<section><h1>ع</h1></section>${runtime}`), true);

        const js = (r.html.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];
        // The only assertion that matters: it still parses.
        expect(() => new Function(js)).not.toThrow();
        // …and the string it was built from was not cut in half.
        expect(js.replace(/\s+/g, '')).toContain(`</header>'+'<main>'`);
    });

    it('does not mistake a <main> inside a script for the page having one', () => {
        const r = reviewHtml(page(`<header>ن</header><section><h1>ع</h1></section><script>var s='<main>x</main>';</script>`), true);
        // The real document still gets its landmark.
        expect(r.html).toMatch(/<\/header>\s*<main>/);
    });
});

describe('layout safety net', () => {
    it('constrains media so a 2048px photo cannot push the document sideways', () => {
        const r = reviewHtml(page('<img src="a.png" alt="a">'));
        expect(r.html).toMatch(/img[^{]*\{[^}]*max-width:100%/);
    });

    it('collapses multi-column grids on mobile when the page declared no width breakpoint', () => {
        const r = reviewHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title>
        <style>.grid{display:grid;grid-template-columns:repeat(3,1fr)}</style></head><body><div class="grid"></div></body></html>`);
        expect(r.html).toMatch(/@media\(max-width:768px\)/);
        expect(r.fixed.join(' ')).toMatch(/collapsed 1 grid/);
    });

    it('leaves grids alone when the author already wrote a width breakpoint', () => {
        const r = reviewHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title>
        <style>.grid{display:grid;grid-template-columns:repeat(3,1fr)}
        @media (max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><div class="grid"></div></body></html>`);
        expect(r.fixed.join(' ')).not.toMatch(/collapsed/);
    });

    it('puts readable text on a branded background', () => {
        const r = reviewHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title>
        <style>.band{background:var(--brand);padding:20px}</style></head><body><div class="band">ن</div></body></html>`);
        expect(r.html).toMatch(/color:var\(--on-brand\)/);
    });
});

describe('it does not damage correct markup', () => {
    const good = page(`<header><nav><a href="#s">خدمات</a></nav></header>
<main><section id="s"><h1>عنوان</h1><p>نص</p>
<form><label for="e">البريد</label><input id="e" type="email" required></form>
<img src="a.png" alt="وصف حقيقي"></section></main><footer><p>©</p></footer>`, '');

    it('reports no remaining issues on a page that is already correct', () => {
        expect(reviewHtml(good, true).issues).toEqual([]);
    });

    it('keeps the author\'s own alt text, labels and heading', () => {
        const out = reviewHtml(good, true).html;
        expect(out).toContain('alt="وصف حقيقي"');
        expect(out).toContain('<label for="e">البريد</label>');
        expect(out).not.toMatch(/aria-label="البريد"/);   // a real <label> already names it
        expect((out.match(/<h1\b/g) || []).length).toBe(1);
    });

    it('is idempotent — a second pass changes nothing', () => {
        const once = reviewHtml(page(`<header><nav>ن</nav></header>
<h1>أ</h1><h1>ب</h1><img src="a.png">
<form><input type="email" placeholder="البريد"></form>
<button><svg><use href="#i-menu"/></svg></button>
<footer><p>©</p></footer>`), true);
        const twice = reviewHtml(once.html, true);
        expect(twice.fixed).toEqual([]);
        expect(twice.html).toBe(once.html);
    });
});

describe('remaining issues are reported rather than silently fixed', () => {
    it('flags placeholder copy it cannot invent a replacement for', () => {
        const r = reviewHtml(page('<p>Lorem ipsum dolor sit amet</p>'));
        expect(r.issues.join(' ')).toMatch(/placeholder/i);
        expect(r.score).toBeLessThan(100);
    });

    it('flags empty src/href', () => {
        expect(reviewHtml(page('<a href="">x</a>')).issues.join(' ')).toMatch(/empty src\/href/i);
    });
});

describe('splitHtmlProject', () => {
    it('extracts inline css and js into real files and links them', () => {
        const r = splitHtmlProject(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title>
        <style>body{margin:0}</style></head><body><p>hi</p><script>console.log(1)</script></body></html>`);
        expect(r.multiFile).toBe(true);
        expect(r.css).toContain('body{margin:0}');
        expect(r.js).toContain('console.log(1)');
        expect(r.indexHtml).toMatch(/<link[^>]+styles\.css/);
        expect(r.indexHtml).toMatch(/<script[^>]+script\.js/);
        expect(r.indexHtml).not.toContain('body{margin:0}');
    });

    it('says so when there is nothing to split out', () => {
        expect(splitHtmlProject('<!DOCTYPE html><html><body><p>hi</p></body></html>').multiFile).toBe(false);
    });
});
