// MUSE wiring-audit checkpoint 28: LEVEL-5 live-gate batch for the 5 deferred
// task-level checkers (quality_run, auto_tester, dependency_audit,
// secrets_scan_repo, code_reviewer) + static partition/verdict completion.
// Checkpoint 12 covered the 7 browser checkers + read_file gate; this closes
// the remaining registered allowlist (visual_qa is allowlisted-but-orphaned:
// partitioned statically, NEVER executed).
// Part 0 (static, no IO): isVerificationTool partition over the 5 + controls.
// Part 0b: verificationResultFromToolResult over source-grounded shapes from
//   trunk_testing/trunk_security/trunk_code live evidence (2x each).
// Part 1 (LEVEL-5 live): REAL PhaseExecutorTool.execute via ToolService +
//   REAL workspaceService scoped to a probe-owned fixture dir via
//   EXTERNAL_PROJECTS_DIR + setActiveRoot. 10 gate legs + 1 reuse leg.
//   All fixtures created inside WSROOT; npm legs use trivial node -e scripts
//   (zero network by design); dep_audit uses a lockfile-less fixture that
//   fails fast without registry access (trunk_security-proven).
// Run from api/ with: JOE_TEST_MODE=true OFFLINE_MODE=true
//   JWT_SECRET=dummy-test-only-not-a-secret TEMP/TMP=<writable fx dir>
//   EXTERNAL_PROJECTS_DIR=<writable fx dir>
// Read-before-call: verification-ledger.ts isVerificationTool (:733-739),
// verificationResultFromToolResult; PhaseExecutorTool task-level selection,
// phase gate; trunk_testing/trunk_security/trunk_code leg evidence.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx-verify28');
const WSROOT = path.join(FX, 'ws');
const EXTROOT = path.join(FX, 'ext');
const imp = (p: string) => import(pathToFileURL(p).href);

const WSID = 'audit-verify28';
const SID = 'audit-verify28';
const UID = 'audit-user';
const out: Record<string, any> = { generated: new Date().toISOString(), static: {}, live: {} };

const FIVE = ['quality_run', 'auto_tester', 'dependency_audit', 'secrets_scan_repo', 'code_reviewer'];

function envFlag(name: string): string { return String(process.env[name] ?? '').trim(); }

