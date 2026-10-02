/**
 * MUSE wiring audit 114 — dispatch-reachability battery: shell input-classes,
 * rss contract, browser_run gate pair + login asymmetry (Level 3).
 *
 * Follow-up to 113 (next step named browser_run sensitive-text gate via
 * isSafeLocalBrowserQa analysis, shell curl input-class, rss_fetch contract).
 * For each target this probe executes the REAL executeTool dispatch path
 * (alias layer -> registry -> firewall -> approval gate -> handler) with
 * inputs each layer provably rejects BEFORE any side effect, plus one
 * low-risk positive whose effect is provably inert in this hermetic process.
 * Every expectation below was derived from source BEFORE the run:
 *
 *   S0 shell_execute {command:'sudo probe-114'}
 *      -> ok=false, error='approval_required', risk='critical'
 *      (GATE, classifyToolRisk :157 \bsudo\b — FIRST critical pin; gate fires
 *      before the handler, so no shell is spawned. ToolService.ts:776-783
 *      maps critical like high: requiresAll, no AUTO_APPROVE_ALL here.)
 *   S1 shell_execute {command:'echo curl'}
 *      -> ok=false, error='approval_required', risk='high'
 *      (GATE, :159 curl branch fires BEFORE the :165-166 readOnlyDiagnostic
 *      echo-low exception — 'echo curl' matches the echo low pattern
 *      `echo\s+[A-Za-z0-9_.:/=-]+`, so a high verdict PROVES branch order,
 *      not just the default-high fallthrough at :168. Gate-safe.)
 *   S2 shell_execute {command:'echo probe-114-ok'}
 *      -> ok=true, output.status='success', stdout contains probe-114-ok,
 *      exitCode=0
 *      (HANDLER positive, low via :166 -> handler executes for real;
 *      handler safety policy (:1566) blocks only 'rm -rf /' and 'sudo',
 *      so echo runs; success shape :1672-1676. Effect is stdout bytes
 *      into a captured pipe — provably inert. Wrapped: a throw fails
 *      the case, never aborts the battery.)
 *   R1 rss_fetch {}
 *      -> ok=false, error PRESENT and !== 'url required'
 *      (HANDLER, ContentTools.ts:101-118 — unlike http_fetch/html_extract
 *      there is NO missing-url guard; url='' flows into rss-parser
 *      parseURL(''), which must reject before any socket exists (empty
 *      string is not a fetchable URL). The error TEXT is recorded to
 *      identify the failure layer. Guarded by a 25s race: a timeout is
 *      recorded as a hang finding, never a silent stall.)
 *   B1 browser_run {instructionText:'enter the password probe-114',
 *                   actions:[{type:'goto',url:'http://127.0.0.1:9/'}]}
 *      -> ok=false, error='approval_required', risk='high'
 *      (GATE, :179 sensitive-text branch — password matches; gate fires
 *      BEFORE BrowserRunTool.execute, so zero browser launch. Safe-QA
 *      :178 cannot fire: no mode=browser_test.)
 *   B2 browser_run {instructionText:'probe-114 click test',
 *                   actions:[{type:'click',text:'login'}]}
 *      -> ok=false, error='approval_required', risk='high'
 *      (GATE, :191 click-text branch — combined click text contains
 *      'login'; instructionText itself matches nothing at :179, so a
 *      high verdict PROVES the click-text branch specifically. Gate-safe.)
 *   B3 browser_run {mode:'browser_test',
 *                   instructionText:'please login to continue probe-114',
 *                   actions:[{type:'goto',url:'http://127.0.0.1:9/'}]}
 *      WITHOUT sessionId
 *      -> ok=false, error='sessionId_required'
 *      (GATE+HANDLER asymmetry pin: :178 safe-QA fails ONLY because :137
 *      excludes 'login'; :179 does NOT list login/submit/sign-in, so the
 *      input falls through allowlisted actions to :194 medium and REACHES
 *      the handler — which rejects pre-launch at BrowserRunTool.ts:248
 *      (sid empty; executePlannedActions import at :350 is downstream).
 *      A sessionId_required verdict PROVES live that login-text flows
 *      medium while password-text flows high. Zero browser launch is
 *      proven by the error + the :245-248 source trace.)
 *
 * Safety: same isolated tsx method as 110/111/112/113 — canonical test env
 * (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, NO sessionId, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-114.
 * NO AUTO_APPROVE_* set at any point: S2/B3 reach the handler through the
 * default allowance, S0/S1/B1/B2 meet the gate. No source is modified.
 *
 * Run from api/ with plain DOS CWD:
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-114-dispatch-probe.ts
 */
