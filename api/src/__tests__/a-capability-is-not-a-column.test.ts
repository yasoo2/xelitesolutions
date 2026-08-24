/**
 *  A CAPABILITY HE ASKED FOR IS NOT A COLUMN.
 *
 *  Four of his own sentences, measured:
 *
 *      «…فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة»
 *      → الاسم · الصف · الدرجة · «مع بحث بالاسم» · «ترتيب بالدرجة»
 *
 *      «…فيه رقم الفاتورة والمبلغ والتاريخ، واعرض لي المجموع»
 *      → … · «واعرض لي المجموع»
 *
 *      «…فيه اسم المنتج والسعر والصورة، مع سلة مشتريات»
 *      → … · «مع سلة مشتريات»
 *
 *      «…فيه اسم العميل ووقت الحجز، ويحفظ البيانات على خادم»
 *      → nothing at all
 *
 *  He asked for a search, a total, a cart, a server. Each became a column
 *  of the table — and in the last one the capability pushed the two real
 *  columns below the floor, so the whole request read as no schema and
 *  fell through to a template.
 *
 *  Same shape as the rule that became a column and was given statedRules.
 *  Capabilities were never given the same treatment.
 *
 *  Two closed-class tests, no vocabulary: a column is a definite name by
 *  the three marks used everywhere else, and a function word standing
 *  INSIDE a phrase makes it a clause rather than a name. The run stops at
 *  the first failure instead of filtering it out, because a list is
 *  contiguous — what follows the boundary is the next thing he asked for.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('the thing he asked the app to DO is not a column of it', () => {
    it('a search and a sort are not two columns', () => {
        expect(labels('بدي جدول للطلاب فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة'))
            .toEqual(['الاسم', 'الصف', 'الدرجة']);
    });

    it('an order addressed to Joe is not a column', () => {
        expect(labels('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ، واعرض لي المجموع'))
            .toEqual(['رقم الفاتورة', 'المبلغ', 'التاريخ']);
    });

    it('a cart is not a column', () => {
        expect(labels('بدي متجر صغير لبيع العسل فيه اسم المنتج والسعر والصورة، مع سلة مشتريات'))
            .toEqual(['اسم المنتج', 'السعر', 'الصورة']);
    });

    it('a capability no longer sinks the columns that are real', () => {
        //  This one returned NOTHING before: two columns and a capability,
        //  and the capability counted toward a floor of three that the two
        //  could not reach without it.
        expect(labels('بدي تطبيق للحجوزات فيه اسم العميل ووقت الحجز، ويحفظ البيانات على خادم'))
            .toEqual(['اسم العميل', 'وقت الحجز']);
    });

    it('a capability invented for this test is cut the same way', () => {
        //  No catalogue can hold «زقملة». It is cut because «على» stands
        //  inside the phrase, not because the word is known.
        expect(labels('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ، ويزقمل البيانات على خادم'))
            .toEqual(['الاسم', 'المبلغ', 'التاريخ']);
    });
});

describe('the other reader cuts the same way — a colon instead of a connector', () => {
    //  Found by a mutation, not by reading: silencing the cut in this branch
    //  killed no test at all, which meant the branch was unguarded. These
    //  four are what it was silently doing.
    it('a search and a sort after a colon list', () => {
        expect(labels('بدي جدول للطلاب: الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة'))
            .toEqual(['الاسم', 'الصف', 'الدرجة']);
    });

    it('an order addressed to Joe after a colon list', () => {
        expect(labels('بدي جدول للفواتير: رقم الفاتورة والمبلغ والتاريخ، واعرض لي المجموع'))
            .toEqual(['رقم الفاتورة', 'المبلغ', 'التاريخ']);
    });

    it('English, where position is the only mark there is', () => {
        //  Every Latin item passes the definiteness test by design, and no
        //  Arabic function word stands inside «with search by name». What
        //  ends the run is that «with» opens an item that is not the first.
        expect(labels('A students table: name, class and grade, with search by name'))
            .toEqual(['name', 'class', 'grade']);
    });

    it('«of» inside a later item is a name, not a boundary', () => {
        //  The rule stops short on purpose: «date of birth» is a column he
        //  might really write.
        expect(labels('A people table with name, date of birth and phone'))
            .toEqual(['name', 'date of birth', 'phone']);
    });
});

describe('…and a real column is never mistaken for one', () => {
    const KEPT: Array<[string, string, string[]]> = [
        ['a two-word idafa', 'بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد',
            ['اسم المريض', 'رقم تلفونه', 'وقت الموعد']],
        ['an invented trade', 'عندي محل زُرقمونيات. بدي جدول أسجل فيه الطلبات: اسم الزبون ورقم الطلب والمبلغ',
            ['اسم الزبون', 'رقم الطلب', 'المبلغ']],
        ['a stated rule, still stripped as a rule', 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر',
            ['اسم الصنف', 'الكمية', 'السعر']],
        ['a bound with a number', 'بدي جدول للموظفين فيه الاسم والراتب والقسم، والراتب أكبر من 1000',
            ['الاسم', 'الراتب', 'القسم']],
        ['a colon list', 'بدي جدول للكتب: العنوان والمؤلف والسعر', ['العنوان', 'المؤلف', 'السعر']],
        ['English', 'A clients table with name, phone and address', ['name', 'phone', 'address']],
    ];
    for (const [name, request, expected] of KEPT) {
        it(name, () => expect(labels(request)).toEqual(expected));
    }
});

describe('the refusals hold', () => {
    it('a list of values is still not a schema', () => {
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
    });

    it('prose with no list is still not a schema', () => {
        expect(derivedColumns('ابن موقعا لمطعمي')).toBeNull();
    });

    it('a question is still not a schema', () => {
        expect(derivedColumns('ما الفرق بين قاعدة البيانات والجدول؟')).toBeNull();
    });
});

describe('a capability with no «مع» in front of it is cut by definiteness alone', () => {
    //  Found by a mutation, again: with the leading-introducer test in
    //  place, removing the definiteness test killed nothing — which meant
    //  every case in this file was being caught by «مع» and definiteness
    //  was carrying nothing. These are the ones only it stops.
    it('«وبحث بالاسم» — a bare capability joined by «و»', () => {
        expect(labels('بدي جدول للطلاب فيه الاسم والصف والدرجة، وبحث بالاسم'))
            .toEqual(['الاسم', 'الصف', 'الدرجة']);
    });

    it('«بحث بالاسم» — joined by nothing but a comma', () => {
        expect(labels('بدي جدول للطلاب فيه الاسم والصف والدرجة، بحث بالاسم'))
            .toEqual(['الاسم', 'الصف', 'الدرجة']);
    });

    it('«سلة مشتريات» — a bare noun phrase that names no column', () => {
        expect(labels('بدي جدول للمنتجات فيه الاسم والسعر والكمية، سلة مشتريات'))
            .toEqual(['الاسم', 'السعر', 'الكمية']);
    });
});

describe('the boundary of the English cut, declared and not hidden', () => {
    it('a bare English capability with no introducer IS still read as a column', () => {
        //  Written down rather than hidden. Arabic stops this three ways —
        //  the item is not definite, or a function word stands inside it.
        //  English has neither: every Latin item passes definiteness by
        //  design, and the only mark left is the introducer, which this
        //  sentence does not use. The internal-function-word test cannot be
        //  borrowed here, because «date of birth» and «price per unit» are
        //  columns he might really write and they carry the same mark.
        //  Closing it needs a signal this function does not have.
        expect(labels('A students table with name, class and grade, sortable by grade'))
            .toEqual(['name', 'class', 'grade', 'sortable by grade']);
    });
});

describe('the boundary of the «فيه» floor, declared and not hidden', () => {
    it('two definite names after «فيه» in plain prose ARE read as columns', () => {
        //  Not a bug being asserted as behaviour — a limit being written
        //  down. «فيه» lowers the floor to two because its «ه» points back
        //  at a container he named, and the pronoun cannot tell whether
        //  that container was one he ASKED to be built. Nothing in this
        //  function knows the intent; the router does, and it is the router
        //  that decides whether a sentence reaches a schema reader at all.
        //  If this line ever has to change, the fix belongs upstream.
        expect(labels('الكتاب فيه الورق والحبر')).toEqual(['الورق', 'الحبر']);
    });

    it('and a bare recording verb, which points at nothing, keeps the floor of three', () => {
        expect(derivedColumns('An app to record name and phone')).toBeNull();
    });
});
