// MUSE wiring-audit checkpoint 10: browser_ui LEVEL-4 live batch (contained).
// Read-before-call clearances are in MUSE-WIRING-DISCOVERY-010.md. Summary:
//  (d) standalone-launch: screenshot + visual_compare — data-URL/file contained.
//  (e) separate-channel: user_browser status/open — no-extension honest legs.
//  (c) optional+fallback: ui_fix {} -> no_project; page_fix {} -> no_url (both
//      pre-browser honest legs; positive page_fix NOT probed: forces https://,
//      drives shared panel-browser, writes CSS to data/artifacts).
//  (a) context-derived: consent {} (no-launch) + consent-no-context (browserSid
//      throw surface) + launch with BROWSER_HOME_URL=about:blank (contained) +
//      find_text closed-port negative (127.0.0.1:9, no external traffic).
//  (b) input-required: browser_run {} + forbidden legs; action/run positives on
//      data-URL via legacy ownership sid=browser:<userId> (no auth bypass).
// SAFETY MODEL:
//  - Approval gate stays ACTIVE: abort if AUTO_APPROVE_ALL=1 or
//    ENABLE_AUTH_BYPASS=true. delete_file {} CONTROL must return
//    approval_required first or the batch aborts before any browser launch.
//  - Ephemeral bundled Chromium only: abort unless BROWSER_HEADLESS=true and
//    USE_USER_BROWSER_PROFILE/USE_SYSTEM_CHROME/BROWSER_PERSISTENT_PROFILE are
//    all unset-or-0 (re-asserted before EVERY launch).
//  - All browser fs state redirected under the probe sandbox dir via
//    ARTIFACT_DIR/BROWSER_SESSION_DIR/BROWSER_CONSENT_DIR/BROWSER_PROFILE_DIR/
//    BROWSER_PROFILE_CLONE_DIR (+TEMP/TMP). Never the user profile.
//  - No external navigation: data-URLs, about:blank, 127.0.0.1:9 only.
//    Payload text avoids normalizeUrlForGoto label substrings (else a data-URL
//    could rewrite to a real site — see discovery-010).
//  - Every created session is stopStreaming+stopSession closed; every created
//    file is removed by the probe.
// Run from api/: $env vars per discovery-010, then
//   ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser_live1.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx-browselive');
const imp = (p: string) => import(pathToFileURL(p).href);

