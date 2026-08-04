/**
 * THE LINK THE LOG CLAIMED AND THE CODE DID NOT HAVE.
 *
 * The social build printed «full-stack link: this app reads LIVE rows from
 * http://localhost:4100/api/posts» — and behind it:
 *
 *   • the table was name/details/price with a new name on it;
 *   • POST /api/posts demanded an OWNER TOKEN, so a member could never post;
 *   • the app sent {author, handle, text, at} → 400 every time;
 *   • GET answered «{ok, posts}», a shape the app's reader did not know,
 *     so it returned null and the badge quietly stayed «local».
 *
 * Nobody reported it, because nothing printed an error. This proves the link
 * with a REAL server process and REAL HTTP.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_feed_backend.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-feed-'));

async function main() {
    console.log('\n[1] بناء خادم الخيط الحقيقي');
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const r: any = await new ApiProjectTool().execute(
        { request: 'ابنِ منصة تواصل اجتماعي فيها منشورات ومتابعين', root: ROOT }, { sessionId: 'feed-proof' });
    const dir = String(r?.output?.path || '');
    check('الخادم بُني', !!dir && fs.existsSync(path.join(dir, 'server.js')), JSON.stringify({ ok: r?.ok, dir }));

    const server = fs.readFileSync(path.join(dir, 'server.js'), 'utf-8');
    const db = fs.readFileSync(path.join(dir, 'db.js'), 'utf-8');
    check('الجدول أعمدته منشور لا كتالوج', /author TEXT NOT NULL/.test(db) && /handle/.test(db) && /image/.test(db),
        db.slice(db.indexOf('CREATE TABLE'), db.indexOf('CREATE TABLE') + 200));
    check('ولا أثر لـ name/details/price', !/details TEXT DEFAULT/.test(db) && !/price TEXT DEFAULT/.test(db));
    check('والنشر عامّ — العضو ينشر بلا رمز مالك', /app\.post\('\/api\/posts', \(req, res\)/.test(server));
    check('والقراءة تحمل الشكل الذي يفهمه التطبيق', /data: posts/.test(server));

    console.log('\n[2] وتشغيله فعلاً، ثم النشر والقراءة عبر HTTP حقيقي');
    await new Promise<void>((resolve, reject) => {
        const p = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'ignore' });
        p.on('exit', c => (c === 0 ? resolve() : reject(new Error('npm install ' + c))));
    });
    const PORT = 4791;
    const proc = spawn('node', ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let boot = '';
    proc.stdout.on('data', d => { boot += String(d); });
    await new Promise(r2 => setTimeout(r2, 2500));
    try {
        check('الخادم أقلع وأعلن قاعدته', /feed listening/.test(boot), boot.slice(0, 120));

        const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
        check('صحّة الخادم تقول عدد المنشورات', health?.ok === true && typeof health.posts === 'number', JSON.stringify(health));

        // The EXACT body the generated app sends.
        const created = await fetch(`http://127.0.0.1:${PORT}/api/posts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'يونس', handle: '@younes', text: 'أول منشور عبر الخادم', image: '', at: new Date().toISOString() }),
        });
        const createdBody: any = await created.json();
        check('النشر بجسم التطبيق نفسه ينجح (201 لا 400)', created.status === 201 && createdBody?.ok === true,
            `${created.status} ${JSON.stringify(createdBody).slice(0, 120)}`);

        const listed: any = await (await fetch(`http://127.0.0.1:${PORT}/api/posts`)).json();
        check('والقراءة تُعيد المنشور بنصّه وكاتبه',
            Array.isArray(listed?.posts) && listed.posts[0]?.author === 'يونس' && listed.posts[0]?.text.includes('أول منشور'),
            JSON.stringify(listed).slice(0, 160));

        // …and the app's OWN reader must parse that response.
        const { fileAppStoreJs } = require('../../modules/tools/definitions/react-app-templates');
        const storeJs = fileAppStoreJs();
        const apiList = new Function(`${storeJs.replace(/export /g, '')}; return apiList;`)();
        const rows = await apiList(`http://127.0.0.1:${PORT}/api/posts`);
        check('وقارئ التطبيق نفسه يفهم هذا الشكل (لم يعد يعود null)',
            Array.isArray(rows) && rows.length >= 1 && rows[0].author === 'يونس', JSON.stringify(rows).slice(0, 120));

        // An empty post is refused — the server is not a dumping ground.
        const empty = await fetch(`http://127.0.0.1:${PORT}/api/posts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'يونس', text: '   ' }),
        });
        check('ومنشور فارغ يُرفض 400', empty.status === 400, String(empty.status));
    } finally {
        proc.kill();
    }

    console.log('\n[3] والعيب المرئي في الطوابع الزمنية');
    const { fileSocialAppJsx } = require('../../modules/tools/definitions/react-app-templates');
    const feed = fileSocialAppJsx(false);
    check('«5m» لا «5\'m\'» — اقتباسات هاربة في القالب', !/\+ '\\'m\\''/.test(feed) && /\+ 'm'/.test(feed));
    const feedAr = fileSocialAppJsx(true);
    check('والعربية كذلك: «٥ د» بلا اقتباسات', !/'\\' د\\''/.test(feedAr));

    console.log('\n[4] وإزعاجا الواجهة اللذان أبلغتَ عنهما');
    const joe = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');
    check('لوحة الطرفية لم تعد تخطف التبويب عند إقلاعها',
        !/\['run_command', 'shell_execute', 'terminal_manager'/.test(joe) && /'run_command', 'shell_execute', 'npm_manager'/.test(joe));
    const audit = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
    check('ومتصفح الفحص الذاتي لا يفتح نافذة أبداً', /headless: true/.test(audit));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    console.log(`(الخادم المولَّد: ${ROOT})`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
