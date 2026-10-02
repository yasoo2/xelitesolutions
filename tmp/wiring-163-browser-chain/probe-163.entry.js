// WIRING-163 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/PhaseExecutor/browser
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

const CHAIN = ['browser_action', 'browser_click', 'browser_run', 'browser_launch', 'browser_vision', 'browser_page_fix', 'browser_ui_fix'];
const ADJACENT = ['browser_search', 'browser_fill_form', 'browser_find_text', 'browser_extract_data', 'browser_fullpage_shot', 'browser_smart_agent', 'browser_autofix', 'visual_compare', 'screenshot', 'user_browser'];
const PHANTOMS = ['browser_open', 'browser_navigate', 'browser_goto', 'browser_screenshot', 'browser_qa', 'open_browser', 'click_tool'];
const chainRe = /browser_action|browser_click|browser_run|browser_launch|browser_vision|browser_page_fix|browser_ui_fix/;
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
const chainWordRe = /browser_action|browser_click|browser_run|browser_launch|browser_vision|browser_page_fix|browser_ui_fix|browser_search|browser_fill_form|browser_find_text|browser_extract_data|browser_fullpage_shot|browser_smart_agent|browser_autofix|visual_compare|screenshot|user_browser|browser|visual|screenshot|click/i;
const catalogueChainHits = [...catalogueSet].filter((t) => chainWordRe.test(t)).sort();
const aliasChainHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (chainWordRe.test(k) || chainWordRe.test(String(v))) aliasChainHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'open the browser and go to the login page',
    'click the submit button on the form',
    'fill in the registration form with test data',
    'find the error message text on this page',
    'take a screenshot of the current page',
    'compare these two page screenshots for visual differences',
    'fix the broken layout on the checkout page',
    'search the web for the latest release notes',
    'browser_page_fix',
    'browser_run',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['action-click', 'browser_action', { action: 'click', selector: '#submit' }],
    ['run-shape', 'browser_run', { url: 'http://localhost:3000/' }],
    ['vision-shape', 'browser_vision', { screenshot: 'shot.png' }],
    ['pagefix-shape', 'browser_page_fix', { url: 'http://localhost:3000/broken' }],
    ['uifix-shape', 'browser_ui_fix', { url: 'http://localhost:3000/broken' }],
    ['compare-shape', 'visual_compare', { baseline: 'a.png', current: 'b.png' }],
    ['shot-shape', 'screenshot', { url: 'http://localhost:3000/' }],
    ['search-shape', 'browser_search', { query: 'release notes' }],
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
const browserSpread = (registry.text.match(/Browser\w+Tool|UiFixTool|PageFixTool|ScreenshotTool|VisualComparisonTool|UserBrowserTool|VideoActionTool/g) || []).length;
const markerSets = {
    BrowserSmartTools: ["name = 'browser_click'", "name = 'browser_launch'", "name = 'browser_search'", "name = 'browser_fill_form'", "name = 'browser_find_text'", "name = 'browser_extract_data'", "name = 'browser_fullpage_shot'", "name = 'browser_smart_agent'", "name = 'browser_autofix'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'allowlist', 'localhost'],
    BrowserActionTool: ["name = 'browser_action'", 'workspaceId', 'sessionId', 'userId', 'mockSupported'],
    BrowserVisionTool: ["name = 'browser_vision'", 'workspaceId', 'sessionId', 'userId', 'mockSupported'],
    BrowserRunTool: ["name = 'browser_run'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'browser_open'],
    PageFixTool: ["name = 'browser_page_fix'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    UiFixTool: ["name = 'browser_ui_fix'", 'workspaceId', 'sessionId', 'userId', 'mockSupported', 'resolveToolPath', 'getActiveRoot'],
    ScreenshotTool: ["name = 'screenshot'", "name = 'visual_compare'", 'workspaceId', 'sessionId', 'userId', 'mockSupported'],
    UserBrowserTool: ["name = 'user_browser'", 'workspaceId', 'sessionId', 'userId', 'mockSupported'],
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
const chainRefRe = /browser_action|browser_click|browser_run|browser_launch|browser_vision|browser_page_fix|browser_ui_fix|browser_search|browser_fill_form|browser_find_text|browser_extract_data|browser_fullpage_shot|browser_smart_agent|browser_autofix|visual_compare|screenshot|user_browser|browser_open|BrowserOpenTool|BrowserRunTool|BrowserActionTool|BrowserVisionTool|PageFixTool|UiFixTool|ScreenshotTool|VisualComparisonTool|UserBrowserTool/;

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
    registryBrowserRefs: browserSpread,
    defDetail,
    planChainRefs: refLines(planTools.text, chainRefRe, 16),
    svcChainRefs: refLines(toolService.text, chainRefRe, 16),
    execChainRefs: refLines(phaseExec.text, chainRefRe, 16),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
