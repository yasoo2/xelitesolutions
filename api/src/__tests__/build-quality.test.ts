/**
 * Build-quality overhaul — locks the SIX defects measured on a real delivered
 * build (an admin dashboard the user photographed and reported):
 *
 *   1. the self-check runtime rendered as visible page text
 *   2. one broken section script killed every control on the page (script.js
 *      is a single file; the first uncaught error aborts the rest)
 *   3. repairs were written to the combined file while the audit URL served
 *      the untouched split folder — every repair "failed" and was reverted
 *   4. the File Explorer mirror wrote into a root the explorer never lists
 *   5. dashboards got zero photographs by design; the model's #i-search icon
 *      did not exist; hand-drawn SVG used var() in presentation attributes
 *      (discarded) and var(--on-brand) inks (white on white)
 *   6. the reply ended at "ask for a change" instead of naming the real next
 *      steps (publish, multi-page, style reference)
 */
import fs from 'fs';
import path from 'path';
import { ensureScriptTags, assemblePage } from '../core/design/section-writer';
import { splitHtmlProject } from '../core/quality/html-qa';
import { imageBudget } from '../core/design/blueprints';
import { iconSprite, normalizeIconRefs } from '../core/design/layouts';
import { sanitizeInlineSvg, labelIconOnlyButtons } from '../core/design/svg-sanity';
import { selfCheckScript } from '../core/design/self-check';

const builderSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
const wsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'WorkspaceService.ts'), 'utf-8');

describe('1 — no runtime can ever render as visible page text', () => {
    test('ensureScriptTags wraps bare JS and leaves wrapped scripts alone', () => {
        const mixed = `<script>var a=1;</script>\n(function(){var leak=true;})();\n<script>var b=2;</script>`;
        const out = ensureScriptTags(mixed);
        // Nothing outside a <script> element survives.
        const residue = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').trim();
        expect(residue).toBe('');
        // The bare part is still there — inside tags now.
        expect(out).toContain('var leak=true');
        expect((out.match(/<script\b/gi) || []).length).toBe(3);
    });

    test('assemblePage output has no JS outside <script> elements, even when handed bare JS', () => {
        const html = assemblePage({
            title: 'T', isArabic: false, tokenCss: ':root{}', baseLayer: 'body{}',
            sections: [{ id: 's1', index: 1, spec: 'hero: x', html: '<section id="s1">hi</section>', ok: true } as any],
            sprite: '<svg style="display:none"></svg>',
            script: `<script>var ok=1;</script>\n(function(){var bare=1;})();`,
        });
        const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1]
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<[^>]+>/g, ' ');
        expect(body).not.toContain('function');
        expect(body).not.toContain('bare');
    });

    test('selfCheckScript is already a complete <script> element', () => {
        expect(selfCheckScript(true).trimStart().startsWith('<script>')).toBe(true);
        expect(selfCheckScript(false).trimEnd().endsWith('</script>')).toBe(true);
    });
});

