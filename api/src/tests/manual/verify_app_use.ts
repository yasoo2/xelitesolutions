/**
 * THE APP IS USED BEFORE IT IS DELIVERED — not merely looked at.
 *
 * The self-QA on React builds loaded ONE page and never pressed anything. So a
 * build could ship with «أضف إلى السلة» wired to nothing, a second page that
 * fails to open, and a <div onClick> the Tab key can never reach — and the
 * audit would answer 100/100. Truthfully, about the wrong question.
 *
 * The single-file HTML builder has clicked its controls for months. The React
 * path never did. Both use one probe now, so «this button does nothing» has a
 * single definition in the system.
 *
 *   [1] a real browser opens a real built site and PRESSES its controls
 *   [2] the dead one is named; the working one is not accused
 *   [3] every other page the site links to is opened and audited as a page
 *   [4] an element only a mouse can reach is reported…
 *   [5] …and then actually repaired in the source, and the repair compiles
 *   [6] a clean site still scores 100 — the new checks invent nothing
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_app_use.ts
 */
export {};
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

const page = (body: string, head = '') => `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>متجر</title><style>
body{margin:0;font-family:sans-serif;background:#fff;color:#111}
button,a.btn{display:inline-block;min-width:48px;min-height:48px;padding:12px 18px;margin:6px}
</style>${head}</head><body>${body}</body></html>`;

function writeSite(dir: string, opts: { broken: boolean }) {
    fs.mkdirSync(dir, { recursive: true });
    const home = opts.broken ? `
<h1>متجرنا</h1>
<main>
  <button id="works" onclick="document.getElementById('n').textContent = String(+document.getElementById('n').textContent + 1)">أضف إلى السلة</button>
  <span id="n">0</span>
  <button id="dead">اشترِ الآن</button>
  <div id="fake" onclick="document.title='clicked'">تفاصيل</div>
  <a class="btn" href="about.html">من نحن</a>
</main>` : `
<h1>متجرنا</h1>
<main>
  <button id="works" onclick="document.getElementById('n').textContent = String(+document.getElementById('n').textContent + 1)">أضف إلى السلة</button>
  <span id="n">0</span>
  <a class="btn" href="about.html">من نحن</a>
</main>`;
    fs.writeFileSync(path.join(dir, 'index.html'), page(home), 'utf-8');
    // The second page: broken variant has no <h1> at all.
    const about = opts.broken
        ? '<main><p>صفحة بلا عنوان رئيسي</p></main>'
        : '<h1>من نحن</h1><main><p>نبيع أشياء جيدة.</p></main>';
    fs.writeFileSync(path.join(dir, 'about.html'), page(about), 'utf-8');
}

