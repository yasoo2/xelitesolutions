// WIRING-160 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/deploy
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

const CHAIN = ['deploy_project', 'deploy_pages', 'docker_manager', 'terraform_manager', 'kubernetes_ops', 'docker_swarm_ops', 'web_pipeline'];
const ADJACENT = ['website_full_pipeline', 'dev_server_start', 'scaffold_website'];
const chainRe = /deploy_project|deploy_pages|docker_manager|terraform_manager|kubernetes_ops|docker_swarm_ops|web_pipeline/;
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
const chainWordRe = /deploy_project|deploy_pages|docker_manager|terraform_manager|kubernetes_ops|docker_swarm_ops|web_pipeline|website_full_pipeline|dev_server_start|scaffold_website|deploy|docker|terraform|kuber|swarm|pipeline/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'deploy this project to production',
    'containerize the app with docker',
    'provision infrastructure with terraform',
    'deploy the stack to the swarm',
    'scale the kubernetes deployment',
    'publish the site to GitHub pages',
    'run the full website pipeline',
    'docker_manager',
    'deploy_project',
    'web_pipeline',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['deploy-valid', 'deploy_project', { action: 'build_static', projectPath: '.' }],
    ['deploy-empty', 'deploy_project', {}],
    ['pages-valid', 'deploy_pages', { cwd: '.' }],
    ['docker-build', 'docker_manager', { action: 'build', target: 'myapp' }],
    ['terraform-plan', 'terraform_manager', { action: 'plan', directory: '.' }],
    ['k8s-get', 'kubernetes_ops', { command: 'get pods' }],
    ['swarm-list', 'docker_swarm_ops', { action: 'list_services' }],
    ['pipeline-run', 'web_pipeline', { name: 'shop' }],
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
const deploySpread = (registry.text.match(/DeployPagesTool|DeployProjectTool|DockerManagerTool|InfrastructureTools|WebPipelineTool/g) || []).length;
const markerSets = {
    InfrastructureTools: ['resolveToolPath', 'path_outside_workspace', 'ExecutionGateway', 'getWorkspaceRoot()', 'terraform', 'kubectl', '-input=false', '-auto-approve', 'stackName', 'splitCommandLine'],
    DeployPagesTool: ['getActiveRoot', 'GITHUB_TOKEN', 'gh-pages', '--force', 'needsConnect', 'unsupported', 'privateEndpointWarning', 'stageForPages', 'mockSupported = false', '.nojekyll'],
    DeployProjectTool: ['resolveToolPath', 'resolvePort', 'Invalid port', 'localtunnel', 'detached: true', '.joe_server.pid', 'mockSupported = false', 'WIRING-P1-009'],
    DockerManagerTool: ['executionEngine', 'docker build', 'compose_up', 'Unknown action', 'rateLimitPerMinute', 'mockSupported = false', 'resolveToolPath', 'workspaceId'],
    WebDevelopmentTools: ["name = 'website_full_pipeline'", 'web_pipeline', 'dev_server_start', 'nothing was built', 'scaffold_website'],
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
const chainRefRe = /deploy_project|deploy_pages|docker_manager|terraform_manager|kubernetes_ops|docker_swarm_ops|web_pipeline|website_full_pipeline|dev_server_start|DeployPagesTool|DeployProjectTool|DockerManagerTool|InfrastructureTools|WebPipelineTool/;

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
    registryDeployRefs: deploySpread,
    defDetail,
    planChainRefs: refLines(planTools.text, chainRefRe, 14),
    svcChainRefs: refLines(toolService.text, chainRefRe, 14),
    execChainRefs: refLines(phaseExec.text, chainRefRe, 14),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
