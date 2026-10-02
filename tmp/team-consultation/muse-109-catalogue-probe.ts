/**
 * MUSE wiring audit 109 — third planner-catalogue battery (42 goals).
 *
 * Follow-up to 108 (union=139 over 24 goals, 24 never-offered). This probe
 * adds 18 NEW goals aimed at the remaining unobserved families (k8s/swarm,
 * screenshot/video, pdf/readability/find-text, repo search, cost estimate,
 * code review, engineering report, npm, analyze/outline/detect, json query,
 * llm cache, templates, sonar, pattern recognition, knowledge search, echo)
 * and re-pins Q0-Q4 on exact Muse HEAD bytes.
 *
 * phase_executor is deliberately NOT targeted: it is executor-internal and
 * serves as a negative control (expected to stay unobserved).
 *
 * Safety: pure scoring, zero tool execution, zero network, zero writes.
 * Process imports the canonical test setup for env isolation only.
 * No source is modified by this script.
 *
 * Run from api/: ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-109-catalogue-probe.ts
 * (sandbox: set TEMP/TMP/TMPDIR to a workspace tmp dir first; use plain
 * DOS path as CWD — the tsx.cmd wrapper rejects UNC `\\?\` CWDs)
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

const GOALS_107: string[] = [
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

const GOALS_108: string[] = [
  'Scan the repository for hardcoded secrets and vulnerable dependencies',
  'Show the system monitoring metrics and reset the counters',
  'Create a todo list to track the migration tasks',
  'Apply advanced multi-file edits with a preview before writing',
  'Ask the user to fill in the missing deployment form fields',
  'Recall lessons learned from the previous failed builds',
  'Resume the interrupted checkpoint from last night and continue',
  'Connect the NVIDIA provider and verify the API key',
  'Run a multi-agent debate to choose the system architecture',
  'Evaluate confidence before starting the risky database migration',
  'Resolve the ambiguous requirements before planning the work',
  'Stream the browser session to debug the checkout flow',
];

const GOALS_NEW: string[] = [
  'Scale the Kubernetes deployment to 5 replicas and roll out the new image',
  'List the Docker Swarm services and update the web stack',
  'Record a video of the checkout session and take a screenshot of the error state',
  'Save the invoice page as PDF and extract the readable article text',
  'Find the text "total amount" on the current page',
  'Search the repository for the function that parses CSV uploads',
  'Estimate the monthly cloud cost of the staging environment',
  'Review the pull request code for bugs and security issues',
  "Write a Joe engineering status report for this week's work",
  'Install the missing npm package and update lodash',
  'Analyze the project structure and outline the codebase modules',
  'Query the JSON API output for failed job names',
  'Check the LLM response cache hit rate and evict stale entries',
  'List available project templates and apply the Express template',
  'Run SonarQube quality analysis on the backend service',
  'Recognize the repeated crash pattern in these server logs',
  'Search the knowledge base for the VPN setup guide',
  'Echo back the exact deployment command for confirmation',
];

const GOALS: string[] = [...GOALS_107, ...GOALS_108, ...GOALS_NEW];

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

  checks.push({
    check: 'Q0a-registered-count',
    expect: 'pinned_value_reported',
    actual: `registered=${registered.length}`,
    pass: registered.length > 0,
  });

  const missingCore = CORE_TOOLS.filter((c) => !regSet.has(c));
  checks.push({
    check: 'Q0b-core-registered',
    expect: 'missing=0',
    actual: `missing=${missingCore.length}${missingCore.length ? ':' + missingCore.join(',') : ''}`,
    pass: missingCore.length === 0,
  });

  const union = new Set<string>();
  const union107 = new Set<string>();
  const union108 = new Set<string>();
  const perGoalSizes: number[] = [];
  const phantoms = new Set<string>();
  const coreAbsent: string[] = [];
  let overLimit = 0;
  GOALS.forEach((g, idx) => {
    const picked = selectToolsFor(g, 30);
    perGoalSizes.push(picked.length);
    if (picked.length > 30) overLimit += 1;
    const names = picked.map((p) => p.name);
    for (const n of names) {
      union.add(n);
      if (idx < GOALS_107.length) union107.add(n);
      if (idx < GOALS_107.length + GOALS_108.length) union108.add(n);
      if (!regSet.has(n)) phantoms.add(n);
    }
    const absent = CORE_TOOLS.filter((c) => !names.includes(c));
    if (absent.length) coreAbsent.push(`[${g.slice(0, 24)}...]:${absent.join(',')}`);
  });

  checks.push({
    check: 'Q1-no-phantoms',
    expect: 'phantoms=0',
    actual: `phantoms=${phantoms.size}${phantoms.size ? ':' + [...phantoms].join(',') : ''}`,
    pass: phantoms.size === 0,
  });

  const neverOffered = registered.filter((n) => !union.has(n));
  checks.push({
    check: 'Q1b-union-coverage',
    expect: 'pinned_value_reported',
    actual: `union=${union.size} union107repro=${union107.size} union108repro=${union108.size} never_offered=${neverOffered.length}`,
    pass: true,
  });

  checks.push({
    check: 'Q2-limit-honored',
    expect: 'over_limit=0',
    actual: `over_limit=${overLimit} sizes=[${perGoalSizes.join(',')}]`,
    pass: overLimit === 0,
  });

  checks.push({
    check: 'Q3-core-present',
    expect: 'absent=0',
    actual: `absent=${coreAbsent.length}${coreAbsent.length ? ' ' + coreAbsent.join(' | ') : ''}`,
    pass: coreAbsent.length === 0,
  });

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
    probe: 'muse-109-catalogue',
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    checks,
    union_names: [...union].sort(),
    never_offered_names: neverOffered,
    zero_score_names: unreachable,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main();
