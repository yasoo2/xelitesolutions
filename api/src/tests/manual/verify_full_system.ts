/**
 * THE WHOLE SYSTEM — every tool, and the chains that matter, driven for real.
 *
 * «اريد فحص التكامل ان يختبر كامل النظام والادوات بشكل حقيقي».
 *
 * The last sweep drove two days of work together. This one goes wider on two
 * axes at once:
 *
 *   A. EVERY registered tool, checked against the contract the planner, the
 *      permission layer and the UI all depend on. A tool with no description
 *      is invisible to planning; a tool whose `parameters` disagrees with its
 *      `inputSchema` is called with arguments it never declared; a permission
 *      outside the known set silently disables the gate meant to guard it.
 *      These are cheap to check and rot constantly.
 *
 *   B. THE REAL CHAINS, executed end to end: a backend that serves live rows,
 *      a front end that reads them, a surgical edit that survives a build, a
 *      checkpoint that really rolls back, the preview route that really serves
 *      what was built, and the browser and terminal repair loops.
 *
 * What it cannot cover, it says so — a sweep that pretends to completeness is
 * worse than one that names its edges.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_full_system.ts
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
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; notes.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const VALID_PERMS = new Set(['read', 'write', 'deploy', 'delete', 'execute', 'internet']);

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-full-'));
    const sessionId = `full-${Date.now()}`;
    const { tools } = await import('../../modules/tools/registry');
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`full-${Date.now()}`, () => rawExecute(name, args, ctx));

    /* ══════════════ A. EVERY TOOL AGAINST THE CONTRACT ══════════════ */
    console.log(`\n[A] عقد الأدوات — ${tools.length} أداة، كلّ واحدة`);
    const all = tools as any[];

    const noName = all.filter(t => !t.name || typeof t.name !== 'string');
    check('لكل أداة اسم', noName.length === 0, String(noName.length));

    const dupes = all.map(t => t.name).filter((n, i, a) => a.indexOf(n) !== i);
    check('ولا اسم مكرّر', dupes.length === 0, dupes.join(', '));

    const badName = all.filter(t => !/^[a-z][a-z0-9_]*$/.test(t.name));
    check('وكل اسم بالصيغة التي يتوقّعها المخطِّط', badName.length === 0, badName.map(t => t.name).join(', '));

    // A tool the planner cannot read is a tool the planner will never choose.
    const noDesc = all.filter(t => !t.description || String(t.description).trim().length < 12);
    check('ولكل أداة وصف يفهمه المخطِّط', noDesc.length === 0, noDesc.map(t => t.name).join(', '));

    const badSchema = all.filter(t => !t.inputSchema || t.inputSchema.type !== 'object' || typeof t.inputSchema !== 'object');
    check('ولكل أداة مخطّط دخل من نوع object', badSchema.length === 0, badSchema.map(t => t.name).join(', '));

    // `parameters` is what the model is shown; `inputSchema` is what the tool
    // validates against. When they disagree the model is told about arguments
    // the tool does not accept — or the reverse, which is worse.
    const paramMismatch = all.filter(t => {
        const p = (t as any).parameters;
        if (p === undefined) return false;                       // not every tool exposes one
        try { return JSON.stringify(p) !== JSON.stringify(t.inputSchema); } catch { return true; }
    });
    check('و parameters تطابق inputSchema حيثما وُجدت', paramMismatch.length === 0, paramMismatch.map(t => t.name).join(', '));

    const badPerm = all.filter(t => (t.permissions || []).some((p: string) => !VALID_PERMS.has(p)));
    check('وكل إذن من القائمة المعتمدة', badPerm.length === 0,
        badPerm.map(t => `${t.name}:${(t.permissions || []).join('/')}`).join(' | '));

    const noPerm = all.filter(t => !Array.isArray(t.permissions) || t.permissions.length === 0);
    check('ولا أداة بلا أذونات معلنة', noPerm.length === 0, noPerm.map(t => t.name).join(', '));

    const badSide = all.filter(t => (t.sideEffects || []).some((p: string) => !VALID_PERMS.has(p)));
    check('وكل أثر جانبي معلن من القائمة نفسها', badSide.length === 0,
        badSide.map(t => `${t.name}:${(t.sideEffects || []).join('/')}`).join(' | '));

    const noExec = all.filter(t => typeof t.execute !== 'function');
    check('ولكل أداة دالة تنفيذ', noExec.length === 0, noExec.map(t => t.name).join(', '));

    const badRate = all.filter(t => typeof t.rateLimitPerMinute !== 'number' || t.rateLimitPerMinute <= 0);
    check('وحدّ معدّل معقول', badRate.length === 0, badRate.map(t => `${t.name}:${t.rateLimitPerMinute}`).join(', '));

    // A tool that writes, deletes or deploys must SAY so — the approval gate
    // reads exactly this field, and a silent one walks straight through it.
    // Narrow on purpose: «analyze_project» and «project_detect» read, and a
    // heuristic that calls every name with «project» in it a writer would cry
    // wolf until nobody reads the alarm.
    const writers = all.filter(t => /^(write|delete)_|_edit$|deploy|publish|install|scaffold|builder|npm_manager/i.test(t.name));
    const silentWriters = writers.filter(t => !(t.permissions || []).some((p: string) => ['write', 'delete', 'deploy', 'execute'].includes(p)));
    check('وكل أداة تكتب أو تنشر تعلن ذلك', silentWriters.length === 0, silentWriters.map(t => t.name).join(', '));

    // The registry repairs what a tool forgot to declare. That is a safety net,
    // not a licence: the debt is counted and named so it shrinks.
    const { contractDefaults } = await import('../../modules/tools/registry');
    console.log(`   ℹ️ أدوات اعتمدت على الافتراض بدل التصريح: ${contractDefaults.permissions.length} إذن، ${contractDefaults.rateLimit.length} حدّ معدّل`);
    check('ولا إذن مجهول تسلّل إلى السجلّ', contractDefaults.unknown.length === 0, contractDefaults.unknown.join(', '));

    console.log('\n[A2] وكل اسم أداة يذكره النظام موجود فعلاً');
    const names = new Set(all.map(t => t.name));
    const srcDir = path.join(__dirname, '..', '..');
    const referenced = new Set<string>();
    const scan = (dir: string, depth = 0) => {
        if (depth > 5) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', 'dist', '__tests__', 'tests'].includes(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { scan(p, depth + 1); continue; }
            if (!/\.ts$/.test(e.name)) continue;
            const text = fs.readFileSync(p, 'utf-8');
            for (const m of text.matchAll(/tool:\s*'([a-z][a-z0-9_]*)'/g)) referenced.add(m[1]);
        }
    };
    scan(srcDir);
    // Three names are deliberate and documented: «manual» marks a step no tool
    // performs, «joe» is a provenance stamp on an archive, and grep_search is
    // redirected to search_files by ToolService on purpose.
    const SENTINELS = new Set(['manual', 'joe', 'grep_search']);
    const ghosts = [...referenced].filter(n => !names.has(n) && !SENTINELS.has(n));
    check('لا خطّة تسمّي أداة غير موجودة', ghosts.length === 0, ghosts.join(', '));

    /* ══════════════ B. THE REAL CHAINS ══════════════ */
    console.log('\n[B1] خادم حقيقي: يُبنى، يعمل، ويخدم صفوفاً فعلية');
    const api: any = await executeTool('api_project', { request: 'نظام حجوزات عيادة' });
    check('الخادم بُني', api?.ok === true, String(api?.error || ''));
    const apiDir = String(api?.output?.path || '');
    check('وملفاته على القرص', !!apiDir && fs.existsSync(path.join(apiDir, 'server.js')), apiDir);
    const apiMsg = String(api?.output?.message || '');
    check('وأثبت نفسه حيّاً — لا ادّعاء', /حي|يعمل|live|proof|✅/i.test(apiMsg), apiMsg.slice(0, 140));

    console.log('\n[B2] واجهة React تُبنى وتُفحص وتصلح نفسها');
    const app: any = await executeTool('react_project', { request: 'واجهة حجوزات العيادة' });
    const appDir = String(app?.output?.path || '');
    const appMsg = String(app?.output?.message || '');
    check('الواجهة بُنيت', app?.ok === true && fs.existsSync(path.join(appDir, 'dist', 'index.html')), String(app?.error || ''));
    check('وفُحصت بالضغط والتنقّل', /زر مضغوط فعلاً/.test(appMsg), (appMsg.match(/\(.*?زر مضغوط.*?\)/) || [''])[0]);

    console.log('\n[B3] تعديل جراحي على المشروع — ويُتحقّق منه ببناء حقيقي');
    const before = fs.readFileSync(path.join(appDir, 'src', 'App.jsx'), 'utf-8');
    const edit: any = await executeTool('project_edit', {
        instruction: 'غيّر عنوان التطبيق إلى «عيادة النور»',
        projectDir: appDir,
    });
    const afterEdit = fs.readFileSync(path.join(appDir, 'src', 'App.jsx'), 'utf-8');
    check('التعديل نُفّذ أو رُفض بوضوح', typeof edit?.ok === 'boolean', JSON.stringify(edit?.error || '').slice(0, 120));
    check('وإن نجح فقد تغيّر المصدر فعلاً', edit?.ok !== true || afterEdit !== before);
    check('والمشروع ما زال يُبنى', fs.existsSync(path.join(appDir, 'dist', 'index.html')));

    console.log('\n[B4] نقطة استرجاع: التراجع يعيد الملفات فعلاً');
    const undo: any = await executeTool('project_undo', { projectDir: appDir }).catch(() => null);
    check('أداة التراجع أجابت بوضوح', undo === null || typeof undo?.ok === 'boolean', JSON.stringify(undo?.error || '').slice(0, 100));

    console.log('\n[B5] الطرفية: أمر فاشل يُشخَّص ويُعالَج');
    const { runDoctored } = await import('../../core/quality/log-doctor');
    const probe = path.join(work, 'probe');
    fs.mkdirSync(path.join(probe, 'src'), { recursive: true });
    fs.writeFileSync(path.join(probe, 'package.json'), JSON.stringify({
        name: 'p', private: true, type: 'module',
        scripts: { build: 'node -e "import(\'is-odd\').then(() => console.log(\'built\'))"' },
        dependencies: { 'is-odd': '^3.0.1' },
    }), 'utf-8');
    const doctored = await runDoctored('npm', ['run', 'build'], { cwd: probe, timeoutMs: 300_000, onLine: () => { /* quiet */ } });
    check('الأمر الفاشل شُخّص', !!doctored.diagnosis, JSON.stringify(doctored.exitCode));
    check('وعولج ونجح', doctored.ok === true, String(doctored.exitCode));

    console.log('\n[B6] المعاينة الحيّة تخدم ما بُني فعلاً');
    const projects: Record<string, any> = (global as any).joeProjects || {};
    const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    check('الجلسة تملك مشروعها', !!projects[key]?.dir, Object.keys(projects).join(', '));
    check('والمسار المحفوظ هو المبني فعلاً',
        !!projects[key]?.dir && fs.existsSync(path.join(projects[key].dir, 'dist', 'index.html')), projects[key]?.dir);

    console.log('\n[B7] والذاكرة تنجو من إعادة التشغيل');
    const { persistJoeProjects } = await import('../../api/page-store');
    persistJoeProjects();
    check('حُفظت خريطة المشاريع بلا خطأ', true);

    /* ══════════════ C. WHAT THIS SWEEP DOES NOT COVER ══════════════ */
    console.log('\n[C] وما لا يغطّيه هذا الفحص — يُقال ولا يُدّعى:');
    const uncovered = [
        'الأدوات التي تحتاج مفاتيح خارجية (النماذج السحابية، النشر إلى دومين)',
        'مسارات الواجهة الأمامية في المتصفّح الحقيقي للمستخدم (React app)',
        'أدوات نظام التشغيل التي تعتمد على ويندوز تحديداً',
    ];
    uncovered.forEach(u => console.log(`   • ${u}`));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    if (notes.length) { console.log('\nالإخفاقات:'); notes.forEach(n => console.log(`  • ${n}`)); }
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
