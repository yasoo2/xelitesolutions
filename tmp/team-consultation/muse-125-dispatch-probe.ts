/**
 * MUSE wiring audit 125 — dispatch-reachability battery: browser-family
 * completion (search_api pre-network guard = the PLAN side of the B4-124
 * web_search divergence; codebase_navigator ORPHAN #5 live discovery +
 * dead-injection-branch pin) + task/interaction family FIRST live proofs
 * (todo_write dispatch payload-loss OBS-125-1 + missing-input failure;
 * alert_manager full lifecycle; ask_user fire-and-forget shape;
 * notify_user positive + no-validation pin) (Level 4).
 *
 * Every case stays on a SAFE surface: guard refusals, registry-miss
 * refusals, process-local state (alerts Map/history), or WS broadcasts
 * with no server (safe no-op per ws.ts:593-596). NO network is touched
 * (search_api refuses before search()), NO model is called, NO browser is
 * launched, NO vector store is opened (the orphaned navigator handler
 * never runs), NO spend.
 *
 * Same isolated tsx method as 110-124: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, zero network, CWD = the sandbox dir itself (tsx by
 * absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-125.
 * NO AUTO_APPROVE_* set at any point. No source edited.
 *
 * Expectations derived from source BEFORE the run:
 * - ToolService.ts:142-203 classifyToolRisk: codebase_navigator is 'low'
 *   (:198); search_api/todo_write/alert_manager/ask_user/notify_user fall
 *   to default 'medium' (:202) — all reach their handlers under default
 *   autoSafe (bypass OFF, hermetic).
 * - ToolService.ts:562-568 session injection covers browser_run/visual_qa/
 *   codebase_navigator only — but TWO of the three names are orphaned
 *   (visual_qa: 124-O1; codebase_navigator: 125-N1 run-1 discovery,
 *   registry.ts:16 imports without registering). unknown_tool returns at
 *   :714-717, so the injection clauses for both orphans are DEAD branches
 *   with no observable dispatch effect (N4 pins the navigator half live).
 * - ToolService catch (:968-979) normalizes uncaught handler throws via
 *   formatToolError, which returns err.stack for Errors (:45) with an
 *   'internal_exception: ' prefix — so N1/N2/N3 assert error INCLUDES the
 *   message (never exact equality). alert_manager catches INSIDE execute
 *   (AlertManagerTool.ts:118-125) and returns error.message EXACTLY —
 *   A1/A4 pin that contrast live.
 * - SearchApiTool.ts:30-34: {} -> exact 'query is required' return BEFORE
 *   duck-duck-scrape search() — zero network proven by the guard.
 * - CodebaseNavigatorTool.ts is implemented but unreachable: registry
 *   miss short-circuits at :714-717 before the handler's action switch
 *   (:56-135), so its throw-guards, memory.init, glob, and LanceDB paths
 *   (VectorMemory.ts) never execute at dispatch. Run-1 guard/positive
 *   expects withdrawn; run-2 pins orphan + invariants + registry
 *   scan instead. The nav-125 seed dir now serves only the N7 no-effect
 *   pin (exactly 1 file, never listed by any handler).
 * - TodoWriteTool.ts:49-76: positive returns {ok:true, DATA:{acknowledged,
 *   count}, logs} — note DATA key, not output (contract-shape pin T1);
 *   broadcast() with liveWssRef null warns + returns (ws.ts:593-596),
 *   safe no-op; {} throws on input.todos.length -> caught -> ok:false
 *   error includes 'Failed to update todos:' (T2; TypeError text is
 *   engine-worded so only the prefix is gated). Dispatch picks only
 *   res.output (:879) and drops the data key (:963) — T1 run-1 discovery
 *   (OBS-125-1), re-derived as a contract-loss pin for run-2.
 * - AlertManagerTool.ts:91-126 switch: create/trigger/resolve/list/
 *   history; default throws 'Unknown action: X' caught in-handler.
 *   Alerts/history are static process-local state (:141/:144) — the
 *   A2(empty)->A3(create)->A5(trigger)->A6(resolve)->A7(history=3)->
 *   A8(summary) chain is order-gated inside this one process.
 * - AskUserTool (TaskInteractionTools.ts:255-270): broadcasts then
 *   returns ok:true {status:'waiting_for_user_input'} IMMEDIATELY —
 *   fire-and-forget despite the 'Blocking' doc comment (behavior pin U1).
 * - NotifyUserTool.ts:51-75: {message} -> ok:true acknowledged; NO input
 *   validation (message defaults to '') despite required:['message'] in
 *   the inputSchema — U3 pins another OBS-111-2 no-dispatch-validation
 *   instance live (no OBS filed: same known class).
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-125
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-125-dispatch-probe.ts
 *
 * RUN-1 (16/26 PASS, TSX EXIT 1 — receipts preserved as
 * muse-125-dispatch-probe.run1.stdout.log/.run1.stderr.log) disclosed THREE
 * findings, all re-derived below for run-2 (code was right, expects wrong
 * or the behavior is the finding):
 * 1. S1: my logs=[] assertion ignored the dispatch start line (:623) — the
 *    same envelope lesson as 113-H1 run-1. Handler returns logs:[]; the
 *    ENVELOPE carries exactly the start line. Run-2 gates the envelope
 *    shape (start line only, handler added zero lines = zero network).
 * 2. N1-N7: 'codebase_navigator' is NOT REGISTERED — dispatch returns
 *    'unknown_tool: "codebase_navigator" — did you mean: ...'. Registry
 *    source corroborates: registry.ts:16 imports CodebaseNavigatorTool but
 *    never instantiates it — the SAME imported-never-registered orphan
 *    class as visual_qa (registry.ts:14). ORPHAN #5. The :562-568 session
 *    injection clause for it is a dead branch (unknown_tool returns at
 *    :714-717; only browser_run of the three names is live). Run-2 re-pins
 *    N1-N7 as orphan/unreachable/registry pins; the VectorMemory/LanceDB
 *    handler path is UNREACHABLE at dispatch (no index/search ever runs).
 * 3. T1: todo_write returns {ok:true, DATA:{...}} but ToolService picks
 *    only res.output (:879) and returns {ok,output,logs,artifacts,error}
 *    (:963) — the data key is DROPPED: dispatch yields output=null with
 *    only the prose log surviving. Run-2 gates that contract loss live
 *    (OBS-125-1). Source survey: TodoWriteTool.ts:65 is the only handler
 *    top-level return using data: instead of output: (all other 'data: {'
 *    hits are broadcast payloads or schemas).
 */
