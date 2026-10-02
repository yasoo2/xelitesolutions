/**
 * MUSE wiring audit 132 — VERIFICATION-CONTRACT LIVE RE-VERIFICATION
 * (Level 4, first live gate battery with REAL ToolService).
 *
 * Scope: the GENERAL planner/sanitizer/gate contract repair owned by Muse
 * (2958a7ec + eae0eb2e) that closed the CRITICAL-REAL-JOE-UI-001 run-4b /
 * run-1790611029070 failure class (successful phases killed by planner
 * bookkeeping the repair loop cannot fix). The 12/12 jest suite pins this
 * contract with a MOCKED ToolService; this battery re-pins it LIVE at HEAD
 * with the real registry, real dispatch, real filesystem, and real gate.
 *
 * Static facts (read-only source, BEFORE the run):
 * - Sanitizer (plan-tools.ts:860-1037): `if (v)` normalises EVERY truthy
 *   verificationTask. Tool-less prose with a produced output is rewritten
 *   to a read_file existence observation (preserving the original request
 *   in verificationNote + downgradedTo); a checker naming a real tool with
 *   unusable args is dropped with the original in verificationNote; a valid
 *   structured checker is preserved. It never emits a contract the gate
 *   must reject.
 * - Inspection-only phases (no concrete delivery, echo tasks included)
 *   receive an injected documenting write_file (plan-tools.ts:793-840), so
 *   prose there is rewritten to observe the injected doc — SC1 pins this
 *   interaction live.
 * - Gate entry (PhaseExecutorTool.ts:2302): the verification branch runs
 *   ONLY for object-shaped verificationTask. Strings degrade to
 *   absent-verifier semantics (complete on tasks, no receipt) — G0/G1.
 * - Object-shaped non-checker contracts are rejected honestly pre-exec:
 *   'verification_unavailable: unsupported verification tool contract'
 *   (PhaseExecutorTool.ts:2356-2358) -> status partial, ok false — G3/G5.
 * - Final mode (projectContext.isFinalPhase, PhaseExecutorTool.ts:2333-
 *   2335) disables the existence-observation opt-in, so a read_file
 *   observation at a final gate FAILS CLOSED (partial) instead of
 *   masquerading as delivery proof — G4.
 * - Success receipt (PhaseExecutorTool.ts:2432-2436): verifier results
 *   entry {tool, ok:true, execution:'ran'} + 'Verification passed' log +
 *   phaseVerificationCheck {result:'passed'} — G2.
 * - Auto-build (PhaseExecutorTool.ts:2487) requires code tasks; this
 *   battery uses echo tasks only, so no shell/npm path can trigger.
 * - PhaseExecutorTool has zero run-evidence/persistence writes of its own
 *   (source grep); tool executions were proven contained by Z0 in 110-131.
 *
 * Every case stays on a SAFE surface: pure sanitizer calls, echo tasks,
 * one read_file verifier execution on a seeded sbx fixture, pre-exec
 * rejections (G3/G4/G5 run zero handler code). NO network, NO model, NO
 * browser, NO npm, NO shell execution, NO spend. Distinct verifier
 * descriptions per G-case keep ledger selections fresh ('ran', not reuse).
 *
 * Same isolated tsx method as 110-131: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (Set-Location INSIDE the
 * shell), all imports absolute, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-132 (fresh). NO DATA_DIR is set:
 * the knowledge.ts import-time mkdir lands in <sbx>/data (contained; Z0
 * asserts the shape, 127-131 continuity). NO AUTO_APPROVE_* set at any
 * point. No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-132
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-132-dispatch-probe.ts
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

const gateAccepts = (tool: string, args: Record<string, unknown>) =>
  isVerificationTool(tool, args, false, true, true);

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
  const attr = { workspaceId: 'probe-ws-132', userId: 'probe-user-132' } as any;

  await executionFirewall.runInContext('muse-132-probe', async () => {
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

    // ---- sanitizer slice (pure; live HEAD-currency + fresh-prose generality) ----
    const freshProse132 = 'Confirm the nightly report queue drains and every chart tile renders';
    const sc0 = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Report queue',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app132/entry.js', content: 'module.exports = {};' } }],
      verificationTask: freshProse132,
    }], 'app132', { mode: 'greenfield', candidateCheckCommands: [] });
    const sc0v: any = sc0.phases[0].verificationTask;
    const sc0n: any = (sc0.phases[0] as any).verificationNote;
    const sc0notes = (sc0.notes || []).join('\n');
    results.push({
      case: 'SC0-fresh-prose-rewrite', expect: 'fresh prose -> read_file observation of app132/entry.js + gate-accepts + note + verificationNote.task==prose + downgradedTo.read_file',
      actual: `tool=${sc0v?.tool} path=${sc0v?.args?.path} gate=${sc0v ? gateAccepts(sc0v.tool, sc0v.args || {}) : 'n/a'} noteHas=${sc0notes.includes('بدون عقد أداة')} vnTask=${sc0n?.task === freshProse132} dwng=${sc0n?.downgradedTo?.tool}`,
      pass: sc0v?.tool === 'read_file' && sc0v?.args?.path === 'app132/entry.js'
        && gateAccepts(sc0v.tool, sc0v.args || {}) === true && sc0notes.includes('بدون عقد أداة')
        && sc0n?.task === freshProse132 && sc0n?.downgradedTo?.tool === 'read_file',
      detail: 'GENERALITY pin: never-before-used wording (not the observed :5002 string) takes the same rewrite path',
    });

    const histProse = 'Verify the technical stack is correctly implemented';
    const sc0b = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Technical Stack Decision',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: histProse,
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const sc0bv: any = sc0b.phases[0].verificationTask;
    results.push({
      case: 'SC0b-historical-string-regression', expect: 'exact :5002 killer string -> read_file observation + gate-accepts (never raw passthrough)',
      actual: `tool=${sc0bv?.tool} path=${sc0bv?.args?.path} gate=${sc0bv ? gateAccepts(sc0bv.tool, sc0bv.args || {}) : 'n/a'}`,
      pass: sc0bv?.tool === 'read_file' && gateAccepts(sc0bv.tool, sc0bv.args || {}) === true,
      detail: 'REGRESSION pin: the run-1790611029070 string that killed a 2/2 phase now rewrites',
    });

    const sc1 = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Status ping',
      tasks: [{ task: 'Ping status', tool: 'echo', args: { text: 'alive' } }],
      verificationTask: 'Confirm the status ping echoes back promptly',
    }], 'ping132', { mode: 'existing', candidateCheckCommands: [] });
    const sc1v: any = sc1.phases[0].verificationTask;
    results.push({
      case: 'SC1-echo-only-injection-interaction', expect: 'prose + echo-only -> read_file observation of the injected doc (/docs/ path) + gate-accepts',
      actual: `tool=${sc1v?.tool} path=${sc1v?.args?.path} gate=${sc1v ? gateAccepts(sc1v.tool, sc1v.args || {}) : 'n/a'}`,
      pass: sc1v?.tool === 'read_file' && String(sc1v?.args?.path || '').includes('/docs/')
        && gateAccepts(sc1v.tool, sc1v.args || {}) === true,
      detail: 'INJECTION pin: echo-only phases get the documenting write_file, which anchors the rewrite (plan-tools.ts:793-840)',
    });

    const sc2 = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app132/entry.js', content: 'module.exports = {};' } }],
      verificationTask: { task: 'Verify the build output' },
    }], 'app132', { mode: 'greenfield', candidateCheckCommands: [] });
    const sc2v: any = sc2.phases[0].verificationTask;
    const sc2ok = sc2v === undefined || (sc2v?.tool === 'read_file' && gateAccepts(sc2v.tool, sc2v.args || {}) === true);
    results.push({
      case: 'SC2-toolless-object-normalised', expect: 'tool-less object -> dropped OR read_file observation; never raw passthrough',
      actual: `emitted=${sc2v === undefined ? 'undefined' : `tool=${sc2v?.tool} path=${sc2v?.args?.path}`}`,
      pass: sc2ok === true,
      detail: 'NORMALISATION pin: contract-claiming shapes without a tool never reach the gate raw',
    });

    const sc4 = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app132/entry.js', content: 'module.exports = {};' } }],
      verificationTask: { task: 'Observe the entry', tool: 'read_file', args: { path: 'app132/entry.js' } },
    }], 'app132', { mode: 'greenfield', candidateCheckCommands: [] });
    const sc4v: any = sc4.phases[0].verificationTask;
    results.push({
      case: 'SC4-structured-preserved', expect: 'valid structured read_file verifier preserved as-is (tool + path identical)',
      actual: `tool=${sc4v?.tool} path=${sc4v?.args?.path}`,
      pass: sc4v?.tool === 'read_file' && sc4v?.args?.path === 'app132/entry.js',
      detail: 'PRESERVATION pin: the sanitizer does not mangle already-valid checkers',
    });

    const sc5 = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app132/entry.js', content: 'module.exports = {};' } }],
      verificationTask: '',
    }], 'app132', { mode: 'greenfield', candidateCheckCommands: [] });
    results.push({
      case: 'SC5-empty-normalised', expect: "'' -> undefined (falsy verifications never pass through)",
      actual: `emitted=${(sc5.phases[0] as any).verificationTask === undefined ? 'undefined' : 'PRESENT'}`,
      pass: (sc5.phases[0] as any).verificationTask === undefined,
      detail: 'FALSY pin: empty verifications normalise to undefined via `v || undefined`',
    });

    // ---- live gate slice (real PhaseExecutor + REAL ToolService, sbx workspace) ----
    const wsDir = path.join(sbxRoot, 'projects', 'probe-ws-132');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'marker132.txt'), 'alpha\nmarker132-uniq-gamma\ngamma\n', 'utf-8');
    const baseCtx: any = {
      projectName: 'muse-132-probe',
      workspaceId: 'probe-ws-132',
      sessionId: 'muse-132-session',
      userId: 'probe-user-132',
    };
    const runPhase = (tasks: any[], verificationTask: any, noVerifier: boolean, ctx: any) =>
      new PhaseExecutorTool().execute({
        phase: {
          phaseNumber: 1,
          name: 'M132 contract probe',
          tasks,
          ...(noVerifier ? {} : { verificationTask }),
        },
        projectContext: ctx,
      } as any, ctx);
    const echoTask = (tag: string) => [{ task: `Echo ${tag}`, tool: 'echo', args: { text: `m132-${tag}` } }];

    const g0: any = await runPhase(echoTask('g0'), 'Verify the queue worker drains overnight jobs cleanly', false, baseCtx);
    const g0logs = JSON.stringify(g0?.logs || []);
    const g0res: any[] = g0?.output?.results || [];
    results.push({
      case: 'G0-prose-completes-live', expect: 'ok + completed + 1 task result + zero unavailable + NO phaseVerificationCheck (fresh prose, real dispatch)',
      actual: `ok=${g0?.ok} status=${g0?.output?.status} completed=${g0?.output?.completedTasks} results=${g0res.length} unavail=${g0logs.includes('verification_unavailable')} check=${'phaseVerificationCheck' in (g0?.output || {})}`,
      pass: g0?.ok === true && g0?.output?.status === 'completed' && g0?.output?.completedTasks === 1
        && g0res.length === 1 && g0logs.includes('verification_unavailable') === false
        && !('phaseVerificationCheck' in (g0?.output || {})),
      detail: 'KILLER-CLASS pin LIVE: the run-4b shape (prose + successful tasks) completes without gate death — first live (unmocked) proof',
    });

    const g1: any = await runPhase(echoTask('g1'), undefined, true, baseCtx);
    const g1logs = JSON.stringify(g1?.logs || []);
    const g1res: any[] = g1?.output?.results || [];
    results.push({
      case: 'G1-absent-parity-live', expect: 'absent verifier completes identically to prose (same ok/status/results-length, zero unavailable, no check)',
      actual: `ok=${g1?.ok} status=${g1?.output?.status} results=${g1res.length} unavail=${g1logs.includes('verification_unavailable')} check=${'phaseVerificationCheck' in (g1?.output || {})}`,
      pass: g1?.ok === true && g1?.output?.status === g0?.output?.status && g1res.length === g0res.length
        && g1logs.includes('verification_unavailable') === false && !('phaseVerificationCheck' in (g1?.output || {})),
      detail: 'PARITY pin LIVE: prose receives exactly absent-verifier semantics (never less, never a receipt)',
    });

    const g2: any = await runPhase(echoTask('g2'), { task: 'G2 observe the seeded marker', tool: 'read_file', args: { path: 'marker132.txt' } }, false, baseCtx);
    const g2logs = JSON.stringify(g2?.logs || []);
    const g2res: any[] = g2?.output?.results || [];
    const g2v = g2res.find((r: any) => String(r?.tool || '') === 'read_file');
    const g2check: any = (g2?.output as any)?.phaseVerificationCheck;
    results.push({
      case: 'G2-structured-read-passes-live', expect: "completed + verifier entry {read_file, ok, ran} + 'Verification passed' log + check result passed (real read of seeded fixture)",
      actual: `ok=${g2?.ok} status=${g2?.output?.status} vEntry=${g2v ? `ok=${g2v.ok} exec=${g2v.execution}` : 'MISSING'} logPass=${g2logs.includes('Verification passed')} check=${g2check ? `${g2check.tool}/${g2check.result}/${g2check.execution}` : 'MISSING'}`,
      pass: g2?.ok === true && g2?.output?.status === 'completed' && g2v?.ok === true && g2v?.execution === 'ran'
        && g2logs.includes('Verification passed') === true
        && g2check?.tool === 'read_file' && g2check?.result === 'passed' && g2check?.execution === 'ran',
      detail: 'POSITIVE pin LIVE: a valid structured checker executes for real and records a passed receipt',
    });

    const g3: any = await runPhase(echoTask('g3'), { task: 'G3 echo is not a checker', tool: 'echo', args: { text: 'm132-g3' } }, false, baseCtx);
    const g3logs = JSON.stringify(g3?.logs || []);
    const g3res: any[] = g3?.output?.results || [];
    const g3v = g3res.find((r: any) => String(r?.task || '').includes('G3 echo'));
    results.push({
      case: 'G3-nonchecker-object-rejected-live', expect: 'partial + ok false + unsupported-contract in logs + verifier entry ok:false (honest pre-exec rejection)',
      actual: `ok=${g3?.ok} status=${g3?.output?.status} logUnavail=${g3logs.includes('verification_unavailable: unsupported verification tool contract')} vEntry=${g3v ? `ok=${g3v.ok} err=${String(g3v.error || '').slice(0, 50)}` : 'MISSING'}`,
      pass: g3?.ok === false && g3?.output?.status === 'partial'
        && g3logs.includes('verification_unavailable: unsupported verification tool contract') === true
        && g3v?.ok === false && String(g3v?.error || '').includes('verification_unavailable'),
      detail: 'HONEST-REJECTION pin LIVE: object-shaped non-checkers fail the phase openly instead of completing silently',
    });

    const finalCtx: any = { ...baseCtx, isFinalPhase: true };
    const g4: any = await runPhase(echoTask('g4'), { task: 'G4 final must not accept a bare read', tool: 'read_file', args: { path: 'marker132.txt' } }, false, finalCtx);
    const g4logs = JSON.stringify(g4?.logs || []);
    results.push({
      case: 'G4-final-read-fails-closed-live', expect: 'partial + unsupported-contract in logs (read must not masquerade as final delivery proof)',
      actual: `ok=${g4?.ok} status=${g4?.output?.status} logUnavail=${g4logs.includes('verification_unavailable: unsupported verification tool contract')}`,
      pass: g4?.ok === false && g4?.output?.status === 'partial'
        && g4logs.includes('verification_unavailable: unsupported verification tool contract') === true,
      detail: 'FAIL-CLOSED pin LIVE: final mode disables the existence-observation opt-in (PhaseExecutorTool.ts:2355)',
    });

    const g5: any = await runPhase(echoTask('g5'), { task: 'G5 tool-less object reaches the gate raw' }, false, baseCtx);
    const g5logs = JSON.stringify(g5?.logs || []);
    const g5res: any[] = g5?.output?.results || [];
    const g5v = g5res.find((r: any) => String(r?.task || '').includes('G5 tool-less'));
    results.push({
      case: 'G5-toolless-object-rejected-live', expect: 'partial + unsupported-contract (tool-less OBJECT claims contract-ness -> gate fails closed; strings degrade, objects reject)',
      actual: `ok=${g5?.ok} status=${g5?.output?.status} logUnavail=${g5logs.includes('verification_unavailable: unsupported verification tool contract')} vEntry=${g5v ? `ok=${g5v.ok}` : 'MISSING'}`,
      pass: g5?.ok === false && g5?.output?.status === 'partial'
        && g5logs.includes('verification_unavailable: unsupported verification tool contract') === true
        && g5v?.ok === false,
      detail: 'ASYMMETRY pin LIVE: typeof-object enters the gate (line 2302) and is rejected; this is WHY the sanitizer must normalise tool-less objects first (SC2)',
    });

    const d1: any = await executeTool('echo', { text: 'probe132-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe132-alive'),
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
    const zMarkers = ['m132', 'fx132', 'probe132'];
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
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 132 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127-131 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-132-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-132-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
