// C235 nearest-fallback audit probe (read-only; resolves names, executes no tools).
// Run: cd api && $env:TEMP='D:/Joe/muse-worktree/tmp/c235-jest-tmp'; $env:TMP=$env:TEMP;
//   $env:JWT_SECRET='c235-synthetic-test-only'; $env:MOCK_DB='true';
//   node node_modules/tsx/dist/cli.mjs ../tmp/c235-nearest/nearest-probe.mts
// Closes the explicit c234 residual: 'nearest' branch (:257-258) untested.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const planTools = require('D:/Joe/muse-worktree/api/src/core/orchestrator/plan-tools.ts');
const { resolvePlannedTool, PLANNER_TOOL_CATALOGUE } = planTools;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tools } = require('D:/Joe/muse-worktree/api/src/modules/tools/registry');
const registered: string[] = (tools || []).map((t: any) => String(t.name));
const regSet = new Set<string>(registered);
const catalogue = new Set<string>((PLANNER_TOOL_CATALOGUE || []).map((e: any) => String(e.tool)));

// Verbatim copies of plan-tools.ts:194-195 (for candidate-count forensics only).
const norm = (v: any) => String(v || '').trim().toLowerCase();
const key = (v: any) => norm(v).replace(/[_\-\s]+/g, ' ').replace(/[^a-z0-9. /]/g, '').trim();
const snake = (v: any) => norm(v).replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '');
function nearCandidates(prose: string): string[] {
  const k = key(prose);
  const s = snake(prose);
  return [...regSet].filter((t) => k.includes(t.replace(/_/g, ' ')) || s.includes(t));
}

const results: any[] = [];
for (const name of registered) {
  const spaced = name.replace(/_/g, ' ');
  const prose = `please run ${spaced} for this`;
  const r: any = resolvePlannedTool(prose);
  const row: any = {
    tool: name,
    inCatalogue: catalogue.has(name),
    prose,
    resolution: r,
    selfHit: !!(r && r.tool === name),
  };
  if (!r || r.tool == null) {
    const cands = nearCandidates(prose);
    row.whyDetail = r ? r.why : 'null';
    row.candidateCount = cands.length;
    row.candidates = cands.slice(0, 12);
  }
  results.push(row);
}

// F-C234-1/2 regression on current HEAD bytes.
const f1: any = resolvePlannedTool('my react native setup');
const f2: any = resolvePlannedTool('my github actions setup');

const gap = results.filter((r) => !r.inCatalogue);
const gapSelfHit = gap.filter((r) => r.selfHit);
const gapNull = gap.filter((r) => !r.resolution || r.resolution.tool == null);
const gapAmbiguous = gapNull.filter((r) => (r.candidateCount || 0) >= 2);
const gapZero = gapNull.filter((r) => (r.candidateCount || 0) === 0);
const gapOneButNull = gapNull.filter((r) => r.candidateCount === 1);
const gapMisroute = gap.filter(
  (r) => r.resolution && r.resolution.tool != null && r.resolution.tool !== r.tool,
);
const cat = results.filter((r) => r.inCatalogue);
const catSelfHit = cat.filter((r) => r.selfHit);

const out = {
  registeredCount: registered.length,
  catalogueCount: catalogue.size,
  gapCount: gap.length,
  gapSelfHitCount: gapSelfHit.length,
  gapSelfHit: gapSelfHit.map((r) => ({ tool: r.tool, how: r.resolution.how })),
  gapMisrouteCount: gapMisroute.length,
  gapMisroute: gapMisroute.map((r) => ({ tool: r.tool, prose: r.prose, resolution: r.resolution })),
  gapNullCount: gapNull.length,
  gapAmbiguousCount: gapAmbiguous.length,
  gapAmbiguous: gapAmbiguous.map((r) => ({ tool: r.tool, candidates: r.candidates })),
  gapZeroCount: gapZero.length,
  gapZero: gapZero.map((r) => r.tool),
  gapOneButNullCount: gapOneButNull.length,
  gapOneButNull: gapOneButNull.map((r) => ({
    tool: r.tool, why: r.whyDetail, candidates: r.candidates,
  })),
  catalogueSelfHit: `${catSelfHit.length}/${cat.length}`,
  catalogueNonSelf: cat
    .filter((r) => !r.selfHit)
    .map((r) => ({ tool: r.tool, resolution: r.resolution })),
  f1_regression: f1,
  f2_regression: f2,
  sampleRows: results.slice(0, 5),
};
fs.writeFileSync(
  'D:/Joe/muse-worktree/tmp/c235-nearest/probe-result.json',
  JSON.stringify(out, null, 1),
);
console.log(
  `reg=${out.registeredCount} cat=${out.catalogueCount} gap=${out.gapCount} ` +
    `gapSelf=${out.gapSelfHitCount} gapMis=${out.gapMisrouteCount} ` +
    `gapNull=${out.gapNullCount}(amb=${out.gapAmbiguousCount} zero=${out.gapZeroCount} oneButNull=${out.gapOneButNullCount}) ` +
    `catSelf=${out.catalogueSelfHit} f1=${f1.tool}/${f1.how} f2=${f2.tool}/${f2.how}`,
);
