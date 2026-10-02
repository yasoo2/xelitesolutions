/**
 * MUSE wiring audit 123 — dispatch-reachability battery: git_ops FIRST live
 * proof + npm_manager FIRST live proof + docker_manager FIRST live proof +
 * terraform/kubernetes/swarm guard-depth FIRST live proof + ssh-remote
 * branch FIRST live proof (Level 4).
 *
 * Checkpoints 100-102 mapped these families by source reads only. 123 takes
 * the same claims to LIVE dispatch via the REAL executeTool path. Every case
 * stays on a SAFE surface: guard refusals (pre-spawn), read-only local
 * spawns (git status/rev-parse, npm --version, docker ps shape), or the
 * zero-network ssh isConnected gate. NO network op is ever sent (no
 * push/fetch/pull/clone, no npm install with a package, no kubectl/terraform/
 * swarm valid spawn, no metachar payload that could execute).
 *
 * Same isolated tsx method as 110-122: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, zero network, CWD = the sandbox dir itself (tsx by
 * absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-123.
 * NO AUTO_APPROVE_* set at any point. No source edited.
 *
 * Expectations derived from source BEFORE the run:
 * - ToolService.ts:142-203 classifyToolRisk: git_ops non-push/commit ->
 *   medium; npm_manager/docker_manager/infra names -> medium (default);
 *   shell_execute 'echo hello' -> low (readOnlyDiagnostic :165);
 *   shell_execute 'docker ps' -> high (:159) -> approval_required :782-783.
 * - ToolService.ts:878-881 + :929 + :963 envelope (122 map stands):
 *   return keeps ONLY {ok, output, logs, artifacts, error}; output null
 *   when the handler returns none; start line precedes handler logs.
 * - GitTools.ts:26-36 runGitWithEnv: op regex ^[a-z0-9-]+$ else
 *   'invalid_git_operation' (:28-30); argv via runArgv shell:false.
 *   GitOpsTool.execute takes NO context; cwd = raw input.cwd or ambient
 *   no-arg getActiveRoot (:107/:114) — F-100-3, live-proved by G3/G5.
 * - SystemTools.ts NpmManagerTool :1204-1222: '' -> 'missing_command'
 *   (:1212); cwd via safePath (contained — the G3 contrast); install-like
 *   without package.json -> 'npm_install_target_is_not_a_package'
 *   (:1260-1268, pre-spawn).
 * - utils.ts:108 resolver refusal: 'path_outside_workspace: ...' prefix.
 * - DockerManagerTool.ts:53 unknown action -> 'Unknown action' (pre-spawn);
 *   valid actions run executionEngine.run (K2 pins the log shape only).
 * - InfrastructureTools.ts:92-95 terraform guards; :170/:171-172 kubectl
 *   guards (incl. quote-aware splitCommandLine refusal); :212-214/:230
 *   swarm guards. NO valid infra spawn is sent.
 * - SystemTools.ts:1657-1658 serverId branch -> commandRouter.execute ->
 *   executeRemote :71-72 throws 'Not connected to server <id>' (zero
 *   network: isConnected map check first); the tool-level catch
 *   :1708-1714 normalizes to ok:false (CORRECTS 100 OBS-100-4, which
 *   claimed the exception escapes — it does not).
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-123
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-123-dispatch-probe.ts
 *
 * RUN-2 (disclosed; run-1 receipts preserved as .run1.*.log): run-1 went
 * 19/23. G2/G3/G4 missed on a PROBE-ENVIRONMENT interaction, not a
 * product finding: sbx-tmp-123 sits INSIDE the D:/Joe/muse-worktree
 * checkout, git climbs out of the sandbox dir into the enclosing repo,
 * and the sandbox identity (muse-sbx-u1) is not the repo owner, so git
 * itself refused with 'dubious ownership' before any product assertion
 * could bite. Run-2 inits a FRESH repo inside the fresh sandbox
 * (owned by the probe identity, fully contained) and re-targets G2/G3/G4
 * at it; G6 pins the climb itself in a machine-independent shape
 * (toplevel-on-owner-machine OR dubious-ownership-here — never
 * 'not a git repository'). B2 missed on a PROBE-READING bug with a REAL
 * finding inside: InfrastructureTools splitCommandLine (:33-41) is a
 * regex tokenizer that DROPS a lone quote instead of refusing, so
 * '"unterminated-123' became `kubectl unterminated-123`, a spawn was
 * attempted, kubectl is absent, the handler returned ok:false with NO
 * error key, and ToolService :945-946 substituted the generic message
 * (second live pin of the R1-114 class). Run-2 B2 pins that actual
 * behavior (strip + substitution) as OBS-123-1; new B2b pins the ONLY
 * input shape that reaches 'invalid_command' (a lone quote: zero
 * matchable tokens). No source touched between runs; only probe
 * expectations + fresh sandbox (sbx-tmp-123b); run-1's tree preserved
 * untouched.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
}

const TF_GUARD = 'terraform_manager needs an action: init | plan | apply | destroy | validate.';
const TF_DIR_GUARD = 'terraform_manager needs the directory holding main.tf.';
const K8S_GUARD = 'kubernetes_ops needs a kubectl command (e.g. "get pods").';
const SWARM_GUARD = 'docker_swarm_ops needs an action: deploy_stack | list_services | service_logs | remove_stack.';
const REMOTE_ID = 'probe-no-such-123';
const REMOTE_ERR = `Not connected to server ${REMOTE_ID}`;

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const wsA = path.join(extRoot, 'probe-ws-123');
  const attr = { workspaceId: 'probe-ws-123', userId: 'probe-user-123' } as any;
  const emptyDir = path.join(wsA, 'n123-empty');
  try { fs.mkdirSync(emptyDir, { recursive: true }); } catch { /* pin fails loudly below */ }
  // RUN-2: fresh repo owned by the probe identity, fully inside the sandbox
  // but OUTSIDE the attributed workspace dir (wsA) — so G3 still proves
  // foreign-cwd acceptance while staying deterministic and contained.
  const gitRepo = path.join(sbxRoot, 'git123-repo');
  let gitInitNote = 'skipped';
  try {
    fs.mkdirSync(gitRepo, { recursive: true });
    execFileSync('git', ['init', '--quiet', gitRepo], { stdio: 'pipe' });
    gitInitNote = fs.existsSync(path.join(gitRepo, '.git')) ? 'inited' : 'no-.git';
  } catch (e: any) { gitInitNote = `INIT_FAILED:${String(e?.message || e).slice(0, 80)}`; }

  await executionFirewall.runInContext('muse-123-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d}`,
      pass: p0a && p0b && p0c && !!p0d, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-122',
    });

    const r1: any = await executeTool('echo', { text: 'probe-123' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-123',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-123')}`,
      pass: r1?.ok === true && out1.includes('probe-123'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    const rh: any = await executeTool('run_command', { action: 'list' }, attr);
    const eh = String(rh?.error || '');
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required' (gate before handler guard)",
      actual: `ok=${rh?.ok} error=${eh.slice(0, 110)}`,
      pass: rh?.ok === false && eh === 'approval_required',
      detail: 'T5-117 divergent-shadow guard re-pin; nothing executed',
    });

    // G1: metachar operation -> exact op-guard, zero spawn.
    const g1: any = await executeTool('git_ops', { operation: 'status;x' }, attr);
    const g1logs: string[] = Array.isArray(g1?.logs) ? (g1.logs as any[]).map(String) : [];
    const g1ok = g1?.ok === false && String(g1?.error || '') === 'invalid_git_operation'
      && g1logs.some((l) => l.includes('start git_ops'));
    results.push({
      case: 'G1-git-op-metachar', expect: "ok=false error='invalid_git_operation' + dispatch start line",
      actual: `ok=${g1?.ok} error=${String(g1?.error || '').slice(0, 60)} startlog=${g1logs.some((l) => l.includes('start git_ops'))}`,
      pass: g1ok,
      detail: 'GUARD pin GitTools.ts:28-30: op regex rejects before runGitWithEnv; nothing spawned (no git.success/git.error handler line can exist)',
    });

    // G2 RUN-2: status in the fresh sandbox repo -> live success shape.
    const g2: any = await executeTool('git_ops', { operation: 'status', cwd: gitRepo }, attr);
    const g2out = JSON.stringify((g2 as any)?.output ?? {});
    const g2ok = gitInitNote === 'inited' && g2?.ok === true && g2out.includes('On branch');
    results.push({
      case: 'G2-git-status-freshrepo', expect: "ok=true output includes 'On branch' (real git in the contained fresh repo)",
      actual: `ok=${g2?.ok} init=${gitInitNote} error=${String(g2?.error || 'none').slice(0, 80)} output=${g2out.slice(0, 120)}`,
      pass: g2ok,
      detail: 'LIVE argv-spawn pin: runGitWithEnv->runArgv executed a real git; run-1 non-repo shape defeated by git climb + sandbox ownership (see G6 + checkpoint)',
    });

    // G3 RUN-2: absolute cwd OUTSIDE the attributed workspace is accepted
    // (F-100-3 live) — the fresh repo is under sbx, not under wsA.
    const g3: any = await executeTool('git_ops', { operation: 'rev-parse', args: ['--show-toplevel'], cwd: gitRepo }, attr);
    const g3out = String((g3 as any)?.output?.output ?? '');
    const g3want = gitRepo.replace(/\\/g, '/');
    const g3got = g3out.trim().replace(/\\/g, '/');
    const g3ok = g3?.ok === true && g3got === g3want;
    results.push({
      case: 'G3-git-cwd-outside-accepted', expect: 'ok=true AND toplevel === the foreign repo path (cwd honored outside ws)',
      actual: `ok=${g3?.ok} error=${String(g3?.error || 'none').slice(0, 80)} toplevel=${g3got.slice(0, 120)}`,
      pass: g3ok,
      detail: 'F-100-3 LIVE: no context param, no safePath on input.cwd — git ran against sbx/git123-repo while attributed to probe-ws-123; read-only op, zero mutation, deterministic',
    });

    // G4 RUN-2: metachar ARG reaches git literally (argv-safe, no re-parse).
    const g4: any = await executeTool('git_ops', { operation: 'rev-parse', args: ['--verify', 'a;b$(x)'], cwd: gitRepo }, attr);
    const g4err = String(g4?.error || '');
    const g4ok = g4?.ok === false && g4err.includes('Needed a single revision');
    results.push({
      case: 'G4-git-arg-literal', expect: "ok=false error includes 'Needed a single revision' (git parsed the metachars literally)",
      actual: `ok=${g4?.ok} error=${g4err.slice(0, 130)}`,
      pass: g4ok,
      detail: 'ARGV pin: a shell re-parse would split on ; and substitute $(x); instead git received one literal revision and rejected it — the GitTools.ts:13-25 lesson holds live',
    });

    // G6 NEW: git climbs OUT of a clean sandbox dir (machine-independent pin:
    // owner-machine toplevel OR sandbox ownership error — never 'not a git
    // repository', because the sbx tree sits inside the worktree checkout).
    const g6: any = await executeTool('git_ops', { operation: 'rev-parse', args: ['--show-toplevel'], cwd: emptyDir }, attr);
    const g6err = String(g6?.error || '');
    const g6out = JSON.stringify((g6 as any)?.output ?? {});
    const g6a = g6?.ok === true && g6out.includes('muse-worktree');
    const g6b = g6?.ok === false && g6err.includes('dubious ownership');
    const g6c = !g6err.includes('not a git repository');
    results.push({
      case: 'G6-git-climbs-out-of-sandbox', expect: '(toplevel incl muse-worktree) OR (dubious ownership) — and never not-a-git-repository',
      actual: `ok=${g6?.ok} error=${g6err.slice(0, 110)} output=${g6out.slice(0, 110)}`,
      pass: (g6a || g6b) && g6c,
      detail: 'CLIMB pin: git upward search leaves the sandbox dir for the enclosing checkout; git_ops cwd is not a containment boundary even when the cwd itself is clean (compounds F-100-3; inherent git semantics, run-1 evidence)',
    });

    // G5: no cwd -> ambient default is USED (no refusal, no workspace_required).
    const g5: any = await executeTool('git_ops', { operation: 'rev-parse', args: ['--show-toplevel'] }, attr);
    const g5err = String(g5?.error || '');
    const g5out = JSON.stringify((g5 as any)?.output ?? {});
    const g5shape = (g5?.ok === true && g5out.length > 10)
      || (g5?.ok === false && (g5err.includes('not a git repository') || g5err.includes('Needed a single revision') || g5err.length > 0));
    const g5refused = g5err === 'workspace_required' || g5err === 'unauthorized' || g5err === 'approval_required' || g5err.startsWith('path_outside_workspace');
    results.push({
      case: 'G5-git-no-cwd-ambient', expect: 'ambient default USED: a git-shaped result, never workspace_required/unauthorized/approval/containment',
      actual: `ok=${g5?.ok} error=${g5err.slice(0, 100)} output=${g5out.slice(0, 120)}`,
      pass: g5shape && !g5refused,
      detail: 'AMBIENT pin GitTools.ts:107: no-arg getActiveRoot() supplies the cwd; contrast N3 where npm safePaths the same absent/foreign input',
    });

    // N1: empty command -> exact guard.
    const n1: any = await executeTool('npm_manager', {}, attr);
    results.push({
      case: 'N1-npm-missing-command', expect: "ok=false error='missing_command'",
      actual: `ok=${n1?.ok} error=${String(n1?.error || '').slice(0, 60)}`,
      pass: n1?.ok === false && String(n1?.error || '') === 'missing_command',
      detail: 'GUARD pin SystemTools.ts:1212; handler reached (medium), nothing spawned',
    });

    // N2: install-like into a non-package dir -> target refusal, pre-spawn.
    const n2: any = await executeTool('npm_manager', { command: 'install', packages: ['left-pad-xyz-123'], cwd: 'n123-empty' }, attr);
    const n2logs: string[] = Array.isArray(n2?.logs) ? (n2.logs as any[]).map(String) : [];
    const n2ok = n2?.ok === false && String(n2?.error || '') === 'npm_install_target_is_not_a_package'
      && n2logs.some((l) => l.includes('npm.refused=no_package_json_at_target'));
    results.push({
      case: 'N2-npm-install-no-package', expect: "ok=false error='npm_install_target_is_not_a_package' + refused log line",
      actual: `ok=${n2?.ok} error=${String(n2?.error || '').slice(0, 80)} refusedlog=${n2logs.some((l) => l.includes('npm.refused='))}`,
      pass: n2ok,
      detail: 'TARGET-REFUSAL pin :1256-1268: the npm-climbs guard fires before any spawn; zero packages touched, zero network',
    });

    // N3: absolute outside-workspace cwd -> safePath refusal (the G3 contrast).
    const n3: any = await executeTool('npm_manager', { command: 'install', packages: ['x'], cwd: 'D:/Joe' }, attr);
    const n3err = String(n3?.error || '');
    const n3logs: string[] = Array.isArray(n3?.logs) ? (n3.logs as any[]).map(String) : [];
    const n3ok = n3?.ok === false && n3err.startsWith('path_outside_workspace: ')
      && n3logs.some((l) => l.includes('npm.args=')) && !n3logs.some((l) => l.includes('npm.cwd='));
    results.push({
      case: 'N3-npm-cwd-outside-refused', expect: "ok=false error starts 'path_outside_workspace: ' AND npm.args logged AND npm.cwd absent",
      actual: `ok=${n3?.ok} error=${n3err.slice(0, 100)} argslog=${n3logs.some((l) => l.includes('npm.args='))} cwdlog=${n3logs.some((l) => l.includes('npm.cwd='))}`,
      pass: n3ok,
      detail: 'CONTAINMENT pin :1216-1222: npm safePaths cwd (refusal before the cwd log); git_ops accepts the same foreign input live (G3) — the F-100-3 contrast, one battery',
    });

    // N4: --version -> live offline spawn.
    const n4: any = await executeTool('npm_manager', { command: '--version', cwd: 'n123-empty' }, attr);
    const n4out = JSON.stringify((n4 as any)?.output ?? n4);
    const n4ok = n4?.ok === true && /\d+\.\d+/.test(n4out);
    results.push({
      case: 'N4-npm-version-live', expect: 'ok=true output matches digit.digit (real local npm, read-only, offline)',
      actual: `ok=${n4?.ok} error=${String(n4?.error || 'none').slice(0, 80)} output=${n4out.slice(0, 120)}`,
      pass: n4ok,
      detail: 'LIVE spawn pin: handleShellCommand ran a real npm binary past the guard; non-install-like so no manifest gate',
    });

    // K1: unknown docker action -> exact guard, pre-spawn.
    const k1: any = await executeTool('docker_manager', { action: 'explode-everything-123' }, attr);
    results.push({
      case: 'K1-docker-unknown-action', expect: "ok=false error='Unknown action'",
      actual: `ok=${k1?.ok} error=${String(k1?.error || '').slice(0, 60)}`,
      pass: k1?.ok === false && String(k1?.error || '') === 'Unknown action',
      detail: 'GUARD pin DockerManagerTool.ts:53; handler reached (medium), engine never invoked (no Executed/Failed log can exist)',
    });

    // K2: ps -> engine-reachability SHAPE pin (docker presence is machine state).
    const k2: any = await executeTool('docker_manager', { action: 'ps', options: '' }, attr);
    const k2logs: string[] = Array.isArray(k2?.logs) ? (k2.logs as any[]).map(String) : [];
    const k2shape = k2logs.some((l) => /^(Executed|Failed): docker ps -a/.test(l));
    results.push({
      case: 'K2-docker-ps-shape', expect: "a handler log line matching /^(Executed|Failed): docker ps -a/ (read-only intent; presence-independent)",
      actual: `ok=${k2?.ok} error=${String(k2?.error || 'none').slice(0, 90)} shapelogs=${JSON.stringify(k2logs).slice(0, 160)}`,
      pass: typeof k2?.ok === 'boolean' && k2shape,
      detail: 'ENGINE pin: dispatch reached executionEngine.run through the template-join path with empty options; read-only ps only — no metachar target is ever sent live (F-102-2 stays source-level by design)',
    });

    // T1/T2: terraform guard-depth (no valid spawn ever sent).
    const t1: any = await executeTool('terraform_manager', {}, attr);
    results.push({
      case: 'T1-terraform-missing-action', expect: 'ok=false exact action guard',
      actual: `ok=${t1?.ok} err_match=${String(t1?.error || '') === TF_GUARD}`,
      pass: t1?.ok === false && String(t1?.error || '') === TF_GUARD,
      detail: 'GUARD pin InfrastructureTools.ts:92-94; medium reachability, zero spawn',
    });
    const t2: any = await executeTool('terraform_manager', { action: 'plan' }, attr);
    results.push({
      case: 'T2-terraform-missing-dir', expect: 'ok=false exact directory guard',
      actual: `ok=${t2?.ok} err_match=${String(t2?.error || '') === TF_DIR_GUARD}`,
      pass: t2?.ok === false && String(t2?.error || '') === TF_DIR_GUARD,
      detail: 'GUARD pin :95; action valid but directory absent — refused before resolveToolPath/spawn',
    });

    // B1/B2: kubectl guard-depth (no valid spawn ever sent).
    const b1: any = await executeTool('kubernetes_ops', {}, attr);
    results.push({
      case: 'B1-kubectl-missing-command', expect: 'ok=false exact command guard',
      actual: `ok=${b1?.ok} err_match=${String(b1?.error || '') === K8S_GUARD}`,
      pass: b1?.ok === false && String(b1?.error || '') === K8S_GUARD,
      detail: 'GUARD pin :170; the empty-call-runs-kubectl-undefined class stays closed',
    });
    // B2 RUN-2: the lone quote is silently STRIPPED (not refused): the
    // mangled tokens spawn, kubectl is absent, the handler returns ok:false
    // with NO error key, and ToolService :945-946 substitutes the generic
    // message (OBS-123-1; second live pin of the R1-114 class).
    const b2: any = await executeTool('kubernetes_ops', { command: '"unterminated-123' }, attr);
    const b2logs: string[] = Array.isArray(b2?.logs) ? (b2.logs as any[]).map(String) : [];
    const b2ok = b2?.ok === false && String(b2?.error || '') === 'Tool reported failure without an error message'
      && b2logs.some((l) => l.includes('executed: kubectl unterminated-123'));
    results.push({
      case: 'B2-kubectl-quote-stripped', expect: "ok=false generic-substitution error AND log 'executed: kubectl unterminated-123' (quote dropped, spawn attempted)",
      actual: `ok=${b2?.ok} error=${String(b2?.error || '').slice(0, 70)} striplog=${b2logs.some((l) => l.includes('executed: kubectl unterminated-123'))}`,
      pass: b2ok,
      detail: 'STRIP pin (OBS-123-1): regex splitter :33-41 drops the lone " instead of refusing; :172 null-check is dead (splitter never returns null); mangled args reach the F-101-2 shell sink; :946 substitution hides the kubectl stderr',
    });

    // B2b NEW: the ONLY shape reaching 'invalid_command' — zero tokens.
    const b2b: any = await executeTool('kubernetes_ops', { command: '"' }, attr);
    results.push({
      case: 'B2b-kubectl-lone-quote', expect: "ok=false error='invalid_command' (no matchable tokens at all)",
      actual: `ok=${b2b?.ok} error=${String(b2b?.error || '').slice(0, 60)}`,
      pass: b2b?.ok === false && String(b2b?.error || '') === 'invalid_command',
      detail: 'GUARD-REACHABILITY pin :175: only a tokenless command reaches invalid_command — every quotable typo with text sails into the shell sink (OBS-123-1 scope)',
    });

    // W1/W2: swarm guard-depth (no valid spawn ever sent).
    const w1: any = await executeTool('docker_swarm_ops', {}, attr);
    results.push({
      case: 'W1-swarm-missing-action', expect: 'ok=false exact action guard',
      actual: `ok=${w1?.ok} err_match=${String(w1?.error || '') === SWARM_GUARD}`,
      pass: w1?.ok === false && String(w1?.error || '') === SWARM_GUARD,
      detail: 'GUARD pin :212-214; medium reachability, zero spawn',
    });
    const w2: any = await executeTool('docker_swarm_ops', { action: 'remove_stack' }, attr);
    results.push({
      case: 'W2-swarm-missing-stack', expect: "ok=false error='stackName required'",
      actual: `ok=${w2?.ok} error=${String(w2?.error || '').slice(0, 60)}`,
      pass: w2?.ok === false && String(w2?.error || '') === 'stackName required',
      detail: 'GUARD pin :230; the destructive action refuses before args are even built',
    });

    // R1: low-risk command + bogus serverId -> remote gate, tool-normalized.
    const rr1: any = await executeTool('shell_execute', { command: 'echo hello', serverId: REMOTE_ID }, attr);
    results.push({
      case: 'R1-remote-not-connected', expect: `ok=false error='${REMOTE_ERR}' (tool-normalized, zero network)`,
      actual: `ok=${rr1?.ok} error=${String(rr1?.error || '').slice(0, 110)}`,
      pass: rr1?.ok === false && String(rr1?.error || '') === REMOTE_ERR,
      detail: 'REMOTE-GATE pin command-router.ts:71-72 + TOOL-NORMALIZE pin SystemTools.ts:1708-1714: the throw is caught at the tool boundary — CORRECTS 100 OBS-100-4 (no raw exception escapes); isConnected map check means zero network for an unknown id',
    });

    // R2: high-risk command + serverId -> gate stops it before the router.
    const rr2: any = await executeTool('shell_execute', { command: 'docker ps', serverId: REMOTE_ID }, attr);
    results.push({
      case: 'R2-remote-high-gate', expect: "ok=false error='approval_required' (gate before the remote branch)",
      actual: `ok=${rr2?.ok} error=${String(rr2?.error || '').slice(0, 110)}`,
      pass: rr2?.ok === false && String(rr2?.error || '') === 'approval_required',
      detail: 'GATE-BEFORE-REMOTE pin ToolService.ts:159/:782-783: high-risk never reaches commandRouter — third gate-vs-guard order pin (T5-117, X2-121)',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-123-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-123-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
