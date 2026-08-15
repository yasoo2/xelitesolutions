/**
 * «كان اتفاقنا نظاما ذكي جدا … وبعد ان ياخذ النتائج من المتصفح والثيرمال يرجع
 *  يحلل ويفكر ومن ثم يكمل … ومن ثم يرجع يحلل ما بناه ومن ثم يرجع يطور عليه»
 *
 * What stood here was a straight line: build, measure once, repair once,
 * measure once, «done». There was no point in it where Joe looked at what
 * SURVIVED and decided what to do about that — the intelligence was all in
 * the instruments and none of it after them.
 *
 * The loop closes that. Three properties keep it from becoming the thing he
 * actually objects to — motion that bills itself as progress:
 *
 *   1. every round must be DIFFERENT from the last (the fixes escalate);
 *   2. every round must be paid for in a MEASURED number, or it is rolled
 *      back and the loop ends;
 *   3. every round says what it saw, what it decided, and what happened.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { improveUntilItStops, improveSummary, repairRound, normaliseImproveResult } from '../core/quality/improve-loop';
import {
    repairTapTargets, repairContrast, repairFormValidation,
    repairMeasuredTapTargets, repairMeasuredContrast, repairProjectFiles,
} from '../core/quality/ui-repair';
import { safeCss, cssRepairPrompt } from '../core/quality/model-round';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

/** A no-op environment: the loop's own decisions are what is under test. */
const inert = (over: Partial<Parameters<typeof improveUntilItStops>[1]> = {}) => ({
    measure: async () => ({ score: 0, findingIds: [] }),
    repair: async () => ['a.css'],
    rebuild: async () => true,
    rollback: async () => true,
    snapshot: () => 'snap-1',
    ...over,
});

