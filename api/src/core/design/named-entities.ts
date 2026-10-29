/**
 * HE ALREADY TOLD JOE THE TABLES. JOE ASKED A MODEL INSTEAD.
 *
 *     «ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات
 *      مع صور نباتات وثيم اخضر جميل للنظام»
 *
 * What came back was a generic «إضافة سجلّ» screen — العنوان، التفاصيل، قيمة،
 * التاريخ، الحالة. Not one plant, not one supplier, not one order. The chain
 * is exactly traceable in his log:
 *
 *     [PlanningEngine] build scope = system -> api_project + react_project   ✅
 *     data model: no domain matched and no model answered                    ❌
 *
 * «مشتل نباتات» is not one of the six hand-written domains, and every provider
 * was rate-limited that minute, so `designDataModel` returned nothing and the
 * builder fell back to its single generic collection.
 *
 * But there was NOTHING to design. He wrote the tables himself, in his own
 * sentence, after a colon, separated by «و». A system that needs a 70-billion
 * parameter model to read a list the user typed is not intelligent — it is
 * dependent. This reads the list.
 *
 * Deterministic, offline, and refused when it is not sure: two recognisable
 * nouns or it declines and lets the model try. It never invents a table.
 */
import type { ModelEntity, ModelField } from './data-model';
import { MAX_MODEL_ENTITIES, NEVER, describedTable, englishFor, fieldsForKind, inferKind, isCapability, isRoleInContext, keyForPhrase, requestSells, type EntityKind } from './entity-inference';
import { RESERVED_TABLES } from './schema-designer';
import { ENGLISH_PREPOSITION, foldPattern, isDeliverable, isInterfaceNoun, isPossessivePhrase, listRegion, splitListItems, type ListMarker } from './request-lists';
import { isActionWord, isFeaturePhrase, normaliseListedRequest, withoutLeadingAction } from './listed-request';
import { foldChars } from '../orchestrator/promptNormalizer';
import { stripDeclaredOptions } from './requested-artifact';

const T = (key: string, ar: string, en: string, required = false): ModelField =>
    ({ key, type: 'TEXT', required, ar, en });
const N = (key: string, ar: string, en: string): ModelField => ({ key, type: 'REAL', ar, en });
const I = (key: string, ar: string, en: string): ModelField => ({ key, type: 'INT', ar, en });

/**
 * The nouns a business actually names, and the table each one means.
 *
 * `kind` decides the columns: a person needs a phone, a product needs a price,
 * a transaction needs a quantity and a status. It is the difference between a
 * table called «الموردون» and a table that can hold a supplier.
 */
type Kind = 'person' | 'thing' | 'deal' | 'event' | 'plain';

interface Noun { key: string; ar: string; en: string; kind: Kind; re: RegExp }

