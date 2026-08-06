/**
 * «Owner account: owner@myapp.local — the password is the OLD one.»
 *
 * His delivery, word for word:
 *
 *     This project was built over an existing database, so the account was not
 *     re-created and a fresh password would not work. Delete data.db to start
 *     over, or change it from inside with POST /api/auth/password.
 *
 * An honest paragraph that should never have needed to exist. A build lands on
 * `api-<brand>`, «MyApp» was the brand of every unnamed English request, and so
 * his second build inherited the first one's data.db: its rows, its owner, and
 * a password he no longer had. A credential that cannot be used is not a
 * credential — it is an apology.
 *
 * Measured here by building the same thing TWICE in one session:
 *
 *   [1] the second build gets its own folder — the first is left untouched
 *   [2] with its own empty database
 *   [3] and an owner password that actually signs in
 *   [4] and the message no longer needs to apologise
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_fresh_database.ts
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

const REQUEST = 'Build a real backend for a bookshop';

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `fresh-db-${Date.now()}`;
    const ctx = { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' };
    const build = () => executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: REQUEST }, ctx)) as Promise<any>;

    console.log('\n[1] بناء أول');
    const first = await build();
    check('نجح', first?.ok === true, String(first?.error || '').slice(0, 140));
    const dir1 = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${dir1}`);
    check('واسمه من الطلب لا «MyApp»', /bookshop/i.test(path.basename(dir1)), path.basename(dir1));
    const db1 = path.join(dir1, 'data.db');
    check('وله قاعدة بيانات', fs.existsSync(db1), db1);

    // Something of his lives in that database now.
    const before = fs.existsSync(db1) ? fs.statSync(db1).size : 0;

    console.log('\n[2] بناء ثانٍ — نفس الطلب، نفس الجلسة');
    const second = await build();
    check('نجح', second?.ok === true, String(second?.error || '').slice(0, 140));
    const dir2 = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${dir2}`);
    check('في مجلد آخر — لم يبنِ فوق القديم', dir2 !== dir1, `${path.basename(dir1)} = ${path.basename(dir2)}`);
    check('والمجلد القديم كما هو', fs.existsSync(db1) && fs.statSync(db1).size === before, `${before} → ${fs.existsSync(db1) ? fs.statSync(db1).size : 'محذوف'}`);
    check('والسجلّ يقول لماذا انتقل',
        (second?.logs || []).some((l: string) => /already carries a database — building in/.test(l)),
        (second?.logs || []).filter((l: string) => /fresh build/.test(l)).join(' | ').slice(0, 160));

    console.log('\n[3] وكلمة مرور المالك تعمل فعلاً');
    const msg = String(second?.output?.message || '');
    check('لا اعتذار عن كلمة مرور قديمة', !/password is the OLD one/.test(msg),
        (msg.split('\n').find(l => /OLD one/.test(l)) || '').slice(0, 120));
    // The message's real shape: «Owner account (shown once): a@b.local / secret».
    const cred = msg.match(/Owner account[^:]*:\s*(\S+@\S+)\s*\/\s*(\S+)/);
    console.log(`   ℹ️ ${cred ? `${cred[1]} / ${String(cred[2]).slice(0, 3)}…` : 'لم أعثر على البيانات في الرسالة'}`);
    check('الرسالة تحمل بريد المالك وكلمته', !!cred, msg.split('\n').find(l => /owner/i.test(l))?.slice(0, 140) || '');

    if (cred && fs.existsSync(path.join(dir2, 'node_modules'))) {
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        const port = 4900 + Math.floor(Math.random() * 90);
        let up: (v: boolean) => void = () => { /* set below */ };
        const listening = new Promise<boolean>(r => { up = r; });
        const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: dir2, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
        });
        child.done.then(() => up(false));
        const ok = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 15_000))]);
        if (ok) {
            const login: any = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cred[1], password: cred[2] }),
            }).then(r => r.json()).catch(() => null);
            check('ودخل المالك بها فعلاً — لا وعد على ورق', !!login?.token, JSON.stringify(login || {}).slice(0, 120));
        } else check('الخادم أقلع للتجربة', false, 'لم يقلع');
        try { child.kill(); } catch { /* already gone */ }
    } else {
        console.log('   ℹ️ تخطّيت تجربة الدخول (لا حزم مثبتة)');
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
