/**
 * THE APP SIGNS IN TO ITS OWN SERVER — AND THE ROW REALLY LANDS.
 *
 * Found while continuing: the generated backend protects every write with
 * requireAuth (it must — otherwise a stranger writes to your database), and
 * the generated FRONTEND sent no token at all. Every «add» hit 401, the error
 * was swallowed, and the row lived in that one browser. It looked saved. It
 * was not, and a reload anywhere else showed nothing.
 *
 * This drives the real thing end to end:
 *   [2] signed OUT, a write is refused by the server and the app says so
 *   [3] the owner signs in FROM THE APP with the credentials Joe printed
 *   [4] the same write now lands, and a SEPARATE HTTP client reads it back
 *   [5] the session survives a reload; signing out ends it
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_app_auth.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REQUEST = 'ابنِ نظام حجز مواعيد لعيادة أسنان مع قاعدة بيانات وتسجيل دخول';

const req = (method: string, url: string, body?: any) => new Promise<any>((resolve) => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
        let b = ''; res.on('data', d => { b += d; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, body: b }); } });
    });
    r.on('error', e => resolve({ status: 0, body: String(e) }));
    if (data) r.write(data);
    r.end();
});

const waitFor = async (url: string, tries = 40) => {
    for (let i = 0; i < tries; i++) {
        if ((await req('GET', url)).status === 200) return true;
        await new Promise(res => setTimeout(res, 250));
    }
    return false;
};

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-auth-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `auth-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`auth-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] النظام كاملاً: خادم بحسابات، وتطبيق مبنيّ');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir || 'لا مجلد');

    const msg = String(api?.output?.message || '');
    const email = String(api?.output?.ownerEmail || '');
    const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';
    check('وبيانات المالك ظهرت مرة واحدة كما ينبغي', !!email && !!password, `email=${!!email} pass=${!!password}`);

    const port = 4700 + Math.floor(Math.random() * 200);
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const server = executionEngine.runArgvStreaming('node', ['server.js'], { cwd: apiDir, env: { PORT: String(port) } });
    const base = `http://127.0.0.1:${port}`;
    check('والخادم يعمل', await waitFor(`${base}/api/health`));

    const app: any = await executeTool('react_project', { request: REQUEST });
    const proj = String(app?.output?.path || '');
    const distIndex = proj ? path.join(proj, 'dist', 'index.html') : '';
    check('والتطبيق تجمّع فعلاً', !!distIndex && fs.existsSync(distIndex), proj || 'لا مجلد');

    if (!fs.existsSync(distIndex)) { server.kill(); console.log(`\n===== ${pass} passed, ${fail} failed =====`); process.exit(1); }

    // Point the built app at THIS server — the same wiring a real deployment has.
    const contentFile = path.join(proj, 'dist', 'assets');
    const bundles = fs.readdirSync(contentFile).filter(f => f.endsWith('.js'));
    let pointed = false;
    for (const b of bundles) {
        const f = path.join(contentFile, b);
        const src = fs.readFileSync(f, 'utf-8');
        const next = src.replace(/http:\/\/localhost:4100\/api\/[a-z]+/g, `${base}/api/bookings`);
        if (next !== src) { fs.writeFileSync(f, next); pointed = true; }
    }
    check('والتطبيق موجَّه إلى خادمه', pointed, 'لم يُعثر على عنوان الواجهة البرمجية في الحزمة');

    const distDir = path.join(proj, 'dist');
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    const site = http.createServer((rq, rs) => {
        const rel = decodeURIComponent(String(rq.url || '/').split('?')[0]);
        const file = path.join(distDir, rel === '/' ? 'index.html' : rel);
        if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
        rs.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        rs.end(fs.readFileSync(file));
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const siteUrl = `http://127.0.0.1:${(site.address() as any).port}/`;

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        page.on('pageerror', (e: any) => errors.push(String(e?.message || e)));
        await page.goto(siteUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);

        console.log('\n[2] موقّعاً بالخروج: الخادم يرفض الكتابة، والتطبيق لا يكذب');
        check('زر «دخول المالك» ظاهر', await page.locator('.auth-open').count() === 1);
        const before = await req('GET', `${base}/api/bookings`);
        const countBefore = (before.body?.bookings || []).length;

        const addRow = async (who: string) => {
            const inputs = page.locator('.panel form input, .panel form textarea, .panel form select');
            await inputs.nth(0).fill(who);
            await page.locator('.panel form button[type="submit"]').first().click();
            await page.waitForTimeout(900);
        };
        await addRow('حجز بلا تسجيل دخول');
        const mid = await req('GET', `${base}/api/bookings`);
        check('الصفّ لم يصل إلى الخادم (كما يجب وهو غير مسجّل)',
            (mid.body?.bookings || []).length === countBefore,
            `${(mid.body?.bookings || []).length} بدل ${countBefore}`);

        console.log('\n[3] المالك يسجّل دخوله من داخل التطبيق');
        await page.click('.auth-open');
        await page.waitForTimeout(300);
        await page.locator('.auth-card input[type="email"]').fill(email);
        await page.locator('.auth-card input[type="password"]').fill(password);
        await page.locator('.auth-card button[type="submit"]').click();
        await page.waitForTimeout(1200);
        check('ظهرت هويّته في الواجهة', await page.locator('.auth-chip').count() === 1,
            await page.locator('.auth-error').innerText().catch(() => ''));
        check('وبريده معروض', (await page.locator('.auth-who').innerText().catch(() => '')).includes('@'));

        console.log('\n[4] والآن الكتابة تصل فعلاً إلى قاعدة البيانات');
        await addRow('حجز بعد تسجيل الدخول');
        const after = await req('GET', `${base}/api/bookings`);
        const rows = after.body?.bookings || [];
        check('عدد الصفوف زاد على الخادم', rows.length === countBefore + 1, `${rows.length} بدل ${countBefore + 1}`);
        check('والصفّ هو ما كُتب في المتصفح',
            rows.some((r: any) => String(r.name || '').includes('بعد تسجيل الدخول')),
            JSON.stringify(rows.slice(0, 2)).slice(0, 200));

        console.log('\n[5] والجلسة تبقى بعد إعادة التحميل، وتنتهي بالخروج');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(900);
        check('ما زال مسجّلاً بعد إعادة التحميل', await page.locator('.auth-chip').count() === 1);
        await page.locator('.auth-chip button').click();
        await page.waitForTimeout(400);
        check('والخروج يعيد زر الدخول', await page.locator('.auth-open').count() === 1);
        check('ولا خطأ جافاسكربت في التطبيق', errors.length === 0, errors.slice(0, 2).join(' | '));
    } finally {
        await browser.close();
        (site as any).closeAllConnections?.();
        site.close();
        server.kill();
        await new Promise(r => setTimeout(r, 400));
        try { fs.rmSync(path.join(apiDir, 'data.db'), { force: true }); } catch { /* fine */ }
        try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* fine */ }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
