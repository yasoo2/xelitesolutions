/**
 * MUSE wiring audit 107 — planner-catalogue vs registry reconciliation.
 *
 * Question: the team summary claims a "curated 41-tool catalogue" with 32
 * tools intentionally not planner-visible. Muse-lineage source shows a
 * RETRIEVED catalogue instead (toolCatalog.ts: selectToolsFor, limit=30 +
 * forced CORE_TOOLS). This probe measures, on exact Muse HEAD bytes:
 *   Q0: registered count; CORE_TOOLS all registered?
 *   Q1: union of offered tools across 12 diverse goals; any phantom
 *       (offered but unregistered) names?
 *   Q2: is the per-goal limit honored (<=30)?
 *   Q3: are all CORE_TOOLS present in every catalogue?
 *   Q4: retrievable universe — tools scoring >0 on at least one goal.
 *
 * Safety: pure scoring, zero tool execution, zero network, zero writes.
 * Process imports the canonical test setup for env isolation only.
 * No source is modified by this script.
 *
 * Run from api/: ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-107-catalogue-probe.ts
 */
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import {
  CORE_TOOLS,
  selectToolsFor,
  scoreTool,
  goalTerms,
  registeredToolNames,
} from 'D:/Joe/muse-worktree/api/src/core/orchestrator/toolCatalog';

const GOALS: string[] = [
  'Build a REST API with user authentication and a Postgres database',
  'Translate my website to Arabic and check the RTL layout',
  'Audit the SEO and broken links on https://example.com',
  'افحص الروابط المكسورة في موقعي',
  'Run the test suite and fix the failing backend tests',
  'Deploy the docs site to GitHub Pages',
  'What was the last error shown in the terminal output',
  'ترجم الموقع',
  'Check the mobile responsive layout and accessibility of the checkout page',
  'Generate API documentation from the OpenAPI spec',
  'Commit the changes and open a pull request on GitHub',
  'Profile the slow database queries and add an index',
];

interface Check {
  check: string;
  expect: string;
  actual: string;
  pass: boolean;
}

function main(): void {
  const checks: Check[] = [];
  const registered: string[] = registeredToolNames();
  const regSet = new Set(registered);

  // Q0a: registered count observed (informational, pinned).
  checks.push({
    check: 'Q0a-registered-count',
    expect: 'pinned_value_reported',
    actual: `registered=${registered.length}`,
    pass: registered.length > 0,
  });

  // Q0b: every CORE_TOOL is registered.
  const missingCore = CORE_TOOLS.filter((c) => !regSet.has(c));
  checks.push({
    check: 'Q0b-core-registered',
    expect: 'missing=0',
    actual: `missing=${missingCore.length}${missingCore.length ? ':' + missingCore.join(',') : ''}`,
    pass: missingCore.length === 0,
  });

  // Per-goal catalogues.
  const union = new Set<string>();
  const perGoalSizes: number[] = [];
  const phantoms = new Set<string>();
  const coreAbsent: string[] = [];
  let overLimit = 0;
  for (const g of GOALS) {
    const picked = selectToolsFor(g, 30);
    perGoalSizes.push(picked.length);
    if (picked.length > 30) overLimit += 1;
    const names = picked.map((p) => p.name);
    for (const n of names) {
      union.add(n);
      if (!regSet.has(n)) phantoms.add(n);
    }
    const absent = CORE_TOOLS.filter((c) => !names.includes(c));
    if (absent.length) coreAbsent.push(`[${g.slice(0, 24)}...]:${absent.join(',')}`);
  }

  // Q1: no phantom names offered.
  checks.push({
    check: 'Q1-no-phantoms',
    expect: 'phantoms=0',
    actual: `phantoms=${phantoms.size}${phantoms.size ? ':' + [...phantoms].join(',') : ''}`,
    pass: phantoms.size === 0,
  });

  // Q1b: union coverage (informational, pinned).
  const neverOffered = registered.filter((n) => !union.has(n));
  checks.push({
    check: 'Q1b-union-coverage',
    expect: 'pinned_value_reported',
    actual: `union=${union.size} never_offered=${neverOffered.length}`,
    pass: true,
  });

  // Q2: limit honored on every goal.
  checks.push({
    check: 'Q2-limit-honored',
    expect: 'over_limit=0',
    actual: `over_limit=${overLimit} sizes=[${perGoalSizes.join(',')}]`,
    pass: overLimit === 0,
  });

  // Q3: core present in every catalogue.
  checks.push({
    check: 'Q3-core-present',
    expect: 'absent=0',
    actual: `absent=${coreAbsent.length}${coreAbsent.length ? ' ' + coreAbsent.join(' | ') : ''}`,
    pass: coreAbsent.length === 0,
  });

  // Q4: retrievable universe (score>0 on >=1 goal).
  let retrievable = 0;
  const unreachable: string[] = [];
  for (const t of tools as any[]) {
    let best = 0;
    for (const g of GOALS) {
      const s = scoreTool(t, goalTerms(g));
      if (s > best) best = s;
    }
    if (best > 0) retrievable += 1;
    else unreachable.push(String(t?.name || '?'));
  }
  checks.push({
    check: 'Q4-retrievable-universe',
    expect: 'pinned_value_reported',
    actual: `retrievable=${retrievable} zero_score=${unreachable.length}`,
    pass: true,
  });

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({
    probe: 'muse-107-catalogue',
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    checks,
    never_offered_names: neverOffered,
    zero_score_names: unreachable,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main();
