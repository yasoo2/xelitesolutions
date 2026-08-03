/**
 * WIRE PROOF — BiDi: «مرحباً يا Younes، لقد قمت بتحليل الصورة» must render
 * in the correct logical order. Real app, real Chromium: the assistant
 * message goes through the production ChatPanel renderer, and the
 * paragraph's computed direction + unicode-bidi are measured, plus a
 * screenshot for eyes.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_bidi.ts
 */
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const SHOTS = '/tmp/claude-0/-home-user-xelitesolutions/8962b13f-0dd0-5c41-a133-41e7fbb8d1d2/scratchpad';

const MIXED_AR = 'مرحباً يا Younes، لقد قمت بتحليل الصورة التي رفعتها عبر أداة moondream المحلية بنجاح.';
const MIXED_EN = 'Hello! I analyzed لقطة الشاشة and the layout looks fine.';

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    (AgentLoopService as any).execute = async (_g: string, options: any) => {
        const { broadcast } = await import('../../api/ws');
        broadcast({ type: 'text', sessionId: options.sessionId, data: { text: MIXED_AR, sessionId: options.sessionId } } as any);
        broadcast({ type: 'text', sessionId: options.sessionId, data: { text: MIXED_EN, sessionId: options.sessionId } } as any);
        broadcast({ type: 'run_finished', data: { ok: true, sessionId: options.sessionId } } as any);
        return { ok: true };
    };
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    attachWebSocket(server as any);
    await new Promise<void>(r => server.once('listening', () => r()));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const token = jwt.sign({ sub: 'bidi', role: 'OWNER', email: 'y@example.com', name: 'Younes', exp: Math.floor(Date.now() / 1000) + 3600 }, 'x');

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(`try { localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.setItem('joe-theme', 'dark'); } catch (e) {}`);
    const page = await ctx.newPage();
    await page.goto(`${origin}/joe`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.joe-chat-input-area textarea, .joe-chat-input-area .main-input', { timeout: 20000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll('.dialog-overlay').forEach(d => ((d as HTMLElement).style.display = 'none')));

    await page.fill('.joe-chat-input-area textarea, .joe-chat-input-area .main-input', 'حلل الصورة يا جو please');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.joe-message.assistant .joe-message-bubble p', { timeout: 15000 });
    await page.waitForTimeout(500);

    const probe = await page.evaluate(() => {
        const paras = Array.from(document.querySelectorAll('.joe-message .joe-message-bubble p')) as HTMLElement[];
        return paras.map(p => ({
            text: (p.textContent || '').slice(0, 40),
            dirAttr: p.getAttribute('dir'),
            direction: getComputedStyle(p).direction,
            bidi: getComputedStyle(p).unicodeBidi,
        }));
    });
    console.log('  [dbg]', JSON.stringify(probe, null, 1).slice(0, 600));

    const ar = probe.find((p: any) => p.text.startsWith('مرحباً'));
    const en = probe.find((p: any) => p.text.startsWith('Hello'));
    check('every paragraph carries dir="auto"', probe.length > 0 && probe.every((p: any) => p.dirAttr === 'auto'));
    check('the Arabic-with-Latin-name paragraph resolves RTL', ar?.direction === 'rtl', JSON.stringify(ar));
    check('its unicode-bidi isolates the mixed runs (plaintext)', /plaintext/.test(ar?.bidi || ''), ar?.bidi);
    check('an English-with-Arabic-words paragraph resolves LTR', en?.direction === 'ltr', JSON.stringify(en));

    const bubble = await page.$('.joe-message.assistant .joe-message-bubble');
    if (bubble) await bubble.screenshot({ path: `${SHOTS}/bidi-fixed.png` });

    await browser.close(); server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
