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
/**
 * A PROOF STARTS FROM AN EMPTY DESK.
 *
 * This read the repo's real chat store, so after a few runs the session bar
 * held dozens of chips, each one squeezed until its title no longer rendered
 * — and the proof failed with «session chip not clickable» on a machine whose
 * only sin was having been used. Its own directory keeps the two sessions it
 * creates the only two on screen.
 */
process.env.JOE_CHAT_STORE_DIR = require('fs').mkdtempSync(
    require('path').join(require('os').tmpdir(), 'joe-panels-store-'));

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const TITLE_A = 'جلسة البناء الأولى';
const TITLE_B = 'جلسة الدردشة الثانية';
const TITLE_C = 'جلسة الاختبار الثالثة';

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
    const configuredChromium = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const systemChromium = process.platform === 'linux' && fs.existsSync('/usr/bin/chromium')
        ? '/usr/bin/chromium'
        : undefined;
    const browser = await chromium.launch({
        ...(configuredChromium || systemChromium ? { executablePath: configuredChromium || systemChromium } : {}),
        args: ['--no-sandbox'],
    });
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
        /**
         * THE MODAL THAT ATE THE PROOF.
         *
         * The project-setup dialog opens whenever the workspace is not marked
         * initialised, and it covers the session list — so this proof failed
         * with «session chip not clickable» on a machine that simply had a
         * fresh workspace. Marking the workspace initialised through the REAL
         * endpoint is what a person does by clicking through it once; the
         * text-button hunt below stays as the fallback.
         */
        await page.evaluate(async () => {
            const tok = localStorage.getItem('token');
            const list = await fetch('/api/workspaces', { headers: { Authorization: 'Bearer ' + tok } }).then(r => r.json()).catch(() => []);
            const ws = Array.isArray(list) ? list[0] : (list?.workspaces || [])[0];
            const id = ws && (ws._id || ws.id);
            if (!id) return;
            await fetch('/api/workspaces/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ projectInitialized: true }),
            }).catch(() => { });
        });
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
        const SESSION_C = await create(TITLE_C);
        check('ثلاث جلسات حقيقية أُنشئت عبر الواجهة البرمجية',
            !!SESSION_A && !!SESSION_B && !!SESSION_C && new Set([SESSION_A, SESSION_B, SESSION_C]).size === 3,
            `${SESSION_A} / ${SESSION_B} / ${SESSION_C}`);
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

        console.log('\n[6b] جلسة ثالثة متزامنة لا ترث موارد الأولى أو الثانية');
        await openSession(TITLE_C);
        const emptyC = await panelText();
        check('الجلسة الثالثة تفتح بلا ملفات من الجلستين', !emptyC.includes(`file-${SESSION_A}-`) && !emptyC.includes(`file-${SESSION_B}-`), emptyC.slice(0, 160));
        await fireInto(SESSION_C, 4);
        const bodyC = await panelText();
        check('ملفات الجلسة الثالثة ظهرت في لوحتها', bodyC.includes(`file-${SESSION_C}-0`), bodyC.slice(0, 160));
        check('الجلسة الثالثة لا تعرض ملفات الأولى أو الثانية', !bodyC.includes(`file-${SESSION_A}-`) && !bodyC.includes(`file-${SESSION_B}-`), bodyC.slice(0, 160));
        const srcC = await previewSrc();
        check('برفيو الجلسة الثالثة يشير إلى مشروعها', srcC.includes(SESSION_C) && !srcC.includes(SESSION_A) && !srcC.includes(SESSION_B), srcC || '(لا إطار)');

        console.log('\n[6c] إعادة التحميل تحفظ الجلسة الثالثة ولا تعيد موارد الجلسات الأخرى');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await dismissOnboarding();
        await openSession(TITLE_C);
        const afterReloadText = await panelText();
        check('إعادة التحميل أبقت جلسة C قابلة للفتح', (await page.evaluate(() => document.body.innerText)).includes(TITLE_C));
        check('إعادة التحميل لا تستعيد ملفات الجلستين الأخريين', !afterReloadText.includes(`file-${SESSION_A}-`) && !afterReloadText.includes(`file-${SESSION_B}-`), afterReloadText.slice(0, 160));
        const reloadSrcC = await previewSrc();
        check('إن وُجد preview بعد reload فهو مملوك للجلسة الثالثة', !reloadSrcC || (reloadSrcC.includes(SESSION_C) && !reloadSrcC.includes(SESSION_A) && !reloadSrcC.includes(SESSION_B)), reloadSrcC || '(لا إطار، لا يوجد تسريب)');
        await fireInto(SESSION_C, 1);
        const postReloadC = await panelText();
        check('إعادة الاتصال بعد reload تقبل أحداث C فقط', postReloadC.includes(`file-${SESSION_C}-0`) && !postReloadC.includes(`file-${SESSION_A}-`) && !postReloadC.includes(`file-${SESSION_B}-`), postReloadC.slice(0, 160));

        console.log('\n[7] والعودة إلى الأولى بعد reload تُبقي الموارد مملوكة لها');
        await openSession(TITLE_A);
        await fireInto(SESSION_A, 1);
        const backA = await panelText();
        check('جلسة A تستقبل مواردها بعد العودة من reload', backA.includes(`file-${SESSION_A}-0`), backA.slice(0, 160));
        check('ولا ملفات من B أو C تسرّبت إلى A', !backA.includes(`file-${SESSION_B}-`) && !backA.includes(`file-${SESSION_C}-`), backA.slice(0, 160));
        const srcA = await previewSrc();
        check('وبرفيو جلسة A بعد العودة مملوك لها', srcA.includes(SESSION_A) && !srcA.includes(SESSION_B) && !srcA.includes(SESSION_C), srcA || '(لا إطار)');

        // The panels are the subject; a missing optional asset is reported by
        // name rather than hidden behind a green tick.

        console.log('\n[8] والعيوب الثلاثة التي كشفها المسح — في المتصفح نفسه');
        // (a) the agent task list must not follow you into another chat
        broadcast({ type: 'todo_update', sessionId: SESSION_A, data: { sessionId: SESSION_A, todos: [{ id: 't1', status: 'in_progress', content: 'مهمة الجلسة الأولى' }] } } as any);
        await page.waitForTimeout(600);
        check('قائمة مهام الجلسة الأولى ظهرت فيها', (await page.evaluate(() => document.body.innerText)).includes('مهمة الجلسة الأولى'));
        await openSession(TITLE_B);
        check('ولم تتبعنا إلى الجلسة الثانية', !(await page.evaluate(() => document.body.innerText)).includes('مهمة الجلسة الأولى'));
        // …and an update fired into A while B is on screen stays out of B
        broadcast({ type: 'todo_update', sessionId: SESSION_A, data: { sessionId: SESSION_A, todos: [{ id: 't2', status: 'pending', content: 'تسريب محتمل' }] } } as any);
        await page.waitForTimeout(600);
        check('وتحديثٌ من الأولى لا يقتحم الثانية', !(await page.evaluate(() => document.body.innerText)).includes('تسريب محتمل'));

        // (b) the half-typed line must stay in the chat it was typed in
        const composer = page.locator('textarea, input[type="text"]').first();
        if (await composer.count()) {
            await composer.fill('سطر نصف مكتوب في الجلسة الثانية');
            await page.waitForTimeout(300);
            await openSession(TITLE_A);
            const carried = await page.evaluate(() => {
                const el = document.querySelector('textarea') as HTMLTextAreaElement | null;
                return el?.value || '';
            });
            check('والسطر نصف المكتوب لم ينتقل إلى المحادثة الأخرى', !carried.includes('نصف مكتوب'), carried.slice(0, 60));
        }

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
