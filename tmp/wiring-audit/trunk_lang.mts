// MUSE wiring-audit checkpoint 24: language_runtimes (4) trunk stories
// + LEVEL-4 live probes + verification-consumer completion (static partition +
// pure-function verdict table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 4 names
//   (execute_python, go_builder, java_builder, python_builder) +
//   isVerificationTool partition.
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; execution embargo care):
//   - execute_python: empty/blank guards (pre-exec) + ONE print leg +
//     syntax-error contract leg + bad-cwd leg (spawn legs; python3 may
//     be absent on this Windows box -> honest-fail shape, no retry)
//   - go_builder: empty/bad-action guards + scaffold-on-nonce (writes
//     process.cwd() = api/ by source design, NOT the session root -
//     the probe uses a nonce name, byte-verifies, then REMOVES it) +
//     build/test/dependencies canned legs
//   - java_builder: same shape as go (maven scaffold + gradle
//     build-command leg)
//   - python_builder: empty guard + flask/django/fastapi/basic legs
//     (pure generator: must NOT touch projectPath on disk) +
//     unknown-framework fallthrough leg.
// EMBARGO: no traversal projectName live legs (path.join(process.cwd(),
//   projectName) unsanitized is code-cited, survey-only); no timeout-cap
//   live leg (would need a 120s+ run); no live injection payloads; no
//   network legs; no go/java toolchain invocations (build legs are
//   canned by source design — that IS the finding).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'execute_python', 'go_builder', 'java_builder', 'python_builder',
];
const TOKEN = 'WIRING_LANG_TOKEN_24f1';
const CALL_TIMEOUT_MS = 30000;

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
    console.error(`TRUNK_LANG_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_LANG_ABORT missing tool ${n}`); process.exit(1); }
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
    'py guard': verdictOf({ ok: false, error: 'No Python code provided.' }),
    'py print-ok': verdictOf({ ok: true, output: { stdout: 'hello', stderr: '', exitCode: 0 } }),
    'py syntax-fail': verdictOf({ ok: false, error: 'SyntaxError: invalid syntax', output: { stdout: '', stderr: 'SyntaxError', exitCode: 1 } }),
    'go unknown': verdictOf({ ok: false, error: 'Unknown action: explode' }),
    'go scaffold-ok': verdictOf({ ok: true, output: { success: true, projectName: 'x', filesCreated: ['go.mod'] } }),
    'go build-canned': verdictOf({ ok: true, output: { success: true, buildCommand: 'go build -o bin/app ./cmd/app' } }),
    'jv scaffold-ok': verdictOf({ ok: true, output: { success: true, projectName: 'x', buildTool: 'maven' } }),
    'pb files': verdictOf({ ok: true, output: { success: true, framework: 'flask', files: [{ path: 'app.py' }] } }),
    'pb empty': verdictOf({ ok: false, error: "Cannot read properties of undefined (reading 'toUpperCase')" }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-lang-fx');
  const rootsBefore: Record<string, string[]> = {};
  try { rootsBefore.session = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : []; }
  catch { rootsBefore.session = ['READ_FAILED']; }
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
        hasDataField: (r as any)?.data !== undefined ? shape((r as any).data) : null,
        log0: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[0]).slice(0, 200)) : null,
        logLast: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[r.logs.length - 1]).slice(0, 300)) : null,
        logN: Array.isArray(r?.logs) ? r.logs.length : null,
      };
    } catch (e: any) {
      live[id] = { input: scrub(JSON.stringify(input).slice(0, 200)), threw: scrub(String(e?.message || e).slice(0, 260)) };
    }
  };
  const run = (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => runWithCtx(id, name, input, ctx, timeoutMs);

  // ---- fixtures ----
  fs.mkdirSync(FX, { recursive: true });

  // ---- legs: execute_python ----
  await run('py.empty', 'execute_python', {});
  await run('py.blank', 'execute_python', { code: '   \n  ' });
  await run('py.print', 'execute_python', { code: `print('${TOKEN}')` });
  live['py.print-compare'] = {
    ok: !!raw['py.print']?.ok,
    stdoutHasToken: String((raw['py.print'] as any)?.output?.stdout || '').includes(TOKEN),
    exitCode: (raw['py.print'] as any)?.output?.exitCode ?? null,
    errorPrefix: raw['py.print']?.error ? String(raw['py.print'].error).slice(0, 120) : null,
    stderrPrefix: String((raw['py.print'] as any)?.output?.stderr || '').slice(0, 160) || null,
  };
  await run('py.syntax', 'execute_python', { code: 'def broken(:\n  pass' });
  live['py.syntax-compare'] = {
    ok: !!raw['py.syntax']?.ok,
    exitCode: (raw['py.syntax'] as any)?.output?.exitCode ?? null,
    errorPrefix: raw['py.syntax']?.error ? String(raw['py.syntax'].error).slice(0, 120) : null,
  };
  await run('py.badcwd', 'execute_python', { code: 'print(1)', workingDirectory: path.join(FX, 'no-such-dir') });
  live['py.compare'] = {
    emptyOk: !!raw['py.empty']?.ok,
    emptyError: raw['py.empty']?.error ? String(raw['py.empty'].error).slice(0, 80) : null,
    blankOk: !!raw['py.blank']?.ok,
    printOk: !!raw['py.print']?.ok,
    syntaxOk: !!raw['py.syntax']?.ok,
    badcwdOk: !!raw['py.badcwd']?.ok,
    badcwdErrorPrefix: raw['py.badcwd']?.error ? String(raw['py.badcwd'].error).slice(0, 120) : null,
  };

  // ---- legs: go_builder (scaffold writes process.cwd(), NOT session root) ----
  await run('go.empty', 'go_builder', {});
  await run('go.badaction', 'go_builder', { action: 'explode' });
  const goNonce = `wiring-go-fx-24f1`;
  const goDir = path.join(apiCwd, goNonce);
  const goPreExisted = fs.existsSync(goDir);
  await run('go.scaffold', 'go_builder', { action: 'scaffold', projectName: goNonce, framework: 'plain', features: [] });
  const goMod = path.join(goDir, 'go.mod');
  const goMain = path.join(goDir, 'cmd', 'app', 'main.go');
  live['go.scaffold-compare'] = {
    ok: !!raw['go.scaffold']?.ok,
    preExisted: goPreExisted,
    wroteApiCwd: !goPreExisted && fs.existsSync(goDir),
    wroteSessionRoot: fs.existsSync(path.join(sessionRoot, goNonce)),
    goModExists: fs.existsSync(goMod),
    goModHasModule: fs.existsSync(goMod) ? fs.readFileSync(goMod, 'utf-8').includes(`module github.com/example/${goNonce}`) : null,
    mainIsPlain: fs.existsSync(goMain) ? (fs.readFileSync(goMain, 'utf-8').includes('net/http') && !fs.readFileSync(goMain, 'utf-8').includes('gin-gonic')) : null,
    filesCreatedN: Array.isArray((raw['go.scaffold'] as any)?.output?.filesCreated) ? (raw['go.scaffold'] as any).output.filesCreated.length : null,
    projectPath: String((raw['go.scaffold'] as any)?.output?.projectPath || '').slice(0, 120),
  };
  // Remove ONLY what this leg created (iff WE created it).
  if (!goPreExisted && fs.existsSync(goDir)) {
    try { fs.rmSync(goDir, { recursive: true, force: true }); live['go.scaffold-compare'].removed = !fs.existsSync(goDir); }
    catch (e: any) { live['go.scaffold-compare'].removeFailed = String(e?.message || e).slice(0, 100); }
  }
  await run('go.build', 'go_builder', { action: 'build' });
  await run('go.test', 'go_builder', { action: 'test' });
  await run('go.deps', 'go_builder', { action: 'dependencies', dependencies: ['github.com/fx/mod@v1.0.0'] });
  live['go.compare'] = {
    emptyOk: !!raw['go.empty']?.ok,
    emptyError: raw['go.empty']?.error ? String(raw['go.empty'].error).slice(0, 80) : null,
    badOk: !!raw['go.badaction']?.ok,
    scaffoldOk: !!raw['go.scaffold']?.ok,
    buildOk: !!raw['go.build']?.ok,
    buildMsg: String((raw['go.build'] as any)?.output?.message || '').slice(0, 100),
    testOk: !!raw['go.test']?.ok,
    depsOk: !!raw['go.deps']?.ok,
    depsEchoed: Array.isArray((raw['go.deps'] as any)?.output?.dependencies) ? (raw['go.deps'] as any).output.dependencies.length : null,
  };

  // ---- legs: java_builder (same cwd-write shape as go) ----
  await run('jv.empty', 'java_builder', {});
  await run('jv.badaction', 'java_builder', { action: 'explode' });
  const jvNonce = `wiringjvfx24f1`;
  const jvDir = path.join(apiCwd, jvNonce);
  const jvPreExisted = fs.existsSync(jvDir);
  await run('jv.scaffold', 'java_builder', { action: 'scaffold', projectName: jvNonce, framework: 'spring-boot', buildTool: 'maven', javaVersion: '17', features: ['web'] });
  const jvPom = path.join(jvDir, 'pom.xml');
  const jvCtl = path.join(jvDir, 'src', 'main', 'java', 'com', 'example', jvNonce.toLowerCase(), 'controller', 'HelloController.java');
  live['jv.scaffold-compare'] = {
    ok: !!raw['jv.scaffold']?.ok,
    preExisted: jvPreExisted,
    wroteApiCwd: !jvPreExisted && fs.existsSync(jvDir),
    wroteSessionRoot: fs.existsSync(path.join(sessionRoot, jvNonce)),
    pomExists: fs.existsSync(jvPom),
    pomHasWeb: fs.existsSync(jvPom) ? fs.readFileSync(jvPom, 'utf-8').includes('spring-boot-starter-web') : null,
    controllerExists: fs.existsSync(jvCtl),
    filesCreatedN: Array.isArray((raw['jv.scaffold'] as any)?.output?.filesCreated) ? (raw['jv.scaffold'] as any).output.filesCreated.length : null,
  };
  if (!jvPreExisted && fs.existsSync(jvDir)) {
    try { fs.rmSync(jvDir, { recursive: true, force: true }); live['jv.scaffold-compare'].removed = !fs.existsSync(jvDir); }
    catch (e: any) { live['jv.scaffold-compare'].removeFailed = String(e?.message || e).slice(0, 100); }
  }
  await run('jv.build-gradle', 'java_builder', { action: 'build', buildTool: 'gradle' });
  await run('jv.test', 'java_builder', { action: 'test' });
  await run('jv.deps', 'java_builder', { action: 'dependencies', dependencies: ['org.fx:lib:1.0'] });
  live['jv.compare'] = {
    emptyOk: !!raw['jv.empty']?.ok,
    badOk: !!raw['jv.badaction']?.ok,
    scaffoldOk: !!raw['jv.scaffold']?.ok,
    buildGradleCmd: String((raw['jv.build-gradle'] as any)?.output?.buildCommand || '').slice(0, 60),
    buildGradleOk: !!raw['jv.build-gradle']?.ok,
    testOk: !!raw['jv.test']?.ok,
    testFramework: String((raw['jv.test'] as any)?.output?.testFramework || '').slice(0, 40),
    depsOk: !!raw['jv.deps']?.ok,
  };

  // ---- legs: python_builder (pure generator: must NOT touch disk) ----
  await run('pb.empty', 'python_builder', {});
  const pbProjDir = path.join(FX, 'pbproj-should-not-exist');
  await run('pb.flask', 'python_builder', { framework: 'flask', projectName: 'fxshop', projectPath: pbProjDir, features: ['db', 'auth'] });
  const flaskOut = (raw['pb.flask'] as any)?.output;
  const reqFile = Array.isArray(flaskOut?.files) ? flaskOut.files.find((f: any) => f?.path === 'requirements.txt') : null;
  live['pb.flask-compare'] = {
    ok: !!raw['pb.flask']?.ok,
    wroteProjectPath: fs.existsSync(pbProjDir),
    filesN: Array.isArray(flaskOut?.files) ? flaskOut.files.length : null,
    reqHasFlask: reqFile ? String(reqFile.content || '').includes('Flask>=') : null,
    reqHasDb: reqFile ? String(reqFile.content || '').includes('Flask-SQLAlchemy') : null,
    reqHasAuth: reqFile ? String(reqFile.content || '').includes('Flask-Login') : null,
    nextStepsCd: Array.isArray(flaskOut?.nextSteps) ? String(flaskOut.nextSteps[0] || '').slice(0, 80) : null,
  };
  await run('pb.django', 'python_builder', { framework: 'django', projectName: 'fxsite', projectPath: pbProjDir, features: [] });
  await run('pb.fastapi', 'python_builder', { framework: 'fastapi', projectName: 'fxapi', projectPath: pbProjDir, features: ['db'] });
  await run('pb.basic', 'python_builder', { framework: 'basic', projectName: 'fxbasic', projectPath: pbProjDir });
  await run('pb.badframework', 'python_builder', { framework: 'rails', projectName: 'fxbad', projectPath: pbProjDir });
  live['pb.compare'] = {
    emptyOk: !!raw['pb.empty']?.ok,
    emptyError: raw['pb.empty']?.error ? String(raw['pb.empty'].error).slice(0, 80) : null,
    flaskOk: !!raw['pb.flask']?.ok,
    djangoFilesN: Array.isArray((raw['pb.django'] as any)?.output?.files) ? (raw['pb.django'] as any).output.files.length : null,
    djangoOk: !!raw['pb.django']?.ok,
    fastapiOk: !!raw['pb.fastapi']?.ok,
    basicHasMain: Array.isArray((raw['pb.basic'] as any)?.output?.files) ? (raw['pb.basic'] as any).output.files.some((f: any) => f?.path === 'main.py') : null,
    badframeworkOk: !!raw['pb.badframework']?.ok,
    badframeworkFilesN: Array.isArray((raw['pb.badframework'] as any)?.output?.files) ? (raw['pb.badframework'] as any).output.files.length : null,
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    const apiAfter = fs.existsSync(apiCwd) ? fs.readdirSync(apiCwd).sort() : [];
    const apiStrays = apiBefore[0] === 'READ_FAILED' ? [] : apiAfter.filter(x => !apiBefore.includes(x) && x !== 'wiring-go-fx-24f1' && x !== 'wiringjvfx24f1');
    // Belt-and-braces: if the scaffold legs failed to remove their nonce dirs, report (do NOT delete unknowns).
    for (const n of ['wiring-go-fx-24f1', 'wiringjvfx24f1']) {
      if (fs.existsSync(path.join(apiCwd, n))) cleanupNotes.push(`NONCE_LEFT:${n}`);
    }
    cleanup = strays.length || apiStrays.length ? `STRAYS:session[${strays.join(',')}]|api[${apiStrays.join(',')}]` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'language_runtimes', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, apiCwd, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_lang.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=lang legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_LANG_FATAL', e); process.exit(1); });
