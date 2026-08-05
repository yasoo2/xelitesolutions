/**
 * THE BUILD THAT SCORED 0/8, RUN AGAIN.
 *
 * The field log, verbatim:
 *
 *   [pipeline] plan ready: E-commerce Platform — 8 phases
 *   [PhaseExecutor] Task 1/2: "Create project repository" — executing tool: Git
 *   [PhaseExecutor] ❌ Task 1 failed: Git — unknown_tool: "Git"
 *   [PhaseExecutor] Task 2/2: "Set up project management board" — executing tool: Jira
 *   [PhaseExecutor] ❌ Task 2 failed: Jira — unknown_tool: "Jira"
 *   [PhaseExecutor] Phase 1 failed: 0/2 tasks completed
 *   ⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق عند 0/8 مراحل
 *
 * This drives the REAL phase executor, in a REAL process, on a REAL workspace,
 * with the EXACT phase from that run — and then checks the disk, because a
 * green log that produced no files is the thing this repo keeps refusing.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_plan_binding.ts
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

/** His phase 1, word for word. */
const HIS_PHASE = {
    phaseNumber: 1,
    name: 'Project Setup',
    description: 'Initialize the project repository and tracking',
    tasks: [
        { task: 'Create project repository', tool: 'Git', args: { action: 'status' }, priority: 'high' },
        { task: 'Set up project management board', tool: 'Jira', args: {}, priority: 'high' },
    ],
    verificationTask: { task: 'Verify setup', tool: 'Jira', args: {} },
};

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-plan-'));
    process.env.JOE_WORKSPACE_ROOT = work;

    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx = { sessionId: `plan-${Date.now()}`, workspaceId: work, userId: 'u1' };
    // The firewall refuses any tool call that did not come through the
    // orchestrator. The proof enters the same context the orchestrator does,
    // rather than being granted an exemption the real system does not have.
    const executeTool = (name: string, args: any, c: any) =>
        executionFirewall.runInContext(`plan-proof-${Date.now()}`, () => rawExecute(name, args, c));

    console.log('\n[1] مرحلته الأولى بالحرف — التي كانت 0/2');
    const r1: any = await executeTool('phase_executor', { phase: HIS_PHASE }, ctx);
    const log1 = (r1?.logs || []).join('\n');
    if (process.env.DUMP) console.log('---LOG1---\n' + log1 + '\n---END---');
    check('لم يعد هناك unknown_tool ولا مرة', !/unknown_tool/i.test(log1), log1.slice(0, 200));
    check('«Git» صارت git_ops ونُفّذت', /«Git» تعني git_ops/.test(log1), log1.slice(0, 300));
    check('«Jira» تُخطّت بسبب مكتوب، لا بفشل', /Jira[^\n]*ليست أداة/.test(log1) && /عمل تنظيمي بشري/.test(log1));
    check('المرحلة لم تعد 0/2', !/0\/2 tasks completed/.test(log1), log1.split('\n').find((l: string) => /tasks completed/.test(l)) || '');
    check('والتحقّق لم يعد يستدعي أداة غير موجودة', !/verification[^\n]*Jira/i.test(log1));

    console.log('\n[2] مرحلة كلّها عمل بشري — تصير وثيقة على القرص لا ❌');
    const humanPhase = {
        phaseNumber: 2,
        name: 'Team Kickoff',
        description: 'Align everyone on the e-commerce scope',
        tasks: [
            { task: 'Run the kickoff meeting', tool: 'Zoom', args: {} },
            { task: 'Create the sprint board', tool: 'Trello', args: {} },
        ],
    };
    const { sanitisePlanPhases } = await import('../../core/orchestrator/plan-tools');
    const clean = sanitisePlanPhases([humanPhase], 'shop');
    const r2: any = await executeTool('phase_executor', { phase: clean.phases[0] }, ctx);
    const log2 = (r2?.logs || []).join('\n');
    check('المرحلة نُفِّذت بدل أن تفشل', !/Phase 2 failed/.test(log2), log2.slice(-300));

    // The disk is the only witness that counts.
    const found: string[] = [];
    const walk = (d: string, depth = 0) => {
        if (depth > 6) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p, depth + 1);
            else found.push(p);
        }
    };
    // Joe files a session's project under data/projects/<workspaceId>, NOT under
    // the temp folder handed in — the first run of this proof looked in the wrong
    // place and reported «لا شيء» about a file that existed. Look where the tool
    // actually writes.
    const projectsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'projects');
    for (const root of [work, projectsRoot]) { try { walk(root); } catch { /* may not exist */ } }
    const doc = found.find(f => /docs[\\/]02-team_kickoff\.md$/.test(f));
    check('والوثيقة موجودة فعلاً على القرص', !!doc, `الملفات: ${found.slice(0, 8).join(', ') || 'لا شيء'}`);
    if (doc) check('وفيها محتوى حقيقي لا ملف فارغ', fs.statSync(doc).size > 80, `${fs.statSync(doc).size} بايت`);

    console.log('\n[3] وخطوة مستحيلة تُتخطّى بدل أن تُنهي البناء');
    const installPhase = {
        phaseNumber: 3,
        name: 'Install tooling',
        tasks: [
            { task: 'Install Git if it is not installed', tool: 'shell_execute', args: { command: 'sudo apt-get install git -y' }, priority: 'high' },
            { task: 'Show git version', tool: 'shell_execute', args: { command: 'git --version' }, priority: 'high' },
        ],
    };
    const r3: any = await executeTool('phase_executor', { phase: installPhase }, ctx);
    const log3 = (r3?.logs || []).join('\n');
    check('الخطوة المستحيلة تُخطّت بسبب مكتوب', /sudo/.test(log3) && /⏭️/.test(log3), log3.slice(0, 300));
    check('ولم تُوقف المرحلة', !/Phase 3 failed/.test(log3), log3.split('\n').find((l: string) => /tasks completed/.test(l)) || '');
    check('والأمر السليم بعدها نُفِّذ فعلاً', /Task 2 completed/.test(log3), log3.slice(-300));

    console.log('\n[4] والخطة المولّدة بلا إنترنت تبقى قابلة للتنفيذ');
    const planned: any = await executeTool('project_planner', { projectDescription: 'Build an e-commerce platform like Shopify' }, ctx);
    const phases = planned?.output?.phases || [];
    const named = phases.flatMap((p: any) => (p.tasks || []).map((t: any) => String(t.tool || 'manual')));
    const { resolvePlannedTool } = await import('../../core/orchestrator/plan-tools');
    const unreal = named.filter((n: string) => n !== 'manual' && !resolvePlannedTool(n).tool);
    check('كل أداة تسمّيها الخطة موجودة', unreal.length === 0, unreal.join(', '));
    check('والخطة فيها عمل فعلي', named.some((n: string) => n !== 'manual'), named.join(', '));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    // leave no trace in the repo's project store
    try { fs.rmSync(path.join(projectsRoot, ...work.split(path.sep).filter(Boolean).slice(-2)), { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
