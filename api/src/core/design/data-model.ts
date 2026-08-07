/**
 * ONE TABLE WAS THE CEILING.
 *
 * «Build a world-class e-commerce platform similar to Shopify: multi-vendor
 * marketplace, inventory, payments, shipping, coupons, loyalty…» — and what a
 * build could produce was ONE table (`products`), an `orders` table, and an
 * owner login. The delivery message now says so out loud («✅ Built 2 · ❌ Not
 * built 13»), which is honest, and honest is not enough.
 *
 * Every one of those thirteen begins in the same place: a system needs more
 * than one KIND of row. Vendors own products. Shipments belong to orders.
 * Coupons stand on their own. A clinic has doctors and patients before it has
 * appointments. Until the generator can say that, no amount of front-end work
 * makes a platform.
 *
 * This derives that model from the request — deterministically, no model call,
 * the way every other decision in this builder is made. It describes the
 * entities BESIDE the primary collection the API already owns, so a plain
 * store keeps behaving exactly as it does today: an empty model changes
 * nothing.
 */

export interface ModelField {
    key: string;
    type: 'TEXT' | 'REAL' | 'INT';
    required?: boolean;
    /** Human labels, for the README and the chat message. */
    ar?: string;
    en?: string;
}

export interface ModelEntity {
    /** SQL table name and URL segment — plural, lowercase, ascii. */
    key: string;
    ar: string;
    en: string;
    fields: ModelField[];
    /** A real foreign key: the row cannot be created pointing at nothing. */
    belongsTo?: { entity: string; key: string };
}

const T = (key: string, ar: string, en: string, required = false): ModelField =>
    ({ key, type: 'TEXT', required, ar, en });
const N = (key: string, ar: string, en: string): ModelField => ({ key, type: 'REAL', ar, en });
const FK = (key: string): ModelField => ({ key, type: 'INT' });

/**
 * The domains, and what each one is actually made of. Kept to four entities:
 * a model nobody can hold in their head is not a model, and every table here
 * is generated with real CRUD, real validation and a real foreign key — so
 * inventing a fifth speculative one costs the user a build he did not ask for.
 */