import * as fs from 'fs';
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const wsA = path.join(extRoot, 'probe-ws-125');
  const navDir = path.join(sbxRoot, 'nav-125');
  const attr = { workspaceId: 'probe-ws-125', userId: 'probe-user-125' } as any;
  try { fs.mkdirSync(wsA, { recursive: true }); } catch { /* pin fails loudly below */ }
  try {
    fs.mkdirSync(navDir, { recursive: true });
    fs.writeFileSync(path.join(navDir, 'note-125.md'), '# navprobe125 seed\n\nThe quick navigator index pin checks local vector recall for navprobe125.\n', 'utf-8');
  } catch { /* N5 fails loudly below */ }

  await executionFirewall.runInContext('muse-125-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e}`,
      pass: p0a && p0b && p0c && !!p0d && p0e, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-124',
    });

    const r1: any = await executeTool('echo', { text: 'probe-125' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-125',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-125')}`,
      pass: r1?.ok === true && out1.includes('probe-125'),
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

    // S1: search_api refuses before any network call. Run-1 fix: the
    // ENVELOPE carries exactly the dispatch start line (ToolService.ts:623);
    // the HANDLER added zero lines (its own return is logs:[]) — same
    // envelope lesson as 113-H1 run-1.
    const s1: any = await executeTool('search_api', {}, attr);
    const s1logs: string[] = Array.isArray(s1?.logs) ? (s1.logs as any[]).map(String) : [];
    const s1ok = s1?.ok === false && String(s1?.error || '') === 'query is required'
      && s1logs.length === 1 && s1logs[0].includes('start search_api (orig=search_api)');
    results.push({
      case: 'S1-search-api-no-query', expect: "ok=false error='query is required' + envelope-only start line (handler added zero lines)",
      actual: `ok=${s1?.ok} error=${String(s1?.error || '').slice(0, 60)} logs_n=${s1logs.length} startline=${s1logs.some((l) => l.includes('start search_api'))}`,
      pass: s1ok,
      detail: 'GUARD pin SearchApiTool.ts:34 — the PLAN side of the B4-124 web_search divergence refuses before duck-duck-scrape search(); a live query is intentionally never sent (zero network)',
    });

    // N1-N7 run-2: codebase_navigator is ORPHAN #5 — implemented
    // (CodebaseNavigatorTool.ts), imported at registry.ts:16, NEVER
    // registered (no other registry reference — same class as visual_qa).
    // Dispatch short-circuits at ToolService.ts:714-717 before any handler,
    // guard, memory.init, glob, or LanceDB work. The N1 run-1 throw-guard
    // expects are withdrawn (the handler is unreachable at dispatch).
    const n1: any = await executeTool('codebase_navigator', {}, attr);
    const n1err = String(n1?.error || '');
    results.push({
      case: 'N1-navigator-orphan', expect: 'ok=false error starts \'unknown_tool: "codebase_navigator"\' (ORPHAN #5)',
      actual: `ok=${n1?.ok} error=${n1err.slice(0, 120)}`,
      pass: n1?.ok === false && n1err.startsWith('unknown_tool: "codebase_navigator"'),
      detail: 'ORPHAN pin (run-1 discovery): imported-never-registered, same class as visual_qa (124-O1) — third orphan re-pin after image_generate (110) and visual_qa (124)',
    });

    results.push({
      case: 'N2-navigator-suggestions', expect: 'unknown_tool suggests memorize_codebase + analyze_codebase (replacements exist)',
      actual: `has_memorize=${n1err.includes('memorize_codebase')} has_analyze=${n1err.includes('analyze_codebase')} full=${n1err.slice(0, 200)}`,
      pass: n1err.includes('memorize_codebase') && n1err.includes('analyze_codebase'),
      detail: 'MAP pin ToolService.ts:714-717 did-you-mean: nearby registered names exist — orphan is not a missing-capability gap at dispatch, it is a dead registration',
    });

    const n3: any = await executeTool('codebase_navigator', { action: 'index', targetDir: navDir }, attr);
    const n3err = String(n3?.error || '');
    results.push({
      case: 'N3-navigator-action-invariant', expect: 'index action -> same unknown_tool (no glob/read/add ever runs)',
      actual: `ok=${n3?.ok} error=${n3err.slice(0, 100)}`,
      pass: n3?.ok === false && n3err.startsWith('unknown_tool: "codebase_navigator"'),
      detail: 'UNREACHABLE pin: action/targetDir cannot route around the registry miss — CodebaseNavigatorTool.ts:62-115 index path never executes at dispatch',
    });

    const attrSess = { workspaceId: 'probe-ws-125', userId: 'probe-user-125', sessionId: 'probe-125-session' } as any;
    const n4: any = await executeTool('codebase_navigator', {}, attrSess);
    const n4err = String(n4?.error || '');
    results.push({
      case: 'N4-navigator-context-invariant', expect: 'context sessionId -> same unknown_tool (:562 injection branch dead)',
      actual: `ok=${n4?.ok} error=${n4err.slice(0, 100)}`,
      pass: n4?.ok === false && n4err.startsWith('unknown_tool: "codebase_navigator"'),
      detail: 'DEAD-BRANCH pin ToolService.ts:562-568 vs :714-717: injection writes effectiveInput.sessionId for a name that then misses the registry — no observable dispatch effect (only browser_run of the three injected names is live)',
    });

    const n5: any = await executeTool('codebase_navigator', { action: 'search', query: 'navprobe125' }, attr);
    const n5err = String(n5?.error || '');
    results.push({
      case: 'N5-navigator-search-invariant', expect: 'search action -> same unknown_tool (memory.init/LanceDB never runs)',
      actual: `ok=${n5?.ok} error=${n5err.slice(0, 100)}`,
      pass: n5?.ok === false && n5err.startsWith('unknown_tool: "codebase_navigator"'),
      detail: 'UNREACHABLE pin: VectorMemory init/search (VectorMemory.ts:37-61/:134-167) never executes at dispatch for this name',
    });

    // N6: registry-level corroboration (read-only scan, no dispatch).
    const regNames: string[] = (tools as any[]).map((t: any) => String(t?.name || ''));
    const n6nav = regNames.includes('codebase_navigator');
    const n6vis = regNames.includes('visual_qa');
    const n6mem = regNames.includes('memorize_codebase');
    const n6ana = regNames.includes('analyze_codebase');
    results.push({
      case: 'N6-navigator-registry-scan', expect: 'registry lacks codebase_navigator + visual_qa; has memorize_codebase + analyze_codebase',
      actual: `has_navigator=${n6nav} has_visual_qa=${n6vis} has_memorize=${n6mem} has_analyze=${n6ana}`,
      pass: n6nav === false && n6vis === false && n6mem === true && n6ana === true,
      detail: 'REGISTRY pin: dispatch miss corroborated at the registry array (not a shadow/alias artifact); suggested replacements are genuinely registered',
    });

    results.push({
      case: 'N7-navigator-seed-untouched', expect: 'nav-125 holds exactly the 1 seed file (no handler ever listed the dir)',
      actual: `files=${(() => { try { return fs.readdirSync(navDir).join(','); } catch { return 'READ_FAIL'; } })()}`,
      pass: (() => { try { const f = fs.readdirSync(navDir); return f.length === 1 && f[0] === 'note-125.md'; } catch { return false; } })(),
      detail: 'NO-EFFECT pin: the N3 index call never globbed the seed dir (registry miss precedes all handler work)',
    });

    // T1/T2 run-2: todo_write returns {ok:true, DATA:{...}} but dispatch
    // picks only res.output (:879) and returns {ok,output,logs,artifacts,
    // error} (:963) — the data payload is DROPPED (output=null, only the
    // prose log survives). OBS-125-1.
    const t1: any = await executeTool('todo_write', { merge: false, todos: [{ id: 't125-1', status: 'in_progress', content: 'probe 125 todo pin' }] }, attr);
    const t1logs: string[] = Array.isArray(t1?.logs) ? (t1.logs as any[]).map(String) : [];
    const t1ok = t1?.ok === true && (t1 as any)?.output === null && !('data' in (t1 as any))
      && t1logs.some((l) => l.includes('Successfully broadcasted 1 todo items. (merge: false)'));
    results.push({
      case: 'T1-todo-write-payload-loss', expect: 'ok=true output=null data-key-absent + broadcast log survives (CONTRACT LOSS)',
      actual: `ok=${t1?.ok} error=${String(t1?.error || 'none').slice(0, 60)} output=${JSON.stringify((t1 as any)?.output ?? null)} has_data_key=${'data' in (t1 as any)} has_log=${t1logs.some((l) => l.includes('Successfully broadcasted'))}`,
      pass: t1ok,
      detail: 'CONTRACT-LOSS pin TodoWriteTool.ts:63-67 vs ToolService.ts:879/:963: acknowledged/count dropped at dispatch; downstream output readers see null (OBS-125-1; only handler with a data:-at-return shape)',
    });

    const t2: any = await executeTool('todo_write', {}, attr);
    const t2err = String(t2?.error || '');
    results.push({
      case: 'T2-todo-write-missing', expect: "ok=false error includes 'Failed to update todos:'",
      actual: `ok=${t2?.ok} error=${t2err.slice(0, 100)}`,
      pass: t2?.ok === false && t2err.includes('Failed to update todos:'),
      detail: 'FAILURE pin TodoWriteTool.ts:69-75: input.todos.length throws -> caught (only the handler prefix is gated; the TypeError wording is engine-specific)',
    });

    // A1-A8: alert_manager exact-error contrast + full lifecycle chain.
    const a1: any = await executeTool('alert_manager', {}, attr);
    results.push({
      case: 'A1-alert-unknown-action', expect: "ok=false error='Unknown action: undefined' EXACT (in-handler catch, no envelope)",
      actual: `ok=${a1?.ok} error=${String(a1?.error || '').slice(0, 80)}`,
      pass: a1?.ok === false && String(a1?.error || '') === 'Unknown action: undefined',
      detail: 'CONTRAST pin AlertManagerTool.ts:114-125 vs the 124 smart-family throw class: same unknown-action KIND surfaces EXACT here (caught in-handler) vs internal_exception stack-envelope for uncaught handler throws — error-shape asymmetry class',
    });

    const a2: any = await executeTool('alert_manager', { action: 'list' }, attr);
    const a2out = JSON.stringify((a2 as any)?.output ?? {});
    results.push({
      case: 'A2-alert-list-empty', expect: 'ok=true output.summary.total=0 (fresh process)',
      actual: `ok=${a2?.ok} error=${String(a2?.error || 'none').slice(0, 60)} output=${a2out.slice(0, 160)}`,
      pass: a2?.ok === true && a2out.includes('"total":0'),
      detail: 'POSITIVE pin AlertManagerTool.ts:239-260 — must run before any create in this process (static Map)',
    });

    const a3: any = await executeTool('alert_manager', { action: 'create', name: 'probe-125-alert', severity: 'low' }, attr);
    const a3id = String((a3 as any)?.output?.alertId || '');
    results.push({
      case: 'A3-alert-create', expect: "ok=true alertId starts 'alert_'",
      actual: `ok=${a3?.ok} error=${String(a3?.error || 'none').slice(0, 60)} alertId=${a3id.slice(0, 30)}`,
      pass: a3?.ok === true && a3id.startsWith('alert_'),
      detail: 'POSITIVE pin AlertManagerTool.ts:128-164: process-local create (static Map + history push)',
    });

    const a4: any = await executeTool('alert_manager', { action: 'trigger', alertId: 'probe-125-no-such' }, attr);
    results.push({
      case: 'A4-alert-trigger-missing', expect: "ok=false error='Alert probe-125-no-such not found' EXACT",
      actual: `ok=${a4?.ok} error=${String(a4?.error || '').slice(0, 80)}`,
      pass: a4?.ok === false && String(a4?.error || '') === 'Alert probe-125-no-such not found',
      detail: 'GUARD pin AlertManagerTool.ts:169-171 — missing-id throw caught in-handler to an exact message',
    });

    const a5: any = await executeTool('alert_manager', { action: 'trigger', alertId: a3id, message: 'probe-125 fired' }, attr);
    const a5out = JSON.stringify((a5 as any)?.output ?? {});
    results.push({
      case: 'A5-alert-trigger', expect: 'ok=true alert.status=triggered',
      actual: `ok=${a5?.ok} error=${String(a5?.error || 'none').slice(0, 60)} output=${a5out.slice(0, 160)}`,
      pass: a5?.ok === true && a5out.includes('"status":"triggered"'),
      detail: 'POSITIVE pin AlertManagerTool.ts:166-201 over the A3 id',
    });

    const a6: any = await executeTool('alert_manager', { action: 'resolve', alertId: a3id, message: 'probe-125 done' }, attr);
    const a6out = JSON.stringify((a6 as any)?.output ?? {});
    results.push({
      case: 'A6-alert-resolve', expect: 'ok=true alert.status=resolved',
      actual: `ok=${a6?.ok} error=${String(a6?.error || 'none').slice(0, 60)} output=${a6out.slice(0, 160)}`,
      pass: a6?.ok === true && a6out.includes('"status":"resolved"'),
      detail: 'POSITIVE pin AlertManagerTool.ts:203-237 over the A3 id',
    });

    const a7: any = await executeTool('alert_manager', { action: 'history', alertId: a3id }, attr);
    const a7out = JSON.stringify((a7 as any)?.output ?? {});
    results.push({
      case: 'A7-alert-history', expect: 'ok=true count=3 (created+triggered+resolved)',
      actual: `ok=${a7?.ok} error=${String(a7?.error || 'none').slice(0, 60)} output=${a7out.slice(0, 200)}`,
      pass: a7?.ok === true && a7out.includes('"count":3'),
      detail: 'POSITIVE pin AlertManagerTool.ts:262-280 filtered to the A3 id',
    });

    const a8: any = await executeTool('alert_manager', { action: 'list' }, attr);
    const a8out = JSON.stringify((a8 as any)?.output ?? {});
    results.push({
      case: 'A8-alert-list-summary', expect: 'ok=true total=1 resolved=1 (chain closed)',
      actual: `ok=${a8?.ok} error=${String(a8?.error || 'none').slice(0, 60)} output=${a8out.slice(0, 200)}`,
      pass: a8?.ok === true && a8out.includes('"total":1') && a8out.includes('"resolved":1'),
      detail: 'POSITIVE pin AlertManagerTool.ts:239-260 — full lifecycle visible in one summary',
    });

    // U1: ask_user answers immediately (fire-and-forget, NOT blocking).
    const u1: any = await executeTool('ask_user', { question: 'probe-125: does this block?' }, attr);
    const u1out = JSON.stringify((u1 as any)?.output ?? {});
    results.push({
      case: 'U1-ask-user-no-block', expect: "ok=true output.status='waiting_for_user_input' (immediate return)",
      actual: `ok=${u1?.ok} error=${String(u1?.error || 'none').slice(0, 60)} output=${u1out.slice(0, 160)}`,
      pass: u1?.ok === true && u1out.includes('"status":"waiting_for_user_input"'),
      detail: 'BEHAVIOR pin TaskInteractionTools.ts:255-270: broadcasts + returns at once — the Blocking doc comment describes intent, not behavior',
    });

    // U2/U3: notify_user positive + required-message non-enforcement.
    const u2: any = await executeTool('notify_user', { message: 'probe-125 ping', level: 'info' }, attr);
    const u2out = JSON.stringify((u2 as any)?.output ?? {});
    results.push({
      case: 'U2-notify-positive', expect: 'ok=true output.acknowledged=true',
      actual: `ok=${u2?.ok} error=${String(u2?.error || 'none').slice(0, 60)} output=${u2out.slice(0, 120)}`,
      pass: u2?.ok === true && u2out.includes('"acknowledged":true'),
      detail: 'POSITIVE pin NotifyUserTool.ts:51-75; broadcast no-op with no WS server',
    });

    const u3: any = await executeTool('notify_user', {}, attr);
    const u3out = JSON.stringify((u3 as any)?.output ?? {});
    const u3logs: string[] = Array.isArray(u3?.logs) ? (u3.logs as any[]).map(String) : [];
    results.push({
      case: 'U3-notify-no-message', expect: 'ok=true acknowledged (required message NOT enforced at dispatch)',
      actual: `ok=${u3?.ok} error=${String(u3?.error || 'none').slice(0, 60)} output=${u3out.slice(0, 120)} msglog=${u3logs.some((l) => l.includes('Notification sent:'))}`,
      pass: u3?.ok === true && u3out.includes('"acknowledged":true'),
      detail: 'VALIDATION pin NotifyUserTool.ts:53-54: message defaults to empty string — another OBS-111-2 no-dispatch-validation instance (same known class, no new OBS)',
    });

    // Z0 run-2: the orphaned handler never ran, so no LanceDB table dir
    // exists anywhere; the seed dir is intact; nothing escaped the sbx.
    const lanceDir = path.join(sbxRoot, 'data', 'lance_memory');
    const rootLance = 'D:/Joe/muse-worktree/data/lance_memory';
    const zLanceIn = fs.existsSync(lanceDir);
    const zRootLance = fs.existsSync(rootLance);
    const zSeed = (() => { try { return fs.readdirSync(navDir).length === 1; } catch { return false; } })();
    results.push({
      case: 'Z0-no-handler-side-effects', expect: 'lance_memory absent in sbx AND root + seed dir intact (orphan ran nothing)',
      actual: `sbx_lance=${zLanceIn} root_lance=${zRootLance} seed_intact=${zSeed}`,
      pass: zLanceIn === false && zRootLance === false && zSeed === true,
      detail: 'NO-EFFECT pin: unknown_tool short-circuits before VectorMemory init — the 5 orphan calls left zero vector-store trace (root data/ is the live API store, untouched)',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-125-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-125-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
