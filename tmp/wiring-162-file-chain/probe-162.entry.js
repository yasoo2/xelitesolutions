// WIRING-162 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/file
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

const CHAIN = ['read_file', 'write_file', 'file_edit', 'file_edit_advanced', 'ai_write_file', 'delete_file', 'bulk_file_generator'];
const ADJACENT = ['ls', 'search_files', 'search_text', 'inspect_directory', 'inspect_symbol', 'archive_files', 'repo_read_file'];
const PHANTOMS = ['file_write', 'create_file', 'write_to_file', 'edit_file', 'project_edit', 'grep_search', 'safe_read_file'];
const chainRe = /read_file|write_file|file_edit|file_edit_advanced|ai_write_file|delete_file|bulk_file_generator/;
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
const chainWordRe = /read_file|write_file|file_edit|file_edit_advanced|ai_write_file|delete_file|bulk_file_generator|search_files|search_text|inspect_directory|inspect_symbol|archive_files|repo_read_file|^ls$|file|read|write|edit|delete|search|inspect|archive|bulk/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'read the config file before changing it',
    'write a new file with this exact content',
    'change part of the existing server file',
    'generate a source file from a plain description',
    'delete the temporary scratch file',
    'generate many project files at once',
    'find all occurrences of this text in the project',
    'list the files in the project directory',
    'file_edit_advanced',
    'read_file',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['read-valid', 'read_file', { path: 'src/index.ts' }],
    ['read-empty', 'read_file', {}],
    ['write-shape', 'write_file', { path: 'src/x.ts', content: 'x' }],
    ['edit-shape', 'file_edit', { filename: 'src/x.ts', find: 'a', replace: 'b' }],
    ['aiwrite-shape', 'ai_write_file', { path: 'src/y.ts', description: 'helper' }],
    ['delete-shape', 'delete_file', { path: 'tmp/scratch.txt' }],
    ['bulk-shape', 'bulk_file_generator', { files: [] }],
    ['search-shape', 'search_text', { pattern: 'TODO' }],
];
for (const [label, tool, args] of shapes) {
    try { gateShapes[label] = led.isVerificationTool(tool, args); }
    catch (e) { gateShapes[label] = { error: String((e && e.message) || e) }; }
}

// Flag-true pins: the UI-001 sanitizer rewrite path calls the ledger with
// allowExistenceObservation=true; the default-shape pins above use false.
const flaggedShapes = {};
const flagged = [
    ['read-flagged', 'read_file', { path: 'src/index.ts' }],
    ['write-flagged', 'write_file', { path: 'src/x.ts', content: 'x' }],
];
for (const [label, tool, args] of flagged) {
    try { flaggedShapes[label] = led.isVerificationTool(tool, args, false, true, false); }
    catch (e) { flaggedShapes[label] = { error: String((e && e.message) || e) }; }
}

const apiSrc = process.env.SRC_DIR || path.resolve(__dirname, '../../api/src');
function readSha(rel) {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const fileSpread = (registry.text.match(/SafeReadFileTool|FileEditTool|WriteFileTool|DeleteFileTool|AIGeneratorTool|AdvancedFileEditTool|BulkFileGeneratorTool|RepoReadFileTool|LsTool|FileSearchTool|SearchTextTool|DirectoryInspectionTool|SymbolInspectorTool|ArchiveFilesTool/g) || []).length;
const markerSets = {
    SystemTools: ["name = 'write_file'", "name = 'file_edit'", "name = 'delete_file'", "name = 'ls'", 'getActiveRoot', 'resolveToolPath', 'path_outside_workspace', 'realpath', 'mockSupported', "'..'", 'filename'],
    TaskInteractionTools: ["name = 'read_file'", 'getActiveRoot', 'resolveToolPath', 'path_outside_workspace', 'mockSupported'],
    AIGeneratorTool: ["name = 'ai_write_file'", 'getActiveRoot', 'resolveToolPath', 'needs both a path', 'mockSupported', 'no model was called'],
    UtilityTools: ["name = 'file_edit_advanced'", "name = 'search_files'", "name = 'search_text'", "name = 'inspect_directory'", "name = 'inspect_symbol'", 'getActiveRoot', 'resolveToolPath', 'mockSupported'],
    BulkFileGeneratorTool: ['bulk_file_generator', 'getActiveRoot', 'resolveToolPath', 'mockSupported', 'targetPath'],
    ArchiveFilesTool: ["name = 'archive_files'", 'getActiveRoot', 'resolveToolPath', 'mockSupported'],
    EliteTools: ['ai_write_file', 'Duplicate tool name skipped', 'AIWriteFileTool'],
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
const chainRefRe = /read_file|write_file|file_edit|file_edit_advanced|ai_write_file|delete_file|bulk_file_generator|SafeReadFileTool|FileEditTool|WriteFileTool|DeleteFileTool|AIGeneratorTool|AdvancedFileEditTool|BulkFileGeneratorTool|file_write|create_file|write_to_file|edit_file|project_edit|grep_search/;

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
    flaggedShapes,
    registryFileRefs: fileSpread,
    defDetail,
    planChainRefs: refLines(planTools.text, chainRefRe, 14),
    svcChainRefs: refLines(toolService.text, chainRefRe, 14),
    execChainRefs: refLines(phaseExec.text, chainRefRe, 14),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
