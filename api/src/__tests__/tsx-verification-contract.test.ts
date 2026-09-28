/**
 * TSX IS A FIRST-CLASS TEST-RUNNER CONTRACT.
 *
 * EVAL-003 (novel broken system) verifies its red-green fix with
 * `tsx --test test/priority-bug.test.ts`: tsx is node's TypeScript test
 * runner and emits the same report semantics as `node --test`. The phase
 * gate rejected it as an unsupported verification tool contract, killing a
 * phase whose tasks had all succeeded (fix applied, tests green) -- the same
 * pipeline-killing class as the run-4b smoke death, and unrepairable by
 * self-fix (a contract rejection names no evidence-bound file).
 *
 * The shared checker predicate now accepts `tsx --test` exactly like
 * `node --test` (bare and npx forms), so the sanitizer and the gate agree
 * and task-level ledger selection covers it. Bare `tsx <file>` stays
 * rejected: without --test it is as ambiguous as bare `node <file>`.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { isVerificationTool } from '../core/quality/verification-ledger';

describe('tsx test-runner verification contract', () => {
    const gateAccepts = (command: string) =>
        isVerificationTool('shell_execute', { command }, false, true, true);
    const taskSelects = (command: string) =>
        isVerificationTool('shell_execute', { command }, false);

    it('accepts tsx --test like node --test, bare and via npx', () => {
        expect(gateAccepts('node --test test/a.test.js')).toBe(true);
        expect(gateAccepts('tsx --test test/priority-bug.test.ts')).toBe(true);
        expect(gateAccepts('npx tsx --test test/priority-bug.test.ts')).toBe(true);
        expect(gateAccepts('tsx --test test/a.test.ts --test-reporter=tap')).toBe(true);
        // Task-level ledger selection uses the same predicate without the
        // gate-only opt-ins, so mid-phase tsx steps are checkpoints too.
        expect(taskSelects('tsx --test test/priority-bug.test.ts')).toBe(true);
        expect(taskSelects('npx tsx --test test/priority-bug.test.ts')).toBe(true);
    });

    it('rejects bare tsx execution and banned flags like node', () => {
        expect(gateAccepts('tsx test/a.test.ts')).toBe(false);
        expect(gateAccepts('npx tsx test/a.test.ts')).toBe(false);
        expect(gateAccepts('tsx --eval console.log(1)')).toBe(false);
        // Discovery form (no path) is legitimate, like node --test.
        expect(gateAccepts('tsx --test')).toBe(true);
    });

    it('documents the glob boundary: globs stay expansion-free rejections', () => {
        // The gate deliberately accepts only expansion-free invocations, so a
        // glob verification cannot pass the static contract today. In real
        // plans the sanitizer rewrites such checks into intermediate
        // observations instead of letting them die at the gate; only
        // sanitizer-bypassing mock plans observe the raw rejection.
        expect(gateAccepts('tsx --test test/**/*.test.ts')).toBe(false);
        expect(gateAccepts('node --test test/**/*.test.js')).toBe(false);
    });

    it('sanitizer preserves a grounded tsx --test verification for the gate', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 2,
            name: 'Diagnose and fix',
            tasks: [
                { task: 'Write a reproducing test', tool: 'write_file', args: { path: 'test/red.test.ts', content: '// t' } },
                { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts' } },
            ],
            verificationTask: {
                task: 'Bug fix tests pass',
                tool: 'shell_execute',
                verificationId: 'eval3:bug-fix-tests',
                verificationMode: 'focused',
                args: { command: 'tsx --test test/red.test.ts' },
            },
        }], 'queue-app', { mode: 'existing', candidateCheckCommands: [], evidencedPaths: ['queue-app/test/red.test.ts'] });
        expect(phases[0].verificationTask.tool).toBe('shell_execute');
        expect(String((phases[0].verificationTask.args as any).command)).toBe('tsx --test test/red.test.ts');
        expect(gateAccepts(String((phases[0].verificationTask.args as any).command))).toBe(true);
    });
});