const NOUNS: Noun[] = [
    // — things you sell, grow, stock —
    { key: 'plants', ar: 'النباتات', en: 'plants', kind: 'thing', re: /^(ال)?نبات(ات)?$|^plants?$/i },
    { key: 'products', ar: 'المنتجات', en: 'products', kind: 'thing', re: /^(ال)?منتج(ات)?$|^(ال)?بضائع$|^products?$|^items?$/i },
    { key: 'items', ar: 'الأصناف', en: 'items', kind: 'thing', re: /^(ال)?[أا]صناف$|^(ال)?صنف$/i },
    { key: 'dishes', ar: 'الأطباق', en: 'dishes', kind: 'thing', re: /^(ال)?[أا]طباق$|^(ال)?وجبات$|^dishes$|^meals$/i },
    { key: 'books', ar: 'الكتب', en: 'books', kind: 'thing', re: /^(ال)?كتب$|^books$/i },
    { key: 'cars', ar: 'السيارات', en: 'cars', kind: 'thing', re: /^(ال)?سيارات$|^(ال)?مركبات$|^cars$|^vehicles$/i },
    { key: 'properties', ar: 'العقارات', en: 'properties', kind: 'thing', re: /^(ال)?عقارات$|^(ال)?شقق$|^properties$/i },
    { key: 'rooms', ar: 'الغرف', en: 'rooms', kind: 'thing', re: /^(ال)?غرف$|^rooms$/i },
    { key: 'devices', ar: 'الأجهزة', en: 'devices', kind: 'thing', re: /^(ال)?[أا]جهزة$|^devices$/i },
    { key: 'medicines', ar: 'الأدوية', en: 'medicines', kind: 'thing', re: /^(ال)?[أا]دوية$|^medicines?$|^drugs$/i },
    { key: 'services', ar: 'الخدمات', en: 'services', kind: 'thing', re: /^(ال)?خدمات$|^services$/i },
    { key: 'courses', ar: 'الدورات', en: 'courses', kind: 'thing', re: /^(ال)?دورات$|^(ال)?مساقات$|^courses$/i },
    { key: 'projects', ar: 'المشاريع', en: 'projects', kind: 'thing', re: /^(ال)?مشاريع$|^projects$/i },

    // — people —
    { key: 'suppliers', ar: 'الموردون', en: 'suppliers', kind: 'person', re: /^(ال)?مور[دّ]?(ين|ون|ي)?$|^(ال)?موردين$|^suppliers?$|^vendors?$/i },
    { key: 'customers', ar: 'العملاء', en: 'customers', kind: 'person', re: /^(ال)?عملاء$|^(ال)?زبائن$|^(ال)?موكل(ين|ون)$|^customers?$|^clients?$/i },
    { key: 'employees', ar: 'الموظفون', en: 'employees', kind: 'person', re: /^(ال)?موظف(ين|ون|ات)?$|^employees?$|^staff$/i },
    { key: 'doctors', ar: 'الأطباء', en: 'doctors', kind: 'person', re: /^(ال)?[أا]طباء$|^doctors?$/i },
    { key: 'patients', ar: 'المرضى', en: 'patients', kind: 'person', re: /^(ال)?مرضى$|^patients?$/i },
    { key: 'students', ar: 'الطلاب', en: 'students', kind: 'person', re: /^(ال)?طلاب$|^(ال)?طلبة$|^students?$/i },
    { key: 'teachers', ar: 'المعلمون', en: 'teachers', kind: 'person', re: /^(ال)?معلم(ين|ون)?$|^(ال)?مدرس(ين|ون)?$|^teachers?$/i },
    { key: 'drivers', ar: 'السائقون', en: 'drivers', kind: 'person', re: /^(ال)?سائق(ين|ون)?$|^drivers?$/i },
    { key: 'members', ar: 'الأعضاء', en: 'members', kind: 'person', re: /^(ال)?[أا]عضاء$|^members?$/i },
    { key: 'users', ar: 'المستخدمون', en: 'users', kind: 'person', re: /^(ال)?مستخدم(ين|ون)?$|^users?$/i },
    { key: 'contacts', ar: 'جهات الاتصال', en: 'contacts', kind: 'person', re: /^(ال)?عملاء المحتملون$|^leads$|^contacts?$/i },

    // — transactions —
    { key: 'orders', ar: 'الطلبيات', en: 'orders', kind: 'deal', re: /^(ال)?طلب(يات|ات)?$|^(ال)?طلبيه$|^orders?$/i },
    { key: 'invoices', ar: 'الفواتير', en: 'invoices', kind: 'deal', re: /^(ال)?فواتير$|^(ال)?فاتورة$|^invoices?$|^bills$/i },
    { key: 'sales', ar: 'المبيعات', en: 'sales', kind: 'deal', re: /^(ال)?مبيعات$|^sales$/i },
    { key: 'purchases', ar: 'المشتريات', en: 'purchases', kind: 'deal', re: /^(ال)?مشتريات$|^purchases$/i },
    { key: 'payments', ar: 'المدفوعات', en: 'payments', kind: 'deal', re: /^(ال)?مدفوعات$|^(ال)?دفعات$|^payments?$/i },
    { key: 'expenses', ar: 'المصروفات', en: 'expenses', kind: 'deal', re: /^(ال)?مصروفات$|^(ال)?مصاريف$|^(ال)?نفقات$|^expenses$/i },
    { key: 'shipments', ar: 'الشحنات', en: 'shipments', kind: 'deal', re: /^(ال)?شحنات$|^shipments?$/i },

    // — things on a calendar —
    { key: 'appointments', ar: 'المواعيد', en: 'appointments', kind: 'event', re: /^(ال)?مواعيد$|^appointments?$/i },
    { key: 'bookings', ar: 'الحجوزات', en: 'bookings', kind: 'event', re: /^(ال)?حجوزات$|^bookings?$|^reservations?$/i },
    { key: 'tasks', ar: 'المهام', en: 'tasks', kind: 'event', re: /^(ال)?مهام$|^tasks?$/i },
    { key: 'visits', ar: 'الزيارات', en: 'visits', kind: 'event', re: /^(ال)?زيارات$|^visits?$/i },
    { key: 'events', ar: 'الفعاليات', en: 'events', kind: 'event', re: /^(ال)?فعاليات$|^(ال)?[أا]حداث$|^(ال)?مناسبات$|^events?$/i },

    // — plain records —
    { key: 'categories', ar: 'التصنيفات', en: 'categories', kind: 'plain', re: /^(ال)?تصنيفات$|^(ال)?[أا]قسام$|^categories$/i },
    { key: 'branches', ar: 'الفروع', en: 'branches', kind: 'plain', re: /^(ال)?فروع$|^branches$/i },
    { key: 'warehouses', ar: 'المستودعات', en: 'warehouses', kind: 'plain', re: /^(ال)?مستودعات$|^(ال)?مخازن$|^warehouses$/i },
    { key: 'reports', ar: 'التقارير', en: 'reports', kind: 'plain', re: /^(ال)?تقارير$|^reports?$/i },

    /**
     * THE ENGLISH OF COMMON ARABIC RECORD NOUNS (round 20).
     *
     * Without a dictionary entry an Arabic noun is keyed by its transliteration
     * («العلاجات» → alajats): Joe's own builder then serves /api/alajats, a
     * model-written server serves /api/treatments, and nobody can match either
     * to his word. This is a bilingual noun dictionary — ordinary words of the
     * language, not a catalogue of products. Words whose English depends on the
     * domain («الوصفات» recipes/prescriptions, «العروض» offers/shows,
     * «الأعمال» works/business) are deliberately absent: a transliteration is
     * then reported «not measured», never guessed.
     */
    // — people —
    { key: 'trainers', ar: 'المدربون', en: 'trainers', kind: 'person', re: /^(ال)?مدرب(ين|ون)?$|^trainers?$|^instructors?$/i },
    { key: 'trainees', ar: 'المتدربون', en: 'trainees', kind: 'person', re: /^(ال)?متدرب(ين|ون)?$|^trainees?$/i },
    { key: 'readers', ar: 'القراء', en: 'readers', kind: 'person', re: /^(ال)?قراء$|^readers?$/i },
    { key: 'guests', ar: 'النزلاء', en: 'guests', kind: 'person', re: /^(ال)?نزلاء$|^(ال)?ضيوف$|^guests?$/i },
    // «أصحاب» is the plural of «صاحب», the owner («أصحاب الحيوانات» are pet owners).
    { key: 'owners', ar: 'المالكون', en: 'owners', kind: 'person', re: /^(ال)?مالك(ين|ون)$|^(ال)?ملاك$|^(ال)?[أا]صحاب$|^owners?$/i },
    { key: 'workers', ar: 'العمال', en: 'workers', kind: 'person', re: /^(ال)?عمال$|^(ال)?عاملات$|^workers?$|^cleaners?$/i },
    { key: 'donors', ar: 'المتبرعون', en: 'donors', kind: 'person', re: /^(ال)?متبرع(ين|ون)?$|^donors?$/i },
    { key: 'beneficiaries', ar: 'المستفيدون', en: 'beneficiaries', kind: 'person', re: /^(ال)?مستفيد(ين|ون)?$|^beneficiar(y|ies)$/i },
    { key: 'travelers', ar: 'المسافرون', en: 'travelers', kind: 'person', re: /^(ال)?مسافر(ين|ون)?$|^travell?ers?$/i },
    { key: 'children', ar: 'الأطفال', en: 'children', kind: 'person', re: /^(ال)?[أا]طفال$|^children$|^kids$/i },
    { key: 'players', ar: 'اللاعبون', en: 'players', kind: 'person', re: /^(ال)?لاعب(ين|ون)?$|^players?$/i },
    // Only the human plurals: «المرشح» alone is a candidate or a filter.
    { key: 'candidates', ar: 'المرشحون', en: 'candidates', kind: 'person', re: /^(ال)?مرشح(ين|ون)$|^candidates?$/i },
    { key: 'authors', ar: 'المؤلفون', en: 'authors', kind: 'person', re: /^(ال)?مؤلف(ين|ون)?$|^authors?$/i },
    { key: 'nurses', ar: 'الممرضون', en: 'nurses', kind: 'person', re: /^(ال)?ممرض(ين|ون|ات)?$|^nurses?$/i },
    { key: 'friends', ar: 'الأصدقاء', en: 'friends', kind: 'person', re: /^(ال)?[أا]صدقاء$|^friends?$/i },
    // — things —
    { key: 'treatments', ar: 'العلاجات', en: 'treatments', kind: 'plain', re: /^(ال)?علاج(ات)?$|^treatments?$/i },
    { key: 'tables', ar: 'الطاولات', en: 'tables', kind: 'plain', re: /^(ال)?طاولات$|^tables$/i },
    { key: 'drinks', ar: 'المشروبات', en: 'drinks', kind: 'thing', re: /^(ال)?مشروبات$|^drinks?$|^beverages?$/i },
    /**
     * «الحيوانات» is animals — in a zoo, on a farm, at a vet. It was keyed
     * `pets` while the translator said "animals", so one table had two English
     * names (round 21 review). His word decides; «pets» is its own noun.
     */
    { key: 'pets', ar: 'الحيوانات الأليفة', en: 'pets', kind: 'plain', re: /^(ال)?حيوانات (ال)?[أا]ليف[ةه]$|^pets?$/i },
    { key: 'animals', ar: 'الحيوانات', en: 'animals', kind: 'plain', re: /^(ال)?حيوان(ات)?$|^animals?$/i },
    { key: 'materials', ar: 'المواد', en: 'materials', kind: 'thing', re: /^(ال)?مواد$|^materials?$/i },
    { key: 'bouquets', ar: 'الباقات', en: 'bouquets', kind: 'thing', re: /^(ال)?باقات$|^bouquets?$/i },
    { key: 'crops', ar: 'المحاصيل', en: 'crops', kind: 'thing', re: /^(ال)?محاصيل$|^crops?$/i },
    { key: 'livestock', ar: 'المواشي', en: 'livestock', kind: 'thing', re: /^(ال)?مواشي$|^livestock$/i },
    { key: 'movies', ar: 'الأفلام', en: 'movies', kind: 'thing', re: /^(ال)?[أا]فلام$|^movies?$|^films?$/i },
    { key: 'perfumes', ar: 'العطور', en: 'perfumes', kind: 'thing', re: /^(ال)?عطور$|^perfumes?$/i },
    { key: 'bottles', ar: 'العبوات', en: 'bottles', kind: 'thing', re: /^(ال)?عبوات$|^bottles?$/i },
    { key: 'locations', ar: 'المواقع', en: 'locations', kind: 'plain', re: /^(ال)?مواقع$|^locations?$/i },
    { key: 'addresses', ar: 'العناوين', en: 'addresses', kind: 'plain', re: /^(ال)?عناوين$|^addresses$/i },
    { key: 'albums', ar: 'الألبومات', en: 'albums', kind: 'plain', re: /^(ال)?[أا]لبومات$|^albums?$/i },
    { key: 'beds', ar: 'الأسرة', en: 'beds', kind: 'plain', re: /^(ال)?[أا]سر[ّ]?ة$|^beds?$/i },
    { key: 'spots', ar: 'المواقف', en: 'spots', kind: 'plain', re: /^(ال)?مواقف$|^spots?$/i },
    { key: 'jobs', ar: 'الوظائف', en: 'jobs', kind: 'plain', re: /^(ال)?وظائف$|^jobs?$/i },
    { key: 'measurements', ar: 'المقاسات', en: 'measurements', kind: 'plain', re: /^(ال)?مقاسات$|^measurements?$/i },
    { key: 'ingredients', ar: 'المكونات', en: 'ingredients', kind: 'plain', re: /^(ال)?مكونات$|^ingredients?$/i },
    { key: 'articles', ar: 'المقالات', en: 'articles', kind: 'plain', re: /^(ال)?مقالات$|^articles?$/i },
    { key: 'comments', ar: 'التعليقات', en: 'comments', kind: 'plain', re: /^(ال)?تعليقات$|^comments?$/i },
    { key: 'posts', ar: 'المنشورات', en: 'posts', kind: 'plain', re: /^(ال)?منشورات$|^posts?$/i },
    { key: 'reviews', ar: 'التقييمات', en: 'reviews', kind: 'plain', re: /^(ال)?تقييمات$|^reviews?$|^ratings?$/i },
    { key: 'complaints', ar: 'الشكاوى', en: 'complaints', kind: 'plain', re: /^(ال)?شكاو[ىي]$|^complaints?$/i },
    { key: 'responses', ar: 'الردود', en: 'responses', kind: 'plain', re: /^(ال)?ردود$|^responses?$|^replies$/i },
    { key: 'teams', ar: 'الفرق', en: 'teams', kind: 'plain', re: /^(ال)?فرق$|^teams?$/i },
    { key: 'restaurants', ar: 'المطاعم', en: 'restaurants', kind: 'plain', re: /^(ال)?مطاعم$|^restaurants?$/i },
    { key: 'cases', ar: 'القضايا', en: 'cases', kind: 'plain', re: /^(ال)?قضايا$|^cases$/i },
    { key: 'classes', ar: 'الصفوف', en: 'classes', kind: 'plain', re: /^(ال)?صفوف$|^(ال)?فصول$|^classes$/i },
    // — transactions and records over time —
    { key: 'grades', ar: 'العلامات', en: 'grades', kind: 'plain', re: /^(ال)?علامات$|^(ال)?درجات$|^grades?$/i },
    { key: 'subscriptions', ar: 'الاشتراكات', en: 'subscriptions', kind: 'deal', re: /^(ال)?اشتراكات$|^subscriptions?$/i },
    { key: 'loans', ar: 'الإعارات', en: 'loans', kind: 'deal', re: /^(ال)?[إا]عارات$|^loans?$/i },
    { key: 'donations', ar: 'التبرعات', en: 'donations', kind: 'deal', re: /^(ال)?تبرعات$|^donations?$/i },
    { key: 'deliveries', ar: 'التوصيلات', en: 'deliveries', kind: 'deal', re: /^(ال)?توصيلات$|^deliveries$/i },
    { key: 'tickets', ar: 'التذاكر', en: 'tickets', kind: 'deal', re: /^(ال)?تذاكر$|^tickets?$/i },
    { key: 'enrollments', ar: 'التسجيلات', en: 'enrollments', kind: 'deal', re: /^(ال)?تسجيلات$|^enrol?lments?$/i },
    // «الكفالات» is sponsorships, warranties, guarantees or bail — the business
    // decides, so the Arabic word keeps its own honest key (round 21 review).
    { key: 'warranties', ar: 'الضمانات', en: 'warranties', kind: 'deal', re: /^warrant(y|ies)$/i },
    { key: 'budgets', ar: 'الميزانيات', en: 'budgets', kind: 'deal', re: /^(ال)?ميزانيات$|^budgets?$/i },
    { key: 'viewings', ar: 'المعاينات', en: 'viewings', kind: 'event', re: /^(ال)?معاينات$|^viewings?$/i },
    { key: 'vaccinations', ar: 'التطعيمات', en: 'vaccinations', kind: 'event', re: /^(ال)?تطعيمات$|^vaccinations?$/i },
    { key: 'sessions', ar: 'الجلسات', en: 'sessions', kind: 'event', re: /^(ال)?جلسات$|^sessions?$|^hearings?$/i },
    { key: 'lessons', ar: 'الدروس', en: 'lessons', kind: 'event', re: /^(ال)?دروس$|^lessons?$/i },
    { key: 'trips', ar: 'الرحلات', en: 'trips', kind: 'event', re: /^(ال)?رحلات$|^trips?$/i },
    { key: 'activities', ar: 'الأنشطة', en: 'activities', kind: 'event', re: /^(ال)?[أا]نشطة$|^activities$/i },
    { key: 'harvests', ar: 'الحصاد', en: 'harvests', kind: 'event', re: /^(ال)?حصاد$|^harvests?$/i },
    { key: 'matches', ar: 'المباريات', en: 'matches', kind: 'event', re: /^(ال)?مباريات$|^matches$|^fixtures?$/i },
    { key: 'interviews', ar: 'المقابلات', en: 'interviews', kind: 'event', re: /^(ال)?مقابلات$|^interviews?$/i },
    { key: 'exercises', ar: 'التمارين', en: 'exercises', kind: 'event', re: /^(ال)?تمارين$|^exercises?$|^workouts?$/i },
];

