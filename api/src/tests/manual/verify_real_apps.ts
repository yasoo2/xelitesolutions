/**
 * «كما قلت لك النظام فقط هو معرض صور وكلمات وليس تطبيقات حقيقية».
 *
 * He was right, and the measurement was brutal. Four different application
 * requests — a maps app, a task manager, a chat app, a clinic booking system —
 * produced the SAME six components (Hero, Features, Steps, Cta, Faq, Contact),
 * the same fabricated customers («سارة العتيبي»), the same restaurant menu
 * («طبق اليوم»), and between them not one line of working software. The maps
 * app contained no map, no marker, no geolocation, and not a single dependency
 * beyond react.
 *
 * The scope fix earned a real Vite project. This proves the project is a
 * PROGRAM:
 *   [1] the domain is read from the request, deterministically
 *   [2] an app build ships its engine and NOTHING from the brochure library
 *   [3] no fabricated person, dish or pricing tier reaches an app
 *   [4] it really installs and really compiles — leaflet included
 *   [5] and in a REAL browser: a record is created, counted, persisted across
 *       a reload, searched and deleted — and the map really mounts and really
 *       asks OpenStreetMap for its tiles
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_real_apps.ts
 *       (add FAST=1 to skip the two npm installs and the browser drive)
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-apps-'));

/** The marketing library — not one of these files belongs in an application. */
const BROCHURE = ['Hero', 'Features', 'Faq', 'Testimonials', 'Menu', 'Products', 'Pricing', 'Team', 'Gallery', 'Story', 'Compare', 'Cta', 'Navbar', 'Footer'];
/** The invented people and dishes the user found inside his maps app. */
const FABRICATIONS = ['سارة العتيبي', 'محمد الشهري', 'ليان القحطاني', 'فهد الدوسري', 'ريم العنزي', 'طبق اليوم', 'مشاوي مشكلة', 'الإصدار الكلاسيكي', 'طقم الهدية'];

async function scaffold(request: string, sessionId: string, opts: any = {}) {
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const r: any = await new (ReactProjectTool as any)().execute(
        { request, skipProfile: true, root: ROOT, ...opts }, { sessionId });
    return { ok: !!r?.ok, dir: String(r?.output?.path || ''), out: r?.output, message: String(r?.output?.message || '') };
}

const read = (dir: string, rel: string) => { try { return fs.readFileSync(path.join(dir, rel), 'utf-8'); } catch { return ''; } };
const list = (dir: string, rel: string) => { try { return fs.readdirSync(path.join(dir, rel)); } catch { return []; } };

