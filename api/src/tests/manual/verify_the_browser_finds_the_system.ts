/**
 * «انه بدائي وفاشل» — AND HE WAS RIGHT.
 *
 * From his own «social media platform» build:
 *
 *     🔎 Self-QA (1 page(s), 0 control(s) pressed, 0 form(s) filled…): 41/100
 *       • 4 console error(s): 404 ← http://127.0.0.1:4821/
 *       • 0 <h1> headings · No <main> landmark · No <meta name="viewport">
 *       • Horizontal scrolling at 390px
 *
 * Every one of those is true — of EXPRESS'S 404 PAGE. The interface had been
 * packaged into the feed server's public/, the feed server had never served
 * public/ at all, «/» answered 404, and the auditor reviewed the typography of
 * an error page for thirty seconds and scored the product 41/100.
 *
 * Two defects, and this proves both are gone:
 *
 *   [1] THE CAUSE — a feed system now serves its own interface, so the front
 *       door opens. (It would have 404'd on his domain too.)
 *   [2] THE INTELLIGENCE — pointed at a server that refuses its root, the
 *       browser now says THAT, refuses to invent findings about a page nobody
 *       built, and recovers by measuring the real interface instead.
 *   [3] AND NOTHING ELSE CHANGED — the same audit on a healthy address still
 *       behaves exactly as before.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_browser_finds_the_system.ts
 */
