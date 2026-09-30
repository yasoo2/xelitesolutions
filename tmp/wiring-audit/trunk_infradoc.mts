// MUSE wiring-audit checkpoint 23: infra_ops (6) + documentation (2) trunk stories
// + LEVEL-4 live probes + verification-consumer completion (static partition +
// pure-function verdict table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 8 names
//   (ci_generate_pipeline, cloud_cost_estimator, docker_manager,
//   docker_swarm_ops, kubernetes_ops, terraform_manager, doc_generator,
//   i18n_translator) + isVerificationTool partition.
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; NO model legs; NO network legs;
//   NO destructive infra legs — no docker rm/rmi/start/compose, no
//   terraform apply/destroy, no swarm deploy/remove, no kubectl
//   verb beyond read-only `get`):
//   - terraform: empty/bad-action guards + plan-on-fixture (spawn leg,
//     binary expected absent -> honest fail) + outside-path containment
//   - kubernetes: empty guard + `get pods` + namespaced `get pods`
//     (spawn legs, honest fail; log must show -n passthrough)
//   - swarm: empty guard + list_services (spawn leg, honest fail) +
//     deploy-missing-compose guard
//   - docker_manager: ps (spawn leg, honest fail) + empty (unknown
//     action) + stop-nonexistent (honest fail, no real container)
//   - cloud_cost_estimator: empty/missing-resources guards; valid
//     input EMBARGOED (calls model) — code-cited only
//   - ci_generate_pipeline: create-on-fixture (bytes verified) +
//     rerun-skipped + empty-path + kind-python-ignored (enum note)
//   - doc_generator: fixture .js (function/class COUNTS verified) +
//     missing + empty + extensionless (overwrite probe, fixture-owned)
//     + html format + outside-path containment
//   - i18n_translator: missing-source + invalid-json + empty (all fail
//     BEFORE any model call); valid input EMBARGOED (model per
//     language) — code-cited only.
// EMBARGO: no model legs (cost-estimator valid path, i18n valid path),
//   no network legs, no destructive/mutating infra legs, no live
//   injection payloads (shell-join shape is code-cited, rides F101).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'ci_generate_pipeline', 'cloud_cost_estimator', 'docker_manager',
  'docker_swarm_ops', 'kubernetes_ops', 'terraform_manager',
  'doc_generator', 'i18n_translator',
];
const TOKEN = 'WIRING_INFRA_TOKEN_23e7';
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
    console.error(`TRUNK_INFRADOC_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_INFRADOC_ABORT missing tool ${n}`); process.exit(1); }
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
    'tf guard': verdictOf({ ok: false, error: 'terraform_manager needs an action: init | plan | apply | destroy | validate.' }),
    'tf spawn-fail': verdictOf({ ok: false, error: 'Terraform failed: spawn terraform ENOENT' }),
    'k8s guard': verdictOf({ ok: false, error: 'kubernetes_ops needs a kubectl command (e.g. "get pods").' }),
    'sw guard': verdictOf({ ok: false, error: 'docker_swarm_ops needs an action: deploy_stack | list_services | service_logs | remove_stack.' }),
    'docker unknown': verdictOf({ ok: false, error: 'Unknown action' }),
    'cost guard': verdictOf({ ok: false, error: 'cloud_cost_estimator needs a resources list (e.g. ["EC2 t3.small", "RDS"]).' }),
    'ci created': verdictOf({ ok: true, output: { workflowPath: '/w/node-ci.yml', skipped: false } }),
    'ci skipped': verdictOf({ ok: true, output: { workflowPath: '/w/node-ci.yml', skipped: true } }),
    'doc counts': verdictOf({ ok: true, output: { outputPath: '/w/a.md', functions: 0, classes: 1 } }),
    'doc missing': verdictOf({ ok: false, error: 'File not found: nope.js' }),
    'i18n missing': verdictOf({ ok: false, error: 'Source file not found: nope.json' }),
    'i18n badjson': verdictOf({ ok: false, error: 'Unexpected token } in JSON' }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-infradoc-fx');
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
  const tfDir = path.join(FX, 'tfproj');
  fs.mkdirSync(tfDir, { recursive: true });
  fs.writeFileSync(path.join(tfDir, 'main.tf'), `# ${TOKEN} fixture\nresource "null_resource" "x" {}\n`);
  const ciDir = path.join(FX, 'ciproj');
  fs.mkdirSync(ciDir, { recursive: true });
  fs.writeFileSync(path.join(ciDir, 'package.json'), JSON.stringify({ name: 'fx-ci' }));
  const docJs = path.join(FX, 'shapes.js');
  fs.writeFileSync(docJs, `/** Adds two numbers. */\nexport function alpha${TOKEN}(a, b) { return a + b; }\nfunction beta${TOKEN}(x) { return x * 2; }\n/** Fixture widget. */\nexport class Gamma${TOKEN} { constructor() { this.n = 1; } }\n`);
  const docNoExt = path.join(FX, 'README_FIXTURE');
  fs.writeFileSync(docNoExt, `function lonely${TOKEN}() { return 1; }\n`);
  const i18nBad = path.join(FX, 'bad.json');
  fs.writeFileSync(i18nBad, `{"greeting": "hello",, broken`);
  // Outside-workspace path: a sibling of the session root (NOT inside it).
  const outsideDir = path.join(path.dirname(sessionRoot), `wiring-outside-${TOKEN}`);
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, 'outer.js'), 'function o() { return 0; }\n');
  // Snapshot pre-existing ci-skip state under session root (for ci.empty safety).
  const sessWorkflow = path.join(sessionRoot, '.github', 'workflows', 'node-ci.yml');
  const sessWorkflowExisted = fs.existsSync(sessWorkflow);
  const sessGithubExisted = fs.existsSync(path.join(sessionRoot, '.github'));

  // ---- legs: terraform_manager ----
  await run('tf.empty', 'terraform_manager', {});
  await run('tf.bad', 'terraform_manager', { action: 'explode', directory: tfDir });
  await run('tf.plan', 'terraform_manager', { action: 'plan', directory: tfDir });
  await run('tf.outside', 'terraform_manager', { action: 'plan', directory: outsideDir });
  live['tf.compare'] = {
    emptyOk: !!raw['tf.empty']?.ok,
    badOk: !!raw['tf.bad']?.ok,
    planOk: !!raw['tf.plan']?.ok,
    planErrorPrefix: raw['tf.plan']?.error ? String(raw['tf.plan'].error).slice(0, 90) : null,
    planOutputShape: shape(raw['tf.plan']?.output),
    outsideOk: !!raw['tf.outside']?.ok,
    outsideError: raw['tf.outside']?.error ? String(raw['tf.outside'].error).slice(0, 120) : null,
  };

  // ---- legs: kubernetes_ops (read-only `get` only) ----
  await run('k8s.empty', 'kubernetes_ops', {});
  await run('k8s.get', 'kubernetes_ops', { command: 'get pods' });
  await run('k8s.ns', 'kubernetes_ops', { command: 'get pods', namespace: 'audit-ns' });
  live['k8s.compare'] = {
    emptyOk: !!raw['k8s.empty']?.ok,
    getOk: !!raw['k8s.get']?.ok,
    getErrorPrefix: raw['k8s.get']?.error ? String(raw['k8s.get'].error).slice(0, 90) : null,
    nsOk: !!raw['k8s.ns']?.ok,
    nsLog: Array.isArray(raw['k8s.ns']?.logs) ? String(raw['k8s.ns'].logs[0] || '').slice(0, 120) : null,
  };

  // ---- legs: docker_swarm_ops (no deploy/remove) ----
  await run('sw.empty', 'docker_swarm_ops', {});
  await run('sw.list', 'docker_swarm_ops', { action: 'list_services' });
  await run('sw.deploy-missing', 'docker_swarm_ops', { action: 'deploy_stack', stackName: `${TOKEN}-stack` });
  live['sw.compare'] = {
    emptyOk: !!raw['sw.empty']?.ok,
    listOk: !!raw['sw.list']?.ok,
    listErrorPrefix: raw['sw.list']?.error ? String(raw['sw.list'].error).slice(0, 90) : null,
    deployMissingOk: !!raw['sw.deploy-missing']?.ok,
  };

  // ---- legs: docker_manager (no rm/rmi/start/compose/build) ----
  await run('dk.ps', 'docker_manager', { action: 'ps' });
  await run('dk.empty', 'docker_manager', {});
  await run('dk.stop-nonexistent', 'docker_manager', { action: 'stop', target: `wiring-fx-nonexistent-23e7` });
  live['dk.compare'] = {
    psOk: !!raw['dk.ps']?.ok,
    psErrorPrefix: raw['dk.ps']?.error ? String(raw['dk.ps'].error).slice(0, 90) : null,
    emptyOk: !!raw['dk.empty']?.ok,
    emptyError: raw['dk.empty']?.error ? String(raw['dk.empty'].error).slice(0, 80) : null,
    stopOk: !!raw['dk.stop-nonexistent']?.ok,
  };

  // ---- legs: cloud_cost_estimator (valid input EMBARGOED: model) ----
  await run('cc.empty', 'cloud_cost_estimator', {});
  await run('cc.nores', 'cloud_cost_estimator', { resources: [] });
  live['cc.compare'] = {
    emptyOk: !!raw['cc.empty']?.ok,
    noresOk: !!raw['cc.nores']?.ok,
  };

  // ---- legs: ci_generate_pipeline ----
  await run('ci.create', 'ci_generate_pipeline', { path: ciDir, kind: 'node' });
  const ciWorkflow = path.join(ciDir, '.github', 'workflows', 'node-ci.yml');
  live['ci.created'] = {
    fileExists: fs.existsSync(ciWorkflow),
    hasCIName: fs.existsSync(ciWorkflow) ? fs.readFileSync(ciWorkflow, 'utf-8').includes('name: Node.js CI') : null,
    skipped: (raw['ci.create'] as any)?.output?.skipped ?? null,
  };
  await run('ci.rerun', 'ci_generate_pipeline', { path: ciDir, kind: 'node' });
  await run('ci.empty', 'ci_generate_pipeline', {});
  // Restore anything ci.empty created under the session root (iff WE created it).
  const ciEmptyCreated = !sessWorkflowExisted && fs.existsSync(sessWorkflow);
  if (ciEmptyCreated) {
    try {
      fs.rmSync(path.join(sessionRoot, '.github'), { recursive: true, force: true });
      if (sessGithubExisted) live['ci.empty-note'] = { restored: 'REMOVED_BUT_GITHUB_PREEXISTED_UNEXPECTED' };
    } catch (e: any) { live['ci.empty-note'] = { restoreFailed: String(e?.message || e).slice(0, 100) }; }
  }
  const ciPyDir = path.join(FX, 'ciproj-py');
  fs.mkdirSync(ciPyDir, { recursive: true });
  await run('ci.kind-python', 'ci_generate_pipeline', { path: ciPyDir, kind: 'python' });
  live['ci.compare'] = {
    createOk: !!raw['ci.create']?.ok,
    rerunSkipped: (raw['ci.rerun'] as any)?.output?.skipped ?? null,
    rerunOk: !!raw['ci.rerun']?.ok,
    emptyOk: !!raw['ci.empty']?.ok,
    emptyCreatedSessionWorkflow: ciEmptyCreated,
    kindPythonOk: !!raw['ci.kind-python']?.ok,
    kindPythonWroteNodeCI: fs.existsSync(path.join(ciPyDir, '.github', 'workflows', 'node-ci.yml')),
  };

  // ---- legs: doc_generator ----
  await run('dg.js', 'doc_generator', { filePath: docJs });
  const dgMd = docJs.replace(/\.js$/, '.md');
  live['dg.counts'] = {
    fileExists: fs.existsSync(dgMd),
    functions: (raw['dg.js'] as any)?.output?.functions ?? null,
    classes: (raw['dg.js'] as any)?.output?.classes ?? null,
    mdMentionsAlpha: fs.existsSync(dgMd) ? fs.readFileSync(dgMd, 'utf-8').includes(`alpha${TOKEN}`) : null,
    mdMentionsGamma: fs.existsSync(dgMd) ? fs.readFileSync(dgMd, 'utf-8').includes(`Gamma${TOKEN}`) : null,
  };
  await run('dg.missing', 'doc_generator', { filePath: path.join(FX, 'nope.js') });
  await run('dg.empty', 'doc_generator', {});
  const noExtBefore = fs.readFileSync(docNoExt, 'utf-8');
  await run('dg.noext', 'doc_generator', { filePath: docNoExt });
  const noExtAfter = fs.readFileSync(docNoExt, 'utf-8');
  live['dg.noext-compare'] = {
    ok: !!raw['dg.noext']?.ok,
    sourceOverwritten: noExtAfter !== noExtBefore,
    afterIsDocs: noExtAfter.includes('# README_FIXTURE'),
  };
  const dgHtmlSrc = path.join(FX, 'shapes2.js');
  fs.writeFileSync(dgHtmlSrc, `function h${TOKEN}() { return 2; }\n`);
  await run('dg.html', 'doc_generator', { filePath: dgHtmlSrc, outputFormat: 'html' });
  live['dg.html-compare'] = {
    ok: !!raw['dg.html']?.ok,
    htmlExists: fs.existsSync(dgHtmlSrc.replace(/\.js$/, '.html')),
  };
  await run('dg.outside', 'doc_generator', { filePath: path.join(outsideDir, 'outer.js') });
  live['dg.compare'] = {
    jsOk: !!raw['dg.js']?.ok,
    missingOk: !!raw['dg.missing']?.ok,
    emptyOk: !!raw['dg.empty']?.ok,
    outsideOk: !!raw['dg.outside']?.ok,
    outsideError: raw['dg.outside']?.error ? String(raw['dg.outside'].error).slice(0, 120) : null,
  };

  // ---- legs: i18n_translator (valid input EMBARGOED: model per language) ----
  await run('i18n.missing', 'i18n_translator', { sourceFile: path.join(FX, 'nope.json'), targetLanguages: ['ar'] });
  await run('i18n.badjson', 'i18n_translator', { sourceFile: i18nBad, targetLanguages: ['ar'] });
  await run('i18n.empty', 'i18n_translator', {});
  live['i18n.compare'] = {
    missingOk: !!raw['i18n.missing']?.ok,
    badjsonOk: !!raw['i18n.badjson']?.ok,
    badjsonLog0: Array.isArray(raw['i18n.badjson']?.logs) ? String(raw['i18n.badjson'].logs[0] || '').slice(0, 120) : null,
    emptyOk: !!raw['i18n.empty']?.ok,
    emptyError: raw['i18n.empty']?.error ? String(raw['i18n.empty'].error).slice(0, 120) : null,
    noModelLegs: true,
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    cleanup = strays.length ? `STRAYS:${strays.join(',')}` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'infra_ops+documentation', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_infradoc.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=infradoc legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_INFRADOC_FATAL', e); process.exit(1); });
