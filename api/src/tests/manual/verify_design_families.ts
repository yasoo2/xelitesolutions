/**
 * WIRE PROOF — the design families are REAL pixels, not variables on paper:
 *
 *   Two apps build for real (npm install + vite build) from two requests —
 *   a fancy perfume store (elegant) and a bold SaaS (bold). A REAL browser
 *   measures computed styles and finds genuinely different identities:
 *   serif vs sans headings, 6px vs 4px radii, hairline vs thick borders.
 *   Then «غيّر الطراز إلى دافئ» swaps the store's family on the BUILT
 *   project, the real build verifies, and the browser measures the change.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_design_families.ts
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
        res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as any).port}/`, close: () => srv.close() }));
});

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-family-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] بناءان حقيقيان بطرازين مختلفين من طلبين');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const fancy: any = await new ReactProjectTool().execute(
        { request: 'ابنِ متجر react فاخر للعطور', root, skipImages: true }, { sessionId: 'fam-a' });
    const bold: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمنصة إدارة مهام بتصميم جريء', root, skipImages: true }, { sessionId: 'fam-b' });
    check('both apps built for real', fancy.output?.built === true && bold.output?.built === true, JSON.stringify({ a: fancy.output?.built, b: bold.output?.built }));

    console.log('\n[2] متصفح حقيقي يقيس هويتين مختلفتين فعلاً');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const measure = async (url: string) => {
        const p = await browser.newPage();
        await p.goto(url, { waitUntil: 'networkidle' });
        const m = await p.evaluate(() => {
            const h1 = document.querySelector('h1')!;
            const card = document.querySelector('.card')!;
            const cs = getComputedStyle(card);
            return {
                headFont: getComputedStyle(h1).fontFamily,
                radius: cs.borderRadius,
                borderW: cs.borderTopWidth,
                shadow: cs.boxShadow,
            };
        });
        await p.close();
        return m;
    };
    const sA = await serve(path.join(fancy.output.path, 'dist'));
    const sB = await serve(path.join(bold.output.path, 'dist'));
    const mA = await measure(sA.url);
    const mB = await measure(sB.url);
    // A NAMED serif — /serif/ alone matches 'sans-serif' and passed on the
    // wrong app (the run that exposed the react-react directory collision).
    check('the fancy store renders SERIF headings; the SaaS stays sans', /Amiri|Georgia/i.test(mA.headFont) && !/Amiri|Georgia/i.test(mB.headFont), JSON.stringify({ a: mA.headFont, b: mB.headFont }));
    check('the two apps live in DIFFERENT directories (no cross-session overwrite)', fancy.output.path !== bold.output.path, `${fancy.output.path} vs ${bold.output.path}`);
    check('the radii differ (6px elegant vs 4px bold)', mA.radius === '6px' && mB.radius === '4px', JSON.stringify({ a: mA.radius, b: mB.radius }));
    check('hairline vs THICK borders', mA.borderW === '1px' && mB.borderW === '2px', JSON.stringify({ a: mA.borderW, b: mB.borderW }));
    check('the brutalist hard shadow is really painted', /6px 6px 0(px)?/.test(mB.shadow), mB.shadow.slice(0, 80));

    console.log('\n[3] «غيّر الطراز إلى دافئ» على المشروع المبني — بناء متحقق وفارق مقيس');
    const { ProjectEditTool } = require('../../modules/tools/definitions/ProjectEditTool');
    const swap: any = await new ProjectEditTool().execute({ request: 'غيّر الطراز إلى دافئ' }, { sessionId: 'fam-a' });
    check('the swap succeeded AND the real build verified it', !!swap.ok && swap.output.buildVerified === true, JSON.stringify({ ok: swap.ok, bv: swap.output?.buildVerified, msg: String(swap.output?.message).slice(0, 100) }));
    check('no model was asked', (swap.logs || []).some((l: string) => /no model/.test(l)));
    const mA2 = await measure(sA.url);
    check('the browser measures the WARM identity now (26px radii, sans headings)', mA2.radius === '26px' && !/Amiri|Georgia/i.test(mA2.headFont), JSON.stringify(mA2));

    await browser.close();
    sA.close(); sB.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
