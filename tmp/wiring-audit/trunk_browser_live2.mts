// MUSE wiring-audit checkpoint 10b: browser_ui LEVEL-4 follow-up (contained).
// Q1: browser_launch positive via probe-owned loopback server (about:blank is
//     impossible: openPage->normalizeUrl mangles it to https://about:blank).
// Q2: browser_run goto data-URL full-output capture on a FRESH session (live1
//     showed navigation_failed + marker-true on a reused session — ambiguous).
// Q3: browser_run goto loopback-URL positive (same fixture server).
// Same safety model as live1: ephemeral headless only, sandbox dirs, approval
// gate active, loopback-only traffic, all sessions closed + server stopped.
// Run from api/ with the live1 env + BROWSER_EXECUTABLE_PATH.
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx-browselive2');
const imp = (p: string) => import(pathToFileURL(p).href);

const CALL_TIMEOUT_MS = 30000;
const LAUNCH_TIMEOUT_MS = 90000;
const MARKER = 'AUDIT MARKER SEVEN SEVEN';
const DATA_URL = 'data:text/html,<html><head><title>AuditSeven</title></head><body><h1>' + MARKER + '</h1></body></html>';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

function envFlag(name: string): string { return String(process.env[name] ?? '').trim(); }

function assertEphemeral(tag: string) {
  const bad: string[] = [];
  if (envFlag('BROWSER_HEADLESS') !== 'true') bad.push('BROWSER_HEADLESS!=true');
  for (const k of ['USE_USER_BROWSER_PROFILE', 'USE_SYSTEM_CHROME', 'BROWSER_PERSISTENT_PROFILE']) {
    const v = envFlag(k);
    if (v !== '' && v !== '0' && v.toLowerCase() !== 'false') bad.push(`${k}=${v}`);
  }
  if (envFlag('AUTO_APPROVE_ALL') === '1') bad.push('AUTO_APPROVE_ALL=1');
  if (envFlag('ENABLE_AUTH_BYPASS') === 'true') bad.push('ENABLE_AUTH_BYPASS=true');
  if (bad.length) { console.error(`BROWSELIVE2_ABORT ${tag}: ${bad.join('; ')}`); process.exit(1); }
}

function summarize(out: any): any {
  if (!out || typeof out !== 'object') return { shape: String(out) };
  const s: any = {};
  for (const k of ['sessionId', 'pageUrl', 'title', 'summary', 'success', 'result', 'message']) {
    if (out[k] !== undefined) s[k] = String(out[k]).slice(0, 300);
  }
  if (out.dom !== undefined) s.domLen = String(out.dom).length;
  if (out.screenshotHref !== undefined) s.hasShot = !!out.screenshotHref;
  return s;
}

