/**
 * HIS WORDS, HIS COLUMNS — IN ANY TRADE, IN EITHER LANGUAGE.
 *
 * The owner stated this as law, after reading the first version of this reader:
 *
 *     «أنا أريد جو أن يقدر يبني أيّ برومبت، وليس أن يحفظ ويتدرّب على برومبتات
 *      محدّدة … هذا قانون صارم لا تتخطّاه.»
 *
 * He was right, and the first version broke it. It carried a table of MEANINGS
 * built from the one request it was written for — «سعر الشراء» became
 * `buyPrice` and was relabelled, «كمية» became `qty` and was relabelled. Across
 * three trades it had never seen:
 *
 *     عيادة   «اسم المريض» -> «الاسم»    «رقم تلفونه» -> «الرقم»    (a phone became a part number)
 *     مكتبة   «اسم المؤلف» -> «الاسم»    «سنة الإصدار» -> plain text
 *     مزرعة   «كمية الحليب» -> «الكمية»  «تاريخ الولادة» -> «التاريخ»
 *
 * So the reader now keeps one thing from him and infers one thing itself: the
 * LABEL is his, unchanged, always; the TYPE comes from a closed vocabulary —
 * the input types a form can have at all. There are nine of those and
 * infinitely many names, which is exactly why one can be a table and the other
 * cannot.
 *
 * Every case below is a trade this code was NOT written from. That is the
 * point of them.
 */
import { detectAppKind, blueprintFor, derivedColumns } from '../core/design/app-blueprints';

const labelsOf = (r: string) => (derivedColumns(r) || []).map(c => c.label);
const typesOf = (r: string) => (derivedColumns(r) || []).map(c => c.type);
const planOf = (r: string) => blueprintFor(detectAppKind(r)!, r, true);

const SHOP = 'أنا عندي محل قطع سيارات. بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر البيع. وبدي يطلع لي تحت مجموع رأس المال ومجموع الربح المتوقع، وإذا كمية قطعة صارت أقل من 3 يصير لونها أحمر عشان أنتبه.';
const CLINIC = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أعرف كم قبضت هذا الشهر.';
const LIBRARY = 'بدي صفحة أسجل فيها الكتب: عنوان الكتاب واسم المؤلف ودار النشر وسنة الإصدار وعدد النسخ.';
const FARM = 'بدي جدول أسجل فيه الأبقار: رقم البقرة وسلالتها ووزنها وتاريخ الولادة وكمية الحليب.';
const ENGLISH = 'I want a page where I record students: student name, email, phone, enrolment date and the fee paid.';

describe('INVARIANT: the label belongs to the person who wrote it', () => {
    test('a clinic keeps its own words — none of them replaced', () => {
        expect(labelsOf(CLINIC)).toEqual(
            ['اسم المريض', 'رقم تلفونه', 'وقت الموعد', 'نوع العلاج', 'المبلغ المدفوع']);
    });

    test('so do a library and a farm', () => {
        expect(labelsOf(LIBRARY)).toEqual(
            ['عنوان الكتاب', 'اسم المؤلف', 'دار النشر', 'سنة الإصدار', 'عدد النسخ']);
        expect(labelsOf(FARM)).toEqual(
            ['رقم البقرة', 'سلالتها', 'وزنها', 'تاريخ الولادة', 'كمية الحليب']);
    });

    test('and a list joined by «and» reads the same as one joined by «و»', () => {
        expect(labelsOf(ENGLISH)).toEqual(
            ['student name', 'email', 'phone', 'enrolment date', 'the fee paid']);
    });
});

describe('INVARIANT: the type is inferred, and only the type', () => {
    test('a phone is a phone, a time is a time, money is a number', () => {
        expect(typesOf(CLINIC)).toEqual(['text', 'tel', 'time', 'text', 'number']);
    });

    test('a birth date is a date and a milk quantity is a number', () => {
        expect(typesOf(FARM)).toEqual(['text', 'text', 'number', 'date', 'number']);
    });

    test('an email is an email even when the word is the whole label', () => {
        expect(typesOf(ENGLISH)).toEqual(['text', 'email', 'tel', 'date', 'number']);
    });

    test('IS NOT VACUOUS: a request that lists nothing derives nothing', () => {
        expect(derivedColumns('بدي صفحة فيها جدول')).toBeNull();
        expect(derivedColumns('اعمل صفحة فيها: الاسم والسعر')).toBeNull();   // two is not a list
    });
});

describe('INVARIANT: totals are arithmetic on roles, named in his words', () => {
    test('a quantity beside two prices is capital and margin', () => {
        const labels = planOf(SHOP).metrics.map(m => m.label);
        expect(labels).toContain('إجمالي الكمية × سعر الشراء');
        expect(labels).toContain('الفرق بين سعر البيع و سعر الشراء');
        const margin = planOf(SHOP).metrics.find(m => m.kind === 'sumMargin')!;
        expect([margin.field, margin.field2, margin.field3]).toEqual(['count1', 'money2', 'money1']);
    });

    test('a clinic that asks what it collected gets its own money column summed', () => {
        expect(planOf(CLINIC).metrics.map(m => m.label)).toContain('مجموع المبلغ المدفوع');
    });

    test('IS NOT VACUOUS: a year is read, not added', () => {
        //  «سنة الإصدار» is a number and not a quantity. Summing it produces a
        //  figure that means nothing, and printing it as a total is a confident
        //  lie about the user's data.
        const labels = planOf(LIBRARY).metrics.map(m => m.label);
        expect(labels).toContain('مجموع عدد النسخ');
        expect(labels).not.toContain('مجموع سنة الإصدار');
    });

    test('the threshold is his number, on whichever column counts', () => {
        expect(planOf(SHOP).lowStock).toEqual({ field: 'count1', below: 3 });
    });

    test('IS NOT VACUOUS: no threshold, or no request to be warned, means no rule', () => {
        expect(planOf(FARM).lowStock).toBeUndefined();
        expect(planOf('بدي جدول أسجل فيه: الاسم والرقم والكمية. وما بدي شي إذا صارت أقل من 3.').lowStock)
            .toBeUndefined();
    });
});

