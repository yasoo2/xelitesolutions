/**
 * LIVE PROOF — the six defects from the user's real dashboard build, measured
 * in a real browser AFTER the fix, on a page assembled by the REAL pipeline
 * pieces (real runtimes, real split, real sanity passes — no mocks):
 *
 *   1. the self-check runtime must EXECUTE, never render as page text
 *   2. a broken section script must not kill the scripts after it in script.js
 *   3. <use href="#i-search"> must draw pixels (the sprite now has it)
 *   4. font-size="var(--step-0)" must RESOLVE (moved into style)
 *   5. a var(--on-brand) sparkline must paint in the brand ink, not white
 *   6. an icon-only button must carry an accessible name
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_build_quality.ts
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
    const { assemblePage } = await import('../../core/design/section-writer');
    const { splitHtmlProject } = await import('../../core/quality/html-qa');
    const { uiKitCss, uiKitScript } = await import('../../core/design/design-system');
    const { chromeRuntime } = await import('../../core/design/chrome');
    const { themeRuntime, revealRuntime } = await import('../../core/design/theme');
    const { selfCheckScript } = await import('../../core/design/self-check');
    const { iconSprite, normalizeIconRefs } = await import('../../core/design/layouts');
    const { sanitizeInlineSvg, labelIconOnlyButtons } = await import('../../core/design/svg-sanity');

    // A section written "the model's way", carrying every defect from the real
    // build: a wrong icon ref, an unnamed icon button, var() presentation
    // attributes, an --on-brand sparkline, and a script that throws.
    const modelSection = `<section class="section" id="dash">
  <h2>لوحة التحكم</h2>
  <button class="hx"><svg class="icon"><use href="#search"/></svg></button>
  <svg id="chart" viewBox="0 0 200 60" width="200" height="60">
    <text id="axis" x="4" y="12" font-size="var(--step-0)" fill="var(--text)">93</text>
    <polyline id="spark" points="0,50 40,30 80,42 120,18 200,25" style="fill:none;stroke:var(--on-brand);stroke-width:2"/>
  </svg>
  <script>null.classList.add('boom');</script>
  <script>window.__joe_second_ran = true;</script>
</section>`;

    let html = assemblePage({
        title: 'إثبات جودة البناء', isArabic: true,
        tokenCss: ':root{--step-0:20px;--text:#111827;--brand:#0e7a5f;--on-brand:#ffffff;--bg:#ffffff}',
        baseLayer: uiKitCss(),
        sections: [{ id: 'dash', index: 1, spec: 'dashboard: kpis', html: modelSection, ok: true } as any],
        sprite: iconSprite(),
        script: `${uiKitScript()}\n${chromeRuntime(true)}\n${themeRuntime(true)}\n${revealRuntime()}\n${selfCheckScript(true)}`,
    });

    // The pipeline's deterministic passes, exactly as the builder runs them.
    html = normalizeIconRefs(html).html;
    html = sanitizeInlineSvg(html).html;
    html = labelIconOnlyButtons(html, true).html;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-bq-'));
    const split = splitHtmlProject(html);
    fs.writeFileSync(path.join(dir, 'index.html'), split.indexHtml, 'utf-8');
    fs.writeFileSync(path.join(dir, 'styles.css'), split.css, 'utf-8');
    fs.writeFileSync(path.join(dir, 'script.js'), split.js, 'utf-8');

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e: Error) => pageErrors.push(e.message));

    // #joe-check → the self-check overlay must APPEAR (it executed) …
    await page.goto('file://' + path.join(dir, 'index.html') + '#joe-check');
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
        const w = window as any;
        const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
        const use = document.querySelector('#dash use') as any;
        const icon = use ? (use.closest('svg') as SVGGraphicsElement).getBoundingClientRect() : { width: 0, height: 0 };
        const axis = document.getElementById('axis')!;
        const spark = document.getElementById('spark')!;
        const btn = document.querySelector('#dash button.hx')!;
        return {
            bodyText: bodyText.slice(0, 4000),
            leakedCode: /function\s*\(|addEventListener|querySelector|joe-check\)\.test/.test(bodyText),
            secondRan: w.__joe_second_ran === true,
            overlay: !!document.getElementById('joe-self-check'),
            iconW: icon.width, iconH: icon.height,
            useHref: use ? use.getAttribute('href') : '',
            axisFontSize: getComputedStyle(axis).fontSize,
            sparkStroke: getComputedStyle(spark).stroke,
            btnLabel: btn.getAttribute('aria-label') || '',
        };
    });
    await browser.close();

    const brandRgb = 'rgb(14, 122, 95)'; // #0e7a5f
    const checks: Array<[string, boolean]> = [
        ['no runtime code renders as visible page text', !m.leakedCode],
        ['the self-check overlay EXECUTED behind #joe-check (it is code, not text)', m.overlay],
        ['a broken section script did not kill the one after it (script.js fenced)', m.secondRan],
        [`#i-search resolves and draws real pixels (${Math.round(m.iconW)}×${Math.round(m.iconH)}, href=${m.useHref})`,
            m.useHref === '#i-search' && m.iconW > 0 && m.iconH > 0],
        [`chart axis font-size resolves through var(--step-0) → ${m.axisFontSize}`, m.axisFontSize === '20px'],
        [`sparkline stroke is the brand ink, not white-on-white → ${m.sparkStroke}`, m.sparkStroke === brandRgb],
        [`icon-only button is named for screen readers → "${m.btnLabel}"`, m.btnLabel === 'بحث'],
        ['the only page error is the deliberate one, and it was fenced (none escaped)', pageErrors.length === 0],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    if (failed) console.log('\nbody text was:', m.bodyText.slice(0, 600));
    console.log(failed === 0
        ? '\nPROOF COMPLETE: all six user-reported defects are fixed and measured in a real browser.'
        : `\n${failed} CHECK(S) FAILED`);
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
