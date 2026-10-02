/**
 * MUSE wiring audit 124 — dispatch-reachability battery: browser smart
 * family (25 tools) session-guard FIRST live proof + browser_run /
 * browser_action / browser_vision / screenshot / visual_compare /
 * video_action / user_browser / google_account / browser_ui_fix /
 * browser_page_fix guard-depth FIRST live proofs + visual_qa orphan
 * dispatch re-pin + web_search planner/dispatcher divergence live pin
 * (Level 4).
 *
 * Every case stays on a SAFE surface: pre-launch guard refusals only.
 * NO browser is ever launched (liveBrowserSessionCount stays 0, pinned),
 * NO navigation is ever sent, NO model is ever called, NO network is ever
 * touched. The 25 smart tools all call browserSid(context) as their FIRST
 * execute statement (BrowserSmartTools.ts:177/244/288/342/394/444/479/528/
 * 594/656/715/854/916/1077/1169/1230/1323/1408/1486/1571/1617/1758/1880/
 * 1915/2081); the probe context carries NO sessionId/browserSessionId and
 * ToolService injects none for these names (injection is browser_run /
 * visual_qa / codebase_navigator only, ToolService.ts:562), so every one
 * throws 'browser_session_required' before any launch/model/network work.
 * ToolService catch (:968-970) normalizes the throw via formatToolError,
 * which returns err.stack for Errors (:45) — so the probe asserts
 * error INCLUDES 'browser_session_required' (never exact equality), and
 * records 'browserSid' frame presence as guard-origin evidence.
 *
 * Same isolated tsx method as 110-123: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, zero network, CWD = the sandbox dir itself (tsx by
 * absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-124.
 * NO AUTO_APPROVE_* set at any point. No source edited.
 *
 * Expectations derived from source BEFORE the run:
 * - ToolService.ts:142-203 classifyToolRisk: every browser name below is
 *   'medium' (browser_run with empty actions is medium, :175-194), so all
 *   reach their handlers under default autoSafe (bypass OFF, hermetic).
 * - ToolService.ts:623 start line logs BOTH names:
 *   'start <effective> (orig=<asked>)' — alias rewrites are observable
 *   without any handler behavior (browser_open/browser_get_state/web_search
 *   pins use this).
 * - ToolService.ts:344-353 browser_open -> browser_run (+ user-url goto
 *   unshift, google fallback only when url AND actions are empty — the
 *   fallback branch is what the {} probe exercises; no navigation runs
 *   because the handler returns sessionId_required first).
 * - ToolService.ts:354-367 browser_get_state/browser_snapshot ->
 *   browser_run (+ ui_audit action).
 * - ToolService.ts:368-378 web_search -> browser_run (+ agentSearchUrl goto;
 *   pure string builder, no network). PLAN side maps web_search ->
 *   search_api instead (plan-tools.ts:234 TOOL_ALIASES; PlanningEngine
 *   :3447) — the probe live-pins the DISPATCH side of that divergence.
 * - BrowserRunTool.ts:247-248: empty input.sessionId -> exact return
 *   'sessionId_required' (no throw, no launch).
 * - BrowserActionTool.ts:39-44 + :196-198: execute(input) takes NO context;
 *   getBrowserSession(undefined) throws 'sessionId_required'
 *   (manager.ts:1068-1069, first statement — pre-launch); the tool catch
 *   returns e.message EXACTLY.
 * - BrowserVisionTool.ts:39, ScreenshotTool.ts:67, PageFixTool.ts:123,
 *   UiFixTool.ts:61-62, UserBrowserTool.ts:44-47, GoogleAccountTool.ts:55-59:
 *   exact pre-launch/pre-network guard returns (see case expects).
 * - VisualComparisonTool (ScreenshotTool.ts:232-233): {} -> exact
 *   'Baseline screenshot not found' (existsSync('') is false; no files read).
 * - VideoActionTool.ts:56-57: unknown action -> exact 'Unknown action'
 *   (pre-spawn; valid actions interpolate inputFile/options into an ffmpeg
 *   shell string — source-traced only, NEVER probed live with metachar).
 * - visual_qa: implemented (VisualQATool.ts:13) but NOT registered (registry
 *   imports it at :14 yet never instantiates it; known since 072, locked in
 *   ORPHANED=4 since 085) -> 'unknown_tool: "visual_qa"...' (:714-717).
 * - manager.ts:1203 liveBrowserSessionCount() exposes sessions.size for the
 *   no-launch pin (0 before AND after the whole battery).
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-124
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-124-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import { liveBrowserSessionCount } from 'D:/Joe/muse-worktree/api/src/modules/browser/manager';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
}

const SMART_25 = [
  'browser_extract_data',
  'browser_check_links',
  'browser_performance',
  'browser_seo_audit',
  'browser_console_scan',
  'browser_save_pdf',
  'browser_readability',
  'browser_contrast_audit',
  'browser_a11y_deep',
  'browser_extract_meta',
  'browser_compare',
  'browser_summarize',
  'browser_ui_audit',
  'browser_fill_form',
  'browser_translate',
  'browser_responsive_check',
  'browser_find_text',
  'browser_design_tokens',
  'browser_click',
  'browser_fullpage_shot',
  'browser_smart_agent',
  'browser_autofix',
  'browser_consent',
  'browser_search',
  'browser_launch',
];

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
  const wsA = path.join(extRoot, 'probe-ws-124');
  const attr = { workspaceId: 'probe-ws-124', userId: 'probe-user-124' } as any;
  try { fs.mkdirSync(wsA, { recursive: true }); } catch { /* pin fails loudly below */ }

  await executionFirewall.runInContext('muse-124-probe', async () => {
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
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-123',
    });

    const r1: any = await executeTool('echo', { text: 'probe-124' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-124',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-124')}`,
      pass: r1?.ok === true && out1.includes('probe-124'),
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

    const sessionsBefore = liveBrowserSessionCount();

    // S1-S25: every smart tool, no session -> browser_session_required throw,
    // normalized by ToolService catch to a stack string. Gate on the stable
    // substring; record the browserSid frame as guard-origin evidence.
    for (const name of SMART_25) {
      let r: any = null;
      let threw: string | null = null;
      try {
        r = await executeTool(name, {}, attr);
      } catch (e: any) {
        threw = String(e?.message || e).slice(0, 120);
      }
      const err = String(r?.error || '');
      const ok = r?.ok === false && threw === null && err.includes('browser_session_required');
      results.push({
        case: `S-${name}`, expect: 'ok=false error includes browser_session_required (throw normalized, pre-launch)',
        actual: `ok=${r?.ok} threw=${threw ?? 'no'} has_session_err=${err.includes('browser_session_required')} has_browserSid_frame=${err.includes('browserSid')} err_head=${err.slice(0, 90)}`,
        pass: ok,
        detail: 'SESSION-GUARD pin BrowserSmartTools browserSid-first: no executeTool escape, no launch, no model call, no network',
      });
    }

    // S-order: a plausible input still hits the session guard FIRST.
    const so: any = await executeTool('browser_extract_data', { url: 'https://example.com' }, attr);
    const soErr = String(so?.error || '');
    results.push({
      case: 'S-order-url-still-session-guarded', expect: 'ok=false error includes browser_session_required (guard precedes input handling)',
      actual: `ok=${so?.ok} has_session_err=${soErr.includes('browser_session_required')} err_head=${soErr.slice(0, 90)}`,
      pass: so?.ok === false && soErr.includes('browser_session_required'),
      detail: 'ORDER pin: browserSid is the first execute statement — input shape cannot bypass it',
    });

    // B1: browser_run with no session -> exact handler return.
    const b1: any = await executeTool('browser_run', {}, attr);
    results.push({
      case: 'B1-browser-run-no-session', expect: "ok=false error='sessionId_required' (exact handler return)",
      actual: `ok=${b1?.ok} error=${String(b1?.error || '').slice(0, 60)}`,
      pass: b1?.ok === false && String(b1?.error || '') === 'sessionId_required',
      detail: 'GUARD pin BrowserRunTool.ts:247-248: input.sessionId gate before auth/launch; ToolService injected no session (no context session to inject)',
    });

    // B2/B3: alias rewrites observable in the start line, handler still guards.
    const b2: any = await executeTool('browser_open', {}, attr);
    const b2logs: string[] = Array.isArray(b2?.logs) ? (b2.logs as any[]).map(String) : [];
    const b2ok = b2?.ok === false && String(b2?.error || '') === 'sessionId_required'
      && b2logs.some((l) => l.includes('start browser_run (orig=browser_open)'));
    results.push({
      case: 'B2-browser-open-alias', expect: "start line 'start browser_run (orig=browser_open)' + error='sessionId_required'",
      actual: `ok=${b2?.ok} error=${String(b2?.error || '').slice(0, 60)} startlog=${b2logs.some((l) => l.includes('start browser_run'))}`,
      pass: b2ok,
      detail: 'ALIAS pin ToolService.ts:344-353: browser_open rewrites to browser_run pre-registry; google fallback action built but never runs (handler guards first)',
    });

    const b3: any = await executeTool('browser_get_state', {}, attr);
    const b3logs: string[] = Array.isArray(b3?.logs) ? (b3.logs as any[]).map(String) : [];
    const b3ok = b3?.ok === false && String(b3?.error || '') === 'sessionId_required'
      && b3logs.some((l) => l.includes('start browser_run (orig=browser_get_state)'));
    results.push({
      case: 'B3-browser-get-state-alias', expect: "start line 'start browser_run (orig=browser_get_state)' + error='sessionId_required'",
      actual: `ok=${b3?.ok} error=${String(b3?.error || '').slice(0, 60)} startlog=${b3logs.some((l) => l.includes('start browser_run'))}`,
      pass: b3ok,
      detail: 'ALIAS pin ToolService.ts:354-360: browser_get_state rewrites to browser_run (+ui_audit); handler guards before acting',
    });

    // B4: dispatch-side live pin of the web_search divergence (plan side maps
    // web_search -> search_api via TOOL_ALIASES at plan-tools.ts:234).
    const b4: any = await executeTool('web_search', { query: 'joe-probe-124' }, attr);
    const b4logs: string[] = Array.isArray(b4?.logs) ? (b4.logs as any[]).map(String) : [];
    const b4ok = b4?.ok === false && String(b4?.error || '') === 'sessionId_required'
      && b4logs.some((l) => l.includes('start browser_run (orig=web_search)'));
    results.push({
      case: 'B4-web-search-dispatch-divergence', expect: "start line 'start browser_run (orig=web_search)' + error='sessionId_required'",
      actual: `ok=${b4?.ok} error=${String(b4?.error || '').slice(0, 60)} startlog=${b4logs.some((l) => l.includes('start browser_run'))}`,
      pass: b4ok,
      detail: 'DIVERGENCE pin ToolService.ts:368-378: DISPATCH resolves web_search->browser_run while PLAN resolves web_search->search_api (TOOL_ALIASES, plan-tools.ts:234) — second live divergent-shadow instance after run_command (T5-117/OBS-118-2)',
    });

    // B5: browser_action takes NO context; the manager throw is its only guard.
    const b5: any = await executeTool('browser_action', {}, attr);
    const b5logs: string[] = Array.isArray(b5?.logs) ? (b5.logs as any[]).map(String) : [];
    const b5ok = b5?.ok === false && String(b5?.error || '') === 'sessionId_required'
      && b5logs.some((l) => l.includes('action_failed='));
    results.push({
      case: 'B5-browser-action-no-own-guard', expect: "ok=false error='sessionId_required' (exact e.message) + action_failed log",
      actual: `ok=${b5?.ok} error=${String(b5?.error || '').slice(0, 60)} failedlog=${b5logs.some((l) => l.includes('action_failed='))}`,
      pass: b5ok,
      detail: 'MANAGER-THROW pin BrowserActionTool.ts:44/:196-198: no own sid check and NO context param — getBrowserSession(undefined) throws pre-launch (manager.ts:1068-1069) and the tool catch returns e.message exactly',
    });

    // B6/B7/B8/B9: exact pre-launch/pre-spawn guard returns.
    const b6: any = await executeTool('browser_vision', {}, attr);
    results.push({
      case: 'B6-browser-vision-no-url', expect: "ok=false error='browser_vision needs a url to open.'",
      actual: `ok=${b6?.ok} error=${String(b6?.error || '').slice(0, 80)}`,
      pass: b6?.ok === false && String(b6?.error || '') === 'browser_vision needs a url to open.',
      detail: 'GUARD pin BrowserVisionTool.ts:39; no launch without a url',
    });

    const b7: any = await executeTool('screenshot', {}, attr);
    results.push({
      case: 'B7-screenshot-no-url', expect: "ok=false error='screenshot needs a url to capture.'",
      actual: `ok=${b7?.ok} error=${String(b7?.error || '').slice(0, 80)}`,
      pass: b7?.ok === false && String(b7?.error || '') === 'screenshot needs a url to capture.',
      detail: 'GUARD pin ScreenshotTool.ts:67; no capture without a url',
    });

    const b8: any = await executeTool('visual_compare', {}, attr);
    results.push({
      case: 'B8-visual-compare-no-baseline', expect: "ok=false error='Baseline screenshot not found'",
      actual: `ok=${b8?.ok} error=${String(b8?.error || '').slice(0, 80)}`,
      pass: b8?.ok === false && String(b8?.error || '') === 'Baseline screenshot not found',
      detail: 'GUARD pin ScreenshotTool.ts:232-233: existsSync gate before any file read (pure file compare, no browser involved)',
    });

    const b9: any = await executeTool('video_action', { action: 'bogus-124' }, attr);
    results.push({
      case: 'B9-video-action-unknown', expect: "ok=false error='Unknown action'",
      actual: `ok=${b9?.ok} error=${String(b9?.error || '').slice(0, 60)}`,
      pass: b9?.ok === false && String(b9?.error || '') === 'Unknown action',
      detail: 'GUARD pin VideoActionTool.ts:56-57: pre-spawn; valid actions interpolate inputFile/options into ffmpeg shell (source-traced only, never probed live)',
    });

    // C1/C2: user_browser status positive + extension gate.
    const c1: any = await executeTool('user_browser', { action: 'status' }, attr);
    const c1out = JSON.stringify((c1 as any)?.output ?? {});
    const c1ok = c1?.ok === true && c1out.includes('"connected":false');
    results.push({
      case: 'C1-user-browser-status', expect: 'ok=true output.connected=false (honest no-extension state)',
      actual: `ok=${c1?.ok} error=${String(c1?.error || 'none').slice(0, 60)} output=${c1out.slice(0, 140)}`,
      pass: c1ok,
      detail: 'POSITIVE pin UserBrowserTool.ts:39-42: status answers without an extension; nothing launched, nothing sent',
    });

    const c2: any = await executeTool('user_browser', { action: 'open', url: 'https://example.com' }, attr);
    results.push({
      case: 'C2-user-browser-ext-gate', expect: "ok=false error='extension_not_connected' (pre-command)",
      actual: `ok=${c2?.ok} error=${String(c2?.error || '').slice(0, 60)}`,
      pass: c2?.ok === false && String(c2?.error || '') === 'extension_not_connected',
      detail: 'GATE pin UserBrowserTool.ts:44-47: refuses before sendCommand — no touch of any real browser',
    });

    // C3: google_account pre-token gate (zero network).
    const c3: any = await executeTool('google_account', {}, attr);
    results.push({
      case: 'C3-google-not-connected', expect: "ok=false error='google_not_connected' (pre-token)",
      actual: `ok=${c3?.ok} error=${String(c3?.error || '').slice(0, 60)}`,
      pass: c3?.ok === false && String(c3?.error || '') === 'google_not_connected',
      detail: 'GATE pin GoogleAccountTool.ts:55-59: isConnected check before getAccessToken/gfetch — zero network for an unconnected user',
    });

    // C4/C5: fix-tool pre-launch guards.
    const c4: any = await executeTool('browser_ui_fix', {}, attr);
    results.push({
      case: 'C4-ui-fix-no-project', expect: "ok=false error='no_project' (pre-audit)",
      actual: `ok=${c4?.ok} error=${String(c4?.error || '').slice(0, 60)}`,
      pass: c4?.ok === false && String(c4?.error || '') === 'no_project',
      detail: 'GUARD pin UiFixTool.ts:61-62: projectDir gate before auditBuiltApp/rebuild — zero spawn',
    });

    const c5: any = await executeTool('browser_page_fix', {}, attr);
    results.push({
      case: 'C5-page-fix-no-url', expect: "ok=false error='no_url' (pre-launch)",
      actual: `ok=${c5?.ok} error=${String(c5?.error || '').slice(0, 60)}`,
      pass: c5?.ok === false && String(c5?.error || '') === 'no_url',
      detail: 'GUARD pin PageFixTool.ts:123: url gate before getBrowserSession(PANEL_BROWSER_SID) + page.goto — zero launch',
    });

    // O1: visual_qa orphan dispatch re-pin (implemented, never registered).
    const o1: any = await executeTool('visual_qa', {}, attr);
    const o1err = String(o1?.error || '');
    results.push({
      case: 'O1-visual-qa-orphan', expect: 'ok=false error starts \'unknown_tool: "visual_qa"\'',
      actual: `ok=${o1?.ok} error=${o1err.slice(0, 120)}`,
      pass: o1?.ok === false && o1err.startsWith('unknown_tool: "visual_qa"'),
      detail: 'ORPHAN pin (known since 072, locked ORPHANED=4 since 085): VisualQATool imported at registry.ts:14 but never instantiated — dispatch-unreachable live, second orphan re-pin after image_generate (110)',
    });

    const sessionsAfter = liveBrowserSessionCount();
    results.push({
      case: 'Z0-no-browser-launched', expect: 'liveBrowserSessionCount 0 before AND 0 after the whole battery',
      actual: `before=${sessionsBefore} after=${sessionsAfter}`,
      pass: sessionsBefore === 0 && sessionsAfter === 0,
      detail: 'NO-LAUNCH pin manager.ts:1203: the entire 124 battery refused before session creation — zero Chromium, zero navigation, zero model spend',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-124-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-124-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
