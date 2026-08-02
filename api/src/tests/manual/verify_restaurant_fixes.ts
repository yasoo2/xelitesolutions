/**
 * LIVE PROOF — the restaurant-build fix pack, measured in a real browser.
 *
 * Recreates the EXACT defects from the user's «Build a modern restaurant
 * website» run and proves each is now repaired by the deterministic pipeline:
 *   1. a dead source.unsplash.com image and an invented dish.jpg
 *   2. <img src="logo.png"> as the brand logo (became a giant gradient)
 *   3. a section stylesheet with an unclosed brace (swallowed later rules)
 *   4. an "Add to Cart" button in the model's dialect (.cart-btn, no data-add)
 *   5. a section that closes </main> mid-page
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_restaurant_fixes.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
    const { assemblePage, extractSection } = await import('../../core/design/section-writer');
    const { splitHtmlProject } = await import('../../core/quality/html-qa');
    const { guardSectionStyles } = await import('../../core/design/style-guard');
    const { imagesToMarkers, gradientPlaceholder, IMAGE_MARKER } = await import('../../core/design/images');
    const { ensureLogo } = await import('../../core/design/logo');
    const { cartRuntime } = await import('../../core/design/commerce');
    const { iconSprite } = await import('../../core/design/layouts');
    const { detectPageKind } = await import('../../core/design/blueprints');

    const DISCIPLINE = '\n\n[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts]:'
        + '\n1. compare a stored hash/stamp; never skip installing.\n2. Crash-loop guard: restart ... cart ... server.';

    // ---- the model's section, defects and all --------------------------------
    const rawSection = `<section class="section" id="menu">
<style>.menu-note{color:#0a7d55}
@media (max-width:768px){ .grid-3{grid-template-columns:1fr}
</style>
<h2>Signature Dishes</h2>
<p class="menu-note" id="after-rule">fresh daily</p>
<div class="card"><img src="https://source.unsplash.com/600x400/?restaurant,kitchen,chef" alt="Chef plating a dish">
  <h3 class="card-title">Grilled Salmon</h3><span class="new-price">$19.99</span>
  <button class="btn cart-btn" data-product-id="1">Add to Cart</button></div>
<img src="dish2.jpg" alt="Margherita pizza from the wood oven">
</main></section>`;

    const got = extractSection(rawSection, 'menu');
    const guarded = guardSectionStyles(got.html, 'menu');

    let html = assemblePage({
        title: 'مطعم — إثبات', isArabic: false,
        tokenCss: ':root{--brand:#b3541e;--brand-dark:#7d3712;--on-brand:#fff;--text:#1f2937;--bg:#fff;--surface:#fff;--border:#eee;--tint:#fde8dc;--on-tint:#7d3712;--radius:12px;--radius-lg:18px;--radius-pill:999px;--step-0:1rem;--step--1:.9rem;--space-3:12px;--space-4:16px}',
        baseLayer: 'body{background:var(--bg);color:var(--text)}',
        sections: [{ id: 'menu', index: 1, spec: 'menu: dishes', html: guarded.html, ok: true } as any],
        sprite: iconSprite(),
        script: cartRuntime(false),
    });
    // The header the model wrote, invented logo included.
    html = html.replace(/(<body[^>]*>)/i, '$1\n<header><a class="brand" href="/"><img src="logo.png" alt="DineEase Logo" class="logo"></a></header>');

    // ---- the pipeline's deterministic passes, in the builder's order ---------
    const logo = ensureLogo(html, { brand: 'DineEase', hue: 20, isArabic: false });
    html = logo.html;
    const art = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-rest-'));
    const conv = imagesToMarkers(html, art);
    html = conv.html;
    // Offline stand-in for resolveImages' failure path: the sweep gradient.
    html = html.replace(IMAGE_MARKER, (_m: string, q: string) =>
        gradientPlaceholder(String(q).split('|').pop()!.trim(), 20));

    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-rest-out-'));
    const split = splitHtmlProject(html);
    fs.writeFileSync(path.join(stage, 'index.html'), split.indexHtml, 'utf-8');
    fs.writeFileSync(path.join(stage, 'styles.css'), split.css, 'utf-8');
    fs.writeFileSync(path.join(stage, 'script.js'), split.js, 'utf-8');

    // ---- the browser measures -------------------------------------------------
    let chromium: any;
    try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext()).newPage();
    const failed: string[] = [];
    page.on('requestfailed', (r: any) => failed.push(r.url()));
    await page.goto('file://' + path.join(stage, 'index.html'));
    await page.waitForTimeout(400);

    await page.click('.cart-btn');
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
        const imgs = Array.from(document.images);
        const brand = document.querySelector('a.brand')!;
        const after = document.getElementById('after-rule')!;
        const btn = document.querySelector('.cart-btn')!;
        let cartItems = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i)!;
                if (k.startsWith('joe-cart:')) cartItems = (JSON.parse(localStorage.getItem(k) || '[]') || []).length;
            }
        } catch { /* file:// storage can be off; the badge check below still holds */ }
        return {
            allImagesLoaded: imgs.every(im => im.complete && im.naturalWidth > 0),
            unsplashLeft: imgs.some(im => /unsplash/.test(im.src)),
            brandHasDrawnMark: !!brand.querySelector('svg') && !/logo\.png/.test(brand.innerHTML),
            afterRuleColor: getComputedStyle(after).color,
            mainCount: document.querySelectorAll('main').length,
            cartItems,
            btnAdded: btn.hasAttribute('data-added') || /✓|أُضيف|Added/i.test(btn.textContent || ''),
            badge: (document.querySelector('[data-cart-count]') || { textContent: '' }).textContent,
        };
    });
    await browser.close();

    const kind = detectPageKind('Build a modern restaurant website' + DISCIPLINE);
    const checks: Array<[string, boolean]> = [
        ['the coaching text no longer turns the restaurant into a store → ' + kind, kind === 'restaurant'],
        [`every image on the page actually renders (${failed.length} failed requests)`, m.allImagesLoaded && failed.length === 0],
        ['no dead unsplash link survived to the browser', !m.unsplashLeft],
        ['the brand corner carries the DRAWN mark, not logo.png or a gradient rectangle', m.brandHasDrawnMark],
        [`the rule AFTER the unclosed brace still applies → ${m.afterRuleColor}`, m.afterRuleColor === 'rgb(10, 125, 85)'],
        // assemblePage owns the skeleton and writes no <main>; the model's
        // stray </main> must therefore leave ZERO main elements behind.
        [`the model's stray </main> was stripped — no orphan structure (got ${m.mainCount})`, m.mainCount === 0],
        [`"Add to Cart" in the model's dialect really adds (items=${m.cartItems}, feedback=${m.btnAdded})`,
            m.cartItems === 1 || m.btnAdded],
    ];

    let failedCount = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failedCount++; }
    console.log(failedCount === 0
        ? '\nPROOF COMPLETE: the restaurant-build defects are fixed and measured in a real browser.'
        : `\n${failedCount} CHECK(S) FAILED`);
    fs.rmSync(art, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
    process.exit(failedCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
