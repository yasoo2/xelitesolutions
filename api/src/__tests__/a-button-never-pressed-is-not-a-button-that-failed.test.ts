/**
 * «I PRESSED IT AND NOTHING HAPPENED» — ABOUT BUTTONS IT NEVER PRESSED.
 *
 * Measured by running this audit against a store I had opened and pressed by
 * hand: the cart badge went 0 → 1, the drawer showed «الإجمالي 200», the order
 * form was there. The audit's own control table said:
 *
 *     DEAD button effect=not found  label=«السلة 0»
 *     DEAD button effect=not found  label=«أضف إلى السلة»   × 6
 *
 * and the finding it published was
 *
 *     high  dead_controls — 8 من 12 أزرار لا تفعل شيئًا عند الضغط
 *
 * `not found` means the element was gone when the click was attempted: the nav
 * links had been pressed first, the route had moved, and the shop's controls
 * were no longer on the page. Nothing was pressed.
 *
 * ⛔ THE CLASS is the most expensive kind in this repository, because it is a
 * FALSE STATEMENT ABOUT A MEASUREMENT — «I pressed it and nothing happened»
 * when nothing was pressed at all. It made Joe refuse to deliver a store that
 * works, which is worse than a wrong number: it withholds finished work and
 * gives the owner a reason that is not true.
 *
 * ⛔ AND MY FIRST REPAIR OF THIS SAME SYMPTOM WAS REVERTED, on the evidence of
 * two numbers: 8/12 dead before it, 11/12 after. The story was good and the
 * measurement said no. This one was written only after reading the audit's own
 * control table — the mechanism, not an inference from the label.
 */

import { judgeBehaviour } from '../core/quality/behaviour-audit';
import * as fs from 'fs';
import * as path from 'path';

const control = (over: any = {}) => ({
    label: 'زر', kind: 'button', worked: false, effect: '', ...over,
});

describe('a control that was never reached is reported as never reached', () => {
    it('tests current-surface buttons before tabs replace that surface', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf8');
        const ordinary = source.indexOf("document.querySelectorAll('button, [role=\"button\"]')");
        const tabs = source.indexOf("document.querySelectorAll('[role=\"tab\"], [data-tab], .tab, .filter, [data-filter]')");
        expect(ordinary).toBeGreaterThan(0);
        expect(tabs).toBeGreaterThan(ordinary);
        expect(source).toContain("if (el.matches('[role=\"tab\"], [data-tab], .tab, .filter, [data-filter]')) return;");
    });

    it('⛔ POSITIVE — the exact table from the live run no longer says «dead»', () => {
        const controls = [
            control({ kind: 'menu', label: 'تبديل الوضع الليلي', worked: true, effect: 'dom' }),
            control({ kind: 'menu', label: 'منتجات', worked: true, effect: 'navigation' }),
            control({ kind: 'menu', label: 'عن المزرعة', worked: true, effect: 'navigation' }),
            control({ kind: 'menu', label: 'تواصل', worked: true, effect: 'navigation' }),
            control({ label: 'السلة 0', effect: 'not found' }),
            control({ label: 'لوحة التاجر', effect: 'not found' }),
            ...Array.from({ length: 6 }, () => control({ label: 'أضف إلى السلة', effect: 'not found' })),
        ];
        const metrics: Record<string, any> = {};
        const { findings } = judgeBehaviour(controls as any, metrics, []);
        expect(findings.some(f => f.code === 'dead_controls')).toBe(false);
        expect(metrics.dead).toBe(0);
        expect(metrics.unreachable).toBe(8);
    });

    it('POSITIVE — and it is still SAID, because unreached evidence is a real gap', () => {
        const controls = [control({ label: 'السلة 0', effect: 'not found' }), control({ label: 'أضف', effect: 'not found' })];
        const { findings } = judgeBehaviour(controls as any, {}, []);
        const f = findings.find(x => x.code === 'controls_not_reached');
        expect(f).toBeTruthy();
        //  and it says plainly that no claim is being made about them
        expect(f!.ar).toContain('لا أدّعي');
        expect(f!.severity).not.toBe('critical');
    });

    it('⛔ NEGATIVE — a button that WAS pressed and did nothing is still dead', () => {
        //  The whole guard would be worthless if it turned every failure into
        //  «unreachable». This is the case the audit exists for.
        const controls = Array.from({ length: 4 }, (_, i) =>
            control({ label: 'زر ' + i, worked: false, effect: '' }));
        const metrics: Record<string, any> = {};
        const { findings } = judgeBehaviour(controls as any, metrics, []);
        expect(findings.some(f => f.code === 'dead_controls')).toBe(true);
        expect(metrics.dead).toBe(4);
        expect(metrics.unreachable).toBe(0);
    });

    it('NEGATIVE — and a mix is counted on both sides, not folded into one', () => {
        const controls = [
            control({ label: 'يعمل', worked: true, effect: 'dom' }),
            control({ label: 'ميت 1' }),
            control({ label: 'ميت 2' }),
            control({ label: 'غائب', effect: 'not found' }),
        ];
        const metrics: Record<string, any> = {};
        judgeBehaviour(controls as any, metrics, []);
        expect({ pressed: metrics.pressed, dead: metrics.dead, unreachable: metrics.unreachable })
            .toEqual({ pressed: 3, dead: 2, unreachable: 1 });
    });

    it('NEGATIVE — the dead ratio is taken over what was PRESSED, not over everything', () => {
        //  Two dead out of three pressed is 0.67 and must still fire. If the
        //  unreachable ones stayed in the denominator it would read 0.5 — the
        //  same defect in the other direction, hiding real dead buttons behind
        //  controls nobody could reach.
        const controls = [
            control({ label: 'يعمل', worked: true, effect: 'dom' }),
            control({ label: 'ميت 1' }),
            control({ label: 'ميت 2' }),
            ...Array.from({ length: 5 }, () => control({ label: 'غائب', effect: 'not found' })),
        ];
        const { findings } = judgeBehaviour(controls as any, {}, []);
        expect(findings.some(f => f.code === 'dead_controls')).toBe(true);
    });
});
