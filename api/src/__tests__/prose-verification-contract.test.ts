/**
 * PROSE VERIFICATION CONTRACT.
 *
 * The planner's own compact and recovery schemas teach `verificationTask` as
 * a short narrative note ("Run the truthful test command ...", "short
 * verification note"), so a plain-string (or tool-less) verification is
 * legitimate planner output — not a planning failure. The sanitizer used to
 * pass such prose through unchanged (`v && v.tool`), and the phase gate then
 * rejected the empty tool with verification_unavailable AFTER all phase tasks
 * had succeeded (CRITICAL-REAL-JOE-UI-001 :5002 run-1790611029070: the string
 * "Verify the technical stack is correctly implemented" killed a 2/2 phase).
 *
 * General contract, pinned here for both layers:
 * - the sanitizer rewrites tool-less prose into an output-existence
 *   observation of a real phase output when one exists, otherwise drops it.
 *   In both cases the original request is preserved in verificationNote (a
 *   rewrite additionally records the substitution as downgradedTo), so run
 *   evidence keeps requested-vs-observed inspectable. It never emits a
 *   contract the gate must reject;
 * - the phase gate degrades a non-object verification to
 *   absent-verification semantics (phase completes on its tasks) instead of
 *   recording verification_unavailable, while still honestly rejecting
 *   object-shaped non-checker contracts;
 * - degraded prose receives the SAME no-verifier auto-build observation as a
 *   genuinely absent verifier (never less scrutiny than absence). Raw prose
 *   reaching the gate yields no passed receipt; a sanitized non-final prose
 *   rewrite yields a narrowly-described existence receipt for the substituted
 *   observation only — never a PASS of the original behavior claim. Rewritten
 *   finals fail closed (pinned in prose-verification-final-gate.test.ts).
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { isVerificationTool } from '../core/quality/verification-ledger';

jest.mock('../modules/services/ToolService', () => ({
  executeTool: jest.fn(async (toolName: string) => ({
    ok: true,
    output: { message: `mock executed ${toolName}` },
  })),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const phaseGateAccepts = (tool: string, args: Record<string, unknown>) =>
  isVerificationTool(tool, args, false, true, true);

const projectContext: any = {
  projectName: 'prose-verification-probe',
  workspaceId: 'prose-verification-workspace',
  sessionId: 'prose-verification-session',
  userId: 'prose-verification-user',
};

const runPhase = (tasks: any[], verificationTask?: any) => new PhaseExecutorTool().execute({
  phase: {
    phaseNumber: 1,
    name: 'Prose probe',
    tasks,
    ...(verificationTask !== undefined ? { verificationTask } : {}),
  },
  projectContext,
} as any, projectContext);

describe('prose verification contract', () => {
  it('sanitizer rewrites a narrative verification into an output observation when the phase produced files', () => {
    const { phases, notes } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Technical Stack Decision',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: 'Verify the technical stack is correctly implemented',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    expect(phases[0].verificationTask.tool).toBe('read_file');
    expect(phases[0].verificationTask.task).toMatch(/^Verify phase output exists: /);
    expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    expect(notes.join('\n')).toMatch(/بدون عقد أداة/);
  });

  it('sanitizer rewrites a differently-worded narrative (not the observed string)', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Seed data',
      tasks: [{ task: 'Write seeds', tool: 'write_file', args: { path: 'db/seeds.json', content: '{}' } }],
      verificationTask: 'Confirm the seed rows load and every requested column renders',
    }], 'shop', { mode: 'greenfield', candidateCheckCommands: [] });
    expect(phases[0].verificationTask.tool).toBe('read_file');
    expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
  });

  it('sanitizer rewrites a narrative verification for an inspection-only phase into its documenting observation', () => {
    // Inspection-only phases get an injected documenting write_file task,
    // which anchors a real existence observation for the narrative.
    const { phases, notes } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Architecture Discovery',
      tasks: [{ task: 'List files', tool: 'shell_execute', args: { command: 'find . -type f' } }],
      verificationTask: 'Verify the technical stack is correctly implemented',
    }], 'calc', { mode: 'existing', candidateCheckCommands: [] });
    expect(phases[0].verificationTask.tool).toBe('read_file');
    expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    expect(notes.join('\n')).toMatch(/بدون عقد أداة/);
  });

  it('sanitizer rewrites a narrative verification for an edit-only phase into an observation of the edited file', () => {
    // Edits count as phase outputs, so the narrative observes the edited
    // file instead of dying at the gate.
    const { phases, notes } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Fix calculation',
      tasks: [{ task: 'Fix the total', tool: 'file_edit', args: { filename: 'shop/cart.js', find: 'total = a', replace: 'total = b' } }],
      verificationTask: 'Verify the total is computed correctly',
    }], 'shop', { mode: 'existing', candidateCheckCommands: [], evidencedPaths: ['shop/cart.js'] });
    expect(phases[0].verificationTask.tool).toBe('read_file');
    expect(phases[0].verificationTask.args).toMatchObject({ path: 'shop/cart.js' });
    expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    expect(notes.join('\n')).toMatch(/بدون عقد أداة/);
  });

  it('sanitizer handles a tool-less verification object like narrative prose', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: { task: 'Verify the build output' },
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const emitted = phases[0].verificationTask;
    expect(emitted === undefined || phaseGateAccepts(emitted.tool, emitted.args || {})).toBe(true);
    if (emitted !== undefined) expect(emitted.tool).toBe('read_file');
  });

  it('sanitizer normalises an empty verification to undefined instead of passing it through', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: '',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    expect(phases[0].verificationTask).toBeUndefined();
  });

  it('phase gate completes on tasks when the verification is prose, without verification_unavailable', async () => {
    const result: any = await runPhase(
      [{ task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } }],
      'Verify the technical stack is correctly implemented',
    );
    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('completed');
    expect(result.output.completedTasks).toBe(1);
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(false);
    expect(result.output.results).toHaveLength(1);
  });

  it('phase gate honestly rejects a verification object that names no tool', async () => {
    // Layered contract: an object claims contract-hood and faces the strict
    // gate (the sanitizer normalises tool-less objects in the pipeline, so a
    // raw one here is malformed input). Only non-object prose — specified
    // planner output the prompts teach — degrades to absent-verification
    // semantics at the gate.
    const result: any = await runPhase(
      [{ task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } }],
      { task: 'Verify the build output' },
    );
    expect(result.output.status).toBe('partial');
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(true);
  });

  it('phase gate still honestly rejects an object-shaped non-checker contract', async () => {
    const result: any = await runPhase(
      [{ task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } }],
      { task: 'Inspect output', tool: 'project_detect', args: {} },
    );
    expect(result.output.status).toBe('partial');
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(true);
  });

  it('phase gate gives prose the same auto-build observation as an absent verifier (package.json written)', async () => {
    // Parity: a code-writing phase with NO verifier gets an honest
    // auto-build observation. Prose degrades to absent-verification
    // semantics, so it must receive that same observation — never less
    // scrutiny than absence.
    const result: any = await runPhase(
      [{ task: 'Write manifest', tool: 'write_file', args: { path: 'myapp/package.json', content: '{}' } }],
      'Verify the build output is correct',
    );
    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('completed');
    expect(result.logs.some((line: string) => line.includes('Auto-running build check'))).toBe(true);
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(false);
  });

  it('phase gate honestly skips the auto-build check for prose when no package.json was written', async () => {
    const result: any = await runPhase(
      [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      'Verify the technical stack is correctly implemented',
    );
    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('completed');
    expect(result.logs.some((line: string) => line.includes('Auto-build check skipped honestly'))).toBe(true);
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(false);
  });

  it('prose verification records no passed verification receipt', async () => {
    // Negative, scoped to RAW prose reaching the gate (sanitizer bypassed):
    // prose must never yield a verification PASS claim. The phase completes
    // on its tasks, but the ledger must hold no passed receipt.
    const result: any = await runPhase(
      [{ task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } }],
      'Verify the technical stack is correctly implemented',
    );
    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('completed');
    const receipts = Array.isArray(result.output?.verificationLedger?.receipts)
      ? result.output.verificationLedger.receipts
      : [];
    expect(receipts.filter((r: any) => r?.result === 'passed')).toHaveLength(0);
  });

  it('sanitizer preserves the original request as a downgrade note when rewriting prose into an observation', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = false;' } }],
      verificationTask: 'Verify the exported function returns true',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    expect(phases[0].verificationTask).toMatchObject({ tool: 'read_file', args: { path: 'app/index.js' } });
    expect(phases[0].verificationNote).toMatchObject({
      task: 'Verify the exported function returns true',
      downgradedTo: { tool: 'read_file', args: { path: 'app/index.js' } },
    });
    expect(phases[0].verificationNote.downgradedTo.task).toBe(phases[0].verificationTask.task);
  });

  it('sanitized prose yields a narrow existence receipt with the downgrade preserved, never a behavior PASS', async () => {
    // Negative integration: the behavior is deliberately wrong
    // (module.exports = false vs "returns true"). The substituted existence
    // observation may pass, but its receipt must describe only existence,
    // and the downgrade must stay inspectable on the executed phase.
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = false;' } }],
      verificationTask: 'Verify the exported function returns true',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const result: any = await new PhaseExecutorTool().execute({
      phase: phases[0],
      projectContext,
    } as any, projectContext);
    const receipts = Array.isArray(result.output?.verificationLedger?.receipts)
      ? result.output.verificationLedger.receipts
      : [];
    const passed = receipts.filter((r: any) => r?.result === 'passed');
    expect(passed).toHaveLength(1);
    // The receipt describes the substituted existence check — never the
    // original behavior claim.
    expect(passed[0].checkId).toBe('read_file:Verify phase output exists: app/index.js');
    expect(JSON.stringify(passed[0])).not.toContain('returns true');
    // The downgrade stays machine-inspectable on the phase that ran.
    expect(phases[0].verificationNote).toMatchObject({
      task: 'Verify the exported function returns true',
      downgradedTo: { tool: 'read_file', args: { path: 'app/index.js' } },
    });
  });
});
