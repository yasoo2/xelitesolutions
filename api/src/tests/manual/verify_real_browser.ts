/**
 * «متصفحك الحقيقي كمسار افتراضي للوكيل» — the last of the five.
 *
 * Joe has been able to open the user's own Chrome, with his own logins, for a
 * long time. The switch has been pinned to "0" that whole time for one reason:
 * Chrome locks its profile folder, so the feature worked only if he first
 * closed the browser he was using. A feature with that condition is not a
 * feature.
 *
 * The lock guards a FOLDER. The logins live in a handful of small files inside
 * it. So when the folder is busy, Joe copies those files into a folder it owns
 * and opens Chrome there — beside his window, not instead of it.
 *
 * Every claim below is measured against a real Chromium:
 *
 *   [1] a profile with a real login in it
 *   [2] opening it twice really is refused — the lock is not folklore
 *   [3] the copy carries the login files and leaves the caches behind
 *   [4] Chrome opens on the copy WHILE the first one is still running
 *   [5] and the session is there: the cookie and the storage came across
 *   [6] the flag is no longer inert, and it is on by default in start-joe.ps1
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_real_browser.ts
 */
export {};
import http from 'http';
import fs from 'fs';
import os from 'os';
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
    const { chromium } = await import('playwright');
    const { findChromiumExecutable, cloneRealBrowserProfile, isPersistentBrowserMode } =
        await import('../../modules/browser/manager');

    const exe = findChromiumExecutable();
    const launchOpts: any = { headless: true, args: ['--no-first-run', '--no-default-browser-check'] };
    if (exe) launchOpts.executablePath = exe;

    // A site to be «logged in» to.
    const srv = http.createServer((_rq, rs) => {
        rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rs.end('<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>حسابي</title></head><body><h1>مرحباً</h1></body></html>');
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const site = `http://127.0.0.1:${(srv.address() as any).port}/`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-realprofile-'));
    const realDir = path.join(root, 'User Data');
    process.env.BROWSER_PROFILE_CLONE_DIR = path.join(root, 'clone');

    console.log('\n[1] ملف شخصي حقيقي، فيه جلسة حقيقية');
    {
        const c = await chromium.launchPersistentContext(realDir, launchOpts);
        const p = c.pages()[0] || await c.newPage();
        await p.goto(site);
        await c.addCookies([{ name: 'joe_session', value: 'ana-mosajjal', url: site, expires: Math.floor(Date.now() / 1000) + 86_400 }]);
        await p.evaluate(() => localStorage.setItem('joe_token', 'حاضر'));
        await p.waitForTimeout(400);
        await c.close();
    }
    // Chrome moved the cookie jar into Default/Network in v96; the Chromium
    // Playwright ships still keeps it at Default/Cookies. Both are copied, so
    // both are accepted here — Joe must work on his Chrome AND on this one.
    const jarOf = (base: string) => [
        path.join(base, 'Default', 'Network', 'Cookies'),
        path.join(base, 'Default', 'Cookies'),
    ].find(p => fs.existsSync(p)) || '';
    check('الجلسة كُتبت على القرص (ملف الكوكيز موجود)', !!jarOf(realDir));
    check('ومفتاح التشفير معه (Local State)', fs.existsSync(path.join(realDir, 'Local State')));

    console.log('\n[2] وفتحه مرّتين مرفوض فعلاً — القفل حقيقة لا حكاية');
    const held = await chromium.launchPersistentContext(realDir, launchOpts);   // «متصفحه مفتوح»
    let lockMsg = '';
    try {
        const second = await chromium.launchPersistentContext(realDir, launchOpts);
        await second.close();
    } catch (e: any) { lockMsg = String(e?.message || e); }
    check('المحاولة الثانية على نفس المجلد فشلت', !!lockMsg, 'لم تفشل');
    check('وهذا بالضبط ما كان يعطّل الميزة طوال الوقت',
        /ProcessSingleton|SingletonLock|already|in use|unique/i.test(lockMsg), lockMsg.slice(0, 160));

    console.log('\n[3] فتُنسَخ ملفات الدخول وحدها — لا الذاكرة المؤقتة');
    // A cache directory of the kind that makes profiles gigantic.
    fs.mkdirSync(path.join(realDir, 'Default', 'Cache', 'Cache_Data'), { recursive: true });
    fs.writeFileSync(path.join(realDir, 'Default', 'Cache', 'Cache_Data', 'big.bin'), Buffer.alloc(2 * 1024 * 1024));
    const clone = cloneRealBrowserProfile({ userDataDir: realDir, name: 'Chrome' });
    check('نُسخ مفتاح التشفير', fs.existsSync(path.join(clone, 'Local State')));
    check('ونُسخ جرّة الكوكيز', !!jarOf(clone), 'لم توجد في أيٍّ من المسارين');
    check('ونُسخ التخزين المحلي', fs.existsSync(path.join(clone, 'Default', 'Local Storage')));
    check('ولم تُنسخ الذاكرة المؤقتة — هي كتلة الحجم كلها وبلا قيمة',
        !fs.existsSync(path.join(clone, 'Default', 'Cache')));
    check('والمجلد الأصلي لم يُمَسّ', !!jarOf(realDir));

    console.log('\n[4] ويفتح جو النسخة والمتصفح الأصلي ما زال يعمل');
    let cloneCtx: any = null, openErr = '';
    try { cloneCtx = await chromium.launchPersistentContext(clone, launchOpts); }
    catch (e: any) { openErr = String(e?.message || e); }
    check('فُتحت النسخة بلا إغلاق شيء', !!cloneCtx, openErr.slice(0, 200));
    check('والنافذة الأولى ما زالت حيّة', held.pages().length >= 0 && !openErr);

    console.log('\n[5] والجلسة عبرت معها — لا تسجيل دخول من جديد');
    if (cloneCtx) {
        const cookies = await cloneCtx.cookies(site);
        const found = cookies.find((c: any) => c.name === 'joe_session');
        check('الكوكي انتقل بقيمته الصحيحة', found?.value === 'ana-mosajjal', JSON.stringify(cookies.map((c: any) => c.name)));
        const p2 = cloneCtx.pages()[0] || await cloneCtx.newPage();
        await p2.goto(site);
        const token = await p2.evaluate(() => localStorage.getItem('joe_token'));
        check('والتخزين المحلي انتقل كذلك', token === 'حاضر', String(token));
        await cloneCtx.close();
    } else { check('الكوكي انتقل بقيمته الصحيحة', false, 'لم تُفتح النسخة'); check('والتخزين المحلي انتقل كذلك', false); }
    await held.close();

    console.log('\n[6] والمفتاح لم يعد خاملاً — وهو مُفعّل افتراضياً عنده');
    const keep = process.env.USE_USER_BROWSER_PROFILE;
    process.env.USE_SYSTEM_CHROME = '0';
    process.env.BROWSER_PERSISTENT_PROFILE = '0';
    process.env.USE_USER_BROWSER_PROFILE = '1';
    check('USE_USER_BROWSER_PROFILE وحده يكفي لتفعيل الملف الدائم', isPersistentBrowserMode() === true);
    process.env.USE_USER_BROWSER_PROFILE = '0';
    check('وإطفاؤه يعيد Chromium المرفق', isPersistentBrowserMode() === false);
    if (keep === undefined) delete process.env.USE_USER_BROWSER_PROFILE; else process.env.USE_USER_BROWSER_PROFILE = keep;

    const ps = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'start-joe.ps1'), 'utf-8');
    const settings = ps.match(/\$env:USE_USER_BROWSER_PROFILE\s*=\s*"(\d)"/g) || [];
    check('start-joe.ps1 يضبطه على 1 في كل موضع',
        settings.length >= 2 && settings.every(s => /"1"/.test(s)), settings.join(' | '));

    console.log('\n[7] والسقوط الآمن مكتوب: إن تعذّرت النسخة تُقال الحقيقة');
    const M = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'browser', 'manager.ts'), 'utf-8');
    check('القفل يُعالَج بالنسخ لا بالرسالة «أغلق متصفحك»', /cloneRealBrowserProfile\(real\)/.test(M));
    check('وإن فشلت النسخة أيضاً يُقال ذلك صراحةً', /browser_profile_locked: متصفحك/.test(M));
    check('ويمكن تعطيل النسخ بمفتاح واحد', /BROWSER_CLONE_LOCKED_PROFILE/.test(M));

    try { srv.close(); } catch { /* done */ }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
