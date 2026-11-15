/**
 * ⛔ A UI FINDING IS TOLD, NEVER REFUSED (design 2026-11-15 ui-inspection-revival-v3 §2).
 *
 * Two rounds of design showed that refusing a delivery on visual judgement
 * keeps meeting pages it gets wrong (v2: right on 13 of 30 unseen pages). So
 * every finding the inspector (ui-inspection.ts) writes is told — to the owner
 * with the delivery and to the builder as advice — at every severity. The one
 * exception is `no_viewport_meta`: a DOM fact the mender answers. Nothing else
 * about what refuses changes.
 */
import { INSPECTOR_TOLD, refuses, mendable, mendIsBetter, whyMendNotBetter } from '../core/engine/browser-mend';

describe('the inspector tells; it does not refuse', () => {
    const ids = [
        'low_contrast', 'mobile_overflow', 'content_unreachable', 'text_clipped', 'mobile_tap_targets',
        'mobile_small_text', 'mobile_header_fragmented', 'generic_image_composition', 'viewport_emulation_failed',
        'a11y_no_main', 'a11y_duplicate_ids', 'a11y_positive_tabindex', 'a11y_aria_hidden_focusable',
        'a11y_heading_skip', 'a11y_images_without_alt', 'a11y_inputs_without_labels', 'a11y_placeholder_as_label',
    ];

    it('⛔ POSITIVE — the told set is exactly the inspector\'s findings', () => {
        expect([...INSPECTOR_TOLD].sort()).toEqual([...ids].sort());
    });

    it.each(ids)('⛔ POSITIVE — %s refuses nothing at high, medium or low', id => {
        for (const severity of ['high', 'medium', 'low']) expect({ id, severity, refuses: refuses({ id, severity }) }).toEqual({ id, severity, refuses: false });
    });

    it('⛔ NEGATIVE — a page that cannot adapt to a phone still refuses', () => {
        expect(INSPECTOR_TOLD.has('no_viewport_meta')).toBe(false);
        expect(refuses({ id: 'no_viewport_meta', severity: 'high' })).toBe(true);
    });

    it('⛔ NEGATIVE — what refused before still refuses', () => {
        expect(refuses({ id: 'dead_controls', severity: 'medium' })).toBe(true);
        expect(refuses({ id: 'qa_infrastructure', severity: 'high' })).toBe(true);
        expect(refuses({ id: 'small_targets', severity: 'medium' })).toBe(true);
        //  …and a minor finding of taste is still told, as before.
        expect(refuses({ id: 'flat_hierarchy', severity: 'low' })).toBe(false);
        expect(refuses({ id: 'flat_hierarchy', severity: 'medium' })).toBe(true);
    });

    it('⛔ NEGATIVE — told, but a kind Joe\'s own repair BROUGHT still puts that repair back', () => {
        const small = { id: 'small_targets', severity: 'medium', detailEn: '21 tap target(s) under 40px' };
        //  the repair answered the targets and made a table spill off the phone: not better
        expect(mendIsBetter([small], [{ id: 'mobile_overflow', severity: 'medium' }])).toBe(false);
        expect(whyMendNotBetter([small], [{ id: 'mobile_overflow', severity: 'medium' }])).toMatch(/did not before: mobile_overflow/);
        //  a told line that was there before is not the repair's doing
        expect(mendIsBetter([small, { id: 'a11y_no_main', severity: 'low' }], [{ id: 'a11y_no_main', severity: 'low' }])).toBe(true);
    });

    it('⛔ POSITIVE — the mender answers the one that refuses', () => {
        expect(mendable([{ id: 'no_viewport_meta' }])).toBe(true);
        expect(mendable([{ id: 'a11y_no_main' }])).toBe(false);
    });
});
