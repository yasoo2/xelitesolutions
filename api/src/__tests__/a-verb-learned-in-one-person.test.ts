/**
 *  A VERB WAS LEARNED IN ONE PERSON.
 *
 *  He can write the verb about himself, or about the thing he is asking
 *  for. Same verb, same request, same three columns:
 *
 *      «بدي برنامج أتابع فيه الطلبات والمبلغ والتاريخ»  → 3 columns
 *      «بدي برنامج يتابع الطلبات والمبلغ والتاريخ»      → null
 *
 *  The opener list held «أتابع» and «اتابع» and stopped there, so the
 *  second sentence read as no request at all and fell through to a
 *  memorised template.
 *
 *  «يسجل» hid this for a while by accident: it contains «سجل», which is a
 *  container NOUN, so it matched RECORD_CONTAINER and took the other
 *  branch entirely. «يتابع» and «يدير» contain no such noun.
 *
 *  The fix is morphology, not vocabulary — Arabic builds the imperfect by
 *  putting a person on the front of a stem — and the guard below is the
 *  proof of that claim: it walks all four persons across the stems the
 *  list already had, and adds no word the list did not already know.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

const STEMS: Array<[string, string]> = [
    ['تابع', 'الطلبات والمبلغ والتاريخ'],
    ['دير', 'المخزون والكمية والسعر'],
    ['نظم', 'المواعيد والاسم والتاريخ'],
    ['ضيف', 'الصنف والكمية والسعر'],
];

describe('the same verb, in every person he might write it', () => {
    for (const [stem, tail] of STEMS) {
        for (const person of ['أ', 'ا', 'ي', 'ت', 'ن']) {
            it(`«${person}${stem}» opens the list`, () => {
                const request = `بدي برنامج ${person}${stem} ${tail}`;
                expect(labels(request)).toEqual(tail.split(/\s+و/));
            });
        }
    }
});

describe('the first person still works — nothing was traded away', () => {
    it('«أسجل فيه» with a colon reads the clinic request', () => {
        expect(labels('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'))
            .toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد']);
    });

    it('the English openers are untouched', () => {
        expect(labels('A tracker to record item name, quantity and price'))
            .toEqual(['item name', 'quantity', 'price']);
    });

    it('«يحتوي على» and «تحتوي على» both open the list', () => {
        expect(labels('بدي جدول يحتوي على الاسم والهاتف والعنوان'))
            .toEqual(['الاسم', 'الهاتف', 'العنوان']);
        expect(labels('بدي قائمة تحتوي على الاسم والهاتف والعنوان'))
            .toEqual(['الاسم', 'الهاتف', 'العنوان']);
    });
});

describe('…and a person prefix is not a licence to read anything', () => {
    it('a verb with no run of names after it is still not a schema', () => {
        expect(derivedColumns('بدي برنامج يتابع الطلبات')).toBeNull();
    });

    it('a run of values after a verb the list never knew is refused', () => {
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
    });

    it('prose with no container and no opener is refused', () => {
        expect(derivedColumns('ابن موقعا لمطعمي')).toBeNull();
    });
});
