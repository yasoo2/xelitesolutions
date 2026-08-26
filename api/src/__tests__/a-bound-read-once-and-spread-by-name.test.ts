/**
 *  A BOUND READ ONCE AND SPREAD BY NAME.
 *
 *  Manus measured it on a built artifact and named the class. Reproduced
 *  here on one sentence:
 *
 *      «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *
 *      from blueprintFor                   السعر min 0 · الكمية none
 *      after applyRequestFieldConstraints   السعر min 0 · الكمية min 0
 *
 *  He said the PRICE may not be zero. The quantity got the same floor —
 *  a rule he never wrote, refusing rows he meant to keep.
 *
 *  boundsByField split the request on «.؟!» and his request has no full
 *  stop, so the whole thing was one clause, and every numeric field whose
 *  LABEL appeared anywhere in it was stamped. «الكمية» appears because he
 *  listed it as a column — which is what listing a column means.
 *
 *  statedRules already read this correctly: it splits on «،» and «؛» too,
 *  so a rule is the clause that states it, and the field is the definite
 *  noun that clause OPENS with. Two readers for one rule, and the older
 *  one had no clause boundary at all.
 *
 *  THE FIELDS BELOW ARE BUILT BARE ON PURPOSE. A first version of this
 *  guard passed a real blueprint, and blueprintFor had ALREADY attached
 *  the bound through the other reader — so emptying the rule list killed
 *  nothing and the guard was measuring a function it never reached.
 *  Bare fields make this function the only thing that can add a bound.
 */
import { applyRequestFieldConstraints } from '../core/design/app-blueprints';
import type { AppBlueprint, AppField } from '../core/design/app-blueprints';

const table = (...labels: Array<[string, AppField['type']]>): AppBlueprint => ({
    fields: labels.map(([label, type], i) => ({ key: `${type === 'number' ? 'num' : 'txt'}${i + 1}`, label, type })),
} as unknown as AppBlueprint);

const SALES = table(['اسم الصنف', 'text'], ['الكمية', 'number'], ['السعر', 'number']);

const bounded = (bp: AppBlueprint, request: string) =>
    applyRequestFieldConstraints(bp, request).fields
        .filter(f => f.min !== undefined)
        .map(f => `${f.label}:${f.min}${f.minExclusive ? '<' : '<='}`);

describe('the bound lands on the field his clause named, and nowhere else', () => {
    it('a price floor does not become a quantity floor', () => {
        expect(bounded(SALES, 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر'))
            .toEqual(['السعر:0<']);
    });

    it('«لا تقل عن» is a floor he may stand on', () => {
        //  ≥, not >: the difference is his word, and it reaches the field.
        expect(bounded(SALES, 'بدي جدول مبيعات فيه الكمية والسعر، والكمية لا تقل عن 5'))
            .toEqual(['الكمية:5<=']);
    });

    it('two clauses, two fields, each its own', () => {
        expect(bounded(SALES, 'بدي جدول للطلبات فيه الكمية والسعر، والكمية لا تقل عن 2، والسعر أكبر من 10'))
            .toEqual(['الكمية:2<=', 'السعر:10<']);
    });

    it('a trade this repository has never heard of binds the same way', () => {
        const t = table(['الاسم', 'text'], ['الوزن', 'number'], ['السعر', 'number']);
        expect(bounded(t, 'بدي جدول للزُرقمونيات فيه الاسم والوزن والسعر، والوزن لا يقبل صفر'))
            .toEqual(['الوزن:0<']);
    });
});

describe('…and a request that states no rule binds nothing', () => {
    it('columns alone are not a constraint', () => {
        expect(bounded(SALES, 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر')).toEqual([]);
    });

    it('a numeric type alone never invents a floor', () => {
        const t = table(['رقم الفاتورة', 'text'], ['المبلغ', 'number'], ['التاريخ', 'date']);
        expect(bounded(t, 'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ')).toEqual([]);
    });

    it('a rule about something that is not a column binds nothing', () => {
        expect(bounded(SALES, 'بدي جدول مبيعات فيه اسم الصنف والكمية، والخدمة لا تقبل صفر')).toEqual([]);
    });

    it('a rule cannot land on a text column', () => {
        //  «اسم الصنف» is his, and it is text. A floor under a name is not
        //  a rule — it is a refusal he never asked for.
        expect(bounded(SALES, 'بدي جدول مبيعات فيه اسم الصنف والسعر، واسم الصنف لا يقبل صفر'))
            .toEqual([]);
    });
});
