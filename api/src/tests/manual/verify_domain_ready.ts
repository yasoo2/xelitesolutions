/**
 * ONE FOLDER, ONE PROCESS, ONE ORIGIN — «حتى يتم نقله الى دومين والعمل مباشره».
 *
 * Two things stopped a Joe-built system from working the moment it left the
 * developer's machine, and both were invisible locally:
 *
 *   1. the compiled bundle carried an ABSOLUTE http://localhost:4100/api/…
 *      address. On a domain that is a dead host: the interface loads and
 *      nothing it does reaches a server.
 *   2. the interface and its API were two processes on two ports. Nobody can
 *      deploy that without CORS and a reverse proxy.
 *
 * This proves the fix the only way that counts: ONE server process, on ONE
 * port that is NOT 4100, serving the built interface and its API together —
 * exactly the shape a domain sees — driven in a real browser.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_domain_ready.ts
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
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-domain-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `domain-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`domain-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] النظام كاملاً من طلب واحد');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir || 'لا مجلد');

    const app: any = await executeTool('react_project', { request: REQUEST });
    const proj = String(app?.output?.path || '');
    check('والتطبيق تجمّع', !!proj && fs.existsSync(path.join(proj, 'dist', 'index.html')), proj || 'لا مجلد');

    console.log('\n[2] والواجهة حُزمت داخل الخادم — مجلد واحد');
    const pub = path.join(apiDir, 'public');
    check('public/index.html موجود داخل الخادم', fs.existsSync(path.join(pub, 'index.html')),
        fs.existsSync(pub) ? fs.readdirSync(pub).join(', ') : 'لا مجلد public');

    console.log('\n[3] عملية واحدة على منفذ واحد ليس 4100 — كما يرى الدومين');
    const port = 5300 + Math.floor(Math.random() * 300);
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const server = executionEngine.runArgvStreaming('node', ['server.js'], { cwd: apiDir, env: { PORT: String(port) } });
    const base = `http://127.0.0.1:${port}`;
    check('الخادم يعمل', await waitFor(`${base}/api/health`));

    const home = await req('GET', `${base}/`);
    check('والصفحة الرئيسية تُقدَّم من نفس المنفذ', home.status === 200 && /<div id="root"|<!doctype html/i.test(String(home.body)),
        String(home.status));
    const deep = await req('GET', `${base}/some/inner/route`);
    check('وأي مسار داخلي يعود إلى التطبيق لا إلى 404', deep.status === 200, String(deep.status));
    const missingApi = await req('GET', `${base}/api/does-not-exist`);
    check('ومسارات الواجهة البرمجية لم تُبتلع', missingApi.status === 404, String(missingApi.status));

    console.log('\n[4] ومتصفح حقيقي على هذا العنوان يكتب في قاعدة البيانات');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        const calls: string[] = [];
        page.on('pageerror', (e: any) => errors.push(String(e?.message || e)));
        page.on('request', (r: any) => { const u = r.url(); if (u.includes('/api/')) calls.push(u); });
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        check('الواجهة ظهرت من الدومين نفسه', await page.locator('.app-name').count() > 0);
        check('ولم يطلب المتصفح localhost:4100 ولا مرة',
            !calls.some(u => /:4100/.test(u)), calls.filter(u => /:4100/.test(u)).slice(0, 2).join(' '));
        check('بل طلب واجهته البرمجية من نفس الأصل',
            calls.some(u => u.startsWith(base + '/api/')), calls.slice(0, 3).join(' '));

        const msg = String(api?.output?.message || '');
        const email = String(api?.output?.ownerEmail || '');
        const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';
        await page.click('.auth-open');
        await page.waitForTimeout(300);
        await page.locator('.auth-card input[type="email"]').fill(email);
        await page.locator('.auth-card input[type="password"]').fill(password);
        await page.locator('.auth-card button[type="submit"]').click();
        await page.waitForTimeout(1200);
        check('المالك سجّل دخوله من الدومين', await page.locator('.auth-chip').count() === 1,
            await page.locator('.auth-error').innerText().catch(() => ''));

        const before = ((await req('GET', `${base}/api/bookings`)).body?.bookings || []).length;
        // Past the PARENT panel («الأطباء»), which a clinic renders above the
        // booking form — the first form on the page adds a doctor, not a row.
        const form = page.locator('section.panel:not(.rel-panel) form.form').first();
        await form.locator('input, textarea, select').nth(0).fill('حجز من الدومين');
        await form.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(1200);
        const rows = (await req('GET', `${base}/api/bookings`)).body?.bookings || [];
        check('والصفّ وصل إلى قاعدة البيانات', rows.length === before + 1, `${rows.length} بدل ${before + 1}`);
        check('وهو ما كُتب في المتصفح', rows.some((r: any) => String(r.name || '').includes('من الدومين')),
            JSON.stringify(rows.slice(0, 2)).slice(0, 160));
        check('ولا خطأ جافاسكربت', errors.length === 0, errors.slice(0, 2).join(' | '));
    } finally {
        await browser.close();
        server.kill();
        await new Promise(r => setTimeout(r, 400));
        try { fs.rmSync(path.join(apiDir, 'data.db'), { force: true }); } catch { /* fine */ }
        try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* fine */ }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
