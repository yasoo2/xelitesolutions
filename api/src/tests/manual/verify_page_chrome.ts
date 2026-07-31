/**
 * Render the page header and MEASURE it in a real browser.
 *
 *   npm run verify:chrome
 *
 * The unit suite checks that the stylesheet contains the rules and the runtime
 * contains the handlers. That is not the same as the header working, and this
 * script exists because four defects survived a careful reading of the code and
 * died the moment a browser laid the page out:
 *
 *   1. The dropdown never opened. The runtime selected its triggers with
 *      `.has-menu > [aria-expanded]`, so it only found a trigger the model had
 *      already written the attribute onto. It usually has not.
 *   2. Hover and click fought. Pointing at the trigger opened the menu, the
 *      click that followed read "already open" and closed it — so on a desktop
 *      the dropdown could not be opened by clicking at all.
 *   3. The closed mobile drawer added 320px of horizontal scroll to a 390px
 *      phone, and left its links in the tab order.
 *   4. The button that closes the drawer sat UNDER the drawer, because the
 *      drawer is a child of the header and had the higher z-index. With the menu
 *      open there was no way to close it by tapping.
 *
 * Needs Chromium. Set BROWSER_EXECUTABLE_PATH if it is not on the default path.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { chromeCss, chromeRuntime } from '../../core/design/chrome';
import { bidiCss, isolateLatinRuns } from '../../core/design/language';
import { uiKitCss, buildPalette, paletteCss } from '../../core/design/design-system';
import { layoutCss, primitivesCss, iconSprite } from '../../core/design/layouts';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-chrome-'));

function buildPage(): string {
    const palette = buildPalette('xelitesolutions consulting');
    const body = isolateLatinRuns(`
<header class="site-header" data-joe-header><div class="wrap header-inner">
  <a class="brand" href="index.html">إكس إيليت</a>
  <button class="nav-toggle" type="button" aria-label="القائمة" aria-controls="site-nav">
    <svg class="icon"><use href="#i-menu"/></svg></button>
  <nav class="site-nav" id="site-nav" aria-label="التنقل الرئيسي">
    <ul class="nav-links">
      <li><a href="#about">من نحن</a></li>
      <li class="has-menu"><button type="button" class="nav-link">خدماتنا
        <svg class="icon caret"><use href="#i-arrow"/></svg></button>
        <ul class="dropdown">
          <li><a href="#services">الاستشارات البرمجية</a></li>
          <li><a href="#pricing">التوظيف واختيار الموظفين</a></li>
        </ul></li>
      <li><a href="#contact">اتصل بنا</a></li>
    </ul>
    <div class="nav-actions">
      <a class="btn btn-ghost" href="#login">تسجيل الدخول</a>
      <a class="btn" href="#signup">ابدأ الآن</a>
    </div>
  </nav>
</div></header>
<main>
<section class="section" id="about"><div class="wrap"><h1>نطوّر أعمالك</h1>
<p class="lede">نبني الأنظمة باستخدام React و Node.js (نسخة 20)، ونتولّى نشرها على AWS.</p></div></section>
<section class="section" id="services"><div class="wrap"><h2>خدماتنا</h2>
<div class="grid-3"><div class="card"><h3>استشارات</h3><p>نص.</p></div>
<div class="card"><h3>توظيف</h3><p>نص.</p></div><div class="card"><h3>أنظمة</h3><p>نص.</p></div></div></div></section>
<section class="section" id="pricing"><div class="wrap"><h2>الأسعار</h2>
<table><thead><tr><th>الباقة</th><th>السعر</th></tr></thead>
<tbody><tr><td>أساسية</td><td>٢٩٩ ر.س</td></tr></tbody></table></div></section>
<section class="section" id="contact"><div class="wrap"><h2>اتصل بنا</h2>
<p>نص طويل هنا لملء المساحة حتى تصبح الصفحة قابلة للتمرير.</p></div></section>
</main>`);

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>إكس إيليت</title>
<style>${uiKitCss()}
${layoutCss('split')}
${primitivesCss()}
${chromeCss()}
${bidiCss()}
${paletteCss(palette)}</style></head>
<body>${iconSprite()}${body}${chromeRuntime(true)}</body></html>`;
}

interface Check { name: string; pass: boolean; got: unknown; want: string }

async function main() {
    const file = path.join(OUT, 'page.html');
    fs.writeFileSync(file, buildPage(), 'utf-8');

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { console.error('playwright-core is not installed — cannot verify.'); process.exit(2); }

    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const errors: string[] = [];
    const checks: Check[] = [];
    const add = (name: string, got: unknown, want: string, pass: boolean) => checks.push({ name, got, want, pass });

    /* ---------- desktop ---------------------------------------------------- */
    let page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e: Error) => errors.push(`desktop: ${e.message}`));
    page.on('console', (m: any) => { if (m.type() === 'error') errors.push(`desktop console: ${m.text()}`); });
    await page.goto('file://' + file);
    await page.waitForTimeout(400);

    add('hamburger hidden on desktop', await page.locator('.nav-toggle').isHidden(), 'true', await page.locator('.nav-toggle').isHidden());
    add('header is sticky', await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')!).position), 'sticky',
        (await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')!).position)) === 'sticky');

    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    add('no horizontal overflow on desktop', hScroll, '0', hScroll === 0);

    // Defects 1 and 2: the dropdown must open on a click, from a trigger that
    // does NOT already carry aria-expanded.
    await page.locator('.has-menu > button').click();
    await page.waitForTimeout(300);
    const ddOpen = await page.locator('.dropdown a').first().isVisible();
    add('dropdown opens on click', ddOpen, 'true', ddOpen);
    const ddAria = await page.locator('.has-menu > button').getAttribute('aria-expanded');
    add('dropdown reports its state', ddAria, 'true', ddAria === 'true');

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);
    const scrolled = await page.evaluate(() => document.querySelector('.site-header')!.hasAttribute('data-scrolled'));
    add('header separates once scrolled', scrolled, 'true', scrolled === true);
    const current = await page.evaluate(() => !!document.querySelector('.nav-links a[aria-current]'));
    add('nav marks the section in view', current, 'true', current === true);

    // The secondary button must not render as a second primary one.
    const btns = await page.evaluate(() => {
        const g = document.querySelector('.nav-actions .btn-ghost') as HTMLElement;
        const f = document.querySelector('.nav-actions .btn:not(.btn-ghost)') as HTMLElement;
        return { ghost: getComputedStyle(g).backgroundColor, filled: getComputedStyle(f).backgroundColor };
    });
    add('ghost button is not filled', JSON.stringify(btns), 'different backgrounds', btns.ghost !== btns.filled);

    // The contrast net must not have painted white on a near-white tint.
    const th = await page.evaluate(() => {
        const el = document.querySelector('th'); if (!el) return null;
        const cs = getComputedStyle(el); return { color: cs.color, bg: cs.backgroundColor };
    });
    add('table header text is not white-on-white', JSON.stringify(th), 'a dark colour', !!th && th.color !== 'rgb(255, 255, 255)');

    const bdi = await page.evaluate(() => document.querySelectorAll('bdi').length);
    add('Latin runs inside Arabic are isolated', bdi, '> 0', bdi > 0);
    await page.screenshot({ path: path.join(OUT, 'desktop.png') });
    await page.close();

    /* ---------- phone ------------------------------------------------------ */
    page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    page.on('pageerror', (e: Error) => errors.push(`phone: ${e.message}`));
    await page.goto('file://' + file);
    await page.waitForTimeout(300);

    add('hamburger visible on a phone', await page.locator('.nav-toggle').isVisible(), 'true', await page.locator('.nav-toggle').isVisible());

    // Defect 3: a closed drawer must not be draggable into view, and its links
    // must not be focusable.
    const canDrag = await page.evaluate(() => { window.scrollTo(600, 0); const x = window.scrollX; window.scrollTo(0, 0); return x; });
    add('page cannot be dragged sideways', canDrag, '0', canDrag === 0);
    const closedVis = await page.evaluate(() => getComputedStyle(document.querySelector('.site-nav')!).visibility);
    add('closed drawer is out of the tab order', closedVis, 'hidden', closedVis === 'hidden');

    await page.locator('.nav-toggle').click();
    await page.waitForTimeout(400);
    const inView = await page.evaluate(() => {
        const r = document.querySelector('.site-nav')!.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width > 100;
    });
    add('drawer slides fully into view', inView, 'true', inView === true);
    const locked = await page.evaluate(() => document.documentElement.style.overflow);
    add('page behind the drawer does not scroll', locked, 'hidden', locked === 'hidden');

    // Defect 4: the close button must be ABOVE the drawer, not under it.
    const toggleOnTop = await page.evaluate(() => {
        const t = document.querySelector('.nav-toggle')!.getBoundingClientRect();
        const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
        return !!el && !!el.closest('.nav-toggle');
    });
    add('close button is tappable over the open drawer', toggleOnTop, 'true', toggleOnTop === true);

    await page.locator('.has-menu > button').click();
    await page.waitForTimeout(300);
    const drawerDd = await page.locator('.dropdown a').first().isVisible();
    add('dropdown works inside the drawer', drawerDd, 'true', drawerDd);
    await page.screenshot({ path: path.join(OUT, 'phone.png') });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const closed = await page.locator('.nav-toggle').getAttribute('aria-expanded');
    add('Escape closes the drawer', closed, 'false', closed === 'false');
    await page.close();
    await browser.close();

    /* ---------- report ----------------------------------------------------- */
    add('no JavaScript errors', errors.length ? errors : 0, '0', errors.length === 0);
    let failed = 0;
    for (const c of checks) {
        if (!c.pass) failed++;
        console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.pass ? '' : `  — got ${JSON.stringify(c.got)}, wanted ${c.want}`}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed. Screenshots in ${OUT}`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
