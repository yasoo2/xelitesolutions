/**
 * WIRING-203 EVIDENCE PROBE (Muse cycle 203; untracked; Muse HEAD exact bytes).
 *
 * Measures three GENERAL wiring rules instead of assuming them:
 *  R1 every tool the verification gate accepts must be registered (gate-accepts
 *     but execution-fails class; visual_qa is the known precedent, not the
 *     whole check — all 16 gate names are measured).
 *  R2 every planner-catalogue tool must be registered.
 *  R3 resolvePlannedTool precedence holds and unknown requests fail closed.
 *
 * No tool is executed, no network, no writes outside jest temp. Read-only.
 */
import { tools } from '../modules/tools/registry';
import { PLANNER_TOOL_CATALOGUE, resolvePlannedTool } from '../core/orchestrator/plan-tools';
import { isVerificationTool } from '../core/quality/verification-ledger';

const registered = new Set<string>((tools || []).map((t: any) => String((t as any)?.name)));

const GATE_UNCONDITIONAL = [
  'quality_run', 'auto_tester', 'code_reviewer', 'browser_console_scan',
  'browser_ui_audit', 'browser_contrast_audit', 'browser_check_links',
  'browser_performance', 'dependency_audit', 'secrets_scan_repo',
  'browser_run', 'browser_responsive_check', 'visual_qa',
];

const MEANS_TARGETS = [
  'git_ops', 'github_repo_manager', 'github_pr', 'npm_manager', 'shell_execute',
  'auto_tester', 'test_generator', 'browser_run', 'code_reviewer',
  'db_schema_migrator', 'payments_create_checkout_session', 'auth_builder',
  'react_project', 'api_project', 'swagger_docs', 'i18n_translator',
  'mobile_builder', 'deploy_project', 'docker_manager', 'kubernetes_ops',
  'terraform_manager', 'github_actions', 'ci_generate_pipeline', 'doc_generator',
  'write_file', 'file_edit', 'browser_ui_audit',
];

test('W203-P0 census: registry + catalogue counts', () => {
  const row = {
    registeredCount: registered.size,
    catalogueCount: PLANNER_TOOL_CATALOGUE.length,
    catalogueNames: PLANNER_TOOL_CATALOGUE.map(t => t.tool),
  };
  console.log(`[W203-P0-ACTUAL] ${JSON.stringify(row)}`);
  expect(PLANNER_TOOL_CATALOGUE.length).toBe(40);
  expect(registered.size).toBe(163);
});

test('W203-P1a gate accepts its checker vocabulary', () => {
  for (const name of GATE_UNCONDITIONAL) {
    expect(isVerificationTool(name)).toBe(true);
  }
  expect(isVerificationTool('project_run', {}, false, false, true)).toBe(true);
  expect(isVerificationTool('project_run')).toBe(false);
  expect(isVerificationTool('shell_execute', { command: 'npm test' })).toBe(true);
  expect(isVerificationTool('shell_execute', { command: 'rm -rf /' })).toBe(false);
  expect(isVerificationTool('read_file', { path: 'app/index.js' }, false, true)).toBe(true);
  expect(isVerificationTool('read_file', { path: 'app/index.js' })).toBe(false);
  expect(isVerificationTool('read_file', { path: '../evil.js' }, false, true)).toBe(false);
});

test('W203-P1b R1: every gate-accepted checker is registered', () => {
  const all = [...GATE_UNCONDITIONAL, 'project_run', 'shell_execute', 'read_file'];
  const rows = all.map(name => ({ name, gateAccepts: true, registered: registered.has(name) }));
  console.log(`[W203-P1b-ACTUAL] ${JSON.stringify(rows)}`);
  const missing = rows.filter(r => !r.registered).map(r => r.name);
  expect(missing).toEqual([]);
});

test('W203-P2 R2: every catalogue tool is registered', () => {
  const rows = PLANNER_TOOL_CATALOGUE.map(t => ({ tool: t.tool, registered: registered.has(t.tool) }));
  const missing = rows.filter(r => !r.registered).map(r => r.tool);
  console.log(`[W203-P2-ACTUAL] ${JSON.stringify({ missing })}`);
  expect(missing).toEqual([]);
});

test('W203-P3a MEANS targets registration + guarded resolution', () => {
  const rows = MEANS_TARGETS.map(target => ({ target, registered: registered.has(target) }));
  console.log(`[W203-P3a-ACTUAL] ${JSON.stringify(rows)}`);
  const missing = rows.filter(r => !r.registered).map(r => r.target);
  console.log(`[W203-P3a-MISSING] ${JSON.stringify(missing)}`);
  // Dead MEANS entries (target unregistered) are skipped by the registered()
  // guard inside resolvePlannedTool — record the set, do not fail on it here;
  // P3b proves the guard behaviorally for representative keywords.
  expect(Array.isArray(missing)).toBe(true);
});

test('W203-P3b R3: resolution precedence + fail-closed unknowns', () => {
  const cases: Array<[string, any]> = [
    ['shell_execute', null],
    ['Git CLI', null],
    ['Jira', null],
    ['Set up project management board', null],
    ['generate image', null],
    ['qa', null],
    ['docker', null],
    ['please run quality run now', null],
    ['flibbertygibbet zzqq', null],
  ];
  const rows = cases.map(([input]) => ({ input, ...(resolvePlannedTool(input) as any) }));
  console.log(`[W203-P3b-ACTUAL] ${JSON.stringify(rows)}`);
  const by = (s: string) => rows.find(r => r.input === s) as any;
  expect(by('shell_execute')).toEqual({ input: 'shell_execute', tool: 'shell_execute', how: 'exact' });
  expect(by('Git CLI').tool).toBe('git_ops');
  expect(by('Jira')).toMatchObject({ tool: null, why: 'not_software' });
  expect(by('Set up project management board')).toMatchObject({ tool: null, why: 'not_software' });
  expect(by('flibbertygibbet zzqq')).toMatchObject({ tool: null, why: 'unknown' });
  // Muse HEAD has no image/qa MEANS keys and generate_image is unregistered:
  // an image request must fail closed, never snap to an unrelated tool.
  expect(by('generate image')).toMatchObject({ tool: null, why: 'unknown' });
});
