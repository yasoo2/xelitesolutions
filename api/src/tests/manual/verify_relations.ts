/**
 * TWO TABLES, LINKED, ON A REAL SERVER — «طبيب ← مواعيده».
 *
 * Every system Joe built owned exactly ONE table. That is enough for a notes
 * app and nowhere near enough for a real system: with one table the doctor's
 * name is retyped on every appointment — misspelt on the third, unsearchable
 * by the fifth, impossible to rename at all. A «نظام كامل» that cannot express
 * «هذا الموعد لهذا الطبيب» is a list with a form on top of it.
 *
 * Nothing here is asserted from source code. The generated server is booted on
 * BOTH database backends and interrogated over real HTTP:
 *
 *   1. the parent collection exists and is writable by the owner
 *   2. a child bound to a parent comes back carrying the parent's NAME
 *   3. «this parent's children» is a real endpoint that returns the child
 *   4. a link to a parent that does not exist is REFUSED (400)
 *   5. deleting a parent that still has children is REFUSED (409, with a count)
 *   6. …and once the child is gone, the same delete succeeds
 *   7. renaming the parent renames it on every child at once — the whole point
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_relations.ts
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
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-relations-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `rel-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`relations-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] النظام يُبنى بجدولين: الأطباء ← المواعيد');
    const api: any = await executeTool('api_project', { request: REQUEST, skipInstall: true });
    const dir = String(api?.output?.path || '');
    check('الخادم مكتوب على القرص', !!dir && fs.existsSync(path.join(dir, 'server.js')), dir || 'لا مجلد');

    const dbSrc = fs.readFileSync(path.join(dir, 'db.js'), 'utf-8');
    const srvSrc = fs.readFileSync(path.join(dir, 'server.js'), 'utf-8');
    check('جدول الأصل «providers» مُعرَّف في قاعدة البيانات', /"resource":"providers"/.test(dbSrc), '');
    check('وعمود الربط provider_id عمود حقيقي من نوع INT', /"key":"provider_id","type":"INT"/.test(dbSrc));
    check('ومسار «أبناء هذا الأصل» موجود في الخادم',
        srvSrc.includes("/api/providers/:id/bookings"), '');

    // express is needed to actually RUN it — the scaffolder was told to skip
    // its own install so this proof controls the timing.
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    console.log('\n[2] تثبيت الحزم (express) لتشغيل الخادم الحقيقي');
    const inst = await executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' },
    }).done;
    check('npm install نجح', inst.exitCode === 0, `exit ${inst.exitCode}`);
    if (inst.exitCode !== 0) { console.log(`\n===== ${pass} passed, ${fail} failed =====`); process.exit(1); }

    const msg = String(api?.output?.message || '');
    const email = String(api?.output?.ownerEmail || (msg.match(/[\w.+-]+@[\w.-]+/) || [''])[0] || '');
    const password = (msg.match(/(?:كلمة المرور|password[^:]{0,20})\s*[:：]\s*(\S+)/i) || [])[1] || '';

    for (const backend of ['sqlite', 'json'] as const) {
        console.log(`\n[3] الربط الحيّ على قاعدة ${backend}`);
        const port = 4500 + Math.floor(Math.random() * 400);
        const child = executionEngine.runArgvStreaming('node', ['server.js'], {
            cwd: dir,
            env: { PORT: String(port), ...(backend === 'json' ? { JOE_FORCE_JSON_DB: '1' } : {}) },
        });
        try {
            const base = `http://127.0.0.1:${port}`;
            const up = await waitFor(`${base}/api/health`);
            check(`[${backend}] الخادم أقلع`, up);
            if (!up) continue;

            const health = await req('GET', `${base}/api/health`);
            check(`[${backend}] وهو على القاعدة المتوقّعة، ويعلن العلاقة`,
                health.body?.backend === backend && health.body?.relation?.key === 'provider_id',
                JSON.stringify(health.body).slice(0, 160));

            const login = await req('POST', `${base}/api/auth/login`, { email, password });
            const token = login.body?.token || '';
            check(`[${backend}] دخول المالك نجح`, !!token, JSON.stringify(login.body).slice(0, 120));

            // ── 1) the parent is a real row, and only the owner may write it
            const anon = await req('POST', `${base}/api/providers`, { name: 'دخيل' });
            check(`[${backend}] كتابة الأصل بلا تسجيل دخول تُرفض بـ401`, anon.status === 401, String(anon.status));

            const doc = await req('POST', `${base}/api/providers`,
                { name: 'د. سارة الأحمد', specialty: 'تقويم الأسنان', phone: '0599111222' }, token);
            const docId = Number(doc.body?.item?.id || 0);
            check(`[${backend}] الطبيب أُنشئ (201) بحقوله كاملة`,
                doc.status === 201 && docId > 0 && doc.body.item.specialty === 'تقويم الأسنان',
                `${doc.status} ${JSON.stringify(doc.body).slice(0, 160)}`);

            const second = await req('POST', `${base}/api/providers`, { name: 'د. خالد' }, token);
            const secondId = Number(second.body?.item?.id || 0);
            check(`[${backend}] وطبيب ثانٍ كذلك`, secondId > 0 && secondId !== docId);

            const nameless = await req('POST', `${base}/api/providers`, { specialty: 'بلا اسم' }, token);
            check(`[${backend}] وطبيب بلا اسم يُرفض بـ400 يسمّي الحقل`,
                nameless.status === 400 && /name_required/.test(JSON.stringify(nameless.body)),
                `${nameless.status} ${JSON.stringify(nameless.body)}`);

            // ── 2) the child carries the link, and comes back with the NAME
            const appt = await req('POST', `${base}/api/bookings`, {
                name: 'يونس', phone: '0599123456', service: 'تنظيف',
                date: '2026-08-20', time: '10:30', status: 'مؤكّد', provider_id: docId,
            }, token);
            const apptId = Number(appt.body?.item?.id || 0);
            check(`[${backend}] الموعد أُنشئ ومربوط بالطبيب`,
                appt.status === 201 && Number(appt.body?.item?.provider_id) === docId,
                `${appt.status} ${JSON.stringify(appt.body).slice(0, 200)}`);
            check(`[${backend}] ويعود ومعه اسم الطبيب (parent_label) بلا استعلام ثانٍ`,
                appt.body?.item?.parent_label === 'د. سارة الأحمد',
                JSON.stringify(appt.body?.item).slice(0, 200));

            const list = await req('GET', `${base}/api/bookings`);
            const listed = (list.body?.bookings || []).find((r: any) => Number(r.id) === apptId);
            check(`[${backend}] والقائمة العامة تحمل الاسم أيضاً`,
                !!listed && listed.parent_label === 'د. سارة الأحمد', JSON.stringify(listed).slice(0, 200));

            // ── 3) «مواعيد هذا الطبيب» — the reason the tables are linked
            const kids = await req('GET', `${base}/api/providers/${docId}/bookings`);
            check(`[${backend}] «مواعيد هذا الطبيب» يرجع الموعد`,
                kids.status === 200 && (kids.body?.bookings || []).some((r: any) => Number(r.id) === apptId),
                `${kids.status} ${JSON.stringify(kids.body).slice(0, 200)}`);
            const other = await req('GET', `${base}/api/providers/${secondId}/bookings`);
            check(`[${backend}] ومواعيد الطبيب الآخر فارغة — لا خلط`,
                other.status === 200 && (other.body?.bookings || []).length === 0,
                JSON.stringify(other.body).slice(0, 160));
            const ghost = await req('GET', `${base}/api/providers/999999/bookings`);
            check(`[${backend}] وطبيب غير موجود يردّ 404`, ghost.status === 404, String(ghost.status));

            // ── 4) a link that points at nothing is refused
            const dangling = await req('POST', `${base}/api/bookings`, {
                name: 'موعد يتيم', date: '2026-08-21', provider_id: 999999,
            }, token);
            check(`[${backend}] رابط إلى طبيب غير موجود يُرفض بـ400 يسمّي الحقل`,
                dangling.status === 400 && /unknown_provider_id/.test(JSON.stringify(dangling.body)),
                `${dangling.status} ${JSON.stringify(dangling.body)}`);

            // …but no link at all is a legitimate row (a walk-in).
            const walkIn = await req('POST', `${base}/api/bookings`,
                { name: 'مراجع بلا طبيب', date: '2026-08-22' }, token);
            check(`[${backend}] وموعد بلا طبيب مقبول — الربط اختياري`,
                walkIn.status === 201 && !walkIn.body.item.parent_label,
                `${walkIn.status} ${JSON.stringify(walkIn.body).slice(0, 160)}`);

            // ── 5) a parent with children cannot be deleted
            const busy = await req('DELETE', `${base}/api/providers/${docId}`, undefined, token);
            check(`[${backend}] حذف طبيب له مواعيد يُرفض بـ409 ويقول كم`,
                busy.status === 409 && Number(busy.body?.count) === 1,
                `${busy.status} ${JSON.stringify(busy.body)}`);

            // ── 6) …and once the child is gone, it can
            await req('DELETE', `${base}/api/bookings/${apptId}`, undefined, token);
            const freed = await req('DELETE', `${base}/api/providers/${docId}`, undefined, token);
            check(`[${backend}] وبعد حذف الموعد يُحذف الطبيب بنجاح`, freed.status === 200, `${freed.status} ${JSON.stringify(freed.body)}`);

            // ── 7) THE WHOLE POINT: rename once, right everywhere
            const bound = await req('POST', `${base}/api/bookings`, {
                name: 'مريض آخر', date: '2026-08-23', provider_id: secondId,
            }, token);
            await req('PUT', `${base}/api/providers/${secondId}`, { name: 'د. خالد المصري' }, token);
            const after = await req('GET', `${base}/api/bookings/${bound.body?.item?.id}`);
            check(`[${backend}] تعديل اسم الطبيب مرة واحدة يظهر على موعده فوراً`,
                after.body?.item?.parent_label === 'د. خالد المصري',
                JSON.stringify(after.body?.item).slice(0, 200));
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
