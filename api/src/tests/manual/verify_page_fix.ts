/**
 * «جميعها» — the five that were left, proved on real pages and real files.
 *
 *   [2] CONTRAST, in the tokens the design is built from: a palette below
 *       4.5:1 is raised against ITS OWN background, dark theme included, and
 *       the brand colour is left alone because it is an identity.
 *   [3] PERFORMANCE: images below the fold stop competing with the hero, and
 *       the hero itself is deliberately left eager.
 *   [4] RESPONSIVE: the page stops being wider than the phone it opens on.
 *   [5] A PAGE HE DOES NOT OWN: measured in a real Chromium, patched live so
 *       the difference is SEEN, measured again, and handed over as a .css file
 *       — with the plain admission that a remote server cannot be edited.
 *
 * Nothing here is asserted from code reading alone: a real HTTP server serves
 * a genuinely broken page, a real browser renders it, and the numbers before
 * and after come out of that browser.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_page_fix.ts
 */
export {};
import http from 'http';
import fs from 'fs';
import path from 'path';

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

/** An SVG with real intrinsic dimensions — naturalWidth/Height are knowable. */
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">'
    + '<rect width="600" height="400" fill="#3355aa"/></svg>';

/** Ordinary defects, the kind every second site on the web actually has. */
const BROKEN = `<!doctype html>
<html lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>صفحة ليست ملكي</title>
<style>
  body { margin: 0; font-family: sans-serif; background: #ffffff; }
  /* أوسع من أي هاتف — مصدر التمرير الأفقي */
  .wide { width: 980px; background: #eef; padding: 12px; }
  /* أهداف لمس أصغر من الحدّ */
  a.tiny { display: inline-block; width: 22px; height: 22px; background: #ddd; margin: 2px; }
  /* نصّ رماديّ على أبيض — نحو 2.3:1 */
  p.faint { color: #aaaaaa; background: #ffffff; }
  li { color: #b2b2b2; }
</style></head>
<body>
<div class="wide">
  <p class="faint">هذه فقرة نصّها باهت جداً على خلفية بيضاء، ولا يستطيع كثير من الناس قراءتها في ضوء النهار.</p>
  <ul><li>عنصر أول باهت</li><li>عنصر ثانٍ باهت</li></ul>
  <a class="tiny" href="/a">١</a><a class="tiny" href="/b">٢</a><a class="tiny" href="/c">٣</a>
  <a class="tiny" href="/d">٤</a><a class="tiny" href="/e">٥</a><a class="tiny" href="/f">٦</a>
  <img src="/pic.svg">
  <img src="/pic.svg">
  <img src="/pic.svg">
</div>
</body></html>`;

function brokenServer(): Promise<{ url: string; close: () => void }> {
    const srv = http.createServer((rq, rs) => {
        if (String(rq.url || '').startsWith('/pic.svg')) {
            rs.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            return rs.end(PIC);
        }
        rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rs.end(BROKEN);
    });
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => {
        const port = (srv.address() as any).port;
        resolve({ url: `http://127.0.0.1:${port}/`, close: () => { try { srv.close(); } catch { /* done */ } } });
    }));
}

