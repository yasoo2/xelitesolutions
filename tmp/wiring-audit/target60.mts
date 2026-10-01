/**
 * MUSE wiring discovery checkpoint 060 — targeted retrieval for the 5
 * never-offered-on-65 names (checkpoint 059 F-059-1 follow-up).
 * READ-ONLY: imports selectToolsFor/scoreTool/goalTerms + registry from the
 * target tree. 15 targeted goals (3 per name, grounded in each tool's own
 * name + description words). No servers, no network, no provider calls,
 * no writes outside --out.
 * Usage: tsx target60.mts --tree=muse|main --out=<abs dir>
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
const byName = new Map(tools.map(t => [t.name, t]));

// Targeted goals grounded in registry name + description words (read at HEAD):
// ambiguity_resolver 'Resolve ambiguity.' / self_confidence_evaluator
// 'Evaluate confidence.' / ask_user 'Ask the user a question...' / echo
// 'Return the input text (ping/pong).' / ls 'List directory entries.'
const TARGETS: Array<{ name: string; goals: Array<[string, string]> }> = [
    { name: 'ambiguity_resolver', goals: [
        ['t60-amb-1', 'resolve the ambiguity in this requirement text'],
        ['t60-amb-2', 'this requirement is ambiguous, resolve it before coding'],
        ['t60-amb-3', 'check ambiguity in the login requirement text'],
    ]},
    { name: 'self_confidence_evaluator', goals: [
        ['t60-conf-1', 'evaluate your confidence in this plan'],
        ['t60-conf-2', 'how confident are you about this answer, evaluate it'],
        ['t60-conf-3', 'evaluate confidence for the deployment content'],
    ]},
    { name: 'ask_user', goals: [
        ['t60-ask-1', 'ask me which region to deploy to'],
        ['t60-ask-2', 'ask the user to choose a color for the theme'],
        ['t60-ask-3', 'blocked on the api key, ask the user for clarification'],
    ]},
    { name: 'echo', goals: [
        ['t60-echo-1', 'echo back the text I send'],
        ['t60-echo-2', 'ping pong echo this input text'],
        ['t60-echo-3', 'return the input text unchanged'],
    ]},
    { name: 'ls', goals: [
        ['t60-ls-1', 'list directory entries in the project folder'],
        ['t60-ls-2', 'ls the workspace path and show entries'],
        ['t60-ls-3', 'list the directory entries including hidden files'],
    ]},
];

const rows: any[] = [];
for (const { name, goals } of TARGETS) {
    const tool = byName.get(name);
    if (!tool) { rows.push({ name, registered: false }); continue; }
    const perGoal = [];
    let retrieved = 0, bestRank = 1e9, bestScore = -1, bestGoal = '';
    for (const [id, goal] of goals) {
        const terms = cat.goalTerms(goal);
        const s = cat.scoreTool(tool, terms);
        const ranked = tools.map(t => ({ name: t.name, score: cat.scoreTool(t, terms) }))
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        const rank = ranked.findIndex(r => r.name === name) + 1;
        const offered = cat.selectToolsFor(goal, 30).map((x: any) => String(x.name));
        const inTop30 = offered.includes(name);
        if (inTop30) retrieved++;
        if (rank < bestRank) { bestRank = rank; bestScore = s; bestGoal = id; }
        perGoal.push({ id, goal, score: s, rank, inTop30 });
    }
    rows.push({ name, registered: true, retrievedOf3: retrieved, bestRank, bestScore, bestGoal, perGoal });
}
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `target60_${tag}.json`), JSON.stringify({ probe: 'target60', tree: TREE, rows }, null, 1));
console.log(JSON.stringify(rows.map(r => ({ n: r.name, got: r.retrievedOf3, best: r.bestRank, score: r.bestScore, goal: r.bestGoal }))));
