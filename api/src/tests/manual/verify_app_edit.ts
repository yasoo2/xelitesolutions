/**
 * THE EDIT THAT WENT BACK TO THE BROCHURE.
 *
 * The maps application built clean — 100/100 in a real browser, Leaflet on
 * disk. Then the user asked for the next thing, in his own words:
 *
 *   «اريد اعديل علىيه بان يعمب مسارات للتنقل من الى ويحدد مسار للتنقل على
 *    الخريطه مع ذكر المسافة وكم الوقت الذي نحتاجه»
 *
 * and the log answered:  [PlanningEngine] semantic router -> edit_page
 *                        Executing node: build_page  (web_page_builder)
 *
 * Joe produced a NEW static HTML page about maps — a hero, a stock photograph
 * of a globe, and «خطة 1 — 10$ شهريا» — while the React application it was
 * about was never opened. Two defects behind one symptom:
 *
 *   1. no edit verb matched the typo «اعديل», so the deterministic project
 *      route never fired and the semantic router had the last word;
 *   2. that router sends every edit_page to the PAGE builder, even when the
 *      session's active artefact is a React project.
 *
 * And the third thing: the feature itself. Asking a weak model to write
 * Leaflet routing through a diff is not engineering — the map engine now
 * carries real directions, and an app is UPGRADED from its blueprint.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_app_edit.ts
 *       (FAST=1 for the routing half only — no install, no browser)
 */
export {};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';

import fs from 'fs';
import path from 'path';
import http from 'http';
import os from 'os';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-appedit-'));
/** The sentence from the field log, typos and all. */
const FIELD_EDIT = 'اريد اعديل علىيه بان يعمب مسارات للتنقل من الى ويحدد مسار للتنقل على الخريطه مع ذكر المسافة وكم الوقت الذي نحتاجه';

function serve(root: string, port: number): Promise<http.Server> {
    const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html' };
    const srv = http.createServer((req, res) => {
        let p = decodeURIComponent(String(req.url || '/').split('?')[0]);
        if (p === '/') p = '/index.html';
        const file = path.join(root, p);
        if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(fs.readFileSync(file));
        } else { res.writeHead(404); res.end('not found'); }
    });
    return new Promise(r => srv.listen(port, () => r(srv)));
}

