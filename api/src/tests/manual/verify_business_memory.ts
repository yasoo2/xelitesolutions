/**
 * WIRE PROOF — business memory, end to end:
 *
 *   The profile is saved through the REAL tool, survives a simulated
 *   restart (fresh module registry, same disk), flows into a REAL build
 *   (npm install + vite build), and a REAL browser sees the owner's REAL
 *   phone as a tel: link, the wa.me link, and the Instagram handle in the
 *   footer. A cleared profile builds with contact: null — no placeholder
 *   ever fabricated.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_business_memory.ts
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

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-memory-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] الحفظ عبر الأداة الحقيقية — والملف على القرص');
    const { BusinessProfileTool } = require('../../modules/tools/definitions/BusinessProfileTool');
    const saved: any = await new BusinessProfileTool().execute(
        { request: 'احفظ بيانات عملي: الاسم مطعم الريف، الجوال 0501234567، واتساب 0501234567، البريد hi@reef.sa، انستغرام reef_rest، الدوام 9ص إلى 11م' },
        { sessionId: 'mem-wire' });
    check('the tool saved and echoed the profile', String(saved.output.message).includes('مطعم الريف') && String(saved.output.message).includes('0501234567'));
    check('the profile file is REAL and on disk', fs.readFileSync(path.join(process.env.JOE_CHAT_STORE_DIR, 'business-profile.json'), 'utf-8').includes('reef_rest'));

    console.log('\n[2] «إعادة تشغيل»: وحدات جديدة، نفس القرص — الذاكرة تنجو');
    for (const k of Object.keys(require.cache)) {
        if (/business-profile/.test(k)) delete require.cache[k];
    }
    const { getProfile } = require('../../core/profile/business-profile');
    const back = getProfile('a-completely-new-session');
    check('a NEW session after the restart still knows the business (default slot)', back?.brand === 'مطعم الريف' && back?.phone === '0501234567', JSON.stringify(back));

    console.log('\n[3] بناء حقيقي يحمل البيانات الحقيقية — والمتصفح يراها');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const res: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمطعمي', root, skipImages: true }, { sessionId: 'mem-wire' });
    check('the app built for real AND took the saved brand', res.output?.built === true && /مطعم-الريف|مطعم الريف/.test(String(res.output.path) + fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8')), res.output?.path);
    const dist = path.join(res.output.path, 'dist');
    const site = http.createServer((req, res2) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res2.writeHead(404); return res2.end(); }
        res2.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
        res2.end(fs.readFileSync(file));
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen = await p.evaluate(() => ({
        brand: document.querySelector('.brand')?.textContent || '',
        tel: (document.querySelector('.contact-info a[href^="tel:"]') as HTMLAnchorElement | null)?.href || '',
        wa: (document.querySelector('.contact-info a[href*="wa.me"]') as HTMLAnchorElement | null)?.href || '',
        mail: (document.querySelector('.contact-info a[href^="mailto:"]') as HTMLAnchorElement | null)?.href || '',
        insta: (document.querySelector('.socials a[href*="instagram.com"]') as HTMLAnchorElement | null)?.href || '',
        hours: /9ص إلى 11م/.test(document.body.textContent || ''),
    }));
    check('the brand on screen is the REAL business name', seen.brand === 'مطعم الريف', seen.brand);
    check('a REAL tel: link with the owner\'s number', seen.tel === 'tel:0501234567', seen.tel);
    check('the wa.me link normalized from the Saudi number', seen.wa.includes('wa.me/966501234567'), seen.wa);
    check('mailto + Instagram + hours all real', seen.mail.includes('hi@reef.sa') && seen.insta.includes('instagram.com/reef_rest') && seen.hours, JSON.stringify(seen));

    console.log('\n[4] بلا ملف: الصمت الصادق القديم — ولا رقم مختلق واحد');
    const { clearProfile } = require('../../core/profile/business-profile');
    clearProfile('mem-wire');
    const bare: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمقهى الضباب', root, skipInstall: true }, { sessionId: 'mem-bare' });
    const content = fs.readFileSync(path.join(bare.output.path, 'src', 'content.js'), 'utf-8');
    check('contact: null — no placeholders, no fabricated digits', content.includes('contact: null') && !/05\d{8}/.test(content) && !content.includes('example.com'));

    await browser.close();
    site.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
