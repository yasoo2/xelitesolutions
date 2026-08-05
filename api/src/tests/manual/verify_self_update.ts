/**
 * JOE UPDATES HIMSELF — AND NOBODY ELSE CAN MAKE HIM.
 *
 * «هذه ليش كل مرة لازم احطها على البورشال.. بدي طريقة ما احطها ولا مرة».
 *
 * This drives the real server and the real browser:
 *   [2] the endpoint answers only the machine Joe runs on — a request from
 *       any other address is refused, which matters because Joe is going
 *       online and this route rebuilds the server
 *   [3] the button exists in his menu, and vanishes when self-update is off
 *   [4] clicking it really starts a detached process, and the overlay shows
 *       that process's OWN output — not a canned message
 *   [5] when the server dies mid-update the overlay says so, and when it
 *       comes back the page reloads itself
 *   [6] the updater outlives the server that started it (the whole point:
 *       it is about to kill that server)
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_self_update.ts
 */
export {};
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.JOE_CHAT_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-upd-store-'));

const UPDATE_LOG = path.join(os.tmpdir(), 'joe-self-update.log');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A harmless stand-in for the real updater: it prints, it lingers, it never touches git. */
function writeFakeUpdater(marker: string): string {
    const p = path.join(os.tmpdir(), `joe-fake-updater-${Date.now()}.sh`);
    fs.writeFileSync(p, [
        '#!/usr/bin/env bash',
        // Like the real updater: says nothing for a moment, then reports through
        // the log file it was handed — not through stdout, because on Windows
        // PowerShell's Write-Host never reaches stdout at all.
        'sleep 2',
        'say() { echo "$1"; [ -n "$JOE_UPDATE_LOG" ] && printf "%s\\n" "$1" >> "$JOE_UPDATE_LOG"; }',
        `say "${marker}"`,
        'for i in 1 2 3 4 5 6 7 8 9 10 11 12; do say "خطوة $i من التحديث"; sleep 1; done',
        'say "[OK] التحديث اكتمل — جو يعود الآن."',
        // proves the child outlives its parent: it is still alive well after
        // the server that spawned it is gone
        `echo "ما زلت حياً بعد موت الخادم" >> "${path.join(os.tmpdir(), 'joe-orphan-proof.txt')}"`,
        '',
    ].join('\n'), { mode: 0o755 });
    return p;
}

/** This box's own non-loopback address — the closest thing to "someone else on the network". */
function lanAddress(): string | null {
    for (const list of Object.values(os.networkInterfaces())) {
        for (const n of list || []) {
            if (n.family === 'IPv4' && !n.internal) return n.address;
        }
    }
    return null;
}

const get = (url: string) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    http.get(url, r => {
        let b = ''; r.on('data', d => { b += d; });
        r.on('end', () => { try { resolve({ status: r.statusCode || 0, body: JSON.parse(b) }); } catch { resolve({ status: r.statusCode || 0, body: b }); } });
    }).on('error', reject);
});

const post = (url: string) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST' }, r => {
        let b = ''; r.on('data', d => { b += d; });
        r.on('end', () => { try { resolve({ status: r.statusCode || 0, body: JSON.parse(b) }); } catch { resolve({ status: r.statusCode || 0, body: b }); } });
    });
    req.on('error', reject);
    req.end();
});

