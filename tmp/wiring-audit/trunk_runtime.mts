// MUSE wiring-audit checkpoint 18: runtime_services-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 5 runtime_services names
//   (deploy_pages, deploy_project, dev_server_start, project_run, project_stop)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; NO network legs; transient loopback-only
//   servers started + stopped by the probe; every live server leg is paired
//   with a project_stop leg and a port-closed check).
// EMBARGO: deploy_pages real deploy (GitHub network + token + publish —
//   only no-token/no-cwd gate legs run); deploy_project expose_port (public
//   tunnel + global npm install — code-cited only); dev_server_start full
//   start (npx --yes download + 0.0.0.0 listener + 30s wait + config write —
//   only needs-cwd/missing legs run, code-cited otherwise); project_run with
//   no args against a non-empty workspace (adoption/discovery of real
//   projects — only the empty-session {} leg runs, FIRST, before fixtures
//   exist); detectStart's pure-static `npx -y serve` branch (auto-download:
//   network — the live leg pins the local node-entry branch instead).
//   No model-present behavior is probed.
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 018 doc>
//   node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\trunk_runtime.mts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'deploy_pages', 'deploy_project', 'dev_server_start', 'project_run',
  'project_stop',
];
const TOKEN = 'WIRING_RUNTIME_TOKEN_3f9e';
const CALL_TIMEOUT_MS = 25000;
const BUILD_TIMEOUT_MS = 150000;
const RUN_TIMEOUT_MS = 90000;
const START_TIMEOUT_MS = 60000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

