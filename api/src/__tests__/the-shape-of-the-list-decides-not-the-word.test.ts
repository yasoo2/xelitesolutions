/**
 *  THE SHAPE OF THE LIST DECIDES, NOT THE WORD IN FRONT OF IT.
 *
 *  Measured on `origin/main`, five ways of writing ONE sentence:
 *
 *      «بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب»    → 3 columns
 *      «بدي جدول للمصاريف يحوي التاريخ والمبلغ والسبب»   → null
 *      «بدي جدول للمصاريف مع التاريخ والمبلغ والسبب»     → null
 *      «بدي جدول للمصاريف أعمدته التاريخ والمبلغ والسبب» → null
 *      «بدي جدول للمصاريف: التاريخ والمبلغ والسبب»       → null
 *
 *  One connector was on the reader's list and four were not, and he would
 *  have had to guess which. That is the fourth law broken inside the one
 *  function written to keep it:
 *
 *      «جو يبني من الطلب لا من الكتالوج»
 *
 *  Widening the list of connectors would be the same disease with a longer
 *  prescription. So the ITEMS decide, and Arabic states it plainly: a list of
 *  columns is DEFINITE — «التاريخ» «اسم المريض» «رقم تلفونه» — and a list of
 *  values is INDEFINITE — «قهوة» «أدوات» «حلويات».
 *
 *  The negative cases below are not decoration. The old guard existed because
 *  reading a bare colon once turned «متجر بفئات: قهوة، أدوات، حلويات» into
 *  five columns and threw away the shop's real schema. Every one of those
 *  failures is a case here, and every one must still be rejected — by shape
 *  now, not because a word was blacklisted.
 */

import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('the same request, written five ways, reads the same', () => {
    //  POSITIVE — four of these five returned nothing before.
    it.each([
        ['a bare colon', 'بدي جدول للمصاريف: التاريخ والمبلغ والسبب'],
        ['«يحوي»', 'بدي جدول للمصاريف يحوي التاريخ والمبلغ والسبب'],
        ['«مع»', 'بدي جدول للمصاريف مع التاريخ والمبلغ والسبب'],
        ['«أعمدته»', 'بدي جدول للمصاريف أعمدته التاريخ والمبلغ والسبب'],
        ['«فيه» — the one that always worked', 'بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب'],
    ])('%s gives the three columns he named', (_why, request) => {
        expect(labels(request)).toEqual(['التاريخ', 'المبلغ', 'السبب']);
    });

    //  POSITIVE — and the sentence he has been measured against all along is
    //  untouched. A fix that reads new requests by breaking an old one is a
    //  trade, not a repair.
    it('the clinic request still reads its five columns', () => {
        expect(labels('عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.'))
            .toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد', 'نوع العلاج', 'المبلغ المدفوع']);
    });

    //  POSITIVE — the item is the name, not the sentence that led to it.
    it('does not drag the words between the table and the list into the first column', () => {
        for (const r of [
            'بدي جدول للمصاريف يحوي التاريخ والمبلغ والسبب',
            'بدي جدول للمصاريف مع التاريخ والمبلغ والسبب',
        ]) {
            expect(labels(r)[0]).toBe('التاريخ');
        }
    });
});

describe('a constraint is not a column', () => {
    //  POSITIVE — the three names survive.
    //  NEGATIVE — the rule he attached does not become a fourth field with a
    //  whole clause for a label, which is what the app printed an input box
    //  for before this.
    it('drops the rule he attached to the end of the list', () => {
        const got = labels('جدول مبيعات فيه اسم الصنف والكمية والسعر، وما يقبل مبلغ صفر');
        expect(got).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
        expect(got.join(' ')).not.toContain('يقبل');
    });

    /**
     *  THE FIRST VERSION OF THESE THREE CASES WAS VACUOUS, AND A LIVE ROUND
     *  CAUGHT IT WHERE THE SUITE COULD NOT.
     *
     *  They asserted «no label matches /لا|يجب/» — which an EMPTY list
     *  satisfies perfectly. And empty is exactly what the reader returned:
     *  asking «is every item a name?» of a list with one rule at its end
     *  threw the three real columns away with it. The suite went green while
     *  Joe built a memorised expense template on his screen:
     *
     *      he wrote:  التاريخ · المبلغ · السبب
     *      Joe built: Item · Amount · Category · Date · Note · Total
     *
     *  So each case now says WHICH columns must come back. A test that only
     *  forbids is a test that passes on nothing at all.
     */
    it.each([
        ['بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب، والمبلغ لا يقبل صفر', ['التاريخ', 'المبلغ', 'السبب']],
        ['بدي جدول للمصاريف: التاريخ والمبلغ والسبب، والمبلغ لا يقبل صفر', ['التاريخ', 'المبلغ', 'السبب']],
        ['بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب، ويجب ألا يكون فارغاً', ['التاريخ', 'المبلغ', 'السبب']],
    ])('%s keeps its columns and drops its rule', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });

    //  NEGATIVE — and a list that is ALL rules is not a schema with the rules
    //  filtered out; it is not a schema at all.
    it('a list of nothing but rules is not a table', () => {
        expect(derivedColumns('بدي جدول للمصاريف: لا يقبل صفر، ولا يقبل فارغ، ويجب التاريخ')).toBeNull();
    });
});

describe('a list of values is still not a list of columns', () => {
    //  NEGATIVE — each of these is a real failure this reader was hardened
    //  against, and each must stay rejected now that the gate is shape and
    //  not vocabulary.
    it.each([
        ['the shop that lost its schema', 'متجر بفئات: قهوة، أدوات، حلويات'],
        ['sizes', 'قائمة بمقاسات: صغير، وسط، كبير'],
        ['cities carrying the article inside proper names', 'جدول بمدن: الرياض، جدة، الدمام'],
        ['prose about the weather', 'الطقس اليوم جميل والشمس مشرقة والجو معتدل'],
        ['a question', 'ما الفرق بين الجدول والقائمة والسجل؟'],
    ])('%s is not read as a schema', (_why, request) => {
        expect(derivedColumns(request)).toBeNull();
    });

    //  NEGATIVE — the English UI requirements that once became seven columns
    //  of a user record, and made the whole app read as `generic`.
    it('a page description is not a schema', () => {
        expect(derivedColumns('a page with a visible city search field with a Search button, Enter-key submission, reject empty input, show loading state')).toBeNull();
    });

    //  NEGATIVE — and a definite list with nothing to hold it is prose. The
    //  container has to be named, or every sentence in Arabic is a table.
    it('a list of definite nouns with no table named is not a schema', () => {
        expect(derivedColumns('التاريخ والمبلغ والسبب')).toBeNull();
        expect(derivedColumns('أخبرني عن التاريخ والمبلغ والسبب')).toBeNull();
    });
});
