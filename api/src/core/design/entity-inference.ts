/**
 * «هذا يعني ان يجب ان اطور جو لالاف الميزات … وهذا غير ممكن»
 *
 * He is right, and the way I had been working was wrong.
 *
 * The data model knew SIX domains — marketplace, clinic, lms, inventory, crm,
 * booking — and when his social platform matched none of them it produced
 * nothing. My answer was to add a seventh. That is a whitelist of the world:
 * every business anyone will ever describe needs a line written by hand, and
 * there is no end to it.
 *
 * THE DISTINCTION THAT MAKES THIS TRACTABLE:
 *
 *   A list of DOMAINS grows with the world      — infinite, hopeless.
 *   A list of word SHAPES grows with a language — finite, and already written.
 *
 * So nothing here knows what a clinic is, or a nursery, or a car rental. It
 * knows what a NOUN looks like, what a GERUND looks like, and what suffixes
 * mark a person, a payment, an appointment or a container. «الطاولات» and
 * «vaccinations» and «kennels» and «فساتين» all pass through the same four
 * rules, and none of them is named anywhere in this file.
 *
 * What it produces is deliberately modest: tables with sensible columns. It
 * does NOT pretend that «live streaming» is a table. A feature whose shape is
 * a capability is returned as a capability, so the build can say plainly that
 * it was not built — which is the other half of being honest about scale.
 */
import { ModelEntity, ModelField } from './data-model';

/* ────────────────────────────── field makers ───────────────────────────── */

const T = (key: string, ar: string, en: string, required = false): ModelField =>
    ({ key, type: 'TEXT', required, ar, en });
const N = (key: string, ar: string, en: string): ModelField =>
    ({ key, type: 'REAL', ar, en });
const I = (key: string, ar: string, en: string): ModelField =>
    ({ key, type: 'INT', ar, en });

/* ───────────────────────────── shapes, not domains ─────────────────────── */

/**
 * A CAPABILITY, NOT A TABLE.
 *
 * These are shapes of English and Arabic, not names of businesses: a gerund
 * («streaming», «messaging»), a process noun («moderation», «recommendations»),
 * a medium («video», «audio», «live»), or a surface that renders other tables
 * rather than owning rows («dashboard», «analytics», «search»).
 *
 * The point is that this list does NOT grow when a new industry shows up. A
 * veterinary clinic, a car rental and a wedding hall all describe their work
 * with the same handful of grammatical shapes.
 */
const CAPABILITY = [
    /\b\w+ing\b/i,                                   // streaming, messaging, tracking
    /\b(video|audio|voice|live|realtime|real-time|stream|call|calls)\b/i,
    /\b(moderation|recommendation|recommendations|personalisation|personalization|automation|verification|encryption|analytics|insights|search|notifications?|sync|backup|import|export)\b/i,
    /\b(ai|ml|machine learning|gpt|llm|chatbot|assistant)\b/i,
    /\b(dashboard|reports?|reporting|statistics|charts?)\b/i,
    /(بثّ?\s*مباشر|مكالم|فيديو|صوت|إشعارات?|تحليلات|لوحة\s*تحكّ?م|تقارير|إحصاء|بحث|ذكاء\s*اصطناعي|توصيات|مزامنة|تشفير)/i,
];

/** A person, named outright. */
const PERSON = [
    /\b(users?|members?|clients?|customers?|patients?|students?|staff|employees?|drivers?|owners?|guests?|subscribers?|vendors?|suppliers?|agents?|players?|borrowers?)\b/i,
    /^(ال)?(مستخدم|عضو|أعضاء|عميل|عملاء|زبائن|مريض|مرضى|طالب|طلاب|موظّ?ف|سائق|مالك|ضيف|مشترك|مورّ?د|بائع|وكيل|لاعب|معلّ?م|مدرّ?س|طبيب|أطباء|ممرّ?ض)/,
];

/**
 * …AND A PERSON GUESSED FROM A SUFFIX — the LAST rule, never the first.
 *
 * Measured: «appointments» ends in «ent» and was classified as a person, so a
 * booking table came out with a phone number and no date. A suffix is the
 * weakest signal there is; it only speaks when nothing louder has.
 */
const PERSON_SUFFIX = /\b\w{3,}(er|or|ist|ian)s?\b/i;   // teacher, doctor, dentist, technician