/**
 * ONE SPELLING OF A WORD IS EVERY SPELLING OF IT.
 *
 * Round 21 review: «نظام لعيادة فيه: اداره المرضى، وقائمه المواعيد» — informal
 * Arabic writes ة as ه, drops the hamza, writes ى as ي — and a list written
 * that way matched none of the patterns above, which were written in one
 * spelling. Both sides are folded the way promptNormalizer.foldChars folds a
 * request (أ/إ/آ → ا, ة → ه, ى → ي, ئ → ي, ؤ → و, ء and marks dropped), so
 * a pattern is matched as the word, not as one way of typing it. The pattern
 * folder is request-lists' (foldPattern), shared by every reader.
 */
const fold = (word: string) => foldChars(String(word || '').trim());
const FOLDED_NOUNS: Array<{ noun: Noun; re: RegExp }> = NOUNS.map(noun =>
    ({ noun, re: new RegExp(foldPattern(noun.re.source), noun.re.flags) }));

/** The curated noun this one word (or whole item) is, in any spelling. */
function nounFor(word: string): Noun | undefined {
    const w = fold(word);
    if (!w) return undefined;
    return FOLDED_NOUNS.find(x => x.re.test(w))?.noun;
}

/** The table key of a noun on the curated list, or '' — so every reader keys «المرضى» as `patients`. */
export function curatedNounKey(word: string): string {
    return nounFor(word)?.key || '';
}

