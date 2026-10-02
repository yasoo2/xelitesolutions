// WIRING-157 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/self-coding
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

const repoRe = /repo_|self.?cod/i;
const repoRegistered = registeredNames.filter((n) => repoRe.test(n));

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const perTool = {};
for (const n of repoRegistered) {
    let ver = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e) { ver = { error: String((e && e.message) || e) }; }
    const t = byName.get(n) || {};
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
        hasExecute: typeof t.execute === 'function',
        permissions: t.permissions || null,
        mockSupported: t.mockSupported ?? null,
    };
}
const catalogueRepoHits = [...catalogueSet].filter((t) => repoRe.test(t)).sort();
const aliasRepoHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (repoRe.test(k) || repoRe.test(String(v))) aliasRepoHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'read the AuthService file from the repo',
    'search the repository for TODO comments',
    'apply a patch to the login module',
    'run the test suite in the repo',
    'repo_read_file',
    'repo_apply_patch',
    'summarize the diff of my changes',
    'improve Joe itself',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['read-valid', 'repo_read_file', { path: 'package.json' }],
    ['read-empty', 'repo_read_file', {}],
    ['search-valid', 'repo_search', { query: 'TODO' }],
    ['patch-dryrun', 'repo_apply_patch', { path: 'x', find: 'a', replace: 'b', dryRun: true }],
    ['run-allowed', 'repo_run_command', { command: 'npm test' }],
    ['run-smoke', 'repo_run_command', { command: 'node index.js < sample.txt' }],
    ['diff-empty', 'repo_diff_summary', {}],
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
const repoSpread = (registry.text.match(/RepoSelfCodingTools/g) || []).length;
const d = readSha('modules/tools/definitions/RepoSelfCodingTools.ts');
const namesColon = [...d.text.matchAll(/name = '([^']+)'/g)].map((m) => m[1]);
const markers = {};
for (const m of ['assertSafeRelativePath', 'isAllowedCommand', 'executionEngine', 'getRepoRoot', 'dryRun', 'secrets_file_write_blocked']) {
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
    repoRegistered,
    repoRegisteredCount: repoRegistered.length,
    perTool,
    catalogueRepoHits,
    aliasRepoHits,
    resolveOutcomes,
    gateShapes,
    registryRepoSelfCodingRefs: repoSpread,
    defDetail: { namesColon, markers, sha256: d.sha256 },
    planRepoRefs: refLines(planTools.text, /repo_|self.?cod/i, 12),
    svcRepoRefs: refLines(toolService.text, /repo_read_file|repo_search|repo_apply_patch|repo_run_command|repo_diff_summary|RepoSelfCoding/i, 12),
    execRepoRefs: refLines(phaseExec.text, /repo_|self.?cod/i, 12),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