/** Money changing hands. */
const MONEY = [
    /\b(orders?|invoices?|payments?|transactions?|subscriptions?|plans?|bills?|receipts?|refunds?|ads?|campaigns?|deals?|sales?|purchases?|donations?)\b/i,
    /^(ال)?(طلب|فاتور|دفع|مدفوع|معامل|اشتراك|خطط|خطة|إيصال|استرداد|إعلان|حملة|صفق|مبيع|مشتري|تبرّ?ع)/,
];

/** Something that happens at a time. */
const WHEN = [
    /\b(bookings?|reservations?|appointments?|events?|sessions?|shifts?|schedules?|classes?|visits?|trips?|matches?|tickets?)\b/i,
    /^(ال)?(حجز|حجوز|موعد|مواعيد|فعالي|جلس|ورديّ?|جدول|حصص|حصة|زيار|رحل|مباري|تذكر)/,
];

/** A container that holds other things and is counted, not sold. */
const GROUPING = [
    /\b(groups?|pages?|teams?|channels?|categories|category|departments?|branches?|rooms?|halls?|tables?|shelves?|folders?|projects?|boards?|lists?)\b/i,
    /^(ال)?(مجموع|صفح|فريق|فرق|قنا|تصنيف|فئ|قسم|أقسام|فرع|فروع|غرف|قاع|طاول|رفوف|مجلّ?د|مشروع|لوح|قائم)/,
];

export type EntityKind = 'person' | 'money' | 'when' | 'grouping' | 'thing';

const hits = (list: RegExp[], s: string) => list.some(re => re.test(s));

/** What SHAPE is this word? Nothing here knows an industry. */
export function inferKind(phrase: string): EntityKind {
    const s = String(phrase || '').trim();
    // Named shapes first; the suffix guess is the last word, not the first.
    if (hits(PERSON, s)) return 'person';
    if (hits(MONEY, s)) return 'money';
    if (hits(WHEN, s)) return 'when';
    if (hits(GROUPING, s)) return 'grouping';
    if (PERSON_SUFFIX.test(s)) return 'person';
    return 'thing';
}

/** Is this a row, or a capability that needs infrastructure? */
export function isCapability(phrase: string): boolean {
    const s = String(phrase || '').trim();
    // «Ads platform» is an ads table wearing a platform hat; «live streaming»
    // is not a table at all. A capability marker only wins when the phrase has
    // no clearer noun beside it.
    if (hits(CAPABILITY, s)) {
        /**
         * THE HEAD DECIDES, NOT THE OBJECT.
         *
         * «video calls with pet owners» was read as a PEOPLE table, because
         * «owners» is a person word and this test looked at the whole phrase.
         * So the one thing he asked for and most obviously did not get was the
         * one thing the honest block never mentioned.
         *
         * A person after a preposition is what the capability is ABOUT, not
         * what the phrase IS. Cutting the tail first keeps «Ads platform» a
         * capability and keeps «appointments with doctors» a table.
         */
        const head = s.split(/\s+(?:with|for|to|from|of|between|مع|من|إلى|بين|لـ?)\s+/i)[0] || s;
        const stripped = head.replace(/\b(platform|system|module|feature|management|manager)\b/gi, '').trim();
        return !(hits(PERSON, stripped) || hits(MONEY, stripped) || hits(WHEN, stripped) || hits(GROUPING, stripped));
    }
    return false;
}

/* ───────────────────────────── phrase → identifier ─────────────────────── */

/** Latin letters only, lower case, plural, and a legal SQL identifier. */
function keyOf(phrase: string): string {
    const bare = String(phrase || '')
        .replace(/\b(platform|system|module|feature|management|manager|section|page of)\b/gi, ' ')
        .replace(/[^A-Za-z0-9 ]+/g, ' ')
        .trim().toLowerCase();
    const word = bare.split(/\s+/).filter(Boolean).pop() || '';
    if (!word) return '';
    if (/(s|x|z|ch|sh)$/.test(word)) return word.endsWith('s') ? word : `${word}es`;
    if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
    return `${word}s`;
}

/**
 * An Arabic phrase has no Latin key of its own, and a SQL identifier cannot
 * hold Arabic. The project's own translator answers this — the same one the
 * photo engine uses to search for «نباتات» in English.
 */
