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
    } finally { await browser.close(); }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    console.log(`(المشروع: ${dir})`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
