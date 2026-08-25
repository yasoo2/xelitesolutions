/**
 *  «ولم أفحص بقية نص طلبك» — AND WHAT IS IN IT?
 *
 *  Measured across five real requests, against the criteria that were
 *  actually produced:
 *
 *      «…، مع بحث بالاسم وترتيب بالدرجة»    → search, and NOTHING for the sort
 *      «…، وصفحة ثانية تعرض مجموع الرواتب»   → counter, and NOTHING for the page
 *      «…، ويحفظ البيانات على خادم»          → NOTHING at all
 *      «home page, projects page, contact form» → NOTHING at all
 *
 *  A capability that produces no criterion cannot fail, so the build can
 *  be declared a success with every one of them missing. The report DID
 *  confess — «ولم أفحص بقية نص طلبك» — and that line is honest and
 *  useless at once: it admits a silence without naming what is in it.
 *
 *  A man told «I did not check the rest» has to reread his own sentence
 *  to find out what was skipped. A man told «لم أفحص: ترتيب بالدرجة»
 *  already knows.
 *
 *  Nothing is invented here. The clauses are his own words, cut from his
 *  sentence by the same reader that decides a clause is not a column, and
 *  the capability vocabulary is consulted only to REMOVE the ones it can
 *  already check — never to find them.
 */
import { scopeReport, formatScope } from '../core/quality/scope-audit';
import { derivedColumns } from '../core/design/app-blueprints';

const unchecked = (request: string) => scopeReport(request, []).unchecked;
const said = (request: string) => formatScope(scopeReport(request, []), true);

describe('what he asked for and nobody can check is named', () => {
    it('a sort he asked for, beside a search that IS checkable', () => {
        //  «بحث بالاسم» is removed because the vocabulary knows a search.
        //  «ترتيب بالدرجة» stays, because nothing here can check a sort.
        expect(unchecked('بدي جدول للطلاب فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة'))
            .toEqual(['ترتيب بالدرجة']);
    });

    it('a second page', () => {
        expect(unchecked('بدي جدول للموظفين فيه الاسم والراتب، وصفحة ثانية تعرض مجموع الرواتب'))
            .toEqual(['صفحة ثانية تعرض مجموع الرواتب']);
    });

    it('a server', () => {
        expect(unchecked('بدي تطبيق للحجوزات فيه اسم العميل ووقت الحجز، ويحفظ البيانات على خادم'))
            .toEqual(['يحفظ البيانات على خادم']);
    });

    it('a capability nobody has ever named', () => {
        //  «يزقمل» is not a word. If a vocabulary were finding these,
        //  this would come back empty — which is exactly the failure being
        //  fixed. It is found because of its SHAPE, not its meaning.
        expect(unchecked('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ، ويزقمل لي النتائج كلها'))
            .toEqual(['يزقمل لي النتائج كلها']);
    });

    it('but a two-word verb phrase is still read as a column — a declared limit', () => {
        //  Written down rather than hidden. «ويزقمل النتائج» is a verb
        //  and a definite object; «ورقم تلفونه» is a noun and a
        //  possessed noun. Both are two words ending in something
        //  definite, and Arabic morphology does not separate them — «رقم»
        //  and «يزقمل» are equally bare to a reader with no lexicon.
        //
        //  Refusing both would cost every «رقم تلفونه» in every real
        //  request, which is a far worse trade than one extra column. So
        //  this one is read as a column, and that is a limit of the
        //  reader, not a defect of this line. It closes only with a
        //  signal this function does not have.
        expect(unchecked('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ، ويزقمل النتائج'))
            .toEqual([]);
        //  …and the column list it lands in, so the cost is visible:
        expect((derivedColumns('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ، ويزقمل النتائج') || [])
            .map(f => f.label)).toEqual(['الاسم', 'المبلغ', 'التاريخ', 'ويزقمل النتائج']);
    });

    it('and the report says it in his own words', () => {
        const text = said('بدي جدول للطلاب فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة');
        expect(text).toContain('ترتيب بالدرجة');
        expect(text).toContain('لم أفحصها');
    });
});

describe('…and it stays quiet when there is nothing to confess', () => {
    const QUIET = [
        'بدي جدول للكتب فيه العنوان والسعر',
        'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد',
        'مرحبا',
        'ما الفرق بين قاعدة البيانات والجدول؟',
    ];
    for (const request of QUIET) {
        it(request.slice(0, 40), () => {
            expect(unchecked(request)).toEqual([]);
            expect(said(request)).not.toContain('لم أفحصها');
        });
    }

    it('a capability the vocabulary CAN check is never listed as unchecked', () => {
        //  A cart is in this vocabulary, so it is removed — being able to
        //  check something is exactly the reason not to confess it.
        expect(unchecked('بدي متجر صغير لبيع العسل فيه اسم المنتج والسعر والصورة، مع سلة مشتريات'))
            .toEqual([]);
    });
});
