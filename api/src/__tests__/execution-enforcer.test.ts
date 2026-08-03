/**
 * THE BOOT GATE, run where it can actually catch us — in the test suite.
 *
 * 2026-08-03 field failure: four build tools carried their own child_process
 * spawn calls. Every wire proof was green (proofs import app.ts), the full
 * Jest suite was green, and the user's Joe REFUSED TO START three times in
 * a row — because only the boot entry (src/api/index.ts) runs the
 * ExecutionEnforcer's integrity scan, and nothing in the sandbox ever
 * booted that entry.
 *
 * This test runs the EXACT scan the boot runs (the same code, not a copy),
 * so a tool that reaches for child_process fails CI here before it ever
 * reaches the user's machine again.
 */
import { ExecutionEnforcer } from '../kernel/ExecutionEnforcer';

describe('the ExecutionEnforcer boot gate', () => {
    it('the runtime source carries ZERO execution-authority violations', () => {
        const violations = ExecutionEnforcer.scanViolations();
        expect(violations).not.toBeNull();          // src/ must exist in dev — a null scan proves nothing
        expect(violations).toEqual([]);
    });
});
