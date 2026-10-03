// WIRING-169 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/tool-picker/PhaseExecutor/shell
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

const CHAIN = ['shell_execute', 'terminal_manager', 'npm_manager', 'repo_run_command', 'project_run', 'auto_tester'];
const ADJACENT = [];
const REDIRECT_NAMES = [];
const PHANTOMS = ['run_command', 'shell_exec', 'shell_status', 'tool_create_shell', 'command_policy_check', 'run_shell_command', 'execute_command', 'terminal'];
const chainRe = /shell_execute|terminal_manager|npm_manager|repo_run_command|project_run|auto_tester/;
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
const redirectStatus = {};
for (const n of REDIRECT_NAMES) {
    redirectStatus[n] = {
        registered: registeredNames.includes(n),
        catalogue: catalogueSet.has(n),
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
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
const chainWordRe = /shell|terminal|npm|repo_run|project_run|auto_tester/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'shell_execute',
    'npm_manager',
    'terminal_manager',
    'run the build command in the project folder',
    'install the npm dependencies for the project',
    'open a terminal and show the current directory',
    'execute the test suite and report failures',
    'run_command',
    'shell_exec',
    'read the contents of package.json',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['shell-test-shape', 'shell_execute', { command: 'npm test' }],
    ['shell-install-shape', 'shell_execute', { command: 'npm install' }],
    ['npm-shape', 'npm_manager', { action: 'install' }],
    ['auto-shape', 'auto_tester', { testType: 'unit', projectPath: '.' }],
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
const testSpread = (registry.text.match(/ShellExecuteTool|TerminalManagerTool|NpmManagerTool|RepoRunCommandTool|ProjectRunTool|AutoTesterTool/g) || []).length;
const markerSets = {
    SystemTools: ["name = 'shell_execute'", "name = 'npm_manager'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'shell: true', 'spawn', 'redact', 'timeout', 'background'],
    TaskInteractionTools: ["name = 'terminal_manager'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'shell: true', 'spawn', 'session', 'visible'],
    RepoSelfCodingTools: ["name = 'repo_run_command'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'shell: true', 'spawn', 'policy', 'HIGH_SECURITY'],
    ProjectRunTool: ["name = 'project_run'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'shell: true', 'spawn', 'manifest', 'readiness'],
    AutoTesterTool: ["name = 'auto_tester'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'shell_execute', 'testType', 'projectPath'],
};
const defDetail = {};
for (const [f, ms] of Object.entries(markerSets)) {
    const dd = readSha(`modules/tools/definitions/${f}.ts`);
    const namesColon = [...dd.text.matchAll(/name = '([^']+)'/g)].map((m) => m[1]);
    const namesObj = [...dd.text.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
    const markers = {};
    for (const m of ms) markers[m] = (dd.text.split(m).length - 1);
    defDetail[f] = { namesColon, namesObj, markers, sha256: dd.sha256, lines: dd.text.split('\n').length };
}
const planTools = readSha('core/orchestrator/plan-tools.ts');
const toolService = readSha('modules/services/ToolService.ts');
const phaseExec = readSha('modules/tools/definitions/PhaseExecutorTool.ts');
const toolPicker = readSha('core/llm/tool-picker.ts');
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
const chainRefRe = /shell_execute|terminal_manager|npm_manager|repo_run_command|project_run|auto_tester|run_command|shell_exec|ShellExecuteTool|TerminalManagerTool|NpmManagerTool|RepoRunCommandTool|ProjectRunTool|AutoTesterTool/;

const out = {
    registeredCount: registeredNames.length,
    chain: CHAIN,
    chainRegistered,
    chainRegisteredCount: chainRegistered.length,
    adjacentRegistered,
    redirectStatus,
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
    pickerChainRefs: refLines(toolPicker.text, chainRefRe, 16),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