async function main() {
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const { repairKeyboardControls, repairProjectFiles } = await import('../../core/quality/ui-repair');
    const { syntaxOk } = await import('../../modules/tools/definitions/ProjectEditTool');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-appuse-'));

    console.log('\n[1..4] موقع مبني حقيقي — يُفتح ويُضغَط زرّه في متصفّح حقيقي');
    const bad = path.join(root, 'broken');
    writeSite(bad, { broken: true });
    const a = await auditBuiltApp(bad, { timeoutMs: 30_000 });
    check('الفحص جرى فعلاً', !a.skipped, String(a.skipped));
    const ids = a.findings.map(f => f.id);
    const detailOf = (id: string) => a.findings.find(f => f.id === id)?.detail || '';

    check('ضُغطت أزرار فعلاً — لا مجرّد نظر إلى الصفحة', (a.pressed || 0) >= 2, String(a.pressed));
    check('والزر الميت سُمّي بالاسم',
        /اشترِ الآن/.test((a.dead || []).join(' | ')), (a.dead || []).join(' | ') || 'لا شيء');
    check('والزر العامل لم يُتَّهم ظلماً',
        !/أضف إلى السلة/.test((a.dead || []).join(' | ')), (a.dead || []).join(' | '));
    check('وصدرت ملاحظة عن الأزرار الميتة',
        ids.includes('dead_controls') || ids.includes('some_dead_controls'), ids.join(', '));

    check('وفُتحت الصفحة الثانية أيضاً', (a.routes || []).includes('about.html'), (a.routes || []).join(', '));
    check('وعيبها هي رُصد — لا عيب الرئيسية',
        ids.includes('broken_routes') && /about\.html/.test(detailOf('broken_routes')), detailOf('broken_routes'));

    check('والعنصر الذي لا تصله لوحة المفاتيح رُصد',
        ids.includes('keyboard_unreachable'), ids.join(', '));
    check('والدرجة انخفضت بسبب ما حدث فعلاً', a.score < 100, String(a.score));

    console.log('\n[5] وما رُصد يُصلَح في المصدر — والإصلاح يُترجَم');
    const jsx = `export default function Card({ open }) {
  return (
    <div className="card" onClick={open}>
      <span onClick={open} role="link">تفاصيل</span>
      <button onClick={open}>زر حقيقي</button>
      <div className="static">لا شيء هنا</div>
    </div>
  );
}`;
    const fixed = repairKeyboardControls(jsx);
    // The attributes land straight after the tag NAME — the one splice position
    // that is safe inside JSX whatever the existing props contain.
    check('العنصر النقري صار زراً معلناً',
        /<div role="button" tabIndex=\{0\}[\s\S]*?className="card" onClick=\{open\}>/.test(fixed.text),
        fixed.text.split('\n')[2]);
    check('ودخل ترتيب Tab', (fixed.text.match(/tabIndex=\{0\}/g) || []).length === 2, String((fixed.text.match(/tabIndex=\{0\}/g) || []).length));
    check('و Enter/Space صارا يعملان عمل الفأرة', /onKeyDown=\{\(e\) =>/.test(fixed.text));
    check('ودورٌ معلن مسبقاً لم يُستبدل', /role="link"/.test(fixed.text) && !/role="link"[^>]*role="button"/.test(fixed.text));
    check('و <button> الحقيقي لم يُلمَس', /<button onClick=\{open\}>/.test(fixed.text));
    check('و <div> بلا نقر لم يُلمَس', /<div className="static">/.test(fixed.text));
    const gate = syntaxOk('src/Card.jsx', fixed.text);
    check('والملف بعد الإصلاح ما زال يُحلَّل (esbuild)', gate.ok === true, String((gate as any).error));
    check('وتكراره لا يضيف شيئاً', repairKeyboardControls(fixed.text).text === fixed.text);
    check('وهو موصول بمسار إصلاح المشروع',
        /tabIndex=\{0\}/.test(repairProjectFiles({ 'src/Card.jsx': jsx }).files['src/Card.jsx'] || ''));

    console.log('\n[6] وموقع سليم يبقى سليماً — لا عيوب مُخترَعة');
    const good = path.join(root, 'clean');
    writeSite(good, { broken: false });
    const b = await auditBuiltApp(good, { timeoutMs: 30_000 });
    check('لا ملاحظات على الموقع السليم', b.findings.length === 0, b.findings.map(f => `${f.id}: ${f.detail}`).join(' | '));
    check('ودرجته 100', b.score === 100, String(b.score));
    check('ومع ذلك ضُغطت أزراره فعلاً', (b.pressed || 0) >= 1, String(b.pressed));
    check('وفُتحت صفحته الثانية أيضاً', (b.routes || []).length === 2, (b.routes || []).join(', '));

    console.log('\n[7] وتعريف «زر ميت» واحد في النظام — لا اثنان');
    const A = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
    check('فحص React يستعمل المسبار نفسه', /import \{ probeControls, judgeBehaviour, FormResult, ControlResult \}/.test(A));
    check('ولا يعيد الحكم بنفسه', /judgeBehaviour\(allControls/.test(A));
    const B = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf-8');
    check('وباني HTML القديم ما زال يمرّ من الطريق نفسه', /const probe = await probeControls\(page\)/.test(B));

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
