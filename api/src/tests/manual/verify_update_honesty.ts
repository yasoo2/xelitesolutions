/**
 * AN UPDATE THAT STOPPED MUST SAY SO — «نصف ساعه ولم يتم تحديث النظام».
 *
 * The screenshot: «الخطوة 1 من 4», a bar, a clock reading 30:36, and a log
 * holding exactly ONE line — the header Joe itself had written. The updater
 * had said nothing for half an hour and the interface reported progress the
 * whole time. Three separate defects made that possible, and this proves all
 * three are gone, with real processes and a real browser:
 *
 *   [2] a spawn that FAILS is reported as a failure — it used to return
 *       ok:true with no pid, and the unhandled 'error' event it left behind
 *       is an uncaught exception, i.e. it could kill Joe outright
 *   [3] a missing interpreter is answered, named, and written to the log
 *   [4] an updater that starts and says nothing becomes «stalled», with the
 *       watchdog's diagnosis in the log — never an eternal step 1
 *   [5] the browser shows «التحديث متوقّف», the manual command, and a retry
 *   [6] …and a HEALTHY updater is still reported as running, unchanged
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_update_honesty.ts
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
process.env.JOE_CHAT_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-honest-store-'));
// The real thresholds are 40s / 6min. The behaviour is identical at 6s; the
// proof simply refuses to take a minute per assertion.
process.env.JOE_UPDATE_SILENT_MS = '6000';

const UPDATE_LOG = path.join(os.tmpdir(), 'joe-self-update.log');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

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

/** An updater that starts, stays alive, and says NOTHING — the field failure. */
function writeMuteUpdater(): string {
    const p = path.join(os.tmpdir(), `joe-mute-updater-${Date.now()}.sh`);
    fs.writeFileSync(p, '#!/usr/bin/env bash\nsleep 300\n', { mode: 0o755 });
    return p;
}

/** …and one that behaves, so «stalled» cannot be a blanket verdict. */
function writeTalkingUpdater(): string {
    const p = path.join(os.tmpdir(), `joe-talking-updater-${Date.now()}.sh`);
    fs.writeFileSync(p, [
        '#!/usr/bin/env bash',
        // Straight to stdout — the channel Joe redirects into the log. The old
        // scripts opened the log a SECOND time from inside PowerShell, and on
        // Windows that write failed inside a silent catch: one line, half an
        // hour, «الخطوة 1 من 4».
        'echo "[STAGE] pulling"',
        'echo "أسحب التحديث…"',
        'sleep 30',
        '',
    ].join('\n'), { mode: 0o755 });
    return p;
}

async function boot(env: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete (process.env as any)[k];
        else (process.env as any)[k] = v;
    }
    for (const k of Object.keys(require.cache)) {
        if (/api[\\/](app|routes)/.test(k)) delete require.cache[k];
    }
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const srv = http.createServer(createApp());
    attachWebSocket(srv);
    srv.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    return { srv, port: (srv.address() as any).port as number };
}

