/**
 * THE PANELS BELONG TO A SESSION — reported from the field, and correct.
 *
 *   «عند اعطاء بروميت لجلسة اولى ويتم تطبيقها وتشغيل شاشة اللوغز والمتصفح
 *    والبرفيو فيها، ولكن عند الدخول في جلسة دردشة ثانية … الاقى اللوجز
 *    السابق من الجلسة الاولى ما زالت موجودة وكذلك شاشة البرفيو»
 *
 * It was a build defect, not a design: `liveFiles`, `logs`, `problems`,
 * `buildStatus` and `previewUrl` were single global values, and every panel
 * event was applied to whatever conversation happened to be on screen. So a
 * second chat opened wearing the first one's build — and worse, a run still
 * going in session one kept writing into session two and flipping its tabs.
 *
 * This drives the REAL web UI in a REAL browser against the REAL server:
 *   1. a build runs in session one and fills its panels
 *   2. session two is opened — its panels must be EMPTY
 *   3. an event from session one, fired while two is on screen, must not
 *      appear in two and must not steal its tab
 *   4. going back to session one must restore its logs and its preview
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_session_panels.ts
 */
export {};
import http from 'http';
import path from 'path';
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const TITLE_A = 'جلسة البناء الأولى';
const TITLE_B = 'جلسة الدردشة الثانية';

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) {
        console.error(`\n❌ الواجهة غير مبنيّة (${WEB_DIST}) — شغّل: cd web && npm run build`);
        process.exit(1);
    }

    console.log('\n[1] الخادم الحقيقي والواجهة الحقيقية');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const app = createApp();
    const server = http.createServer(app);
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    check('الخادم يعمل ويقدّم الواجهة المبنيّة', port > 0, String(port));

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const consoleErrors: string[] = [];
        page.on('console', (m: any) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 140)); });
        const notFound: string[] = [];
        page.on('response', (r: any) => { if (r.status() === 404) notFound.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
        // The UI reads its identity from localStorage; the server runs with the
        // bypass the other UI proofs use.
        // A REAL token, signed with the server's own secret — the UI and the
        // API are exercised through the same door a person walks through.
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { sub: 'panel-tester', role: 'OWNER', email: 'tester@local', name: 'Tester', picture: '' },
            process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((tok: string) => {
            localStorage.setItem('token', tok);
            localStorage.setItem('user', JSON.stringify({ id: 'panel-tester', name: 'Tester', role: 'OWNER' }));
        }, token);
        // First launch shows the project-setup modal; a person dismisses it.
        const dismissOnboarding = async () => {
            for (const label of ['Set up later', 'لاحقاً', 'لاحقا']) {
                const el = page.getByText(label, { exact: false }).first();
                if (await el.count() && await el.isVisible().catch(() => false)) { await el.click(); await page.waitForTimeout(400); return; }
            }
        };
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await dismissOnboarding();
        check('واجهة جو فُتحت في متصفح حقيقي', await page.locator('body').isVisible());

        // Two REAL sessions, created through the real endpoint the UI uses.
        const create = async (title: string): Promise<string> => {
            const r = await page.evaluate(async (args: any) => {
                const res = await fetch('/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
                    body: JSON.stringify({ title: args.title, kind: 'agent', mode: 'agent' }),
                });
                return await res.json();
            }, { title });
            return String(r?.id || r?._id || r?.session?.id || '');
        };
        const SESSION_A = await create(TITLE_A);
        const SESSION_B = await create(TITLE_B);
        check('جلستان حقيقيتان أُنشئتا عبر الواجهة البرمجية', !!SESSION_A && !!SESSION_B && SESSION_A !== SESSION_B, `${SESSION_A} / ${SESSION_B}`);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await dismissOnboarding();
        const listed = await page.evaluate(async () => {
            const res = await fetch('/api/sessions?kind=chat,agent', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
            return await res.json();
        });
        console.log('  (الجلسات التي تراها الواجهة:', JSON.stringify(listed).slice(0, 400), ')');

        /**
         * The panels are driven by socket events, so the proof drives them the
         * same way the server does: real broadcast(), real WebSocket, real
         * React state. Nothing is stubbed inside the page.
         */
        const fireInto = async (sessionId: string, files: number) => {
            broadcast({ type: 'run_started', sessionId, data: { sessionId } } as any);
            broadcast({ type: 'build_started', sessionId, data: { tool: 'react_project', sessionId } } as any);
            for (let i = 0; i < files; i++) {
                broadcast({
                    type: 'file_stream', sessionId,
                    data: { file: `src/file-${sessionId}-${i}.jsx`, chunk: `// ${sessionId} #${i}\n`, done: true, bytes: 20, at: Date.now(), label: 'مكتوب', sessionId },
                } as any);
            }
            broadcast({ type: 'preview_ready', sessionId, data: { url: `http://localhost:${port}/project-preview/${sessionId}/index.html`, sessionId } } as any);
            await page.waitForTimeout(600);
        };

        // Switching sessions the way a person does: clicking the chip.
        const openSession = async (title: string) => {
            const chip = page.getByText(title, { exact: false }).first();
            try { await chip.click({ timeout: 8000 }); }
            catch {
                await page.screenshot({ path: '/tmp/joe-panels-debug.png', fullPage: true });
                console.error('  (لقطة للتشخيص: /tmp/joe-panels-debug.png)');
                console.error('  النص الظاهر:', (await page.evaluate(() => document.body.innerText)).slice(0, 600));
                throw new Error('session chip not clickable: ' + title);
            }
            await page.waitForTimeout(800);
        };
        const openLogs = async () => {
            const tab = page.getByText('Logs', { exact: false }).first();
            if (await tab.count()) { await tab.click().catch(() => { }); await page.waitForTimeout(400); }
        };
        const panelText = async () => {
            await openLogs();
            // Only the workspace side — the chat transcript is a separate concern.
            return await page.evaluate(() => {
                const el = document.querySelector('[data-workspace-panel], .workspace-panel, main') || document.body;
                return (el as HTMLElement).innerText || '';
            });
        };

        console.log('\n[2] بناء في الجلسة الأولى يملأ لوحاتها');
        await openSession(TITLE_A);
        await fireInto(SESSION_A, 3);
        const logsA = await panelText();
        check('ملفات الجلسة الأولى ظهرت في اللوجز', logsA.includes(`file-${SESSION_A}-0`), logsA.slice(0, 120));

        console.log('\n[3] الجلسة الثانية تفتح نظيفة — لا لوجز ولا برفيو من الأولى');
        await openSession(TITLE_B);
        const bodyB = await panelText();
        check('لا أثر لملفات الجلسة الأولى', !bodyB.includes(`file-${SESSION_A}-0`), bodyB.slice(0, 160));

        console.log('\n[4] وحدثٌ من الجلسة الأولى بينما نحن في الثانية لا يقتحمها');
        await fireInto(SESSION_A, 1);
        const bodyB2 = await panelText();
        check('حدث الجلسة الأولى لم يظهر في الثانية', !bodyB2.includes(`file-${SESSION_A}-0`), bodyB2.slice(0, 160));

        console.log('\n[5] وبناء الجلسة الثانية يملأ لوحاتها هي');
        await fireInto(SESSION_B, 2);
        const bodyB3 = await panelText();
        check('ملفات الجلسة الثانية ظهرت', bodyB3.includes(`file-${SESSION_B}-0`), bodyB3.slice(0, 160));
        check('ولا ملفات من الأولى معها', !bodyB3.includes(`file-${SESSION_A}-`), bodyB3.slice(0, 160));

        console.log('\n[6] وشاشة البرفيو تتبع جلستها هي');
        const previewSrc = async () => {
            const tab = page.getByText('Preview', { exact: false }).first();
            if (await tab.count()) { await tab.click().catch(() => { }); await page.waitForTimeout(500); }
            return await page.evaluate(() => {
                const f = document.querySelector('iframe[src*="project-preview"]') as HTMLIFrameElement | null;
                return f?.src || '';
            });
        };
        const srcB = await previewSrc();
        check('برفيو الجلسة الثانية يشير إلى مشروعها', srcB.includes(SESSION_B) && !srcB.includes(SESSION_A), srcB || '(لا إطار)');

        console.log('\n[7] والعودة إلى الأولى تُرجع لوحاتها كما تركتها');
        await openSession(TITLE_A);
        const backA = await panelText();
        check('لوجز الجلسة الأولى عادت', backA.includes(`file-${SESSION_A}-`), backA.slice(0, 160));
        check('ولا ملفات من الثانية تسرّبت إليها', !backA.includes(`file-${SESSION_B}-`), backA.slice(0, 160));
        const srcA = await previewSrc();
        check('وبرفيو الجلسة الأولى عاد إلى مشروعها', srcA.includes(SESSION_A) && !srcA.includes(SESSION_B), srcA || '(لا إطار)');

        // The panels are the subject; a missing optional asset is reported by
        // name rather than hidden behind a green tick.
        // The two /project-preview/ 404s are this proof's own invention — it
        // broadcasts preview URLs for projects that were never built, precisely
        // to watch WHICH url each session's frame loads. Anything else is real.
        const realMisses = [...new Set(notFound)].filter(u => !/^\/project-preview\//.test(u));
        check('ولا طلب مفقود (404) حقيقي في الواجهة', realMisses.length === 0, realMisses.slice(0, 4).join(', '));
        check('ولا خطأ كونسول غير الـ404', consoleErrors.filter(e => !/404|Failed to load resource/.test(e)).length === 0,
            consoleErrors.filter(e => !/404/.test(e)).slice(0, 2).join(' | '));
    } finally {
        await browser.close();
        server.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
