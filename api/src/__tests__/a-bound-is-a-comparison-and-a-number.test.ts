/**
 * A BOUND IS A COMPARISON AND A NUMBER, NOT A PHRASE SOMEONE REMEMBERED.
 *
 * Six ways of saying one constraint; two were understood:
 *
 *     «وارفض المبلغ إذا كان صفر أو أقل»    → no bound
 *     «المبلغ يجب أن يكون موجباً فقط»       → no bound
 *     «الكمية لا تقل عن 1»                 → no bound
 *     «المبلغ أكبر من الصفر»               → min 0, exclusive
 *     "rejects non-positive amounts"       → min 0, exclusive
 *
 * The four that failed are the ones he is most likely to type — and «موجباً
 * فقط» failed against a pattern that knew «موجب فقط», the same word wearing a
 * tanween.
 *
 * A bound is not a phrase. It is a COMPARISON and a NUMBER, and both are
 * closed classes: there are only so many ways to say greater, at least, or
 * less, and only so many digits. The subtlety is which SIDE he named — «أكبر
 * من ١٠» names what is allowed, «ارفض ما هو أقل من ١٠» names what is refused,
 * and «١٠ أو أقل» refuses the ten itself. Three readings, one number.
 *
 * Measuring it also caught a defect this repository has a name for: the reader
 * took ninety-six characters around each field name, so «الكمية لا تقل عن 1»
 * put a floor of one on «السعر» too — a haystack big enough to contain every
 * needle. A sentence owns its own constraint.
 */

import { blueprintFor, applyRequestFieldConstraints, statedBound } from '../core/design/app-blueprints';

const bounds = (request: string): string[] => {
    const isAr = /[\u0600-\u06FF]/.test(request);
    const bp = applyRequestFieldConstraints(blueprintFor('generic' as never, request, isAr), request);
    return bp.fields.map(f => `${f.label}${f.min !== undefined ? `[${f.min}${f.minExclusive ? '<' : '≤'}]` : ''}`);
};

describe('the bound is the one he stated', () => {
    // POSITIVE — every natural phrasing, in both languages, on the right field.
    it.each([
        ['صفر أو أقل', 'بدي أتابع ديوني: اسم المدين والمبلغ والتاريخ. وارفض المبلغ إذا كان صفر أو أقل.', 'المبلغ[0<]'],
        ['موجباً فقط', 'بدي جدول أسجل فيه الفواتير: البند والمبلغ والتاريخ. المبلغ يجب أن يكون موجباً فقط.', 'المبلغ[0<]'],
        ['أكبر من الصفر', 'بدي جدول أسجل فيه المصاريف: البند والمبلغ والتاريخ. المبلغ أكبر من الصفر.', 'المبلغ[0<]'],
        ['لا تقل عن 1', 'بدي جدول أسجل فيه الطلبات: الصنف والكمية والسعر. الكمية لا تقل عن 1.', 'الكمية[1≤]'],
        ['رقم عربي ٥', 'بدي جدول أسجل فيه الطلبات: الصنف والكمية والسعر. الكمية لا تقل عن ٥.', 'الكمية[5≤]'],
        ['أقل من 10', 'بدي جدول أسجل فيه الطلبات: الصنف والكمية والسعر. ارفض الكمية إذا كانت أقل من 10.', 'الكمية[10≤]'],
        ['non-positive', 'I want to track my expenses: item, amount and date. Validation that rejects non-positive amounts.', 'amount[0<]'],
        ['at least 2', 'I want to track my orders: item, quantity and price. Quantity at least 2.', 'quantity[2≤]'],
    ])('%s', (_label, request, expected) => {
        expect(bounds(request)).toContain(expected);
    });

    // POSITIVE — the three readings of one number, at the level of the reader.
    it.each([
        ['أكبر من 10 — allowed side', 'المبلغ أكبر من 10', 10, true],
        ['10 أو أقل — refused, inclusive', 'ارفض المبلغ إذا كان 10 أو أقل', 10, true],
        ['أقل من 10 — refused, exclusive', 'ارفض المبلغ إذا كان أقل من 10', 10, false],
        ['لا يقل عن 10', 'المبلغ لا يقل عن 10', 10, false],
    ])('%s', (_label, sentence, min, exclusive) => {
        expect(statedBound(sentence)).toEqual({ min, minExclusive: exclusive });
    });

    // NEGATIVE — a constraint belongs to the sentence that names its field.
    it('a bound on one column does not leak onto its neighbour', () => {
        const out = bounds('بدي جدول أسجل فيه الطلبات: الصنف والكمية والسعر. الكمية لا تقل عن 1.');
        expect(out).toContain('الكمية[1≤]');
        expect(out).toContain('السعر');
        expect(out).not.toContain('السعر[1≤]');
    });

    // NEGATIVE — no constraint stated, no constraint invented.
    it.each([
        ['بلا شرط', 'بدي جدول أسجل فيه المصاريف: البند والمبلغ والتاريخ.'],
        ['English', 'I want to track my expenses: item, amount and date.'],
    ])('%s invents no bound', (_label, request) => {
        expect(bounds(request).join('|')).not.toMatch(/[[]/);
    });

    // NEGATIVE — a sentence with no comparison and no number states nothing.
    it.each([
        ['وصف', 'المبلغ مهم جداً في هذا الجدول'],
        ['English', 'the amount should look nice'],
        ['رفض الأعلى', 'ارفض المبلغ إذا كان أكبر من 500'],
    ])('%s is not a lower bound', (_label, sentence) => {
        expect(statedBound(sentence)).toBeNull();
    });
});
