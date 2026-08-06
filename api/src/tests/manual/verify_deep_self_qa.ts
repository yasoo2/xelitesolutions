/**
 * «المتصفح يقوم بعده تجارب بسيطة فقط ولا يوجد موشر وتحديد بالاحمر وتجريب جميع
 *  القوائم وتعبئه النماذج وتجريب كل شيء وفحص ui … هل يستخدمها كلها.. لا اريد فقط
 *  حركات بسيطة»
 *
 * Every clause of that sentence was true, and each had an exact cause:
 *
 *   · «عده تجارب بسيطة فقط» — MAX_CONTROLS was 14, hard-coded;
 *   · «لا يوجد موشر وتحديد بالاحمر» — `cursor_move` and `highlight_boxes` are
 *     rendered by the panel and were emitted by ONE file in the whole system,
 *     the agent's executor. The audit sent neither, ever;
 *   · «تجريب جميع القوائم» — a burger, a dropdown trigger, a hash route: none
 *     of them were in the catalogue the probe pressed;
 *   · «تعبئه النماذج» — forms were COUNTED. Not one character was ever typed;
 *   · «وفحص ui» — one viewport, no contrast, no accessibility, ever.
 *
 * This proof runs the real audit against a page built to contain one of each
 * defect, with a real WebSocket client attached to the panel stream, and reads
 * what the panel actually RECEIVED:
 *
 *   [1] the pointer really travels and the element under test is really outlined
 *   [2] menus, routes and thirty-plus controls are really pressed
 *   [3] the forms are really filled in, field by field, and really submitted
 *   [4] the UI is really inspected — contrast, a11y, and two more viewports
 *   [5] and the overlay never faked a measurement: the dead button stays dead
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_deep_self_qa.ts
 */
export {};
import fs from 'fs';
import http from 'http';
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

/**
 * A page carrying exactly one of every defect the deep audit is supposed to
 * find, plus working controls it must NOT slander. Nothing here is subtle —
 * the point is that the OLD audit found none of it.
 */
