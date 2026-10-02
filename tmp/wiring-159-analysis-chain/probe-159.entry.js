// WIRING-159 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/analysis
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

const CHAIN = ['analyze_project', 'analyze_codebase', 'project_detect', 'codebase_outline', 'dead_code_detector'];
const ADJACENT = ['engineering_discovery'];
const chainRe = /analyze_project|analyze_codebase|project_detect|codebase_outline|dead_code_detector/;
const chainRegistered = registeredNames.filter((n) => chainRe.test(n));
const adjacentRegistered = registeredNames.filter((n) => ADJACENT.includes(n));

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const perTool = {};
for (const n of [...chainRegistered, ...adjacentRegistered]) {
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
const chainWordRe = /analyze_project|analyze_codebase|project_detect|codebase_outline|dead_code_detector|engineering_discovery|analyz|analysis|outline|dead_code|knip|detect/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'analyze the project structure and architecture',
    'give me a deep architectural summary of this codebase',
    'detect Node and Python projects under this folder',
    'find unused files and dependencies with knip',
    'outline the classes and functions in server.js',
    'analyze_project',
    'project_detect',
    'dead_code_detector',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['detect-valid', 'project_detect', { path: '.', maxDepth: 4 }],
    ['detect-empty', 'project_detect', {}],
    ['analyze-project', 'analyze_project', { path: '.' }],
    ['analyze-codebase', 'analyze_codebase', { path: '.' }],
    ['outline-valid', 'codebase_outline', { filePath: 'server.js' }],
    ['deadcode-scan', 'dead_code_detector', { mode: 'scan', projectPath: '.' }],
    ['deadcode-outside', 'dead_code_detector', { mode: 'files', projectPath: '../../../../etc' }],
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
const analysisSpread = (registry.text.match(/AnalysisTools|DeadCodeTool|CodebaseOutlineTool/g) || []).length;
const markerSets = {
    AnalysisTools: ['sharedResolveToolPath', 'safePath', 'routeToModel', 'context?.workspaceId', '/root/.ssh', 'browser_run', 'Analysis failed', "permissions: ToolPermission[] = ['read', 'internet']"],
    DeadCodeTool: ['executionEngine', 'npx', 'knip', 'scanned: false', 'getActiveRoot()', 'autoFix', 'auditFields', 'scanned: true'],
    CodebaseOutlineTool: ['process.cwd()', 'resolveToolPath', 'filePath is required', 'totalLines', 'auditFields'],
};
const defDetail = {};
for (const [f, ms] of Object.entries(markerSets)) {
    const dd = readSha(`modules/tools/definitions/${f}.ts`);
    const namesColon = [...dd.text.matchAll(/name = '([^']+)'/g)].map((m) => m[1]);
    const markers = {};
    for (const m of ms) markers[m] = (dd.text.split(m).length - 1);
    defDetail[f] = { namesColon, markers, sha256: dd.sha256, lines: dd.text.split('\n').length };
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
const chainRefRe = /analyze_project|analyze_codebase|project_detect|codebase_outline|dead_code_detector|AnalysisTools|DeadCodeTool|CodebaseOutlineTool/;

const out = {
    registeredCount: registeredNames.length,
    chain: CHAIN,
    chainRegistered,
    chainRegisteredCount: chainRegistered.length,
    adjacentRegistered,
    perTool,
    catalogueChainHits,
    aliasChainHits,
    resolveOutcomes,
    gateShapes,
    registryAnalysisRefs: analysisSpread,
    defDetail,
    planChainRefs: refLines(planTools.text, chainRefRe, 12),
    svcChainRefs: refLines(toolService.text, chainRefRe, 12),
    execChainRefs: refLines(phaseExec.text, chainRefRe, 12),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
