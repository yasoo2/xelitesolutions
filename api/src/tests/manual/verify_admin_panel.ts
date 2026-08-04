/**
 * THE SUPER-ADMIN PANEL, MEASURED.
 *
 * `/super-admin` renders SystemManagement.tsx (1249 lines) against
 * api/routes/admin.ts. An audit of the pair found the panel half-dead on the
 * user's own machine, and three features built on one side only:
 *
 *   1. GET /admin/deployments took 10013ms and answered 500 — Mongoose does not
 *      fail without a database, it BUFFERS, and Joe runs locally with no
 *      MongoDB. The panel polled that route every 15s (every 3s with the log
 *      modal open), so the Deployments tab spent its life stacking ten-second
 *      requests that could only fail, and showed an empty list with no reason.
 *   2. The live-log listener waited for `admin:deployment_log` carrying
 *      `{ id, log }`. The server has always sent `admin:deploy_log` carrying
 *      `{ deploymentId, log, ts }` — wrong name AND wrong field, so not one
 *      line ever arrived. `admin:deploy_status` had no listener at all.
 *   3. POST /admin/rollback/:id and DELETE /admin/deployments/:id existed on
 *      the server with no button anywhere — the rollback icon was even
 *      imported and never rendered.
 *
 * This boots the REAL app with no database (exactly the user's setup) and
 * measures each one.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_admin_panel.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const WEB = path.join(__dirname, '..', '..', '..', '..', 'web', 'src');
const panel = fs.readFileSync(path.join(WEB, 'pages', 'admin', 'SystemManagement.tsx'), 'utf-8');

async function main() {
    console.log('\n[1] الخادم الحقيقي، بلا قاعدة بيانات — كما هو حال جهازك');
    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const token = jwt.sign({ sub: 'panel-proof', role: 'SUPER_ADMIN', email: 'proof@joe.local' }, process.env.JWT_SECRET!);

    const probe = async (p: string, method = 'GET') => {
        const t0 = Date.now();
        const r = await fetch(`http://127.0.0.1:${port}/api/admin${p}`, {
            method, headers: { Authorization: `Bearer ${token}` },
        });
        const text = await r.text();
        return { status: r.status, ms: Date.now() - t0, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
    };

    const deployments = await probe('/deployments');
    check('‎/admin/deployments يردّ فوراً لا بعد 10 ثوانٍ (كان 10013ms ثم 500)',
        deployments.ms < 1500, `${deployments.ms}ms`);
    check('…ويقول السبب باسم يفهمه الواجهة: db_offline',
        deployments.status === 503 && deployments.json?.error === 'db_offline',
        `${deployments.status} ${deployments.text.slice(0, 90)}`);
    check('…وبرسالة عربية للمستخدم لا شيفرة خام', /[؀-ۿ]/.test(String(deployments.json?.message || '')));

    for (const [p, m] of [['/users', 'GET'], ['/deploy', 'POST'], ['/rollback/x', 'POST'], ['/settings/notifications', 'GET']] as const) {
        const r = await probe(p, m);
        check(`‎${m} /admin${p} محروس بنفس الحارس (503 فوري)`, r.status === 503 && r.ms < 1500, `${r.status} في ${r.ms}ms`);
    }

    console.log('\n[2] وما لا يحتاج قاعدة بيانات ما زال يعمل بالكامل');
    const health = await probe('/system/health');
    check('‎/admin/system/health يعمل ويقيس فعلاً', health.status === 200 && !!health.json?.system?.cpu,
        `${health.status} cpu=${health.json?.system?.cpu}`);
    check('…ويحمل حالة خدمة الـAPI التي كانت اللوحة ترميها', !!health.json?.apiService?.name,
        JSON.stringify(health.json?.apiService));
    const backups = await probe('/system/backups');
    check('‎/admin/system/backups يعمل', backups.status === 200, String(backups.status));
    const auto = await probe('/autodeploy/status');
    check('‎/admin/autodeploy/status يعمل', auto.status === 200, String(auto.status));

    console.log('\n[3] الحارس ما زال يمنع غير المصرّح له');
    const anon = await fetch(`http://127.0.0.1:${port}/api/admin/system/health`);
    check('بلا توكن → 401', anon.status === 401, String(anon.status));
    const plain = jwt.sign({ sub: 'u', role: 'USER' }, process.env.JWT_SECRET!);
    const asUser = await fetch(`http://127.0.0.1:${port}/api/admin/system/health`, { headers: { Authorization: `Bearer ${plain}` } });
    check('بمستخدم عادي → 403 (اللوحة لسوبر أدمن فقط)', asUser.status === 403, String(asUser.status));

    console.log('\n[4] عقد الأحداث: ما تنصت له اللوحة هو ما يبثّه الخادم فعلاً');
    const apiSrc = (dir: string): string => fs.readdirSync(dir, { withFileTypes: true })
        .map(e => e.isDirectory() ? (e.name === 'node_modules' ? '' : apiSrc(path.join(dir, e.name)))
            : /\.ts$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), 'utf-8') : '').join('\n');
    const api = apiSrc(path.join(__dirname, '..', '..'));
    const listened = [...new Set([...panel.matchAll(/msg\??\.type === '([a-z_:]+)'/g)].map(m => m[1]))];
    check(`اللوحة تنصت لـ${listened.length} حدثاً — وكلها يبثّها الخادم`,
        listened.length >= 2 && listened.every(n => api.includes(`'${n}'`)),
        listened.filter(n => !api.includes(`'${n}'`)).join(', ') || listened.join(', '));
    check('السجل الحيّ يقرأ الحقل الصحيح deploymentId (كان يقرأ id)',
        panel.includes('msg.data?.deploymentId'));
    // The dead name still appears — in the comment that explains why it was dead.
    // What must be gone is the COMPARISON.
    check('الاسم الميّت admin:deployment_log لم يعد يُقارَن به',
        !/type === 'admin:deployment_log'/.test(panel));
    check('وحالة النشر صارت لها مستمع', panel.includes("admin:deploy_status"));

    console.log('\n[5] قدرات كانت موجودة على الخادم ولا يمكن الوصول إليها');
    check('زر الرجوع (rollback) صار موجوداً وينادي المسار الصحيح',
        /rollback\/\$\{dep\._id\}/.test(panel) && panel.includes('<RotateCcw'));
    check('حذف سجلّ واحد صار ممكناً', /deployments\/\$\{dep\._id\}/.test(panel));
    check('سبب فشل النشرة يُعرض بدل شارة حمراء صامتة', panel.includes('dep.error &&'));

    console.log('\n[6] شيفرة ميتة أُزيلت');
    const dead = ['ArrowLeft', 'CheckCircle', 'Database', 'ExternalLink', 'MoreHorizontal', 'Info'];
    check(`${dead.length} أيقونات مستوردة بلا استعمال أُزيلت`, dead.every(d => !panel.includes(`    ${d},`) && !panel.includes(`${d},\n`) === false || !new RegExp(`\\b${d}\\b`).test(panel.split('} from \'lucide-react\'')[0])),
        dead.filter(d => new RegExp(`\\b${d}\\b`).test(panel.split("} from 'lucide-react'")[0])).join(', '));
    check('مفتاح طيّ القسم صار يعمل فعلاً (كان يضبط حالة لا يقرؤها أحد)',
        panel.includes("expandedSection === 'containers' && (") && panel.includes('<ChevronUp'));
    const cfg = fs.readFileSync(path.join(WEB, 'config.ts'), 'utf-8');
    check('config.ts: منطق اشتقاق عنوان الـAPI الميت أُزيل (كان يُحسب ثم يُهمل)',
        !cfg.includes('function inferApiUrl') && !cfg.includes('const apiEnvRaw') && cfg.includes("const API_URL = '/api'"));
    const adminRoutes = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'routes', 'admin.ts'), 'utf-8');
    check('المسار المكرّر /system/containers أُزيل (لا ينادى، و/system/health يحمله)',
        !adminRoutes.includes("router.get('/system/containers'"));

    console.log('\n[7] ولا مسار تناديه اللوحة إلا وهو مسجّل');
    const { unreachableUiPaths } = require('../routeMap');
    const missing = unreachableUiPaths();
    check('عقد المسارات ما زال كاملاً بعد كل هذا الحذف', missing.length === 0,
        missing.map((m: any) => m.path).join(' | '));

    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
