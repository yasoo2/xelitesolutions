/**
 * «عاده ما يتوقف المتصفح اثبت انه انت بشري وليس روبوت».
 *
 * A screenshot of google.com/sorry/index with the agent stopped in front of
 * it. Joe does not defeat that checkbox — it is an access control, and every
 * bypass is a bet against the company whose whole job is winning that bet.
 * What it does instead is the thing that actually ends the problem:
 *
 *   [1] STOP PROVOKING IT. The agent was driving google.com/search — a page
 *       written for a person — in six places. That is what /sorry/ answers.
 *   [2] DETECT the wall when one appears anyway, on any site.
 *   [3] HAND IT TO THE HUMAN and keep watching — the panel already grants him
 *       control; what was missing is that Joe never noticed, never asked, and
 *       never resumed.
 *   [4] RESUME the same task the moment he clears it.
 *   [5] …and when nobody clears it, stop honestly instead of claiming success.
 *
 * Every step below is measured against a real Chromium on real pages.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_human_check.ts
 */
export {};
import http from 'http';
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

/**
 * A stand-in for the real wall: it serves Google's own /sorry/ shape until a
 * «human» clicks the checkbox, then lets the page through — exactly the shape
 * of the thing in his screenshot, without touching Google.
 */
function wallServer() {
    let cleared = false;
    const srv = http.createServer((rq, rs) => {
        const url = String(rq.url || '/');
        if (url.startsWith('/i-am-human')) {
            cleared = true;
            rs.writeHead(302, { Location: '/target' });
            return rs.end();
        }
        if (url.startsWith('/target') && cleared) {
            rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return rs.end('<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>الصفحة المطلوبة</title></head>'
                + '<body><h1 id="real">المحتوى الحقيقي وصل</h1><p>هذا ما كان خلف الجدار.</p></body></html>');
        }
        // Anything else — including /target before the click — is the wall.
        rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rs.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sorry…</title></head>'
            + '<body><p>Our systems have detected unusual traffic from your computer network.</p>'
            + '<a href="/i-am-human">I am not a robot</a></body></html>');
    });
    return { srv, isCleared: () => cleared };
}

