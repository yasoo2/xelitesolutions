/**
 * «طبيب ← مواعيده» — IN A REAL BROWSER, ON A REAL SERVER.
 *
 * verify_relations.ts proves the two tables over HTTP. This proves the half a
 * person actually touches: does the built interface let you add a doctor, pick
 * them for an appointment, see their name on the row, and filter the list down
 * to that one doctor — and does the link that results reach the database?
 *
 * A relation that only a curl command can reach is not a feature.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_relations_ui.ts
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
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-relui-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `relui-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`relui-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] النظام كاملاً: خادم بجدولين، وتطبيق مبنيّ');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir || 'لا مجلد');

    const msg = String(api?.output?.message || '');
    const email = String(api?.output?.ownerEmail || '');
    const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';

    const port = 4900 + Math.floor(Math.random() * 200);
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const server = executionEngine.runArgvStreaming('node', ['server.js'], { cwd: apiDir, env: { PORT: String(port) } });
    const base = `http://127.0.0.1:${port}`;
    check('والخادم يعمل', await waitFor(`${base}/api/health`));

    const app: any = await executeTool('react_project', { request: REQUEST });
    const proj = String(app?.output?.path || '');
    const distIndex = proj ? path.join(proj, 'dist', 'index.html') : '';
    check('والتطبيق تجمّع فعلاً', !!distIndex && fs.existsSync(distIndex), proj || 'لا مجلد');
    if (!fs.existsSync(distIndex)) { server.kill(); console.log(`\n===== ${pass} passed, ${fail} failed =====`); process.exit(1); }

    // Point the built bundle at THIS server — the same wiring a deployment has.
    const assets = path.join(proj, 'dist', 'assets');
    let pointed = false;
    for (const b of fs.readdirSync(assets).filter(f => f.endsWith('.js'))) {
        const f = path.join(assets, b);
        const src = fs.readFileSync(f, 'utf-8');
        const next = src.replace(/http:\/\/localhost:4100\/api\/[a-z]+/g, `${base}/api/bookings`);
        if (next !== src) { fs.writeFileSync(f, next); pointed = true; }
    }
    check('والتطبيق موجَّه إلى خادمه', pointed);

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
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
        const errors: string[] = [];
        page.on('pageerror', (e: any) => errors.push(String(e?.message || e)));
        await page.goto(siteUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);

        console.log('\n[2] لوحة الأطباء موجودة قبل أي شيء');
        check('قسم الأطباء ظاهر في الواجهة', await page.locator('.rel-panel').count() === 1);
        check('وعنوانه «الأطباء»', (await page.locator('.rel-panel h2').innerText().catch(() => '')).includes('الأطباء'));
        check('ويقول بصدق إنه فارغ بدل اختلاق أطباء',
            (await page.locator('.rel-panel .empty').innerText().catch(() => '')).includes('لا أطباء'));

        // The owner signs in, or nothing reaches the server — proved elsewhere,
        // required here.
        await page.click('.auth-open');
        await page.waitForTimeout(300);
        await page.locator('.auth-card input[type="email"]').fill(email);
        await page.locator('.auth-card input[type="password"]').fill(password);
        await page.locator('.auth-card button[type="submit"]').click();
        await page.waitForTimeout(1200);
        check('المالك سجّل دخوله', await page.locator('.auth-chip').count() === 1);

        console.log('\n[3] طبيب يُضاف من الواجهة ويصل إلى قاعدة البيانات');
        const relInputs = page.locator('.rel-form input');
        await relInputs.nth(0).fill('د. سارة الأحمد');
        await relInputs.nth(1).fill('تقويم الأسنان');
        await page.locator('.rel-form button[type="submit"]').click();
        await page.waitForTimeout(1000);
        const docs = await req('GET', `${base}/api/providers`);
        const sarah = (docs.body?.providers || []).find((p: any) => String(p.name).includes('سارة'));
        check('الطبيبة وصلت إلى الخادم بحقولها', !!sarah && sarah.specialty === 'تقويم الأسنان',
            JSON.stringify(docs.body).slice(0, 200));
        check('وظهرت بطاقتها في الواجهة', await page.locator('.rel-chip').count() === 1);

        await relInputs.nth(0).fill('د. خالد المصري');
        await page.locator('.rel-form button[type="submit"]').click();
        await page.waitForTimeout(900);
        check('وطبيب ثانٍ كذلك', await page.locator('.rel-chip').count() === 2);

        console.log('\n[4] موعد يُربط بطبيب مختار من القائمة');
        const form = page.locator('section.panel:not(.rel-panel) form.form');
        await form.locator('input').nth(0).fill('يونس السعدي');
        const picker = form.locator('select').last();
        check('قائمة اختيار الطبيب معروضة في نموذج الموعد', await picker.count() === 1);
        await picker.selectOption({ label: 'د. سارة الأحمد' });
        await form.locator('button[type="submit"]').click();
        await page.waitForTimeout(1200);

        const rows = await req('GET', `${base}/api/bookings`);
        const mine = (rows.body?.bookings || []).find((r: any) => String(r.name).includes('يونس'));
        check('الموعد وصل إلى الخادم', !!mine, JSON.stringify(rows.body).slice(0, 200));
        check('ومربوط بالطبيبة الصحيحة (provider_id)', !!mine && Number(mine.provider_id) === Number(sarah.id),
            `provider_id=${mine?.provider_id} بدل ${sarah?.id}`);
        check('ويعود ومعه اسمها (parent_label)', mine?.parent_label === 'د. سارة الأحمد', String(mine?.parent_label));
        check('واسم الطبيبة ظاهر على بطاقة الموعد في الواجهة',
            (await page.locator('.rows .row').first().innerText().catch(() => '')).includes('سارة'));

        console.log('\n[5] «مواعيد هذه الطبيبة» — التصفية تعمل بالضغط');
        await form.locator('input').nth(0).fill('مريض عند خالد');
        await form.locator('select').last().selectOption({ label: 'د. خالد المصري' });
        await form.locator('button[type="submit"]').click();
        await page.waitForTimeout(1100);
        check('صار في القائمة موعدان', await page.locator('.rows .row').count() === 2);

        await page.locator('.rel-chip').filter({ hasText: 'سارة' }).locator('.rel-pick').click();
        await page.waitForTimeout(400);
        const filtered = await page.locator('.rows .row').count();
        check('الضغط على الطبيبة يُظهر مواعيدها وحدها', filtered === 1, `${filtered} صفوف`);
        check('وهو موعدها هو', (await page.locator('.rows .row').first().innerText()).includes('يونس'));
        check('وعدّاد بطاقتها يقول 1',
            (await page.locator('.rel-chip').filter({ hasText: 'سارة' }).locator('em').innerText()).trim().startsWith('1'));

        await page.locator('.rel-chip.on .rel-pick').click();
        await page.waitForTimeout(400);
        check('وإلغاء التصفية يعيد الاثنين', await page.locator('.rows .row').count() === 2);

        console.log('\n[6] الواجهة تحترم قاعدة السلامة نفسها التي يحرسها الخادم');
        page.once('dialog', (d: any) => d.accept());
        await page.locator('.rel-chip').filter({ hasText: 'سارة' }).locator('button.danger').click();
        await page.waitForTimeout(600);
        check('حذف طبيبة لها مواعيد يُمنع ويشرح السبب',
            await page.locator('.rel-panel .err').count() === 1
            && (await page.locator('.rel-panel .err').innerText()).includes('سارة'),
            await page.locator('.rel-panel .err').innerText().catch(() => 'لا رسالة'));
        check('وهي ما زالت موجودة', await page.locator('.rel-chip').count() === 2);

        console.log('\n[7] وكل ذلك ينجو من إعادة التحميل');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1100);
        check('الأطباء عادوا من الخادم', await page.locator('.rel-chip').count() === 2);
        check('والمواعيد كذلك', await page.locator('.rows .row').count() === 2);
        check('واسم الطبيبة ما زال على موعدها',
            (await page.locator('.rows').innerText()).includes('سارة'));
        check('ولا خطأ جافاسكربت في التطبيق كلّه', errors.length === 0, errors.slice(0, 2).join(' | '));
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