async function boot(env: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete (process.env as any)[k];
        else (process.env as any)[k] = v;
    }
    // a fresh module registry so the route re-reads the env it was given
    for (const k of Object.keys(require.cache)) {
        if (/api[\\/](app|routes)/.test(k)) delete require.cache[k];
    }
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const srv = http.createServer(createApp());
    attachWebSocket(srv);
    srv.listen(0, '0.0.0.0');            // 0.0.0.0 so the non-loopback refusal can be tested for real
    await new Promise<void>(r => srv.once('listening', () => r()));
    return { srv, port: (srv.address() as any).port as number };
}

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) { console.error('❌ الواجهة غير مبنيّة — شغّل npm run build في web أولاً'); process.exit(1); }
    try { fs.unlinkSync(path.join(os.tmpdir(), 'joe-orphan-proof.txt')); } catch { /* first run */ }

    const marker = `بدء التحديث ${Date.now()}`;
    const updater = writeFakeUpdater(marker);

    console.log('\n[1] خادم جو الحقيقي');
    let { srv, port } = await boot({ JOE_UPDATE_SCRIPT: updater, JOE_SELF_UPDATE: undefined });
    check('الخادم يعمل', port > 0);

    console.log('\n[2] لا أحد من خارج هذا الجهاز يستطيع تحديث جو');
    const localStatus = await get(`http://127.0.0.1:${port}/api/system/update/status`);
    check('الجهاز نفسه مسموح له', localStatus.body?.allowed === true, JSON.stringify(localStatus.body?.allowed));

    const lan = lanAddress();
    if (lan) {
        const remote = await post(`http://${lan}:${port}/api/system/update`);
        check('طلب من عنوان آخر يُرفض بـ 403', remote.status === 403, `status=${remote.status}`);
        check('والرفض يُسمّي سببه', remote.body?.error === 'local_only', JSON.stringify(remote.body));
        const remoteStatus = await get(`http://${lan}:${port}/api/system/update/status`);
        check('ولا يُعرض له الزر أصلاً', remoteStatus.body?.allowed === false);
    } else {
        console.log('  (تخطّي: لا يوجد عنوان شبكة غير محلي على هذه الآلة)');
    }

    console.log('\n[3] وإطفاء الميزة يُخفيها تماماً');
    srv.close();
    await new Promise(r => setTimeout(r, 300));
    ({ srv, port } = await boot({ JOE_SELF_UPDATE: '0', JOE_UPDATE_SCRIPT: updater }));
    const off = await get(`http://127.0.0.1:${port}/api/system/update/status`);
    check('status يقول: غير مسموح', off.body?.allowed === false);
    const offPost = await post(`http://127.0.0.1:${port}/api/system/update`);
    check('و POST يردّ 404', offPost.status === 404, `status=${offPost.status}`);

    srv.close();
    await new Promise(r => setTimeout(r, 300));
    ({ srv, port } = await boot({ JOE_SELF_UPDATE: '1', JOE_UPDATE_SCRIPT: updater }));

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const jwt = require('jsonwebtoken');
        const tok = jwt.sign({ sub: 'u1', role: 'OWNER', email: 't@l', name: 'T', picture: '' }, process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((t: string) => {
            localStorage.setItem('token', t);
            localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'T', role: 'OWNER' }));
        }, tok);
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        for (const l of ['Set up later', 'لاحقاً', 'لاحقا']) {
            const e = page.getByText(l, { exact: false }).first();
            if (await e.count() && await e.isVisible().catch(() => false)) { await e.click(); await page.waitForTimeout(400); break; }
        }

        console.log('\n[4] الزر في مكانه، وضغطة واحدة تكفي');
        await page.click('.joe-user-trigger');
        await page.waitForTimeout(500);
        const item = page.locator('[data-testid="update-joe"]');
        check('عنصر «تحديث جو» ظاهر في القائمة', await item.count() > 0 && await item.isVisible());
        check('ونصّه عربي مفهوم، لا رمز', (await item.innerText().catch(() => '')).includes('تحديث جو'));

        await item.click();
        await page.waitForTimeout(1200);
        const overlay = page.locator('[data-testid="update-overlay"]');
        check('الطبقة ظهرت فور الضغط', await overlay.count() > 0 && await overlay.isVisible());

        // The menu closed on click. The overlay must not have died with it.
        check('والقائمة أُغلقت والطبقة باقية', await page.locator('.joe-user-menu').count() === 0 && await overlay.isVisible());

        console.log('\n[5] والطبقة صادقة قبل وصول أول سطر، ثم تعرض مخرجات العملية نفسها');
        // The updater is deliberately silent for its first two seconds — like
        // the real one, whose first step is a network pull. What he saw here
        // was «…» and nothing else, for two minutes.
        const early = await overlay.innerText();
        check('تقول إن التحديث بدأ ولم يصل سطر بعد', /لم يصل أول سطر بعد/.test(early), early.slice(0, 120));
        check('ومعها عدّاد وقت يتحرّك', await page.locator('.joe-update-clock').count() === 1);
        const t1 = await page.locator('.joe-update-clock').innerText();
        await page.waitForTimeout(2500);
        const t2 = await page.locator('.joe-update-clock').innerText();
        check('والعدّاد تقدّم فعلاً', t1 !== t2, `${t1} → ${t2}`);

        await page.waitForTimeout(3500);
        const logText = await page.locator('.joe-update-log').innerText();
        check('السطر الذي كتبه المحدِّث نفسه ظاهر', logText.includes(marker), logText.slice(0, 120));
        check('والتقدّم يتوالى سطراً بعد سطر', /خطوة 2 من التحديث/.test(logText), logText.slice(-160));
        const onDisk = fs.readFileSync(UPDATE_LOG, 'utf-8');
        check('وهو نفسه ما في ملف السجل على القرص', onDisk.includes(marker));

        console.log('\n[6] وحين يموت الخادم أثناء التحديث');
        // closeAllConnections أولاً: المتصفح يمسك اتصالاً حياً وسوكِتاً، و
        // close() وحده ينتظرهما إلى الأبد فيتجمّد الاختبار بدل أن يقيس شيئاً.
        (srv as any).closeAllConnections?.();
        await new Promise<void>(r => { srv.close(() => r()); setTimeout(r, 3000); });
        await page.waitForTimeout(4000);
        const head = await page.locator('.joe-update-head').innerText();
        check('الطبقة تقول: جو يعود الآن', head.includes('يعود'), head);

        console.log('\n[7] وحين يعود، تُحدَّث الصفحة وحدها');
        let reloaded = false;
        page.on('framenavigated', (f: any) => { if (f === page.mainFrame()) reloaded = true; });
        // the browser is pinned to the first port, so the new Joe comes back there
        const revived = http.createServer((await import('../../api/app')).createApp());
        (await import('../../api/ws')).attachWebSocket(revived);
        revived.listen(port, '0.0.0.0');
        await new Promise<void>(r => revived.once('listening', () => r()));
        await page.waitForTimeout(6000);
        check('الصفحة أعادت تحميل نفسها بلا تدخّل', reloaded);
        (revived as any).closeAllConnections?.();
        revived.close();

        console.log('\n[8] والمحدِّث يعيش بعد موت من شغّله');
        await new Promise(r => setTimeout(r, 9000));
        const orphan = path.join(os.tmpdir(), 'joe-orphan-proof.txt');
        check('العملية أكملت عملها رغم إغلاق الخادم', fs.existsSync(orphan),
            'لو مات المحدِّث مع الخادم لما وُجد هذا الملف');
    } finally {
        await browser.close();
        try { srv.close(); } catch { /* already closed */ }
        try { fs.unlinkSync(updater); } catch { /* best effort */ }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