const close = async (srv: http.Server) => {
    (srv as any).closeAllConnections?.();
    srv.close();
    await new Promise(r => setTimeout(r, 300));
};

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) { console.error('❌ الواجهة غير مبنيّة — شغّل npm run build في web أولاً'); process.exit(1); }

    console.log('\n[1] الخادم الحقيقي');
    let { srv, port } = await boot({ JOE_SELF_UPDATE: '1', JOE_UPDATE_SCRIPT: writeMuteUpdater() });
    check('الخادم يعمل', port > 0);

    console.log('\n[2] تشغيلٌ فاشل يُبلَّغ عنه كفشل — ولا يقتل جو');
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    const probeLog = path.join(os.tmpdir(), `joe-spawn-probe-${Date.now()}.log`);
    const bad = executionEngine.runDetached('joe-definitely-not-a-real-binary', [], { logFile: probeLog });
    check('runDetached يردّ ok:false لبرنامج غير موجود', bad.ok === false, JSON.stringify(bad));
    check('ويسمّي البرنامج في سبب الفشل', String(bad.error || '').includes('joe-definitely-not-a-real-binary'), String(bad.error));
    await new Promise(r => setTimeout(r, 500));
    check('والسبب مكتوب في السجل ليقرأه المستخدم',
        fs.existsSync(probeLog) && fs.readFileSync(probeLog, 'utf-8').includes('[X]'),
        fs.existsSync(probeLog) ? fs.readFileSync(probeLog, 'utf-8').slice(0, 120) : 'لا ملف');
    // The whole point of the previous line: this process is still standing.
    const alive = await get(`http://127.0.0.1:${port}/api/system/update/status`);
    check('وجو نفسه ما زال يعمل بعد فشل التشغيل', alive.status === 200);
    try { fs.unlinkSync(probeLog); } catch { /* fine */ }

    /**
     * HIS EXACT FAILURE, REPRODUCED.
     *
     * The log from his machine said «العملية انتهت دون أن تبدأ»: PowerShell was
     * found, was launched, produced not one byte, and died. That was as far as
     * the diagnosis could go, because nothing recorded WHY. An exit code is one
     * line and it is the whole difference.
     */
    console.log('\n[2b] عملية تموت فوراً وبصمت — الرمز يُكتب، لا يُبتلع');
    const dies = path.join(os.tmpdir(), `joe-dies-${Date.now()}.sh`);
    fs.writeFileSync(dies, '#!/usr/bin/env bash\nexit 42\n', { mode: 0o755 });
    const dieLog = path.join(os.tmpdir(), `joe-die-log-${Date.now()}.log`);
    const dieOut = path.join(os.tmpdir(), `joe-die-out-${Date.now()}.log`);
    const died = executionEngine.runDetached('/bin/bash', [dies], { noteFile: dieLog, outFile: dieOut });
    check('التشغيل نجح فعلاً — المشكلة ليست في الإقلاع', died.ok === true && Number(died.pid) > 0, JSON.stringify(died));
    await new Promise(r => setTimeout(r, 1200));
    const dieText = fs.existsSync(dieLog) ? fs.readFileSync(dieLog, 'utf-8') : '';
    check('ورمز الخروج مكتوب في السجل بلغة مفهومة', /رمز الخروج 42/.test(dieText), dieText.slice(0, 200) || 'لا سجل');
    check('ومخرجات العملية في ملفها المنفصل — لا مقبضان على ملف واحد',
        fs.existsSync(dieOut) && !fs.readFileSync(dieOut, 'utf-8').includes('رمز الخروج'));
    for (const f of [dies, dieLog, dieOut]) { try { fs.unlinkSync(f); } catch { /* fine */ } }

    console.log('\n[3] مفسِّر مفقود: جواب فوري باسمه، لا شريط أبديّ');
    await close(srv);
    const ghostPs1 = path.join(os.tmpdir(), 'joe-ghost-updater.ps1');
    fs.writeFileSync(ghostPs1, '# a PowerShell script on a machine with no PowerShell\n');
    ({ srv, port } = await boot({ JOE_UPDATE_SCRIPT: ghostPs1 }));
    const noPs = await post(`http://127.0.0.1:${port}/api/system/update`);
    check('الطلب يردّ 500 لا 200', noPs.status === 500, `status=${noPs.status}`);
    check('ويسمّي المفقود: PowerShell', /PowerShell/.test(JSON.stringify(noPs.body)), JSON.stringify(noPs.body));
    check('والسجل يحمل [X] لا صمتاً', readLog().includes('[X]'), readLog().slice(0, 160));

    console.log('\n[4] محدِّث يبدأ ولا يقول شيئاً = «متوقّف»، لا «جارٍ»');
    await close(srv);
    ({ srv, port } = await boot({ JOE_UPDATE_SCRIPT: writeMuteUpdater() }));
    const started = await post(`http://127.0.0.1:${port}/api/system/update`);
    check('التشغيل نجح فعلاً (عملية حقيقية بمعرّف)', started.status === 200 && Number(started.body?.pid) > 0, JSON.stringify(started.body));

    const early = await get(`http://127.0.0.1:${port}/api/system/update/status`);
    check('وفي أول ثانية يُعتبر جارياً — الصمت مبكّراً طبيعي', early.body?.running === true && !early.body?.stalled,
        JSON.stringify({ running: early.body?.running, stalled: early.body?.stalled }));
    check('والسجل يقول ما الذي جرت محاولة تشغيله', readLog().includes('[i] البرنامج:') && readLog().includes('[i] السكربت:'),
        readLog().slice(0, 200));

    await new Promise(r => setTimeout(r, 8000));
    const late = await get(`http://127.0.0.1:${port}/api/system/update/status`);
    check('وبعد المهلة: stalled = never_started', late.body?.stalled === 'never_started', JSON.stringify(late.body?.stalled));
    check('ولم يعد يدّعي أنه «جارٍ»', late.body?.running === false, String(late.body?.running));
    check('والعملية ما زالت حيّة — أي أن الحكم من الصمت لا من الموت', late.body?.alive === true, String(late.body?.alive));
    const log = readLog();
    check('والحارس كتب التشخيص في السجل بعلامته الخاصة', log.includes('[!]') && log.includes('لم يكتب أي سطر'), log.slice(-300));
    check('ومعه الأمر اليدوي الذي ينجح دائماً', log.includes('update-joe') || log.includes('cd '), log.slice(-300));

    console.log('\n[5] وفي المتصفح: «التحديث متوقّف»، ومخرج، وإعادة محاولة');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
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
        await page.click('.joe-user-trigger');
        await page.waitForTimeout(400);
        await page.locator('[data-testid="update-joe"]').click();

        // The mute updater is already past the threshold; the first poll tells
        // the truth. Waiting here is waiting for a POLL, not for a timeout.
        const card = page.locator('[data-testid="update-overlay"] .joe-update-card');
        await page.waitForSelector('[data-testid="update-overlay"] [data-phase="stalled"]', { timeout: 20000 }).catch(() => null);
        const text = await card.innerText().catch(() => '');
        check('البطاقة تقول «التحديث متوقّف»', /التحديث متوقّف/.test(text), text.slice(0, 200));
        check('ولا تدّعي «الخطوة 1 من 4»', !/الخطوة \d+ من/.test(text), text.slice(0, 200));
        check('وتشرح السبب بالعربية', /لم يكتب سطراً واحداً|توقّف عن الكتابة/.test(text),
            await page.locator('[data-testid="update-error"]').innerText().catch(() => 'لا رسالة'));
        check('وشريط التقدّم اختفى — لا تقدّم يُعرض', await page.locator('.joe-update-bar').count() === 0);
        check('ويظهر الأمر اليدوي الذي ينجح دائماً', await page.locator('[data-testid="update-rescue"] code').count() === 1);
        check('وزر إعادة المحاولة موجود', await page.locator('[data-testid="update-retry"]').count() === 1);
        check('وصندوق السجل ما زال قابلاً للنسخ', await page.locator('[data-testid="copy-log"]').count() === 1);
        // …and the log the user would copy carries the diagnosis, not one line.
        const shown = await page.locator('.joe-console-body').innerText().catch(() => '');
        check('والسجل المعروض يحمل التشخيص لا سطراً واحداً', shown.includes('[!]') && shown.split('\n').length > 2,
            shown.slice(0, 200));

        console.log('\n[6] ومحدِّث سليم ما زال يُعرض كجارٍ — الحكم ليس شاملاً');
        await page.locator('[data-testid="update-retry"]').click();   // clears to idle first
        await page.waitForTimeout(300);
        await close(srv);
        ({ srv, port } = await boot({ JOE_UPDATE_SCRIPT: writeTalkingUpdater() }));
        const talk = await post(`http://127.0.0.1:${port}/api/system/update`);
        check('التشغيل نجح', talk.status === 200);
        await new Promise(r => setTimeout(r, 9000));
        const good = await get(`http://127.0.0.1:${port}/api/system/update/status`);
        check('يُعتبر جارياً رغم تجاوز المهلة — لأنه تكلّم', good.body?.running === true && !good.body?.stalled,
            JSON.stringify({ running: good.body?.running, stalled: good.body?.stalled, lines: good.body?.lines }));
        check('ومرحلته الحقيقية مقروءة من مخرجاته', good.body?.stage === 'pulling', String(good.body?.stage));
        check('وسطره وصل عبر المخرَج القياسي وحده', String(good.body?.log || '').includes('أسحب التحديث'),
            String(good.body?.log || '').slice(-160));
    } finally {
        await browser.close();
        await close(srv);
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

function readLog(): string {
    try { return fs.readFileSync(UPDATE_LOG, 'utf-8'); } catch { return ''; }
}

main().catch(e => { console.error(e); process.exit(1); });
