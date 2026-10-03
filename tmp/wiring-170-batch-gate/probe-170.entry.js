// WIRING-170 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest.
// Per-tool catalogue gate for BATCH-002..007 (26 tools): live registry +
// TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool, plus
// definition-file discovery and risk-marker grep on BOTH trees (NVIDIA
// read-only). ZERO DISPATCH: no executeTool, no command runs, no network,
// no registry mutation, no writes outside OUT_JSON.
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

const BATCH = {
    'BATCH-002': ['repo_read_file', 'repo_search', 'repo_apply_patch', 'repo_run_command', 'repo_diff_summary'],
    'BATCH-003': ['analyze_project', 'analyze_codebase', 'codebase_outline', 'codebase_navigator', 'inspect_symbol', 'get_codebase_map'],
    'BATCH-004': ['deploy_pages', 'docker_manager', 'terraform_manager', 'kubernetes_ops', 'docker_swarm_ops', 'web_pipeline', 'dev_server'],
    'BATCH-005': ['query_optimizer', 'large_data_seeder', 'datasource_tool'],
    'BATCH-006': ['github_actions', 'git_local_workflow'],
    'BATCH-007': ['sonar_analysis', 'performance_profile', 'load_tester'],
};
const ALL = Object.values(BATCH).flat();

const tools = Array.isArray(reg.tools) ? reg.tools : [];
const registeredNames = tools.map((t) => t && t.name).filter((n) => typeof n === 'string').sort();
const byName = new Map();
for (const t of tools) byName.set(t && t.name, t);

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const apiSrc = process.env.SRC_DIR || path.resolve(__dirname, '../../api/src');
const nvSrc = process.env.NV_DIR || null;
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Definition-file discovery: scan definitions/*.ts for name declarations.
const defDir = path.join(apiSrc, 'modules/tools/definitions');
const defFiles = fs.readdirSync(defDir).filter((f) => f.endsWith('.ts')).sort();
const defTexts = {};
for (const f of defFiles) defTexts[f] = readText(path.join(defDir, f));
function findDef(name) {
    const res = [];
    const pats = [`name = '${name}'`, `name: '${name}'`, `name = "${name}"`, `name: "${name}"`, `name='${name}'`, `name:'${name}'`];
    for (const [f, text] of Object.entries(defTexts)) {
        for (const p of pats) {
            if (text.includes(p)) { res.push(f); break; }
        }
    }
    return res;
}
const RISK_MARKERS = ['shell: true', 'shell:true', 'exec(', 'execSync', 'spawn(', 'getRepoRoot',
    'process.cwd', 'unlink', 'rmdir', 'rm -rf', 'process.env', 'approval', 'confirm',
    'destructive', 'sudo', 'chmod', 'fetch(', 'axios', 'http.request', 'gh ', 'kubectl', 'docker '];

const perTool = {};
for (const n of ALL) {
    const t = byName.get(n) || {};
    let ver = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e) { ver = { error: String((e && e.message) || e) }; }
    const defs = findDef(n);
    const markers = {};
    for (const f of defs) {
        const text = defTexts[f];
        const fm = { hasExecute: /execute\s*\(/.test(text) };
        for (const m of RISK_MARKERS) fm[m] = text.split(m).length - 1;
        markers[f] = fm;
    }
    perTool[n] = {
        registered: registeredNames.includes(n),
        hasExecute: typeof t.execute === 'function',
        catalogue: catalogueSet.has(n),
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        verificationUnconditional: ver,
        permissions: t.permissions || null,
        sideEffects: t.sideEffects || null,
        mockSupported: t.mockSupported ?? null,
        defFiles: defs,
        markers,
    };
}

// Registry instantiation references (imported-but-not-instantiated check).
const regText = readText(path.join(apiSrc, 'modules/tools/registry.ts'));
const registryRefs = {};
for (const n of ALL) registryRefs[n] = regText.split(`'${n}'`).length - 1 + regText.split(`"${n}"`).length - 1;

// resolvePlannedTool batch phrases.
const phrases = [
    'analyze the codebase structure',
    'outline the codebase for planning',
    'find the definition of the login symbol',
    'search the repository for auth code',
    'apply this patch to the repo',
    'run the migration command in the repository',
    'containerize the app with docker',
    'provision infrastructure with terraform',
    'deploy to cloudflare pages',
    'manage the github actions workflow',
    'optimize the slow database query',
    'seed a large dataset for testing',
    'run a load test against staging',
    'profile the slow endpoint performance',
    'run sonar analysis on the project',
    'start a local dev server for preview',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = pt.resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

// Gate shapes for representative batch tools.
const gateShapes = {};
const shapes = [
    ['repo-read-shape', 'repo_read_file', { path: 'package.json' }],
    ['repo-cmd-shape', 'repo_run_command', { command: 'npm test' }],
    ['analyze-shape', 'analyze_codebase', { path: '.' }],
    ['docker-shape', 'docker_manager', { action: 'status' }],
    ['sonar-shape', 'sonar_analysis', { projectPath: '.' }],
];
for (const [label, tool, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool(tool, args); }
    catch (e) { gateShapes[label] = { error: String((e && e.message) || e) }; }
}

// Cross-tree byte comparison (NVIDIA read-only).
const crossTree = {};
if (nvSrc) {
    const rels = ['modules/tools/registry.ts', 'core/orchestrator/plan-tools.ts',
        'modules/services/ToolService.ts', 'core/quality/verification-ledger.ts'];
    const defRels = new Set();
    for (const n of ALL) for (const f of (perTool[n].defFiles || [])) defRels.add(`modules/tools/definitions/${f}`);
    for (const r of [...rels, ...[...defRels].sort()]) {
        try {
            const a = readText(path.join(apiSrc, r));
            const b = readText(path.join(nvSrc, r));
            crossTree[r] = { museSha8: sha(a).slice(0, 8), nvSha8: sha(b).slice(0, 8), identical: sha(a) === sha(b) };
        } catch (e) { crossTree[r] = { error: String((e && e.message) || e) }; }
    }
}

const out = {
    registeredCount: registeredNames.length,
    catalogueCount: catalogueSet.size,
    batch: BATCH,
    perTool,
    registryRefs,
    resolveOutcomes,
    gateShapes,
    crossTree,
    sha: { registryTs: sha(regText) },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
