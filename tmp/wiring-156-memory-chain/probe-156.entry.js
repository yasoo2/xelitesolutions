// WIRING-156 entry for esbuild bundling (Muse independent). Bundled to CJS
// and executed with plain node: NO tsx, NO jest, NO temp usage.
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are required live (bundled from
// TS source); registry/ToolService/plan-tools/memory definition files are
// READ as text. ZERO DISPATCH: no executeTool, no vectorDb writes, no
// memorization run, no network calls, no registry mutation. Writes canonical
// JSON to the path in OUT_JSON.
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

const memRe = /memory|memoriz|recall/i;
const memRegistered = registeredNames.filter((n) => memRe.test(n));

const TOOL_ALIASES = svc.TOOL_ALIASES || {};
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catalogueSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));

const perTool = {};
for (const n of memRegistered) {
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
const catalogueMemHits = [...catalogueSet].filter((t) => memRe.test(t)).sort();
const aliasMemHits = {};
for (const [k, v] of Object.entries(TOOL_ALIASES)) {
    if (memRe.test(k) || memRe.test(String(v))) aliasMemHits[k] = String(v);
}

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'recall what we know about auth logic',
    'search memory for the User schema',
    'index the codebase into memory',
    'memorize the codebase',
    'recall_memory',
    'memorize_codebase',
    'what did we learn about the payment module',
    'remember how login works',
];
const resolveOutcomes = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e) { resolveOutcomes[p] = { error: String((e && e.message) || e) }; }
}

const gateShapes = {};
const shapes = [
    ['recall-valid', 'recall_memory', { query: 'auth logic' }],
    ['recall-empty', 'recall_memory', {}],
    ['memorize-dir', 'memorize_codebase', { directory: 'x' }],
    ['memorize-empty', 'memorize_codebase', {}],
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
const memSpread = (registry.text.match(/MemoryTools/g) || []).length;
const d = readSha('modules/tools/definitions/MemoryTool.ts');
const namesColon = [...d.text.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
const markers = {};
for (const m of ['vectorDb', 'addDocument', '.clear(', 'glob(', 'getActiveRoot', 'require(']) {
    markers[m] = (d.text.split(m).length - 1);
}
const planTools = readSha('core/orchestrator/plan-tools.ts');
const toolService = readSha('modules/services/ToolService.ts');
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
    memRegistered,
    memRegisteredCount: memRegistered.length,
    perTool,
    catalogueMemHits,
    aliasMemHits,
    resolveOutcomes,
    gateShapes,
    registryMemoryToolsRefs: memSpread,
    defDetail: { namesColon, markers, sha256: d.sha256 },
    planMemRefs: refLines(planTools.text, /memory|memoriz|recall/i, 12),
    svcMemRefs: refLines(toolService.text, /recall_memory|memorize_codebase|vectorDb|MemoryTools/i, 12),
    sha: { registryTs: registry.sha256 },
};
const outPath = process.env.OUT_JSON || path.join(__dirname, 'bundle-result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`wrote=${outPath}`);
