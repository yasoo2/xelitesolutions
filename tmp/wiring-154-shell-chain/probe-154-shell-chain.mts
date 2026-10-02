// WIRING-154: shell/terminal-capability wiring census (Muse independent).
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are imported live; registry/
// ToolService/plan-tools/shell definition files are READ as text.
// ZERO DISPATCH: no executeTool, no shell spawned, no network calls,
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
const registeredSet = new Set(registeredNames);

const shellRe = /shell|terminal|npm|run_command/i;
const shellRegistered = registeredNames.filter((n) => shellRe.test(n));

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueSet = new Set(catalogue.map((c: any) => String(c?.tool || '')));

const perTool: Record<string, any> = {};
for (const n of shellRegistered) {
    let ver: unknown = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e: any) { ver = { error: String(e?.message || e) }; }
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
    };
}
const catalogueShellHits = [...catalogueSet].filter((t) => shellRe.test(t)).sort();
const aliasShellHits: Record<string, string> = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (shellRe.test(k) || shellRe.test(String(v))) aliasShellHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'run the tests with npm test',
    'run a shell command',
    'install npm dependencies',
    'open a terminal',
    'shell_execute',
    'run_command',
    'npm_install',
    'terminal_manager',
];
const resolveOutcomes: Record<string, unknown> = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e: any) { resolveOutcomes[p] = { error: String(e?.message || e) }; }
}

// Run-4b lineage: gate side of the sanitizer/gate contract pair (pure, no dispatch).
const gateShapes: Record<string, unknown> = {};
const shapes: Array<[string, any]> = [
    ['npm-test', { command: 'npm test -- --watchAll=false', cwd: 'taglines' }],
    ['node-smoke-redirect', { command: 'node index.js < sample.txt', cwd: 'taglines' }],
    ['node-test-flag', { command: 'node --test', cwd: 'taglines' }],
];
for (const [label, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool('shell_execute', args); }
    catch (e: any) { gateShapes[label] = { error: String(e?.message || e) }; }
}

// --- Source reads (text only) ---
const apiSrc = path.resolve(here, '../../api/src');
function readSha(rel: string): { text: string; sha256: string } {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const classes = ['ShellExecuteTool', 'NpmManagerTool', 'ShellStatusTool', 'TerminalManagerTool'];
const registryClass: Record<string, any> = {};
for (const c of classes) {
    const occ = (registry.text.match(new RegExp(c, 'g')) || []).length;
    const directNew = (registry.text.match(new RegExp(`new\\s+${c}\\s*\\(`, 'g')) || []).length;
    const safeNew = (registry.text.match(new RegExp(`safeNew\\([^)]*${c}`, 'g')) || []).length;
    const createTool = (registry.text.match(new RegExp(`${c}\\.createTool|createTool\\([^)]*${c}`, 'g')) || []).length;
    registryClass[c] = { occurrences: occ, directNew, safeNew, createTool };
}
const defFiles = ['SystemTools.ts', 'TaskInteractionTools.ts'];
const defDetail: Record<string, any> = {};
const dispatchMarkers = ['spawn', 'execSync', 'execFile', 'BROWSER_WS_ENDPOINT', 'child_process'];
for (const f of defFiles) {
    const d = readSha(`modules/tools/definitions/${f}`);
    const namesEq = [...d.text.matchAll(/name\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    const namesColon = [...d.text.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
    const markers: Record<string, number> = {};
    for (const m of dispatchMarkers) markers[m] = (d.text.split(m).length - 1);
    defDetail[f] = { namesEq, namesColon, markers, sha256: d.sha256 };
}

const out = {
    registeredCount: registeredNames.length,
    shellRegistered,
    shellRegisteredCount: shellRegistered.length,
    perTool,
    catalogueShellHits,
    aliasShellHits,
    resolveOutcomes,
    gateShapes,
    registryClass,
    defDetail,
    sha: { registryTs: registry.sha256 },
};
console.log(JSON.stringify(out, null, 1));
