/**
 *  ONE SENTENCE, TWO READERS, ONE OF THEM NEVER TAUGHT.
 *
 *  Live round:
 *
 *      «بدي برنامج اسجل فيه اسم الطالب وصفه ودرجته»
 *      → columns: «فيه اسم الطالب» · «صفه» · «درجته»
 *
 *  A column called «فيه». Two paths in derivedColumns find the same list:
 *  one when a recording verb opens it, one when only the container does.
 *  Whatever stood between the container and the list sticks to the first
 *  item, and only ONE of the two paths had ever been taught to strip it.
 *  The other was the one his sentence took.
 *
 *  The second half of the same defect: the taught path looked for «ال» and
 *  nothing else, so a name marked definite the OTHER way Arabic marks it —
 *  a possessive suffix — was invisible:
 *
 *      «بدي جدول يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم»
 *      → columns: «يحفظ لي زبائني» · …
 *
 *  A verb as a column label. everyItemIsADefiniteName knows all three
 *  marks; the trim beside it knew one.
 *
 *  What is stripped is a CLOSED class — prepositions, relatives, articles.
 *  A closed class can be written down honestly. Content words cannot, and
 *  guessing at them is exactly how a verb becomes a column.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('the connector is not a column', () => {
    it('«فيه» left standing after «اسجل» is stripped, not labelled', () => {
        expect(labels('بدي برنامج اسجل فيه اسم الطالب وصفه ودرجته'))
            .toEqual(['اسم الطالب', 'صفه', 'درجته']);
    });

    it('a run of function words is stripped, not just one', () => {
        expect(labels('بدي جدول اسجل فيه لي الاسم والهاتف والعنوان'))
            .toEqual(['الاسم', 'الهاتف', 'العنوان']);
    });

    it('a verb before a possessive name is not the name', () => {
        expect(labels('بدي جدول يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم'))
            .toEqual(['زبائني', 'ارقام تلفوناتهم', 'عناوينهم']);
    });

    it('a word this repository never saw is stripped the same way', () => {
        //  If a catalogue of nouns were doing the work, «زُرقمونياتي» would
        //  not be found. It is found because it carries a possessive.
        expect(labels('بدي جدول يحفظ لي زُرقمونياتي واسعارها واوزانها'))
            .toEqual(['زُرقمونياتي', 'اسعارها', 'اوزانها']);
    });
});

describe('…and the cleaner does not eat his words', () => {
    it('an idafa he wrote after a colon survives whole', () => {
        //  «اسم المريض» is his label. Cutting to the article would hand him
        //  a column called «المريض» and throw away «اسم».
        expect(labels('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'))
            .toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد']);
    });

    it('the container\u2019s own subject is still cut away', () => {
        expect(labels('بدي جدول للمصاريف يحوي التاريخ والمبلغ والسبب'))
            .toEqual(['التاريخ', 'المبلغ', 'السبب']);
    });

    it('a first item that needs nothing stripped is returned untouched', () => {
        expect(labels('بدي جدول للكتب فيه العنوان والسعر')).toEqual(['العنوان', 'السعر']);
    });

    it('a two-word label with no function word in front survives', () => {
        expect(labels('بدي جدول للزبائن فيه الاسم ورقم التلفون والعنوان'))
            .toEqual(['الاسم', 'رقم التلفون', 'العنوان']);
    });
});

describe('the English half of the same cleaner still runs', () => {
    it('«with» is stripped and the columns are read', () => {
        expect(labels('A clients table with name, phone and address'))
            .toEqual(['name', 'phone', 'address']);
    });

    it('a list of values is still refused', () => {
        expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
    });
});