async function main() {
    const FAST = process.env.FAST === '1';
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');

    console.log('\n[1] الجملة الحقيقية من السجلّ — أين تهبط الآن');
    const g: any = global as any;
    g.joeProjects = { 'app-session': { dir: '/tmp/whatever', type: 'react', updatedAt: Date.now() } };
    g.joePages = {};
    const planFor = async (goal: string, sessionId: string) => {
        const p = await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } }, undefined, { sessionId });
        return (p?.steps || []).map((s: any) => s.tool).join(' + ');
    };
    check(`«${FIELD_EDIT.slice(0, 46)}…» → ${await planFor(FIELD_EDIT, 'app-session')}`,
        (await planFor(FIELD_EDIT, 'app-session')) === 'project_edit');

    console.log('\n[2] وكل صياغة أخرى لنفس النية تصل إلى المشروع لا إلى صفحة جديدة');
    const EDITS = [
        'اعديل عليه ليعرض المسافة والوقت',
        'أريده يعمل مسارات بين نقطتين',
        'ضف ميزة تحديد المسار على الخريطة',
        'اجعله يحدد الوقت اللازم للوصول',
        'خليه يدعم البحث عن الأماكن القريبة',
    ];
    for (const e of EDITS) {
        const tools = await planFor(e, 'app-session');
        check(`«${e.slice(0, 38)}» → ${tools}`, tools === 'project_edit');
    }

    console.log('\n[3] وجلسة صفحة تبقى للصفحة — الإصلاح لم يسرق مسار البناء القديم');
    g.joeProjects = {};
    g.joePages = { 'page-session': { file: 'x.html', updatedAt: Date.now() } };
    check('تعديل على صفحة مبنيّة → web_page_builder',
        (await planFor('غيّر لون الأزرار إلى الأخضر', 'page-session')) === 'web_page_builder');
    g.joeProjects = {}; g.joePages = {};
    check('وطلب بناء تطبيق جديد ما زال يبني تطبيقاً',
        /react_project/.test(await planFor('ابني تطبيق خرائط شبيه بخرائط جوجل', 'fresh-session')));

    console.log('\n[4] والمحرّك نفسه صار يعرف المسارات');
    const { fileMapAppJsx } = require('../../modules/tools/definitions/react-app-templates');
    const map = fileMapAppJsx(true);
    check('يطلب مساراً حقيقياً من OSRM', /router\.project-osrm\.org\/route\/v1\/driving/.test(map));
    check('ويرسم خط الطريق على الخريطة', /L\.polyline\(/.test(map));
    check('ويعرض المسافة والزمن معاً', /leg\.distance/.test(map) && /leg\.duration/.test(map));
    check('ويجعل الخريطة تحتضن المسار كاملاً', /fitBounds/.test(map));


    console.log('\n[4b] وطلبٌ يقول «هذا لا يكفي، حوّله إلى ملاحة» لا يبني نسخة ثالثة');
    g.joeProjects = { 'app-session': { dir: '/tmp/whatever', type: 'react', updatedAt: Date.now() } };
    g.joePages = {};
    const MEGA = [
        'زر get directions لا يعمل بشكل صحيح',
        'The current route system is not sufficient. I want to transform it into a real turn-by-turn navigation system similar to Google Maps.',
        'this is broken, please fix it',
        'حوّله إلى نظام ملاحة حقيقي',
    ];
    for (const m of MEGA) {
        const tools = await planFor(m, 'app-session');
        check(`«${m.slice(0, 44)}…» → ${tools}`, tools === 'project_edit');
    }

    console.log('\n[4c] والملاحة الحقيقية داخل المحرّك');
    check('يطلب المناورات من OSRM لا الخط فقط', /steps=true/.test(map));
    check('ويتتبّع الموقع باستمرار', /watchPosition/.test(map));
    check('ويوجّه أيقونة السيارة باتجاه السير', /bearing\(/.test(map) && /carIcon/.test(map));
    check('وينطق التعليمة صوتاً', /SpeechSynthesisUtterance/.test(map));
    check('ويكتشف الخروج عن المسار ويعيد الحساب', /offRoute/.test(map) && /rerouteFrom/.test(map));
    check('ويعرض المسافة والزمن والسرعة ووقت الوصول', /nav-nums/.test(map) && /ETA|الوصول/.test(map));
    check('ويوقف تتبّع الـ GPS عند الإنهاء (لا يستنزف البطارية)', /clearWatch/.test(map));

    console.log('\n[4d] وصدقٌ فيما لم يُبنَ');
    const { ReactProjectTool: RPT } = require('../../modules/tools/definitions/ReactProjectTool');
    const mega = await new RPT().execute({
        request: 'Build Infinity Maps with Next.js 15, FastAPI, PostgreSQL PostGIS, Redis, Docker, Kubernetes, OAuth2 two-factor, an admin panel, a developer portal, offline maps, 3D buildings, live traffic and an AI assistant.',
        skipInstall: true, skipProfile: true, root: ROOT,
    }, { sessionId: 'mega' });
    const megaMsg = String(mega?.output?.message || '');
    check('يقول صراحةً ما لم يُنفّذه من المواصفة الضخمة', /did NOT build|لم أبنِه/.test(megaMsg), megaMsg.slice(0, 120));
    for (const owed of ['Next.js', 'Docker', 'PostGIS']) {
        check(`ويسمّي «${owed}»`, megaMsg.includes(owed));
    }
    check('ولا يدّعي بناءها', !/production-ready|جاهز للإنتاج/i.test(megaMsg));

    if (FAST) {
        console.log('\n(FAST=1 — تُخطّي البناء والمتصفح)');
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(fail ? 1 : 0);
    }

    console.log('\n[5] السيناريو الحقيقي: تطبيق قديم بلا مسارات، ثم طلب المستخدم');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const built: any = await new ReactProjectTool().execute(
        { request: 'ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', skipProfile: true, root: ROOT }, { sessionId: 'edit-live' });
    const dir = String(built?.output?.path || '');
    check('التطبيق بُني وتحقّق تجميعه', !!built?.output?.built, JSON.stringify({ built: built?.output?.built }));

    // Roll the engine back to the version the user actually has on disk: a map
    // with no directions at all. This is the state the field log came from.
    const mapFile = path.join(dir, 'src', 'components', 'MapApp.jsx');
    const current = fs.readFileSync(mapFile, 'utf-8');
    const rolledBack = current
        .replace(/  \/\*\* One place name[\s\S]*?const savePlace/, '  const savePlace')
        .replace(/\{\/\* Directions[\s\S]*?<\/form>\n\n/, '');
    fs.writeFileSync(mapFile, rolledBack, 'utf-8');
    check('أعدتُ المحرّك إلى نسخة بلا مسارات (كما هو عند المستخدم)',
        !/project-osrm/.test(fs.readFileSync(mapFile, 'utf-8')));

    (global as any).joeProjects = { 'edit-live': { dir, type: 'react', updatedAt: Date.now() } };
    const { ProjectEditTool } = require('../../modules/tools/definitions/ProjectEditTool');
    const edited: any = await new ProjectEditTool().execute({ request: FIELD_EDIT }, { sessionId: 'edit-live' });
    check('التعديل عُولج كترقية للتطبيق نفسه', /حدّثتُ التطبيق نفسه/.test(String(edited?.output?.message || '')),
        String(edited?.output?.message || '').slice(0, 140));
    check('والبناء نجح بعد الترقية', edited?.output?.buildVerified === true, JSON.stringify(edited?.output?.buildVerified));
    check('والمسارات صارت في الكود فعلاً', /project-osrm/.test(fs.readFileSync(mapFile, 'utf-8')));
    check('ولم يُنشأ أي ملف صفحة دعائية', !fs.existsSync(path.join(dir, 'index.html.bak'))
        && !fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8').includes('tiers'));

    console.log('\n[6] وفي متصفح حقيقي: النموذج موجود ويطلب مساراً فعلياً');
    const { chromium } = require('playwright');
    const srv = await serve(path.join(dir, 'dist'), 4714);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const osrm: string[] = [];
        page.on('request', (r: any) => { if (/project-osrm\.org|nominatim/.test(r.url())) osrm.push(r.url()); });
        await page.goto('http://localhost:4714/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        check('لوحة «مسار التنقّل» ظاهرة', await page.getByText('مسار التنقّل').first().isVisible());
        check('وفيها حقلا «من» و«إلى»', (await page.locator('.trip input').count()) === 2);
        const btn = page.getByRole('button', { name: 'احسب المسار' });
        check('وزر «احسب المسار» معطّل قبل كتابة الوجهة', await btn.isDisabled());
        await page.locator('.trip input').nth(0).fill('نابلس');
        await page.locator('.trip input').nth(1).fill('رام الله');
        check('ويصير فعّالاً بعدها', await btn.isEnabled());
        await btn.click();
        await page.waitForTimeout(2500);
        check('والضغط يطلب فعلاً من خدمات الخرائط المفتوحة', osrm.length >= 1, `${osrm.length} طلب`);
        // This sandbox blocks those hosts — the app must SAY so, not sit silent.
        const said = await page.locator('.err').first().innerText().catch(() => '');
        check('وإن تعذّر الاتصال يقولها بصراحة بدل الصمت', /تعذّر/.test(said), said.slice(0, 60));
        await srv.close();

        console.log('\n[7] والملاحة الحقيقية: نشغّلها بموقع مُحاكى ونقرأ البطاقة');
        const srv3 = await serve(path.join(dir, 'dist'), 4715);
        const ctx = await browser.newContext({
            permissions: ['geolocation'],
            geolocation: { latitude: 32.2211, longitude: 35.2544 },   // نابلس
        });
        const p3 = await ctx.newPage();
        // The sandbox blocks the map services, so the route is served here —
        // a real OSRM answer, recorded, so the drive itself is exercised.
        await p3.route('**/nominatim.openstreetmap.org/**', (r: any) => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ place_id: '1', display_name: 'رام الله, فلسطين', lat: '31.9038', lon: '35.2034' }]),
        }));
        await p3.route('**/router.project-osrm.org/**', (r: any) => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ routes: [{ distance: 41000, duration: 3000,
                geometry: { coordinates: [[35.2544, 32.2211], [35.24, 32.1], [35.2034, 31.9038]] },
                legs: [{ steps: [
                    { name: 'شارع نابلس', distance: 1200, maneuver: { type: 'depart', modifier: 'straight', location: [35.2544, 32.2211] } },
                    { name: 'طريق رام الله', distance: 39800, maneuver: { type: 'turn', modifier: 'left', location: [35.24, 32.1] } },
                    { name: '', distance: 0, maneuver: { type: 'arrive', modifier: 'straight', location: [35.2034, 31.9038] } },
                ] }] }] }),
        }));
        await p3.goto('http://localhost:4715/', { waitUntil: 'domcontentloaded' });
        await p3.waitForTimeout(1200);
        await p3.locator('.trip input').nth(0).fill('نابلس');
        await p3.locator('.trip input').nth(1).fill('رام الله');
        await p3.getByRole('button', { name: 'احسب المسار' }).click();
        await p3.waitForTimeout(1500);
        check('المسار حُسب وظهرت المسافة والزمن', /41/.test(await p3.locator('.trip-nums').innerText()));
        check('وقائمة المناورات ظهرت', (await p3.locator('.steps-list li').count()) === 3);
        const startBtn = p3.getByRole('button', { name: 'ابدأ الملاحة' });
        check('وزر «ابدأ الملاحة» موجود', await startBtn.isVisible());
        await startBtn.click();
        await p3.waitForTimeout(2000);
        check('بطاقة القيادة ظهرت', await p3.locator('.nav-card').isVisible());
        const card = await p3.locator('.nav-card').innerText();
        check('وفيها التعليمة التالية', /انعطف|واصل|انطلق|وصلت/.test(card), card.slice(0, 80));
        check('وفيها المسافة المتبقية والزمن ووقت الوصول', /كم متبقية/.test(card) && /الوصول/.test(card), card.slice(0, 120));
        check('وأيقونة السيارة على الخريطة', (await p3.locator('.car-icon').count()) === 1);
        check('وزر الإنهاء حاضر', await p3.getByRole('button', { name: 'أنهِ الملاحة' }).isVisible());
        await p3.getByRole('button', { name: 'أنهِ الملاحة' }).click();
        await p3.waitForTimeout(400);
        check('والإنهاء يزيل البطاقة والسيارة', (await p3.locator('.nav-card').count()) === 0 && (await p3.locator('.car-icon').count()) === 0);
        await ctx.close();
        await srv3.close();
    } finally { await browser.close(); }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    console.log(`(المشروع: ${dir})`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
