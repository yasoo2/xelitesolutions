/**
 * WIRE PROOF — the three features, live:
 *
 *   1. CLARIFY: AgentLoopService.execute('ابن لي موقع') returns the questions
 *      WITHOUT touching any model/provider, broadcasts them as the assistant
 *      reply, and persists them to the JSON chat store.
 *   2. MOBILE APP: a project written with the REAL pwa functions is loaded in
 *      the REAL browser — the service worker registers and activates, the
 *      manifest and both PNG icons fetch, and the page STILL RENDERS OFFLINE
 *      (context.setOffline(true) + reload).
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_three_features.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-three-'));
    process.env.JOE_CHAT_STORE_DIR = tmp;

    // ── 1. the clarify dialogue through the real service ────────────────
    console.log('\n[1] «ابن لي موقع» → أسئلة فورية بلا أي استدعاء نموذج');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const g: any = global as any;
    g.mockMessages = [];
    const t0 = Date.now();
    const res: any = await AgentLoopService.execute('ابن لي موقع', { sessionId: 'clar-live', language: 'ar' });
    const took = Date.now() - t0;
    check('the reply is the clarify questions', !!res?.result?.clarify && /1️⃣/.test(String(res?.result?.answer)), JSON.stringify(res).slice(0, 120));
    check('…answered instantly (no provider walk)', took < 2000, `${took}ms`);
    check('…in Arabic, ending with the bypass hint', /ابدأ مباشرة/.test(String(res?.result?.answer)));
    check('…persisted as an assistant message', (g.mockMessages || []).some((m: any) => m.role === 'assistant' && /1️⃣/.test(m.content)));
    const merged = (await import('../../core/orchestrator/clarify')).clarifyGate('مطعم مأكولات بحرية بألوان زرقاء', 'clar-live', 'ar');
    check('the NEXT message merges into the original request', merged.kind === 'merge' && /ابن لي موقع/.test((merged as any).goal) && /بحرية/.test((merged as any).goal));

    // ── 2. the installable app, in the real browser ─────────────────────
    console.log('\n[2] تطبيق قابل للتثبيت: عامل الخدمة يسجّل، والصفحة تعمل بلا إنترنت');
    const { ensurePwaMarkup, manifestJson, serviceWorkerJs, iconPng } = await import('../../core/design/pwa');
    const dir = path.join(tmp, 'app');
    fs.mkdirSync(dir, { recursive: true });
    let page = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مطعمي</title>
<link rel="stylesheet" href="styles.css"></head><body><h1 id="t">تطبيق مطعمي</h1><script src="script.js"></script></body></html>`;
    page = ensurePwaMarkup(page, { name: 'مطعمي', themeColor: '#6e31d8', isArabic: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    fs.writeFileSync(path.join(dir, 'styles.css'), 'body{background:#f9f8fc}');
    fs.writeFileSync(path.join(dir, 'script.js'), 'console.log("app alive")');
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), manifestJson({ name: 'مطعمي', themeColor: '#6e31d8', isArabic: true }));
    fs.writeFileSync(path.join(dir, 'sw.js'), serviceWorkerJs());
    fs.writeFileSync(path.join(dir, 'icon-192.png'), iconPng(192, '#6e31d8'));
    fs.writeFileSync(path.join(dir, 'icon-512.png'), iconPng(512, '#6e31d8'));

    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
    const server = http.createServer((req, res) => {
        const rel = (req.url || '/').split('?')[0];
        const p = path.join(dir, rel === '/' ? 'index.html' : rel);
        try { res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p)); }
        catch { res.writeHead(404); res.end(); }
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const ctx = await browser.newContext();
    const p1 = await ctx.newPage();
    await p1.goto(`${origin}/index.html`, { waitUntil: 'load' });
    const swState = await p1.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        const reg = await navigator.serviceWorker.ready;
        const w = reg.active;
        if (!w) return 'none';
        // 'activating' → 'activated' is a tick away; wait for it instead of
        // racing it.
        if (w.state !== 'activated') {
            await new Promise<void>(r => {
                const t = setTimeout(() => r(), 3000);
                w.addEventListener('statechange', () => { if (w.state === 'activated') { clearTimeout(t); r(); } });
            });
        }
        return w.state;
    });
    check('the service worker registered and activated', swState === 'activated', swState);
    const manifestOk = await p1.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
        if (!link) return 'no-link';
        const r = await fetch(link.href);
        if (!r.ok) return `http-${r.status}`;
        const m = await r.json();
        return m.display === 'standalone' && m.icons?.length === 2 ? 'ok' : 'bad-manifest';
    });
    check('the manifest link resolves and is installable', manifestOk === 'ok', String(manifestOk));
    const iconOk = await p1.evaluate(async () => {
        const r = await fetch('icon-192.png');
        const b = new Uint8Array(await r.arrayBuffer());
        return r.ok && b[0] === 0x89 && b[1] === 0x50 ? 'ok' : `bad-${r.status}`;
    });
    check('the generated icon serves as a real PNG', iconOk === 'ok', String(iconOk));
    await p1.waitForTimeout(600);   // let the worker finish precaching

    await ctx.setOffline(true);
    await p1.reload({ waitUntil: 'load' }).catch(() => { });
    const offlineTitle = await p1.evaluate(() => document.querySelector('#t')?.textContent || '');
    check('OFFLINE: the app still renders from the worker cache', offlineTitle.includes('تطبيق مطعمي'), offlineTitle || '(blank)');
    await ctx.setOffline(false);

    await browser.close();
    server.close();
    g.mockMessages = [];
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
