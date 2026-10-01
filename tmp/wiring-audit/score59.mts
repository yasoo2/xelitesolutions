/**
 * Checkpoint 059 companion: score-vs-crowdout for the 5 never-offered names.
 * READ-ONLY: imports scoreTool/goalTerms/selectToolsFor + registry from the
 * target tree. For each of the 5 names x 65 fixed goals (same battery as
 * offered59.mts): score, rank among all registered, inTop30.
 * Usage: tsx score59.mts --tree=muse|main --out=<abs dir>
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

const FOCUS = ['ambiguity_resolver', 'ask_user', 'echo', 'ls', 'self_confidence_evaluator'];
// Same fixed 65-goal battery as offered59.mts (ids only needed for reporting;
// goal text reconstructed identically).
const BATTERY: Array<[string, string]> = JSON.parse(fs.readFileSync(
    path.join(ROOTS.muse, '..', '..', 'tmp', 'wiring-audit', 'fx-offered59', 'battery59.json'), 'utf8'));

const rows: any[] = [];
for (const name of FOCUS) {
    const tool = byName.get(name);
    if (!tool) { rows.push({ name, registered: false }); continue; }
    let scorePos = 0, bestRank = 1e9, bestScore = -1, bestGoal = '';
    for (const [id, goal] of BATTERY) {
        const terms = cat.goalTerms(goal);
        const s = cat.scoreTool(tool, terms);
        const ranked = tools.map(t => ({ name: t.name, score: cat.scoreTool(t, terms) }))
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        const rank = ranked.findIndex(r => r.name === name) + 1;
        if (s > 0) scorePos++;
        if (rank < bestRank) { bestRank = rank; bestScore = s; bestGoal = id; }
    }
    rows.push({ name, registered: true, goalsScoredPositive: scorePos, bestRank, bestScore, bestGoal });
}
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `score59_${tag}.json`), JSON.stringify({ probe: 'score59', tree: TREE, rows }, null, 1));
console.log(JSON.stringify(rows.map(r => ({ n: r.name, pos: r.goalsScoredPositive, best: r.bestRank, goal: r.bestGoal }))));
