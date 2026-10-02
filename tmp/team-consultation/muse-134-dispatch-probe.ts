/**
 * MUSE wiring audit 134 — LEDGER REUSE MATRIX + LIVE REUSE ROUND-TRIP
 * (CM3 live investigation, first live proofs).
 *
 * Scope: team JOE-WIRING-AUDIT-SUMMARY lists CM3 as "Ledger computes
 * fingerprint / Reuse early-returns on checkId match WITHOUT fingerprint
 * compare / Stale receipts reused" at verification-ledger.ts:567-581.
 * A Muse-lineage source read (this cycle, BEFORE the run) shows lines
 * 565-582 are EXACTLY the guarded reuse block: reuse requires prior
 * exists + prior.result==='passed' + selection.cacheable + fingerprint
 * EQUALITY. No checkId-only early return exists in this lineage. This
 * battery pins the REAL contract live: the full reuse decision matrix
 * (pure ledger calls, zero dispatch) plus the gate-level round-trip
 * (REAL PhaseExecutor: first run 'ran' -> second run 'reused' ->
 * drifted third run 'ran' again).
 *
 * Static facts (read-only source, BEFORE the run):
 * - selectVerification (ledger:557-611): reuse ONLY when previous
 *   passed + cacheable + fingerprints equal; drift -> 'invalidated'
 *   decision + run; non-passed prior -> 'selected' + run; else run.
 * - fingerprintVerification (ledger:440-549): untrusted containment
 *   (workspaceRoot missing/not containing scopeRoot) -> nonce'd
 *   fingerprint + cacheable:false (fail-closed, never reuse).
 *   Trusted: sha256 over checkId/tool/args/workspaceId/scopeRoot/
 *   relevantPaths/boundary/runtimeTarget(+HMAC identity)/revision/
 *   mode/toolchain + length-framed file bytes of collected scope.
 * - cacheable (ledger:533): !overflow && !incomplete && !browser-state-
 *   gap && narrowedSafe. narrowedSafe (ledger:426): final mode, or
 *   boundary-complete && (no explicit paths || all resolve to exactly
 *   one existing in-scope file). Empty relevantPaths + no boundary ->
 *   narrowedSafe TRUE (whole scope fingerprinted).
 * - recordVerification (ledger:613-642): replaces any same-checkId
 *   receipt (latest wins), appends one receipt, caps at 96.
 * - Gate (PhaseExecutorTool.ts:2379-2450): scopeRoot = args.cwd ||
 *   args.projectPath || args.path || activeRoot(workspaceId);
 *   descriptor gets checkId `${tool}:${desc}` (or explicit id),
 *   workspaceRoot = trustedWorkspaceRoot = activeRoot(workspaceId),
 *   mode 'affected' unless final. Reuse -> results entry
 *   {ok:true, execution:'reused'} + passed/reused check, NO handler
 *   execution. Ledger round-trips via projectContext.verificationLedger
 *   (line 2009 in, line 2625 out).
 * - Arg path for read_file: adaptPlannedArgs keeps unknown keys (no
 *   stripping), applyPhaseExecutionEvidence/inheritRuntimeProjectArguments
 *   are no-ops for read_file here, plannedArgsIssue has no read_file
 *   branch -> extra `cwd` key survives to scopeRoot AND is ignored by
 *   the read_file handler (resolveToolPath(path, workspaceId) only).
 * - environmentIdentity() hashes process.env: NO env mutation may occur
 *   between the live runs (all deletes happen BEFORE run 1).
 *
 * Every case stays on a SAFE surface: pure ledger calls on sbx fixture
 * dirs, echo tasks, read_file verifier executions on ONE seeded sbx
 * file, pre-exec rejections. NO network, NO model, NO browser, NO npm,
 * NO shell execution, NO spend. PhaseExecutorTool has zero run-evidence/
 * persistence writes of its own (source grep); tool executions proven
 * contained by Z0 in 110-134. Same isolated tsx method as 110-133:
 * canonical test env (setup.ts: JSON persistence, mock DB, network
 * fetch guard), bypass OFF (hermetic), full attribution, CWD = the
 * sandbox dir itself (Set-Location INSIDE the shell), all imports
 * absolute, FS contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT
 * scoped to tmp/sbx-tmp-134 (fresh). NO DATA_DIR is set: the
 * knowledge.ts import-time mkdir lands in <sbx>/data (contained; Z0
 * asserts the shape, 127-134 continuity). NO AUTO_APPROVE_* set at any
 * point. No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-134
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-134-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import {
  createVerificationLedger,
  selectVerification,
  recordVerification,
  fingerprintVerification,
} from 'D:/Joe/muse-worktree/api/src/core/quality/verification-ledger';
import { PhaseExecutorTool } from 'D:/Joe/muse-worktree/api/src/modules/tools/definitions/PhaseExecutorTool';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
}

const sha256str = (s: string): string => createHash('sha256').update(s, 'utf-8').digest('hex').toUpperCase();
const sha256file = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };
function treeHash(dir: string): string {
  const entries: string[] = [];
  const walk = (d: string): void => {
    let names: string[] = [];
    try { names = fs.readdirSync(d).sort(); } catch { return; }
    for (const n of names) {
      const full = path.join(d, n);
      const rel = path.relative(dir, full).replace(/\\/g, '/');
      let st: fs.Stats;
      try { st = fs.statSync(full); } catch { entries.push(`${rel}:UNREADABLE`); continue; }
      if (st.isDirectory()) walk(full);
      else entries.push(`${rel}:${st.size}:${sha256file(full).slice(0, 16)}`);
    }
  };
  walk(dir);
  return sha256str(entries.join('\n')).slice(0, 16);
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    DATA_DIR: process.env.DATA_DIR,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;
  process.env.npm_config_update_notifier = 'false';

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const dataDir = String(process.env.DATA_DIR || '');
  const attr = { workspaceId: 'probe-ws-134', userId: 'probe-user-134' } as any;

  await executionFirewall.runInContext('muse-134-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    const p0f = !dataDir || dataDir === sbxRoot || dataDir.startsWith(sbxRoot + path.sep);
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key+data_dir_unset_or_in_sbx',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e} dataOk=${p0f}`,
      pass: p0a && p0b && p0c && !!p0d && p0e && p0f, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regNames: string[] = (tools as any[]).map((t: any) => String(t?.name || ''));
    const regCount = regNames.length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const sorted = [...regNames].sort();
    const setHash = createHash('sha256').update(sorted.join(',')).digest('hex').toUpperCase().slice(0, 16);
    results.push({
      case: 'RG0-registered-set', expect: 'exact-set hash EQUALS 40739682C4A5CB21 (131 pin, stronger: equality)',
      actual: `n=${regCount} hash=${setHash}`,
      pass: regCount === 163 && setHash === '40739682C4A5CB21',
      detail: 'SET pin: any registration/deregistration/rename since 131 breaks this equality',
    });

    // ---- pure-ledger slice (zero dispatch; per-case isolated scope dirs) ----
    const mkScope = (tag: string, file: string, content: string): string => {
      const dir = path.join(sbxRoot, 'ledger-scope', tag);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), content, 'utf-8');
      return dir;
    };
    const desc = (checkId: string, scopeRoot: string, extra: Record<string, any> = {}): any => ({
      checkId,
      tool: 'read_file',
      args: { path: 'f134.txt' },
      workspaceId: 'probe-ws-134',
      workspaceRoot: sbxRoot,
      scopeRoot,
      mode: 'affected',
      ...extra,
    });

    // R0: identical descriptor + passed prior -> reuse with the SAME receipt.
    const scope0 = mkScope('r0', 'f134.txt', 'alpha\nr0-stable-theta\ntheta\n');
    const d0 = desc('r0-reuse-134', scope0);
    let led0: any = createVerificationLedger();
    const sel0a = selectVerification(led0, d0); led0 = sel0a.ledger;
    led0 = recordVerification(led0, sel0a.selection, 'passed', 12, Date.now());
    const firstFp0 = String(sel0a.selection.fingerprint);
    const sel0b = selectVerification(led0, desc('r0-reuse-134', scope0)); led0 = sel0b.ledger;
    results.push({
      case: 'R0-reuse-identical', expect: "first select 'run' + cacheable; second select 'reuse' with SAME fingerprint + prior receipt",
      actual: `first=${sel0a.selection.action}/${sel0a.selection.cacheable} second=${sel0b.selection.action} fpEqual=${sel0b.selection.fingerprint === firstFp0} receiptFp=${String(sel0b.selection.receipt?.fingerprint || '').slice(0, 12)} reason=${sel0b.selection.reason.slice(0, 52)}`,
      pass: sel0a.selection.action === 'run' && sel0a.selection.cacheable === true
        && sel0b.selection.action === 'reuse' && sel0b.selection.fingerprint === firstFp0
        && sel0b.selection.receipt?.fingerprint === firstFp0
        && sel0b.selection.reason === 'reused: passing receipt matches all relevant inputs',
      detail: 'REUSE pin: same checkId + passed prior + cacheable + EQUAL fingerprints reuses (no checkId-only shortcut needed or taken)',
    });

    // R1: drifted file bytes -> invalidated + run (anti-stale pin).
    const scope1 = mkScope('r1', 'f134.txt', 'alpha\nr1-before-drift\ntheta\n');
    let led1: any = createVerificationLedger();
    const sel1a = selectVerification(led1, desc('r1-drift-134', scope1)); led1 = sel1a.ledger;
    led1 = recordVerification(led1, sel1a.selection, 'passed', 12, Date.now());
    const fpBefore = String(sel1a.selection.fingerprint);
    fs.writeFileSync(path.join(scope1, 'f134.txt'), 'alpha\nr1-AFTER-drift-omega\ndelta-change\n', 'utf-8');
    const sel1b = selectVerification(led1, desc('r1-drift-134', scope1)); led1 = sel1b.ledger;
    const dec1 = (led1.decisions || []).slice(-1)[0] || {};
    results.push({
      case: 'R1-drift-invalidated', expect: "after byte drift: action 'run', fingerprint DIFFERS, decision 'invalidated'",
      actual: `action=${sel1b.selection.action} fpDiffer=${sel1b.selection.fingerprint !== fpBefore} decision=${dec1.action} reason=${sel1b.selection.reason.slice(0, 60)}`,
      pass: sel1b.selection.action === 'run' && sel1b.selection.fingerprint !== fpBefore
        && dec1.action === 'invalidated' && String(sel1b.selection.reason).startsWith('invalidated:'),
      detail: 'ANTI-STALE pin: changed bytes invalidate the prior receipt; stale proof is never reused',
    });

    // R2: failed prior is never reusable, even with identical inputs.
    const scope2 = mkScope('r2', 'f134.txt', 'alpha\nr2-failed-prior\ntheta\n');
    let led2: any = createVerificationLedger();
    const sel2a = selectVerification(led2, desc('r2-failed-134', scope2)); led2 = sel2a.ledger;
    led2 = recordVerification(led2, sel2a.selection, 'failed', 12, Date.now());
    const sel2b = selectVerification(led2, desc('r2-failed-134', scope2)); led2 = sel2b.ledger;
    results.push({
      case: 'R2-failed-never-reused', expect: "identical inputs + failed prior -> 'run', reason names never-reusable",
      actual: `action=${sel2b.selection.action} reason=${sel2b.selection.reason.slice(0, 60)}`,
      pass: sel2b.selection.action === 'run'
        && sel2b.selection.reason === 'selected: previous failed result is never reusable',
      detail: 'NO-FAIL-REUSE pin: only passed receipts qualify; failures always re-run',
    });

    // R3: fresh checkId -> run with 'no matching passing receipt'.
    const sel3 = selectVerification(led0, desc('r3-fresh-134', scope0));
    results.push({
      case: 'R3-fresh-checkId', expect: "unknown checkId -> 'run' + 'no matching passing receipt' + cacheable",
      actual: `action=${sel3.selection.action} cacheable=${sel3.selection.cacheable} reason=${sel3.selection.reason.slice(0, 44)}`,
      pass: sel3.selection.action === 'run' && sel3.selection.cacheable === true
        && sel3.selection.reason === 'selected: no matching passing receipt',
      detail: 'FRESH pin: unknown checks always run; nothing is conjured from other receipts',
    });

    // R4: untrusted containment -> cacheable false + always run (fail-closed).
    const scope4 = mkScope('r4', 'f134.txt', 'alpha\nr4-untrusted\ntheta\n');
    let led4: any = createVerificationLedger();
    const untrusted = { checkId: 'r4-untrusted-134', tool: 'read_file', args: { path: 'f134.txt' }, workspaceId: 'probe-ws-134', scopeRoot: scope4, mode: 'affected' } as any;
    const sel4a = selectVerification(led4, untrusted); led4 = sel4a.ledger;
    led4 = recordVerification(led4, sel4a.selection, 'passed', 12, Date.now());
    const sel4b = selectVerification(led4, { ...untrusted }); led4 = sel4b.ledger;
    results.push({
      case: 'R4-untrusted-never-cacheable', expect: 'no workspaceRoot -> cacheable false + both selects run + containment reason (never reuse)',
      actual: `cacheable=${sel4a.selection.cacheable} first=${sel4a.selection.action} second=${sel4b.selection.action} reason=${sel4a.selection.reason.slice(0, 64)}`,
      pass: sel4a.selection.cacheable === false && sel4a.selection.action === 'run'
        && sel4b.selection.action === 'run'
        && sel4a.selection.reason === 'selected: trusted workspace containment is unavailable, so reuse and filesystem fingerprinting are disabled',
      detail: 'FAIL-CLOSED pin: without trusted containment even a passed receipt cannot justify reuse',
    });

    // R5: recordVerification replaces same-checkId receipts (latest wins).
    const scope5 = mkScope('r5', 'f134.txt', 'alpha\nr5-latest-wins\ntheta\n');
    let led5: any = createVerificationLedger();
    const sel5a = selectVerification(led5, desc('r5-latest-134', scope5)); led5 = sel5a.ledger;
    led5 = recordVerification(led5, sel5a.selection, 'passed', 12, Date.now());
    const sel5b = selectVerification(led5, desc('r5-latest-134', scope5)); led5 = sel5b.ledger;
    led5 = recordVerification(led5, sel5b.selection, 'failed', 12, Date.now());
    const receipts5: any[] = led5.receipts || [];
    results.push({
      case: 'R5-latest-receipt-wins', expect: 'passed then failed on same checkId -> exactly 1 receipt, result failed',
      actual: `n=${receipts5.length} result=${receipts5[0]?.result} checkId=${receipts5[0]?.checkId}`,
      pass: receipts5.length === 1 && receipts5[0]?.result === 'failed' && receipts5[0]?.checkId === 'r5-latest-134',
      detail: 'LATEST-WINS pin: re-recording supersedes; no ghost passed receipt survives beside the failure',
    });

    // R6: args are fingerprinted — same checkId, different path -> invalidated.
    const scope6 = mkScope('r6', 'f134.txt', 'alpha\nr6-args-shape\ntheta\n');
    let led6: any = createVerificationLedger();
    const sel6a = selectVerification(led6, desc('r6-args-134', scope6)); led6 = sel6a.ledger;
    led6 = recordVerification(led6, sel6a.selection, 'passed', 12, Date.now());
    const sel6b = selectVerification(led6, desc('r6-args-134', scope6, { args: { path: 'other134.txt' } })); led6 = sel6b.ledger;
    results.push({
      case: 'R6-args-fingerprinted', expect: "same checkId + different args -> 'run' + invalidated (args are proof inputs)",
      actual: `action=${sel6b.selection.action} reason=${sel6b.selection.reason.slice(0, 60)}`,
      pass: sel6b.selection.action === 'run' && String(sel6b.selection.reason).startsWith('invalidated:'),
      detail: 'ARGS-BOUND pin: proof is bound to its exact arguments, not just its check name',
    });

    // R7: workspaceId is fingerprinted — same checkId/paths, other workspace -> invalidated.
    const scope7 = mkScope('r7', 'f134.txt', 'alpha\nr7-workspace-shape\ntheta\n');
    let led7: any = createVerificationLedger();
    const sel7a = selectVerification(led7, desc('r7-ws-134', scope7)); led7 = sel7a.ledger;
    led7 = recordVerification(led7, sel7a.selection, 'passed', 12, Date.now());
    const sel7b = selectVerification(led7, desc('r7-ws-134', scope7, { workspaceId: 'probe-ws-134-OTHER' })); led7 = sel7b.ledger;
    results.push({
      case: 'R7-workspace-fingerprinted', expect: "same checkId + different workspaceId -> 'run' + invalidated (no cross-workspace proof)",
      actual: `action=${sel7b.selection.action} reason=${sel7b.selection.reason.slice(0, 60)}`,
      pass: sel7b.selection.action === 'run' && String(sel7b.selection.reason).startsWith('invalidated:'),
      detail: 'WORKSPACE-BOUND pin: one workspace can never spend another workspace proof',
    });

    // ---- live slice: REAL PhaseExecutor reuse round-trip (closes the loop) ----
    const wsDir = path.join(sbxRoot, 'projects', 'probe-ws-134');
    fs.mkdirSync(wsDir, { recursive: true });
    const liveFile = path.join(wsDir, 'reuse134.txt');
    fs.writeFileSync(liveFile, 'alpha\nreuse134-uniq-sigma\ntheta\n', 'utf-8');
    const liveDesc = 'Confirm the overnight reuse134 export finishes and every total row balances';
    const liveTask = (): any => ({ tool: 'read_file', task: liveDesc, args: { path: 'reuse134.txt', cwd: wsDir } });
    const baseCtx: any = {
      projectName: 'muse-134-probe',
      workspaceId: 'probe-ws-134',
      sessionId: 'muse-134-session',
      userId: 'probe-user-134',
    };
    const runPhase = (tasks: any[], verificationTask: any, ctx: any) =>
      new PhaseExecutorTool().execute({
        phase: { phaseNumber: 1, name: 'M134 reuse probe', tasks, verificationTask },
        projectContext: ctx,
      } as any, ctx);
    const echoTask = (tag: string) => [{ task: `Echo ${tag}`, tool: 'echo', args: { text: `m134-${tag}` } }];

    const g8: any = await runPhase(echoTask('g8'), liveTask(), baseCtx);
    const g8res: any[] = g8?.output?.results || [];
    const g8v = g8res.find((r: any) => String(r?.tool || '') === 'read_file');
    const g8check: any = (g8?.output as any)?.phaseVerificationCheck;
    const g8logs = JSON.stringify(g8?.logs || []);
    const g8ledger: any = (g8?.output as any)?.verificationLedger;
    const g8receipt: any = (g8ledger?.receipts || []).find((r: any) => String(r?.checkId || '') === `read_file:${liveDesc}`);
    results.push({
      case: 'G8-first-run-live', expect: 'fresh ledger -> ok + completed + verifier {ran/passed} + passed receipt recorded',
      actual: `ok=${g8?.ok} status=${g8?.output?.status} vEntry=${g8v ? `ok=${g8v.ok} exec=${g8v.execution}` : 'MISSING'} check=${g8check ? `${g8check.tool}/${g8check.result}/${g8check.execution}` : 'MISSING'} logPass=${g8logs.includes('Verification passed')} receipt=${g8receipt ? `${g8receipt.result}/${String(g8receipt.fingerprint || '').slice(0, 8)}` : 'MISSING'}`,
      pass: g8?.ok === true && g8?.output?.status === 'completed' && g8v?.ok === true && g8v?.execution === 'ran'
        && g8logs.includes('Verification passed') === true
        && g8check?.tool === 'read_file' && g8check?.result === 'passed' && g8check?.execution === 'ran'
        && g8receipt?.result === 'passed' && !!g8receipt?.fingerprint,
      detail: 'FIRST-RUN pin LIVE: genuine gate execution records a passed, fingerprinted receipt',
    });

    const wsHashAfterG8 = treeHash(wsDir);
    const g9pre = g8?.ok === true && !!g8ledger;
    const g9: any = g9pre ? await runPhase(echoTask('g9'), liveTask(), { ...baseCtx, verificationLedger: g8ledger }) : null;
    const g9res: any[] = g9?.output?.results || [];
    const g9v = g9res.find((r: any) => String(r?.tool || '') === 'read_file');
    const g9check: any = (g9?.output as any)?.phaseVerificationCheck;
    const g9logs = JSON.stringify(g9?.logs || []);
    const g9ledger: any = (g9?.output as any)?.verificationLedger;
    const g9decisions: any[] = g9ledger?.decisions || [];
    const g9last = g9decisions.filter((d: any) => String(d?.checkId || '') === `read_file:${liveDesc}`).slice(-1)[0] || {};
    results.push({
      case: 'G9-reuse-second-run-live', expect: "same task + run-1 ledger, unchanged bytes -> ok + verifier {reused} + 'reused:' decision, ZERO handler execution",
      actual: `ok=${g9?.ok} status=${g9?.output?.status} vEntry=${g9v ? `ok=${g9v.ok} exec=${g9v.execution}` : 'MISSING'} check=${g9check ? `${g9check.result}/${g9check.execution}` : 'MISSING'} logReused=${g9logs.includes('Verification reused')} decision=${g9last.action} msg=${String(g9v?.message || '').slice(0, 52)}`,
      pass: g9pre === true && g9?.ok === true && g9?.output?.status === 'completed'
        && g9v?.ok === true && g9v?.execution === 'reused'
        && g9logs.includes('Verification reused') === true
        && g9check?.result === 'passed' && g9check?.execution === 'reused'
        && g9last.action === 'reused' && String(g9v?.message || '').startsWith('reused:'),
      detail: 'REUSE pin LIVE: identical proof inputs spend the prior receipt; the handler never executes',
    });

    const wsHashBeforeG10 = treeHash(wsDir);
    fs.writeFileSync(liveFile, 'alpha\nreuse134-DRIFTED-omega\ndelta-new-totals\n', 'utf-8');
    const g10: any = g9pre ? await runPhase(echoTask('g10'), liveTask(), { ...baseCtx, verificationLedger: (g9?.output as any)?.verificationLedger || g8ledger }) : null;
    const g10res: any[] = g10?.output?.results || [];
    const g10v = g10res.find((r: any) => String(r?.tool || '') === 'read_file');
    const g10check: any = (g10?.output as any)?.phaseVerificationCheck;
    const g10logs = JSON.stringify(g10?.logs || []);
    const g10ledger: any = (g10?.output as any)?.verificationLedger;
    const g10decisions: any[] = g10ledger?.decisions || [];
    const g10last = g10decisions.filter((d: any) => String(d?.checkId || '') === `read_file:${liveDesc}`).slice(-1)[0] || {};
    const g10receipt: any = (g10ledger?.receipts || []).find((r: any) => String(r?.checkId || '') === `read_file:${liveDesc}`);
    results.push({
      case: 'G10-drift-reruns-live', expect: "drifted bytes + prior ledger -> verifier {ran/passed} + 'invalidated' decision + NEW fingerprint receipt",
      actual: `ok=${g10?.ok} status=${g10?.output?.status} vEntry=${g10v ? `ok=${g10v.ok} exec=${g10v.execution}` : 'MISSING'} check=${g10check ? `${g10check.result}/${g10check.execution}` : 'MISSING'} decision=${g10last.action} fpNew=${!!g10receipt?.fingerprint && g10receipt.fingerprint !== g8receipt?.fingerprint}`,
      pass: g9pre === true && g10?.ok === true && g10?.output?.status === 'completed'
        && g10v?.ok === true && g10v?.execution === 'ran'
        && g10logs.includes('Verification passed') === true
        && g10check?.result === 'passed' && g10check?.execution === 'ran'
        && g10last.action === 'invalidated'
        && !!g10receipt?.fingerprint && g10receipt.fingerprint !== g8receipt?.fingerprint,
      detail: 'INVALIDATION pin LIVE: drifted bytes re-execute and re-record; the stale receipt is superseded, never spent',
    });

    results.push({
      case: 'W0-wsdir-stability', expect: 'wsDir tree byte-identical G8->G9 (reuse inputs genuinely unchanged); only reuse134.txt differs at G10',
      actual: `g8hash=${wsHashAfterG8} preG10hash=${wsHashBeforeG10} stable=${wsHashAfterG8 === wsHashBeforeG10}`,
      pass: wsHashAfterG8 === wsHashBeforeG10,
      detail: 'STABILITY pin: no side-effect writes touched the fingerprinted scope between the reuse runs',
    });

    const d1: any = await executeTool('echo', { text: 'probe134-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe134-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    // Z0: containment — sbx shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256file(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256file(zWsKb);
    const zMarkers = ['m134', 'fx134', 'probe134'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        const m = fs.readFileSync('D:/Joe/muse-worktree/api/data/memory/index.json', 'utf-8');
        return zMarkers.some((mk) => a.includes(mk) || b.includes(mk) || m.includes(mk));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveMemSha = sha256file(zLiveMem);
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 134 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127-134 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-134-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-134-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