async function main() {
  fs.mkdirSync(WSROOT, { recursive: true });
  fs.mkdirSync(EXTROOT, { recursive: true });
  if (path.resolve(envFlag('EXTERNAL_PROJECTS_DIR')) !== path.resolve(EXTROOT)) {
    console.error('VERIFY28_ABORT EXTERNAL_PROJECTS_DIR must point at the probe fx dir');
    process.exit(1);
  }

  const ledger: any = await imp(path.join(SRC, 'core', 'quality', 'verification-ledger.ts'));
  const { isVerificationTool, verificationResultFromToolResult } = ledger;

  // ---- Part 0a: partition over the 5 + orphan/control names.
  const part: Record<string, any> = {};
  for (const n of [...FIVE, 'visual_qa', 'read_file', 'write_file']) {
    part[n] = { taskLevel: isVerificationTool(n, {}, false, false, false) };
  }
  out.static.partition = part;
  out.static.fiveAllowlisted = FIVE.filter(n => (part[n] as any).taskLevel);

  // ---- Part 0b: verdict mapping over trunk-grounded shapes.
  const shapes: Array<{ id: string; tool: string; shape: any; expect: string; ground: string }> = [
    { id: 'quality/completed', tool: 'quality_run', shape: { ok: true, output: { status: 'completed', results: [{ task: 'test', ok: true }] } }, expect: 'passed', ground: 'trunk_testing quality.test.pass 2x' },
    { id: 'quality/failed', tool: 'quality_run', shape: { ok: false, error: 'Quality checks failed: test: command failed', output: { status: 'failed', results: [] } }, expect: 'failed', ground: 'trunk_testing quality.test.fail 2x' },
    { id: 'quality/all-skipped', tool: 'quality_run', shape: { ok: false, error: 'No requested quality checks were available to execute (test)', output: { status: 'incomplete', results: [{ task: 'test', ok: true, skipped: true }] } }, expect: 'failed', ground: 'trunk_testing quality.test.all-skipped 2x (F75 skip-blind)' },
    { id: 'auto/pass', tool: 'auto_tester', shape: { ok: true, output: { passed: true, errors: [], summary: 's' } }, expect: 'passed', ground: 'trunk_testing auto.syntax.valid 2x' },
    { id: 'auto/syntax-fail', tool: 'auto_tester', shape: { ok: false, error: 'Invalid JSON in broken.json', output: { passed: false, errors: [{}], summary: 's' } }, expect: 'failed', ground: 'trunk_testing auto.syntax.broken-json 2x' },
    { id: 'dep/enolock', tool: 'dependency_audit', shape: { ok: false, error: 'Audit found security vulnerabilities.', output: { report: 'npm error code ENOLOCK' } }, expect: 'failed', ground: 'trunk_security audit.enolock 2x (P2-010 mislabel, fail-closed)' },
    { id: 'secrets/seeded', tool: 'secrets_scan_repo', shape: { ok: false, error: 'Found 4 potential secrets in codebase.', output: { findings: [{}, {}, {}, {}], scannedFiles: 2 } }, expect: 'failed', ground: 'trunk_security secrets.seeded 2x' },
    { id: 'secrets/clean', tool: 'secrets_scan_repo', shape: { ok: true, output: { findings: [], scannedFiles: 0 } }, expect: 'passed', ground: 'trunk_testing-equivalent clean shape (F85 missing-as-clean class)' },
    { id: 'review/quick-ok', tool: 'code_reviewer', shape: { ok: true, output: { overallScore: 57, filesRequested: 1, filesReviewed: 1 } }, expect: 'passed', ground: 'trunk_code review.quick-seeded 2x' },
    { id: 'review/missing', tool: 'code_reviewer', shape: { ok: false, error: 'code_reviewer could not review 1 requested file(s): nope.js', output: { overallScore: 0, filesRequested: 1, filesReviewed: 0 } }, expect: 'failed', ground: 'trunk_code review.missing 2x' },
    { id: 'review/gate-fail', tool: 'code_reviewer', shape: { ok: false, error: 'code_reviewer quality gate failed: overall score 57/100 is below the required 90/100', output: { overallScore: 57 } }, expect: 'failed', ground: 'trunk_code review.gate-fail 2x' },
    { id: 'ctl/orphan-shape', tool: 'visual_qa', shape: { ok: true, output: { verdict: 'pass' } }, expect: 'passed', ground: 'control: mapping is shape-only; orphan status is a registry fact, not a verdict fact' },
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
  if (!out.live.workspace.contained) { console.error('VERIFY28_ABORT workspace not contained'); process.exit(1); }

  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`VERIFY28_ABORT registered=${tools.length}`); process.exit(1); }
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const dispatchExecute = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const CTX = (runId: string) => ({ runId, sessionId: SID, workspaceId: WSID, userId: UID, traceId: `trace-${runId}` });
  async function runPhase(phase: any, projectContext: any, runId: string) {
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
  const legBrief = (r: any, checkId: string) => ({
    ok: r?.ok ?? null, status: r?.status ?? null,
    errorPreview: r?.error ? String(r.error).slice(0, 200) : null,
    results: (r?.results || []).map((x: any) => ({ tool: x.tool, ok: x.ok, execution: x.execution || null })),
    phaseVerificationCheck: r?.phaseVerificationCheck || null,
    receipt: brief(receiptOf(r, checkId)),
    metrics: r?.verificationMetrics || null,
    decisions: decisionsBrief(r),
  });

  // Fixtures (all inside WSROOT; created by the probe).
  const FXQ = path.join(WSROOT, 'q-pass');
  const FXQ2 = path.join(WSROOT, 'q-fail');
  const FXNOLOCK = path.join(WSROOT, 'dep-nolock');
  const FXSEC = path.join(WSROOT, 'sec-seeded');
  const FXEMPTY = path.join(WSROOT, 'sec-empty');
  for (const d of [FXQ, FXQ2, FXNOLOCK, FXSEC, FXEMPTY]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(FXQ, 'package.json'), JSON.stringify({ name: 'v28-qpass', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' } }));
  fs.writeFileSync(path.join(FXQ2, 'package.json'), JSON.stringify({ name: 'v28-qfail', version: '1.0.0', scripts: { test: 'node -e "process.exit(1)"' } }));
  fs.writeFileSync(path.join(FXQ, 'valid.js'), '// v28\nmodule.exports.add = (a, b) => a + b;\n');
  fs.writeFileSync(path.join(FXQ, 'broken.js'), 'module.exports = {{{ v28\n');
  // Trunk-exact seed: 1 critical (hardcoded key) + 1 warning (eval) + 1 info
  // (console.log), balanced brackets -> deterministic quick score 57, so the
  // minimumScore:90 gate leg fails honestly (trunk_code-proven 2x).
  fs.writeFileSync(path.join(FXQ, 'seed.js'), '// v28 synthetic reviewer fixture\nconst apiKey = "[REDACTED]";\nfunction compute(x) {\n  return eval(x);\n}\nconsole.log(\'debug\');\n');
  fs.writeFileSync(path.join(FXNOLOCK, 'package.json'), JSON.stringify({ name: 'v28-nolock', version: '1.0.0' }));
  // Trunk-exact secrets fixture: 4 findings offline (trunk_security-proven
  // 2x). All values are synthetic non-secrets; zero network by design.
  fs.writeFileSync(path.join(FXSEC, 'secrets.js'), '// v28 synthetic secrets fixture\nconst apiKey = "[REDACTED]";\nconst password = "synthetic-test-password-001";\n');
  fs.writeFileSync(path.join(FXSEC, 'clean.txt'), 'nothing here, just wiring token v28\n');
  fs.writeFileSync(path.join(FXSEC, '.env'), 'API_KEY="synthetic-env-key-0123456789"\n');
  const seedAbs = path.join(FXQ, 'seed.js');

  const seed = (tag: string) => [{ task: `write marker ${tag}`, tool: 'write_file', args: { path: `m-${tag}.txt`, content: `v28-${tag}` } }];

  const rawQPass: any = await runPhase({
    phaseNumber: 1, name: 'v28 quality pass', tasks: seed('qpass'),
    verificationTask: { task: 'run quality gate', tool: 'quality_run', args: { path: FXQ, tasks: ['test'] }, verificationId: 'v28:quality:pass', verificationMode: 'affected' },
  }, {}, 'audit-v28-qpass');
  out.live['q-pass'] = legBrief(rawQPass, 'v28:quality:pass');

  out.live['q-fail'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 quality fail', tasks: seed('qfail'),
    verificationTask: { task: 'run quality gate', tool: 'quality_run', args: { path: FXQ2, tasks: ['test'] }, verificationId: 'v28:quality:fail', verificationMode: 'affected' },
  }, {}, 'audit-v28-qfail'), 'v28:quality:fail');

  out.live['a-pass'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 auto pass', tasks: seed('apass'),
    verificationTask: { task: 'syntax check', tool: 'auto_tester', args: { testType: 'syntax', projectPath: FXQ, files: [path.join(FXQ, 'valid.js')] }, verificationId: 'v28:auto:pass', verificationMode: 'affected' },
  }, {}, 'audit-v28-apass'), 'v28:auto:pass');

  out.live['a-fail'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 auto fail', tasks: seed('afail'),
    verificationTask: { task: 'syntax check', tool: 'auto_tester', args: { testType: 'syntax', projectPath: FXQ, files: [path.join(FXQ, 'broken.js')] }, verificationId: 'v28:auto:fail', verificationMode: 'affected' },
  }, {}, 'audit-v28-afail'), 'v28:auto:fail');

  out.live['d-nolock'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 dep nolock', tasks: seed('dnolock'),
    verificationTask: { task: 'audit deps', tool: 'dependency_audit', args: { path: FXNOLOCK }, verificationId: 'v28:dep:nolock', verificationMode: 'affected' },
  }, {}, 'audit-v28-dnolock'), 'v28:dep:nolock');

  out.live['s-seeded'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 secrets seeded', tasks: seed('sseeded'),
    verificationTask: { task: 'scan secrets', tool: 'secrets_scan_repo', args: { path: FXSEC }, verificationId: 'v28:secrets:seeded', verificationMode: 'affected' },
  }, {}, 'audit-v28-sseeded'), 'v28:secrets:seeded');

  out.live['s-clean'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 secrets clean', tasks: seed('sclean'),
    verificationTask: { task: 'scan secrets', tool: 'secrets_scan_repo', args: { path: FXEMPTY }, verificationId: 'v28:secrets:clean', verificationMode: 'affected' },
  }, {}, 'audit-v28-sclean'), 'v28:secrets:clean');

  out.live['r-quick'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 review quick', tasks: seed('rquick'),
    verificationTask: { task: 'review code', tool: 'code_reviewer', args: { files: [seedAbs], projectPath: FXQ, reviewType: 'quick' }, verificationId: 'v28:review:quick', verificationMode: 'affected' },
  }, {}, 'audit-v28-rquick'), 'v28:review:quick');

  // Threshold 90 mirrors the trunk gate-fail leg; the observed quick score is
  // captured via the r-gate errorPreview ("score NN/100") for comparison.
  out.live['r-gate'] = legBrief(await runPhase({
    phaseNumber: 1, name: 'v28 review gate', tasks: seed('rgate'),
    verificationTask: { task: 'review code', tool: 'code_reviewer', args: { files: [seedAbs], projectPath: FXQ, reviewType: 'quick', minimumScore: 90 }, verificationId: 'v28:review:gate', verificationMode: 'affected' },
  }, {}, 'audit-v28-rgate'), 'v28:review:gate');

  // Reuse leg: repeat the quality-pass gate with the carried ledger (sweep12
  // V6 pattern): does a task-level checker receipt reuse across runs?
  const qreuseRaw: any = await runPhase({
    phaseNumber: 1, name: 'v28 quality pass', tasks: seed('qreuse'),
    verificationTask: { task: 'run quality gate', tool: 'quality_run', args: { path: FXQ, tasks: ['test'] }, verificationId: 'v28:quality:pass', verificationMode: 'affected' },
  }, { verificationLedger: (rawQPass as any)?.verificationLedger }, 'audit-v28-qreuse');
  const qreuseLogs = JSON.stringify((qreuseRaw as any)?.__logs || []);
  out.live['q-reuse'] = {
    ...legBrief(qreuseRaw, 'v28:quality:pass'),
    reusedInLogs: qreuseLogs.includes('verification reused'),
  };

  // Containment audit.
  const cpDir = path.join(WSROOT, '.engineering-checkpoints');
  out.live.containment = {
    checkpointsInWs: fs.existsSync(cpDir) ? fs.readdirSync(cpDir).length : 0,
    rootsFileInFx: fs.existsSync(path.join(EXTROOT, '.joe-workspace-roots.json')),
    wsTopFiles: fs.existsSync(WSROOT) ? fs.readdirSync(WSROOT).filter(f => f !== '.engineering-checkpoints').sort() : [],
  };

  const outName = envFlag('VERIFY28_OUT') || 'verify_sweep28.json';
  fs.writeFileSync(path.join(HERE, outName), JSON.stringify(out, null, 2));
  const bad = (out.static.verdicts as any[]).filter(v => !v.match);
  const liveKeys = ['q-pass', 'q-fail', 'a-pass', 'a-fail', 'd-nolock', 's-seeded', 's-clean', 'r-quick', 'r-gate', 'q-reuse'];
  console.log(`VERIFY28_DONE static_mismatch=${bad.length} ` + liveKeys.map(k => `${k}=${(out.live[k] as any)?.status}`).join(' '));
  if (bad.length) { console.log(`VERIFY28_STATIC_MISMATCH ${bad.map(v => v.id).join(',')}`); process.exitCode = 2; }
}

main().catch(e => { console.error(`VERIFY28_FATAL ${String(e?.stack || e).slice(0, 2000)}`); process.exit(1); });
