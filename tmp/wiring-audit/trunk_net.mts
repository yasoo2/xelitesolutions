// MUSE wiring-audit checkpoint 25: network_api (12) trunk stories
// + LEVEL-4 live probes + verification-consumer completion (static partition +
// pure-function verdict table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 12 names +
//   isVerificationTool partition.
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; execution embargo care):
//   - http_fetch/html_extract/rss_fetch/api_tester/search_api: pre-network
//     guard legs ONLY (empty url/query, malformed URL, non-http scheme).
//     fetch('notaurl')/fetch('http://')/fetch('file:///...') reject
//     synchronously with zero I/O on Node's undici stack — recorded live
//     shapes, no traffic.
//   - search_public_apis: empty-query guard ONLY (any valid query cold-loads
//     the catalog with a bounded remote refresh — embargo).
//   - inspect_api/validate_api: ZERO live legs (no pre-service guard; any
//     call reaches ensureLoaded -> remote refresh on cold start). Code-cited.
//   - google_account: not-connected guard legs (no OAuth in this env; gmail_send
//     NEVER called — would send real email).
//   - payments_create_checkout_session: config-gate legs ONLY, behind a
//     STRIPE_SECRET_KEY interlock (legs skipped if a key is present, since a
//     valid shape would then attempt a REAL Stripe call).
//   - search_text: full local legs (guard, bad regex, fixture match under the
//     tool's own default root, outside-workspace refusal).
//   - swagger_docs: full local legs (unknown action, generate into FX with a
//     fixture route scan + manual endpoint, validate pass/fail shapes,
//     add-endpoint missing-spec, serve instructions).
// EMBARGO: no live network legs of any kind (no fetch to hosts, no DNS, no
//   catalog refresh, no Stripe, no Google, no inbox/catalog side effects);
//   no live SSRF payload legs beyond sync-reject URL shapes; no credentialed
//   legs; no model legs.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'api_tester', 'google_account', 'html_extract', 'http_fetch', 'inspect_api',
  'payments_create_checkout_session', 'rss_fetch', 'search_api',
  'search_public_apis', 'search_text', 'swagger_docs', 'validate_api',
];
const TOKEN = 'WIRING_NET_TOKEN_25f1';
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
    console.error(`TRUNK_NET_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_NET_ABORT missing tool ${n}`); process.exit(1); }
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
    'fetch guard': verdictOf({ ok: false, error: 'url required' }),
    'fetch sync-reject': verdictOf({ ok: false, error: 'fetch failed' }),
    'fetch ok-shape': verdictOf({ ok: true, output: { status: 200, bodySnippet: '<html>' } }),
    'extract ok-shape': verdictOf({ ok: true, output: { title: 't', headings: [], links: [], textSnippet: 'x', url: 'https://h/', rendered: false } }),
    'rss ok-shape': verdictOf({ ok: true, output: { items: [{ title: 't' }] } }),
    'tester guard': verdictOf({ ok: false, error: 'api_tester needs a url to call.' }),
    'tester scheme': verdictOf({ ok: false, error: 'api_tester needs an http(s) url' }),
    'tester http4xx-shape': verdictOf({ ok: false, output: { status: 404, statusText: 'x', headers: {}, data: '', timeMs: 12 } }),
    'tester ok-shape': verdictOf({ ok: true, output: { status: 200, statusText: 'OK', headers: {}, data: '{}', timeMs: 12 } }),
    'rss substituted-shape': verdictOf({ ok: false, error: 'Tool reported failure without an error message' }),
    'searchapi guard': verdictOf({ ok: false, error: 'query is required' }),
    'discovery guard': verdictOf({ ok: false, error: 'query is required' }),
    'inspect notfound': verdictOf({ ok: false, error: 'api_not_found' }),
    'validate unknown-shape': verdictOf({ ok: true, output: { api: { id: 'x', health: 'UNKNOWN', healthDetail: 'no_trusted_probe' } } }),
    'validate healthy-shape': verdictOf({ ok: true, output: { api: { id: 'x', health: 'HEALTHY' } } }),
    'google unconnected': verdictOf({ ok: false, error: 'google_not_connected' }),
    'pay unconfigured': verdictOf({ ok: false, error: 'stripe_not_configured' }),
    'pay ok-shape': verdictOf({ ok: true, output: '{"checkoutUrl":"https://checkout.stripe.com/x","sessionId":"cs_fx"}' }),
    'st guard': verdictOf({ ok: false, error: 'search_text needs a query' }),
    'st match-shape': verdictOf({ ok: true, output: { matches: [{ file: 'a.txt', line: 1, text: 't' }], total: 1 } }),
    'sw unknown': verdictOf({ ok: false, error: 'Unknown action: explode' }),
    'sw generate-shape': verdictOf({ ok: true, output: { success: true, specPath: 'x', endpointCount: 2 } }),
    'sw validate-fail': verdictOf({ ok: false, output: { valid: false, issues: ['No paths defined'] } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const defaultRoot: string = ws.workspaceService.getActiveRoot();
  const FX = path.join(sessionRoot, 'wiring-net-fx');
  // Pilot run 1 proved the tool resolves the search root against the SESSION
  // root (auto-assigned workspace context), not the session-agnostic default
  // root: the default-root fixture scanned 0 files. Fixture lives under FX.
  const STDIR = path.join(FX, 'st-sub');
  const STREL = 'wiring-net-fx/st-sub';
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
  fs.mkdirSync(STDIR, { recursive: true });
  const stFile = path.join(STDIR, 'grepme.txt');
  fs.writeFileSync(stFile, `first line\nsecond ${TOKEN} marker\nthird line\n`);
  const swSrc = path.join(FX, 'swagsrc');
  fs.mkdirSync(swSrc, { recursive: true });
  fs.writeFileSync(path.join(swSrc, 'routes.ts'),
    `import express from 'express';\nconst r = express.Router();\nr.get('/fxitems', () => {});\nr.post('/fxitems', () => {});\n`);

  // ---- legs: http_fetch (pre-network shapes only) ----
  await run('hf.empty', 'http_fetch', {});
  await run('hf.plain', 'http_fetch', { url: 'notaurl' });
  await run('hf.malformed', 'http_fetch', { url: 'http://' });
  await run('hf.filescheme', 'http_fetch', { url: 'file:///etc/hostname' });
  live['hf.compare'] = {
    emptyOk: !!raw['hf.empty']?.ok,
    emptyError: raw['hf.empty']?.error ? String(raw['hf.empty'].error).slice(0, 60) : null,
    plainOk: !!raw['hf.plain']?.ok,
    plainErrorPrefix: raw['hf.plain']?.error ? String(raw['hf.plain'].error).slice(0, 90) : null,
    malformedOk: !!raw['hf.malformed']?.ok,
    malformedErrorPrefix: raw['hf.malformed']?.error ? String(raw['hf.malformed'].error).slice(0, 90) : null,
    fileOk: !!raw['hf.filescheme']?.ok,
    fileErrorPrefix: raw['hf.filescheme']?.error ? String(raw['hf.filescheme'].error).slice(0, 90) : null,
  };

  // ---- legs: html_extract (pre-network shapes only) ----
  await run('hx.empty', 'html_extract', {});
  await run('hx.malformed', 'html_extract', { url: 'http://' });
  live['hx.compare'] = {
    emptyOk: !!raw['hx.empty']?.ok,
    emptyError: raw['hx.empty']?.error ? String(raw['hx.empty'].error).slice(0, 60) : null,
    malformedOk: !!raw['hx.malformed']?.ok,
    malformedErrorPrefix: raw['hx.malformed']?.error ? String(raw['hx.malformed'].error).slice(0, 90) : null,
  };

  // ---- legs: rss_fetch (no url guard in source; parser rejects sync) ----
  await run('rss.empty', 'rss_fetch', {});
  await run('rss.garbage', 'rss_fetch', { url: 'not a url at all' });
  live['rss.compare'] = {
    emptyOk: !!raw['rss.empty']?.ok,
    emptyErrorPrefix: raw['rss.empty']?.error ? String(raw['rss.empty'].error).slice(0, 90) : null,
    garbageOk: !!raw['rss.garbage']?.ok,
    garbageErrorPrefix: raw['rss.garbage']?.error ? String(raw['rss.garbage'].error).slice(0, 90) : null,
  };

  // ---- legs: api_tester (guards only; any valid http URL would fetch) ----
  await run('at.empty', 'api_tester', {});
  await run('at.noscheme', 'api_tester', { url: 'notaurl', method: 'GET' });
  await run('at.ftp', 'api_tester', { url: 'ftp://h/x', method: 'GET' });
  await run('at.nomethod', 'api_tester', { url: 'notaurl' });
  live['at.compare'] = {
    emptyOk: !!raw['at.empty']?.ok,
    emptyError: raw['at.empty']?.error ? String(raw['at.empty'].error).slice(0, 60) : null,
    noschemeOk: !!raw['at.noscheme']?.ok,
    noschemeErrorPrefix: raw['at.noscheme']?.error ? String(raw['at.noscheme'].error).slice(0, 90) : null,
    ftpOk: !!raw['at.ftp']?.ok,
    nomethodErrorPrefix: raw['at.nomethod']?.error ? String(raw['at.nomethod'].error).slice(0, 90) : null,
  };

  // ---- legs: search_api (guard only) ----
  await run('sa.empty', 'search_api', {});
  live['sa.compare'] = {
    emptyOk: !!raw['sa.empty']?.ok,
    emptyError: raw['sa.empty']?.error ? String(raw['sa.empty'].error).slice(0, 60) : null,
  };

  // ---- legs: search_public_apis (guard only; valid query refreshes catalog) ----
  await run('sp.empty', 'search_public_apis', {});
  live['sp.compare'] = {
    emptyOk: !!raw['sp.empty']?.ok,
    emptyError: raw['sp.empty']?.error ? String(raw['sp.empty'].error).slice(0, 60) : null,
  };

  // ---- legs: google_account (not-connected guard; send never called) ----
  await run('ga.empty', 'google_account', {});
  await run('ga.unknown', 'google_account', { action: 'explode' });
  live['ga.compare'] = {
    emptyOk: !!raw['ga.empty']?.ok,
    emptyError: raw['ga.empty']?.error ? String(raw['ga.empty'].error).slice(0, 60) : null,
    unknownOk: !!raw['ga.unknown']?.ok,
    unknownError: raw['ga.unknown']?.error ? String(raw['ga.unknown'].error).slice(0, 60) : null,
  };

  // ---- legs: payments (config gate; interlocked on STRIPE_SECRET_KEY) ----
  const stripeKeyPresent = !!process.env.STRIPE_SECRET_KEY;
  if (stripeKeyPresent) {
    live['pay.skipped'] = { reason: 'STRIPE_SECRET_KEY present; live legs skipped to avoid a real Stripe call' };
  } else {
    await run('pay.empty', 'payments_create_checkout_session', {});
    await run('pay.validshape', 'payments_create_checkout_session', { amount: 1000, productName: 'fx-widget' });
  }
  live['pay.compare'] = {
    stripeKeyPresent,
    emptyOk: stripeKeyPresent ? 'skipped' : !!raw['pay.empty']?.ok,
    emptyError: stripeKeyPresent ? 'skipped' : (raw['pay.empty']?.error ? String(raw['pay.empty'].error).slice(0, 60) : null),
    validshapeOk: stripeKeyPresent ? 'skipped' : !!raw['pay.validshape']?.ok,
    validshapeError: stripeKeyPresent ? 'skipped' : (raw['pay.validshape']?.error ? String(raw['pay.validshape'].error).slice(0, 60) : null),
  };

  // ---- legs: search_text (fully local) ----
  await run('st.empty', 'search_text', {});
  await run('st.badregex', 'search_text', { query: '(', regex: true, path: STREL });
  await run('st.fixture', 'search_text', { query: TOKEN, path: STREL });
  const stOut = (raw['st.fixture'] as any)?.output;
  live['st.fixture-compare'] = {
    ok: !!raw['st.fixture']?.ok,
    total: stOut?.total ?? null,
    file0: Array.isArray(stOut?.matches) && stOut.matches[0] ? String(stOut.matches[0].file || '') : null,
    line0: Array.isArray(stOut?.matches) && stOut.matches[0] ? stOut.matches[0].line : null,
    textHasToken: Array.isArray(stOut?.matches) && stOut.matches[0] ? String(stOut.matches[0].text || '').includes(TOKEN) : null,
  };
  await run('st.pattern-alias', 'search_text', { pattern: TOKEN, path: STREL });
  await run('st.outside', 'search_text', { query: 'x', path: '../..' });
  live['st.compare'] = {
    emptyOk: !!raw['st.empty']?.ok,
    emptyError: raw['st.empty']?.error ? String(raw['st.empty'].error).slice(0, 60) : null,
    badregexOk: !!raw['st.badregex']?.ok,
    badregexErrorPrefix: raw['st.badregex']?.error ? String(raw['st.badregex'].error).slice(0, 90) : null,
    fixtureOk: !!raw['st.fixture']?.ok,
    patternAliasTotal: (raw['st.pattern-alias'] as any)?.output?.total ?? null,
    outsideOk: !!raw['st.outside']?.ok,
    outsideError: raw['st.outside']?.error ? String(raw['st.outside'].error).slice(0, 60) : null,
  };

  // ---- legs: swagger_docs (fully local; writes contained to FX) ----
  await run('sw.unknown', 'swagger_docs', { action: 'explode' });
  await run('sw.noaction', 'swagger_docs', {});
  const swOut = path.join(FX, 'swag', 'swagger.json');
  await run('sw.generate', 'swagger_docs', {
    action: 'generate', title: 'fx<b>net', projectPath: swSrc, outputPath: swOut,
    endpoints: [{ path: '/manual', method: 'GET', summary: 'manual one' }],
  });
  const swGen = (raw['sw.generate'] as any)?.output;
  const swHtml = path.join(FX, 'swag', 'swagger-ui.html');
  let swSpec: any = null;
  try { swSpec = JSON.parse(fs.readFileSync(swOut, 'utf-8')); } catch { swSpec = null; }
  live['sw.generate-compare'] = {
    ok: !!raw['sw.generate']?.ok,
    endpointCount: swGen?.endpointCount ?? null,
    specExists: fs.existsSync(swOut),
    specPaths: swSpec ? Object.keys(swSpec.paths || {}) : null,
    specServers0: swSpec ? String(swSpec.servers?.[0]?.url || '') : null,
    htmlExists: fs.existsSync(swHtml),
    htmlHasRawTitleMarkup: fs.existsSync(swHtml) ? fs.readFileSync(swHtml, 'utf-8').includes('fx<b>net') : null,
    wroteSessionRoot: fs.existsSync(swOut),
    wroteDefaultCwdDocs: fs.existsSync(path.join(apiCwd, 'docs', 'swagger.json')),
  };
  await run('sw.validate', 'swagger_docs', { action: 'validate', outputPath: swOut });
  await run('sw.validate-missing', 'swagger_docs', { action: 'validate', outputPath: path.join(FX, 'nope', 'swagger.json') });
  await run('sw.addendpoint-missing', 'swagger_docs', { action: 'add-endpoint', outputPath: path.join(FX, 'nope2', 'swagger.json') });
  await run('sw.addendpoint-nomethod', 'swagger_docs', { action: 'add-endpoint', outputPath: swOut, endpoint: { path: '/nomethod' } });
  await run('sw.serve', 'swagger_docs', { action: 'serve' });
  live['sw.compare'] = {
    unknownOk: !!raw['sw.unknown']?.ok,
    unknownError: raw['sw.unknown']?.error ? String(raw['sw.unknown'].error).slice(0, 60) : null,
    noactionError: raw['sw.noaction']?.error ? String(raw['sw.noaction'].error).slice(0, 60) : null,
    generateOk: !!raw['sw.generate']?.ok,
    validateOk: !!raw['sw.validate']?.ok,
    validateValid: (raw['sw.validate'] as any)?.output?.valid ?? null,
    validateIssues: (raw['sw.validate'] as any)?.output?.issues ?? null,
    validateMissingOk: !!raw['sw.validate-missing']?.ok,
    addendpointMissingError: raw['sw.addendpoint-missing']?.error ? String(raw['sw.addendpoint-missing'].error).slice(0, 80) : null,
    addendpointNomethodOk: !!raw['sw.addendpoint-nomethod']?.ok,
    addendpointNomethodError: raw['sw.addendpoint-nomethod']?.error ? String(raw['sw.addendpoint-nomethod'].error).slice(0, 100) : null,
    serveOk: !!raw['sw.serve']?.ok,
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    fs.rmSync(STDIR, { recursive: true, force: true });
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

  const evidence = {
    trunk: 'network_api', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, defaultRoot, apiCwd,
    stripeKeyPresent, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_net.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=net legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_NET_FATAL', e); process.exit(1); });
