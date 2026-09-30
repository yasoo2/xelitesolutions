// MUSE wiring-audit checkpoint 17: build_generate-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 13 build_generate names
//   (ai_write_file, api_project, auth_builder, enterprise_platform_foundation,
//   mobile_builder, orion_business_foundation, progressive_generator,
//   react_project, scaffold_full_stack, scaffold_project, template_manager,
//   web_page_builder, website_full_pipeline)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained session fixtures
//   (created + removed by the probe; NO network legs; model-backed legs run
//   bounded under OFFLINE_MODE to record the no-provider shape only).
// EMBARGO: website_full_pipeline named legs are NOT executed (nested ToolService
//   execution + npm install + setActiveRoot workspace mutation; only the {}
//   honest leg runs). mobile_builder init without outputDir is NOT executed
//   (defaults to process.cwd() — code-cited only). scaffold_full_stack {} is
//   NOT executed (name defaults to my-app under repo data/projects —
//   code-cited only; the name-default shape is probed contained via baseDir).
//   react/api full (non-skipInstall) legs are NOT executed (npm install + live
//   boot; skipInstall positives only). No model-present behavior is probed.
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 017 doc>
//   .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_build.mts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'ai_write_file', 'api_project', 'auth_builder', 'enterprise_platform_foundation',
  'mobile_builder', 'orion_business_foundation', 'progressive_generator',
  'react_project', 'scaffold_full_stack', 'scaffold_project', 'template_manager',
  'web_page_builder', 'website_full_pipeline',
];
const TOKEN = 'WIRING_BUILD_TOKEN_7a1c';
const CALL_TIMEOUT_MS = 25000;
const MODEL_TIMEOUT_MS = 60000;
const HEAVY_TIMEOUT_MS = 150000;
const REACT_TIMEOUT_MS = 240000;

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

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_BUILD_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_BUILD_ABORT missing tool ${n}`); process.exit(1); }
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
    'scaffold created': verdictOf({ ok: true, output: { created: ['package.json', 'src/index.js'], errors: [] } }),
    'scaffold partial': verdictOf({ ok: false, error: 'x: refused', output: { created: ['a.js'], errors: ['x: refused'] } }),
    'template ready': verdictOf({ ok: true, output: { files: [{}, {}] } }),
    'template missing': verdictOf({ ok: false, error: "Template 'cobol-app' not found" }),
    'auth refused': verdictOf({ ok: false, error: 'refused: /etc is outside the workspace — nothing was generated.' }),
    'mobile unknown-action': verdictOf({ ok: false, error: 'Unknown action: teleport' }),
    'mobile build-commands': verdictOf({ ok: true, output: { commands: ['npx eas build --platform android'] } }),
    'progressive placeholder-batch': verdictOf({ ok: true, output: { success: true, projectId: 'p', status: 'generating' } }),
    'pipeline honest-empty': verdictOf({ ok: false, error: 'website_full_pipeline needs a project name — nothing was built.' }),
    'ai needs-both': verdictOf({ ok: false, error: 'ai_write_file needs both a path and a description of what the file should contain — no model was called.' }),
    'page no-request': verdictOf({ ok: false, error: 'no_request' }),
    'enterprise verified': verdictOf({ ok: true, output: { projectPath: 'x', writtenFiles: 20, verified: true } }),
    'enterprise failed': verdictOf({ ok: false, error: 'foundation verification failed: x', output: { verificationFailed: true } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  let defaultRoot: string | null = null;
  try { defaultRoot = ws.workspaceService.getActiveRoot(); } catch (e: any) { defaultRoot = `THREW:${String(e?.message || e).slice(0, 120)}`; }
  let explorerRoot: string | null = null;
  try { explorerRoot = ws.workspaceService.getExplorerRoot(); } catch (e: any) { explorerRoot = `THREW:${String(e?.message || e).slice(0, 120)}`; }
  const FX = path.join(sessionRoot, 'wiring-build-fx');
  const OUTSIDE = path.join(os.tmpdir(), `wiring-build-outside-${TOKEN}`);
  for (const d of [FX, OUTSIDE]) fs.mkdirSync(d, { recursive: true });
  const rootsBefore: Record<string, string[]> = {};
  for (const [k, r] of [['session', sessionRoot], ['default', defaultRoot], ['explorer', explorerRoot]] as const) {
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
        logN: Array.isArray(r?.logs) ? r.logs.length : null,
      };
    } catch (e: any) {
      live[id] = { input: scrub(JSON.stringify(input).slice(0, 200)), threw: scrub(String(e?.message || e).slice(0, 260)) };
    }
  };
  const run = (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => runWithCtx(id, name, input, ctx, timeoutMs);

  // scaffold_project (4)
  await run('scaf.positive', 'scaffold_project', { baseDir: 'wiring-build-fx/scaf1', structure: { 'package.json': '{"private":true}', 'src/index.js': `// ${TOKEN}\nmodule.exports=1;\n`, 'notes': null } });
  await run('scaf.traversal-key', 'scaffold_project', { baseDir: 'wiring-build-fx/scaf2', structure: { '../../wiring-build-evil17.txt': 'evil', 'ok.js': '1' } });
  await run('scaf.empty', 'scaffold_project', {});
  await run('scaf.base-traversal', 'scaffold_project', { baseDir: '../../..', structure: { 'a.js': '1' } });
  // template_manager (4)
  await run('tmpl.list', 'template_manager', { templateType: 'list' });
  await run('tmpl.react-app', 'template_manager', { templateType: 'react-app', projectName: 'fx-tmpl-17' });
  await run('tmpl.bogus', 'template_manager', { templateType: 'cobol-app' });
  await run('tmpl.empty', 'template_manager', {});
  // auth_builder (4)
  await run('auth.empty', 'auth_builder', {});
  await run('auth.bogus-type', 'auth_builder', { type: 'saml', outputDir: 'wiring-build-fx/auth-bogus', framework: 'express', includeRBAC: false });
  await run('auth.outside', 'auth_builder', { type: 'jwt', outputDir: path.join(OUTSIDE, 'auth-out') });
  const REAL_TMP = String(process.env.REAL_TMP || '').trim();
  const TRUE_OUT = REAL_TMP ? path.join(REAL_TMP, `wiring-build-trueout-${TOKEN}`) : path.join(os.tmpdir(), `wiring-build-trueout-${TOKEN}-FALLBACK`);
  await run('auth.true-outside', 'auth_builder', { type: 'jwt', outputDir: path.join(TRUE_OUT, 'auth-out') });
  await run('auth.positive', 'auth_builder', { type: 'jwt', outputDir: 'wiring-build-fx/auth1', framework: 'express', includeRBAC: false });
  // mobile_builder (5)
  await run('mob.empty', 'mobile_builder', {});
  await run('mob.bogus-action', 'mobile_builder', { action: 'teleport' });
  await run('mob.init-contained', 'mobile_builder', { action: 'init', projectName: 'fxmob17', outputDir: FX, template: 'blank', platform: 'expo' });
  await run('mob.build', 'mobile_builder', { action: 'build' });
  await run('mob.add-screen', 'mobile_builder', { action: 'add-screen', screenName: 'Fx', outputDir: path.join(FX, 'mobscr') });
  // progressive_generator (7)
  const PROG_ID = 'fx-prog-17';
  await run('prog.empty', 'progressive_generator', {});
  await run('prog.init-no-config', 'progressive_generator', { action: 'init', projectId: PROG_ID });
  await run('prog.init-small', 'progressive_generator', { action: 'init', projectId: PROG_ID, config: { name: 'fxprog', type: 'web', scale: 'small' }, baseDir: FX });
  await run('prog.status', 'progressive_generator', { action: 'get_status', projectId: PROG_ID });
  const batch0 = (() => { try { const o = JSON.parse((live['prog.init-small'] as any)?.outputPreview || '{}'); return o.nextBatch || 'batch-1'; } catch { return 'batch-1'; } })();
  await run('prog.batch-offline', 'progressive_generator', { action: 'generate_batch', projectId: PROG_ID, batchId: batch0, baseDir: path.join(FX, 'prog') }, MODEL_TIMEOUT_MS);
  const batch1 = (() => { try { const o = JSON.parse((live['prog.batch-offline'] as any)?.outputPreview || '{}'); return o.nextBatch || null; } catch { return null; } })();
  if (batch1) await run('prog.batch2-offline', 'progressive_generator', { action: 'generate_batch', projectId: PROG_ID, batchId: batch1, baseDir: path.join(FX, 'prog') }, MODEL_TIMEOUT_MS);
  await run('prog.batch-not-found', 'progressive_generator', { action: 'generate_batch', projectId: PROG_ID, batchId: 'nope-batch', baseDir: FX });
  await run('prog.unknown-project', 'progressive_generator', { action: 'get_status', projectId: 'nope-proj-17' });
  // scaffold_full_stack (3; no context param in execute)
  await run('full.contained', 'scaffold_full_stack', { name: 'fxfull17', type: 'saas', baseDir: FX });
  await run('full.name-default', 'scaffold_full_stack', { baseDir: path.join(FX, 'fulldef') });
  await run('full.bogus-type', 'scaffold_full_stack', { name: 'fxfullbogus17', type: 'cobol', baseDir: FX });
  // website_full_pipeline (1; named legs embargoed)
  await run('pipe.empty', 'website_full_pipeline', {});
  // ai_write_file (4)
  await run('ai.empty', 'ai_write_file', {});
  await run('ai.path-only', 'ai_write_file', { path: 'wiring-build-fx/ai0.txt' });
  await run('ai.traversal', 'ai_write_file', { path: '../../wiring-build-evil17.txt', description: 'harmless note' }, MODEL_TIMEOUT_MS);
  await run('ai.offline-full', 'ai_write_file', { path: 'wiring-build-fx/ai1.txt', description: `Write a one-line text note containing ${TOKEN}.`, contextPack: false }, MODEL_TIMEOUT_MS);
  // api_project (3)
  await run('api.empty', 'api_project', {});
  await run('api.skip-positive', 'api_project', { request: 'A tiny task-notes API with two fields', projectName: 'fxapi17', skipInstall: true }, HEAVY_TIMEOUT_MS);
  await run('api.root-outside', 'api_project', { request: 'A tiny task-notes API with two fields', projectName: 'fxapiout17', root: OUTSIDE, skipInstall: true }, HEAVY_TIMEOUT_MS);
  // react_project (2)
  await run('react.empty', 'react_project', {});
  await run('react.skip-positive', 'react_project', { request: 'A tiny two-item showcase page', projectName: 'fxreact17', skipInstall: true }, REACT_TIMEOUT_MS);
  // web_page_builder (2)
  await run('page.empty', 'web_page_builder', {});
  await run('page.offline-positive', 'web_page_builder', { request: ` brand-new landing page for a fictional acorn shop ${TOKEN}`, filename: 'custom17.html' }, HEAVY_TIMEOUT_MS);
  // enterprise + orion (2 each; workspaceRoot pinned to fixture via context)
  const fxCtx = { ...ctx, workspaceRoot: FX };
  await runWithCtx('ent.empty', 'enterprise_platform_foundation', {}, fxCtx);
  await runWithCtx('ent.contained', 'enterprise_platform_foundation', { request: `Phase-one platform sketch ${TOKEN}` }, fxCtx, HEAVY_TIMEOUT_MS);
  await runWithCtx('ori.empty', 'orion_business_foundation', {}, fxCtx);
  await runWithCtx('ori.contained', 'orion_business_foundation', { request: `Phase-one business sketch ${TOKEN}` }, fxCtx, HEAVY_TIMEOUT_MS);

  // ---- evidence reads (before cleanup) ----
  const evidence: Record<string, any> = {};
  const exists = (p: string) => { try { return fs.existsSync(p); } catch { return false; } };
  evidence['scaf1.files'] = exists(path.join(sessionRoot, 'wiring-build-fx/scaf1/src/index.js')) && exists(path.join(sessionRoot, 'wiring-build-fx/scaf1/notes'));
  evidence['evil.absent'] = !exists(path.join(ROOT, 'wiring-build-evil17.txt')) && !exists(path.join(ROOT, 'api', 'wiring-build-evil17.txt')) && !exists(path.join(OUTSIDE, '..', 'wiring-build-evil17.txt'));
  const BUILDS_FX = path.join(ROOT, 'data', 'builds', 'workspace-default', 'wiring-build-fx');
  evidence['auth1.files'] = (() => { try { return fs.readdirSync(path.join(BUILDS_FX, 'auth1')).sort().slice(0, 8); } catch { return 'MISSING'; } })();
  evidence['authbogus.dir'] = (() => { try { return fs.readdirSync(path.join(BUILDS_FX, 'auth-bogus')).sort().slice(0, 8); } catch { return 'MISSING'; } })();
  evidence['mob.pkg'] = exists(path.join(FX, 'fxmob17/package.json'));
  evidence['prog.files'] = (() => { try { return fs.readdirSync(path.join(FX, 'prog')).sort().slice(0, 10); } catch { return 'MISSING'; } })();
  evidence['full.dir'] = exists(path.join(FX, 'fxfull17/package.json'));
  evidence['fulldef.dir'] = (() => { try { return fs.readdirSync(path.join(FX, 'fulldef')).sort(); } catch { return 'MISSING'; } })();
  evidence['fullbogus.dir'] = exists(path.join(FX, 'fxfullbogus17/package.json'));
  const pathFromPreview = (id: string) => {
    const pv = String((live[id] as any)?.outputPreview || '');
    const jm = /"path":"([^"]+)"/.exec(pv);
    if (jm) return jm[1];
    const mm = /Path: (\S+)/.exec(pv);
    return mm ? mm[1].replace(/\\\\/g, '\\') : null;
  };
  evidence['api.dir'] = pathFromPreview('api.skip-positive');
  evidence['api.dirExists'] = evidence['api.dir'] ? exists(String(evidence['api.dir']).replace(/\\\\/g, '\\')) : false;
  evidence['api.outside'] = (() => { try { return fs.readdirSync(OUTSIDE).sort(); } catch { return 'READ_FAILED'; } })();
  evidence['react.dir'] = pathFromPreview('react.skip-positive');
  evidence['react.dirExists'] = evidence['react.dir'] ? exists(String(evidence['react.dir']).replace(/\\\\/g, '\\')) : false;
  evidence['prog.placeholder'] = (() => { try {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (st.size < 200000 && fs.readFileSync(p, 'utf-8').includes('ERROR GENERATING CODE')) hits.push(path.relative(FX, p)); } };
    walk(path.join(FX, 'prog')); return hits.slice(0, 8);
  } catch { return 'WALK_FAILED'; } })();
  evidence['evil.session'] = exists(path.join(sessionRoot, 'wiring-build-evil17.txt'));
  evidence['repoRootAjs'] = exists(path.join(ROOT, 'a.js'));
  evidence['buildsLeftovers'] = (() => { try { return fs.readdirSync(path.join(ROOT, 'data', 'builds', 'workspace-default', 'wiring-build-fx')).sort(); } catch { return 'MISSING'; } })();
  evidence['trueOutRefused'] = !exists(TRUE_OUT);
  evidence['ent.dir'] = exists(path.join(FX, 'autonomous-engineering-platform/README.md'));
  evidence['ori.dir'] = exists(path.join(FX, 'orion-business-operating-system/README.md'));
  evidence['artifacts'] = (() => { try { const a = String(process.env.ARTIFACT_DIR || ''); return a ? fs.readdirSync(a).sort().slice(0, 8) : 'NO_ENV'; } catch { return 'MISSING'; } })();
  evidence['storeIsolated'] = (() => { try { const s = String(process.env.JOE_CHAT_STORE_DIR || ''); return s ? exists(s) : 'NO_ENV'; } catch { return false; } })();

  // ---- cleanup: fixtures + any strays in the three roots ----
  const rootsAfter: Record<string, string[]> = {};
  for (const [k, r] of [['session', sessionRoot], ['default', defaultRoot], ['explorer', explorerRoot]] as const) {
    try { rootsAfter[k] = (r && fs.existsSync(r)) ? fs.readdirSync(r).sort() : []; }
    catch { rootsAfter[k] = [`READ_FAILED`]; }
  }
  const strays: Record<string, string[]> = {};
  for (const k of Object.keys(rootsBefore)) {
    const before = new Set(rootsBefore[k]);
    strays[k] = (rootsAfter[k] || []).filter(n => !before.has(n));
  }
  const removedStrays: string[] = [];
  for (const [k, r] of [['session', sessionRoot], ['default', defaultRoot], ['explorer', explorerRoot]] as const) {
    for (const n of (strays[k] || [])) {
      if (n === 'wiring-build-fx') continue; // removed with FX below
      try { fs.rmSync(path.join(String(r), n), { recursive: true, force: true }); removedStrays.push(`${k}/${n}`); }
      catch { /* best effort */ }
    }
  }
  for (const d of [FX, OUTSIDE]) fs.rmSync(d, { recursive: true, force: true });
  try { fs.rmSync(TRUE_OUT, { recursive: true, force: true }); } catch { /* best effort */ }
  let ajsRemoved = false;
  try {
    const ajs = path.join(ROOT, 'a.js');
    if (fs.existsSync(ajs) && fs.readFileSync(ajs, 'utf-8') === '1') { fs.rmSync(ajs, { force: true }); ajsRemoved = true; }
  } catch { /* best effort */ }
  let buildsRemoved = false;
  try { fs.rmSync(path.join(ROOT, 'data', 'builds', 'workspace-default', 'wiring-build-fx'), { recursive: true, force: true }); buildsRemoved = true; }
  catch { /* best effort */ }
  const fxGone = ![FX, OUTSIDE].some(d => fs.existsSync(d));
  (evidence as any)['ajsRemoved'] = ajsRemoved;
  (evidence as any)['buildsRemoved'] = buildsRemoved;

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'build_generate',
    declarations: decl,
    verdictTable,
    live,
    roots: { sessionRoot, defaultRoot, explorerRoot },
    evidence,
    strays, removedStrays,
    fixtures: { removed: fxGone },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_build.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])),
    checkerTaskLevel: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.checkerTaskLevel])),
    verdictTable, live, roots: { sessionRoot, defaultRoot, explorerRoot }, evidence, strays, removedStrays, fixturesRemoved: fxGone,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_BUILD_FAILED', e); process.exit(1); });
