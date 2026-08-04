/**
 * WIRE PROOF — the backend front, nothing faked:
 *
 *   The REAL tool scaffolds an Express API, runs a REAL npm install, boots
 *   the REAL server as a child process and proves a write/read over REAL
 *   HTTP. Then this script goes further than the tool does: it RESTARTS the
 *   server and shows the data survived on disk, exercises the honest 400s
 *   and 404s, and boots the SAME project with JOE_FORCE_JSON_DB=1 to prove
 *   the JSON fallback carries the identical interface on any Node.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_api_project.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function boot(proj: string, port: number, extraEnv: Record<string, string> = {}): Promise<ChildProcess | null> {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['server.js'], {
            cwd: proj, env: { ...process.env, PORT: String(port), NODE_NO_WARNINGS: '1', ...extraEnv },
        });
        const t = setTimeout(() => resolve(null), 15_000);
        child.stdout?.on('data', (b: Buffer) => { if (/listening on/.test(String(b))) { clearTimeout(t); resolve(child); } });
        child.on('error', () => { clearTimeout(t); resolve(null); });
        child.on('exit', () => { clearTimeout(t); resolve(null); });
    });
}
const kill = (c: ChildProcess | null) => { try { c?.kill(); } catch { /* gone */ } };
const J = (r: Response) => r.json() as Promise<any>;

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-apiproj-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] الأداة تبني وتثبت بنفسها: خادم حقيقي، كتابة وقراءة عبر HTTP حقيقي');
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const res: any = await new ApiProjectTool().execute(
        { request: 'ابنِ لي API لإدارة أطباق مطعم الشواء', root }, { sessionId: 'apiwire' });
    check('the tool reported a PROVEN live write/read', !!res.ok && res.output.proven === true, JSON.stringify({ ok: res.ok, proven: res.output?.proven }));
    check('…on the sqlite backend (this runtime carries node:sqlite)', res.output.backend === 'sqlite', String(res.output.backend));
    const proj = res.output.path as string;
    check('the database file is REAL and on disk', fs.existsSync(path.join(proj, 'data.db')));

    console.log('\n[2] إعادة تشغيل: البيانات تنجو، والبذر لا يتكرر');
    const p1 = 4610, srv1 = await boot(proj, p1);
    check('a fresh process booted over the same database', !!srv1);
    const list1 = await fetch(`http://127.0.0.1:${p1}/api/dishes`).then(J);
    // 3 Arabic seeds + the tool's own live-proof row — and NOT 6+ (idempotent seed).
    check('the seeds AND the live-proof row survived the restart (exactly 4 rows)',
        Array.isArray(list1?.dishes) && list1.dishes.length === 4
        && list1.dishes.some((d: any) => /صف الإثبات الحي/.test(d.name))
        && list1.dishes.some((d: any) => /مشاوي مشكلة/.test(d.name)),
        `rows=${list1?.dishes?.length}`);

    console.log('\n[3] الصدق: 400 للحقول الفاسدة، 404 لغير الموجود، وحذف يعمل');
    /**
     * THE CATALOGUE IS LOCKED, AND THIS PROOF HAD NOT NOTICED.
     *
     * Every write below was anonymous — correct before owner accounts landed,
     * and 401 ever since, which crashed the run at `created.item.id`. A proof
     * that lives red proves nothing. The writes now go through the owner's
     * own door: the password the tool printed in chat, exchanged for a token.
     */
    const pw = String(res.output?.message || '').match(/كلمة المرور:\s*(\S+)/)?.[1] || '';
    const login = await fetch(`http://127.0.0.1:${p1}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: res.output?.ownerEmail, password: pw }),
    }).then(J);
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${String(login?.token || '')}` };
    check('the password Joe printed in chat really opens the API', String(login?.token || '').split('.').length === 3, JSON.stringify(login).slice(0, 100));
    const anon = await fetch(`http://127.0.0.1:${p1}/api/dishes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'anonymous' }) });
    check('…and an anonymous write is still refused 401', anon.status === 401, String(anon.status));
    const bad = await fetch(`http://127.0.0.1:${p1}/api/dishes`, { method: 'POST', headers: auth, body: JSON.stringify({ details: 'no name' }) });
    check('a nameless POST is refused with 400 name_required', bad.status === 400 && (await J(bad)).error === 'name_required');
    const missing = await fetch(`http://127.0.0.1:${p1}/api/dishes/99999`);
    check('an unknown id answers 404', missing.status === 404);
    const created = await fetch(`http://127.0.0.1:${p1}/api/dishes`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'طبق مؤقت', price: '10' }) }).then(J);
    const put = await fetch(`http://127.0.0.1:${p1}/api/dishes/${created.item.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ price: '15 ر.س' }) }).then(J);
    check('PUT updates the row it names', put.ok === true && put.item.price === '15 ر.س' && put.item.name === 'طبق مؤقت');
    const del = await fetch(`http://127.0.0.1:${p1}/api/dishes/${created.item.id}`, { method: 'DELETE', headers: auth });
    const gone = await fetch(`http://127.0.0.1:${p1}/api/dishes/${created.item.id}`);
    check('DELETE removes it and the next GET honestly 404s', del.status === 200 && gone.status === 404);
    kill(srv1);

    console.log('\n[4] نفس المشروع على «Node أقدم»: مخزن JSON بنفس الواجهة تماماً');
    const p2 = 4611, srv2 = await boot(proj, p2, { JOE_FORCE_JSON_DB: '1' });
    check('the server booted on the JSON backend', !!srv2);
    const health = await fetch(`http://127.0.0.1:${p2}/api/health`).then(J);
    check('/api/health honestly names the backend', health?.backend === 'json', JSON.stringify(health));
    const login2 = await fetch(`http://127.0.0.1:${p2}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: res.output?.ownerEmail, password: pw }),
    }).then(J);
    const auth2 = { 'Content-Type': 'application/json', Authorization: `Bearer ${String(login2?.token || '')}` };
    check('the owner account works on the JSON backend too', String(login2?.token || '').split('.').length === 3, JSON.stringify(login2).slice(0, 100));
    const made = await fetch(`http://127.0.0.1:${p2}/api/dishes`, { method: 'POST', headers: auth2, body: JSON.stringify({ name: 'صف عبر JSON', price: '9' }) }).then(J);
    const list2 = await fetch(`http://127.0.0.1:${p2}/api/dishes`).then(J);
    check('the identical CRUD interface works there too', made?.ok === true && list2.dishes.some((d: any) => d.id === made.item.id));
    check('…persisted to its own data.json on disk', fs.readFileSync(path.join(proj, 'data.json'), 'utf-8').includes('صف عبر JSON'));
    kill(srv2);

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
