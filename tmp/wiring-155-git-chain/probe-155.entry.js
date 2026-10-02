// WIRING-155 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/git definition files are READ
// as text. ZERO DISPATCH: no executeTool, no git spawned, no network calls,
// no registry mutation. Writes canonical JSON to the path in OUT_JSON.
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

const gitRe = /git|github/i;
const gitRegistered = registeredNames.filter((n) => gitRe.test(n));

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const perTool = {};
for (const n of gitRegistered) {
    let ver = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e) { ver = { error: String((e && e.message) || e) }; }
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
        hasExecute: typeof ((byName.get(n) || {}).execute) === 'function',
    };
}
const catalogueGitHits = [...catalogueSet].filter((t) => gitRe.test(t)).sort();
const aliasGitHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (gitRe.test(k) || gitRe.test(String(v))) aliasGitHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'commit my changes',
    'push to github',
    'create a pull request',
    'check github actions status',
    'git_ops',
    'github_pr',
    'git_local_workflow',
    'github_repo_manager',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['git_ops-commit', 'git_ops', { action: 'commit', message: 'test' }],
    ['git_ops-status', 'git_ops', { action: 'status' }],
    ['github_pr-create', 'github_pr', { action: 'create', title: 't', head: 'b', base: 'main' }],
    ['git_local_workflow-empty', 'git_local_workflow', {}],
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
const classes = ['GitOpsTool', 'GitHubRepoManagerTool', 'GitHubPRTool', 'GitHubActionsTool', 'GitLocalWorkflowTool'];
const registryClass = {};
for (const c of classes) {
    const occ = (registry.text.match(new RegExp(c, 'g')) || []).length;
    const directNew = (registry.text.match(new RegExp(`new\\s+${c}\\s*\\(`, 'g')) || []).length;
    const safeNew = (registry.text.match(new RegExp(`safeNew\\([^)]*${c}`, 'g')) || []).length;
    const createTool = (registry.text.match(new RegExp(`${c}\\.createTool|createTool\\([^)]*${c}`, 'g')) || []).length;
    registryClass[c] = { occurrences: occ, directNew, safeNew, createTool };
}
const defFiles = ['GitTools.ts', 'GitLocalWorkflowTool.ts', 'GitHubRepoManagerTool.ts', 'GitHubPRTool.ts', 'GitHubActionsTool.ts'];
const defDetail = {};
const dispatchMarkers = ['spawn', 'execSync', 'execFile', 'child_process', 'https.request', 'octokit', 'api.github.com'];
for (const f of defFiles) {
    const d = readSha(`modules/tools/definitions/${f}`);
    const namesEq = [...d.text.matchAll(/name\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    const namesColon = [...d.text.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
    const markers = {};
    for (const m of dispatchMarkers) markers[m] = (d.text.split(m).length - 1);
    defDetail[f] = { namesEq, namesColon, markers, sha256: d.sha256 };
}
const planTools = readSha('core/orchestrator/plan-tools.ts');
const toolService = readSha('modules/services/ToolService.ts');
const gitRefLines = (text, re, cap) => {
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
    gitRegistered,
    gitRegisteredCount: gitRegistered.length,
    perTool,
    catalogueGitHits,
    aliasGitHits,
    resolveOutcomes,
    gateShapes,
    registryClass,
    defDetail,
    planGitRefs: gitRefLines(planTools.text, /git/i, 12),
    svcGitRefs: gitRefLines(toolService.text, /git_ops|github_|git_local_workflow|runGit|GIT_/i, 12),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
