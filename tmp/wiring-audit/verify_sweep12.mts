// MUSE wiring-audit checkpoint 12: verification-compat sweep (LEVEL 5) on the
// two storied trunks (files 10 + browser_ui 33).
// Part 0 (static, no IO): isVerificationTool partition over all 43 storied
//   names + verificationResultFromToolResult over a source-grounded shape table.
// Part 1 (LEVEL-5 live): REAL PhaseExecutorTool.execute + REAL ToolService +
//   REAL workspaceService scoped to a probe-owned fixture dir via
//   EXTERNAL_PROJECTS_DIR + setActiveRoot (checkpoints/roots contained).
//   V1 files positive / V2 files negative / V3 checker rejection /
//   V4 browser checker task-level (loopback, needs BROWSER_EXECUTABLE_PATH) /
//   V5 non-checker task ledger bypass / V6 ledger reuse across runs.
// Run from api/ with: JOE_TEST_MODE=true OFFLINE_MODE=true
//   JWT_SECRET=dummy-test-only-not-a-secret TEMP/TMP=<writable fx dir>
//   EXTERNAL_PROJECTS_DIR=<writable fx dir> (+ browser env for V4 only).
// Read-before-call: verification-ledger.ts (all), PhaseExecutorTool.ts
// task-level selection (:1557-1650), phase gate (:2302-2449), auto-build
// guard (:2481-2494, never fires here: no package.json written), execute
// return (:2590-2629), ToolService result wrap (:878-879, :940-963).
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx-verify12');
const WSROOT = path.join(FX, 'ws');
const EXTROOT = path.join(FX, 'ext');
const imp = (p: string) => import(pathToFileURL(p).href);

const WSID = 'audit-verify12';
const SID = 'audit-verify12';
const UID = 'audit-user';
const out: Record<string, any> = { generated: new Date().toISOString(), static: {}, live: {} };

const FILES = ['archive_files', 'delete_file', 'file_edit', 'file_edit_advanced',
  'inspect_directory', 'ls', 'project_edit', 'read_file', 'search_files', 'write_file'];
const BROWSER = ['browser_a11y_deep', 'browser_action', 'browser_autofix',
  'browser_check_links', 'browser_click', 'browser_compare', 'browser_consent',
  'browser_console_scan', 'browser_contrast_audit', 'browser_design_tokens',
  'browser_extract_data', 'browser_extract_meta', 'browser_fill_form',
  'browser_find_text', 'browser_fullpage_shot', 'browser_launch',
  'browser_page_fix', 'browser_performance', 'browser_readability',
  'browser_responsive_check', 'browser_run', 'browser_save_pdf', 'browser_search',
  'browser_seo_audit', 'browser_smart_agent', 'browser_summarize',
  'browser_translate', 'browser_ui_audit', 'browser_ui_fix', 'browser_vision',
  'screenshot', 'user_browser', 'visual_compare'];

function envFlag(name: string): string { return String(process.env[name] ?? '').trim(); }
function assertEphemeral(tag: string) {
  const bad: string[] = [];
  if (envFlag('BROWSER_HEADLESS') !== 'true') bad.push('BROWSER_HEADLESS!=true');
  for (const k of ['USE_USER_BROWSER_PROFILE', 'USE_SYSTEM_CHROME', 'BROWSER_PERSISTENT_PROFILE']) {
    const v = envFlag(k);
    if (v !== '' && v !== '0' && v.toLowerCase() !== 'false') bad.push(`${k}=${v}`);
  }
  if (envFlag('AUTO_APPROVE_ALL') === '1') bad.push('AUTO_APPROVE_ALL=1');
  if (envFlag('AUTO_APPROVE_SAFE') === '1') bad.push('AUTO_APPROVE_SAFE=1');
  if (envFlag('ENABLE_AUTH_BYPASS') === 'true') bad.push('ENABLE_AUTH_BYPASS=true');
  if (bad.length) { console.error(`VERIFY12_ABORT ${tag}: ${bad.join('; ')}`); process.exit(1); }
}

