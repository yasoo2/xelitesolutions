/**
 * THE QUALITY PHASE THAT COULD NEVER PASS, AND THE STORE THAT COULD NEVER
 * LOAD — «كوالتي تاسكس لا تعمل بشكل صحيح».
 *
 * Two defects from his own build log, both reproduced here against real
 * processes and a real browser.
 *
 * ONE — the pipeline's third phase was planned as browser_ui_audit with
 * `args: {}`, so the first thing the tool did was answer `no_url`. Every
 * system build ended «⛔ 2/3», and the self-repair that followed sent a
 * browser agent off to «Generate a URL for the quality phase», read a file
 * that did not exist, and finished on «central_answer was called without a
 * question». An audit with no address now audits what the session just built.
 *
 * TWO — «GET /api/products 404», twice, on every load of the built store.
 * The interface finds its API by asking «does THIS origin answer
 * /api/health?» — and Joe's own preview origin answers it, because Joe has a
 * health endpoint too. The store rewired itself to JOE's API and showed an
 * empty catalogue; the self-QA scored it 62/100 for failed requests. Health
 * now says WHOSE health it is.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_pipeline_quality.ts
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

const REQUEST = 'ابنِ متجراً إلكترونياً كاملاً بسلة شراء وقاعدة بيانات وتسجيل دخول';

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quality-'));
    const sessionId = `quality-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`quality-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] العمود الفقري للنظام: هل مرحلة الجودة قابلة للتنفيذ أصلاً؟');
    const { buildSpine } = await import('../../modules/tools/definitions/ProjectPipelineTool');
    const spine: any = buildSpine('system', REQUEST);
    const quality = spine?.output?.phases?.find((p: any) => p.name === 'Quality');
    check('مرحلة الجودة موجودة في الخطة', !!quality);
    const auditTask = quality?.tasks?.[0];
    check('ومهمّتها هي التدقيق في متصفح حقيقي', auditTask?.tool === 'browser_ui_audit', String(auditTask?.tool));

    // The spine cannot know the address before anything is built — that is the
    // point. What must hold is that the ADAPTER completes it at run time.
    const { adaptPlannedArgs } = await import('../../core/orchestrator/plan-tools');
    const beforeBuild = adaptPlannedArgs('browser_ui_audit', { ...auditTask.args, sessionId });
    check('وقبل البناء لا عنوان — ولا ادّعاء بوجوده', !beforeBuild.url);

    console.log('\n[2] النظام يُبنى فعلاً: خادم، ثم تطبيق مربوط به');
    const api: any = await executeTool('api_project', { request: REQUEST });
    check('الخادم بُني', api?.ok === true && !!api?.output?.path, String(api?.error || ''));
    const apiDir = String(api?.output?.path || '');

    const app: any = await executeTool('react_project', { request: REQUEST });
    check('والتطبيق بُني وتجمّع', app?.ok === true && fs.existsSync(path.join(String(app?.output?.path || ''), 'dist', 'index.html')),
        String(app?.error || ''));

    console.log('\n[3] وبعد البناء: مهمّة التدقيق تعرف عنوانها وحدها');
    const afterBuild = adaptPlannedArgs('browser_ui_audit', { ...auditTask.args, sessionId });
    check('العنوان اكتمل من ما بناه هذا الجلسة', !!afterBuild.url, JSON.stringify(afterBuild));
    check('وهو مسار المعاينة الحيّ لهذه الجلسة',
        String(afterBuild.url || '').includes('/project-preview/') && String(afterBuild.url).includes(sessionId),
        String(afterBuild.url));

    // …and that address must really be servable, not merely well-formed.
    const { resolvePreviewFile } = await import('../../api/routes/projectPreview');
    const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    check('والملف الذي يشير إليه موجود على القرص فعلاً', !!resolvePreviewFile(key, 'index.html'));

    console.log('\n[4] الخادم المولَّد يقول لمن هذه الصحّة — لا لأي خادم');
    const srvSrc = fs.readFileSync(path.join(apiDir, 'server.js'), 'utf-8');
    check('/api/health يحمل اسم المورد', /resource: 'products'/.test(srvSrc), '');
    const storeSrc = fs.readFileSync(path.join(String(app?.output?.path || ''), 'src', 'app', 'store.js'), 'utf-8');
    check('والواجهة تشترط أن يطابقه قبل أن تثق بالأصل', /d\.resource === resource/.test(storeSrc), '');

    console.log('\n[5] الإثبات الحيّ: أصلٌ يجيب /api/health لكنه ليس خادمنا');
    /**
     * EXACTLY THE FIELD FAILURE. A server that answers /api/health but knows
     * nothing about «products» — which is precisely what Joe's own preview
     * origin is. The old probe trusted it and every load 404'd.
     */
    let productsHit = 0;
    const impostor = http.createServer((rq, rs) => {
        const url = String(rq.url || '');
        if (url.startsWith('/api/health')) {
            rs.writeHead(200, { 'Content-Type': 'application/json' });
            return rs.end(JSON.stringify({ ok: true, status: 'healthy' }));   // Joe's own shape
        }
        if (url.startsWith('/api/products')) { productsHit++; rs.writeHead(404); return rs.end('{}'); }
        const dist = path.join(String(app?.output?.path || ''), 'dist');
        const file = path.normalize(path.join(dist, url.split('?')[0] === '/' ? 'index.html' : url.split('?')[0]));
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
        const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
        rs.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        rs.end(fs.readFileSync(file));
    });
    impostor.listen(0, '127.0.0.1');
    await new Promise<void>(r => impostor.once('listening', () => r()));
    const impostorUrl = `http://127.0.0.1:${(impostor.address() as any).port}/`;

    /**
     * …AND ITS REAL SERVER IS RUNNING WHERE THE BUILD SAYS IT IS. Refusing the
     * wrong origin only matters if the right one is then found: this is the
     * other half, and it is what puts products on the screen.
     */
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const real = executionEngine.runArgvStreaming('node', ['server.js'], { cwd: apiDir, env: { PORT: '4100' } });
    const up = await (async () => {
        for (let i = 0; i < 40; i++) {
            const ok = await fetch('http://127.0.0.1:4100/api/health').then(r => r.ok).catch(() => false);
            if (ok) return true;
            await new Promise(r => setTimeout(r, 250));
        }
        return false;
    })();
    check('الخادم الحقيقي يعمل على العنوان المخبوز في البناء', up);

    // A row to find, written through the owner's own door.
    const msg = String(api?.output?.message || '');
    const email = String(api?.output?.ownerEmail || '');
    const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';
    const login: any = await fetch('http://127.0.0.1:4100/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    }).then(r => r.json()).catch(() => null);
    const made: any = await fetch('http://127.0.0.1:4100/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login?.token || ''}` },
        body: JSON.stringify({ name: 'عطر الإثبات', price: 199, category: 'عطور' }),
    }).then(r => r.json()).catch(() => null);
    const listed: any = await fetch('http://127.0.0.1:4100/api/products').then(r => r.json()).catch(() => null);
    check('وفيه منتج حقيقي ليُقرأ', Array.isArray(listed?.products) && listed.products.some((p: any) => String(p.name).includes('الإثبات')),
        JSON.stringify({ made, listed }).slice(0, 200));

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const bad: string[] = [];
        page.on('response', (r: any) => { if (r.status() >= 400 && String(r.url()).includes('/api/')) bad.push(`${r.status()} ${r.url()}`); });
        await page.goto(impostorUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        check('التطبيق لم يُختطف: لا طلب واحد إلى /api/products على الأصل الغريب',
            productsHit === 0, `${productsHit} طلب`);
        check('ولا استجابة API فاشلة في المتصفح', bad.length === 0, bad.slice(0, 2).join(' | '));
        check('والصفحة نفسها ظهرت', await page.locator('.app-name').count() === 1);
        // The whole point: the catalogue came from the REAL server.
        const text = await page.locator('.products').innerText().catch(() => '');
        check('والمنتج الحقيقي ظهر في الكتالوج — لا متجر فارغ', text.includes('عطر الإثبات'), text.slice(0, 160) || 'لا شبكة منتجات');
    } finally {
        await browser.close();
        (impostor as any).closeAllConnections?.();
        impostor.close();
        real.kill();
        await new Promise(r => setTimeout(r, 400));
        try { fs.rmSync(path.join(apiDir, 'data.db'), { force: true }); } catch { /* fine */ }
    }

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
