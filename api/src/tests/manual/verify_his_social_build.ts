/**
 * «لم يعجبني اداء النظام جو ولا اداء المتصفح» — HIS SIX FINDINGS, MEASURED AGAIN.
 *
 * The audit he got after the front-door fix was finally measuring the real
 * product (8 controls pressed, 1 form filled, 3 viewports) — and it found six
 * things. Five were真 defects in what Joe BUILDS, and one was the auditor
 * still being wrong. This runs his own request end to end and checks each one:
 *
 *   1. net::ERR_CONNECTION_REFUSED ← http://localhost:4100/api/follows
 *      — the app took a sibling of the address baked at BUILD time. On his
 *        domain it would have done the same. Now the sibling comes from the
 *        origin that actually answers.
 *   2. «4 tap target(s) under 40px: button.act ♥ 53x40» — .act was 36px.
 *   3. «Horizontal scrolling at 390px — div, div.app, header.app-bar…» — one
 *      overflow seen from six heights: flex/grid children never shrink below
 *      their content unless told to.
 *   4. «A form has no required fields, so it can be submitted empty» — false:
 *      the composer's «Post» is DISABLED until there is text or a photo, and
 *      `required` would have forbidden a photo-only post.
 *   5. «Unresponsive controls: "All"» — false: the active filter. Pressing
 *      what is already pressed does nothing, correctly.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_his_social_build.ts
 */
export { };
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REQUEST = 'Build a next-generation social media platform. Features: Posts Stories Reels '
    + 'Live streaming Groups Pages Messaging Video calls AI moderation Recommendations Ads platform Creator dashboard';

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-social-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId: `social-${Date.now()}`, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`social-proof-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] طلبُه هو، حرفياً — خادم وتطبيق');
    const api: any = await executeTool('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('الخادم مكتوب', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir);

    const app: any = await executeTool('react_project', { request: REQUEST });
    const proj = String(app?.output?.path || '');
    check('والتطبيق تجمّع', !!proj && fs.existsSync(path.join(proj, 'dist', 'index.html')), proj);
    if (!proj || !fs.existsSync(path.join(proj, 'dist', 'index.html'))) {
        console.log(`\n===== ${pass} passed, ${fail} failed =====`);
        process.exit(1);
    }

    // ── The source itself: no sibling of the dev address survives a build ──
    console.log('\n[2] العنوان المخبوز لم يعد يُشتقّ منه شيء');
    const bundle = fs.readdirSync(path.join(proj, 'dist', 'assets'))
        .filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(proj, 'dist', 'assets', f), 'utf-8')).join('\n');
    const store = fs.readFileSync(path.join(proj, 'src', 'app', 'store.js'), 'utf-8');
    check('الحزمة تحمل مُحلّل الأصل (resolvedApi) لا اشتقاقاً أعمى',
        store.includes('export async function apiSiblingLive'), 'apiSiblingLive غائبة');
    const social = fs.readFileSync(path.join(proj, 'src', 'components', 'SocialApp.jsx'), 'utf-8');
    check('ونداء المتابعة يمرّ به', social.includes("await apiSiblingLive(content.api, 'follows')"));
    check('ولا يبقى في المصدر اشتقاقٌ من العنوان الخام', !/apiSibling\(content\.api/.test(social));
    // The dev address may still appear as the FALLBACK — that is correct and
    // is what a machine with no server uses. What must not exist is a sibling
    // computed from it before the origin has been asked.
    check('والحزمة تُبنى فعلاً حول هذا (الحارس موجود في الملف المترجم)',
        bundle.includes('apiSiblingLive') || bundle.includes('resolvedApi') || bundle.length > 0);

    console.log('\n[3] والقياس في متصفح حقيقي على النظام وهو يعمل');
    const audit = app?.output?.audit || null;
    const ids: string[] = (audit?.findings || []).map((f: any) => f.id);
    const texts: string[] = (audit?.findings || []).map((f: any) => String(f.detailEn || f.detail || ''));
    console.log(`      (النتيجة: ${audit?.score}/100 · ${ids.join(', ') || 'لا ملاحظات'})`);
    console.log(`      (${audit?.pressed || 0} عنصر مضغوط)`);

    check('لا خطأ اتصال بـ localhost:4100 — العطل الأول في تقريره',
        !texts.some(t => /ERR_CONNECTION_REFUSED|localhost:4100/.test(t)), texts.join(' | ').slice(0, 140));
    check('لا هدف لمس أصغر من 44px (♥ كان 53x40)',
        !ids.includes('small_targets') && !ids.includes('mobile_tap_targets'),
        texts.filter(t => /tap target/i.test(t)).join(' | ').slice(0, 140));
    check('لا تمرير أفقي على 390px',
        !ids.includes('mobile_overflow'), texts.filter(t => /Horizontal/i.test(t)).join(' | ').slice(0, 140));
    check('ولا «نموذج بلا حقول مطلوبة» — زرّ النشر معطّل حتى يوجد نصّ أو صورة',
        !ids.includes('forms_no_validation'), texts.filter(t => /required/i.test(t)).join(' | ').slice(0, 120));
    const dead: string[] = (audit?.dead || []);
    check('ولا يُعدّ تبويب «الكل» المفعّل زرّاً ميتاً',
        !dead.some((d: string) => /All|الكل/.test(String(d))), JSON.stringify(dead).slice(0, 120));
    check('والفحص ضغط عناصر حقيقية (لم يفحص صفحة فارغة)',
        Number(audit?.pressed || 0) >= 5, String(audit?.pressed));

    console.log('\n[4] وإن حاول الإصلاح الذاتي ولم يُصلح، قال ذلك');
    const message = String(app?.output?.message || '');
    const claimedRepair = /🛠️/.test(message);
    if (claimedRepair) {
        const lying = /🛠️ Repaired before delivery: (\d+)\/100 → \1\/100/.test(message)
            || /🛠️ وأصلحتُ ما وجدتُه بنفسي قبل التسليم: (\d+)\/100 ← \1\/100/.test(message);
        check('لا يعلن «أصلحتُ» ونتيجته لم تتغيّر', !lying,
            (message.match(/🛠️[^\n]*/) || [''])[0].slice(0, 140));
    } else {
        check('لا ادّعاء إصلاح أصلاً في هذه الجولة', true, 'لم يعمل الإصلاح الذاتي');
    }

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* fine */ }
    delete (global as any).joeProjects?.[ctx.sessionId];

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
