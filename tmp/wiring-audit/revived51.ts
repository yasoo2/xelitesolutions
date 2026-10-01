// MUSE WIRING DISCOVERY 051 — executed registry-vs-catalogue reconciliation.
// Imports the REAL registry (all registration paths: direct, createTool, spreads,
// safeNew-revived, object literals) and the REAL PLANNER_TOOL_CATALOGUE, then
// computes exact set differences. Read-only: no tool execution, no network,
// no writes outside fx-revived51. Run: cd api && npx ts-node --transpile-only ../tmp/wiring-audit/revived51.ts
import * as fs from 'fs';
import * as path from 'path';
import { tools } from '../../api/src/modules/tools/registry';
import { PLANNER_TOOL_CATALOGUE } from '../../api/src/core/orchestrator/plan-tools';

const OUT = path.join(__dirname, 'fx-revived51');
fs.mkdirSync(OUT, { recursive: true });

const registered: string[] = (tools || []).map((t: any) => String(t.name));
const catalogue: string[] = (PLANNER_TOOL_CATALOGUE || []).map((t: any) => String(t.tool));
const regSet = new Set(registered);
const catSet = new Set(catalogue);

const registeredNotCatalogue = registered.filter(n => !catSet.has(n));
const catalogueNotRegistered = catalogue.filter(n => !regSet.has(n));

// Revived labels: static literal extraction (labels are string literals in safeNew calls).
const regSrc = fs.readFileSync(path.join(__dirname, '../../api/src/modules/tools/registry.ts'), 'utf8');
const revivedLabels: string[] = [...regSrc.matchAll(/safeNew\('([a-z0-9_]+)'/g)].map(m => m[1]);
const revivedNotCatalogue = revivedLabels.filter(n => !catSet.has(n));
const revivedInCatalogue = revivedLabels.filter(n => catSet.has(n));

const result = {
    scope: 'MUSE-WIRING-DISCOVERY-051 revived-vs-catalogue reconciliation (executed, read-only)',
    registeredCount: registered.length,
    catalogueCount: catalogue.length,
    safeNewLabels: revivedLabels.length,
    registeredNotCatalogueCount: registeredNotCatalogue.length,
    registeredNotCatalogue,
    catalogueNotRegistered,
    revivedNotCatalogueCount: revivedNotCatalogue.length,
    revivedNotCatalogue,
    revivedInCatalogue,
};
fs.writeFileSync(path.join(OUT, 'revived51.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
    registeredCount: result.registeredCount,
    catalogueCount: result.catalogueCount,
    safeNewLabels: result.safeNewLabels,
    registeredNotCatalogueCount: result.registeredNotCatalogueCount,
    catalogueNotRegistered: result.catalogueNotRegistered,
    revivedNotCatalogueCount: result.revivedNotCatalogueCount,
    revivedInCatalogue: result.revivedInCatalogue,
}, null, 2));
