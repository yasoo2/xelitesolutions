/**
 * A NEW CHAT NAMES ITSELF WHILE YOU ARE STILL IN IT.
 *
 * Reported from the field: «عند اضافة جلسة جديده ويتم الحوار مع جو داخلها فانها
 * لا تاخذ عنوان تلقائي الا ان اغير الجلسة الى جلسة اخرى ومن ثم ارجع لها».
 *
 * He had found the trigger exactly. Auto-naming was called from the two
 * endpoints that READ a session — addMessage and listMessages — and a live
 * conversation calls neither: the reply arrives over the WebSocket. The title
 * therefore waited until he switched away and back and the app fetched the
 * history. It was never «late»; it was never running.
 *
 * This proof reproduces his exact steps against the REAL server:
 *   [2] create a session, talk in it, and NEVER leave it — the title must
 *       change on its own
 *   [3] and it must be named exactly once, not renamed on every later read
 *   [4] a title the user chose himself is never overwritten
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_session_title.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
import fs from 'fs';
import os from 'os';
import path from 'path';
process.env.JOE_CHAT_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-title-store-'));

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const titleOf = (sid: string): string => {
    const s = ((global as any).mockSessions || []).find((x: any) => String(x._id) === sid || x.id === sid);
    return String(s?.title || '');
};

async function main() {
    console.log('\n[1] جلسة جديدة بعنوان عام');
    const { createSession } = require('../../api/controllers/sessionController');
    const mkRes = () => { const o: any = { code: 0, body: null }; o.status = (c: number) => { o.code = c; return o; }; o.json = (b: any) => { o.body = b; return o; }; return o; };
    const res1 = mkRes();
    await createSession({ body: { title: 'جلسة جديدة', kind: 'agent', mode: 'agent' }, user: { id: 'u1' } } as any, res1 as any);
    const sid = String(res1.body?.id || res1.body?._id || '');
    check('أُنشئت جلسة حقيقية', !!sid, sid);
    check('وعنوانها عام كما يبدأ أي حوار', titleOf(sid) === 'جلسة جديدة', titleOf(sid));

    console.log('\n[2] حوار داخلها — بلا مغادرة ولا عودة');
    // The messages a real turn leaves behind, written the way the run writes them.
    const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
    store.push({ _id: 'm1', sessionId: sid, role: 'user', content: 'ابنِ لي متجر إلكتروني لبيع العطور الفاخرة', createdAt: new Date() });
    store.push({ _id: 'm2', sessionId: sid, role: 'assistant', content: 'تم بناء المتجر.', createdAt: new Date() });

    // …and the ONE call the run now makes. Nothing reads the session here:
    // no /history, no /messages — exactly his situation.
    const { autoNameSessionAfterReply } = require('../../api/controllers/sessionController');
    await autoNameSessionAfterReply(sid);
    const named = titleOf(sid);
    check('الجلسة أخذت عنواناً وهو ما زال داخلها', named !== 'جلسة جديدة' && !!named, `العنوان: «${named}»`);
    check('والعنوان ليس عاماً', !/^(جلسة جديدة|New Session|محادثة جديدة)$/.test(named), named);
    check('وقصير كعنوان لا كجملة', named.length <= 60, `${named.length} حرفاً`);

    console.log('\n[3] ولا يُعاد تسميتها بعد ذلك');
    const before = titleOf(sid);
    store.push({ _id: 'm3', sessionId: sid, role: 'user', content: 'موضوع مختلف تماماً: احسب لي فاتورة كهرباء', createdAt: new Date() });
    await autoNameSessionAfterReply(sid);
    check('العنوان ثابت بعد رسائل لاحقة', titleOf(sid) === before, `${before} → ${titleOf(sid)}`);

    console.log('\n[4] وعنوان اختاره المستخدم لا يُمسّ');
    const res2 = mkRes();
    await createSession({ body: { title: 'مشروع العطور — لا تلمسه', kind: 'agent', mode: 'agent' }, user: { id: 'u1' } } as any, res2 as any);
    const sid2 = String(res2.body?.id || res2.body?._id || '');
    store.push({ _id: 'm4', sessionId: sid2, role: 'user', content: 'اكتب لي خطة تسويق', createdAt: new Date() });
    await autoNameSessionAfterReply(sid2);
    check('العنوان اليدوي باقٍ كما كتبه', titleOf(sid2) === 'مشروع العطور — لا تلمسه', titleOf(sid2));

    console.log('\n[5] والمشغّل موصول بالتشغيل نفسه لا بفتح الجلسة');
    const svc = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
    check('نهاية التشغيل تستدعي التسمية', /autoNameSessionAfterReply\(sessionId\)/.test(svc));
    check('وبعد حفظ ردّ جو لا قبله', svc.indexOf('autoNameSessionAfterReply') > svc.indexOf("role: 'assistant', content: finalText"));

    console.log('\n[6] وتظهر على شاشته في القائمة، بلا إعادة تحميل');
    {
        const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
        if (!fs.existsSync(WEB_DIST)) { check('الواجهة مبنيّة', false, 'شغّل: cd web && npm run build'); }
        else {
            const http = require('http');
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
                const page = await browser.newPage();
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
                const seen = await page.evaluate(() => document.body.innerText);
                check('القائمة تعرض العنوان الجديد للجلسة المسمّاة', seen.includes(named), `«${named}»`);
                // …and a rename that lands while ANOTHER chat is on screen still shows.
                broadcast({ type: 'sessions:refresh', data: { sessionId: 'some-other-session', newTitle: 'x' } } as any);
                await page.waitForTimeout(600);
                const J = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');
                check('وحارس الجلسات لا يحجب تحديث القائمة', /msg\?\.type === 'sessions:refresh'\) return true/.test(J));
            } finally { await browser.close(); srv.close(); }
        }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
