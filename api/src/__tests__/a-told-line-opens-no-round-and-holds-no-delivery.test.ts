/**
 * ⛔ A TOLD LINE OPENS NO ROUND AND HOLDS NO DELIVERY (review r40-2, 2026-11-15, A1–A7).
 *
 * Design v3 (D:\Joe\eval\egm\designs\2026-11-15-ui-inspection-revival-v3.md): the
 * inspector's lines (INSPECTOR_TOLD, browser-mend.ts) are told — never a refusal,
 * never a repair round, never paid for in a model round, never the reason a mend
 * is put back. The review found each of those still happening:
 *
 *   A1  the React build gate refused on every told line (openQualityFindings unfiltered);
 *   A2  the improve loops ran on told ids — round 2 with no findings at all, which is
 *       ui-repair's untargeted blanket over the user's stylesheets — and kept or rolled
 *       back a round on a score the told lines paid into;
 *   A3  the React CSS model round was asked (and paid) to fix told lines;
 *   A4  project_repair handed every finding to repairRound;
 *   A5  a mend was put back for a told kind «brought» by a second walk whose first
 *       inspection had been cut short or had failed;
 *   A6  the inspection's 30 s ignored the walk's own budget;
 *   A7  the viewport restore ignored the size the caller asked for.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    INSPECTION_STATUS, markInspection, mendIsBetter, refusingMeasurement, refusingScore, whyMendNotBetter,
} from '../core/engine/browser-mend';
import { improveUntilItStops } from '../core/quality/improve-loop';
import { inspectUi } from '../core/quality/ui-inspection';
import { modelRepairable, reactLoopMeasurement, reactQualityGate } from '../modules/tools/definitions/ReactProjectTool';
import { ProjectRepairTool } from '../modules/tools/definitions/ProjectRepairTool';

jest.setTimeout(120_000);

const code = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const small = { id: 'small_targets', severity: 'medium', detail: '2 أزرار صغيرة', detailEn: '2 tap target(s) under 40px', evidence: [{ sel: 'button.go', w: 30, h: 30 }] };
const contrast = { id: 'low_contrast', severity: 'medium', detail: 'تباين ضعيف', detailEn: 'Low contrast: Opening hours', evidence: [{ sel: 'p.pale' }] };
const overflow = { id: 'mobile_overflow', severity: 'high', detail: 'يفيض', detailEn: 'The page spills off the phone', evidence: [{ sel: 'table' }] };
const tap = { id: 'mobile_tap_targets', severity: 'medium', detail: 'لمس', detailEn: '3 tap targets on the phone', evidence: [] };
const header = { id: 'mobile_header_fragmented', severity: 'medium', detail: 'رأس', detailEn: 'The header breaks on the phone', evidence: [] };
const noMain = { id: 'a11y_no_main', severity: 'low', detail: 'لا main', detailEn: 'No <main> landmark', evidence: [] };
const dead = { id: 'dead_controls', severity: 'high', detail: 'زر لا يعمل', detailEn: '1 control does nothing', evidence: [{ label: 'Save' }] };

const inert = {
    rebuild: async () => true,
    rollback: async () => true,
    snapshot: () => 'snap',
};

describe('A2 — the loops are handed, and judged by, what refuses', () => {
    it('⛔ POSITIVE — round 1 fixes the refusing finding; no round 2 runs on the told line that is left', async () => {
        const repair = jest.fn(async () => ['src/index.css']);
        const r = await improveUntilItStops(refusingMeasurement({ score: 84, findings: [small, contrast] }), {
            ...inert, repair,
            measure: async () => refusingMeasurement({ score: 92, findings: [contrast] }),
        });
        expect(repair).toHaveBeenCalledTimes(1);
        //  the round is surgery on the refusing finding alone — never an empty list (ui-repair's blanket)
        expect((repair.mock.calls[0] as any[])[2]).toEqual([{ id: 'small_targets', evidence: small.evidence }]);
        expect(r.stoppedBecause).toBe('nothing_left');
    });

    it('⛔ NEGATIVE — a told line the second walk sampled worse does not roll back a real fix', async () => {
        const rollback = jest.fn(async () => true);
        const r = await improveUntilItStops(refusingMeasurement({ score: 84, findings: [small, contrast] }), {
            ...inert, rollback, repair: async () => ['src/index.css'],
            //  the buttons are fixed; the paint read two told lines this time (audit score 70 < 84)
            measure: async () => refusingMeasurement({ score: 70, findings: [overflow, { ...contrast, severity: 'high' }] }),
        });
        expect(rollback).not.toHaveBeenCalled();
        expect(r.rounds[0].verdict).toBe('improved');
    });

    it('⛔ POSITIVE — only told lines: not one round', async () => {
        const repair = jest.fn(async () => ['src/index.css']);
        const r = await improveUntilItStops(refusingMeasurement({ score: 81, findings: [contrast, overflow, noMain] }), {
            ...inert, repair, measure: async () => { throw new Error('measured again'); },
        });
        expect(repair).not.toHaveBeenCalled();
        expect(r.rounds).toEqual([]);
        expect(r.stoppedBecause).toBe('nothing_left');
    });

    it('the score a round is judged by is the one the refusing findings alone earn', () => {
        expect(refusingScore({ score: 84, findings: [small, contrast] })).toBe(92);
        expect(refusingScore({ score: 92, findings: [small] })).toBe(92);
        expect(refusingScore({ score: 81, findings: [contrast, overflow, noMain] })).toBe(100);
        //  a finding with no price leaves the audit's own number, plus what the told lines cost
        expect(refusingScore({ score: 77, findings: [{ id: 'odd' }, contrast] as any })).toBe(85);
        //  a walk that ran out of time stays below a passing score
        expect(refusingScore({ score: 41, findings: [{ id: 'qa_budget_exhausted', severity: 'medium' }, contrast] })).toBe(49);
    });

    it('⛔ the edit path builds its loop from refusingMeasurement, first reading and every one after', () => {
        const e = code('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        expect(e).toContain('const firstMeasurement = refusingMeasurement(audit);');
        expect(e).toContain('const reading = refusingMeasurement(measured);');
        expect(e).not.toMatch(/findingIds: \((?:audit|measured)\.findings \|\| \[\]\)\.map\(/);
        //  the audit published is the one the kept reading was taken from
        expect(e).toContain('const matchingAudit = readings.get(improvement.final);');
        //  a round handed no finding writes nothing: never ui-repair's untargeted blanket
        expect(e).toMatch(/findings\.length \? \(await repairRound\(dir, round, \{ isArabic: isAr, findings \}\)\)\.changed : \[\]/);
    });

    it('⛔ the build path builds its loop from reactLoopMeasurement, and its first reading too', () => {
        const b = code('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(b).toContain('const firstReading = reactLoopMeasurement(audit, firstTermFails, ');
        expect(b).toContain('loop = normaliseImproveResult(loop, firstReading);');
        expect(b).toContain('const reading = reactLoopMeasurement(a, termFails, ');
        //  the audit published is the one the kept reading was taken from, never a rolled-back one
        expect(b).toContain('if (keptAudit) audit = keptAudit;');
        expect(b).not.toMatch(/findingIds: \[\.\.\.\((?:a|audit)\.findings \|\| \[\]\)\.map\(/);
        //  a round handed no browser finding does not call the deterministic repairer at all
        expect(b).toMatch(/const known = findings\.length\s*\?\s*await repairRound\(proj, round, \{/);
    });

    it('⛔ POSITIVE — the React loop reading: told lines are neither ids nor findings; the terminal still votes', () => {
        const blend = (n: number) => Math.round(n * 0.8 + 50 * 0.2);
        expect(reactLoopMeasurement({ score: 81, findings: [contrast, overflow, noMain] }, [], blend))
            .toEqual({ score: blend(100), findingIds: [], findings: [] });
        expect(reactLoopMeasurement({ score: 84, findings: [small, contrast] }, ['tables_answer'], blend))
            .toEqual({ score: blend(92), findingIds: ['small_targets', 'tables_answer'], findings: [{ id: 'small_targets', evidence: small.evidence }] });
    });
});

describe('A1 — the React build gate refuses on what refuses, never on a told line', () => {
    it('⛔ POSITIVE — told lines at every severity: nothing open, nothing blocking', () => {
        const gate = reactQualityGate({ score: 66, findings: [contrast, overflow, tap, noMain] });
        expect(gate.open).toEqual([]);
        expect(gate.blockers).toEqual([]);
        expect(gate.told.map((f: any) => f.id)).toEqual(['low_contrast', 'mobile_overflow', 'mobile_tap_targets', 'a11y_no_main']);
    });

    it('⛔ NEGATIVE — what refuses still holds the delivery', () => {
        const gate = reactQualityGate({ score: 70, findings: [dead, small, overflow] });
        expect(gate.open.map((f: any) => f.id)).toEqual(['dead_controls', 'small_targets']);
        expect(gate.blockers.map((f: any) => f.id)).toEqual(['dead_controls']);
    });

    it('⛔ the gate, its blockers and the delivery record all read the filtered list', () => {
        const b = code('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(b).toContain('const qualityGate = reactQualityGate(audit);');
        expect(b).toContain('const openQualityFindings = qualityGate.open;');
        expect(b).toContain('const blockers = qualityGate.blockers;');
        expect(b).not.toContain('const openQualityFindings = ((audit?.findings || []) as any[]);');
        expect(b).toMatch(/qualityDeliveryBlocked = buildVerificationBlocked \|\| openQualityFindings\.length > 0/);
        expect(b).toContain('blockers: [...openQualityFindings.map((f: any) => f.id)');
    });
});

describe('A3 — the model rounds are asked only about what refuses', () => {
    it('⛔ POSITIVE — told lines the CSS round knows are not sent to it', () => {
        const m = modelRepairable({ findings: [contrast, overflow, tap, header] });
        expect(m.css).toEqual([]);
        expect(m.behaviour).toEqual([]);
    });

    it('⛔ NEGATIVE — a refusing finding still reaches its round', () => {
        const m = modelRepairable({ findings: [small, contrast, dead] });
        expect(m.css.map((f: any) => f.id)).toEqual(['small_targets']);
        expect(m.behaviour.map((f: any) => f.id)).toEqual(['dead_controls']);
    });

    it('⛔ the build path reads both model roads, and the door, through modelRepairable', () => {
        const b = code('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(b).toContain('const severeFirst = modelRepairable(lastAudit).behaviour.length > 0;');
        expect(b).toContain('const behaviourLeft = modelRepairable(lastAudit).behaviour;');
        expect(b).toContain('const rich = modelRepairable(lastAudit).css;');
        expect(b).toContain('? modelRepairable(audit).behaviour');
        expect(b).not.toMatch(/(?:cssRepairable|handlerRepairable)\((?:lastAudit|audit)[?.]/);
    });
});

describe('A4 — project_repair repairs what refuses, and tells the rest', () => {
    const appAudit = require('../core/quality/app-audit');
    const loop = require('../core/quality/improve-loop');
    let dir = '';
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-told-repair-'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Clinic</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Clinic</h1><button class="go">Book</button></main></body></html>');
        fs.writeFileSync(path.join(dir, 'styles.css'), '.go{height:30px}\n');
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

    it('⛔ POSITIVE — the round is handed the refusing finding alone, and the told lines are told, not refused', async () => {
        const audits = [
            { score: 69, findings: [small, contrast, overflow] },
            { score: 77, findings: [contrast, overflow] },
        ];
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => audits.shift() || { score: 77, findings: [contrast, overflow] });
        const round = jest.spyOn(loop, 'repairRound').mockImplementation(async () => ({ changed: ['styles.css'], repairs: [] }));
        //  the panel browser is not warmed for a measurement that is not taken in it
        jest.spyOn(require('../modules/browser/manager'), 'warmBrowserSession').mockImplementation(() => undefined);
        const r: any = await new ProjectRepairTool().execute({ projectDir: dir, auditDir: dir }, { sessionId: 'told-repair-a4', language: 'en' });
        expect(round).toHaveBeenCalledTimes(1);
        const handed = (round.mock.calls[0] as any[])[2].findings as any[];
        expect(handed.map(f => f.id)).toEqual(['small_targets']);
        expect(handed[0].evidence).toEqual(small.evidence);
        expect(audit).toHaveBeenCalledTimes(2);
        expect(r.ok).toBe(true);
        expect(r.output.told).toEqual(['low_contrast', 'mobile_overflow']);
        expect(r.output.remaining).toEqual(['low_contrast', 'mobile_overflow']);
        expect(r.output.message).toMatch(/Told with the delivery, not refusing it \(2\)/);
        expect(r.output.message).not.toMatch(/Repair not accepted/);
    });
});

describe('A5 — a told kind counts as the mend\'s doing only when both inspections were complete', () => {
    const before = [{ id: 'type_scale_drift', severity: 'medium' }];
    const after = [{ id: 'mobile_tap_targets', severity: 'medium' }];

    it('⛔ POSITIVE — the first inspection was cut before 390 px: the phone line was not brought by the mend', () => {
        expect(mendIsBetter({ findings: before, uiInspection: 'partial: time ran out before 390px' }, { findings: after, uiInspection: 'complete' })).toBe(true);
        expect(mendIsBetter({ findings: before, uiInspection: 'failed: Target closed' }, { findings: after, uiInspection: 'complete' })).toBe(true);
        expect(mendIsBetter({ findings: before, uiInspection: 'complete' }, { findings: after, uiInspection: 'partial: time ran out before 820px' })).toBe(true);
    });

    it('⛔ NEGATIVE — both complete: a kind that was not there before is the mend\'s, and it is put back', () => {
        expect(mendIsBetter({ findings: before, uiInspection: 'complete' }, { findings: after, uiInspection: 'complete' })).toBe(false);
        expect(whyMendNotBetter({ findings: before, uiInspection: 'complete' }, { findings: after, uiInspection: 'complete' })).toMatch(/did not before: mobile_tap_targets/);
    });

    it('⛔ the bare lists verify.ts hands over carry the walk\'s status (app-audit marks them)', () => {
        const b = markInspection([...before], 'partial: time ran out before 390px');
        const a = markInspection([...after], 'complete');
        expect(mendIsBetter(b, a)).toBe(true);
        expect(mendIsBetter(markInspection([...before], 'complete'), a)).toBe(false);
        //  never printed, never serialised
        expect(Object.keys(a)).toEqual(['0']);
        expect(JSON.stringify(a)).toBe(JSON.stringify(after));
        expect((a as any)[INSPECTION_STATUS]).toBe('complete');
        //  an unmarked list proves no complete inspection: a told kind does not veto on it
        expect(mendIsBetter(before, after)).toBe(true);
        const audit = code('core', 'quality', 'app-audit.ts');
        expect(audit).toContain('markInspection(findings, uiInspection);');
    });
});

describe('A6 — the inspection is bounded by the walk\'s own budget too', () => {
    it('⛔ the deadline is the sooner of 30 s and what is left of the walk', () => {
        const audit = code('core', 'quality', 'app-audit.ts');
        expect(audit).toContain('deadline: Date.now() + Math.min(30_000, Math.max(0, walkCeiling - Date.now())),');
        expect(audit).not.toContain('deadline: Date.now() + 30_000,');
    });
});

describe('A7 — the viewport is put back at the size the caller asked for', () => {
    it('⛔ POSITIVE — the opening size could not be read: the caller\'s restore size is used, not 1280x900', async () => {
        let viewport = { width: 1024, height: 700 };
        const sizes: Array<{ width: number; height: number }> = [];
        let first = true;
        const page = {
            url: () => 'https://example.test/',
            setViewportSize: jest.fn(async (size: { width: number; height: number }) => { viewport = size; sizes.push(size); }),
            waitForTimeout: jest.fn(async () => { }),
            evaluate: jest.fn(async (fn: Function) => {
                if (first && /scrollX/.test(String(fn))) { first = false; throw new Error('Execution context was destroyed'); }
                if (fn.name === 'measureContrast') return { checked: 0, skipped: 0, samples: [] };
                if (fn.name === 'measureA11y') return { focusables: 1, hasNav: true, issues: [] };
                if (fn.name === 'measureContentComposition') return { hasImageWorkflow: false };
                if (fn.name === 'measureResponsive') return { actualVw: viewport.width, overflowX: false, wide: [], wideEvidence: [], tiny: 0, smallFonts: 0, clipped: 0, unreachable: [], hasViewportMeta: true };
                return viewport;
            }),
        };
        await inspectUi(page, { restore: { width: 1024, height: 700 } });
        expect(sizes[sizes.length - 1]).toEqual({ width: 1024, height: 700 });
    });
});
