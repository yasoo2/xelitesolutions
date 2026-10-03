// C234 MEANS-map audit probe (read-only; resolves names, executes no tools).
// Run: cd api && node ../node_modules/tsx/dist/cli.mjs ../tmp/c234-means/means-probe.mts
// (tsx lives in api/node_modules; TEMP must be redirected under sandbox.)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const PLAN_TOOLS = 'D:/Joe/muse-worktree/api/src/core/orchestrator/plan-tools.ts';
const src = fs.readFileSync(PLAN_TOOLS, 'utf8');
const start = src.indexOf('const MEANS');
const end = src.indexOf('};', start);
if (start < 0 || end < 0) throw new Error('MEANS block not found');
const body = src.slice(start, end);

// keys: bare (git), single-quoted ('git init', 'ci/cd'); values: single-quoted
const re = /(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_\/][A-Za-z0-9_\/.\-]*))\s*:\s*'([^']+)'/g;
const means: Array<[string, string]> = [];
let m: RegExpExecArray | null;
while ((m = re.exec(body)) !== null) {
  const k = m[1] ?? m[2] ?? m[3];
  const v = m[4];
  if (k && v) means.push([k, v]);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const planTools = require('D:/Joe/muse-worktree/api/src/core/orchestrator/plan-tools.ts');
const { resolvePlannedTool, PLANNER_TOOL_CATALOGUE } = planTools;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tools } = require('D:/Joe/muse-worktree/api/src/modules/tools/registry');
const registered = new Set<string>((tools || []).map((t: any) => String(t.name)));
const catalogue = new Set<string>((PLANNER_TOOL_CATALOGUE || []).map((e: any) => String(e.tool)));

const targets = new Map<string, { keys: string[]; inCatalogue: boolean; registered: boolean }>();
const keyResults: any[] = [];
for (const [k, target] of means) {
  const r: any = resolvePlannedTool(k);
  const c: any = resolvePlannedTool(`my ${k} setup`);
  keyResults.push({ key: k, meansTarget: target, direct: r, contains: c });
  if (!targets.has(target)) {
    targets.set(target, { keys: [], inCatalogue: catalogue.has(target), registered: registered.has(target) });
  }
  targets.get(target)!.keys.push(k);
}

const mismatchedDirect = keyResults.filter(
  (r) => !(r.direct && r.direct.tool === r.meansTarget && r.direct.how === 'meaning'),
);
const dangling = [...targets.entries()].filter(([, v]) => !v.registered).map(([t]) => t);
const gapVisible = [...targets.entries()]
  .filter(([t, v]) => v.registered && !v.inCatalogue)
  .map(([t, v]) => ({ tool: t, keys: v.keys }));

const out = {
  meansKeys: means.length,
  distinctTargets: targets.size,
  registeredCount: registered.size,
  catalogueCount: catalogue.size,
  danglingTargets: dangling,
  mismatchedDirectCount: mismatchedDirect.length,
  mismatchedDirect,
  gapVisibleViaMeans: gapVisible,
  keyResults,
};
fs.writeFileSync('D:/Joe/muse-worktree/tmp/c234-means/probe-result.json', JSON.stringify(out, null, 1));
console.log(`keys=${out.meansKeys} targets=${out.distinctTargets} reg=${out.registeredCount} cat=${out.catalogueCount} dangling=${out.danglingTargets.length} mism=${out.mismatchedDirectCount} gapVisible=${out.gapVisibleViaMeans.length}`);
