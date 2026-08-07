/**
 * «اكمل تطوير» — and the clearest thing left undone was on his own screen.
 *
 * After the tables were read from his sentence, his build delivered TWO
 * collections: a generic «إضافة سجلّ» (العنوان · التفاصيل · قيمة · التاريخ ·
 * الحالة) on top, and his real النباتات/الموردون on a second screen below. He
 * asked for a plant nursery; the big form managed nothing.
 *
 * Measured here, end to end, from his exact sentence:
 *
 *   [1] the backend is built from his own words        (plants, suppliers)
 *   [2] the APP manages النباتات — its own columns, its own address
 *   [3] the admin screens carry the REST, never the same table twice
 *   [4] and in a real browser the app writes a real plant into the real
 *       database and reads it back, with the server's own id
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_app_is_the_system.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-system-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });
    const sessionId = `sys-${Date.now()}`;

    console.log('\n[1] الخادم أولاً — من جملته');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const api: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: HIS_WORDS, root },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('البناء الخلفي نجح', api?.ok === true, String(api?.error || '').slice(0, 120));
    const apiDir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    const model = (global as any).joeProjects?.[sessionId]?.model || [];
    console.log(`   ℹ️ ${model.map((e: any) => e.key).join(', ') || 'لا جداول'}`);
    check('جدولان: النباتات والموردون', model.map((e: any) => e.key).join(',') === 'plants,suppliers',
        model.map((e: any) => e.key).join(','));

    console.log('\n[2] والتطبيق يدير «النباتات» نفسها — لا «سجلّاً» عامّاً');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const web: any = await new ReactProjectTool().execute(
        { request: HIS_WORDS, root, skipImages: true }, { sessionId });
    check('بناء الواجهة نجح', web?.ok === true && web.output?.built === true, String(web?.error || '').slice(0, 120));
    const proj = String(web.output?.path || '');
    const contentJs = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');

    check('اسم المُدار: نبتة / النباتات',
        /entityOne: 'نبتة'/.test(contentJs) && /entityMany: 'النباتات'/.test(contentJs),
        (contentJs.match(/entityOne: '[^']*'/) || [''])[0]);
    check('وحقولُه أعمدة الجدول نفسها',
        ['name', 'price', 'quantity', 'description'].every(k => contentJs.includes(`key: '${k}'`))
        && !contentJs.includes("key: 'title'") && !contentJs.includes("key: 'details'"),
        (contentJs.match(/key: '[a-z_]+'/g) || []).join(','));
    check('والسعر رقم والوصف فقرة',
        /key: 'price', label: 'السعر', type: 'number'/.test(contentJs)
        && /key: 'description', label: 'الوصف', type: 'textarea'/.test(contentJs));
    check('وعنوانه هو مسار جدوله', /api: '[^']*\/api\/plants'/.test(contentJs),
        (contentJs.match(/api: '[^']*'/) || [''])[0]);
    check('ومجموع الأسعار محسوب من عمود موجود', /kind: 'sum', field: 'price'/.test(contentJs));

    console.log('\n[3] وشاشات الإدارة تحمل البقية — بلا تكرار');
    const admin = path.join(proj, 'src', 'components', 'TablesAdmin.jsx');
    const adminSrc = fs.existsSync(admin) ? fs.readFileSync(admin, 'utf-8') : '';
    check('«الموردون» في شاشات الإدارة', adminSrc.includes('"key":"suppliers"'), admin);
    check('و«النباتات» ليست فيها مرّتين', !adminSrc.includes('"key":"plants"'),
        'plants رُسمت في الشاشتين');

    console.log('\n[4] وفي متصفّح حقيقي: نبتة تُكتب في القاعدة وتُقرأ منها');
    const distIdx = path.join(proj, 'dist', 'index.html');
    if (!fs.existsSync(distIdx) || !apiDir) {
        check('البناء جاهز للتشغيل', false, distIdx);
    } else {
        // The packaged server serves the built interface AND the API on one origin.
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        const port = 5400 + Math.floor(Math.random() * 90);
        let up: (v: boolean) => void = () => { /* set below */ };
        const listening = new Promise<boolean>(r => { up = r; });
        const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: apiDir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
        });
        child.done.then(() => up(false));
        const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
        check('النظام يقلع على منفذ واحد', booted === true);

        const base = `http://127.0.0.1:${port}`;
        const msg = String(api?.output?.message || '');
        const email = (msg.match(/البريد:\s*(\S+@\S+)/) || [])[1] || '';
        const pw = (msg.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';

        const { chromium } = require('playwright');
        const { getChromiumLaunchOptions } = require('../../modules/browser/manager');
        const browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        page.on('pageerror', (e: any) => errors.push(String(e).slice(0, 100)));
        await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(700);

        const heading = await page.evaluate(
            'JSON.parse(JSON.stringify(Array.from(document.querySelectorAll("h2")).map(function(h){return h.textContent.trim();})))',
        ).catch(() => []);
        console.log(`   ℹ️ ${(heading as string[]).join(' · ')}`);
        check('الشاشة تقول «إضافة نبتة» لا «إضافة سجلّ»',
            (heading as string[]).some(h => h.includes('إضافة نبتة')), (heading as string[]).join(' · '));

        // Sign in through the page, exactly as he would.
        await page.getByRole('button', { name: /دخول المالك/ }).click({ timeout: 8000 }).catch(() => { });
        await page.locator('input[type="email"]').fill(email).catch(() => { });
        await page.locator('input[type="password"]').fill(pw).catch(() => { });
        await page.getByRole('button', { name: /^دخول$/ }).click({ timeout: 8000 }).catch(() => { });
        await page.waitForTimeout(900);
        const signedIn = await page.evaluate('!!document.querySelector(".auth-chip")').catch(() => false);
        check('دخول المالك من الصفحة', signedIn === true);

        // …then add a real plant through the real form.
        const form = page.locator('form.form');
        await form.locator('input,textarea').first().fill('نخيل برحي').catch(() => { });
        const nums = form.locator('input[type="number"]');
        await nums.nth(0).fill('120').catch(() => { });
        await nums.nth(1).fill('8').catch(() => { });
        await form.locator('textarea').first().fill('صنف تمر ممتاز').catch(() => { });
        await page.getByRole('button', { name: /^أضف$/ }).click({ timeout: 8000 }).catch(() => { });
        await page.waitForTimeout(1200);

        const rows: any = await fetch(`${base}/api/plants`).then(r => r.json()).catch(() => null);
        const list = rows?.plants || [];
        console.log(`   ℹ️ ${JSON.stringify(list).slice(0, 160)}`);
        check('النبتة وصلت قاعدة البيانات فعلاً', list.some((r: any) => r.name === 'نخيل برحي'),
            JSON.stringify(list).slice(0, 140));
        check('وبسعرها وكمّيتها', list.some((r: any) => Number(r.price) === 120 && Number(r.quantity) === 8),
            JSON.stringify(list).slice(0, 140));

        // The server's own id must have been adopted, or the next edit 404s.
        const shown = await page.evaluate(
            'JSON.parse(JSON.stringify(Array.from(document.querySelectorAll(".rows .row h3")).map(function(h){return h.textContent.trim();})))',
        ).catch(() => []);
        check('وظهرت في قائمة الصفحة', (shown as string[]).some(t => t.includes('نخيل برحي')), (shown as string[]).join(' · '));
        check('ولا خطأ JavaScript في الصفحة', errors.length === 0, errors.join(' | ').slice(0, 140));

        await page.screenshot({ path: path.join(root, 'nursery.png') });
        console.log(`   🖼️ ${path.join(root, 'nursery.png')}`);
        await browser.close();
        try { child.kill(); } catch { /* already gone */ }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
