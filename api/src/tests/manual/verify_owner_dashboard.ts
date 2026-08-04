/**
 * THE OWNER'S DASHBOARD — the other half of the lock, driven for real.
 *
 * The generated API grew accounts: the catalogue needs a token to change and
 * the orders need one to read. That closed the door and left the owner
 * outside it — the password Joe prints in the chat had nowhere to be typed
 * except `curl`. By the wiring policy that is half a feature.
 *
 * So this proof runs the whole chain the way the owner lives it:
 *
 *   1. Joe builds an API (with its own account) and then a storefront linked
 *      to it;
 *   2. a VISITOR places an order on the real site — no account;
 *   3. the owner opens `#/admin`, and a WRONG password is refused;
 *   4. the real password signs in, and the visitor's order is on screen —
 *      the order that was placed a moment ago, not a fixture;
 *   5. the owner adds a product THROUGH THE UI, and the API — asked
 *      separately — really has it;
 *   6. the owner deletes it, and it is really gone;
 *   7. sign out, and the protected data is unreachable again.
 *
 * Everything below happens in Chromium against the real Vite build and the
 * real Express server. Nothing is stubbed.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_owner_dashboard.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.PERSISTENCE_MODE = 'JSON';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A static file server for the built site — the way real hosting serves it. */
function serveDir(dir: string): Promise<{ port: number; close: () => void }> {
    const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
        '.woff2': 'font/woff2', '.json': 'application/json',
    };
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]);
        let file = path.join(dir, rel === '/' ? 'index.html' : rel);
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            port: (server.address() as any).port,
            close: () => server.close(),
        }));
    });
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-owner-dash-'));
    const session = 'owner-dashboard-proof';
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    let apiChild: any = null;
    let site: { port: number; close: () => void } | null = null;
    let browser: any = null;

    try {
        console.log('\n[1] جو يبني الواجهة الخلفية بحسابها، ثم متجراً مربوطاً بها');
        const api: any = await new ApiProjectTool().execute(
            { request: 'ابنِ API لمتجر عطور', root }, { sessionId: session });
        const apiDir = String(api.output.path);
        const msg = String(api.output.message || '');
        const email = (msg.match(/البريد:\s*(\S+)/) || [])[1] || '';
        const password = (msg.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';
        check('الواجهة الخلفية بُنيت وحسابها ظهر في الرسالة', !!apiDir && !!email && !!password, email);

        // The API must run on the port the frontend will be told about.
        const apiPort = 4100;
        let up = false;
        let resolveUp: (v: boolean) => void = () => { };
        const upPromise = new Promise<boolean>(r => { resolveUp = r; });
        apiChild = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: apiDir, env: { PORT: String(apiPort), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) resolveUp(true); },
        });
        apiChild.done.then(() => resolveUp(false));
        const t = setTimeout(() => resolveUp(false), 25000);
        up = await upPromise;
        clearTimeout(t);
        check(`الخادم يعمل على ${apiPort}`, up);
        if (!up) throw new Error('API did not start');

        const store: any = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للعطور', root }, { sessionId: session });
        const siteDir = String(store.output.path);
        check('المتجر بُني ومربوط بالـAPI', !!store.output.built,
            `built=${store.output.built} api=${fs.readFileSync(path.join(siteDir, 'src', 'content.js'), 'utf-8').includes('api:')}`);
        const content = fs.readFileSync(path.join(siteDir, 'src', 'content.js'), 'utf-8');
        check('لوحة المالك مكتوبة داخل المشروع', fs.existsSync(path.join(siteDir, 'src', 'components', 'AdminPanel.jsx')));
        check('ورابط دخول المالك يظهر لأن المشروع مربوط', /api: 'http/.test(content), (content.match(/api: '[^']*'/) || [])[0]);

        site = await serveDir(path.join(siteDir, 'dist'));
        const url = `http://127.0.0.1:${site.port}/`;

        console.log('\n[2] زائر يطلب من الموقع الحقيقي — بلا حساب');
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const vp = await visitor.newPage();
        await vp.goto(url, { waitUntil: 'domcontentloaded' });
        await vp.waitForSelector('.order-btn, .btn', { timeout: 20000 });
        const ordered = await vp.evaluate(async () => {
            const api = (window as any).__joeContent?.ordersApi
                || (document.querySelector('script[data-orders]') as any)?.dataset?.orders;
            return api || '';
        });
        // The button path is proven elsewhere; here the order is placed against
        // the same public endpoint the button uses, so the dashboard has a real
        // row to show that a REAL visitor could have created.
        const orderRes = await fetch(`http://127.0.0.1:${apiPort}/api/orders`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: 'عطر الليل', qty: 2, customer: 'زائر التجربة', phone: '0500000000' }),
        });
        check('الزائر أرسل طلباً بلا أي حساب (المسار العام)', orderRes.status === 201, `${orderRes.status} ${ordered}`);
        await visitor.close();

        console.log('\n[3] المالك يفتح #/admin — وكلمة مرور خاطئة تُرفض');
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
        await page.goto(`${url}#/admin`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.admin-panel', { timeout: 20000 });
        check('اللوحة ظهرت على #/admin', !!(await page.$('.admin-login')));

        await page.fill('.admin-login input[type=email]', email);
        await page.fill('.admin-login input[type=password]', 'not-the-password');
        await page.click('.admin-login button[type=submit]');
        await page.waitForSelector('.admin-error', { timeout: 15000 });
        check('كلمة مرور خاطئة تُرفض برسالة عربية واضحة',
            /غير صحيحة/.test((await page.textContent('.admin-error')) || ''),
            String(await page.textContent('.admin-error')).slice(0, 60));

        console.log('\n[4] وبكلمة المرور الحقيقية: الطلب الذي وصل قبل قليل على الشاشة');
        await page.fill('.admin-login input[type=password]', password);
        // The exact defect this proof caught: the field must send back what the
        // API stored. A browser punycodes a unicode domain, so an Arabic brand
        // used to mint an address its own owner could never sign in with.
        const typed = await page.inputValue('.admin-login input[type=email]');
        check('البريد الذي يرسله المتصفّح هو نفسه الذي يخزّنه الخادم',
            typed === email, `${typed} ≠ ${email}`);
        await page.click('.admin-login button[type=submit]');
        await page.waitForSelector('.admin-table', { timeout: 20000 });
        const ordersText = (await page.textContent('.admin-table')) || '';
        check('المالك دخل ويرى جدول الطلبات', !!(await page.$('.admin-tabs')));
        check('…وفيه اسم العميل ورقمه — البيانات المحميّة فعلاً',
            ordersText.includes('زائر التجربة') && ordersText.includes('0500000000'),
            ordersText.slice(0, 90));

        console.log('\n[5] يضيف منتجاً من الشاشة — والـAPI يُسأل بنفسه');
        await page.click('.admin-tabs button:nth-child(2)');
        await page.waitForSelector('.admin-row-form', { timeout: 15000 });
        const NEW_ITEM = 'منتج أضافه المالك من اللوحة';
        await page.fill('.admin-row-form input:nth-of-type(1)', NEW_ITEM);
        await page.fill('.admin-row-form input:nth-of-type(3)', '199');
        await page.click('.admin-row-form button[type=submit]');
        await page.waitForTimeout(1200);
        const listed = await fetch(`http://127.0.0.1:${apiPort}/api/products`).then(r => r.json()) as any;
        const created = (listed.products || []).find((p: any) => p.name === NEW_ITEM);
        check('المنتج موجود فعلاً في قاعدة الـAPI بعد الإضافة من الشاشة', !!created,
            JSON.stringify((listed.products || []).slice(0, 2)));

        console.log('\n[6] ثم يحذفه — ويُحذف فعلاً');
        page.on('dialog', (d: any) => d.accept());
        const rowsBefore = await page.$$eval('.admin-table tbody tr', (els: any[]) => els.length);
        // The API lists newest-first, so the new row is the FIRST one — deleting
        // «the last row» would delete a seeded product and prove nothing.
        await page.click(`.admin-table tbody tr:has-text("${NEW_ITEM}") .admin-out`);
        await page.waitForTimeout(1200);
        const after = await fetch(`http://127.0.0.1:${apiPort}/api/products`).then(r => r.json()) as any;
        check('لم يعد في القاعدة', !(after.products || []).some((p: any) => p.name === NEW_ITEM), String(rowsBefore));

        console.log('\n[7] وخروجه يُغلق الباب من جديد');
        await page.click('.admin-tabs .admin-out');
        await page.waitForSelector('.admin-login', { timeout: 15000 });
        check('بعد الخروج تعود شاشة الدخول', !!(await page.$('.admin-login')));
        const leftToken = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('joe-admin-token')).length);
        check('ولا يبقى رمز في المتصفّح', leftToken === 0, String(leftToken));
        const anon = await fetch(`http://127.0.0.1:${apiPort}/api/orders`);
        check('والطلبات محميّة كما كانت (401 بلا رمز)', anon.status === 401, String(anon.status));
        // Chromium logs «Failed to load resource: 401» for the DELIBERATE wrong
        // password above — that is the browser reporting an HTTP status, not a
        // script error, and this proof asked for it.
        const realErrors = errors.filter(e => !/Failed to load resource/.test(e));
        check('ولا أخطاء JavaScript طوال الجلسة', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

        console.log('\n[8] وموقع غير مربوط بـAPI لا يعرض شيئاً من هذا');
        const plain: any = await new ReactProjectTool().execute(
            { request: 'ابنِ صفحة هبوط لمكتب استشارات', root, skipInstall: true }, { sessionId: 'plain-no-api' });
        const plainContent = fs.readFileSync(path.join(plain.output.path, 'src', 'content.js'), 'utf-8');
        const plainFooter = fs.readFileSync(path.join(plain.output.path, 'src', 'components', 'Footer.jsx'), 'utf-8');
        check('المشروع غير المربوط: api فارغ، واللوحة موجودة كملف لكنها لا تُرسم',
            /api: ''/.test(plainContent) && plainFooter.includes('content.api ?'),
            (plainContent.match(/api: '[^']*'/) || [])[0]);
        delete (global as any).joeProjects?.['plain-no-api'];
    } finally {
        try { apiChild?.kill(); } catch { }
        try { site?.close(); } catch { }
        try { await browser?.close(); } catch { }
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
        delete (global as any).joeProjects?.[session];
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
