// MUSE wiring-audit checkpoint 21: observability-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 5 observability names
//   (alert_manager, logger, monitoring, performance_analyzer,
//   performance_profile)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; NO network legs; no model legs):
//   - alert_manager: create/trigger/resolve/list/history + bad-id + nameless +
//     bad-action (in-memory store, probe-process-local)
//   - logger: log/query/stats + bad-action + clear-last (in-memory store)
//   - monitoring: reset/track/get_metrics + unknown-event + reset-again
//     (in-memory store)
//   - performance_analyzer: clean/nasty/missing/absolute-outside/traversal/
//     empty-array fixture files (reads via fs with NO resolveToolPath)
//   - performance_profile: ok/missing-filePath/nonexistent/absolute-outside
//     (reads via resolveToolPath with workspace context)
// EMBARGO: none network/model on this trunk. Cross-session isolation of the
//   three static in-memory stores is CODE-CITED only (single probe process;
//   no sessionId field exists in any of the three implementations).
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 021 doc>
//   node <abs tsx> ..\tmp\wiring-audit\trunk_obs.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'alert_manager', 'logger', 'monitoring', 'performance_analyzer',
  'performance_profile',
];
const TOKEN = 'WIRING_OBS_TOKEN_7b1c';
const CALL_TIMEOUT_MS = 25000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

