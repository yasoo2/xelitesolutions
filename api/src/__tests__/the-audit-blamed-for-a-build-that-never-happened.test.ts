/**
 * «the audit never ran» — WHEN THE THING THAT NEVER RAN WAS THE BUILD.
 *
 * Seen on the owner's screen at the end of a 44-step run, from the shop
 * request that ends «شغّل البناء الحقيقي وافتح المعاينة الحية»:
 *
 *     Failed phase: Interface on the service
 *     Error: required_visual_audit_not_completed: the audit never ran
 *     Self-fix attempt: General phase failure has no evidence-bound repair file.
 *
 * Bisected in the source, not guessed. `ReactProjectTool.run` enters the
 * self-QA block only under `if (built && !input?.skipAudit)`, no production
 * caller passes `skipAudit`, and `auditBuiltApp` never resolves to null — every
 * one of its early exits returns an object carrying `skipped`. So `audit`
 * arrives null at the delivery decision on exactly one condition:
 *
 *     built === false
 *
 * — the bundle was never produced. And the cause of THAT was already
 * diagnosed and written down in his own language, in `buildDiagnosis`:
 * «البناء ينقصه: recharts»، «البناء نفدت ذاكرته»، «الأمر تجاوز المهلة». That
 * value reaches the message body and never reaches `error`, and the phase
 * executor upstream reads `error`. So a compiler failure was reported to him
 * as a browser failure, and the sentence he was shown named the one subsystem
 * that was never at fault.
 *
 * THE CLASS: A FAILURE REPORTED BY THE GUARD THAT NOTICED IT INSTEAD OF THE
 * LAYER THAT CAUSED IT. It is the same family as the two defects already
 * closed in this file's neighbour — mechanism instead of cause — one layer
 * further out, and worse, because the earlier two named the right subsystem
 * and only withheld its reason. This one names the wrong subsystem entirely.
 *
 * The negative case matters as much as the positive one: an audit that truly
 * failed to run on a build that truly succeeded must STILL be reported as an
 * audit failure. A fix that blames the build for everything would close this
 * defect by opening its mirror image.
 */

import { deliveryErrorForVisualAudit } from '../modules/tools/definitions/ReactProjectTool';

describe('a blocked delivery blames the layer that failed', () => {
    it('POSITIVE — a build that produced no bundle is not an audit failure', () => {
        const said = deliveryErrorForVisualAudit(null, {
            attempted: true,
            built: false,
            installed: true,
            buildExit: 1,
            diagnosis: { id: 'missing_package', ar: 'البناء ينقصه: recharts — أنزّلها ثم أكمل.' },
        });
        expect(said).not.toContain('audit');
        expect(said.startsWith('build_produced_no_bundle')).toBe(true);
        // The cause that was already written down reaches the reader.
        expect(said).toContain('recharts');
        expect(said).toContain('missing_package');
    });

    it('POSITIVE — an install that never finished says so, and says it ran out of time', () => {
        const said = deliveryErrorForVisualAudit(null, {
            attempted: true, built: false, installed: false, installExit: -2,
        });
        expect(said.startsWith('build_produced_no_bundle')).toBe(true);
        expect(said).toContain('npm install');
        expect(said).toContain('ran out of time');
    });

    it('POSITIVE — npm missing from the machine is named as such, not as an audit', () => {
        const said = deliveryErrorForVisualAudit(null, {
            attempted: true, built: false, installed: false, npmMissing: true,
        });
        expect(said).toContain('npm is not on this machine');
        expect(said).not.toContain('audit');
    });

    it('POSITIVE — with no diagnosis at all it still names the build and its exit code', () => {
        const said = deliveryErrorForVisualAudit(null, {
            attempted: true, built: false, installed: true, buildExit: 7,
        });
        expect(said.startsWith('build_produced_no_bundle')).toBe(true);
        expect(said).toContain('exit 7');
    });

    it('NEGATIVE — an audit that never ran on a SUCCESSFUL build is still an audit failure', () => {
        expect(deliveryErrorForVisualAudit(null, { attempted: true, built: true }))
            .toBe('required_visual_audit_not_completed: the audit never ran');
    });

    it('NEGATIVE — a skipped audit keeps its own reason verbatim even when the build failed', () => {
        // `skipped` is proof the audit RAN and stopped for a stated reason, so
        // the audit remains the honest thing to report.
        expect(deliveryErrorForVisualAudit({ skipped: 'disabled (JOE_VISUAL_AUDIT=0)' }, {
            attempted: true, built: false, installed: true, buildExit: 1,
        })).toBe('required_visual_audit_not_completed: disabled (JOE_VISUAL_AUDIT=0)');
    });

    it('NEGATIVE — a build that was never attempted (offline request) is not blamed', () => {
        // «لا تستخدم الشبكة» scaffolds without installing. Nothing failed, so
        // nothing may be reported as having failed.
        expect(deliveryErrorForVisualAudit(null, { attempted: false, built: false }))
            .toBe('required_visual_audit_not_completed: the audit never ran');
    });

    it('NEGATIVE — the old single-argument contract is unchanged', () => {
        expect(deliveryErrorForVisualAudit(null))
            .toBe('required_visual_audit_not_completed: the audit never ran');
        expect(deliveryErrorForVisualAudit({ skipped: 'playwright unavailable: Cannot find module' }))
            .toBe('required_visual_audit_not_completed: playwright unavailable: Cannot find module');
    });
});
