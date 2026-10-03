// WIRING-165 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/generator
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

const CHAIN = ['scaffold_project', 'scaffold_full_stack', 'react_project', 'api_project', 'web_page_builder', 'test_generator', 'bulk_file_generator'];
const ADJACENT = ['ai_write_file', 'write_file', 'file_edit', 'project_pipeline', 'project_detect'];
const PHANTOMS = ['create_project', 'generate_project', 'new_project', 'build_project', 'init_project', 'react_app', 'vue_project', 'nextjs_app'];
const chainRe = /scaffold_project|scaffold_full_stack|react_project|api_project|web_page_builder|test_generator|bulk_file_generator/;
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
const chainWordRe = /scaffold|react_project|api_project|web_page_builder|test_generator|bulk_file|ai_write_file|write_file|file_edit|project_pipeline|project_detect|create_project|generate_project|new_project|build_project|init_project|react_app|vue_project|nextjs_app|generat|scaffold/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'scaffold a new Node.js CLI project with TypeScript',
    'build a React landing page with Vite',
    'create an Express API backend with SQLite',
    'build a complete website for a bakery',
    'generate a test suite for the existing auth module',
    'generate fifty files from this template at once',
    'write a French poem file with AI',
    'detect what was created in the project folder',
    'run the full project pipeline for this request',
    'scaffold_project',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['scaffold-shape', 'scaffold_project', { structure: { 'index.js': 'console.log(1)' } }],
    ['fullstack-shape', 'scaffold_full_stack', { frontend: 'react', backend: 'express' }],
    ['react-shape', 'react_project', { projectName: 'x', features: ['a'] }],
    ['api-shape', 'api_project', { projectName: 'x', endpoints: ['/a'] }],
    ['webpage-shape', 'web_page_builder', { siteName: 'x', pages: ['home'] }],
    ['testgen-shape', 'test_generator', { projectPath: '/tmp/proj' }],
    ['bulk-shape', 'bulk_file_generator', { files: [{ path: 'a.txt', content: 'a' }] }],
    ['detect-shape', 'project_detect', { projectPath: '/tmp/proj' }],
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
const testSpread = (registry.text.match(/ScaffoldProjectTool|ScaffoldTool|ReactProjectTool|ApiProjectTool|WebPageBuilderTool|TestGeneratorTool|BulkFileGenerator|WriteFileTool|FileEditTool|ProjectPipelineTool|ProjectDetectTool|AIGeneratorTool/g) || []).length;
const markerSets = {
    SystemTools: ["name = 'scaffold_project'", "name = 'write_file'", "name = 'file_edit'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    WebDevelopmentTools: ["name = 'scaffold_full_stack'", "'web_pipeline'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    ReactProjectTool: ["name = 'react_project'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    ApiProjectTool: ["name = 'api_project'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    WebPageBuilderTool: ["name = 'web_page_builder'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    AdvancedTools: ["name = 'test_generator'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    BulkFileGeneratorTool: ["name: 'bulk_file_generator'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    AIGeneratorTool: ["name = 'ai_write_file'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
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
const chainRefRe = /scaffold_project|scaffold_full_stack|react_project|api_project|web_page_builder|test_generator|bulk_file_generator|ai_write_file|write_file|file_edit|project_pipeline|project_detect|ScaffoldProjectTool|ScaffoldTool|ReactProjectTool|ApiProjectTool|WebPageBuilderTool|TestGeneratorTool|BulkFileGenerator|WriteFileTool|FileEditTool|ProjectPipelineTool|ProjectDetectTool/;

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
