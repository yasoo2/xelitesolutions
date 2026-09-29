/**
 * HONEST PHASE-COMPLETION VOICE.
 *
 * AgentLoop used to announce "Phase n/N completed and verified" for EVERY
 * ok+completed phase result, consulting neither the phase's verificationNote
 * nor the output's verification receipts. A downgraded prose check (requested
 * behavior replaced by a read_file existence observation), a dropped checker,
 * and a phase with zero receipts at all were all announced as "verified"
 * before the final gate could fail closed (CRITICAL-REAL-JOE-UI-001
 * premature-voice probe: announcedVerified=true while
 * finalOk=false/finalVerificationMissing=true).
 *
 * General contract pinned here:
 * - a downgraded check is announced as an output-existence observation that
 *   names the substitution and never claims verification;
 * - any other completion without a newly passed requested check is announced
 *   as tasks done, not verified (dropped checkers, absent verifiers,
 *   reuse-only passes, and zero-receipt completions alike);
 * - "verified" is retained only when the phase carried no downgrade note, the
 *   executor reports its own verification check ran fresh and passed, and
 *   the ledger holds a matching newly passed receipt for that exact
 *   checkId. A newly passed receipt for any other check (task-level or
 *   auto-build) never verifies the requested checker;
 * - the requested-vs-observed provenance survives into the compact receipt.
 */
import {
  carriedVerificationCheckIds,
  compactPhaseReceipt,
  describePhaseCompletion,
  phaseCompletionMessage,
  phaseVerificationProvenance,
} from '../modules/services/AgentLoopService';

const downgradedPhase = () => ({
  phaseNumber: 1,
  name: 'Ledger import',
  verificationTask: {
    task: 'Verify phase output exists: inv/ledger.json',
    tool: 'read_file',
    args: { path: 'inv/ledger.json' },
  },
  verificationNote: {
    task: 'Confirm invoices balance to zero',
    downgradedTo: {
      task: 'Verify phase output exists: inv/ledger.json',
      tool: 'read_file',
      args: { path: 'inv/ledger.json' },
    },
  },
});

const outputWithReceipts = (receipts: any[], check?: any) => ({
  status: 'completed',
  ...(check === undefined ? {} : { phaseVerificationCheck: check }),
  verificationLedger: { receipts, decisions: [], accounting: {} },
});

const ranPassed = (checkId: string, tool: string) => ({ checkId, tool, result: 'passed', execution: 'ran' });

