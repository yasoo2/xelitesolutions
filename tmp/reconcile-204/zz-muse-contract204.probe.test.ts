/**
 * MUSE-LINE VERIFICATION-CONTRACT RECONCILIATION MATRIX (cycle 204, 2026-10-03).
 *
 * Purpose: pin Muse-HEAD (muse/joe-development) exact behavior for the
 * verification-contract shapes that the Main/Muse reconciliation must compose.
 * NVIDIA's Gap-A/B line (main 02a37c9b) and Muse's line (2958a7ec+eae0eb2e)
 * evolved separately; this probe documents the Muse line so the future
 * composed commit can reconcile deliberately instead of by accident.
 *
 * PREDICTIONS (recorded BEFORE running; source basis cited):
 * - M1 structured read_file, no note, checker mocked ok -> ok=true, completed,
 *   >=1 passed receipt. Basis: committed narrow-existence test already proves
 *   the substituted observation passes the gate through this same mock; the
 *   Muse gate has no note discriminator (zero 'verificationNote' hits in
 *   PhaseExecutorTool.ts), so a direct structured read_file must behave the
 *   same. (Muse-line positive control; mirrors NVIDIA F2 gap.)
 * - M2 structured read_file + verificationNote object -> ok=true, completed.
 *   Basis: executor never reads phase.verificationNote (grep: 0 hits), so the
 *   note is ignored. PREDICTED DIVERGENCE vs NVIDIA-02a, whose wasOriginallyProse
 *   (= note non-empty) would force partial + ok=false here.
 * - M3 unknown_tool object verifier -> ok=false, partial, error contains
 *   'verification_unavailable'. Basis: PhaseExecutorTool.ts:2356-2370 (gate
 *   rejects, verificationFailed=true, status=partial) + :2590-2591 (partial
 *   with verificationFailed -> ok=false). PREDICTED AGREEMENT with NVIDIA F5
 *   layer-(b) rejection shape.
 * - M4 sanitizer preserves a planner-supplied verificationNote on an accepted
 *   structured checker. Basis: plan-tools.ts:862 reads phase.verificationNote
 *   and the accept branch (:1010-1033) never overwrites it. PREDICTED
 *   DIVERGENCE vs NVIDIA :1017 (overwrite; note <=> prose-origin invariant
 *   does NOT hold on Muse line).
 * - M5 sanitizer rewrites a structured read_file of an UNPROVEN path (not
 *   phase-produced) into an observation of real phase output + note object
 *   with downgradedTo. Basis: readsUnprovenPhaseOutput branch (:915-917 ->
 *   :965-990). Reconciliation-relevant: Muse line refuses to let a checker
 *   observe files the phase did not produce.
 *
 * Method: exact-byte jest probe on Muse HEAD bytes, mocked executeTool (same
 * mock as the committed prose suite). No tool executed, no network.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

jest.mock('../modules/services/ToolService', () => {
  // Mock-fidelity note: the committed prose suite mocks executeTool only,
  // which leaves TOOL_ALIASES undefined. Registered names resolve before the
  // alias leg, so that mock is sufficient there — but ANY unregistered name
  // (M3) crashes at plan-tools.ts:234 on the undefined map. Preserve the REAL
  // alias map so unknown-name behavior is probed faithfully.
  const actual = jest.requireActual('../modules/services/ToolService');
  return {
    executeTool: jest.fn(async (toolName: string) => ({
      ok: true,
      output: { message: `mock executed ${toolName}` },
    })),
    TOOL_ALIASES: (actual as any).TOOL_ALIASES,
  };
});

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const projectContext: any = {
  projectName: 'contract-reconcile-probe',
  workspaceId: 'contract-reconcile-workspace',
  sessionId: 'contract-reconcile-session',
  userId: 'contract-reconcile-user',
};

const runPhase = (tasks: any[], verificationTask?: any, extraPhase?: any) =>
  new PhaseExecutorTool().execute({
    phase: {
      phaseNumber: 1,
      name: 'Reconcile probe',
      tasks,
      ...(verificationTask !== undefined ? { verificationTask } : {}),
      ...(extraPhase || {}),
    },
    projectContext,
  } as any, projectContext);

const echoTask = { task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } };

const passedReceipts = (result: any) => {
  const receipts = Array.isArray(result.output?.verificationLedger?.receipts)
    ? result.output.verificationLedger.receipts
    : [];
  return receipts.filter((r: any) => r?.result === 'passed');
};

describe('muse-line contract reconciliation matrix', () => {
  it('M1: structured read_file without note completes with a passed receipt', async () => {
    const result: any = await runPhase([echoTask], {
      task: 'Verify output file exists',
      tool: 'read_file',
      args: { path: 'app/index.js' },
    });
    // eslint-disable-next-line no-console
    console.log(`[M204-M1-ACTUAL] ok=${result.ok} status=${result.output?.status} passedReceipts=${passedReceipts(result).length}`);
    expect(result.ok).toBe(true);
    expect(result.output?.status).toBe('completed');
    expect(passedReceipts(result).length).toBeGreaterThanOrEqual(1);
  });

  it('M2: structured read_file WITH a verificationNote still completes (note ignored)', async () => {
    const result: any = await runPhase(
      [echoTask],
      { task: 'Verify output file exists', tool: 'read_file', args: { path: 'app/index.js' } },
      { verificationNote: { task: 'prose-shaped note', tool: 'read_file', args: { path: 'app/index.js' } } },
    );
    // eslint-disable-next-line no-console
    console.log(`[M204-M2-ACTUAL] ok=${result.ok} status=${result.output?.status} passedReceipts=${passedReceipts(result).length}`);
    expect(result.ok).toBe(true);
    expect(result.output?.status).toBe('completed');
    expect(result.logs.some((line: string) => line.includes('verification_unavailable'))).toBe(false);
  });

  it('M3: unknown_tool object verifier fails closed with verification_unavailable', async () => {
    const result: any = await runPhase([echoTask], {
      task: 'Inspect output',
      tool: 'unknown_tool',
      args: {},
    });
    // eslint-disable-next-line no-console
    console.log(`[M204-M3-ACTUAL] ok=${result.ok} status=${result.output?.status} error=${String(result.error || '').slice(0, 80)}`);
    expect(result.ok).toBe(false);
    expect(result.output?.status).toBe('partial');
    expect(String(result.error || '')).toContain('verification_unavailable');
  });

  it('M4: sanitizer preserves a planner-supplied note on an accepted structured checker', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: { task: 'Verify output file exists', tool: 'read_file', args: { path: 'app/index.js' } },
      verificationNote: 'planner-note-x',
    } as any], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    // eslint-disable-next-line no-console
    console.log(`[M204-M4-ACTUAL] tool=${phases[0].verificationTask?.tool} note=${JSON.stringify((phases[0] as any).verificationNote)}`);
    expect(phases[0].verificationTask?.tool).toBe('read_file');
    expect((phases[0] as any).verificationNote).toBe('planner-note-x');
  });

  it('M5: sanitizer rewrites a structured read of an unproven path to real phase output', () => {
    const { phases } = sanitisePlanPhases([{
      phaseNumber: 1,
      name: 'Build',
      tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
      verificationTask: { task: 'Verify architecture doc', tool: 'read_file', args: { path: 'docs/architecture.md' } },
    }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
    // eslint-disable-next-line no-console
    console.log(`[M204-M5-ACTUAL] tool=${phases[0].verificationTask?.tool} path=${phases[0].verificationTask?.args?.path} noteTask=${JSON.stringify((phases[0] as any).verificationNote?.task)} hasDowngrade=${Boolean((phases[0] as any).verificationNote?.downgradedTo)}`);
    expect(phases[0].verificationTask?.tool).toBe('read_file');
    expect(phases[0].verificationTask?.args?.path).toBe('app/index.js');
    expect((phases[0] as any).verificationNote?.task).toBe('Verify architecture doc');
    expect((phases[0] as any).verificationNote?.downgradedTo?.tool).toBe('read_file');
  });
});
