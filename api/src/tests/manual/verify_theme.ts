/**
 * Press the dark-mode switch in a real browser, and jump around the page.
 *
 *   npm run verify:theme
 *
 * The unit suite proves the stylesheet contains the rules and the runtime
 * contains the handlers. It cannot prove the page actually changes colour, and
 * this file exists because two defects in the first draft of `theme.ts` were
 * invisible in the code and obvious the moment a browser laid the page out:
 *
 *   1. HALF A SWITCH. Only the dark tokens were mirrored onto the attribute. A
 *      visitor whose laptop is set to dark presses "light", the attribute flips,
 *      and `@media (prefers-color-scheme: dark)` keeps every dark value — so the
 *      page stays dark and the button reads as broken. Beating a media query
 *      needs BOTH directions stated, not one.
 *   2. A REVEAL THAT LOSES SECTIONS. An IntersectionObserver only reports a
 *      change it witnessed. Jump to the bottom — the End key, an in-page anchor,
 *      a restored scroll position, and Joe's own visual audit, which does
 *      exactly this on every page it measures — and the sections the jump flew
 *      past never intersected on any observed frame. They stay at opacity 0 for
 *      good, and the page ships with invisible content.
 *
 * Needs Chromium. Set BROWSER_EXECUTABLE_PATH if it is not on the default path.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { chromeCss, chromeRuntime } from '../../core/design/chrome';
import { bidiCss } from '../../core/design/language';
import { logoCss } from '../../core/design/logo';
import {
    themeCss, lightOverrideCss, revealCss, themeRuntime, revealRuntime, ensureThemeToggle,
    REVEAL_STYLES, type RevealStyle,
} from '../../core/design/theme';
import {
    uiKitCss, buildPalette, paletteCss, darkTokenBlock, lightTokenBlock,
} from '../../core/design/design-system';
import { layoutCss, primitivesCss, iconSprite } from '../../core/design/layouts';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-theme-'));
const palette = buildPalette('xelitesolutions consulting');

/** Six tall sections, so a jump to the bottom really does fly past most of them. */
function sections(): string {
    const names = ['about', 'services', 'work', 'pricing', 'team', 'contact'];
    return names.map((id, i) => `
<section class="section" id="${id}"><div class="wrap">
  <h2>القسم ${i + 1}</h2>
  <p class="lede" style="min-height:70vh">نص طويل هنا لملء المساحة حتى تصبح الصفحة قابلة للتمرير فعلاً.</p>
</div></section>`).join('\n');
}