export { };
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.PERSISTENCE_MODE = 'JSON';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A small but REAL interface: a heading, a landmark, controls, and a form. */
const INDEX_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>الشبكة</title>
<style>
  body{margin:0;background:#ffffff;color:#111827;font:16px/1.7 system-ui}
  main{max-width:720px;margin:0 auto;padding:24px}
  button{min-height:44px;min-width:44px;padding:10px 18px;border:1px solid #cbd5e1;background:#f8fafc;color:#111827;border-radius:10px}
  input,textarea{min-height:44px;width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:10px}
  label{display:block;margin:10px 0}
</style></head>
<body><main>
  <h1>الشبكة</h1>
  <nav><a href="#feed">الموجز</a></nav>
  <form id="composer">
    <label>ماذا يجري؟ <textarea name="text" required></textarea></label>
    <label>اسمك <input name="who" required></label>
    <button type="submit">انشر</button>
  </form>
  <button id="like" type="button">إعجاب</button>
  <button id="follow" type="button">متابعة</button>
  <p id="out">لا منشورات بعد.</p>
</main>
<script>
  var n = 0;
  document.getElementById('like').addEventListener('click', function () {
    n++; document.getElementById('out').textContent = 'إعجابات: ' + n;
  });
  document.getElementById('follow').addEventListener('click', function () {
    document.getElementById('out').textContent = 'تتابع الآن.';
  });
  document.getElementById('composer').addEventListener('submit', function (e) {
    e.preventDefault(); document.getElementById('out').textContent = 'نُشر.';
  });
</script>
</body></html>`;

const get = (url: string) => new Promise<{ status: number; body: string }>((resolve) => {
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET' }, res => {
        let b = ''; res.on('data', d => { b += d; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: b }));
    });
    r.on('error', () => resolve({ status: 0, body: '' }));
    r.end();
});

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-door-'));

    // ── [1] THE CAUSE ──────────────────────────────────────────────────────
    console.log('\n[1] نظام تواصل حقيقي — وبابه الأمامي');
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const api: any = await new ApiProjectTool().execute(
        { request: 'Build a next-generation social media platform. Features: Posts Stories Reels Live streaming Groups Pages Messaging', root, skipInstall: false },
        { sessionId: 'door-proof' });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir);
    const serverSrc = fs.readFileSync(path.join(apiDir, 'server.js'), 'utf-8');
    check('وهو خادم موجز (feed) — نفس نوع بنائه', /feed listening on/.test(serverSrc));
    check('وفيه الآن خدمة الواجهة من public/ — وهي التي كانت غائبة تماماً',
        serverSrc.includes("express.static(PUBLIC") && serverSrc.includes("res.sendFile(path.join(PUBLIC, 'index.html'))"));

    // Exactly what the react build does: the compiled interface goes into public/.
    fs.mkdirSync(path.join(apiDir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'public', 'index.html'), INDEX_HTML, 'utf-8');

    const port = 4820 + Math.floor(Math.random() * 200);
    let upResolve: (v: boolean) => void = () => { };
    const upPromise = new Promise<boolean>(r => { upResolve = r; });
    const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
        cwd: apiDir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
        onLine: (l: string) => { console.log(`      | ${l.slice(0, 130)}`); if (/listening on/.test(l)) upResolve(true); },
    });
    child.done.then(() => upResolve(false));
    const timer = setTimeout(() => upResolve(false), 20000);
    const up = await upPromise;
    clearTimeout(timer);
    check('الخادم يعمل', up, `port ${port}`);

    if (up) {
        await new Promise(r => setTimeout(r, 400));
        const home = await get(`http://127.0.0.1:${port}/`);
        check('‏«/» يجيب 200 لا 404 — هذا هو العيب الذي أفسد الفحص كلَّه',
            home.status === 200, `status ${home.status}`);
        check('…والذي يعود هو الواجهة نفسها', home.body.includes('<h1>الشبكة</h1>'), home.body.slice(0, 80));
        const deep = await get(`http://127.0.0.1:${port}/profile`);
        check('ومسار داخلي في التطبيق يعود بالواجهة أيضاً (تطبيق صفحة واحدة)',
            deep.status === 200 && deep.body.includes('<h1>'), `status ${deep.status}`);
        const health = await get(`http://127.0.0.1:${port}/api/health`);
        check('وواجهة البرمجة لم تُكسَر بالتغيير', health.status === 200 && /"ok":true/.test(health.body), String(health.status));

        // ── «Groups Pages Messaging Ads» — لم تعد اعتذاراً ─────────────────
        console.log('\n[1b] وأربع من ميزاته الاثنتي عشرة صارت جداول حقيقية');
        for (const table of ['groups', 'pages', 'messages', 'ads']) {
            const r = await get(`http://127.0.0.1:${port}/api/${table}`);
            check(`‏/api/${table} يجيب فعلاً`, r.status === 200 && r.body.includes(table), `${r.status} ${r.body.slice(0, 60)}`);
        }
        const guard = await new Promise<{ status: number }>((resolve) => {
            const req2 = require('http').request(
                { hostname: '127.0.0.1', port, path: '/api/groups', method: 'POST', headers: { 'Content-Type': 'application/json' } },
                (res: any) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode || 0 })); });
            req2.on('error', () => resolve({ status: 0 }));
            req2.end(JSON.stringify({ name: 'اقتحام' }));
        });
        check('والكتابة فيها محميّة بحساب (401 بلا رمز)', guard.status === 401, String(guard.status));
        const me = await get(`http://127.0.0.1:${port}/api/auth/me`);
        check('ونظام الموجز صار له حسابات حقيقية — لا «اسم بلا كلمة مرور»',
            me.status === 401, `${me.status} (401 = المسار موجود ومحميّ)`);
    }
    try { child.kill(); } catch { /* already gone */ }

    // ── [2] THE INTELLIGENCE ───────────────────────────────────────────────
    console.log('\n[2] والمتصفح أمام بابٍ مغلق — يقول الحقيقة ولا يخترع ملاحظات');
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), INDEX_HTML, 'utf-8');

    // A server that behaves exactly like the old feed server: its API answers,
    // its root does not.
    const shut = http.createServer((rq, rs) => {
        if (String(rq.url || '').startsWith('/api/health')) {
            rs.writeHead(200, { 'content-type': 'application/json' });
            return rs.end('{"ok":true}');
        }
        rs.writeHead(404, { 'content-type': 'text/html' });
        rs.end('<html><body>Cannot GET /</body></html>');
    });
    shut.listen(0, '127.0.0.1');
    await new Promise<void>(r => shut.once('listening', () => r()));
    const shutUrl = `http://127.0.0.1:${(shut.address() as any).port}/`;

    const { auditBuiltApp } = require('../../core/quality/app-audit');
    const blind = await auditBuiltApp(dist, { timeoutMs: 25_000, serveUrl: shutUrl });
    const ids: string[] = (blind.findings || []).map((f: any) => f.id);
    console.log(`      (النتيجة: ${blind.score}/100 · الملاحظات: ${ids.join(', ') || 'لا شيء'})`);
    check('الملاحظة موجودة وتسمّي العيب الحقيقي: الخادم يرفض جذره',
        ids.includes('server_root_dead'), JSON.stringify(ids));
    const door = (blind.findings || []).find((f: any) => f.id === 'server_root_dead');
    check('…وتذكر الرمز 404 نصّاً', String(door?.detail || '').includes('404'), String(door?.detail || '').slice(0, 90));
    for (const invented of ['h1_count', 'no_viewport_meta', 'a11y_no_main', 'mobile_overflow', 'console_errors', 'failed_requests']) {
        check(`لا يخترع «${invented}» عن صفحة خطأ لم يبنِها أحد`, !ids.includes(invented));
    }
    check('وقد تعافى فعلاً: قاس الواجهة من مجلد البناء',
        String(door?.detail || '').includes('قِستُ الواجهة من مجلد البناء'), String(door?.detail || '').slice(-60));
    check('…فضغط عناصر حقيقية بدل صفر', Number(blind.pressed || 0) >= 3, `pressed=${blind.pressed}`);

    // ── [3] NO REGRESSION ──────────────────────────────────────────────────
    console.log('\n[3] وعلى بابٍ سليم، الفحص كما كان تماماً');
    const good = http.createServer((rq, rs) => {
        const rel = String(rq.url || '/').split('?')[0];
        if (rel.startsWith('/api/health')) { rs.writeHead(200, { 'content-type': 'application/json' }); return rs.end('{"ok":true}'); }
        rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        rs.end(INDEX_HTML);
    });
    good.listen(0, '127.0.0.1');
    await new Promise<void>(r => good.once('listening', () => r()));
    const goodUrl = `http://127.0.0.1:${(good.address() as any).port}/`;

    const healthy = await auditBuiltApp(dist, { timeoutMs: 25_000, serveUrl: goodUrl });
    const hids: string[] = (healthy.findings || []).map((f: any) => f.id);
    console.log(`      (النتيجة: ${healthy.score}/100 · الملاحظات: ${hids.join(', ') || 'لا شيء'})`);
    check('لا ملاحظة عن الباب — لأنه مفتوح', !hids.includes('server_root_dead'), JSON.stringify(hids));
    check('ولا ملاحظة «صفحة فارغة» — لأن فيها عناصر', !hids.includes('empty_page'));
    check('والعناصر ضُغطت فعلاً', Number(healthy.pressed || 0) >= 3, `pressed=${healthy.pressed}`);
    check('والنموذج مُلئ وأُرسل', Number(healthy.score || 0) > 0 && !hids.includes('form_dead_submit'), JSON.stringify(hids));

    (shut as any).closeAllConnections?.(); shut.close();
    (good as any).closeAllConnections?.(); good.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    delete (global as any).joeProjects?.['door-proof'];

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
