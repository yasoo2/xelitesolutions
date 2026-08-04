/**
 * AN APPLICATION IS NOT A BROCHURE — «كما قلت لك النظام فقط هو معرض صور وكلمات
 * وليس تطبيقات حقيقية».
 *
 * Asked for «تطبيق خرائط شبيه بخرائط جوجل», Joe delivered a real Vite + React
 * project — and inside it: Hero, Features, Steps, Cta, Faq, Contact, a
 * restaurant menu, a pricing table and two fabricated customers. No map. The
 * routing was fixed; the CONTENT never was. Measured, four different app
 * requests produced byte-identical component lists.
 *
 * The scope decides WHAT container to build (page / app / system). This file
 * decides WHAT THE APP DOES: which domain it belongs to, which engine can
 * really run it, what a record of it looks like, and which numbers matter.
 * Deterministic on purpose — an application must come out of the request even
 * when the brain is unreachable, exactly like the scope does.
 *
 * Four engines, because four kinds of application cover the overwhelming
 * majority of what people ask for:
 *   map     — a real Leaflet map: tiles, geolocation, place search, saved pins
 *   chat    — rooms, messages, persistence, and a real server when one exists
 *   weather — live forecasts from open-meteo (no key, no account)
 *   records — the working shape of every management app: create, edit, delete,
 *             search, filter, totals, CSV — driven by a per-domain schema
 */

export type AppEngine = 'map' | 'chat' | 'weather' | 'records';

export type AppKind =
    | 'maps' | 'chat' | 'weather'
    | 'tasks' | 'notes' | 'expenses' | 'inventory' | 'booking'
    | 'pos' | 'crm' | 'lms' | 'contacts' | 'habits' | 'generic';

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'tel' | 'email';

export interface AppField {
    key: string;
    label: string;
    type: FieldType;
    options?: string[];
    required?: boolean;
    /** Shown in the compact row summary — keeps the list readable. */
    primary?: boolean;
}

/** A number worth showing at the top of the app, computed from the rows. */
export interface AppMetric {
    label: string;
    kind: 'count' | 'sum' | 'sumProduct' | 'avg' | 'countWhere' | 'todayCount' | 'todaySum';
    field?: string;
    field2?: string;
    equals?: string;
    /** For money-shaped metrics — appended to the value. */
    unit?: string;
}

export interface AppBlueprint {
    kind: AppKind;
    engine: AppEngine;
    /** The app's own name for what it manages — «المهام», «الحجوزات». */
    title: string;
    lede: string;
    entityOne: string;
    entityMany: string;
    fields: AppField[];
    /** The select field that drives the status filter and the done state. */
    statusField?: string;
    doneValue?: string;
    metrics: AppMetric[];
    /** Extra npm dependencies this engine really needs. */
    deps: Record<string, string>;
    /** What the app says when it has no rows yet — never fabricated rows. */
    emptyHint: string;
}

/* ── which domain the request belongs to ─────────────────────────────────── */

/** Ordered: the specific archetypes are tested before the broad ones. */
const KIND_DETECTORS: Array<[AppKind, RegExp]> = [
    ['maps', /خرائط|خريطة|خارطة|مواقع\s*جغرافي|ملاحة|تتبع\s*(المواقع|الموقع)|جي\s*بي\s*اس|\bmaps?\b|\bgps\b|navigation|geolocation|geo\s*app/i],
    ['weather', /طقس|الجو|درجات?\s*الحرارة|أحوال\s*جوية|weather|forecast|temperature app/i],
    ['chat', /محادث|دردش|شات|رسائل\s*(فورية|نصية)?|مراسلة|\bchat\b|messaging|messenger|instant\s*messages/i],
    ['pos', /نقاط\s*بيع|نقطة\s*بيع|كاشير|كاشيير|\bpos\b|point\s*of\s*sale|cash\s*register/i],
    ['booking', /حجوزات|حجز|مواعيد|موعد|عياد|مرضى|reservation|booking|appointment|clinic/i],
    ['inventory', /مخزون|جرد|مستودع|أصناف|اصناف|inventory|stock|warehouse/i],
    ['expenses', /مصاريف|مصروفات|ميزانية|نفقات|محاسبة\s*شخصية|expense|budget|spending|finance\s*tracker/i],
    ['tasks', /مهام|مهمة|مهمات|to-?do|todo|task\s*(manager|list)|kanban/i],
    ['notes', /ملاحظات|مذكرات|مفكرة|محرر\s*نصوص|محرر\s*نص|notes?\s*app|notepad|note\s*taking|text\s*editor|markdown/i],
    ['lms', /منصة\s*تعليم|تعليمية|طلاب|طالب|دورات|مدرسة|جامعة|درجات|\blms\b|courses?|students?|school|grade(book)?/i],
    ['crm', /عملاء|زبائن|علاقات\s*العملاء|صفقات|مبيعات\s*متابعة|\bcrm\b|leads?|pipeline|deals?/i],
    ['contacts', /جهات\s*اتصال|دفتر\s*عناوين|أرقام\s*الهواتف|contacts?\s*(app|book)|address\s*book|phone\s*book/i],
    ['habits', /عادات|روتين|تتبع\s*العادات|habits?\s*(tracker|app)|routine\s*tracker/i],
];

