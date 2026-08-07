/**
 * «نظام يستعمله فريق» — IN A REAL BROWSER, WITH THREE REAL PEOPLE.
 *
 * verify_roles_are_real.ts proves the SERVER refuses correctly. That is half
 * the work: a rule the interface cannot express is a rule the owner will never
 * use. This drives the built app the way three different people would, each in
 * their own browser context — their own storage, their own session, exactly
 * like three different machines:
 *
 *   [3] the owner signs in and gets an accounts screen nobody else has;
 *   [4] he creates an employee account from the real form, and the generated
 *       password is shown once, on screen;
 *   [5] the employee signs in on his own machine: no accounts screen, and a
 *       chip that says «موظّف»;
 *   [6] the employee's table is EMPTY — the owner's rows are not his to see;
 *   [7] his own row lands on the server carrying his id, and appears;
 *   [8] the owner still sees both;
 *   [9] the owner demotes him from the screen, and the employee's write form
 *       disappears with a sentence that says why — not a button that 403s.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_team_can_use_it.ts
 */
export { };
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

const REQUEST = 'ابنِ نظام مشتل: النباتات والموردون مع قاعدة بيانات وتسجيل دخول';

const req = (method: string, url: string, body?: any, token?: string) => new Promise<any>((resolve) => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
        headers: {
            ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-team-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `team-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`team-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] نظام كامل: خادم بحسابات وأدوار، وتطبيق مبنيّ عليه');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir || 'لا مجلد');

    const msg = String(api?.output?.message || '');
    const email = String(api?.output?.ownerEmail || '');
    const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';
    check('وبيانات المالك ظهرت مرة واحدة', !!email && !!password, `email=${!!email} pass=${!!password}`);

    const port = 4750 + Math.floor(Math.random() * 200);
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const server = executionEngine.runArgvStreaming('node', ['server.js'], { cwd: apiDir, env: { PORT: String(port) } });
    const base = `http://127.0.0.1:${port}`;
    check('والخادم يعمل', await waitFor(`${base}/api/health`));

    const app: any = await executeTool('react_project', { request: REQUEST });
    const proj = String(app?.output?.path || '');
    const distIndex = proj ? path.join(proj, 'dist', 'index.html') : '';
    check('والتطبيق تجمّع فعلاً (vite build نجح على شاشة الحسابات الجديدة)',
        !!distIndex && fs.existsSync(distIndex), proj || 'لا مجلد');
    check('وملف شاشة الحسابات مكتوب داخل المشروع',
        !!proj && fs.existsSync(path.join(proj, 'src', 'components', 'Accounts.jsx')));

    if (!fs.existsSync(distIndex)) {
        server.kill();
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(1);
    }

    // Point the built bundle at THIS server — origin only, so every path the
    // build baked in (/api/plants, /api/suppliers…) keeps working.
    const assets = path.join(proj, 'dist', 'assets');
    let pointed = false;
    for (const b of fs.readdirSync(assets).filter(f => f.endsWith('.js'))) {
        const f = path.join(assets, b);
        const src = fs.readFileSync(f, 'utf-8');
        const next = src.split('http://localhost:4100').join(base);
        if (next !== src) { fs.writeFileSync(f, next); pointed = true; }
    }
    check('والتطبيق موجَّه إلى خادمه', pointed, 'لم يُعثر على عنوان الواجهة البرمجية في الحزمة');

    const distDir = path.join(proj, 'dist');
    const types: Record<string, string> = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
    };
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
    const errors: string[] = [];

    /** One person, one browser context — their own storage, their own session. */
    const open = async () => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        page.on('pageerror', (e: any) => errors.push(String(e?.message || e)));
        await page.goto(siteUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        return { context, page };
    };
    const signIn = async (page: any, mail: string, pass: string) => {
        await page.click('.auth-open');
        await page.waitForTimeout(250);
        await page.locator('.auth-card input[type="email"]').fill(mail);
        await page.locator('.auth-card input[type="password"]').fill(pass);
        await page.locator('.auth-card button[type="submit"]').click();
        await page.waitForTimeout(1200);
    };

    let staffPass = '';
    const STAFF = 'clerk@team.local';

    try {
        console.log('\n[2] الزائر لا يرى شاشة الحسابات أصلاً');
        const guest = await open();
        check('لا شاشة حسابات لمن لم يدخل', await guest.page.locator('section.accounts').count() === 0);
        await guest.context.close();

        console.log('\n[3] المالك يدخل — وله وحده شاشة الحسابات');
        const owner = await open();
        await signIn(owner.page, email, password);
        check('دخل فعلاً', await owner.page.locator('.auth-chip').count() === 1,
            await owner.page.locator('.auth-error').innerText().catch(() => ''));
        check('والشارة تقول «المالك»', (await owner.page.locator('.auth-role').innerText().catch(() => '')).includes('المالك'));
        check('وشاشة الحسابات ظهرت له', await owner.page.locator('section.accounts').count() === 1);
        check('وفيها شرح الأدوار الثلاثة', await owner.page.locator('.role-legend li').count() === 3);

        console.log('\n[4] ويصنع حساب موظّف من النموذج الحقيقي');
        await owner.page.locator('.acc-form input[type="email"]').fill(STAFF);
        await owner.page.locator('.acc-form select').selectOption('staff');
        await owner.page.locator('.acc-form button[type="submit"]').click();
        await owner.page.waitForTimeout(1200);
        const made = await owner.page.locator('.acc-made code').allInnerTexts().catch(() => []);
        staffPass = String(made[1] || '');
        check('كلمة المرور ظهرت على الشاشة مرة واحدة', staffPass.length >= 8, JSON.stringify(made).slice(0, 60));
        check('والحساب صار في الجدول', (await owner.page.locator('.acc-scroll tbody tr').count()) === 2,
            String(await owner.page.locator('.acc-scroll tbody tr').count()));

        // The owner writes a row of his own into the administration table.
        const addAdminRow = async (page: any, value: string) => {
            const form = page.locator('.admin-tables form.tbl-form').first();
            await form.locator('input[type="text"], input[type="number"]').first().fill(value);
            await form.locator('button[type="submit"]').click();
            await page.waitForTimeout(1000);
        };
        await addAdminRow(owner.page, 'مورّد المالك');
        check('والمالك كتب صفّاً في جدول الإدارة',
            (await owner.page.locator('.admin-tables tbody tr').count()) === 1,
            String(await owner.page.locator('.admin-tables tbody tr').count()));

        console.log('\n[5] الموظّف يدخل على جهازه هو');
        const staff = await open();
        await signIn(staff.page, STAFF, staffPass);
        check('دخل بكلمته المولّدة', await staff.page.locator('.auth-chip').count() === 1,
            await staff.page.locator('.auth-error').innerText().catch(() => ''));
        check('والشارة تقول «موظّف»', (await staff.page.locator('.auth-role').innerText().catch(() => '')).includes('موظّف'));
        check('ولا شاشة حسابات له', await staff.page.locator('section.accounts').count() === 0);

        console.log('\n[6] ولا يرى صفوف المالك');
        check('جدول الإدارة عنده فارغ رغم أن للمالك صفّاً',
            (await staff.page.locator('.admin-tables tbody tr').count()) === 0,
            String(await staff.page.locator('.admin-tables tbody tr').count()));

        console.log('\n[7] وصفّه هو يصل ويظهر');
        await addAdminRow(staff.page, 'مورّد الموظّف');
        check('صفّه ظهر عنده', (await staff.page.locator('.admin-tables tbody tr').count()) === 1,
            String(await staff.page.locator('.admin-tables tbody tr').count()));
        // Read from the server with the owner's eyes: two rows, two owners.
        const ownerLogin = await req('POST', `${base}/api/auth/login`, { email, password });
        const ownerToken = String(ownerLogin.body?.token || '');
        const all = await req('GET', `${base}/api/suppliers`, undefined, ownerToken);
        const rows: any[] = all.body?.suppliers || [];
        check('والخادم يحمل الصفّين بمالكَين مختلفين',
            rows.length === 2 && new Set(rows.map(r => String(r.owner_id))).size === 2,
            JSON.stringify(rows.map(r => ({ n: r.name, o: r.owner_id }))).slice(0, 160));

        console.log('\n[8] والمالك يرى الاثنين');
        await owner.page.reload({ waitUntil: 'networkidle' });
        await owner.page.waitForTimeout(1200);
        check('جدول المالك فيه صفّان', (await owner.page.locator('.admin-tables tbody tr').count()) === 2,
            String(await owner.page.locator('.admin-tables tbody tr').count()));

        console.log('\n[9] وينزّل الموظّف من الشاشة — فيختفي نموذج الكتابة عنده');
        const staffRowSelect = owner.page.locator('.acc-scroll tbody tr', { hasText: STAFF }).locator('select');
        await staffRowSelect.selectOption('viewer');
        await owner.page.waitForTimeout(1000);

        await staff.page.reload({ waitUntil: 'networkidle' });
        await staff.page.waitForTimeout(1400);
        check('الشارة صارت «مُطّلِع»', (await staff.page.locator('.auth-role').innerText().catch(() => '')).includes('مُطّلِع'),
            await staff.page.locator('.auth-role').innerText().catch(() => ''));
        check('ونموذج الإضافة اختفى', (await staff.page.locator('.admin-tables form.tbl-form').count()) === 0,
            String(await staff.page.locator('.admin-tables form.tbl-form').count()));
        const note = await staff.page.locator('.admin-tables .tbl-note').innerText().catch(() => '');
        check('والشاشة تقول السبب بدل زرٍّ يفشل', note.includes('للاطّلاع فقط'), note.slice(0, 80));
        check('لكنه ما زال يرى الصفوف', (await staff.page.locator('.admin-tables tbody tr').count()) >= 1,
            String(await staff.page.locator('.admin-tables tbody tr').count()));

        check('ولا خطأ جافاسكربت في كل ما سبق', errors.length === 0, errors.slice(0, 2).join(' | '));
    } finally {
        await browser.close();
        (site as any).closeAllConnections?.();
        site.close();
        server.kill();
        await new Promise(r => setTimeout(r, 400));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* fine */ }
        delete (global as any).joeProjects?.[ctx.sessionId];
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
