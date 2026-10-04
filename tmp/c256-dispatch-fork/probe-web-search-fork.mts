// C256 — F5 web_search dispatch-fork executable proof (BATCH-012 decision support).
// Side-effect-free: resolves names + reads committed bytes. Never calls executeTool,
// never launches a browser, makes no provider/network calls.
// Run: npx tsx tmp/c256-dispatch-fork/probe-web-search-fork.mts  (from D:/Joe/muse-worktree)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
import { resolvePlannedTool, sanitisePlanPhases } from '../../api/src/core/orchestrator/plan-tools';
import { tools } from '../../api/src/modules/tools/registry';

let pass = 0;
function check(label: string, cond: boolean, detail: string) {
    if (!cond) { console.error(`FAIL ${label}: ${detail}`); process.exitCode = 1; return; }
    pass++;
    console.log(`PASS ${label}: ${detail}`);
}

// A1 — plan-time resolution of the bare name.
const r = resolvePlannedTool('web_search') as any;
check('A1-plan-time-alias', r.tool === 'search_api' && r.how === 'alias', JSON.stringify(r));

// A2 — sanitizer rewrites a planned web_search task to search_api.
const s = sanitisePlanPhases(
    [{ name: 'Search', tasks: [{ task: 'search the web for Joe docs', tool: 'web_search', args: { query: 'Joe docs' } }] }],
    '', {},
);
const keptTool = (s as any)?.phases?.[0]?.tasks?.[0]?.tool;
const notes = ((s as any)?.notes || []).join(' | ');
check('A2-sanitizer-rewrite', keptTool === 'search_api',
    `task.tool=${keptTool} executableTasks=${(s as any)?.executableTasks} notes=${notes.slice(0, 160)}`);

// A3 — registry membership: fork endpoints exist, bare name does not.
const names = new Set((tools || []).map((t: any) => String(t.name)));
check('A3-registry', names.has('search_api') && names.has('browser_run') && !names.has('web_search'),
    `search_api=${names.has('search_api')} browser_run=${names.has('browser_run')} web_search=${names.has('web_search')} total=${names.size}`);

// A4 — executor dispatch order in committed ToolService.ts bytes.
const tsPath = path.resolve(HERE, '../../api/src/modules/services/ToolService.ts');
const src = fs.readFileSync(tsPath, 'utf8');
const iRewrite = src.indexOf("if (name === 'web_search')");
const iLookup = src.indexOf('tools.find(t => t.name === effectiveName)');
const iAlias = src.indexOf('TOOL_ALIASES[effectiveName]');
const iStatus = src.indexOf("effectiveName === 'web_search'");
check('A4-dispatch-order',
    iRewrite !== -1 && iLookup !== -1 && iAlias !== -1 && iRewrite < iLookup && iLookup < iAlias,
    `rewrite@${iRewrite} lookup@${iLookup} aliasFallback@${iAlias} (rewrite precedes lookup precedes alias)`);
check('A4-dead-status-branch', iStatus !== -1 && iStatus > iRewrite,
    `status branch "effectiveName === 'web_search'" present @${iStatus} but unreachable (always rewritten before)`);

// A5 — consequence record: the two endpoints take different contracts.
const searchApi = (tools || []).find((t: any) => t.name === 'search_api') as any;
const browserRun = (tools || []).find((t: any) => t.name === 'browser_run') as any;
const req = (t: any) => JSON.stringify(t?.inputSchema?.required || t?.schema?.required || t?.argsSchema || 'n/a').slice(0, 200);
console.log(`INFO A5-contracts: search_api.required=${req(searchApi)} browser_run.required=${req(browserRun)}`);

console.log(`DONE pass=${pass} fail=${process.exitCode ? 1 : 0} (A5 informational)`);
