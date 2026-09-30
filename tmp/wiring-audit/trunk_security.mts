// MUSE wiring-audit checkpoint 14: security-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table for the trunk's two task-level checkers).
// Part A: declarations + self-grounded selection for the 3 security names
//   (dependency_audit, secrets_scan_repo, security_scanner) + isVerificationTool
//   partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; NO network legs; npm audit legs use
//   lockfile-less/empty fixtures that fail fast without registry access).
// EMBARGO: dependency_audit positive-leg (real audit with lockfile) is NOT
//   executed (registry network + long runtime). dependency_audit {} is NEVER
//   executed (defaults to Joe's own repo root, WIRING-P2-006). secrets {} is
//   NEVER executed (missing required path silently becomes a default-root scan;
//   only the pure resolveToolPath('') mapping is recorded, no scan).
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_security.mts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'dependency_audit', 'secrets_scan_repo', 'security_scanner',
];
const TOKEN = 'WIRING_SEC_TOKEN_14x';
const CALL_TIMEOUT_MS = 25000;
const NPM_TIMEOUT_MS = 90000;

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
    console.error(`TRUNK_SECURITY_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_SECURITY_ABORT missing tool ${n}`); process.exit(1); }
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
      requiredAny: (t as any)?.inputSchema?.requiredAny ?? null,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      sideEffects: Array.isArray(t?.sideEffects) ? t.sideEffects.map(String) : (t?.sideEffects === undefined ? null : t?.sideEffects),
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
    'dep_audit pass': verdictOf({ ok: true, output: { report: 'No vulnerabilities found!' } }),
    'dep_audit enolock-mislabeled': verdictOf({ ok: false, error: 'Audit found security vulnerabilities.', output: { report: 'npm error code ENOLOCK' } }),
    'secrets clean': verdictOf({ ok: true, output: { findings: [], scannedFiles: 3 } }),
    'secrets findings': verdictOf({ ok: false, error: 'Found 4 potential secrets in codebase.', output: { findings: [{ type: 'openai_key', file: 's.js', line: 2 }], scannedFiles: 3 } }),
    'scanner clean': verdictOf({ ok: true, output: { vulnerabilities: [], riskScore: 0, filesScanned: 2 } }),
    'scanner findings-present': verdictOf({ ok: true, output: { vulnerabilities: [{ severity: 'critical', type: 'Hardcoded Secret' }], riskScore: 25, filesScanned: 2 } }),
    'scanner missing-files': verdictOf({ ok: false, error: 'security_scanner could not scan 1 requested file(s): nope.js', output: { vulnerabilities: [], riskScore: 0 } }),
  };

  // Pure mapping proof (no scan): resolveToolPath('') for the secrets {} shape.
  const toolUtils: any = await imp(path.join(SRC, 'modules', 'tools', 'utils.ts'));
  let emptyPathMapsTo: string | null = null;
  let emptyPathThrew: string | null = null;
  try {
    emptyPathMapsTo = String(toolUtils.resolveToolPath(''));
  } catch (e: any) {
    emptyPathThrew = String(e?.message || e).slice(0, 200);
  }

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FXSCAN = path.join(sessionRoot, 'wiring-sec-scan');
  const FXSEC = path.join(sessionRoot, 'wiring-sec-secrets');
  const FXNOLOCK = path.join(sessionRoot, 'wiring-sec-nolock');
  const FXEMPTY = path.join(sessionRoot, 'wiring-sec-empty');
  for (const d of [FXSCAN, FXSEC, FXNOLOCK, FXEMPTY]) fs.mkdirSync(d, { recursive: true });

  // Scanner fixture: 1 clean + 1 seeded-vuln js file + 1 .env (discovery-excluded ext).
  fs.writeFileSync(path.join(FXSCAN, 'clean.js'), `// ${TOKEN}\nmodule.exports.add = (a, b) => a + b;\n`);
  fs.writeFileSync(path.join(FXSCAN, 'vuln.js'), [
    `// ${TOKEN} synthetic scanner fixture`,
    `const password = "synthetic-test-password-001";`,
    `const out = eval(userExpr);`,
    `el.innerHTML = req.query.name;`,
    `const q = query + req.body.id;`,
    `if (req.params.id) { run(req.params.id); }`,
    ``,
  ].join('\n'));
  fs.writeFileSync(path.join(FXSCAN, '.env'), `API_KEY="synthetic-env-key-0123456789"\n`);

  // Secrets fixture: seeded findings + clean file + ignored node_modules plant.
  fs.writeFileSync(path.join(FXSEC, 'secrets.js'), [
    `// ${TOKEN} synthetic secrets fixture`,
    `const apiKey = "sk-syntheticTestKey0123456789abcdef00";`,
    `const password = "synthetic-test-password-001";`,
    ``,
  ].join('\n'));
  fs.writeFileSync(path.join(FXSEC, 'clean.txt'), `nothing here, just wiring token ${TOKEN}\n`);
  fs.writeFileSync(path.join(FXSEC, '.env'), `API_KEY="synthetic-env-key-0123456789"\n`);
  fs.mkdirSync(path.join(FXSEC, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(FXSEC, 'node_modules', 'evil.js'), `const password = "synthetic-ignored-secret-0001";\n`);

  // npm fixtures: lockfile-less package + empty dir.
  fs.writeFileSync(path.join(FXNOLOCK, 'package.json'), JSON.stringify({ name: 'wiring-sec-nolock', version: '1.0.0' }, null, 2));

  const fxBefore = {
    scan: fs.readdirSync(FXSCAN).sort(),
    sec: fs.readdirSync(FXSEC).sort(),
    nolock: fs.readdirSync(FXNOLOCK).sort(),
    empty: fs.readdirSync(FXEMPTY).sort(),
  };

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
        error: r?.error ? String(r.error).slice(0, 260) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 300)
          : (o && typeof o === 'object' ? JSON.stringify(o).slice(0, 900) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[id] = { input: JSON.stringify(input).slice(0, 200), threw: String(e?.message || e).slice(0, 220) };
    }
  };

  // security_scanner legs (read-only; contained to session root via ctx workspace).
  await run('scan.seeded-files', 'security_scanner', { files: ['clean.js', 'vuln.js'], projectPath: FXSCAN });
  await run('scan.discover', 'security_scanner', { projectPath: FXSCAN });
  await run('scan.explicit-env', 'security_scanner', { files: ['.env'], projectPath: FXSCAN });
  await run('scan.missing', 'security_scanner', { files: ['nope.js'], projectPath: FXSCAN });
  await run('scan.empty-dir', 'security_scanner', { projectPath: FXEMPTY });
  await run('scan.outside-nonexistent', 'security_scanner', { projectPath: path.join(os.tmpdir(), 'wiring-sec-nope-14x') });
  await run('scan.file-target', 'security_scanner', { projectPath: path.join('wiring-sec-scan', 'vuln.js') });

  // secrets_scan_repo legs (read-only; projectRoot-bounded, see discovery doc).
  await run('secrets.seeded', 'secrets_scan_repo', { path: FXSEC });
  await run('secrets.clean', 'secrets_scan_repo', { path: FXEMPTY });
  await run('secrets.missing', 'secrets_scan_repo', { path: path.join(sessionRoot, 'wiring-sec-nope-14x') });
  await run('secrets.cap', 'secrets_scan_repo', { path: FXSEC, maxFindings: 1 });

  // dependency_audit legs (fast-fail fixtures only; never {} — see embargo).
  await run('audit.enolock', 'dependency_audit', { path: FXNOLOCK }, NPM_TIMEOUT_MS);
  await run('audit.empty-dir', 'dependency_audit', { path: FXEMPTY }, NPM_TIMEOUT_MS);

  const fxAfter = {
    scan: fs.existsSync(FXSCAN) ? fs.readdirSync(FXSCAN).sort() : null,
    sec: fs.existsSync(FXSEC) ? fs.readdirSync(FXSEC).sort() : null,
    nolock: fs.existsSync(FXNOLOCK) ? fs.readdirSync(FXNOLOCK).sort() : null,
    empty: fs.existsSync(FXEMPTY) ? fs.readdirSync(FXEMPTY).sort() : null,
  };
  const fixturesUntouched =
    JSON.stringify(fxBefore.scan) === JSON.stringify(fxAfter.scan) &&
    JSON.stringify(fxBefore.sec) === JSON.stringify(fxAfter.sec) &&
    JSON.stringify(fxBefore.nolock) === JSON.stringify(fxAfter.nolock) &&
    JSON.stringify(fxBefore.empty) === JSON.stringify(fxAfter.empty);
  for (const d of [FXSCAN, FXSEC, FXNOLOCK, FXEMPTY]) fs.rmSync(d, { recursive: true, force: true });
  const fxGone = ![FXSCAN, FXSEC, FXNOLOCK, FXEMPTY].some(d => fs.existsSync(d));

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'security',
    declarations: decl,
    verdictTable,
    emptyPathMapsTo,
    emptyPathThrew,
    live,
    sessionRoot,
    fixtures: { before: fxBefore, after: fxAfter, untouched: fixturesUntouched, removed: fxGone },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_security.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])),
    checkerTaskLevel: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.checkerTaskLevel])),
    verdictTable, emptyPathMapsTo, emptyPathThrew, live,
    fixturesUntouched, fixturesRemoved: fxGone,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_SECURITY_FAILED', e); process.exit(1); });
