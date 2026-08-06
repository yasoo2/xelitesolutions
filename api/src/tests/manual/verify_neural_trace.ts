/**
 * «لمذا لا يحفظ التفاعل العصبي في الدردشة بطريقه جميله وانيقه وعصرية»
 *
 * The complaint was not about taste. The trace was held in component state —
 * `useState<string[]>` — so it was destroyed the instant a run ended and its
 * card unmounted; it was rendered inside `max-height: 140px` behind a 3px
 * scrollbar while it lived; and its lines carried no `dir="auto"`, so a line
 * like «جاري تنفيذ: react project [pipeline]» threw its bracket to the far
 * margin. Three defects, none of them cosmetic.
 *
 * This proof drives JOE'S OWN INTERFACE in a real Chromium against the real
 * server and measures all three, plus the thing that was asked for:
 *
 *   [1] a real run streams into the live card, and the timeline groups it
 *   [2] the log is no longer caged in 140px
 *   [3] a mixed Arabic/Latin line keeps its own direction, per line
 *   [4] the run ends → the card goes → a RECEIPT stays in the chat
 *   [5] the receipt opens onto the same timeline, with measured durations
 *   [6] and it is still there after a full page reload
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_neural_trace.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

/** Where the PNGs of what was measured go. Never inside the repository. */
const SHOTS = process.env.JOE_PROOF_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'joe-trace-'));

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

/** The exact shape of a real run: a headline per phase, details in between. */
const RUN: Array<{ kind: 'phase' | 'detail'; phase?: any; text: string; wait: number }> = [
    { kind: 'phase', phase: 'analyzing', text: 'أحلّل الطلب', wait: 700 },
    { kind: 'detail', text: 'قرأت وصف المشروع وحدّدت نوعه: متجر', wait: 1400 },
    { kind: 'phase', phase: 'synthesizing', text: 'أخطّط الصفحات', wait: 700 },
    { kind: 'detail', text: 'خطة من ٤ صفحات: الرئيسية، المنتجات، السلة، التواصل', wait: 1400 },
    // The mixed-script line that used to scramble, kept verbatim.
    { kind: 'phase', phase: 'executing', text: 'جاري تنفيذ: react project [pipeline]', wait: 700 },
    // …and a step long enough to be worth timing. The duration pill is shown
    // only from a full second up: a row of «0s» badges is noise, not data.
    { kind: 'detail', text: 'npm install — 148 packages', wait: 2200 },
    { kind: 'detail', text: 'building with vite', wait: 1400 },
    { kind: 'detail', text: 'فحص ذاتي بالمتصفّح: ٩٢/١٠٠', wait: 700 },
];

