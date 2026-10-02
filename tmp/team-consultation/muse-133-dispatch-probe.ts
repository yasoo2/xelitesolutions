/**
 * MUSE wiring audit 133 — GATE OPT-IN MATRIX + SANITIZER->GATE HANDOFF
 * (CM2 CORRECTION, first live proofs).
 *
 * Scope: team JOE-WIRING-AUDIT-SUMMARY lists CM2 as "Sanitizer emits
 * read_file with allowExistenceObservation=true / PhaseExecutor calls
 * isVerificationTool without allowExistenceObservation / Intermediate
 * observations rejected". A Muse-lineage source grep (this cycle, BEFORE
 * the run, whole api/src) shows that literal description matches NO
 * current code: the opt-in flags exist ONLY as gate-side parameters
 * (verification-ledger.ts:733 predicate + PhaseExecutorTool.ts:2355-2357
 * call site with mode-derived allowPhaseOutputObservation). No sanitizer
 * or other producer emits an allowExistenceObservation arg anywhere.
 * And 132 G2 already proved an intermediate observation ACCEPTED live.
 * This battery pins the REAL contract live: the full gate opt-in matrix
 * (pure predicate, zero dispatch) plus the sanitizer->gate HANDOFF
 * round-trip 132 left open (sanitizer emission fed into the REAL gate).
 *
 * Static facts (read-only source, BEFORE the run):
 * - Gate entry (PhaseExecutorTool.ts:2302): verification branch runs ONLY
 *   for object-shaped verificationTask.
 * - Gate opt-in (PhaseExecutorTool.ts:2355-2357):
 *   allowPhaseOutputObservation = verificationMode !== 'final';
 *   isVerificationTool(tool, args, false, allowPhaseOutputObservation, true).
 *   Live-run checks are ALWAYS opted in at the gate; existence
 *   observations only at non-final gates.
 * - Predicate (verification-ledger.ts:733-789): 13 named checkers always
 *   true; project_run iff allowLiveRunCheck; shell_execute iff a static
 *   test/lint/build/typecheck-shaped command; read_file iff
 *   allowExistenceObservation AND isSingleOutputObservationPath(args);
 *   everything else false (untrusted names never certify).
 * - isSingleOutputObservationPath (ledger ~700-731): exactly ONE
 *   non-empty value across path/filePath/file/filename/sourceFile, no
 *   '..' segments, not all dots.
 * - Sanitizer (plan-tools.ts `if (v)`, 2958a7ec): prose + produced output
 *   rewrites to a read_file observation; emits NO opt-in flag arg.
 * - Auto-build (PhaseExecutorTool.ts:2487) requires code tasks; this
 *   battery uses echo tasks only, so no shell/npm path can trigger.
 * - PhaseExecutorTool has zero run-evidence/persistence writes of its own
 *   (source grep); tool executions proven contained by Z0 in 110-132.
 *
 * Every case stays on a SAFE surface: pure predicate calls (SC6-SC13 run
 * ZERO handler code — including the shell_execute SHAPE checks, which
 * never execute), echo tasks, read_file verifier executions on seeded
 * sbx fixtures, pre-exec rejections. NO network, NO model, NO browser,
 * NO npm, NO shell execution, NO spend. Distinct verifier descriptions
 * per G-case keep ledger selections fresh ('ran', not reuse).
 *
 * Same isolated tsx method as 110-132: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (Set-Location INSIDE the
 * shell), all imports absolute, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-133 (fresh). NO DATA_DIR is set:
 * the knowledge.ts import-time mkdir lands in <sbx>/data (contained; Z0
 * asserts the shape, 127-133 continuity). NO AUTO_APPROVE_* set at any
 * point. No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-133
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-133-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import { sanitisePlanPhases } from 'D:/Joe/muse-worktree/api/src/core/orchestrator/plan-tools';
import { isVerificationTool } from 'D:/Joe/muse-worktree/api/src/core/quality/verification-ledger';
import { PhaseExecutorTool } from 'D:/Joe/muse-worktree/api/src/modules/tools/definitions/PhaseExecutorTool';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
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
  const attr = { workspaceId: 'probe-ws-133', userId: 'probe-user-133' } as any;

  await executionFirewall.runInContext('muse-133-probe', async () => {
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

    // ---- predicate slice (pure isVerificationTool; ZERO dispatch) ----
    const pRead = { path: 'app133/entry.js' };
    const sc6 = isVerificationTool('read_file', pRead, false, true, false) === true
      && isVerificationTool('READ_FILE', pRead, false, true, false) === true;
    results.push({
      case: 'SC6-read-single-optin-true', expect: 'read_file single-path + opt-in TRUE -> true (case-insensitive name)',
      actual: `lower=${isVerificationTool('read_file', pRead, false, true, false)} upper=${isVerificationTool('READ_FILE', pRead, false, true, false)}`,
      pass: sc6, detail: 'OPT-IN pin: the intermediate gate opt-in accepts a single-output observation',
    });

    const sc7 = isVerificationTool('read_file', pRead, false, false, false) === false
      && isVerificationTool('read_file', pRead, true, false, false) === false;
    results.push({
      case: 'SC7-read-single-optin-false', expect: 'read_file + opt-in FALSE -> false even when explicitlyMarked (final parity at predicate level)',
      actual: `plain=${isVerificationTool('read_file', pRead, false, false, false)} marked=${isVerificationTool('read_file', pRead, true, false, false)}`,
      pass: sc7, detail: 'FINAL-PARITY pin: no flag combination certifies a read without the existence opt-in',
    });

    const sc8 = isVerificationTool('read_file', { path: 'a133.js', file: 'b133.js' }, false, true, false) === false;
    results.push({
      case: 'SC8-read-multi-rejected', expect: 'TWO distinct path values + opt-in -> false (exactly-one rule)',
      actual: `multi=${isVerificationTool('read_file', { path: 'a133.js', file: 'b133.js' }, false, true, false)}`,
      pass: sc8, detail: 'SINGLE-PATH pin: the opt-in never blesses multi-path reads',
    });

    const sc9 = isVerificationTool('read_file', {}, false, true, false) === false
      && isVerificationTool('read_file', { path: '   ' }, false, true, false) === false;
    results.push({
      case: 'SC9-read-empty-rejected', expect: 'empty/blank path + opt-in -> false',
      actual: `empty=${isVerificationTool('read_file', {}, false, true, false)} blank=${isVerificationTool('read_file', { path: '   ' }, false, true, false)}`,
      pass: sc9, detail: 'NONEMPTY pin: the opt-in never blesses path-less reads',
    });

    const sc10 = isVerificationTool('read_file', { path: '../evil133.js' }, false, true, false) === false
      && isVerificationTool('read_file', { filePath: 'sub/../../evil133.js' }, false, true, false) === false;
    results.push({
      case: 'SC10-read-traversal-rejected', expect: 'dot-dot paths + opt-in -> false (both path and filePath keys)',
      actual: `path=${isVerificationTool('read_file', { path: '../evil133.js' }, false, true, false)} filePath=${isVerificationTool('read_file', { filePath: 'sub/../../evil133.js' }, false, true, false)}`,
      pass: sc10, detail: 'TRAVERSAL pin: the opt-in never blesses escaping reads',
    });

    const sc11 = isVerificationTool('project_run', {}, false, false, true) === true
      && isVerificationTool('project_run', {}, false, false, false) === false;
    results.push({
      case: 'SC11-project-run-live-optin', expect: 'project_run + liveRun TRUE -> true; + liveRun FALSE -> false (predicate only, zero runs started)',
      actual: `optin=${isVerificationTool('project_run', {}, false, false, true)} nooptin=${isVerificationTool('project_run', {}, false, false, false)}`,
      pass: sc11, detail: 'LIVE-RUN pin: the gate always opts live checks in, but the predicate alone never executes',
    });

    const shTrue = isVerificationTool('shell_execute', { command: 'npm test' }, false, false, false) === true;
    const shRm = isVerificationTool('shell_execute', { command: 'rm -rf /' }, false, true, true) === false;
    const shHelp = isVerificationTool('shell_execute', { command: 'npm --help' }, false, true, true) === false;
    const shPipe = isVerificationTool('shell_execute', { command: 'npm test | tee out.txt' }, false, true, true) === false;
    results.push({
      case: 'SC12-shell-static-shapes', expect: "'npm test' -> true; 'rm -rf /'/'npm --help'/piped -> false (PURE SHAPE CHECK, zero execution)",
      actual: `npmTest=${isVerificationTool('shell_execute', { command: 'npm test' }, false, false, false)} rm=${!shRm ? 'TRUE?!' : 'false'} help=${!shHelp ? 'TRUE?!' : 'false'} pipe=${!shPipe ? 'TRUE?!' : 'false'}`,
      pass: shTrue && shRm && shHelp && shPipe, detail: 'STATIC-CHECKER pin: only expansion-free test-shaped commands certify; destructive/help/piped never',
    });

    const sc13 = isVerificationTool('unknown_tool_xyz133', { path: 'x' }, true, true, true) === false
      && isVerificationTool('echo', { text: 'hi' }, true, true, true) === false;
    results.push({
      case: 'SC13-unknown-rejected', expect: 'unknown_tool + echo -> false even with ALL flags true (untrusted names never certify)',
      actual: `unknown=${isVerificationTool('unknown_tool_xyz133', { path: 'x' }, true, true, true)} echo=${isVerificationTool('echo', { text: 'hi' }, true, true, true)}`,
      pass: sc13, detail: 'CLOSED-WORLD pin: no flag combination certifies a non-checker tool',
    });

    // ---- handoff slice: sanitizer EMISSION -> REAL gate (closes 132's gap) ----
    const prose133 = 'Confirm the overnight ledger export finishes and every total row balances';
    const sc = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Ledger export',
      tasks: [{ task: 'Write handoff', tool: 'write_file', args: { path: 'handoff133.txt', content: 'balanced' } }],
      verificationTask: prose133,
    }], 'app133', { mode: 'greenfield', candidateCheckCommands: [] });
    const emitted: any = sc.phases[0].verificationTask;
    const emittedHasFlag = emitted?.args !== undefined && 'allowExistenceObservation' in (emitted.args || {});
    const emittedPath = String(emitted?.args?.path || '');
    const wsDir = path.join(sbxRoot, 'projects', 'probe-ws-133');
    fs.mkdirSync(wsDir, { recursive: true });
    if (emitted?.tool === 'read_file' && emittedPath) {
      const target = path.join(wsDir, emittedPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'alpha\nhandoff133-uniq-theta\ntheta\n', 'utf-8');
    }
    const baseCtx: any = {
      projectName: 'muse-133-probe',
      workspaceId: 'probe-ws-133',
      sessionId: 'muse-133-session',
      userId: 'probe-user-133',
    };
    const runPhase = (tasks: any[], verificationTask: any, noVerifier: boolean, ctx: any) =>
      new PhaseExecutorTool().execute({
        phase: {
          phaseNumber: 1,
          name: 'M133 handoff probe',
          tasks,
          ...(noVerifier ? {} : { verificationTask }),
        },
        projectContext: ctx,
      } as any, ctx);
    const echoTask = (tag: string) => [{ task: `Echo ${tag}`, tool: 'echo', args: { text: `m133-${tag}` } }];

    const g6pre = emitted?.tool === 'read_file' && emittedHasFlag === false && !!emittedPath;
    const g6: any = g6pre ? await runPhase(echoTask('g6'), emitted, false, baseCtx) : null;
    const g6logs = JSON.stringify(g6?.logs || []);
    const g6res: any[] = g6?.output?.results || [];
    const g6v = g6res.find((r: any) => String(r?.tool || '') === 'read_file');
    const g6check: any = (g6?.output as any)?.phaseVerificationCheck;
    results.push({
      case: 'G6-handoff-roundtrip-live', expect: 'sanitizer emission (read_file, NO flag arg) completes at a REAL intermediate gate with verifier entry {ok, ran} + passed receipt',
      actual: `emitted=${emitted?.tool}/${emittedPath} hasFlagArg=${emittedHasFlag} ok=${g6?.ok} status=${g6?.output?.status} vEntry=${g6v ? `ok=${g6v.ok} exec=${g6v.execution}` : 'MISSING'} logPass=${g6logs.includes('Verification passed')} check=${g6check ? `${g6check.tool}/${g6check.result}/${g6check.execution}` : 'MISSING'}`,
      pass: g6pre === true && g6?.ok === true && g6?.output?.status === 'completed' && g6v?.ok === true && g6v?.execution === 'ran'
        && g6logs.includes('Verification passed') === true
        && g6check?.tool === 'read_file' && g6check?.result === 'passed' && g6check?.execution === 'ran',
      detail: 'HANDOFF pin LIVE: the producer->consumer loop closes for real; the opt-in lives gate-side, not in the emitted args (CM2 correction)',
    });

    const finalCtx: any = { ...baseCtx, isFinalPhase: true };
    const g7: any = g6pre ? await runPhase(echoTask('g7'), emitted, false, finalCtx) : null;
    const g7logs = JSON.stringify(g7?.logs || []);
    results.push({
      case: 'G7-final-handoff-fails-closed-live', expect: 'the SAME sanitizer emission at a final gate -> partial + unsupported-contract (no smuggled delivery proof)',
      actual: `ok=${g7?.ok} status=${g7?.output?.status} logUnavail=${g7logs.includes('verification_unavailable: unsupported verification tool contract')}`,
      pass: g6pre === true && g7?.ok === false && g7?.output?.status === 'partial'
        && g7logs.includes('verification_unavailable: unsupported verification tool contract') === true,
      detail: 'HANDOFF-FAIL-CLOSED pin LIVE: mode-derived opt-in, not arg-derived — finals reject even genuine sanitizer output',
    });

    const d1: any = await executeTool('echo', { text: 'probe133-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe133-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    // Z0: containment — sbx shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const sha256 = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256(zWsKb);
    const zMarkers = ['m133', 'fx133', 'probe133'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        const m = fs.readFileSync('D:/Joe/muse-worktree/api/data/memory/index.json', 'utf-8');
        return zMarkers.some((mk) => a.includes(mk) || b.includes(mk) || m.includes(mk));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveMemSha = sha256(zLiveMem);
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 133 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127-133 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-133-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-133-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