const DOMAINS: Array<{ id: string; ask: RegExp; entities: ModelEntity[] }> = [
    {
        id: 'marketplace',
        ask: /multi[- ]?vendor|marketplace|multi[- ]?seller|shopify|e-?commerce platform|متعدد(ة)? البائعين|سوق إ?لكتروني|منصّ?ة تجارة/i,
        entities: [
            {
                key: 'vendors', ar: 'البائعون', en: 'vendors',
                fields: [T('name', 'الاسم التجاري', 'store name', true), T('email', 'البريد', 'email'),
                    T('phone', 'الهاتف', 'phone'), N('commission', 'نسبة العمولة %', 'commission %')],
            },
            {
                key: 'customers', ar: 'العملاء', en: 'customers',
                fields: [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'), T('email', 'البريد', 'email')],
            },
            {
                key: 'coupons', ar: 'الكوبونات', en: 'coupons',
                fields: [T('code', 'الرمز', 'code', true), N('percent', 'نسبة الخصم %', 'discount %'),
                    T('expires_at', 'ينتهي في', 'expires at')],
            },
            {
                key: 'shipments', ar: 'الشحنات', en: 'shipments',
                belongsTo: { entity: 'customers', key: 'customer_id' },
                fields: [FK('customer_id'), T('carrier', 'شركة الشحن', 'carrier'),
                    T('tracking', 'رقم التتبّع', 'tracking number'), T('status', 'الحالة', 'status')],
            },
        ],
    },
    {
        id: 'clinic',
        ask: /\b(clinic|dental|dentist|doctors?|patients?|medical)\b|عيادة|طبيب|أطباء|مرضى|مواعيد طبية/i,
        entities: [
            {
                key: 'doctors', ar: 'الأطباء', en: 'doctors',
                fields: [T('name', 'الاسم', 'name', true), T('speciality', 'التخصص', 'speciality'), T('phone', 'الهاتف', 'phone')],
            },
            {
                key: 'patients', ar: 'المرضى', en: 'patients',
                fields: [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'), T('notes', 'ملاحظات', 'notes')],
            },
            {
                key: 'appointments', ar: 'المواعيد', en: 'appointments',
                belongsTo: { entity: 'patients', key: 'patient_id' },
                fields: [FK('patient_id'), FK('doctor_id'), T('at', 'الموعد', 'at', true), T('status', 'الحالة', 'status')],
            },
        ],
    },
    {
        id: 'school',
        ask: /\b(school|course|courses|students?|lms|academy|training)\b|مدرسة|دورات|طلاب|أكاديمية|تدريب/i,
        entities: [
            {
                key: 'courses', ar: 'الدورات', en: 'courses',
                fields: [T('title', 'العنوان', 'title', true), N('price', 'السعر', 'price'), T('teacher', 'المدرّب', 'teacher')],
            },
            {
                key: 'students', ar: 'الطلاب', en: 'students',
                fields: [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'), T('email', 'البريد', 'email')],
            },
            {
                key: 'enrollments', ar: 'التسجيلات', en: 'enrollments',
                belongsTo: { entity: 'students', key: 'student_id' },
                fields: [FK('student_id'), FK('course_id'), T('status', 'الحالة', 'status'), N('grade', 'الدرجة', 'grade')],
            },
        ],
    },
    {
        id: 'warehouse',
        ask: /\b(inventory|warehouse|suppliers?|stock management)\b|مخزون|مستودع|موردين|إدارة المخزون/i,
        entities: [
            {
                key: 'suppliers', ar: 'الموردون', en: 'suppliers',
                fields: [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'), T('email', 'البريد', 'email')],
            },
            {
                key: 'movements', ar: 'حركات المخزون', en: 'stock movements',
                belongsTo: { entity: 'suppliers', key: 'supplier_id' },
                fields: [FK('supplier_id'), T('item', 'الصنف', 'item', true), N('qty', 'الكمية', 'quantity'),
                    T('kind', 'النوع (دخول/خروج)', 'kind (in/out)')],
            },
        ],
    },
    {
        id: 'crm',
        ask: /\b(crm|leads?|deals?|pipeline|sales team)\b|علاقات العملاء|صفقات|عملاء محتملون/i,
        entities: [
            {
                key: 'contacts', ar: 'جهات الاتصال', en: 'contacts',
                fields: [T('name', 'الاسم', 'name', true), T('company', 'الشركة', 'company'), T('phone', 'الهاتف', 'phone')],
            },
            {
                key: 'deals', ar: 'الصفقات', en: 'deals',
                belongsTo: { entity: 'contacts', key: 'contact_id' },
                fields: [FK('contact_id'), T('title', 'العنوان', 'title', true), N('amount', 'القيمة', 'amount'),
                    T('stage', 'المرحلة', 'stage')],
            },
        ],
    },
    {
        /**
         * «Posts Stories Reels Live streaming Groups Pages Messaging Video
         * calls AI moderation Recommendations Ads platform Creator dashboard»
         *
         * Twelve features, and the model matched NONE of the six domains — so
         * the build produced one table (`posts`) and a paragraph listing
         * eleven things it had not built. Four of those twelve are rows with
         * fields and a lifecycle, which is exactly what this system is good
         * at: a group, a page, a message, an ad campaign. They stop being an
         * apology and become tables with real CRUD and real screens.
         *
         * The other eight — Stories, Reels, live streaming, video calls, AI
         * moderation, recommendations — are media pipelines and models, not
         * rows. They stay in the «not built» list, honestly, where they belong.
         */
        id: 'social',
        ask: /\b(social (media|network|platform)|feed|community platform)\b|شبكة اجتماعية|تواصل اجتماعي|منصّ?ة تواصل/i,
        entities: [
            {
                key: 'groups', ar: 'المجموعات', en: 'groups',
                fields: [T('name', 'الاسم', 'name', true), T('description', 'الوصف', 'description'),
                    T('privacy', 'الخصوصية', 'privacy'), N('members', 'عدد الأعضاء', 'members')],
            },
            {
                key: 'pages', ar: 'الصفحات', en: 'pages',
                fields: [T('name', 'الاسم', 'name', true), T('category', 'التصنيف', 'category'),
                    T('description', 'الوصف', 'description'), N('followers', 'المتابعون', 'followers')],
            },
            {
                key: 'messages', ar: 'الرسائل', en: 'messages',
                fields: [T('sender', 'المُرسِل', 'sender', true), T('recipient', 'المستقبِل', 'recipient', true),
                    T('body', 'النص', 'body', true), T('sent_at', 'وقت الإرسال', 'sent at')],
            },
            {
                key: 'ads', ar: 'الإعلانات', en: 'ads',
                fields: [T('title', 'العنوان', 'title', true), N('budget', 'الميزانية', 'budget'),
                    T('audience', 'الجمهور', 'audience'), T('status', 'الحالة', 'status')],
            },
        ],
    },
    {
        id: 'booking',
        ask: /\b(booking|reservations?|appointments?)\b|حجوزات|حجز موعد|مواعيد/i,
        entities: [
            {
                key: 'services', ar: 'الخدمات', en: 'services',
                fields: [T('name', 'الاسم', 'name', true), N('price', 'السعر', 'price'), N('minutes', 'المدة بالدقائق', 'minutes')],
            },
            {
                key: 'bookings', ar: 'الحجوزات', en: 'bookings',
                belongsTo: { entity: 'services', key: 'service_id' },
                fields: [FK('service_id'), T('customer', 'العميل', 'customer', true), T('at', 'الموعد', 'at', true),
                    T('phone', 'الهاتف', 'phone')],
            },
        ],
    },
];

/** SQL identifier and URL segment — both, or neither. */
const safe = (s: string) => String(s || '').replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 40);

/**
 * The entities this request implies, beside the primary collection.
 *
 * Empty for anything that does not clearly name a domain — a plain store, a
 * restaurant menu, a landing page. Silence is the correct answer there: a
 * table nobody asked for is scaffolding to delete, not a feature.
 */
export function deriveDataModel(request: string): ModelEntity[] {
    const req = String(request || '');
    if (!req.trim()) return [];
    const domain = DOMAINS.find(d => d.ask.test(req));
    if (!domain) return [];
    return domain.entities
        .map(e => ({
            ...e,
            key: safe(e.key),
            fields: e.fields.map(f => ({ ...f, key: safe(f.key) })).filter(f => f.key && f.key !== 'id' && f.key !== 'created_at'),
        }))
        .filter(e => e.key && e.fields.length)
        .slice(0, 4);
}

/** Which domain answered, for the log — «why did I get these four tables?» */
export function dataModelDomain(request: string): string {
    return DOMAINS.find(d => d.ask.test(String(request || '')))?.id || '';
}

/** The one-line summary the delivery message shows. */
export function describeModel(entities: ModelEntity[], isAr: boolean): string {
    if (!entities.length) return '';
    const names = entities.map(e => (isAr ? e.ar : e.en)).join(' · ');
    const links = entities.filter(e => e.belongsTo).length;
    return isAr
        ? `🗂️ جداول النظام (${entities.length}): ${names}${links ? ` — ومنها ${links} مرتبط بمفتاح خارجي حقيقي` : ''}`
        : `🗂️ System tables (${entities.length}): ${names}${links ? ` — ${links} of them linked by a real foreign key` : ''}`;
}
