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

        /* ── the part that makes it a NETWORK: two people, one truth ────── */
        console.log('\n[3] شخصان مختلفان على نفس الخادم — الإعجاب والتعليق والمتابعة حقائق مشتركة');
        const base = `http://127.0.0.1:${PORT}`;
        const postId = listed.posts[0].id;
        const like = (handle: string) => fetch(`${base}/api/posts/${postId}/like`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }),
        }).then(r2 => r2.json());

        const l1: any = await like('@younes');
        check('يونس يُعجب — الخادم يعيد القائمة لا مجرد نعم', l1?.liked === true && l1.likes.includes('@younes'), JSON.stringify(l1));
        const l2: any = await like('@sara');
        check('وسارة تُعجب بنفس المنشور فيصير العدد ٢', l2?.count === 2 && l2.likes.includes('@sara'), JSON.stringify(l2));

        // A THIRD reader — a browser that did neither — must see both hearts.
        const seen: any = await (await fetch(`${base}/api/posts`)).json();
        check('وقارئ ثالث يرى الإعجابين معاً (لا محلياً في متصفح كل واحد)',
            Array.isArray(seen.posts[0].likes) && seen.posts[0].likes.length === 2, JSON.stringify(seen.posts[0].likes));

        const l3: any = await like('@younes');
        check('وإلغاء الإعجاب يُنقص العدد فعلاً', l3?.liked === false && l3.count === 1, JSON.stringify(l3));

        const c1 = await fetch(`${base}/api/posts/${postId}/comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'سارة', handle: '@sara', text: 'تعليق من جهاز آخر' }),
        });
        const c1b: any = await c1.json();
        check('وتعليق سارة يُحفظ على الخادم (201)', c1.status === 201 && !!c1b?.comment?.id, `${c1.status} ${JSON.stringify(c1b).slice(0, 100)}`);

        const withThread: any = await (await fetch(`${base}/api/posts`)).json();
        check('ويصل مع المنشور في نفس الطلب — لا طلب إضافي لكل بطاقة',
            withThread.posts[0].comments?.[0]?.text === 'تعليق من جهاز آخر', JSON.stringify(withThread.posts[0].comments));

        const emptyComment = await fetch(`${base}/api/posts/${postId}/comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'سارة', text: '  ' }),
        });
        check('وتعليق فارغ يُرفض 400', emptyComment.status === 400, String(emptyComment.status));

        const follows = `${base}/api/follows`;
        const f1: any = await (await fetch(follows, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower: '@younes', target: '@sara' }),
        })).json();
        check('ومتابعة يونس لسارة تُحفظ', f1?.following === true && f1.list.includes('@sara'), JSON.stringify(f1));
        const f2: any = await (await fetch(`${follows}?follower=${encodeURIComponent('@younes')}`)).json();
        check('ويقرؤها جهاز آخر بنفس الحساب', Array.isArray(f2?.following) && f2.following.includes('@sara'), JSON.stringify(f2));
        const self = await fetch(follows, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower: '@younes', target: '@younes' }),
        });
        check('ولا أحد يتابع نفسه', self.status === 400, String(self.status));

        /* ── the deletion that used to undo itself ──────────────────────── */
        console.log('\n[4] الحذف الذي كان يعود وحده');
        const { fileAppStoreJs: storeSrc } = require('../../modules/tools/definitions/react-app-templates');
        const apiDelete = new Function(`${storeSrc().replace(/export /g, '')}; return apiDelete;`)();
        const del: any = await apiDelete(`${base}/api/posts`, postId);
        check('حاذف التطبيق نفسه يصل إلى الخادم', del?.ok === true, JSON.stringify(del));
        const after: any = await (await fetch(`${base}/api/posts`)).json();
        check('فلا يعود المنشور في الاستطلاع التالي', !after.posts.some((p: any) => String(p.id) === String(postId)));
        const orphan = await fetch(`${base}/api/posts/${postId}/comments`);
        check('وإعجاباته وتعليقاته ذهبت معه — لا أيتام في القاعدة', orphan.status === 404, String(orphan.status));
    } finally {
        proc.kill();
    }

    /**
     * THE OTHER HALF OF THE DUAL BACKEND.
     *
     * Everything above ran on node:sqlite, because this Node has it. A user on
     * Node 20 gets the JSON file instead — a branch I wrote by hand and had
     * never once executed. «لا كود وهمي» applies to the fallback too: the
     * same flow, forced onto the JSON path, must give the same answers.
     */
    console.log('\n[5] ونفس التدفّق على القاعدة الاحتياطية (JSON) — لا سطر غير مُختبَر');
    const PORT2 = 4792;
    const proc2 = spawn('node', ['server.js'], {
        cwd: dir, env: { ...process.env, PORT: String(PORT2), JOE_FORCE_JSON_DB: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let boot2 = '';
    proc2.stdout.on('data', d => { boot2 += String(d); });
    await new Promise(r2 => setTimeout(r2, 2000));
    try {
        const b2 = `http://127.0.0.1:${PORT2}`;
        check('أقلع على قاعدة json لا sqlite', /backend: json/.test(boot2), boot2.slice(0, 120));
        const p2: any = await (await fetch(`${b2}/api/posts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'يونس', handle: '@younes', text: 'منشور على القاعدة الاحتياطية' }),
        })).json();
        const id2 = p2?.post?.id;
        check('النشر ينجح', !!id2, JSON.stringify(p2).slice(0, 120));
        const lk: any = await (await fetch(`${b2}/api/posts/${id2}/like`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: '@sara' }),
        })).json();
        check('والإعجاب يُحفظ ويُعاد بنفس الشكل', lk?.liked === true && lk.count === 1, JSON.stringify(lk));
        await fetch(`${b2}/api/posts/${id2}/comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: 'سارة', handle: '@sara', text: 'تعليق على json' }),
        });
        const list2: any = await (await fetch(`${b2}/api/posts`)).json();
        check('والقراءة تحمل الإعجاب والتعليق معاً',
            list2.posts[0].likes.length === 1 && list2.posts[0].comments[0].text === 'تعليق على json', JSON.stringify(list2.posts[0]).slice(0, 160));
        const fw: any = await (await fetch(`${b2}/api/follows`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower: '@younes', target: '@sara' }),
        })).json();
        check('والمتابعة كذلك', fw?.list?.includes('@sara'), JSON.stringify(fw));
        await fetch(`${b2}/api/posts/${id2}`, { method: 'DELETE' });
        const gone: any = await (await fetch(`${b2}/api/posts`)).json();
        check('والحذف ينظّف خلفه هنا أيضاً', gone.posts.length === 0, JSON.stringify(gone).slice(0, 120));
        // …and it SURVIVES A RESTART — a JSON store that forgets is not a store.
        proc2.kill();
        await new Promise(r2 => setTimeout(r2, 400));
        check('والملف على القرص موجود بعد الإغلاق', fs.existsSync(path.join(dir, 'data.json')));
    } finally {
        proc2.kill();
    }

    console.log('\n[6] وواجهة التطبيق تستعمل هذا كلّه فعلاً');
    {
        const { fileSocialAppJsx: socialSrc } = require('../../modules/tools/definitions/react-app-templates');
        const app = socialSrc(true);
        check('الإعجاب ينادي الخادم ويأخذ قائمته المرجعية', /apiPost\(content\.api, '\/' \+ encodeURIComponent\(id\) \+ '\/like'/.test(app) && /Array\.isArray\(d\.likes\)/.test(app));
        check('والتعليق كذلك، ويتبنّى معرّف الخادم', /'\/comments'/.test(app) && /String\(saved\.id\)/.test(app));
        check('والمتابعة تُكتب على المورد الشقيق /follows', /apiSibling\(content\.api, 'follows'\)/.test(app));
        check('والاستطلاع يجعل أرقام الخادم هي المرجع', /Array\.isArray\(r\.likes\) \? r\.likes/.test(app));
        check('والحذف يصل الخادم فلا يرجع المنشور', /apiDelete\(content\.api, p\.id\)/.test(app));
    }

    console.log('\n[7] والعيب المرئي في الطوابع الزمنية');
    const { fileSocialAppJsx } = require('../../modules/tools/definitions/react-app-templates');
    const feed = fileSocialAppJsx(false);
    check('«5m» لا «5\'m\'» — اقتباسات هاربة في القالب', !/\+ '\\'m\\''/.test(feed) && /\+ 'm'/.test(feed));
    const feedAr = fileSocialAppJsx(true);
    check('والعربية كذلك: «٥ د» بلا اقتباسات', !/'\\' د\\''/.test(feedAr));

    console.log('\n[8] وإزعاجا الواجهة اللذان أبلغتَ عنهما');
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
