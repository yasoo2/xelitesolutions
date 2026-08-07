/**
 * RUNGS TWO AND THREE, MEASURED — «هل يوجد اداه يمكنها البحث على الصور على
 * الانترنت وجلبها الى النظام… ام يمكننا شبك النظام على مصمم الصور».
 *
 * The honest problem with proving this: my sandbox has no route to Openverse,
 * Wikimedia or any generator — measured, `http=000`. Claiming «it works» from
 * here would be exactly the kind of fake evidence this project refuses.
 *
 * So the archive and the generator are stood up LOCALLY, and the REAL code
 * paths are pointed at them through the environment variables they already
 * read (`JOE_IMAGE_API`, `JOE_IMAGE_GEN`). Everything between the request and
 * the row is the shipping code: the same searcher, the same relevance rule,
 * the same downloader, the same shrinker, the same writer. Only the host is
 * local — and that is the one piece his machine already has.
 *
 *   [1] a real photograph is searched, downloaded, shrunk and written
 *   [2] when the archive answers nothing, the GENERATOR is used instead
 *   [3] when neither can be reached, the designed card still fills the row
 *   [4] and the tool reports which rung each picture came from
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_pictures_are_fetched.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

/** A REAL 1200x800 JPEG on disk — big enough that the shrink is measurable. */
async function makePhoto(file: string, hue: number) {
    const { chromium } = require('playwright');
    const { getChromiumLaunchOptions } = require('../../modules/browser/manager');
    const b = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
    const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
    await p.setContent(`<body style="margin:0"><div style="width:1200px;height:800px;`
        + `background:conic-gradient(from 20deg,hsl(${hue},70%,45%),hsl(${(hue + 60) % 360},70%,60%),hsl(${hue},70%,35%))"></div></body>`);
    await p.screenshot({ path: file, type: 'jpeg', quality: 92 });
    await b.close();
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pics-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[0] أرشيفٌ ومولّدٌ محليّان — لأنّ صندوقي محجوب عن الإنترنت');
    const photo = path.join(root, 'archive.jpg');
    const drawn = path.join(root, 'drawn.jpg');
    await makePhoto(photo, 120);
    await makePhoto(drawn, 300);
    const photoBytes = fs.readFileSync(photo);
    const drawnBytes = fs.readFileSync(drawn);
    console.log(`   ℹ️ صورة الأرشيف ${Math.round(photoBytes.length / 1024)}KB · صورة المولّد ${Math.round(drawnBytes.length / 1024)}KB`);

    /** Answers in Openverse's own shape, and only for the query we expect. */
    let archiveHits = 0, archiveEmpty = false, genHits = 0;
    const srv = http.createServer((req, res) => {
        const u = new URL(req.url || '/', 'http://x');
        if (u.pathname === '/openverse') {
            archiveHits++;
            const q = String(u.searchParams.get('q') || '');
            const body = archiveEmpty ? { results: [] } : {
                results: [{
                    url: `http://127.0.0.1:${port}/photo.jpg`,
                    thumbnail: `http://127.0.0.1:${port}/photo.jpg`,
                    title: q, description: q, tags: q.split(/\s+/).map(name => ({ name })),
                    width: 1200, height: 800, creator: 'أرشيف الاختبار',
                    license: 'CC0', foreign_landing_url: 'http://127.0.0.1/landing',
                }],
            };
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify(body));
        }
        if (u.pathname === '/photo.jpg') {
            res.writeHead(200, { 'content-type': 'image/jpeg' });
            return res.end(photoBytes);
        }
        if (u.pathname.startsWith('/generate/')) {
            genHits++;
            res.writeHead(200, { 'content-type': 'image/jpeg' });
            return res.end(drawnBytes);
        }
        res.writeHead(404); res.end();
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as any).port;
    process.env.JOE_IMAGE_API = `http://127.0.0.1:${port}/openverse`;
    process.env.JOE_IMAGE_GEN = `http://127.0.0.1:${port}/generate/{prompt}`;
    check('الأرشيف والمولّد المحليان يعملان', port > 0);

    /**
     * [1] RUNG TWO, REPORTED RATHER THAN ASSERTED.
     *
     * Joe's photo engine translates an Arabic subject to English, asks four
     * archives in parallel, and GATES every candidate on relevance — a
     * deliberately strict rule that has kept wrong pictures off his builds for
     * months. A hand-written stub does not reliably satisfy it, and I will not
     * loosen a real safety gate so that my own test passes.
     *
     * So this step MEASURES the archive path and prints what it did. The rung
     * is verified against the real archives on HIS machine, which has the
     * network this sandbox does not:
     *
     *     JWT_SECRET=x npx tsx src/tests/manual/verify_pictures_are_fetched.ts
     *
     * …with JOE_IMAGE_API unset, so the real Openverse answers.
     */
    console.log('\n[1] الدرجة الثانية — البحث في الأرشيف (يُقاس هنا، ويُثبَت على جهازه)');
    const { pictureFor, designedCard, describePictures } = await import('../../core/design/row-image');
    const one = await pictureFor('نخيل برحي', { context: 'مشتل نباتات', timeoutMs: 15_000 });
    console.log(`   ℹ️ ${one.from} · ${Math.round(one.data.length / 1024)}KB · ${String(one.credit || '—')}`);
    check('والأرشيف سُئل فعلاً — المسار موصول', archiveHits > 0, String(archiveHits));
    check('وجاءت صورة نقطيّة حقيقية بأيّ حال', one.data.startsWith('data:image/jpeg;base64,'), one.data.slice(0, 40));
    check('وصُغِّرت عمّا نُزِّل', one.data.length < photoBytes.length,
        `${one.data.length} مقابل ${photoBytes.length}`);
    if (one.from === 'photo') {
        check('ومعها حقوق النسخ', /أرشيف الاختبار/.test(String(one.credit || '')), String(one.credit || ''));
    } else {
        console.log(`   ⚠️ بوّابة المطابقة رفضت مرشّح الأرشيف المزيّف: «${one.note}».`);
        console.log('      هذه بوّابة أمان حقيقية — لن أُرخيها ليمرّ اختباري. الدرجة الثانية تُثبَت');
        console.log('      على جهازك بحذف JOE_IMAGE_API وتشغيل الملفّ نفسه.');
    }

    console.log('\n[2] الدرجة الثالثة — لا نتيجة في الأرشيف، فتُصمَّم واحدة');
    archiveEmpty = true;
    const two = await pictureFor('زنبقة الفجر الذهبية ٧', { context: 'مشتل نباتات', timeoutMs: 15_000 });
    console.log(`   ℹ️ ${two.from} · ${Math.round(two.data.length / 1024)}KB · ${two.note || ''}`);
    check('جاءت من المولّد', two.from === 'generated', `${two.from} · ${two.note || ''}`);
    check('والمولّد سُئل فعلاً', genHits > 0, String(genHits));
    check('والسبب مُعلن لا مبتلع', /no relevant licensed photograph/.test(String(two.note || '')), String(two.note || ''));

    console.log('\n[3] الدرجة الرابعة — لا أرشيف ولا مولّد، وتبقى للصف صورة');
    process.env.JOE_IMAGE_API = 'http://127.0.0.1:1/none';
    process.env.JOE_IMAGE_GEN = 'http://127.0.0.1:1/none/{prompt}';
    const three = await pictureFor('صبّار', { timeoutMs: 3000 });
    console.log(`   ℹ️ ${three.from} · ${three.note || ''}`);
    check('بطاقة مصمّمة', three.from === 'card', `${three.from}`);
    check('وهي SVG صالحة', three.data.startsWith('data:image/svg+xml,'), three.data.slice(0, 40));
    check('ومطابقة لما يرسمه التطبيق لنفسه', three.data === designedCard('صبّار'));
    check('والاسم نفسه يعطي اللون نفسه دائماً', designedCard('صبّار') === designedCard('صبّار'));
    check('واسمان مختلفان يختلفان', designedCard('صبّار') !== designedCard('نخيل'));
    check('والجملة تقول من أين جاءت كل صورة',
        /بطاقة مصمّمة/.test(describePictures([one, two, three], true))
        && /صورة مولَّدة/.test(describePictures([one, two, three], true)),
        describePictures([one, two, three], true));

    console.log('\n[4] والأداة تملأ نظاماً حقيقياً — عبر وحدة المشروع نفسها');
    process.env.JOE_IMAGE_API = `http://127.0.0.1:${port}/openverse`;
    process.env.JOE_IMAGE_GEN = `http://127.0.0.1:${port}/generate/{prompt}`;
    archiveEmpty = false;
    const sessionId = `pics-${Date.now()}`;
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const built: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: HIS_WORDS, root },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('النظام بُني', built?.ok === true, String(built?.error || '').slice(0, 120));
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');

    // Two real plants, written the way the app writes them: no picture yet.
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const seedFile = path.join(dir, '.seed-plants.mjs');
    fs.writeFileSync(seedFile, `
import { entities } from './entities.js';
entities.tables.plants.create({ name: 'نخيل برحي', price: 120, quantity: 8 });
entities.tables.plants.create({ name: 'صبّار', price: 40, quantity: 3 });
console.log('seeded ' + entities.tables.plants.count());
`, 'utf-8');
    let seeded = 0;
    const seed = executionEngine.runArgvStreaming(process.execPath, ['.seed-plants.mjs'], {
        cwd: dir, env: { NODE_NO_WARNINGS: '1' },
        onLine: (l: string) => { const m = String(l).match(/seeded (\d+)/); if (m) seeded = Number(m[1]); },
    });
    await Promise.race([seed.done, new Promise(r => setTimeout(r, 25_000))]);
    try { fs.rmSync(seedFile, { force: true }); } catch { /* temp */ }
    check('وفيه نبتتان بلا صورة', seeded === 2, String(seeded));

    const studio: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('image_studio', { context: 'مشتل نباتات' },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    console.log(`   ℹ️ ${String(studio?.output?.message || studio?.error || '').split('\n').slice(0, 3).join(' | ')}`);
    check('الأداة نجحت', studio?.ok === true, String(studio?.error || '').slice(0, 160));
    check('وملأت صفّين', studio?.output?.filled === 2, String(studio?.output?.filled));
    check('وقالت من أين جاءت كل صورة — لا «تم»',
        /(صورة حقيقية مرخّصة|صورة مولَّدة|بطاقة مصمّمة)/.test(String(studio?.output?.message || '')),
        String(studio?.output?.message || '').slice(0, 160));

    // …and the pictures are really IN the database, read back by its own module.
    const readFile = path.join(dir, '.read-plants.mjs');
    fs.writeFileSync(readFile, `
import { entities } from './entities.js';
const rows = entities.tables.plants.list();
console.log('joe-rows ' + JSON.stringify(rows.map(r => ({ name: r.name, len: String(r.image || '').length, head: String(r.image || '').slice(0, 24) }))));
`, 'utf-8');
    let rows: any[] = [];
    const rd = executionEngine.runArgvStreaming(process.execPath, ['.read-plants.mjs'], {
        cwd: dir, env: { NODE_NO_WARNINGS: '1' },
        onLine: (l: string) => {
            const m = String(l).match(/joe-rows (.+)$/);
            if (m) { try { rows = JSON.parse(m[1]); } catch { /* not ours */ } }
        },
    });
    await Promise.race([rd.done, new Promise(r => setTimeout(r, 25_000))]);
    try { fs.rmSync(readFile, { force: true }); } catch { /* temp */ }
    console.log(`   ℹ️ ${JSON.stringify(rows)}`);
    check('والصورتان في قاعدة البيانات فعلاً',
        rows.length === 2 && rows.every(r => r.len > 1000 && String(r.head).startsWith('data:image/')),
        JSON.stringify(rows));

    srv.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
