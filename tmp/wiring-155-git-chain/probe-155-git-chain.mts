// WIRING-155: git/version-control capability wiring census (Muse independent).
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are imported live; registry/
// ToolService/plan-tools/git definition files are READ as text.
// ZERO DISPATCH: no executeTool, no git spawned, no network calls,
// no registry mutation. Deterministic stdout (canonical JSON, sorted);
// volatile timings go to stderr only.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const pt = await import('../../api/src/core/orchestrator/plan-tools.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
const led = await import('../../api/src/core/quality/verification-ledger.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const registeredNames: string[] = tools
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === 'string')
    .sort();

const gitRe = /git|github/i;
const gitRegistered = registeredNames.filter((n) => gitRe.test(n));

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueSet = new Set(catalogue.map((c: any) => String(c?.tool || '')));

const perTool: Record<string, any> = {};
for (const n of gitRegistered) {
    let ver: unknown = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e: any) { ver = { error: String(e?.message || e) }; }
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
    };
}
const catalogueGitHits = [...catalogueSet].filter((t) => gitRe.test(t)).sort();
const aliasGitHits: Record<string, string> = {};
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
const resolveOutcomes: Record<string, unknown> = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e: any) { resolveOutcomes[p] = { error: String(e?.message || e) }; }
}

// Gate side: a few git arg shapes through the ledger (pure, no dispatch).
const gateShapes: Record<string, unknown> = {};
const shapes: Array<[string, string, any]> = [
    ['git_ops-commit', 'git_ops', { action: 'commit', message: 'test' }],
    ['git_ops-status', 'git_ops', { action: 'status' }],
    ['github_pr-create', 'github_pr', { action: 'create', title: 't', head: 'b', base: 'main' }],
    ['git_local_workflow-empty', 'git_local_workflow', {}],
];
for (const [label, tool, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool(tool, args); }
    catch (e: any) { gateShapes[label] = { error: String(e?.message || e) }; }
}

// --- Source reads (text only) ---
const apiSrc = path.resolve(here, '../../api/src');
function readSha(rel: string): { text: string; sha256: string } {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const classes = ['GitOpsTool', 'GitHubRepoManagerTool', 'GitHubPRTool', 'GitHubActionsTool', 'GitLocalWorkflowTool'];
const registryClass: Record<string, any> = {};
for (const c of classes) {
    const occ = (registry.text.match(new RegExp(c, 'g')) || []).length;
    const directNew = (registry.text.match(new RegExp(`new\\s+${c}\\s*\\(`, 'g')) || []).length;
    const safeNew = (registry.text.match(new RegExp(`safeNew\\([^)]*${c}`, 'g')) || []).length;
    const createTool = (registry.text.match(new RegExp(`${c}\\.createTool|createTool\\([^)]*${c}`, 'g')) || []).length;
    registryClass[c] = { occurrences: occ, directNew, safeNew, createTool };
}
const defFiles = ['GitTools.ts', 'GitLocalWorkflowTool.ts', 'GitHubRepoManagerTool.ts', 'GitHubPRTool.ts', 'GitHubActionsTool.ts'];
const defDetail: Record<string, any> = {};
const dispatchMarkers = ['spawn', 'execSync', 'execFile', 'child_process', 'https.request', 'octokit', 'api.github.com'];
for (const f of defFiles) {
    const d = readSha(`modules/tools/definitions/${f}`);
    const namesEq = [...d.text.matchAll(/name\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    const namesColon = [...d.text.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
    const markers: Record<string, number> = {};
    for (const m of dispatchMarkers) markers[m] = (d.text.split(m).length - 1);
    defDetail[f] = { namesEq, namesColon, markers, sha256: d.sha256 };
}
// plan-tools git vocabulary: MEANS + catalogue refs mentioning git.
const planTools = readSha('core/orchestrator/plan-tools.ts');
const toolService = readSha('modules/services/ToolService.ts');
const gitRefLines = (text: string, re: RegExp, cap: number) => {
    const out: string[] = [];
    for (const line of text.split('\n')) {
        if (re.test(line)) {
            out.push(line.trim().slice(0, 140));
            if (out.length >= cap) break;
        }
    }
    return out;
};
const planGitRefs = gitRefLines(planTools.text, /git/i, 12);
const svcGitRefs = gitRefLines(toolService.text, /git_ops|github_|git_local_workflow|runGit|GIT_/i, 12);

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
    planGitRefs,
    svcGitRefs,
    sha: { registryTs: registry.sha256 },
};
console.log(JSON.stringify(out, null, 1));
