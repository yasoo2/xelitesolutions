/**
 * THE PANEL, IN A REAL BROWSER, IN BOTH THEMES.
 *
 * A screenshot from the owner's own Windows laptop showed the dashboard
 * printing «232G/Files/Git (44G)» under DISK USAGE. The cause: the health
 * route shelled out to `df -h / | awk 'NR==2{printf "%s/%s (%s)", $3,$2,$5}'`.
 * On Windows, Git-Bash's own df answers for the Git installation mount, whose
 * Filesystem column contains a SPACE ("C:/Program Files/Git"), so awk's fields
 * shifted by one and the panel displayed the mount path as a disk size.
 *
 * The same screenshot showed three more honest-looking lies: a DATABASE card
 * reading «N/A · 0 docs • 0 collections» (absent is not empty), a CPU figure
 * that is really the average since boot, and a washed-out light theme whose
 * progress track was invisible because every tint was a hardcoded
 * rgba(255,255,255,…) on a white card.
 *
 * So: boot the real server, serve the real built web app, drive the real panel
 * with Chromium as a real SUPER_ADMIN, and read what the owner would read.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_admin_dashboard_live.ts
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

async function main() {
    const dist = path.join(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(dist)) {
        console.error('web/dist is missing — run `npm run build` in ../web first.');
        process.exit(1);
    }

    console.log('\n[1] القياس نفسه: ماذا يقول /system/health على هذا الجهاز');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    // The panel opens a socket the moment it mounts; without this the proof
    // would manufacture console errors that the real product never has.
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const token = jwt.sign({ sub: 'live-panel', role: 'SUPER_ADMIN', email: 'owner@joe.local' }, process.env.JWT_SECRET!);
    const base = `http://127.0.0.1:${port}`;

    const health: any = await fetch(`${base}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    console.log(`      disk="${health?.system?.disk}"  cpu="${health?.system?.cpu}"  db.connected=${health?.database?.connected}`);

    // «232G/Files/Git (44G)» must be impossible by construction now.
    check('القرص يُقاس بصيغة واحدة صارمة: مستعمل/كلي (نسبة)',
        /^\d+GB\/\d+GB \(\d+(\.\d+)?%\)$/.test(String(health?.system?.disk || '')), String(health?.system?.disk));
    check('…ولا أثر لاسم مسار داخل رقم القرص (كان يعرض Files/Git)',
        !/[A-Za-z]:|Files|Git|\//.test(String(health?.system?.disk || '').replace(/GB\/\d+GB/, 'GB_GB')),
        String(health?.system?.disk));
    check('المعالج رقم لحظي معقول بين 0 و100', (() => {
        const n = parseFloat(String(health?.system?.cpu || 'x'));
        return Number.isFinite(n) && n >= 0 && n <= 100;
    })(), String(health?.system?.cpu));
    check('قاعدة البيانات تقول «غير متصلة» صراحةً بدل صفر مستندات',
        health?.database?.connected === false && health?.database?.dataSize === null,
        JSON.stringify(health?.database));
    check('حالة الخدمة لا تدّعي «inactive» على نظام بلا systemd',
        process.platform !== 'linux' ? !/inactive/.test(String(health?.apiService?.status)) : true,
        String(health?.apiService?.status));
    check('الخادم يقول بصدق هل Docker موجود', typeof health?.dockerAvailable === 'boolean',
        String(health?.dockerAvailable));

    console.log('\n[2] اللوحة الحقيقية في متصفّح حقيقي — الوضع الفاتح (كما في لقطتك)');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const errors: string[] = [];
    const failedReqs: string[] = [];
    /**
     * Joe's OWN interface still pulls Cairo, Outfit, Inter, Noto Sans Arabic
     * and JetBrains Mono from fonts.googleapis.com at runtime — index.html and
     * global.css both do it. This sandbox has no internet, so those requests
     * fail here and fill the console; on a machine with internet they load.
     * That makes them environment noise for THIS proof, and they are filtered
     * out below — but the dependency is real and worth removing: every visit
     * announces itself to Google, and a locally-run Joe (which is how it runs
     * today) falls back to system fonts with an error on every load. The
     * generated sites were already given vendored Arabic webfonts; Joe's own
     * shell was not. That is a batch of its own.
     */
    const openPanel = async (theme: 'light' | 'dark') => {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addInitScript(([t, tok]) => {
            localStorage.setItem('token', tok as string);
            localStorage.setItem('theme', t as string);
            document.documentElement.setAttribute('data-theme', t as string);
        }, [theme, token] as any);
        const page = await ctx.newPage();
        page.on('console', m => { if (m.type() === 'error') errors.push(`${theme}: ${m.text().slice(0, 120)}`); });
        page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) failedReqs.push(`${r.url().slice(0, 90)} :: ${r.failure()?.errorText}`); });
        await page.goto(`${base}/super-admin`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.system-management', { timeout: 20000 });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForSelector('.stat-card.disk .stat-value', { timeout: 20000 });
        await page.waitForTimeout(600);
        return { ctx, page };
    };

    const { ctx: lightCtx, page: light } = await openPanel('light');
    const diskText = (await light.textContent('.stat-card.disk .stat-value'))?.trim() || '';
    // The percentage is a LIVE reading and moves between two fetches, so the
    // sizes are what must agree — comparing the whole string would make this
    // proof flap for a reason that has nothing to do with the defect.
    const sizesOf = (t: string) => (t.match(/^\d+GB\/\d+GB/) || [''])[0];
    check('بطاقة القرص تعرض القياس نفسه الذي أرسله الخادم',
        !!sizesOf(diskText) && sizesOf(diskText) === sizesOf(String(health.system.disk)),
        `${diskText} vs ${health.system.disk}`);
    const dbText = (await light.textContent('.stat-card.db .stat-value'))?.trim() || '';
    check('بطاقة القاعدة تقول «غير متصلة» للمالك بالعربية', dbText.includes('غير متصلة'), dbText);
    const dbSub = (await light.textContent('.stat-card.db .stat-sub'))?.trim() || '';
    check('…وتشرح السبب بدل «0 docs • 0 collections»', /MongoDB|تخزين/.test(dbSub), dbSub.slice(0, 80));

    // The invisible progress track from the screenshot: measure it, don't look.
    const track = await light.$eval('.stat-card.cpu .progress-bar',
        el => getComputedStyle(el).backgroundColor);
    const transparent = /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(track);
    check('مسار شريط التقدّم مرئي في الوضع الفاتح (كان شفافاً تماماً)', !transparent, track);
    const tabs = await light.$eval('.mgmt-tabs', el => getComputedStyle(el).backgroundColor);
    check('شريط التبويبات له خلفية مرئية في الفاتح', !/rgba\(0,\s*0,\s*0,\s*0\)/.test(tabs), tabs);

    const fleetBadge = (await light.textContent('.section-card .section-badge'))?.trim() || '';
    check('قسم الحاويات يقول الحقيقة عن Docker بدل «0 running»',
        /Docker غير مثبّت|تعمل/.test(fleetBadge), fleetBadge);

    // The collapse that used to do nothing.
    const bodyBefore = await light.$('.section-card .section-body');
    await light.click('.section-header.clickable');
    await light.waitForTimeout(400);
    const bodyAfter = await light.$('.section-card .section-body');
    check('مفتاح الطيّ يفتح/يغلق فعلاً (كان لا يفعل شيئاً)', !bodyBefore && !!bodyAfter, `${!!bodyBefore} → ${!!bodyAfter}`);

    console.log('\n[3] والوضع الداكن لم ينكسر بالمقابل');
    await lightCtx.close();
    const { ctx: darkCtx, page: dark } = await openPanel('dark');
    const darkTrack = await dark.$eval('.stat-card.cpu .progress-bar', el => getComputedStyle(el).backgroundColor);
    check('مسار الشريط مرئي في الداكن أيضاً', !/rgba\(0,\s*0,\s*0,\s*0\)/.test(darkTrack), darkTrack);
    const darkDisk = (await dark.textContent('.stat-card.disk .stat-value'))?.trim() || '';
    check('والقرص يُعرض كما هو في الوضعين',
        (darkDisk.match(/^\d+GB\/\d+GB/) || [''])[0] === (diskText.match(/^\d+GB\/\d+GB/) || ['x'])[0],
        `${darkDisk} vs ${diskText}`);
    await darkCtx.close();

    // Font requests to Google are filtered above: no internet in this sandbox.
    const realErrors = errors.filter(e => !/Failed to load resource/.test(e));
    check('لا أخطاء JavaScript في وحدة التحكّم', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    check('ولا طلب داخلي فاشل (خارج خطوط جوجل التي لا إنترنت لها هنا)',
        failedReqs.length === 0, failedReqs.slice(0, 3).join(' | '));

    await browser.close();
    server.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
