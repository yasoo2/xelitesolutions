// MUSE WIRING DISCOVERY 052 — cross-tree corroboration of checkpoint 051.
// Imports the REAL registry + PLANNER_TOOL_CATALOGUE from the MAIN/NVIDIA
// tree (READ-ONLY: no writes into D:\Joe\xelitesolutions, no tool execution,
// no network) and recomputes the exact reconciliation. Output goes to the
// Muse worktree only. Run: cd api && <env> npx ts-node -P tsconfig.json
// --transpile-only ../tmp/wiring-audit/revived52.ts
import * as fs from 'fs';
import * as path from 'path';

// Absolute imports into the MAIN tree (read-only module load).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mainRegistry = require('D:\\Joe\\xelitesolutions\\api\\src\\modules\\tools\\registry');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mainPlanTools = require('D:\\Joe\\xelitesolutions\\api\\src\\core\\orchestrator\\plan-tools');

const OUT = path.join(__dirname, 'fx-revived52');
fs.mkdirSync(OUT, { recursive: true });

const registered: string[] = (mainRegistry.tools || []).map((t: any) => String(t.name));
const catalogue: string[] = (mainPlanTools.PLANNER_TOOL_CATALOGUE || []).map((t: any) => String(t.tool));
const regSet = new Set(registered);
const catSet = new Set(catalogue);

const registeredNotCatalogue = registered.filter(n => !catSet.has(n));
const catalogueNotRegistered = catalogue.filter(n => !regSet.has(n));

const regSrc = fs.readFileSync(
    'D:\\Joe\\xelitesolutions\\api\\src\\modules\\tools\\registry.ts', 'utf8');
const revivedLabels: string[] = [...regSrc.matchAll(/safeNew\('([a-z0-9_]+)'/g)].map(m => m[1]);
const revivedNotCatalogue = revivedLabels.filter(n => !catSet.has(n));
const revivedInCatalogue = revivedLabels.filter(n => catSet.has(n));

// Muse-tree lists from checkpoint 051, for exact delta computation.
const muse051 = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fx-revived51', 'revived51.json'), 'utf8'));
const museReg: string[] = muse051.registeredNotCatalogue || [];
const museRegFull: Set<string> = new Set(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fx-revived51', 'revived51.json'), 'utf8')).registeredNotCatalogue || []);
void museRegFull;

const result = {
    scope: 'MUSE-WIRING-DISCOVERY-052 main-tree reconciliation (executed, read-only)',
    registeredCount: registered.length,
    registered,
    catalogueCount: catalogue.length,
    safeNewLabels: revivedLabels.length,
    registeredNotCatalogueCount: registeredNotCatalogue.length,
    registeredNotCatalogue,
    catalogueNotRegistered,
    revivedNotCatalogueCount: revivedNotCatalogue.length,
    revivedNotCatalogue,
    revivedInCatalogue,
    muse051RegisteredNotCatalogue: museReg,
};
fs.writeFileSync(path.join(OUT, 'revived52.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
    registeredCount: result.registeredCount,
    catalogueCount: result.catalogueCount,
    safeNewLabels: result.safeNewLabels,
    registeredNotCatalogueCount: result.registeredNotCatalogueCount,
    catalogueNotRegistered: result.catalogueNotRegistered,
    revivedNotCatalogueCount: result.revivedNotCatalogueCount,
    revivedInCatalogue: result.revivedInCatalogue,
}, null, 2));
