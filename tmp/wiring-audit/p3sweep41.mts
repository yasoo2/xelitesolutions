/**
 * MUSE wiring discovery checkpoint 41 — behavioral P3 (single-shot router) sweep.
 * READ-ONLY: imports capabilityRoute/inputForTool/scoreTool from the target tree
 * and sweeps fixed goal batteries. No servers, no network, no writes outside --out.
 * Deterministic output (no timestamps/pids) so A/B runs are byte-comparable
 * except explained registry-size deltas. Usage:
 *   tsx <abs path>/p3sweep41.mts --tree=muse|main --out=<abs dir>
 * Env: dummy JWT_SECRET + JOE_TEST_MODE=true + worktree-local TEMP/TMP (same as ckpt40).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, '1'];
}));
const TREE = args.tree === 'main' ? 'main' : 'muse';
const OUT = String(args.out || '');
if (!OUT) { console.error('missing --out'); process.exit(2); }
const ROOTS: Record<string, string> = {
    muse: 'D:/Joe/muse-worktree/api/src',
    main: 'D:/Joe/xelitesolutions/api/src',
};
const modUrl = pathToFileURL(path.join(ROOTS[TREE], 'core/orchestrator/toolCatalog.ts')).href;
const cat = await import(modUrl);
const regUrl = pathToFileURL(path.join(ROOTS[TREE], 'modules/tools/registry.ts')).href;
const reg = await import(regUrl);
const tools: any[] = (reg.tools || []).filter((t: any) => t?.name);
const byName = new Map(tools.map(t => [t?.name, t]));

// --- Runtime premise: ACT_VERB + ROUTER_EXCLUDED source blocks byte-identical both trees.
// The probe extracts them from BOTH sources and asserts identity, so one regex/set
// can label stages for both trees without trusting a prior static claim.
const extractBlock = (src: string, head: RegExp) => {
    const normSrc = src.replace(/\r\n/g, '\n');
    const m = normSrc.match(head);
    return m ? m[1] : ''; // capture group 1 = body only, head keyword excluded
};
const readSrc = (tree: string) => fs.readFileSync(path.join(ROOTS[tree], 'core/orchestrator/toolCatalog.ts'), 'utf8');
const ACT_HEAD = /(?:export const|const) ACT_VERB = new RegExp\(\[([\s\S]*?)\]\.join\('\|'\)\)/;
const EXCL_HEAD = /(?:export const|const) ROUTER_EXCLUDED = new Set\(\[([\s\S]*?)\]\)/;
const actBlocks: Record<string, string> = { muse: extractBlock(readSrc('muse'), ACT_HEAD), main: extractBlock(readSrc('main'), ACT_HEAD) };
const exclBlocks: Record<string, string> = { muse: extractBlock(readSrc('muse'), EXCL_HEAD), main: extractBlock(readSrc('main'), EXCL_HEAD) };
const actIdentical = actBlocks.muse.length > 0 && actBlocks.muse === actBlocks.main;
const exclIdentical = exclBlocks.muse.length > 0 && exclBlocks.muse === exclBlocks.main;
// Build the probe-side verb regex from the EXTRACTED source alternation (transparent).
if (!actBlocks.muse.length || !exclBlocks.muse.length) { console.error('EXTRACTION_FAILED'); process.exit(3); }
const altStrings = [...actBlocks.muse.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
const ACT_RE = new RegExp(altStrings.join('|'));
const exclNames: string[] = [...exclBlocks.muse.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]);
if (!exclNames.every(n => /^[a-z][a-z0-9_]+$/.test(n))) { console.error('EXCL_SHAPE_FAILED'); process.exit(3); }
const EXCL = new Set(exclNames);

// The 53 retrieval-dependent names from ckpt39 F14.
const WATCH53 = `api_tester architect_plan auto_refactor business_logic_parser cache_manager chaos_test_plan cloud_cost_estimator dead_code_detector dev_server_start docker_swarm_ops enterprise_platform_foundation error_recovery image_studio inspect_symbol large_data_seeder llm_cache load_tester logger memorize_codebase orion_business_foundation performance_analyzer performance_profile project_state_manager query_optimizer recall_memory repo_diff_summary repo_run_command rss_fetch secrets_scan_repo shell_check_status task_lifecycle video_action visual_compare archive_files browser_action browser_vision codebase_outline compliance_validator dependency_graph execute_python go_builder html_extract http_fetch java_builder knowledge_search notify_user progressive_generator python_builder query_datasource search_api sonar_analysis todo_write website_full_pipeline`.split(' ');

// P3TARGET: act verb + distinctive tool-name words + fillable input (positives).
const P3TARGET: Array<[string, string]> = [
    ['seo', 'audit the SEO meta tags of https://example.com/store and report issues'],
    ['links', 'check this documentation site https://example.com/docs for broken links and report them'],
    ['responsive', 'inspect the page https://example.com/ for responsive layout problems on mobile'],
    ['secrets', 'scan the repository for leaked secrets and review the findings'],
    ['perf', 'profile the slow report query and analyze the performance bottleneck'],
    ['api-test', 'test the checkout API endpoints and verify the responses'],
    ['translate', 'translate the settings page text into Arabic and review the result'],
    ['extract', 'extract the main article content from https://example.com/news/item and summarize it'],
    ['videosum', 'summarize this product video and extract the key points'],
    ['a11y', 'check accessibility contrast and ARIA labels for screen readers, then review'],
    ['packages', 'audit npm dependencies for outdated packages and review the report'],
    ['symbols', 'inspect where the calculateTotal symbol is defined and who calls it'],
    ['refactor-dead', 'find dead code and unused exports, then review the module'],
    ['sonar', 'run a static analysis quality gate on the new service code and review'],
];
// MINPAIR: gate-attribution minimal pairs (behavioral, no private-helper reuse).
const MINPAIR: Array<[string, string, string]> = [
    ['noverb', 'the SEO meta tags of https://example.com/store look wrong today', 'same content minus act verb -> null proves ACT_VERB gate'],
    ['short', 'test!', 'act verb but length<6 -> null proves length gate'],
    ['vague', 'please review things and check stuff generally', 'act verbs, no distinctive name -> null proves name-hit gate'],
    ['nobuild', 'build me a todo app with login', 'no act verb (build intent) -> null, must not route to a builder'],
    ['ar-inspect', 'افحص صفحة https://example.com/ وتحقق من مشاكل العرض', 'arabic act verb positive control'],
];
// HAND46: ckpt40 natural battery (copied fixed) for route-rate + 53-routability.
const HAND: Array<[string, string]> = [
    ['memory-recall', 'remember what we decided about the login page yesterday and recall it'],
    ['memory-ar', 'تذكر ما اتفقنا عليه بخصوص صفحة الدخول'],
    ['browser-act', 'open the dashboard and click the export button, then take a screenshot'],
    ['browser-vision', 'look at this page screenshot and describe the layout problems you see'],
    ['testing', 'write and run unit tests for the billing module'],
    ['load', 'load test the checkout API with 500 concurrent users and report p95'],
    ['deploy', 'deploy the marketing site to production hosting'],
    ['git-diff', 'show me a summary of uncommitted changes in this repo'],
    ['docker', 'scale the swarm service to 6 replicas and check node status'],
    ['i18n', 'translate the settings page into Arabic'],
    ['seo', 'audit SEO meta tags and sitemap for our store'],
    ['security', 'scan the repository for leaked secrets and audit vulnerabilities'],
    ['perf', 'profile the slow report query and analyze the performance bottleneck'],
    ['docs', 'generate API documentation from the OpenAPI spec'],
    ['video', 'extract the audio track and summarize this product video'],
    ['payment', 'add a Stripe checkout subscription form with invoices'],
    ['mobile', 'check the responsive layout on mobile viewports and tablets'],
    ['pdf', 'export this invoice to a printable PDF document'],
    ['links', 'find and report broken links across the documentation site'],
    ['readability', 'summarize the article content and extract the key points'],
    ['email', 'send me a notification email when the nightly backup finishes'],
    ['files', 'archive old log files into a compressed backup and clean the folder'],
    ['review', 'review this pull request code for bugs and suggest a refactor'],
    ['errors', 'the build failed with a type error; debug it and recover the test run'],
    ['report', 'analyze last month sales and produce a metrics report with statistics'],
    ['a11y', 'check accessibility contrast and ARIA labels for screen readers'],
    ['design', 'extract the design tokens, colors and fonts used on this page'],
    ['terminal', 'what was the last error printed in the terminal output?'],
    ['packages', 'audit npm dependencies for outdated packages and install the fix'],
    ['database', 'optimize this slow SQL query and check the migration status'],
    ['ci', 'set up a CI pipeline that runs tests automatically on every push'],
    ['cloud', 'estimate the monthly AWS cost of this infrastructure'],
    ['cache', 'clear the application cache and warm it with the top pages'],
    ['refactor-dead', 'find dead code and unused exports, then auto refactor the module'],
    ['state', 'save the current project state so we can resume this task later'],
    ['python', 'run this python data script and show me the output table'],
    ['rss', 'fetch the latest release notes from the project RSS feed'],
    ['search-api', 'search the web API directory for a geocoding service'],
    ['todo', 'create a task list for the launch milestone and track its lifecycle'],
    ['knowledge', 'search the team knowledge base for the VPN setup guide'],
    ['symbols', 'find where the calculateTotal symbol is defined and who calls it'],
    ['seed', 'seed the staging database with ten thousand realistic test rows'],
    ['recover', 'the dev server crashed on startup; diagnose and recover it'],
    ['compliance', 'run a compliance validation check against our data policy'],
    ['sonar', 'run a static analysis quality gate on the new service code'],
    ['notify', 'notify the channel when the deployment finishes'],
];

const normLite = (s: string) => String(s || '').toLowerCase();
// Proxy name-hit: substring only, NO weight rule (MAIN weight is private).
// Labeled PROXY wherever used; the behavioral verdict comes from route/null.
const proxyNameHit = (toolName: string, goal: string) => {
    const terms = cat.goalTerms(goal);
    return terms.some((t: string) => t.length > 2 && normLite(toolName).includes(normLite(t)));
};

const CTX0 = {};
const CTX1 = { previewUrl: 'https://example.com/', workspaceRoot: 'D:/Joe/work' };
const shortRoute = (r: any) => r ? { tool: r.tool, score: r.score, runnerUp: r.runnerUp } : null;
const sweepGoal = (id: string, goal: string) => {
    const route = cat.capabilityRoute(goal, CTX0);
    const routeCtx = cat.capabilityRoute(goal, CTX1);
    const terms = cat.goalTerms(goal);
    const unfiltered = tools
        .map(t => ({ name: t.name, score: cat.scoreTool(t, terms) }))
        .sort((a, b) => b.score - a.score);
    const best = unfiltered[0];
    const bestAllowed = unfiltered.find((x: any) => !EXCL.has(x.name));
    const fillable = bestAllowed ? cat.inputForTool(byName.get(bestAllowed.name), goal, CTX0) !== null : null;
    const fillableCtx = bestAllowed ? cat.inputForTool(byName.get(bestAllowed.name), goal, CTX1) !== null : null;
    return {
        id,
        route: shortRoute(route),
        routeCtx: shortRoute(routeCtx),
        stage: {
            lenOk: String(goal).trim().length >= 6,
            actVerb: ACT_RE.test(normLite(goal)),
            bestUnfiltered: best ? { name: best.name, score: +best.score.toFixed(2) } : null,
            bestUnfilteredExcluded: best ? EXCL.has(best.name) : null,
            bestAllowed: bestAllowed ? { name: bestAllowed.name, score: +bestAllowed.score.toFixed(2) } : null,
            scoreGatePass: bestAllowed ? bestAllowed.score >= 8 : false,
            proxyNameHitOnBestAllowed: bestAllowed ? proxyNameHit(bestAllowed.name, goal) : null,
            inputFillableOnBestAllowed: fillable,
            inputFillableCtxOnBestAllowed: fillableCtx,
        },
    };
};

const targetRuns = P3TARGET.map(([id, g]) => sweepGoal('target:' + id, g));
const pairRuns = MINPAIR.map(([id, g]) => sweepGoal('pair:' + id, g));
const handRuns = HAND.map(([id, g]) => sweepGoal('hand:' + id, g));

// Unfillable-input discovery: non-excluded tools with required fields the
// filler patterns cannot serve (deterministic: first alphabetically).
const FILLABLE = /^(url|link|page|address|site|website|query|question|text|request|instruction|goal|task|prompt|description|topic|content|input|projectpath|directory|folder|root|workspacepath)$/i;
const unfillableCandidates = tools
    .filter(t => !EXCL.has(t.name))
    .map(t => {
        const required: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required.map(String) : [];
        const unfillable = required.filter(r => !FILLABLE.test(r));
        return { name: t.name, required, unfillable };
    })
    .filter(x => x.unfillable.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
const unfillProbe = unfillableCandidates.length
    ? (() => {
        const cand = unfillableCandidates[0];
        const goal = `review and inspect the ${cand.name.replace(/_/g, ' ')} output and check the result`;
        return { candidate: cand.name, required: cand.required, goal, sweep: sweepGoal('unfill:' + cand.name, goal) };
    })()
    : null;

// EXCL32 sweep: act verbs + excluded tool's own distinctive name words.
const exclRuns = exclNames.map(name => {
    const goal = `review and inspect the ${name.replace(/_/g, ' ')} behavior and check its output`;
    const s = sweepGoal('excl:' + name, goal);
    const bestName = s.stage.bestUnfiltered?.name;
    const wouldWin = bestName === name;
    const routedTo = s.route?.tool || null;
    const verdict = routedTo === name ? 'VIOLATION_ROUTED_TO_EXCLUDED'
        : wouldWin ? 'DEFLECTED_LOADBEARING' : 'DEFLECTED_MOOT';
    return { name, goal, wouldWin, wouldWinScore: wouldWin ? s.stage.bestUnfiltered?.score : null, routedTo, verdict };
});

const allSweeps = [...targetRuns, ...pairRuns, ...handRuns];
const routed53 = [...new Set(allSweeps.filter(s => s.route && WATCH53.includes(s.route.tool)).map(s => s.route!.tool))].sort();
const result = {
    probe: 'p3sweep41',
    tree: TREE,
    registrySize: tools.length,
    premise: {
        actVerbBlocksIdentical: actIdentical, actAlternations: altStrings.length,
        routerExcludedIdentical: exclIdentical, routerExcludedCount: exclNames.length,
    },
    summary: {
        targetRouted: targetRuns.filter(r => r.route).length + '/' + targetRuns.length,
        targetRoutedCtx: targetRuns.filter(r => r.routeCtx).length + '/' + targetRuns.length,
        pairRouted: pairRuns.filter(r => r.route).length + '/' + pairRuns.length,
        pairRoutedCtx: pairRuns.filter(r => r.routeCtx).length + '/' + pairRuns.length,
        handRouted: handRuns.filter(r => r.route).length + '/' + handRuns.length,
        handRoutedCtx: handRuns.filter(r => r.routeCtx).length + '/' + handRuns.length,
        watch53RoutedCount: routed53.length,
        watch53Routed: routed53,
        exclViolations: exclRuns.filter(e => e.verdict === 'VIOLATION_ROUTED_TO_EXCLUDED').map(e => e.name),
        exclLoadbearing: exclRuns.filter(e => e.verdict === 'DEFLECTED_LOADBEARING').length,
        exclMoot: exclRuns.filter(e => e.verdict === 'DEFLECTED_MOOT').length,
    },
    unfillProbe,
    exclRuns,
    targetRuns, pairRuns, handRuns,
};
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `p3sweep41_${tag}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ tree: TREE, registry: tools.length, actIdentical, exclIdentical, exclCount: exclNames.length, summary: result.summary, unfill: unfillProbe?.candidate || null }, null, 1));
