/**
 * A DATABASE WITH A URL IS NOT A SYSTEM ANYONE CAN RUN.
 *
 * The backend learned to carry the rest of the tables — vendors, customers,
 * coupons, shipments — and they were reachable only by `curl`. This is the
 * other half: one screen per table, generated from the SAME model the server
 * was generated from, so the two halves cannot drift apart.
 *
 * Proven the only way that counts — a REAL browser on the REAL packaged
 * system, clicking:
 *
 *   [1] the build emits the screens, and only when there is a server
 *   [2] the tabs are the system's tables
 *   [3] the owner signs in THROUGH THE PAGE and adds a vendor THROUGH THE FORM
 *   [4] the row is really in the database — asked of the API afterwards
 *   [5] a required field is refused in words, not in machine codes
 *   [6] and a link is chosen from real rows, never typed as an id
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_admin_screens.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REQUEST = 'Build a multi-vendor marketplace with vendors, customers, coupons and shipping';

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `admin-ui-${Date.now()}`;
    const ctx = { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' };

    console.log('\n[1] خادم ثم واجهة — نظام واحد');
    const api: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: REQUEST }, ctx));
    check('الخادم بُني', api?.ok === true, String(api?.error || '').slice(0, 140));
    const apiDir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    const cred = String(api?.output?.message || '').match(/Owner account[^:]*:\s*(\S+@\S+)\s*\/\s*(\S+)/);
    check('وبيانات المالك معروفة', !!cred);

    const web: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: REQUEST }, ctx));
    check('الواجهة بُنيت', web?.ok === true, String(web?.error || '').slice(0, 140));
    const webDir = String((global as any).joeProjects?.[sessionId]?.dir || '');

    const adminSrc = path.join(webDir, 'src', 'components', 'TablesAdmin.jsx');
    check('شاشات الجداول مولَّدة', fs.existsSync(adminSrc), adminSrc);
    check('والقشرة تعرضها', /<TablesAdmin api=\{content\.api\} \/>/.test(fs.readFileSync(path.join(webDir, 'src', 'App.jsx'), 'utf-8')));

    console.log('\n[2] وتشغيل النظام كما سيشغّله هو — واجهة داخل خادمها');
    if (!apiDir || !fs.existsSync(path.join(apiDir, 'node_modules')) || !cred) {
        check('الخادم جاهز للتشغيل', false, 'لا حزم مثبتة');
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(1);
    }
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const port = 4800 + Math.floor(Math.random() * 90);
    let up: (v: boolean) => void = () => { /* set below */ };
    const listening = new Promise<boolean>(r => { up = r; });
    const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
        cwd: apiDir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
        onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
    });
    child.done.then(() => up(false));
    const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
    check('النظام يعمل', booted === true);
    const base = `http://127.0.0.1:${port}`;

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 45_000 });

    console.log('\n[3] والتبويبات هي جداول النظام');
    const tabs = await page.locator('.tbl-tabs button').allTextContents();
    console.log(`   ℹ️ ${tabs.join(' · ') || 'لا تبويبات'}`);
    check('أربعة تبويبات', tabs.length === 4, String(tabs.length));
    for (const t of ['vendors', 'customers', 'coupons', 'shipments']) {
        check(`  ومنها ${t}`, tabs.some(x => x.toLowerCase().includes(t.slice(0, 6))), tabs.join(','));
    }
    check('ولا خطأ JavaScript على الصفحة', errors.length === 0, errors.join(' | ').slice(0, 160));

    console.log('\n[4] المالك يدخل من الصفحة نفسها');
    // The page's own words: «Owner sign-in» opens the card, «Sign in» submits it.
    await page.locator('button.auth-open').click();
    await page.locator('.auth-card input[type="email"]').fill(cred[1]);
    await page.locator('.auth-card input[type="password"]').fill(cred[2]);
    await page.locator('.auth-card button[type="submit"]').click();
    await page.waitForTimeout(1200);
    const signedIn = await page.locator('.tbl-note').count() === 0;
    check('دخل فعلاً', signedIn, 'ما زالت ملاحظة «سجّل الدخول» ظاهرة');

    console.log('\n[5] ويضيف بائعاً من النموذج — لا من curl');
    const form = page.locator('.tbl').first();
    await form.locator('.tbl-field').first().locator('input').fill('مقهى الصباح');
    await form.getByRole('button', { name: /^add$|^إضافة$/i }).click();
    await page.waitForTimeout(1200);
    const cells = await page.locator('.tbl-scroll tbody tr td').allTextContents();
    console.log(`   ℹ️ أول صف: ${cells.slice(0, 3).join(' | ')}`);
    check('ظهر في الجدول على الشاشة', cells.some(c => c.includes('مقهى الصباح')), cells.join(' | ').slice(0, 140));

    const fromApi: any = await fetch(`${base}/api/vendors`).then(r => r.json()).catch(() => null);
    check('وهو في قاعدة البيانات فعلاً — لا في المتصفّح وحده',
        Array.isArray(fromApi?.vendors) && fromApi.vendors.some((v: any) => String(v.name).includes('مقهى الصباح')),
        JSON.stringify(fromApi || {}).slice(0, 160));

    console.log('\n[6] وحقل مطلوب يُرفض بجملة لا برمز');
    // The browser's own validation guards the required input, so this asks the
    // SERVER the same question the screen would: the message must be human.
    const refused: any = await page.evaluate(async () => {
        const r = await fetch('/api/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('joe:auth:')) || '') || '') },
            body: JSON.stringify({ email: 'x@y.z' }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    check('الخادم يرفض صفّاً بلا اسم', refused?.status === 400 && /name_required/.test(String(refused?.body?.error)),
        JSON.stringify(refused).slice(0, 140));
    const adminText = fs.readFileSync(adminSrc, 'utf-8');
    check('والشاشة تترجمها إلى جملة', /Required field: /.test(adminText) && /_required/.test(adminText));

    console.log('\n[7] والربط يُختار من صفوف حقيقية');
    await page.getByRole('tab', { name: /shipments|الشحنات/i }).click();
    await page.waitForTimeout(800);
    const options = await page.locator('.tbl-field select option').allTextContents();
    console.log(`   ℹ️ خيارات الربط: ${options.join(' · ')}`);
    check('قائمة اختيار لا حقل رقم', options.length >= 1, String(options.length));

    await page.screenshot({ path: path.join(webDir, 'admin-screens.png'), fullPage: true });
    console.log(`   🖼️ ${path.join(webDir, 'admin-screens.png')}`);

    await browser.close();
    try { child.kill(); } catch { /* already gone */ }

    console.log('\n[8] وبناء بلا خادم لا يولّد شاشات لا مكان لها');
    const soloSession = `solo-${Date.now()}`;
    const solo: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: 'Build a multi-vendor marketplace' },
            { sessionId: soloSession, userId: 'u1', workspaceId: `session-${soloSession}`, language: 'en' }));
    const soloDir = String((global as any).joeProjects?.[soloSession]?.dir || '');
    check('بُني', solo?.ok === true, String(solo?.error || '').slice(0, 120));
    check('ولا شاشات جداول بلا خادم', !fs.existsSync(path.join(soloDir, 'src', 'components', 'TablesAdmin.jsx')));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
