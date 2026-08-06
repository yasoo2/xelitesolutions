/**
 * تشخيص متصفّح جو — «ماذا تحتاج مني لتعرف أين المشكلة بالضبط؟»
 *
 * On his machine the Browser panel connects, the log says a browser was
 * started, and nothing ever appears: «كل شي وهمي». The audit's private
 * fallback launches the SAME executable with nearly the same options, so the
 * fault is always one of the extras — and until now the reason died inside a
 * swallowed exception.
 *
 * This runs THE SAME CODE the build runs, one step at a time, and prints what
 * each step actually did. No mocks, no guessing: it launches real Chromium,
 * creates the real panel session, and runs a real audit against a real page.
 *
 * Run (Windows):   .\diagnose-joe.ps1
 * Run (manual):    cd api ; npx ts-node --transpile-only src/tests/manual/diagnose_browser.ts
 *
 * Then send the printed report (or joe-browser-diagnosis.txt) as it is.
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'diagnose';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';

const line = (s = '') => console.log(s);
const head = (s: string) => { line(''); line(`── ${s} ${'─'.repeat(Math.max(0, 66 - s.length))}`); };
const ok = (s: string) => line(`  ✅ ${s}`);
const bad = (s: string) => line(`  ❌ ${s}`);
const info = (s: string) => line(`  ·  ${s}`);
const problems: string[] = [];
const fullError = (e: any) => String(e?.stack || e?.message || e).split('\n').slice(0, 6).join('\n     ').slice(0, 900);

async function main() {
    // The server reads api/.env; this must see exactly what the server sees.
    try { require('dotenv').config({ quiet: true } as any); } catch { /* optional */ }

    line('══════════════════════════════════════════════════════════════════════');
    line('  تشخيص متصفّح جو — أرسل هذا التقرير كما هو');
    line('══════════════════════════════════════════════════════════════════════');

    head('١) الجهاز');
    info(`node ${process.version} · ${process.platform} ${os.release()} · ${os.arch()}`);
    info(`cwd: ${process.cwd()}`);
    try {
        const pkg = require('playwright/package.json');
        info(`playwright ${pkg.version}`);
    } catch { bad('playwright غير مثبّت — شغّل: npm install داخل مجلد api'); problems.push('playwright missing'); }

    head('٢) إعدادات المتصفّح كما يقرأها جو');
    const FLAGS = ['BROWSER_HEADED', 'BROWSER_HEADFUL', 'BROWSER_HEADLESS', 'BROWSER_PERSISTENT_PROFILE',
        'USE_SYSTEM_CHROME', 'USE_USER_BROWSER_PROFILE', 'BROWSER_EXECUTABLE_PATH', 'BROWSER_WS_ENDPOINT',
        'BROWSER_PROFILE_DIR', 'BROWSER_SESSION_DIR', 'PLAYWRIGHT_BROWSERS_PATH', 'BROWSER_NO_SANDBOX'];
    for (const f of FLAGS) info(`${f} = ${process.env[f] === undefined ? '(غير مضبوط)' : `«${process.env[f]}»`}`);

    const mgr = await import('../../modules/browser/manager');
    const exe = mgr.findChromiumExecutable();
    const opts: any = mgr.getChromiumLaunchOptions();
    info(`الملف التنفيذي المُختار: ${exe || '(الافتراضي داخل playwright)'}`);
    if (exe && !fs.existsSync(exe)) { bad(`المسار غير موجود على القرص: ${exe}`); problems.push('executable missing'); }
    info(`headless = ${opts.headless} · persistentProfile = ${mgr.isPersistentBrowserMode()}`);
    info(`حالة تسجيل دخول محفوظة للوحة: ${mgr.hasSavedBrowserSession('panel-browser') ? 'موجودة' : 'لا توجد'}`);

    head('٣) إقلاع كروميوم مباشرة — كما يفعل الفحص الخاصّ');
    const { chromium } = await import('playwright');
    let rawOk = false;
    try {
        const t = Date.now();
        const b = await chromium.launch({ ...opts });
        rawOk = true;
        ok(`أقلع بالخيارات المضبوطة في ${Date.now() - t}ms — ${b.version()}`);
        await b.close();
    } catch (e: any) {
        bad(`فشل الإقلاع بالخيارات المضبوطة:\n     ${fullError(e)}`);
        problems.push('configured launch failed');
        try {
            const bare: any = { headless: true };
            if (opts.executablePath) bare.executablePath = opts.executablePath;
            const b2 = await chromium.launch(bare);
            ok(`لكنه أقلع بإقلاع عارٍ بلا واجهة — ${b2.version()} (الإصلاح الجديد يستعمل هذا)`);
            await b2.close();
        } catch (e2: any) {
            bad(`وحتى الإقلاع العاري فشل:\n     ${fullError(e2)}`);
            problems.push('bare launch failed — run: npx playwright install chromium');
        }
    }

    head('٤) جلسة لوحة المتصفّح — هذه هي التي تفشل عنده');
    let session: any = null;
    try {
        const t = Date.now();
        session = await mgr.getBrowserSession('panel-browser');
        ok(`قامت الجلسة في ${Date.now() - t}ms — الصفحة: ${session?.page ? 'موجودة' : 'مفقودة!'} · العنوان: ${session?.page?.url?.() || '—'}`);
        if (!session?.page) problems.push('session without a page');
    } catch (e: any) {
        bad(`فشلت جلسة اللوحة — وهذا هو السبب الذي كان مبتلعاً:\n     ${fullError(e)}`);
        problems.push(`panel session failed: ${String(e?.message || e).slice(0, 200)}`);
    }

    head('٥) فحص حقيقي على صفحة حقيقية — هل يستعير اللوحة أم يهرب لمتصفّح خاصّ؟');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-diag-'));
    const dist = path.join(work, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'),
        '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تشخيص</title>'
        + '<style>body{background:#0b3d2e;color:#fff;font-family:sans-serif;margin:0}button{min-width:48px;min-height:48px;margin:8px}</style>'
        + '</head><body><h1>صفحة تشخيص</h1><button onclick="document.title=1">زر</button></body></html>', 'utf-8');

    const events: string[] = [];
    try {
        const { auditBuiltApp } = await import('../../core/quality/app-audit');
        const a = await auditBuiltApp(dist, {
            timeoutMs: 30_000, watchSessionId: 'panel-browser',
            onProgress: (m: string) => events.push(m),
        });
        if (a.skipped) { bad(`الفحص لم يجرِ: ${a.skipped}`); problems.push(`audit skipped: ${a.skipped}`); }
        else ok(`الفحص جرى: ${a.score}/100 (${(a.findings || []).map((f: any) => f.id).join(', ') || 'نظيف'})`);
        const priv = events.find(e => e.startsWith('private'));
        if (events.includes('watching')) ok('واستعار لوحة المتصفّح — أي أنك سترى الصفحة في اللوحة ✔');
        else if (priv) {
            bad(`ولم يستعر اللوحة — سقط إلى متصفّح خاصّ:\n     ${priv.replace(/^private:?/, '') || '(بلا سبب مُعلن)'}`);
            problems.push(`audit fell back to a private browser: ${priv}`);
        } else info(`أحداث الفحص: ${events.join(' · ') || 'لا شيء'}`);
    } catch (e: any) {
        bad(`الفحص نفسه رمى استثناءً:\n     ${fullError(e)}`);
        problems.push('audit threw');
    }

    head('٦) لقطة من داخل جلسة اللوحة — إثبات أن الصفحة تُرى فعلاً');
    try {
        if (session?.page) {
            const shot = path.join(work, 'panel.png');
            await session.page.screenshot({ path: shot });
            const size = fs.statSync(shot).size;
            ok(`لقطة بحجم ${Math.round(size / 1024)}KB من ${session.page.url()} → ${shot}`);
            if (size < 3000) { bad('اللقطة شبه فارغة — الصفحة لم تُحمَّل'); problems.push('blank screenshot'); }
        } else info('لا جلسة لألتقط منها');
    } catch (e: any) { bad(`تعذّرت اللقطة:\n     ${fullError(e)}`); }

    try { await mgr.stopSession('panel-browser'); } catch { /* best effort */ }

    head('الخلاصة');
    if (!problems.length) {
        ok('لا مشكلة في هذا الجهاز: المتصفّح يقلع، وجلسة اللوحة تقوم، والفحص يجري داخلها.');
        line('     إن كانت اللوحة لا تزال بيضاء عندك أثناء البناء، فالمشكلة في التوقيت أو في اتصال اللوحة —');
        line('     أرسل سجلّ اللوجز من لحظة «Self-QA» حتى نهاية البناء.');
    } else {
        bad(`عدد المشاكل: ${problems.length}`);
        problems.forEach((p, i) => line(`     ${i + 1}. ${p}`));
        line('');
        line('     أرسل هذا التقرير كاملاً — السطور أعلاه تكفي لتحديد السبب بالضبط.');
    }
    line('══════════════════════════════════════════════════════════════════════');
    process.exit(0);
}

main().catch(e => { console.error('التشخيص نفسه فشل:', e); process.exit(1); });