async function main() {
    const { detectChallenge, waitForHumanToClear, agentSearchUrl } = await import('../../modules/browser/challenge');
    const { getBrowserSession, stopSession } = await import('../../modules/browser/manager');
    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');

    console.log('\n[1] البحث الآلي لم يعد يستفزّ الجدار أصلاً');
    const u = agentSearchUrl('دولة فلسطين');
    check('عنوان بحث الوكيل ليس صفحة جوجل البشرية', !/google\.com\/search/.test(u), u);
    check('وهو عنوان بحث حقيقي صالح', /^https:\/\/\S+\?q=|&q=/.test(u), u);
    process.env.JOE_SEARCH_URL = 'https://example.org/find?q={q}';
    check('ويمكن للمشغّل توجيهه إلى محرّكه الخاص',
        agentSearchUrl('اختبار') === 'https://example.org/find?q=' + encodeURIComponent('اختبار'),
        agentSearchUrl('اختبار'));
    delete process.env.JOE_SEARCH_URL;

    // …and no code path still points the agent at Google's search page.
    const roots = ['src/modules/browser/runner.ts', 'src/modules/tools/definitions/BrowserRunTool.ts',
        'src/orchestration/agents/BrowserAgent.ts', 'src/modules/services/ToolService.ts'];
    const offenders = roots.filter(f => /google\.com\/search\?q=\$\{encodeURIComponent/.test(
        fs.readFileSync(path.join(__dirname, '..', '..', '..', f), 'utf-8')));
    check('ولا مسار واحد ما زال يكشط صفحة بحث جوجل', offenders.length === 0, offenders.join(', '));

    console.log('\n[2] وحين يظهر جدار رغم ذلك — يُكتشف، لا يُتجاهل');
    const { srv, isCleared } = wallServer();
    srv.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;

    const session: any = await getBrowserSession(PANEL_BROWSER_SID);
    const page = session.page;
    await page.goto(`${base}/target`, { waitUntil: 'load' });

    const wall = await detectChallenge(page);
    check('الجدار اكتُشف', !!wall, 'لم يُكتشف شيء');
    check('وسُمّي بنوعه الصحيح', wall?.kind === 'unusual_traffic', String(wall?.kind));
    check('ورسالته بالعربية للمستخدم', /إنسان|آلية/.test(String(wall?.message || '')), String(wall?.message));

    console.log('\n[3] ويُسلَّم للإنسان — والانتظار يتابع الصفحة');
    const notes: string[] = [];
    // The «human» clears it while Joe waits — a real click on the real page.
    setTimeout(() => { page.click('a[href="/i-am-human"]').catch(() => { /* raced */ }); }, 2500);
    const handoff = await waitForHumanToClear(page, wall!, {
        sessionId: PANEL_BROWSER_SID, timeoutMs: 25_000, onNote: (m) => notes.push(m),
    });

    check('طلب التدخّل بلغة يفهمها', notes.some(m => /تحكّم بالمتصفح/.test(m)), notes[0] || 'لا رسالة');
    check('والإنسان تجاوز الجدار فعلاً', isCleared() === true);
    check('وجو رصد التجاوز واستأنف', handoff.cleared === true, JSON.stringify(handoff));
    check('وأعلن الاستئناف', notes.some(m => /أتابع المهمة الآن/.test(m)), notes.slice(-1)[0] || '');
    check('ولم ينتظر أكثر مما يلزم', handoff.waitedMs < 20_000, `${handoff.waitedMs}ms`);

    console.log('\n[4] والمحتوى الذي كان خلف الجدار صار في متناوله');
    check('الصفحة الحقيقية مفتوحة الآن', await page.locator('#real').count() === 1, page.url());
    check('ولا جدار بعدها', (await detectChallenge(page)) === null);

    console.log('\n[5] وإن لم يتجاوزه أحد — يتوقّف بصدق، لا يدّعي');
    await page.goto(`${base}/blocked-again`, { waitUntil: 'load' });
    // (this path always serves the wall; nobody will clear it)
    const stubborn = await detectChallenge(page);
    check('الجدار الثاني اكتُشف', !!stubborn);
    const notes2: string[] = [];
    const gaveUp = await waitForHumanToClear(page, stubborn!, {
        sessionId: PANEL_BROWSER_SID, timeoutMs: 4_000, onNote: (m) => notes2.push(m),
    });
    check('انتهت المهلة دون ادّعاء نجاح', gaveUp.cleared === false, JSON.stringify(gaveUp));
    check('وقيلت الحقيقة صراحةً', notes2.some(m => /انتهت مهلة الانتظار/.test(m)), notes2.slice(-1)[0] || '');

    console.log('\n[6] وصفحة عادية فيها ودجت reCAPTCHA ليست جداراً');
    // A widget inside a long form must NOT stop the agent — a rescue that
    // fires on every contact page is a nuisance, not a rescue.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-recap-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="ar"><body>'
        + '<h1>نموذج تواصل</h1>' + '<p>' + 'نصّ طويل حقيقي في الصفحة. '.repeat(120) + '</p>'
        + '<form><input name="a"><div class="g-recaptcha"></div><button>إرسال</button></form></body></html>');
    const fileSrv = http.createServer((_rq, rs) => {
        rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rs.end(fs.readFileSync(path.join(dir, 'index.html')));
    });
    fileSrv.listen(0, '127.0.0.1');
    await new Promise<void>(r => fileSrv.once('listening', () => r()));
    await page.goto(`http://127.0.0.1:${(fileSrv.address() as any).port}/`, { waitUntil: 'load' });
    check('لم يُعتبر جداراً — الوكيل يكمل عمله', (await detectChallenge(page)) === null);

    (srv as any).closeAllConnections?.(); srv.close();
    (fileSrv as any).closeAllConnections?.(); fileSrv.close();
    try { await stopSession(PANEL_BROWSER_SID); } catch { /* best effort */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
