// WIRING-171 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest.
// Closes wiring-170 scope limits: (1) web_pipeline/scaffold_website/dev_server
// plan-time vs executor handling (F5-class fork candidate); (2) live gate
// shapes for load_tester / git_local_workflow / website_full_pipeline /
// dev_server_start; (3) cross-tree byte comparison of the traced def files.
// ZERO DISPATCH: no executeTool, no command runs, no network, no registry
// mutation, no writes outside OUT_JSON.
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

const NAMES = ['web_pipeline', 'scaffold_website', 'dev_server',
    'website_full_pipeline', 'dev_server_start', 'scaffold_full_stack',
    'load_tester', 'git_local_workflow', 'query_datasource'];

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

const perTool = {};
for (const n of NAMES) {
    const t = byName.get(n) || {};
    let planResolve = null;
    try { planResolve = pt.resolvePlannedTool(n); }
    catch (e) { planResolve = { error: String((e && e.message) || e) }; }
    perTool[n] = {
        registered: registeredNames.includes(n),
        hasExecute: typeof t.execute === 'function',
        catalogue: catalogueSet.has(n),
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        planResolveBareName: planResolve,
        permissions: t.permissions || null,
        sideEffects: t.sideEffects || null,
        rateLimitPerMinute: t.rateLimitPerMinute ?? null,
        auditFields: t.auditFields || null,
        inputRequired: (t.inputSchema && t.inputSchema.required) || null,
        defFiles: findDef(n),
    };
}

// Executor-layer redirect evidence: presence of the redirect branches.
const svcText = readText(path.join(apiSrc, 'modules/services/ToolService.ts'));
const executorRedirects = {
    web_pipeline_branch: svcText.includes("name === 'web_pipeline'"),
    scaffold_website_branch: svcText.includes("name === 'scaffold_website'"),
    dev_server_branch: /name === 'dev_server'[^_]/.test(svcText),
    dev_server_any_mention: svcText.split('dev_server').length - 1,
};

// Plan-time phrases for the fork question.
const phrases = [
    'run the full web pipeline',
    'build and deploy my website end to end',
    'scaffold a website for my bakery',
    'start a local dev server for preview',
    'run a load test against staging',
    'create a local branch and commit the docs note',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = pt.resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

// Gate shapes for the traced tools.
const gateShapes = {};
const shapes = [
    ['load-shape', 'load_tester', { url: 'https://staging.example.invalid/health' }],
    ['gitwf-shape', 'git_local_workflow', { request: 'create branch joe/x and commit docs note' }],
    ['sitepipe-shape', 'website_full_pipeline', { name: 'probe-site' }],
    ['devsrv-shape', 'dev_server_start', {}],
    ['webpipe-label-shape', 'web_pipeline', { name: 'probe-site' }],
    ['devsrv-label-shape', 'dev_server', {}],
];
for (const [label, tool, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool(tool, args); }
    catch (e) { gateShapes[label] = { error: String((e && e.message) || e) }; }
}

// Registry instantiation references for the label names.
const regText = readText(path.join(apiSrc, 'modules/tools/registry.ts'));
const registryRefs = {};
for (const n of NAMES) registryRefs[n] = regText.split(`'${n}'`).length - 1 + regText.split(`"${n}"`).length - 1;

// Cross-tree byte comparison (NVIDIA read-only).
const crossTree = {};
if (nvSrc) {
    const rels = ['modules/tools/registry.ts', 'core/orchestrator/plan-tools.ts',
        'modules/services/ToolService.ts', 'core/quality/verification-ledger.ts',
        'modules/tools/definitions/WebDevelopmentTools.ts',
        'modules/tools/definitions/QualityTools.ts',
        'modules/tools/definitions/GitLocalWorkflowTool.ts',
        'modules/tools/definitions/DatabaseEnterpriseTools.ts'];
    for (const r of rels) {
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
    names: NAMES,
    perTool,
    executorRedirects,
    registryRefs,
    resolveOutcomes,
    gateShapes,
    crossTree,
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