/**
 * The English of a TABLE on the curated list, or '' — the label beside the key
 * above. A table's name only: a column labelled «الموظف» is one employee, not
 * the `employees` table (entity-inference.englishFor reads columns).
 */
export function curatedNounEnglish(word: string): string {
    return nounFor(word)?.en || '';
}

/**
 * THE NOUN AN ITEM NAMES IS ITS HEAD, NEVER ITS POSSESSOR.
 *
 * Eval run500 (2026-10-26, P001): «… فيه قسم رئيسي جذاب، والخدمات، وآراء
 * العملاء، ونموذج تواصل …» — a landing page's sections. «آراء العملاء» is
 * testimonials, but its second word matched `customers`, and with «الخدمات»
 * that made two recognised nouns: the page was judged as a records app and
 * its delivery failed «customers (not built)». The same English request
 * («services, testimonials») read no table at all.
 *
 * An item is read whole first («العملاء المحتملون» → leads), then by its
 * head: the first word in Arabic («المنتجات الرقمية» are products), the last
 * in English («customer reviews» are reviews).
 *
 * …AND ONLY A HEAD THAT HOLDS RECORDS HANDS THE ITEM TO ITS POSSESSOR.
 *
 * Round 21 let the possessor name the record whenever the head was not
 * content about it (testimonials, photos). Round 21 review (R1): that merged
 * a different record into its possessor's table, and the delivery gate then
 * counted it delivered — «ابن باك اند لشركة: الأقسام، الموظفين، رواتب الموظفين»
 * built no salaries table and «رواتب الموظفين» passed as served by
 * /api/employees; "member fees", "patient prescriptions", «وصفات المرضى»,
 * «مخزون الأدوية», "patient lab results" the same. An unknown head is not
 * evidence that the item is its possessor's record — salaries, fees and
 * prescriptions are records of their own ABOUT the possessor. Only a head
 * that says where the records are kept or how they are worked («سجل
 * المرضى», «قائمة المواعيد», «إدارة الحاويات», "doctor profiles",
 * "appointment scheduling", "patient history") names the possessor as the
 * record. Every other head with a known possessor is its own record, keyed
 * from all its words and linked to the possessor (ownRecordPossessor); content
 * about a record (CONTENT_ABOUT) is not a table at all. Matched folded, like
 * every noun here.
 */