/** A static server for the production build — the same thing a host would do. */
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
    const { detectAppKind, blueprintFor } = require('../../core/design/app-blueprints');

    console.log('\n[1] أيّ تطبيق يطلبه المستخدم — بلا نموذج، تصنيف حاسم');
    const KINDS: Array<[string, string | null]> = [
        ['ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', 'maps'],
        ['اعمل لي تطبيق ملاحة يحدد موقعي', 'maps'],
        ['اعمل لي برنامج إدارة مهام بسيط', 'tasks'],
        ['ابني تطبيق ملاحظات', 'notes'],
        ['ابني محرر نصوص بسيط في المتصفح', 'notes'],
        ['اعمل تطبيق محادثة فوري بين المستخدمين', 'chat'],
        ['ابني تطبيق طقس', 'weather'],
        ['ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب', 'booking'],
        ['ابني نظام إدارة مخزون مع تسجيل دخول', 'inventory'],
        ['أريد نظام نقاط بيع للمطاعم مع تقارير مبيعات', 'pos'],
        ['ابني تطبيق مصاريف شخصية', 'expenses'],
        ['ابني منصة تعليمية مع حسابات للطلاب والمعلمين', 'lms'],
        ['نظام إدارة علاقات العملاء', 'crm'],
        ['اعمل تطبيق لتتبع عاداتي اليومية', 'habits'],
        ['ابني نظام لإدارة أسطول السيارات', 'generic'],
        ['build me a task manager app', 'tasks'],
        ['build a maps application like google maps', 'maps'],
        // …and what is NOT an application: the presentation builds keep their path.
        ['ابنِ لي صفحة هبوط لمقهى', null],
        ['اعمل لي بورتفوليو شخصي', null],
        ['صمم لي قائمة طعام لمطعم', null],
        ['ابني موقعاً لشركة محاماة', null],
        ['صفحة هبوط لتطبيق خرائط', null],
    ];
    for (const [goal, want] of KINDS) {
        const got = detectAppKind(goal);
        check(`«${goal.slice(0, 42)}${goal.length > 42 ? '…' : ''}» ⇒ ${got ?? 'موقع تقديمي'}`, got === want, `توقّعتُ ${want ?? 'null'}`);
    }

    console.log('\n[2] وكل محرّك يحمل ما يحتاجه فعلاً');
    check('الخريطة تعتمد Leaflet حقيقية', !!blueprintFor('maps', 'خرائط', true).deps.leaflet);
    check('والمهام لها حقول مهام لا حقول مطعم',
        blueprintFor('tasks', 'مهام', true).fields.map((f: any) => f.key).join(',') === 'title,notes,priority,due,status');
    check('والحجوزات تعرف التاريخ والوقت والحالة',
        ['date', 'time', 'status'].every(k => blueprintFor('booking', 'حجوزات', true).fields.some((f: any) => f.key === k)));
    check('والمخزون يحسب قيمة المخزون من الكمية × السعر',
        blueprintFor('inventory', 'مخزون', true).metrics.some((m: any) => m.kind === 'sumProduct' && m.field === 'qty' && m.field2 === 'price'));

    console.log('\n[3] وما يُكتب على القرص: برنامج، لا كتيّب دعاية');
    const SCAFFOLDS: Array<[string, string, string]> = [
        ['ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', 'maps', 'MapApp.jsx'],
        ['اعمل لي برنامج إدارة مهام بسيط', 'tasks', 'RecordsApp.jsx'],
        ['اعمل تطبيق محادثة فوري بين المستخدمين', 'chat', 'ChatApp.jsx'],
        ['ابني تطبيق طقس لمدينتي', 'weather', 'WeatherApp.jsx'],
        ['ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب', 'booking', 'RecordsApp.jsx'],
    ];
    for (const [request, label, engineFile] of SCAFFOLDS) {
        const b = await scaffold(request, `scaffold-${label}`, { skipInstall: true });
        const comps = list(b.dir, 'src/components');
        const contentJs = read(b.dir, 'src/content.js');
        const appJsx = read(b.dir, 'src/App.jsx');
        const allText = ['src/content.js', 'src/App.jsx', `src/components/${engineFile}`].map(f => read(b.dir, f)).join('\n');
        check(`«${label}» يُسلّم محرّكه ${engineFile}`, comps.includes(engineFile), comps.join(', ') || '(لا مكوّنات)');
        check(`«${label}» بلا مكوّنات دعائية`, !comps.some(c => BROCHURE.includes(c.replace('.jsx', ''))), comps.join(', '));
        check(`«${label}» بلا أشخاص أو أطباق مفبركة`, !FABRICATIONS.some(x => allText.includes(x)),
            FABRICATIONS.filter(x => allText.includes(x)).join(', '));
        check(`«${label}» بلا باقات أسعار ولا آراء عملاء في المحتوى`,
            !/tiers:|testimonials:|menu:|products:/.test(contentJs));
        check(`«${label}» يخزّن حالته فعلاً`, /storeKey/.test(contentJs) && /localStorage/.test(read(b.dir, 'src/app/store.js')));
        check(`«${label}» يركّب محرّكه في App.jsx`, appJsx.includes(engineFile.replace('.jsx', '')));
    }

    console.log('\n[4] والخريطة خريطة — لا صورة لخريطة');
    const mapDir = (await scaffold('ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', 'maps-detail', { skipInstall: true })).dir;
    const mapSrc = read(mapDir, 'src/components/MapApp.jsx');
    const mapPkg = JSON.parse(read(mapDir, 'package.json') || '{}');
    check('تبعية leaflet حقيقية في package.json', !!mapPkg.dependencies?.leaflet, JSON.stringify(mapPkg.dependencies));
    check('طبقة بلاطات OpenStreetMap', /tileLayer\('https:\/\/tile\.openstreetmap\.org/.test(mapSrc));
    check('بحث أماكن حقيقي (Nominatim)', /nominatim\.openstreetmap\.org\/search/.test(mapSrc));
    check('تحديد موقع المستخدم', /navigator\.geolocation\.getCurrentPosition/.test(mapSrc));
    check('علامات تُثبَّت وتُحفظ', /L\.marker\(/.test(mapSrc) && /store\.write/.test(mapSrc));
    check('وحساب المسافة الحقيقي (haversine)', /Math\.asin\(Math\.sqrt/.test(mapSrc));
    check('ونسبة الحقوق لخرائط OpenStreetMap', /openstreetmap\.org\/copyright/.test(mapSrc));
    check('وإذا تعذّرت البلاطات يقولها صراحةً', /tileerror/.test(mapSrc));


    console.log('\n[4b] وصدقٌ بكلمات المستخدم نفسه — لا بكلماتٍ حفظتُها أنا');
    // The field request, verbatim: twelve features, one of them delivered.
    const SOCIAL = `Build a next-generation social media platform.

Features:

- Posts
- Stories
- Reels
- Live streaming
- Groups
- Pages
- Messaging
- Video calls
- AI moderation
- Recommendations
- Ads platform
- Creator dashboard`;
    const { requestedFeatures, uncoveredFeatures } = require('../../core/design/app-blueprints');
    const asked = requestedFeatures(SOCIAL);
    check(`قرأتُ ${asked.length} ميزة من نصّ الطلب`, asked.length === 12, asked.join(' | '));
    const gap = uncoveredFeatures(SOCIAL, 'chat', true);
    check('و«Messaging» وحدها هي المُنفَّذة — والباقي يُعلَن', gap.length === 11 && !gap.includes('Messaging'), gap.join(' | '));
    for (const owed of ['Stories', 'Reels', 'Live streaming', 'Ads platform', 'Creator dashboard']) {
        check(`ويُسمّي «${owed}» كما كتبها المستخدم`, gap.includes(owed));
    }
    const social = await scaffold(SOCIAL, 'social-gap', { skipInstall: true });
    check('ورسالة التسليم تحمل القائمة كاملة', /Stories/.test(social.message) && /Ads platform/.test(social.message),
        social.message.slice(0, 200));

    console.log('\n[4c] وخادم التطبيق يخزّن ما يتحدّث عنه التطبيق');
    const { apiResourceForKind } = require('../../modules/tools/definitions/ApiProjectTool');
    // This assertion moved WITH the system, on purpose: when it was written the
    // social engine did not exist and a «social media platform … Messaging»
    // request was best served as a chat. Now it is a FEED, so its server must
    // store posts. The pure messenger below still gets messages.
    check('منصة تواصل ⇒ مورد posts',
        apiResourceForKind('generic', false, SOCIAL).resource === 'posts',
        apiResourceForKind('generic', false, SOCIAL).resource);
    check('وتطبيق محادثة خالص ⇒ مورد messages',
        apiResourceForKind('generic', true, 'اعمل تطبيق محادثة فوري بين المستخدمين').resource === 'messages',
        apiResourceForKind('generic', true, 'اعمل تطبيق محادثة فوري بين المستخدمين').resource);
    check('ونظام حجوزات ⇒ bookings',
        apiResourceForKind('generic', true, 'نظام حجوزات عيادة').resource === 'bookings');
    check('ومطعم يبقى dishes (لم أكسر القديم)',
        apiResourceForKind('restaurant', true, 'موقع مطعم').resource === 'dishes');
    check('وتطبيق حقيقي يبدأ فارغاً — بلا صفوف مفبركة',
        apiResourceForKind('generic', false, SOCIAL).seeds.length === 0);

    if (FAST) {
        console.log('\n(FAST=1 — تُخطّي التثبيت والمتصفح)');
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(fail ? 1 : 0);
    }

    console.log('\n[5] ويُبنى فعلاً — npm install + vite build على الحقيقة');
    const tasks = await scaffold('اعمل لي برنامج إدارة مهام بسيط', 'live-tasks');
    check('تطبيق المهام: التثبيت والبناء نجحا', !!tasks.out?.built, JSON.stringify({ installed: tasks.out?.installed, built: tasks.out?.built }));
    check('ونسخة الإنتاج موجودة', fs.existsSync(path.join(tasks.dir, 'dist', 'index.html')));
    const maps = await scaffold('ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', 'live-maps');
    check('تطبيق الخرائط: التثبيت والبناء نجحا (مع leaflet)', !!maps.out?.built, JSON.stringify({ installed: maps.out?.installed, built: maps.out?.built }));
    check('و leaflet وصلت فعلاً إلى node_modules', fs.existsSync(path.join(maps.dir, 'node_modules', 'leaflet', 'package.json')));
    check('ورسالة التسليم تصف تطبيقاً يعمل لا صفحة',
        /تطبيق يعمل، لا صفحة/.test(maps.message) && /Leaflet/.test(maps.message));

    console.log('\n[6] وفي متصفح حقيقي: نُنشئ سجلاً، نعدّه، نعيد التحميل، نبحث، نحذف');
    const { chromium } = require('playwright');
    const srv = await serve(path.join(tasks.dir, 'dist'), 4712);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
        await page.goto('http://localhost:4712/', { waitUntil: 'networkidle' });

        check('التطبيق يفتح ويعرض نموذج الإدخال', await page.locator('form.form input').first().isVisible());
        check('ويقول بصراحة إنه لا سجلات بعد', /لا مهام بعد/.test(await page.locator('.empty').first().innerText().catch(() => '')));

        // The required-field guard — an empty submit must refuse, not save.
        await page.locator('button[type="submit"]').first().click();
        check('الحقول المطلوبة تمنع الحفظ الفارغ', await page.locator('.err').first().isVisible().catch(() => false));

        await page.locator('form.form input').first().fill('تسليم تقرير الاثنين');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(200);
        check('السجلّ أُنشئ وظهر في القائمة', (await page.locator('.row h3').first().innerText()).includes('تسليم تقرير'));
        check('والعدّاد احتسبه', (await page.locator('.stat b').first().innerText()).trim() === '1');

        // The whole difference between an app and a poster: it remembers.
        await page.reload({ waitUntil: 'networkidle' });
        check('وبقي بعد إعادة تحميل الصفحة', (await page.locator('.row h3').first().innerText()).includes('تسليم تقرير'));

        await page.locator('form.form input').first().fill('شراء حبر الطابعة');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(200);
        check('وسجلّ ثانٍ يُضاف فوقه', (await page.locator('.row').count()) === 2);

        await page.locator('input.search').first().fill('حبر');
        await page.waitForTimeout(200);
        check('والبحث يصفّي فعلاً', (await page.locator('.row').count()) === 1);
        await page.locator('input.search').first().fill('');
        await page.waitForTimeout(200);

        // Mark done — the status really changes and the metric follows.
        await page.locator('.row .btn.tiny').first().click();
        await page.waitForTimeout(200);
        check('و«منجزة» تُبدّل الحالة ويتبعها العدّاد',
            (await page.locator('.row.done').count()) === 1 && (await page.locator('.stat b').nth(1).innerText()).trim() === '1');

        page.on('dialog', (d: any) => d.accept());
        await page.locator('.row .btn.danger').first().click();
        await page.waitForTimeout(250);
        check('والحذف يحذف', (await page.locator('.row').count()) === 1);
        check('ولا خطأ واحد في الكونسول', errors.length === 0, errors.join(' | '));
        await srv.close();

        console.log('\n[7] والخريطة تُركَّب فعلاً وتطلب بلاطاتها من OpenStreetMap');
        const srv2 = await serve(path.join(maps.dir, 'dist'), 4713);
        const p2 = await browser.newPage();
        const tileRequests: string[] = [];
        p2.on('request', (r: any) => { if (/tile\.openstreetmap\.org/.test(r.url())) tileRequests.push(r.url()); });
        await p2.goto('http://localhost:4713/', { waitUntil: 'domcontentloaded' });
        await p2.waitForTimeout(3000);
        check('حاوية Leaflet مركّبة في الصفحة', await p2.locator('.leaflet-container').isVisible());
        check('وأزرار التكبير الحقيقية موجودة', (await p2.locator('.leaflet-control-zoom-in').count()) === 1);
        check('وطلبت بلاطات خرائط حقيقية من OpenStreetMap', tileRequests.length >= 4, `${tileRequests.length} طلب`);
        check('ولوحة الأماكن المحفوظة تبدأ صادقة وفارغة', /لا أماكن محفوظة/.test(await p2.locator('.empty').first().innerText()));
        check('وزر «موقعي» موجود فعلاً', (await p2.getByText('موقعي').count()) >= 1);
        await srv2.close();
    } finally {
        await browser.close();
    }


    console.log('\n[8] المحرّك الخامس: خيط اجتماعي حقيقي — يُبنى ويُقاد في متصفح');
    const socialBuild = await scaffold('ابنِ منصة تواصل اجتماعي فيها منشورات وإعجابات وتعليقات ومتابعين', 'live-social');
    check('تطبيق الخيط: التثبيت والبناء نجحا', !!socialBuild.out?.built, JSON.stringify({ built: socialBuild.out?.built }));
    const socialSrc = read(socialBuild.dir, 'src/components/SocialApp.jsx');
    check('ومحرّكه SocialApp لا مكوّن دعائي', !!socialSrc && list(socialBuild.dir, 'src/components').includes('SocialApp.jsx'));
    check('وبلا أشخاص مفبركين', !FABRICATIONS.some(x => socialSrc.includes(x)));

    const srvS = await serve(path.join(socialBuild.dir, 'dist'), 4716);
    const b2 = await chromium.launch();
    try {
        const pg = await b2.newPage();
        const errs: string[] = [];
        pg.on('console', (m: any) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
        await pg.goto('http://localhost:4716/', { waitUntil: 'networkidle' });
        await pg.waitForTimeout(600);

        check('يطلب هويتك أولاً', await pg.getByText('من أنت؟').first().isVisible());
        await pg.locator('input.search').first().fill('يونس');
        await pg.getByRole('button', { name: 'ادخل' }).click();
        await pg.waitForTimeout(400);
        check('ثم يفتح الخيط فارغاً بصدق', /لا منشورات بعد/.test(await pg.locator('.empty').first().innerText()));

        await pg.locator('.composer-card textarea').fill('أول منشور حقيقي في هذا الخيط');
        await pg.getByRole('button', { name: 'انشر' }).click();
        await pg.waitForTimeout(400);
        check('والنشر يُنشئ منشوراً باسمك', (await pg.locator('.post .post-text').first().innerText()).includes('أول منشور'));
        check('وعدّاد منشوراتي صار 1', (await pg.locator('.social-side .stat b').first().innerText()).trim() === '1');

        await pg.locator('.post .act').first().click();
        await pg.waitForTimeout(250);
        check('والإعجاب يُحتسب ويُبرز', (await pg.locator('.post .act.on').first().innerText()).includes('1'));

        await pg.locator('.post .act').nth(1).click();
        await pg.waitForTimeout(250);
        await pg.locator('.comments input.search').fill('وأول تعليق');
        await pg.getByRole('button', { name: 'علّق' }).click();
        await pg.waitForTimeout(300);
        check('والتعليق يُضاف تحت المنشور', (await pg.locator('.comment').first().innerText()).includes('وأول تعليق'));

        await pg.reload({ waitUntil: 'networkidle' });
        await pg.waitForTimeout(600);
        check('وكل ذلك ينجو من إعادة التحميل',
            (await pg.locator('.post .post-text').first().innerText()).includes('أول منشور')
            && (await pg.locator('.post .act.on').count()) === 1);

        await pg.getByRole('button', { name: 'أتابعهم' }).click();
        await pg.waitForTimeout(300);
        check('وتبويب «أتابعهم» يعمل ويُظهر منشوري', (await pg.locator('.post').count()) === 1);
        await pg.getByRole('button', { name: 'الكل' }).click();
        await pg.waitForTimeout(200);

        check('ولا خطأ كونسول', errs.length === 0, errs.slice(0, 2).join(' | '));
        await srvS.close();
    } finally { await b2.close(); }

    console.log('\n[9] وما لم يُبنَ من منصة التواصل يُقال بالاسم');
    const socialGap = require('../../core/design/app-blueprints')
        .uncoveredFeatures('Build a social platform.\n\n- Posts\n- Stories\n- Live streaming\n- Ads platform', 'social', true);
    check('«Posts» مُنفَّذة فلا تُذكر', !socialGap.includes('Posts'));
    check('و«Stories» و«Live streaming» و«Ads platform» تُذكر',
        ['Stories', 'Live streaming', 'Ads platform'].every((x: string) => socialGap.includes(x)), socialGap.join(' | '));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    console.log(`(المشاريع المولَّدة: ${ROOT})`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
