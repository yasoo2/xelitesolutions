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
import { MAX_MODEL_ENTITIES, NEVER, englishFor, fieldsForKind, inferKind, isCapability, keyForPhrase, requestSells, type EntityKind } from './entity-inference';
import { RESERVED_TABLES } from './schema-designer';
import { isDeliverable, isInterfaceNoun, listRegion, splitListItems, type ListMarker } from './request-lists';

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
    { key: 'customers', ar: 'العملاء', en: 'customers', kind: 'person', re: /^(ال)?عملاء$|^(ال)?زبائن$|^customers?$|^clients?$/i },
    { key: 'employees', ar: 'الموظفون', en: 'employees', kind: 'person', re: /^(ال)?موظف(ين|ون)?$|^employees?$|^staff$/i },
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
    { key: 'expenses', ar: 'المصروفات', en: 'expenses', kind: 'deal', re: /^(ال)?مصروفات$|^(ال)?نفقات$|^expenses$/i },
    { key: 'shipments', ar: 'الشحنات', en: 'shipments', kind: 'deal', re: /^(ال)?شحنات$|^shipments?$/i },

    // — things on a calendar —
    { key: 'appointments', ar: 'المواعيد', en: 'appointments', kind: 'event', re: /^(ال)?مواعيد$|^appointments?$/i },
    { key: 'bookings', ar: 'الحجوزات', en: 'bookings', kind: 'event', re: /^(ال)?حجوزات$|^bookings?$|^reservations?$/i },
    { key: 'tasks', ar: 'المهام', en: 'tasks', kind: 'event', re: /^(ال)?مهام$|^tasks?$/i },
    { key: 'visits', ar: 'الزيارات', en: 'visits', kind: 'event', re: /^(ال)?زيارات$|^visits?$/i },
    { key: 'events', ar: 'الفعاليات', en: 'events', kind: 'event', re: /^(ال)?فعاليات$|^(ال)?[أا]حداث$|^events?$/i },

    // — plain records —
    { key: 'categories', ar: 'التصنيفات', en: 'categories', kind: 'plain', re: /^(ال)?تصنيفات$|^(ال)?[أا]قسام$|^categories$/i },
    { key: 'branches', ar: 'الفروع', en: 'branches', kind: 'plain', re: /^(ال)?فروع$|^branches$/i },
    { key: 'warehouses', ar: 'المستودعات', en: 'warehouses', kind: 'plain', re: /^(ال)?مستودعات$|^(ال)?مخازن$|^warehouses$/i },
    { key: 'reports', ar: 'التقارير', en: 'reports', kind: 'plain', re: /^(ال)?تقارير$|^reports?$/i },
];

