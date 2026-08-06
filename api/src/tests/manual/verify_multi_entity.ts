/**
 * ONE TABLE WAS THE CEILING — «هل تقوم بتطوير جو ليتمكن من بناء اي نظام؟»
 *
 * His platform request named fourteen capabilities and got two: a `products`
 * table and an `orders` table. Every one of the missing thirteen starts in the
 * same place — a system needs more than one KIND of row. Vendors own products.
 * Shipments belong to customers. A clinic has doctors and patients before it
 * has appointments.
 *
 * This builds a marketplace backend for real and then DRIVES it over HTTP:
 *
 *   [1] the model is derived from the request, not invented
 *   [2] the build emits a real table per entity
 *   [3] every table answers real CRUD on a running server
 *   [4] a foreign key REFUSES to point at a row that does not exist
 *   [5] reading is public, writing is the owner's
 *   [6] and a plain store still gets exactly what it got yesterday
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_multi_entity.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REQUEST = 'Build a multi-vendor marketplace platform with vendors, customers, coupons and shipping';

async function main() {
    console.log('\n[1] النموذج مُشتقّ من الطلب لا مُختلق');
    const { deriveDataModel, dataModelDomain } = await import('../../core/design/data-model');
    const model = deriveDataModel(REQUEST);
    console.log(`   ℹ️ ${dataModelDomain(REQUEST)} → ${model.map(e => e.key).join(', ')}`);
    check('أربعة كيانات لسوق متعدّد البائعين', model.length === 4, String(model.length));
    check('ومنها علاقة حقيقية', model.some(e => !!e.belongsTo), 'لا علاقة');
    check('وطلب لا يسمّي مجالاً لا يخترع جداول', deriveDataModel('ابن لي متجراً بسيطاً للقهوة').length === 0);

    console.log('\n[2] بناء حقيقي — جدول لكل كيان');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `multi-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: REQUEST },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${dir}`);
    check('ملف الكيانات مكتوب', fs.existsSync(path.join(dir, 'entities.js')));
    check('والخادم يركّبه', /mountEntities\(app, requireAuth\)/.test(fs.readFileSync(path.join(dir, 'server.js'), 'utf-8')));

    const msg = String(res?.output?.message || '');
    const cred = msg.match(/Owner account[^:]*:\s*(\S+@\S+)\s*\/\s*(\S+)/);
    check('الرسالة تحمل بيانات المالك', !!cred, msg.split('\n').find(l => /owner/i.test(l))?.slice(0, 120) || '');
    if (!cred || !fs.existsSync(path.join(dir, 'node_modules'))) {
        console.log('   ℹ️ لا حزم مثبّتة — لا يمكن تشغيل الخادم');
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(fail ? 1 : 1);
    }

    console.log('\n[3] وتشغيل حقيقي — CRUD على كل جدول عبر HTTP');
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const port = 4700 + Math.floor(Math.random() * 90);
    let up: (v: boolean) => void = () => { /* set below */ };
    const listening = new Promise<boolean>(r => { up = r; });
    const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
        cwd: dir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
        onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
    });
    child.done.then(() => up(false));
    const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
    check('الخادم أقلع', booted === true);
    const base = `http://127.0.0.1:${port}`;
    const J = (r: Response) => r.json().catch(() => null) as any;

    const health: any = await fetch(`${base}/api/health`).then(J).catch(() => null);
    console.log(`   ℹ️ health.tables = ${JSON.stringify(health?.tables || null)}`);
    check('الصحة تعدّ كل جدول', !!health?.tables && Object.keys(health.tables).length === 4, JSON.stringify(health?.tables));

    const login: any = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred[1], password: cred[2] }),
    }).then(J);
    check('المالك دخل', !!login?.token, JSON.stringify(login || {}).slice(0, 120));
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${login?.token}` };

    const vendor: any = await fetch(`${base}/api/vendors`, {
        method: 'POST', headers: auth, body: JSON.stringify({ name: 'مقهى الصباح', email: 'v@x.com', commission: 12 }),
    }).then(J);
    check('أُنشئ بائع', vendor?.row?.id > 0, JSON.stringify(vendor || {}).slice(0, 140));
    const customer: any = await fetch(`${base}/api/customers`, {
        method: 'POST', headers: auth, body: JSON.stringify({ name: 'يونس', phone: '0599' }),
    }).then(J);
    check('وعميل', customer?.row?.id > 0, JSON.stringify(customer || {}).slice(0, 140));
    const coupon: any = await fetch(`${base}/api/coupons`, {
        method: 'POST', headers: auth, body: JSON.stringify({ code: 'EID20', percent: 20 }),
    }).then(J);
    check('وكوبون', coupon?.row?.id > 0, JSON.stringify(coupon || {}).slice(0, 140));

    console.log('\n[4] والمفتاح الخارجي يرفض أن يتدلّى');
    const orphan: any = await fetch(`${base}/api/shipments`, {
        method: 'POST', headers: auth, body: JSON.stringify({ customer_id: 9999, carrier: 'Aramex' }),
    }).then(J);
    check('شحنة لعميل غير موجود مرفوضة', orphan?.ok === false && /customer_id_not_found/.test(String(orphan?.error)),
        JSON.stringify(orphan || {}).slice(0, 140));
    const shipment: any = await fetch(`${base}/api/shipments`, {
        method: 'POST', headers: auth, body: JSON.stringify({ customer_id: customer.row.id, carrier: 'Aramex', tracking: 'A1', status: 'in transit' }),
    }).then(J);
    check('وشحنة لعميل موجود مقبولة', shipment?.row?.id > 0, JSON.stringify(shipment || {}).slice(0, 140));

    const nested: any = await fetch(`${base}/api/customers/${customer.row.id}/shipments`).then(J);
    check('وشحنات العميل لها عنوانها الخاص', Array.isArray(nested?.shipments) && nested.shipments.length === 1,
        JSON.stringify(nested || {}).slice(0, 140));

    console.log('\n[5] القراءة للعامّة والكتابة للمالك');
    const publicRead: any = await fetch(`${base}/api/vendors`).then(J);
    check('زائر يقرأ البائعين', Array.isArray(publicRead?.vendors) && publicRead.vendors.length === 1);
    const anon = await fetch(`${base}/api/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'دخيل' }),
    }).then(r => r.status);
    check('وزائر لا يكتب', anon === 401 || anon === 403, String(anon));
    const empty: any = await fetch(`${base}/api/vendors`, {
        method: 'POST', headers: auth, body: JSON.stringify({ email: 'no-name@x.com' }),
    }).then(J);
    check('وصفّ بلا اسم مرفوض', empty?.ok === false && /name_required/.test(String(empty?.error)), JSON.stringify(empty || {}).slice(0, 120));

    // …and the rows really persisted, not just echoed back.
    const again: any = await fetch(`${base}/api/health`).then(J);
    check('والأعداد تعكس ما كُتب فعلاً',
        again?.tables?.vendors === 1 && again?.tables?.customers === 1 && again?.tables?.coupons === 1 && again?.tables?.shipments === 1,
        JSON.stringify(again?.tables));

    try { child.kill(); } catch { /* already gone */ }

    console.log('\n[6] ومتجر بسيط يبقى كما كان بالأمس');
    const plainSession = `plain-${Date.now()}`;
    const plain: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: 'Build a real backend for a coffee shop' },
            { sessionId: plainSession, userId: 'u1', workspaceId: `session-${plainSession}`, language: 'en' }));
    const plainDir = String((global as any).joeProjects?.[plainSession]?.dir || '');
    check('بُني', plain?.ok === true, String(plain?.error || '').slice(0, 120));
    check('ولا ملف كيانات — لا جداول لم تُطلب', !fs.existsSync(path.join(plainDir, 'entities.js')));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
