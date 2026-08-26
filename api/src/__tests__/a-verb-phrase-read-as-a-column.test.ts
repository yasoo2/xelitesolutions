/**
 * «ويطلع المجموع» IS SOMETHING THE PAGE DOES, NOT A COLUMN IN IT.
 *
 * Measured on a sentence shaped exactly the way the owner writes:
 *
 *     اعمل لي صفحة أسجل فيها مصاريفي ويطلع المجموع
 *
 *     columnsAnywhereInHisRequest  ->  ["مصاريفي", "يطلع المجموع"]
 *     detectAppKind                ->  "generic"     (should be "expenses")
 *
 * He asked for an expenses page that shows a total. The column reader took
 * «ويطلع المجموع» — a verb and its subject, a BEHAVIOUR — as the name of a
 * second column, and detectAppKind short-circuits on any derived column:
 *
 *     if (columnsAnywhereInHisRequest(request)?.length) return 'generic';
 *
 * So one misread phrase costs the whole archetype. The expenses engine knows
 * how to total a column; the generic one does not, and he gets a bare table.
 *
 * WHY IT SLIPPED: the definiteness test asks whether the item is a definite
 * name, and «يطلع المجموع» carries «المجموع» — definite, and not a function
 * word — so the phrase passed on the strength of its SECOND word. The first
 * word is a verb, and a column is never named by one.
 *
 * THE CLASS: this repository's first — evidence that matches the OCCURRENCE
 * OF A WORD instead of testing the claim. «min:» granted a tick from any
 * digit anywhere; «filter» proved a filter because it is an array method;
 * and here a definite noun anywhere in a phrase proved the phrase was a name.
 *
 * The negative cases are the boundary: a real column may still be two words
 * («اسم الصنف»), may be indefinite when it is a yes-or-no («مدفوع»), and a
 * verb-initial phrase that IS how he names a column must not be invented
 * away. Only the leading verb is refused.
 */

import { columnsAnywhereInHisRequest, detectAppKind } from '../core/design/app-blueprints';

const labels = (r: string) => (columnsAnywhereInHisRequest(r) || []).map((c: { label: string }) => c.label);

describe('a column is named by a noun, never by a verb', () => {
    it('POSITIVE — his expenses sentence reaches its own engine', () => {
        expect(detectAppKind('اعمل لي صفحة أسجل فيها مصاريفي ويطلع المجموع')).toBe('expenses');
    });

    it('POSITIVE — the behaviour is not read as a column', () => {
        expect(labels('اعمل لي صفحة أسجل فيها مصاريفي ويطلع المجموع'))
            .not.toContain('يطلع المجموع');
    });

    it('POSITIVE — and the same shape in other sentences', () => {
        for (const request of [
            'اعمل جدول مبيعات فيه اسم الصنف والسعر ويحسب الإجمالي',
            'اعمل جدول للطلبات فيه اسم الزبون والمبلغ وتظهر الحالة',
        ]) {
            for (const label of labels(request)) {
                expect({ request, label, startsWithVerb: /^(?:ي|ت|ن)[؀-ۿ]{2,}\s/.test(label) })
                    .toEqual({ request, label, startsWithVerb: false });
            }
        }
    });

    it('NEGATIVE — a two-word column is still a column', () => {
        //  «اسم الصنف» is a noun and its annexation. Refusing verb-initial
        //  phrases must not refuse these.
        expect(labels('اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر'))
            .toEqual(expect.arrayContaining(['اسم الصنف']));
    });

    it('NEGATIVE — a yes-or-no column is still a column', () => {
        //  «مدفوع» carries no «ال» and is a column all the same, marked
        //  another way. That exception already existed and must survive.
        expect(labels('بدي جدول أسجل فيه الفواتير: اسم الزبون والمبلغ ومدفوع'))
            .toEqual(expect.arrayContaining(['مدفوع']));
    });

    it('NEGATIVE — the two columns a LETTER rule ate', () => {
        //  The first attempt read the leading letter: an Arabic present-tense
        //  verb opens with ي ت ن or أ and carries no article. It threw these
        //  away at once, because both are nouns that open with those letters
        //  and no letter can tell. They stay here so no future widening can
        //  reintroduce it quietly.
        expect(labels('اعمل جدول للمرضى فيه اسم المريض وتاريخ الميلاد'))
            .toEqual(expect.arrayContaining(['تاريخ الميلاد']));
        expect(labels('اعمل جدول للمزرعة فيه اسم البقرة ونوع الحليب'))
            .toEqual(expect.arrayContaining(['نوع الحليب']));
    });

    it('NEGATIVE — a plain column list is untouched', () => {
        expect(labels('بدي جدول للعملاء فيه الاسم والهاتف والعنوان'))
            .toEqual(['الاسم', 'الهاتف', 'العنوان']);
    });

    it('NEGATIVE — and the archetype that a column list SHOULD override still is', () => {
        //  «A LIST HE WROTE OUTRANKS A NOUN HE HAPPENED TO USE» — that reading
        //  is correct and this fix must not weaken it.
        expect(detectAppKind(
            'عندي عيادة أسنان، أريد جدولاً فيه اسم المريض ورقم تلفونه وتاريخ الموعد',
        )).toBe('generic');
    });
});
