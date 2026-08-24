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
import { detectAppKind, blueprintFor, derivedColumns, derivedTables, recordedSubject } from '../core/design/app-blueprints';

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

/**
 * A VERB STANDS ALONE. A NOUN NEEDS TO BE INTRODUCED.
 *
 * Manus attacked the schema reader and was right. The canonical WeatherGo
 * prompt contains «a visible city search FIELD with a Search button», and the
 * bare `field` opener turned the UI requirements that followed into seven
 * columns of a user record:
 *
 *     with a Search button · Enter-key submission · reject empty input
 *     show loading state · and show clear invalid-city · network-failure ·
 *     and API-error states
 *
 * Seven columns nobody asked for — and worse, the false schema made the app
 * look `generic`, so the weather blueprint never ran at all:
 *
 *     Expected: "weather"   Received: "generic"
 *
 * This is «فخّ العربية» in English clothes: a bare noun matched with no
 * context. «أسجل» and `record` are VERBS — a man who writes one is doing the
 * recording and the list follows. «الحقول», `columns`, `fields` are NOUNS:
 * they name the thing rather than do it, and a noun declares a list only when
 * it is introduced — by a colon, or by «هي» / `are` / `include`.
 */
describe('a bare noun does not open a column list', () => {
    const WEATHERGO = 'Build a polished weather dashboard called WeatherGo. Create a visible city search field with a Search button, Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states.';

    // NEGATIVE — the exact false positive, and the shape that caused it.
    it('the WeatherGo prompt yields no columns and stays a weather app', () => {
        expect(derivedColumns(WEATHERGO)).toBeNull();
        expect(detectAppKind(WEATHERGO)).toBe('weather');
    });

    it.each([
        ['search field', 'a page with a search field and a submit button'],
        ['input fields', 'the form should validate its input fields before submitting'],
        ['a log line', 'show a log of every request the server handled'],
    ])('%s is not a column declaration', (_label, text) => {
        expect(derivedColumns(text)).toBeNull();
    });

    // NEGATIVE — Arabic recording words must not match inside pronouns, and the
    // English noun «log of» must not be mistaken for the recording verb.
    it.each([
        ['فيهم', 'بدي برنامج يحفظ لي زُرْقَمُونِي وأرقامهم وعناوينهم ويخليني أبحث فيهم وأعدّلهم وأحذفهم'],
        ['أتابعهم', 'عندي عملاء وأتابعهم بنفسي'],
        ['أديرها', 'الملفات وأديرها يدوياً'],
        ['log of', 'a log of visitors from last year'],
    ])('%s does not open a recording list from inside a token', (_label, text) => {
        expect(derivedColumns(text)).toBeNull();
    });

    // NEGATIVE — every Arabic recording alternative must be bounded, including
    // the two-word forms; a pronoun/token suffix is not a recording action.
    it.each([
        ['أسجل', 'بدي برنامج أسجلهم اسم، سعر، كمية'],
        ['اسجل', 'بدي برنامج اسجلهم اسم، سعر، كمية'],
        ['سجّل', 'بدي برنامج سجّلهم اسم، سعر، كمية'],
        ['أضيف', 'بدي برنامج أضيفهم اسم، سعر، كمية'],
        ['اضيف', 'بدي برنامج اضيفهم اسم، سعر، كمية'],
        ['أدخل', 'بدي برنامج أدخلهم اسم، سعر، كمية'],
        ['ادخل', 'بدي برنامج ادخلهم اسم، سعر، كمية'],
        ['أدوّن', 'بدي برنامج أدوّنهم اسم، سعر، كمية'],
        ['ادون', 'بدي برنامج ادونهم اسم، سعر، كمية'],
        ['أتابع', 'بدي برنامج أتابعهم اسم، سعر، كمية'],
        ['اتابع', 'بدي برنامج اتابعهم اسم، سعر، كمية'],
        ['أدير', 'بدي برنامج أديرهم اسم، سعر، كمية'],
        ['ادير', 'بدي برنامج اديرهم اسم، سعر، كمية'],
        ['أنظم', 'بدي برنامج أنظمهم اسم، سعر، كمية'],
        ['انظم', 'بدي برنامج انظمهم اسم، سعر، كمية'],
        ['فيها', 'بدي برنامج فيهاهم اسم، سعر، كمية'],
        ['فيه', 'بدي برنامج فيههم اسم، سعر، كمية'],
        ['تحتوي على', 'بدي برنامج تحتوي علىهم اسم، سعر، كمية'],
        ['يحتوي على', 'بدي برنامج يحتوي علىهم اسم، سعر، كمية'],
    ])('%s does not open a list inside a larger token', (_label, text) => {
        expect(derivedColumns(text)).toBeNull();
    });

    // POSITIVE — the same bounded forms still open genuine lists.
    it.each([
        ['أسجل فيه', 'بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد', ['اسم المريض', 'رقم تلفونه', 'وقت الموعد']],
        ['فيها الحقول', 'جدول فيها الحقول: التاريخ والمبلغ والسبب', ['التاريخ', 'المبلغ', 'السبب']],
        ['record', 'record students: name, grade, section', ['name', 'grade', 'section']],
    ])('%s still opens an explicit recording list', (_label, text, expected) => {
        expect(derivedColumns(text)?.map(c => c.label)).toEqual(expected);
    });

    // POSITIVE — an introduced noun still declares, in both languages.
    it.each([
        ['الحقول:', 'بدي جدول الحقول: الاسم والسعر والكمية', ['الاسم', 'السعر', 'الكمية']],
        ['columns:', 'I want a table, columns: name, price and quantity', ['name', 'price', 'quantity']],
        ['fields are', 'I want a table whose fields are name, phone and email', ['name', 'phone', 'email']],
        ['Oxford comma', 'I want a table, columns: patient, phone, and amount paid', ['patient', 'phone', 'amount paid']],
    ])('%s still declares its list', (_label, text, expected) => {
        expect(derivedColumns(text)?.map(c => c.label)).toEqual(expected);
    });

    it('keeps an Arabic label whose first character is the attached conjunction', () => {
        const labels = derivedColumns(
            'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع',
        )?.map(c => c.label);
        expect(labels).toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد', 'نوع العلاج', 'المبلغ المدفوع']);
    });

    // POSITIVE — and a recording VERB still needs no introduction at all.
    it.each([
        ['أسجل', 'بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد', 3],
        ['track', 'I want to track my clients: name, phone and email', 3],
        ['أتابع', 'بدي أتابع ديوني: اسم المدين والمبلغ وتاريخ الدين', 3],
    ])('%s opens a list on its own', (_label, text, count) => {
        expect(derivedColumns(text)?.length).toBe(count);
    });
    /**
     *  THE FLOOR IS THREE, AND IT IS A REAL LIMIT — SAY SO.
     *
     *  A list of two is not read as a list. That threshold predates this work
     *  and it is what keeps an ordinary sentence from becoming a schema, but
     *  it does cost a real request: a man who wants exactly two columns is
     *  told nothing and gets a stock table instead.
     *
     *  It is pinned here rather than left implicit, so that lowering it is a
     *  deliberate act with a test to change, not an accident — and so that
     *  nobody reading the five-column cases above assumes any list works.
     */
    it('two named columns are below the floor — a known, deliberate limit', () => {
        expect(derivedColumns('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه')).toBeNull();
        expect(derivedColumns('I want to track my clients: name and phone')).toBeNull();
    });
});

