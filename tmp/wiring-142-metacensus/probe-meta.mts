// WIRING-142: live registry-metadata census (alias integrity + permission defaults).
// ZERO DISPATCH: imports the registry + TOOL_ALIASES and reads metadata only.
// No network, no filesystem writes, no registry mutation. Deterministic output:
// volatile fields (timings) go to stderr only; stdout is canonical JSON.
const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const contractDefaults = reg.contractDefaults || { permissions: [], rateLimit: [], unknown: [] };
const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};

const names: string[] = tools
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === 'string');
const sortedNames = [...names].sort();
const registeredSet = new Set(names);
// Reaching here proves zero duplicate registrations: registry.ts throws at
// import on any duplicate name (fail-at-startup architecture).

const permDefaulted = new Set<string>();
const permDefaultKind: Record<string, string> = {};
for (const entry of (contractDefaults.permissions || [])) {
    const s = String(entry);
    const m = s.match(/^(.+?)(?:→|->)(.+)$/);
    const nm = (m ? m[1] : s).trim();
    const kind = (m ? m[2] : 'unparsed').trim();
    permDefaulted.add(nm);
    permDefaultKind[nm] = kind;
}
const rateDefaulted = new Set((contractDefaults.rateLimit || []).map((s: any) => String(s)));
const unknownDropped: string[] = (contractDefaults.unknown || []).map((s: any) => String(s)).sort();

type ToolRow = {
    name: string;
    effectivePermissions: string[];
    permissionDefaulted: boolean;
    sideEffects: string[];
    rateLimitPerMinute: number | null;
    rateDefaulted: boolean;
    shapeOk: boolean;
};
const rows: ToolRow[] = sortedNames.map((nm) => {
    const t: any = tools.find((x: any) => x?.name === nm) || {};
    const eff = Array.isArray(t.permissions) ? [...new Set(t.permissions.map((p: any) => String(p)))].sort() : [];
    const se = Array.isArray(t.sideEffects) ? [...new Set(t.sideEffects.map((p: any) => String(p)))].sort() : [];
    const rl = typeof t.rateLimitPerMinute === 'number' ? t.rateLimitPerMinute : null;
    return {
        name: nm,
        effectivePermissions: eff,
        permissionDefaulted: permDefaulted.has(nm),
        sideEffects: se,
        rateLimitPerMinute: rl,
        rateDefaulted: rateDefaulted.has(nm),
        shapeOk: typeof t.name === 'string' && Array.isArray(t.permissions) && Array.isArray(t.sideEffects) && typeof t.rateLimitPerMinute === 'number',
    };
});

const defaultKindCounts: Record<string, number> = {};
for (const nm of [...permDefaulted].sort()) {
    const k = permDefaultKind[nm] || 'unparsed';
    defaultKindCounts[k] = (defaultKindCounts[k] || 0) + 1;
}
const emptySideEffects = rows.filter((r) => r.shapeOk && r.sideEffects.length === 0).map((r) => r.name);
const shapeBad = rows.filter((r) => !r.shapeOk).map((r) => r.name);

type AliasRow = { alias: string; target: string; targetRegistered: boolean; keyShadowsRegistered: boolean };
const aliasRows: AliasRow[] = Object.keys(TOOL_ALIASES).sort().map((a) => ({
    alias: a,
    target: String(TOOL_ALIASES[a]),
    targetRegistered: registeredSet.has(String(TOOL_ALIASES[a])),
    keyShadowsRegistered: registeredSet.has(a),
}));
const brokenAliases = aliasRows.filter((r) => !r.targetRegistered);
const shadowedAliases = aliasRows.filter((r) => r.keyShadowsRegistered);

console.log(JSON.stringify({
    probe: 'wiring-142-metacensus',
    registeredTools: names.length,
    uniqueNames: registeredSet.size,
    duplicateRegistrations: names.length - registeredSet.size,
    permissionDefaultedCount: permDefaulted.size,
    permissionDefaultKindCounts: defaultKindCounts,
    permissionDefaultedNames: [...permDefaulted].sort(),
    rateDefaultedCount: rateDefaulted.size,
    rateDefaultedNames: [...rateDefaulted].sort(),
    unknownDroppedCount: unknownDropped.length,
    unknownDropped,
    shapeBadCount: shapeBad.length,
    shapeBad,
    emptySideEffectsCount: emptySideEffects.length,
    emptySideEffects,
    aliasCount: aliasRows.length,
    brokenAliasCount: brokenAliases.length,
    brokenAliases,
    shadowedAliasCount: shadowedAliases.length,
    shadowedAliases,
    aliasRows,
    toolRows: rows,
}, null, 2));
process.exit(0);
