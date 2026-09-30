// MUSE wiring-audit checkpoint 027: P1-012 consumer-survey completion.
// Completes the 3 remaining executionEngine.run() consumer live checks
// queued by checkpoint 026 (F202): DeadCodeTool.ts:65,
// ErrorRecoveryTool.ts:146, RepoSelfCodingTools.ts:90 (+233/271 rows).
// Part A: declarations + self-grounded selection for the 4 surveyed names.
// Part B: pure-function verdict table over source-grounded shapes.
// Part C: live canonical-path execution (ToolService.executeTool inside
//   firewall runInContext) with contained fixtures (created + removed by
//   the probe; execution embargo care):
//   - dead_code_detector: fixture projects with a LOCAL knip.cmd shim
//     (valid-JSON exit-0 leg + text-output exit-3 leg) reached through a
//     fixture npx.cmd shim on a PREPENDED process-only PATH (dispatches
//     via NPX_FX_KNIP). The tool's REAL command string
//     (`npx knip --reporter json`) still executes through a real shell;
//     only the npx binary is fixture-owned, so zero network by design.
//     Pilot finding (honestly retained): real npx IGNORES a loose
//     fixture-local .bin/knip.cmd and attempts a registry fetch (failed
//     here on sandbox npm-cache EPERM; nothing downloaded or installed).
//     The filed legs therefore pin the tool's output-shape handling,
//     not real-npx resolution.
//   - error_recovery: analyze-only control (no execution) + autofix leg
//     with a fixture npm.cmd shim on a PREPENDED process-only PATH
//     (exits 3, prints to stderr, zero network, zero writes). Restores
//     PATH after. Proves or refutes lie-inheritance live.
//   - repo_run_command: allowlisted 'git status --short' in a
//     git-initialized fixture (offline-safe: git init + status only) +
//     a direct runArgv control proving the command itself exits 0.
//   - repo_diff_summary: read-only git status/diff at the real repo root
//     (no writes by construction; recorded for the :271 row).
// EMBARGO: no real npm install; no npx downloads (fixture shims only);
//   no model/provider/network legs; no writes outside FX (removed after);
//   no cross-session state (PATH restored, no globals touched).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TOOLS = ['dead_code_detector', 'error_recovery', 'repo_run_command', 'repo_diff_summary'];
const CALL_TIMEOUT_MS = 30000;
const CALL_TIMEOUT_DC_MS = 120000;

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
    console.error(`P1012_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TOOLS) {
    if (!byName.has(n)) { console.error(`P1012_ABORT missing tool ${n}`); process.exit(1); }
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
  const verdictOf = ledger.verificationResultFromToolResult as (v: unknown) => string;

  // ---- Part A ----
  const decl: Record<string, any> = {};
  for (const n of TOOLS) {
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
      required: Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : null,
      properties: t?.inputSchema?.properties && typeof t.inputSchema.properties === 'object' ? Object.keys(t.inputSchema.properties) : null,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      routerExcluded: excluded ? excluded.has(n) : null,
      priorityListed: priority ? priority.has(n) : null,
      verdict: best30 <= 30 ? 'SELECTABLE_BY_KEYWORD' : (bestFull <= fullLimit ? 'LONG_TAIL_RANKED' : 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
      bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
    };
  }

  // ---- Part B ----
  const verdictTable: Record<string, string> = {
    'dc json-ok-shape': verdictOf({ ok: true, output: { summary: { totalIssues: 0 } } }),
    'dc parsefail-shape': verdictOf({ ok: false, error: 'knip produced output that is not JSON, so nothing was scanned: x' }),
    'er healed-shape': verdictOf({ ok: true, output: { recovered: true } }),
    'er nothealed-shape': verdictOf({ ok: true, output: { recovered: false } }),
    'rr gitok-shape': verdictOf({ ok: true, output: { command: 'git status --short', exitCode: 0, stdout: '', stderr: '' } }),
    'rr cmdfail-shape': verdictOf({ ok: false, error: 'command_failed', output: { command: 'git status --short', stdout: '', stderr: '' } }),
  };

  // ---- Part C ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const eng: any = await imp(path.join(SRC, 'kernel', 'ExecutionEngine.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const defaultRoot: string = ws.workspaceService.getActiveRoot();
  const FX = path.join(ROOT, 'tmp', 'wiring-audit', 'fx-p1012');
  const KNIP_OK = path.join(FX, 'knip-ok');
  const KNIP_BAD = path.join(FX, 'knip-bad');
  const BIN = path.join(FX, 'bin');
  const GITFIX = path.join(FX, 'gitfix');
  const rootsBefore: Record<string, string[]> = {};
  try { rootsBefore.session = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : []; }
  catch { rootsBefore.session = ['READ_FAILED']; }
  try { rootsBefore.default = fs.existsSync(defaultRoot) ? fs.readdirSync(defaultRoot).sort() : []; }
  catch { rootsBefore.default = ['READ_FAILED']; }
  const apiCwd = process.cwd();
  let apiBefore: string[] = [];
  try { apiBefore = fs.existsSync(apiCwd) ? fs.readdirSync(apiCwd).sort() : []; } catch { apiBefore = ['READ_FAILED']; }

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
          : (o && typeof o === 'object' ? scrub(JSON.stringify(o).slice(0, 1400)) : (o === null ? 'null' : String(o).slice(0, 200))),
        logLast: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[r.logs.length - 1]).slice(0, 300)) : null,
        logN: Array.isArray(r?.logs) ? r.logs.length : null,
      };
    } catch (e: any) {
      live[id] = { input: scrub(JSON.stringify(input).slice(0, 200)), threw: scrub(String(e?.message || e).slice(0, 260)) };
    }
  };
  const run = (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => runWithCtx(id, name, input, ctx, timeoutMs);

  // ---- fixtures ----
  for (const d of [KNIP_OK, KNIP_BAD, BIN, GITFIX]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(KNIP_OK, 'package.json'), JSON.stringify({ name: 'fx-knip-ok', type: 'module' }));
  fs.writeFileSync(path.join(KNIP_BAD, 'package.json'), JSON.stringify({ name: 'fx-knip-bad', type: 'module' }));
  const okBin = path.join(KNIP_OK, 'node_modules', '.bin');
  const badBin = path.join(KNIP_BAD, 'node_modules', '.bin');
  fs.mkdirSync(okBin, { recursive: true });
  fs.mkdirSync(badBin, { recursive: true });
  fs.writeFileSync(path.join(okBin, 'knip.cmd'), '@echo {"files":[],"dependencies":[]}\r\n@exit 0\r\n');
  fs.writeFileSync(path.join(badBin, 'knip.cmd'), '@echo fixture-knip: simulated failure 1>&2\r\n@exit 3\r\n');
  fs.writeFileSync(path.join(BIN, 'npm.cmd'),
    '@echo fixture-npm: NO-NETWORK simulated failure 1>&2\r\n@exit 3\r\n');
  fs.writeFileSync(path.join(BIN, 'npx.cmd'), '@"%NPX_FX_KNIP%" %*\r\n');
  const okShim = path.join(okBin, 'knip.cmd');
  const badShim = path.join(badBin, 'knip.cmd');
  fs.writeFileSync(path.join(GITFIX, 'note.txt'), 'p1012 fixture\n');
  try {
    execFileSync('git', ['init'], { cwd: GITFIX, timeout: 15000 });
    execFileSync('git', ['add', '.'], { cwd: GITFIX, timeout: 15000 });
  } catch (e: any) {
    live['fx.git-init'] = { threw: String(e?.message || e).slice(0, 200) };
  }
  const gitRel = path.relative(ROOT, GITFIX).replace(/\\/g, '/');

  // ---- legs ----
  const savedPath = process.env.PATH || '';
  process.env.PATH = BIN + path.delimiter + savedPath;
  let pathRestored = false;
  try {
    process.env.NPX_FX_KNIP = okShim;
    await run('dc.json-ok', 'dead_code_detector', { mode: 'scan', projectPath: KNIP_OK }, CALL_TIMEOUT_DC_MS);
    process.env.NPX_FX_KNIP = badShim;
    await run('dc.bad-output', 'dead_code_detector', { mode: 'scan', projectPath: KNIP_BAD }, CALL_TIMEOUT_DC_MS);
    delete process.env.NPX_FX_KNIP;
    await run('er.analyze-only', 'error_recovery', { error: "Cannot find module 'shim-pkg-abc123'", attemptFix: false });
    await run('er.autoinstall-shim', 'error_recovery', { error: "Cannot find module 'shim-pkg-abc123'", attemptFix: true });
  } finally {
    delete process.env.NPX_FX_KNIP;
    process.env.PATH = savedPath;
    pathRestored = process.env.PATH === savedPath;
  }
  await run('rr.git-status', 'repo_run_command', { command: 'git status --short', cwd: gitRel });
  await run('rd.summary', 'repo_diff_summary', {});
  // direct control: the same git command via the honest runArgv sibling
  try {
    const ctrl = await withTimeout(
      eng.executionEngine.runArgv('git', ['-C', GITFIX, 'status', '--short'], { timeout: 15000 }),
      20000);
    live['ctrl.git-direct'] = ctrl.timedOut ? { timedOut: true }
      : { ok: !!(ctrl as any).value?.ok, exitCode: (ctrl as any).value?.exitCode ?? null,
          outLen: String((ctrl as any).value?.output || '').length };
  } catch (e: any) {
    live['ctrl.git-direct'] = { threw: String(e?.message || e).slice(0, 200) };
  }

  const dcOk: any = raw['dc.json-ok'];
  const dcBad: any = raw['dc.bad-output'];
  const erCtl: any = raw['er.analyze-only'];
  const erFix: any = raw['er.autoinstall-shim'];
  const rr: any = raw['rr.git-status'];
  const rd: any = raw['rd.summary'];
  live['compare'] = {
    dcJsonOk: dcOk && !dcOk.timedOut ? !!dcOk.ok : null,
    dcJsonErrPrefix: dcOk?.error ? String(dcOk.error).slice(0, 80) : null,
    dcJsonHasSummary: !!(dcOk as any)?.output?.summary,
    dcBadOk: dcBad && !dcBad.timedOut ? !!dcBad.ok : null,
    dcBadErrPrefix: dcBad?.error ? String(dcBad.error).slice(0, 80) : null,
    dcBadScannedFalse: (dcBad as any)?.output?.scanned === false,
    erCtlOk: erCtl ? !!erCtl.ok : null,
    erCtlRecovered: (erCtl as any)?.output?.recovered ?? null,
    erCtlType: (erCtl as any)?.output?.errorType ?? null,
    erFixRecovered: (erFix as any)?.output?.recovered ?? null,
    erFixLogHasHealed: Array.isArray((erFix as any)?.logs)
      ? (erFix as any).logs.some((l: any) => String(l).includes('successfully healed')) : null,
    erFixLogLast: Array.isArray((erFix as any)?.logs) ? String((erFix as any).logs.slice(-1)[0] || '').slice(0, 120) : null,
    pathRestored,
    rrOk: rr ? !!rr.ok : null,
    rrErrPrefix: rr?.error ? String(rr.error).slice(0, 60) : null,
    rrExitCode: (rr as any)?.output?.exitCode ?? null,
    rdOk: rd ? !!rd.ok : null,
    rdHasStatus: typeof (rd as any)?.output?.status === 'string',
    ctrlOk: (live['ctrl.git-direct'] as any)?.ok ?? null,
    ctrlExit: (live['ctrl.git-direct'] as any)?.exitCode ?? null,
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    process.env.PATH = savedPath;
    fs.rmSync(FX, { recursive: true, force: true });
    if (fs.existsSync(FX)) cleanupNotes.push('FX_SURVIVED');
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    const defAfter = fs.existsSync(defaultRoot) ? fs.readdirSync(defaultRoot).sort() : [];
    const defStrays = rootsBefore.default[0] === 'READ_FAILED' ? [] : defAfter.filter(x => !rootsBefore.default.includes(x));
    const apiAfter = fs.existsSync(apiCwd) ? fs.readdirSync(apiCwd).sort() : [];
    const apiStrays = apiBefore[0] === 'READ_FAILED' ? [] : apiAfter.filter(x => !apiBefore.includes(x));
    cleanup = (strays.length || defStrays.length || apiStrays.length)
      ? `STRAYS:session[${strays.join(',')}]|default[${defStrays.join(',')}]|api[${apiStrays.join(',')}]` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }
  const legIds = Object.keys(live).filter(k => k !== 'compare');
  const okLegs = legIds.filter(k => (live[k] as any)?.ok === true).length;
  const evidence = {
    probe: 'p1012_survey', decl, verdictTable, live,
    cleanup, sessionRoot, defaultRoot, apiCwd, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'p1012.json'), JSON.stringify(evidence, null, 2));
  console.log(`EVIDENCE probe=p1012 legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const [k, v] of Object.entries(live['compare'] as any)) console.log(`COMPARE ${k}=${JSON.stringify(v)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('P1012_FATAL', e); process.exit(1); });
