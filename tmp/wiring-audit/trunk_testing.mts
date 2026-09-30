// MUSE wiring-audit checkpoint 13: testing_qa-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table for the trunk's two task-level checkers).
// Part A: declarations + self-grounded selection for the 6 testing_qa names
//   (auto_tester, chaos_test_plan, load_tester, quality_run, sonar_analysis,
//   test_generator) + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; loopback HTTP server for load_tester).
// EMBARGO: sonar_analysis positive leg is NOT executed (npx sonar-scanner,
//   300s, network). chaos_test_plan gets ONE bounded offline leg to record
//   the no-provider shape; model-present behavior stays unprobed.
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_testing.mts
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'auto_tester', 'chaos_test_plan', 'load_tester', 'quality_run',
  'sonar_analysis', 'test_generator',
];
const TOKEN = 'WIRING_QA_TOKEN_13d7';
const CALL_TIMEOUT_MS = 25000;
const NPM_TIMEOUT_MS = 120000;
const CHAOS_TIMEOUT_MS = 90000;

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

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_TESTING_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_TESTING_ABORT missing tool ${n}`); process.exit(1); }
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
    'quality_run completed': verdictOf({ ok: true, output: { status: 'completed', results: [] } }),
    'quality_run failed': verdictOf({ ok: false, error: 'Quality checks failed: test: x', output: { status: 'failed', results: [] } }),
    'quality_run all-skipped': verdictOf({ ok: false, error: 'No requested quality checks were available to execute (test)', output: { status: 'incomplete', results: [] } }),
    'auto_tester pass': verdictOf({ ok: true, output: { passed: true, errors: [], summary: 's' } }),
    'auto_tester fail': verdictOf({ ok: false, error: 'Syntax error in a.js', output: { passed: false, errors: [{}], summary: 's' } }),
    'test_generator wrote': verdictOf({ ok: true, output: { testFilePath: 'x', runner: 'node', testCount: 2 } }),
    'test_generator ts-skip': verdictOf({ ok: true, output: { generated: false, skipped: true, runner: 'node' } }),
    'chaos model-empty': verdictOf({ ok: true, output: {} }),
    'chaos model-status': verdictOf({ ok: true, output: { status: 'completed' } }),
    'load_tester summary': verdictOf({ ok: true, output: { summary: 'Load Test Results' } }),
    'sonar summary': verdictOf({ ok: true, output: { summary: 'scan' } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-qa-fx');
  const FX2 = path.join(sessionRoot, 'wiring-qa-fx2');
  const FX3 = path.join(sessionRoot, 'wiring-qa-fx3');
  for (const d of [FX, FX2, FX3]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(FX, 'package.json'), JSON.stringify({
    name: 'wiring-qa-fx', version: '1.0.0',
    scripts: { test: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' },
  }, null, 2));
  fs.writeFileSync(path.join(FX2, 'package.json'), JSON.stringify({
    name: 'wiring-qa-fx2', version: '1.0.0',
    scripts: { test: 'node -e "process.exit(1)"' },
  }, null, 2));
  fs.writeFileSync(path.join(FX, 'valid.js'), `// ${TOKEN}\nmodule.exports.add = (a, b) => a + b;\n`);
  fs.writeFileSync(path.join(FX, 'broken.js'), `module.exports = {{{ ${TOKEN}\n`);
  fs.writeFileSync(path.join(FX, 'valid.json'), JSON.stringify({ token: TOKEN }));
  fs.writeFileSync(path.join(FX, 'broken.json'), `{"token": ${TOKEN}\n`);
  fs.writeFileSync(path.join(FX, 'notes.py'), `# ${TOKEN}\nprint("hi")\n`);
  fs.writeFileSync(path.join(FX, 'tiny.ts'), `// ${TOKEN}\nexport const x: number = 1;\n`);

  const live: Record<string, any> = {};
  const run = async (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs, timedOut: true }; return; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[id] = {
        input: JSON.stringify(input).slice(0, 200),
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 220) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 200)
          : (o && typeof o === 'object' ? JSON.stringify(o).slice(0, 400) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[id] = { input: JSON.stringify(input).slice(0, 200), threw: String(e?.message || e).slice(0, 220) };
    }
  };

  await run('auto.syntax.valid', 'auto_tester', { testType: 'syntax', projectPath: FX, files: [path.join(FX, 'valid.js'), path.join(FX, 'valid.json')] });
  await run('auto.syntax.broken-json', 'auto_tester', { testType: 'syntax', projectPath: FX, files: [path.join(FX, 'broken.json')] });
  await run('auto.syntax.broken-js', 'auto_tester', { testType: 'syntax', projectPath: FX, files: [path.join(FX, 'broken.js')] }, NPM_TIMEOUT_MS);
  await run('auto.syntax.unsupported', 'auto_tester', { testType: 'syntax', projectPath: FX, files: [path.join(FX, 'notes.py')] });
  await run('auto.syntax.no-files', 'auto_tester', { testType: 'syntax', projectPath: FX });
  await run('auto.bad-type', 'auto_tester', { testType: 'smoke', projectPath: FX });
  await run('auto.unit.pass', 'auto_tester', { testType: 'unit', projectPath: FX }, NPM_TIMEOUT_MS);
  await run('auto.unit.fail', 'auto_tester', { testType: 'unit', projectPath: FX2 }, NPM_TIMEOUT_MS);
  await run('auto.unit.no-pkg', 'auto_tester', { testType: 'unit', projectPath: FX3 }, NPM_TIMEOUT_MS);
  await run('quality.test.pass', 'quality_run', { path: FX, tasks: ['test'] }, NPM_TIMEOUT_MS);
  await run('quality.test.all-skipped', 'quality_run', { path: FX3, tasks: ['test'] }, NPM_TIMEOUT_MS);
  await run('quality.test.fail', 'quality_run', { path: FX2, tasks: ['test'] }, NPM_TIMEOUT_MS);
  await run('load.no-url', 'load_tester', {});

  // Loopback fixture server for the single contained load leg.
  let hits = 0;
  const server = http.createServer((_req, res) => { hits += 1; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('qa-loopback'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  await run('load.loopback', 'load_tester', { url: `http://127.0.0.1:${port}/`, vus: 1, duration: '1' }, NPM_TIMEOUT_MS);
  await new Promise<void>(resolve => server.close(() => resolve()));

  await run('gen.js', 'test_generator', { filePath: path.join(FX, 'valid.js'), testType: 'unit' });
  const genJsExists = fs.existsSync(path.join(FX, '__tests__', 'valid.test.js')) || fs.existsSync(path.join(FX, '__tests__', 'valid.test.mjs'));
  await run('gen.ts-skip', 'test_generator', { filePath: path.join(FX, 'tiny.ts'), testType: 'unit' });
  await run('gen.missing', 'test_generator', { filePath: path.join(FX, 'nope.js') });
  await run('sonar.no-key', 'sonar_analysis', {});
  await run('chaos.offline', 'chaos_test_plan', { architecture: `two-tier web app ${TOKEN}` }, CHAOS_TIMEOUT_MS);

  const fxBefore = { fx: fs.readdirSync(FX).sort(), fx2: fs.readdirSync(FX2).sort(), fx3: fs.readdirSync(FX3).sort() };
  for (const d of [FX, FX2, FX3]) fs.rmSync(d, { recursive: true, force: true });
  const fxGone = ![FX, FX2, FX3].some(d => fs.existsSync(d));

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'testing_qa',
    declarations: decl,
    verdictTable,
    live,
    sessionRoot,
    loadLoopbackHits: hits,
    genJsFileCreated: genJsExists,
    fixtures: { before: fxBefore, removed: fxGone },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_testing.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])),
    checkerTaskLevel: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.checkerTaskLevel])),
    verdictTable, live, loadLoopbackHits: hits, genJsFileCreated: genJsExists, fixturesRemoved: fxGone,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_TESTING_FAILED', e); process.exit(1); });
