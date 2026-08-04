/**
 * ONE SENTENCE FROM A USER, ALL THE WAY THROUGH — AND BACK.
 *
 * Everything this session touched meets here, in the only test that matters to
 * the person using Joe: they type a sentence and read a reply.
 *
 *   «افحص الروابط المكسورة في <موقعي>»
 *
 * The chain: the real HTTP entry the chat box posts to → the planner → the
 * capability router that picks the tool → a real Chromium on a real page → the
 * answer composer → the run's owner → the WebSocket frame the browser renders.
 * No stubs anywhere. The assertion is the sentence the user would actually see,
 * and it must NAME THE BROKEN LINK — not «تم», not a JSON object, not a
 * description of what could be done.
 *
 * It also measures the thing nobody measures: how long that takes when the
 * local brain is unreachable, which is the state a laptop is often in.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_user_journey_browser.ts
 */
export {};
import http from 'http';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.BROWSER_HEADLESS = 'true';
process.env.BROWSER_NO_SANDBOX = 'true';
process.env.JOE_NARRATION = '0';
process.env.ENABLE_AUTH_BYPASS = 'false';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const USER = 'ccccccccccccccccccccccc3';
const SESSION = `journey-${Date.now()}`;

const SITE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>موقع الاختبار</title></head><body>
<h1>مرحباً</h1>
<a href="/alive.html">رابط سليم</a>
<a href="/broken-page-xyz">رابط مكسور</a>
</body></html>`;

async function main() {
    const site = http.createServer((req, res) => {
        const u = String(req.url || '/').split('?')[0];
        if (u === '/alive.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<h1>حيّ</h1>'); }
        if (u === '/broken-page-xyz') { res.writeHead(404); return res.end('nope'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(SITE);
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const siteUrl = `http://127.0.0.1:${(site.address() as any).port}/`;

    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server as any);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const token = jwt.sign({ sub: USER, role: 'USER', email: 'journey@joe.local' }, process.env.JWT_SECRET!);

    // The user's own socket — the one the chat window keeps open.
    const mine = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    const frames: any[] = [];
    mine.on('message', d => { try { frames.push(JSON.parse(d.toString())); } catch { /* binary */ } });
    await new Promise<void>((res, rej) => { mine.once('open', () => res()); mine.once('error', rej); });

    // A second signed-in user, watching. They must see NOTHING of this run.
    const otherToken = jwt.sign({ sub: 'ddddddddddddddddddddddd4', role: 'USER' }, process.env.JWT_SECRET!);
    const other = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${otherToken}`);
    const otherFrames: any[] = [];
    other.on('message', d => { try { otherFrames.push(JSON.parse(d.toString())); } catch { /* binary */ } });
    await new Promise<void>((res, rej) => { other.once('open', () => res()); other.once('error', rej); });

    console.log(`\nالموقع تحت الفحص: ${siteUrl}`);
    console.log('الطلب: «افحص الروابط المكسورة في هذا الموقع»\n');

    const started = Date.now();
    const posted = await fetch(`http://127.0.0.1:${port}/api/run/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `افحص الروابط المكسورة في ${siteUrl}`, sessionId: SESSION, language: 'ar' }),
    }).then(r => ({ status: r.status })).catch(e => ({ status: 0, error: String(e) })) as any;
    check('الطلب قُبل من المدخل الحقيقي الذي تستعمله نافذة المحادثة', posted.status >= 200 && posted.status < 300,
        JSON.stringify(posted));

    // Wait for the reply the chat window renders.
    const deadline = Date.now() + 180000;
    const replyOf = () => frames.filter(f => f?.type === 'text').map(f => String(f?.data?.text || '')).join('\n');
    while (Date.now() < deadline && !replyOf()) await new Promise(r => setTimeout(r, 500));
    const reply = replyOf();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\n———— ما يقرؤه المستخدم بعد ${seconds}s ————\n${reply || '(لا شيء)'}\n————————————————\n`);

    check('وصل ردّ إلى نافذة المحادثة أصلاً', !!reply, `انتظرتُ ${seconds}s`);
    check('الردّ يسمّي الرابط المكسور — لا وصفاً لما يمكن عمله',
        /broken-page-xyz/.test(reply), reply.slice(0, 200));
    check('ويذكر أنه 404 أو «مكسور»', /404|مكسور/.test(reply), reply.slice(0, 200));
    check('وليس كائن JSON ولا كلمة «تم» وحدها',
        !/^[[{]/.test(reply.trim()) && reply.trim() !== 'تم.' && reply.trim().length > 20, reply.slice(0, 120));
    check('والرابط السليم لم يُتَّهم ظلماً', !/alive\.html.*(?:404|مكسور)/.test(reply));
    check('وانتهى التشغيل رسمياً (توقّف مؤشّر الانتظار)',
        frames.some(f => f?.type === 'run_finished'), JSON.stringify(frames.map(f => f?.type).slice(-6)));

    console.log('[العزل] والمستخدم الآخر المتصل طوال الوقت:');
    // Judged strictly: ANY frame that carries this run's session, or the site
    // being inspected, or the name of a tool that ran — not a chosen shortlist
    // of event types. The lenient version passed while step_started,
    // tool_started, tool_done and department_status were still going to
    // everyone.
    const mineIds = [SESSION, siteUrl, 'browser_check_links'];
    const leaked = otherFrames.filter(f => {
        const s = (() => { try { return JSON.stringify(f); } catch { return ''; } })();
        return mineIds.some(k => s.includes(k));
    });
    check('لم يصله أيّ إطار يخصّ هذا التشغيل — لا ردّاً ولا اسم أداة ولا حالة قسم',
        leaked.length === 0,
        JSON.stringify(leaked.map(f => f?.type)).slice(0, 200));
    console.log(`      (استقبل ${otherFrames.length} إطاراً عاماً، منها ${leaked.length} يخصّ هذا التشغيل)`);

    console.log(`\n(زمن الردّ الكامل والدماغ المحلّي غير متاح: ${seconds}s)`);

    try { mine.close(); other.close(); } catch { /* closing is best effort */ }
    server.close(); site.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
