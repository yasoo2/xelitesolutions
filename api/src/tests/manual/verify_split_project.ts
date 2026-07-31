/**
 * The page is written as ONE document and shipped as separate files.
 *
 *   npm run verify:split
 *
 * Everything used to go into a single artifact blob, so the workspace file tree
 * stayed empty — the user's words were «لم يعمل ملفات في قائمة الملفات». The
 * split now happens on every build, which moves every inline <script> to the end
 * of the body in script.js. That is a real change to when the page's code runs,
 * so it is verified by loading BOTH versions in a browser and comparing them,
 * rather than by reasoning about it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { splitHtmlProject } from '../../core/quality/html-qa';
import { chromeCss, chromeRuntime } from '../../core/design/chrome';
import { bidiCss } from '../../core/design/language';
import { uiKitCss, buildPalette, paletteCss, uiKitScript } from '../../core/design/design-system';
import { layoutCss, primitivesCss, iconSprite } from '../../core/design/layouts';
import { widgetCss, widgetRuntime } from '../../core/design/widgets';
import { formCss, formRuntime } from '../../core/design/forms';
import { extractSection, assemblePage } from '../../core/design/section-writer';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-split-'));

/** Two sections that each carry their own script — the realistic case. */
const SECTIONS = [
    `<header class="site-header" data-joe-header><div class="wrap header-inner">
<a class="brand" href="index.html">إكس إيليت</a>
<button class="nav-toggle" type="button" aria-controls="site-nav"><svg class="icon"><use href="#i-menu"/></svg></button>
<nav class="site-nav" id="site-nav"><ul class="nav-links"><li><a href="#services">خدماتنا</a></li></ul>
<div class="nav-actions"><a class="btn btn-ghost" href="#login">تسجيل الدخول</a></div></nav></div></header>`,
    `<section class="section" id="services"><div class="wrap"><h2>خدماتنا</h2>
<div class="grid-3"><div class="card"><h3>استشارات</h3></div><div class="card"><h3>توظيف</h3></div>
<div class="card"><h3>أنظمة</h3></div></div>
<script>const cards = document.querySelectorAll('.card');
cards.forEach(function (c) { c.setAttribute('data-wired', '1'); });</script></div></section>`,
    `<section class="section" id="results"><div class="wrap"><h2>النتائج</h2>
<p class="stat"><strong data-count-to="120">0</strong><span>عميل</span></p>
<script>const cards = document.querySelectorAll('.stat');
cards.forEach(function (c) { c.setAttribute('data-seen', '1'); });</script></div></section>`,
    `<section class="section" id="contact"><div class="wrap"><h2>اتصل بنا</h2>
<form data-joe-form><label for="e">البريد</label><input id="e" name="e" type="email" required>
<button type="submit" class="btn">إرسال</button></form></div></section>`,
];

function build(): string {
    const palette = buildPalette('xelitesolutions consulting');
    const written = SECTIONS.map((raw, i) => {
        const id = ['nav', 'services', 'results', 'contact'][i];
        return { index: i + 1, spec: id, id, ...extractSection(raw, id) };
    });
    return assemblePage({
        title: 'إكس إيليت',
        isArabic: true,
        tokenCss: paletteCss(palette),
        baseLayer: [uiKitCss(), layoutCss('split'), primitivesCss(), chromeCss(), bidiCss(), widgetCss(), formCss()].join('\n'),
        sections: written,
        sprite: iconSprite(),
        script: `${uiKitScript()}\n${chromeRuntime(true)}\n${widgetRuntime(true)}\n${formRuntime(true)}`,
    });
}

async function measure(browser: any, url: string, label: string) {
    const errors: string[] = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e: Error) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m: any) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForTimeout(600);
    const got = await page.evaluate(() => ({
        // Did each section's own script run, and did the two that share a
        // variable name both run?
        cardsWired: document.querySelectorAll('.card[data-wired]').length,
        statsSeen: document.querySelectorAll('.stat[data-seen]').length,
        // Did Joe's own runtimes survive?
        headerWired: !!document.querySelector('.site-header'),
        formNoValidate: !!document.querySelector('form[data-joe-form][novalidate]'),
        // Did the styles arrive?
        headerSticky: getComputedStyle(document.querySelector('.site-header')!).position,
        gridColumns: getComputedStyle(document.querySelector('.grid-3')!).gridTemplateColumns.split(' ').length,
    }));
    await page.close();
    return { ...got, errors };
}

async function main() {
    const html = build();
    const combined = path.join(OUT, 'combined.html');
    fs.writeFileSync(combined, html, 'utf-8');

    const split = splitHtmlProject(html);
    const dir = path.join(OUT, 'project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), split.indexHtml, 'utf-8');
    if (split.css) fs.writeFileSync(path.join(dir, 'styles.css'), split.css, 'utf-8');
    if (split.js) fs.writeFileSync(path.join(dir, 'script.js'), split.js, 'utf-8');

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { console.error('playwright-core is not installed — cannot verify.'); process.exit(2); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

    const a = await measure(browser, 'file://' + combined, 'combined');
    const b = await measure(browser, 'file://' + path.join(dir, 'index.html'), 'split');
    await browser.close();

    const checks: Array<[string, boolean, unknown]> = [
        ['split produced separate files', !!split.css && !!split.js, { css: split.css.length, js: split.js.length }],
        ['index.html links both', /styles\.css/.test(split.indexHtml) && /script\.js/.test(split.indexHtml), null],
        ['index.html has no inline style or script left', !/<style\b/i.test(split.indexHtml) && !/<script(?![^>]*src=)/i.test(split.indexHtml), null],
        ['no JS errors in the combined page', a.errors.length === 0, a.errors],
        ['no JS errors in the split page', b.errors.length === 0, b.errors],
        ['both sections\' scripts ran (combined)', a.cardsWired === 3 && a.statsSeen === 1, a],
        ['both sections\' scripts ran (split)', b.cardsWired === 3 && b.statsSeen === 1, b],
        ['styles arrived in the split page', b.headerSticky === 'sticky' && b.gridColumns === 3, b],
        ['Joe\'s own runtimes still ran (split)', b.formNoValidate === true, b],
        ['split behaves identically to combined', JSON.stringify({ ...a, errors: 0 }) === JSON.stringify({ ...b, errors: 0 }), { a, b }],
    ];

    let failed = 0;
    for (const [name, pass, detail] of checks) {
        if (!pass) failed++;
        console.log(`${pass ? '✓' : '✗'} ${name}${pass ? '' : '  — ' + JSON.stringify(detail)}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed. Files in ${OUT}`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
