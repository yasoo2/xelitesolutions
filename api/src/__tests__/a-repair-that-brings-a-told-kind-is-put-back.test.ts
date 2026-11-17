/**
 * A REPAIR THAT BRINGS A NEW TOLD KIND IS PUT BACK (review 3 of r40, 11).
 *
 * The improve loops (ProjectEditTool, ProjectRepairTool, the React build) keep or
 * roll back a round on the refusing score, which hides the told lines. So a CSS
 * round that fixed small_targets but made a table spill off the phone
 * (mobile_overflow, told) was kept — while verify.ts's mendIsBetter would put the
 * same repair back. The loop now vetoes as mendIsBetter's inspectorKindsBrought
 * does: an inspector's told kind the page did not have before, only when both
 * inspections are complete. No browser, no model.
 */
import { improveUntilItStops, toldKindsBrought, withToldKinds, type Measurement } from '../core/quality/improve-loop';
import { markInspection, refusingMeasurement } from '../core/engine/browser-mend';

const loop = async (first: Measurement, after: Measurement) => {
    let rolledBack = 0;
    const lines: string[] = [];
    const r = await improveUntilItStops(first, {
        measure: async () => after,
        repair: async () => ['src/index.css'],
        rebuild: async () => true,
        rollback: async () => { rolledBack++; return true; },
        snapshot: () => 'snap-1',
        say: l => lines.push(l),
        maxRounds: 1,
    });
    return { r, rolledBack, lines };
};

describe('the improve loop vetoes a round that brought an inspector\'s told kind', () => {
    const first: Measurement = { score: 85, findingIds: ['small_targets'], findings: [{ id: 'small_targets' }], told: ['low_contrast'], inspection: 'complete' };

    it('small_targets fixed, mobile_overflow brought, both walks complete: rolled back, and said why', async () => {
        const { r, rolledBack, lines } = await loop(first, { score: 100, findingIds: [], findings: [], told: ['low_contrast', 'mobile_overflow'], inspection: 'complete' });
        expect(r.rounds[0].verdict).toBe('no_measured_gain');
        expect(r.rounds[0].rolledBack).toBe(true);
        expect(rolledBack).toBe(1);
        expect(r.final).toBe(first);
        expect(lines.join('\n')).toMatch(/mobile_overflow/u);
    });

    it('the same round measured on a partial walk is kept: a partial inspection proves nothing', async () => {
        const { r, rolledBack } = await loop({ ...first, inspection: 'partial: viewport' }, { score: 100, findingIds: [], findings: [], told: ['mobile_overflow'], inspection: 'complete' });
        expect(r.rounds[0].verdict).toBe('improved');
        expect(rolledBack).toBe(0);
    });

    it('a told kind that was already there, or a measurement without told ids, is judged as before', async () => {
        expect((await loop(first, { score: 100, findingIds: [], told: ['low_contrast'], inspection: 'complete' })).r.rounds[0].verdict).toBe('improved');
        expect((await loop({ score: 85, findingIds: ['small_targets'] }, { score: 100, findingIds: [] })).r.rounds[0].verdict).toBe('improved');
    });

    it('toldKindsBrought reads only the inspector\'s kinds, as mendIsBetter does', () => {
        expect(toldKindsBrought(first, { score: 90, findingIds: [], told: ['mobile_overflow', 'some_other_told'], inspection: 'complete' })).toEqual(['mobile_overflow']);
        expect(toldKindsBrought(first, { score: 90, findingIds: [], told: ['mobile_overflow'], inspection: 'failed: timeout' })).toEqual([]);
    });

    it('withToldKinds reads the told ids and the inspection from the audit, its own field or app-audit\'s mark', () => {
        const findings = markInspection([{ id: 'small_targets', severity: 'high' }, { id: 'mobile_overflow', severity: 'medium' }] as any[], 'complete');
        const m = withToldKinds<Measurement>({ score: 85, findingIds: ['small_targets'] }, { findings });
        expect(m.told).toEqual(['mobile_overflow']);
        expect(m.inspection).toBe('complete');
        expect(withToldKinds<Measurement>({ score: 85, findingIds: [] }, { findings: [], uiInspection: 'partial: x' }).inspection).toBe('partial: x');
    });

    it('⛔ the real callers\' reading (refusingMeasurement) carries the told ids and the inspection, so the veto fires in real runs', async () => {
        const before = refusingMeasurement({ findings: markInspection([{ id: 'small_targets', severity: 'high' }, { id: 'low_contrast', severity: 'medium' }] as any[], 'complete') });
        const after = refusingMeasurement({ findings: [{ id: 'low_contrast', severity: 'medium' }, { id: 'mobile_overflow', severity: 'medium' }] as any[], uiInspection: 'complete' });
        expect(before.told).toEqual(['low_contrast']);
        expect(before.inspection).toBe('complete');
        expect(after.told).toEqual(['low_contrast', 'mobile_overflow']);
        const { r, rolledBack } = await loop(before, after);
        expect(r.rounds[0].rolledBack).toBe(true);
        expect(rolledBack).toBe(1);
    });
});
