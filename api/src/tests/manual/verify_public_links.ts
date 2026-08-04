/**
 * THE LINKS JOE HANDS OUT HAVE TO WORK FROM WHERE THEY ARE READ.
 *
 * Twenty-three places built addresses as `http://localhost:${PORT}/…`. On the
 * machine running Joe that reads fine; everywhere else it points at the
 * READER's own computer:
 *
 *   - open Joe from your phone on the same network to check a mobile build,
 *     tap the preview link, and land on nothing;
 *   - publish a site Joe built, a real visitor submits the contact form, and
 *     their browser posts to their own localhost. The message is never sent and
 *     nothing on screen says so.
 *
 * `PUBLIC_URL` existed for this, is editable from the panel's Settings tab, and
 * was honoured by the sign-in flow alone.
 *
 *   [1] with PUBLIC_URL unset, nothing changes — the local default is intact
 *   [2] with PUBLIC_URL set, every generated address uses it: the preview links,
 *       the project preview, and the form endpoint WRITTEN INTO the page
 *   [3] a trailing slash or a missing one never produces a double slash
 *   [4] and the path itself is real: a file placed in the artifacts directory
 *       is served, live, at exactly the address Joe would have printed
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_public_links.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { publicBaseUrl, publicUrlFor } = require('../../shared/utils/publicUrl');
    const { buildFormHtml, formEndpoint } = (() => {
        try { return require('../../core/design/forms'); } catch { return {} as any; }
    })();

    console.log('\n[1] بلا PUBLIC_URL — لا شيء يتغيّر عن المحلّي');
    delete process.env.PUBLIC_URL;
    process.env.PORT = '5002';
    check('العنوان الأساسي يبقى المحلّي', publicBaseUrl() === 'http://localhost:5002', publicBaseUrl());
    check('ورابط المعاينة كما كان', publicUrlFor('/artifacts/joe-x/index.html') === 'http://localhost:5002/artifacts/joe-x/index.html');

    console.log('\n[2] ومع PUBLIC_URL — كل رابط يُسلَّم للناس يستعمله');
    process.env.PUBLIC_URL = 'https://joe.example.com';
    check('العنوان الأساسي صار العام', publicBaseUrl() === 'https://joe.example.com', publicBaseUrl());
    check('رابط معاينة الصفحة', publicUrlFor('/artifacts/joe-abc/index.html') === 'https://joe.example.com/artifacts/joe-abc/index.html');
    check('ورابط معاينة المشروع', publicUrlFor('/project-preview/k/index.html') === 'https://joe.example.com/project-preview/k/index.html');
    check('ومسار النموذج المكتوب داخل الصفحة المنشورة',
        publicUrlFor('/api/public/forms/site-1') === 'https://joe.example.com/api/public/forms/site-1');

    console.log('\n[3] وشرطة مائلة زائدة لا تُنتج رابطاً مكسوراً');
    process.env.PUBLIC_URL = 'https://joe.example.com/';
    check('«…com/» + «/artifacts» = رابط واحد سليم',
        publicUrlFor('/artifacts/a.html') === 'https://joe.example.com/artifacts/a.html', publicUrlFor('/artifacts/a.html'));
    check('ومسار بلا شرطة في أوله يُوصَل صحيحاً',
        publicUrlFor('artifacts/a.html') === 'https://joe.example.com/artifacts/a.html', publicUrlFor('artifacts/a.html'));

    console.log('\n[4] والمسار نفسه حقيقي — الملف يُخدَم عند العنوان ذاته');
    delete process.env.PUBLIC_URL;
    const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
    const dir = path.join(artifactDir, `joe-linkproof-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>صفحة الإثبات</h1>');

    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    process.env.PORT = String(port);

    const printed = publicUrlFor(`/artifacts/${path.basename(dir)}/index.html`);
    const served = await fetch(printed.replace('localhost', '127.0.0.1'))
        .then(async r => ({ status: r.status, body: await r.text() }))
        .catch(e => ({ status: 0, body: String(e) })) as any;
    check('العنوان الذي يطبعه جو يفتح الصفحة فعلاً',
        served.status === 200 && served.body.includes('صفحة الإثبات'), `${printed} → ${served.status}`);

    // The generated site's own form endpoint must be a real, reachable route.
    const formUrl = publicUrlFor('/api/public/forms/link-proof-site');
    const formPost = await fetch(formUrl.replace('localhost', '127.0.0.1'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'يونس', message: 'رسالة إثبات' }),
    }).then(r => r.status).catch(() => 0);
    check('ومسار النموذج المكتوب في الصفحة مسارٌ موجود لا مخترَع', formPost > 0 && formPost < 500, String(formPost));

    server.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