import * as path from 'path';
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

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const attr = { workspaceId: 'probe-ws-114', userId: 'probe-user-114' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-114-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const p0d = !!sbxRoot && String(process.env.EXTERNAL_PROJECTS_DIR || '').startsWith(path.resolve(sbxRoot).slice(0, 20));
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'}`,
      pass: p0a && p0b && !!sbxRoot, detail: `ambient=${JSON.stringify(ambient)} contained_hint=${p0d}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110/111/112/113',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1 / 112-D1 / 113-D1).
    const r1: any = await executeTool('echo', { text: 'probe-114' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-114',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-114')}`,
      pass: r1?.ok === true && out1.includes('probe-114'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // S0: shell dispatch, GATE layer — sudo -> critical.
    const rs0: any = await executeTool('shell_execute', { command: 'sudo probe-114' }, attr);
    results.push({
      case: 'S0-shell-critical', expect: 'ok=false error=approval_required risk=critical',
      actual: `ok=${rs0?.ok} error=${rs0?.error} risk=${(rs0?.output as any)?.risk}`,
      pass: rs0?.ok === false && rs0?.error === 'approval_required' && (rs0?.output as any)?.risk === 'critical',
      detail: ':157 sudo branch; first critical pin; gate before handler, no spawn',
    });

    // S1: shell dispatch, GATE layer — curl shadows the echo-low exception.
    const rs1: any = await executeTool('shell_execute', { command: 'echo curl' }, attr);
    results.push({
      case: 'S1-shell-curl-order', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rs1?.ok} error=${rs1?.error} risk=${(rs1?.output as any)?.risk}`,
      pass: rs1?.ok === false && rs1?.error === 'approval_required' && (rs1?.output as any)?.risk === 'high',
      detail: ':159 curl branch precedes :166 echo-low; branch-order pin; gate-safe',
    });

    // S2: shell dispatch, HANDLER positive — low echo executes for real.
    try {
      const rs2: any = await executeTool('shell_execute', { command: 'echo probe-114-ok' }, attr);
      const stdout2 = String((rs2?.output as any)?.stdout || '');
      results.push({
        case: 'S2-shell-low-exec', expect: 'ok=true status=success stdout_has_probe exitCode=0',
        actual: `ok=${rs2?.ok} status=${(rs2?.output as any)?.status} stdout_has_probe=${stdout2.includes('probe-114-ok')} exitCode=${(rs2?.output as any)?.exitCode} error=${rs2?.error ?? 'none'}`,
        pass: rs2?.ok === true && (rs2?.output as any)?.status === 'success' && stdout2.includes('probe-114-ok') && (rs2?.output as any)?.exitCode === 0,
        detail: 'low :166 -> real handler execution; stdout-only effect, inert',
      });
    } catch (e: any) {
      results.push({
        case: 'S2-shell-low-exec', expect: 'ok=true status=success stdout_has_probe exitCode=0',
        actual: `threw=${String(e?.message || e).slice(0, 100)}`, pass: false,
        detail: 'handler-side throw; battery continues',
      });
    }

    // R1: rss dispatch, HANDLER layer — no missing-url guard; library rejects.
    try {
      const rr1: any = await Promise.race([
        executeTool('rss_fetch', {}, attr),
        new Promise((_, rej) => setTimeout(() => rej(new Error('R1_TIMEOUT_25S_POSSIBLE_HANG')), 25000)),
      ]);
      const err1 = String(rr1?.error || '');
      results.push({
        case: 'R1-rss-contract', expect: "ok=false error_present error!=='url required'",
        actual: `ok=${rr1?.ok} error=${err1.slice(0, 160) || 'EMPTY'}`,
        pass: rr1?.ok === false && !!err1 && err1 !== 'url required',
        detail: 'no presence guard (ContentTools.ts:101-102); failure layer in error text',
      });
    } catch (e: any) {
      results.push({
        case: 'R1-rss-contract', expect: "ok=false error_present error!=='url required'",
        actual: `threw=${String(e?.message || e).slice(0, 100)}`, pass: false,
        detail: 'throw/timeout recorded as finding; battery continues',
      });
    }

    // B1: browser dispatch, GATE layer — password text -> high.
    const rb1: any = await executeTool('browser_run', { instructionText: 'enter the password probe-114', actions: [{ type: 'goto', url: 'http://127.0.0.1:9/' }] }, attr);
    results.push({
      case: 'B1-browser-sensitive-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rb1?.ok} error=${rb1?.error} risk=${(rb1?.output as any)?.risk}`,
      pass: rb1?.ok === false && rb1?.error === 'approval_required' && (rb1?.output as any)?.risk === 'high',
      detail: ':179 sensitive-text branch; gate before handler; zero browser launch',
    });

    // B2: browser dispatch, GATE layer — click text login -> high.
    const rb2: any = await executeTool('browser_run', { instructionText: 'probe-114 click test', actions: [{ type: 'click', text: 'login' }] }, attr);
    results.push({
      case: 'B2-browser-click-login-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rb2?.ok} error=${rb2?.error} risk=${(rb2?.output as any)?.risk}`,
      pass: rb2?.ok === false && rb2?.error === 'approval_required' && (rb2?.output as any)?.risk === 'high',
      detail: ':191 click-text branch; proves click branch specifically; gate-safe',
    });

    // B3: browser dispatch, medium fallthrough + HANDLER pre-launch reject.
    const rb3: any = await executeTool('browser_run', { mode: 'browser_test', instructionText: 'please login to continue probe-114', actions: [{ type: 'goto', url: 'http://127.0.0.1:9/' }] }, attr);
    results.push({
      case: 'B3-browser-login-asymmetry', expect: 'ok=false error=sessionId_required',
      actual: `ok=${rb3?.ok} error=${rb3?.error}`,
      pass: rb3?.ok === false && rb3?.error === 'sessionId_required',
      detail: ':137 excludes login from safe-QA but :179 omits it -> :194 medium -> handler :248 pre-launch; zero browser launch',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-114-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-114-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
