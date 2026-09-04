/**
 * THE LOOP STOPS AT ZERO, NOT AT A GOOD SCORE — AND THE GATE ASKS THE REPAIRER.
 *
 * His instruction, in his own words:
 *
 *     «اذا وجد اي مشاكل لا يرجعها الى النظام بشكل يفهمه النظام ليصلحه … وبعد
 *      ان يصلحه النظام يجب يرجع اختبار الجوده على المتصفح يرجع يختبره … ويبقى
 *      على هذا الحال حتى يطبع اختبار الجوده صفر مشاكل»
 *
 * Two things stood between Joe and that, and both were lists.
 *
 * 1. The loop stopped at a SCORE. «95/100 is at or above the bar» — and the
 *    97/100 he read in a real delivery still carried «Largest heading 17px
 *    against 14px body (ratio 1.21) — no visual hierarchy». A bar that leaves
 *    named defects standing declares victory over them.
 *
 * 2. The gate that decides whether to repair at all kept its own hand-written
 *    set of thirteen ids, while ui-repair.ts answers eighteen. Eight fixes
 *    were written, tested and reachable — and refused at the door. Among them
 *    `type_scale_drift`: that heading finding, by name. It survived every
 *    build because the door never opened, not because the fix was missing.
 *
 * The gate asks the repairer now, and the loop's target is emptiness.
 */

import { worthRepairing } from '../core/quality/self-repair';
import { REPAIRS_THIS_FILE_CAN_MAKE } from '../core/quality/ui-repair';
import { improveUntilItStops, improveSummary, normaliseImproveResult } from '../core/quality/improve-loop';

describe('a finding with a written fix is allowed to reach it', () => {
    // POSITIVE — his own defect, and every other id the repairer answers.
    it.each([...REPAIRS_THIS_FILE_CAN_MAKE])('%s opens the repair gate', (id) => {
        expect(worthRepairing([{ id }])).toBe(true);
    });

    it('type_scale_drift — the heading finding he watched survive — is repairable', () => {
        expect(worthRepairing([{ id: 'type_scale_drift' }])).toBe(true);
    });

    // NEGATIVE — a finding no deterministic edit can answer must NOT trigger a
    // rebuild. Half a minute of his time spent on theatre is still theatre.
    it.each([
        ['console_errors'],
        ['broken_routes'],
        ['a_finding_nobody_wrote_a_fix_for'],
    ])('%s does not open the gate', (id) => {
        expect(worthRepairing([{ id }])).toBe(false);
    });
});

