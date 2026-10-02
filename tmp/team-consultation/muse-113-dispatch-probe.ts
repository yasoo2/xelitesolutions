/**
 * MUSE wiring audit 113 — dispatch-reachability battery, families 12-14 (Level 3).
 *
 * Follow-up to 112 (next step named payments/http_fetch medium-path contract,
 * task_lifecycle, remaining high-risk gate pins). For one representative tool
 * per family this probe executes the REAL executeTool dispatch path (alias
 * layer -> registry -> firewall -> approval gate -> handler) with inputs each
 * layer provably rejects BEFORE any side effect, plus positive/defaults pins
 * whose effect is provably inert in this hermetic process. Every expectation
 * below was derived from source BEFORE the run:
 *
 *   H1 http_fetch {}
 *      -> ok=false, error='url required', logs=[dispatch start-line only]
 *      (HANDLER, ContentTools.ts:24-26 — pre-fetch return; dispatch prepends
 *      one start line (ToolService.ts:623) and the handler's `logs: []`
 *      adds nothing beneath it (:929), which proves no fetch was attempted.
 *      Risk medium, ToolService.ts:199. First-run expectation wrongly
 *      asserted logs=0; corrected to the envelope shape after :623/:929
 *      were source-traced — the code was right, the expectation was not.)
 *   H2 fetch_url {}
 *      -> ok=false, error='url required'
 *      (ALIAS layer, TOOL_ALIASES fetch_url->http_fetch, ToolService.ts:248,
 *      then the same handler; second alias chain after shell->shell_execute.)
 *   H3 html_extract {}
 *      -> ok=false, error='url required'
 *      (HANDLER, ContentTools.ts:53-55 — pre-fetch return; network-family
 *      breadth: the missing-url contract is shared, not one-tool luck.)
 *   M1 payments_create_checkout_session {amount:1000, productName:'probe-113'}
 *      -> ok=false, error='stripe_not_configured'
 *      (HANDLER, PaymentsTool.ts:63-71 config gate — fires BEFORE the Stripe
 *      import and any network, even for otherwise-valid input. Risk medium,
 *      ToolService.ts:199. GUARDED: the probe refuses to call if
 *      STRIPE_SECRET_KEY is set, and fails loudly instead of touching network.)
 *   T1 task_lifecycle {action:'update', taskStatus:'probe-113', mode:'EXECUTION'}
 *      -> ok=true, output.success=true
 *      (HANDLER positive, TaskLifecycleTool.ts:28-45; risk low,
 *      ToolService.ts:200. Effect is a ws broadcast; this hermetic process
 *      has no server/clients, so the call is inert. Wrapped: a throw fails
 *      the case, never aborts the battery.)
 *   T2 task_lifecycle {}
 *      -> ok=true (action defaults to 'update', :29)
 *      (HANDLER defaults path; inputSchema.required=['action'] is NOT
 *      enforced at dispatch — third live pin of schema-not-enforced
 *      after 111, this time on a low-risk tool. Wrapped like T1.)
 *   G1 delete_file {path:'probe-113-no-such-file.txt'}
 *      -> ok=false, error='approval_required', risk=high
 *      (GATE, classifyToolRisk name branch /(delete|deploy)/,
 *      ToolService.ts:196 — first line-196 pin; gate fires BEFORE the
 *      handler's safePath/exists/unlink path at SystemTools.ts:828-851,
 *      so no filesystem effect is possible.)
 *
 * Safety: same isolated tsx method as 110/111/112 — canonical test env
 * (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, NO sessionId, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-113.
 * NO AUTO_APPROVE_* set at any point: medium/low cases reach the handler
 * through the default allowance, G1 meets the gate. No source is modified.
 *
 * Run from api/ with plain DOS CWD:
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-113-dispatch-probe.ts
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
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET(guarded)' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const attr = { workspaceId: 'probe-ws-113', userId: 'probe-user-113' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-113-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const p0c = !process.env.STRIPE_SECRET_KEY;
    const p0d = !!sbxRoot && String(process.env.EXTERNAL_PROJECTS_DIR || '').startsWith(path.resolve(sbxRoot).slice(0, 20));
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+no_stripe_key+contained',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} stripe=${process.env.STRIPE_SECRET_KEY ? 'SET' : 'unset'} sbx=${sbxRoot ? 'set' : 'MISSING'}`,
      pass: p0a && p0b && p0c && !!sbxRoot, detail: `ambient=${JSON.stringify(ambient)} contained_hint=${p0d}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110/111/112',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1 / 112-D1).
    const r1: any = await executeTool('echo', { text: 'probe-113' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-113',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-113')}`,
      pass: r1?.ok === true && out1.includes('probe-113'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // H1: http dispatch, HANDLER layer — missing url, pre-fetch.
    // Dispatch prepends one start line (ToolService.ts:623) and appends
    // handler logs after (:929); the handler's `logs: []` must therefore
    // surface as EXACTLY the dispatch envelope with nothing beneath it.
    const rh1: any = await executeTool('http_fetch', {}, attr);
    const lh1: any[] = Array.isArray(rh1?.logs) ? rh1.logs : [];
    const h1envelope = lh1.length === 1 && /^\[.*\] start http_fetch \(orig=http_fetch\)$/.test(String(lh1[0]));
    results.push({
      case: 'H1-http-handler', expect: "ok=false error=url required logs=envelope_only",
      actual: `ok=${rh1?.ok} error=${rh1?.error} logs=${lh1.length} envelope_only=${h1envelope}`,
      pass: rh1?.ok === false && rh1?.error === 'url required' && h1envelope,
      detail: `dispatch start-line only; handler added zero lines (pre-fetch); log0=${String(lh1[0] || '').slice(0, 90)}`,
    });

    // H2: fetch_url alias -> same handler verdict.
    const rh2: any = await executeTool('fetch_url', {}, attr);
    results.push({
      case: 'H2-fetch-alias', expect: "ok=false error=url required",
      actual: `ok=${rh2?.ok} error=${rh2?.error}`,
      pass: rh2?.ok === false && rh2?.error === 'url required',
      detail: 'TOOL_ALIASES fetch_url->http_fetch; second alias chain after shell',
    });

    // H3: html_extract dispatch, HANDLER layer — missing url, pre-fetch.
    const rh3: any = await executeTool('html_extract', {}, attr);
    results.push({
      case: 'H3-html-handler', expect: "ok=false error=url required",
      actual: `ok=${rh3?.ok} error=${rh3?.error}`,
      pass: rh3?.ok === false && rh3?.error === 'url required',
      detail: 'network-family breadth: shared missing-url contract, pre-fetch',
    });

    // M1: payments dispatch, HANDLER config gate — guarded on env.
    if (process.env.STRIPE_SECRET_KEY) {
      results.push({
        case: 'M1-payments-config', expect: 'ok=false error=stripe_not_configured',
        actual: 'env_set_CALL_REFUSED no_network_touched', pass: false,
        detail: 'STRIPE_SECRET_KEY is set: refused to call rather than risk network',
      });
    } else {
      const rm1: any = await executeTool('payments_create_checkout_session', { amount: 1000, productName: 'probe-113' }, attr);
      results.push({
        case: 'M1-payments-config', expect: 'ok=false error=stripe_not_configured',
        actual: `ok=${rm1?.ok} error=${rm1?.error}`,
        pass: rm1?.ok === false && rm1?.error === 'stripe_not_configured',
        detail: 'config gate before Stripe import/network, even for valid input',
      });
    }

    // T1: lifecycle dispatch, HANDLER positive — wrapped, inert broadcast.
    try {
      const rt1: any = await executeTool('task_lifecycle', { action: 'update', taskStatus: 'probe-113', mode: 'EXECUTION' }, attr);
      results.push({
        case: 'T1-lifecycle-positive', expect: 'ok=true success=true',
        actual: `ok=${rt1?.ok} success=${(rt1?.output as any)?.success}`,
        pass: rt1?.ok === true && (rt1?.output as any)?.success === true,
        detail: 'low-risk positive; hermetic process has no ws clients',
      });
    } catch (e: any) {
      results.push({
        case: 'T1-lifecycle-positive', expect: 'ok=true success=true',
        actual: `threw=${String(e?.message || e).slice(0, 100)}`, pass: false,
        detail: 'handler-side throw; battery continues',
      });
    }

    // T2: lifecycle dispatch, HANDLER defaults — schema required unenforced.
    try {
      const rt2: any = await executeTool('task_lifecycle', {}, attr);
      results.push({
        case: 'T2-lifecycle-defaults', expect: 'ok=true (required[action] unenforced)',
        actual: `ok=${rt2?.ok} error=${rt2?.error ?? 'none'}`,
        pass: rt2?.ok === true,
        detail: 'action defaults to update; required[] not enforced at dispatch',
      });
    } catch (e: any) {
      results.push({
        case: 'T2-lifecycle-defaults', expect: 'ok=true (required[action] unenforced)',
        actual: `threw=${String(e?.message || e).slice(0, 100)}`, pass: false,
        detail: 'handler-side throw; battery continues',
      });
    }

    // G1: delete dispatch, GATE layer — name-based high, pre-handler.
    const rg1: any = await executeTool('delete_file', { path: 'probe-113-no-such-file.txt' }, attr);
    results.push({
      case: 'G1-delete-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rg1?.ok} error=${rg1?.error} risk=${(rg1?.output as any)?.risk}`,
      pass: rg1?.ok === false && rg1?.error === 'approval_required' && (rg1?.output as any)?.risk === 'high',
      detail: 'line-196 name branch; gate before safePath/exists/unlink; no FS effect',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-113-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-113-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
