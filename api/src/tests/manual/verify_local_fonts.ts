/**
 * JOE SERVES ITS OWN FONTS — proven by watching every request it makes.
 *
 * The interface fetched five families from fonts.googleapis.com on every page
 * load. It needed the internet to look right, it paid a third-party handshake
 * before the first paint, and it told Google about every visitor — which
 * stops being a footnote the moment Joe is online for users worldwide.
 *
 * Vendoring is only half the job. The half that is usually skipped: proving
 * that NOTHING external is still requested, and that the local files are
 * actually the ones rendering. Both are measured here — the browser's own
 * request log, and document.fonts, not a screenshot.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_local_fonts.ts
 *       (needs `npm run build` in ../web first)
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const WEB = path.join(__dirname, '..', '..', '..', '..', 'web');

async function main() {
    console.log('\n[1] المصدر نفسه: لا سطر يشير إلى خوادم خطوط خارجية');
    const read = (p: string) => fs.readFileSync(path.join(WEB, p), 'utf-8');
    const html = read('index.html');
    const css = read('src/global.css');
    check('index.html لا يحمّل من fonts.googleapis.com', !/href="https:\/\/fonts\.googleapis/.test(html));
    check('…ولا يفتح اتصالاً مسبقاً بجوجل (preconnect)', !/preconnect[^>]*gstatic|preconnect[^>]*googleapis/.test(html));
    check('global.css لا يستورد Cairo من الشبكة', !/@import url\('https:\/\/fonts\.googleapis/.test(css));
    check('index.html يحمّل ورقة خطوطنا المحلّية', html.includes('href="/fonts/fonts.css"'));

    const faces = read('public/fonts/fonts.css');
    const files = fs.readdirSync(path.join(WEB, 'public', 'fonts')).filter(f => f.endsWith('.woff2'));
    check(`${files.length} ملف خط محلّي موجود فعلاً على القرص`, files.length >= 15, String(files.length));
    const declared = [...faces.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(m => m[1]);
    check('كل وجه معلَن في الورقة له ملف حقيقي — لا إعلان بلا ملف',
        declared.every(d => files.includes(d)), declared.filter(d => !files.includes(d)).join(', '));
    check('وكل ملف مُنزَّل مستعمَل — لا وزن ثقيل بلا استدعاء',
        files.every(f => declared.includes(f)), files.filter(f => !declared.includes(f)).join(', '));
    check('نطاق المحارف محفوظ لكل وجه (شاشة لاتينية لا تحمّل العربية)',
        (faces.match(/unicode-range:/g) || []).length === declared.length);
    check('رخصة الخطوط مرافقة للملفات', fs.existsSync(path.join(WEB, 'public', 'fonts', 'OFL-LICENSE.txt')));
    const totalKb = files.reduce((n, f) => n + fs.statSync(path.join(WEB, 'public', 'fonts', f)).size, 0) / 1024;
    console.log(`      (${totalKb.toFixed(0)} KB إجمالاً، تُحمَّل من خادمك مرة واحدة)`);
    check('الحجم معقول — أقل من ميغابايت', totalKb < 1024, `${totalKb.toFixed(0)} KB`);

    console.log('\n[2] الحقيقة في المتصفّح: كل طلب تصدره الصفحة مُراقَب');
    if (!fs.existsSync(path.join(WEB, 'dist', 'index.html'))) {
        console.error('web/dist مفقود — نفّذ npm run build في ../web أولاً.');
        process.exit(1);
    }
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;
    const token = jwt.sign({ sub: 'fonts-proof', role: 'SUPER_ADMIN', email: 'owner@joe.local' }, process.env.JWT_SECRET!);

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((tok) => localStorage.setItem('token', tok as string), token);
    const page = await ctx.newPage();

    const external: string[] = [];
    const fontRequests: string[] = [];
    page.on('request', r => {
        const u = r.url();
        if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u.slice(0, 90));
        if (/\.woff2?(\?|$)/.test(u)) fontRequests.push(u.replace(base, ''));
    });

    await page.goto(`${base}/super-admin`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.system-management', { timeout: 20000 });
    await page.waitForTimeout(1200);

    check('لا طلب واحد يغادر خادمك — لا جوجل ولا غيره',
        external.length === 0, [...new Set(external)].slice(0, 4).join(' | '));
    check(`الخطوط تُحمَّل من /fonts محلياً (${fontRequests.length} ملف)`,
        fontRequests.length > 0 && fontRequests.every(u => u.startsWith('/fonts/')),
        fontRequests.slice(0, 4).join(', '));

    console.log('\n[3] وهل تُرسَم فعلاً؟ نسأل المتصفّح لا الشاشة');
    const loaded = await page.evaluate(async () => {
        // fonts.check() is only true for a face the page has ALREADY pulled, and
        // a browser fetches a weight the moment something needs it — so ask for
        // it first. If the face were still remote and unreachable, this load()
        // would reject and the check below would fail, which is the point.
        await (document as any).fonts.load('600 16px Cairo');
        await (document as any).fonts.load('400 16px Cairo');
        const list = [...(document as any).fonts].map((f: any) => `${f.family}@${f.weight}:${f.status}`);
        return {
            list,
            cairoReady: (document as any).fonts.check('600 16px Cairo') && (document as any).fonts.check('400 16px Cairo'),
            bodyFamily: getComputedStyle(document.body).fontFamily,
        };
    });
    check('عائلة Cairo محمّلة وجاهزة في المتصفّح', loaded.cairoReady, loaded.list.slice(0, 3).join(' | '));
    check('…وهي فعلاً خط الواجهة المطبَّق', /Cairo/.test(loaded.bodyFamily), loaded.bodyFamily.slice(0, 70));

    // Arabic must render with the Arabic subset, not a fallback: measure width.
    const width = await page.evaluate(() => {
        const el = document.createElement('span');
        el.textContent = 'مرحباً يا يونس';
        el.style.cssText = 'position:fixed;left:-9999px;font:600 24px Cairo;';
        document.body.appendChild(el);
        const w = el.getBoundingClientRect().width;
        el.style.font = '600 24px "NoSuchFontAnywhere"';
        const fallback = el.getBoundingClientRect().width;
        el.remove();
        return { w, fallback };
    });
    check('النص العربي يُرسم بـCairo لا بخط النظام الاحتياطي',
        width.w > 0 && Math.abs(width.w - width.fallback) > 1, JSON.stringify(width));

    console.log('\n[4] وبلا إنترنت إطلاقاً — الحالة التي كانت تكسر الشكل');
    const offlineCtx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await offlineCtx.addInitScript((tok) => localStorage.setItem('token', tok as string), token);
    // Everything outside Joe's own origin is cut off at the browser level.
    await offlineCtx.route('**', route =>
        route.request().url().startsWith(base) ? route.continue() : route.abort());
    const off = await offlineCtx.newPage();
    await off.goto(`${base}/super-admin`, { waitUntil: 'domcontentloaded' });
    await off.waitForSelector('.system-management', { timeout: 20000 });
    await off.waitForTimeout(1000);
    const offlineOk = await off.evaluate(async () => {
        await (document as any).fonts.load('600 16px Cairo');
        return (document as any).fonts.check('600 16px Cairo');
    });
    check('الواجهة تبقى بخطّها الصحيح مع قطع كل ما هو خارج جو', offlineOk);
    await offlineCtx.close();

    await browser.close();
    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
