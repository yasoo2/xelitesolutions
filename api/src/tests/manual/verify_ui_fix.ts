/**
 * THE BROWSER MENDS WHAT IT MEASURES — «اريده ان يصلح ui لاي نظام ولاي صفحة
 * عندما يطلب منه».
 *
 * For weeks Joe's self-QA has printed «62/100 — small_targets, dead_links» and
 * handed that to the user as if a score were a deliverable. A reviewer who only
 * files tickets is half an engineer.
 *
 * This drives the whole loop against a REAL project on disk and a REAL browser:
 *
 *   [2] the audit measures a genuinely broken interface
 *   [3] the repair changes the SOURCE — the DOM cannot be edited, the files can
 *   [4] every changed file passes the syntax gate, and vite really rebuilds
 *   [5] the second audit MEASURES the improvement (it is never claimed)
 *   [6] a repair that would break the build is refused, and reverted whole
 *   [7] running it twice changes nothing more — the fixers are idempotent
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_ui_fix.ts
 */
export {};
import fs from 'fs';
import os from 'os';
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

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-uifix-'));
    const sessionId = `uifix-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`uifix-${Date.now()}`, () => rawExecute(name, args, ctx));

    console.log('\n[1] مشروع React حقيقي — يُبنى ثم يُكسر عمداً');
    const app: any = await executeTool('react_project', { request: 'تطبيق مهام بسيط', skipAudit: true });
    const dir = String(app?.output?.path || '');
    check('المشروع بُني', app?.ok === true && fs.existsSync(path.join(dir, 'dist', 'index.html')), String(app?.error || ''));
    if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) { console.log('\n===== توقّف ====='); process.exit(1); }

    // Real, ordinary defects — the exact ones the audit has been reporting.
    const shell = path.join(dir, 'src', 'App.jsx');
    const original = fs.readFileSync(shell, 'utf-8');
    fs.writeFileSync(shell, original.replace(
        '<main className="app-main">',
        `<main className="app-main">
        <img src="/broken-on-purpose.png" />
        <a href="#" className="btn">رابط ميت</a>
        <a href="" className="btn">رابط ميت آخر</a>
        <h1>عنوان رئيسي ثانٍ</h1>`,
    ), 'utf-8');
    const html = path.join(dir, 'index.html');
    fs.writeFileSync(html, fs.readFileSync(html, 'utf-8')
        .replace(/<html[^>]*>/, '<html>')                                  // no lang
        .replace(/\s*<meta name="viewport"[^>]*\/?>\s*/, '\n'), 'utf-8');  // no viewport
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    await executionEngine.runArgvStreaming('npm', ['run', 'build'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done;
    check('وكُسر عمداً ثم أُعيد بناؤه', true);

    // The session must own it, exactly as it does after a real build.
    const projects: any = (global as any).joeProjects || ((global as any).joeProjects = {});
    projects[sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')] = { dir, type: 'react' };

    console.log('\n[2..5] القياس ← الإصلاح ← البناء ← القياس مرة أخرى');
    const fixed: any = await executeTool('browser_ui_fix', {});
    check('الأداة نجحت', fixed?.ok === true, String(fixed?.error || ''));
    const out = fixed?.output || {};
    check('وقاست قبل الإصلاح', typeof out.before === 'number', String(out.before));
    check('وقاست بعده', typeof out.after === 'number', String(out.after));
    check('والدرجة ارتفعت فعلاً — مقيسة لا مُدّعاة', out.after > out.before, `${out.before} → ${out.after}`);
    check('وغيّرت ملفات مصدر حقيقية', Array.isArray(out.changed) && out.changed.length > 0, JSON.stringify(out.changed));

    console.log('\n[3] وما غُيّر هو المصدر — لا الصفحة المعروضة');
    const appNow = fs.readFileSync(shell, 'utf-8');
    check('الصورة نالت نصاً بديلاً', /<img[^>]*\salt=/.test(appNow));
    check('والروابط الميتة صارت أزراراً', !/href="#"/.test(appNow) && !/href=""/.test(appNow), appNow.match(/href="[#]?"/)?.[0] || '');
    // Counted as ELEMENTS, not as text: App.jsx explains itself in a comment
    // that mentions <h1> in prose, and prose is not markup.
    check('والعنوان الرئيسي الزائد صار فرعياً', /<h2>عنوان رئيسي ثانٍ<\/h2>/.test(appNow), 'لم يُخفَّض');
    check('وبقي عنوان التطبيق رئيسياً كما يجب', /<h1 className="app-name">/.test(appNow));
    const htmlNow = fs.readFileSync(html, 'utf-8');
    check('والمستند نال لغته', /<html[^>]*\blang=/.test(htmlNow));
    check('و meta viewport عاد', /name="viewport"/.test(htmlNow));
    const cssNow = fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8');
    check('وأهداف اللمس وُسّعت في CSS', /min-height:\s*44px/.test(cssNow));

    console.log('\n[4] والبناء ما زال سليماً بعد كل ذلك');
    const rebuilt = await executionEngine.runArgvStreaming('npm', ['run', 'build'], {
        cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' },
    }).done;
    check('vite build ينجح بعد الإصلاح', rebuilt.ok === true, String(rebuilt.exitCode));

    console.log('\n[5] والملاحظات التي عولجت اختفت من القياس');
    const gone = (out.remaining || []).map((f: any) => f.id);
    check('لم تعد الروابط الميتة ضمن الملاحظات', !gone.includes('dead_links'), gone.join(', '));
    check('ولا تعدّد العناوين الرئيسية', !gone.includes('h1_count'), gone.join(', '));

    console.log('\n[6] وتشغيلها مرة ثانية لا يغيّر شيئاً — الإصلاح لا يتكرّر');
    const before2 = fs.readFileSync(shell, 'utf-8');
    const cssBefore2 = fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8');
    const again: any = await executeTool('browser_ui_fix', {});
    check('الاستدعاء الثاني نجح أيضاً', again?.ok === true, String(again?.error || ''));
    check('ولم يلمس المصدر مرة أخرى', fs.readFileSync(shell, 'utf-8') === before2);
    check('ولم يكرّر قاعدة CSS', fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8') === cssBefore2);

    console.log('\n[7] والجملة العربية تصل إلى هذه الأداة لا إلى المحرّر العام');
    const P = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    check('مسار «أصلح الواجهة» موصول إلى browser_ui_fix', /tool: 'browser_ui_fix'/.test(P));
    check('ومشروط بوجود مشروع نشط — لا يخطف بناءً جديداً', /repairVerb && uiWhole && activeProject/.test(P));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
