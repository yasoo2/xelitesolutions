/**
 * A PROJECT CAN BE PUT BACK — the gap the last sweep named out loud.
 *
 * Pages have had instant rollback for a long time. React projects — the newer
 * and far more capable front — never did. Joe edits them surgically, repairs
 * their source before delivery, and mends what its own audit measures. Every
 * one of those was a door with no handle on the inside: the existing revert
 * only undoes a change that failed to BUILD, and the ordinary case is a change
 * that built perfectly and that he simply did not want.
 *
 *   [1] a snapshot is taken automatically before Joe touches anything
 *   [2] it holds SOURCE only — node_modules and dist are derived, not history
 *   [3] «تراجع» restores byte-for-byte, and removes files added since
 *   [4] …and rebuilds, because a restored source with a stale dist lies
 *   [5] the undo is itself undoable
 *   [6] a project Joe never touched says so instead of inventing a version
 *   [7] and the Arabic sentence reaches this tool, not the page tool
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_project_undo.ts
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
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-undo-'));
    const sessionId = `undo-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`undo-${Date.now()}`, () => rawExecute(name, args, ctx));
    const { listVersions, snapshotProject, restoreVersion, VERSIONS_DIR } = await import('../../core/project/versions');

    console.log('\n[1] مشروع حقيقي — لم يُلمس بعد، فلا نسخ له');
    const app: any = await executeTool('react_project', { request: 'صفحة خدمات للاسترجاع', skipAudit: true });
    const dir = String(app?.output?.path || '');
    check('المشروع بُني', app?.ok === true && fs.existsSync(path.join(dir, 'dist', 'index.html')), String(app?.error || ''));
    if (!dir) { console.log('\n===== توقّف ====='); process.exit(1); }
    const projects: any = (global as any).joeProjects || ((global as any).joeProjects = {});
    projects[sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')] = { dir, type: 'react' };

    const none: any = await executeTool('project_undo', {});
    check('«تراجع» على مشروع لم يُعدَّل يقول ذلك بدل اختراع نسخة',
        none?.ok === false && none?.error === 'no_versions', String(none?.error));

    console.log('\n[2] وأول تعديل يأخذ نسخة تلقائياً — بلا أن يُطلب');
    const shell = path.join(dir, 'src', 'App.jsx');
    const original = fs.readFileSync(shell, 'utf-8');
    const marker = (original.match(/<main[^>]*>/) || [])[0] || '';
    fs.writeFileSync(shell, original.replace(marker, `${marker}\n        <a href="#" className="btn" onClick={(e) => { e.currentTarget.textContent = 'تمّ'; }}>زرّ متنكّر</a>`), 'utf-8');
    const broken = fs.readFileSync(shell, 'utf-8');

    const { repairAndRebuild } = await import('../../core/quality/self-repair');
    const cycle = await repairAndRebuild(dir, { onLine: () => { /* quiet */ } });
    check('الإصلاح الذاتي جرى', cycle.changed.length > 0 && cycle.built, JSON.stringify(cycle.skipped || ''));
    const versions = listVersions(dir);
    check('وأُخذت نسخة قبله تلقائياً', versions.length === 1, JSON.stringify(versions.map(v => v.label)));
    check('ومكتوب فيها سبب أخذها', /قبل الإصلاح/.test(versions[0]?.label || ''), versions[0]?.label);
    check('والمصدر تغيّر فعلاً بعد الإصلاح', fs.readFileSync(shell, 'utf-8') !== broken);

    console.log('\n[3] والنسخة تحفظ المصدر وحده — لا node_modules ولا dist');
    const snapRoot = path.join(dir, VERSIONS_DIR, versions[0].id, 'files');
    check('المصدر محفوظ', fs.existsSync(path.join(snapRoot, 'src', 'App.jsx')));
    check('ولا node_modules في النسخة', !fs.existsSync(path.join(snapRoot, 'node_modules')));
    check('ولا dist', !fs.existsSync(path.join(snapRoot, 'dist')));

    console.log('\n[4] و«تراجع» يعيد الملف بالبايت — ويعيد البناء');
    const undo: any = await executeTool('project_undo', {});
    check('التراجع نجح', undo?.ok === true, String(undo?.error || ''));
    check('والملف عاد كما كان قبل الإصلاح — بالبايت', fs.readFileSync(shell, 'utf-8') === broken);
    check('وأُعيد البناء', undo?.output?.rebuilt === true && fs.existsSync(path.join(dir, 'dist', 'index.html')));
    check('والرسالة تذكر عدد الملفات لا وعداً', /أُعيد \d+ ملف/.test(String(undo?.output?.message || '')),
        String(undo?.output?.message || '').slice(0, 120));

    console.log('\n[5] والتراجع نفسه محفوظ — يمكن التراجع عنه');
    const after = listVersions(dir);
    check('نسخة جديدة أُخذت قبل الاسترجاع', after.length === 2, String(after.length));
    check('ومكتوب فيها أنها «قبل الاسترجاع»', /قبل الاسترجاع/.test(after[0]?.label || ''), after[0]?.label);
    const undo2: any = await executeTool('project_undo', {});
    check('والتراجع الثاني يعيد ما بعد الإصلاح', undo2?.ok === true
        && fs.readFileSync(shell, 'utf-8') !== broken, String(undo2?.error || ''));

    console.log('\n[6] وملف أُضيف بعد النسخة يُزال — الاسترجاع ليس دمجاً');
    const stray = path.join(dir, 'src', 'components', 'Stray.jsx');
    fs.mkdirSync(path.dirname(stray), { recursive: true });
    fs.writeFileSync(stray, 'export default function Stray(){ return null; }\n', 'utf-8');
    snapshotProject(dir, 'اختبار الإزالة');
    fs.writeFileSync(path.join(dir, 'src', 'components', 'Later.jsx'), 'export default function Later(){ return null; }\n', 'utf-8');
    const res = restoreVersion(dir);
    check('الاسترجاع نجح', res.ok === true, String(res.error || ''));
    check('والملف اللاحق أُزيل', !fs.existsSync(path.join(dir, 'src', 'components', 'Later.jsx')));
    check('والملف الذي كان ضمن النسخة بقي', fs.existsSync(stray));

    console.log('\n[7] وقائمة النسخ تُعرض للمستخدم');
    const list: any = await executeTool('project_undo', { list: true });
    check('العرض نجح', list?.ok === true, String(list?.error || ''));
    check('ويذكر عدد النسخ وتواريخها', /النسخ المحفوظة/.test(String(list?.output?.message || ''))
        && (list?.output?.versions || []).length >= 2, String((list?.output?.versions || []).length));

    console.log('\n[8] و«تراجع» بالعربية تصل إلى أداة المشروع لا إلى أداة الصفحات');
    const P = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    check('مسار التراجع موصول', /tool: 'project_undo'/.test(P));
    check('ومشروط بمشروع نشط — لا يخطف تراجع الصفحات', /\(undoVerb \|\| listVerb\) && active\?\.dir/.test(P));
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'registry.ts'), 'utf-8');
    check('والأداة مسجّلة', /new ProjectUndoTool\(\)/.test(R));

    console.log('\n[9] والتعديل الجراحي يأخذ نسخته أيضاً');
    const E = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ProjectEditTool.ts'), 'utf-8');
    check('التعديل يأخذ نسخة قبل أول كتابة', /snapshotProject\(dir, 'قبل التعديل'\)/.test(E));
    const S = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'quality', 'self-repair.ts'), 'utf-8');
    check('والإصلاح الذاتي كذلك', /snapshotProject\(dir, 'قبل الإصلاح الذاتي'\)/.test(S));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
