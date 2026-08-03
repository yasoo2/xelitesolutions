/**
 * WIRE PROOF — THE BROWSER'S OWN PATH, end to end. Nothing simulated:
 *
 *   The REAL Joe server boots (createApp + attachWebSocket, exactly like
 *   index.ts). A REAL WebSocket client connects to /ws the way the web UI
 *   does and records every event. A chat goal enters through the REAL
 *   POST /api/agent — the same planner, the same orchestrator, the same
 *   deterministic tool. The proof then asserts what the PANELS receive:
 *
 *     Terminal panel : terminal_output lines streaming npm install, vite
 *                      build and the self-QA verdict, live
 *     Thinking strip : Arabic broadcastThinkingDetail stages
 *     Logs auto-open : build_started
 *     Preview panel  : preview_ready carrying a /project-preview URL that
 *                      the SAME server actually serves — Playwright opens
 *                      it and the app renders
 *
 *   Then a SECOND goal — «غيّر الطراز إلى جريء» — rides the same real
 *   entry, the surgical editor swaps the family, the build verifies, a
 *   fresh preview_ready lands, and the browser MEASURES the new identity.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_ui_integration.ts
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

// Only the photo archive is interposed (deterministic, like every photo
// proof) — planner, orchestrator, tools, WS, preview all run REAL.
const state = { baseUrl: '' };
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    const out = origLoad.call(this, request, parent, isMain);
    if (/photo-sources$/.test(String(request))) {
        return {
            ...out,
            searchAllSources: async (query: string) => ({
                candidates: [0, 1, 2, 3].map(i => ({
                    url: `${state.baseUrl}/photo/${encodeURIComponent(query)}-${i}.png`,
                    title: query, tags: [], creator: `Photographer ${i}`, license: 'CC BY 2.0',
                    landing: `${state.baseUrl}/landing/${encodeURIComponent(query)}-${i}`, provider: 'stub-archive',
                })),
                outcomes: [{ provider: 'stub-archive', ok: true, count: 4 }],
            }),
        };
    }
    return out;
};

async function main() {
    const { iconPng } = require('../../core/design/pwa');
    const png: Buffer = iconPng(640, '#4b6ab4');
    const archive = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ui-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    if (workspaceService.setExplorerRoot) workspaceService.setExplorerRoot(root);

    console.log('\n[1] خادم جو الحقيقي يقلع كما يقلع فعلاً — HTTP + WebSocket');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const app = createApp();
    const server = http.createServer(app);
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    check('the real server is listening', port > 0, String(port));

    console.log('\n[2] عميل WebSocket حقيقي يتصل بـ /ws كما تتصل الواجهة');
    const { WebSocket } = require('ws');
    const events: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
    });
    ws.on('message', (d: Buffer) => { try { events.push(JSON.parse(String(d))); } catch { /* ping */ } });
    check('the UI socket is connected', ws.readyState === 1);

    console.log('\n[3] رسالة الدردشة تدخل من POST /api/agent — البناء الكامل يجري فعلاً');
    const t0 = Date.now();
    const agentRes = await fetch(`http://127.0.0.1:${port}/api/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'ابنِ موقع react لمقهى النخبة', sessionId: 'ui-wire' }),
    }).then(r => r.json());
    check('the real /api/agent chain answered success', agentRes?.success === true, JSON.stringify(agentRes).slice(0, 150));
    console.log(`      (البناء الحقيقي استغرق ${Math.round((Date.now() - t0) / 1000)} ثانية)`);
    await new Promise(r => setTimeout(r, 600));

    const ofType = (t: string) => events.filter(e => e?.type === t);
    check('اللوحة «Logs» تستقبل build_started (الفتح التلقائي)', ofType('build_started').length >= 1);
    const termLines = events.filter(e => e?.type === 'terminal_output').map(e => String(e.data ?? ''));
    check('الطرفية استقبلت بثاً حياً غزيراً', termLines.length >= 10, `lines=${termLines.length}`);
    check('…يشمل npm install وvite build والفحص الذاتي', termLines.some(l => /npm install/.test(l)) && termLines.some(l => /vite build/.test(l)) && termLines.some(l => /self-QA/.test(l)),
        termLines.filter(l => /install|build|QA/.test(l)).slice(0, 3).join(' | '));
    const thinking = events.filter(e => /thinking/.test(String(e?.type)) && /[؀-ۿ]/.test(JSON.stringify(e)));
    check('شريط التفكير استقبل مراحل عربية حية', thinking.length >= 2, `stages=${thinking.length}`);
    // THE FILES, LIVE. The field report was «شاشة اللوجز تفتح لكن لا تعرض
    // اللوجز والملفات التي تبنى» — a React build emitted no file_stream at
    // all, so the panel opened on an empty list of files.
    const fileEvents = ofType('file_stream').map(e => e.data || {});
    check('لوحة «Logs» استقبلت ملفات حية من بناء React', fileEvents.length >= 10, `files=${fileEvents.length}`);
    check('…بأسماء حقيقية ومحتوى حقيقي (package.json + App.jsx + base.css)',
        ['package.json', 'src/App.jsx', 'src/styles/base.css'].every(f => fileEvents.some((d: any) => d.file === f))
        && fileEvents.every((d: any) => typeof d.chunk === 'string' && d.chunk.length > 0 && d.done === true),
        fileEvents.map((d: any) => d.file).slice(0, 6).join(','));
    check('…وبالترتيب الذي كُتبت به فعلاً على القرص',
        fileEvents.findIndex((d: any) => d.file === 'package.json') < fileEvents.findIndex((d: any) => d.file === 'src/App.jsx'),
        fileEvents.map((d: any) => d.file).join(','));
    // The panel takes ONLY the 'panel-terminal' copy — the same line is
    // broadcast to four ids, and four copies per line read as a broken log.
    const panelLines = events.filter(e => e?.type === 'terminal_output' && e.id === 'panel-terminal');
    check('بثّ الطرفية يصل للوحة عبر معرّف واحد (بلا تكرار رباعي)',
        panelLines.length >= 10 && panelLines.length * 4 >= termLines.length && panelLines.length < termLines.length,
        `panel=${panelLines.length} total=${termLines.length}`);

    const pv = ofType('preview_ready').map(e => String(e?.data?.url || ''));
    check('لوحة المعاينة استقبلت preview_ready برابط /project-preview', pv.some(u => u.includes('/project-preview/ui-wire/')), pv.join(' | ').slice(0, 120));

    console.log('\n[4] متصفح حقيقي يفتح رابط المعاينة من نفس خادم جو — ويرى التطبيق');
    const previewUrl = pv.find(u => u.includes('/project-preview/'))!.replace('http://localhost:', 'http://127.0.0.1:').replace(/:\d+\//, `:${port}/`);
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    const resp = await p.goto(previewUrl, { waitUntil: 'networkidle' });
    const seen = await p.evaluate(() => ({
        brand: document.querySelector('.brand')?.textContent || '',
        h1: document.querySelector('h1')?.textContent || '',
        radius: getComputedStyle(document.querySelector('.card')!).borderRadius,
        // Whichever archetype this kind wears: the overlay's full-bleed
        // .hero-bg or the split layout's .hero-photo.
        heroPainted: ((document.querySelector('.hero-bg, .hero-photo') as HTMLImageElement | null)?.naturalWidth || 0) > 0,
    }));
    check('الرابط يقدَّم من خادم جو نفسه (200)', !!resp && resp.status() === 200);
    check('التطبيق مرسوم في المعاينة — العلامة والعنوان والصورة الحقيقية', seen.brand.length > 0 && seen.h1.length > 0 && seen.heroPainted, JSON.stringify(seen));

    console.log('\n[5] أمر تعديل من نفس المدخل الحقيقي — والمعاينة تتحدث وتتغير مقيسةً');
    const before = seen.radius;
    const editRes = await fetch(`http://127.0.0.1:${port}/api/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'غيّر الطراز إلى جريء', sessionId: 'ui-wire' }),
    }).then(r => r.json());
    check('the edit rode the same real chain', editRes?.success === true, JSON.stringify(editRes).slice(0, 120));
    await new Promise(r => setTimeout(r, 600));
    check('a SECOND preview_ready followed the verified edit', ofType('preview_ready').length >= 2, String(ofType('preview_ready').length));
    await p.reload({ waitUntil: 'networkidle' });
    const radius2 = await p.evaluate(() => getComputedStyle(document.querySelector('.card')!).borderRadius);
    check('المتصفح يقيس الطراز الجديد على نفس رابط المعاينة', radius2 === '4px' && radius2 !== before, `${before} → ${radius2}`);

    console.log('\n[6] عقد الواجهة: معالجات هذه الأحداث موجودة في كود الواجهة فعلاً');
    const joeTsx = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');
    const socketTs = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'services', 'socket.ts'), 'utf-8');
    check('Joe.tsx يعالج preview_ready وbuild_started', joeTsx.includes("'preview_ready'") && joeTsx.includes("'build_started'"));
    check('طبقة الواجهة تعالج terminal_output', (joeTsx + socketTs).includes('terminal_output'));

    await browser.close();
    ws.close();
    server.close(); archive.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