async function main() {
  assertEphemeral('startup');
  fs.mkdirSync(FX, { recursive: true });
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`BROWSELIVE2_ABORT registered=${tools.length}`); process.exit(1); }
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const manager: any = await imp(path.join(SRC, 'modules', 'browser', 'manager.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const live: Record<string, any> = {};

  async function canon(id: string, name: string, input: any, timeoutMs: number, ctx: any) {
    const raced = await withTimeout(
      fw.executionFirewall.runInContext('audit-trace2', () => executeTool(name, input, ctx),
        { userId: ctx.userId, sessionId: ctx.sessionId, runId: 'audit-run2' }),
      timeoutMs);
    if (raced.timedOut) { live[id] = { timedOut: true }; return null; }
    const r: any = raced.value;
    live[id] = { ok: r?.ok ?? null, error: String(r?.error ?? '').slice(0, 300) || null, output: summarize(r?.output) };
    return r;
  }

  // Probe-owned loopback fixture server (127.0.0.1 only, ephemeral port).
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><head><title>LoopSeven</title></head><body><h1>${MARKER}</h1></body></html>`);
  });
  await new Promise<void>((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', () => res()); });
  const port = (server.address() as any).port;
  const LOOP_URL = `http://127.0.0.1:${port}/`;
  live['fixture_server'] = { host: '127.0.0.1', port, path: '/' };

  try {
    // Q1: contained launch positive.
    process.env.BROWSER_HOME_URL = LOOP_URL;
    const LCTX = { sessionId: 'audit-launch2', userId: 'audit-user', traceId: 'audit-trace2' };
    assertEphemeral('pre-launch');
    const l1: any = await canon('launch_loopback', 'browser_launch', { request: 'open the browser' }, LAUNCH_TIMEOUT_MS, LCTX);
    if (l1 && l1.ok !== false && l1.error !== 'approval_required') {
      try {
        const s = await manager.getBrowserSession('browser:audit-launch2');
        live['launch_loopback'].sessionUrl = String(s?.page?.url?.() || '').slice(0, 120);
        live['launch_loopback'].sessionTitle = String(await s?.page?.title?.().catch(() => '') || '').slice(0, 80);
      } catch (e: any) { live['launch_loopback'].sessionProbe = `failed:${String(e?.message || e).slice(0, 100)}`; }
    }

    // Q2: browser_run goto data-URL on a FRESH session (full output).
    const R2 = 'browser:run2-user';
    const R2CTX = { sessionId: 'run2-user', userId: 'run2-user', traceId: 'audit-trace2' };
    assertEphemeral('pre-run-data');
    await canon('run_goto_data_fresh', 'browser_run',
      { sessionId: R2, actions: [{ type: 'goto', url: DATA_URL }, { type: 'extract_text' }] }, LAUNCH_TIMEOUT_MS, R2CTX);

    // Q3: browser_run goto loopback-URL positive.
    assertEphemeral('pre-run-loop');
    await canon('run_goto_loopback', 'browser_run',
      { sessionId: R2, actions: [{ type: 'goto', url: LOOP_URL }, { type: 'extract_text' }] }, LAUNCH_TIMEOUT_MS, R2CTX);
    live['run_goto_loopback'].hasMarker = String(JSON.stringify(live['run_goto_loopback'].output || '')).includes('SEVEN');

    // Q4: raw output shape of a run extract_text leg (where does text surface?).
    const R3 = 'browser:run3-user';
    const R3CTX = { sessionId: 'run3-user', userId: 'run3-user', traceId: 'audit-trace2' };
    assertEphemeral('pre-run-raw');
    const raced: any = await withTimeout(
      fw.executionFirewall.runInContext('audit-trace2',
        () => executeTool('browser_run', { sessionId: R3, actions: [{ type: 'goto', url: LOOP_URL }, { type: 'extract_text' }] }, R3CTX),
        { userId: 'run3-user', sessionId: 'run3-user', runId: 'audit-run2' }),
      LAUNCH_TIMEOUT_MS);
    if (!raced.timedOut) {
      const r = raced.value as any;
      const out = r?.output && typeof r.output === 'object' ? r.output : {};
      const raw: any = { ok: r?.ok ?? null, error: String(r?.error ?? '').slice(0, 200) || null, keys: Object.keys(out) };
      for (const k of Object.keys(out)) {
        const v = (out as any)[k];
        raw[k] = typeof v === 'string' ? (v.length > 200 ? v.slice(0, 200) + `…[len=${v.length}]` : v) : (Array.isArray(v) ? `array[${v.length}]` : typeof v);
      }
      raw.hasMarkerAnywhere = JSON.stringify(out).includes('SEVEN');
      live['run_extract_raw'] = raw;
    } else live['run_extract_raw'] = { timedOut: true };
    try { await manager.stopStreaming(R3); await manager.stopSession(R3); } catch { /* ignore */ }
  } finally {
    const closed: Record<string, string> = {};
    for (const sid of ['browser:audit-launch2', 'browser:run2-user']) {
      try { await manager.stopStreaming(sid); await manager.stopSession(sid); closed[sid] = 'closed'; }
      catch (e: any) { closed[sid] = `close_failed:${String(e?.message || e).slice(0, 80)}`; }
    }
    live['closedSessions'] = closed;
    await new Promise<void>(res => server.close(() => res()));
    live['fixture_server_closed'] = true;
    try { fs.rmSync(FX, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  fs.writeFileSync(path.join(HERE, 'trunk_browser_live2.json'), JSON.stringify({ generated: new Date().toISOString(), live }, null, 2));
  console.log(`BROWSELIVE2_DONE cases=${Object.keys(live).length}`);
}

main().catch(e => { console.error(`BROWSELIVE2_ABORT uncaught:${String(e?.stack || e).slice(0, 500)}`); process.exit(1); });