const CONTENT_ABOUT = new RegExp(foldPattern(`^(?:(?:ال)?(?:${[
    'آراء', 'رأي', 'شهادات', 'تجارب', 'انطباعات', 'قصص',
    'صور', 'صورة', 'معرض', 'معارض', 'فيديو', 'فيديوهات', 'مقاطع', 'لقطات', 'شعار', 'شعارات',
].join('|')})|opinions?|testimonials?|feedback|stories|story|quotes?|impressions?`
    + '|photos?|images?|pictures?|gallery|galleries|videos?|clips?|logos?)$'), 'iu');

/**
 * A WORD THAT HOLDS RECORDS IS NOT THE RECORD.
 *
 * «جدول الرواتب», «إدارة الحاويات», «سجل التطعيمات», "patient records" — the
 * head says where the records are kept or how they are worked; what they ARE
 * is the rest. A key or a table name read from the whole phrase named the
 * holder, or needed a dictionary to know it. Folded, both scripts, and the
 * two scripts hold the same class: a container («سجل» record/log/history,
 * «ملف» file/profile, «جدول» table) or the work done on records («إدارة»
 * management, «تتبع» tracking, «تسجيل» registration, «جدولة» scheduling).
 */
const RECORD_HOLDER = new RegExp(foldPattern('^(?:(?:ال)?(?:إدارة|تتبع|متابعة|تسجيل|جدولة|سجل|سجلات|جدول|جداول|قائمة|قوائم|كشف|بيانات|ملف|ملفات|أرشيف)'
    + '|management|tracking|scheduling|registration|records?|lists?|data|database|directory|table|registry|files?|profiles?|history|histories|logs?)$'), 'iu');

/**
 * The head and the other words of an item: Arabic names the head first,
 * English last — or, when a preposition follows it, right before the
 * preposition ("appointments with doctors" is read by «appointments», never
 * by «doctors», which would merge it into the doctors' table: R1).
 */
function headOf(item: string): { head: string; other: string; rest: string[] } | null {
    const token = String(item || '').trim().split(/\s+/).filter(Boolean);
    if (token.length < 2) return null;
    const arabic = /[\u0600-\u06FF]/u.test(token[0]);
    if (arabic) return { head: token[0], other: token[token.length - 1], rest: token.slice(1) };
    const at = token.findIndex((word, i) => i > 0 && ENGLISH_PREPOSITION.test(word));
    const after = at > 0 ? token.slice(at + 1).filter(word => !ENGLISH_PREPOSITION.test(word)) : [];
    if (at > 0 && after.length) {
        const before = token.slice(0, at);
        return { head: before[before.length - 1], other: after[after.length - 1], rest: [...before.slice(0, -1), ...after] };
    }
    return { head: token[token.length - 1], other: token[0], rest: token.slice(0, -1) };
}

const holdsRecords = (head: string) => RECORD_HOLDER.test(fold(head));
const isContentHead = (head: string) => CONTENT_ABOUT.test(fold(head));

function nounOfItem(item: string, depth = 0): Noun | undefined {
    const exact = nounFor(item);
    const parts = headOf(item);
    if (exact || !parts) return exact;
    const head = nounFor(parts.head);
    if (head) return head;
    // «سجل مواعيد المرضى» holds appointments; "patient appointment list" too.
    if (holdsRecords(parts.head) && depth < 3) return nounOfItem(parts.rest.join(' '), depth + 1);
    return undefined;
}

/**
 * The key of the curated table a listed item names, read the way namedEntities
 * reads it (whole, head, then the record a holder holds), or ''. One rule for
 * every reader of an item, so no reader keys «صور المنتجات» as `products`, or
 * «رواتب الموظفين» as `employees`, that the list reader did not read so.
 */
export function nounKeyOfItem(item: string): string {
    return nounOfItem(item)?.key || '';
}

/** The English of the curated table an item names (the same reading), or ''. */
export function nounEnglishOfItem(item: string): string {
    return nounOfItem(item)?.en || '';
}

/**
 * Content about a record — «صور المنتجات», «آراء العملاء», "book photos",
 * «معرض الصور» — never a table of its own nor its possessor's (R4). One word
 * alone («الصور», "photos") may still be a record of a photo app.
 */
export function isContentItem(item: string): boolean {
    const parts = headOf(item);
    return !!parts && !nounFor(item) && !nounFor(parts.head) && isContentHead(parts.head);
}

/**
 * The record an item is ABOUT, when the item is a record of its own: a head
 * that is no table we know, holds no records and is no content about them,
 * beside a noun we do know — «رواتب الموظفين» (employees), "patient lab
 * results" (patients). The item is then its own table, keyed from all its
 * words and linked to this one; it is never this one's table.
 */