/** The table key of a noun on the curated list, or '' — so every reader keys «المرضى» as `patients`. */
export function curatedNounKey(word: string): string {
    const w = String(word || '').trim();
    if (!w) return '';
    return NOUNS.find(x => x.re.test(w))?.key || '';
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

/**
 * The listed part of the sentence, and what introduced it.
 *
 * A colon is the strongest signal a person can give — «نظاماً لمشتل نباتات:
 * النباتات والموردون والطلبيات» — and after it comes a list, not prose. The
 * openers are the other way people write the same thing. And a software
 * request names its resources behind an interface head — «نقاط وصول لـالمرضى
 * والمواعيد والعلاجات», «endpoints for students, classes, grades» — which the
 * shared reader takes off first (request-lists.ts).
 */
function listedPart(request: string): { part: string; marker: ListMarker } | null {
    const found = listRegion(request);
    return found ? { part: found.region, marker: found.marker } : null;
}

/** Everything after the list that is clearly not a table («مع صور … وثيم …»). */
function trimTail(part: string): string {
    // «… والطلبيات مع صور نباتات وثيم اخضر جميل» — the design wishes are not
    // entities, and folding them in would create a table called «ثيم».
    return part.split(/\s+(?:مع|وبتصميم|بتصميم|بثيم|وثيم|and with|with a)\s+/i)[0];
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

interface Read { key: string; ar: string; en: string; kind: Kind; fields: ModelField[] }

/**
 * A LISTED NOUN NOBODY WROTE DOWN IS STILL A TABLE HE NAMED.
 *
 * «نقاط وصول لـالمرضى والمواعيد والعلاجات» — «العلاجات» is on no curated list,
 * and dropping it built a clinic API with two of its three tables. Inside a
 * list the grammar already proved (an interface head, or two recognised nouns
 * beside it) an unrecognised item gets the key and the columns the shape
 * reader would give it. Outside such a list it is a coincidence, not a table.
 */
function unlistedNoun(item: string, marker: ListMarker, sells: boolean): Read | null {
    const words = item.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 2) return null;
    const arabic = /[ء-ي]/u.test(item);
    if (marker !== 'head') {
        if (words.length > 1) return null;
        // An Arabic item beside recognised nouns is a definite noun («الحيوانات»).
        if (arabic && !/^ال/u.test(item)) return null;
    }
    if (isCapability(item) || isInterfaceNoun(item)) return null;
    const key = keyForPhrase(item);
    if (!key || key.length < 3 || key.length > 40 || NEVER.has(key) || RESERVED_TABLES.has(key)) return null;
    const shape = inferKind(item);
    return {
        key,
        ar: item,
        en: arabic ? (englishFor(item) || item) : item,
        kind: KIND_OF_SHAPE[shape],
        fields: fieldsForKind(shape, { sells }),
    };
}

/**
 * Read the tables the user named. Empty when it is not sure — a wrong table is
 * worse than no table, because the whole system is generated from it.
 */
export function namedEntities(request: string): ModelEntity[] {
    const listed = listedPart(request);
    if (!listed) return [];
    const words = splitListItems(trimTail(listed.part));
    if (words.length < 2) return [];

    const read: Read[] = [];
    let recognised = 0;
    // A listed noun the system already serves («الطلبات» → orders) is still
    // one of his items: it counts toward proving the list, it is just not
    // generated again.
    let alreadyServed = 0;
    const sells = requestSells(request);
    for (const w of words) {
        // THE FIFTH CEILING. Four constants in four other files were lifted
        // before this one was found — by running an eleven-domain request and
        // counting what came out, not by reading. This reader sits ahead of
        // every other path, so its cap silently capped them all: the request
        // named ten domains and delivered four.
        if (read.length >= MAX_MODEL_ENTITIES) break;
        // A phrase like «صور نباتات» must not match on its last word alone:
        // only a single noun, or a noun with its definite article, is a table.
        const token = w.split(/\s+/);
        if (token.length > 2) continue;
        // «التحقق من المدخلات», «input validation», «automated tests» are
        // qualities the software must have — requirements, never tables.
        if (isDeliverable(w)) continue;
        const n = NOUNS.find(x => token.some(t => x.re.test(t)));
        /**
         * …and never a name the system already serves.
         *
         * Measured on his own build: «الطلبيات» generated a real `orders` table
         * with a real foreign key, and the base server's own `POST /api/orders`
         * answered every write with «item_required» — a route the new entity
         * did not own. The system already HAS an orders table; naming a second
         * one after it produces a table nobody can reach.
         */
        if (n && RESERVED_TABLES.has(n.key)) { alreadyServed++; continue; }
        if (n) {
            if (!read.some(p => p.key === n.key)) {
                read.push({ key: n.key, ar: n.ar, en: n.en, kind: n.kind, fields: fieldsFor(n) });
                recognised++;
            }
            continue;
        }
        const other = unlistedNoun(w, listed.marker, sells);
        if (other && !read.some(p => p.key === other.key)) read.push(other);
    }
    // Two is the floor: one recognised word in a sentence is a coincidence,
    // not a list — and the model deserves its turn on a coincidence. Behind
    // an interface head the list is already proven, so two items of it are.
    if (!read.length || (listed.marker === 'head' ? read.length + alreadyServed < 2 : recognised < 2)) return [];

    const out: ModelEntity[] = read.map(r => ({ key: r.key, ar: r.ar, en: r.en, fields: r.fields }));

    /**
     * And ONE real relation, when the list obviously contains one.
     *
     * A transaction belongs to whoever or whatever it is about: an order to the
     * thing being ordered, an appointment to the person it is with. A link that
     * can dangle is not a relation, so only the clearest pairing is made.
     */
    const dealIdx = out.findIndex((_, i) => read[i].kind === 'deal' || read[i].kind === 'event');
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
    return out;
}

function listedReserved(request: string): Noun[] {
    const listed = listedPart(request);
    if (!listed) return [];
    const out: Noun[] = [];
    for (const w of splitListItems(trimTail(listed.part))) {
        const token = w.split(/\s+/);
        if (token.length > 2) continue;
        const n = NOUNS.find(x => token.some(t => x.re.test(t)));
        if (n && RESERVED_TABLES.has(n.key) && !out.includes(n)) out.push(n);
    }
    return out;
}

/**
 * The tables he named that the system ALREADY owns — so the delivery message
 * can say «الطلبيات موجودة أصلاً» instead of silently dropping the word.
 */
export function alreadyOwned(request: string): string[] {
    return listedReserved(request).map(n => n.ar);
}

/** The keys of those tables («الأصناف» → items): his words, served by a built-in table. */
export function listedReservedKeys(request: string): string[] {
    return listedReserved(request).map(n => n.key);
}

/** For the log line: what was read, and from which words. */
export function namedEntitiesNote(request: string, isAr = true): string {
    const found = namedEntities(request);
    if (!found.length) return '';
    return isAr
        ? `قرأتُ الجداول من جملتك مباشرة: ${found.map(e => e.ar).join(' · ')}`
        : `read straight from your sentence: ${found.map(e => e.en).join(' · ')}`;
}