/** The request asks for something to be MANAGED — a records app, not a poster. */
const MANAGE_SIGNAL = /إدارة|ادارة|تتبّع|تتبع|تنظيم|أرشفة|ارشفة|تسجيل|متابعة|سجلّ|سجل\b|نظام|manage(ment)?|tracker|tracking|organiz|registry|records?\b/i;
/** …and it is an application, not a document about one. */
const APP_SIGNAL = /تطبيق|برنامج|نظام|منصّة|منصة|أداة|اداة|لوحة\s*تحكم|\bapp\b|application|system|platform|tool|dashboard/i;
/** A page ABOUT something wins over the subject it describes. */
const PAGE_SIGNAL = /صفحة\s*(هبوط|تعريف)?|لاندنج|بورتفوليو|معرض\s*أعمال|سيرة\s*ذاتية|landing\s*page|portfolio|one\s*-?\s*pager|brochure/i;

/**
 * WHICH application this is — or null when the request is genuinely a
 * presentation site (a café, a clinic's landing page, a shop window), which
 * the section builder already does well and must keep doing.
 */
export function detectAppKind(requestRaw: string): AppKind | null {
    const request = String(requestRaw || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '');
    if (!request.trim()) return null;
    // «صفحة هبوط لتطبيق خرائط» is a page about an app — the document the user
    // named wins, exactly as classifyBuildScope decides it.
    if (PAGE_SIGNAL.test(request)) return null;
    for (const [kind, re] of KIND_DETECTORS) if (re.test(request)) return kind;
    // Nothing named, but «نظام إدارة …» / «تطبيق لتتبع …» is unmistakably an
    // application that owns records. It gets the records engine with an entity
    // named after the request itself.
    if (APP_SIGNAL.test(request) && MANAGE_SIGNAL.test(request)) return 'generic';
    return null;
}

/* ── what each application is made of ────────────────────────────────────── */

/** [key, ar, en, type, options?, flags] — authored once, read in both languages. */
type FieldSpec = [string, string, string, FieldType, string[]?, string[]?];

const f = (s: FieldSpec, isAr: boolean): AppField => ({
    key: s[0],
    label: isAr ? s[1] : s[2],
    type: s[3],
    ...(s[4] ? { options: s[4] } : {}),
    ...(s[5]?.includes('required') ? { required: true } : {}),
    ...(s[5]?.includes('primary') ? { primary: true } : {}),
});

const SELECT_AR_EN = (ar: string[], en: string[], isAr: boolean) => (isAr ? ar : en);

/** The subject of the request, cleaned of the build verbs — used to name a
 *  generic app after what the user actually asked to manage. */