export function ownRecordPossessor(item: string): { key: string; ar: string; en: string } | null {
    const parts = headOf(item);
    if (!parts || nounOfItem(item) || holdsRecords(parts.head) || isContentHead(parts.head)) return null;
    const noun = parts.rest.map(word => nounFor(word)).find(Boolean);
    return noun ? { key: noun.key, ar: noun.ar, en: noun.en } : null;
}

/** The item without a head that only holds its records («جدول الرواتب» → «الرواتب»), else the item. */
export function withoutRecordHolder(item: string): string {
    const text = String(item || '').trim();
    const parts = headOf(text);
    if (!parts || !holdsRecords(parts.head)) return text;
    return parts.rest.join(' ');
}

/** The columns a table of this kind actually needs to be usable. */
function fieldsFor(n: Noun): ModelField[] {
    switch (n.kind) {
        case 'person':
            return [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'),
                T('email', 'البريد', 'email'), T('notes', 'ملاحظات', 'notes')];
        case 'thing':
            /**
             * «مع صور نباتات» — a nursery without a picture of the plant is a
             * spreadsheet. Anything you sell, grow or stock gets an image
             * column; people and transactions do not, because nobody asks for
             * a photograph of an invoice.
             */
            return [T('name', 'الاسم', 'name', true), T('image', 'الصورة', 'photo'),
                N('price', 'السعر', 'price'), I('quantity', 'الكمية', 'quantity'),
                T('description', 'الوصف', 'description')];
        case 'deal':
            return [T('reference', 'المرجع', 'reference', true), N('amount', 'المبلغ', 'amount'),
                I('quantity', 'الكمية', 'quantity'), T('status', 'الحالة', 'status')];
        case 'event':
            return [T('title', 'العنوان', 'title', true), T('date', 'التاريخ', 'date'),
                T('time', 'الوقت', 'time'), T('status', 'الحالة', 'status')];
        default:
            return [T('name', 'الاسم', 'name', true), T('description', 'الوصف', 'description')];
    }
}

/** Everything after the list that is clearly not a table («مع صور … وثيم …»). */
export function trimListTail(part: string): string {
    // «… والطلبيات مع صور نباتات وثيم اخضر جميل» — the design wishes are not
    // entities, and folding them in would create a table called «ثيم».
    return String(part || '').split(/\s+(?:مع|وبتصميم|بتصميم|بثيم|وثيم|and with|with a)\s+/i)[0];
}

/*
 * The separators live in request-lists.ts (LIST_SEPARATOR), shared with the
 * shape reader and the requirement reader.
 *
 * Arabic joins a list with a waw glued to the front of the next word —
 * «النباتات والموردون والطلبيات» is three items, not one. The first version of
 * this used a word boundary before the waw, and that boundary is defined by
 * the ASCII word class, which contains no Arabic letter at all: the pattern
 * never matched, every Arabic list came back as a single token, and the
 * reader silently declined on exactly the sentence it was written for. It is
 * «space + waw + an Arabic letter» — unless the waw is the word's own first
 * letter («وصول», «وصف»), which P101 split into «صول».
 */

const KIND_OF_SHAPE: Record<EntityKind, Kind> = { person: 'person', money: 'deal', when: 'event', grouping: 'plain', thing: 'thing' };

interface Read { key: string; ar: string; en: string; kind: Kind; fields: ModelField[]; item: string; belongsTo?: { entity: string; key: string } }

const usableKey = (key: string) => !!key && key.length >= 3 && key.length <= 40 && !NEVER.has(key) && !RESERVED_TABLES.has(key);
const CURATED_KEYS = new Set(NOUNS.map(noun => noun.key));
/** The Arabic prepositions that stand as words of their own (folded). */
const ARABIC_PREPOSITION = new RegExp(foldPattern('^(?:من|في|على|إلى|عن|مع|حسب|بين|لكل)$'), 'u');

/**
 * A LISTED NOUN NOBODY WROTE DOWN IS STILL A TABLE HE NAMED.
 *
 * «نقاط وصول لـالمرضى والمواعيد والعلاجات» — «العلاجات» is on no curated list,
 * and dropping it built a clinic API with two of its three tables. Inside a
 * list the grammar already proved (an interface head, or recognised nouns
 * beside it) an unrecognised item gets the key and the columns the shape
 * reader would give it. Outside such a list it is a coincidence, not a table.
 *
 * …IN ONE WORD OR IN THE TWO OR THREE A RECORD IS NAMED IN (round 22, R2).
 * «عقود الإيجار», «أولياء الأمور», «الحضور اليومي», "rental contracts", "leave
 * requests": the shape reader built each of them as a table from the same
 * list while this reader, wanting one word after a colon, left them unread —
 * so the delivery gate could not check a table the build had made. A noun
 * phrase of a proven list is read as the shape reader reads it, keyed by the
 * same key reader; an Arabic one is a definite noun phrase (some word of it
 * carries the article).
 */
function unlistedNoun(item: string, marker: ListMarker, sells: boolean, request = ''): Read | null {
    const words = item.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 3) return null;
    const arabic = /[ء-ي]/u.test(item);
    if (marker !== 'head') {
        // An Arabic item beside recognised nouns is a definite noun («الحيوانات»,
        // «عقود الإيجار»).
        if (arabic && !words.some(word => /^ال/u.test(word))) return null;
    } else if (words.length > 2) {
        return null;
    }
    // A noun phrase names a record; one with a preposition inside it is a
    // phrase about something else ("sections for about", «مواعيد حسب الطبيب»).
    if (words.length > 1 && words.some(word => ENGLISH_PREPOSITION.test(word) || ARABIC_PREPOSITION.test(fold(word)))) return null;
    if (isCapability(item) || isInterfaceNoun(item) || isRoleInContext(item, request)) return null;
    const key = keyForPhrase(item);
    if (!usableKey(key)) return null;
    const shape = inferKind(item);
    return {
        key,
        ar: item,
        en: arabic ? (englishFor(item) || item) : item,
        kind: KIND_OF_SHAPE[shape],
        fields: fieldsForKind(shape, { sells }),
        item,
    };
}

