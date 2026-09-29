// MUSE wiring-audit checkpoint 8: files-trunk stories + FIXTURE-class live probes.
// Part A: declarations + self-grounded selection for the 10 files-trunk names
//   (archive_files, delete_file, file_edit, file_edit_advanced,
//   inspect_directory, ls, project_edit, read_file, search_files, write_file).
// Part B: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; delete_file is verdict-only — the
//   approval gate must pre-empt, and the probe verifies the file survives).
// Part C: contained FIXTURE probes for dead_code_detector + dependency_audit
//   (explicit absolute paths under the session fixture dir; bounded waits).
// EMBARGOED names are NOT executed here (memorize_codebase clears the global
// vector store; deploy_pages can push gh-pages; project_run binds ports;
// browser_launch opens a real browser). Their fixture DESIGNS are static in
// MUSE-WIRING-DISCOVERY-008.md.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_files.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'archive_files', 'delete_file', 'file_edit', 'file_edit_advanced',
  'inspect_directory', 'ls', 'project_edit', 'read_file', 'search_files',
  'write_file',
];
const TOKEN = 'WIRING_FILES_TOKEN_c41d';
const CALL_TIMEOUT_MS = 25000;
const DEAD_CODE_TIMEOUT_MS = 120000;
const DEP_AUDIT_TIMEOUT_MS = 150000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 10).join(',')}}`;
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
    console.error(`TRUNK_FILES_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_FILES_ABORT missing tool ${n}`); process.exit(1); }
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

  // ---- Part A: declarations + selection ----
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
    };
  }

  // ---- Part B/C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-files-fx');
  fs.mkdirSync(FX, { recursive: true });
  fs.writeFileSync(path.join(FX, 'doomed.txt'), `remove me ${TOKEN}\n`);
  fs.writeFileSync(path.join(FX, 'package.json'), JSON.stringify({ name: 'wiring-fx', version: '1.0.0', dependencies: {} }, null, 2));

  const live: Record<string, any> = {};
  const run = async (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs }; return; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[id] = {
        input: JSON.stringify(input).slice(0, 200),
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 220) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 200)
          : (o && typeof o === 'object' ? JSON.stringify(o).slice(0, 300) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[id] = { input: JSON.stringify(input).slice(0, 200), threw: String(e?.message || e).slice(0, 220) };
    }
  };

  const NOTE = path.join(FX, 'note.txt');
  await run('write_file:create', 'write_file', { path: NOTE, content: `alpha line ${TOKEN}\nbeta line\n` });
  await run('read_file:read', 'read_file', { path: NOTE });
  await run('file_edit:roundtrip', 'file_edit', { filename: NOTE, find: 'beta line', replace: 'BETA line' });
  await run('read_file:verify-edit', 'read_file', { path: NOTE });
  await run('file_edit_advanced:multi', 'file_edit_advanced', {
    filePath: NOTE,
    edits: [{ find: 'alpha line', replace: 'ALPHA line' }, { find: 'BETA line', replace: 'BETA2 line' }],
  });
  await run('read_file:verify-advanced', 'read_file', { path: NOTE });
  await run('file_edit_advanced:partial-fail-atomic', 'file_edit_advanced', {
    filePath: NOTE,
    edits: [{ find: 'ALPHA line', replace: 'A line' }, { find: 'NOPE_MISSING_TOKEN', replace: 'X' }],
  });
  await run('read_file:verify-atomic', 'read_file', { path: NOTE });
  await run('inspect_directory:list', 'inspect_directory', { path: FX, depth: 1 });
  await run('ls:list', 'ls', { path: FX });
  await run('search_files:glob', 'search_files', { pattern: '*.txt', path: FX });
  await run('project_edit:no-project', 'project_edit', { request: 'change the title' });
  await run('archive_files:create', 'archive_files', { action: 'create', archivePath: path.join(FX, 'b.zip'), sourcePaths: [NOTE] });
  if (live['archive_files:create']?.ok) {
    await run('archive_files:list', 'archive_files', { action: 'list', archivePath: path.join(FX, 'b.zip') });
  }
  await run('delete_file:verdict-only', 'delete_file', { path: path.join(FX, 'doomed.txt') });
  const doomedSurvived = fs.existsSync(path.join(FX, 'doomed.txt'));
  await run('dead_code_detector:contained-fixture', 'dead_code_detector', { projectPath: FX, mode: 'files' }, DEAD_CODE_TIMEOUT_MS);
  await run('dependency_audit:contained-fixture', 'dependency_audit', { path: FX }, DEP_AUDIT_TIMEOUT_MS);

  const fxBefore = fs.readdirSync(FX).sort();
  fs.rmSync(FX, { recursive: true, force: true });
  const fxAfterExists = fs.existsSync(FX);

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'files',
    declarations: decl,
    live,
    sessionRoot,
    deleteFileDoomedSurvived: doomedSurvived,
    fixtures: { before: fxBefore, removed: !fxAfterExists },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_files.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])), live, deleteFileDoomedSurvived: doomedSurvived, fixturesRemoved: !fxAfterExists }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_FILES_FAILED', e); process.exit(1); });
