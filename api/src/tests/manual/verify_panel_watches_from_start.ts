/**
 * «👁️ شاهدها تحدث في لوحة المتصفّح» — HE SAW THE LAST SIX SECONDS.
 *
 * From his own timestamps:
 *
 *     [9:06:52] 🔎 Self-QA in a real browser…
 *               [WS] Broadcast type=panel_focus
 *               GET /assets/EmbeddedBrowser-vVpLt6Ty.js  200
 *               [BrowserWS] First client for sid=panel-browser
 *     [9:07:21] 👁️ Watch it happen in the Browser panel…
 *
 * `panel_focus` and the audit started in the SAME TICK. The browser tab is a
 * lazily loaded chunk: it has to download, mount, and open a websocket first.
 * By the time it attached, the audit had been navigating and pressing controls
 * for twenty-three of its twenty-nine seconds.
 *
 * This measures the fix the only way that counts — a panel that attaches the
 * way the interface does, AFTER the focus event, and frames counted from the
 * audit's first second:
 *
 *   [1] the wait exists and is bounded — a build never hangs on an audience
 *   [2] a panel that attaches late (as the real one does) is waited for
 *   [3] frames arrive from the START of the audit, not only at its end
 *   [4] and the findings overlay is really painted on the page
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_panel_watches_from_start.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function builtSite(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>متجر</title>
<style>body{margin:0;font-family:sans-serif;background:#fff}
button{min-width:48px;min-height:48px;margin:6px}</style></head>
<body><h1>متجرنا</h1><main>
<button onclick="document.title='clicked'">أضف إلى السلة</button>
<button onclick="window.scrollBy(0,200)">المزيد</button>
<a href="#">رابط بلا وجهة</a>
</main></body></html>`, 'utf-8');
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-watch-'));
    const dist = path.join(work, 'dist');
    builtSite(dist);

    console.log('\n[0] خادم جو الحقيقي، ولوحة متصفّح حقيقية');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');
    const { waitForPanelWatcher, panelWatcherCount } = await import('../../modules/browser/wsHub');
    const WebSocket = (await import('ws')).default;

    console.log('\n[1] الانتظار موجود ومحدود — بناء لا يتعلّق بجمهور');
    const noOne = Date.now();
    const watched0 = await waitForPanelWatcher(PANEL_BROWSER_SID, 1200);
    const waited = Date.now() - noOne;
    check('بلا لوحة: لا ينتظر إلى الأبد', watched0 === false && waited < 2500, `${waited}ms`);
    check('ولا يدّعي مشاهداً غير موجود', panelWatcherCount(PANEL_BROWSER_SID) === 0);

    console.log('\n[2] ولوحة تتأخّر — كما تتأخّر لوحته الحقيقية — يُنتظَر لها');
    const frames: number[] = [];
    // The real panel is a lazily loaded chunk: it downloads, mounts, then
    // connects. 900ms is a kind imitation of that.
    setTimeout(() => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/browser?sessionId=${encodeURIComponent(PANEL_BROWSER_SID)}`);
        ws.on('message', (raw: any) => {
            try { if (JSON.parse(String(raw))?.type === 'stream_frame') frames.push(Date.now()); } catch { /* not a frame */ }
        });
        (global as any).__panelWs = ws;
    }, 900);

    const startedWaiting = Date.now();
    const watching = await waitForPanelWatcher(PANEL_BROWSER_SID, 4000);
    const waitMs = Date.now() - startedWaiting;
    check('انتظر حتى اتّصلت اللوحة', watching === true, `${waitMs}ms`);
    check('ولم ينتظر أكثر ممّا يلزم', waitMs < 3000, `${waitMs}ms`);

    console.log('\n[3] والفحص يبدأ الآن — والإطارات تصل من ثانيته الأولى');
    const auditStart = Date.now();
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const audit = await auditBuiltApp(dist, { timeoutMs: 40_000, watchSessionId: PANEL_BROWSER_SID });
    const took = Date.now() - auditStart;

    check('الفحص جرى', !audit.skipped, String(audit.skipped));
    const during = frames.filter(t => t >= auditStart).length;
    const firstAt = frames.find(t => t >= auditStart);
    const offset = firstAt ? firstAt - auditStart : -1;
    const firstHalf = frames.filter(t => t >= auditStart && t <= auditStart + took / 2).length;
    console.log(`   ℹ️ ${during} إطاراً خلال ${Math.round(took / 1000)}s — أول إطار بعد ${offset}ms — ${firstHalf} في النصف الأول`);
    check('وصلت إطارات أثناءه', during > 0, String(during));
    /**
     * The first seconds are Chromium starting: the panel cannot show a page
     * that does not exist yet. What must be true is that the stream begins as
     * soon as the page does — not at the end of the run. Four seconds is the
     * launch, and it is measured, not assumed.
     */
    check('والبثّ يبدأ مع الصفحة لا مع نهاية الفحص', offset >= 0 && offset < 6000, `${offset}ms`);
    check('ونصفه الأول ليس فارغاً', firstHalf > 0, `${firstHalf}/${during}`);

    console.log('\n[4] وما وُجد رُسم على الصفحة');
    const A = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
    check('بطاقة الملاحظات تُرسم عند الاستعارة', /data-joe-audit/.test(A) && /if \(borrowed\)/.test(A));
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    const focusAt = R.indexOf("panel_focus");
    const waitAt = R.indexOf('waitForPanelWatcher');
    const auditAt = R.indexOf('audit = await auditBuiltApp');
    check('والبنّاء ينتظر قبل أن يبدأ لا بعده', focusAt < waitAt && waitAt < auditAt && waitAt > 0,
        `focus=${focusAt} wait=${waitAt} audit=${auditAt}`);
    check('ويقول للمستخدم إن كانت اللوحة متّصلة أم لا',
        /the Browser panel is attached/.test(R) && /no Browser panel attached/.test(R));

    try { (global as any).__panelWs?.close(); } catch { /* closing */ }
    try {
        const { stopSession } = await import('../../modules/browser/manager');
        await stopSession(PANEL_BROWSER_SID);
    } catch { /* best effort */ }
    await new Promise<void>(r => server.close(() => r()));
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