function scrub(s: string): string {
  return String(s)
    .replace(/Owner account \(shown once\):[^"\\]+/gi, 'Owner account (shown once):[REDACTED]')
    .replace(/Bearer [A-Za-z0-9\-._~+/=]+/g, 'Bearer [REDACTED]')
    .replace(/(password|passwd|secret|token|apiKey|api_key|authorization)["']?\s*[:=]\s*["']?[^"',}\s\\]+/gi, '$1=[REDACTED]');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

function httpGet(url: string, ms = 4000): Promise<{ status: number | null; head: string; refused: boolean }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { status: number | null; head: string; refused: boolean }) => {
      if (done) return; done = true; resolve(r);
    };
    try {
      const req = http.get(url, (res: any) => {
        let body = '';
        res.on('data', (c: any) => { body += String(c); });
        res.on('end', () => finish({ status: Number(res.statusCode || 0), head: body.slice(0, 300), refused: false }));
        res.resume();
      });
      req.on('error', (e: any) => finish({ status: null, head: String(e?.code || e?.message || e).slice(0, 120), refused: /ECONNREFUSED/i.test(String(e?.code || e?.message || '')) }));
      req.setTimeout(ms, () => { req.destroy(); finish({ status: null, head: 'TIMEOUT', refused: false }); });
    } catch (e: any) {
      finish({ status: null, head: String(e?.message || e).slice(0, 120), refused: false });
    }
  });
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_RUNTIME_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_RUNTIME_ABORT missing tool ${n}`); process.exit(1); }
  }

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const selectToolsFor = catalog.selectToolsFor as (goal: string, limit?: number) => Array<{ name: string; score: number }>;
  const excluded: Set<string> = catalog.ROUTER_EXCLUDED as Set<string>;
  let priority: Set<string> | null = null;
  try {
    const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
    const names = picker.PRIORITY_TOOL_NAMES;
    if (Array.isArray(names)) priority = new Set(names.map(String));
  } catch { priority = null; }
  const fullLimit = tools.length;

  const ledger: any = await imp(path.join(SRC, 'core', 'quality', 'verification-ledger.ts'));
  const isVerificationTool = ledger.isVerificationTool as (t: string, a?: any, e?: boolean, x?: boolean, l?: boolean) => boolean;
  const verdictOf = ledger.verificationResultFromToolResult as (v: unknown) => string;

  // ---- Part A: declarations + selection + checker partition ----
  const decl: Record<string, any> = {};
  for (const n of TRUNK) {
    const t = byName.get(n);
    const desc: string = String(t?.description || '');
    const firstSentence = desc.split(/(?<=[.])\s/)[0].slice(0, 140).trim();
    const goals = [
      `use ${n.split('_').join(' ')} for this task`,
      firstSentence ? `I need: ${firstSentence}` : `use ${n.split('_').join(' ')}`,
    ];
    const ranks = goals.map(g => {
      const top30 = selectToolsFor(g, 30);
      const all = selectToolsFor(g, fullLimit);
      return { goal: g, rank30: rankOf(top30, n), rankFull: rankOf(all, n) };
    });
    const best30 = Math.min(...ranks.map(r => r.rank30?.rank ?? Infinity));
    const bestFull = Math.min(...ranks.map(r => r.rankFull?.rank ?? Infinity));
    decl[n] = {
      descriptionHead: desc.slice(0, 160),
      tags: Array.isArray(t?.tags) ? t.tags.map(String) : [],
      required: Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : null,
      properties: t?.inputSchema?.properties && typeof t.inputSchema.properties === 'object' ? Object.keys(t.inputSchema.properties) : null,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      sideEffects: Array.isArray(t?.sideEffects) ? t.sideEffects.map(String) : t?.sideEffects ?? null,
      rateLimitPerMinute: t?.rateLimitPerMinute ?? null,
      routerExcluded: excluded ? excluded.has(n) : null,
      priorityListed: priority ? priority.has(n) : null,
      verdict: best30 <= 30 ? 'SELECTABLE_BY_KEYWORD' : (bestFull <= fullLimit ? 'LONG_TAIL_RANKED' : 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
      bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
      top3SelfName: selectToolsFor(goals[0], 30).slice(0, 3).map(p => `${p.name}:${p.score}`),
      checkerTaskLevel: isVerificationTool(n, {}, false, false, false),
      checkerGateExistence: isVerificationTool(n, {}, false, true, false),
      checkerGateLive: isVerificationTool(n, {}, false, false, true),
    };
  }

  // ---- Part B: pure-function verdict table (source-grounded shapes) ----
  const verdictTable: Record<string, string> = {
    'pages needs-connect': verdictOf({ ok: false, error: 'GitHub \u063a\u064a\u0631 \u0645\u0631\u0628\u0648\u0637.', output: { needsConnect: true } }),
    'pages deployed': verdictOf({ ok: true, output: { url: 'https://x.github.io/r/', deployed: true } }),
    'deploy built': verdictOf({ ok: true, output: { status: 'built', outputDir: '/w/dist', buildOutput: 'ok' } }),
    'deploy running': verdictOf({ ok: true, output: { status: 'running', url: 'http://localhost:3000', pid: 123 } }),
    'deploy exposed': verdictOf({ ok: true, output: { status: 'exposed', url: 'localtunnel_started', port: 3000 } }),
    'deploy unknown-action': verdictOf({ ok: false, error: 'Unknown action: teleport' }),
    'devs needs-cwd': verdictOf({ ok: false, error: 'dev_server_start needs the project folder (`cwd`) \u2014 no server was started.' }),
    'devs started-unready': verdictOf({ ok: true, output: { previewUrl: 'http://localhost:5180/', userPreviewUrl: 'http://localhost:5180/', serverReady: false, startupTime: 30000 } }),
    'run live': verdictOf({ ok: true, output: { url: 'http://127.0.0.1:4311/', port: 4311, ready: true } }),
    'run no-project': verdictOf({ ok: false, error: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0634\u0631\u0648\u0639 \u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0634\u063a\u064a\u0644' }),
    'stop idle': verdictOf({ ok: true, output: { stopped: false } }),
    'stop done': verdictOf({ ok: true, output: { stopped: true, port: 4311 } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  let runningServers: Map<string, any> | null = null;
  try {
    const prt: any = await imp(path.join(SRC, 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'));
    if (prt && prt._runningServers instanceof Map) runningServers = prt._runningServers;
  } catch { runningServers = null; }
  const runningKeys = () => {
    try {
      if (!runningServers) return 'NO_MAP';
      return [...runningServers.entries()].map(([k, v]: any) => `${k}:pid=${v?.pid}:port=${v?.port}`).sort();
    } catch { return 'READ_FAILED'; }
  };
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  let defaultRoot: string | null = null;
  try { defaultRoot = ws.workspaceService.getActiveRoot(); } catch (e: any) { defaultRoot = `THREW:${String(e?.message || e).slice(0, 120)}`; }
  const FX = path.join(sessionRoot, 'wiring-runtime-fx');
  const BUILDS_DEFAULT = path.join(ROOT, 'data', 'builds', 'workspace-default');
  const rootsBefore: Record<string, string[]> = {};
  for (const [k, r] of [['session', sessionRoot], ['default', defaultRoot], ['builds', BUILDS_DEFAULT]] as const) {
    try { rootsBefore[k] = (r && fs.existsSync(r)) ? fs.readdirSync(r).sort() : []; }
    catch { rootsBefore[k] = [`READ_FAILED`]; }
  }

  const live: Record<string, any> = {};
  const runWithCtx = async (id: string, name: string, input: any, c: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, c),
          { userId: c.userId || 'audit-user', sessionId: c.sessionId || 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs, timedOut: true }; return; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[id] = {
        input: scrub(JSON.stringify(input).slice(0, 200)),
        ok: !!r?.ok,
        error: r?.error ? scrub(String(r.error).slice(0, 260)) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? scrub(o.slice(0, 600))
          : (o && typeof o === 'object' ? scrub(JSON.stringify(o).slice(0, 1400)) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[0]).slice(0, 200)) : null,
        logLast: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[r.logs.length - 1]).slice(0, 300)) : null,
        logN: Array.isArray(r?.logs) ? r.logs.length : null,
      };
    } catch (e: any) {
      live[id] = { input: scrub(JSON.stringify(input).slice(0, 200)), threw: scrub(String(e?.message || e).slice(0, 260)) };
    }
  };
  const run = (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => runWithCtx(id, name, input, ctx, timeoutMs);

  // Order matters: stop.idle + run.empty run BEFORE fixtures exist.
  await run('stop.idle', 'project_stop', {});
  await run('run.empty', 'project_run', {}, RUN_TIMEOUT_MS);

  // ---- fixtures (all under the session root; removed afterwards) ----
  const BACKEND = path.join(FX, 'backend1');
  const PKG1 = path.join(FX, 'pkg1');
  const BLD1 = path.join(FX, 'bld1');
  const EMPTY1 = path.join(FX, 'empty1');
  const STATIC1 = path.join(FX, 'static1');
  const OVR1 = path.join(FX, 'ovr1');
  for (const d of [BACKEND, PKG1, BLD1, EMPTY1, STATIC1, OVR1]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BACKEND, 'package.json'), JSON.stringify({ name: 'fx-backend', private: true }));
  fs.writeFileSync(path.join(BACKEND, 'server.js'), `// ${TOKEN}\nrequire('http').createServer((q,s)=>{s.end('x')}).listen(45990);\n`);
  fs.writeFileSync(path.join(PKG1, 'hello.txt'), `hello ${TOKEN}\n`);
  fs.writeFileSync(path.join(PKG1, 'notes.md'), '# notes\n');
  fs.writeFileSync(path.join(BLD1, 'package.json'), JSON.stringify({ name: 'fx-bld', private: true, scripts: { build: 'node mkdist.js' } }));
  fs.writeFileSync(path.join(BLD1, 'mkdist.js'), `require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/out.txt','${TOKEN}');\n`);
  fs.writeFileSync(path.join(STATIC1, 'package.json'), JSON.stringify({ name: 'fx-static', private: true }));
  fs.writeFileSync(path.join(STATIC1, 'index.html'), `<html><body><h1>static ${TOKEN}</h1></body></html>\n`);
  // NOTE: detectStart's pure-static branch runs `npx -y serve` (auto-download:
  // network). By design the live leg pins the LOCAL node-entry branch instead;
  // the npx-serve branch stays code-cited (ProjectRunTool.ts:483-485).
  fs.writeFileSync(path.join(STATIC1, 'server.js'),
    `const http=require('http');const port=Number(process.env.PORT||45983);\n` +
    `http.createServer((q,s)=>{s.end('detected ${TOKEN}')}).listen(port,'127.0.0.1');\n`);
  fs.writeFileSync(path.join(OVR1, 'package.json'), JSON.stringify({ name: 'fx-ovr', private: true }));
  fs.writeFileSync(path.join(OVR1, 'server.js'),
    `const http=require('http');const port=Number(process.env.PORT||45982);\n` +
    `http.createServer((q,s)=>{s.end('override ${TOKEN} path='+q.url)}).listen(port,'127.0.0.1',()=>console.log('up '+port));\n`);

  // deploy_pages (3; no token in env -> gate legs only)
  await run('pages.empty', 'deploy_pages', {});
  await run('pages.missing-cwd', 'deploy_pages', { cwd: path.join(FX, 'missing-pages') });
  await run('pages.backend-unreached', 'deploy_pages', { cwd: BACKEND });
  // deploy_project (7; expose_port embargoed)
  await run('proj.empty', 'deploy_project', {});
  await run('proj.missing', 'deploy_project', { action: 'package', projectPath: 'wiring-runtime-fx/missing-proj' });
  await run('proj.traversal', 'deploy_project', { action: 'package', projectPath: '../../wiring-runtime-evil18.txt' });
  await run('proj.bogus-action', 'deploy_project', { action: 'teleport', projectPath: 'wiring-runtime-fx/pkg1' });
  await run('proj.package-contained', 'deploy_project', { action: 'package', projectPath: 'wiring-runtime-fx/pkg1' }, START_TIMEOUT_MS);
  await run('proj.build-contained', 'deploy_project', { action: 'build_static', projectPath: 'wiring-runtime-fx/bld1' }, BUILD_TIMEOUT_MS);
  const HOLLOW_PORT = 45981;
  await run('proj.start-hollow', 'deploy_project', { action: 'start_server', projectPath: 'wiring-runtime-fx/empty1', port: HOLLOW_PORT }, START_TIMEOUT_MS);
  // project_run / project_stop (paired live legs)
  await run('run.named-miss', 'project_run', { projectQuery: '"definitely-not-a-project-18"' });
  await run('run.missing-cwd', 'project_run', { cwd: path.join(FX, 'missing-run') });
  await run('run.no-marker', 'project_run', { cwd: EMPTY1 });
  await run('run.detected', 'project_run', { cwd: STATIC1 }, RUN_TIMEOUT_MS);
  const staticUrl = (() => { try { return String(JSON.parse((live['run.detected'] as any)?.outputPreview || '{}')?.url || ''); } catch { return ''; } })();
  const staticPort = (() => { try { return Number(JSON.parse((live['run.detected'] as any)?.outputPreview || '{}')?.port || 0); } catch { return 0; } })();
  const staticGet = staticUrl ? await httpGet(staticUrl) : { status: null, head: 'NO_URL', refused: false };
  const keysAfterDetected = runningKeys();
  await run('stop.after-static', 'project_stop', {});
  const keysAfterStop1 = runningKeys();
  const staticAfter = staticUrl ? await httpGet(staticUrl) : { status: null, head: 'NO_URL', refused: false };
  const OVR_PORT = 45982;
  await run('run.override', 'project_run', { cwd: OVR1, command: 'node server.js', port: OVR_PORT }, RUN_TIMEOUT_MS);
  const ovrUrl = (() => { try { return String(JSON.parse((live['run.override'] as any)?.outputPreview || '{}')?.url || ''); } catch { return ''; } })();
  const ovrGet = ovrUrl ? await httpGet(ovrUrl) : { status: null, head: 'NO_URL', refused: false };
  const keysAfterOverride = runningKeys();
  await run('stop.after-override', 'project_stop', {});
  const keysAfterStop2 = runningKeys();
  const ovrAfter = ovrUrl ? await httpGet(ovrUrl) : { status: null, head: 'NO_URL', refused: false };
  await run('stop.twice', 'project_stop', {});
  // dev_server_start (2; full start embargoed)
  await run('devs.empty', 'dev_server_start', {});
  await run('devs.missing', 'dev_server_start', { cwd: 'wiring-runtime-fx/missing-devs' });
  await run('stop.final', 'project_stop', {});

  // ---- evidence reads (before cleanup) ----
  const evidence: Record<string, any> = {};
  const exists = (p: string) => { try { return fs.existsSync(p); } catch { return false; } };
  evidence['hollow.get'] = await httpGet(`http://127.0.0.1:${HOLLOW_PORT}/`);
  evidence['hollow.pidfile'] = exists(path.join(EMPTY1, '.joe_server.pid'));
  evidence['pkg.zip'] = (() => { try { return fs.readdirSync(PKG1).filter(f => f.endsWith('.zip')); } catch { return 'READ_FAILED'; } })();
  evidence['bld.marker'] = (() => { try { return fs.readFileSync(path.join(BLD1, 'dist', 'out.txt'), 'utf-8').slice(0, 60); } catch { return 'MISSING'; } })();
  evidence['static.url'] = staticUrl || null;
  evidence['static.port'] = staticPort || null;
  evidence['static.get'] = staticGet;
  evidence['static.afterStop'] = staticAfter;
  evidence['ovr.url'] = ovrUrl || null;
  evidence['ovr.get'] = ovrGet;
  evidence['ovr.afterStop'] = ovrAfter;
  evidence['keys.afterDetected'] = keysAfterDetected;
  evidence['keys.afterStop1'] = keysAfterStop1;
  evidence['keys.afterOverride'] = keysAfterOverride;
  evidence['keys.afterStop2'] = keysAfterStop2;
  evidence['builds.strays'] = (() => { try { return fs.readdirSync(BUILDS_DEFAULT).filter(f => /wiring-runtime/i.test(f)); } catch { return 'READ_FAILED'; } })();
  const rootsAfter: Record<string, string[]> = {};
  for (const [k, r] of [['session', sessionRoot], ['default', defaultRoot], ['builds', BUILDS_DEFAULT]] as const) {
    try { rootsAfter[k] = (r && fs.existsSync(r)) ? fs.readdirSync(r).sort() : []; }
    catch { rootsAfter[k] = [`READ_FAILED`]; }
  }
  const newEntries: Record<string, string[]> = {};
  for (const k of Object.keys(rootsBefore)) {
    const before = new Set(rootsBefore[k]);
    newEntries[k] = (rootsAfter[k] || []).filter(e => !before.has(e));
  }

  // ---- cleanup ----
  const removed: Record<string, boolean> = {};
  try { fs.rmSync(FX, { recursive: true, force: true }); removed['fx'] = !exists(FX); } catch { removed['fx'] = false; }
  try {
    for (const s of (evidence['builds.strays'] as string[]) || []) fs.rmSync(path.join(BUILDS_DEFAULT, s), { recursive: true, force: true });
    removed['builds'] = true;
  } catch { removed['builds'] = false; }

  const out = { decl, verdictTable, live, evidence, rootsBefore, rootsAfter, newEntries, removed };
  fs.writeFileSync(path.join(HERE, 'trunk_runtime.json'), JSON.stringify(out, null, 2));
  const legIds = Object.keys(live);
  const okCount = legIds.filter(id => (live[id] as any)?.ok === true).length;
  console.log(`TRUNK_RUNTIME decl=5 selectable=${Object.values(decl).filter((d: any) => d.verdict === 'SELECTABLE_BY_KEYWORD').length}/5 legs=${legIds.length} ok=${okCount} removedFx=${removed['fx']}`);
  for (const id of legIds) {
    const l: any = live[id];
    console.log(`LEG ${id} ok=${l.ok} err=${l.error || l.threw || ''} shape=${l.outputShape || ''} ${String(l.outputPreview || '').slice(0, 160).replace(/\n/g, ' ')}`);
  }
  console.log(`EVIDENCE ${scrub(JSON.stringify(evidence)).slice(0, 3000)}`);
  console.log(`NEWENTRIES ${JSON.stringify(newEntries).slice(0, 800)}`);
}

main().catch(e => { console.error('TRUNK_RUNTIME_FATAL', e); process.exit(1); });
