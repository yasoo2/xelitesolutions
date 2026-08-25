/**
 *  AN ENTITY AND ITS ATTRIBUTES, NAMED BY GRAMMAR ALONE.
 *
 *  A live rung, and it returned nothing at all:
 *
 *      «بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم»
 *      → null → no schema → a memorised template
 *
 *  He named no container: «برنامج» holds an app, not records. And «حفظ»
 *  is a stem the opener list has never held. Adding it would have fixed
 *  this one sentence, and the next man writes «يخزّن» or «يمسك» and we are
 *  back here with a longer list. Nouns and verbs are open sets — no list
 *  of them is ever finished.
 *
 *  But he DID mark the shape, in grammar. «زبائني» is MINE. «تلفوناتهم»
 *  and «عناوينهم» are THEIRS, and the «هم» points back at the clients he
 *  just named. A run whose later members BELONG TO the first member is an
 *  entity and its attributes, which is what a table is. The agreement
 *  says it; no verb and no container are needed to hear it.
 *
 *  Pronouns and agreement are a CLOSED set — they can be written down
 *  completely, which is the whole difference between this and a word
 *  list. That is why the tests below use a verb and a noun that exist
 *  nowhere in this repository and it still reads them.
 *
 *  It is the last path tried, so it can only add readings the other two
 *  refused, and it stays strict for that reason.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('the pronoun points back, so the run is a table', () => {
    it('the rung that returned nothing', () => {
        expect(labels('بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم'))
            .toEqual(['زبائني', 'ارقام تلفوناتهم', 'عناوينهم']);
    });

    it('a verb this repository has never seen reads the same way', () => {
        //  «يزقمل» is not a word. If a verb list were doing the reading,
        //  this would return nothing.
        expect(labels('بدي برنامج يزقمل لي موظفيني ورواتبهم واقسامهم'))
            .toEqual(['موظفيني', 'رواتبهم', 'اقسامهم']);
    });

    it('a noun this repository has never seen reads the same way', () => {
        expect(labels('اعمل لي تطبيق يخزّن زُرقمونياتي واسعارها واوزانها'))
            .toEqual(['زُرقمونياتي', 'اسعارها', 'اوزانها']);
    });

    it('the run begins at the last name in the opening fragment', () => {
        //  Reading forward would stop at «بدي», which ends in «ي» and looks
        //  owned but is the verb he asked with.
        expect(labels('بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم')[0])
            .toBe('زبائني');
    });
});

describe('…and a run that points nowhere is still prose', () => {
    const REFUSED: Array<[string, string]> = [
        ['every name is his own — nothing points back', 'زرت اصدقائي واهلي وجيراني'],
        ['the same, with a verb of liking', 'احب قهوتي وشايي وعصيري'],
        ['a question', 'ما الفرق بين قاعدة البيانات والجدول؟'],
        ['a request with no run at all', 'ابن موقعا لمطعمي'],
        ['a list of values after a field noun', 'متجر بفئات: قهوة، أدوات، حلويات'],
        ['a greeting', 'مرحبا'],
        ['two items are not a run', 'بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم'],
    ];
    for (const [name, request] of REFUSED) {
        it(name, () => expect(derivedColumns(request)).toBeNull());
    }
});

describe('the two paths in front of it are untouched', () => {
    const UNMOVED: Array<[string, string[]]> = [
        ['بدي جدول للكتب فيه العنوان والسعر', ['العنوان', 'السعر']],
        ['بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد',
            ['اسم المريض', 'رقم تلفونه', 'وقت الموعد']],
        ['A clients table with name, phone and address', ['name', 'phone', 'address']],
        ['بدي جدول للطلاب فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة',
            ['الاسم', 'الصف', 'الدرجة']],
    ];
    for (const [request, expected] of UNMOVED) {
        it(request.slice(0, 44), () => expect(labels(request)).toEqual(expected));
    }
});
