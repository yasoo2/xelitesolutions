/**
 * A THOUSAND THINGS A REAL PERSON MIGHT ASK JOE, EASIEST FIRST.
 *
 * Not a thousand variations of one sentence. The corpus is built from the ways
 * a request can be HARD, and each tier adds one more of them:
 *
 *   1  bare     — one thing, named plainly
 *   2  named    — the thing carries a name he chose
 *   3  listed   — several items in one sentence
 *   4  two      — two separate requests joined by «و»
 *   5  condition— an explicit rule the result must obey
 *   6  edit     — a change to something already built
 *   7  partial  — deliberately missing information
 *   8  trap     — words that mean two things, or contain other words
 *
 * Every prompt is written the way the owner actually writes: Arabic with real
 * case endings, some dialect, some English, some mixed. A corpus of clean
 * textbook Arabic would measure a language nobody types.
 *
 * The tiers are the point. A failure at tier 1 is a different illness from a
 * failure at tier 7, and averaging them into one score hides both.
 */

export interface Prompt {
    id: string;
    tier: number;
    /** What kind of hard this one is. */
    kind: string;
    text: string;
    /** What Joe must end up with. Empty means «anything, but not nothing». */
    expect: {
        pages?: string[];
        columns?: number;
        criteria?: string[];
        /** Criteria that must NOT appear — the traps. */
        forbid?: string[];
    };
}

const SUBJECTS = [
    'شركة تنظيف', 'مطعم شاورما', 'متجر عطور', 'عيادة أسنان', 'مكتب محاماة',
    'صالون تجميل', 'ورشة سيارات', 'مدرسة خصوصية', 'شركة شحن', 'مقهى',
    'متجر ملابس', 'شركة برمجة', 'نادي رياضي', 'مخبز', 'استوديو تصوير',
    'شركة عقارات', 'صيدلية', 'مغسلة ملابس', 'شركة سفر', 'محل زهور',
];

const PAGE_WORDS: Array<[string, string]> = [
    ['من نحن', 'about'], ['تواصل', 'contact'], ['خدمات', 'services'],
    ['المنتجات', 'products'], ['الأسعار', 'pricing'], ['الأسئلة الشائعة', 'faq'],
    ['المدونة', 'blog'], ['الأعمال', 'work'], ['الحجز', 'reservations'],
    ['قائمة الطعام', 'menu'], ['الشحن', 'shipping'], ['الدعم', 'support'],
];

const FIELD_SETS: string[][] = [
    ['اسم العميل', 'المبلغ', 'التاريخ'],
    ['اسم الموظف', 'الراتب', 'تاريخ التعيين'],
    ['رقم الطلب', 'الحالة', 'المبلغ الإجمالي'],
    ['اسم الطالب', 'الصف', 'الدرجة'],
    ['اسم المنتج', 'السعر', 'الكمية'],
    ['اسم المريض', 'رقم الهاتف', 'موعد الزيارة'],
];

const out: Prompt[] = [];
let n = 0;
const push = (tier: number, kind: string, text: string, expect: Prompt['expect'] = {}) => {
    out.push({ id: `p${String(++n).padStart(4, '0')}`, tier, kind, text, expect });
};

/* ---- tier 1: one thing, named plainly ------------------------------------ */
for (const s of SUBJECTS) {
    push(1, 'bare-site', `اعمل لي موقع ${s}`);
    push(1, 'bare-page', `أريد صفحة ${s}`);
    push(1, 'bare-en', `build a website for a ${s.split(' ')[0]} business`);
}

/* ---- tier 2: he names the thing ------------------------------------------ */
const BRANDS = ['نور', 'الأصيل', 'بيت الياسمين', 'الواحة', 'المنارة', 'زهرة المدائن', 'الديوان'];
for (const s of SUBJECTS.slice(0, 14)) {
    for (const b of BRANDS.slice(0, 3)) {
        push(2, 'named-brand', `اعمل موقع ${s} اسمه «${b}»`);
    }
}

/* ---- tier 3: several items in one sentence ------------------------------- */
for (const fields of FIELD_SETS) {
    for (const container of ['جدول', 'برنامج يحفظ', 'قاعدة بيانات']) {
        push(3, 'listed-columns',
            `اعمل ${container} فيه ${fields.join(' و')}`,
            { columns: fields.length });
    }
    push(3, 'listed-columns-tanween',
        `اعمل جدولًا فيه ${fields.join(' و')}`,
        { columns: fields.length });
}
for (const s of SUBJECTS.slice(0, 12)) {
    for (const k of [2, 3]) {
        const chosen = PAGE_WORDS.slice(0, k);
        push(3, 'listed-pages',
            `ابنِ موقع ${s} فيه ${chosen.map(([w]) => `صفحة ${w}`).join(' و')}`,
            { pages: chosen.map(([, slug]) => slug) });
    }
}

