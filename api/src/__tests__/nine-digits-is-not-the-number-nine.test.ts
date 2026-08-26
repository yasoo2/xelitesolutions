/**
 * «لا تقبل رقم هاتف أقل من ٩ أرقام» BECAME «not less than nine».
 *
 * Measured on the shop he asked for, through the readers themselves:
 *
 *     statedBound('لا تقبل رقم هاتف أقل من ٩ أرقام')  → { min: 9 }
 *     statedBound('لا تقبل سعرًا أقل من ٩')            → { min: 9 }
 *
 * The same answer for two different rules. «٩ أرقام» is NINE DIGITS: a phone
 * number of «12» satisfies a floor of nine and he had just forbidden anything
 * shorter than nine digits. The word after the number says what is being
 * counted, and dropping it turns his rule into a different rule that happens
 * to use the same digit.
 *
 * And it never reached the column anyway. «رقم الهاتف» is a `tel` field, and
 * the loop that attaches floors only ever touched `number` fields — so the
 * rule was read, classed as a bound, and then dropped for want of a number to
 * sit on. The delivery blocked itself honestly on it («acceptance_criteria_
 * unmet: rule:2»), which is why this was findable at all.
 *
 * The class: A BOUND ON THE COUNT OF SOMETHING READ AS A BOUND ON THE VALUE.
 * It is kept apart from the value floor rather than folded into it, because
 * the two attach to different fields — merging them is exactly how the
 * counted unit got lost.
 */

import { statedBound, statedLengthBound, statedRules, applyStatedRules, columnsAnywhereInHisRequest } from '../core/design/app-blueprints';

const ORDERS = 'وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية. لا تقبل رقم هاتف أقل من ٩ أرقام.';

describe('a count of digits is not a value', () => {
    it('«٩ أرقام» is a length, and no longer a floor of nine', () => {
        expect(statedLengthBound('لا تقبل رقم هاتف أقل من ٩ أرقام')).toEqual({ minLength: 9 });
        expect(statedBound('لا تقبل رقم هاتف أقل من ٩ أرقام')).toBeNull();
    });

    it('and a plain number is still a plain floor', () => {
        //  The negative case that keeps the cure from eating the disease: a
        //  bound with no counted unit must stay exactly what it was.
        expect(statedBound('لا تقبل سعرًا أقل من ٩')).toEqual({ min: 9, minExclusive: false });
        expect(statedLengthBound('لا تقبل سعرًا أقل من ٩')).toBeNull();
    });

    it.each([
        ['أرقام', 'لا تقبل رقم هاتف أقل من ٩ أرقام', 9],
        ['خانات', 'ارفض الرقم أقل من 10 خانات', 10],
        ['أحرف', 'لا تقبل اسمًا أقل من 3 أحرف', 3],
        ['digits', 'reject a phone shorter than 9 digits', 9],
        ['characters', 'at least 4 characters', 4],
    ])('the unit is read in either language: %s', (_n, sentence, want) => {
        expect(statedLengthBound(sentence)).toEqual({ minLength: want });
    });

    it('a nonsense length is refused rather than believed', () => {
        //  A guard that accepts any number would put minLength=900 on a field
        //  nobody could ever fill.
        expect(statedLengthBound('لا تقبل أقل من 900 حرف')).toBeNull();
        expect(statedLengthBound('لا تقبل أقل من 0 أرقام')).toBeNull();
    });
});

describe('and it lands on the field he named', () => {
    it('«رقم الهاتف» carries the length, though it is not a number field', () => {
        const cols = columnsAnywhereInHisRequest(ORDERS) || [];
        const { fields, unapplied } = applyStatedRules(cols as any, statedRules(ORDERS));
        const phone: any = (fields as any[]).find(f => f.label === 'رقم الهاتف');
        expect(phone).toBeDefined();
        expect(phone.type).toBe('tel');
        expect(phone.minLength).toBe(9);
        //  Nothing left over: a rule in `unapplied` is a rule he was never told about.
        expect(unapplied).toHaveLength(0);
    });

    it('and no other column is touched', () => {
        const cols = columnsAnywhereInHisRequest(ORDERS) || [];
        const { fields } = applyStatedRules(cols as any, statedRules(ORDERS));
        for (const f of fields as any[]) {
            if (f.label !== 'رقم الهاتف') expect(f.minLength).toBeUndefined();
        }
    });
});
