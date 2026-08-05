/**
 * THE CHECK HAPPENS WHERE HE CAN SEE IT — «كيف بدنا نصلح المتصفح».
 *
 * Two complaints that look contradictory and are not:
 *   «في اثناء البناء تم فتح المتصفح … بدون اي فائده» — an OS window popped up
 *      on his desktop mid-build. Killed: the audit forced headless.
 *   «تم تشغيل المتصفح ولكن لم يقم بما لازم القيام به» — and then nothing was
 *      visible again. «self-QA: 62/100 — console_errors, failed_requests» was
 *      a verdict with nothing behind it he could look at.
 *
 * What he wants is neither: not a window on his desktop, and not an invisible
 * process. It is Joe's OWN browser panel — which already exists and already
 * streams frames to the interface. This proves the audit runs THERE:
 *
 *   [2] it borrows the panel's page instead of launching its own
 *   [3] the findings are painted on the page while it runs — a score card and
 *       a red outline around every element that cost points
 *   [4] it never closes the panel's browser, and never leaves listeners behind
 *   [5] and with no panel offered it still works, exactly as before
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_visible_audit.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A tiny built app with three deliberate faults, so the overlay has work. */
function writeDist(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-visaudit-'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>متجر الاختبار</title></head>
<body style="font-family:system-ui;padding:24px">
  <h1>متجر الاختبار</h1>
  <img src="/no-such-image.png" alt="صورة مكسورة">
  <a href="#" class="btn" style="display:inline-block;width:20px;height:20px">x</a>
  <a href="" class="btn" style="display:inline-block;width:20px;height:20px">y</a>
</body></html>`);
    return dir;
}

async function main() {
    const dist = writeDist();
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const { getBrowserSession, stopSession } = await import('../../modules/browser/manager');
    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');

    console.log('\n[1] لوحة المتصفح — الجلسة التي يراها المستخدم');
    let session: any = null;
    try { session = await getBrowserSession(PANEL_BROWSER_SID); } catch (e: any) {
        console.error(`  ❌ تعذّر فتح جلسة اللوحة — ${e?.message || e}`);
        process.exit(1);
    }
    check('جلسة اللوحة تعمل', !!session?.page);
    const page = session.page;
    const before = page.url();
    check('وهي على صفحة فارغة قبل الفحص', /about:blank|^$/.test(before), before);

    console.log('\n[2] الفحص يستعير لوحته بدل أن يفتح متصفحاً خفياً');
    let sawOverlay = false;
    let sawCard = '';
    // Watch WHILE it runs: the overlay is removed when the audit ends, so an
    // assertion made afterwards would prove nothing.
    const watcher = (async () => {
        for (let i = 0; i < 120; i++) {
            try {
                const n = await page.locator('[data-joe-audit]').count();
                if (n > 0) {
                    sawOverlay = true;
                    sawCard = await page.locator('[data-joe-audit]').last().innerText().catch(() => '');
                    return;
                }
            } catch { /* mid-navigation */ }
            await new Promise(r => setTimeout(r, 250));
        }
    })();

    const seen = { watched: false };
    const audit: any = await auditBuiltApp(dist, {
        timeoutMs: 30_000,
        watchSessionId: PANEL_BROWSER_SID,
        onProgress: () => { seen.watched = true; },
    });
    await watcher;

    check('الفحص أعلن أنه يجري أمام المستخدم', seen.watched === true);
    check('ولم يُتخطَّ', !audit.skipped, String(audit.skipped || ''));
    check('وأعطى درجة حقيقية دون 100 — الصفحة بها عيوب مقصودة',
        typeof audit.score === 'number' && audit.score < 100, String(audit.score));
    check('ووجد الصورة المكسورة', audit.findings.some((f: any) => f.id === 'dead_images'),
        audit.findings.map((f: any) => f.id).join(', '));
    check('والروابط الميتة', audit.findings.some((f: any) => f.id === 'dead_links'));

    console.log('\n[3] والملاحظات ظهرت على الصفحة نفسها أثناء الفحص');
    check('طبقة العرض ظهرت فعلاً في لوحته', sawOverlay, 'لم تُرصد أي عقدة data-joe-audit');
    check('وفيها الدرجة مكتوبة', /\/100/.test(sawCard), sawCard.slice(0, 120));

    console.log('\n[4] ولوحته بقيت حيّة ونظيفة بعد الفحص');
    check('صفحة اللوحة ما زالت مفتوحة — لم يُغلق متصفحه', page.isClosed?.() !== true);
    check('وقد انتقلت فعلاً إلى الصفحة المفحوصة', /^http:\/\/127\.0\.0\.1:\d+/.test(page.url()), page.url());
    check('والطبقة أُزيلت بعد انتهاء الفحص', await page.locator('[data-joe-audit]').count() === 0);

    const listenersAfterOne = page.listenerCount('console');
    await auditBuiltApp(dist, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
    check('وفحص ثانٍ لا يُراكم مستمعين على صفحة معمّرة',
        page.listenerCount('console') === listenersAfterOne,
        `${listenersAfterOne} → ${page.listenerCount('console')}`);

    console.log('\n[5] وبلا لوحة — يعمل كما كان تماماً');
    const headless: any = await auditBuiltApp(dist, { timeoutMs: 30_000 });
    check('الفحص الخفي ما زال يعطي النتيجة نفسها', headless.score === audit.score,
        `${headless.score} مقابل ${audit.score}`);
    check('ولم يلمس لوحة المستخدم', page.isClosed?.() !== true);

    try { await stopSession(PANEL_BROWSER_SID); } catch { /* best effort */ }
    try { fs.rmSync(dist, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
