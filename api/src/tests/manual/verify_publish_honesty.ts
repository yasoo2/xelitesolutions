/**
 * PUBLISHING TELLS YOU WHAT IT PUBLISHED.
 *
 * Publishing copied files to the open internet without ever reading them. A
 * page Joe built can carry an address that only resolves on the machine that
 * built it — the contact form's endpoint above all — and that produces the
 * quietest failure in the whole product:
 *
 *   the visitor fills in the form, presses send, sees nothing wrong, and the
 *   request goes to THEIR own computer, where nothing is listening. The owner
 *   sees no messages and no error. Neither of them ever finds out.
 *
 * The scan runs on the files as they are staged, and its verdict travels with
 * the success message. It is a warning, never a refusal — the user asked to
 * publish, and publishing is what happens.
 *
 *   [1] a real generated page, with a form posting to localhost: named, with
 *       the file it is in and what will break
 *   [2] every private shape a machine actually produces: 127.0.0.1, a LAN
 *       address, a .local host — inside HTML, JS and JSON alike
 *   [3] a genuinely public site produces NO warning (silence has to mean
 *       something, or the warning is noise)
 *   [4] a public CDN or the site's own domain is never mistaken for private
 *   [5] and the publish tool really carries it into what the user reads
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_publish_honesty.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const mk = (files: Record<string, string>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-publish-'));
    for (const [rel, body] of Object.entries(files)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body);
    }
    return dir;
};

async function main() {
    const { findPrivateEndpoints, privateEndpointWarning } = require('../../shared/utils/privateEndpoints');

    console.log('\n[1] صفحة كما يبنيها جو — نموذج تواصل يشير إلى الجهاز نفسه');
    const site = mk({
        'index.html': `<!doctype html><html lang="ar"><body>
<h1>مقهى الرصيف</h1>
<form onsubmit="fetch('http://localhost:5002/api/public/forms/site-7',{method:'POST'})">
<input name="name"><button>أرسل</button></form>
</body></html>`,
        'assets/app.js': `const API='http://192.168.1.20:4100/api/products';`,
    });
    const hits = findPrivateEndpoints(site);
    check('وُجدت العناوين المحلّية', hits.length >= 2, JSON.stringify(hits));
    check('ويُسمّى الملف الذي فيه كلٌّ منها',
        hits.some((h: any) => h.file === 'index.html') && hits.some((h: any) => h.file.includes('app.js')),
        JSON.stringify(hits.map((h: any) => h.file)));
    const note = privateEndpointWarning(site);
    check('والتحذير يقول ماذا سيحدث للزائر بالضبط', /جهازه هو/.test(note) && /بلا رسالة خطأ/.test(note), note.slice(0, 120));
    check('ويعطي الحلّ لا الشكوى فقط', /PUBLIC_URL/.test(note) && /الإعدادات/.test(note));
    console.log('\n———— نصّ التحذير كما يقرؤه المستخدم ————');
    console.log(note.trim());
    console.log('————————————————————————————————\n');

    console.log('[2] كل شكل خاصّ تُنتجه الأجهزة فعلاً');
    for (const [label, body, file] of [
        ['127.0.0.1', `<a href="http://127.0.0.1:5002/x">l</a>`, 'index.html'],
        ['شبكة محلّية 10.x', `{"api":"http://10.0.0.8:3000/v1"}`, 'config.json'],
        ['شبكة محلّية 172.20', `const u='http://172.20.5.4:8080/api';`, 'app.js'],
        ['مضيف .local', `<img src="http://joe-pc.local:5002/artifacts/a.png">`, 'page.html'],
    ] as Array<[string, string, string]>) {
        const d = mk({ [file]: body });
        check(`${label} يُكتشَف`, findPrivateEndpoints(d).length === 1, JSON.stringify(findPrivateEndpoints(d)));
        fs.rmSync(d, { recursive: true, force: true });
    }

    console.log('\n[3] وموقع عامّ فعلاً لا يُحذَّر منه — الصمت هنا يعني شيئاً');
    const clean = mk({
        'index.html': `<!doctype html><html><body><form action="https://joe.example.com/api/public/forms/s"></form>
<img src="https://images.unsplash.com/photo-1.jpg"><script src="https://cdn.jsdelivr.net/x.js"></script></body></html>`,
        'style.css': `body{background:url(https://fonts.gstatic.com/a.woff2)}`,
    });
    check('لا تحذير على موقع عامّ', privateEndpointWarning(clean) === '', privateEndpointWarning(clean).slice(0, 80));
    check('ولا يُخلَط عنوان CDN أو نطاق الموقع بالمحلّي', findPrivateEndpoints(clean).length === 0);

    console.log('\n[4] وما لا يُقرأ لا يُفحَص — لا نُبطئ النشر بالصور والحزم');
    const heavy = mk({
        'index.html': '<h1>نظيف</h1>',
        'node_modules/pkg/index.js': `const x='http://localhost:9999/leak';`,
        'photo.png': 'http://localhost:1234/not-really-text',
    });
    check('node_modules مستثناة', !findPrivateEndpoints(heavy).some((h: any) => h.file.includes('node_modules')));
    check('والملفات غير النصّية مستثناة', findPrivateEndpoints(heavy).length === 0, JSON.stringify(findPrivateEndpoints(heavy)));

    console.log('\n[5] وأداة النشر تحمله فعلاً إلى ما يقرؤه المستخدم');
    const deploySrc = fs.readFileSync(path.join(process.cwd(), 'src/modules/tools/definitions/DeployPagesTool.ts'), 'utf-8');
    check('النشر يفحص ما يُنشَر', /privateEndpointWarning\(stage\)/.test(deploySrc));
    check('والتحذير داخل رسالة النجاح نفسها', /\$\{privateNote\}`/.test(deploySrc));
    check('ولا يمنع النشر إن فشل الفحص', /catch \{ \/\* a warning must never block a publish/.test(deploySrc));

    for (const d of [site, clean, heavy]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* cleanup */ } }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