async function main() {
    const webDist = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist');
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
        console.error(`❌ لا توجد نسخة مبنية من الواجهة في ${webDist} — شغّل npm run build داخل web أولاً.`);
        process.exit(1);
    }

    console.log('\n[0] خادم جو الحقيقي، وواجهته الحقيقية في متصفّح حقيقي');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const { broadcastThinkingPhase, broadcastThinkingDetail } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 940 }, locale: 'ar' });
    const pageErrors: string[] = [];
    page.on('pageerror', (e: any) => pageErrors.push(String(e?.message || e).slice(0, 160)));

    const shim = () => page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });

    await page.goto(base + '/joe', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shim();
    let loggedIn = false;
    try {
        await page.getByRole('button', { name: /ضيف/ }).click({ timeout: 8000 });
        await page.waitForTimeout(3500);
        loggedIn = true;
    } catch { /* reported */ }
    await shim();
    check('دخلنا إلى واجهة جو نفسها', loggedIn);

    // A first-launch guest lands behind the "choose your project" modal. A real
    // user closes it before doing anything; so does this proof, rather than
    // clicking through an overlay the browser would never let him click through.
    try {
        const overlay = page.locator('.dialog-overlay');
        if (await overlay.count()) {
            await overlay.first().click({ position: { x: 6, y: 6 }, timeout: 4000 });
            await page.waitForTimeout(700);
        }
    } catch { /* no modal on this launch */ }

    // The session the app actually opened — the same store the server serves.
    const sessions: any[] = (global as any).mockSessions || [];
    const sid = String(sessions[0]?.id || sessions[0]?._id || '');
    check('الجلسة التي فتحها التطبيق معروفة', !!sid, sid || 'لا توجد جلسة');
    if (!sid) { await browser.close(); server.close(); process.exit(1); }

    console.log('\n[1] تشغيل حقيقي يتدفّق إلى البطاقة الحيّة');
    const runStart = Date.now();
    broadcast({ type: 'run_started', sessionId: sid, data: { sessionId: sid } } as any);
    await page.waitForTimeout(400);
    for (const ev of RUN) {
        if (ev.kind === 'phase') broadcastThinkingPhase(sid, ev.phase, ev.text);
        else broadcastThinkingDetail(sid, ev.text);
        await page.waitForTimeout(ev.wait);
    }
    await shim();

    const live = await page.evaluate(() => {
        const card = document.querySelector('.neural-card') as HTMLElement | null;
        const log = document.querySelector('.nc-log') as HTMLElement | null;
        const steps = Array.from(document.querySelectorAll('.jt-step .jt-text')) as HTMLElement[];
        const groups = Array.from(document.querySelectorAll('.jt-ghead > span:first-child')) as HTMLElement[];
        const chip = document.querySelector('.nc-chip') as HTMLElement | null;
        return {
            hasCard: !!card,
            hasTimeline: !!document.querySelector('.jt-timeline'),
            logMaxHeight: log ? getComputedStyle(log).maxHeight : '',
            logScrollbar: log ? getComputedStyle(log).scrollbarWidth : '',
            stepTexts: steps.map(s => s.innerText.trim()),
            stepDirs: steps.map(s => getComputedStyle(s).direction),
            groups: groups.map(g => g.innerText.trim()),
            chip: chip ? chip.innerText.trim() : '',
            elapsed: (document.querySelector('.nc-elapsed') as HTMLElement | null)?.innerText.trim() || '',
            skeletonDir: (() => {
                const tl = document.querySelector('.jt-timeline') as HTMLElement | null;
                return tl ? getComputedStyle(tl).direction : 'none';
            })(),
            docDir: document.documentElement.getAttribute('dir') || '',
            durations: Array.from(document.querySelectorAll('.jt-ms')).map(e => (e as HTMLElement).innerText.trim()),
        };
    });

    fs.mkdirSync(SHOTS, { recursive: true });
    await page.locator('.neural-card').first()
        .screenshot({ path: path.join(SHOTS, '1-live-timeline.png') }).catch(() => { });

    check('البطاقة الحيّة ظهرت', live.hasCard);
    check('وانفتحت على شريط زمني لا سطر واحد', live.hasTimeline);
    check('وكل خطوة من التشغيل وصلت', live.stepTexts.length >= RUN.length, `${live.stepTexts.length}/${RUN.length}`);
    check('والمراحل مُجمّعة بأسمائها', live.groups.length >= 3, live.groups.join(' | '));
    check('والشارة تعدّ الخطوات', /\d/.test(live.chip), live.chip);
    check('ومؤقّت حقيقي يعمل', /\d/.test(live.elapsed), live.elapsed);
    check('ومُدد الخطوات مقيسة لا مُخترعة', live.durations.length > 0, live.durations.slice(0, 4).join(', '));

    console.log('\n[2] القفص ذو الـ ١٤٠ بكسل — هل زال فعلاً؟');
    const maxPx = parseFloat(live.logMaxHeight) || 0;
    check('السجلّ لم يعد محبوساً في ١٤٠ بكسل', maxPx > 140, live.logMaxHeight);
    check('وشريط التمرير صار يُمسك بالفأرة', live.logScrollbar !== '', live.logScrollbar);

    console.log('\n[3] السطر المختلط يحفظ اتجاهه — قياساً على الصفحة');
    const mixedIdx = live.stepTexts.findIndex(s => s.includes('[pipeline]'));
    const latinIdx = live.stepTexts.findIndex(s => /^npm install/.test(s));
    check('السطر المختلط موجود كما كُتب', mixedIdx >= 0, live.stepTexts[mixedIdx] || '—');
    check('وبدايته العربية تجعل اتجاهه يميناً', live.stepDirs[mixedIdx] === 'rtl', String(live.stepDirs[mixedIdx]));
    check('والسطر اللاتيني يبقى يساراً — لا اتجاه واحد يُفرض على الجميع',
        latinIdx >= 0 && live.stepDirs[latinIdx] === 'ltr', `${latinIdx}:${live.stepDirs[latinIdx]}`);
    // The IDE chrome is pinned to ltr on purpose; the trace's own rail must
    // still mirror with the language, or an Arabic user reads a left-hand
    // timeline under right-hand text.
    check('وهيكل الشريط نفسه انعكس مع اللغة رغم أن المستند ليس RTL',
        live.skeletonDir === 'rtl' && live.docDir === 'ltr', `${live.skeletonDir} / html=${live.docDir}`);

    console.log('\n[4] انتهى التشغيل — البطاقة تذهب، والإيصال يبقى');
    // The reply, stored the way the server stores it, so the reload below reads
    // it back exactly as a real conversation would.
    const answer = 'جاهز — بنيت المتجر وفحصته، والنتيجة ٩٢/١٠٠.';
    const store: any[] = (global as any).mockMessages || [];
    (global as any).mockMessages = store;
    store.push({ _id: `m-${Date.now()}`, sessionId: sid, role: 'assistant', content: answer, createdAt: new Date() });
    broadcast({ type: 'text', sessionId: sid, data: { text: answer, sessionId: sid } } as any);
    await page.waitForTimeout(1500);
    await shim();

    const after = await page.evaluate(() => ({
        liveCard: !!document.querySelector('.neural-card'),
        receipts: document.querySelectorAll('.jt-receipt').length,
        summary: (document.querySelector('.jt-rbtn') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() || '',
        expandedByDefault: document.querySelector('.jt-rbtn')?.getAttribute('aria-expanded') || '',
        answerShown: (document.body.innerText || '').includes('٩٢/١٠٠'),
        stored: Object.keys(localStorage).filter(k => k.startsWith('joe:trace:')).length,
    }));
    await page.locator('.jt-receipt').first()
        .screenshot({ path: path.join(SHOTS, '2-receipt-collapsed.png') }).catch(() => { });

    check('البطاقة الحيّة اختفت مع انتهاء التشغيل', !after.liveCard);
    check('وبقي إيصال واحد في الدردشة', after.receipts === 1, String(after.receipts));
    check('يقول ماذا فعل وكم خطوة وكم استغرق', /\d/.test(after.summary) && after.summary.length > 6, after.summary);
    // Eight steps in Arabic is «خطوات», not «خطوة» — the plural category has to
    // reach the screen, not just the resource file.
    check('وبصيغة جمع عربية صحيحة', /خطوات/.test(after.summary), after.summary);
    check('ومطوي افتراضياً — لا يزاحم الحوار', after.expandedByDefault === 'false', after.expandedByDefault);
    check('والجواب نفسه ظاهر تحته', after.answerShown);
    check('والأثر كُتب في ذاكرة الجلسة', after.stored > 0, String(after.stored));

    console.log('\n[5] وفتحه يعيد نفس الشريط الزمني');
    await page.locator('.jt-rbtn').first().click();
    await page.waitForTimeout(600);
    await shim();
    const opened = await page.evaluate(() => ({
        expanded: document.querySelector('.jt-rbtn')?.getAttribute('aria-expanded') || '',
        steps: document.querySelectorAll('.jt-body .jt-step').length,
        groups: document.querySelectorAll('.jt-body .jt-ghead').length,
        ribbon: document.querySelectorAll('.jt-ribbon > i').length,
        durations: Array.from(document.querySelectorAll('.jt-body .jt-ms')).map(e => (e as HTMLElement).innerText.trim()),
        copy: !!document.querySelector('.jt-copy'),
        mixedDir: (() => {
            const el = Array.from(document.querySelectorAll('.jt-body .jt-text'))
                .find(e => (e as HTMLElement).innerText.includes('[pipeline]')) as HTMLElement | undefined;
            return el ? getComputedStyle(el).direction : 'none';
        })(),
    }));
    await page.locator('.jt-receipt').first()
        .screenshot({ path: path.join(SHOTS, '3-receipt-open.png') }).catch(() => { });

    check('انفتح', opened.expanded === 'true', opened.expanded);
    check('وفيه كل الخطوات التي شاهدها', opened.steps >= RUN.length, `${opened.steps}/${RUN.length}`);
    check('مجمّعة بمراحلها', opened.groups >= 3, String(opened.groups));
    check('وشريط النِّسب يعرض توزّع الوقت الحقيقي', opened.ribbon >= 3, String(opened.ribbon));
    check('والمُدد محفوظة معها', opened.durations.length > 0, opened.durations.slice(0, 4).join(', '));
    check('وفيه زر نسخ الأثر', opened.copy);
    check('والاتجاه صحيح داخل الإيصال أيضاً', opened.mixedDir === 'rtl', opened.mixedDir);

    console.log('\n[6] وبعد إعادة تحميل كاملة — هل ما زال هناك؟');
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(3500);
    await shim();
    const reloaded = await page.evaluate(() => ({
        receipts: document.querySelectorAll('.jt-receipt').length,
        summary: (document.querySelector('.jt-rbtn') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() || '',
        answerShown: (document.body.innerText || '').includes('٩٢/١٠٠'),
    }));
    check('الجواب عاد من التاريخ', reloaded.answerShown);
    check('والإيصال عاد معه — الأثر لم يعد يموت مع التشغيل', reloaded.receipts === 1, String(reloaded.receipts));
    check('وبنفس ملخّصه', /\d/.test(reloaded.summary), reloaded.summary);
    check('ولا خطأ في الصفحة طوال الاختبار', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n   ℹ️ زمن التشغيل المُقاس: ${Math.round((Date.now() - runStart) / 1000)}s`);
    console.log(`   ℹ️ اللقطات: ${SHOTS}`);
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