describe('every round must be different from the last', () => {
    it('the tap-target rule escalates 44 → 48 → 56', () => {
        const r1 = repairTapTargets('.btn{}', 1);
        const r2 = repairTapTargets(r1.text, 2);
        const r3 = repairTapTargets(r2.text, 3);
        expect(r1.text).toContain('min-height: 44px');
        expect(r2.text).toContain('min-height: 48px');
        expect(r3.text).toContain('min-height: 56px');
    });

    it('and a round never writes the same block twice', () => {
        const once = repairTapTargets('.btn{}', 2);
        const twice = repairTapTargets(once.text, 2);
        expect(twice.text).toBe(once.text);
        expect(twice.repairs).toHaveLength(0);
    });

    it('the contrast bar escalates 4.5 → 5.5 → 7', () => {
        const css = ':root{--bg:#ffffff;--surface:#ffffff;--text:#9a9a9a}';
        const a = repairContrast(css, 1).text;
        const b = repairContrast(a, 2).text;
        const c = repairContrast(b, 3).text;
        // Each round darkens the same token further against the same ground.
        const hex = (s: string) => (s.match(/--text:\s*(#[0-9a-fA-F]{6})/) || [])[1] || '';
        expect(hex(a)).not.toBe(hex(css));
        expect(hex(b)).not.toBe(hex(a));
        expect(hex(c)).not.toBe(hex(b));
    });

    /** A label that says «الاسم *» over an input the browser will submit empty. */
    it('a starred field is really made required — once', () => {
        const jsx = 'export default () => <form><input type="text" /></form>;';
        const first = repairFormValidation(jsx);
        expect(first.text).toContain('required');
        expect(repairFormValidation(first.text).repairs).toHaveLength(0);
    });

    it('a file picker is never the field it makes mandatory', () => {
        const jsx = '<form><input type="file" /></form>';
        expect(repairFormValidation(jsx).repairs).toHaveLength(0);
    });
});

describe('every round is paid for in a measured number', () => {
    it('a round that does not raise the score is rolled back, and ends the loop', async () => {
        let rolledBackWith = '';
        const r = await improveUntilItStops({ score: 78, findingIds: ['low_contrast'] }, inert({
            measure: async () => ({ score: 78, findingIds: ['low_contrast'] }),
            rollback: async (id: string) => { rolledBackWith = id; return true; },
        }));
        expect(r.stoppedBecause).toBe('no_measured_gain');
        expect(r.rounds[0].rolledBack).toBe(true);
        expect(rolledBackWith).toBe('snap-1');
        // The published verdict is the number that was really kept.
        expect(r.final.score).toBe(78);
    });

    it('a round that LOWERS the score is treated the same way', async () => {
        const r = await improveUntilItStops({ score: 78, findingIds: ['x'] }, inert({
            measure: async () => ({ score: 60, findingIds: ['x'] }),
        }));
        expect(r.stoppedBecause).toBe('no_measured_gain');
        expect(r.final.score).toBe(78);
    });

    it('a round that breaks the build is undone and ends the loop', async () => {
        const r = await improveUntilItStops({ score: 78, findingIds: ['x'] }, inert({
            rebuild: async () => false,
        }));
        expect(r.stoppedBecause).toBe('build_failed');
        expect(r.rounds[0].rolledBack).toBe(true);
        expect(r.final.score).toBe(78);
    });

    it('a round with nothing new to write does not spend a build', async () => {
        let rebuilt = 0;
        const r = await improveUntilItStops({ score: 80, findingIds: ['x'] }, inert({
            repair: async () => [],
            rebuild: async () => { rebuilt++; return true; },
        }));
        expect(r.stoppedBecause).toBe('no_change_possible');
        expect(rebuilt).toBe(0);
        expect(r.rounds[0].after).toBeUndefined();
    });

    it('a build already at the bar spends nothing at all', async () => {
        let repaired = 0;
        const r = await improveUntilItStops({ score: 97, findingIds: [] }, inert({
            repair: async () => { repaired++; return ['a.css']; },
        }));
        expect(r.rounds).toHaveLength(0);
        expect(repaired).toBe(0);
        expect(r.stoppedBecause).toBe('target_reached');
    });

    it('it climbs while it keeps winning, and names what really closed', async () => {
        const scores = [86, 93, 96];
        const open = [['b', 'c'], ['c'], []];
        let i = 0;
        const r = await improveUntilItStops({ score: 78, findingIds: ['a', 'b', 'c'] }, inert({
            measure: async () => ({ score: scores[i], findingIds: open[i++] }),
        }));
        expect(r.rounds.filter(x => x.verdict === 'improved')).toHaveLength(3);
        expect(r.final.score).toBe(96);
        expect(r.fixed.sort()).toEqual(['a', 'b', 'c']);
        expect(improveSummary(r, false)).toContain('78 → 86 → 93 → 96/100');
    });

    it('the round ceiling is a ceiling, not a target', async () => {
        let i = 0;
        const r = await improveUntilItStops({ score: 10, findingIds: ['x'] }, inert({
            maxRounds: 2,
            measure: async () => ({ score: 20 + (i++ * 10), findingIds: ['x'] }),
        }));
        expect(r.rounds).toHaveLength(2);
    });
});

describe('every round says what it saw and what it decided', () => {
    it('the summary of a loop that won nothing claims nothing', async () => {
        const r = await improveUntilItStops({ score: 78, findingIds: ['x'] }, inert({ repair: async () => [] }));
        const s = improveSummary(r, false);
        expect(s).toContain('no round produced a measured gain');
        expect(s).not.toContain('→');
    });

    it('and the Arabic summary is a sentence, not a translation of a variable', async () => {
        const r = await improveUntilItStops({ score: 78, findingIds: ['x'] }, inert({ repair: async () => [] }));
        expect(improveSummary(r, true)).toContain('لم تُنتج أي جولة مكسباً مقيساً');
    });
});

describe('the build really drives it', () => {
    it('react_project runs the loop instead of a single repair pass', () => {
        expect(REACT).toMatch(/await improveUntilItStops\(/);
        expect(REACT).not.toMatch(/const cycle = await repairAndRebuild\(proj/);
    });

    it('each round gets a real browser measurement, a real build, a real snapshot', () => {
        expect(REACT).toMatch(/const a = await auditBuiltApp\(path\.join\(proj, 'dist'\)/);
        expect(REACT).toMatch(/const rb = await runDoctored\('npm', \['run', 'build'\]/);
        expect(REACT).toMatch(/snapshotProject\(proj, label\)\?\.id/);
        expect(REACT).toMatch(/const back = restoreVersion\(proj, id\);/);
    });

    it('the repaired page is re-packaged before the round is measured', () => {
        expect(REACT.indexOf('if (rb.ok !== true) return false;'))
            .toBeLessThan(REACT.indexOf('// The packaged copy is the OLD interface until this'));
    });

    it('the rounds and the reason it stopped reach the delivery report', () => {
        expect(REACT).toMatch(/for \(const r of loop\.rounds\)/);
        expect(REACT).toMatch(/no gain — rolled back/);
        expect(REACT).toMatch(/nothing different left to write/);
    });

    it('the ceiling and the bar are settings, not constants buried in a branch', () => {
        expect(REACT).toMatch(/process\.env\.JOE_IMPROVE_ROUNDS \|\| 4/);
        expect(REACT).toMatch(/process\.env\.JOE_IMPROVE_TARGET \|\| 95/);
    });
});

/**
 * SURGERY, NOT A BANDAGE.
 *
 * A finding used to be a sentence — «3 tap target(s) under 32px (احجز الآن =
 * 51x36)» — true, readable, and nothing a repairer can aim at. So the repair
 * was a rule over every button on the page, and a blanket is what makes a
 * second round impossible: once it is spread there is nothing left to tighten.
 */
describe('the offenders the browser named are fixed by name', () => {
    const evid = [{ sel: 'button.act', label: 'like', w: 53, h: 40 }, { sel: '.tabbtn', w: 60, h: 38 }];

    it('a rule is written for exactly the measured selectors', () => {
        const out = repairMeasuredTapTargets('.x{}', evid, 44).text;
        expect(out).toContain('button.act');
        expect(out).toContain('.tabbtn');
        // …and nothing the browser never complained about is touched.
        expect(out).not.toContain('.icon-btn');
    });

    it('nothing to aim at means nothing is written', () => {
        expect(repairMeasuredTapTargets('.x{}', [], 44).text).toBe('.x{}');
        expect(repairMeasuredContrast('.x{}', [], 0).text).toBe('.x{}');
    });

    it('a selector that could escape its rule never reaches the stylesheet', () => {
        for (const bad of ['a{}b', 'a;b', '@media x', '<script>']) {
            expect(repairMeasuredTapTargets('.x{}', [{ sel: bad }], 44).text).toBe('.x{}');
        }
    });

    it('and the same surgery is never written twice', () => {
        const once = repairMeasuredTapTargets('.x{}', evid, 44);
        expect(repairMeasuredTapTargets(once.text, evid, 44).repairs).toHaveLength(0);
    });

    it('a measured contrast failure is answered on ITS OWN background', () => {
        const fails = [{ sel: 'p.price', ratio: 3.2, need: 4.5, fg: [154, 154, 154], bg: [255, 255, 255] }];
        const out = repairMeasuredContrast(':root{}', fails, 0).text;
        expect(out).toMatch(/p\.price \{ color: #[0-9a-f]{6}; \}/);
    });

    /**
     * Both surgical fixes used to be evaluated inside ONE array literal, so
     * both ran against the same text and the second assignment threw the
     * first one's block away. Measured: the tap-target rule vanished from the
     * file it had just been added to.
     */
    it('both surgical blocks survive the same pass', () => {
        const plan = repairProjectFiles(
            { 'a.css': ':root{--bg:#fff;--surface:#fff;--text:#9a9a9a}' },
            {
                round: 1,
                findings: [
                    { id: 'tap_targets', evidence: evid },
                    { id: 'contrast', evidence: [{ sel: 'p.price', need: 4.5, fg: [154, 154, 154], bg: [255, 255, 255] }] },
                ],
            },
        );
        const out = plan.files['a.css'] || '';
        expect(out).toContain('button.act');
        expect(out).toMatch(/p\.price \{ color:/);
        // …and the general escalating rule is still there as the fallback.
        expect(out).toContain('min-height: 44px');
    });
});

/**
 * The model is allowed to be wrong. It is not allowed to be believed: CSS
 * only, appended to one stylesheet, parsed before it is written, built, and
 * then measured — and rolled back by the same rule as any other round.
 */
describe('the model round is contained, not trusted', () => {
    it('a plain block of CSS passes', () => {
        expect(safeCss('.a{color:#111}').ok).toBe(true);
    });

    it('a fenced answer is unwrapped rather than refused', () => {
        const g = safeCss('```css\n.a{color:#111}\n```');
        expect(g.ok).toBe(true);
        expect(g.css).not.toContain('```');
    });

    it.each([
        ['markup', '<style>.a{color:red}</style>'],
        ['@import', '@import url(x);\n.a{color:red}'],
        ['a fetch', '.a{background:url(http://x/y.png)}'],
        ['!important', '.a{color:red !important}'],
        ['unbalanced braces', '.a{color:red'],
        ['a stray closing brace', '.a{color:red}}'],
        ['prose', 'You should raise the contrast of the price note.'],
        ['nothing', '   '],
    ])('%s is refused', (_what, css) => {
        expect(safeCss(css).ok).toBe(false);
    });

    it('the prompt names the offenders it was given', () => {
        const p = cssRepairPrompt([{ id: 'tap_targets', detailEn: 'x', evidence: [{ sel: 'button.act', w: 53, h: 40 }] }]);
        expect(p).toContain('offender: button.act (measured 53x40px)');
        expect(p).toContain('CSS ONLY');
    });

    it('it runs only after the deterministic repairer has nothing left', () => {
        expect(REACT).toMatch(/if \(known\.changed\.length\) return known\.changed;/);
    });

    it('it may only append to a stylesheet, and can be switched off', () => {
        expect(REACT).toMatch(/fs\.appendFileSync\(cssPath/);
        expect(REACT).toMatch(/JOE_MODEL_ROUND \|\| '1'\) === '0'/);
        // No other write path for it: no writeFileSync of model output.
        const at = REACT.indexOf('const got = await askForCss');
        expect(REACT.slice(at, at + 1200)).not.toMatch(/writeFileSync/);
    });
});

describe('the repairer writes to disk only what really differs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-rr-'));
    beforeAll(() => {
        fs.mkdirSync(path.join(dir, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","type":"module"}');
        fs.writeFileSync(path.join(dir, 'src', 'styles', 'app.css'), '.btn{padding:2px}');
    });
    afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows */ } });

    it('round 1 changes the CSS, and running round 1 again changes nothing', async () => {
        const first = await repairRound(dir, 1, {});
        expect(first.changed.length).toBeGreaterThan(0);
        const again = await repairRound(dir, 1, {});
        expect(again.changed).toHaveLength(0);
    });

    it('…but round 2 does, because it asks for more', async () => {
        const second = await repairRound(dir, 2, {});
        expect(second.changed.length).toBeGreaterThan(0);
        expect(fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8'))
            .toContain('min-height: 48px');
    });
});


describe('legacy improvement results are safe to report', () => {
    it('normalises missing arrays and measurements instead of throwing on length', () => {
        const fallback = { score: 72, findingIds: ['x'], findings: [] };
        const result = normaliseImproveResult({
            rounds: [{ round: 1, before: 72, verdict: 'no_change_possible', rolledBack: false }],
        } as any, fallback);

        expect(result.rounds[0].changed).toEqual([]);
        expect(result.rounds[0].fixed).toEqual([]);
        expect(result.fixed).toEqual([]);
        expect(result.first.score).toBe(72);
        expect(result.final.score).toBe(72);
        expect(() => improveSummary(result, false)).not.toThrow();
    });
});