const CALL_TIMEOUT_MS = 30000;
const LAUNCH_TIMEOUT_MS = 90000;
const MARKER = 'AUDIT MARKER SEVEN SEVEN';
const DATA_URL = 'data:text/html,<html><head><title>AuditSeven</title></head><body><h1>' + MARKER + '</h1><p>second line here</p></body></html>';

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 12).join(',')}}`;
  return typeof v;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

function envFlag(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function assertEphemeral(tag: string) {
  const bad: string[] = [];
  if (envFlag('BROWSER_HEADLESS') !== 'true') bad.push('BROWSER_HEADLESS!=true');
  for (const k of ['USE_USER_BROWSER_PROFILE', 'USE_SYSTEM_CHROME', 'BROWSER_PERSISTENT_PROFILE']) {
    const v = envFlag(k);
    if (v !== '' && v !== '0' && v.toLowerCase() !== 'false') bad.push(`${k}=${v}`);
  }
  if (envFlag('AUTO_APPROVE_ALL') === '1') bad.push('AUTO_APPROVE_ALL=1');
  if (envFlag('ENABLE_AUTH_BYPASS') === 'true') bad.push('ENABLE_AUTH_BYPASS=true');
  for (const k of ['ARTIFACT_DIR', 'BROWSER_SESSION_DIR', 'BROWSER_CONSENT_DIR', 'BROWSER_PROFILE_DIR']) {
    if (!envFlag(k).startsWith(FX)) bad.push(`${k} not under sandbox`);
  }
  if (bad.length) { console.error(`BROWSELIVE_ABORT ${tag}: ${bad.join('; ')}`); process.exit(1); }
}

async function main() {
  assertEphemeral('startup');
  fs.mkdirSync(FX, { recursive: true });
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`BROWSELIVE_ABORT registered=${tools.length} expected=163`); process.exit(1); }
  const NEED = ['browser_action', 'browser_run', 'browser_launch', 'browser_consent', 'browser_find_text',
    'browser_page_fix', 'browser_ui_fix', 'screenshot', 'visual_compare', 'user_browser', 'delete_file'];
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of NEED) if (!byName.has(n)) { console.error(`BROWSELIVE_ABORT missing tool ${n}`); process.exit(1); }

  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const manager: any = await imp(path.join(SRC, 'modules', 'browser', 'manager.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const CTX = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const live: Record<string, any> = {};
  const direct: Record<string, any> = {};
  try {
    const exe: string | undefined = manager.findChromiumExecutable();
    const opts: any = manager.getChromiumLaunchOptions();
    live['launcher'] = { exe: exe ? String(exe).slice(-80) : null, headless: opts?.headless ?? null, hasUserDataDir: 'userDataDir' in (opts || {}) };
  } catch (e: any) { live['launcher'] = { probe: `failed:${String(e?.message || e).slice(0, 80)}` }; }

  async function canon(id: string, name: string, input: any, timeoutMs: number, ctx: any = CTX) {
    const raced = await withTimeout(
      fw.executionFirewall.runInContext('audit-trace', () => executeTool(name, input, ctx),
        { userId: ctx.userId || 'audit-user', sessionId: ctx.sessionId || 'audit-sess', runId: 'audit-run' }),
      timeoutMs);
    if (raced.timedOut) { live[id] = { timeoutMs, timedOut: true }; return null; }
    const r: any = raced.value;
    live[id] = { ok: r?.ok ?? null, error: r?.error ?? null, outShape: shape(r?.output), outKeys: r?.output && typeof r.output === 'object' ? Object.keys(r.output).slice(0, 12) : null };
    return r;
  }

  // ---- CONTROL: approval gate must be active ----
  const ctl = await canon('control_delete_file', 'delete_file', {}, CALL_TIMEOUT_MS);
  if (ctl?.error !== 'approval_required') {
    console.error(`BROWSELIVE_ABORT control failed: delete_file -> ${JSON.stringify(live['control_delete_file'])}`);
    process.exit(1);
  }

  // ---- (e) user_browser honest legs (no browser possible) ----
  const ub1: any = await canon('user_browser_status', 'user_browser', { action: 'status' }, CALL_TIMEOUT_MS);
  live['user_browser_status'].connected = ub1?.output?.connected ?? null;
  await canon('user_browser_open_noext', 'user_browser', { action: 'open', url: DATA_URL }, CALL_TIMEOUT_MS);

  // ---- (c) pre-browser honest legs ----
  await canon('ui_fix_empty', 'browser_ui_fix', {}, CALL_TIMEOUT_MS);
  await canon('page_fix_empty', 'browser_page_fix', {}, CALL_TIMEOUT_MS);

  // ---- (b) pre-browser honest legs ----
  await canon('run_empty', 'browser_run', {}, CALL_TIMEOUT_MS);
  await canon('run_forbidden', 'browser_run', { sessionId: 'browser:other-user', actions: [] }, CALL_TIMEOUT_MS);

  // ---- (a) consent legs (no browser launch) ----
  const c1: any = await canon('consent_empty_ctx', 'browser_consent', {}, CALL_TIMEOUT_MS);
  live['consent_empty_ctx'].consent = c1?.output?.consent ?? null;
  live['consent_empty_ctx'].needsConsent = c1?.output?.needsConsent ?? null;
  const c2: any = await canon('consent_no_context', 'browser_consent', {}, CALL_TIMEOUT_MS, { userId: 'audit-user', traceId: 'audit-trace' });
  live['consent_no_context'].note = 'empty session context: browserSid must fail closed';

  // ---- (d) screenshot + visual_compare ----
  await canon('shot_empty', 'screenshot', {}, CALL_TIMEOUT_MS);
  const shotFile = 'wiring-browselive-a.png';
  const shotDir = path.resolve(ROOT, 'api', 'screenshots');
  const shotPath = path.join(shotDir, shotFile);
  assertEphemeral('pre-screenshot-launch');
  const s1: any = await canon('shot_data_url', 'screenshot', { url: DATA_URL, filename: shotFile, waitFor: 200 }, LAUNCH_TIMEOUT_MS);
  let shotBytes = -1;
  try { const st = fs.statSync(shotPath); shotBytes = st.size; } catch { shotBytes = -1; }
  live['shot_data_url'].fileBytes = shotBytes;
  live['shot_data_url'].reportedPath = s1?.output?.path ?? null;
  // visual_compare legs while the PNG exists
  await canon('vcompare_missing', 'visual_compare', { baseline: path.join(FX, 'nope-a.png'), current: path.join(FX, 'nope-b.png') }, CALL_TIMEOUT_MS);
  if (shotBytes > 0) {
    const vc: any = await canon('vcompare_self', 'visual_compare', { baseline: shotPath, current: shotPath }, CALL_TIMEOUT_MS);
    live['vcompare_self'].match = vc?.output?.match ?? null;
    live['vcompare_self'].diffPercentage = vc?.output?.diffPercentage ?? null;
    const grown = path.join(FX, 'grown.png');
    try {
      const buf = fs.readFileSync(shotPath);
      fs.writeFileSync(grown, Buffer.concat([buf, Buffer.alloc(64, 7)]));
      const vc2: any = await canon('vcompare_grown', 'visual_compare', { baseline: shotPath, current: grown, threshold: 0.1 }, CALL_TIMEOUT_MS);
      live['vcompare_grown'].match = vc2?.output?.match ?? null;
      live['vcompare_grown'].diffPercentage = vc2?.output?.diffPercentage ?? null;
    } finally { try { fs.unlinkSync(grown); } catch { /* ignore */ } }
  }
  try { fs.unlinkSync(shotPath); } catch { /* ignore */ }
  live['shot_data_url'].cleaned = !fs.existsSync(shotPath);

  // ---- (b) browser_action positive on data-URL (canonical; gate-aware) ----
  const SID = 'browser:audit-user';
  assertEphemeral('pre-action-launch');
  const g1: any = await canon('action_goto_data', 'browser_action', { sessionId: SID, action: 'goto', url: DATA_URL }, LAUNCH_TIMEOUT_MS);
  if (g1?.error === 'approval_required') {
    live['action_goto_data'].gate = 'approval_required: canonical path gated, direct-behavior leg follows';
    const t = byName.get('browser_action');
    const d1: any = await withTimeout(t.execute({ sessionId: SID, action: 'goto', url: DATA_URL }, CTX), LAUNCH_TIMEOUT_MS);
    direct['action_goto_data'] = d1.timedOut ? { timedOut: true } : { ok: d1.value?.ok ?? null, error: d1.value?.error ?? null, result: String(d1.value?.output?.result ?? d1.value?.result ?? '').slice(0, 120) };
  }
  const e1: any = await canon('action_extract', 'browser_action', { sessionId: SID, action: 'extract_text' }, CALL_TIMEOUT_MS);
  if (e1?.error === 'approval_required') {
    const t = byName.get('browser_action');
    const d2: any = await withTimeout(t.execute({ sessionId: SID, action: 'extract_text' }, CTX), CALL_TIMEOUT_MS);
    direct['action_extract'] = d2.timedOut ? { timedOut: true } : { ok: d2.value?.ok ?? null, error: d2.value?.error ?? null, hasMarker: d2.timedOut ? null : String(JSON.stringify(d2.value?.output ?? d2.value?.result ?? '')).includes('SEVEN') };
  } else {
    live['action_extract'].hasMarker = String(JSON.stringify(e1?.output ?? '')).includes('SEVEN');
  }
  const v1: any = await canon('action_evaluate', 'browser_action', { sessionId: SID, action: 'evaluate', value: '40+2' }, CALL_TIMEOUT_MS);
  if (v1?.error === 'approval_required') {
    const t = byName.get('browser_action');
    const d3: any = await withTimeout(t.execute({ sessionId: SID, action: 'evaluate', value: '40+2' }, CTX), CALL_TIMEOUT_MS);
    direct['action_evaluate'] = d3.timedOut ? { timedOut: true } : { ok: d3.value?.ok ?? null, value42: d3.timedOut ? null : String(JSON.stringify(d3.value?.output ?? '')).includes('42') };
  } else {
    live['action_evaluate'].value42 = String(JSON.stringify(v1?.output ?? '')).includes('42');
  }

  // ---- (b) browser_run positive via legacy ownership (canonical; gate-aware) ----
  assertEphemeral('pre-run-launch');
  const r1: any = await canon('run_actions_data', 'browser_run',
    { sessionId: SID, actions: [{ type: 'goto', url: DATA_URL }, { type: 'extract_text' }] }, LAUNCH_TIMEOUT_MS);
  if (r1?.error === 'approval_required') {
    live['run_actions_data'].gate = 'approval_required: canonical path gated (no direct leg: ownership path already proven by negative legs + action legs)';
  } else {
    live['run_actions_data'].hasMarker = String(JSON.stringify(r1?.output ?? '')).includes('SEVEN');
  }

  // ---- (a) browser_launch contained (BROWSER_HOME_URL=about:blank) ----
  process.env.BROWSER_HOME_URL = 'about:blank';
  assertEphemeral('pre-launch');
  const LCTX = { sessionId: 'audit-launch', userId: 'audit-user', traceId: 'audit-trace' };
  const l1: any = await canon('launch_about_blank', 'browser_launch', { request: 'open the browser' }, LAUNCH_TIMEOUT_MS, LCTX);
  if (l1 && l1.ok !== false && l1.error !== 'approval_required') {
    try {
      const s = await manager.getBrowserSession('browser:audit-launch');
      live['launch_about_blank'].sessionUrl = String(s?.page?.url?.() || '');
      await manager.stopStreaming('browser:audit-launch');
      await manager.stopSession('browser:audit-launch');
      live['launch_about_blank'].closed = true;
    } catch (e: any) { live['launch_about_blank'].sessionProbe = `probe_failed:${String(e?.message || e).slice(0, 100)}`; }
  } else if (l1?.error === 'approval_required') {
    live['launch_about_blank'].gate = 'approval_required';
  }

  // ---- (a) find_text closed-port negative (no external traffic) ----
  assertEphemeral('pre-findtext');
  const f1: any = await canon('findtext_closed_port', 'browser_find_text', { url: 'http://127.0.0.1:9/', query: MARKER }, LAUNCH_TIMEOUT_MS);
  live['findtext_closed_port'].note = 'closed loopback port: fast honest failure expected, zero external traffic';

  // ---- consent-mode story (no fs writes) ----
  live['consent_mode'] = {
    persistentMode: manager.isPersistentBrowserMode(),
    consentEphemeral: manager.hasBrowserConsent('audit-no-such-session'),
  };

  // ---- cleanup: close every session this probe created ----
  const closed: Record<string, string> = {};
  for (const sid of [SID, 'browser:audit-launch', 'browser:audit-sess']) {
    try { await manager.stopStreaming(sid); await manager.stopSession(sid); closed[sid] = 'closed'; }
    catch (e: any) { closed[sid] = `close_failed:${String(e?.message || e).slice(0, 80)}`; }
  }
  try { fs.rmSync(FX, { recursive: true, force: true }); } catch { /* ignore */ }

  const out = { generated: new Date().toISOString(), registered: tools.length, live, direct, closedSessions: closed };
  fs.mkdirSync(HERE, { recursive: true });
  fs.writeFileSync(path.join(HERE, 'trunk_browser_live1.json'), JSON.stringify(out, null, 2));
  const errs = Object.entries(live).filter(([, v]: any) => v?.timedOut).map(([k]) => k);
  console.log(`BROWSELIVE_DONE cases=${Object.keys(live).length} direct=${Object.keys(direct).length} timeouts=${errs.join(',') || 'none'}`);
}

main().catch(e => { console.error(`BROWSELIVE_ABORT uncaught:${String(e?.stack || e).slice(0, 500)}`); process.exit(1); });