/* ---- tier 4: two requests in one sentence -------------------------------- */
for (const s of SUBJECTS.slice(0, 16)) {
    push(4, 'two-pages',
        `اعمل لي صفحة هبوط وصفحة تواصل لـ${s}`,
        { pages: ['index', 'contact'] });
    push(4, 'page-and-table',
        `اعمل موقع ${s} وجدول فيه اسم العميل والمبلغ والتاريخ`,
        { columns: 3 });
    push(4, 'two-en',
        `build a landing page and a pricing page for a ${s.split(' ')[0]}`,
        { pages: ['index', 'pricing'] });
}

/* ---- tier 5: an explicit condition --------------------------------------- */
const CONDITIONS = [
    ['ولا تقبل مبلغًا صفرًا', 'zero'],
    ['واجعل التصميم داكنًا', 'dark'],
    ['ولا تستعمل صورًا خارجية', 'noimg'],
    ['واجعله يعمل على الجوال', 'mobile'],
    ['ولا تضف صفحة تسجيل دخول', 'nologin'],
];
for (const s of SUBJECTS.slice(0, 14)) {
    for (const [cond] of CONDITIONS.slice(0, 3)) {
        push(5, 'condition', `اعمل موقع ${s} ${cond}`);
    }
}
for (const fields of FIELD_SETS) {
    push(5, 'condition-field',
        `اعمل جدول فيه ${fields.join(' و')} ولا تقبل مبلغًا صفرًا`,
        { columns: fields.length });
}

/* ---- tier 6: an edit after a build --------------------------------------- */
const EDITS = [
    'غيّر العنوان إلى «أهلاً بكم»',
    'أضف صفحة الأسعار',
    'احذف قسم الآراء',
    'غيّر اللون إلى أزرق فاتح',
    'أعد تسمية عمود المبلغ إلى الإجمالي',
    'ضع زر واتساب في الأسفل',
    'اجعل الخط أكبر',
    'أضف عمود الملاحظات',
];
for (const e of EDITS) {
    for (const s of SUBJECTS.slice(0, 8)) push(6, 'edit', `في موقع ${s}: ${e}`);
}

/* ---- tier 7: deliberately incomplete ------------------------------------- */
const PARTIAL = [
    'اعمل لي موقع',
    'أريد تطبيق',
    'سوّي لي شي حلو',
    'اعمل جدول',
    'ابني لي صفحة',
    'أبغى موقع مثل اللي شفته أمس',
    'اعمل لي نفس الشي بس أحسن',
    'اعمل موقع فيه كل شي',
];
for (const p of PARTIAL) for (let i = 0; i < 5; i++) push(7, 'partial', p);

/* ---- tier 8: the traps ---------------------------------------------------- */
const TRAPS: Array<[string, string[]]> = [
    ['اعمل صفحة بخلفية زرقاء ولون أزرق فاتح', ['button']],
    ['ابنِ موقعًا متعدد الصفحات لمطعم', ['counter']],
    ['أضف مجموعة صور للمعرض', ['counter']],
    ['عندي استعداد لإطلاق الموقع غدًا، جهّز لي صفحة', ['counter']],
    ['موقع لبيع الجزر والخضار الطازجة', ['button']],
    ['اعمل جدول فيه عنوان العميل ورقم الهاتف', []],
    ['أريد قائمة بأسماء الموظفين', []],
    ['اعمل صفحة فيها جدول مواعيد العيادة', []],
    ['اعمل موقع فيه صفحة المنتجات وصفحة الشحن والاسترجاع', []],
    ['أريد الإجمالي في الأسفل', []],
];
for (const [text, forbid] of TRAPS) {
    for (let i = 0; i < 5; i++) push(8, 'trap', text, { forbid });
}

/* ---- fill to a thousand with graded combinations -------------------------- */
let tier = 1;
while (out.length < 1000) {
    const s = SUBJECTS[out.length % SUBJECTS.length];
    const f = FIELD_SETS[out.length % FIELD_SETS.length];
    const pg = PAGE_WORDS[out.length % PAGE_WORDS.length];
    const pg2 = PAGE_WORDS[(out.length + 3) % PAGE_WORDS.length];
    tier = (tier % 8) + 1;
    switch (tier) {
        case 1: push(1, 'bare-site', `أبغى موقع ${s}`); break;
        case 2: push(2, 'named-brand', `سوّي موقع ${s} باسم «${BRANDS[out.length % BRANDS.length]}»`); break;
        case 3: push(3, 'listed-columns', `اعمل جدول ${s} فيه ${f.join(' و')}`, { columns: f.length }); break;
        case 4: push(4, 'two-pages', `اعمل موقع ${s} فيه صفحة ${pg[0]} وصفحة ${pg2[0]}`, { pages: [pg[1], pg2[1]] }); break;
        case 5: push(5, 'condition', `اعمل موقع ${s} ${CONDITIONS[out.length % CONDITIONS.length][0]}`); break;
        case 6: push(6, 'edit', `في موقع ${s}: ${EDITS[out.length % EDITS.length]}`); break;
        case 7: push(7, 'partial', PARTIAL[out.length % PARTIAL.length]); break;
        default: push(8, 'trap', TRAPS[out.length % TRAPS.length][0], { forbid: TRAPS[out.length % TRAPS.length][1] }); break;
    }
}

export const THOUSAND: Prompt[] = out.slice(0, 1000);