/**
 * A RECORD ABOUT ANOTHER RECORD IS A TABLE OF ITS OWN (R1).
 *
 * «رواتب الموظفين», "member fees", "patient lab results": keyed from all its
 * words by the one key reader (keyForPhrase), shaped by its own head (a
 * salary is not a person because an employee is), and linked to the record
 * it is about when that record is one of his tables too.
 */
function ownRecord(item: string, sells: boolean): Read | null {
    const possessor = ownRecordPossessor(item);
    if (!possessor || isCapability(item)) return null;
    const key = keyForPhrase(item);
    if (!usableKey(key) || key === possessor.key) return null;
    const arabic = /[ء-ي]/u.test(item);
    const words = item.split(/\s+/).filter(Boolean);
    const shape = inferKind(arabic ? words[0] : words[words.length - 1]);
    return {
        key,
        ar: item,
        en: arabic ? (englishFor(item) || item) : item,
        kind: KIND_OF_SHAPE[shape],
        fields: fieldsForKind(shape, { sells }),
        item,
        belongsTo: { entity: possessor.key, key: `${possessor.key.replace(/ies$/, 'y').replace(/s$/, '')}_id` },
    };
}

/** What one listed item names, read the one way every builder and the delivery gate read it. */
export interface ListedEntry {
    /** His words for the item, cleaned of conjunctions, prepositions and leading actions. */
    item: string;
    /**
     * record — one of his tables; served — a table the system already owns;
     * content — content about a record («صور المنتجات»), never a table;
     * capability — what no table can hold (search, sign-in with roles), or a
     * role of a request that names roles: judged by the instruments that
     * measure it, never a record obligation;
     * clause — five words or more, a sentence rather than a name;
     * unread — no record could be read from it (said, never passed or failed).
     */
    as: 'record' | 'served' | 'content' | 'capability' | 'clause' | 'unread';
    /** The table key the item names (record and served). */
    key?: string;
    /** The item names a table we know (curated or served), not a noun read by shape. */
    named?: boolean;
}

export interface ListedReading {
    marker: ListMarker | null;
    /** The listed part, without its design tail — the text every list item comes from. */
    region: string | null;
    /** His tables, in his order, with their columns and links — empty unless the list is proven. */
    entities: ModelEntity[];
    /** Listed tables the system already serves («الطلبات» → orders): his words, never generated again. */
    served: Array<{ key: string; ar: string; en: string; item: string }>;
    entries: ListedEntry[];
    /** The list is a list of records: proven by its head, its actions or its nouns, and at least two of them. */
    proven: boolean;
}

const EMPTY_READING: ListedReading = { marker: null, region: null, entities: [], served: [], entries: [], proven: false };

/**
 * HIS LISTED RECORDS — ONE READING FOR EVERY BUILDER AND FOR THE DELIVERY GATE.
 *
 * Round 21 review (R2): the builders and the gate each read his list with
 * their own floor. namedEntities wanted two curated nouns after a colon and
 * did not count the tables the system serves, so «ابن باك اند لمكتب:
 * الموظفين، الإجازات، الحضور» was read by nobody — api_project built a generic
 * /api/items and the gate, handed nothing, never ran — while «Backend for my
 * shop: products, product photos, customers, customer testimonials» made the
 * gate require `customers` that no builder had read. One function now reads
 * the list, item by item, and decides once whether it is a list of records:
 *
 *   - proven by an interface head («نقاط وصول لـ», "endpoints for"), by a run
 *     of actions on its records («إضافة وتعديل وحذف … في»), by two items that
 *     name tables we know (counting the tables the system serves and records
 *     about a known one), or — in a request for a server — by one table of
 *     his own we know, in a list that reads mostly as records;
 *   - …and holding at least two records, served ones and unlisted nouns
 *     counted — the same floor whatever introduced the list;
 *   - except the columns of the one table he described («بدي جدول للموظفين
 *     فيه الأسماء والرواتب»): those are columns, unless two of them are
 *     tables we know.
 *
 * `backend` is whether the request is for a server: every builder that reads
 * this builds one (api_project, the interface over its server), and the gate
 * passes the delivery's own fact. `actionLed` carries a run of leading actions
 * a caller already took off (normaliseListedRequest).
 */