async function main() {
    const {
        repairContrast, repairLazyImages, repairResponsive, repairProjectFiles,
        contrastRatio, parseHex, fixForeground,
    } = await import('../../core/quality/ui-repair');

    /* ─────────────────────────── [1] CONTRAST ─────────────────────────── */
    console.log('\n[1] التباين — يُصلَح في الرموز التي بُني منها التصميم كلّه');
    const palette = [
        ':root {',
        '  --bg: #ffffff;',
        '  --surface: #ffffff;',
        '  --text: #8a8a8a;',          // 3.05:1 — passes nobody's eye
        '  --text-muted: #b0b0b0;',    // 2.34:1
        '  --brand: #f2c14e;',         // an identity, not a text colour
        '}',
        '[data-theme="dark"] {',
        '  --bg: #10131a;',
        '  --surface: #171b24;',
        '  --text: #e9edf5;',          // already fine on a dark background
        '  --text-muted: #3d4658;',    // 1.6:1 on #10131a — unreadable
        '}',
        '.card { padding: 16px; }',
        '',
    ].join('\n');
    const c = repairContrast(palette);
    const tokenOf = (css: string, name: string, from = 0) => {
        const m = css.slice(from).match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
        return m ? parseHex(m[1])! : null;
    };
    const white: [number, number, number] = [255, 255, 255];
    const lightMuted = tokenOf(c.text, 'text-muted')!;
    check('النصّ الباهت في الوضع الفاتح تجاوز 4.5:1',
        contrastRatio(lightMuted, white) >= 4.5, String(contrastRatio(lightMuted, white).toFixed(2)));
    const lightText = tokenOf(c.text, 'text')!;
    check('ونصّ المتن كذلك', contrastRatio(lightText, white) >= 4.5, String(contrastRatio(lightText, white).toFixed(2)));

    const darkAt = c.text.indexOf('[data-theme="dark"]');
    const darkBg = tokenOf(c.text, 'bg', darkAt)!;
    const darkMuted = tokenOf(c.text, 'text-muted', darkAt)!;
    check('والوضع الداكن حُكِم بخلفيته هو — لا بخلفية الوضع الفاتح',
        contrastRatio(darkMuted, darkBg) >= 4.5, String(contrastRatio(darkMuted, darkBg).toFixed(2)));
    check('ونصّه الفاتح بقي فاتحاً (لم يُقلَب إلى داكن)',
        (tokenOf(c.text, 'text', darkAt)![0]) > 200, JSON.stringify(tokenOf(c.text, 'text', darkAt)));
    check('ولون العلامة التجارية لم يُمَسّ — هو هويّة لا نصّ',
        /--brand:\s*#f2c14e/.test(c.text));
    check('وأبلغت عمّا غيّرته بالعدد',
        c.repairs.some(r => r.id === 'low_contrast' && r.count >= 3), JSON.stringify(c.repairs));
    const again = repairContrast(c.text);
    check('وتشغيلها ثانيةً لا يغيّر شيئاً — الألوان استقرّت',
        again.text === c.text && again.repairs.length === 0);

    // …and the arithmetic itself, against the standard rather than against me.
    check('حساب WCAG صحيح: الأبيض على الأسود = 21:1',
        Math.round(contrastRatio([255, 255, 255], [0, 0, 0])) === 21);
    const raised = fixForeground([170, 170, 170], white, 4.5);
    check('ورفعُ اللون يتوقّف عند أول قيمة ناجحة — لا يقفز إلى الأسود',
        contrastRatio(raised, white) >= 4.5 && raised[0] > 40, JSON.stringify(raised));

    /* ────────────────────── [2] PERFORMANCE / IMAGES ───────────────────── */
    console.log('\n[2] الأداء — الصورة الأولى تبقى فوريّة، وما تحتها يؤجَّل');
    const jsx = `export default function Page() {
  return (
    <section>
      <img src="/hero.jpg" alt="الغلاف" />
      <img src="/a.jpg" alt="أ" />
      <img src="/b.jpg" alt="ب" loading="eager" />
      <img src="/c.jpg" alt="ج" />
    </section>
  );
}`;
    const lazy = repairLazyImages(jsx);
    const heroLine = lazy.text.split('\n').find(l => l.includes('/hero.jpg')) || '';
    check('صورة الغلاف لم تُؤجَّل — تأجيلها يؤخّر أول رسم', !/loading=/.test(heroLine), heroLine.trim());
    check('وما بعدها أُجّل', /\/a\.jpg[^>]*loading="lazy"|loading="lazy"[^>]*\/a\.jpg/.test(lazy.text));
    check('وصورة كانت تحمل loading مسبقاً لم تُلمَس',
        (lazy.text.match(/loading="eager"/g) || []).length === 1 && !/loading="lazy"[^>]*loading=/.test(lazy.text));
    check('وأُحصيت الصور المؤجَّلة بالعدد الصحيح',
        lazy.repairs.some(r => r.id === 'heavy_images' && r.count === 2), JSON.stringify(lazy.repairs));
    check('والملف ما زال يُحلَّل (JSX سليم)', /decoding="async"/.test(lazy.text) && lazy.text.includes('</section>'));
    const lazy2 = repairLazyImages(lazy.text);
    check('وتكرارها لا يضيف شيئاً', lazy2.text === lazy.text && lazy2.repairs.length === 0);

    /* ──────────────────────────── [3] RESPONSIVE ───────────────────────── */
    console.log('\n[3] التجاوب — القاعدة تُضاف مرة واحدة مهما تكرّر التشغيل');
    const r1 = repairResponsive('.x { color: red; }');
    check('قواعد التجاوب أُضيفت', /overflow-x:\s*hidden/.test(r1.text) && /max-width:\s*480px/.test(r1.text));
    check('والوسائط والجداول قُيّدت بعرض حاويتها',
        /img, video, canvas, svg, iframe \{ max-width: 100%/.test(r1.text) && /table, pre, code \{ max-width: 100%/.test(r1.text));
    const r2 = repairResponsive(r1.text);
    check('ولم تتكرّر في التشغيل الثاني', r2.text === r1.text && r2.repairs.length === 0);

    console.log('\n[4] والثلاثة موصولة فعلاً بمسار إصلاح المشروع — لا معلّقة في الفراغ');
    const plan = repairProjectFiles({
        'src/styles/app.css': ':root { --bg: #ffffff; --text-muted: #bbbbbb; }',
        'src/App.jsx': jsx,
    });
    const cssOut = plan.files['src/styles/app.css'] || '';
    check('CSS المشروع نال التباين', /--text-muted:\s*#(?!bbbbbb)/.test(cssOut), cssOut.slice(0, 120));
    check('ونال التجاوب', /إصلاح جو: التجاوب/.test(cssOut));
    check('ونال أهداف اللمس', /min-height:\s*44px/.test(cssOut));
    check('و JSX نال تأجيل الصور', /loading="lazy"/.test(plan.files['src/App.jsx'] || ''));
    check('والترتيب سليم: الرموز أوّلاً ثمّ الكتل المُلحقة',
        cssOut.indexOf('--text-muted') < cssOut.indexOf('إصلاح جو: التجاوب'));

    /* ───────────────── [5] A PAGE HE DOES NOT OWN — LIVE ───────────────── */
    console.log('\n[5] صفحة ليست ملكه — متصفّح حقيقي، قياس قبل وبعد');
    const site = await brokenServer();
    const sessionId = `pagefix-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`pagefix-${Date.now()}`, () =>
            rawExecute(name, args, { sessionId, workspaceId: process.cwd(), userId: 'u1' } as any));

    const res: any = await executeTool('browser_page_fix', { url: site.url });
    check('الأداة نجحت على صفحة خارجية', res?.ok === true, String(res?.error || ''));
    const o = res?.output || {};
    const before = o.before || {}, after = o.after || {};

    check('قِيست الصفحة على مقاس هاتف فظهر التمرير الأفقي',
        before.horizontalScroll === true && before.overflowWidth > 400, String(before.overflowWidth));
    check('وبعد الرقعة اختفى التمرير الأفقي — مقيساً في المتصفّح نفسه',
        after.overflowWidth === 0, `${before.overflowWidth} → ${after.overflowWidth}`);
    check('ووُجدت أهداف لمس صغيرة', before.smallTargets >= 6, String(before.smallTargets));
    check('وبعد الرقعة صارت صفراً', after.smallTargets === 0, `${before.smallTargets} → ${after.smallTargets}`);

    // The colours the BROWSER computed after the patch, run through the same
    // WCAG maths the repairs use — so «readable» is a measurement, not a claim.
    const asHex = (raw: string) => {
        const n = (String(raw).match(/\d+/g) || []).slice(0, 3);
        return n.length === 3 ? '#' + n.map(v => Number(v).toString(16).padStart(2, '0')).join('') : '';
    };
    const failingOf = (m: any) => (m.lowContrast || []).filter((x: any) => {
        const fg = parseHex(asHex(x.color));
        const bg = parseHex(asHex(x.background)) || white;
        return fg ? contrastRatio(fg, bg) < 4.5 : false;
    }).length;
    check('ونصوص دون حدّ التباين كانت موجودة', failingOf(before) >= 2, String(failingOf(before)));
    check('وصارت مقروءة بعد الرقعة — بألوان المتصفّح المحسوبة لا بادّعائي',
        failingOf(after) === 0, `${failingOf(before)} → ${failingOf(after)}`);

    check('ورُصدت صور بلا أبعاد معلنة', before.unsizedImages >= 3, String(before.unsizedImages));
    check('وحُجزت مساحتها بنسبتها الحقيقية المقيسة (600×400 → 3/2)',
        /img\[src\$="pic\.svg"\] \{ aspect-ratio: 3 \/ 2; \}/.test(String(o.patch || '')),
        String(o.patch || '').split('\n').filter(l => l.includes('aspect-ratio')).join(' | '));
    check('ولا قاعدة attr() ميتة في الرقعة — كلّ سطر فيها يعمل فعلاً',
        !/attr\(/.test(String(o.patch || '')));

    console.log('\n[6] وما لا تستطيعه CSS قيل صراحةً — لا ادّعاء');
    const msg = String(o.message || '');
    check('صرّحت بأن الخادم ليس ملكه ولا يستطيع تعديله', /ليست ملكك/.test(msg) && /خادمها/.test(msg));
    check('وأن المعروض رقعة حيّة في متصفّحه', /حيّاً في متصفّحك/.test(msg));
    check('وأن تأجيل التحميل يحتاج HTML الموقع لا CSS',
        before.eagerImages > 0 ? /loading="lazy" في HTML/.test(msg) : true, String(before.eagerImages));
    check('وذكرت الأرقام قبل وبعد في نصّها', msg.includes(`${before.overflowWidth}px ← ${after.overflowWidth}px`));

    console.log('\n[7] والرقعة ملفٌّ حقيقي يسلّمه لمن يملك الموقع');
    const file = String(o.file || '');
    check('حُفظت في data/artifacts', !!file && fs.existsSync(file) && file.includes(path.join('data', 'artifacts')), file);
    check('ومحتواها هو الرقعة نفسها', !!file && fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === String(o.patch || ''));
    if (file) { try { fs.unlinkSync(file); } catch { /* best effort */ } }

    console.log('\n[8] وصفحة سليمة لا تُلمَس — ولا تُخترَع لها عيوب');
    const clean = http.createServer((_rq, rs) => {
        rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rs.end('<!doctype html><html lang="ar"><head><meta charset="utf-8">'
            + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>سليمة</title>'
            + '<style>body{margin:0;font-family:sans-serif;color:#111;background:#fff}'
            + 'p{max-width:100%;padding:16px}</style></head>'
            + '<body><p>صفحة بسيطة لا عيب فيها: لا تمرير أفقي، ولا أهداف لمس، ولا صور.</p></body></html>');
    });
    await new Promise<void>(r => clean.listen(0, '127.0.0.1', () => r()));
    const cleanUrl = `http://127.0.0.1:${(clean.address() as any).port}/`;
    const ok2: any = await executeTool('browser_page_fix', { url: cleanUrl });
    check('نجحت وقالت إنه لا عيب', ok2?.ok === true && (ok2?.output?.applied || []).length === 0,
        JSON.stringify(ok2?.output?.applied || ok2?.error));
    check('ولم تُنتج رقعة لصفحة لا تحتاجها', !ok2?.output?.patch);
    try { clean.close(); } catch { /* done */ }

    console.log('\n[9] والجملة العربية تصل إلى هذه الأداة');
    const P = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    check('«أصلح واجهة <رابط>» موصولة إلى browser_page_fix', /uiRepairIntent \? 'browser_page_fix'/.test(P));
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'registry.ts'), 'utf-8');
    check('والأداة مسجَّلة فعلاً', /new PageFixTool\(\)/.test(R));

    site.close();
    try {
        const { stopSession } = await import('../../modules/browser/manager');
        const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');
        await stopSession(PANEL_BROWSER_SID);
    } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