export function subjectOf(request: string): string {
    return String(request || '')
        .replace(/\n[\s\S]*$/, '')
        .replace(/(ابنِ|ابني|ابن|أنشئ|انشئ|اصنع|اعمل|سوّي|سوي|صمّم|صمم|طوّر|طور|أريد|اريد|أرغب|قم\s*ب|من\s*فضلك|لي\b|لنا\b)/g, ' ')
        .replace(/(تطبيق|برنامج|نظام|منصّة|منصة|أداة|اداة|موقع|مشروع|بسيط|جديد|كامل|احترافي|react|رياكت|ريأكت|vite|build|create|make|app|system|platform|project|simple|full)/gi, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function blueprintFor(kind: AppKind, request: string, isAr: boolean): AppBlueprint {
    const subject = subjectOf(request);
    const L = (ar: string, en: string) => (isAr ? ar : en);

    switch (kind) {
        case 'maps': return {
            kind, engine: 'map',
            title: L('الخريطة', 'The map'),
            lede: L('ابحث عن أي مكان، حدّد موقعك، واحفظ الأماكن التي تهمّك.', 'Search any place, find yourself, and keep the places that matter.'),
            entityOne: L('مكان', 'place'), entityMany: L('الأماكن المحفوظة', 'Saved places'),
            fields: [], metrics: [], deps: { leaflet: '^1.9.4' },
            emptyHint: L('لا أماكن محفوظة بعد — ابحث عن مكان أو انقر على الخريطة لتثبيت أول علامة.',
                'No saved places yet — search for one, or click the map to drop your first pin.'),
        };

        case 'weather': return {
            kind, engine: 'weather',
            title: L('الطقس', 'Weather'),
            lede: L('حالة الجو الآن وتوقّعات سبعة أيام — من مصدر مفتوح بلا مفتاح ولا حساب.',
                'Current conditions and a seven-day forecast — open data, no key, no account.'),
            entityOne: L('مدينة', 'city'), entityMany: L('مدني المحفوظة', 'Saved cities'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('ابحث عن مدينة، أو اسمح بالوصول لموقعك لعرض طقسك الآن.',
                'Search for a city, or allow location access to see your own weather.'),
        };

        case 'chat': return {
            kind, engine: 'chat',
            title: L('المحادثة', 'Chat'),
            lede: L('غرف، رسائل، وحفظ دائم — وخادم حقيقي حين يوجد.',
                'Rooms, messages, durable storage — and a real server when one exists.'),
            entityOne: L('رسالة', 'message'), entityMany: L('الرسائل', 'Messages'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('لا رسائل في هذه الغرفة بعد — اكتب أول رسالة.', 'No messages in this room yet — write the first one.'),
        };

        case 'tasks': return {
            kind, engine: 'records',
            title: L('المهام', 'Tasks'),
            lede: L('أضف مهامك، رتّبها بالأولوية، وتابع ما أُنجز.', 'Add your tasks, rank them, and track what is done.'),
            entityOne: L('مهمة', 'task'), entityMany: L('المهام', 'Tasks'),
            fields: [
                f(['title', 'المهمة', 'Task', 'text', undefined, ['required', 'primary']], isAr),
                f(['notes', 'تفاصيل', 'Details', 'textarea'], isAr),
                f(['priority', 'الأولوية', 'Priority', 'select', SELECT_AR_EN(['عالية', 'متوسطة', 'منخفضة'], ['High', 'Medium', 'Low'], isAr)], isAr),
                f(['due', 'تاريخ الاستحقاق', 'Due date', 'date'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['قيد التنفيذ', 'منجزة'], ['In progress', 'Done'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('منجزة', 'Done'),
            metrics: [
                { label: L('كل المهام', 'All tasks'), kind: 'count' },
                { label: L('منجزة', 'Done'), kind: 'countWhere', field: 'status', equals: L('منجزة', 'Done') },
                { label: L('تستحق اليوم', 'Due today'), kind: 'todayCount', field: 'due' },
            ],
            deps: {},
            emptyHint: L('لا مهام بعد — اكتب أول مهمة في النموذج.', 'No tasks yet — write your first one in the form.'),
        };

        case 'notes': return {
            kind, engine: 'records',
            title: L('الملاحظات', 'Notes'),
            lede: L('اكتب، ابحث، وعدّل — كل شيء محفوظ على جهازك فوراً.', 'Write, search, edit — saved on your device instantly.'),
            entityOne: L('ملاحظة', 'note'), entityMany: L('الملاحظات', 'Notes'),
            fields: [
                f(['title', 'العنوان', 'Title', 'text', undefined, ['required', 'primary']], isAr),
                f(['body', 'النص', 'Body', 'textarea', undefined, ['required']], isAr),
                f(['tag', 'الوسم', 'Tag', 'text'], isAr),
            ],
            metrics: [
                { label: L('كل الملاحظات', 'All notes'), kind: 'count' },
                { label: L('أُضيفت اليوم', 'Added today'), kind: 'todayCount', field: 'createdAt' },
            ],
            deps: {},
            emptyHint: L('لا ملاحظات بعد — اكتب أول ملاحظة.', 'No notes yet — write your first one.'),
        };

        case 'expenses': return {
            kind, engine: 'records',
            title: L('المصاريف', 'Expenses'),
            lede: L('سجّل كل مصروف، وشاهد إجماليك يتحدّث فوراً.', 'Log every expense and watch the totals move.'),
            entityOne: L('مصروف', 'expense'), entityMany: L('المصاريف', 'Expenses'),
            fields: [
                f(['title', 'البند', 'Item', 'text', undefined, ['required', 'primary']], isAr),
                f(['amount', 'المبلغ', 'Amount', 'number', undefined, ['required']], isAr),
                f(['category', 'الفئة', 'Category', 'select', SELECT_AR_EN(['طعام', 'مواصلات', 'فواتير', 'تسوّق', 'أخرى'], ['Food', 'Transport', 'Bills', 'Shopping', 'Other'], isAr)], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
                f(['note', 'ملاحظة', 'Note', 'textarea'], isAr),
            ],
            statusField: 'category',
            metrics: [
                { label: L('الإجمالي', 'Total'), kind: 'sum', field: 'amount' },
                { label: L('مصروف اليوم', 'Spent today'), kind: 'todaySum', field: 'date', field2: 'amount' },
                { label: L('عدد العمليات', 'Entries'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('لا مصاريف مسجّلة — أضف أول عملية.', 'Nothing logged yet — add your first entry.'),
        };

        case 'inventory': return {
            kind, engine: 'records',
            title: L('المخزون', 'Inventory'),
            lede: L('أصنافك وكمياتها وقيمتها — في مكان واحد.', 'Your items, their quantities and their value — in one place.'),
            entityOne: L('صنف', 'item'), entityMany: L('الأصناف', 'Items'),
            fields: [
                f(['name', 'الصنف', 'Item', 'text', undefined, ['required', 'primary']], isAr),
                f(['sku', 'الرمز', 'SKU', 'text'], isAr),
                f(['qty', 'الكمية', 'Quantity', 'number', undefined, ['required']], isAr),
                f(['price', 'سعر الوحدة', 'Unit price', 'number'], isAr),
                f(['supplier', 'المورّد', 'Supplier', 'text'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['متوفر', 'قارب على النفاد', 'نفد'], ['In stock', 'Low', 'Out of stock'], isAr)], isAr),
            ],
            statusField: 'status',
            metrics: [
                { label: L('عدد الأصناف', 'Items'), kind: 'count' },
                { label: L('إجمالي الكمية', 'Total quantity'), kind: 'sum', field: 'qty' },
                { label: L('قيمة المخزون', 'Stock value'), kind: 'sumProduct', field: 'qty', field2: 'price' },
            ],
            deps: {},
            emptyHint: L('المخزون فارغ — أضف أول صنف.', 'The inventory is empty — add your first item.'),
        };

        case 'booking': return {
            kind, engine: 'records',
            title: L('الحجوزات', 'Bookings'),
            lede: L('احجز، أكّد، وتابع مواعيد اليوم في لوحة واحدة.', 'Book, confirm and follow today\'s appointments in one board.'),
            entityOne: L('حجز', 'booking'), entityMany: L('الحجوزات', 'Bookings'),
            fields: [
                f(['name', 'الاسم', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['phone', 'الهاتف', 'Phone', 'tel'], isAr),
                f(['service', 'الخدمة', 'Service', 'text'], isAr),
                f(['date', 'التاريخ', 'Date', 'date', undefined, ['required']], isAr),
                f(['time', 'الوقت', 'Time', 'time'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['بانتظار التأكيد', 'مؤكّد', 'ملغي'], ['Pending', 'Confirmed', 'Cancelled'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('مؤكّد', 'Confirmed'),
            metrics: [
                { label: L('كل الحجوزات', 'All bookings'), kind: 'count' },
                { label: L('مؤكّدة', 'Confirmed'), kind: 'countWhere', field: 'status', equals: L('مؤكّد', 'Confirmed') },
                { label: L('حجوزات اليوم', 'Today'), kind: 'todayCount', field: 'date' },
            ],
            deps: {},
            emptyHint: L('لا حجوزات بعد — أضف أول موعد.', 'No bookings yet — add the first appointment.'),
        };

        case 'pos': return {
            kind, engine: 'records',
            title: L('المبيعات', 'Sales'),
            lede: L('سجّل كل عملية بيع واعرف إيراد اليوم لحظة بلحظة.', 'Ring up every sale and know today\'s revenue as it happens.'),
            entityOne: L('عملية بيع', 'sale'), entityMany: L('المبيعات', 'Sales'),
            fields: [
                f(['item', 'الصنف', 'Item', 'text', undefined, ['required', 'primary']], isAr),
                f(['qty', 'الكمية', 'Quantity', 'number', undefined, ['required']], isAr),
                f(['price', 'سعر الوحدة', 'Unit price', 'number', undefined, ['required']], isAr),
                f(['method', 'طريقة الدفع', 'Payment', 'select', SELECT_AR_EN(['نقدي', 'بطاقة', 'تحويل'], ['Cash', 'Card', 'Transfer'], isAr)], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
            ],
            statusField: 'method',
            metrics: [
                { label: L('إجمالي المبيعات', 'Total sales'), kind: 'sumProduct', field: 'qty', field2: 'price' },
                { label: L('مبيعات اليوم', 'Sold today'), kind: 'todayCount', field: 'date' },
                { label: L('عدد العمليات', 'Transactions'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('لا مبيعات اليوم — سجّل أول عملية.', 'No sales yet — ring up the first one.'),
        };

        case 'crm': return {
            kind, engine: 'records',
            title: L('العملاء', 'Customers'),
            lede: L('كل عميل ومرحلته — من أول تواصل إلى الإغلاق.', 'Every customer and their stage — first touch to closed.'),
            entityOne: L('عميل', 'customer'), entityMany: L('العملاء', 'Customers'),
            fields: [
                f(['name', 'الاسم', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['company', 'الجهة', 'Company', 'text'], isAr),
                f(['phone', 'الهاتف', 'Phone', 'tel'], isAr),
                f(['email', 'البريد', 'Email', 'email'], isAr),
                f(['value', 'قيمة الصفقة', 'Deal value', 'number'], isAr),
                f(['stage', 'المرحلة', 'Stage', 'select', SELECT_AR_EN(['عميل محتمل', 'تم التواصل', 'عرض سعر', 'مغلق'], ['Lead', 'Contacted', 'Proposal', 'Closed'], isAr)], isAr),
            ],
            statusField: 'stage', doneValue: L('مغلق', 'Closed'),
            metrics: [
                { label: L('كل العملاء', 'All customers'), kind: 'count' },
                { label: L('صفقات مغلقة', 'Closed'), kind: 'countWhere', field: 'stage', equals: L('مغلق', 'Closed') },
                { label: L('قيمة الصفقات', 'Pipeline value'), kind: 'sum', field: 'value' },
            ],
            deps: {},
            emptyHint: L('لا عملاء بعد — أضف أول عميل.', 'No customers yet — add the first one.'),
        };

        case 'lms': return {
            kind, engine: 'records',
            title: L('الطلاب والدرجات', 'Students & grades'),
            lede: L('سجّل الطلاب في المواد وتابع درجاتهم ومعدّلهم.', 'Enrol students, follow their grades and the average.'),
            entityOne: L('تسجيل', 'enrolment'), entityMany: L('التسجيلات', 'Enrolments'),
            fields: [
                f(['student', 'الطالب', 'Student', 'text', undefined, ['required', 'primary']], isAr),
                f(['course', 'المادة', 'Course', 'text', undefined, ['required']], isAr),
                f(['grade', 'الدرجة', 'Grade', 'number'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['مسجّل', 'منجز', 'منسحب'], ['Enrolled', 'Completed', 'Withdrawn'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('منجز', 'Completed'),
            metrics: [
                { label: L('التسجيلات', 'Enrolments'), kind: 'count' },
                { label: L('المعدّل', 'Average grade'), kind: 'avg', field: 'grade' },
                { label: L('منجز', 'Completed'), kind: 'countWhere', field: 'status', equals: L('منجز', 'Completed') },
            ],
            deps: {},
            emptyHint: L('لا تسجيلات بعد — أضف أول طالب.', 'No enrolments yet — add the first student.'),
        };

        case 'contacts': return {
            kind, engine: 'records',
            title: L('جهات الاتصال', 'Contacts'),
            lede: L('دفتر عناوين حقيقي — بحث فوري واتصال بضغطة.', 'A real address book — instant search, one-tap dialling.'),
            entityOne: L('جهة اتصال', 'contact'), entityMany: L('جهات الاتصال', 'Contacts'),
            fields: [
                f(['name', 'الاسم', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['phone', 'الهاتف', 'Phone', 'tel', undefined, ['required']], isAr),
                f(['email', 'البريد', 'Email', 'email'], isAr),
                f(['group', 'المجموعة', 'Group', 'select', SELECT_AR_EN(['عائلة', 'عمل', 'أصدقاء', 'أخرى'], ['Family', 'Work', 'Friends', 'Other'], isAr)], isAr),
                f(['note', 'ملاحظة', 'Note', 'textarea'], isAr),
            ],
            statusField: 'group',
            metrics: [{ label: L('عدد جهات الاتصال', 'Contacts'), kind: 'count' }],
            deps: {},
            emptyHint: L('الدفتر فارغ — أضف أول جهة اتصال.', 'The book is empty — add the first contact.'),
        };

        case 'habits': return {
            kind, engine: 'records',
            title: L('العادات', 'Habits'),
            lede: L('عادة واحدة كل يوم — وسجلّ يثبت التزامك.', 'One habit a day — and a log that proves the streak.'),
            entityOne: L('عادة', 'habit'), entityMany: L('العادات', 'Habits'),
            fields: [
                f(['title', 'العادة', 'Habit', 'text', undefined, ['required', 'primary']], isAr),
                f(['repeat', 'التكرار', 'Repeat', 'select', SELECT_AR_EN(['يومي', 'أسبوعي'], ['Daily', 'Weekly'], isAr)], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['قيد المتابعة', 'تمّت اليوم'], ['Tracking', 'Done today'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('تمّت اليوم', 'Done today'),
            metrics: [
                { label: L('العادات', 'Habits'), kind: 'count' },
                { label: L('تمّت اليوم', 'Done today'), kind: 'countWhere', field: 'status', equals: L('تمّت اليوم', 'Done today') },
            ],
            deps: {},
            emptyHint: L('لا عادات بعد — أضف أول عادة تريد الالتزام بها.', 'No habits yet — add the first one you want to keep.'),
        };

        default: return {
            kind: 'generic', engine: 'records',
            title: subject || L('السجلات', 'Records'),
            lede: L('أضف، عدّل، ابحث، وصدّر — تطبيق يعمل فعلاً لا صفحة تتحدث عنه.',
                'Add, edit, search and export — an app that works, not a page about one.'),
            entityOne: L('سجلّ', 'record'), entityMany: subject || L('السجلات', 'Records'),
            fields: [
                f(['title', 'العنوان', 'Title', 'text', undefined, ['required', 'primary']], isAr),
                f(['details', 'التفاصيل', 'Details', 'textarea'], isAr),
                f(['amount', 'قيمة', 'Value', 'number'], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['جديد', 'قيد العمل', 'منجز'], ['New', 'In progress', 'Done'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('منجز', 'Done'),
            metrics: [
                { label: L('كل السجلات', 'All records'), kind: 'count' },
                { label: L('منجز', 'Done'), kind: 'countWhere', field: 'status', equals: L('منجز', 'Done') },
                { label: L('أُضيف اليوم', 'Added today'), kind: 'todayCount', field: 'createdAt' },
            ],
            deps: {},
            emptyHint: L('لا سجلات بعد — أضف أول سجلّ من النموذج.', 'No records yet — add the first one in the form.'),
        };
    }
}

/* ── what was asked for, in the user's own words ─────────────────────────── */

/**
 * THE GAP LIST MUST COME FROM THE REQUEST, NOT FROM A KEYWORD TABLE I WROTE.
 *
 * Measured in the field: a request listing twelve features — Posts, Stories,
 * Reels, Live streaming, Groups, Pages, Messaging, Video calls, AI moderation,
 * Recommendations, an Ads platform, a Creator dashboard — was answered with a
 * chat app and an honesty block naming exactly ONE unbuilt thing, because my
 * table happened to contain the words «AI assistant» and none of the others.
 * A list of what I remembered to anticipate is not a list of what was asked.
 *
 * So the features are extracted from the request itself and reported in the
 * user's own words. Anything the delivered engine does not cover is named.
 */
export function requestedFeatures(requestRaw: string): string[] {
    const request = String(requestRaw || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '');
    const out: string[] = [];
    const push = (raw: string) => {
        const s = raw.trim()
            .replace(/^[-•*–—\d.)\s]+/, '')
            .replace(/[.,;:؛،]+$/, '')
            .trim();
        if (s.length < 3 || s.length > 60) return;
        // Section banners and prose lines are not features.
        if (/^[=_-]{3,}$/.test(s)) return;
        if (/^(features?|requirements?|tech\s*stack|output|goal|name|project|design|use|generate|build|create|the\s|it\s|and\s)/i.test(s) && !/^(build|create)\s+\w+\s+\w+/i.test(s)) return;
        if (/\s(the|a|an|is|are|must|should|will|can)\s/i.test(s) && s.split(/\s+/).length > 6) return;
        const key = s.toLowerCase();
        if (out.some(o => o.toLowerCase() === key)) return;
        out.push(s);
    };
    // Bulleted or numbered lines — the shape people actually write specs in.
    for (const line of request.split(/\r?\n/)) {
        if (/^\s*[-•*–—]\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line)) push(line);
    }
    // «… with A, B and C» — the one-line form of the same list.
    if (out.length < 3) {
        const m = request.match(/\b(?:with|including|features?:?)\s+([^.\n]{10,300})/i);
        if (m) for (const part of m[1].split(/,| and | و /i)) push(part);
    }
    return out.slice(0, 30);
}

/** What each engine genuinely delivers, in the words a request would use. */
const ENGINE_COVERS: Record<AppEngine, RegExp> = {
    map: /map|navigation|direction|route|distance|place|location|geo|gps|خريطة|خرائط|مسار|ملاحة|موقع|مسافة/i,
    chat: /chat|messag|room|conversation|dm\b|inbox|محادث|رسائل|دردش|غرف/i,
    weather: /weather|forecast|temperature|humidity|wind|طقس|توقّع|توقع|حرارة/i,
    records: /list|record|crud|table|entry|entries|manage|track|inventory|booking|order|task|note|expense|customer|student|contact|report|search|filter|export|قائمة|سجل|إدارة|تتبع|حجز|طلب|مهمة|ملاحظة|مصروف|عميل|طالب|تقرير|بحث|تصدير/i,
};

/** Cross-cutting things the BACKEND covers when one was built alongside. */
const BACKEND_COVERS = /login|sign\s*in|account|auth|password|database|db\b|api\b|rest\b|server|storage|persist|order|تسجيل\s*دخول|حساب|قاعدة\s*بيانات|خادم|واجهة\s*برمجية|طلبات/i;

/**
 * The features the delivery does NOT cover — named exactly as the user wrote
 * them. An empty list means everything asked for is in the build.
 */
export function uncoveredFeatures(request: string, engine: AppEngine | null, hasBackend: boolean): string[] {
    const asked = requestedFeatures(request);
    if (!asked.length) return [];
    const covers = engine ? ENGINE_COVERS[engine] : null;
    return asked.filter(f => {
        if (covers && covers.test(f)) return false;
        if (hasBackend && BACKEND_COVERS.test(f)) return false;
        return true;
    });
}
