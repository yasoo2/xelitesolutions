/**
 * LIVE PROOF — the four defects measured on the user's real tech-startup
 * landing build (session 6a6f70e6…), fixed and pressed in a real browser:
 *
 *   1. «5 of 9 controls do nothing when clicked» — the model's VERBATIM FAQ
 *      script (manual open-toggle on a native <details>) cancelled the
 *      browser's own toggle. The details-guard must make the question OPEN
 *      on one click and CLOSE on the next.
 *   2. a healthy native <details> with no model script must still toggle
 *      normally — the guard must not break correct pages.
 *   3. the stray `<main>` that opened INSIDE section#sticky-header-nav-links
 *      (`</header>\n<main>\n</section>`) — <main> must now be a direct child
 *      of <body>, outside every section.
 *   4. the 4.33:1 «/month» — the REAL visual audit must hand over selector +
 *      colours, the mechanical repair must solve it, and a REAL re-audit must
 *      come back without the contrast finding.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_landing_fixes.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
    const { assemblePage } = await import('../../core/design/section-writer');
    const { splitHtmlProject, reviewHtml } = await import('../../core/quality/html-qa');
    const { uiKitCss, uiKitScript } = await import('../../core/design/design-system');
    const { auditVisually } = await import('../../core/quality/visual-audit');
    const { applyMechanicalRepairs } = await import('../../core/quality/repair-engine');

    // The sticky-nav section EXACTLY as the landing build shipped it: the site
    // header nested inside a <section>, which is what lured <main> inside.
    const stickyNav = `<section class="section" id="sticky-header-nav-links">
  <header class="site-header"><nav><a href="#faq">FAQ</a> <a href="#pricing">Pricing</a></nav></header>
</section>`;

    // The FAQ section with the model's culprit script, VERBATIM from the
    // user's dumped script.js (manual open-toggle on native <details>).
    const faq = `<section class="section" id="faq">
  <h2>Questions</h2>
  <details class="faq-item"><summary class="faq-question">How can I get started with your services?</summary><p>Sign up and pick a plan.</p></details>
  <details class="faq-item"><summary class="faq-question">Can I cancel at any time?</summary><p>Yes, anytime.</p></details>
  <details id="healthy"><summary>A question no script ever touched</summary><p>Native behaviour.</p></details>
  <script>
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      question.addEventListener('click', () => {
        if (item.hasAttribute('open')) {
          item.removeAttribute('open');
        } else {
          item.setAttribute('open', '');
        }
      });
    });
  </script>
</section>`;

    // The pricing note at the measured 4.33:1 (#7c7c7c on white).
    const pricing = `<section class="section" id="pricing">
  <h2>Pricing</h2>
  <p class="price">$29 <span class="term">/month billed annually</span></p>
</section>`;

    let html = assemblePage({
        title: 'Landing proof', isArabic: false,
        tokenCss: ':root{--step-0:16px;--text:#111827;--brand:#0e7a5f;--on-brand:#fff;--bg:#ffffff}\n'
            + 'body{background:#fff;color:#111827}\n.term{color:#7c7c7c;font-size:15px}',
        baseLayer: uiKitCss(),
        sections: [
            { id: 'sticky-header-nav-links', index: 1, spec: 'nav', html: stickyNav, ok: true } as any,
            { id: 'faq', index: 2, spec: 'faq', html: faq, ok: true } as any,
            { id: 'pricing', index: 3, spec: 'pricing', html: pricing, ok: true } as any,
        ],
        script: uiKitScript(),
    });

    // The builder's own QA pass — the one that inserts <main>.
    html = reviewHtml(html, false).html;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-landing-'));
    const writeOut = (h: string) => {
        const split = splitHtmlProject(h);
        fs.writeFileSync(path.join(dir, 'index.html'), split.indexHtml, 'utf-8');
        fs.writeFileSync(path.join(dir, 'styles.css'), split.css, 'utf-8');
        fs.writeFileSync(path.join(dir, 'script.js'), split.js, 'utf-8');
    };
    writeOut(html);
    const url = 'file://' + path.join(dir, 'index.html');

    // ---- 1+2+3: press the FAQ in a real browser, inspect the real tree ----
    let chromium: any;
    try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e: Error) => pageErrors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(300);

    const first = page.locator('.faq-item >> nth=0');
    const q1 = page.locator('.faq-question >> nth=0');
    await q1.click(); await page.waitForTimeout(120);
    const openAfterClick = await first.evaluate((d: any) => d.open);
    await q1.click(); await page.waitForTimeout(120);
    const closedAfterSecond = await first.evaluate((d: any) => !d.open);

    const healthy = page.locator('#healthy summary');
    await healthy.click(); await page.waitForTimeout(120);
    const healthyOpen = await page.locator('#healthy').evaluate((d: any) => d.open);
    await healthy.click(); await page.waitForTimeout(120);
    const healthyClosed = await page.locator('#healthy').evaluate((d: any) => !d.open);

    const tree = await page.evaluate(() => {
        const m = document.querySelector('main');
        return {
            mainExists: !!m,
            mainParentIsBody: !!m && m.parentElement === document.body,
            mainInsideSection: !!document.querySelector('section main, main section#sticky-header-nav-links'),
            faqInsideMain: !!document.querySelector('main #faq'),
        };
    });
    await browser.close();

    // ---- 4: the real audit → mechanical repair → real re-audit ------------
    process.env.BROWSER_EXECUTABLE_PATH = process.env.BROWSER_EXECUTABLE_PATH
        || (fs.existsSync(exe) ? exe : '');
    const audit = await auditVisually(url);
    const contrastBefore = audit.findings.find(f => f.code === 'contrast');
    const detail = (Array.isArray(contrastBefore?.data) ? contrastBefore!.data : [])
        .find((d: any) => /month/i.test(String(d.text)));
    const mech = applyMechanicalRepairs(html, audit.findings);
    let contrastGone = false, scoreHeld = false, after: any = null;
    if (mech.applied.includes('contrast')) {
        writeOut(mech.html);
        after = await auditVisually(url);
        contrastGone = after.ran && !after.findings.some((f: any) => f.code === 'contrast');
        scoreHeld = after.ran && after.score >= audit.score;
    }

    const checks: Array<[string, boolean]> = [
        ['the model-dialect FAQ question OPENS on one click (was: «does nothing»)', openAfterClick === true],
        ['…and CLOSES again on the next click — a real toggle, not a stuck state', closedAfterSecond === true],
        ['a native <details> untouched by any script still toggles normally', healthyOpen === true && healthyClosed === true],
        ['<main> exists and is a DIRECT CHILD of <body>', tree.mainExists && tree.mainParentIsBody],
        ['no <main> opens inside a section (the </header><main></section> corruption)', !tree.mainInsideSection],
        ['the FAQ content actually lives inside the landmark', tree.faqInsideMain],
        [`the audit measured the «/month» node and handed over its colours (${detail ? `${detail.ratio}:1, sel=${detail.sel}` : 'missing'})`,
            !!detail && Array.isArray(detail.fg) && Array.isArray(detail.bg) && !!detail.sel],
        [`the mechanical repair solved the contrast finding (${audit.score} → ${after?.score ?? '—'})`,
            mech.applied.includes('contrast') && contrastGone && scoreHeld],
        [`zero page errors while pressing everything (${pageErrors.length})`, pageErrors.length === 0],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    if (failed && audit.ran) {
        console.log('\naudit findings were:', JSON.stringify(audit.findings.map(f => ({ code: f.code, en: f.en })), null, 1).slice(0, 1200));
    }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: the landing build\'s four measured defects are fixed, pressed and re-measured in a real browser.'
        : `\n${failed} CHECK(S) FAILED`);
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