/**
 * A COLUMN THAT ASKS A QUESTION IS A YES OR A NO.
 *
 * Measured live. He answered Joe's question with «اسم المدين والمبلغ وتاريخ
 * الدين وهل تم السداد» and got four columns — three right, and a free-text box
 * labelled «هل تم السداد». He would have had to type the word «نعم» into it,
 * and nothing could ever count it.
 *
 * The signal is grammatical, not a list of states: a label that OPENS WITH AN
 * INTERROGATIVE — «هل», `is`, `has`, `did` — or ends in a question mark is a
 * question, and a column that asks a question holds an answer of yes or no.
 * The handful of past participles people write instead of the question
 * («مدفوع», `paid`, `done`) are the same column with the question implicit.
 *
 * And it is the app's done-state, not a fifth text box: the records engine
 * already knows how to draw a row as done, so a settled debt looks settled.
 */
describe('a column phrased as a question is a yes or a no', () => {
    // POSITIVE — the live answer, and the same shape in both languages.
    it.each([
        ['هل تم السداد', 'بدي أتابع ديوني: اسم المدين والمبلغ وتاريخ الدين وهل تم السداد', 'هل تم السداد', ['نعم', 'لا']],
        ['مدفوع', 'بدي جدول أسجل فيه الفواتير: اسم الزبون والمبلغ ومدفوع', 'مدفوع', ['نعم', 'لا']],
        ['علامة سؤال', 'بدي أتابع الطلبات: رقم الطلب والمبلغ وتم التسليم؟', 'تم التسليم', ['نعم', 'لا']],
        ['is it paid', 'I want to track my invoices: client, amount and is it paid', 'is it paid', ['Yes', 'No']],
        ['done', 'I want to track my tasks: title, due date and done', 'done', ['Yes', 'No']],
    ])('%s becomes a choice, in the language he wrote it in', (_label, brief, label, options) => {
        const col = derivedColumns(brief)?.find(c => c.label === label);
        expect(col?.type).toBe('select');
        expect(col?.options).toEqual(options);
    });

    // POSITIVE — and it becomes the row's done-state, wired to the engine.
    it('the yes/no column is the app done-state', () => {
        const bp = blueprintFor('generic' as never, 'بدي أتابع ديوني: اسم المدين والمبلغ وتاريخ الدين وهل تم السداد', true);
        const flag = bp.fields.find(f => f.label === 'هل تم السداد');
        expect(bp.statusField).toBe(flag?.key);
        expect(bp.doneValue).toBe('نعم');
    });

    // NEGATIVE — a word that merely CONTAINS a state word is not a question.
    it.each([
        ['تمويل المشروع', 'بدي أسجل الطلبات: اسم الزبون وتمويل المشروع والمبلغ', 'تمويل المشروع', 'text'],
        ['المبلغ المدفوع', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ووقت الموعد والمبلغ المدفوع', 'المبلغ المدفوع', 'number'],
    ])('%s keeps its own type', (_label, brief, label, type) => {
        expect(derivedColumns(brief)?.find(c => c.label === label)?.type).toBe(type);
    });

    // NEGATIVE — a table with no yes/no column gets no invented done-state.
    it('a schema with no question column has no done-state', () => {
        const bp = blueprintFor('booking' as never, 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد', true);
        expect(bp.statusField).toBeUndefined();
        expect(bp.doneValue).toBeUndefined();
    });
});

/**
 * EVERY TABLE HE NAMED, NOT THE FIRST ONE.
 *
 * Measured. He wrote, in one breath:
 *
 *     «بدي جدول للمواعيد أسجل فيه: اسم المريض ووقت الموعد والعلاج.
 *      وبدي جدول ثاني للمصاريف أسجل فيه: البند والمبلغ والتاريخ.»
 *
 * and the reader returned NOTHING. The English twin returned the first table
 * and dropped the second without a word — which is worse, because it looks
 * like success.
 *
 * derivedColumns stops at the first opener and reads to the end of that one
 * sentence. A man who asks for two tables in two sentences is not asking for
 * one, and silently building half a request is the failure this whole branch
 * exists to end.
 *
 * Reading the subject also had to learn that Arabic often names the table
 * BEFORE the verb — «جدول للمواعيد أسجل فيه» — which reading forward can never
 * find.
 */
describe('a request that names two tables yields two tables', () => {
    // POSITIVE — both tables, in his order, in both languages.
    it('two Arabic tables in one message are both read', () => {
        const tables = derivedTables('بدي جدول للمواعيد أسجل فيه: اسم المريض ووقت الموعد والعلاج. وبدي جدول ثاني للمصاريف أسجل فيه: البند والمبلغ والتاريخ.');
        expect(tables).toHaveLength(2);
        expect(tables[0].subject).toBe('مواعيد');
        expect(tables[0].columns.map(c => c.label)).toEqual(['اسم المريض', 'وقت الموعد', 'العلاج']);
        expect(tables[1].subject).toBe('مصاريف');
        expect(tables[1].columns.map(c => c.label)).toEqual(['البند', 'المبلغ', 'التاريخ']);
    });

    it('two English tables in one message are both read', () => {
        const tables = derivedTables('I want a table to record my clients: name, phone and email. And another table to record my invoices: number, amount and date.');
        expect(tables.map(t => t.subject)).toEqual(['clients', 'invoices']);
        expect(tables[1].columns.map(c => c.label)).toEqual(['number', 'amount', 'date']);
    });

    // NEGATIVE — one table stays one, with all five of his columns together.
    it('one table stated in two sentences does not become two', () => {
        const tables = derivedTables('عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.');
        expect(tables).toHaveLength(1);
        expect(tables[0].subject).toBe('المواعيد');
        expect(tables[0].columns).toHaveLength(5);
    });

    // NEGATIVE — a request with no table at all yields none.
    it.each([
        ['بحث', 'ابحث لي عن سعر الدولار اليوم'],
        ['سؤال', 'ما الفرق بين React وVue؟'],
    ])('%s yields no tables', (_label, ask) => {
        expect(derivedTables(ask)).toEqual([]);
    });

    // NEGATIVE — reading the subject before the verb must not grab the artefact word.
    it('«جدول» is never mistaken for the subject', () => {
        expect(recordedSubject('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد')).toBe('المواعيد');
    });
});
