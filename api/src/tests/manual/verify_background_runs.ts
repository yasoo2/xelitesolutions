/**
 * A CONVERSATION KEEPS WORKING WHILE YOU LOOK AT ANOTHER ONE.
 *
 * Reported from the field as the worst defect of the batch: «عند فتح جلسة
 * وتشغيل بروميت وأثناء ما جو يعمل فيها فاذهب الى جلسة اخرى ومن ثم ارجع الى
 * الجلسة السابقة فانها تكون قد توقفت ولم تكمل مهمتها».
 *
 * The run never stopped. `POST /api/runs/start` dispatches AgentLoopService
 * WITHOUT awaiting it and answers immediately, so the work continues on the
 * server no matter what the browser shows. What stopped was the UI's memory
 * of it: every panel consumer filtered socket events by the conversation on
 * screen and DISCARDED the rest, so returning restored the snapshot from the
 * moment he left. A frozen panel and a dead task look identical, so calling
 * it stopped was the correct reading of what he could see.
 *
 * This drives the REAL UI in a REAL browser:
 *   [2] a run starts in session A and its chip shows it is working
 *   [3] he switches to B — A's chip still shows it working, and B stays clean
 *   [4] A keeps producing while he is away, and returning shows that work,
 *       not the snapshot from when he left
 *   [5] two sessions run at once, and both are marked
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_background_runs.ts
 */
export {};
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.JOE_CHAT_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-bg-store-'));

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) { console.error('❌ الواجهة غير مبنيّة'); process.exit(1); }

    console.log('\n[1] خادم جو الحقيقي وجلستان حقيقيتان');
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
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const jwt = require('jsonwebtoken');
        const tok = jwt.sign({ sub: 'u1', role: 'OWNER', email: 't@l', name: 'T', picture: '' }, process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((t: string) => {
            localStorage.setItem('token', t);
            localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'T', role: 'OWNER' }));
        }, tok);
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        for (const l of ['Set up later', 'لاحقاً', 'لاحقا']) {
            const e = page.getByText(l, { exact: false }).first();
            if (await e.count() && await e.isVisible().catch(() => false)) { await e.click(); await page.waitForTimeout(400); break; }
        }

        const mk = async (title: string) => page.evaluate(async (ti: string) => {
            const r = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify({ title: ti, kind: 'agent', mode: 'agent' }),
            });
            const j = await r.json();
            return String(j?.id || j?._id || '');
        }, title);
        const A = await mk('جلسة البناء أ');
        const B = await mk('جلسة الدردشة ب');
        check('جلستان أُنشئتا', !!A && !!B && A !== B, `${A} / ${B}`);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1800);
        for (const l of ['Set up later', 'لاحقاً', 'لاحقا']) {
            const e = page.getByText(l, { exact: false }).first();
            if (await e.count() && await e.isVisible().catch(() => false)) { await e.click(); await page.waitForTimeout(400); break; }
        }

        const openSession = async (title: string) => {
            await page.evaluate((ti: string) => {
                const el = [...document.querySelectorAll('*')].find(
                    (n: any) => n.children.length === 0 && (n.textContent || '').trim() === ti);
                let node: any = el;
                for (let i = 0; i < 5 && node; i++) { if (node.onclick || node.getAttribute?.('role') === 'button') break; node = node.parentElement; }
                (node || el)?.click?.();
            }, title);
            await page.waitForTimeout(900);
        };
        const dots = async () => page.evaluate(() => {
            const out: Record<string, boolean> = {};
            document.querySelectorAll('.session-live-dot').forEach((d: any) => {
                const chip = d.parentElement;
                const label = (chip?.textContent || '').trim();
                out[label] = true;
            });
            return out;
        });

        console.log('\n[2] تشغيل يبدأ في «أ» — والنقطة تظهر عليها');
        await openSession('جلسة البناء أ');
        broadcast({ type: 'run_started', sessionId: A, data: { sessionId: A } } as any);
        await page.waitForTimeout(700);
        const d1 = await dots();
        check('نقطة العمل ظهرت على جلسة «أ»', Object.keys(d1).some(k => k.includes('البناء')), JSON.stringify(d1));

        console.log('\n[3] ينتقل إلى «ب» — و«أ» ما تزال معلَّمة');
        await openSession('جلسة الدردشة ب');
        const d2 = await dots();
        check('«أ» ما زالت معلَّمة وهو في «ب»', Object.keys(d2).some(k => k.includes('البناء')), JSON.stringify(d2));
        check('و«ب» ليست معلَّمة', !Object.keys(d2).some(k => k.includes('الدردشة')), JSON.stringify(d2));

        console.log('\n[4] «أ» تُكمل عملها في الخلفية — والعودة تُظهر ما جرى');
        // Files written while he is looking at B. These used to be dropped.
        for (let i = 1; i <= 3; i++) {
            broadcast({
                type: 'file_stream', sessionId: A,
                data: { sessionId: A, file: `src/background-${i}.jsx`, chunk: `// كُتب أثناء غيابه ${i}\n`, done: true, bytes: 40, at: Date.now(), label: 'مكتوب' },
            } as any);
        }
        await page.waitForTimeout(800);
        const bLeak = await page.evaluate(() => (document.body.innerText || '').includes('background-'));
        check('ولم تتسرّب إلى «ب» وهو فيها', !bLeak);

        broadcast({ type: 'run_finished', sessionId: A, data: { sessionId: A, ok: true } } as any);
        await page.waitForTimeout(600);
        const d3 = await dots();
        check('وعند انتهائها تختفي النقطة', !Object.keys(d3).some(k => k.includes('البناء')), JSON.stringify(d3));

        await openSession('جلسة البناء أ');
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('joe:workspace-uncollapse')));
        await page.waitForTimeout(1000);
        const back = await page.evaluate(() => document.body.innerText || '');
        const seen = ['background-1', 'background-2', 'background-3'].filter(f => back.includes(f));
        check('والعودة تعرض الملفات الثلاثة التي كُتبت أثناء الغياب', seen.length === 3, `ظهر ${seen.length}/3 — ${JSON.stringify(seen)}`);

        console.log('\n[5] وجلستان تعملان معاً');
        broadcast({ type: 'run_started', sessionId: A, data: { sessionId: A } } as any);
        broadcast({ type: 'run_started', sessionId: B, data: { sessionId: B } } as any);
        await page.waitForTimeout(700);
        const d4 = await dots();
        check('كلتاهما معلَّمتان في الوقت نفسه',
            Object.keys(d4).some(k => k.includes('البناء')) && Object.keys(d4).some(k => k.includes('الدردشة')),
            JSON.stringify(d4));

        console.log('\n[6] والخادم لا ينتظر المتصفح أصلاً');
        const route = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'routes', 'run.ts'), 'utf-8');
        check('التشغيل يُطلق بلا await فيستمر مهما فعل المتصفح', /AgentLoopService\.execute\([\s\S]{0,600}\}\)\.catch\(err => \{/.test(route));
    } finally {
        await browser.close();
        srv.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
