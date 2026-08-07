/**
 * THE APP MANAGES WHAT HE ASKED FOR — NOT A GENERIC «سجلّ».
 *
 * His build, after the tables were finally read from his sentence:
 *
 *     إضافة سجلّ      ← العنوان * · التفاصيل · قيمة · التاريخ · الحالة
 *     إدارة النظام    ← النباتات | الموردون
 *
 * Two collections, and the big one on top means nothing. He asked for a plant
 * nursery and got a form for «records» sitting above the plants. The generic
 * schema is the FALLBACK the blueprint uses when it cannot tell what is being
 * managed — and by the time the interface is generated, the system's real
 * tables are already known: the server was built from them a minute earlier.
 *
 * So the first table becomes the application. «إضافة نبتة» with الاسم، السعر،
 * الكمية، الوصف — the search, the sort, the totals and the CSV export all
 * pointed at the real collection — and the administration screens carry the
 * REST of the tables, with nothing shown twice.
 */
import type { AppBlueprint, AppField, AppMetric } from './app-blueprints';
import type { ModelEntity, ModelField } from './data-model';

/**
 * One of them, not all of them.
 *
 * «إضافة النباتات» is not a sentence. Arabic plurals are not mechanical, so
 * this is a table rather than a rule — and anything absent from it falls back
 * to the plural, which reads awkwardly and is at least never wrong.
 */
const SINGULAR_AR: Record<string, string> = {
    plants: 'نبتة', products: 'منتج', items: 'صنف', dishes: 'طبق', books: 'كتاب',
    cars: 'سيارة', properties: 'عقار', rooms: 'غرفة', devices: 'جهاز',
    medicines: 'دواء', services: 'خدمة', courses: 'دورة', projects: 'مشروع',
    suppliers: 'مورّد', customers: 'عميل', employees: 'موظف', doctors: 'طبيب',
    patients: 'مريض', students: 'طالب', teachers: 'معلّم', drivers: 'سائق',
    members: 'عضو', users: 'مستخدم', contacts: 'جهة اتصال', vendors: 'بائع',
    orders: 'طلبية', invoices: 'فاتورة', sales: 'عملية بيع', purchases: 'عملية شراء',
    payments: 'دفعة', expenses: 'مصروف', shipments: 'شحنة', coupons: 'كوبون',
    appointments: 'موعد', bookings: 'حجز', tasks: 'مهمة', visits: 'زيارة',
    events: 'فعالية', categories: 'تصنيف', branches: 'فرع', warehouses: 'مستودع',
    reports: 'تقرير', enrollments: 'تسجيل', movements: 'حركة', deals: 'صفقة',
};

const SINGULAR_EN: Record<string, string> = {
    properties: 'property', categories: 'category', dishes: 'dish',
    'contacts': 'contact',
};

/** «الموردون» → «مورّد». */
export function oneOf(entity: ModelEntity, isAr: boolean): string {
    if (isAr) return SINGULAR_AR[entity.key] || entity.ar;
    return SINGULAR_EN[entity.key] || entity.en.replace(/ies$/, 'y').replace(/s$/, '');
}

/** A database column becomes a form field of the right SHAPE. */
function asField(f: ModelField, isAr: boolean, primary: boolean): AppField {
    const label = (isAr ? f.ar : f.en) || f.key;
    // A note is a paragraph; a price is a number; a date is a date picker.
    const type: AppField['type'] =
        f.type === 'REAL' || f.type === 'INT' ? 'number'
            : /(^|_)(note|notes|description|details|address)$/.test(f.key) ? 'textarea'
                : /(^|_)email$/.test(f.key) ? 'email'
                    : /(^|_)(phone|tel|mobile)$/.test(f.key) ? 'tel'
                        : /(^|_)(date|expires_at|due)$/.test(f.key) ? 'date'
                            : /(^|_)time$/.test(f.key) ? 'time'
                                : 'text';
    return {
        key: f.key, label, type,
        ...(f.required ? { required: true } : {}),
        ...(primary ? { primary: true } : {}),
    };
}

/**
 * The numbers worth showing, taken from the columns that exist.
 *
 * Never invented: a table with no money column gets no money total, and the
 * count is the one figure every collection can honestly produce.
 */
function metricsFor(e: ModelEntity, isAr: boolean): AppMetric[] {
    const out: AppMetric[] = [{ label: isAr ? `كل ${e.ar}` : `All ${e.en}`, kind: 'count' }];
    const money = e.fields.find(f => f.type === 'REAL');
    if (money) out.push({ label: isAr ? `مجموع ${money.ar || money.key}` : `Total ${money.en || money.key}`, kind: 'sum', field: money.key });
    const qty = e.fields.find(f => f.type === 'INT' && !/_id$/.test(f.key));
    if (qty) out.push({ label: isAr ? `مجموع ${qty.ar || qty.key}` : `Total ${qty.en || qty.key}`, kind: 'sum', field: qty.key });
    return out.slice(0, 3);
}

/**
 * Turn the system's first table into the application the user opens.
 *
 * `belongsTo` is deliberately NOT expressed as the blueprint's `relation`: the
 * parent picker there manages its own local rows, while these tables are all
 * served by the API and administered on the tables screen. Two places to add a
 * supplier is one place too many.
 */
export function blueprintFromEntity(base: AppBlueprint, e: ModelEntity, isAr: boolean): AppBlueprint {
    const one = oneOf(e, isAr);
    const many = isAr ? e.ar : e.en;
    // The first non-link column names the row wherever it is listed.
    const primaryKey = (e.fields.find(f => f.required && !/_id$/.test(f.key))
        || e.fields.find(f => !/_id$/.test(f.key)))?.key;
    const fields = e.fields
        .filter(f => !/_id$/.test(f.key))          // a link is chosen on the tables screen
        .map(f => asField(f, isAr, f.key === primaryKey));
    if (!fields.length) return base;               // nothing to manage — keep the fallback

    return {
        ...base,
        kind: 'generic',
        engine: 'records',
        title: many,
        lede: isAr
            ? `أضف ${many}، وابحث فيها، ورتّبها، وصدّرها — بيانات حقيقية من قاعدة نظامك.`
            : `Add, search, sort and export your ${e.en} — real rows from your own database.`,
        entityOne: one,
        entityMany: many,
        emptyHint: isAr ? `لا ${many} بعد — أضف أول ${one} من النموذج.` : `No ${e.en} yet — add the first one above.`,
        fields,
        metrics: metricsFor(e, isAr),
        statusField: '',
        doneValue: '',
        relation: undefined,
    };
}

/**
 * The API address of one table, on whatever origin the session's API lives.
 * `http://localhost:4100/api/items` → `http://localhost:4100/api/plants`.
 */
export function apiFor(apiLink: string, key: string): string {
    const link = String(apiLink || '');
    if (!link) return '';
    const at = link.lastIndexOf('/api/');
    return at < 0 ? link : `${link.slice(0, at)}/api/${key}`;
}
