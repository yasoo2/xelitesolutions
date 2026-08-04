/**
 * THE LOCK — the generated API is no longer wide open.
 *
 * Every backend Joe has scaffolded so far shipped with no accounts at all.
 * Anyone who could reach the port could rewrite the catalogue and read every
 * visitor order — customers' names and phone numbers included. This was the
 * one item deliberately left to the end; this is the end.
 *
 * The proof scaffolds a REAL project, boots the REAL server on a real port,
 * and then tries to get in:
 *
 *   1. an anonymous write must be refused;
 *   2. reading the orders anonymously must be refused;
 *   3. a wrong password must be refused, and must not say WHY (an unknown
 *      email and a wrong password answer identically);
 *   4. the owner's real password must issue a real token;
 *   5. that token must unlock the write — and the row must actually land;
 *   6. a forged token must not;
 *   7. the visitor's own path must stay open: reading the catalogue and
 *      placing an order need no account, because that is the whole business;
 *   8. the password must not exist anywhere on disk.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_api_auth.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.PERSISTENCE_MODE = 'JSON';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-auth-'));
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const { executionEngine } = require('../../kernel/ExecutionEngine');

    console.log('\n[1] يُبنى مشروع خلفي حقيقي، ويُقرأ حسابه من رسالته');
    const out: any = await new ApiProjectTool().execute(
        { request: 'ابنِ API لمتجر عطور', root }, { sessionId: 'api-auth-proof' });
    const dir = String(out?.output?.path || '');
    check('المشروع كُتب على القرص', !!dir && fs.existsSync(path.join(dir, 'server.js')), dir);
    // The tool runs its OWN break-in check while it boots the server; this is
    // that verdict, read back rather than trusted.
    check('الأداة نفسها أثبتت القفل أثناء البناء (authProven)', out?.output?.authProven === true,
        JSON.stringify({ installed: out?.output?.installed, proven: out?.output?.proven, authProven: out?.output?.authProven }));
    check('ملف المصادقة موجود ضمن الملفات المولّدة', fs.existsSync(path.join(dir, 'auth.js')));

    const msg = String(out?.output?.message || '');
    const email = (msg.match(/البريد:\s*(\S+)/) || [])[1] || '';
    const password = (msg.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';
    check('الرسالة تحمل بريد الحساب وكلمة مروره مرة واحدة', !!email && !!password, `${email} / ${password ? '***' : '(none)'}`);

    console.log('\n[2] كلمة المرور ليست على القرص — البصمة فقط');
    const onDisk = fs.readdirSync(dir)
        .filter(f => fs.statSync(path.join(dir, f)).isFile())
        .map(f => fs.readFileSync(path.join(dir, f), 'utf-8')).join('\n');
    check('لا ملف يحوي كلمة المرور نصّاً صريحاً', !!password && !onDisk.includes(password));
    check('…وبصمة scrypt (salt+hash) موجودة في seed.js',
        /salt: '[0-9a-f]{32}', hash: '[0-9a-f]{128}'/.test(fs.readFileSync(path.join(dir, 'seed.js'), 'utf-8')));
    check('‎.auth-secret مستثنى من git', fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8').includes('.auth-secret'));

    console.log('\n[3] الخادم الحقيقي يقلع ويُختبر بمحاولة اقتحام');
    const port = 4600 + Math.floor(Math.random() * 300);
    let up = false;
    let upResolve: (v: boolean) => void = () => { };
    const upPromise = new Promise<boolean>(r => { upResolve = r; });
    const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
        cwd: dir,
        env: { PORT: String(port), NODE_NO_WARNINGS: '1', JOE_FORCE_JSON_DB: process.env.JOE_FORCE_JSON_DB || '' },
        onLine: (l: string) => { console.log(`      | ${l.slice(0, 140)}`); if (/listening on/.test(l)) upResolve(true); },
    });
    child.done.then(() => upResolve(false));
    const timer = setTimeout(() => upResolve(false), 20000);
    up = await upPromise;
    clearTimeout(timer);
    check('الخادم يستمع فعلاً', up, `port ${port}`);

    const base = `http://127.0.0.1:${port}`;
    const call = async (p: string, init?: any) => {
        try {
            const r = await fetch(base + p, init);
            const text = await r.text();
            return { status: r.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })(), text };
        } catch (e: any) { return { status: 0, json: null, text: String(e?.message || e) }; }
    };
    const post = (p: string, body: any, token?: string) => call(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });

    if (up) {
        const resource = String(out?.output?.resource || 'products');

        const anonWrite = await post(`/api/${resource}`, { name: 'اقتحام' });
        check('كتابة بلا حساب تُرفض بـ401', anonWrite.status === 401, `${anonWrite.status} ${anonWrite.text.slice(0, 60)}`);

        const anonOrders = await call('/api/orders');
        check('قراءة الطلبات بلا حساب تُرفض (فيها أسماء العملاء وأرقامهم)', anonOrders.status === 401, String(anonOrders.status));

        const badPass = await post('/api/auth/login', { email, password: 'ليست-كلمة-المرور' });
        const unknownEmail = await post('/api/auth/login', { email: 'nobody@nowhere.local', password: 'x' });
        check('كلمة مرور خاطئة تُرفض بـ401', badPass.status === 401, String(badPass.status));
        check('…وبريد مجهول يُجيب بالجواب نفسه تماماً — لا يكشف أي بريد حقيقي',
            unknownEmail.status === badPass.status && unknownEmail.json?.error === badPass.json?.error,
            `${unknownEmail.status}:${unknownEmail.json?.error} vs ${badPass.status}:${badPass.json?.error}`);

        const login = await post('/api/auth/login', { email, password });
        const token = String(login.json?.token || '');
        check('دخول المالك ينجح ويصدر رمزاً بثلاثة أجزاء', login.status === 200 && token.split('.').length === 3,
            `${login.status} ${token.slice(0, 24)}…`);
        check('الرد لا يسرّب البصمة ولا الملح', !/"hash"|"salt"/.test(login.text), login.text.slice(0, 80));

        const forged = token.replace(/.$/, m => (m === 'a' ? 'b' : 'a'));
        const withForged = await post(`/api/${resource}`, { name: 'رمز مزوّر' }, forged);
        check('رمز مزوّر يُرفض بـ401 لا بانهيار 500', withForged.status === 401, String(withForged.status));
        const shortToken = await post(`/api/${resource}`, { name: 'x' }, 'abc');
        check('رمز قصير مشوّه يُرفض بهدوء (timingSafeEqual كان سينهار على طول مختلف)',
            shortToken.status === 401, String(shortToken.status));

        const authed = await post(`/api/${resource}`, { name: 'صف بحساب حقيقي', details: 'auth proof', price: '9' }, token);
        const newId = Number(authed.json?.item?.id || 0);
        check('الكتابة بالرمز تنجح فعلاً', authed.status === 201 && newId > 0, `${authed.status} ${authed.text.slice(0, 60)}`);

        const listed = await call(`/api/${resource}`);
        check('…والصف موجود فعلاً في القائمة العامة', Array.isArray(listed.json?.[resource])
            && listed.json[resource].some((r: any) => r.id === newId), String(listed.status));

        const me = await call('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        check('‎/api/auth/me يعرّف صاحب الرمز', me.status === 200 && me.json?.user?.email === email,
            `${me.status} ${me.text.slice(0, 60)}`);

        console.log('\n[4] طريق الزائر يبقى مفتوحاً — وإلا خسرنا العمل نفسه');
        const publicList = await call(`/api/${resource}`);
        check('تصفّح المنتجات بلا حساب ما زال يعمل', publicList.status === 200 && Array.isArray(publicList.json?.[resource]),
            String(publicList.status));
        const order = await post('/api/orders', { item: 'عطر', qty: 2, customer: 'زائر', phone: '0500000000' });
        check('إرسال طلب بلا حساب ما زال يعمل (هذا هو العمل)', order.status === 201 && Number(order.json?.order?.id) > 0,
            `${order.status} ${order.text.slice(0, 60)}`);
        const health = await call('/api/health');
        check('‎/api/health عامّ كما كان', health.status === 200, String(health.status));

        console.log('\n[5] والمالك يقرأ الطلبات برمزه');
        const owned = await call('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
        check('المالك يرى الطلب الذي كتبه الزائر للتو',
            owned.status === 200 && Array.isArray(owned.json?.orders) && owned.json.orders.length > 0,
            `${owned.status} ${owned.text.slice(0, 80)}`);

        console.log('\n[6] ومحادثة جو تقرأ الطلبات من القرص مباشرة — بلا رمز، والخادم يعمل أو لا');
        const { readOrders } = require('../../modules/tools/definitions/OrdersReadTool');
        const fromDisk = readOrders(dir);
        check('orders_read ما زال يعمل رغم قفل المسار (يقرأ القاعدة لا HTTP)',
            Array.isArray(fromDisk) && fromDisk.length > 0, JSON.stringify(fromDisk).slice(0, 80));
    }

    try { child.kill(); } catch { /* already gone */ }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
    delete (global as any).joeProjects?.['api-auth-proof'];

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
