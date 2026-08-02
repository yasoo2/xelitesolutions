/**
 * E2E WIRE PROOF — the send button the user chose («حلقة التقدّم», proposal
 * #2) and the per-mode accent palettes, measured on the REAL app: api +
 * built web UI + real Chromium.
 *
 *   1. Idle: 30px circle, solid emerald, arrow — not the old 38px slab.
 *   2. Send → busy: the fill drops, a track ring + running arc appear
 *      (the button IS the progress indicator), small accent stop square.
 *   3. Settings → appearance: clicking the GOLD swatch under the dark mode
 *      recolours the live UI instantly (html[data-accent="gold"]).
 *   4. Light mode keeps its OWN accent (ice) independently, and both
 *      choices survive a full page reload.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_send_button_accents.ts
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

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    (AgentLoopService as any).execute = async (_goal: string, options: any) => {
        // Stay "busy" long enough to photograph the progress ring.
        await new Promise(r => setTimeout(r, 6000));
        const { broadcast } = await import('../../api/ws');
        broadcast({ type: 'text', sessionId: options.sessionId, data: { text: 'تم.', sessionId: options.sessionId } } as any);
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
    const token = jwt.sign({ sub: 'e2e', role: 'OWNER', email: 'y@example.com', name: 'Younes', exp: Math.floor(Date.now() / 1000) + 3600 }, 'x');

    const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const ws: any = await (await fetch(`${origin}/api/workspaces`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'E2E' }) })).json();
    const wsId = ws?._id || ws?.id;
    if (wsId) await fetch(`${origin}/api/workspaces/${wsId}`, { method: 'PUT', headers: auth, body: JSON.stringify({ projectInitialized: true }) });

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
    const exe = '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Headless Chromium reports prefers-color-scheme: light — pin the dark
    // theme so the run matches the user's machine.
    // Pin dark ONLY on first load (headless Chromium reports light OS scheme);
    // later steps flip the theme themselves and must not be overwritten.
    await ctx.addInitScript(`try { localStorage.setItem('token', ${JSON.stringify(token)}); if (!localStorage.getItem('joe-theme')) localStorage.setItem('joe-theme', 'dark'); } catch (e) {}`);
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => console.log('[pageerror]', e.message.slice(0, 160)));

    const btnStyle = () => page.evaluate(() => {
        const b = document.querySelector('.joe-chat-input-area .send-btn') as HTMLElement;
        if (!b) return null;
        const cs = getComputedStyle(b);
        const after = getComputedStyle(b, '::after');
        const r = b.getBoundingClientRect();
        return {
            w: Math.round(r.width), h: Math.round(r.height),
            radius: cs.borderRadius, bg: cs.backgroundColor,
            svgColor: b.querySelector('svg') ? getComputedStyle(b.querySelector('svg')!).color : '',
            arcColor: after.borderTopColor, arcAnim: after.animationName,
            busy: b.classList.contains('is-busy'),
        };
    });
    const shoot = async (name: string) => {
        const el = await page.$('.joe-chat-input-area');
        if (el) await el.screenshot({ path: `${SHOTS}/${name}` });
    };

    // ── 1. Idle, dark, emerald ─────────────────────────────────────────
    console.log('\n[1] idle — the 30px emerald circle');
    await page.goto(`${origin}/joe`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.joe-chat-input-area .send-btn', { timeout: 20000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll('.dialog-overlay').forEach(d => ((d as HTMLElement).style.display = 'none')));
    let s = await btnStyle();
    check('size is 30×30 (was 38×38)', !!s && s.w === 30 && s.h === 30, JSON.stringify({ w: s?.w, h: s?.h }));
    check('shape is a circle', !!s && parseFloat(s.radius) >= 15, s?.radius);
    check('idle fill is emerald', !!s && s.bg === 'rgb(52, 196, 139)', s?.bg);
    check('arrow ink is the dark on-accent', !!s && s.svgColor === 'rgb(5, 19, 13)', s?.svgColor);
    await shoot('btn-idle-dark.png');

    // ── 2. Busy: the button becomes the progress ring ──────────────────
    console.log('\n[2] busy — track ring + running arc + stop square');
    await page.fill('.joe-chat-input-area textarea, .joe-chat-input-area .main-input', 'اختبار حالة العمل');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.joe-chat-input-area .send-btn.is-busy', { timeout: 8000 });
    await page.waitForTimeout(400);
    s = await btnStyle();
    check('busy fill is transparent', !!s && (s.bg === 'rgba(0, 0, 0, 0)' || s.bg === 'transparent'), s?.bg);
    check('running arc carries the accent', !!s && s.arcColor === 'rgb(52, 196, 139)', s?.arcColor);
    check('arc actually spins (animation wired)', !!s && /joe-send-spin/.test(s.arcAnim), s?.arcAnim);
    check('stop square recoloured to the accent', !!s && s.svgColor === 'rgb(52, 196, 139)', s?.svgColor);
    await shoot('btn-busy-dark.png');
    await page.waitForSelector('.joe-chat-input-area .send-btn:not(.is-busy)', { timeout: 15000 });

    // ── 3. Settings → dark GOLD swatch recolours the app live ──────────
    console.log('\n[3] settings — picking gold under the dark mode');
    // Overlays (project-setup dialog) swallow pointer events; clear them and
    // drive the header menu by direct DOM clicks — the assertion target is
    // the SWATCH and what it does to the live palette, not the menu chrome.
    await page.evaluate(() => document.querySelectorAll('.dialog-overlay').forEach(d => ((d as HTMLElement).style.display = 'none')));
    console.log('  [dbg] overlays cleared, clicking trigger…');
    await page.evaluate(() => (document.querySelector('.joe-user-trigger') as HTMLElement)?.click());
    console.log('  [dbg] trigger clicked, waiting for menu…');
    await page.waitForSelector('.joe-user-menu', { timeout: 5000 });
    console.log('  [dbg] menu open');
    const clicked = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.joe-user-menu-item'));
        const el = items.find(i => /الإعدادات|Settings/i.test(i.textContent || '')) as HTMLElement;
        if (el) { el.click(); return el.textContent?.trim(); }
        return null;
    });
    console.log('  [dbg] settings item clicked:', JSON.stringify(clicked));
    await page.waitForTimeout(800);
    const post = await page.evaluate(() => ({
        stgAny: Array.from(document.querySelectorAll('[class*="stg"]')).slice(0, 6).map(e => e.className),
        dialogs: Array.from(document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="overlay"]')).slice(0, 6).map(e => e.className),
    }));
    console.log('  [dbg] post-click DOM:', JSON.stringify(post));
    await page.waitForSelector('.stg-nav-item', { timeout: 8000 });
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.stg-nav-item')).map(i => (i.textContent || '').trim().slice(0, 40)));
    console.log('  [dbg] settings tabs:', JSON.stringify(tabs));
    await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.stg-nav-item'));
        (items.find(i => /المظهر|Appearance/i.test(i.textContent || '')) as HTMLElement)?.click();
    });
    await page.waitForSelector('[data-accent-id="dark-gold"]', { timeout: 8000 });
    await page.click('[data-accent-id="dark-gold"]');
    // Outwait the button's 0.2s background transition before sampling.
    await page.waitForTimeout(900);
    const accentAttr = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
    check('html carries data-accent="gold"', accentAttr === 'gold', String(accentAttr));
    s = await btnStyle();
    check('send button turned XELITE gold instantly', !!s && s.bg === 'rgb(227, 182, 90)', s?.bg);
    // Close the dialog for a clean shot.
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('.stg-overlay, .dialog-overlay, [class*="settings-overlay"]').forEach(d => (d as HTMLElement).style.display = 'none'));
    await page.waitForTimeout(200);
    await shoot('btn-idle-gold.png');

    // ── 4. Light mode keeps its OWN accent + both survive reload ───────
    console.log('\n[4] light mode accent is independent, and choices persist');
    await page.evaluate(() => {
        localStorage.setItem('joe-theme', 'light');
        localStorage.setItem('joe-accent-light', 'ice');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.joe-chat-input-area .send-btn', { timeout: 20000 });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        accent: document.documentElement.getAttribute('data-accent'),
    }));
    check('light theme active', state.theme === 'light', String(state.theme));
    check('light mode wears ITS accent (ice), not the dark one (gold)', state.accent === 'ice', String(state.accent));
    s = await btnStyle();
    check('button is the light-mode ice blue', !!s && s.bg === 'rgb(45, 111, 168)', s?.bg);
    check('arrow ink flipped to white for the light accents', !!s && s.svgColor === 'rgb(255, 255, 255)', s?.svgColor);
    await page.evaluate(() => document.querySelectorAll('.dialog-overlay').forEach(d => ((d as HTMLElement).style.display = 'none')));
    await page.waitForTimeout(200);
    await shoot('btn-idle-light-ice.png');
    // Back to dark: the gold choice must still be there.
    await page.evaluate(() => localStorage.setItem('joe-theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.joe-chat-input-area .send-btn', { timeout: 20000 });
    await page.waitForTimeout(800);
    const back = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
    check('dark mode remembered ITS gold across reloads', back === 'gold', String(back));

    await browser.close();
    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
