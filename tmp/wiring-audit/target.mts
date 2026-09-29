// MUSE wiring-audit targeted-selection probe (read-only, no providers, no network).
// Checkpoint 4A: self-grounded selection verdicts for the 7 keyword-only-unobserved
// tools + execute_python; checkpoint 4C: first-pass tag-cluster grouping draft.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\target.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TARGETS = [
  'cloud_cost_estimator', 'docker_swarm_ops', 'llm_cache', 'rss_fetch',
  'task_lifecycle', 'template_manager', 'video_action', 'execute_python',
  'json_query',
];

// Hand-written natural goals (secondary realism signal; verdicts rest on self-grounded).
const HAND_GOALS: Record<string, string> = {
  cloud_cost_estimator: 'estimate the monthly cloud hosting cost for deploying this app',
  docker_swarm_ops: 'scale the docker swarm service to three replicas',
  llm_cache: 'look up the cached llm response for this prompt to save tokens',
  rss_fetch: 'fetch the latest items from the project rss feed',
  task_lifecycle: 'advance the task lifecycle state from planned to in progress',
  template_manager: 'list the available project templates to scaffold from',
  video_action: 'press play on the embedded video and confirm it started',
  execute_python: 'run this python snippet and show me its output',
  json_query: 'what value sits at user.address.city in this json object',
};

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const selectToolsFor = catalog.selectToolsFor as (goal: string, limit?: number) => Array<{ name: string; score: number }>;
  const fullLimit = tools.length;

  // A. targeted selection
  const verdicts: Record<string, any> = {};
  for (const n of TARGETS) {
    const t = byName.get(n);
    const desc: string = String(t?.description || '');
    const tags: string[] = Array.isArray(t?.tags) ? t.tags.map(String) : [];
    const nameWords = n.split('_').join(' ');
    const firstSentence = desc.split(/(?<=[.])\s/)[0].slice(0, 140).trim();
    const goals = [
      { kind: 'SELF_NAME', goal: `use ${nameWords} for this task` },
      { kind: 'SELF_DESC', goal: firstSentence ? `I need: ${firstSentence}` : `use ${nameWords}` },
      { kind: 'HAND', goal: HAND_GOALS[n] },
    ];
    const perGoal = goals.map(g => {
      const top30 = selectToolsFor(g.goal, 30);
      const all = selectToolsFor(g.goal, fullLimit);
      const in30 = rankOf(top30, n);
      const inAll = rankOf(all, n);
      return {
        kind: g.kind, goal: g.goal,
        rank30: in30, rankFull: inAll,
        top3: top30.slice(0, 3).map(p => `${p.name}:${p.score}`),
        selectedCount30: top30.length,
      };
    });
    const best30 = Math.min(...perGoal.map(p => p.rank30?.rank ?? Infinity));
    const bestFull = Math.min(...perGoal.map(p => p.rankFull?.rank ?? Infinity));
    const verdict = !t ? 'NOT_REGISTERED'
      : !desc ? 'NO_DESCRIPTION_INVISIBLE_TO_ROUTER'
      : best30 <= 30 ? 'SELECTABLE_BY_KEYWORD'
      : bestFull <= fullLimit ? 'LONG_TAIL_RANKED'
      : 'UNSELECTABLE_EVEN_SELF_GROUNDED';
    verdicts[n] = {
      registered: !!t, hasExecute: !!(t && typeof t.execute === 'function'),
      description: desc.slice(0, 200), tags,
      required: Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : null,
      verdict, bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
      perGoal,
    };
  }

  // C. first-pass grouping by primary tag (PRELIMINARY — tags are author-declared)
  const clusters: Record<string, string[]> = {};
  const untagged: string[] = [];
  for (const t of tools) {
    const tags: string[] = Array.isArray(t?.tags) ? t.tags.map(String) : [];
    if (!tags.length) { untagged.push(t.name); continue; }
    (clusters[tags[0]] = clusters[tags[0]] || []).push(t.name);
  }
  const clusterSizes = Object.entries(clusters)
    .map(([tag, names]) => ({ tag, count: names.length }))
    .sort((a, b) => b.count - a.count);

  const out = {
    generatedAt: new Date().toISOString(),
    targetVerdicts: verdicts,
    groupingDraft: {
      method: 'primary-tag (tags[0]) clustering over 163 registered tools',
      distinctPrimaryTags: Object.keys(clusters).length,
      untaggedCount: untagged.length, untagged,
      clusterSizes,
      clusters,
    },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'target.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  const summary: Record<string, any> = {};
  for (const [n, v] of Object.entries(verdicts)) {
    summary[n] = { verdict: (v as any).verdict, best30: (v as any).bestRank30, bestFull: (v as any).bestRankFull };
  }
  console.log(JSON.stringify({
    summary,
    distinctPrimaryTags: out.groupingDraft.distinctPrimaryTags,
    untaggedCount: untagged.length,
    topClusters: clusterSizes.slice(0, 12),
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('TARGET_FAILED', e); process.exit(1); });
