// WIRING-143: live resolve-surface + planner-catalogue coverage census.
// Uses the executor's OWN resolver (resolvePlannedTool from plan-tools.ts) —
// the exact function PhaseExecutor calls at task dispatch (:1394) and
// verification dispatch (:2306). ZERO DISPATCH: resolve-only; no
// executeTool, no sanitisePlanPhases, no network, no filesystem writes,
// no registry mutation. Deterministic stdout (canonical JSON); volatile
// fields (timings) go to stderr only.
const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const pt = await import('../../api/src/core/orchestrator/plan-tools.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const names: string[] = tools
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === 'string');
const sortedNames = [...names].sort();
const registeredSet = new Set(names);

type ResolveRow = { input: string; tool: string | null; how: string | null; why: string | null };
const resolveRows: ResolveRow[] = sortedNames.map((nm) => {
    const r: any = pt.resolvePlannedTool(nm);
    return { input: nm, tool: r?.tool ?? null, how: r?.how ?? null, why: r?.why ?? null };
});
const exactRows = resolveRows.filter((r) => r.tool === r.input && r.how === 'exact');
const nonExactRegistered = resolveRows.filter((r) => !(r.tool === r.input && r.how === 'exact'));

const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
type CatRow = {
    tool: string; purposeNonEmpty: boolean; registered: boolean;
    resolvesExact: boolean; how: string | null;
};
const catRows: CatRow[] = catalogue.map((c: any) => {
    const nm = String(c?.tool || '');
    const r: any = pt.resolvePlannedTool(nm);
    return {
        tool: nm,
        purposeNonEmpty: typeof c?.purpose === 'string' && c.purpose.trim().length > 0,
        registered: registeredSet.has(nm),
        resolvesExact: r?.tool === nm && r?.how === 'exact',
        how: r?.how ?? null,
    };
});
const catToolSet = new Set(catRows.map((c) => c.tool));
const catUnregistered = catRows.filter((c) => !c.registered);
const catNotExact = catRows.filter((c) => !c.resolvesExact);
const catEmptyPurpose = catRows.filter((c) => !c.purposeNonEmpty);
const catDupes = catalogue.length - catToolSet.size;
const registeredNotInCatalogue = sortedNames.filter((n) => !catToolSet.has(n));

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
type AliasResolveRow = {
    alias: string; target: string; resolvedTool: string | null;
    how: string | null; why: string | null; ok: boolean;
};
const aliasResolveRows: AliasResolveRow[] = Object.keys(TOOL_ALIASES).sort().map((a) => {
    const target = String(TOOL_ALIASES[a]);
    const r: any = pt.resolvePlannedTool(a);
    const ok = r?.tool === target && (r?.how === 'alias' || r?.how === 'exact');
    return { alias: a, target, resolvedTool: r?.tool ?? null, how: r?.how ?? null, why: r?.why ?? null, ok };
});
const aliasResolveBad = aliasResolveRows.filter((r) => !r.ok);

console.log(JSON.stringify({
    probe: 'wiring-143-resolve-census',
    registeredTools: names.length,
    resolveExactCount: exactRows.length,
    resolveNonExactCount: nonExactRegistered.length,
    nonExactRegistered,
    catalogueEntries: catalogue.length,
    catalogueUniqueTools: catToolSet.size,
    catalogueDupes: catDupes,
    catalogueUnregisteredCount: catUnregistered.length,
    catalogueUnregistered: catUnregistered,
    catalogueNotExactCount: catNotExact.length,
    catalogueNotExact: catNotExact,
    catalogueEmptyPurposeCount: catEmptyPurpose.length,
    catalogueEmptyPurpose: catEmptyPurpose,
    registeredNotInCatalogueCount: registeredNotInCatalogue.length,
    registeredNotInCatalogue,
    catalogueTools: [...catToolSet].sort(),
    aliasResolveCount: aliasResolveRows.length,
    aliasResolveBadCount: aliasResolveBad.length,
    aliasResolveBad,
    aliasResolveRows,
    resolveRows,
    catalogueRows: catRows,
}, null, 2));
process.exit(0);
