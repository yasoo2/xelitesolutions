/**
 * MUSE wiring discovery checkpoint 059 — P2 offered-set sweep at current HEAD.
 * READ-ONLY: imports selectToolsFor + registry from the target tree and records
 * per-goal offered name sets over the FIXED 65-goal battery copied verbatim
 * from p3sweep41.mts (P3TARGET 14 + MINPAIR 5 + HAND 46). No servers, no
 * network, no provider calls, no writes outside --out.
 * Usage: tsx offered59.mts --tree=muse|main --out=<abs dir>
 * Env: dummy JWT_SECRET + JOE_TEST_MODE=true + worktree-local TEMP/TMP.
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
const registryNames: string[] = tools.map(t => t.name).sort();

// Goal batteries copied FIXED from p3sweep41.mts (provenance: that file at HEAD).
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
const MINPAIR: Array<[string, string]> = [
    ['noverb', 'the SEO meta tags of https://example.com/store look wrong today'],
    ['short', 'test!'],
    ['vague', 'please review things and check stuff generally'],
    ['nobuild', 'build me a todo app with login'],
    ['ar-inspect', 'افحص صفحة https://example.com/ وتحقق من مشاكل العرض'],
];
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
const GOALS: Array<[string, string]> = [
    ...P3TARGET.map(([id, g]) => ['target:' + id, g] as [string, string]),
    ...MINPAIR.map(([id, g]) => ['pair:' + id, g] as [string, string]),
    ...HAND.map(([id, g]) => ['hand:' + id, g] as [string, string]),
];

const perGoal: Array<{ id: string; offered: string[]; count: number }> = [];
const union = new Set<string>();
for (const [id, goal] of GOALS) {
    const ranked = cat.selectToolsFor(goal, 30);
    const names = ranked.map((s: any) => String(s.name));
    names.forEach((n: string) => union.add(n));
    perGoal.push({ id, offered: names, count: names.length });
}
const unionArr = [...union].sort();
const regSet = new Set(registryNames);
const offeredNotRegistered = unionArr.filter(n => !regSet.has(n));
const neverOffered = registryNames.filter(n => !union.has(n));
const result = {
    probe: 'offered59',
    tree: TREE,
    battery: GOALS.length,
    topK: 30,
    registrySize: registryNames.length,
    unionOffered: unionArr.length,
    offeredNotRegistered,
    neverOfferedCount: neverOffered.length,
    neverOffered,
    unionOfferedNames: unionArr,
    perGoal,
};
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `offered59_${tag}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ tree: TREE, registry: registryNames.length, union: unionArr.length, never: neverOffered.length, phantom: offeredNotRegistered.length }));
