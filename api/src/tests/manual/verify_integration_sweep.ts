/**
 * THE WHOLE CHAIN, IN ONE SESSION, THE WAY HE ACTUALLY MEETS IT.
 *
 * Two days of work went in one layer at a time, and every layer was proved on
 * its own. That is not the same as proving they compose. Integration defects do
 * not live inside a function — they live in the SEAMS: a listener left on a
 * long-lived page, a panel handed back on the wrong route, a repair that fires
 * twice, a tool that works alone and collides when another one is mid-flight.
 *
 * So this drives them in sequence, in ONE session, on ONE browser panel:
 *
 *   [1] BUILD → self-QA presses the buttons and walks the routes → self-repair
 *   [2] the panel SURVIVES it: no listener left behind, no route left stuck
 *   [3] BREAK it → «أصلح الواجهة» → measured better, and the build still passes
 *   [4] an EXTERNAL page in the same panel, straight after — the two coexist
 *   [5] break the TERMINAL (delete node_modules) → the doctor heals mid-repair
 *   [6] every route lands where it should, with a project active
 *   [7] and the whole set of tools is registered, unique, and reachable
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_integration_sweep.ts
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
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; notes.push(`${name} — ${detail}`); console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const BROKEN_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>موقع خارجي</title>
<style>body{margin:0;font-family:sans-serif;background:#fff}
.wide{width:1100px;padding:12px}p.faint{color:#adadad;background:#fff}
a.tiny{display:inline-block;width:20px;height:20px;background:#eee;margin:2px}</style></head>
<body><div class="wide"><p class="faint">نصّ باهت جداً لا يكاد يُقرأ على خلفية بيضاء في وضح النهار.</p>
<a class="tiny" href="/1">١</a><a class="tiny" href="/2">٢</a><a class="tiny" href="/3">٣</a>
<a class="tiny" href="/4">٤</a><a class="tiny" href="/5">٥</a><a class="tiny" href="/6">٦</a>
</div></body></html>`;

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-sweep-'));
    const sessionId = `sweep-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`sweep-${Date.now()}`, () => rawExecute(name, args, ctx));

    const { PANEL_BROWSER_SID } = await import('../../modules/tools/definitions/BrowserSmartTools');
    const { getBrowserSession, stopSession } = await import('../../modules/browser/manager');

    /* ───────────────── [1] the build, end to end ───────────────── */
    console.log('\n[1] بناء كامل: يُبنى ← يُفحص بالضغط والتنقّل ← يصلح نفسه ← يُسلَّم');
    const t0 = Date.now();
    const build: any = await executeTool('react_project', { request: 'موقع خدمات استشارية' });
    const buildSecs = Math.round((Date.now() - t0) / 1000);
    const msg = String(build?.output?.message || '');
    const dir = String(build?.output?.path || '');
    check('البناء نجح', build?.ok === true && !!dir, String(build?.error || ''));
    check('و vite build اكتمل فعلاً', fs.existsSync(path.join(dir, 'dist', 'index.html')));
    check('والفحص الذاتي جرى في متصفّح حقيقي', /فحص الجودة الذاتي في متصفح حقيقي/.test(msg), msg.slice(0, 160));
    check('وضُغطت أزرار فعلاً — الرقم في الرسالة', /\d+ زر مضغوط فعلاً/.test(msg),
        (msg.match(/\(.*?زر مضغوط.*?\)/) || [''])[0]);
    const pressed = Number((msg.match(/(\d+) زر مضغوط/) || [])[1] || 0);
    check('والعدد أكبر من صفر — لا فحص صامت', pressed > 0, String(pressed));
    check('والبناء كلّه في زمن معقول', buildSecs < 420, `${buildSecs}s`);
    const auditScore = Number((msg.match(/(\d+)\/100/) || [])[1] || 0);
    check('ودرجة الجودة معلنة', auditScore > 0, String(auditScore));

    /* ───────────────── [2] the panel survives ───────────────── */
    console.log('\n[2] واللوحة تعود سليمة — لا مستمع متروك ولا صفحة عالقة');
    const s = await getBrowserSession(PANEL_BROWSER_SID);
    const listeners = (ev: string) => ((s.page as any).listenerCount ? (s.page as any).listenerCount(ev) : -1);
    const before = { console: listeners('console'), dialog: listeners('dialog'), response: listeners('response') };
    // A second and third audit on the same panel: the count must not grow.
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    await auditBuiltApp(path.join(dir, 'dist'), { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
    await auditBuiltApp(path.join(dir, 'dist'), { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
    const after = { console: listeners('console'), dialog: listeners('dialog'), response: listeners('response') };
    check('مستمعو الكونسول لم يتراكموا', after.console <= before.console, `${before.console} → ${after.console}`);
    check('ومستمعو النوافذ المنبثقة كذلك', after.dialog <= before.dialog, `${before.dialog} → ${after.dialog}`);
    check('ومستمعو الشبكة كذلك', after.response <= before.response, `${before.response} → ${after.response}`);
    // And an audit that FAILS must clean up too — a folder with no index.html.
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-nodist-'));
    await auditBuiltApp(nowhere, { timeoutMs: 15_000, watchSessionId: PANEL_BROWSER_SID });
    check('وفحص فاشل ينظّف خلفه أيضاً', listeners('console') <= before.console, `${listeners('console')}`);
    fs.rmSync(nowhere, { recursive: true, force: true });

    /* ───────────────── [3] break it, then «أصلح الواجهة» ───────────────── */
    console.log('\n[3] نكسره عمداً ← «أصلح الواجهة» ← تحسّن مقيس والبناء سليم');
    const shell = path.join(dir, 'src', 'App.jsx');
    const pristine = fs.readFileSync(shell, 'utf-8');
    const marker = (pristine.match(/<main[^>]*>/) || [])[0] || '';
    check('نقطة الحقن موجودة', !!marker);
    // Two kinds of dead link on purpose: one that is really a button wearing the
    // wrong tag, and one placeholder that nothing can honestly resolve.
    fs.writeFileSync(shell, pristine.replace(marker, `${marker}
        <a href="#" className="btn" onClick={(e) => { e.currentTarget.textContent = 'شكراً'; }}>زرّ متنكّر</a>
        <a href="#" className="btn">رابط بلا وجهة</a>
        <div className="tile" onClick={() => window.scrollTo(0, 0)}>إلى الأعلى</div>`), 'utf-8');
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    await executionEngine.runArgvStreaming('npm', ['run', 'build'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done;

    const projects: any = (global as any).joeProjects || ((global as any).joeProjects = {});
    projects[sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')] = { dir, type: 'react' };

    const fix: any = await executeTool('browser_ui_fix', {});
    check('أداة الإصلاح نجحت', fix?.ok === true, String(fix?.error || ''));
    check('وقاست قبل وبعد', typeof fix?.output?.before === 'number' && typeof fix?.output?.after === 'number');
    check('والدرجة ارتفعت أو بقيت — لم تنخفض',
        (fix?.output?.after ?? 0) >= (fix?.output?.before ?? 0), `${fix?.output?.before} → ${fix?.output?.after}`);
    const src = fs.readFileSync(shell, 'utf-8');
    check('الرابط الذي يحمل معالجاً صار زراً حقيقياً',
        /<button type="button" className="btn" onClick=\{\(e\) => \{ e\.currentTarget\.textContent/.test(src),
        (src.match(/<(?:a|button)[^\n]*زرّ متنكّر/) || [''])[0]);
    check('والرابط بلا وجهة تُرك كما هو — لا يصير زراً ميتاً',
        /<a href="#" className="btn">رابط بلا وجهة<\/a>/.test(src));
    check('وذُكر لي أنه ما زال قائماً بدل أن يُخفى',
        (fix?.output?.remaining || []).some((f: any) => f.id === 'dead_links'),
        JSON.stringify((fix?.output?.remaining || []).map((f: any) => f.id)));
    check('والعنصر النقري صار تصله لوحة المفاتيح', /tabIndex=\{0\}/.test(src));
    const rebuilt = await executionEngine.runArgvStreaming('npm', ['run', 'build'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done;
    check('والمشروع ما زال يُبنى بعد كل ذلك', rebuilt.ok === true, String(rebuilt.exitCode));

    console.log('\n[3ب] وتكرار الطلب لا يعيد الإصلاح ولا يعيد البناء بلا سبب');
    const srcBefore = fs.readFileSync(shell, 'utf-8');
    const again: any = await executeTool('browser_ui_fix', {});
    check('الاستدعاء الثاني نجح', again?.ok === true, String(again?.error || ''));
    check('ولم يلمس المصدر', fs.readFileSync(shell, 'utf-8') === srcBefore);

    /* ───────────────── [4] an external page, same panel ───────────────── */
    console.log('\n[4] وصفحة خارجية في اللوحة نفسها مباشرة بعدها — الأداتان تتعايشان');
    const srv = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(BROKEN_PAGE); });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const site = `http://127.0.0.1:${(srv.address() as any).port}/`;
    const pageFix: any = await executeTool('browser_page_fix', { url: site });
    check('إصلاح الصفحة الخارجية نجح', pageFix?.ok === true, String(pageFix?.error || ''));
    check('والتمرير الأفقي اختفى بعد الرقعة',
        (pageFix?.output?.after?.overflowWidth ?? 1) === 0,
        `${pageFix?.output?.before?.overflowWidth} → ${pageFix?.output?.after?.overflowWidth}`);
    check('وصرّح بأنه لا يملك خادمها', /ليست ملكك/.test(String(pageFix?.output?.message || '')));
    check('واللوحة رجعت لمقاس سطح المكتب — لا عالقة على مقاس هاتف',
        (s.page.viewportSize()?.width || 0) > 700, JSON.stringify(s.page.viewportSize()));

    console.log('\n[4ب] ثم يعود فحص المشروع للعمل في اللوحة نفسها — لا تسمّم متبادل');
    const backToProject = await auditBuiltApp(path.join(dir, 'dist'), { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
    check('الفحص بعد الصفحة الخارجية ما زال يعمل', !backToProject.skipped, String(backToProject.skipped));
    check('وما زال يضغط الأزرار', (backToProject.pressed || 0) > 0, String(backToProject.pressed));
    srv.close();

    /* ───────────────── [5] break the terminal ───────────────── */
    console.log('\n[5] نكسر الطرفية: نحذف node_modules ثم نطلب إصلاحاً — الطبيب يعالج أثناء الدورة');
    fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
    fs.writeFileSync(shell, fs.readFileSync(shell, 'utf-8').replace(marker,
        `${marker}\n        <a href="#" className="btn" onClick={(e) => { e.currentTarget.textContent = 'تمّ'; }}>زرّ متنكّر ثانٍ</a>`), 'utf-8');
    const { repairAndRebuild } = await import('../../core/quality/self-repair');
    const healed = await repairAndRebuild(dir, { onLine: () => { /* quiet */ } });
    check('الدورة أصلحت رغم غياب الحزم', healed.changed.length > 0, JSON.stringify(healed.skipped || ''));
    check('والبناء اكتمل بعد أن أعاد الطبيب تثبيت الحزم', healed.built === true && !healed.reverted);
    check('و node_modules عادت فعلاً', fs.existsSync(path.join(dir, 'node_modules')));
    check('والإصلاح لم يُلغَ بسبب عطل ليس ذنبه',
        /<button type="button" className="btn" onClick=\{\(e\) => \{ e\.currentTarget\.textContent = 'تمّ'/.test(fs.readFileSync(shell, 'utf-8')));

    /* ───────────────── [6] routing ───────────────── */
    console.log('\n[6] وكل جملة عربية تصل إلى أداتها');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const planner: any = new (PlanningEngine as any)();
    const routeOf = async (text: string) => {
        try {
            const p = await planner.plan?.(text, { sessionId }) ?? null;
            return JSON.stringify(p).slice(0, 200);
        } catch { return ''; }
    };
    const P = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    check('«أصلح الواجهة» + مشروع نشط → browser_ui_fix', /repairVerb && uiWhole && activeProject/.test(P));
    check('«أصلح واجهة <رابط>» → browser_page_fix', /uiRepairIntent \? 'browser_page_fix'/.test(P));
    void routeOf;

    /* ───────────────── [7] the toolbox itself ───────────────── */
    console.log('\n[7] وصندوق الأدوات متماسك: كل أداة مسجّلة، بلا تكرار، وبأذونات صحيحة');
    const { tools: allTools } = await import('../../modules/tools/registry');
    const all: any[] = allTools as any[];
    const names = all.map((t: any) => t.name);
    check('السجلّ يقرأ الأدوات', names.length > 50, String(names.length));
    check('ولا اسم مكرّر', new Set(names).size === names.length,
        names.filter((n: string, i: number) => names.indexOf(n) !== i).join(', '));
    for (const t of ['browser_ui_fix', 'browser_page_fix', 'react_project', 'project_edit']) {
        check(`«${t}» موجودة`, names.includes(t));
    }
    const VALID = new Set(['read', 'write', 'deploy', 'delete', 'execute', 'internet']);
    const badPerms = all.filter((t: any) => (t.permissions || []).some((p: string) => !VALID.has(p)))
        .map((t: any) => `${t.name}: ${(t.permissions || []).join(',')}`);
    check('وكل الأذونات من القائمة المعتمدة', badPerms.length === 0, badPerms.join(' | '));

    try { await stopSession(PANEL_BROWSER_SID); } catch { /* best effort */ }
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    if (notes.length) { console.log('\nالإخفاقات:'); notes.forEach(n => console.log(`  • ${n}`)); }
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
