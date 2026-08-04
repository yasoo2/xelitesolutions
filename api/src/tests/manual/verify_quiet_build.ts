/**
 * NOTHING OPENS THAT THE USER DID NOT ASK FOR.
 *
 * Reported three times, and three times I answered without measuring:
 *
 *   «في البداية قام بتشغيل الثيرمال ثم انتقل الى شاشة اللوغز»
 *   «في اثناء البناء تم فتح المتصفح … بدون اي فائده»
 *   «لم يتحسن في شيء وما زالت الثيرمال والمتصفح تفتحان»
 *
 * He was right every time. What I had fixed was one of TWO copies of the
 * auto-switch list (Joe.tsx; CommandComposer.tsx still carried
 * `terminal_manager`), and I had never looked at the two real causes at all:
 *
 *   • the workspace's DEFAULT tab was 'terminal', so a cold load mounted the
 *     terminal panel and booted a shell before he typed anything;
 *   • the browser panel called startStreaming, which called getBrowserSession,
 *     which LAUNCHES a real Chromium — so merely SHOWING the panel opened a
 *     browser window (BROWSER_HEADED) and started a capture loop on a blank
 *     page.
 *
 * This proof does not read the source. It drives the REAL UI in a REAL
 * browser against the REAL server and MEASURES, over a real build:
 *   [2] which tab Joe opens on, and whether a terminal was spawned
 *   [3] every tab the workspace shows during a whole run
 *   [4] whether a Chromium is created just because the panel is watching
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_quiet_build.ts
 */
export {};
import http from 'http';
import path from 'path';
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
// The condition the user actually runs under: a browser window is allowed to
// show. If anything opens one uninvited, this is where it becomes visible.
process.env.BROWSER_HEADED = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) {
        console.error(`\n❌ الواجهة غير مبنيّة (${WEB_DIST}) — شغّل: cd web && npm run build`);
        process.exit(1);
    }

    console.log('\n[1] خادم جو الحقيقي وواجهته المبنيّة');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const app = createApp();
    const server = http.createServer(app);
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    check('الخادم يعمل ويقدّم الواجهة', port > 0, String(port));

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { sub: 'quiet-tester', role: 'OWNER', email: 'tester@local', name: 'Tester', picture: '' },
            process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((tok: string) => {
            localStorage.setItem('token', tok);
            localStorage.setItem('user', JSON.stringify({ id: 'quiet-tester', name: 'Tester', role: 'OWNER' }));
        }, token);
        const dismissOnboarding = async () => {
            for (const label of ['Set up later', 'لاحقاً', 'لاحقا']) {
                const el = page.getByText(label, { exact: false }).first();
                if (await el.count() && await el.isVisible().catch(() => false)) { await el.click(); await page.waitForTimeout(400); return; }
            }
        };

        /* ── [2] the first thing he sees ──────────────────────────────── */
        console.log('\n[2] ما الذي يفتح عليه جو عند التشغيل');
        // Every call to the terminal tool, counted at the door.
        const terminalCalls: string[] = [];
        await page.route('**/api/tools/terminal_manager/execute', async (route: any) => {
            terminalCalls.push(String(route.request().postData() || '').slice(0, 60));
            await route.continue();
        });
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1800);
        await dismissOnboarding();
        await page.waitForTimeout(700);

        /** Which workspace tab is on screen, read from the button that is active. */
        const activeTab = async (): Promise<string> => page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')] as HTMLElement[];
            const names = ['Browser', 'Terminal', 'Preview', 'Logs', 'Problems'];
            for (const b of btns) {
                const raw = (b.textContent || '').trim();
                // The Logs and Problems tabs append a COUNT badge, so their
                // text is «Logs12», not «Logs» — an exact match reported the
                // active tab as «unknown» and hid what was really on screen.
                const label = names.find(n => raw.startsWith(n));
                if (!label) continue;
                const cls = b.className || '';
                const pressed = b.getAttribute('aria-pressed') === 'true';
                if (pressed || /active|on\b|selected/.test(cls)) return label.toLowerCase();
            }
            // Fall back to what is RENDERED: only the active tab's panel exists.
            if (document.querySelector('.xterm, [class*="terminal-panel"]')) return 'terminal';
            if (document.querySelector('[class*="browser-stream"], [class*="embedded-browser"]')) return 'browser';
            return 'unknown';
        });

        const first = await activeTab();
        check('لا يفتح على الطرفية', first !== 'terminal', `التبويب الأول: ${first}`);
        check('ولا يشغّل صدفة قبل أن يطلب المستخدم شيئاً', terminalCalls.length === 0,
            `${terminalCalls.length} نداء terminal_manager عند الإقلاع`);

        /* ── [3] a whole run, sampled ─────────────────────────────────── */
        console.log('\n[3] تشغيل كامل — أيّ تبويب يظهر في كل لحظة');
        const sessionId = await page.evaluate(async () => {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify({ title: 'بناء هادئ', kind: 'agent', mode: 'agent' }),
            });
            const j = await res.json();
            return String(j?.id || j?._id || '');
        });
        check('جلسة حقيقية أُنشئت', !!sessionId, sessionId);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await dismissOnboarding();

        const seen = new Set<string>();
        const sample = setInterval(() => { void activeTab().then(t => seen.add(t)).catch(() => { }); }, 200);

        /**
         * The exact event storm a build produces — the terminal PANEL booting
         * itself, then the build's own tools and its log flood. Sent through
         * the real socket, so the real handlers decide what to show.
         */
        const fire = (type: string, data: any) => broadcast({ type, sessionId, data } as any);
        fire('tool_started', { name: 'execute:terminal_manager', tool: 'terminal_manager' });
        await page.waitForTimeout(400);
        const afterPanelBoot = await activeTab();
        check('لوحة الطرفية وهي تُقلع نفسها لا تخطف الشاشة', afterPanelBoot !== 'terminal', afterPanelBoot);

        fire('build_started', { brand: 'اختبار' });
        await page.waitForTimeout(400);
        for (let i = 0; i < 12; i++) { fire('terminal_output', { line: `[build] step ${i}` }); }
        await page.waitForTimeout(600);
        const duringBuild = await activeTab();
        check('وأثناء البناء تبقى الشاشة على اللوغز', duringBuild === 'logs', duringBuild);

        fire('preview_ready', { url: `/project-preview/${sessionId}/index.html` });
        await page.waitForTimeout(800);
        for (let i = 0; i < 12; i++) { fire('terminal_output', { line: `[done] flush ${i}` }); }
        await page.waitForTimeout(700);
        clearInterval(sample);

        check('ولم يُفتح تبويب المتصفح ولا مرة طوال التشغيل', !seen.has('browser'), [...seen].join(', '));
        check('ولا الطرفية', !seen.has('terminal'), [...seen].join(', '));
        check('ونهاية البناء تعرض المعاينة لا الطرفية', (await activeTab()) !== 'terminal');

        /* ── [4] the browser that opened itself ───────────────────────── */
        console.log('\n[4] لوحة المتصفح لا تفتح متصفحاً لمجرد أنها ظاهرة');
        const mgr = require('../../modules/browser/manager');
        const before = mgr.liveBrowserSessionCount();
        // This is the exact call the ws hub makes when the panel appears.
        mgr.startStreaming('panel-browser');
        await new Promise(r => setTimeout(r, 2500));
        const after = mgr.liveBrowserSessionCount();
        check('مشاهدة اللوحة لا تُنشئ جلسة متصفح', after === before, `${before} → ${after}`);
        check('ولا نافذة Chromium واحدة فُتحت', after === before);
    } finally {
        await browser.close();
        server.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
