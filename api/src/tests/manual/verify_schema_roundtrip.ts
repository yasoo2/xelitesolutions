/**
 * A ROW GOES IN WHOLE AND COMES BACK WHOLE — ON A REAL SERVER.
 *
 * «اريد نظام حقيقي وليس فقط شغل كلام … بلدر فتاك يبني اي شيء».
 *
 * Until now every generated backend stored name/details/price no matter what
 * the system was about, so a clinic app that posts
 * {name, phone, service, date, time, status} had five of its six fields
 * dropped on every save — silently, with a 201 Created in reply. A full stack
 * whose halves disagree about the data is the definition of «شغل كلام».
 *
 * This boots the GENERATED server (both database backends), posts a real
 * booking over real HTTP, and reads it back field by field.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_schema_roundtrip.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REQUEST = 'ابنِ نظام حجز مواعيد لعيادة أسنان مع قاعدة بيانات وتسجيل دخول';

const req = (method: string, url: string, body?: any, token?: string) => new Promise<any>((resolve) => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
        headers: {
            ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    }, res => {
        let b = ''; res.on('data', d => { b += d; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, body: b }); } });
    });
    r.on('error', (e) => resolve({ status: 0, body: String(e) }));
    if (data) r.write(data);
    r.end();
});

const waitFor = async (url: string, tries = 40) => {
    for (let i = 0; i < tries; i++) {
        const r = await req('GET', url);
        if (r.status === 200) return true;
        await new Promise(res => setTimeout(res, 250));
    }
    return false;
};

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-schema-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `schema-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`schema-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] النظام يُبنى، وجدوله من مخطّط التطبيق نفسه');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const dir = String(api?.output?.path || '');
    check('الخادم مكتوب على القرص', !!dir && fs.existsSync(path.join(dir, 'server.js')), dir || 'لا مجلد');

    const dbSrc = fs.readFileSync(path.join(dir, 'db.js'), 'utf-8');
    for (const col of ['name', 'phone', 'service', 'date', 'time', 'status']) {
        check(`العمود «${col}» موجود في قاعدة البيانات`, new RegExp(`"key":"${col}"`).test(dbSrc));
    }
    check('ولم يعد جدول name/details/price الثابت', !/"key":"details"/.test(dbSrc));

    console.log('\n[2] الخادم الحقيقي يعمل، والصفّ يعود كاملاً — على SQLite');
    const booking = {
        name: 'يونس', phone: '0599123456', service: 'تنظيف أسنان',
        date: '2026-08-20', time: '10:30', status: 'مؤكّد',
    };

    for (const backend of ['sqlite', 'json'] as const) {
        const port = 4300 + Math.floor(Math.random() * 400);
        const { executionEngine } = await import('../../kernel/ExecutionEngine');
        const child = executionEngine.runArgvStreaming('node', ['server.js'], {
            cwd: dir,
            env: { PORT: String(port), ...(backend === 'json' ? { JOE_FORCE_JSON_DB: '1' } : {}) },
        });
        try {
            const base = `http://127.0.0.1:${port}`;
            const up = await waitFor(`${base}/api/health`);
            check(`[${backend}] الخادم أقلع وردّ على /api/health`, up);
            if (!up) continue;

            const health = await req('GET', `${base}/api/health`);
            check(`[${backend}] وهو على القاعدة المتوقّعة`, health.body?.backend === backend, JSON.stringify(health.body));

            // The owner signs in — writes are the owner's business. The password
            // is generated at build time and shown ONCE, in the message Joe
            // prints; it is never written to disk in the clear, which is the
            // point. The proof reads it from that same message.
            const msg = String(api?.output?.message || '');
            const email = String(api?.output?.ownerEmail || (msg.match(/[\w.+-]+@[\w.-]+/) || [''])[0] || '');
            const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';
            const login = await req('POST', `${base}/api/auth/login`, { email, password });
            const token = login.body?.token || '';
            check(`[${backend}] الدخول بحساب المالك نجح`, !!token, JSON.stringify(login.body).slice(0, 120));

            const created = await req('POST', `${base}/api/bookings`, booking, token);
            check(`[${backend}] الحجز أُنشئ (201)`, created.status === 201, `${created.status} ${JSON.stringify(created.body).slice(0, 120)}`);

            const back = await req('GET', `${base}/api/bookings`);
            // the list is keyed by the RESOURCE — «{ ok, bookings: [...] }»
            const rows = back.body?.bookings || back.body?.items || back.body?.data || back.body?.rows || [];
            const row = rows[0] || {};
            let whole = true;
            for (const [k, v] of Object.entries(booking)) {
                if (String(row[k] ?? '') !== String(v)) { whole = false; console.error(`      ↳ ${k}: «${row[k]}» بدل «${v}»`); }
            }
            check(`[${backend}] وكل حقل من الحجز عاد كما أُرسل`, whole, JSON.stringify(row).slice(0, 200));

            const bad = await req('POST', `${base}/api/bookings`, { phone: '05' }, token);
            check(`[${backend}] وحجز بلا اسم يُرفض بـ 400 يسمّي الحقل`, bad.status === 400 && /name_required/.test(JSON.stringify(bad.body)),
                `${bad.status} ${JSON.stringify(bad.body)}`);
        } finally {
            child.kill();
            await new Promise(res => setTimeout(res, 400));
            try { fs.rmSync(path.join(dir, 'data.db'), { force: true }); } catch { /* fine */ }
            try { fs.rmSync(path.join(dir, 'data.json'), { force: true }); } catch { /* fine */ }
        }
    }

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
