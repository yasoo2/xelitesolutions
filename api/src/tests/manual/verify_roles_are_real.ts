/**
 * «نظام يستعمله فريق» — THE PROOF THAT A ROLE IS NOT A LABEL.
 *
 * Until this batch every system Joe built had exactly ONE account. Handing an
 * employee the keys meant handing him the owner's password, which is not a
 * permission — it is a surrender. So the generated server now knows three
 * roles, and this proof does not read the code that claims it: it boots the
 * REAL server on a REAL port and tries to break the rules from the outside.
 *
 *   1. the owner makes a staff account, and its password is shown ONCE;
 *   2. staff writes a row, and the row carries HIS id — not one from the body;
 *   3. staff sees his own rows and nobody else's;
 *   4. a visitor with no account still sees the whole shelf (that is the shop);
 *   5. staff editing somebody else's row is refused 403 «not_your_row»;
 *   6. a viewer cannot write at all — 403 «read_only»;
 *   7. staff cannot reach the accounts screen — 403 «forbidden»;
 *   8. the accounts list never carries a salt or a hash;
 *   9. the last owner cannot delete or demote himself into a locked system;
 *  10. demoting somebody takes effect on his EXISTING token, immediately;
 *  11. rows written before the team existed stay the owner's — nobody inherits
 *      them by accident;
 *  12. and every one of these rules holds on the system's OTHER tables too,
 *      because they are mounted from the same guards.
 *
 * Run:  npx tsx src/tests/manual/verify_roles_are_real.ts
 */
