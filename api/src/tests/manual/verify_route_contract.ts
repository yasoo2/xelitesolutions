/**
 * ROUTE CONTRACT — every URL the browser calls must exist on the server.
 *
 * The wiring policy applied to the last unchecked seam: HTTP. Booting the app
 * and probing it with GET proves nothing (Express answers 404 for a POST-only
 * route asked with the wrong verb — 26 healthy routes looked «missing» that
 * way), so the contract is read where it is declared: the mount table in
 * `api/app.ts` and every `router.<method>('…')` in the files it mounts. That
 * map is then held against every `${API}/…` the web app calls.
 *
 * The audit found exactly one hole, and it was a real one: `POST /api/audio/
 * speech` — the voice mode's neural-speech request — was never mounted. This
 * proof boots the REAL server and shows the route now answers, honestly, on
 * a machine with no speech engine configured.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_route_contract.ts
 */
export {};
import http from 'http';
import jwt from 'jsonwebtoken';
import { serverRoutes, uiPaths, unreachableUiPaths, routeRegex } from '../routeMap';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
delete process.env.TTS_BASE_URL;
delete process.env.OPENAI_API_KEY;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    console.log('\n[1] خريطة المسارات تُقرأ من مصدرها، لا من تخمين');
    const routes = serverRoutes();
    const ui = uiPaths();
    check(`الخادم يعلن ${routes.length} مساراً حقيقياً`, routes.length > 100, String(routes.length));
    check(`الواجهة تنادي ${ui.length} مساراً`, ui.length > 40, String(ui.length));
    check('الخريطة تعرف مسارات نعرفها يقيناً (health / agent / sessions)',
        ['/api/health', '/api/agent', '/api/sessions', '/api/sessions/abc/messages', '/api/audio/speech']
            .every(p => routes.some(r => routeRegex(r.path).test(p))),
        routes.filter(r => /health|agent|sessions/.test(r.path)).map(r => r.path).slice(0, 8).join(' | '));

    console.log('\n[2] لا زرّ في الواجهة ينادي مساراً غير موجود');
    const missing = unreachableUiPaths();
    check(`كل مسار تناديه الواجهة مسجّل فعلاً (${ui.length - missing.length}/${ui.length})`,
        missing.length === 0, missing.map(m => `${m.path} ← ${m.file}`).join(' | '));

    console.log('\n[3] خادم جو الحقيقي يقلع، ونسأل المسار الذي كان مفقوداً');
    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    check('الخادم يستمع', port > 0, String(port));

    const token = jwt.sign({ sub: 'route-proof', role: 'OWNER' }, process.env.JWT_SECRET!);
    const probe = async (p: string, method = 'GET', body?: any, auth = true) => {
        const res = await fetch(`http://127.0.0.1:${port}${p}`, {
            method,
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(auth ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
    };

    const noRoute = await probe('/api/audio/definitely-not-a-route', 'POST', { x: 1 });
    check('صفحة 404 الافتراضية ما زالت تُميَّز (شاهد سلبي)', noRoute.status === 404, String(noRoute.status));

    const speech = await probe('/api/audio/speech', 'POST', { text: 'مرحبا يا يونس', voice: 'onyx' });
    check('‎POST /api/audio/speech لم يعد 404 — المسار موجود', speech.status !== 404, String(speech.status));
    check('بلا محرّك نطق يردّ 503 وسبباً مفهوماً بالعربية (فتتحوّل الواجهة فوراً لصوت المتصفّح)',
        speech.status === 503 && speech.json?.error === 'tts_unavailable' && /[؀-ۿ]/.test(String(speech.json?.message || '')),
        `${speech.status} ${speech.text.slice(0, 120)}`);

    const empty = await probe('/api/audio/speech', 'POST', { text: '   ' });
    check('نصّ فارغ يردّ 400 لا انهياراً', empty.status === 400 && empty.json?.error === 'bad_request',
        `${empty.status} ${empty.text.slice(0, 80)}`);

    const anon = await probe('/api/audio/speech', 'POST', { text: 'x' }, false);
    check('بلا توكن يردّ 401 — وهي الحالة التي تعالجها الواجهة بـ handleUnauthorized',
        anon.status === 401, String(anon.status));

    const status = await probe('/api/audio/speech/status');
    check('‎/api/audio/speech/status يقول الحقيقة: لا محرّك، ولا يسرّب مفتاحاً',
        status.status === 200 && status.json?.available === false && !/sk-/.test(status.text),
        `${status.status} ${status.text.slice(0, 120)}`);

    console.log('\n[4] لم نكسر شيئاً في الطريق');
    const health = await probe('/api/health');
    check('‎/api/health ما زال 200', health.status === 200, String(health.status));

    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