export function listedRecords(request: string, opts: { backend?: boolean; actionLed?: boolean } = {}): ListedReading {
    // «بفئات: طعام، مواصلات، فواتير» declares the options of one field, never tables.
    const shaped = normaliseListedRequest(stripDeclaredOptions(String(request || '')));
    const listed = listRegion(shaped.text);
    if (!listed) return EMPTY_READING;
    const region = trimListTail(listed.region);
    const sells = requestSells(request);
    const read: Read[] = [];
    const served: ListedReading['served'] = [];
    const entries: ListedEntry[] = [];
    // Items naming a table we know — curated, served, or a record about one.
    let known = 0;
    // Items naming a curated table of his own (not served, not about another).
    let curated = 0;
    // Items naming a record about a curated one («رواتب الموظفين»).
    let about = 0;
    for (const raw of splitListItems(region)) {
        if (isActionWord(raw) || isFeaturePhrase(raw)) continue;
        const item = withoutLeadingAction(raw);
        // «التحقق من المدخلات», «input validation», «automated tests» are
        // qualities the software must have — requirements, never tables.
        if (!item || isDeliverable(item) || isInterfaceNoun(item) || isPossessivePhrase(item) || isActionWord(item) || isFeaturePhrase(item)) continue;
        // A record is named by a noun phrase; five words and more is a clause.
        if (item.split(/\s+/).length > 4) { entries.push({ item, as: 'clause' }); continue; }
        const n = nounOfItem(item);
        /**
         * …and never a name the system already serves.
         *
         * Measured on his own build: «الطلبيات» generated a real `orders` table
         * with a real foreign key, and the base server's own `POST /api/orders`
         * answered every write with «item_required» — a route the new entity
         * did not own. The system already HAS an orders table; naming a second
         * one after it produces a table nobody can reach. It is still one of
         * his items: it counts toward proving the list.
         */
        if (n && RESERVED_TABLES.has(n.key)) {
            known++;
            if (!served.some(s => s.key === n.key)) served.push({ key: n.key, ar: n.ar, en: n.en, item });
            entries.push({ item, as: 'served', key: n.key, named: true });
            continue;
        }
        // THE FIFTH CEILING is a guard rail, never a silent cut: an item past
        // it is said («not verified»), never built half and passed whole.
        if (read.length >= MAX_MODEL_ENTITIES) { entries.push({ item, as: 'unread' }); continue; }
        if (n) {
            known++;
            curated++;
            if (!read.some(p => p.key === n.key)) read.push({ key: n.key, ar: n.ar, en: n.en, kind: n.kind, fields: fieldsFor(n), item });
            entries.push({ item, as: 'record', key: n.key, named: true });
            continue;
        }
        // Behind an interface head every item is a resource he declared — «نقاط
        // وصول لـالكتب وآراء العملاء» serves the opinions; in any other list,
        // content about a record is no table (R4).
        if (listed.marker !== 'head' && isContentItem(item)) { entries.push({ item, as: 'content' }); continue; }
        const own = ownRecord(item, sells);
        if (own) { known++; about++; }
        // «جدول الرواتب», "payroll records": the record is what the holder holds.
        const other = own || unlistedNoun(withoutRecordHolder(item), listed.marker, sells, request);
        // Behind an interface head a capability is an endpoint he asked for
        // ("endpoints for users, roles, permissions"): unread, never dropped.
        // In any other list it is a feature of the app, judged by the
        // instruments that measure features.
        const capability = listed.marker !== 'head' && (isCapability(item) || isRoleInContext(item, request));
        if (!other) { entries.push({ item, as: capability ? 'capability' : 'unread' }); continue; }
        // «السواقين» is keyed `drivers` by the dictionary: a table we know, in
        // the spelling he typed.
        const knownKey = !own && CURATED_KEYS.has(other.key);
        if (knownKey) { known++; curated++; }
        if (!read.some(p => p.key === other.key)) read.push(other);
        entries.push({ item, as: 'record', key: other.key, ...(knownKey ? { named: true } : {}) });
    }
    const actionLed = opts.actionLed === true || shaped.actionLed;
    // One table we know proves a list of a request for a server only when the
    // list reads mostly as records: «الموظفين، الإجازات، الحضور» does; "secure
    // sign-in, admin and receptionist roles, patients, status transitions,
    // search, audit history…" is a list of features that names one record.
    const unreadCount = entries.filter(e => e.as === 'unread' || e.as === 'clause' || e.as === 'capability').length;
    const mostlyRecords = read.length + served.length > unreadCount;
    // …and the one table must be his own: a table the system already serves
    // beside "search, pagination, CSV export" proves nothing about the rest.
    let proven = listed.marker === 'head' || actionLed || known >= 2
        || (opts.backend === true && curated + about >= 1 && mostlyRecords);
    // The columns of the one table he described are not tables (round 20 rule, kept).
    if (proven && listed.marker !== 'head' && !actionLed && curated < 2 && describedTable(request)) proven = false;
    proven = proven && read.length + served.length >= 2;
    const base = { marker: listed.marker, region, served, entries, proven };
    if (!proven || !read.length) return { ...base, entities: [] };

    const keys = new Set(read.map(r => r.key));
    const out: ModelEntity[] = read.map(r => {
        const link = r.belongsTo && keys.has(r.belongsTo.entity) ? r.belongsTo : undefined;
        return link
            ? { key: r.key, ar: r.ar, en: r.en, belongsTo: link, fields: [{ key: link.key, type: 'INT' }, ...r.fields] }
            : { key: r.key, ar: r.ar, en: r.en, fields: r.fields };
    });

    /**
     * And ONE real relation, when the list obviously contains one.
     *
     * A transaction belongs to whoever or whatever it is about: an order to the
     * thing being ordered, an appointment to the person it is with. A link that
     * can dangle is not a relation, so only the clearest pairing is made.
     */
    const dealIdx = out.findIndex((e, i) => !e.belongsTo && (read[i].kind === 'deal' || read[i].kind === 'event'));
    if (dealIdx >= 0) {
        const parentIdx = out.findIndex((_, i) =>
            i !== dealIdx && (read[i].kind === 'thing' || read[i].kind === 'person'));
        if (parentIdx >= 0) {
            const parent = out[parentIdx];
            const fk = `${parent.key.replace(/ies$/, 'y').replace(/s$/, '')}_id`;
            out[dealIdx] = {
                ...out[dealIdx],
                belongsTo: { entity: parent.key, key: fk },
                fields: [{ key: fk, type: 'INT' }, ...out[dealIdx].fields],
            };
        }
    }
    return { ...base, entities: out };
}

/**
 * Read the tables the user named. Empty when it is not sure — a wrong table is
 * worse than no table, because the whole system is generated from it.
 *
 * This is the builders' reading of listedRecords: every caller builds a
 * server (designDataModel for api_project, api_project's own selection, the
 * interface over that server), so the list is read as a request for one.
 */
export function namedEntities(request: string): ModelEntity[] {
    return listedRecords(request, { backend: true }).entities;
}

/**
 * The tables he named that the system ALREADY owns — so the delivery message
 * can say «الطلبيات موجودة أصلاً» instead of silently dropping the word.
 */
export function alreadyOwned(request: string): string[] {
    return listedRecords(request).served.map(n => n.ar);
}

/** The keys of those tables («الأصناف» → items): his words, served by a built-in table. */
export function listedReservedKeys(request: string): string[] {
    return listedRecords(request).served.map(n => n.key);
}

/** For the log line: what was read, and from which words. */
export function namedEntitiesNote(request: string, isAr = true): string {
    const found = namedEntities(request);
    if (!found.length) return '';
    return isAr
        ? `قرأتُ الجداول من جملتك مباشرة: ${found.map(e => e.ar).join(' · ')}`
        : `read straight from your sentence: ${found.map(e => e.en).join(' · ')}`;
}