describe('honest phase-completion voice', () => {
  it('names a downgraded check as an observation, never as verified', () => {
    const phase = downgradedPhase();
    const output = outputWithReceipts([
      { checkId: 'read_file:Verify phase output exists: inv/ledger.json', result: 'passed', tool: 'read_file' },
    ]);
    expect(describePhaseCompletion(phase, output, [])).toBe('observed');
    const en = phaseCompletionMessage('observed', 1, 2, false);
    const ar = phaseCompletionMessage('observed', 1, 2, true);
    expect(en).not.toContain('completed and verified');
    expect(en).toMatch(/not verified/);
    expect(ar).not.toContain('وتحقَّقت');
    expect(ar).toMatch(/غير متحقق/);
  });

  it('keeps the requested-vs-observed substitution machine-inspectable', () => {
    const provenance = phaseVerificationProvenance(downgradedPhase());
    expect(provenance).toMatchObject({
      requested: 'Confirm invoices balance to zero',
      observed: 'read_file',
      downgradedTo: 'read_file',
    });
    const receipt = compactPhaseReceipt(
      { phaseNumber: 1, status: 'completed' },
      [],
      'completed',
      { verificationProvenance: provenance },
    );
    expect(receipt.verificationProvenance).toMatchObject({
      requested: 'Confirm invoices balance to zero',
      downgradedTo: 'read_file',
    });
  });

  it('announces a dropped checker as tasks done, not verified', () => {
    const phase = {
      phaseNumber: 2,
      name: 'Queue drain',
      verificationTask: undefined,
      verificationNote: { task: 'Verify the queue drains without errors', tool: 'shell_execute', args: {} },
    };
    const output = outputWithReceipts([]);
    expect(describePhaseCompletion(phase, output, [])).toBe('completed');
    expect(phaseVerificationProvenance(phase)).toMatchObject({
      requested: 'Verify the queue drains without errors',
      observed: 'dropped',
    });
    expect(phaseCompletionMessage('completed', 2, 3, false)).toMatch(/not verified/);
    expect(phaseCompletionMessage('completed', 2, 3, true)).toMatch(/دون تحقق/);
  });

  it('treats a replaced final note conservatively even when a checker passed', () => {
    const phase = {
      phaseNumber: 3,
      name: 'Final sweep',
      verificationTask: { task: 'Run final checks', tool: 'quality_run', args: {} },
      verificationNote: 'Inspect the requested form and run available checks',
    };
    const output = outputWithReceipts([
      { checkId: 'quality_run:Run final checks', result: 'passed', tool: 'quality_run' },
    ]);
    // The executed checker is not the requested prose: no bare "verified".
    expect(describePhaseCompletion(phase, output, [])).toBe('completed');
    expect(phaseVerificationProvenance(phase)).toMatchObject({
      requested: 'Inspect the requested form and run available checks',
    });
  });

  it('retains verified for a requested checker that newly passed (positive control)', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Seeded catalogue',
      verificationTask: { task: 'Verify the catalogue loads', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    const output = outputWithReceipts(
      [
        { checkId: 'shell_execute:Verify the catalogue loads', result: 'passed', tool: 'shell_execute' },
      ],
      ranPassed('shell_execute:Verify the catalogue loads', 'shell_execute'),
    );
    expect(describePhaseCompletion(phase, output, [])).toBe('verified');
    expect(phaseCompletionMessage('verified', 1, 1, false)).toContain('completed and verified');
    expect(phaseCompletionMessage('verified', 1, 1, true)).toContain('وتحقَّقت');
    expect(phaseVerificationProvenance(phase)).toBeNull();
  });

  it('does not claim verified when a completed phase produced zero receipts', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Silent scaffold',
      verificationTask: { task: 'Verify the scaffold builds', tool: 'shell_execute', args: { command: 'npm run build' } },
    };
    expect(describePhaseCompletion(phase, outputWithReceipts([]), [])).toBe('completed');
    expect(describePhaseCompletion(phase, { status: 'completed' }, [])).toBe('completed');
  });

  it('does not promote an auto-observation into verification of an unchecked phase', () => {
    const phase = { phaseNumber: 1, name: 'Untargeted edits' };
    const output = outputWithReceipts([
      { checkId: 'auto-build:/tmp/untargeted', result: 'passed', tool: 'shell_execute' },
    ]);
    expect(describePhaseCompletion(phase, output, [])).toBe('completed');
  });

  it('stays phase-local: a carried pass without new evidence is not new verification', () => {
    const phase = {
      phaseNumber: 2,
      name: 'Second pass',
      verificationTask: { task: 'Verify the catalogue loads', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    const output = outputWithReceipts(
      [
        { checkId: 'shell_execute:Verify the catalogue loads', result: 'passed', tool: 'shell_execute' },
      ],
      { checkId: 'shell_execute:Verify the catalogue loads', tool: 'shell_execute', result: 'passed', execution: 'reused' },
    );
    // Same checkId already passed before this phase ran: nothing newly verified.
    expect(describePhaseCompletion(phase, output, ['shell_execute:Verify the catalogue loads'])).toBe('completed');
  });

  it('never lets an unrelated new pass verify the requested checker', () => {
    const phase = {
      phaseNumber: 2,
      name: 'Second pass',
      verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    // The requested check was reused from an earlier pass while an
    // unrelated task-level observation passed fresh in this phase.
    const output = outputWithReceipts(
      [
        { checkId: 'shell_execute:Run tests', result: 'passed', tool: 'shell_execute' },
        { checkId: 'read_file:unrelated', result: 'passed', tool: 'read_file' },
      ],
      { checkId: 'shell_execute:Run tests', tool: 'shell_execute', result: 'passed', execution: 'reused' },
    );
    expect(describePhaseCompletion(phase, output, ['shell_execute:Run tests'])).toBe('completed');
  });

  it('fails closed when the reported pass has no matching ledger receipt', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Evidence gap',
      verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    // The executor claims a fresh pass but the ledger holds only an
    // unrelated receipt: the claim is unverifiable, never "verified".
    const output = outputWithReceipts(
      [
        { checkId: 'read_file:unrelated', result: 'passed', tool: 'read_file' },
      ],
      ranPassed('shell_execute:Run tests', 'shell_execute'),
    );
    expect(describePhaseCompletion(phase, output, [])).toBe('completed');
  });

  it('fails closed when the executor reports nothing (reused or predated outputs)', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Reused phase',
      verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    // A fresh-looking receipt with no executor attribution cannot be tied
    // to this phase's requested check: fully reused phases and outputs
    // that predate the report stay at tasks-done wording.
    const output = outputWithReceipts([
      { checkId: 'shell_execute:Run tests', result: 'passed', tool: 'shell_execute' },
    ]);
    expect(describePhaseCompletion(phase, output, [])).toBe('completed');
  });

  it('binds to an explicit verificationId instead of guessing tool and description', () => {
    const phase = {
      phaseNumber: 1,
      name: 'CLI smoke',
      verificationTask: { task: 'Run tests', tool: 'shell_execute', verificationId: 'cli-smoke', args: {} },
    };
    const matching = outputWithReceipts(
      [
        { checkId: 'cli-smoke', result: 'passed', tool: 'shell_execute' },
      ],
      ranPassed('cli-smoke', 'shell_execute'),
    );
    expect(describePhaseCompletion(phase, matching, [])).toBe('verified');
    const mismatched = outputWithReceipts(
      [
        { checkId: 'shell_execute:Run tests', result: 'passed', tool: 'shell_execute' },
      ],
      ranPassed('cli-smoke', 'shell_execute'),
    );
    expect(describePhaseCompletion(phase, mismatched, [])).toBe('completed');
  });

  it('lets a self-fix rerun verify after a carried failure (rerun control)', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Repaired import',
      verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
    };
    // The pre-rerun ledger holds the requested check as failed, not passed.
    const carried = carriedVerificationCheckIds({
      receipts: [{ checkId: 'shell_execute:Run tests', result: 'failed', tool: 'shell_execute' }],
    });
    expect([...carried]).toEqual([]);
    const output = outputWithReceipts(
      [
        { checkId: 'shell_execute:Run tests', result: 'passed', tool: 'shell_execute' },
      ],
      ranPassed('shell_execute:Run tests', 'shell_execute'),
    );
    expect(describePhaseCompletion(phase, output, carried)).toBe('verified');
  });

  it('generalizes beyond one substitution shape', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Paraphrased probe',
      verificationTask: { task: 'Observe runner output', tool: 'shell_execute', args: { command: 'true' } },
      verificationNote: {
        task: 'Check that nightly exports reconcile',
        downgradedTo: { task: 'Observe runner output', tool: 'shell_execute', args: { command: 'true' } },
      },
    };
    expect(describePhaseCompletion(phase, outputWithReceipts([]), [])).toBe('observed');
    expect(phaseVerificationProvenance(phase)).toMatchObject({
      requested: 'Check that nightly exports reconcile',
      observed: 'shell_execute',
      downgradedTo: 'shell_execute',
    });
  });
});