function buildPage(style: RevealStyle = 'rise'): string {
    const header = `<header class="site-header" data-joe-header><div class="wrap header-inner">
  <a class="brand" href="index.html">إكس إيليت</a>
  <button class="nav-toggle" type="button" aria-label="القائمة" aria-controls="site-nav">
    <svg class="icon"><use href="#i-menu"/></svg></button>
  <nav class="site-nav" id="site-nav" aria-label="التنقل الرئيسي">
    <ul class="nav-links"><li><a href="#about">من نحن</a></li><li><a href="#contact">اتصل بنا</a></li></ul>
    <div class="nav-actions"><a class="btn" href="#signup">ابدأ الآن</a></div>
  </nav>
</div></header>`;

    const body = ensureThemeToggle(header, true).html + `
<main>
<section class="section" id="hero"><div class="wrap"><h1>نطوّر أعمالك</h1>
<p class="lede">نبني الأنظمة ونتولّى نشرها.</p></div></section>
${sections()}
</main>`;

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>إكس إيليت</title>
<style>${uiKitCss()}
${layoutCss('split')}
${primitivesCss()}
${chromeCss()}
${logoCss()}
${themeCss(darkTokenBlock(palette))}
${lightOverrideCss(lightTokenBlock(palette))}
${revealCss(style)}
${bidiCss()}
${paletteCss(palette)}</style></head>
<body>${iconSprite()}${body}${chromeRuntime(true)}${themeRuntime(true)}${revealRuntime()}</body></html>`;
}

interface Check { name: string; pass: boolean; got: unknown; want: string }

/** Every non-header section that a visitor would call "the content". */
const ALL_SECTIONS = `Array.prototype.map.call(document.querySelectorAll('main > section'),
  function (s) { return { id: s.id, op: parseFloat(getComputedStyle(s).opacity) }; })`;

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
    const url = 'file://' + file;

    const bgOf = (p: any) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);

    /* ---------- 1. the switch, from a LIGHT system ------------------------- */
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`light: ${e.message}`));
        page.on('console', (m: any) => { if (m.type() === 'error') errors.push(`light console: ${m.text()}`); });
        await page.goto(url);
        await page.waitForTimeout(300);

        const before = await bgOf(page);
        add('a light system starts light', before, 'a light background', await page.evaluate(
            () => document.documentElement.getAttribute('data-theme')) === 'light');

        await page.locator('[data-theme-toggle]').click();
        await page.waitForTimeout(300);
        const after = await bgOf(page);
        add('pressing it actually repaints the page', `${before} -> ${after}`, 'a different background', before !== after);

        const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        add('the choice is recorded on the document', attr, 'dark', attr === 'dark');

        // The icon must swap, or the button says nothing about what it does next.
        const sun = await page.locator('.theme-toggle .i-sun').isVisible();
        const moon = await page.locator('.theme-toggle .i-moon').isVisible();
        add('the icon shows the mode you would switch TO', { sun, moon }, 'sun only', sun && !moon);

        const pressed = await page.locator('[data-theme-toggle]').getAttribute('aria-pressed');
        add('aria-pressed is truthful', pressed, 'true', pressed === 'true');

        // AA on the text, in the mode the visitor just chose. A dark scheme
        // nobody checked is how a page ends up grey-on-grey.
        const ratio = await page.evaluate(() => {
            const lum = (c: string) => {
                const m = c.match(/[\d.]+/g)!.map(Number);
                const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
                return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]);
            };
            const cs = getComputedStyle(document.querySelector('.lede') || document.body);
            const a = lum(cs.color), b = lum(getComputedStyle(document.body).backgroundColor);
            return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
        });
        add('dark mode text still passes AA', ratio, '>= 4.5', ratio >= 4.5);

        // The preference must outlive the page.
        await page.reload();
        await page.waitForTimeout(300);
        const kept = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        add('the choice survives a reload', kept, 'dark', kept === 'dark');
        await page.screenshot({ path: path.join(OUT, 'dark.png') });
        await ctx.close();
    }

    /* ---------- 2. the switch, from a DARK system -------------------------- */
    {
        // THE DEFECT: with only the dark tokens mirrored, this visitor can never
        // get to light. The media query keeps every dark value and the button
        // does nothing visible.
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`dark-system: ${e.message}`));
        await page.goto(url);
        await page.waitForTimeout(300);

        const before = await bgOf(page);
        await page.locator('[data-theme-toggle]').click();
        await page.waitForTimeout(300);
        const after = await bgOf(page);
        add('a dark-system visitor can reach LIGHT', `${before} -> ${after}`, 'a different background', before !== after);

        // And it must be the palette's actual light surface, not some halfway state.
        const isLight = await page.evaluate(() => {
            const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)!.map(Number);
            return (m[0] + m[1] + m[2]) / 3 > 200;
        });
        add('light means the light palette, not a halfway state', isLight, 'true', isLight === true);
        await page.screenshot({ path: path.join(OUT, 'light.png') });
        await ctx.close();
    }

    /* ---------- 3. the reveal survives a JUMP ------------------------------ */
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`reveal: ${e.message}`));
        await page.goto(url);
        await page.waitForTimeout(400);

        const atTop = await page.evaluate(ALL_SECTIONS) as Array<{ id: string; op: number }>;
        add('the first screenful is never animated in', atTop[0], 'hero fully visible', atTop[0]?.op === 1);
        add('sections below the fold start hidden', atTop.filter(s => s.op < 1).length, '> 0',
            atTop.filter(s => s.op < 1).length > 0);

        // The jump. This is the exact move Joe's own visual audit makes, and the
        // move an IntersectionObserver cannot survive.
        //
        // `behavior:'instant'` because the kit ships `scroll-behavior:smooth`:
        // a plain scrollTo ANIMATES, so a short wait measures sections that are
        // still mid-reveal and blames the runtime for the harness's own timing.
        await page.evaluate(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
        });
        await page.waitForTimeout(1500);
        const afterJump = await page.evaluate(ALL_SECTIONS) as Array<{ id: string; op: number }>;
        const stillHidden = afterJump.filter(s => s.op < 1);
        add('NOTHING is left invisible after a jump to the bottom',
            stillHidden.map(s => s.id), 'none', stillHidden.length === 0);

        // A gradual scroll must reveal too, obviously — but also without leaving
        // the page wider than it started.
        const hScroll = await page.evaluate(() => {
            const de = document.documentElement, before = window.scrollX;
            window.scrollTo(de.scrollWidth, 0);
            const moved = Math.abs(window.scrollX - before);
            window.scrollTo(before, 0);
            return moved;
        });
        add('the reveal transform adds no sideways scroll', hScroll, '0', hScroll === 0);
        await ctx.close();
    }

    /* ---------- 4. an in-page anchor is also a jump ------------------------ */
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`anchor: ${e.message}`));
        await page.goto(url + '#contact');
        await page.waitForTimeout(2200);
        const op = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('contact')!).opacity));
        add('landing straight on an anchor shows that section', op, '1', op === 1);
        await ctx.close();
    }

    /* ---------- 5. motion refused ------------------------------------------ */
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`reduced: ${e.message}`));
        await page.goto(url);
        await page.waitForTimeout(400);
        const all = await page.evaluate(ALL_SECTIONS) as Array<{ id: string; op: number }>;
        const hidden = all.filter(s => s.op < 1);
        add('reduced motion leaves EVERY section visible', hidden.map(s => s.id), 'none', hidden.length === 0);

        // And the switch must still work — motion and colour are unrelated.
        const before = await bgOf(page);
        await page.locator('[data-theme-toggle]').click();
        await page.waitForTimeout(200);
        add('the switch still works with motion off', `${before} -> ${await bgOf(page)}`,
            'a different background', before !== (await bgOf(page)));
        await ctx.close();
    }

    /* ---------- 6. a phone ------------------------------------------------- */
    {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`phone: ${e.message}`));
        await page.goto(url);
        await page.waitForTimeout(300);
        // The toggle lives inside the drawer on a phone; open it and press.
        await page.locator('.nav-toggle').click();
        await page.waitForTimeout(400);
        const box = await page.locator('[data-theme-toggle]').boundingBox();
        add('the toggle keeps its shape in the drawer', box && Math.round(box.width),
            '38px wide', !!box && Math.abs(box.width - 38) < 2);
        const before = await bgOf(page);
        await page.locator('[data-theme-toggle]').click();
        await page.waitForTimeout(300);
        add('the toggle works on a phone', `${before} -> ${await bgOf(page)}`,
            'a different background', before !== (await bgOf(page)));
        await page.screenshot({ path: path.join(OUT, 'phone.png') });
        await ctx.close();
    }

    /* ---------- 7. every motion style, not only the default ----------------- */
    for (const style of REVEAL_STYLES) {
        const f = path.join(OUT, `motion-${style}.html`);
        fs.writeFileSync(f, buildPage(style), 'utf-8');
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e: Error) => errors.push(`${style}: ${e.message}`));
        await page.goto('file://' + f);
        await page.waitForTimeout(400);

        const below = await page.evaluate(() =>
            Array.prototype.filter.call(document.querySelectorAll('[data-reveal-section]'),
                (s: any) => parseFloat(getComputedStyle(s).opacity) < 1).length);
        add(`motion "${style}": sections below the fold start hidden`, below, '> 0', below > 0);

        await page.evaluate(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
        });
        await page.waitForTimeout(1600);
        // Every style must END EXACTLY IN PLACE: full opacity, identity
        // transform, no clip. A reveal that leaves content shifted or cropped
        // is worse than no reveal.
        const settled = await page.evaluate(() =>
            Array.prototype.every.call(document.querySelectorAll('[data-reveal-section]'), (s: any) => {
                const cs = getComputedStyle(s);
                return parseFloat(cs.opacity) === 1
                    && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)')
                    && (cs.clipPath === 'none'
                        // Chromium serialises inset(0 0 0 0) to its shortest form,
                        // so "inset(0px)" IS fully open — only a non-zero inset crops.
                        || /^inset\(\s*0(px)?(\s+0(px)?){0,3}\s*\)$/.test(cs.clipPath));
            }));
        add(`motion "${style}": everything ends exactly in place`, settled, 'true', settled === true);
        await ctx.close();

        // …and with motion refused, nothing may ever be hidden.
        const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
        const rpage = await rctx.newPage();
        await rpage.goto('file://' + f);
        await rpage.waitForTimeout(400);
        const hidden = await rpage.evaluate(() =>
            Array.prototype.filter.call(document.querySelectorAll('main > section'),
                (s: any) => parseFloat(getComputedStyle(s).opacity) < 1).length);
        add(`motion "${style}": reduced motion leaves everything visible`, hidden, '0', hidden === 0);
        await rctx.close();
    }

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
