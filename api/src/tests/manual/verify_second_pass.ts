/**
 * WIRE PROOF — the second deep pass, measured in the REAL browser with the
 * REAL runtimes (theme toggle, chart engine, bidi CSS, surface pairing):
 *
 *   1. RTL zeroes the kit's Latin tracking: computed letter-spacing of an
 *      .eyebrow on an Arabic page is 0px, not 1.92px (.12em).
 *   2. Pressing the page's OWN theme switch repaints the charts — the defect
 *      was that only the OS scheme change did.
 *   3. applySurfacePairing + a contrast-repair rebuild leave EXACTLY ONE
 *      .band.band rule, and the band's text measures white in the browser.
 *
 * Run:  npx tsx src/tests/manual/verify_second_pass.ts
 */
import http from 'http';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { applySurfacePairing } = await import('../../core/design/layouts');
    const { applyMechanicalRepairs } = await import('../../core/quality/repair-engine');
    const { bidiCss } = await import('../../core/design/language');
    const { chartCss, chartRuntime } = await import('../../core/design/dataviz');
    const { themeRuntime, ensureThemeToggle } = await import('../../core/design/theme');
    const { chromium } = require('playwright');

    // A page assembled the way the builder assembles one: tokens, the kit's
    // Latin tracking, bidi overrides, a two-series chart, the real theme
    // runtime and the real chart runtime.
    let page = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فحص</title>
<style>
:root{--brand:#6e31d8;--brand-dark:#4f1da5;--on-brand:#fff;--bg:#f9f8fc;--surface:#fff;--text:#2f2541;--text-muted:#675a7c;--border:#ded7ea;--tint:#e7dcf9}
:root[data-theme="dark"]{--bg:#131019;--surface:#1d1825;--text:#f4f4f6;--text-muted:#bbb5c5;--border:#352e42}
body{background:var(--bg);color:var(--text)}
.eyebrow{display:inline-block;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
h2{letter-spacing:-.02em}
.band{padding:40px}
${bidiCss()}
${chartCss()}
</style>
</head><body>
<header><nav><a href="#x">الرئيسية</a></nav><span class="eyebrow">خدماتنا</span><h2 id="head">ما نقدمه</h2></header>
<section class="band"><h2 id="bandtext">نحن نحب ما نقوم به</h2></section>
<figure data-chart="bar" data-labels="أ,ب,ج" data-values="3,5,2;4,1,6" data-series="س,ص"></figure>
${themeRuntime(true)}
${chartRuntime(true)}
</body></html>`;
    page = ensureThemeToggle(page, true).html;

    // The pairing + a contrast-repair rebuild — the sequence that used to eat it.
    page = applySurfacePairing(page, 'overlap');
    page = applyMechanicalRepairs(page, [
        { code: 'contrast', data: [{ sel: '#head', fg: [150, 150, 150], bg: [255, 255, 255], need: 4.5, ratio: 3.2, text: 'ما نقدمه' }] },
    ]).html;
    check('after the repair round: exactly ONE .band.band rule', (page.match(/\.band\.band\{/g) || []).length === 1);
    check('the pairing sits in its own identified block', page.includes('<style id="joe-surface-pairing">'));

    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const url = `http://127.0.0.1:${(server.address() as any).port}/`;

    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(400);

    console.log('\n[1] الطباعة العربية — تتبّع الأحرف صفر على صفحة عربية');
    const spacing = await p.evaluate(() => getComputedStyle(document.querySelector('.eyebrow')!).letterSpacing);
    check('computed .eyebrow letter-spacing is normal (0)', spacing === 'normal' || spacing === '0px', spacing);
    const tt = await p.evaluate(() => getComputedStyle(document.querySelector('.eyebrow')!).textTransform);
    check('uppercase is off under RTL', tt === 'none', tt);

    console.log('\n[2] الرسوم البيانية تتبع زر الثيم الحقيقي');
    const fillBefore = await p.evaluate(() => document.querySelector('[data-chart] svg path')?.getAttribute('fill'));
    check('the chart drew (a bar exists)', !!fillBefore, String(fillBefore));
    await p.click('[data-theme-toggle]');
    await p.waitForTimeout(400);
    const theme = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('the toggle really switched the page theme', theme === 'dark', String(theme));
    const fillAfter = await p.evaluate(() => document.querySelector('[data-chart] svg path')?.getAttribute('fill'));
    check('the chart REDREW in the dark palette (fill changed)', !!fillAfter && fillAfter !== fillBefore, `${fillBefore} → ${fillAfter}`);

    console.log('\n[3] نص الشريط الملون أبيض فوق التدرج (قاعدة الاقتران نجت من جولة الإصلاح)');
    const band = await p.evaluate(() => {
        const el = document.querySelector('#bandtext')!;
        const st = getComputedStyle(el);
        const bg = getComputedStyle(el.closest('.band')!);
        return { color: st.color, bgImage: bg.backgroundImage.slice(0, 40) };
    });
    check('band text is var(--on-brand) white', band.color === 'rgb(255, 255, 255)', band.color);
    check('band background is the brand gradient', /gradient/.test(band.bgImage), band.bgImage);

    await browser.close();
    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
