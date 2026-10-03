// WIRING-170b: dump full live registered-name list + records for the 4
// renamed/phantom batch names. Same bundle recipe as 170. ZERO DISPATCH.
const fs = require('node:fs');
const path = require('node:path');
const reg = require('../../api/src/modules/tools/registry.ts');
const pt = require('../../api/src/core/orchestrator/plan-tools.ts');
const svc = require('../../api/src/modules/services/ToolService.ts');
const tools = Array.isArray(reg.tools) ? reg.tools : [];
const names = tools.map((t) => t && t.name).filter((n) => typeof n === 'string').sort();
const byName = new Map();
for (const t of tools) byName.set(t && t.name, t);
const catalogue = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catSet = new Set(catalogue.map((c) => String((c && c.tool) || '')));
const QUERY = ['website_full_pipeline', 'dev_server_start', 'query_datasource',
    'scaffold_full_stack', 'web_pipeline', 'dev_server', 'datasource_tool',
    'get_codebase_map', 'codebase_navigator'];
const q = {};
for (const n of QUERY) {
    const t = byName.get(n) || null;
    q[n] = t ? { registered: true, catalogue: catSet.has(n),
        hasExecute: typeof t.execute === 'function',
        permissions: t.permissions || null, sideEffects: t.sideEffects || null,
        alias: (n in (svc.TOOL_ALIASES || {})) ? String(svc.TOOL_ALIASES[n]) : null }
        : { registered: false, catalogue: catSet.has(n) };
}
const out = { count: names.length, names, query: q };
fs.writeFileSync(process.env.OUT_JSON || path.join(__dirname, 'names.json'),
    JSON.stringify(out, null, 1));
console.error('wrote names');