async function main() {
  fs.mkdirSync(WSROOT, { recursive: true });
  fs.mkdirSync(EXTROOT, { recursive: true });
  if (path.resolve(envFlag('EXTERNAL_PROJECTS_DIR')) !== path.resolve(EXTROOT)) {
    console.error('VERIFY12_ABORT EXTERNAL_PROJECTS_DIR must point at the probe fx dir');
    process.exit(1);
  }

  const ledger: any = await imp(path.join(SRC, 'core', 'quality', 'verification-ledger.ts'));
  const { isVerificationTool, verificationResultFromToolResult } = ledger;

  // ---- Part 0a: checker-allowlist partition over all 43 storied names.
  const part: Record<string, any> = {};
  for (const n of [...FILES, ...BROWSER]) {
    part[n] = {
      taskLevel: isVerificationTool(n, {}, false, false, false),
      phaseGateExistenceOptIn: n === 'read_file'
        ? isVerificationTool(n, { path: 'proof.txt' }, false, true, false) : undefined,
    };
  }
  out.static.partition = part;
  out.static.allowlisted = Object.keys(part).filter(k => (part[k] as any).taskLevel);

  // ---- Part 0b: verdict mapping over source-grounded shapes.
  // Each shape mirrors a real tool return documented in checkpoints 8/10/11
  // or read from the tool execute() body cited. No storied tool emits
  // output.status / output.verificationFailed / output.cancelled /
  // output.timedOut (grep-verified); those rows are negative controls.
  const shapes: Array<{ id: string; tool: string; shape: any; expect: string; ground: string }> = [
    { id: 'files/write-ok', tool: 'write_file', shape: { ok: true, output: { success: true } }, expect: 'passed', ground: 'SystemTools write_file success return' },
    { id: 'files/read-hit', tool: 'read_file', shape: { ok: true, output: { content: 'v12', totalLines: 1 } }, expect: 'passed', ground: 'TaskInteractionTools read_file hit' },
    { id: 'files/read-missing', tool: 'read_file', shape: { ok: false, error: 'File not found' }, expect: 'failed', ground: 'TaskInteractionTools.ts:185' },
    { id: 'files/read-dir-empty', tool: 'read_file', shape: { ok: true, output: { autoList: [] } }, expect: 'passed', ground: '008 absence-as-success #5: {} -> ok:true EMPTY dir list' },
    { id: 'files/archive-zip-nozip', tool: 'archive_files', shape: { ok: false, error: 'Archive operation failed: ENOENT: no such file or directory, stat b.zip' }, expect: 'failed', ground: '008 P2-009: wrong cause text, right direction' },
    { id: 'files/depaudit-enolock', tool: 'dependency_audit', shape: { ok: false, error: 'Audit found security vulnerabilities.', output: { report: 'npm error code ENOLOCK' } }, expect: 'failed', ground: '008 P2-010: setup failure labeled vulnerabilities' },
    { id: 'files/edit-no-match', tool: 'file_edit', shape: { ok: false, error: 'find text not found' }, expect: 'failed', ground: 'SystemTools file_edit no-match return' },
    { id: 'browser/console-ok', tool: 'browser_console_scan', shape: { ok: true, output: { errorCount: 3 } }, expect: 'passed', ground: '011/F61: defects found, scan ran -> passed means executed' },
    { id: 'browser/uiaudit-empty', tool: 'browser_ui_audit', shape: { ok: false, error: 'no_url: no session' }, expect: 'failed', ground: '011/F61 uiaudit {} fail-closed' },
    { id: 'browser/trio-offline', tool: 'browser_summarize', shape: { ok: false, error: '⚠️ تعذّر الوصول إلى محرّك الذكاء (لم يستجب أي مزوّد).', output: { summary: 'x'.repeat(252) } }, expect: 'failed', ground: '011/F62: ok:false WITH full output; consumer drops partials' },
    { id: 'browser/search-empty-answer', tool: 'browser_search', shape: { ok: true, output: { results: [{}, {}], answer: '' } }, expect: 'passed', ground: '011/F61: answer-blind, results are the deliverable' },
    { id: 'browser/run-extract-swallow', tool: 'browser_run', shape: { ok: true, output: { sessionId: 's', pageUrl: 'u', title: 't', summary: 'done' } }, expect: 'passed', ground: '010 MISMATCH #8: action results discarded yet passed' },
    { id: 'browser/click-notarget', tool: 'browser_click', shape: { ok: false, error: 'no_target' }, expect: 'failed', ground: '011/F61 click no-text' },
    { id: 'browser/run-injected-forbidden', tool: 'browser_run', shape: { ok: false, error: 'browser session belongs to another user' }, expect: 'failed', ground: '010/F54 P2-008: wrong verdict text, safe direction' },
    { id: 'ctl/cancel-text', tool: 'shell_execute', shape: { ok: false, error: 'run_cancelled_by_owner' }, expect: 'cancelled', ground: 'control: classifier branch' },
    { id: 'ctl/timeout-text', tool: 'shell_execute', shape: { ok: false, error: 'Request timed out.' }, expect: 'timed_out', ground: 'control: classifier branch' },
    { id: 'ctl/arabic-timeout-prose', tool: 'central_answer', shape: { ok: false, error: 'طلب التوليد تجاوز المهلة' }, expect: 'failed', ground: 'classifier is English-only; Arabic timeout -> failed not timed_out' },
    { id: 'ctl/ok-false-no-error', tool: 'repo_diff_summary', shape: { ok: false, output: { stderr: 'real cause' } }, expect: 'failed', ground: 'P2-005: ToolService guarantees raw.error; control maps failed via stderr' },
    { id: 'ctl/odd-status', tool: 'probe-only', shape: { ok: true, output: { status: 'done' } }, expect: 'incomplete', ground: 'control: branch exists; no storied tool emits it' },
    { id: 'ctl/ok-status', tool: 'probe-only', shape: { ok: true, output: { status: 'completed' } }, expect: 'passed', ground: 'control: accepted vocabulary' },
    { id: 'ctl/verificationFailed-flag', tool: 'probe-only', shape: { ok: true, output: { verificationFailed: true } }, expect: 'incomplete', ground: 'control: flag with no error text maps to incomplete, not failed; no storied tool emits it' },
  ];
  out.static.verdicts = shapes.map(s => {
    let got: string; try { got = verificationResultFromToolResult(s.shape); }
    catch (e: any) { got = `threw:${String(e?.message || e).slice(0, 60)}`; }
    return { id: s.id, tool: s.tool, got, expect: s.expect, match: got === s.expect, ground: s.ground };
  });
  out.static.verdictMismatches = (out.static.verdicts as any[]).filter(v => !v.match).map(v => v.id);

  // ---- Part 1: LEVEL-5 live via real PhaseExecutor + ToolService.
  const { workspaceService } = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const setOk = await workspaceService.setActiveRoot(WSROOT, WSID);
  const activeRoot = String(workspaceService.getActiveRoot(WSID) || '');
  out.live.workspace = { setOk, activeRoot, contained: path.resolve(activeRoot) === path.resolve(WSROOT) };
  if (!out.live.workspace.contained) { console.error('VERIFY12_ABORT workspace not contained'); process.exit(1); }

  // Enter via the registry: importing PhaseExecutorTool.ts directly hits the
  // PhaseExecutorTool<->registry circular import (TDZ). Registry order loads.
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`VERIFY12_ABORT registered=${tools.length}`); process.exit(1); }
  // Canonical dispatch: the executor MUST run inside a firewall context —
  // a direct ex.execute() call gets every nested tool firewall-blocked
  // ("Execution bypass detected", fail-closed; observed in run 1). The real
  // pipeline dispatches phase_executor through ToolService, so the probe does
  // exactly that. unwrap: ToolService returns {ok, output: <phase result>}.
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const dispatchExecute = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const CTX = (runId: string) => ({ runId, sessionId: SID, workspaceId: WSID, userId: UID, traceId: `trace-${runId}` });
  async function runPhase(id: string, phase: any, projectContext: any, runId: string) {
    const ctx = CTX(runId);
    const r: any = await fw.executionFirewall.runInContext(
      ctx.traceId,
      () => dispatchExecute('phase_executor', { phase, projectContext }, ctx),
      { userId: UID, sessionId: SID, runId });
    return { ok: r?.ok ?? null, error: r?.error ?? null, ...(r?.output || {}), __logs: r?.logs || [] };
  }
  const receiptOf = (r: any, checkId: string) =>
    (r?.verificationLedger?.receipts || []).find((x: any) => x.checkId === checkId) || null;
  const brief = (rc: any) => rc ? {
    checkId: rc.checkId, result: rc.result, tool: rc.tool,
    evidenceLocation: rc.evidenceLocation || '', runtimeTarget: rc.runtimeTarget || '',
    hasRevision: Boolean(rc.runtimeRevision),
    fingerprintHead: String(rc.fingerprint || '').slice(0, 16),
    scopeRoot: String(rc.scopeRoot || '').slice(-60),
    decisionReason: String(rc.decisionReason || '').slice(0, 160),
  } : null;
  const decisionsBrief = (r: any) => (r?.verificationLedger?.decisions || []).slice(-3).map((d: any) => ({
    checkId: d.checkId, action: d.action, reason: String(d.reason || '').slice(0, 160),
  }));

  // V1: files positive — write then phase-gate existence observation.
  const v1 = await runPhase('v1', {
    phaseNumber: 1, name: 'v12 files positive',
    tasks: [{ task: 'write probe file', tool: 'write_file', args: { path: 'proof.txt', content: 'v12-proof' } }],
    verificationTask: { task: 'verify probe file exists', tool: 'read_file', args: { path: 'proof.txt' }, verificationId: 'v12:existence:proof.txt', verificationMode: 'affected' },
  }, {}, 'audit-v12-run1');
  out.live.v1 = {
    ok: v1?.ok ?? null, status: v1?.status ?? null,
    results: (v1?.results || []).map((r: any) => ({ tool: r.tool, ok: r.ok, execution: r.execution || null })),
    phaseVerificationCheck: v1?.phaseVerificationCheck || null,
    receipt: brief(receiptOf(v1, 'v12:existence:proof.txt')),
    metrics: v1?.verificationMetrics || null,
    decisions: decisionsBrief(v1),
    onDisk: fs.existsSync(path.join(WSROOT, 'proof.txt')),
  };

  // V2: files negative — gate observes a missing path (fail-closed proof).
  const v2 = await runPhase('v2', {
    phaseNumber: 1, name: 'v12 files negative',
    tasks: [{ task: 'write other file', tool: 'write_file', args: { path: 'other.txt', content: 'v12-other' } }],
    verificationTask: { task: 'verify missing file', tool: 'read_file', args: { path: 'absent.txt' }, verificationId: 'v12:existence:absent.txt', verificationMode: 'affected' },
  }, {}, 'audit-v12-run2');
  out.live.v2 = {
    ok: v2?.ok ?? null, status: v2?.status ?? null,
    verificationFailed: v2?.verificationFailed === true,
    phaseVerificationCheck: v2?.phaseVerificationCheck || null,
    receipt: brief(receiptOf(v2, 'v12:existence:absent.txt')),
    decisions: decisionsBrief(v2),
  };

  // V3: non-checker as gate — honest pre-execution rejection, no browser.
  const v3 = await runPhase('v3', {
    phaseNumber: 1, name: 'v12 checker rejection',
    tasks: [{ task: 'write third file', tool: 'write_file', args: { path: 'third.txt', content: 'v12-third' } }],
    verificationTask: { task: 'click verifies', tool: 'browser_click', args: { url: 'http://127.0.0.1:9/', text: 'x' }, verificationId: 'v12:badgate:click', verificationMode: 'affected' },
  }, {}, 'audit-v12-run3');
  const v3logs = JSON.stringify((v3 as any)?.__logs || []);
  let v3sessions: any = 'manager-unavailable';
  try {
    const manager: any = await imp(path.join(SRC, 'modules', 'browser', 'manager.ts'));
    v3sessions = typeof manager.liveBrowserSessionCount === 'function' ? manager.liveBrowserSessionCount() : 'no-counter';
  } catch { /* keep marker */ }
  out.live.v3 = {
    ok: v3?.ok ?? null, status: v3?.status ?? null,
    unavailableInLogs: v3logs.includes('verification_unavailable'),
    unsupportedInLogs: v3logs.includes('unsupported verification tool contract'),
    results: (v3?.results || []).map((r: any) => ({ tool: r.tool, ok: r.ok, execution: r.execution || null, error: String(r.error || '').slice(0, 80) || null })),
    liveSessionsAfter: v3sessions,
  };

  // V5: ordinary non-checker task — no ledger receipt (consumption boundary).
  fs.writeFileSync(path.join(WSROOT, 'editme.txt'), 'hello v12');
  const v5 = await runPhase('v5', {
    phaseNumber: 1, name: 'v12 ordinary task',
    tasks: [{ task: 'edit file', tool: 'file_edit', args: { filename: 'editme.txt', find: 'hello', replace: 'bye' } }],
  }, {}, 'audit-v12-run5');
  out.live.v5 = {
    ok: v5?.ok ?? null, status: v5?.status ?? null,
    receipts: (v5?.verificationLedger?.receipts || []).length,
    decisions: (v5?.verificationLedger?.decisions || []).length,
    edited: fs.readFileSync(path.join(WSROOT, 'editme.txt'), 'utf8'),
  };

  // V6: reuse — same gate checkId + carried ledger + unchanged files.
  const v6 = await runPhase('v6', {
    phaseNumber: 1, name: 'v12 files positive',
    tasks: [{ task: 'write probe file', tool: 'write_file', args: { path: 'proof.txt', content: 'v12-proof' } }],
    verificationTask: { task: 'verify probe file exists', tool: 'read_file', args: { path: 'proof.txt' }, verificationId: 'v12:existence:proof.txt', verificationMode: 'affected' },
  }, { verificationLedger: (v1 as any)?.verificationLedger }, 'audit-v12-run6');
  const v6logs = JSON.stringify((v6 as any)?.__logs || []);
  out.live.v6 = {
    ok: v6?.ok ?? null, status: v6?.status ?? null,
    reusedInLogs: v6logs.includes('verification reused'),
    receipt: brief(receiptOf(v6, 'v12:existence:proof.txt')),
    metrics: v6?.verificationMetrics || null,
    decisions: decisionsBrief(v6),
  };

  // V4: browser checker at task level (loopback fixture; browser env required).
  if (!envFlag('BROWSER_EXECUTABLE_PATH')) {
    out.live.v4 = { skipped: 'BROWSER_EXECUTABLE_PATH unset' };
  } else {
    assertEphemeral('v4');
    const ART = envFlag('ARTIFACT_DIR');
    const server = http.createServer((req, res) => {
      if (req.url === '/img-missing.png') { res.writeHead(404); res.end(); return; }
      if (req.url === '/img-ok.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>V12Fx</title></head><body><main><h1>V12Fx</h1><img src="/img-missing.png" alt="Missing"></main><script>console.error('SeedConsoleErrorV12');</script></body></html>`);
    });
    await new Promise<void>(res => server.listen(0, '127.0.0.1', () => res()));
    const port = (server.address() as any).port;
    const pageUrl = `http://127.0.0.1:${port}/`;
    try {
      const v4 = await runPhase('v4', {
        phaseNumber: 1, name: 'v12 browser checker',
        tasks: [{ task: 'scan console', tool: 'browser_console_scan', args: { url: pageUrl }, verificationId: 'v12:console:fx' }],
      }, {}, 'audit-v12-run4');
      const rc = receiptOf(v4, 'v12:console:fx');
      out.live.v4 = {
        ok: v4?.ok ?? null, status: v4?.status ?? null,
        results: (v4?.results || []).map((r: any) => ({ tool: r.tool, ok: r.ok, execution: r.execution || null })),
        receipt: brief(rc),
        decisions: decisionsBrief(v4),
      };
    } finally {
      try {
        const manager: any = await imp(path.join(SRC, 'modules', 'browser', 'manager.ts'));
        try { await manager.stopStreaming(`browser:${SID}`); } catch { /* optional */ }
        try { await manager.stopSession(`browser:${SID}`); } catch { /* optional */ }
        out.live.v4sessionClosed = true;
      } catch { out.live.v4sessionClosed = false; }
      await new Promise<void>(res => server.close(() => res()));
      out.live.v4serverClosed = true;
      if (ART) { // remove probe-created artifacts only (prefix scan, bounded)
        try {
          for (const f of fs.readdirSync(ART)) {
            if (/^browser-\d+\.(jpg|png)$/.test(f)) { try { fs.rmSync(path.join(ART, f)); } catch { /* keep */ } }
          }
        } catch { /* keep */ }
      }
    }
  }

  // Containment audit: checkpoints + roots files stayed inside FX.
  const cpDir = path.join(WSROOT, '.engineering-checkpoints');
  out.live.containment = {
    checkpointsInWs: fs.existsSync(cpDir) ? fs.readdirSync(cpDir).length : 0,
    rootsFileInFx: fs.existsSync(path.join(EXTROOT, '.joe-workspace-roots.json')),
    wsFiles: fs.existsSync(WSROOT) ? fs.readdirSync(WSROOT).filter(f => f !== '.engineering-checkpoints') : [],
  };

  fs.writeFileSync(path.join(HERE, 'verify_sweep12.json'), JSON.stringify(out, null, 2));
  const bad = (out.static.verdicts as any[]).filter(v => !v.match);
  console.log(`VERIFY12_DONE static_mismatch=${bad.length} v1=${out.live.v1?.status} v2=${out.live.v2?.status} v3unavail=${out.live.v3?.unavailableInLogs} v5receipts=${out.live.v5?.receipts} v6reused=${out.live.v6?.reusedInLogs} v4=${out.live.v4?.skipped || out.live.v4?.status}`);
  if (bad.length) { console.log(`VERIFY12_STATIC_MISMATCH ${bad.map(v => v.id).join(',')}`); process.exitCode = 2; }
}

main().catch(e => { console.error(`VERIFY12_FATAL ${String(e?.stack || e).slice(0, 2000)}`); process.exit(1); });