describe('the loop stops when there is nothing left, not when the score is nice', () => {
    const round = (score: number, ids: string[]) => ({
        score, findingIds: ids, findings: ids.map(id => ({ id })), skipped: undefined,
    });

    // POSITIVE — a clean audit ends it immediately and says so by name.
    it('zero findings stops the loop even at a mediocre score', async () => {
        const result = await improveUntilItStops(round(62, []), {
            say: () => { },
            measure: async () => round(62, []),
            repair: async () => { throw new Error('must not repair a clean build'); },
            rebuild: async () => true,
            snapshot: () => 'snap',
            rollback: async () => true,
        });
        expect(result.stoppedBecause).toBe('nothing_left');
        expect(improveSummary(result, true)).toContain('لم يجد عطباً');
    });

    // NEGATIVE — a high score with a finding still standing does NOT stop it.
    it('a 97 with one finding left is not a reason to stop', async () => {
        let repaired = 0;
        const result = await improveUntilItStops(round(97, ['type_scale_drift']), {
            say: () => { },
            measure: async () => round(100, []),
            repair: async () => { repaired += 1; return ['src/styles/app.css']; },
            rebuild: async () => true,
            snapshot: () => 'snap',
            rollback: async () => true,
            maxRounds: 3,
        });
        expect(repaired).toBeGreaterThan(0);
        expect(result.final?.findingIds).toEqual([]);
        expect(result.stoppedBecause).toBe('nothing_left');
    });

    it('keeps a repair that removes a finding even when the rounded score is unchanged', async () => {
        let measurements = 0;
        const result = await improveUntilItStops(round(92, ['low_contrast', 'small_targets']), {
            say: () => { },
            measure: async () => {
                measurements += 1;
                return measurements === 1
                    ? round(92, ['small_targets'])
                    : round(100, []);
            },
            repair: async (_round, remaining) => remaining.length ? ['src/styles/app.css'] : [],
            rebuild: async () => true,
            snapshot: () => 'snap',
            rollback: async () => true,
            maxRounds: 3,
        });
        expect(result.rounds).toHaveLength(2);
        expect(result.rounds[0]).toMatchObject({ verdict: 'improved', rolledBack: false });
        expect(result.final.findingIds).toEqual([]);
        expect(result.stoppedBecause).toBe('nothing_left');
    });

    it('preserves the zero-findings verdict when a saved result is normalised', () => {
        const clean = round(100, []);
        const result = normaliseImproveResult({
            first: round(92, ['low_contrast']),
            final: clean,
            rounds: [],
            fixed: ['low_contrast'],
            stoppedBecause: 'nothing_left',
        }, clean);
        expect(result.stoppedBecause).toBe('nothing_left');
        expect(improveSummary(result, false)).toContain('audit found not one finding');
    });

    // NEGATIVE — and it never loops forever: a repair that changes nothing ends it.
    it('a round that can write nothing different ends the loop', async () => {
        const result = await improveUntilItStops(round(80, ['low_contrast']), {
            say: () => { },
            measure: async () => round(80, ['low_contrast']),
            repair: async () => [],
            rebuild: async () => true,
            snapshot: () => 'snap',
            rollback: async () => true,
            maxRounds: 5,
        });
        expect(result.stoppedBecause).not.toBe('nothing_left');
        expect(result.rounds.length).toBeLessThanOrEqual(5);
    });

    const rollbackCase = async (snapshotId: string, rollbackResult: boolean) => {
        const sayLines: string[] = [];
        let rollbackCalls = 0;
        const result = await improveUntilItStops(round(80, ['low_contrast']), {
            say: (line) => { sayLines.push(line); },
            measure: async () => round(80, ['low_contrast']),
            repair: async () => ['src/styles/app.css'],
            rebuild: async () => false,
            snapshot: () => snapshotId,
            rollback: async () => { rollbackCalls += 1; return rollbackResult; },
            maxRounds: 1,
        });
        return { result, sayLines, rollbackCalls };
    };

    it('reports a failed rollback instead of claiming the round was restored', async () => {
        const { result, sayLines, rollbackCalls } = await rollbackCase('snap', false);
        expect(rollbackCalls).toBe(1);
        expect(result.stoppedBecause).toBe('build_failed');
        expect(result.rounds[0].rolledBack).toBe(false);
        expect(result.rounds[0].rollback).toBe('failed');
        expect(sayLines).toContain('improve: round 1 broke the build — حاولت التراجع لكنه فشل — rollback was attempted but failed; could NOT roll it back and stopped');
    });

    it('reports a successful rollback when the rollback actually returns true', async () => {
        const { result, sayLines, rollbackCalls } = await rollbackCase('snap', true);
        expect(rollbackCalls).toBe(1);
        expect(result.stoppedBecause).toBe('build_failed');
        expect(result.rounds[0].rolledBack).toBe(true);
        expect(result.rounds[0].rollback).toBe('done');
        expect(sayLines).toContain('improve: round 1 broke the build — تم التراجع بنجاح — rollback completed successfully; rolled it back and stopped');
    });

    it('reports that there is no rollback when taking the snapshot failed', async () => {
        const { result, sayLines, rollbackCalls } = await rollbackCase('', false);
        expect(rollbackCalls).toBe(0);
        expect(result.stoppedBecause).toBe('build_failed');
        expect(result.rounds[0].rolledBack).toBe(false);
        expect(result.rounds[0].rollback).toBe('none');
        expect(sayLines).toContain('improve: round 1 broke the build — لم آخذ نسخةً قبل الجولة، فلا رجوع — no snapshot was taken before the round; could NOT roll it back and stopped');
    });
});
