// MUSE wiring-audit checkpoint 15: code_understanding-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; closes the 14-checker set via code_reviewer).
// Part A: declarations + self-grounded selection for the 16 code_understanding names
//   (ambiguity_resolver, analyze_codebase, analyze_project, auto_refactor,
//   business_logic_parser, code_reviewer, codebase_outline, compliance_validator,
//   dead_code_detector, dependency_graph, engineering_discovery, inspect_symbol,
//   pattern_recognize, project_detect, request_analyzer, self_confidence_evaluator)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; NO network legs; model-backed legs run
//   bounded under OFFLINE_MODE to record the no-provider shape only).
// EMBARGO: dead_code_detector positive leg is NOT executed (npx knip over a
//   project; 008 fixture design stands — only the fast pre-knip negative runs).
//   code_reviewer non-quick reviewType is NOT executed (LLM pass); quick legs
//   are fully deterministic/offline. No model-present behavior is probed.
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_code.mts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'ambiguity_resolver', 'analyze_codebase', 'analyze_project', 'auto_refactor',
  'business_logic_parser', 'code_reviewer', 'codebase_outline', 'compliance_validator',
  'dead_code_detector', 'dependency_graph', 'engineering_discovery', 'inspect_symbol',
  'pattern_recognize', 'project_detect', 'request_analyzer', 'self_confidence_evaluator',
];
const TOKEN = 'WIRING_CODE_TOKEN_9f2e';
const CALL_TIMEOUT_MS = 25000;
const MODEL_TIMEOUT_MS = 60000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
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
    console.error(`TRUNK_CODE_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_CODE_ABORT missing tool ${n}`); process.exit(1); }
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
    'reviewer quick-ok': verdictOf({ ok: true, output: { overallScore: 57, filesRequested: 1, filesReviewed: 1, reviewedFiles: ['seed.js'], missingFiles: [], issues: [{}, {}, {}], suggestions: [{}], summary: { critical: 1, verifiedCritical: 1, warning: 1, info: 1 }, qualityGate: { passed: true } } }),
    'reviewer missing-files': verdictOf({ ok: false, error: 'code_reviewer could not review 1 requested file(s): nope.js', output: { overallScore: 0, filesRequested: 1, filesReviewed: 0, missingFiles: ['nope.js'] } }),
    'reviewer quality-gate': verdictOf({ ok: false, error: 'code_reviewer quality gate failed: overall score 57/100 is below the required 90/100', output: { overallScore: 57 } }),
    'elite empty-success': verdictOf({ ok: true, output: {} }),
    'pattern no-language': verdictOf({ ok: true, output: { patterns: [], antiPatterns: [], suggestions: [] } }),
    'outline missing-file': verdictOf({ ok: false, error: 'File not found: x' }),
    'refactor wrote': verdictOf({ ok: true, output: { changes: [{ type: 'simplify' }], originalLength: 9, newLength: 7, diff: -2 } }),
    'refactor silent': verdictOf({ ok: true, output: { changes: [], originalLength: 9, newLength: 9, diff: 0 } }),
    'analyze fallback': verdictOf({ ok: true, output: { summary: '## Structure\n...' } }),
    'dead missing-path': verdictOf({ ok: false, error: 'Project path does not exist' }),
    'discovery evidence': verdictOf({ ok: true, output: { evidence: {} } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-code-fx');
  const FXPROJ = path.join(sessionRoot, 'wiring-code-proj');
  const OUTSIDE = path.join(os.tmpdir(), `wiring-code-outside-${TOKEN}.txt`);
  for (const d of [FX, FXPROJ]) fs.mkdirSync(d, { recursive: true });
  // Seeded review file: exactly 1 critical (sk- secret) + 1 warning (eval) +
  // 1 info (console.log), balanced brackets -> deterministic quick score 57.
  const SEED_JS = `// ${TOKEN}\nconst apiKey = 'sk-abcdefghijklmnopqrstuvwx';\nfunction compute(x) {\n  return eval(x);\n}\nconsole.log('debug');\n`;
  const GREET_JS = `function greet(name) {\n  return 'hi ' + name;\n}\nmodule.exports = { greet };\n`;
  const OUTLINE_JS = `import fs from 'fs';\nexport class Widget {\n  constructor() {}\n}\nexport function build() { return 1; }\nexport interface Shape { w: number; }\n`;
  const REFACTOR_JS = `import b from './b';\nimport a from './a';\nimport b from './b';\nconst x = 1;\nconsole.log(x);\n`;
  const SORTONLY_JS = `import b from 'z';\nimport a from 'y';\nconst x = 1;\n`;
  fs.writeFileSync(path.join(FX, 'seed.js'), SEED_JS);
  fs.writeFileSync(path.join(FX, 'greet.js'), GREET_JS);
  fs.writeFileSync(path.join(FX, 'outline.js'), OUTLINE_JS);
  fs.writeFileSync(path.join(FX, 'refactor.js'), REFACTOR_JS);
  fs.writeFileSync(path.join(FX, 'sortonly.js'), SORTONLY_JS);
  fs.mkdirSync(path.join(FXPROJ, 'node', 'app'), { recursive: true });
  fs.mkdirSync(path.join(FXPROJ, 'py', 'app'), { recursive: true });
  fs.mkdirSync(path.join(FXPROJ, 'go', 'app'), { recursive: true });
  fs.mkdirSync(path.join(FXPROJ, 'node_modules', 'plant'), { recursive: true });
  fs.writeFileSync(path.join(FXPROJ, 'node', 'app', 'package.json'), JSON.stringify({ name: 'fx-node' }));
  fs.writeFileSync(path.join(FXPROJ, 'py', 'app', 'requirements.txt'), 'requests\n');
  fs.writeFileSync(path.join(FXPROJ, 'go', 'app', 'go.mod'), 'module fx\n');
  fs.writeFileSync(path.join(FXPROJ, 'node_modules', 'plant', 'package.json'), JSON.stringify({ name: 'fx-plant' }));
  fs.writeFileSync(OUTSIDE, `outside marker ${TOKEN}\n`);
  const readOnlyBefore: Record<string, string> = {
    'seed.js': fs.readFileSync(path.join(FX, 'seed.js'), 'utf-8'),
    'greet.js': fs.readFileSync(path.join(FX, 'greet.js'), 'utf-8'),
    'outline.js': fs.readFileSync(path.join(FX, 'outline.js'), 'utf-8'),
  };
  const refactorBefore = fs.readFileSync(path.join(FX, 'refactor.js'), 'utf-8');
  const sortonlyBefore = fs.readFileSync(path.join(FX, 'sortonly.js'), 'utf-8');

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
        outputPreview: typeof o === 'string' ? o.slice(0, 600)
          : (o && typeof o === 'object' ? JSON.stringify(o).slice(0, 1200) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[id] = { input: JSON.stringify(input).slice(0, 200), threw: String(e?.message || e).slice(0, 220) };
    }
  };

  const seedAbs = path.join(FX, 'seed.js');
  await run('review.quick-seeded', 'code_reviewer', { files: [seedAbs], projectPath: FX, reviewType: 'quick' });
  await run('review.missing', 'code_reviewer', { files: ['nope.js'], projectPath: FX, reviewType: 'quick' });
  await run('review.empty-files', 'code_reviewer', {});
  await run('review.bad-score', 'code_reviewer', { files: [seedAbs], projectPath: FX, minimumScore: 999 });
  await run('review.gate-fail', 'code_reviewer', { files: [seedAbs], projectPath: FX, reviewType: 'quick', minimumScore: 90 });
  await run('review.outside', 'code_reviewer', { files: [OUTSIDE], projectPath: FX, reviewType: 'quick' });
  await run('refactor.scratch', 'auto_refactor', { filePath: path.join(FX, 'refactor.js'), refactorType: 'all' });
  await run('refactor.sort-only', 'auto_refactor', { filePath: path.join(FX, 'sortonly.js'), refactorType: 'optimize-imports' });
  await run('refactor.missing', 'auto_refactor', { filePath: path.join(FX, 'nope.js') });
  const PATTERN_CODE = 'class A {\n private static instance;\n getInstance() { return 1; }\n}\nconst f = createWidget();';
  await run('pattern.seeded', 'pattern_recognize', { code: PATTERN_CODE, language: 'typescript' });
  await run('pattern.no-language', 'pattern_recognize', { code: 'class A {}' });
  await run('pattern.dead-filepath-a', 'pattern_recognize', { code: 'class A {}', language: 'typescript', filePath: '/nonexistent/x.js' });
  await run('pattern.dead-filepath-b', 'pattern_recognize', { code: 'class A {}', language: 'typescript' });
  await run('detect.seeded', 'project_detect', { path: FXPROJ, maxDepth: 4 });
  await run('detect.missing', 'project_detect', { path: path.join(FXPROJ, 'nope') });
  await run('symbol.seeded', 'inspect_symbol', { filePath: path.join(FX, 'greet.js'), symbolName: 'greet' });
  await run('symbol.missing', 'inspect_symbol', { filePath: path.join(FX, 'greet.js'), symbolName: 'nope' });
  await run('outline.seeded', 'codebase_outline', { filePath: path.join(FX, 'outline.js') });
  await run('outline.relative-cwd', 'codebase_outline', { filePath: 'package.json' });
  await run('outline.absolute-outside', 'codebase_outline', { filePath: OUTSIDE });
  await run('outline.missing', 'codebase_outline', { filePath: path.join(FX, 'nope.js') });
  await run('analyze.seeded', 'analyze_project', { path: FX });
  await run('analyze.missing', 'analyze_project', { path: path.join(FX, 'nope') });
  await run('codebase.remote', 'analyze_codebase', { path: 'https://github.com/example/repo' });
  await run('codebase.offline', 'analyze_codebase', { path: FX }, MODEL_TIMEOUT_MS);
  await run('discovery.seeded', 'engineering_discovery', { path: 'wiring-code-fx', request: 'Build a todo app' });
  await run('discovery.outside', 'engineering_discovery', { path: '../../../../../..' });
  await run('dead.missing', 'dead_code_detector', { projectPath: 'wiring-code-nope' });
  await run('request.empty', 'request_analyzer', {});
  await run('elite.dep-graph', 'dependency_graph', { path: FX }, MODEL_TIMEOUT_MS);
  await run('elite.biz-logic', 'business_logic_parser', { requirements: 'orders over $50 ship free' }, MODEL_TIMEOUT_MS);
  await run('elite.compliance', 'compliance_validator', { content: 'store passwords in plain text', standard: 'OWASP' }, MODEL_TIMEOUT_MS);
  await run('elite.ambiguity', 'ambiguity_resolver', { text: 'ship it fast' }, MODEL_TIMEOUT_MS);
  await run('elite.confidence', 'self_confidence_evaluator', { content: 'the sky is green' }, MODEL_TIMEOUT_MS);
  await run('elite.compliance-empty', 'compliance_validator', {});
  await run('elite.confidence-empty', 'self_confidence_evaluator', {});

  const readOnlyAfter: Record<string, string> = {
    'seed.js': fs.readFileSync(path.join(FX, 'seed.js'), 'utf-8'),
    'greet.js': fs.readFileSync(path.join(FX, 'greet.js'), 'utf-8'),
    'outline.js': fs.readFileSync(path.join(FX, 'outline.js'), 'utf-8'),
  };
  const readOnlyIntact = Object.keys(readOnlyBefore).every(k => readOnlyBefore[k] === readOnlyAfter[k]);
  const refactorAfter = fs.readFileSync(path.join(FX, 'refactor.js'), 'utf-8');
  const sortonlyAfter = fs.readFileSync(path.join(FX, 'sortonly.js'), 'utf-8');
  const fxBefore = { fx: fs.readdirSync(FX).sort(), fxproj: fs.readdirSync(FXPROJ).sort() };
  for (const d of [FX, FXPROJ]) fs.rmSync(d, { recursive: true, force: true });
  try { fs.rmSync(OUTSIDE, { force: true }); } catch { /* best effort */ }
  const fxGone = ![FX, FXPROJ, OUTSIDE].some(d => fs.existsSync(d));

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'code_understanding',
    declarations: decl,
    verdictTable,
    live,
    sessionRoot,
    readOnlyIntact,
    refactorDiff: { before: refactorBefore, after: refactorAfter },
    sortonlyDiff: { before: sortonlyBefore, after: sortonlyAfter },
    fixtures: { before: fxBefore, removed: fxGone },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_code.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])),
    checkerTaskLevel: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.checkerTaskLevel])),
    verdictTable, live, readOnlyIntact, fixturesRemoved: fxGone,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_CODE_FAILED', e); process.exit(1); });
