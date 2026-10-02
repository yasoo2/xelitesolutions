// WIRING-151: revived-tools + planner-resolution bridge census.
// Live-grounded: registry.tools, PLANNER_TOOL_CATALOGUE, TOOL_ALIASES and
// resolvePlannedTool are imported live; revivedTools labels and the MEANS map
// are READ as text (never executed beyond the pure resolver spot-checks).
// ZERO DISPATCH: no executeTool, no firewall context, no network, no writes,
// no registry mutation. Deterministic stdout (canonical JSON, sorted);
// volatile timings go to stderr only.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(here, '../../api/src');

const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const pt = await import('../../api/src/core/orchestrator/plan-tools.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const registeredNames: string[] = tools
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === 'string');
const registeredSet = new Set(registeredNames);
const dupes = registeredNames.length - registeredSet.size;
const missingExecute = tools.filter((t: any) => typeof t?.execute !== 'function').map((t: any) => String(t?.name));

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const aliasKeys = Object.keys(TOOL_ALIASES).sort();
const aliasTargets = [...new Set(Object.values(TOOL_ALIASES).map(String))].sort();
const aliasTargetsRegistered = aliasTargets.filter((t) => registeredSet.has(t));
const aliasTargetsDangling = aliasTargets.filter((t) => !registeredSet.has(t));

const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueTools = [...new Set(catalogue.map((c: any) => String(c?.tool || '')))].sort();
const catalogueRegistered = catalogueTools.filter((t) => registeredSet.has(t));
const catalogueDangling = catalogueTools.filter((t) => !registeredSet.has(t));

// --- Source parse: revived safeNew labels ---
const regPath = path.join(apiSrc, 'modules/tools/registry.ts');
const regText = fs.readFileSync(regPath, 'utf8');
const regSha256 = crypto.createHash('sha256').update(regText).digest('hex');
const revivedLabels: string[] = [];
{
    const re = /safeNew\(\s*['"]([a-z][a-z0-9_]{2,})['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(regText)) !== null) revivedLabels.push(m[1]);
}
const revivedUnique = [...new Set(revivedLabels)].sort();
const revivedRegistered = revivedUnique.filter((t) => registeredSet.has(t));
const revivedMissing = revivedUnique.filter((t) => !registeredSet.has(t));

// --- Source parse: MEANS map (plan-tools.ts const MEANS block) ---
const ptPath = path.join(apiSrc, 'core/orchestrator/plan-tools.ts');
const ptText = fs.readFileSync(ptPath, 'utf8');
const ptSha256 = crypto.createHash('sha256').update(ptText).digest('hex');
const meansBlock = ptText.slice(
    ptText.indexOf('const MEANS'),
    ptText.indexOf('};', ptText.indexOf('const MEANS')) + 2,
);
const meansPairs: Array<[string, string]> = [];
{
    const re = /(?:^|[,{]\s*)(?:'([^']+)'|([a-zA-Z][a-zA-Z0-9_]*))\s*:\s*'([a-z][a-z0-9_]{2,})'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(meansBlock)) !== null) meansPairs.push([(m[1] || m[2]).toLowerCase(), m[3]]);
}
const meansKeys = [...new Set(meansPairs.map((p) => p[0]))].sort();
const meansTargets = [...new Set(meansPairs.map((p) => p[1]))].sort();
const meansTargetsRegistered = meansTargets.filter((t) => registeredSet.has(t));
const meansTargetsDangling = meansTargets.filter((t) => !registeredSet.has(t));

// --- Bridge coverage over registered ---
const bridge = new Set<string>([...catalogueRegistered, ...aliasTargetsRegistered, ...meansTargetsRegistered]);
const residual = registeredNames.filter((n) => !bridge.has(n)).sort();
const revivedResidual = revivedRegistered.filter((t) => !bridge.has(t)).sort();

// --- Pure-resolver spot checks (no dispatch) ---
const resolvePlannedTool = pt.resolvePlannedTool;
const spotInputs = ['git', 'docker', 'jest', 'react', 'stripe', 'ci',
    'project_management_board', 'definitely_not_a_tool_xyz'];
const spotChecks: Record<string, unknown> = {};
for (const s of spotInputs) {
    try { spotChecks[s] = resolvePlannedTool(s); }
    catch (e: any) { spotChecks[s] = { error: String(e?.message || e) }; }
}
// Every residual name must resolve exact (model must already know the name).
const residualExactFail: string[] = [];
for (const n of residual) {
    const r: any = resolvePlannedTool(n);
    if (!(r && r.tool === n && r.how === 'exact')) residualExactFail.push(n);
}

const out = {
    registeredCount: registeredNames.length,
    registeredUnique: registeredSet.size,
    duplicateRegistrations: dupes,
    missingExecute,
    revivedLabelsParsed: revivedLabels.length,
    revivedUnique: revivedUnique.length,
    revivedRegistered: revivedRegistered.length,
    revivedMissing,
    catalogueEntries: catalogue.length,
    catalogueUnique: catalogueTools.length,
    catalogueDangling,
    aliasKeys: aliasKeys.length,
    aliasTargetsUnique: aliasTargets.length,
    aliasTargetsDangling,
    meansKeys: meansKeys.length,
    meansTargetsUnique: meansTargets.length,
    meansTargetsDangling,
    bridgeCoverage: bridge.size,
    residualCount: residual.length,
    residual,
    revivedResidualCount: revivedResidual.length,
    revivedResidual,
    residualExactFail,
    spotChecks,
    sha: { registryTs: regSha256, planToolsTs: ptSha256 },
};
console.log(JSON.stringify(out, null, 1));
