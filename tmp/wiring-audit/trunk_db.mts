// MUSE wiring-audit checkpoint 20: database_data-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 6 database_data names
//   (db_schema_migrator, json_query, large_data_seeder, orders_read,
//   query_datasource, query_optimizer)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; NO network legs; no model legs):
//   - json_query: inline JSON only (deep/missing/array/empty-path/nodata)
//   - query_optimizer: heuristic static analysis legs (bad/clean/nosql)
//   - db_schema_migrator: sqlite engine ONLY, explicit fixture schemaPath +
//     databasePath under the session fixture dir (migrate/status/idempotent
//     re-migrate/empty-file/missing-file/bad-action)
//   - large_data_seeder: small row counts; outputs removed afterwards via the
//     tool-returned path; escape + missing-path + rows:0 legs
//   - orders_read: (global).joeProjects entry pointed at fixture dirs only
//     (no-entry/nodb/empty/json/sqlite); global entry restored afterwards
//   - query_datasource: unknown-source leg ONLY (no fetch happens on that
//     path); all 8 real sources EMBARGOED (network)
// EMBARGO: query_datasource real sources (wttr/open.er-api/ip-api/uselessfacts/
//   restcountries/github/npm-registry/dns.google); db_schema_migrator prisma
//   engine (npx download); schema auto-discovery legs (workspace walk could
//   migrate a real .sql into a real nexus.db — code-cited only); status with
//   no databasePath (creates a stray nexus.db — code-cited only).
//   No model-present behavior is probed.
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 020 doc>
//   node <abs tsx> ..\tmp\wiring-audit\trunk_db.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'db_schema_migrator', 'json_query', 'large_data_seeder', 'orders_read',
  'query_datasource', 'query_optimizer',
];
const TOKEN = 'WIRING_DB_TOKEN_9d4e';
const CALL_TIMEOUT_MS = 25000;

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
    console.error(`TRUNK_DB_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_DB_ABORT missing tool ${n}`); process.exit(1); }
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
    'json value': verdictOf({ ok: true, output: { value: 42 } }),
    'json missing-value': verdictOf({ ok: true, output: {} }),
    'json nodata': verdictOf({ ok: false, error: 'json required' }),
    'optimizer suggestions': verdictOf({ ok: true, output: { analysis: 'Heuristic Static Analysis (Connect DB for true EXPLAIN)', suggestions: ['x'] } }),
    'migrator migrated': verdictOf({ ok: true, output: { output: 'Applied SQL migration s to d', databasePath: 'd', schemaPath: 's', engine: 'sqlite', action: 'migrate' } }),
    'migrator status': verdictOf({ ok: true, output: { output: '{"tables":[]}', databasePath: 'd', schemaPath: '', engine: 'sqlite', action: 'status' } }),
    'migrator empty-file': verdictOf({ ok: false, error: 'Migration file is empty: s' }),
    'migrator missing-file': verdictOf({ ok: false, error: 'SQLite migration file not found: s' }),
    'seeder ok': verdictOf({ ok: true, output: { fileSize: 12, path: 'p' } }),
    'seeder refused': verdictOf({ ok: false, error: 'refused: x is outside the workspace — nothing was written.' }),
    'orders no-entry': verdictOf({ ok: true, output: { message: 'no api' } }),
    'orders listed': verdictOf({ ok: true, output: { message: 'orders', orders: [{ id: 1 }], total: 2 } }),
    'datasource unknown': verdictOf({ ok: false, error: 'Unknown datasource: "nope". Available: weather, exchange_rate, ip_geolocation, random_fact, country_info, github_user, npm_package, dns_lookup' }),
    'datasource ok-shape': verdictOf({ ok: true, output: { data: { a: 1 }, source: 'weather' } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-db-fx');
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

  // ---- fixtures (session dir; seeder outputs tracked via returned path; all removed) ----
  const APID = path.join(FX, 'api');
  const APINODB = path.join(FX, 'apinodb');
  const APIEMPTY = path.join(FX, 'apiempty');
  const APISQL = path.join(FX, 'apisql');
  for (const d of [FX, APID, APINODB, APIEMPTY, APISQL]) fs.mkdirSync(d, { recursive: true });
  const SCHEMA = path.join(FX, 'schema.sql');
  fs.writeFileSync(SCHEMA, `CREATE TABLE IF NOT EXISTS ${'wiring_probe'} (id INTEGER PRIMARY KEY, label TEXT);\nINSERT INTO ${'wiring_probe'} (label) VALUES ('${TOKEN}');\n`);
  const EMPTYSQL = path.join(FX, 'empty.sql');
  fs.writeFileSync(EMPTYSQL, '');
  const FXDB = path.join(FX, 'probe.db');
  fs.writeFileSync(path.join(APID, 'data.json'), JSON.stringify({ orders: [
    { id: 1, item: `${TOKEN}-a`, qty: 2, customer: 'cust-a', phone: 'p-a', note: '', created_at: 't1' },
    { id: 2, item: `${TOKEN}-b`, qty: 1, customer: 'cust-b', phone: '', note: 'n-b', created_at: 't2' },
  ] }));
  fs.writeFileSync(path.join(APIEMPTY, 'data.json'), JSON.stringify({ orders: [] }));
  let sqliteReady = false;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const conn = new DatabaseSync(path.join(APISQL, 'data.db'));
    conn.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, item TEXT, qty INTEGER, customer TEXT, phone TEXT, note TEXT, created_at TEXT)');
    conn.prepare('INSERT INTO orders (item, qty, customer, phone, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${TOKEN}-s`, 3, 'cust-s', 'p-s', '', 't3');
    conn.close();
    sqliteReady = true;
  } catch (e: any) { live['fx.sqlite-setup'] = { threw: String(e?.message || e).slice(0, 200) }; }

  // ---- legs: json_query (inline only) ----
  await run('jq.deep', 'json_query', { json: { a: { b: { c: 42 } } }, path: 'a.b.c' });
  await run('jq.missing', 'json_query', { json: { a: 1 }, path: 'a.b.c' });
  await run('jq.array', 'json_query', { json: { items: [{ n: TOKEN }] }, path: 'items.0.n' });
  await run('jq.empty-path', 'json_query', { json: { a: 1 }, path: '' });
  await run('jq.nodata', 'json_query', {});

  // ---- legs: query_optimizer (static heuristic; no DB touched) ----
  await run('qo.bad', 'query_optimizer', { sql: 'SELECT * FROM wiring_probe' });
  await run('qo.clean', 'query_optimizer', { sql: 'SELECT id FROM wiring_probe WHERE id = 1 LIMIT 1' });
  await run('qo.nosql', 'query_optimizer', {});

  // ---- legs: db_schema_migrator (sqlite, explicit fixture paths only) ----
  await run('db.migrate', 'db_schema_migrator', { engine: 'sqlite', action: 'migrate', schemaPath: SCHEMA, databasePath: FXDB });
  await run('db.status', 'db_schema_migrator', { engine: 'sqlite', action: 'status', databasePath: FXDB });
  await run('db.migrate2', 'db_schema_migrator', { engine: 'prisma', action: 'migrate', schemaPath: SCHEMA, databasePath: FXDB });
  await run('db.empty', 'db_schema_migrator', { engine: 'sqlite', action: 'migrate', schemaPath: EMPTYSQL, databasePath: path.join(FX, 'empty.db') });
  await run('db.missing', 'db_schema_migrator', { engine: 'sqlite', action: 'migrate', schemaPath: path.join(FX, 'no-such.sql'), databasePath: path.join(FX, 'missing.db') });
  await run('db.badaction', 'db_schema_migrator', { engine: 'sqlite', action: 'vacuum', schemaPath: SCHEMA, databasePath: FXDB });
  try {
    const { DatabaseSync } = require('node:sqlite');
    const v = new DatabaseSync(FXDB, { readOnly: true });
    const rows = v.prepare('SELECT label FROM wiring_probe ORDER BY id').all();
    v.close();
    live['db.rowcheck'] = { rowCount: rows.length, labels: rows.map((r: any) => String(r.label).slice(0, 40)) };
  } catch (e: any) { live['db.rowcheck'] = { threw: String(e?.message || e).slice(0, 200) }; }

  // ---- legs: large_data_seeder (small counts; outputs removed via returned path) ----
  const seedRel = `wiring-db-fx-${TOKEN}/seed.csv`;
  const seedJsonRel = `wiring-db-fx-${TOKEN}/seed.json`;
  const seedZeroRel = `wiring-db-fx-${TOKEN}/zero.csv`;
  await run('seed.csv', 'large_data_seeder', { rows: 5, format: 'csv', headers: ['id', 'name'], outputPath: seedRel });
  await run('seed.json', 'large_data_seeder', { rows: 3, format: 'json', headers: ['id', 'name'], outputPath: seedJsonRel });
  await run('seed.escape', 'large_data_seeder', { rows: 5, format: 'csv', headers: ['id'], outputPath: 'C:\\Windows\\Temp\\joe-escape-db.txt' });
  await run('seed.nopath', 'large_data_seeder', { rows: 5, headers: ['id'] });
  await run('seed.zero', 'large_data_seeder', { rows: 0, format: 'csv', headers: ['id', 'name'], outputPath: seedZeroRel });
  const seedPaths: string[] = [raw['seed.csv']?.output?.path, raw['seed.json']?.output?.path, raw['seed.zero']?.output?.path].filter((p: any) => typeof p === 'string');
  const seedBack: Record<string, any> = {};
  for (const p of seedPaths) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      seedBack[p] = { bytes: content.length, head: content.slice(0, 120), lines: content.split('\n').length };
    } catch (e: any) { seedBack[p] = { readThrew: String(e?.message || e).slice(0, 120) }; }
  }
  live['seed.readback'] = { paths: seedPaths, back: seedBack };

  // ---- legs: orders_read (global entry pointed at fixtures only) ----
  const g: any = global as any;
  const prevEntry = g.joeProjects?.['audit-sess'];
  g.joeProjects = g.joeProjects || {};
  await run('or.noentry', 'orders_read', { request: 'show orders' });
  g.joeProjects['audit-sess'] = { type: 'api', dir: APINODB };
  await run('or.nodb', 'orders_read', { request: 'show orders' });
  g.joeProjects['audit-sess'] = { type: 'api', dir: APIEMPTY };
  await run('or.empty', 'orders_read', { request: 'show orders' });
  g.joeProjects['audit-sess'] = { type: 'api', dir: APID };
  await run('or.json', 'orders_read', { request: 'show orders' });
  if (sqliteReady) {
    g.joeProjects['audit-sess'] = { type: 'api', dir: APISQL };
    await run('or.sqlite', 'orders_read', { request: 'show orders' });
  } else { live['or.sqlite'] = { skipped: 'sqlite fixture setup failed' }; }
  live['or.tokenSeen'] = {
    json: String(raw['or.json']?.output?.message || '').includes(TOKEN),
    sqlite: sqliteReady ? String(raw['or.sqlite']?.output?.message || '').includes(TOKEN) : null,
  };
  if (prevEntry === undefined) delete g.joeProjects['audit-sess'];
  else g.joeProjects['audit-sess'] = prevEntry;

  // ---- legs: query_datasource (unknown-source only; real sources embargoed) ----
  await run('ds.unknown', 'query_datasource', { source: 'nope-not-a-source', query: {} });

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    for (const p of seedPaths) {
      try { fs.rmSync(p, { force: true }); } catch (e: any) { cleanupNotes.push(`seed-rm:${String(e?.message || e).slice(0, 60)}`); }
      try { const d = path.dirname(p); if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch { /* keep parent */ }
    }
    try { if (fs.existsSync('C:\\Windows\\Temp\\joe-escape-db.txt')) cleanupNotes.push('ESCAPE_FILE_EXISTS'); } catch { /* unreadable is fine */ }
    fs.rmSync(FX, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    cleanup = strays.length ? `STRAYS:${strays.join(',')}` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'database_data', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, sqliteReady, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_db.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=database_data legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_DB_FATAL', e); process.exit(1); });
