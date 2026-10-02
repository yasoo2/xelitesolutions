// WIRING-153: browser-capability wiring census (Muse independent).
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE,
// resolvePlannedTool and isVerificationTool are imported live; registry/
// ToolService/plan-tools/browser definition files are READ as text.
// ZERO DISPATCH: no executeTool, no browser launch, no network calls,
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

const browserRe = /browser|visual_qa|screenshot|page_fix|web_page_builder|deploy_pages|user_browser|page_detect/i;
const browserRegistered = registeredNames.filter((n) => browserRe.test(n));

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueSet = new Set(catalogue.map((c: any) => String(c?.tool || '')));

const perTool: Record<string, any> = {};
for (const n of browserRegistered) {
    let ver: unknown = null;
    try { ver = led.isVerificationTool(n, {}); } catch (e: any) { ver = { error: String(e?.message || e) }; }
    perTool[n] = {
        alias: (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null,
        catalogue: catalogueSet.has(n),
        verificationUnconditional: ver,
    };
}
const catalogueBrowserHits = [...catalogueSet].filter((t) => browserRe.test(t)).sort();

const resolvePlannedTool = pt.resolvePlannedTool;
const phrases = [
    'open the page in a browser',
    'take a screenshot of the page',
    'check the browser console for errors',
    'audit the page UI',
    'fix the page',
    'browser_run',
    'visual_qa',
];
const resolveOutcomes: Record<string, unknown> = {};
for (const p of phrases) {
    try { resolveOutcomes[p] = resolvePlannedTool(p); }
    catch (e: any) { resolveOutcomes[p] = { error: String(e?.message || e) }; }
}

// --- Source reads (text only) ---
const apiSrc = path.resolve(here, '../../api/src');
function readSha(rel: string): { text: string; sha256: string } {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const defFiles = [
    'BrowserActionTool.ts', 'BrowserRunTool.ts', 'BrowserSmartTools.ts',
    'BrowserVisionTool.ts', 'DeployPagesTool.ts', 'PageFixTool.ts',
    'ScreenshotTool.ts', 'UserBrowserTool.ts', 'VisualQATool.ts',
    'WebPageBuilderTool.ts',
];
const classes = defFiles.map((f) => f.replace(/\.ts$/, ''));
const registryClass: Record<string, any> = {};
for (const c of classes) {
    const occ = (registry.text.match(new RegExp(c, 'g')) || []).length;
    const directNew = (registry.text.match(new RegExp(`new\\s+${c}\\s*\\(`, 'g')) || []).length;
    const safeNew = (registry.text.match(new RegExp(`safeNew\\([^)]*${c}`, 'g')) || []).length;
    registryClass[c] = { occurrences: occ, directNew, safeNew };
}
const defDetail: Record<string, any> = {};
const workerMarkers = ['joe-browser-worker', 'BROWSER_WORKER', 'playwright', 'ws://', '127.0.0.1', 'localhost'];
for (const f of defFiles) {
    const d = readSha(`modules/tools/definitions/${f}`);
    const names = [...d.text.matchAll(/name\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    const markers: Record<string, number> = {};
    for (const m of workerMarkers) markers[m] = (d.text.split(m).length - 1);
    defDetail[f] = { names, markers, sha256: d.sha256 };
}

const out = {
    registeredCount: registeredNames.length,
    browserRegistered,
    browserRegisteredCount: browserRegistered.length,
    perTool,
    catalogueBrowserHits,
    resolveOutcomes,
    registryClass,
    defDetail,
    sha: { registryTs: registry.sha256 },
};
console.log(JSON.stringify(out, null, 1));
