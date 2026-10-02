// WIRING-164 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/quality
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

const CHAIN = ['auto_tester', 'api_tester', 'load_tester', 'browser_ui_audit', 'quality_run', 'dependency_audit', 'sonar_analysis'];
const ADJACENT = ['secrets_scan_repo', 'ci_generate_pipeline', 'visual_qa', 'manual_test', 'verify_build'];
const PHANTOMS = ['smoke_test', 'run_tests', 'test_runner', 'unit_test', 'e2e_test', 'integration_test', 'qa', 'verify_tests'];
const chainRe = /auto_tester|api_tester|load_tester|browser_ui_audit|quality_run|dependency_audit|sonar_analysis/;
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
const phantomStatus = {};
for (const n of PHANTOMS) {
    phantomStatus[n] = {
        registered: registeredNames.includes(n),
        catalogue: catalogueSet.has(n),
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
    };
}
const chainWordRe = /auto_tester|api_tester|load_tester|browser_ui_audit|quality_run|dependency_audit|sonar_analysis|secrets_scan_repo|ci_generate_pipeline|visual_qa|manual_test|verify_build|smoke_test|test|audit|quality|sonar|qa\b|verif/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'run the automated tests for this project',
    'test this API endpoint for errors',
    'load test the checkout page with 100 users',
    'audit the UI of the landing page',
    'run a quality check on the codebase',
    'audit dependencies for vulnerabilities',
    'run a sonar analysis on the project',
    'scan the repo for leaked secrets',
    'smoke test the build',
    'auto_tester',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['auto-shape', 'auto_tester', { projectPath: '/tmp/proj', testCommand: 'npm test' }],
    ['api-shape', 'api_tester', { url: 'http://localhost:3000/health', method: 'GET' }],
    ['load-shape', 'load_tester', { url: 'http://localhost:3000/', users: 10 }],
    ['audit-shape', 'browser_ui_audit', { url: 'http://localhost:3000/' }],
    ['quality-shape', 'quality_run', { projectPath: '/tmp/proj' }],
    ['dep-shape', 'dependency_audit', { projectPath: '/tmp/proj' }],
    ['sonar-shape', 'sonar_analysis', { projectPath: '/tmp/proj' }],
    ['manual-shape', 'manual_test', { note: 'check the login page by hand' }],
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
const testSpread = (registry.text.match(/TesterTool|QualityRunTool|DependencyAuditTool|SonarAnalysisTool|UiAuditTool|VisualQATool|SecretsScanRepoTool|CiGeneratePipelineTool|LoadTesterTool/g) || []).length;
const markerSets = {
    AutoTesterTool: ["name = 'auto_tester'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'chromium', 'playwright', 'resolveToolPath', 'getActiveRoot'],
    ApiTesterTool: ["name = 'api_tester'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'fetch', 'axios', 'resolveToolPath', 'getActiveRoot'],
    QualityTools: ["name = 'load_tester'", "name = 'quality_run'", "name = 'dependency_audit'", "name = 'sonar_analysis'", "name = 'secrets_scan_repo'", "name = 'ci_generate_pipeline'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    VisualQATool: ["name = 'visual_qa'", 'workspaceId', 'sessionId', 'userId', 'mockSupported'],
    BrowserSmartTools: ["name = 'browser_ui_audit'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'allowlist', 'localhost'],
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
const chainRefRe = /auto_tester|api_tester|load_tester|browser_ui_audit|quality_run|dependency_audit|sonar_analysis|secrets_scan_repo|ci_generate_pipeline|visual_qa|manual_test|verify_build|smoke_test|AutoTesterTool|ApiTesterTool|QualityRunTool|DependencyAuditTool|SonarAnalysisTool|BrowserUIAuditTool|VisualQATool|SecretsScanRepoTool|CiGeneratePipelineTool|LoadTesterTool/;

const out = {
    registeredCount: registeredNames.length,
    chain: CHAIN,
    chainRegistered,
    chainRegisteredCount: chainRegistered.length,
    adjacentRegistered,
    phantomStatus,
    perTool,
    catalogueChainHits,
    aliasChainHits,
    resolveOutcomes,
    gateShapes,
    registryTestRefs: testSpread,
    defDetail,
    planChainRefs: refLines(planTools.text, chainRefRe, 16),
    svcChainRefs: refLines(toolService.text, chainRefRe, 16),
    execChainRefs: refLines(phaseExec.text, chainRefRe, 16),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
