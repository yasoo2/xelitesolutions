/**
 * «Error: required_visual_audit_not_completed» — AND NOTHING ELSE.
 *
 * Seen on the owner's screen at the end of a 42-step build, from a request
 * that ended «شغّل البناء الحقيقي وافتح المعاينة الحية»:
 *
 *     Failed phase: Interface on the service
 *     Error: required_visual_audit_not_completed
 *     Self-fix attempt: General phase failure has no evidence-bound repair file.
 *
 * The block itself is right and must stay: he asked Joe to open the live
 * preview, so browser evidence is part of what he asked for, and a build that
 * cannot produce it has not done the job. What is wrong is that the message
 * names the MECHANISM and not the CAUSE.
 *
 * The cause was recorded. `auditBuiltApp` returns `skipped` with its reason in
 * words — «playwright unavailable: …», «disabled (JOE_VISUAL_AUDIT=0)», a
 * launch that threw — and the delivery threw the string away. Measured on his
 * machine at the time: Playwright resolved and its Chromium existed on disk,
 * so the real reason was neither of the two anyone would guess, and there was
 * no way to know it from what he was shown.
 *
 * The class is this session's most common one: A REPORT THAT DESCRIBES THE
 * MECHANISM INSTEAD OF THE FINDING. The cure is never a longer message — it is
 * carrying the evidence that already exists to the place where it is read.
 */

import { deliveryErrorForVisualAudit, deliveryErrorForAcceptance } from '../modules/tools/definitions/ReactProjectTool';

describe('a blocked delivery says what blocked it', () => {
    it('carries the audit reason verbatim', () => {
        expect(deliveryErrorForVisualAudit({ skipped: 'playwright unavailable: Cannot find module' }))
            .toBe('required_visual_audit_not_completed: playwright unavailable: Cannot find module');
    });

    it('and says so when the audit was switched off deliberately', () => {
        expect(deliveryErrorForVisualAudit({ skipped: 'disabled (JOE_VISUAL_AUDIT=0)' }))
            .toContain('disabled (JOE_VISUAL_AUDIT=0)');
    });

    it('distinguishes «it never ran» from «it ran and said nothing»', () => {
        //  Two different failures that used to print one identical line. The
        //  first is an audit that was never reached; the second is one that
        //  returned without a verdict — a different bug, in a different place.
        expect(deliveryErrorForVisualAudit(null)).toContain('never ran');
        expect(deliveryErrorForVisualAudit({})).toContain('produced no result');
        expect(deliveryErrorForVisualAudit(null)).not.toBe(deliveryErrorForVisualAudit({}));
    });

    it('always keeps the machine-readable id at the front', () => {
        //  The id is what other layers match on. A reason appended after a
        //  colon is readable by a person and still parses for a program;
        //  replacing the id would break every caller that tests for it.
        for (const audit of [null, {}, { skipped: 'anything at all' }]) {
            expect(deliveryErrorForVisualAudit(audit).startsWith('required_visual_audit_not_completed')).toBe(true);
        }
    });
});

describe('and an unmet ledger says which criteria', () => {
    const met = (id: string) => ({ id, verdict: 'met' });
    const unmet = (id: string) => ({ id, verdict: 'unmet' });

    it('names them, in order, after the id', () => {
        expect(deliveryErrorForAcceptance([met('search'), unmet('page:page-b'), unmet('rule:1')]))
            .toBe('acceptance_criteria_unmet: page:page-b, rule:1');
    });

    it('an «unprovable» criterion is not an unmet one', () => {
        //  The ledger's third verdict exists so a condition Joe cannot check
        //  is declared rather than dropped. Counting it as unmet would block
        //  a delivery for something nobody claimed had failed.
        expect(deliveryErrorForAcceptance([{ id: 'rule:2', verdict: 'unprovable' }, met('rtl')]))
            .toBe('acceptance_criteria_unmet');
    });

    it('a long ledger is capped, and says how many it left out', () => {
        //  A number that lies about what it omitted is worse than a long line.
        const many = Array.from({ length: 9 }, (_v, i) => unmet('column:c' + i));
        const line = deliveryErrorForAcceptance(many, 3);
        expect(line).toContain('column:c0, column:c1, column:c2');
        expect(line).toContain('(+6 more)');
        expect(line).not.toContain('column:c5');
    });

    it('and the id alone survives when nothing is unmet', () => {
        //  The negative case: the caller only reaches this line when the
        //  ledger is blocked, but a bare id must never become «: undefined».
        expect(deliveryErrorForAcceptance([])).toBe('acceptance_criteria_unmet');
        expect(deliveryErrorForAcceptance(null as any)).toBe('acceptance_criteria_unmet');
    });
});
