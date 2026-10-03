// WIRING-167 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/tool-picker/PhaseExecutor/browser
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

const CHAIN = ['browser_action', 'browser_run', 'browser_vision', 'screenshot', 'browser_page_fix', 'visual_qa'];
const ADJACENT = ['browser_smart_agent', 'visual_compare'];
const REDIRECT_NAMES = [];
const PHANTOMS = ['open_browser', 'click_button', 'take_screenshot', 'browse_web', 'fix_webpage', 'browser_ui_fix', 'check_website', 'view_page'];
const chainRe = /browser_action|browser_run|browser_vision|screenshot|browser_page_fix|visual_qa/;
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
const chainWordRe = /browser|page_fix|visual|screenshot|vision/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'browser_action',
    'browser_page_fix',
    'visual_qa',
    'screenshot',
    'click the login button on the homepage',
    'open the homepage in a browser and summarize what you see',
    'run browser QA on the preview and fix any failures',
    'take a screenshot of the dashboard',
    'check this page for visual defects and layout problems',
    'read the contents of package.json',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['action-shape', 'browser_action', { action: 'click', selector: '#login' }],
    ['vision-shape', 'browser_vision', { url: 'http://localhost:3000/' }],
    ['pagefix-shape', 'browser_page_fix', { url: 'http://localhost:3000/', issue: 'overlap' }],
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
const testSpread = (registry.text.match(/BrowserActionTool|BrowserRunTool|BrowserVisionTool|ScreenshotTool|PageFixTool|VisualQATool/g) || []).length;
const markerSets = {
    BrowserActionTool: ["name = 'browser_action'", "name: 'browser_action'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'playwright', 'chromium'],
    BrowserRunTool: ["name = 'browser_run'", "name: 'browser_run'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'playwright', 'chromium'],
    BrowserVisionTool: ["name = 'browser_vision'", "name: 'browser_vision'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'screenshot', 'vision'],
    ScreenshotTool: ['screenshot', 'visual_compare', 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'playwright', 'chromium'],
    PageFixTool: ["name = 'browser_page_fix'", "name: 'browser_page_fix'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'playwright', 'edit'],
    VisualQATool: ["name: 'visual_qa'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot', 'OPENAI_API_KEY', 'openai'],
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
const chainRefRe = /browser_action|browser_run|browser_vision|screenshot|browser_page_fix|visual_qa|BrowserActionTool|BrowserRunTool|BrowserVisionTool|ScreenshotTool|PageFixTool|VisualQATool/;

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