describe('INVARIANT: an explicit list outranks every archetype', () => {
    test('a clinic that names its columns does not get the bookings template', () => {
        //  «مواعيد» matches the bookings archetype; his five columns still win.
        expect(planOf(CLINIC).fields.map(f => f.label)).toEqual(labelsOf(CLINIC));
    });

    test('and a request that names none keeps the archetype it matched', () => {
        const tasks = planOf('بدي نظام إدارة مهامي اليومية');
        expect(tasks.fields.length).toBeGreaterThan(0);
        expect(derivedColumns('بدي نظام إدارة مهامي اليومية')).toBeNull();
    });
});

/**
 * AND NO PARENT HE NEVER NAMED.
 *
 * Measured live on his machine. His five columns finally reached the
 * generated app — and the booking archetype attached its own parent table on
 * top: «اسم الطبيب *», «التخصّص», «الهاتف», plus a picker reading «لا أطباء
 * بعد — أضف أول طبيب ثم احجز له موعداً».
 *
 * He never mentioned a doctor. And the parent's name was REQUIRED, so his own
 * table refused every row until he invented one. Two appointments were typed
 * into the live preview and neither appeared:
 *
 *     ROWS_SAMI=0 ROWS_LAYLA=0
 *
 * A man who lists his columns has described his table. The archetype may keep
 * its copy; it may not add a second table he must fill before his own works.
 */
describe('an explicit list of columns admits no invented parent', () => {
    // POSITIVE — his own brief, and the same trap in two other trades.
    it.each([
        ['العيادة', 'booking', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.'],
        ['كوافير', 'booking', 'بدي جدول أسجل فيه مواعيد الزبونات: الاسم والتلفون ووقت الموعد والمبلغ'],
        ['English clinic', 'booking', 'I want a table to record appointments: patient name, phone, appointment time, treatment and amount paid'],
    ])('%s gets no parent table', (_label, kind, brief) => {
        const bp = blueprintFor(kind as never, brief, /[\u0600-\u06FF]/.test(brief));
        expect(bp.relation).toBeUndefined();
        expect(bp.fields.every(f => !/طبيب|doctor|provider/i.test(f.label))).toBe(true);
    });

    // NEGATIVE — a stock booking app, where he named no columns, keeps its parent.
    it('a booking app with no stated columns keeps its «طبيب ← مواعيده» relation', () => {
        const bp = blueprintFor('booking' as never, 'بدي تطبيق حجوزات لعيادتي', true);
        expect(bp.relation?.one).toBe('طبيب');
    });
});

/**
 * AND HIS WORD FOR THE THING, WHEN HE SAID IT.
 *
 * His five columns reached the generated app, and the page still called
 * itself «الحجوزات», with «حجز» for a row and the lede «احجز، أكّد، وتابع
 * مواعيد اليوم في لوحة واحدة». He had written «بدي جدول أسجل فيه المواعيد» —
 * his word was in the same sentence the columns came from.
 *
 * The archetype's copy is a fallback for a man who named nothing. It is never
 * an overwrite of a man who did.
 */
describe('the table is called what he says he is recording', () => {
    // POSITIVE — trades in no list, including a word for she-camels.
    it.each([
        ['العيادة', 'booking', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.', 'المواعيد'],
        ['مشتل', 'store', 'عندي مشتل. بدي كرّاسة أدوّن فيها الشتلات: اسم الشتلة والكمية والسعر', 'الشتلات'],
        ['نوق', 'generic', 'أملك مزرعة إبل. بدي سجل أسجل فيه النوق: اسم الناقة والعمر والوزن', 'النوق'],
        ['English', 'booking', 'I want a table to record appointments: patient name, phone, appointment time and amount paid', 'appointments'],
    ])('%s is titled %s', (_label, kind, brief, expected) => {
        const bp = blueprintFor(kind as never, brief, /[\u0600-\u06FF]/.test(brief));
        expect(bp.title).toBe(expected);
        expect(bp.entityMany).toBe(expected);
        expect(bp.lede).toContain(expected);
        expect(bp.emptyHint).toContain(expected);
    });

    // NEGATIVE — no subject stated, so the archetype keeps its own word.
    it.each([
        ['قائمة بلا نقطتين', 'بدي جدول أسجل فيه اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ'],
        ['طلب قصير', 'بدي تطبيق حجوزات لعيادتي'],
    ])('%s keeps the archetype title', (_label, brief) => {
        expect(blueprintFor('booking' as never, brief, true).title).toBe('الحجوزات');
    });
});
