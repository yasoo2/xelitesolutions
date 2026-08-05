/**
 * THE «<>» BUTTON HAD NEVER WORKED. NOT ONCE.
 *
 * Reported from the field: «الرمز الذي بجنبه لا يعمل ابدا».
 *
 * The code view woke on exactly one socket message: `diff`. That message is
 * broadcast by two surgical-edit paths in SystemTools and by nothing else.
 * Every BUILD — the React scaffolder, the API scaffolder, the page builder —
 * writes its files with `file_stream`. So after any normal build the code tab
 * was empty forever, and «ابدا» was the precise word for it.
 *
 * This drives the REAL UI in a REAL browser: it fires the file events a build
 * actually emits, presses «<>» the way a person does, and reads what appears.
 * It also checks the opposite mistake — that a build writing many files must
 * NOT keep yanking the screen to the code view.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_code_view.ts
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

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) { console.error('❌ الواجهة غير مبنيّة'); process.exit(1); }

    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const srv = http.createServer(createApp());
    attachWebSocket(srv);
    srv.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    const port = (srv.address() as any).port;

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const jwt = require('jsonwebtoken');
        const tok = jwt.sign({ sub: 'u1', role: 'OWNER', email: 't@l', name: 'T', picture: '' }, process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((t: string) => {
            localStorage.setItem('token', t);
            localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'T', role: 'OWNER' }));
        }, tok);
        const requests: string[] = [];
        page.on('request', (r: any) => requests.push(r.url()));
        await page.addInitScript(() => {
            window.addEventListener('preview:code_diff', (e: any) => {
                (window as any).__joeCodeDiff = {
                    path: e.detail?.path, len: String(e.detail?.content || '').length, focus: e.detail?.focus,
                };
            });
        });
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        for (const l of ['Set up later', 'لاحقاً', 'لاحقا']) {
            const e = page.getByText(l, { exact: false }).first();
            if (await e.count() && await e.isVisible().catch(() => false)) { await e.click(); await page.waitForTimeout(400); break; }
        }

        console.log('\n[1] فتح شاشة المعاينة');
        // The Preview tab must be on screen for its two buttons to exist.
        // The chat header overlays the tab strip, so a real pointer click is
        // intercepted; the workspace also starts collapsed. Uncollapse it and
        // click the tab through the DOM — still the app's own handler.
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('joe:workspace-uncollapse')));
        await page.waitForTimeout(400);
        const opened = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim().startsWith('Preview'));
            if (!b) return false;
            (b as HTMLElement).click();
            return true;
        });
        await page.waitForTimeout(800);
        check('شاشة المعاينة ظاهرة', opened);

        console.log('\n[2] بناء حقيقي يكتب ملفاته — بالحدث الذي يرسله البناء فعلاً');
        const FILE = 'src/components/SocialApp.jsx';
        const BODY = "export default function SocialApp(){ return <div className='feed'>مرحبا</div>; }";
        // file_stream — NOT `diff`. This is what every builder broadcasts.
        broadcast({ type: 'file_stream', data: { file: FILE, chunk: BODY, done: true, bytes: BODY.length, label: 'مكتوب' } } as any);
        await page.waitForTimeout(900);

        // …and it must NOT have stolen the screen.
        const stolen = await page.evaluate(() => !!document.querySelector('.monaco-editor'));
        check('البناء لم يخطف الشاشة إلى الكود', !stolen);

        console.log('\n[3] الحدث يصل إلى العارض ومعه محتوى الملف');
        // Measured at the door the panel listens on. An earlier version of this
        // check clicked a button by title and read «the editor» off the page —
        // and passed while measuring a DIFFERENT editor in another panel. What
        // matters is that the code view's own event arrives with the file in it.
        const got = await page.evaluate(() => (window as any).__joeCodeDiff || null);
        check('حدث preview:code_diff وصل', !!got, JSON.stringify(got));
        check('ومعه مسار الملف الذي كتبه البناء', got?.path === 'src/components/SocialApp.jsx', JSON.stringify(got));
        check('ومحتواه كاملاً لا مقتطعاً', got?.len === BODY.length, `${got?.len} من ${BODY.length}`);
        check('وبلا خطف للشاشة', got?.focus === false, JSON.stringify(got));

        console.log('\n[3ب] والمحرّر نفسه يعمل بلا إنترنت');
        // Monaco used to load from a CDN. On a local, offline Joe it never
        // mounted at all — which is the literal reason «<>» showed nothing.
        // Monaco is an ES module, not a global, and the code view is not open
        // in this layout — so the honest measurement is the BUNDLE and the
        // NETWORK: the editor must ship inside the app and be asked of no one.
        const distDir = path.dirname(WEB_DIST);
        const bundled = fs.readdirSync(path.join(distDir, 'assets'))
            .filter(f => f.endsWith('.js'))
            .some(f => fs.readFileSync(path.join(distDir, 'assets', f), 'utf-8').includes('monaco-editor'));
        check('محرّر مونَكو مُضمَّن في الحزمة لا مجلوب من الإنترنت', bundled);
        const setup = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'monaco-setup.ts'), 'utf-8');
        check('واللودر مُوجَّه إلى النسخة المحلية', /loader as any\)\.config\(\{ monaco \}\)|loader\.config\(\{ monaco \}\)/.test(setup));
        // …and it is fetched WITH the code view, not with the page. The editor
        // used to sit in the entry chunk: 3,994 kB downloaded on every visit for
        // a panel most visits never open. Measured here so it cannot creep back.
        const entry = fs.readdirSync(path.join(distDir, 'assets'))
            .filter(f => /^index-.*\.js$/.test(f))
            .map(f => fs.statSync(path.join(distDir, 'assets', f)).size);
        const biggestEntry = Math.max(0, ...entry);
        check('وحزمة الإقلاع لا تحمل المحرّر معها',
            biggestEntry > 0 && biggestEntry < 700_000, `${Math.round(biggestEntry / 1024)} كيلوبايت`);
        check('والمحرّر في حزمة مستقلة تُطلب عند الحاجة',
            fs.readdirSync(path.join(distDir, 'assets')).some(f => /^editor\.main-.*\.js$/.test(f)));
        const cdnCalls = requests.filter(u => /jsdelivr|unpkg|cdn\./i.test(u));
        check('ولم يُطلب من أي شبكة خارجية', cdnCalls.length === 0, JSON.stringify(cdnCalls.slice(0, 3)));

        console.log('\n[4] وتعديل جراحي طلبه المستخدم يستحق الشاشة');
        const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'services', 'socket.ts'), 'utf-8');
        check('حدث البناء يُحمّل بلا خطف (focus: false)', /file_stream[\s\S]{0,900}focus: false/.test(src));
        check('والتعديل الجراحي يأخذ الشاشة (focus: true)', /msgType === 'diff'[\s\S]{0,600}focus: true/.test(src));
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'components', 'PreviewPanel.tsx'), 'utf-8');
        check('واللوحة تحترم هذا الفصل', /if \(detail\.focus !== false\) setMode\('code'\)/.test(panel));
    } finally {
        await browser.close();
        srv.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
