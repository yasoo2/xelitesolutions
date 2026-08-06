/**
 * «ما زال يشغل المتصفح والكيو-إيه بواسطة المتصفح دون فائدة»
 *
 * His own build log, the Quality phase:
 *
 *     - ✅ Application (tasks: 1/1)
 *     - ❌ Quality   (tasks: 0/1)
 *     - Error: `no_url`
 *
 * …while `GET /project-preview/<his session>/index.html` was answering 200 at
 * that very second. Two faults behind one symptom:
 *
 *   · the address was completed one layer above the tool, in the planner's
 *     adapter, so every other caller reached the audit with nothing and got the
 *     word `no_url` — a word that names none of its three possible causes;
 *   · and when it DID have an address it opened a browser to re-audit an app
 *     the builder had already audited in a real browser seconds earlier.
 *
 * This runs the REAL pipeline — a real React scaffold, a real npm install, a
 * real vite build, the real Quality phase — and measures:
 *
 *   [1] the builder's own in-browser audit lands on the project, with findings
 *   [2] the Quality phase completes, and does NOT open a second browser
 *   [3] the audit can still find its own address when nothing was audited yet
 *   [4] and when it truly cannot, it says WHICH of the three causes it was
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_quality_phase.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const sessionId = `qa-phase-${Date.now()}`;
    // ToolService FIRST: it owns the registry, and reaching a tool module
    // before the registry has finished loading re-enters the same cycle the
    // pipeline tool sits in («Cannot access 'ProjectPipelineTool' before
    // initialization»). Import order here is a real constraint, not a style.
    const { executeTool } = await import('../../modules/services/ToolService');
    const { buildSpine } = await import('../../modules/tools/definitions/ProjectPipelineTool');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    // A REAL Joe server, on the port the preview address is built from — the
    // audit has to actually reach the page it is asked about.
    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    process.env.PORT = String((server.address() as any).port);
    process.env.PUBLIC_URL = `http://127.0.0.1:${process.env.PORT}`;
    console.log(`   ℹ️ خادم جو على ${process.env.PUBLIC_URL}`);

    console.log('\n[1] بناء حقيقي — ومعه فحص البنّاء الحيّ في متصفّح حقيقي');
    const spine = buildSpine('app', 'ابنِ متجراً إلكترونياً بسيطاً لبيع القهوة');
    const quality = spine.output.phases.find((p: any) => p.name === 'Quality');
    check('مرحلة الجودة تُخطَّط بلا عنوان — كما في سجلّه بالضبط',
        JSON.stringify(quality.tasks[0].args) === '{}', JSON.stringify(quality.tasks[0].args));

    const said: string[] = [];
    const res: any = await executionFirewall.runInContext(undefined, () =>
        AgentLoopService.runPlannedPhasesIfPresent({
            sessionId, runId: `run-${Date.now()}`, userId: 'u1', workspaceId: `session-${sessionId}`,
            plannerResult: spine,
            onProgress: (m: string) => said.push(m),
        }));

    const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const entry = ((global as any).joeProjects || {})[key];
    check('المشروع بُني وسُجّل للجلسة', !!entry?.dir, String(entry?.dir || 'لا شيء'));
    check('وفحص البنّاء الحيّ سجّل درجته', Number(entry?.lastAudit?.score) > 0, JSON.stringify(entry?.lastAudit?.score));
    check('ومعها ملاحظاته لا الرقم وحده', Array.isArray(entry?.lastAudit?.findings),
        `findings=${(entry?.lastAudit?.findings || []).length}`);

    console.log('\n[2] مرحلة الجودة تكتمل — ولا تفتح متصفّحاً ثانياً على نفس الصفحة');
    const qualityPhase = (res.results || []).find((r: any) => String(r.phaseNumber) === '2');
    check('لم تعد المرحلة تسقط على no_url', res.completedPhases === 2,
        `completedPhases=${res.completedPhases} — ${(qualityPhase?.results || []).map((t: any) => `${t.tool}:${t.error || 'ok'}`).join(', ')}`);
    const auditTask = (qualityPhase?.results || []).find((t: any) => t.tool === 'browser_ui_audit');
    check('ومهمّة التدقيق نجحت', !!auditTask?.ok, JSON.stringify(auditTask));

    const reuse: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('browser_ui_audit', {}, { sessionId, userId: 'u1', workspaceId: `session-${sessionId}` }));
    check('واستدعاؤها بلا عنوان يعيد فحص البنّاء بدل فتح المتصفّح', reuse?.ok === true && reuse.output?.reused === true,
        JSON.stringify(reuse?.output?.reused ?? reuse?.error));
    check('ويقول ذلك صراحةً في رسالته', /لم أفتح المتصفّح مرّة ثانية/.test(String(reuse?.output?.summary || '')),
        String(reuse?.output?.summary || '').slice(0, 90));

    console.log('\n[3] وإن لم يسبقه فحص — يجد عنوانه بنفسه من ما بناه');
    const stale = { ...entry };
    delete (entry as any).lastAudit;      // as if the builder had never audited
    const { builtPreviewUrl } = await import('../../core/orchestrator/plan-tools');
    const own = builtPreviewUrl(sessionId);
    check('العنوان يُشتقّ من مسار المعاينة لهذه الجلسة', /\/project-preview\/.+\/index\.html/.test(own), own);
    check('والملف الذي يشير إليه موجود فعلاً',
        fs.existsSync(path.join(String(stale.dir), 'dist', 'index.html')));
    (entry as any).lastAudit = stale.lastAudit;

    console.log('\n[4] وإن استحال — يقول أيّ سبب من الثلاثة، لا كلمة no_url');
    const { whyNoBuiltUrl } = await import('../../core/orchestrator/plan-tools');
    const noSession = whyNoBuiltUrl('');
    const noProject = whyNoBuiltUrl(`never-built-${Date.now()}`);
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-nodist-'));
    ((global as any).joeProjects || {})['nodist_session'] = { dir: emptyDir, type: 'react' };
    const noDist = whyNoBuiltUrl('nodist_session');
    check('«لا معرّف جلسة» سبب مذكور', /لا معرّف جلسة/.test(noSession), noSession);
    check('«لا مشروع مسجّل» سبب مذكور', /لا مشروع مبنيّ مسجّل/.test(noProject), noProject);
    check('«لا dist» سبب مذكور، مع المسار', /dist\/index\.html/.test(noDist) && noDist.includes(emptyDir), noDist);
    check('ولا واحد منها يقول no_url وحدها', [noSession, noProject, noDist].every(m => m.length > 20));

    const failed: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('browser_ui_audit', {}, { sessionId: `ghost-${Date.now()}`, userId: 'u1' }));
    check('والأداة نفسها ترجع السبب لا الكلمة', /لا مشروع مبنيّ مسجّل/.test(String(failed?.error || '')), String(failed?.error || ''));

    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch { /* best effort */ }
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