function keyFromArabic(phrase: string): string {
    const bare = String(phrase || '').replace(/^ال/, '').trim();
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { englishSubject } = require('./subject-translation');
        const out = englishSubject(bare);
        if (out?.translated && out.query) return keyOf(out.query);
    } catch { /* fall through to the letters themselves */ }
    /**
     * AND WHEN NO DICTIONARY HAS THE WORD — TRANSLITERATE.
     *
     * Measured: «الحيوانات» and «التطعيمات» and «المعاينات» all vanished,
     * because the translator's dictionary did not carry them. A dictionary is
     * a whitelist of a language — the same trap as a whitelist of the world,
     * one level down.
     *
     * A table key does not need to be an English WORD. It needs to be a legal,
     * stable identifier; the Arabic label travels beside it and is what the
     * owner actually reads. So every Arabic noun gets a key, forever, with no
     * dictionary at all.
     */
    const MAP: Record<string, string> = {
        'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
        'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
        'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
        'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
        'ة': 'a', 'ء': '', 'ئ': 'y', 'ؤ': 'w',
    };
    const word = bare.split(/\s+/).filter(Boolean).pop() || '';
    let out = '';
    for (const ch of word) out += MAP[ch] === undefined ? '' : MAP[ch];
    out = out.replace(/[^a-z0-9]/g, '').slice(0, 30);
    return out.length >= 3 ? (out.endsWith('s') ? out : `${out}s`) : '';
}

/* ───────────────────────────── kind → columns ──────────────────────────── */

/** The columns a table of this SHAPE needs to be usable. */
export function fieldsForKind(kind: EntityKind): ModelField[] {
    switch (kind) {
        case 'person':
            return [T('name', 'الاسم', 'name', true), T('phone', 'الهاتف', 'phone'),
                T('email', 'البريد', 'email'), T('notes', 'ملاحظات', 'notes')];
        case 'money':
            return [T('reference', 'المرجع', 'reference', true), N('amount', 'المبلغ', 'amount'),
                T('party', 'الطرف', 'party'), T('status', 'الحالة', 'status')];
        case 'when':
            return [T('title', 'العنوان', 'title', true), T('date', 'التاريخ', 'date'),
                T('time', 'الوقت', 'time'), T('status', 'الحالة', 'status')];
        case 'grouping':
            return [T('name', 'الاسم', 'name', true), T('description', 'الوصف', 'description'),
                I('members', 'العدد', 'members'), T('status', 'الحالة', 'status')];
        default:
            // A thing you grow, stock or sell has a picture; nobody asks for a
            // photograph of an invoice.
            return [T('name', 'الاسم', 'name', true), T('image', 'الصورة', 'photo'),
                N('price', 'السعر', 'price'), I('quantity', 'الكمية', 'quantity'),
                T('description', 'الوصف', 'description')];
    }
}

/* ───────────────────────────── the request → a model ───────────────────── */

/**
 * Everything a request lists, whatever it lists it in: bullet points, commas,
 * newlines, «و», or a bare «Features:» block.
 */
export function featurePhrases(request: string): string[] {
    const body = String(request || '')
        .replace(/^[\s\S]*?\bfeatures?\s*:/i, '')
        .replace(/^[\s\S]*?(الميزات|المميزات|المطلوب)\s*:/, '');
    const chunks = body
        // The colon is a separator too — «ابنِ نظاماً لعيادة بيطرية: الحيوانات»
        // kept the ask and the first real noun in one chunk, and dropping
        // the ask took «الحيوانات» with it.
        .split(/[\n\r•·،,;؛:：\/|]+|\s+and\s+|\s+و(?=[ء-ي])/i)
        .map(p => p.replace(/^[\s\-*\d.)]+/, '').trim())
        .filter(p => p.length > 1);
    /**
     * A FEATURE LIST IS NOT ALWAYS PUNCTUATED.
     *
     * «Posts Stories Reels Live streaming Groups Pages Messaging Video calls»
     * arrives as one line of Title Case with no comma in it. Splitting on
     * capitals recovers the items — a shape rule about English, not about
     * social networks.
     */
    const out: string[] = [];
    for (const c of chunks) {
        const caps = c.match(/[A-Z][a-z]+(?: [a-z]+)*/g) || [];
        if (c.length > 24 && caps.length >= 3) out.push(...caps);
        else out.push(c);
    }
    /**
     * AND THE SENTENCE'S OWN STEM IS NOT A TABLE.
     *
     * «ابنِ نظاماً لعيادة بيطرية: الحيوانات…» produced a `clinics` table beside
     * the animals — the request describing itself. A phrase carrying a build
     * verb is the ASK, not one of the things asked for.
     */
    const STEM = /\b(build|make|create|develop|design|i want|need)\b|^(ابن|ابنِ|اعمل|صمّ?م|أنشئ|طوّ?ر|أريد|اريد|نظام|منصّ?ة|تطبيق|موقع)/i;
    return out.map(p => p.trim())
        .filter(p => p.length > 1 && p.length < 60 && !STEM.test(p));
}

