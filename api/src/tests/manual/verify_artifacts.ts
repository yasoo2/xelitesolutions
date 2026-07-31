/**
 * Open the pages JOE ACTUALLY BUILT and use them.
 *
 *   npm run verify:e2e && npm run verify:artifacts
 *
 * Every other harness in this directory renders a fixture written by hand to
 * exercise a module. That is worth having and it is not the same thing, and the
 * gap between the two shipped a dead feature:
 *
 *   `ensureThemeToggle` refused to add the dark-mode button to any page, because
 *   its duplicate guard searched the whole document for `data-theme-toggle` —
 *   and `themeRuntime`, already injected by then, contains
 *   `querySelectorAll('[data-theme-toggle]')`. Every unit test passed, because
 *   each handed the function a bare header with no runtime in it. Every browser
 *   check passed, because the harness inserted the button BEFORE composing the
 *   page. The stylesheet shipped, the runtime shipped, and every site page
 *   carried an empty `<div class="nav-actions"></div>`.
 *
 * A fixture that does not look like the thing being tested proves nothing. This
 * file has no fixtures at all: it reads what the build wrote to disk and presses
 * the controls.
 *
 * Needs Chromium and a previous `npm run verify:e2e` to have produced artifacts.
 */

import fs from 'fs';
import path from 'path';

const DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';

/** Pages from the most recent end-to-end build, single pages and site pages. */
function builtPages(): string[] {
    if (!fs.existsSync(DIR)) return [];
    const entries = fs.readdirSync(DIR);
    const singles = entries
        .filter(f => f.startsWith('joe-e2e-') && f.endsWith('.html'))
        .map(f => path.join(DIR, f));
    const sites = entries
        .filter(f => f.startsWith('site-') && fs.statSync(path.join(DIR, f)).isDirectory())
        .flatMap(d => fs.readdirSync(path.join(DIR, d))
            .filter(x => x.endsWith('.html'))
            .map(x => path.join(DIR, d, x)));
    return [...singles, ...sites];
}

/** Script and style contents blanked, so markup checks cannot match code. */
function markupOf(html: string): string {
    return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

interface Row { page: string; notes: string[]; ok: boolean }

async function main() {
    const pages = builtPages();
    if (!pages.length) {
        console.error(`No artifacts in ${DIR}. Run "npm run verify:e2e" first.`);
        process.exit(2);
    }

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { console.error('playwright-core is not installed — cannot verify.'); process.exit(2); }

    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

    const rows: Row[] = [];
    let withHeader = 0, withToggle = 0;

    for (const file of pages) {
        const notes: string[] = [];
        const raw = fs.readFileSync(file, 'utf-8');
        const markup = markupOf(raw);
        // A page the model wrote with no header at all has nowhere to put a
        // header control, and declining is the right answer — but it must be
        // COUNTED, not quietly folded into a pass.
        const hasHeader = /<header\b|<nav\b/i.test(markup);
        if (hasHeader) withHeader++;

        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on('pageerror', (e: Error) => errs.push(e.message));
        page.on('console', (m: any) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
        await page.goto('file://' + file);
        await page.waitForTimeout(400);

        // ---- the dark-mode switch, pressed
        const toggles = await page.locator('[data-theme-toggle]').count();
        if (toggles > 1) notes.push(`${toggles} theme toggles — there must be exactly one`);
        if (hasHeader && toggles === 0) notes.push('page has a header but no dark-mode switch');
        if (toggles === 1) {
            withToggle++;
            const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.locator('[data-theme-toggle]').click();
            await page.waitForTimeout(300);
            const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            if (before === after) notes.push(`pressing the switch repainted nothing (${before})`);
            if (attr !== 'dark') notes.push(`the choice was not recorded (data-theme=${attr})`);
            // …and it must survive the page being loaded again.
            await page.reload();
            await page.waitForTimeout(300);
            const kept = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            if (kept !== 'dark') notes.push(`the choice did not survive a reload (${kept})`);
        }

        // ---- nothing may be left invisible by the reveal
        await page.evaluate(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
        });
        await page.waitForTimeout(1400);
        const invisible = await page.evaluate(() =>
            Array.prototype.filter.call(
                document.querySelectorAll('main > section, body > section'),
                (s: any) => parseFloat(getComputedStyle(s).opacity) < 1,
            ).length);
        if (invisible) notes.push(`${invisible} section(s) still invisible after scrolling to the bottom`);

        // ---- the wordmark, where a brand link exists
        if (/<a\b[^>]*class="[^"]*\bbrand\b/i.test(markup) && !/class="brand-mark"/i.test(markup)) {
            notes.push('brand link carries no drawn mark');
        }

        // ---- a control must never have been spliced into JavaScript
        if (/<button[^>]*data-theme-toggle/i.test(raw) && !/<button[^>]*data-theme-toggle/i.test(markup)) {
            notes.push('the theme button was inserted INSIDE a script');
        }

        if (errs.length) notes.push(`JS errors: ${errs.slice(0, 2).join(' | ')}`);

        rows.push({ page: path.relative(DIR, file), notes, ok: notes.length === 0 });
        await ctx.close();
    }
    await browser.close();

    let failed = 0;
    for (const r of rows) {
        if (r.ok) { console.log(`✓ ${r.page}`); continue; }
        failed++;
        console.log(`✗ ${r.page}`);
        for (const n of r.notes) console.log(`    ${n}`);
    }
    console.log(`\n${rows.length - failed}/${rows.length} built pages behave correctly.`);
    // Stated rather than implied: a page with no header legitimately has no
    // switch, and a run where nothing had a header would otherwise look perfect.
    console.log(`${withHeader}/${rows.length} were written with a header; ${withToggle} carry a working dark-mode switch.`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
