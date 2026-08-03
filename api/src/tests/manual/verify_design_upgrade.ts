/**
 * WIRE PROOF — the design overhaul is PIXELS, not promises:
 *
 *   Two REAL builds (elegant perfume store, bold SaaS). A REAL browser then
 *   testifies to what shipped:
 *     - the BUNDLED Arabic webfonts actually LOADED (document.fonts) — the
 *       fake-serif costume this batch was born from is dead: elegant
 *       headings measure as REAL Amiri, bodies as REAL Cairo/Tajawal
 *     - the hero carries its eyebrow badge, dual CTAs and glow layers
 *     - cards reveal on scroll (data-reveal → .in) and lift on hover
 *     - feature cards carry inline SVG icons
 *     - self-QA still 100/100 WITH the new webfont check armed
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_design_upgrade.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const serve = (dist: string): Promise<{ url: string; close: () => void }> => new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as any).port}/`, close: () => srv.close() }));
});

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-design-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] بناءان حقيقيان — والخطوط الحقيقية سافرت مع كل تطبيق');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const fancy: any = await new ReactProjectTool().execute(
        { request: 'ابنِ متجر react فاخر للعطور', root, skipImages: true }, { sessionId: 'du-a' });
    const bold: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمنصة تقنية بتصميم جريء', root, skipImages: true }, { sessionId: 'du-b' });
    check('both built for real', fancy.output?.built === true && bold.output?.built === true);
    const fontsA = fs.readdirSync(path.join(fancy.output.path, 'src', 'styles', 'fonts'));
    check('the elegant app ships REAL Amiri + Cairo woff2 files with the OFL notice',
        fontsA.includes('amiri-700-arabic.woff2') && fontsA.includes('cairo-400-arabic.woff2') && fontsA.includes('OFL-LICENSE.txt'), fontsA.join(','));
    check('…and each file is real font bytes, not a stub', fs.statSync(path.join(fancy.output.path, 'src', 'styles', 'fonts', 'amiri-700-arabic.woff2')).size > 20_000);
    check('self-QA (now armed with the webfont check) still passes 100/100',
        fancy.output.audit?.score === 100 && bold.output.audit?.score === 100,
        JSON.stringify({ a: fancy.output.audit, b: bold.output.audit }).slice(0, 160));

    console.log('\n[2] المتصفح يشهد: الخطوط حُمِّلت ورُسمت فعلاً');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const sA = await serve(path.join(fancy.output.path, 'dist'));
    const pA = await browser.newPage();
    await pA.goto(sA.url, { waitUntil: 'networkidle' });
    const fontsSeen = await pA.evaluate(async () => {
        await (document as any).fonts.ready;
        return {
            bodyLoaded: (document as any).fonts.check('16px "Cairo"'),
            headLoaded: (document as any).fonts.check('16px "Amiri"'),
            h1Font: getComputedStyle(document.querySelector('h1')!).fontFamily,
        };
    });
    check('REAL Cairo loaded for the body', fontsSeen.bodyLoaded === true, JSON.stringify(fontsSeen));
    check('REAL Amiri loaded for the elegant headings (the dead costume, resurrected as fact)', fontsSeen.headLoaded === true && /Amiri/.test(fontsSeen.h1Font));

    console.log('\n[3] البطل الجديد: شارة، زران، طبقات توهج — والحركة تعمل');
    const heroSeen = await pA.evaluate(() => {
        const before = getComputedStyle(document.querySelector('.hero')!, '::before');
        return {
            eyebrow: (document.querySelector('.hero-eyebrow')?.textContent || '').length > 2,
            ctas: document.querySelectorAll('.hero-ctas .btn').length,
            ghost: !!document.querySelector('.btn-ghost'),
            glow: before.filter.includes('blur') && before.borderRadius === '50%',
        };
    });
    check('eyebrow badge + TWO CTAs (primary + ghost) on the hero', heroSeen.eyebrow && heroSeen.ctas === 2 && heroSeen.ghost, JSON.stringify(heroSeen));
    check('the glow layers are painted (blurred ::before)', heroSeen.glow);
    const reveal = await pA.evaluate(async () => {
        const card = document.querySelector('.card')!;
        card.scrollIntoView();
        await new Promise(r => setTimeout(r, 900));
        return { marked: card.hasAttribute('data-reveal'), revealed: card.classList.contains('in'), opacity: getComputedStyle(card).opacity };
    });
    check('cards are observed and REVEAL on scroll (opacity 1 after .in)', reveal.marked && reveal.revealed && parseFloat(reveal.opacity) > 0.9, JSON.stringify(reveal));

    console.log('\n[4] الطراز الجريء: Cairo أسود 900 والأيقونات على البطاقات');
    const sB = await serve(path.join(bold.output.path, 'dist'));
    const pB = await browser.newPage();
    await pB.goto(sB.url, { waitUntil: 'networkidle' });
    const boldSeen = await pB.evaluate(async () => {
        await (document as any).fonts.ready;
        return {
            heavy: (document as any).fonts.check('900 16px "Cairo"'),
            h1Weight: getComputedStyle(document.querySelector('h1')!).fontWeight,
            icons: document.querySelectorAll('.card-icon svg').length,
        };
    });
    check('the 900-weight Cairo really loaded and the h1 wears it', boldSeen.heavy === true && boldSeen.h1Weight === '900', JSON.stringify(boldSeen));
    check('feature cards carry inline SVG icons', boldSeen.icons >= 3, String(boldSeen.icons));

    await browser.close();
    sA.close(); sB.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