function scrub(s: string): string {
  return String(s)
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

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_OBS_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_OBS_ABORT missing tool ${n}`); process.exit(1); }
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
    'alert created': verdictOf({ ok: true, output: { success: true, alertId: 'alert_x', message: 'created' } }),
    'alert triggered': verdictOf({ ok: true, output: { success: true, alertId: 'alert_x', severity: 'high' } }),
    'alert not-found': verdictOf({ ok: false, error: 'Alert alert_x not found' }),
    'alert list': verdictOf({ ok: true, output: { success: true, alerts: [], summary: { total: 0 } } }),
    'logger logged': verdictOf({ ok: true, output: { success: true, logId: 'log_x', level: 'info' } }),
    'logger stats': verdictOf({ ok: true, output: { success: true, stats: { totalLogs: 2 } } }),
    'logger cleared': verdictOf({ ok: true, output: { success: true, clearedCount: 2 } }),
    'monitor tracked': verdictOf({ ok: true, output: { success: true, event: 'request', tracked: true } }),
    'monitor unknown-event': verdictOf({ ok: true, output: { success: true, event: 'nope', tracked: true } }),
    'monitor metrics': verdictOf({ ok: true, output: { success: true, metrics: { successRate: '0%' } } }),
    'analyzer clean': verdictOf({ ok: true, output: { performanceScore: 99, bottlenecks: [], optimizations: [] } }),
    'analyzer missing-file': verdictOf({ ok: true, output: { performanceScore: 100, bottlenecks: [], optimizations: [] } }),
    'profiler ok': verdictOf({ ok: true, output: { issues: [], memoryEstimate: {}, complexity: {} } }),
    'profiler not-found': verdictOf({ ok: false, error: 'File not found: x' }),
    'profiler no-filepath': verdictOf({ ok: false, error: 'filePath is required' }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-obs-fx');
  const SUB = path.join(FX, 'sub');
  const OUTSIDE = path.join(ROOT, 'tmp', 'wiring-audit', 'fx-obs-outside');
  const rootsBefore: Record<string, string[]> = {};
  try { rootsBefore.session = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : []; }
  catch { rootsBefore.session = ['READ_FAILED']; }

  const live: Record<string, any> = {};
  const raw: Record<string, any> = {};
  const runWithCtx = async (id: string, name: string, input: any, c: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, c),
          { userId: c.userId || 'audit-user', sessionId: c.sessionId || 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs, timedOut: true }; return; }
      const r: any = (raced as any).value;
      raw[id] = r;
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

  // ---- fixtures (session dir + one outside-session dir; all removed) ----
  for (const d of [FX, SUB, OUTSIDE]) fs.mkdirSync(d, { recursive: true });
  const CLEAN = path.join(FX, 'clean.js');
  fs.writeFileSync(CLEAN, `// ${TOKEN} clean fixture\nfunction add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n`);
  const NASTY = path.join(FX, 'nasty.js');
  fs.writeFileSync(NASTY, `// ${TOKEN} nasty fixture\nconst fs = require('fs');\nfunction heavy(items) {\n  let total = '';\n  for (const row of items) {\n    for (const cell of row) {\n      if (cell) { total += String(cell); } else { total += '?'; }\n    }\n  }\n  const dump = fs.readFileSync(__filename, 'utf8');\n  return { total, bytes: dump.length };\n}\nmodule.exports = { heavy };\n`);
  const OUTSIDE_JS = path.join(OUTSIDE, 'outside.js');
  fs.writeFileSync(OUTSIDE_JS, `// ${TOKEN} OUTSIDE session root (worktree tmp)\nfunction outside() {\n  if (1) { return 'o'; } else { return 'x'; }\n}\nmodule.exports = { outside };\n`);
  const SUBNOTE = path.join(SUB, 'note.txt');
  fs.writeFileSync(SUBNOTE, 'sub');

  // ---- legs: alert_manager ----
  await run('al.create', 'alert_manager', { action: 'create', name: `${TOKEN}-cpu`, condition: { metric: 'cpu', operator: '>', threshold: 90 }, severity: 'high' });
  const alertId: string | null = typeof raw['al.create']?.output?.alertId === 'string' ? raw['al.create'].output.alertId : null;
  await run('al.trigger', 'alert_manager', { action: 'trigger', alertId: alertId || 'no-id', message: `${TOKEN} fired` });
  await run('al.resolve', 'alert_manager', { action: 'resolve', alertId: alertId || 'no-id', message: `${TOKEN} done` });
  await run('al.list', 'alert_manager', { action: 'list' });
  await run('al.history', 'alert_manager', { action: 'history', alertId: alertId || 'no-id' });
  await run('al.trigger-bad', 'alert_manager', { action: 'trigger', alertId: 'alert_does_not_exist', message: 'x' });
  await run('al.create-noname', 'alert_manager', { action: 'create', severity: 'low' });
  await run('al.badaction', 'alert_manager', { action: 'explode' });
  await run('al.noaction', 'alert_manager', {});
  live['al.lifecycle'] = {
    createdId: alertId,
    triggerStatus: raw['al.trigger']?.output?.alert?.status || null,
    resolveStatus: raw['al.resolve']?.output?.alert?.status || null,
    listTotal: raw['al.list']?.output?.summary?.total ?? null,
    historyCount: raw['al.history']?.output?.count ?? null,
  };

  // ---- legs: logger ----
  await run('lg.info', 'logger', { action: 'log', level: 'info', message: `${TOKEN} hello`, metadata: { k: 1 } });
  await run('lg.error', 'logger', { action: 'log', level: 'error', message: `${TOKEN} boom` });
  await run('lg.query-level', 'logger', { action: 'query', filter: { level: 'error' } });
  await run('lg.query-limit', 'logger', { action: 'query', filter: { limit: 1 } });
  await run('lg.query-token', 'logger', { action: 'query', filter: {} });
  await run('lg.stats', 'logger', { action: 'stats' });
  await run('lg.badaction', 'logger', { action: 'explode' });
  live['lg.store'] = {
    errorCount: raw['lg.query-level']?.output?.count ?? null,
    limitCount: raw['lg.query-limit']?.output?.count ?? null,
    totalBeforeClear: raw['lg.stats']?.output?.stats?.totalLogs ?? null,
    tokenSeen: String(JSON.stringify(raw['lg.query-token']?.output?.logs || [])).includes(TOKEN),
  };
  await run('lg.clear', 'logger', { action: 'clear' });
  await run('lg.stats-zero', 'logger', { action: 'stats' });

  // ---- legs: monitoring ----
  await run('mo.reset', 'monitoring', { action: 'reset' });
  await run('mo.track-req', 'monitoring', { action: 'track', event: 'request' });
  await run('mo.track-success', 'monitoring', { action: 'track', event: 'success' });
  await run('mo.track-llm', 'monitoring', { action: 'track', event: 'llm_call' });
  await run('mo.track-tool', 'monitoring', { action: 'track', event: 'tool_usage', metadata: { tool: `${TOKEN}-tool` } });
  await run('mo.track-build', 'monitoring', { action: 'track', event: 'build_time', value: 120 });
  await run('mo.track-unknown', 'monitoring', { action: 'track', event: 'definitely_not_an_event' });
  await run('mo.metrics', 'monitoring', { action: 'get_metrics' });
  await run('mo.badaction', 'monitoring', { action: 'explode' });
  live['mo.store'] = {
    totalRequests: raw['mo.metrics']?.output?.metrics?.totalRequests ?? null,
    successRate: raw['mo.metrics']?.output?.metrics?.successRate ?? null,
    avgBuild: raw['mo.metrics']?.output?.metrics?.averageBuildTime ?? null,
    unknownCounted: raw['mo.metrics']?.output?.metrics?.totalRequests ?? null,
  };
  await run('mo.reset2', 'monitoring', { action: 'reset' });
  await run('mo.metrics-zero', 'monitoring', { action: 'get_metrics' });

  // ---- legs: performance_analyzer (fs-direct, NO resolveToolPath) ----
  await run('pa.clean', 'performance_analyzer', { files: [CLEAN] });
  await run('pa.nasty', 'performance_analyzer', { files: [NASTY] });
  await run('pa.missing', 'performance_analyzer', { files: [path.join(FX, 'no-such-file.js')] });
  await run('pa.abs-outside', 'performance_analyzer', { files: [OUTSIDE_JS] });
  await run('pa.traversal', 'performance_analyzer', { files: ['../nasty.js'], projectPath: SUB });
  await run('pa.empty', 'performance_analyzer', { files: [] });
  await run('pa.nofiles', 'performance_analyzer', {});
  live['pa.compare'] = {
    cleanScore: raw['pa.clean']?.output?.performanceScore ?? null,
    nastyScore: raw['pa.nasty']?.output?.performanceScore ?? null,
    nastyBottlenecks: Array.isArray(raw['pa.nasty']?.output?.bottlenecks) ? raw['pa.nasty'].output.bottlenecks.length : null,
    missingScore: raw['pa.missing']?.output?.performanceScore ?? null,
    missingBottlenecks: Array.isArray(raw['pa.missing']?.output?.bottlenecks) ? raw['pa.missing'].output.bottlenecks.length : null,
    outsideOk: !!raw['pa.abs-outside']?.ok,
    outsideScore: raw['pa.abs-outside']?.output?.performanceScore ?? null,
    traversalOk: !!raw['pa.traversal']?.ok,
    traversalScore: raw['pa.traversal']?.output?.performanceScore ?? null,
    emptyScore: raw['pa.empty']?.output?.performanceScore ?? null,
  };

  // ---- legs: performance_profile (resolveToolPath-contained) ----
  await run('pp.ok', 'performance_profile', { filePath: CLEAN });
  await run('pp.nofield', 'performance_profile', {});
  await run('pp.nonexistent', 'performance_profile', { filePath: path.join(FX, 'no-such-file.js') });
  await run('pp.abs-outside', 'performance_profile', { filePath: OUTSIDE_JS });
  live['pp.compare'] = {
    okIssues: Array.isArray(raw['pp.ok']?.output?.issues) ? raw['pp.ok'].output.issues.length : null,
    outsideOk: !!raw['pp.abs-outside']?.ok,
    outsideError: raw['pp.abs-outside']?.error ? String(raw['pp.abs-outside'].error).slice(0, 160) : null,
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    fs.rmSync(OUTSIDE, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    cleanup = strays.length ? `STRAYS:${strays.join(',')}` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'observability', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_obs.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=observability legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_OBS_FATAL', e); process.exit(1); });
