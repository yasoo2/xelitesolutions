/**
 * PROSE VERIFICATION FINAL GATE (negative integration).
 *
 * CRITICAL-REAL-JOE-UI-001 follow-up evidence. The prose contract suite pins
 * that a narrative verificationTask degrades to absent-verification semantics
 * at an intermediate phase gate. This suite pins the FINAL-phase side of that
 * contract for non-React plans, where no frontendFinalCheck exists:
 *
 * 1. the sanitizer never lets raw prose reach a gate: a non-React final phase
 *    with prose is rewritten into an output-existence observation (never
 *    passed through as the :5002 string shape, never silently dropped);
 * 2. that rewritten observation FAILS CLOSED when executed at a final gate
 *    (isFinalPhase): a file-existence read must not masquerade as delivery
 *    proof — status partial, verification_unavailable, no passed receipt, and
 *    the observation tool itself is never executed;
 * 3. even if raw prose bypassed the sanitizer entirely, the AgentLoop final
 *    gate still fails closed: a truthy final verificationTask with no passed
 *    final receipt yields ok:false + finalVerificationMissing, never success.
 *
 * Together these prove a prose final in a non-React plan cannot yield an
 * unsupported success at any layer: sanitizer -> phase gate -> AgentLoop.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

jest.mock('../modules/services/ToolService', () => ({
  executeTool: jest.fn(async (toolName: string) => ({
    ok: true,
    output: { message: `mock executed ${toolName}` },
  })),
}));

// This suite asserts on in-memory final-gate receipts, not the durable run
// ledger. Keep its synthetic fixed-id runs out of the real UI history, where
// they mutate a shared record and look like active work.
jest.mock('../shared/run-evidence-store', () => ({
  createRunEvidence: jest.fn(async () => undefined),
  appendRunEvidenceEvent: jest.fn(async () => undefined),
  saveRunReceipt: jest.fn(async () => undefined),
}));

import { AgentLoopService } from '../modules/services/AgentLoopService';
import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

const baseContext: any = {
  projectName: 'prose-final-gate-probe',
  workspaceId: 'prose-final-gate-workspace',
  sessionId: 'prose-final-gate-session',
  userId: 'prose-final-gate-user',
};

describe('prose verification final gate (non-React)', () => {
  beforeEach(() => {
    mockedExecuteTool.mockClear();
  });

  it('sanitizer rewrites a non-React final prose verification into an observation, never a string pass-through', () => {
    const { phases, notes } = sanitisePlanPhases([{
      phaseNumber: 2,
      name: 'Final Review',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: 'Verify the system is ready for delivery',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const emitted: any = phases[0].verificationTask;
    // The :5002 failure shape (a raw string reaching the gate) must be
    // impossible after sanitization.
    expect(typeof emitted).toBe('object');
    expect(emitted.tool).toBe('read_file');
    expect(emitted.args).toMatchObject({ path: 'app/index.js' });
    // The rewrite preserves the original request plus the substitution, so
    // run evidence keeps requested-vs-observed inspectable.
    expect(phases[0].verificationNote).toMatchObject({
      task: 'Verify the system is ready for delivery',
      downgradedTo: { tool: 'read_file', args: { path: 'app/index.js' } },
    });
    expect(phases[0].verificationNote.downgradedTo.task).toBe(emitted.task);
    expect(notes.join('\n')).toMatch(/بدون عقد أداة/);
  });

  it('sanitizer anchors an output-less non-React final prose verification on its documenting evidence, still as an object', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 2,
      name: 'Final Review',
      tasks: [{ task: 'Check node version', tool: 'shell_execute', args: { command: 'node --version' } }],
      verificationTask: 'Verify the system is ready for delivery',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const emitted: any = phases[0].verificationTask;
    expect(typeof emitted).toBe('object');
    expect(emitted.tool).toBe('read_file');
    // The observation target is the injected documenting evidence file, a
    // real phase output — never the imagined delivery itself.
    expect(String(emitted.args?.path || '')).toMatch(/docs\/02-final_review\.md$/);
  });

  it('rewritten final observation fails closed at the final phase gate: partial, unexecuted, no passed receipt', async () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 2,
      name: 'Final Review',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: 'Verify the system is ready for delivery',
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    const finalContext: any = { ...baseContext, isFinalPhase: true };
    const result: any = await new PhaseExecutorTool().execute({
      phase: phases[0],
      projectContext: finalContext,
    } as any, finalContext);
    expect(result.ok).toBe(false);
    expect(result.output.status).toBe('partial');
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(true);
    // The observation tool itself must never run as final acceptance.
    expect(mockedExecuteTool.mock.calls.map(call => call[0])).not.toContain('read_file');
    const receipts = Array.isArray(result.output?.verificationLedger?.receipts)
      ? result.output.verificationLedger.receipts
      : [];
    expect(receipts.filter((r: any) => r?.result === 'passed')).toHaveLength(0);
    expect(receipts.filter((r: any) => r?.mode === 'final' && r?.result === 'passed')).toHaveLength(0);
  });

  it('raw prose bypassing the sanitizer still fails closed at the AgentLoop final gate', async () => {
    // The phase executor degrades raw prose to absent-verification semantics
    // (completes on tasks, records no receipt). The AgentLoop final gate must
    // then refuse success because the truthy final verification produced no
    // passed final receipt.
    mockedExecuteTool.mockImplementation(async (toolName: string) => {
      if (toolName === 'phase_executor') {
        return {
          ok: true,
          output: {
            status: 'completed', phaseNumber: 1, executedTasks: 1, reusedTasks: 0,
            skippedTasks: 0, totalTasks: 1, results: [],
            verificationLedger: { receipts: [], selections: [] },
          },
          logs: [],
        } as any;
      }
      throw new Error(`unexpected tool: ${toolName}`);
    });
    const result: any = await AgentLoopService.runPlannedPhasesIfPresent({
      sessionId: 'session', runId: 'run', userId: 'user', workspaceId: 'workspace',
      plannerResult: {
        ok: true,
        output: {
          projectName: 'fixture', createsNewProject: false, totalPhases: 1,
          phases: [{
            phaseNumber: 1, name: 'Build', tasks: [{ task: 'work', tool: 'echo' }],
            verificationTask: 'Verify the system is ready for delivery',
          }],
        },
      },
    });
    expect(result).toMatchObject({ ok: false, finalVerificationMissing: true });
    expect(result.finalVerification).toBeUndefined();
    expect(mockedExecuteTool).toHaveBeenCalledTimes(1);
  });
});
