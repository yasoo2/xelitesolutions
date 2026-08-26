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

import { deliveryErrorForVisualAudit } from '../modules/tools/definitions/ReactProjectTool';

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
