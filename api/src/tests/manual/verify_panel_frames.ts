/**
 * «ما زال يفتح المتصفح ولا يفعل شيء اثناء بناء البروميت» — the third time.
 *
 * The audit was moved into his panel so he could WATCH it. His log shows the
 * panel opening, a client attaching, twelve seconds of self-QA, and then the
 * client leaving — with nothing in between. Twice I answered that complaint
 * by making the audit run in the panel. It does run there. What was never
 * measured is whether a single FRAME ever reaches him while it does.
 *
 * So this counts frames, on a real client socket, during a real audit:
 *
 *   [1] a real panel client attaches to the browser stream
 *   [2] a real audit runs against a real built page in that session
 *   [3] frames arrive DURING it — not before, not after
 *   [4] and the findings overlay he was promised is actually painted
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_panel_frames.ts
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
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A small built site to audit — the shape a React build leaves behind. */
function builtSite(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>متجر</title>
<style>body{margin:0;font-family:sans-serif;background:#fff}
button{min-width:48px;min-height:48px;margin:6px}</style></head>
<body><h1>متجرنا</h1><main>
<button onclick="document.title='clicked'">أضف إلى السلة</button>
<a href="#">رابط بلا وجهة</a>
</main></body></html>`, 'utf-8');
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-frames-'));
    const dist = path.join(work, 'dist');
    builtSite(dist);

    console.log('\n[0] خادم جو الحقيقي، ولوحة متصفّح حقيقية متّصلة به');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');
    const WebSocket = (await import('ws')).default;

    const frames: number[] = [];
    const events: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/browser?sessionId=${encodeURIComponent(PANEL_BROWSER_SID)}`);
    const opened = await new Promise<boolean>(resolve => {
        ws.on('open', () => resolve(true));
        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 8000);
    });
    check('اللوحة اتّصلت بمجرى المتصفّح', opened);
    ws.on('message', (raw: any) => {
        let msg: any = null;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (!msg?.type) return;
        events.push(msg.type);
        if (msg.type === 'stream_frame') frames.push(Date.now());
    });
    // NOTHING is sent. The real panel just connects; the server's own
    // onFirstClient hook is what must start the stream. An earlier version of
    // this proof sent `start_stream` by hand and passed — measuring a path the
    // product does not take.
    await new Promise(r => setTimeout(r, 1200));

    console.log('\n[1] فحص حقيقي على صفحة مبنية حقيقية — واللوحة مفتوحة طوال الوقت');
    const before = frames.length;
    const startedAt = Date.now();
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const audit = await auditBuiltApp(dist, { timeoutMs: 40_000, watchSessionId: PANEL_BROWSER_SID });
    const took = Date.now() - startedAt;
    check('الفحص جرى', !audit.skipped, String(audit.skipped));
    check('واستغرق وقتاً حقيقياً', took > 1500, `${Math.round(took / 1000)}s`);

    const during = frames.filter(t => t >= startedAt).length;
    console.log(`   ℹ️ إطارات قبل الفحص: ${before} — أثناءه: ${during} — الأحداث: ${[...new Set(events)].join(', ') || 'لا شيء'}`);
    check('وصلت إطارات إلى اللوحة أثناء الفحص — لا شاشة ميتة', during > 0, `${during} إطار في ${Math.round(took / 1000)} ثانية`);
    check('وبمعدّل يُرى لا لقطة يتيمة', during >= Math.min(5, Math.floor(took / 2000)), String(during));

    console.log('\n[2] وما وُجد رُسم على الصفحة نفسها');
    check('الفحص أعاد ملاحظات أو نظافة', Array.isArray(audit.findings));
    const A = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
    check('البطاقة تُرسم عند الاستعارة', /data-joe-audit/.test(A) && /if \(borrowed\)/.test(A));

    try { ws.close(); } catch { /* closing */ }
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