describe('2 — one broken section script cannot kill the rest of script.js', () => {
    test('each extracted part is fenced in its own try/catch', () => {
        const page = `<!DOCTYPE html><html><head><style>body{}</style></head><body>
<script>null.classList.add('boom');</script>
<script>window.__second_ran = true;</script>
</body></html>`;
        const split = splitHtmlProject(page);
        expect(split.multiFile).toBe(true);
        expect((split.js.match(/try\{/g) || []).length).toBe(2);
        expect((split.js.match(/catch\(e\)/g) || []).length).toBe(2);
        // PROOF by execution: run the concatenated file — the second part must
        // still run even though the first throws.
        const g: any = { __second_ran: false };
        // eslint-disable-next-line no-new-func
        new Function('window', 'console', split.js)(g, { error: () => { } });
        expect(g.__second_ran).toBe(true);
    });

    test('JSON-LD / importmap / module scripts are NOT moved into script.js', () => {
        const page = `<html><head></head><body>
<script type="application/ld+json">{"@type":"Store"}</script>
<script type="module">import x from './x.js';</script>
<script>var plain = 1;</script>
</body></html>`;
        const split = splitHtmlProject(page);
        expect(split.indexHtml).toContain('application/ld+json');
        expect(split.indexHtml).toContain('type="module"');
        expect(split.js).toContain('var plain = 1');
        expect(split.js).not.toContain('@type');
    });
});

describe('3 — repairs are written where the audit URL points', () => {
    test('every repair branch writes through writeOut (combined file + re-split project)', () => {
        // The old bug: fs.writeFileSync(combined) while `url` served the split
        // folder — re-audits measured an unchanged file, and every repair was
        // reverted as "did not improve". No repair branch may write directly.
        const auditsOn = builderSrc.indexOf('[VISUAL AUDIT]');
        expect(auditsOn).toBeGreaterThan(0);
        const afterAudits = builderSrc.slice(auditsOn, builderSrc.indexOf('private async repairSections'));
        expect(afterAudits).not.toMatch(/fs\.writeFileSync\(path\.join\(ARTIFACT_DIR, filename\)/);
        expect((afterAudits.match(/writeOut\(/g) || []).length).toBeGreaterThanOrEqual(8);
        expect(builderSrc).toMatch(/const writeOut = \(h: string\) => \{/);
        expect(builderSrc).toMatch(/writeOut[\s\S]{0,900}splitHtmlProject\(h\)/);
    });
    test('repairSections prefers the caller\'s writer over a raw file write', () => {
        expect(builderSrc).toMatch(/write\?: \(h: string\) => void/);
        expect(builderSrc).toMatch(/if \(write\) write\(out\);/);
    });
});

describe('4 — built files land in the root the File Explorer displays', () => {
    test('WorkspaceService exposes the explorer\'s own root', () => {
        expect(wsSrc).toMatch(/getExplorerRoot\(\): string/);
    });
    test('the mirror uses getExplorerRoot, runs AFTER the audits, and logs failures', () => {
        expect(builderSrc).toMatch(/workspaceService\.getExplorerRoot\(\)/);
        // No mirror may resolve through the tool's workspace context again.
        expect(builderSrc).not.toMatch(/getActiveRoot\(context\?\.workspaceId\)/);
        // Order: the audit passes come BEFORE the mirror block.
        const audit = builderSrc.indexOf('[VISUAL AUDIT]');
        const mirror = builderSrc.indexOf('workspaceService.getExplorerRoot()');
        expect(mirror).toBeGreaterThan(audit);
        expect(builderSrc).toMatch(/explorer mirror failed/);
        // The site path mirrors too — a site was never mirrored at all.
        expect((builderSrc.match(/getExplorerRoot\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });
    test('the chat reply tells the user WHERE the files are', () => {
        expect(builderSrc).toMatch(/في مستعرض الملفات/);
    });
});

describe('5 — dashboards get real images; the sprite covers what models write; SVG is sane', () => {
    test('an admin dashboard has a photo budget (thumbs/avatars), an app screen too', () => {
        expect(imageBudget('dashboard' as any)).toBeGreaterThanOrEqual(3);
        expect(imageBudget('app' as any)).toBeGreaterThanOrEqual(2);
    });
    test('the sprite carries the admin-screen vocabulary — #i-search existed on the page and not in the sprite', () => {
        const sprite = iconSprite();
        for (const id of ['search', 'user', 'settings', 'bell', 'trash', 'edit', 'filter', 'logout', 'plus', 'eye'])
            expect(sprite).toContain(`id="i-${id}"`);
    });
    test('normalizeIconRefs repoints the new names too', () => {
        const r = normalizeIconRefs('<svg class="icon"><use href="#search"/></svg><svg class="icon"><use href="#bell"/></svg>');
        expect(r.fixed).toBe(2);
        expect(r.html).toContain('#i-search');
        expect(r.html).toContain('#i-bell');
    });
    test('var() in an SVG presentation attribute is moved into style, where it is legal', () => {
        const r = sanitizeInlineSvg('<svg viewBox="0 0 100 40"><text x="5" y="10" font-size="var(--step-0)" fill="var(--text)">93</text></svg>');
        expect(r.movedToStyle).toBe(2);
        expect(r.html).not.toMatch(/font-size="var\(/);
        expect(r.html).toMatch(/style="[^"]*font-size:var\(--step-0\)/);
        // Idempotent — running again changes nothing.
        expect(sanitizeInlineSvg(r.html).movedToStyle).toBe(0);
    });
    test('a var(--on-brand) sparkline (white on a white card, 1.05:1) becomes var(--brand)', () => {
        const r = sanitizeInlineSvg('<svg><polyline points="0,10 10,5" style="stroke:var(--on-brand);fill:none"/></svg>');
        expect(r.remappedOnBrand).toBe(1);
        expect(r.html).toContain('stroke:var(--brand)');
        // …but --on-brand OUTSIDE an <svg> (text on a brand band) is untouched.
        const keep = sanitizeInlineSvg('<div style="color:var(--on-brand)">hi</div>');
        expect(keep.remappedOnBrand).toBe(0);
    });
    test('icon-only buttons get an accessible name; named ones are left alone', () => {
        const r = labelIconOnlyButtons(
            '<button class="hx"><svg class="icon"><use href="#i-search"/></svg></button>'
            + '<button aria-label="بحث"><svg class="icon"><use href="#i-search"/></svg></button>'
            + '<button><svg class="icon"><use href="#i-cart"/></svg> السلة</button>', true);
        expect(r.fixed).toBe(1);
        expect(r.html).toContain('aria-label="بحث"');
    });
});

describe('6 — the build ends with executable next steps, not a shrug', () => {
    test('the reply proposes publish / multi-page / style-reference, in Arabic, as send-as-is lines', () => {
        expect(builderSrc).toMatch(/خطوات تالية يمكنني تنفيذها الآن/);
        expect(builderSrc).toMatch(/«انشر المشروع» → رابط دائم/);
    });
});

/**
 * 7 — the restaurant-build fix pack. Every case below is a defect measured on
 * one real run of «Build a modern restaurant website»: the injected coaching
 * text turned the restaurant into a store (the word "stored" matched /store/)
 * and shipped "Crash-Loop Guard" as a restaurant service card; five dead
 * source.unsplash.com links 404'd on screen; the logo was an 800×600 gradient
 * rectangle; one unclosed CSS brace swallowed the stylesheet after it; and
 * three "Add to Cart" buttons logged to the console and did nothing.
 */
describe('7 — coaching text cannot poison the page', () => {
    const DISCIPLINE = '\n\n[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts]:'
        + '\n1. compare a stored hash/stamp; never skip installing.'
        + '\n2. Crash-loop guard: restart ... server ... cart of woes none.';
    test('the builder strips the injected block from the request before ANY design decision', () => {
        expect(builderSrc).toMatch(/\.replace\(\/\\n\+\\\[\(STANDING USER INSTRUCTIONS\|ENGINEERING DISCIPLINE\)/);
    });
    test('"stored" in the coaching text no longer turns a restaurant into a store', () => {
        const { detectPageKind } = require('../core/design/blueprints');
        expect(detectPageKind('Build a modern restaurant website' + DISCIPLINE)).toBe('restaurant');
        expect(detectPageKind('Build a modern restaurant website')).toBe('restaurant');
        // …and a real store request still detects as one.
        expect(detectPageKind('build an online store with a cart')).toBe('store');
    });
});

describe('7b — model-written image URLs become real photo requests', () => {
    const { imagesToMarkers } = require('../core/design/images');
    const os = require('os');
    test('a dead external URL becomes a marker whose subject is the alt text', () => {
        const r = imagesToMarkers(
            '<img src="https://source.unsplash.com/600x400/?restaurant,kitchen,chef" alt="Restaurant kitchen chef">',
            os.tmpdir());
        expect(r.converted).toBe(1);
        expect(r.html).toMatch(/src="\{\{IMAGE:card\|Restaurant kitchen chef\}\}"/);
    });
    test('no alt → the subject comes from the URL query terms', () => {
        const r = imagesToMarkers('<img src="https://source.unsplash.com/600x400/?design,studio,desk">', os.tmpdir());
        expect(r.html).toMatch(/\{\{IMAGE:card\|design studio desk\}\}/);
    });
    test('an invented local file is promoted too; avatars keep their slot', () => {
        const r = imagesToMarkers('<img class="avatar" src="chef-maria.jpg" alt="Maria Rodriguez portrait">', os.tmpdir());
        expect(r.html).toMatch(/\{\{IMAGE:avatar\|Maria Rodriguez portrait\}\}/);
    });
    test('logos, data URIs and existing files are left alone; scripts are never rewritten', () => {
        const fs2 = require('fs'); const path2 = require('path');
        const dir = fs2.mkdtempSync(path2.join(os.tmpdir(), 'joe-imgs-'));
        fs2.writeFileSync(path2.join(dir, 'real.jpg'), 'JPG');
        const html = '<img class="logo" src="logo.png" alt="DineEase Logo">'
            + '<img src="data:image/svg+xml;utf8,x" alt="g">'
            + '<img src="real.jpg" alt="kept">'
            + '<script>var s = \'<img src="https://cdn.example.com/x.jpg">\';</script>';
        const r = imagesToMarkers(html, dir);
        expect(r.converted).toBe(0);
        expect(r.html).toBe(html);
    });
});

describe('7c — a placeholder is not a logo', () => {
    const { ensureLogo } = require('../core/design/logo');
    test('an invented logo.png inside the brand link is replaced with the drawn mark', () => {
        const r = ensureLogo('<a class="brand" href="/"><img src="logo.png" alt="DineEase Logo" class="logo"></a>',
            { brand: 'DineEase', hue: 258, isArabic: false });
        expect(r.added).toBe(true);
        expect(r.html).toContain('<svg');
        expect(r.html).toContain('brand-name');
        expect(r.html).not.toContain('logo.png');
    });
    test('a gradient-placeholder data URI logo is replaced too', () => {
        const gr = 'data:image/svg+xml;utf8,%3Csvg%3E%3ClinearGradient%3E%3C/linearGradient%3E%3C/svg%3E';
        const r = ensureLogo(`<a class="brand" href="/"><img src="${gr}" alt="Logo"></a>`,
            { brand: 'DineEase', hue: 258, isArabic: false });
        expect(r.added).toBe(true);
    });
    test('a REAL photo the user chose is untouched', () => {
        const r = ensureLogo('<a class="brand" href="/"><img src="https://mysite.com/mark.png" alt="brand"></a>',
            { brand: 'X', hue: 10, isArabic: false });
        expect(r.added).toBe(false);
    });
});

describe('7d — broken CSS syntax is repaired, not shipped', () => {
    const { repairCssSyntax } = require('../core/design/style-guard');
    test('bare declarations inside @media get a selector', () => {
        const r = repairCssSyntax('@media (prefers-color-scheme: dark) { --bg:#121019; --text:#f4f4f6; }');
        expect(r.css).toContain(':root{--bg:#121019');
        expect(r.fixes).toContain('wrapped-bare-declarations');
    });
    test('an unclosed brace is closed — it was swallowing every rule after it', () => {
        const r = repairCssSyntax('@media (max-width:768px){ .grid-3{grid-template-columns:1fr}');
        const opens = (r.css.match(/\{/g) || []).length;
        const closes = (r.css.match(/\}/g) || []).length;
        expect(opens).toBe(closes);
    });
    test('splitHtmlProject repairs each part, so one bad section cannot kill styles.css', () => {
        const page = '<html><head><style>.a{color:red}</style></head><body>'
            + '<style>@media (max-width:768px){ .b{color:blue}</style>'
            + '<style>.c{color:green}</style></body></html>';
        const split = splitHtmlProject(page);
        expect((split.css.match(/\{/g) || []).length).toBe((split.css.match(/\}/g) || []).length);
        expect(split.css).toContain('.c{color:green}');
    });
});

describe('7e — a section brings content, never document structure', () => {
    test('stray <main>/</main> from the model is stripped from a section', () => {
        const { extractSection } = require('../core/design/section-writer');
        const got = extractSection('<section class="section" id="x"><p>hi</p></main><footer>f</footer></section>', 'x');
        expect(got.ok).toBe(true);
        expect(got.html).not.toMatch(/<\/?main/i);
    });
});

/**
 * 8 — THE PHOTO-KILLING GUARD. resolveImages writes every real downloaded
 * photograph as src="/artifacts/images/x.jpg" — the address the server
 * answers. groundImageSrcs resolved that root-absolute path against the
 * filesystem root, declared the file missing, and replaced FOUR real licensed
 * photographs with gradients on a measured build («لم تظهر الصور» with the
 * photographers still credited at the bottom of the page). Never again.
 */
describe('8 — the missing-file guard recognises the pipeline\'s own photos', () => {
    const { groundImageSrcs, imagesToMarkers } = require('../core/design/images');
    const os = require('os'); const fs8 = require('fs'); const path8 = require('path');
    const artWith = (name: string) => {
        const dir = fs8.mkdtempSync(path8.join(os.tmpdir(), 'joe-photo-'));
        fs8.mkdirSync(path8.join(dir, 'images'), { recursive: true });
        fs8.writeFileSync(path8.join(dir, 'images', name), 'JPG');
        return dir;
    };
    test('a REAL /artifacts/images/… photo survives the guard', () => {
        const dir = artWith('hero.jpg');
        const g = groundImageSrcs('<img src="/artifacts/images/hero.jpg" alt="x">', dir, 20);
        expect(g.fixed).toBe(0);
        expect(g.html).toContain('/artifacts/images/hero.jpg');
    });
    test('a MISSING /artifacts/images/… photo still becomes the gradient', () => {
        const dir = artWith('hero.jpg');
        const g = groundImageSrcs('<img src="/artifacts/images/nope.jpg" alt="x">', dir, 20);
        expect(g.fixed).toBe(1);
        expect(g.html).toContain('data:image/svg+xml');
    });
    test('imagesToMarkers leaves the pipeline\'s own photos alone too', () => {
        const dir = artWith('hero.jpg');
        const r = imagesToMarkers('<img src="/artifacts/images/hero.jpg" alt="x">', dir);
        expect(r.converted).toBe(0);
    });
    test('the builder reports the photo count from the FINAL page, and cleans alt debris', () => {
        expect(builderSrc).toMatch(/FINAL page carries/);
        expect(builderSrc).toMatch(/cleaned marker debris from alt text/);
    });
});

describe('7f — a button that says "add to cart" adds to the cart', () => {
    const commerceSrc = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'design', 'commerce.ts'), 'utf-8');
    test('the cart runtime understands the model\'s dialects: .cart-btn, #add-to-cart, the visible label', () => {
        expect(commerceSrc).toMatch(/cart-btn/);
        expect(commerceSrc).toMatch(/add-to-cart/);
        expect(commerceSrc).toMatch(/add to cart\|أضف/);
        // …and derives the product from the card when data-product is absent.
        expect(commerceSrc).toMatch(/closest\('\.card, \.product, article, li/);
        expect(commerceSrc).toMatch(/new-price/);
    });
});
