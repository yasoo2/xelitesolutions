/**
 * THE JUDGE READS THE PAGE, NOT THE LETTERS THE FILE HAPPENS TO CONTAIN.
 *
 * Both defects below were measured on the owner's own machine, on a live run of
 * a request he would plausibly type:
 *
 *     اعمل لي صفحة عنوانها "مصاريفي" فيها جدول أضيف عليه مصروف بمبلغ وتاريخ،
 *     ويظهر المجموع في الأسفل
 *
 * Joe built it correctly and then refused to deliver it. The user was told one
 * line: «توقّفت عند الخطوة Building — acceptance_criteria_unmet».
 *
 * 1. The title was never extracted. The Arabic openers knew «بعنوان» and nothing
 *    else, and no pattern looked at quotation marks — the safest boundary there
 *    is. `expectedText` came back undefined, the criterion fell back to «is there
 *    any heading at all», and answered «met» about a title it had never read.
 *
 * 2. «المجموع» maps to `counter`, and `counter` was proven only by an increment
 *    button. A sum over rows has no setter and no click, so a page that computed
 *    the total and displayed it was judged to have no total.
 *
 * One defect passed something unread; the other refused something correct. This
 * file holds both directions down, and every positive case here has the negative
 * case that makes it worth writing.
 */
import { acceptanceFor, titleEvidence, computedTotalEvidence } from '../core/quality/acceptance';

const titleOf = (request: string): string | undefined =>
    (acceptanceFor(request).find(c => c.id === 'title') as any)?.expectedText;

describe('INVARIANT: a quoted title is read out of the request', () => {
    test('the Arabic possessive form with quotes — the owner’s own wording', () => {
        expect(titleOf('اعمل لي صفحة عنوانها "مصاريفي" فيها جدول')).toBe('مصاريفي');
    });

    test('English quoted, and the reference prompt’s unquoted form, both still read', () => {
        expect(titleOf('Create one page titled "Gate 062" with a heading')).toBe('Gate 062');
        expect(titleOf('Create one polished page titled Gate 062 with a heading')).toBe('Gate 062');
    });

    test('IS NOT VACUOUS: a request that names no title yields none', () => {
        expect(titleOf('اعمل لي صفحة فيها زر وعداد')).toBeUndefined();
        expect(titleOf('Build a small project with a button')).toBeUndefined();
    });
});

/** What Joe actually generated for that request, reduced to the two lines that matter. */
const BOUND_HEADING = [
    'export const content = {',
    "  brand: 'مصاريفي',",
    '};',
    '<h1 className="app-name">{content.brand}</h1>',
].join(String.fromCharCode(10));

describe('INVARIANT: generated applications use a semantic document title', () => {
    test('the shared application shell emits a real h1 instead of an ARIA imitation', () => {
        const fs = require('fs');
        const path = require('path');
        const template = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'react-app-templates.ts'), 'utf8');
        expect(template).toContain('<h1 className="app-name">{displayName(content.brand)}</h1>');
        expect(template).not.toContain('className="app-name" role="heading" aria-level="1"');
    });
});

describe('INVARIANT: a heading bound to a value counts as that heading', () => {
    test('the binding resolves, one hop, to the requested name', () => {
        expect(titleEvidence(BOUND_HEADING, 'مصاريفي')).toBe(true);
    });

    test('IS NOT VACUOUS: a binding to a different name does not pass', () => {
        expect(titleEvidence(BOUND_HEADING, 'مشترياتي')).toBe(false);
    });

    test('IS NOT VACUOUS: the shipped Gate062 defect is still caught', () => {
        //  The builder welded «small» from «a small project» onto the title. The
        //  judge was right to refuse it, and must still refuse it.
        expect(titleEvidence('<h1>Gate062 — small</h1>', 'Gate 062')).toBe(false);
    });

    test('IS NOT VACUOUS: a heading with no title at all does not pass', () => {
        expect(titleEvidence('<h1 className="app-name">{content.brand}</h1>', 'مصاريفي')).toBe(false);
    });

    test('IS NOT VACUOUS: an unrelated object, comment, or string does not satisfy the binding', () => {
        const wrong = [
            "const unrelated = { brand: 'مصاريفي' };",
            "const content = { brand: 'مشترياتي' };",
            '<h1>{content.brand}</h1>',
        ].join(String.fromCharCode(10));
        const comment = [
            "// brand: 'مصاريفي'",
            "const content = { brand: 'مشترياتي' };",
            '<h1>{content.brand}</h1>',
        ].join(String.fromCharCode(10));
        const string = [
            'const note = "brand: \'مصاريفي\'";',
            "const content = { brand: 'مشترياتي' };",
            '<h1>{content.brand}</h1>',
        ].join(String.fromCharCode(10));
        expect(titleEvidence(wrong, 'مصاريفي')).toBe(false);
        expect(titleEvidence(comment, 'مصاريفي')).toBe(false);
        expect(titleEvidence(string, 'مصاريفي')).toBe(false);
    });
});

const SUMMED_AND_SHOWN = [
    'const total = rows.reduce((a, r) => a + Number(r.amount), 0);',
    '<b>{total.toLocaleString()}</b>',
].join(String.fromCharCode(10));

describe('INVARIANT: a total computed from the rows and shown is a total', () => {
    test('a fold that adds, rendered under its own name', () => {
        expect(computedTotalEvidence(SUMMED_AND_SHOWN)).toBe(true);
    });

    test('IS NOT VACUOUS: a fold that never reaches the screen does not pass', () => {
        expect(computedTotalEvidence('const total = rows.reduce((a, r) => a + r.amount, 0);')).toBe(false);
    });

    test('IS NOT VACUOUS: a reduce that does not add is not a total', () => {
        //  reduce also builds arrays and joins strings. Neither is a sum.
        expect(computedTotalEvidence([
            'const names = rows.reduce((a, r) => [...a, r.title], []);',
            '<b>{names.length}</b>',
        ].join(String.fromCharCode(10)))).toBe(false);
    });

    test('IS NOT VACUOUS: the word total in prose proves nothing', () => {
        expect(computedTotalEvidence('// shows the total at the bottom')).toBe(false);
    });

    test('IS NOT VACUOUS: concatenating labels is not a numeric total', () => {
        expect(computedTotalEvidence([
            "const total = rows.reduce((a, r) => a + r.label, '');",
            '<b>{total}</b>',
        ].join(String.fromCharCode(10)))).toBe(false);
    });

    test('the records engine proves a configured numeric sum bound to live rows and rendered', () => {
        expect(computedTotalEvidence([
            "const content = { metrics: [{ label: 'Total', kind: 'sum', field: 'amount' }] };",
            'function computeMetric(m, rows) { switch (m.kind) { case \'sum\': return rows.reduce((a, r) => a + num(r[m.field]), 0); } }',
            '<b>{computeMetric(m, rows)}</b>',
        ].join(String.fromCharCode(10)))).toBe(true);
    });

    test('a configured sum without the live-row renderer is not proven', () => {
        expect(computedTotalEvidence([
            "const content = { metrics: [{ label: 'Total', kind: 'sum', field: 'amount' }] };",
            "case 'sum': return rows.reduce((a, r) => a + num(r[m.field]), 0);",
        ].join(String.fromCharCode(10)))).toBe(false);
    });
});
