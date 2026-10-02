// WIRING-158 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/database
// definition files are READ as text. ZERO DISPATCH: no executeTool, no file
// reads/writes, no command runs, no network calls, no registry mutation.
// Writes canonical JSON to the path in OUT_JSON.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const tImport0 = Date.now();
const reg = require('../../api/src/modules/tools/registry.ts');
const pt = require('../../api/src/core/orchestrator/plan-tools.ts');
const svc = require('../../api/src/modules/services/ToolService.ts');
const led = require('../../api/src/core/quality/verification-ledger.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools = Array.isArray(reg.tools) ? reg.tools : [];
const registeredNames = tools
    .map((t) => t && t.name)
    .filter((n) => typeof n === 'string')
    .sort();
const byName = new Map();
for (const t of tools) byName.set(t && t.name, t);

const CHAIN = ['db_schema_migrator', 'query_optimizer', 'large_data_seeder'];
const ADJACENT = ['query_datasource'];
const chainRe = /db_schema_migrator|query_optimizer|large_data_seeder/;
const dbRegistered = registeredNames.filter((n) => chainRe.test(n));
const adjacentRegistered = registeredNames.filter((n) => ADJACENT.includes(n));

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const perTool = {};
for (const n of [...dbRegistered, ...adjacentRegistered]) {
    let ver = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e) { ver = { error: String((e && e.message) || e) }; }
    const t = byName.get(n) || {};
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
        hasExecute: typeof t.execute === 'function',
        permissions: t.permissions || null,
        sideEffects: t.sideEffects || null,
        mockSupported: t.mockSupported ?? null,
    };
}
const dbRe = /db_schema_migrator|query_optimizer|large_data_seeder|query_datasource|database|migrat|seeder|optimiz/i;
const catalogueDbHits = [...catalogueSet].filter((t) => dbRe.test(t)).sort();
const aliasDbHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (dbRe.test(k) || dbRe.test(String(v))) aliasDbHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'run the database migration for the backend',
    'optimize this slow SQL query',
    'generate a large CSV seed file for stress testing',
    'db_schema_migrator',
    'query_optimizer',
    'large_data_seeder',
    'migrate the SQLite database with schema.sql',
    'create a million-row test dataset',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['migrate-status', 'db_schema_migrator', { engine: 'sqlite', action: 'status' }],
    ['migrate-push', 'db_schema_migrator', { engine: 'sqlite', action: 'push', schemaPath: 'schema.sql' }],
    ['optimize-valid', 'query_optimizer', { sql: 'SELECT * FROM users' }],
    ['optimize-empty', 'query_optimizer', {}],
    ['seed-valid', 'large_data_seeder', { rows: 100, format: 'csv', headers: ['id', 'name'], outputPath: 'data/seed.csv' }],
    ['seed-empty', 'large_data_seeder', {}],
    ['seed-outside', 'large_data_seeder', { rows: 10, headers: ['id'], outputPath: '../../../../tmp/x.csv' }],
];
for (const [label, tool, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool(tool, args); }
    catch (e) { gateShapes[label] = { error: String((e && e.message) || e) }; }
}

const apiSrc = process.env.SRC_DIR || path.resolve(__dirname, '../../api/src');
function readSha(rel) {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const dbSpread = (registry.text.match(/DatabaseEnterpriseTools/g) || []).length;
const d = readSha('modules/tools/definitions/DatabaseEnterpriseTools.ts');
const namesColon = [...d.text.matchAll(/name = '([^']+)'/g)].map((m) => m[1]);
const markers = {};
for (const m of ['resolveToolPath', 'node:sqlite', 'handleShellCommand', 'Heuristic Static Analysis', '1_000_000', 'outside the workspace', 'discoverSqlSchemaPath', 'nearestPackageRoot', 'EXPLAIN ANALYZE', "permissions: ToolPermission[] = ['internet']"]) {
    markers[m] = (d.text.split(m).length - 1);
}
const planTools = readSha('core/orchestrator/plan-tools.ts');
const toolService = readSha('modules/services/ToolService.ts');
const phaseExec = readSha('modules/tools/definitions/PhaseExecutorTool.ts');
const refLines = (text, re, cap) => {
    const out = [];
    for (const line of text.split('\n')) {
        if (re.test(line)) {
            out.push(line.trim().slice(0, 140));
            if (out.length >= cap) break;
        }
    }
    return out;
};

const out = {
    registeredCount: registeredNames.length,
    chain: CHAIN,
    dbRegistered,
    dbRegisteredCount: dbRegistered.length,
    adjacentRegistered,
    perTool,
    catalogueDbHits,
    aliasDbHits,
    resolveOutcomes,
    gateShapes,
    registryDatabaseEnterpriseRefs: dbSpread,
    defDetail: { namesColon, markers, sha256: d.sha256 },
    planDbRefs: refLines(planTools.text, /db_schema_migrator|query_optimizer|large_data_seeder|query_datasource|DatabaseEnterprise/i, 12),
    svcDbRefs: refLines(toolService.text, /db_schema_migrator|query_optimizer|large_data_seeder|query_datasource|DatabaseEnterprise/i, 12),
    execDbRefs: refLines(phaseExec.text, /db_schema_migrator|query_optimizer|large_data_seeder|query_datasource|DatabaseEnterprise/i, 12),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
