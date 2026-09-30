/**
 * MUSE wiring discovery checkpoint 40 — behavioral P2 (retrieval) battery.
 * READ-ONLY: imports selectToolsFor + registry from the target tree and scores
 * a fixed goal battery. No servers, no network, no writes outside --out.
 * Deterministic output (no timestamps/pids) so A/B runs are byte-comparable.
 * Usage: tsx <abs path>/p2battery40.mts --tree=muse|main --out=<abs dir>
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
const tools: any[] = reg.tools || [];
const byName = new Map(tools.map(t => [t?.name, t]));

// The 53 retrieval-dependent names from ckpt39 F14 (33 + 20).
const RETRIEVAL_ONLY_33 = `api_tester architect_plan auto_refactor business_logic_parser cache_manager chaos_test_plan cloud_cost_estimator dead_code_detector dev_server_start docker_swarm_ops enterprise_platform_foundation error_recovery image_studio inspect_symbol large_data_seeder llm_cache load_tester logger memorize_codebase orion_business_foundation performance_analyzer performance_profile project_state_manager query_optimizer recall_memory repo_diff_summary repo_run_command rss_fetch secrets_scan_repo shell_check_status task_lifecycle video_action visual_compare`.split(' ');
const DORMANT_OR_EXCLUDED_20 = `archive_files browser_action browser_vision codebase_outline compliance_validator dependency_graph execute_python go_builder html_extract http_fetch java_builder knowledge_search notify_user progressive_generator python_builder query_datasource search_api sonar_analysis todo_write website_full_pipeline`.split(' ');
const WATCH = [...RETRIEVAL_ONLY_33, ...DORMANT_OR_EXCLUDED_20];

// A. Hand-written natural goals (fixed battery; EN + AR).
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

// B. Description-derived upper-bound goals: name words + own description slice.
const descGoal = (t: any) => `${String(t.name).replace(/_/g, ' ')} ${String(t.description || '').split(/(?<=[.。])\s/)[0].slice(0, 130)}`;

const runGoal = (id: string, goal: string) => {
    const ranked = cat.selectToolsFor(goal, 30).map((s: any, i: number) => ({ rank: i + 1, name: s.name, score: s.score }));
    return { id, ranked };
};

const handRuns = HAND.map(([id, goal]) => runGoal('hand:' + id, goal));
const descRuns: any[] = [];
const missing: string[] = [];
for (const name of WATCH) {
    const t = byName.get(name);
    if (!t) { missing.push(name); continue; }
    descRuns.push(runGoal('desc:' + name, descGoal(t)));
}

// Aggregate per watched name.
const perName: Record<string, any> = {};
for (const name of WATCH) {
    const agg: any = { name, inRegistry: byName.has(name), handHits: [], descRank: null, descScore: null, bestHandRank: null, bestHandScore: null };
    for (const r of handRuns) {
        const hit = r.ranked.find((x: any) => x.name === name);
        if (hit) { agg.handHits.push({ goal: r.id, rank: hit.rank, score: hit.score }); }
    }
    if (agg.handHits.length) {
        agg.handHits.sort((a: any, b: any) => a.rank - b.rank);
        agg.bestHandRank = agg.handHits[0].rank;
        agg.bestHandScore = agg.handHits[0].score;
    }
    const dr = descRuns.find(r => r.id === 'desc:' + name);
    if (dr) {
        const hit = dr.ranked.find((x: any) => x.name === name);
        if (hit) { agg.descRank = hit.rank; agg.descScore = hit.score; }
        else {
            // Score even when outside top-30: proves zero vs crowded-out.
            const terms = cat.goalTerms(dr ? descGoal(byName.get(name)) : '');
            agg.descScoreOutsideTop30 = cat.scoreTool(byName.get(name), terms);
        }
    }
    agg.retrievable = agg.handHits.length > 0 || agg.descRank !== null;
    perName[name] = agg;
}

const retrievable = WATCH.filter(n => perName[n].retrievable);
const neverRetrieved = WATCH.filter(n => !perName[n].retrievable);
const result = {
    probe: 'p2battery40',
    tree: TREE,
    registrySize: tools.length,
    coreTools: cat.CORE_TOOLS,
    batteryHand: HAND.length,
    batteryDesc: descRuns.length,
    missingFromRegistry: missing,
    summary: {
        watched: WATCH.length,
        retrievable: retrievable.length,
        neverRetrieved: neverRetrieved.length,
        neverRetrievedNames: neverRetrieved,
        handOnly: WATCH.filter(n => perName[n].handHits.length > 0 && perName[n].descRank === null),
        descOnly: WATCH.filter(n => perName[n].handHits.length === 0 && perName[n].descRank !== null),
        both: WATCH.filter(n => perName[n].handHits.length > 0 && perName[n].descRank !== null),
    },
    perName,
};
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `p2battery40_${tag}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ tree: TREE, registry: tools.length, retrievable: retrievable.length, never: neverRetrieved.length, missing }, null, 1));