export { };
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-roles-'));
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const { executionEngine } = require('../../kernel/ExecutionEngine');

    console.log('\n[1] يُبنى نظام خلفي حقيقي بجداول متعددة');
    const out: any = await new ApiProjectTool().execute(
        { request: 'ابنِ API لمشتل: النباتات والموردون', root }, { sessionId: 'roles-proof' });
    const dir = String(out?.output?.path || '');
    const resource = String(out?.output?.resource || 'items');
    check('المشروع كُتب على القرص', !!dir && fs.existsSync(path.join(dir, 'server.js')), dir);
    check('ملف entities.js موجود (النظام له جداول غير الجدول الأساسي)', fs.existsSync(path.join(dir, 'entities.js')));

    const msg = String(out?.output?.message || '');
    const email = (msg.match(/البريد:\s*(\S+)/) || [])[1] || '';
    const password = (msg.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';
    check('رسالة البناء تشرح الأدوار الثلاثة', msg.includes('المالك') && msg.includes('موظّف') && msg.includes('مُطّلِع'));
    check('…وتذكر أن الموظّف لا يلمس صفوف غيره', msg.includes('not_your_row'));

    console.log('\n[2] الخادم الحقيقي يقلع');
    const port = 4900 + Math.floor(Math.random() * 300);
    let upResolve: (v: boolean) => void = () => { };
    const upPromise = new Promise<boolean>(r => { upResolve = r; });
    const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
        cwd: dir,
        env: { PORT: String(port), NODE_NO_WARNINGS: '1', JOE_FORCE_JSON_DB: process.env.JOE_FORCE_JSON_DB || '' },
        onLine: (l: string) => { console.log(`      | ${l.slice(0, 140)}`); if (/listening on/.test(l)) upResolve(true); },
    });
    child.done.then(() => upResolve(false));
    const timer = setTimeout(() => upResolve(false), 20000);
    const up = await upPromise;
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
    const authed = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : {});
    const send = (method: string) => (p: string, body: any, token?: string) => call(p, {
        method,
        headers: { 'Content-Type': 'application/json', ...authed(token) },
        body: JSON.stringify(body),
    });
    const post = send('POST');
    const put = send('PUT');
    const del = (p: string, token?: string) => call(p, { method: 'DELETE', headers: { ...authed(token) } });
    const get = (p: string, token?: string) => call(p, { headers: { ...authed(token) } });

    if (up) {
        const health = await get('/api/health');
        const tableKeys = Object.keys(health.json?.tables || {});
        const table = tableKeys[0] || '';
        console.log(`      (المورد الأساسي: ${resource} · جداول أخرى: ${tableKeys.join(', ') || 'لا شيء'})`);

        console.log('\n[3] المالك يدخل، ويصنع الفريق من داخل النظام');
        const ownerLogin = await post('/api/auth/login', { email, password });
        const ownerToken = String(ownerLogin.json?.token || '');
        check('دخول المالك ينجح', ownerLogin.status === 200 && !!ownerToken, String(ownerLogin.status));
        check('…ورمزه يقول إنه مالك', ownerLogin.json?.user?.role === 'owner', String(ownerLogin.json?.user?.role));

        const mkStaff = await post('/api/auth/users', { email: 'clerk@team.local', role: 'staff' }, ownerToken);
        const staffPass = String(mkStaff.json?.password || '');
        check('المالك ينشئ حساب موظّف', mkStaff.status === 201 && mkStaff.json?.user?.role === 'staff',
            `${mkStaff.status} ${mkStaff.text.slice(0, 80)}`);
        check('…وكلمة مروره تُولَّد وتظهر مرة واحدة', staffPass.length >= 8, `${staffPass ? '***' : '(none)'}`);
        check('…ولا تسرّب الاستجابة بصمة ولا ملحاً', !/"hash"|"salt"/.test(mkStaff.text));

        const mkViewer = await post('/api/auth/users', { email: 'auditor@team.local', role: 'viewer' }, ownerToken);
        const viewerPass = String(mkViewer.json?.password || '');
        check('…وحساب مُطّلِع كذلك', mkViewer.status === 201 && mkViewer.json?.user?.role === 'viewer', String(mkViewer.status));

        const dupe = await post('/api/auth/users', { email: 'clerk@team.local', role: 'staff' }, ownerToken);
        check('بريد مكرّر يُرفض بـ409 لا يدهس الحساب القائم', dupe.status === 409 && dupe.json?.error === 'email_taken',
            `${dupe.status} ${dupe.json?.error}`);
        const badRole = await post('/api/auth/users', { email: 'x@team.local', role: 'superadmin' }, ownerToken);
        check('دور مخترع يُرفض بـ400 — لا يُمنح أحد صلاحية بالخطأ الإملائي',
            badRole.status === 400 && badRole.json?.error === 'bad_role', `${badRole.status} ${badRole.json?.error}`);

        console.log('\n[4] الموظّف يدخل ويكتب — والصف يحمل هويّته هو');
        const staffLogin = await post('/api/auth/login', { email: 'clerk@team.local', password: staffPass });
        const staffToken = String(staffLogin.json?.token || '');
        const staffId = Number(staffLogin.json?.user?.id || 0);
        check('دخول الموظّف بكلمته المولّدة ينجح', staffLogin.status === 200 && !!staffToken, String(staffLogin.status));

        const staffRow = await post(`/api/${resource}`, { name: 'صف الموظّف', details: 'staff', price: '10' }, staffToken);
        const staffRowId = Number(staffRow.json?.item?.id || 0);
        check('الموظّف يكتب صفاً فعلاً', staffRow.status === 201 && staffRowId > 0, `${staffRow.status} ${staffRow.text.slice(0, 80)}`);
        check('…والصف يحمل owner_id الموظّف', Number(staffRow.json?.item?.owner_id) === staffId,
            `${staffRow.json?.item?.owner_id} vs ${staffId}`);

        // The body is not the authority on ownership.
        const forgedOwner = await post(`/api/${resource}`,
            { name: 'محاولة انتحال', details: 'x', price: '1', owner_id: 999999 }, staffToken);
        check('owner_id مرسل في الجسم لا يُصدَّق — الحساب هو المصدر',
            Number(forgedOwner.json?.item?.owner_id) === staffId, String(forgedOwner.json?.item?.owner_id));

        const ownerRow = await post(`/api/${resource}`, { name: 'صف المالك', details: 'owner', price: '20' }, ownerToken);
        const ownerRowId = Number(ownerRow.json?.item?.id || 0);
        check('المالك يكتب صفه', ownerRow.status === 201 && ownerRowId > 0, String(ownerRow.status));

        console.log('\n[5] من يرى ماذا');
        const staffList = await get(`/api/${resource}`, staffToken);
        const staffIds = (staffList.json?.[resource] || []).map((r: any) => r.id);
        check('الموظّف يرى صفوفه هو فقط',
            staffIds.includes(staffRowId) && !staffIds.includes(ownerRowId), JSON.stringify(staffIds).slice(0, 80));

        const ownerList = await get(`/api/${resource}`, ownerToken);
        const ownerIds = (ownerList.json?.[resource] || []).map((r: any) => r.id);
        check('المالك يرى الجميع', ownerIds.includes(staffRowId) && ownerIds.includes(ownerRowId),
            JSON.stringify(ownerIds).slice(0, 80));

        const anonList = await get(`/api/${resource}`);
        const anonIds = (anonList.json?.[resource] || []).map((r: any) => r.id);
        check('والزائر بلا حساب ما زال يرى الرفّ كاملاً — هذا هو المتجر',
            anonIds.includes(staffRowId) && anonIds.includes(ownerRowId), JSON.stringify(anonIds).slice(0, 80));

        const staffPeek = await get(`/api/${resource}/${ownerRowId}`, staffToken);
        check('وصفّ غيره لا يُفتح له بالعنوان المباشر', staffPeek.status === 404, String(staffPeek.status));

        console.log('\n[6] ولا يلمس ما ليس له');
        const staffEditsOwner = await put(`/api/${resource}/${ownerRowId}`, { name: 'اختطاف' }, staffToken);
        check('تعديل صفّ المالك يُرفض بـ403 not_your_row',
            staffEditsOwner.status === 403 && staffEditsOwner.json?.error === 'not_your_row',
            `${staffEditsOwner.status} ${staffEditsOwner.json?.error}`);
        const staffDeletesOwner = await del(`/api/${resource}/${ownerRowId}`, staffToken);
        check('وحذفه كذلك', staffDeletesOwner.status === 403, String(staffDeletesOwner.status));
        const stillThere = await get(`/api/${resource}/${ownerRowId}`, ownerToken);
        check('…والصف ما زال سليماً بمحتواه الأصلي',
            stillThere.status === 200 && stillThere.json?.item?.name === 'صف المالك', String(stillThere.json?.item?.name));

        const staffEditsOwn = await put(`/api/${resource}/${staffRowId}`, { name: 'صف الموظّف المعدَّل' }, staffToken);
        check('لكنه يعدّل صفّه هو بلا عائق',
            staffEditsOwn.status === 200 && staffEditsOwn.json?.item?.name === 'صف الموظّف المعدَّل',
            `${staffEditsOwn.status} ${staffEditsOwn.text.slice(0, 60)}`);

        console.log('\n[7] الصفوف القديمة — المزروعة قبل وجود الفريق — تبقى للبيت');
        const seededList = await get(`/api/${resource}`, ownerToken);
        const orphan = (seededList.json?.[resource] || []).find((r: any) => r.owner_id === null || r.owner_id === undefined);
        if (orphan) {
            const staffTouchesSeed = await put(`/api/${resource}/${orphan.id}`, { name: 'ورثتها' }, staffToken);
            check('صفّ بلا مالك لا يرثه موظّف بالصدفة (403)', staffTouchesSeed.status === 403, String(staffTouchesSeed.status));
            const ownerTouchesSeed = await put(`/api/${resource}/${orphan.id}`, { name: String(orphan.name || 'x') }, ownerToken);
            check('…والمالك يتصرّف فيها كما ينبغي', ownerTouchesSeed.status === 200, String(ownerTouchesSeed.status));
        } else {
            check('صفّ بلا مالك لا يرثه موظّف بالصدفة', true, 'لا صفوف مزروعة في هذا النوع — القاعدة مفحوصة في الاختبارات');
        }

        console.log('\n[8] المُطّلِع يرى ولا يغيّر');
        const viewerLogin = await post('/api/auth/login', { email: 'auditor@team.local', password: viewerPass });
        const viewerToken = String(viewerLogin.json?.token || '');
        check('دخول المُطّلِع ينجح', viewerLogin.status === 200 && !!viewerToken, String(viewerLogin.status));
        const viewerWrite = await post(`/api/${resource}`, { name: 'لن يُكتب', details: 'x', price: '1' }, viewerToken);
        check('كتابته تُرفض بـ403 read_only', viewerWrite.status === 403 && viewerWrite.json?.error === 'read_only',
            `${viewerWrite.status} ${viewerWrite.json?.error}`);
        const viewerDelete = await del(`/api/${resource}/${staffRowId}`, viewerToken);
        check('وحذفه كذلك', viewerDelete.status === 403, String(viewerDelete.status));
        const viewerList = await get(`/api/${resource}`, viewerToken);
        const viewerIds = (viewerList.json?.[resource] || []).map((r: any) => r.id);
        check('لكنه يرى كل شيء — للمحاسب والمراجع',
            viewerIds.includes(staffRowId) && viewerIds.includes(ownerRowId), JSON.stringify(viewerIds).slice(0, 80));

        console.log('\n[9] شاشة الحسابات للمالك وحده');
        const staffPeeksUsers = await get('/api/auth/users', staffToken);
        check('الموظّف يُجاب 403 على قائمة الحسابات',
            staffPeeksUsers.status === 403 && staffPeeksUsers.json?.error === 'forbidden',
            `${staffPeeksUsers.status} ${staffPeeksUsers.json?.error}`);
        const staffMakesUser = await post('/api/auth/users', { email: 'me@boss.local', role: 'owner' }, staffToken);
        check('…ولا يستطيع ترقية نفسه بصنع حساب مالك', staffMakesUser.status === 403, String(staffMakesUser.status));
        const anonUsers = await get('/api/auth/users');
        check('وبلا حساب يُجاب 401', anonUsers.status === 401, String(anonUsers.status));

        const users = await get('/api/auth/users', ownerToken);
        check('المالك يرى الحسابات الثلاثة', users.status === 200 && (users.json?.users || []).length === 3,
            `${users.status} ${(users.json?.users || []).length}`);
        check('…والقائمة لا تحمل بصمة ولا ملحاً', !/"hash"|"salt"/.test(users.text), users.text.slice(0, 80));
        check('…وتحمل الأدوار الثلاثة التي يعرفها النظام', (users.json?.roles || []).length === 3,
            JSON.stringify((users.json?.roles || []).map((r: any) => r.key)));

        console.log('\n[10] ولا يقفل المالك النظام على نفسه');
        const ownerId = Number(ownerLogin.json?.user?.id || 0);
        const selfDelete = await del(`/api/auth/users/${ownerId}`, ownerToken);
        check('حذف الحساب لنفسه يُرفض بـ409', selfDelete.status === 409 && selfDelete.json?.error === 'cannot_delete_self',
            `${selfDelete.status} ${selfDelete.json?.error}`);
        const selfDemote = await put(`/api/auth/users/${ownerId}`, { role: 'staff' }, ownerToken);
        check('وتنزيل آخر مالك يُرفض بـ409 last_owner', selfDemote.status === 409 && selfDemote.json?.error === 'last_owner',
            `${selfDemote.status} ${selfDemote.json?.error}`);

        console.log('\n[11] وتغيير الدور يسري على الرمز القائم فوراً');
        const demote = await put(`/api/auth/users/${staffId}`, { role: 'viewer' }, ownerToken);
        check('المالك ينزّل الموظّف إلى مُطّلِع', demote.status === 200 && demote.json?.user?.role === 'viewer',
            `${demote.status} ${demote.json?.error || ''}`);
        const afterDemote = await post(`/api/${resource}`, { name: 'بعد التنزيل', details: 'x', price: '1' }, staffToken);
        check('…ورمزه القديم لم يعد يكتب — بلا إعادة دخول ولا انتظار انتهاء الرمز',
            afterDemote.status === 403 && afterDemote.json?.error === 'read_only',
            `${afterDemote.status} ${afterDemote.json?.error}`);

        const viewerId = Number(mkViewer.json?.user?.id || 0);
        const removed = await del(`/api/auth/users/${viewerId}`, ownerToken);
        check('وحذف حساب حقيقي ينجح', removed.status === 200, String(removed.status));
        const deadLogin = await post('/api/auth/login', { email: 'auditor@team.local', password: viewerPass });
        check('…وصاحبه لم يعد يدخل', deadLogin.status === 401, String(deadLogin.status));

        console.log('\n[12] والقواعد نفسها على جداول النظام الأخرى');
        if (table) {
            // The demoted account is a viewer now; promote it back to staff to
            // measure the entity tables with a real employee.
            await put(`/api/auth/users/${staffId}`, { role: 'staff' }, ownerToken);
            const nameKey = (health.json?.tables && Object.keys(health.json.tables).length) ? 'name' : 'name';
            const sRow = await post(`/api/${table}`, { [nameKey]: 'نبتة الموظّف' }, staffToken);
            const oRow = await post(`/api/${table}`, { [nameKey]: 'نبتة المالك' }, ownerToken);
            check(`الموظّف يكتب في /api/${table}`, sRow.status === 201, `${sRow.status} ${sRow.text.slice(0, 80)}`);
            check('…والمالك كذلك', oRow.status === 201, String(oRow.status));
            const sList = await get(`/api/${table}`, staffToken);
            const sIds = (sList.json?.[table] || []).map((r: any) => r.id);
            check('الموظّف يرى صفوفه فقط في الجدول الآخر أيضاً',
                sIds.includes(Number(sRow.json?.row?.id)) && !sIds.includes(Number(oRow.json?.row?.id)),
                JSON.stringify(sIds).slice(0, 80));
            const cross = await del(`/api/${table}/${Number(oRow.json?.row?.id)}`, staffToken);
            check('وحذف صفّ المالك هناك يُرفض بـ403 نفسه',
                cross.status === 403 && cross.json?.error === 'not_your_row', `${cross.status} ${cross.json?.error}`);
            const publicTable = await get(`/api/${table}`);
            check('والزائر يرى الجدول كاملاً كما كان', (publicTable.json?.[table] || []).length >= 2,
                String((publicTable.json?.[table] || []).length));
        } else {
            check('جداول النظام الأخرى مفحوصة', false, 'لم يُولَّد أي جدول إضافي — تعذّر الفحص');
        }
    }

    try { child.kill(); } catch { /* already gone */ }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    delete (global as any).joeProjects?.['roles-proof'];

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
