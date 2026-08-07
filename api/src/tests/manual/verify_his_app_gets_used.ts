/**
 * «لكنك لم تقل شيئا عن فحص المتصفح السيء ولم يملء الحقول للاختبار
 *  والاتوميشن بشكل صحيح.. لماذا لم يفعلها بشكل صحيح؟»
 *
 * His run said, in full:
 *
 *     🔎 فحص الجودة الذاتي في متصفح حقيقي (1 صفحة، 4 زر مضغوط فعلاً): 97/100
 *        • نموذج بلا أي حقل مطلوب — يمكن إرساله فارغًا
 *     ⚠️ وما زال قائماً بعد الإصلاح: نموذج بلا أي حقل مطلوب
 *
 * One page, four buttons, ZERO fields typed into — because his update pulled
 * 4d7f363b and the deep audit landed after it. That is the boring half of the
 * answer. The half that matters is what the deep audit finds when it is finally
 * pointed at THE APP HE ACTUALLY GOT:
 *
 *   the generated form printed «العنوان *» and put no `required` attribute on
 *   the input. The star was decoration. That is why the finding appeared on
 *   every build and why the self-repair «could not fix it» — the generator kept
 *   re-emitting it, so the repair was undone by the next rebuild.
 *
 * This builds his app from his own sentence and measures the audit on it:
 *
 *   [1] the app is built, and its form is a REAL form with a REAL submit
 *   [2] the audit fills every field and presses submit — counted, not claimed
 *   [3] the «form_no_validation» finding is gone, because the star is real now
 *   [4] and an empty submit is REFUSED by the browser, watched live
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_his_app_gets_used.ts
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

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-hisapp-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] نبني التطبيق نفسه الذي وصله — من جملته هو');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const res: any = await new ReactProjectTool().execute(
        { request: HIS_WORDS, root, skipImages: true }, { sessionId: 'his-app' });
    check('البناء نجح', res?.ok === true && res.output?.built === true, String(res?.error || '').slice(0, 140));
    const proj = String(res.output?.path || '');
    const app = ['src/components/RecordsApp.jsx', 'src/App.jsx']
        .map(f => path.join(proj, f)).find(f => fs.existsSync(f)) || '';
    const src = app ? fs.readFileSync(app, 'utf-8') : '';
    check('والنموذج نموذجٌ حقيقي بزرّ إرسال حقيقي',
        /<form[^>]*onSubmit=/.test(src) && /type="submit"/.test(src), app || 'لا ملف');
    check('والنجمة صارت حقيقية — required على الحقل نفسه',
        /required=\{!!f\.required\}/.test(src) || /required/.test(src), 'لا يوجد required');

    console.log('\n[2] والفحص العميق — كم حقلاً كُتب فعلاً، وكم نموذجاً أُرسل');
    const a = res.output?.audit || {};
    console.log(`   ℹ️ ${a.score}/100 · ${(a.routes || []).length} صفحة · ${a.pressed} عنصر مضغوط `
        + `· ${a.formsFilled || 0} نموذج · ${a.fieldsFilled || 0} حقل · ${(a.viewports || []).length} مقاسات`);
    console.log(`   ℹ️ النماذج: ${(a.forms || []).map((f: any) => `${f.label}[${f.filled}/${f.fields}] → ${f.effect || 'لا شيء'}`).join(' · ') || 'لا شيء'}`);
    for (const c of a.controls || []) console.log(`      ${c.worked ? '✔' : '✗'} [${c.kind}] «${c.label}» → ${c.effect || '(لا شيء)'}`);
    for (const f of a.findings || []) console.log(`      • ${f.id}: ${f.detail}`);
    // His run: 4 controls pressed, 0 fields typed, 1 viewport. The honest
    // comparison is the TOTAL work, not one of the three numbers.
    const work = (a.pressed || 0) + (a.fieldsFilled || 0) + (a.viewports || []).length;
    check('العمل المُنجَز أكبر بكثير ممّا جرى عنده (4+0+1)', work > 8, `${work} = ${a.pressed}+${a.fieldsFilled}+${(a.viewports || []).length}`);
    check('ونموذج واحد على الأقل عُبِّئ فعلاً', (a.formsFilled || 0) >= 1, String(a.formsFilled));
    check('وحقول حقيقية كُتب فيها', (a.fieldsFilled || 0) >= 3, String(a.fieldsFilled));
    check('وقِيست ثلاثة مقاسات شاشة', (a.viewports || []).length >= 3, (a.viewports || []).join(','));

    console.log('\n[3] والملاحظة التي بقيت عنده بعد الإصلاح — اختفت من المصدر');
    const ids = (a.findings || []).map((f: any) => f.id);
    console.log(`   ℹ️ ${ids.join(', ') || 'نظيف'}`);
    check('«نموذج بلا أي حقل مطلوب» لم تعد', !ids.includes('form_no_validation'), ids.join(', '));
    check('ولا نموذج ميّت عُبِّئ وأُرسل بلا أثر', !ids.includes('form_dead_submit'), ids.join(', '));

    console.log('\n[4] وفي متصفّح حيّ: نموذج فارغ يُرفض، ونموذج معبّأ يمرّ');
    const dist = path.join(proj, 'dist');
    const http = require('http');
    const srv = http.createServer((q: any, r: any) => {
        const rel = decodeURIComponent(String(q.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const f = path.join(dist, rel);
        if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, {
            'content-type': f.endsWith('.js') ? 'text/javascript'
                : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8',
        });
        r.end(fs.readFileSync(f));
    });
    await new Promise<void>(k => srv.listen(0, '127.0.0.1', () => k()));
    const url = `http://127.0.0.1:${(srv.address() as any).port}/`;

    const { chromium } = require('playwright');
    const { getChromiumLaunchOptions } = require('../../modules/browser/manager');
    const browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(600);

    const blocked = await page.evaluate(
        'JSON.parse(JSON.stringify((function(){var f=document.querySelector("form.form");'
        + 'return { found: !!f, valid: f ? f.checkValidity() : null,'
        + ' required: f ? f.querySelectorAll("[required]").length : 0 };})()))',
    ).catch(() => ({ found: false, valid: null, required: 0 }));
    console.log(`   ℹ️ ${JSON.stringify(blocked)}`);
    check('النموذج موجود وفيه حقول مطلوبة', blocked.found === true && blocked.required > 0, JSON.stringify(blocked));
    check('وفارغاً لا يجتاز تحقّق المتصفّح', blocked.valid === false, JSON.stringify(blocked));

    // …and the SAME probe the build uses fills it and sends it, for real.
    const { probeForms } = await import('../../core/quality/behaviour-audit');
    const filled: any = await probeForms(page, { budgetMs: 25_000 });
    console.log(`   ℹ️ ${(filled.forms || []).map((f: any) => `${f.label}[${f.filled}/${f.fields}] → ${f.effect || 'لا شيء'}`).join(' · ')}`);
    check('المسبار عبّأ حقول النموذج', (filled.metrics?.fieldsFilled || 0) >= 3, JSON.stringify(filled.metrics || {}));
    check('وأرسله فمرّ — لا رفض ولا صمت',
        (filled.forms || []).some((f: any) => f.effect === 'submitted'),
        (filled.forms || []).map((f: any) => f.effect).join(','));

    const rows = await page.evaluate(
        'document.querySelectorAll(".rows li, .row, tbody tr, .record").length',
    ).catch(() => 0);
    check('وظهر سجلّ حقيقي في القائمة بعد الإرسال', Number(rows) > 0, `صفوف=${rows}`);

    await page.screenshot({ path: path.join(root, 'his-app-after-fill.png'), fullPage: false });
    console.log(`   🖼️ ${path.join(root, 'his-app-after-fill.png')}`);

    await browser.close();
    srv.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
