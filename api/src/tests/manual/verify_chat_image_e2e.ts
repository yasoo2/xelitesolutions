/**
 * E2E REPRODUCTION — the user's exact complaint, replayed pixel for pixel:
 * «لم تظهر الصوره بعد ارفاقها والضغط على انتر لم تظهر في دردشة جو».
 *
 * The REAL app (api + built web UI, served exactly like on the user's
 * machine), a REAL Chromium, the REAL paperclip input: attach a PNG, press
 * Enter, then measure what the chat actually shows — the thumbnail in the
 * sent bubble, and again after a full page reload (history path). The agent
 * entry point is stubbed to reply instantly so no model quota is burned;
 * everything else is the production chain.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_chat_image_e2e.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

// A REAL 8x8 red PNG (not 1x1 — the thumbnail must have visible pixels).
const RED_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8DwnwEPYMKn' +
    'YBQMDgAAdCsBH/kNb1EAAAAASUVORK5CYII=', 'base64');

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const realExecute = AgentLoopService.execute;
    (AgentLoopService as any).execute = async (_goal: string, options: any) => {
        const { broadcast } = await import('../../api/ws');
        broadcast({ type: 'text', sessionId: options.sessionId, data: { text: 'تم استلام الصورة.', sessionId: options.sessionId } } as any);
        broadcast({ type: 'run_finished', data: { ok: true, sessionId: options.sessionId } } as any);
        return { ok: true };
    };

    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    // The chat renders the user's message from the WS echo — without the
    // socket attached (like production attaches it) nothing ever shows.
    attachWebSocket(server as any);
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const origin = `http://127.0.0.1:${port}`;
    const token = jwt.sign(
        { sub: 'e2e-user', role: 'OWNER', email: 'younes@example.com', name: 'Younes', exp: Math.floor(Date.now() / 1000) + 3600 },
        'x');

    const pngPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-e2e-')), 'لقطة-شاشة.png');
    fs.writeFileSync(pngPath, RED_PNG);

    // Mark the workspace initialized ahead of time, or the onboarding dialog
    // covers the composer and no click lands (measured on the first run).
    const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const ws: any = await (await fetch(`${origin}/api/workspaces`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'E2E' }) })).json();
    const wsId = ws?._id || ws?.id;
    if (wsId) await fetch(`${origin}/api/workspaces/${wsId}`, { method: 'PUT', headers: auth, body: JSON.stringify({ projectInitialized: true }) });

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(`try { localStorage.setItem('token', ${JSON.stringify(token)}); } catch (e) {}`);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message.slice(0, 160)));
    page.on('console', (m: any) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /upload|attach|DEBUG-SEND/i.test(t)) console.log(`[page:${m.type()}]`, t.slice(0, 260)); });
    page.on('request', (r: any) => { if (r.url().includes('/files/upload')) console.log('[net] →', r.method(), r.url().slice(-40)); });
    page.on('requestfailed', (r: any) => console.log('[net:FAIL]', r.method(), r.url().slice(0, 120), '::', r.failure()?.errorText));
    page.on('response', (r: any) => { if (r.url().includes('/files/upload')) console.log('[net] ←', r.status(), r.url().slice(-40)); });

    await page.goto(`${origin}/joe`, { waitUntil: 'domcontentloaded' });
    // The composer's hidden paperclip input.
    await page.waitForSelector('input[data-joe-attach]', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(1200);

    // Any modal that greets a fresh profile (onboarding/GitHub/settings) is
    // not the subject of this proof — note which one appeared, then clear it.
    const overlayInfo = await page.evaluate(() => {
        const o = document.querySelector('.dialog-overlay');
        return o ? (o.querySelector('h1,h2,h3')?.textContent || 'unnamed dialog').slice(0, 60) : '';
    });
    if (overlayInfo) {
        console.log('[e2e] dismissing greeting dialog:', overlayInfo);
        await page.keyboard.press('Escape').catch(() => { });
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            document.querySelectorAll('.dialog-overlay').forEach(o => o.remove());
        });
    }

    // 1. Attach the image by firing the input's change event from INSIDE the
    //    page — byte-identical to a user's pick, running the real React
    //    handler and the real XHR upload. (Playwright's out-of-process
    //    setFiles proved not to reach this bundle's React listener, an
    //    automation artifact: the user's own machine logs upload 200.)
    await page.evaluate(({ b64, name }: any) => {
        const inp = document.querySelector('input[data-joe-attach]') as HTMLInputElement;
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const file = new File([bytes], name, { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
    }, { b64: RED_PNG.toString('base64'), name: 'لقطة-شاشة.png' });
    // The chip above the input must appear once upload finishes.
    const chipAppeared = await page.waitForSelector('.attached-file-chip, .attached-files', { timeout: 15000 })
        .then(() => true).catch(() => false);
    await page.waitForTimeout(400);
    const chipHasThumb = await page.evaluate(() =>
        !!document.querySelector('.attached-files img[src^="data:image"], .attached-file-chip img[src^="data:image"]'));

    // 2. Type and press Enter — the user's exact gesture.
    const inputSel = 'textarea, [contenteditable="true"], input.main-input, .main-input';
    await page.waitForSelector(inputSel, { timeout: 10000 });
    await page.click(inputSel);
    await page.keyboard.type('حلل هذه الصورة');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    const live = await page.evaluate(() => {
        // The production chat is ChatPanel: user turns are .joe-message.user.
        const bubbles = Array.from(document.querySelectorAll('.joe-message'));
        const withText = bubbles.find(b => (b.textContent || '').includes('حلل هذه الصورة'));
        const img = withText?.querySelector('.joe-msg-files img') as HTMLImageElement | null;
        return {
            bubbleExists: !!withText,
            thumbnailShown: !!img && img.naturalWidth > 0 && img.src.includes('/api/files/'),
            nameShown: (img?.alt || '') === 'لقطة-شاشة.png',
        };
    });
    await page.screenshot({ path: path.join(path.dirname(pngPath), 'live.png') });

    // 3. RELOAD — the history path must keep the chip.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const afterReload = await page.evaluate(() => {
        const bubbles = Array.from(document.querySelectorAll('.joe-message'));
        const withText = bubbles.find(b => (b.textContent || '').includes('حلل هذه الصورة'));
        const img = withText?.querySelector('.joe-msg-files img') as HTMLImageElement | null;
        return {
            bubbleExists: !!withText,
            nameShown: !!img && img.naturalWidth > 0 && (img.alt || '') === 'لقطة-شاشة.png',
        };
    });
    await page.screenshot({ path: path.join(path.dirname(pngPath), 'reload.png') });
    await browser.close();
    (AgentLoopService as any).execute = realExecute;
    server.close();

    const checks: Array<[string, boolean]> = [
        ['the composer chip appears after attaching (upload really completed)', chipAppeared],
        ['…and the chip shows the IMAGE thumbnail before sending', chipHasThumb],
        ['after Enter, the sent message bubble EXISTS in the chat', live.bubbleExists],
        ['…and shows the image thumbnail inside the bubble', live.thumbnailShown],
        ['…with the Arabic filename', live.nameShown],
        ['after a RELOAD the message still carries its attachment chip', afterReload.bubbleExists && afterReload.nameShown],
        [`zero page errors (${errors.length}${errors.length ? ': ' + errors[0] : ''})`, errors.length === 0],
    ];
    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log('screenshots:', path.dirname(pngPath));
    console.log(failed === 0
        ? '\nPROOF COMPLETE: the attached image is visible in Joe\'s chat — before sending, after Enter, and after a reload.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
