/**
 * SEVEN COLUMNS HE WROTE, AND JOE ASKED HIM WHAT TO RECORD.
 *
 * Typed into Joe on his own machine, one long request — the kind a real person
 * writes when he wants a real system:
 *
 *     «ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة
 *      الموردين وصفحة التقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم
 *      القطعة والكمية وسعر الشراء وسعر البيع واسم المورد وتاريخ الإدخال. …»
 *
 * What came back, after «1 step · 0s»:
 *
 *     One question before I start — what do you want to record for each of
 *     your اعرض إجمالي?
 *
 * A question whose answer he had written seven times in the same breath, about
 * an «entity» that is a verb phrase lifted out of a later sentence.
 *
 * Bisected by adding one sentence at a time, the columns clause never changing:
 *
 *     columns clause alone                        → 7 columns
 *     with the page sentence in front of it       → 0 columns
 *     the same, with the colon removed            → 0 columns
 *     the same, with the columns sentence FIRST   → 7 columns
 *
 * So it is not the colon and not the pages: it is ORDER. The reader finds the
 * first opener in the request — «نظاماً فيه ثلاث صفحات» — reads the list after
 * it, finds nothing that is a column, and returns null instead of looking at
 * the next opener. In a short request the column list is the only list. In a
 * real one it is almost never the first.
 *
 * The class: A READER THAT TAKES THE FIRST CANDIDATE AND NEVER RETRIES. The
 * project already knew it — `derivedTables` walks every sentence for exactly
 * this reason — and the walk never reached the reader every path calls.
 */

import { columnsAnywhereInHisRequest, derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (columnsAnywhereInHisRequest(r) || []).map(f => f.label);

const COLUMNS_CLAUSE = 'في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم القطعة والكمية وسعر الشراء وسعر البيع واسم المورد وتاريخ الإدخال';
const PAGES_CLAUSE = 'ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير';
const HIS_SEVEN = ['اسم القطعة', 'رقم القطعة', 'الكمية', 'سعر الشراء', 'سعر البيع', 'اسم المورد', 'تاريخ الإدخال'];

describe('his column list is found wherever he put it', () => {
    it('the clause on its own still reads — an empty baseline proves nothing', () => {
        expect(labels(COLUMNS_CLAUSE)).toEqual(HIS_SEVEN);
    });

    it('and it still reads with another list standing in front of it', () => {
        //  The exact defect, in his own sentence.
        expect(labels(PAGES_CLAUSE + '. ' + COLUMNS_CLAUSE)).toEqual(HIS_SEVEN);
    });

    it('the old reader is what fails on it — so this test cannot pass vacuously', () => {
        //  Proof of non-emptiness that survives a refactor: if someone widens
        //  `derivedColumns` itself, this line tells them the guard above is no
        //  longer measuring what it was written for.
        expect(derivedColumns(PAGES_CLAUSE + '. ' + COLUMNS_CLAUSE)).toBeNull();
    });

    it('order does not matter in either direction', () => {
        expect(labels(COLUMNS_CLAUSE + '. و' + PAGES_CLAUSE)).toEqual(HIS_SEVEN);
    });

    it('and a list of something else in front does not win either', () => {
        expect(labels('ابنِ لي نظاماً فيه ألوان: أحمر وأخضر وأزرق. ' + COLUMNS_CLAUSE)).toEqual(HIS_SEVEN);
    });

    it('a request with columns stated across two sentences stays ONE table', () => {
        //  The whole request is read first, unchanged, so a list he split over
        //  a full stop is not chopped into the first half.
        const across = 'بدي جدول أسجل فيه: اسم العميل والمبلغ والتاريخ ورقم الفاتورة';
        expect(labels(across).length).toBe(4);
    });
});

describe('and a request that names no columns still names none', () => {
    it.each([
        ['a page is not a table', 'اعمل صفحة فيها: الاسم والسعر'],
        ['values of one field are not columns', 'متجر بفئات: قهوة، أدوات، حلويات'],
        ['no list at all', 'ابن موقعا لمطعمي'],
        ['a question is not an order', 'ما الفرق بين قاعدة البيانات والجدول؟'],
    ])('%s', (_name, request) => {
        //  The negative half. Retrying every sentence must not turn prose into
        //  a schema — that is the failure this reader's floors exist to stop,
        //  and a retry loop is exactly how it would come back.
        expect(columnsAnywhereInHisRequest(request)).toBeNull();
    });

    it('a long request whose every sentence is prose stays null', () => {
        expect(columnsAnywhereInHisRequest(
            'ابن موقعا لمطعمي. واجعله جميلا. ولا تضف صفحة تسجيل دخول. وشغل البناء الحقيقي.',
        )).toBeNull();
    });
});
