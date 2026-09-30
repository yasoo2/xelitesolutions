// MUSE wiring-audit checkpoint 19: shell_terminal-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 4 shell_terminal names
//   (npm_manager, shell_check_status, shell_execute, terminal_manager)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; NO network legs; harmless commands only:
//   echo, node -e exit/print, short self-exiting sleepers, npm --version;
//   background sleepers are bounded <=10s and reaped via status checks;
//   terminal legs create/read/write-echo/kill exactly one session terminal).
// EMBARGO: npm install of real packages (registry network — only the
//   no-package.json refusal + --version legs run); shell_execute serverId
//   remote path (commandRouter — code-cited only); destructive commands
//   (rm/del/format/mkfs — only the documented substring-block legs run);
//   long-lived background servers (only bounded self-exiting sleepers);
//   terminal write beyond `echo` (interactive shells unprobed).
//   No model-present behavior is probed.
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 019 doc>
//   node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\trunk_shell.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'npm_manager', 'shell_check_status', 'shell_execute', 'terminal_manager',
];
const TOKEN = 'WIRING_SHELL_TOKEN_7a1c';
const CALL_TIMEOUT_MS = 25000;
const NPM_TIMEOUT_MS = 90000;

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

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_SHELL_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_SHELL_ABORT missing tool ${n}`); process.exit(1); }
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
    'shell success': verdictOf({ ok: true, output: { status: 'success', stdout: 'hi\n', stderr: '', exitCode: 0 } }),
    'shell failed-exit': verdictOf({ ok: false, error: 'command_failed', output: { status: 'failed', stdout: '', stderr: 'boom', exitCode: 1 } }),
    'shell blocked': verdictOf({ ok: false, error: 'command_not_allowed' }),
    'shell dryrun': verdictOf({ ok: true, output: { dryRun: true, status: 'success', command: 'echo x', stdout: '[dry run] echo x', exitCode: 0 } }),
    'shell background': verdictOf({ ok: true, output: { status: 'background', id: 'bg_1', pid: 4242, message: 'Command started in background.' } }),
    'shell already-running': verdictOf({ ok: true, output: { status: 'already_running', id: 'bg_1', pid: 4242, cwd: '/w', message: 'reused' } }),
    'status running': verdictOf({ ok: true, output: { running: true, pid: 4242, command: 'sleep', uptime: 1500 } }),
    'status gone': verdictOf({ ok: false, error: 'Process not found' }),
    'npm missing': verdictOf({ ok: false, error: 'missing_command' }),
    'npm refused': verdictOf({ ok: false, error: 'npm_install_target_is_not_a_package', message: 'no package.json' }),
    'term created': verdictOf({ ok: true, output: { id: 'terminal:s', pid: 99, message: 'Terminal created.' } }),
    'term killed': verdictOf({ ok: true, output: { message: 'Terminal killed via kernel' } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-shell-fx');
  const EMPTYD = path.join(FX, 'emptydir');
  const PKGD = path.join(FX, 'pkgdir');
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

  // ---- fixtures (all under the session root; removed afterwards) ----
  for (const d of [EMPTYD, PKGD]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(PKGD, 'package.json'), JSON.stringify({ name: 'fx-shell-pkg', private: true, version: '1.0.0' }));
  fs.writeFileSync(path.join(PKGD, 'marker.txt'), `marker ${TOKEN}\n`);

  // ---- legs: shell_execute ----
  await run('shell.nocmd', 'shell_execute', {});
  await run('shell.dryrun', 'shell_execute', { command: 'echo SHOULD_NOT_RUN', dryRun: true });
  await run('shell.echo', 'shell_execute', { command: `echo ${TOKEN}`, cwd: PKGD });
  await run('shell.exit3', 'shell_execute', { command: 'node -e "process.exit(3)"', cwd: PKGD });
  await run('shell.missingbin', 'shell_execute', { command: 'joe-definitely-no-such-binary-xyz --version', cwd: PKGD });
  await run('shell.blocked-sudo', 'shell_execute', { command: 'sudo echo hi', cwd: PKGD });
  await run('shell.overblock', 'shell_execute', { command: 'echo sudo', cwd: PKGD });
  await run('shell.cwd-escape', 'shell_execute', { command: 'echo hi', cwd: 'C:\\Windows' });
  await run('shell.cwd-missing', 'shell_execute', { command: 'echo hi', cwd: path.join(FX, 'no-such-dir') });

  // ---- legs: background + shell_check_status (bounded self-exiting sleeper) ----
  const SLEEP_CMD = 'node -e "setTimeout(()=>{},10000)"';
  await run('shell.bg1', 'shell_execute', { command: SLEEP_CMD, cwd: PKGD, background: true });
  const bgId: string | null = raw['shell.bg1']?.output?.id || null;
  const bgPid: number | null = raw['shell.bg1']?.output?.pid ?? null;
  await run('shell.bg2-reuse', 'shell_execute', { command: SLEEP_CMD, cwd: PKGD, background: true });
  if (bgId) await run('status.running', 'shell_check_status', { id: bgId });
  else live['status.running'] = { skipped: 'no bg id from shell.bg1' };
  await run('status.unknown', 'shell_check_status', { id: 'bg_no_such_id_zzz' });
  await sleep(12000);
  if (bgId) await run('status.after', 'shell_check_status', { id: bgId });
  else live['status.after'] = { skipped: 'no bg id from shell.bg1' };
  live['bg.meta'] = { bgId, bgPid };

  // ---- legs: npm_manager (no registry network) ----
  await run('npm.missing', 'npm_manager', { command: '' });
  await run('npm.refused', 'npm_manager', { command: 'install left-pad-xyz', cwd: EMPTYD });
  await run('npm.version', 'npm_manager', { command: '--version', cwd: PKGD }, NPM_TIMEOUT_MS);

  // ---- legs: terminal_manager (one session terminal, echo-only write) ----
  await run('term.create', 'terminal_manager', { action: 'create' });
  await run('term.list', 'terminal_manager', { action: 'list' });
  await run('term.write', 'terminal_manager', { action: 'write', command: `echo ${TOKEN}` });
  await sleep(2500);
  await run('term.read', 'terminal_manager', { action: 'read' });
  const termHistory: string = raw['term.read']?.output?.history ? String(raw['term.read'].output.history).slice(-2000) : '';
  live['term.tokenSeen'] = { tokenInHistory: termHistory.includes(TOKEN), historyTail: scrub(termHistory.slice(-400)) };
  await run('term.kill', 'terminal_manager', { action: 'kill' });
  await run('term.read-after-kill', 'terminal_manager', { action: 'read' });

  // ---- cleanup ----
  let cleanup = 'ok';
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    cleanup = strays.length ? `STRAYS:${strays.join(',')}` : 'ok';
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'shell_terminal', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_shell.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=shell_terminal legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_SHELL_FATAL', e); process.exit(1); });
