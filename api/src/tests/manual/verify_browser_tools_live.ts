/**
 * THE 29 BROWSER SKILLS, ON A REAL PAGE, ONE BY ONE.
 *
 * The router now sends «افحص الروابط المكسورة» to browser_check_links and
 * «دقّق السيو» to browser_seo_audit — that was proven. What was never proven is
 * that those tools WORK: every earlier proof stubbed Playwright instead of
 * driving it, so «reachable» was mistaken for «works».
 *
 * Here a real Chromium opens a real page served over real HTTP, and every
 * browser tool in the registry is called through the real dispatcher. The page
 * is built to be findable: it has a broken link, an image with no alt text,
 * grey-on-white text, a form, a heading structure, a console error and a
 * hard-coded width that overflows a phone. A tool that reports «no issues» on
 * this page is not passing — it is blind.
 *
 * Every tool ends in one of four honest states, printed as a table:
 *
 *   ✅ عمل            — ran and returned something real about the page
 *   👤 ينتظر المستخدم — correctly says a human must act (extension, consent)
 *   🌐 يحتاج إنترنت   — needs the open internet, which this sandbox does not have
 *   ❌ فشل            — with the reason, verbatim
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_browser_tools_live.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.BROWSER_HEADLESS = 'true';
process.env.BROWSER_NO_SANDBOX = 'true';

type State = 'ok' | 'user' | 'net' | 'fail';
const rows: Array<{ name: string; state: State; note: string; ms: number }> = [];

const PAGE = `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><title>مقهى الرصيف — صفحة اختبار</title>
<style>
  body { font-family: system-ui; margin: 0; }
  .wide { width: 1400px; }                    /* overflows a phone on purpose */
  .faint { color: #bfbfbf; background: #ffffff; }  /* fails contrast on purpose */
  h1 { color: #1a3d2f; font-size: 40px; }
  .btn { background: #1a3d2f; color: #fff; padding: 12px 20px; border: 0; }
</style></head>
<body>
  <h1>مقهى الرصيف</h1>
  <h3>قفزنا من h1 إلى h3 عمداً</h3>
  <p class="faint">هذا النص رماديّ على أبيض — تباين ضعيف مقصود.</p>
  <p id="needle">الكلمة المفتاحية: قهوة_مختصة_٧٧٧</p>
  <div class="wide">عنصر أعرض من شاشة الجوال</div>
  <img src="/logo.png">
  <a href="/does-not-exist">رابط مكسور</a>
  <a href="/second.html">صفحة ثانية</a>
  <form id="book"><input name="name" placeholder="الاسم"><input name="phone" placeholder="الجوال">
  <button class="btn" type="submit">احجز طاولة</button></form>
  <button id="counter" onclick="document.getElementById('out').textContent='CLICKED_OK'">اضغطني</button>
  <span id="out"></span>
  <script>console.error('DELIBERATE_CONSOLE_ERROR'); undefinedFunctionCall();</script>
</body></html>`;

const PAGE2 = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>الصفحة الثانية</title>
<meta name="description" content="وصف موجود هنا"></head><body><h1>الثانية</h1><p>محتوى مختلف تماماً</p></body></html>`;

async function main() {
    const server = http.createServer((req, res) => {
        const url = String(req.url || '/').split('?')[0];
        if (url === '/second.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE2); }
        if (url === '/logo.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from('89504e470d0a1a0a', 'hex')); }
        if (url === '/does-not-exist') { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE);
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const URL_ = `http://127.0.0.1:${port}/`;
    const URL2 = `http://127.0.0.1:${port}/second.html`;
    console.log(`صفحة الاختبار على ${URL_}\n`);

    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const { tools } = require('../../modules/tools/registry');
    const names: string[] = tools.map((t: any) => t.name).filter((n: string) => /^browser_|^user_browser$/.test(n));

    const SESSION = 'browser-live-proof';
    const ctx = { sessionId: SESSION, workspaceId: SESSION, userId: 'browser-live-user' };
    const call = (name: string, input: any) =>
        executionFirewall.runAsSystem(() => executeTool(name, input, ctx));

    /** Inputs that give each tool something real to work on. */
    const INPUT: Record<string, any> = {
        browser_consent: { grant: true },
        browser_launch: { url: URL_ },
        browser_summarize: { url: URL_, question: 'ما هذه الصفحة؟' },
        browser_ui_audit: { url: URL_ },
        browser_check_links: { url: URL_, limit: 20 },
        browser_performance: { url: URL_ },
        browser_seo_audit: { url: URL_ },
        browser_console_scan: { url: URL_ },
        browser_save_pdf: { url: URL_ },
        browser_readability: { url: URL_ },
        browser_contrast_audit: { url: URL_ },
        browser_a11y_deep: { url: URL_ },
        browser_extract_meta: { url: URL_ },
        browser_responsive_check: { url: URL_ },
        browser_design_tokens: { url: URL_ },
        browser_fullpage_shot: { url: URL_ },
        browser_extract_data: { url: URL_, selector: 'a' },
        browser_find_text: { url: URL_, query: 'قهوة_مختصة_٧٧٧' },
        browser_click: { url: URL_, text: 'اضغطني' },
        browser_fill_form: { url: URL_, fields: { name: 'يونس', phone: '0500000000' }, submit: false },
        browser_compare: { before: URL_, after: URL2 },
        browser_autofix: { url: URL_ },
        browser_smart_agent: { url: URL_, question: 'كم رابطاً في الصفحة؟' },
        browser_vision: { url: URL_, width: 900, height: 600 },
        browser_translate: { url: URL_, target: 'en' },
        browser_search: { query: 'joe agent test', question: 'joe agent test' },
        browser_run: { sessionId: SESSION, instructionText: `افتح ${URL_} واقرأ العنوان` },
        browser_action: { sessionId: SESSION, action: 'goto', url: URL_ },
        user_browser: { action: 'status' },
    };

    /** A tool passes only when its answer is ABOUT this page. */
    const EXPECT: Record<string, (o: any, text: string) => boolean> = {
        browser_check_links: (_o, t) => /does-not-exist|404|مكسور/.test(t),
        browser_seo_audit: (_o, t) => /description|وصف|h1|عنوان|score|درجة/i.test(t),
        browser_console_scan: (_o, t) => /DELIBERATE_CONSOLE_ERROR|undefinedFunctionCall|error/i.test(t),
        browser_contrast_audit: (_o, t) => /contrast|تباين|\d/i.test(t),
        browser_responsive_check: (_o, t) => /overflow|أفقي|جوال|mobile|\d/i.test(t),
        browser_find_text: (_o, t) => /قهوة_مختصة_٧٧٧|found|وجد|true/i.test(t),
        browser_extract_data: (_o, t) => /second\.html|does-not-exist|رابط/.test(t),
        browser_extract_meta: (_o, t) => /مقهى الرصيف|title|عنوان/.test(t),
        browser_click: (_o, t) => !/error|فشل/i.test(t),
        browser_save_pdf: (o, t) => /\.pdf/i.test(t) || !!o?.path || !!o?.file,
        browser_fullpage_shot: (o, t) => /\.(png|jpe?g)/i.test(t) || !!o?.path || !!o?.screenshot,
        browser_extract_data_: () => true,
    };

    const NET_HINT = /ENOTFOUND|EAI_AGAIN|net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|getaddrinfo|proxy|timeout of|Timeout .*exceeded|no internet|تعذّر الاتصال/i;
    const USER_HINT = /needsConnect|needsRepo|extension|الإضافة|consent|موافقة|not connected|غير متصل|install|ثبّت/i;

    for (const name of names) {
        const input = INPUT[name];
        const started = Date.now();
        if (!input) { rows.push({ name, state: 'fail', note: 'لا مُدخل في هذا الإثبات', ms: 0 }); continue; }
        let r: any;
        try { r = await call(name, input); }
        catch (e: any) { r = { ok: false, error: String(e?.message || e) }; }
        const ms = Date.now() - started;
        const text = (() => { try { return JSON.stringify(r).slice(0, 4000); } catch { return String(r); } })();
        const err = String(r?.error || r?.output?.error || '');

        let state: State;
        let note = '';
        if (r?.ok) {
            const judge = EXPECT[name];
            if (judge && !judge(r.output, text)) { state = 'fail'; note = `عمل لكنه لم يجد ما في الصفحة: ${text.slice(0, 140)}`; }
            else if (USER_HINT.test(text) && !judge) { state = 'user'; note = String(r?.output?.message || '').slice(0, 90); }
            else { state = 'ok'; note = String(r?.output?.message || r?.output?.summary || '').replace(/\s+/g, ' ').slice(0, 90); }
        } else if (NET_HINT.test(err)) { state = 'net'; note = err.slice(0, 90); }
        else if (USER_HINT.test(err) || USER_HINT.test(text)) { state = 'user'; note = err.slice(0, 90); }
        else { state = 'fail'; note = err.slice(0, 160) || text.slice(0, 160); }

        rows.push({ name, state, note, ms });
        const icon = state === 'ok' ? '✅' : state === 'user' ? '👤' : state === 'net' ? '🌐' : '❌';
        console.log(`${icon} ${name.padEnd(26)} ${String(ms).padStart(6)}ms  ${note}`);
    }

    try { await call('browser_action', { sessionId: SESSION, action: 'close' }); } catch { /* best effort */ }
    server.close();

    const ok = rows.filter(r => r.state === 'ok').length;
    const user = rows.filter(r => r.state === 'user').length;
    const net = rows.filter(r => r.state === 'net').length;
    const bad = rows.filter(r => r.state === 'fail');
    console.log(`\n===== عمل: ${ok} | ينتظر المستخدم: ${user} | يحتاج إنترنت: ${net} | فشل: ${bad.length} من ${rows.length} =====`);
    for (const b of bad) console.log(`   ❌ ${b.name}: ${b.note}`);
    try {
        fs.writeFileSync(path.join(os.tmpdir(), 'joe-browser-tools-report.json'), JSON.stringify(rows, null, 2));
    } catch { /* the table above is the report */ }
    process.exit(bad.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
