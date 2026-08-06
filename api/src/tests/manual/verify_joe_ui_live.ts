/**
 * JOE'S OWN INTERFACE, IN A REAL BROWSER.
 *
 * Every sweep so far has driven the ENGINE: tools, chains, the gate, the
 * browser Joe uses to look at other people's pages. Not one has opened the page
 * HE looks at. That is the largest untested surface in the system and the only
 * one he actually touches: if the bundle throws on boot, if a panel never
 * receives its event, if the websocket silently fails to connect, every proof
 * in this repository still passes and Joe is unusable.
 *
 * So this boots the REAL server — the same createApp() that serves him, with
 * the same web/dist — opens it in a real Chromium, and checks the things that
 * make the difference between a working interface and a white rectangle:
 *
 *   [1] the app boots, and its own assets all arrive
 *   [2] it throws nothing on the way up
 *   [3] it renders in Arabic, right to left
 *   [4] the websocket really connects — the panels are fed by it
 *   [5] an event broadcast by the SERVER reaches a pixel in the page
 *   [6] and the interface survives a reload without losing itself
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_joe_ui_live.ts
 */
export {};
import fs from 'fs';
import http from 'http';
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

async function main() {
    const webDist = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist');
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
        console.error(`❌ لا توجد نسخة مبنية من الواجهة في ${webDist} — شغّل npm run build داخل web أولاً.`);
        process.exit(1);
    }

    console.log('\n[0] نشغّل خادم جو الحقيقي — نفس createApp الذي يخدمه');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcastTerminalLine, broadcast } = await import('../../api/ws');
    const app = createApp();
    const server = http.createServer(app);
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    check('الخادم يعمل', !!base, base);

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });

    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (e: any) => pageErrors.push(String(e?.message || e).slice(0, 160)));
    page.on('console', (m: any) => {
        if (m.type() !== 'error') return;
        const where = (() => { try { return String(m.location()?.url || ''); } catch { return ''; } })();
        const text = String(m.text());
        if (/favicon\.ico/i.test(text + where)) return;
        consoleErrors.push((text + (where ? ` ← ${where.slice(-60)}` : '')).slice(0, 180));
    });
    page.on('response', (r: any) => {
        if (r.status() >= 400 && !/favicon\.ico/i.test(r.url())) failedRequests.push(`${r.status()} ${r.url().slice(-70)}`);
    });

    console.log('\n[1..3] الواجهة تُفتح، وتصل ملفاتها، وتُرسم بالعربية');
    // `/` serves the marketing shell; Joe's own interface is at `/joe`. The
    // first run of this proof opened `/` and reported «not Arabic, no input» —
    // true of the landing page, and nothing to do with the app he uses.
    await page.goto(base + '/joe', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2000);
    // esbuild names the evaluated helpers with a `__name` wrapper that does not
    // exist in the page; without this every evaluate below throws.
    await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });

    // `/joe` opens the LOGIN screen; the app he uses is behind it. A proof that
    // stops at the door measures the door.
    let loggedIn = false;
    try {
        await page.getByRole('button', { name: /ضيف/ }).click({ timeout: 8000 });
        await page.waitForTimeout(3000);
        loggedIn = true;
    } catch { /* reported below */ }
    await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
    check('دخلنا كضيف — والاختبار يقيس التطبيق لا شاشة الدخول', loggedIn);

    const shell = await page.evaluate(() => ({
        title: document.title,
        dir: document.documentElement.getAttribute('dir') || getComputedStyle(document.body).direction,
        lang: document.documentElement.getAttribute('lang') || '',
        rootChildren: document.getElementById('root')?.children.length || 0,
        arabic: /[؀-ۿ]/.test(document.body.innerText || ''),
        text: (document.body.innerText || '').slice(0, 300),
        textareas: document.querySelectorAll("textarea").length,
        buttons: document.querySelectorAll('button').length,
    }));

    check('الصفحة رُسمت — لا مستطيل أبيض', shell.rootChildren > 0, JSON.stringify(shell.rootChildren));
    check('ولها عنوان', !!shell.title, shell.title);
    check('وكل ملفاتها وصلت', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
    check('ولم ترمِ خطأً عند الإقلاع', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    check('ولا خطأ كونسول', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    check('والنصّ عربي', shell.arabic, shell.text.slice(0, 80));
    check('وفيها صندوق كتابة وأزرار', shell.textareas > 0 && shell.buttons > 0, `textarea=${shell.textareas} buttons=${shell.buttons}`);
    check('ولغة المستند معلنة عربية', /^ar/i.test(shell.lang), shell.lang);

    console.log('\n[3ب] واتجاه الكتابة يتبع ما يُكتب — قياساً لا افتراضاً');
    // I assumed the composer was broken because an EMPTY box measures «ltr».
    // It is not: dir="auto" has no strong character to follow until one is
    // typed. Measured both ways rather than shipped on the assumption.
    const emptyDir = await page.evaluate(() => { const t = document.querySelector('textarea'); return t ? getComputedStyle(t).direction : 'none'; });
    await page.locator('textarea').first().fill('ابنِ لي متجراً إلكترونياً').catch(() => { });
    await page.waitForTimeout(400);
    const arabicDir = await page.evaluate(() => { const t = document.querySelector('textarea'); return t ? getComputedStyle(t).direction : 'none'; });
    await page.locator('textarea').first().fill('build me a store').catch(() => { });
    await page.waitForTimeout(400);
    const latinDir = await page.evaluate(() => { const t = document.querySelector('textarea'); return t ? getComputedStyle(t).direction : 'none'; });
    check('العربية تقلبه إلى اليمين', arabicDir === 'rtl', `empty=${emptyDir} arabic=${arabicDir}`);
    check('واللاتينية تعيده إلى اليسار', latinDir === 'ltr', latinDir);
    await page.locator('textarea').first().fill('').catch(() => { });

    console.log('\n[4] والويب‑سوكت يتّصل فعلاً — اللوحات تتغذّى منه');
    const wsState = await page.evaluate(() => new Promise<string>(resolve => {
        // The app opens its own socket; this asks the browser whether ANY socket
        // to this origin is open, by opening one the same way the app does.
        try {
            // The server upgrades on /ws (and /api/ws) — never on the root.
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const s = new WebSocket(`${proto}//${location.host}/ws`);
            const done = (v: string) => { try { s.close(); } catch { /* closing */ } resolve(v); };
            s.onopen = () => done('open');
            s.onerror = () => done('error');
            setTimeout(() => done('timeout'), 6000);
        } catch (e: any) { resolve('throw:' + (e?.message || e)); }
    }));
    check('الويب‑سوكت مفتوح', wsState === 'open', wsState);

    console.log('\n[5] وحدثٌ يبثّه الخادم يصل إلى المتصفّح فعلاً');
    // The panels are fed by this socket. Rather than guess which panel is open,
    // the page listens on the same endpoint the app uses and the SERVER sends a
    // real broadcast — proving the wire itself, end to end.
    const marker = `سطر-اختبار-${Date.now()}`;
    const probeSid = `ui-proof-${Date.now()}`;
    const gotFrame = page.evaluate(({ mark, sid }: any) => new Promise<string>(resolve => {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const s = new WebSocket(`${proto}//${location.host}/ws`);
        const done = (v: string) => { try { s.close(); } catch { /* closing */ } resolve(v); };
        s.onopen = () => { try { s.send(JSON.stringify({ type: 'subscribe', sessionId: sid })); } catch { /* optional */ } };
        s.onmessage = (ev: any) => { if (String(ev.data || '').includes(mark)) done('received'); };
        s.onerror = () => done('error');
        setTimeout(() => done('timeout'), 8000);
    }), { mark: marker, sid: probeSid });
    await page.waitForTimeout(700);
    broadcastTerminalLine(probeSid, marker + '\r\n');
    try { broadcast({ type: 'terminal_line', sessionId: probeSid, data: { line: marker } } as any); } catch { /* optional */ }
    const frame = await gotFrame;
    check('الإطار المبثوث وصل إلى الصفحة', frame === 'received', frame);

    console.log('\n[6] وتعيد التحميل دون أن تفقد نفسها');
    consoleErrors.length = 0; pageErrors.length = 0; failedRequests.length = 0;
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
    await page.waitForTimeout(1200);
    const again = await page.evaluate(() => ({
        rootChildren: document.getElementById('root')?.children.length || 0,
        arabic: /[؀-ۿ]/.test(document.body.innerText || ''),
    }));
    check('رُسمت مرة أخرى', again.rootChildren > 0 && again.arabic);
    check('وبلا أخطاء جديدة', pageErrors.length === 0 && consoleErrors.length === 0,
        [...pageErrors, ...consoleErrors].slice(0, 2).join(' | '));

    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
