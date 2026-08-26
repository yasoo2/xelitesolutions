/**
 *  A COLUMN HE NAMED BECAME A TABLE.
 *
 *  Straight out of inferModel, on his own sentences:
 *
 *      «بدي جدول للموظفين فيه الاسم والراتب»
 *      → tables: employees · salaries
 *
 *      «بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ»
 *      → tables: invoices · mblghs · tarykhs
 *
 *      «بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم»
 *      → tables: softwares · tlfwnathms · anawynhms
 *
 *  He asked for one table with two columns and got two tables. The keys
 *  are transliterated out of his own words because no dictionary carries
 *  «تلفوناتهم» as a noun — it is not a noun, it is a column of one.
 *
 *  And the first table's Arabic name is his request with the end cut off,
 *  which is where every truncated title in every generated app was coming
 *  from: blueprintFromEntity sets `title: e.ar`, so «بدي جدول للفواتير فيه
 *  رقم الفاتورة» was printed as the name of his application.
 *
 *  Two readers in this repository already knew the answer. derivedColumns
 *  returns his columns; recordedSubject returns his word for the thing
 *  that holds them. This one was reading the same sentence a third way,
 *  which is how three answers to one question appear.
 *
 *  THE CASE THAT IS GENUINELY SEVERAL TABLES, told apart without a word
 *  list: the container word is the same in both sentences, and what
 *  differs is how many times he wrote it. Once in front of the list means
 *  one table; once in front of EVERY item means one table each.
 */
import { inferModel } from '../core/design/entity-inference';

const keys = (request: string) => inferModel(request).entities.map(e => e.key);
const first = (request: string) => inferModel(request).entities[0];

describe('one table, when that is what he described', () => {
    const ONE: Array<[string, string, string[]]> = [
        ['بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ', 'الفواتير',
            ['رقم الفاتورة', 'المبلغ', 'التاريخ']],
        ['بدي جدول للموظفين فيه الاسم والراتب', 'الموظفين', ['الاسم', 'الراتب']],
        ['بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم', 'زبائني',
            ['زبائني', 'ارقام تلفوناتهم', 'عناوينهم']],
    ];
    for (const [request, name, labels] of ONE) {
        it(`«${name}» is one table with ${labels.length} columns`, () => {
            const model = inferModel(request).entities;
            expect(model).toHaveLength(1);
            expect(model[0].ar).toBe(name);
            expect(model[0].fields.map(f => f.ar)).toEqual(labels);
        });
    }

    it('the table name is never his sentence', () => {
        //  The property that failed. Whatever the name is, it is not the
        //  opening of the request he typed.
        for (const [request] of ONE) {
            expect(request.startsWith(String(first(request).ar))).toBe(false);
        }
    });

    it('a word this repository has never seen is read the same way', () => {
        const model = inferModel('بدي جدول للزُرقمونيات فيه الاسم والكمية والسعر').entities;
        expect(model).toHaveLength(1);
        expect(model[0].ar).toBe('الزُرقمونيات');
        expect(model[0].fields.map(f => f.ar)).toEqual(['الاسم', 'الكمية', 'السعر']);
    });

    it('the number column keeps its type', () => {
        const model = inferModel('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ').entities;
        const amount = model[0].fields.find(f => f.ar === 'المبلغ');
        expect(amount?.type).toBe('REAL');
    });
});

describe('…and several tables, when he wrote the container in front of each', () => {
    it('three tables named one by one', () => {
        expect(keys('بدي نظام للمدرسة فيه جدول الطلاب وجدول المعلمين وجدول الصفوف'))
            .toEqual(['students', 'teachers', 'alsfwfs']);
    });

    it('the same shape with an invented noun', () => {
        //  «الزُرقمونيات» is not a word. Three tables because he wrote
        //  «جدول» three times, not because any of them is recognised.
        const out = keys('بدي نظام فيه جدول الطلاب وجدول الزُرقمونيات وجدول المعلمين');
        expect(out).toHaveLength(3);
        expect(out[0]).toBe('students');
    });
});

describe('and a request that describes no table is untouched — including its defects', () => {
    it('a shop that names its own domain still reads as a domain', () => {
        //  No explicit column list, so the path below this one runs.
        expect(keys('Build a shop with products, orders and customers tables')).toEqual(['tables']);
    });

    it('a greeting still becomes a table — an OLDER defect, measured not assumed', () => {
        //  Not caused by this change and not fixed by it. Measured both
        //  ways: with the change stashed, «مرحبا» gives the identical
        //  entity, and «ما الفرق بين قاعدة البيانات والجدول؟» gives
        //  the identical two. Writing it down here so the next reader
        //  finds a record instead of a surprise.
        //
        //  The harm is bounded upstream rather than here: inferModel is
        //  reached under a build intent, and neither of these is one.
        expect(inferModel('مرحبا').entities.map(e => e.ar)).toEqual(['مرحبا']);
        expect(inferModel('ما الفرق بين قاعدة البيانات والجدول؟').entities).toHaveLength(2);
    });
});
