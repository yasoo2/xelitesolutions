/**
 * DISPOSABLE adversarial-recall probe (Muse cycle 225, 2026-10-03). THROWAWAY.
 * Run: node <api>/node_modules/tsx/dist/cli.mjs tmp/wiring-recall-20261003/PROBE-recall.ts
 *
 * Follow-up to c212: 5 registered tools never surfaced across a 45-goal
 * corpus (cloud_cost_estimator, self_confidence_evaluator, ask_user,
 * rss_fetch, task_lifecycle). Discriminating question: do they surface
 * under goals that SHOULD retrieve them?
 *
 * Side-effect-free: pure retrieval scoring + registry reads only.
 * No execution, no network, no providers, no writes outside tmp/.
 */
import * as fs from 'fs';
import * as path from 'path';
import { tools } from '../../api/src/modules/tools/registry';
import { selectToolsFor, capabilityRoute, goalTerms } from '../../api/src/core/orchestrator/toolCatalog';

function assert(cond: any, msg: string): void {
  if (!cond) { console.error('PROBE-STRUCT-FAIL: ' + msg); process.exit(2); }
}

const registered: string[] = ((tools as any[]) || []).map((t: any) => String(t?.name || '')).filter(Boolean);
assert(registered.length > 50, 'registry too small: ' + registered.length);
const byName = new Map<string, any>();
for (const t of (tools as any[])) if (t?.name) byName.set(String(t.name), t);

const TARGETS: Array<{ target: string; goals: string[] }> = [
  { target: 'cloud_cost_estimator', goals: [
    'Estimate the monthly cloud cost for EC2 t3.small and RDS database',
    'How much will my AWS infrastructure cost per month',
  ] },
  { target: 'self_confidence_evaluator', goals: [
    'Evaluate your confidence in this generated answer',
    'How confident are you in the code you just wrote',
  ] },
  { target: 'ask_user', goals: [
    'If anything is unclear ask me a clarifying question instead of guessing',
    'Ask the user which database to use before proceeding',
  ] },
  { target: 'rss_fetch', goals: [
    'Fetch and parse the RSS feed at https://example.com/feed.xml',
    'Read the latest items from our company blog RSS feed',
  ] },
  { target: 'task_lifecycle', goals: [
    'Update the UI with your current task status and summary',
    'Mark the agent task loop as complete with a final summary',
  ] },
];
const NEGATIVES: string[] = ['Write tests for the project', 'Fix the crash and recover'];
const ALL_TARGETS = TARGETS.map(t => t.target);
for (const t of ALL_TARGETS) assert(byName.has(t), 'target not registered: ' + t);

const runGoal = (goal: string) => {
  const picked = selectToolsFor(goal, 30) as Array<{ name: string; score: number; line: string }>;
  assert(picked.length > 0, 'empty catalogue for: ' + goal);
  const rankOf = (name: string): number => {
    const i = picked.findIndex(s => s.name === name);
    return i < 0 ? -1 : i + 1;
  };
  const scoreOf = (name: string): number => {
    const hit = picked.find(s => s.name === name);
    return hit ? hit.score : 0;
  };
  let route: any = null;
  try { route = capabilityRoute(goal); } catch { route = { error: 'threw' }; }
  return {
    goal,
    pickedCount: picked.length,
    top5: picked.slice(0, 5).map(s => ({ name: s.name, score: s.score })),
    ranks: Object.fromEntries(ALL_TARGETS.map(t => [t, rankOf(t)])),
    scores: Object.fromEntries(ALL_TARGETS.map(t => [t, scoreOf(t)])),
    route: route && !route.error ? { tool: route.tool, score: route.score, runnerUp: route.runnerUp } : route,
    terms: goalTerms(goal),
  };
};

const adversarial = TARGETS.map(({ target, goals }) => ({
  target,
  definition: {
    description: String(byName.get(target)?.description || ''),
    tags: (byName.get(target)?.tags || []).map(String),
    required: ((byName.get(target)?.inputSchema?.required) || []).map(String),
  },
  goals: goals.map(runGoal),
}));
const negatives = NEGATIVES.map(runGoal);

const evidence = { probe: 'muse-adversarial-recall-tsx', museHead: 'c41b6996', registeredCount: registered.length, adversarial, negatives };

const outDir = path.resolve(__dirname);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'adversarial-recall.json'), JSON.stringify(evidence, null, 2));

const compact: Record<string, unknown> = {};
for (const a of adversarial) {
  compact[a.target] = a.goals.map(g => ({ rank: (g.ranks as any)[a.target], score: (g.scores as any)[a.target], route: (g.route as any)?.tool || null }));
}
compact.negatives = negatives.map(g => ({ picked: g.pickedCount, route: (g.route as any)?.tool || null }));
console.log('[ADVERSARIAL-RECALL] ' + JSON.stringify(compact));