function siteWithOneOfEverything(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>مشتل النخيل</title>
<style>
 body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111}
 header{display:flex;gap:12px;align-items:center;padding:16px 20px;background:#0f172a;color:#fff}
 nav{display:none;gap:14px}
 nav.open{display:flex}
 nav a{color:#fff;min-height:44px;display:flex;align-items:center;padding:0 8px}
 button{min-height:44px;min-width:44px;border:0;border-radius:10px;padding:10px 16px;background:#16a34a;color:#fff;font-size:15px}
 .menu-toggle{background:#334155}
 main{padding:20px;max-width:900px;margin:auto}
 .faint{color:#c9c9c9;background:#fff}                 /* ~1.7:1 — fails AA */
 .tiny{min-width:18px;min-height:18px;padding:1px 3px;font-size:10px}
 .too-wide{width:900px;height:60px;background:#e2e8f0;border-radius:8px}
 form{display:grid;gap:10px;margin:24px 0;padding:16px;border:1px solid #cbd5e1;border-radius:12px}
 input,textarea,select{padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:15px}
 .ok{color:#166534;font-weight:700}
</style></head>
<body>
<header>
  <button class="menu-toggle" aria-expanded="false" aria-haspopup="true">القائمة</button>
  <nav id="nav"><a href="#/plants">النباتات</a><a href="#/suppliers">الموردون</a><a href="#/orders">الطلبيات</a></nav>
  <span id="cart">السلة: 0</span>
</header>
<main>
  <h1>مشتل النخيل</h1>
  <p class="faint">نصّ بتباين ضعيف جداً لا يجتاز معيار الوصولية.</p>
  <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iODAiIGZpbGw9IiMxNmEzNGEiLz48L3N2Zz4=" width="120" height="80">
  <div class="too-wide"></div>
  <p>
    <button id="live">أضف إلى السلة</button>
    <button id="dead">زر بلا وظيفة</button>
    <button class="tiny">؟</button>
  </p>
  <details><summary>الأسئلة الشائعة</summary><p>نعم، نوصّل.</p></details>

  <form id="contact">
    <h3>تواصل معنا</h3>
    <input name="name" placeholder="الاسم" required>
    <input name="email" type="email" placeholder="البريد" required>
    <select name="topic"><option value="">اختر</option><option value="sale">شراء</option></select>
    <textarea name="msg" placeholder="رسالتك" required></textarea>
    <label><input type="checkbox" name="agree"> أوافق</label>
    <button type="submit">أرسل</button>
    <div id="sent"></div>
  </form>

  <form id="newsletter" onsubmit="return false">
    <h3>النشرة البريدية</h3>
    <input name="mail" type="email" placeholder="بريدك">
    <button type="submit">اشترك</button>
  </form>
</main>
<script>
  document.querySelector('.menu-toggle').addEventListener('click', function () {
    var n = document.getElementById('nav');
    var open = n.classList.toggle('open');
    this.setAttribute('aria-expanded', String(open));
  });
  var n = 0;
  document.getElementById('live').addEventListener('click', function () {
    n++; document.getElementById('cart').textContent = 'السلة: ' + n;
  });
  document.getElementById('contact').addEventListener('submit', function (e) {
    e.preventDefault();
    document.getElementById('sent').innerHTML = '<span class="ok">تم استلام رسالتك ✓</span>';
  });
</script>
</body></html>`, 'utf-8');
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-deepqa-'));
    const dist = path.join(work, 'dist');
    siteWithOneOfEverything(dist);

    console.log('\n[0] خادم جو الحقيقي، ولوحة متصفّح حقيقية متّصلة بالـ WebSocket');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    const SID = `deep-qa-${Date.now()}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebSocket = require('ws');
    const events: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/browser?sessionId=${SID}`);
    ws.on('message', (raw: any) => { try { events.push(JSON.parse(String(raw))); } catch { /* not ours */ } });
    const opened = await new Promise<boolean>(r => {
        ws.on('open', () => r(true));
        ws.on('error', () => r(false));
        setTimeout(() => r(false), 6000);
    });
    const { panelWatcherCount } = await import('../../modules/browser/wsHub');
    check('اللوحة متّصلة بمجرى المتصفّح', opened && panelWatcherCount(SID) > 0, `watchers=${panelWatcherCount(SID)}`);

    console.log('\n[1] والفحص العميق يجري الآن — في اللوحة نفسها');
    const t0 = Date.now();
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const progress: string[] = [];
    const audit = await auditBuiltApp(dist, {
        timeoutMs: 30_000, watchSessionId: SID, onProgress: (m) => progress.push(m),
    });
    const took = Date.now() - t0;
    check('الفحص جرى فعلاً — لا تخطٍّ', !audit.skipped, String(audit.skipped));
    check('وفي لوحته هو، لا في متصفّح خاصّ', progress.includes('watching'),
        progress.join(' → ') || 'لا مراحل');
    console.log(`   ℹ️ ${audit.score}/100 خلال ${Math.round(took / 1000)}s — ${(audit.findings || []).map(f => f.id).join(', ') || 'نظيف'}`);
    console.log(`   ℹ️ المراحل: ${progress.join(' → ')}`);

    const byType = (t: string) => events.filter(e => e?.type === t);
    const cursors = byType('cursor_move');
    const boxes = byType('highlight_boxes');
    const feedback = byType('action_feedback');
    console.log(`   ℹ️ وصل إلى اللوحة: ${cursors.length} حركة مؤشّر · ${boxes.length} تحديد أحمر · ${feedback.length} نقرة · ${byType('stream_frame').length} إطار`);

    console.log('\n[2] المؤشّر يتحرّك فعلاً — والعنصر المفحوص محدَّد بالأحمر');
    check('حركات مؤشّر وصلت إلى اللوحة', cursors.length >= 40, `${cursors.length}`);
    check('والمؤشّر يقطع مسافة حقيقية لا نقطة واحدة',
        new Set(cursors.map((c: any) => `${c.x},${c.y}`)).size >= 20,
        `${new Set(cursors.map((c: any) => `${c.x},${c.y}`)).size} نقطة مختلفة`);
    check('وتحديدات حمراء وصلت معها', boxes.length >= 15, `${boxes.length}`);
    check('والتحديد له أبعاد حقيقية من الصفحة',
        boxes.some((b: any) => (b.boxes || []).some((x: any) => x.width > 10 && x.height > 10)),
        JSON.stringify(boxes[0]?.boxes?.[0] || {}).slice(0, 90));
    check('وكل نقرة أُعلنت للوحة', feedback.length >= 10, `${feedback.length}`);

    console.log('\n[3] كل القوائم والمسارات جُرِّبت — لا أربعة عشر عنصراً');
    console.log(`   ℹ️ ضُغط ${audit.pressed} عنصراً على ${(audit.routes || []).length} صفحة`);
    check('أكثر من ضعف الحدّ القديم (14)', (audit.pressed || 0) > 14, `${audit.pressed}`);
    check('والقائمة المطويّة فُتحت — وإلّا لما ظهرت روابطها',
        (audit.routes || []).some(r => /#\/(plants|suppliers|orders)/.test(r)),
        (audit.routes || []).join(' · '));
    check('ومسارات التطبيق زِيرت كلّها', (audit.routes || []).length >= 4, (audit.routes || []).join(' · '));

    console.log('\n[4] والنماذج عُبِّئت حقاً وأُرسلت حقاً');
    console.log(`   ℹ️ ${audit.formsFilled} نموذج · ${audit.fieldsFilled} حقل · ${(audit.forms || []).map(f => `${f.label}:${f.effect || 'لا شيء'}`).join(' · ')}`);
    check('نموذجان على الأقل عُبِّئا', (audit.formsFilled || 0) >= 2, `${audit.formsFilled}`);
    check('وحقول حقيقية كُتب فيها', (audit.fieldsFilled || 0) >= 6, `${audit.fieldsFilled}`);
    check('نموذج التواصل أُرسل ونجح',
        (audit.forms || []).some(f => /أرسل|contact/i.test(f.label) && f.effect === 'submitted'),
        (audit.forms || []).map(f => `${f.label}=${f.effect}`).join(' · '));
    check('والنموذج الميّت انكشف — عُبِّئ وأُرسل ولم يحدث شيء',
        (audit.findings || []).some(f => f.id === 'form_dead_submit'),
        (audit.findings || []).map(f => f.id).join(', '));

    console.log('\n[5] وفُحصت الواجهة نفسها — تباين، وصولية، ومقاسات شاشة');
    console.log(`   ℹ️ المقاسات: ${(audit.viewports || []).join(' · ')}`);
    check('مرّ الفحص على مرحلة فحص الواجهة', progress.includes('inspecting'), progress.join(' → '));
    check('ثلاثة مقاسات شاشة على الأقل', (audit.viewports || []).length >= 3, (audit.viewports || []).join(' · '));
    const ids = (audit.findings || []).map(f => f.id);
    check('التباين الضعيف انكشف', ids.includes('low_contrast'), ids.join(', '));
    check('والصورة بلا نص بديل', ids.includes('a11y_images_without_alt'), ids.join(', '));
    check('والتمرير الأفقي على الجوّال', ids.includes('mobile_overflow'), ids.join(', '));
    check('وهدف اللمس الصغير', ids.includes('mobile_tap_targets'), ids.join(', '));

    console.log('\n[6] ولم يزوّر التحديدُ القياسَ — الزرّ الميت بقي ميتاً والحيّ حيّاً');
    const dead = (audit.dead || []).join(' · ');
    for (const c of audit.controls || []) console.log(`   ${c.worked ? '✔' : '✗'} [${c.kind}] «${c.label}» → ${c.effect || '(لا شيء)'}`);
    // The HOME page is the honest comparison: later routes carry the state the
    // earlier ones left behind, which is real behaviour, not a defect.
    const home = (audit.controls || []).filter(c => !c.label.startsWith('#/'));
    check('«زر بلا وظيفة» مُبلَّغ عنه', home.some(c => /بلا وظيفة/.test(c.label) && !c.worked), dead);
    check('و«أضف إلى السلة» لم يُتَّهم ظلماً',
        home.some(c => /أضف إلى السلة/.test(c.label) && c.worked && c.effect === 'count'), dead);
    check('والقائمة انفتحت فعلاً', home.some(c => c.kind === 'menu' && c.worked), dead);

    /**
     * [7] AND THE MEASUREMENT DOES NOT DRIFT WHILE HE WATCHES.
     *
     * Found by this very proof: Playwright hides the text caret by writing
     * `caret-color: transparent !important` into every input before a
     * screenshot and stripping it after. At stream FPS that is a DOM mutation
     * six times a second, and «did this click change anything?» became part
     * coin-flip on any page with a form. Pinned here on an IDLE page: nothing
     * is clicked, so nothing may be reported as changed.
     */
    console.log('\n[7] وبثّ اللوحة لا يعبث بالصفحة التي يصوّرها');
    const { getBrowserSession, sessionViewport } = await import('../../modules/browser/manager');
    const s: any = await getBrowserSession(SID);
    const fingerprint = () => s.page.evaluate(() => {
        const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
        return hash((document.body.innerHTML || '').replace(/caret-color:\s*transparent\s*!important;?\s*/gi, '').replace(/\sstyle="\s*"/gi, ''));
    });
    // The AUDITED page — the audit's own static server is closed by now, so the
    // proof serves it again. (Pointing this at Joe's interface instead measured
    // a live React app and «found» drift that was simply the clock ticking.)
    const still = http.createServer((_q, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(dist, 'index.html')));
    });
    await new Promise<void>(r => still.listen(0, '127.0.0.1', () => r()));
    await s.page.goto(`http://127.0.0.1:${(still.address() as any).port}/`, { waitUntil: 'load' }).catch(() => { });
    let prev = await fingerprint();
    let drift = 0;
    for (let i = 0; i < 20; i++) {
        await s.page.waitForTimeout(200);
        const now = await fingerprint();
        if (now !== prev) drift++;
        prev = now;
    }
    check('صفحة ساكنة تبقى ساكنة في القياس', drift === 0, `${drift}/20 عيّنة تغيّرت بلا نقرة`);
    still.close();

    // …and the page is handed back exactly as it was built.
    const leftovers = await s.page.evaluate(
        'JSON.parse(JSON.stringify({ eye: !!document.getElementById("joe-audit-eye"), audit: document.querySelectorAll("[data-joe-audit]").length }))',
    ).catch(() => ({ eye: true, audit: -1 }));
    check('ولا أثر للطبقة على الصفحة بعد الفحص', leftovers.eye === false && leftovers.audit === 0, JSON.stringify(leftovers));

    const vp = sessionViewport(SID);
    check('والمقاس عاد كما كان بعد فحص الجوّال', !!vp && vp.w >= 1000, JSON.stringify(vp));

    try { ws.close(); } catch { /* closing */ }
    try { const { stopSession } = await import('../../modules/browser/manager'); await stopSession(SID); } catch { /* best effort */ }
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