export interface Inference {
    entities: ModelEntity[];
    /** Named in the request, and honestly out of reach of a CRUD table. */
    capabilities: string[];
}

/**
 * The identifier this phrase would get, in either script — the same rule
 * `inferModel` uses below, exported so a caller reading a list the user typed
 * gets exactly the keys the inferred path would have produced.
 */
export function keyForPhrase(phrase: string): string {
    return /[A-Za-z]/.test(phrase) ? keyOf(phrase) : keyFromArabic(phrase);
}

/** Words that are never a table of their own, in any domain. */
export const NEVER = new Set([
    'orders', 'users', 'products', 'items', 'health', 'auth', 'api', 'sqlite_master',
    'apps', 'systems', 'platforms', 'websites', 'sites', 'pages_of', 'databases', 'features',
]);

/**
 * THE GENERAL PATH.
 *
 * No domain is named. A phrase becomes a table when its shape is a noun this
 * system can give columns to, and a capability when its shape says it needs
 * something a database cannot provide.
 */
/**
 * HOW MANY TABLES A REQUEST GETS IS DECIDED BY THE REQUEST.
 *
 * Every path that designs a data model stopped at four or five — four
 * separate constants, in four files. Measured on an eleven-domain sentence:
 * the extraction read ten of the eleven correctly and a constant threw six
 * of them away. Nobody had decided that a shipping company gets four tables;
 * it was a number someone typed once for a coffee shop.
 *
 * The count now comes from what he named. This bound exists only so a
 * pathological input cannot generate a thousand tables — it is a guard rail,
 * not a design opinion, and it sits far above any real request.
 */
export const MAX_MODEL_ENTITIES = 24;

/**
 * The English of an Arabic noun, or null when no dictionary has it.
 * Never a transliteration — the caller decides what to do with "unknown",
 * and inventing a word is not one of the options.
 */
export function englishFor(phrase: string): string | null {
    const bare = String(phrase || '').replace(/^ال/, '').trim();
    if (!bare) return null;
    if (!/[\u0621-\u064A]/.test(bare)) return bare;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { englishSubject } = require('./subject-translation');
        const out = englishSubject(bare);
        if (out?.translated && out.query && !/[\u0621-\u064A]/.test(out.query)) return String(out.query).trim();
    } catch { /* no dictionary is an answer too */ }
    return null;
}

export function inferModel(request: string, limit = MAX_MODEL_ENTITIES): Inference {
    const entities: ModelEntity[] = [];
    const capabilities: string[] = [];
    const seen = new Set<string>();

    for (const phrase of featurePhrases(request)) {
        if (isCapability(phrase)) {
            if (capabilities.length < 12 && !capabilities.includes(phrase)) capabilities.push(phrase);
            continue;
        }
        const key = /[A-Za-z]/.test(phrase) ? keyOf(phrase) : keyFromArabic(phrase);
        if (!key || key.length < 3 || key.length > 40 || NEVER.has(key) || seen.has(key)) continue;
        seen.add(key);
        if (entities.length >= limit) continue;
        const kind = inferKind(phrase);
        /**
         * A TRANSLITERATION IS NOT AN ENGLISH WORD.
         *
         * `en` was simply the key, and the key falls back to transliteration
         * when no dictionary has the noun — so «الحاويات» reached an English
         * interface as the heading "hawyats". That is a fabricated word
         * presented as a translation, which is the one thing this system is
         * not allowed to do.
         *
         * The KEY may stay transliterated: it is a SQL identifier and a URL
         * segment, it must be ascii, and a stable ugly identifier is far
         * better than a noun that vanishes. But a LABEL is read by a person.
         * Where the English is unknown, the honest label is the word he
         * actually wrote.
         */
        const english = englishFor(phrase);
        entities.push({
            key, ar: phrase.replace(/^ال/, 'ال'), en: english || phrase.trim(),
            fields: fieldsForKind(kind),
        } as ModelEntity);
    }
    return { entities, capabilities };
}
