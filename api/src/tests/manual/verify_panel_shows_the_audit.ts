/**
 * «مازال يفتح المتصفح دون عمل شيء — لاحظ الصورة»
 *
 * His screenshot, taken at «🔎 Self-QA in a real browser…»:
 *   · the Browser panel is open, status «connected · 1280×720»
 *   · the URL bar says «No page loaded»
 *   · and the viewport is BLANK WHITE.
 *
 * The previous proof (verify_panel_watches_from_start) COUNTED FRAMES and never
 * looked inside one. Frames of a blank page count exactly the same as frames of
 * his store — so it passed while he watched nothing happen. This one opens the
 * REAL interface in a REAL browser, clicks the REAL Browser tab, and then reads
 * the PIXELS the panel is painting while an audit runs:
 *
 *   [1] the panel attaches the way his does
 *   [2] the audited page is really shown — non-blank pixels, more than one colour
 *   [3] from the START of the audit, not at its end
 *   [4] and the URL bar names the page being audited instead of «No page loaded»
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_panel_shows_the_audit.ts
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

/** A built site that is impossible to confuse with a blank page. */
function builtSite(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>متجر القهوة</title>
<style>
 body{margin:0;font-family:sans-serif;background:#0b3d2e;color:#f6fff9}
 header{padding:40px 24px;background:#0a2f24}
 h1{margin:0;font-size:40px}
 main{padding:24px;display:grid;gap:16px;grid-template-columns:repeat(3,1fr)}
 .card{background:#12574180;border:1px solid #34c48b;border-radius:14px;padding:20px}
 button{min-width:48px;min-height:48px;margin:6px;background:#34c48b;border:0;border-radius:10px;padding:12px 18px;font-size:15px}
</style></head>
<body><header><h1>متجر القهوة</h1></header><main>
<div class="card"><h3>إسبريسو</h3><button onclick="document.title='clicked'">أضف إلى السلة</button></div>
<div class="card"><h3>لاتيه</h3><button onclick="window.scrollBy(0,120)">المزيد</button></div>
<div class="card"><h3>قهوة مختصة</h3><a href="#">رابط بلا وجهة</a></div>
</main></body></html>`, 'utf-8');
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-panel-'));
    const dist = path.join(work, 'dist');
    builtSite(dist);

    const webDist = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist');
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
        console.error('❌ ابنِ الواجهة أولاً: npm run build داخل web');
        process.exit(1);
    }

    console.log('\n[0] واجهة جو الحقيقية، ولوحة المتصفّح الحقيقية');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const ui = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await ui.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
    const shim = () => page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });

    await page.goto(base + '/joe', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shim();
    try { await page.getByRole('button', { name: /ضيف/ }).click({ timeout: 8000 }); await page.waitForTimeout(3000); } catch { /* reported below */ }
    try {
        const overlay = page.locator('.dialog-overlay');
        if (await overlay.count()) { await overlay.first().click({ position: { x: 6, y: 6 }, timeout: 4000 }); await page.waitForTimeout(600); }
    } catch { /* no modal */ }
    await shim();

    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');
    const sessions: any[] = (global as any).mockSessions || [];
    const sid = String(sessions[0]?.id || sessions[0]?._id || '');

    console.log('\n[1] اللوحة تُفتح كما تُفتح عنده — بحدث panel_focus من البنّاء');
    try { broadcast({ type: 'panel_focus', sessionId: sid, data: { panel: 'browser', reason: 'audit' } } as any); } catch { /* UI optional */ }
    await page.waitForTimeout(1200);
    // …and if the interface did not open it by itself, click the tab as he does.
    try {
        if (!(await page.locator('canvas').count())) {
            await page.getByText(/^Browser$|^المتصفح$/).first().click({ timeout: 6000 });
            await page.waitForTimeout(1500);
        }
    } catch { /* measured below */ }
    await shim();

    const { waitForPanelWatcher, panelWatcherCount } = await import('../../modules/browser/wsHub');
    const watching = await waitForPanelWatcher(PANEL_BROWSER_SID, 8000);
    check('اللوحة متّصلة فعلاً بجلسة المتصفّح', watching === true && panelWatcherCount(PANEL_BROWSER_SID) > 0,
        `watchers=${panelWatcherCount(PANEL_BROWSER_SID)}`);

    // Record what the interface RECEIVES, and what it PAINTS.
    await page.evaluate(() => {
        (window as any).__status = [];
        window.addEventListener('browser:session_status', (e: any) => (window as any).__status.push({ t: Date.now(), url: String(e?.detail?.url || '') }));
        (window as any).__samples = [];
        (window as any).__sampler = setInterval(() => {
            const c = document.querySelector('canvas') as HTMLCanvasElement | null;
            if (!c || !c.width || !c.height) { (window as any).__samples.push({ t: Date.now(), blank: true, why: 'no-canvas' }); return; }
            const ctx = c.getContext('2d');
            if (!ctx) return;
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let lit = 0, n = 0;
            const colours = new Set<string>();
            for (let i = 0; i < d.length; i += 4 * 613) {
                n++;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                // Anything that is neither white nor the canvas's untouched black.
                if (!(r > 244 && g > 244 && b > 244) && !(r < 8 && g < 8 && b < 8)) lit++;
                colours.add(`${r >> 4},${g >> 4},${b >> 4}`);
            }
            (window as any).__samples.push({ t: Date.now(), lit: n ? lit / n : 0, colours: colours.size, w: c.width, h: c.height });
        }, 350);
    });

    console.log('\n[2] والفحص يجري الآن — ونقرأ ما تعرضه اللوحة، لا عدد الإطارات');
    const auditStart = Date.now();
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const audit = await auditBuiltApp(dist, { timeoutMs: 40_000, watchSessionId: PANEL_BROWSER_SID });
    const took = Date.now() - auditStart;
    check('الفحص جرى فعلاً', !audit.skipped, String(audit.skipped));
    console.log(`   ℹ️ ${audit.score}/100 خلال ${Math.round(took / 1000)}s — ${(audit.findings || []).map(f => f.id).join(', ') || 'نظيف'}`);

    // Give the overlay a beat to be painted and streamed before we stop looking.
    await page.waitForTimeout(1200);
    const seen = await page.evaluate(() => {
        clearInterval((window as any).__sampler);
        const bar = [...document.querySelectorAll('div,span,input')]
            .map(e => (e as HTMLElement).innerText || (e as HTMLInputElement).value || '')
            .find(txt => /127\.0\.0\.1:\d+|No page loaded|لا يوجد صفحة/.test(txt)) || '';
        return { samples: (window as any).__samples, status: (window as any).__status, bar: String(bar).slice(0, 120) };
    });

    const during = (seen.samples as any[]).filter(s => s.t >= auditStart);
    const shown = during.filter(s => (s.lit || 0) > 0.25 && (s.colours || 0) > 3);
    const firstShown = shown[0]?.t ? shown[0].t - auditStart : -1;
    const half = during.filter(s => s.t <= auditStart + took / 2);
    const shownEarly = half.filter(s => (s.lit || 0) > 0.25 && (s.colours || 0) > 3).length;
    console.log(`   ℹ️ ${during.length} قراءة للوحة — ${shown.length} منها تُظهر الصفحة — أول ظهور بعد ${firstShown}ms — ${shownEarly} في النصف الأول`);

    check('اللوحة تعرض الصفحة المفحوصة، لا بياضاً', shown.length > 0,
        `أعلى امتلاء: ${Math.max(0, ...during.map(s => Math.round((s.lit || 0) * 100)))}% من البكسلات`);
    check('ويظهر من بداية الفحص لا من نهايته', firstShown >= 0 && firstShown < 12_000, `${firstShown}ms`);
    check('ونصفه الأول ليس شاشة فارغة', shownEarly > 0, `${shownEarly}/${half.length}`);

    console.log('\n[3] وشريط العنوان يقول أين هو — لا «No page loaded»');
    const urls = (seen.status as any[]).map(s => s.url).filter(Boolean);
    console.log(`   ℹ️ أحداث الحالة: ${urls.length ? urls.map(u => u.slice(0, 40)).join(' · ') : 'لا شيء'}`);
    check('وصل عنوان الصفحة المفحوصة إلى الواجهة', urls.some(u => /^http:\/\/127\.0\.0\.1:\d+\//.test(u)),
        urls.join(' · ').slice(0, 120) || 'لم يصل أيّ عنوان');
    check('وشريط العنوان لا يقول «لا يوجد صفحة»', !/No page loaded|لا يوجد صفحة/.test(seen.bar), seen.bar);

    await page.screenshot({ path: path.join(work, 'panel-cold.png') });

    /**
     * [4] AND THE WHITE SECONDS ARE THE LAUNCH, SO THE LAUNCH MOVES.
     *
     * The gap measured above is Chromium starting up: the panel is attached,
     * connected, and has nothing to paint yet. A build knows a minute ahead
     * that it will need a browser, so `warmBrowserSession` starts it during
     * `npm install`. Measured here as the same audit against a session that is
     * already awake — which is exactly the state his build will be in.
     */
    console.log('\n[4] وبمتصفّح مُهيَّأ مسبقاً — كما يفعل البناء الآن أثناء npm install');
    const { warmBrowserSession, liveBrowserSessionCount } = await import('../../modules/browser/manager');
    warmBrowserSession(PANEL_BROWSER_SID);   // already alive from [2] — proves it is a no-op, not a second browser
    await page.waitForTimeout(500);
    check('لا يفتح متصفّحاً ثانياً لجلسة قائمة', liveBrowserSessionCount() === 1, `${liveBrowserSessionCount()} جلسة`);

    await page.evaluate(() => {
        (window as any).__samples = [];
        (window as any).__sampler = setInterval(() => {
            const c = document.querySelector('canvas') as HTMLCanvasElement | null;
            if (!c || !c.width || !c.height) { (window as any).__samples.push({ t: Date.now(), lit: 0, colours: 0 }); return; }
            const ctx = c.getContext('2d'); if (!ctx) return;
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let lit = 0, n = 0; const colours = new Set<string>();
            for (let i = 0; i < d.length; i += 4 * 613) {
                n++; const r = d[i], g = d[i + 1], b = d[i + 2];
                if (!(r > 244 && g > 244 && b > 244) && !(r < 8 && g < 8 && b < 8)) lit++;
                colours.add(`${r >> 4},${g >> 4},${b >> 4}`);
            }
            (window as any).__samples.push({ t: Date.now(), lit: n ? lit / n : 0, colours: colours.size });
        }, 200);
    });
    const warmStart = Date.now();
    const audit2 = await auditBuiltApp(dist, { timeoutMs: 40_000, watchSessionId: PANEL_BROWSER_SID });
    const warmSamples = await page.evaluate(() => { clearInterval((window as any).__sampler); return (window as any).__samples; });
    const warmShown = (warmSamples as any[]).filter(s => s.t >= warmStart && (s.lit || 0) > 0.25 && (s.colours || 0) > 3);
    const warmFirst = warmShown[0]?.t ? warmShown[0].t - warmStart : -1;
    console.log(`   ℹ️ أول ظهور للصفحة: بارد ${firstShown}ms → دافئ ${warmFirst}ms (${audit2.score}/100)`);
    check('الفحص الثاني جرى', !audit2.skipped, String(audit2.skipped));
    check('الصفحة تظهر في اللوحة خلال ثانيتين من بدء الفحص', warmFirst >= 0 && warmFirst < 2000, `${warmFirst}ms`);
    check('وأسرع ممّا كانت بالإقلاع البارد', warmFirst >= 0 && warmFirst < firstShown, `${warmFirst} < ${firstShown}`);

    await page.screenshot({ path: path.join(work, 'panel-warm.png') });
    console.log(`   🖼️ لقطتا اللوحة: ${path.join(work, 'panel-cold.png')} · ${path.join(work, 'panel-warm.png')}`);

    await ui.close();
    try {
        const { stopSession } = await import('../../modules/browser/manager');
        await stopSession(PANEL_BROWSER_SID);
    } catch { /* best effort */ }
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
