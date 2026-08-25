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

//  The one folder of Arabic diacritics this repository owns. A second
//  copy of that character set would drift the first time one of them
//  learned a mark the other did not.
import { stripArabicDiacritics } from '../orchestrator/promptNormalizer';
import { hisWordsOnly } from './page-head';
//  The reader that already knows which noun stands beside the container.
import { subjectAfterContainer } from './subject-phrase';

export type AppEngine = 'map' | 'chat' | 'weather' | 'records' | 'social' | 'shop' | 'calculator' | 'productivity' | 'finance';

export type AppKind =
    | 'maps' | 'chat' | 'weather' | 'social' | 'store' | 'calculator' | 'productivity'
    | 'tasks' | 'notes' | 'expenses' | 'finance' | 'inventory' | 'booking'
    | 'pos' | 'crm' | 'lms' | 'contacts' | 'habits' | 'generic';

/**
 * `image` is a real picture, not a text box with a URL in it: the app picks a
 * file, shrinks it in the browser, and stores the picture itself — so a photo
 * works offline, survives a reload, and needs no upload endpoint anywhere.
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'tel' | 'email' | 'image';

export interface AppField {
    key: string;
    label: string;
    type: FieldType;
    options?: string[];
    required?: boolean;
    /** Lower bound stated by the user, when the request explicitly gives one. */
    min?: number;
    /** When true, the value must be strictly greater than `min`. */
    minExclusive?: boolean;
    /** Shown in the compact row summary — keeps the list readable. */
    primary?: boolean;
}

/** A number worth showing at the top of the app, computed from the rows. */
export interface AppMetric {
    label: string;
    kind: 'count' | 'sum' | 'sumProduct' | 'sumMargin' | 'avg' | 'countWhere' | 'todayCount' | 'todaySum' | 'topGroup';
    field?: string;
    field3?: string;
    field2?: string;
    equals?: string;
    /** For money-shaped metrics — appended to the value. */
    unit?: string;
}

/**
 * THE CATEGORIES THE REQUEST DECLARED — read, never invented.
 *
 * «ابنِ تطبيق مصاريف بفئات: طعام، مواصلات، فواتير، ترفيه» names the exact
 * select options the owner wants, and the engine used to answer with its own
 * five stock categories regardless — the same «tool never read the request»
 * failure the fishing law exists to measure, this time on the DATA SHAPE
 * rather than the design.
 *
 * A shape of two languages, not a domain list: a categories noun
 * («فئات/تصنيفات/أقسام», "categories/types"), a separator («:» or «هي»),
 * then the owner's own comma-or-و separated words. Silence returns null and
 * the blueprint keeps its stock options byte-for-byte.
 */
export function readDeclaredOptions(requestRaw: string): string[] | null {
    const r = String(requestRaw || '').replace(/[ً-ْـ]/g, '');
    const m = r.match(/(?:ب|وال|ال)?(?:فئات|تصنيفات|أقسام|اقسام|categories|types)\s*(?:هي|are)?\s*[:：]\s*([^.\n؟?!]{2,160})/i)
        || r.match(/(?:بفئات|بتصنيفات|بأقسام|باقسام|with\s+categories)\s+([^.\n؟?!:،]{2,160}(?:،[^.\n؟?!]{0,120})?)/i);
    if (!m) return null;
    /**
     * Arabic attaches its «و» to the next word, so «مواد بناء وأدوات وسباكة»
     * has no free-standing separator at all. When commas exist they rule —
     * a « و» inside an item («مواد البناء والعزل، أدوات») stays part of it —
     * and the comma swallows a following attached «و». With no commas, the
     * space+«و» IS the list's separator; an item that truly starts with waw
     * writes it twice («قهوة وورد») and keeps its own.
     */
    const raw = m[1];
    const parts = /[،,]/.test(raw)
        ? raw.split(/\s*[،,]\s*(?:و(?=[ء-ي]))?/)
        : raw.split(/\s+و(?=[ء-ي])|\s+(?:or|and)\s+/i);
    const list = parts
        .map(s => s.trim())
        .filter(s => s.length >= 2 && s.length <= 24 && !/^(الخ|إلخ|وغيرها|etc\.?)$/i.test(s));
    const unique = [...new Set(list)];
    return unique.length >= 2 && unique.length <= 8 ? unique : null;
}

/**
 * THE SAME CLAUSE, REMOVED — for the readers it must never reach.
 *
 * «بفئات: طعام، مواصلات، فواتير، ترفيه» declares OPTIONS of one field, and
 * every other reader of the sentence heard it as something else, measured on
 * one live build: the entity readers turned the list into three TABLES
 * (mwaslats/invoices/trfyhs), the brand reader shipped «مشروع الات،» as the
 * project's name, and the scope classifier read the category word «فواتير»
 * as a billing SYSTEM. The categories belong to the category field alone;
 * everyone else reads the sentence without them.
 */
export function stripDeclaredOptions(requestRaw: string): string {
    const r = String(requestRaw || '');
    return r
        .replace(/(?:ب|وال|ال)?(?:فئات|تصنيفات|أقسام|اقسام|categories|types)\s*(?:هي|are)?\s*[:：]\s*[^.\n؟?!]{2,160}/gi, ' ')
        .replace(/(?:بفئات|بتصنيفات|بأقسام|باقسام|with\s+categories)\s+[^.\n؟?!:،]{2,160}(?:،[^.\n؟?!]{0,120})?/gi, ' ')
        // Preserve newlines: block schema declarations use them as boundaries.
        // Tidy within lines only. Collapsing every run of whitespace would
        // flatten structured schema declarations; line structure is data.
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * A SECOND TABLE, AND THE LINE BETWEEN THEM — «علاقات بين أكثر من جدول
 * (طبيب ← مواعيده)».
 *
 * Every system built so far owned exactly ONE table. That is enough for a
 * notes app and nowhere near enough for a real system: a clinic's appointment
 * belongs to a DOCTOR, an enrolment to a COURSE, an item to a SUPPLIER. With
 * one table the doctor's name is retyped on every appointment — misspelt on
 * the third one, unsearchable by the fifth, and impossible to rename at all.
 *
 * So a blueprint may declare a PARENT: its own rows, its own fields, and a
 * foreign key on the child that points at it. The generated database creates
 * both tables, the API serves both collections plus «this parent's children»,
 * and the interface picks the parent from a list instead of asking anyone to
 * type it again.
 */
export interface AppRelation {
    /** Collection name — the table and the URL: 'providers', 'courses'. */
    resource: string;
    /** «طبيب» — one of them. */
    one: string;
    /** «الأطباء» — the collection, as a heading. */
    many: string;
    /** The foreign-key column added to the CHILD row: 'provider_id'. */
    key: string;
    /** Which parent field names it wherever a child refers to its parent. */
    labelKey: string;
    /** The parent's own fields — a real record, not a label. */
    fields: AppField[];
    /** What the picker says before any parent exists. */
    emptyHint: string;
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
    /** «إذا كمية قطعة صارت أقل من 3 يصير لونها أحمر» — his rule, in his numbers. */
    lowStock?: { field: string; below: number };
    doneValue?: string;
    metrics: AppMetric[];
    /** The parent table this system's rows belong to, when it has one. */
    relation?: AppRelation;
    /** Extra npm dependencies this engine really needs. */
    deps: Record<string, string>;
    /** What the app says when it has no rows yet — never fabricated rows. */
    emptyHint: string;
}

/* ── which domain the request belongs to ─────────────────────────────────── */

/** Ordered: the specific archetypes are tested before the broad ones. */
export const APP_KIND_SIGNALS: Array<[AppKind, RegExp]> = [
    ['maps', /خرائط|خريطة|خارطة|مواقع\s*جغرافي|ملاحة|تتبع\s*(المواقع|الموقع)|جي\s*بي\s*اس|\bmaps?\b|\bgps\b|navigation|geo\s*app/i],
    ['weather', /طقس|الجو|درجات?\s*الحرارة|أحوال\s*جوية|weather|forecast|temperature app|open[- ]?meteo/i],
    // A calculator is a distinct interaction contract, not a records page.
    // Detect it before generic app/manage fallbacks so a request such as
    // "Build a calculator" never becomes Hero + Features + Contact.
    ['calculator', /آلة\s*حاسبة|حاسبة|حسابات?\s*رياضية|عمليات\s*حسابية|calculator|calc\s*(app|pro)?|arithmetic|scientific\s*calculator/i],
    // A social network CONTAINS messaging, so it is tested before chat:
    // «منصة تواصل اجتماعي … Messaging» is a feed with messages in it, not a
    // messenger. Measured from the field request that produced a chat app.
    ['social', /تواصل\s*اجتماعي|شبكة\s*اجتماعية|منشورات|تغريد|متابعين|social\s*(media|network|platform)|newsfeed|news\s*feed|timeline|posts?\s*and\s*(comments?|likes?)|followers?/i],
    ['chat', /محادث|دردش|شات|رسائل\s*(فورية|نصية)?|مراسلة|\bchat\b|messaging|messenger|instant\s*messages/i],
    /**
     * A SHOP IS A SHOP, EVEN WHEN IT ASKS FOR EVERYTHING ELSE TOO.
     *
     * «Build a world-class e-commerce platform similar to Shopify … Inventory
     * management … Analytics» used to detect as `inventory`, because a store
     * manages stock and the inventory pattern was tested first. It produced a
     * stock-list CRUD: no products, no cart, nothing anyone could buy from.
     * The store is the SUBJECT; inventory is one of its features, so it is
     * tested before inventory and before point-of-sale.
     */
    /**
     * NARROW ON PURPOSE. «متجر عطور فاخر» is a BOUTIQUE'S WEBSITE — a
     * presentation site with product cards, which the section builder already
     * does beautifully, and turning it into a shop application regressed nine
     * measured builds the moment a broad /متجر/ pattern landed here. What
     * makes it an application is the TRANSACTION: a cart, a checkout, an
     * online store, a marketplace, a platform — said outright.
     */
    // Arabic carries case endings: «متجراً إلكترونياً» is «متجر إلكتروني» to
    // any reader and to no naive regex — the first live run of this engine
    // detected null on the user's own sentence for exactly that reason.
    ['store', /متجر\S{0,2}\s*(إلكترون|الكترون|أونلاين|اونلاين|رقم)|تجار[ةه]\S{0,2}\s*(إلكترون|الكترون)|منصّ?[ةه]\S{0,2}\s*(تجار|بيع|تسوّ?ق)|نظام\s*متجر|تطبيق\s*متجر|سلّ?[ةه]\s*(ال)?(مشتريات|شراء|تسوّ?ق)|عرب[ةه]\s*(ال)?تسوّ?ق|بواب[ةه]\s*دفع|e-?commerce|ecommerce|marketplace|shopify|woocommerce|magento|storefront|\bcheckout\b|shopping\s*cart|online\s*(store|shop|selling|marketplace)/i],
    ['pos', /نقاط\s*بيع|نقطة\s*بيع|كاشير|كاشيير|\bpos\b|point\s*of\s*sale|cash\s*register/i],
    ['booking', /حجوزات|حجز|مواعيد|موعد|عياد|مرضى|reservation|booking|appointment|clinic/i],
    ['inventory', /مخزون|جرد|مستودع|أصناف|اصناف|inventory|stock|warehouse/i],
    ['expenses', /مصاريف|مصروفات|نفقات|expense|spending/i],
    // لوحات الإصدار والتشغيل ليست صفحات تعريفية حتى لو لم تقل «تطبيق»:
    // مؤشرات + جدول + بحث/تصفية/تفاصيل هي إشارة برنامج إدارة مهام صريحة.
    ['tasks', /مهام|مهمة|مهمات|لوحة\s*(?:مهام|إصدار|اصدار|جاهزية)|مركز\s*جاهزية\s*(?:الإصدار|الاصدار)|جدول\s*مهام|بطاقات\s*مؤشرات|task\s*(manager|list|board)|release\s*(?:readiness|center|board)|kanban|to-?do|todo/i],
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
/**
 * A booking system for a clinic calls its provider «طبيب» — that is the user's
 * own example («طبيب ← مواعيده»). A salon's is «مقدّم الخدمة». The relation is
 * the same shape either way; only the words change, and the words are what
 * make the system feel like it was built for this business.
 */
const CLINIC_SIGNAL = /عياد|طبيب|أطباء|اطباء|طبّي|مرضى|مريض|أسنان|اسنان|مستشفى|clinic|doctor|dentist|patient|medical|hospital/i;
/** A page ABOUT something wins over the subject it describes. */
// كلمة «الصفحة» وحدها ليست نية صفحة هبوط: تظهر كثيراً كإجراء جودة
// («افحص الصفحة بنفسك») بعد طلب تطبيق كامل. نمنع التطبيق فقط عند تسمية
// مادة تقديمية صريحة، كي لا تلغي مرحلة التدقيق قالب لوحة مهام حقيقياً.
const PAGE_SIGNAL = /صفحة\s*(?:هبوط|تعريف(?:ية)?|تسويقية)|لاندنج|بورتفوليو|معرض\s*أعمال|سيرة\s*ذاتية|landing\s*page|portfolio|one\s*-?\s*pager|brochure/i;

/**
 * Masks bounded spans governed by a negation marker before intent detection.
 * The same rule is shared by page and application signals, so a phrase such
 * as "not a brochure" or "requiring no API key or account" cannot create a
 * false subject while an affirmative "brochure for my bakery" remains visible.
 */
export function maskNegatedSpans(text: string): string {
    return String(text || '').replace(
        // JS `\\b` is ASCII-oriented and therefore unsafe for Arabic. Require
        // the marker to be outside every Unicode letter/number/identifier word
        // on the left, and followed by whitespace/end-of-input on the right.
        /(?<![\p{L}\p{N}_-])(?:not|no|never|without|ليس|ليست|لا|بدون|غير)(?=\s|$)(?:(?:\s+)[\p{L}\p{N}_-]+){0,8}/giu,
        span => span.replace(/[^\r\n]/gu, ' '),
    );
}

/**
 * A release/task-board contract names concrete program surfaces, rather than
 * merely a business subject. It therefore outranks incidental words inherited
 * from a planner or prior conversation (for example «محادثة») — but only
 * AFTER an explicit landing-page request has been honoured above.
 */
const TASK_BOARD_CONTRACT = /مركز\s*جاهزية\s*(?:الإصدار|الاصدار)|لوحة\s*(?:مهام|إصدار|اصدار|جاهزية)|جدول\s*مهام|(?:بطاقات\s*مؤشرات[\s\S]{0,180}(?:بحث|تصفية|نافذة\s*تفاصيل)|(?:بحث|تصفية|نافذة\s*تفاصيل)[\s\S]{0,180}بطاقات\s*مؤشرات)|release\s*(?:readiness|center|board)|task\s*(?:board|manager|list)|kanban/i;

/** A request that names two first-class collections is a composite app, not the first matching single-domain blueprint. */
const PRODUCTIVITY_CONTRACT = /(?:ملاحظات|مذكرات|مفكرة|notes?|notepad)[\s\S]{0,260}(?:مهام|مهمات|مهامّ?|tasks?|to-?do)|(?:مهام|مهمات|مهامّ?|tasks?|to-?do)[\s\S]{0,260}(?:ملاحظات|مذكرات|مفكرة|notes?|notepad)/i;

/** A finance dashboard owns three first-class collections, not one generic ledger. */
const FINANCE_CONTRACT = /(?:income|incomes|earnings?|salary|revenue|الدخل|الإيرادات?|الراتب)[\s\S]{0,320}(?:expense|expenses|spending|costs?|budget|budgets?|المصاريف?|النفقات?|الميزاني(?:ة|ات))|(?:expense|expenses|spending|costs?|budget|budgets?|المصاريف?|النفقات?|الميزاني(?:ة|ات))[\s\S]{0,320}(?:income|incomes|earnings?|salary|revenue|الدخل|الإيرادات?|الراتب)/i;

/**
 * WHICH application this is — or null when the request is genuinely a
 * presentation site (a café, a clinic's landing page, a shop window), which
 * the section builder already does well and must keep doing.
 */
/**
 * THE TABLE EACH APPLICATION KIND STORES — one reading for BOTH halves.
 *
 * The server names its primary table from this map, and the interface uses the
 * same map to ask one measurable question: is the detected kind's own table
 * one of the tables this system is actually building? A kind whose table the
 * system does not have was matched on a stray word — «المستودعات» inside an
 * eleven-domain freight sentence read as an inventory app — and it stands
 * down instead of renaming the whole system after one word.
 *
 * This lived as a private copy inside ApiProjectTool; a second copy for the
 * interface would drift the first time either changed. [kind]: [table, labelAr].
 */
export const RECORDS_TABLE_BY_KIND: Record<string, [string, string]> = {
    social: ['posts', 'المنشورات'], chat: ['messages', 'الرسائل'], maps: ['places', 'الأماكن'], tasks: ['tasks', 'المهام'],
    notes: ['notes', 'الملاحظات'], productivity: ['notes', 'الملاحظات والمهام'], expenses: ['expenses', 'المصاريف'], finance: ['incomes', 'الدخل'], inventory: ['items', 'الأصناف'],
    booking: ['bookings', 'الحجوزات'], pos: ['sales', 'المبيعات'], crm: ['customers', 'العملاء'],
    lms: ['enrolments', 'التسجيلات'], contacts: ['contacts', 'جهات الاتصال'], habits: ['habits', 'العادات'],
};

export function detectAppKind(requestRaw: string): AppKind | null {
    const request = String(requestRaw || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '');
    if (!request.trim()) return null;
    const intentRequest = maskNegatedSpans(request);
    // «صفحة هبوط لتطبيق خرائط» is a page about an app — the document the user
    // named wins, exactly as classifyBuildScope decides it.
    if (PAGE_SIGNAL.test(intentRequest)) return null;
    // Two named collections are a stronger contract than either word alone.
    // This prevents «notes and tasks» from becoming only a task table or a
    // React-Native-shaped scaffold; the builder receives both surfaces.
    if (PRODUCTIVITY_CONTRACT.test(intentRequest) && APP_SIGNAL.test(intentRequest)) return 'productivity';
    // Explicit interaction surfaces are a stronger contract than a stray
    // domain word that may have been appended to a long execution context.
    // This prevents a release board from becoming ChatApp merely because its
    // self-audit or planner context happened to mention a conversation.
    if (TASK_BOARD_CONTRACT.test(intentRequest)) return 'tasks';
    if (FINANCE_CONTRACT.test(intentRequest)) return 'finance';
    //  A LIST HE WROTE OUTRANKS A NOUN HE HAPPENED TO USE.
    //
    //  «عندي عيادة أسنان … اسم المريض ورقم تلفونه …» carries the word
    //  «عيادة» and a list of five columns. The word is incidental; the list
    //  is the contract. Scoring archetypes first let a stock relation come
    //  back and quietly replace what he wrote.
    //
    //  Ported from main (Manus, da586c92) — the same property this branch
    //  argues everywhere: what he stated beats what we recognised.
    if (derivedColumns(intentRequest)?.length) return 'generic';
    /**
     * Score every registered archetype instead of returning the first keyword
     * that happens to occur in a long request. A real request often names the
     * subject and several executable capabilities; the strongest signal set is
     * the most honest domain, while ties retain the deliberate registry order.
     * Rebuilding the matcher with `g` avoids state leaking from RegExp.test and
     * counts repeated evidence without making any domain special-cased.
     */
    let bestKind: AppKind | null = null;
    let bestScore = 0;
    for (const [kind, signal] of APP_KIND_SIGNALS) {
        const flags = `${signal.flags.replace(/[gy]/g, '')}g`;
        const matches = intentRequest.match(new RegExp(signal.source, flags));
        const score = matches?.length || 0;
        if (score > bestScore) {
            bestScore = score;
            bestKind = kind;
        }
    }
    if (bestKind) return bestKind;
    // Nothing named, but «نظام إدارة …» / «تطبيق لتتبع …» is unmistakably an
    // application that owns records. It gets the records engine with an entity
    // named after the request itself.
    if (APP_SIGNAL.test(intentRequest) && MANAGE_SIGNAL.test(intentRequest)) return 'generic';
    /**
     * WHAT THE PAGE MUST DO OUTRANKS WHAT THE USER CALLED IT.
     *
     * Measured live, from a request the owner typed himself:
     *
     *     «بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر
     *      البيع … وبدي أبحث عن القطعة … وبدي يطلع لي تحت مجموع رأس المال»
     *
     * Five named fields, a search, two totals, a stock rule. `detectAppKind`
     * returned null, because the only door left open here demanded the words
     * «نظام» or «تطبيق» beside «إدارة» — and he had written «صفحة أسجل فيها».
     * With no kind, the builder fell through to the marketing scaffold and
     * shipped him a storefront: Hero, Gallery, Testimonials, FAQ, «تسوق الآن».
     * Nothing he asked for existed, and the acceptance ledger proved exactly
     * one of his requirements.
     *
     * A category noun is a label. Recording rows, searching them and totalling
     * them is WORK, and work is the stronger evidence. So a request that
     * describes the work gets the records engine even when it never names an
     * application — held to two independent signals, so that «سجّل دخولي» and
     * «صفحة تعريفية» stay outside.
     */
    const RECORD_VERB = /(أسجل|اسجل|سجّل|أضيف|اضيف|أدخل|ادخل|احفظ|أحفظ|أدوّن|ادون|\brecord\b|\blog\b|\btrack\b|\benter\b)/i;
    const RECORD_SURFACE = /(جدول|قائمة|قائمه|لائحة|كشف|\btable\b|\blist\b|\bregister\b|\bsheet\b|\binventory\b|مخزون)/i;
    const RECORD_MATH = /(مجموع|إجمالي|اجمالي|ربح|\btotal\b|\bsum\b|\bprofit\b)/i;
    const RECORD_FIND = /(أبحث|ابحث|بحث|فلتر|تصفية|\bsearch\b|\bfilter\b)/i;
    if (RECORD_VERB.test(intentRequest)
        && (RECORD_SURFACE.test(intentRequest) || RECORD_MATH.test(intentRequest) || RECORD_FIND.test(intentRequest))) {
        return 'generic';
    }
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
    /**
     * WHAT IT IS CALLED — NOT THE FIRST FORTY CHARACTERS OF THE REQUEST.
     *
     * His build shipped with this on screen, as the app's own subtitle:
     *
     *     «اً لمشتل نباتات: النباتات والموردون والط»
     *
     * Three faults in one string, all visible in the screenshot he sent:
     *   · «نظاماً» minus «نظام» leaves the case ending «اً» stranded in front;
     *   · the colon and the table list belong to the DATABASE, not to the name;
     *   · and slice(0, 40) cut «والطلبيات» in half.
     */
    const head = String(request || '')
        .replace(/\n[\s\S]*$/, '')
        .split(/[:：]/)[0]                                   // the list after «:» is the tables
        // `\b` is defined by `\w`, which holds no Arabic letter — «لي\b» never
        // matched, which is why «ابن لي متجراً» kept its «لي».
        .replace(/(ابنِ|ابني|ابن|أنشئ|انشئ|اصنع|اعمل|سوّي|سوي|صمّم|صمم|طوّر|طور|أريد|اريد|أرغب|قم\s*ب|من\s*فضلك)/g, ' ')
        .replace(/(^|\s)(لي|لنا)(?=\s|$)/g, ' ')
        /**
         * A NOISE WORD IS A WORD, NOT A RUN OF LETTERS.
         *
         * These were stripped wherever they appeared, so «كامل» inside
         * «متكاملاً» was eaten and «نظاماً متكاملاً لشركة شحن» came back as
         * «مت لشركة شحن» — the app's own title, on screen, measured.
         *
         * They now match only at a word boundary, with the Arabic case endings
         * that ride on them («نظاماً», «موقعاً», «تطبيقاً») allowed as a
         * suffix — which is what let the substring match look necessary in the
         * first place. «متكامل» joins the list as its own word.
         */
        .replace(
            new RegExp(
                '(^|\\s)(?:تطبيق|برنامج|نظام|منصّة|منصة|أداة|اداة|موقع|مشروع|بسيط|جديد|كامل|متكامل|شامل|احترافي'
                + '|react|رياكت|ريأكت|vite|build|create|make|app|system|platform|project|simple|full)'
                + '(?:اً|ًا|ات|ة|ه)?(?=\\s|$)',
                'gi',
            ),
            ' ',
        )
        // The accusative ending left behind by «نظاماً» / «موقعاً» / «تطبيقاً».
        .replace(/(^|\s)(اً|ًا|ا)(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ').trim()
        // «لمشتل نباتات» is «مشتل نباتات» with a preposition glued on.
        .replace(/^ل(?=[ء-ي]{3,})/, '')
        // …and the English articles the verb strip leaves behind.
        .replace(/^(?:a|an|the|for|me|us|my|our)\s+/i, '')
        .replace(/\s+(?:a|an|the|for)$/i, '');

    if (head.length <= 40) return head;
    // Cut at a space, never through a word — «والط» is not a name.
    const cut = head.slice(0, 40);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trim();
}

const STRICT_POSITIVE_CONSTRAINT = /non[-\s]?positive|strictly\s+positive|positive[-\s]?only|(?:must|should|need(?:s)?|require(?:s)?|validation(?:\s+that)?|validate|reject(?:s)?|disallow(?:s)?|not\s+accept)\s+(?:be\s+)?positive|(?:greater|more)\s+than\s+zero|above\s+zero|غير\s*(?:موجب|موجبة|موجبين)|(?:موجب|موجبة)\s+فقط|أكبر\s+من\s+الصفر|فوق\s+الصفر|(?:يرفض|لا\s+يقبل)\s+(?:الصفر|السالب)/iu;

/**
 * A BOUND IS A COMPARISON AND A NUMBER, NOT A PHRASE SOMEONE REMEMBERED.
 *
 * Measured. Six ways of saying the same constraint; two were understood:
 *
 *     «وارفض المبلغ إذا كان صفر أو أقل»               → no bound
 *     «المبلغ يجب أن يكون موجباً فقط»                  → no bound
 *     «الكمية لا تقل عن 1»                            → no bound
 *     «المبلغ أكبر من الصفر»                          → min 0, exclusive
 *     "rejects non-positive amounts"                  → min 0, exclusive
 *
 * The four that failed are the ones he is most likely to type. The cause was a
 * list of remembered phrasings — and «موجباً فقط» failed against a pattern
 * that knew «موجب فقط», which is the same word wearing a tanween.
 *
 * A bound is not a phrase. It is a COMPARISON and a NUMBER, and both are
 * closed classes: there are only so many ways to say greater, smaller, at
 * least, and only so many digits. What is open — the field, the trade, the
 * wording around it — is exactly what this must not depend on.
 *
 * The one subtlety is which SIDE was named. «أكبر من ١٠» names what is
 * allowed; «ارفض ما هو أقل من ١٠» names what is refused, and the same number
 * means a different bound. So the rejection verb is read too, and it flips the
 * reading — that is one closed class more, not a catalogue.
 */
const REJECTS = /(ارفض|أرفض|رفض|ترفض|لا\s*يقبل|لا\s*تقبل|امنع|\breject|\bdisallow|\bnot\s+accept|\bmust\s+not\s+be)/iu;
const AR_DIGITS = /[\u0660-\u0669]/g;

/** «صفر» and «zero» are numbers he wrote in words. */
function numberIn(text: string): number | null {
    const normalised = text.replace(AR_DIGITS, d => String(d.charCodeAt(0) - 0x0660));
    const m = normalised.match(/-?\d+(?:[.,]\d+)?/);
    if (m) return Number(String(m[0]).replace(',', '.'));
    if (/(?:^|[^\u0621-\u064a])(?:صفر|الصفر)(?:$|[^\u0621-\u064a])|\bzero\b/iu.test(text)) return 0;
    return null;
}

/** The lower bound a sentence states about a number, or null when it states none. */
export function statedBound(window: string): { min: number; minExclusive: boolean } | null {
    const text = String(window || '');
    const rejecting = REJECTS.test(text);

    //  «موجب» / positive names zero as the floor without naming a number.
    if (/(موجب|موجبة|موجبا|موجباً|\bpositive\b)/iu.test(text) && !/(غير|non-?|لا)\s*(?:موجب|positive)/iu.test(text)) {
        return { min: 0, minExclusive: true };
    }
    if (/(غير\s*(?:موجب|موجبة|موجبا|موجباً)|non-?positive)/iu.test(text) && rejecting) {
        return { min: 0, minExclusive: true };
    }

    const n = numberIn(text);
    if (n === null) return null;

    const below = /(أقل|اقل|أصغر|اصغر|تحت|دون|less\s+than|below|under|smaller)/iu.test(text);
    const above = /(أكبر|اكبر|أعلى|اعلى|فوق|greater\s+than|more\s+than|above|over)/iu.test(text);
    const atLeast = /(لا\s*(?:يقل|تقل)\s*عن|على\s*الأقل|على\s*الاقل|at\s+least|no\s+less\s+than|minimum(?:\s+of)?)/iu.test(text);

    if (atLeast) return { min: n, minExclusive: false };
    //  A rejection names the refused side, so «ارفض ما هو أقل من ١٠» allows ١٠
    //  while «أكبر من ١٠» does not.
    //  «N أو أقل» refuses N itself; «أقل من N» refuses only what is under it.
    //  Same number, different floor — and he says the first far more often.
    const inclusiveOfN = /(أو\s*أقل|أو\s*اقل|أو\s*أدنى|أو\s*ادنى|أو\s*أصغر|or\s+less|or\s+lower|or\s+below|or\s+under)/iu.test(text);
    if (rejecting && below) return { min: n, minExclusive: inclusiveOfN };
    if (rejecting && above) return null;                       // he refused the HIGH side; not a floor
    if (above) return { min: n, minExclusive: true };
    if (rejecting && n === 0) return { min: 0, minExclusive: true };
    return null;
}


/**
 *  A SENTENCE OWNS ITS OWN CONSTRAINT.
 *
 *  Measured: «الكمية لا تقل عن 1» set a floor of one on «السعر» as well,
 *  because the reader took ninety-six characters on either side of each field
 *  name and asked whether a bound appeared anywhere inside. A window that
 *  wide contains the neighbour's sentence — the haystack was big enough to
 *  contain every needle.
 *
 *  He states a constraint in a sentence, and that sentence names the field it
 *  is about. So the sentence is the unit: a bound applies to the fields named
 *  IN IT, and to no others.
 */
function boundsByField(requestRaw: string, fields: AppField[]): Map<string, { min: number; minExclusive: boolean }> {
    const out = new Map<string, { min: number; minExclusive: boolean }>();
    for (const sentence of String(requestRaw || '').split(/[.؟!\n]/u)) {
        const lower = sentence.toLocaleLowerCase();
        const bound = statedBound(sentence) || (STRICT_POSITIVE_CONSTRAINT.test(sentence) ? { min: 0, minExclusive: true } : null);
        if (!bound) continue;
        for (const field of fields) {
            const names = [field.key, field.label].map(v => String(v || '').trim().toLocaleLowerCase()).filter(Boolean);
            if (names.some(n => lower.includes(n))) out.set(field.key, bound);
        }
    }
    return out;
}

/**
 * Carry only an explicit lower-bound instruction from the request into fields.
 * A numeric type alone never invents a bound; the request must name the field
 * and state the constraint in its own words.
 */
export function applyRequestFieldConstraints(bp: AppBlueprint, request: string): AppBlueprint {
    const bounds = boundsByField(request, bp.fields);
    const fields = bp.fields.map(field => {
        if (field.type !== 'number') return field;
        //  The bound is whatever HE stated, not a fixed zero: «الكمية لا تقل
        //  عن 1» is a floor of one, and «ارفض صفر أو أقل» excludes the zero.
        const bound = bounds.get(field.key);
        return bound ? { ...field, min: bound.min, minExclusive: bound.minExclusive } : field;
    });
    return fields.some((field, index) => field !== bp.fields[index]) ? { ...bp, fields } : bp;
}

export function violatesFieldConstraint(field: Pick<AppField, 'type' | 'min' | 'minExclusive'>, raw: unknown): boolean {
    if (field.type !== 'number' || field.min === undefined) return false;
    const text = String(raw ?? '').trim();
    if (!text) return false;
    const value = Number(text);
    if (!Number.isFinite(value)) return true;
    return field.minExclusive ? value <= field.min : value < field.min;
}

/**
 * WHAT HE SAYS HE IS RECORDING IS WHAT THE TABLE IS CALLED.
 *
 * Measured live. His five columns finally reached the generated app, and the
 * page still called itself «الحجوزات», with «حجز» for a row and the lede
 * «احجز، أكّد، وتابع مواعيد اليوم في لوحة واحدة». He had written «بدي جدول
 * أسجل فيه المواعيد». His word existed, in the same sentence the columns came
 * from, and the archetype's word was printed over it.
 *
 * derivedColumns already walks past this noun on its way to the list — the
 * colon is what separates them: «أسجل فيه المواعيد: اسم المريض و…». So the
 * subject is read the same way the columns are, from his sentence, and it
 * needs no vocabulary of trades: a clinic, a nursery or a camel farm all name
 * their own table.
 */
//  Hoisted from derivedColumns: two readers need the same stems, and a
//  second copy would drift the first time one of them learned a verb
//  the other did not.
const RECORDING_STEM = ['سجل', 'سجّل', 'ضيف', 'دخل', 'دوّن', 'دون', 'تابع', 'دير', 'نظم'];
const CONJUGATED = RECORDING_STEM.map(stem => '[أاينت]' + stem).join('|');
const A_RECORDING_VERB = new RegExp('^(?:' + CONJUGATED + ')$', 'u');

//  The recording words, hoisted: theNounBesideTheContainer must refuse a
//  verb as a name, and it runs before recordedSubject's local copy exists.
const RECORDING_WORD = /(أسجل|اسجل|سجّل|أضيف|اضيف|أدخل|ادخل|أدوّن|ادون|الحقول|تحتوي على|يحتوي على|أتابع|اتابع|أدير|ادير|أنظم|انظم|\brecord\b|\btrack\b|\blog\b|\bmanage\b|\borgani[sz]e\b)/iu;

/**
 *  A NAME THAT IS THE SENTENCE THAT ASKED FOR IT.
 *
 *  Measured on four real requests, and three of them came out like this:
 *
 *      «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *      → title: «بدي جدول مبيعات فيه اسم الصنف والكمية»
 *
 *  His own words, cut off mid-phrase, printed back to him as the name of
 *  his application — in the reply, on the page, in the empty state. The
 *  one that came out right had a colon in it, because the only reader
 *  wired to the title needed a recording verb AND a colon within forty
 *  characters, and gave up on everything else.
 *
 *  There is a reader that already knows: subjectAfterContainer reads the
 *  noun standing beside the container he named. It answered «مبيعات»,
 *  «الموظفين», «الكتب» and «clients» on the same four sentences while the
 *  title was still a truncated request. Nothing needed inventing — the
 *  two readers were simply not joined.
 *
 *  Order matters and is not arbitrary. What he declared AFTER a recording
 *  verb wins, because that is him naming the thing outright. The noun
 *  beside the container comes next. And a verb is never a name: «جدول
 *  أسجل فيه المواعيد» puts «أسجل» beside the container, and it is refused
 *  here even though the earlier reader is the one that saves it.
 */
function theNounBesideTheContainer(request: string): string | null {
    const beside = String(subjectAfterContainer(request) || '').trim();
    //  A NAME IS WHAT IS LEFT AFTER THE PARTICLES, NOT THE PARTICLES.
    //
    //  «ما الفرق بين قاعدة البيانات والجدول؟» handed back «وال» — a
    //  conjunction and an article with nothing behind them. Three
    //  characters is a length, not a word; what has to be three is what
    //  remains once the prefixes he did not choose are taken off.
    const core = beside.replace(/^و/u, '').replace(/^(?:لل|ال|ل)/u, '');
    //  AND A VERB IS NEVER A NAME, IN ANY PERSON HE WRITES IT.
    //
    //  «بدي جدول يسجل الاسم والهاتف والعنوان» put «يسجل» beside the
    //  container and the app was named «يسجل الاسم». The older list
    //  held «أسجل» and not «يسجل», so the guard let it through — the
    //  same one-person blindness that cost the column reader a whole
    //  class of requests. Same stems, same four persons, one table.
    const first = beside.split(/\s+/)[0] || '';
    if (core.length >= 3 && !RECORDING_WORD.test(beside) && !A_RECORDING_VERB.test(first)) return beside;
    //  No container either — but grammar may still have found the entity,
    //  and the first column of an entity-and-its-attributes run IS the
    //  entity: «بدي برنامج يحفظ لي زبائني و…» is about زبائني.
    const grammar = entityAndItsAttributes(request);
    const head = grammar && grammar.length ? String(grammar[0].label || '').trim() : '';
    return head.length >= 3 ? head : null;
}

export function recordedSubject(requestRaw: string): string | null {
    const request = String(requestRaw || '').trim();
    if (!request) return null;
    const RECORDING = RECORDING_WORD;
    const opener = RECORDING.exec(request);
    if (!opener) return theNounBesideTheContainer(request);
    const after = request.slice((opener.index || 0) + opener[0].length);
    const colon = after.indexOf(':') >= 0 ? after.indexOf(':') : after.indexOf('：');
    // No colon means the list starts immediately: there is no subject to read,
    // and inventing one would be worse than keeping the archetype's word.
    if (colon < 0 || colon > 40) return null;
    //  «فيه», «فيها», «in», «my» are grammar between the verb and the subject.
    const LEAD = /^(?:فيه|فيها|به|بها|في|فى|the|my|our|a|an|all|of|for)$/i;
    const words: string[] = [];
    for (const w of after.slice(0, colon).trim().split(/\s+/)) {
        if (!w) continue;
        if (words.length === 0 && LEAD.test(w)) continue;
        words.push(w);
        if (words.length === 3) break;
    }
    const subject = words.join(' ').trim();
    if (subject.length >= 3) return subject;
    /**
     *  AND ARABIC OFTEN PUTS IT BEFORE THE VERB.
     *
     *  «بدي جدول للمواعيد أسجل فيه: اسم المريض…» names the table BEFORE the
     *  recording verb, so reading forward finds only «فيه» and gives up. The
     *  word he wants is the one immediately in front of the verb.
     *
     *  This runs only when reading forward found nothing, so «بدي جدول أسجل
     *  فيه المواعيد: …» still yields «المواعيد» and never «جدول».
     */
    const before = request.slice(0, opener.index || 0).trim().split(/\s+/);
    const tail = before.slice(-1)[0] || '';
    const bare = tail.replace(/^(?:لل|ال|ل)/, '');
    return bare.length >= 3 ? bare : theNounBesideTheContainer(request);
}

export function blueprintFor(kind: AppKind, request: string, isAr: boolean): AppBlueprint {
    /**
     * AN EXPLICIT LIST BEATS EVERY ARCHETYPE, WHATEVER THE DOMAIN LOOKS LIKE.
     *
     * Measured: «عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم
     * تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع» matched the bookings
     * archetype on the word «مواعيد» and received its canned columns and its
     * canned totals — «كل الحجوزات · مؤكّدة · حجوزات اليوم». He had just listed
     * five columns of his own, and not one of them survived.
     *
     * Recognising a domain is useful when the user names no columns. When he
     * DOES name them, the recognition has nothing left to add: he is the
     * authority on his own table. So the archetype keeps its title, its engine
     * and its copy, and his list replaces its columns, its totals and its
     * threshold — for every kind, not only for `generic`.
     */
    const L = (ar: string, en: string) => (isAr ? ar : en);
    const explicitColumns = fieldsFromRequest(request, isAr);
    if (explicitColumns) {
        const base = blueprintForKind(kind, request, isAr);
        const cols = derivedColumns(request) || [];
        const subject = recordedSubject(request);
        const counts = cols.filter(c => c.role === 'count');
        const monies = cols.filter(c => c.role === 'money');
        const wantsTotal = /مجموع|اجمالي|إجمالي|قيمة\s*ال|كم\s|\btotal\b|\bsum\b|how much/iu.test(request);
        const lowMatch = /(?:اقل|أقل|تحت|دون|less\s+than|under|below|<)\s*(?:من\s*)?(\d{1,4})/iu.exec(request);
        const wantsAlert = /(احمر|أحمر|بالاحمر|بالأحمر|\bred\b|تنبيه|انتبه|أنتبه|\bwarn|\balert)/iu.test(request);
        const metrics: AppMetric[] = [
            { label: L('عدد السجلات', 'Records'), kind: 'count' },
            ...(wantsTotal && counts[0] && monies[0]
                ? [{ label: `${L('إجمالي', 'Total')} ${counts[0].label} × ${monies[0].label}`,
                    kind: 'sumProduct', field: counts[0].key, field2: monies[0].key } as AppMetric] : []),
            ...(wantsTotal && counts[0] && monies[1]
                ? [{ label: `${L('الفرق بين', 'Margin between')} ${monies[1].label} ${L('و', 'and')} ${monies[0].label}`,
                    kind: 'sumMargin', field: counts[0].key, field2: monies[1].key, field3: monies[0].key } as AppMetric] : []),
            ...(wantsTotal && monies[0] && !counts[0]
                ? [{ label: `${L('مجموع', 'Total')} ${monies[0].label}`, kind: 'sum', field: monies[0].key } as AppMetric] : []),
            ...(counts[0]
                ? [{ label: `${L('مجموع', 'Total')} ${counts[0].label}`, kind: 'sum', field: counts[0].key } as AppMetric] : []),
        ];
        return {
            ...base,
            fields: explicitColumns,
            metrics,
            statusField: undefined,
            doneValue: undefined,
            /**
             *  AND NO PARENT HE NEVER NAMED.
             *
             *  Measured live. His five columns finally reached the generated
             *  app — and the booking archetype attached its own parent table
             *  on top: «اسم الطبيب *», «التخصّص», «الهاتف», with a picker
             *  «لا أطباء بعد — أضف أول طبيب ثم احجز له موعداً».
             *
             *  He never mentioned a doctor. Worse, the parent name was
             *  REQUIRED, so the form refused every appointment until he
             *  invented a doctor first. Two rows were typed into the live
             *  preview and neither appeared:
             *
             *      ROWS_SAMI=0 ROWS_LAYLA=0
             *
             *  A man who lists his columns has described his table. Keeping
             *  the archetype's title and copy is help; adding a second table
             *  he must fill before his own will accept a row is the catalogue
             *  overruling the request. A stock booking app — one where he
             *  named no columns — keeps its «طبيب ← مواعيده» relation.
             */
            relation: undefined,
            /**
             *  …AND A YES/NO COLUMN IS THE APP'S DONE-STATE.
             *
             *  He wrote «وهل تم السداد». That is not a fifth text box: it is
             *  the state of the row, and the records engine already knows how
             *  to draw a row as done. Naming it here is what connects the two,
             *  so a settled debt looks settled instead of holding the word
             *  «نعم» in a box.
             */
            ...(cols.find(c => c.role === 'flag')
                ? { statusField: cols.find(c => c.role === 'flag')!.key,
                    doneValue: (cols.find(c => c.role === 'flag')!.options || [])[0] }
                : {}),
            /**
             *  …AND HIS WORD FOR THE THING, WHEN HE SAID IT.
             *
             *  The archetype titled his clinic table «الحجوزات» and told him
             *  «احجز، أكّد، وتابع مواعيد اليوم» while his own sentence said
             *  «أسجل فيه المواعيد». Its copy is a fallback for a man who
             *  named nothing — never an overwrite of a man who did.
             */
            ...(subject ? {
                title: subject,
                entityOne: subject,
                entityMany: subject,
                lede: isAr ? `أضف ${subject}، وابحث فيها، ورتّبها، وصدّرها.`
                    : `Add ${subject}, search them, sort them and export them.`,
                emptyHint: isAr ? `لا ${subject} بعد — أضف أول واحد من النموذج.`
                    : `No ${subject} yet — add the first one from the form.`,
            } : {}),
            lowStock: (counts[0] && lowMatch && wantsAlert)
                ? { field: counts[0].key, below: Number(lowMatch[1]) } : undefined,
        };
    }
    return blueprintForKind(kind, request, isAr);
}

function blueprintForKind(kind: AppKind, request: string, isAr: boolean): AppBlueprint {
    let bp = stockBlueprintFor(kind, request, isAr);
    /**
     * The declared categories replace the stock ones — on whichever field
     * carries the grouping (the statusField when it has one, else a field
     * literally keyed `category`). A text field the owner declared options
     * for becomes a real select: his words shape the schema.
     */
    const declared = readDeclaredOptions(request);
    if (declared) {
        const target = bp.fields.find(fl => fl.key === (bp.statusField || 'category'))
            || bp.fields.find(fl => fl.key === 'category');
        if (target) {
            target.options = declared;
            if (target.type === 'text') target.type = 'select';
            if (!bp.statusField) bp.statusField = target.key;
        }
    }
    bp = applyRequestFieldConstraints(bp, request);
    return bp;
}

function stockBlueprintFor(kind: AppKind, request: string, isAr: boolean): AppBlueprint {
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

        case 'social': return {
            kind, engine: 'social',
            title: L('الخيط', 'The feed'),
            lede: L('انشر، تابِع، أعجب، علّق — خيط حقيقي بحسابات حقيقية.',
                'Post, follow, like and comment — a real feed with real accounts.'),
            entityOne: L('منشور', 'post'), entityMany: L('المنشورات', 'Posts'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('لا منشورات بعد — اكتب أول منشور، أو تابِع أحداً لترى منشوراته.',
                'No posts yet — write the first one, or follow someone to see theirs.'),
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

        case 'productivity': return {
            kind, engine: 'productivity',
            title: L('الملاحظات والمهام', 'Notes & Tasks'),
            lede: L('نظّم ملاحظاتك ومهامك في مساحة واحدة، مع حفظ دائم على جهازك.', 'Keep notes and tasks together, with durable local storage.'),
            entityOne: L('عنصر', 'item'), entityMany: L('الملاحظات والمهام', 'Notes and tasks'),
            fields: [], metrics: [
                { label: L('الملاحظات', 'Notes'), kind: 'count' },
                { label: L('المهام', 'Tasks'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('ابدأ بإضافة ملاحظة أو مهمة.', 'Start by adding a note or task.'),
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

        case 'finance': return {
            kind, engine: 'finance',
            title: L('المال', 'MoneyTrack'),
            lede: L('تابع الدخل والمصاريف والميزانيات مع حساب صافي الرصيد.', 'Track income, expenses and budgets with a computed net balance.'),
            entityOne: L('عملية مالية', 'financial entry'), entityMany: L('العمليات المالية', 'Financial entries'),
            fields: [
                f(['source', 'مصدر الدخل', 'Income source', 'text', undefined, ['required', 'primary']], isAr),
                f(['amount', 'المبلغ', 'Amount', 'number', undefined, ['required']], isAr),
                f(['category', 'الفئة', 'Category', 'text'], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
                f(['note', 'ملاحظة', 'Note', 'textarea'], isAr),
            ],
            metrics: [
                { label: L('إجمالي الدخل', 'Total income'), kind: 'sum', field: 'amount', unit: L('ر.س', 'SAR') },
                { label: L('إجمالي المصاريف', 'Total expenses'), kind: 'sum', field: 'amount', unit: L('ر.س', 'SAR') },
                { label: L('صافي الرصيد', 'Net balance'), kind: 'sum', field: 'amount', unit: L('ر.س', 'SAR') },
            ],
            deps: {},
            emptyHint: L('أضف دخلاً أو مصروفاً أو ميزانية لبدء المتابعة.', 'Add income, expense or budget entries to get started.'),
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
                { label: L('أعلى فئة', 'Top category'), kind: 'topGroup', field: 'category', field2: 'amount' },
                { label: L('عدد العمليات', 'Entries'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('لا مصاريف مسجّلة — أضف أول عملية.', 'Nothing logged yet — add your first entry.'),
        };

        /**
         * THE SHOP ENGINE — the one kind that must be able to SELL.
         *
         * Everything a records app has (rows, search, totals) plus the three
         * things that make it a store and that no CRUD screen has: a product
         * grid a customer reads, a cart that survives a reload, and a checkout
         * that writes a REAL order to the server's /api/orders. Without those
         * three it is an inventory list with prices on it.
         */
        case 'store': return {
            kind, engine: 'shop',
            title: L('المتجر', 'Store'),
            lede: L('اعرض منتجاتك، واستقبل طلبات حقيقية من زبائنك.', 'Show your products and take real orders from your customers.'),
            entityOne: L('منتج', 'product'), entityMany: L('المنتجات', 'Products'),
            fields: [
                f(['name', 'اسم المنتج', 'Product', 'text', undefined, ['required', 'primary']], isAr),
                f(['price', 'السعر', 'Price', 'number', undefined, ['required']], isAr),
                f(['category', 'التصنيف', 'Category', 'text'], isAr),
                f(['description', 'الوصف', 'Description', 'textarea'], isAr),
                f(['image', 'رابط الصورة', 'Image URL', 'text'], isAr),
                f(['stock', 'المخزون', 'Stock', 'number'], isAr),
            ],
            metrics: [
                { label: L('عدد المنتجات', 'Products'), kind: 'count' },
                { label: L('قيمة المعروض', 'Catalogue value'), kind: 'sumProduct', field: 'stock', field2: 'price' },
                { label: L('متوسط السعر', 'Average price'), kind: 'avg', field: 'price' },
            ],
            deps: {},
            emptyHint: L('لا منتجات بعد — أضف أول منتج من لوحة التاجر.', 'No products yet — add the first one from the merchant panel.'),
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
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['متوفر', 'قارب على النفاد', 'نفد'], ['In stock', 'Low', 'Out of stock'], isAr)], isAr),
            ],
            // The supplier used to be a word typed on each item — so «الشركة
            // المتحدة» and «الشركه المتحدة» were two suppliers, and a changed
            // phone number had to be chased through the whole table.
            relation: {
                resource: 'suppliers', one: L('مورّد', 'supplier'), many: L('المورّدون', 'Suppliers'),
                key: 'supplier_id', labelKey: 'name',
                fields: [
                    f(['name', 'اسم المورّد', 'Supplier', 'text', undefined, ['required', 'primary']], isAr),
                    f(['phone', 'الهاتف', 'Phone', 'tel'], isAr),
                    f(['email', 'البريد', 'Email', 'email'], isAr),
                ],
                emptyHint: L('لا مورّدين بعد — أضف أول مورّد ثم اربط به أصنافه.', 'No suppliers yet — add the first one, then link its items.'),
            },
            statusField: 'status',
            metrics: [
                { label: L('عدد الأصناف', 'Items'), kind: 'count' },
                { label: L('إجمالي الكمية', 'Total quantity'), kind: 'sum', field: 'qty' },
                { label: L('قيمة المخزون', 'Stock value'), kind: 'sumProduct', field: 'qty', field2: 'price' },
            ],
            deps: {},
            emptyHint: L('المخزون فارغ — أضف أول صنف.', 'The inventory is empty — add your first item.'),
        };

        case 'booking': {
            const clinic = CLINIC_SIGNAL.test(request);
            return {
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
            // «طبيب ← مواعيده»: the appointment belongs to a person who has a
            // record of their own — a specialty, a phone, a name that can be
            // corrected in ONE place and be right on every past booking.
            relation: {
                resource: 'providers',
                one: clinic ? L('طبيب', 'doctor') : L('مقدّم الخدمة', 'provider'),
                many: clinic ? L('الأطباء', 'Doctors') : L('مقدّمو الخدمة', 'Providers'),
                key: 'provider_id', labelKey: 'name',
                fields: [
                    f(['name', clinic ? 'اسم الطبيب' : 'الاسم', clinic ? 'Doctor' : 'Name', 'text', undefined, ['required', 'primary']], isAr),
                    f(['specialty', clinic ? 'التخصّص' : 'الاختصاص', clinic ? 'Specialty' : 'Speciality', 'text'], isAr),
                    f(['phone', 'الهاتف', 'Phone', 'tel'], isAr),
                ],
                emptyHint: clinic
                    ? L('لا أطباء بعد — أضف أول طبيب ثم احجز له موعداً.', 'No doctors yet — add the first one, then book them an appointment.')
                    : L('لا مقدّمي خدمة بعد — أضف أولهم ثم احجز له موعداً.', 'No providers yet — add the first one, then book an appointment.'),
            },
            statusField: 'status', doneValue: L('مؤكّد', 'Confirmed'),
            metrics: [
                { label: L('كل الحجوزات', 'All bookings'), kind: 'count' },
                { label: L('مؤكّدة', 'Confirmed'), kind: 'countWhere', field: 'status', equals: L('مؤكّد', 'Confirmed') },
                { label: L('حجوزات اليوم', 'Today'), kind: 'todayCount', field: 'date' },
            ],
            deps: {},
            emptyHint: L('لا حجوزات بعد — أضف أول موعد.', 'No bookings yet — add the first appointment.'),
            };
        }

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
                f(['phone', 'الهاتف', 'Phone', 'tel'], isAr),
                f(['email', 'البريد', 'Email', 'email'], isAr),
                f(['value', 'قيمة الصفقة', 'Deal value', 'number'], isAr),
                f(['stage', 'المرحلة', 'Stage', 'select', SELECT_AR_EN(['عميل محتمل', 'تم التواصل', 'عرض سعر', 'مغلق'], ['Lead', 'Contacted', 'Proposal', 'Closed'], isAr)], isAr),
            ],
            // Several contacts sit inside ONE company; the company is a record
            // with an industry and a website, not a repeated string.
            relation: {
                resource: 'companies', one: L('جهة', 'company'), many: L('الجهات', 'Companies'),
                key: 'company_id', labelKey: 'name',
                fields: [
                    f(['name', 'اسم الجهة', 'Company', 'text', undefined, ['required', 'primary']], isAr),
                    f(['sector', 'القطاع', 'Sector', 'text'], isAr),
                    f(['website', 'الموقع', 'Website', 'text'], isAr),
                ],
                emptyHint: L('لا جهات بعد — أضف أول جهة ثم اربط بها عملاءها.', 'No companies yet — add the first one, then link its people.'),
            },
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
                f(['grade', 'الدرجة', 'Grade', 'number'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['مسجّل', 'منجز', 'منسحب'], ['Enrolled', 'Completed', 'Withdrawn'], isAr)], isAr),
            ],
            // A course is taught once and enrolled in many times: it owns a
            // teacher and a credit count, and the enrolment points at it.
            relation: {
                resource: 'courses', one: L('مادة', 'course'), many: L('المواد', 'Courses'),
                key: 'course_id', labelKey: 'title',
                fields: [
                    f(['title', 'اسم المادة', 'Course', 'text', undefined, ['required', 'primary']], isAr),
                    f(['teacher', 'المدرّس', 'Teacher', 'text'], isAr),
                    f(['hours', 'الساعات', 'Credit hours', 'number'], isAr),
                ],
                emptyHint: L('لا مواد بعد — أضف أول مادة ثم سجّل فيها طلابك.', 'No courses yet — add the first one, then enrol students in it.'),
            },
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

        case 'calculator': return {
            kind, engine: 'calculator',
            title: L('الآلة الحاسبة', 'Calculator'),
            lede: L('احسب بسرعة، راجع آخر عملياتك، واعمل بثقة على الهاتف أو سطح المكتب.',
                'Calculate quickly, review recent operations, and stay confident on phone or desktop.'),
            entityOne: L('عملية', 'calculation'), entityMany: L('العمليات الأخيرة', 'Recent calculations'),
            fields: [],
            metrics: [],
            deps: {},
            emptyHint: L('لا توجد عمليات بعد — ابدأ بعملية حسابية.', 'No calculations yet — start an operation.'),
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

        default: {
        /**
         * THE COLUMNS HE NAMED, WHEN HE NAMED THEM.
         *
         * The canned five below are a starting point for a request that
         * describes no schema. When the request DOES list its columns, that
         * list wins — and the totals follow it: a quantity beside a price is a
         * stock value, and saying so is arithmetic, not a guess.
         */
        const asked = fieldsFromRequest(request, isAr);
        /**
         * METRICS BIND TO ROLES, NOT TO NAMES.
         *
         * The first version matched keys it had invented — `qty`, `buyPrice`,
         * `sellPrice` — which is the same disease as relabelling his columns:
         * it worked for the request it was written from. A column's ROLE is
         * what a total needs to know. «الكمية», «عدد النسخ» and «quantity» are
         * all counts; «سعر الشراء», «المبلغ المدفوع» and «unit price» are all
         * money. The arithmetic is the same in every shop, clinic and farm.
         *
         * And the label of each total is built from HIS words, so a clinic
         * never reads «رأس المال» about its fees.
         */
        const cols = derivedColumns(request) || [];
        const counts = cols.filter(c => c.role === 'count');
        const monies = cols.filter(c => c.role === 'money');
        const wantsTotal = /مجموع|اجمالي|إجمالي|قيمة\s*ال|كم\s|\btotal\b|\bsum\b|how much/iu.test(request);
        const derivedMetrics: AppMetric[] = asked
            ? [
                { label: L('عدد السجلات', 'Records'), kind: 'count' },
                ...(wantsTotal && counts[0] && monies[0]
                    ? [{ label: `${L('إجمالي', 'Total')} ${counts[0].label} × ${monies[0].label}`,
                        kind: 'sumProduct', field: counts[0].key, field2: monies[0].key } as AppMetric] : []),
                ...(wantsTotal && counts[0] && monies[1]
                    ? [{ label: `${L('الفرق بين', 'Margin between')} ${monies[1].label} ${L('و', 'and')} ${monies[0].label}`,
                        kind: 'sumMargin', field: counts[0].key, field2: monies[1].key, field3: monies[0].key } as AppMetric] : []),
                ...(wantsTotal && !counts[0] && monies[0]
                    ? [{ label: `${L('مجموع', 'Total')} ${monies[0].label}`, kind: 'sum', field: monies[0].key } as AppMetric] : []),
                ...(counts[0]
                    ? [{ label: `${L('مجموع', 'Total')} ${counts[0].label}`, kind: 'sum', field: counts[0].key } as AppMetric] : []),
            ]
            : [];
        /**
         * «وإذا كمية قطعة صارت أقل من 3 يصير لونها أحمر عشان أنتبه»
         *
         * His threshold, his number, on whichever column counts — read from the
         * sentence, never defaulted, and only when he also asked to be warned.
         */
        const lowStockMatch = /(?:اقل|أقل|تحت|دون|less\s+than|under|below|<)\s*(?:من\s*)?(\d{1,4})/iu.exec(request);
        const wantsAlert = /(احمر|أحمر|بالاحمر|بالأحمر|\bred\b|تنبيه|انتبه|أنتبه|\bwarn|\balert)/iu.test(request);
        const lowStock = (counts[0] && lowStockMatch && wantsAlert)
            ? { field: counts[0].key, below: Number(lowStockMatch[1]) }
            : undefined;
        return {
            kind: 'generic', engine: 'records',
            title: subject || L('السجلات', 'Records'),
            lede: L('أضف، عدّل، ابحث، وصدّر — تطبيق يعمل فعلاً لا صفحة تتحدث عنه.',
                'Add, edit, search and export — an app that works, not a page about one.'),
            entityOne: L('سجلّ', 'record'), entityMany: subject || L('السجلات', 'Records'),
            fields: asked || [
                f(['title', 'العنوان', 'Title', 'text', undefined, ['required', 'primary']], isAr),
                f(['details', 'التفاصيل', 'Details', 'textarea'], isAr),
                f(['amount', 'قيمة', 'Value', 'number'], isAr),
                f(['date', 'التاريخ', 'Date', 'date'], isAr),
                f(['status', 'الحالة', 'Status', 'select', SELECT_AR_EN(['جديد', 'قيد العمل', 'منجز'], ['New', 'In progress', 'Done'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('منجز', 'Done'),
            lowStock,
            metrics: derivedMetrics.length ? derivedMetrics : [
                { label: L('كل السجلات', 'All records'), kind: 'count' },
                { label: L('منجز', 'Done'), kind: 'countWhere', field: 'status', equals: L('منجز', 'Done') },
                { label: L('أُضيف اليوم', 'Added today'), kind: 'todayCount', field: 'createdAt' },
            ],
            deps: {},
            emptyHint: L('لا سجلات بعد — أضف أول سجلّ من النموذج.', 'No records yet — add the first one in the form.'),
        };
        }
    }
}


/* ── the schema the request itself dictates ────────────────────────────── */

/**
 * HIS WORDS, HIS COLUMNS — WHATEVER HE IS TALKING ABOUT.
 *
 * The first version of this reader carried a table of MEANINGS: «سعر الشراء»
 * became `buyPrice` and was relabelled «سعر الشراء», «كمية» became `qty` and
 * was relabelled «الكمية». It read the request that built it and degraded on
 * every other one. Measured across three domains it had never seen:
 *
 *     عيادة أسنان   «اسم المريض» -> «الاسم»    «رقم تلفونه» -> «الرقم»
 *                   «وقت الموعد» -> plain text  «المبلغ المدفوع» -> «السعر»
 *     مكتبة        «اسم المؤلف» -> «الاسم»    «سنة الإصدار» -> plain text
 *     مزرعة        «كمية الحليب» -> «الكمية»   «وزنها» -> plain text
 *
 * A phone number became a part number. A patient's name became «الاسم». That
 * is a memorised prompt wearing the costume of understanding, and the owner
 * named it as law: Joe builds ANY request, it does not rehearse a few.
 *
 * So the reader keeps exactly one thing from him and infers exactly one thing
 * itself:
 *
 *   · THE LABEL IS HIS, always, unchanged. «كمية الحليب» stays «كمية الحليب».
 *   · THE TYPE is inferred from a small CLOSED vocabulary — the input types a
 *     form can have at all, not a list of things people might record. There
 *     are nine of those and infinitely many of the other, which is exactly why
 *     one of them can be a table and the other cannot.
 *
 * The key is mechanical, derived from the role its type implies, so metrics can
 * bind to «the money column» without ever knowing what the money is for.
 */
type DerivedRole = 'money' | 'count' | 'scalar' | 'date' | 'time' | 'tel' | 'email' | 'flag' | 'note' | 'text';

/** Closed vocabulary: what KIND of value this is, never what it is called. */
/**
 *  A COLUMN THAT ASKS A QUESTION IS A YES OR A NO.
 *
 *  Measured live. He answered Joe’s question with «اسم المدين والمبلغ
 *  وتاريخ الدين وهل تم السداد» and got four columns — three right, and a
 *  free-text box labelled «هل تم السداد». He would have had to type the
 *  word «نعم» into it, and no total could ever count it.
 *
 *  The signal is grammatical and needs no list of states: a label that
 *  OPENS WITH AN INTERROGATIVE — «هل», «is», «has», «did» — or ends in a
 *  question mark is a question, and a column that asks a question holds an
 *  answer of yes or no. A handful of past participles people write instead
 *  of the question («مدفوع», «تم الدفع», `paid`, `done`) are the same
 *  column with the question left implicit.
 */
const ASKS_YES_OR_NO = /^(?:هل|is|are|was|were|has|have|did|does)(?=$|\s)|[?؟]\s*$|^(?:تم|مدفوع|مدفوعة|مسدد|مسدّد|منجز|مكتمل|مغلق|paid|done|completed|settled|closed|shipped|delivered)(?=$|\s)/iu;

const TYPE_MARKS: Array<[RegExp, DerivedRole, FieldType]> = [
    [ASKS_YES_OR_NO, 'flag', 'select'],
    [/تلفون|هاتف|جوال|موبايل|واتس|\bphone\b|\bmobile\b|\btel\b|whatsapp/iu, 'tel', 'tel'],
    [/ايميل|إيميل|بريد\s*الكتروني|بريد\s*إلكتروني|\bemail\b|\be-?mail\b/iu, 'email', 'email'],
    [/تاريخ|يوم\s|\bdate\b|\bday\b/iu, 'date', 'date'],
    [/وقت|ساعة|موعد|\btime\b|\bhour\b/iu, 'time', 'time'],
    [/سعر|مبلغ|تكلفة|ثمن|قيمة|راتب|اجرة|أجرة|رسوم|دفع|مدفوع|\bprice\b|\bamount\b|\bcost\b|\bfee\b|\bsalary\b|\bpaid\b|\btotal\b/iu, 'money', 'number'],
    //  A year and an age are numbers you read, not quantities you add.
    //  Summing «سنة الإصدار» yields a number that means nothing, and printing
    //  it as a total is a confident lie about the user's own data.
    [/سنة|عام|عمر|\byear\b|\bage\b/iu, 'scalar', 'number'],
    [/كمي|عدد|وزن|طول|عرض|ارتفاع|مساحة|نسب|\bqty\b|\bquantity\b|\bcount\b|\bweight\b|\bsize\b/iu, 'count', 'number'],
    [/ملاحظ|وصف|تفاصيل|شرح|تعليق|\bnote\b|\bdescription\b|\bdetails\b|\bcomment\b/iu, 'note', 'textarea'],
];

export interface DerivedField { label: string; key: string; type: FieldType; role: DerivedRole; options?: string[]; min?: number; minExclusive?: boolean }

/** A condition he stated, and the field it is about. */
export interface StatedRule { text: string; field?: string; min?: number; minExclusive?: boolean }

/**
 *  A RULE THAT IS NEITHER KEPT NOR CONFESSED.
 *
 *  Live round on his machine:
 *
 *      «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *
 *  Three columns arrived, correctly, and the condition vanished. Measured
 *  in the generated project:
 *
 *      { key: 'money1', label: 'السعر', type: 'number', required: true }
 *          — no min, no bound of any kind
 *      RecordsApp.jsx:28
 *          if (field.type !== 'number' || field.min === undefined) return false;
 *
 *  The app SHIPS the guard. Nothing ever fills the value it reads, so
 *  zero is accepted — the exact thing he forbade. And the ledger said
 *  «3 of what I know how to prove is proven», naming three columns and
 *  never the rule, so the report was true and useless at the same time.
 *
 *  isAName already RECOGNISES the sentence as a rule — that is how it
 *  keeps «والسعر لا يقبل صفر» out of the column list. It recognised it
 *  and dropped it on the floor.
 *
 *  So a rule is read, and what can be turned into a bound is turned into
 *  one. What cannot is still returned, because a condition Joe cannot
 *  apply must be SAID rather than silently lost — that is the whole of
 *  the difference between a report and a receipt.
 */
/**
 *  A COLUMN IS NOT THE WORD FOR THE THING THAT HOLDS IT.
 *
 *  Lowering the floor to two — because he named the container — let a
 *  QUESTION through:
 *
 *      «ما الفرق بين الجدول والقائمة والسجل؟»
 *        → columns: «القائمة», «السجل»
 *
 *  Three container words, compared with each other, read as a schema of
 *  two. Nobody puts a column called «الجدول» inside his جدول, and that is
 *  the whole rule — no list of question words, no punctuation trick, and
 *  nothing that would break «…وهل انتهت؟», a real build request that ends
 *  in a question mark because his last column asks one.
 *
 *  It reads the same RECORD_CONTAINER the rest of this file reads.
 */
function notAContainerItself(label: string): boolean {
    const bare = String(label || '').trim().replace(/^ال(?=[ء-ي])/u, '');
    if (!bare) return false;
    const hit = RECORD_CONTAINER.exec(bare);
    //  Only when the container word IS the whole label: «جدول المهام» is a
    //  name he chose, «الجدول» on its own is the word for the box.
    return !(hit && hit[0].length === bare.length);
}

export function statedRules(requestRaw: string): StatedRule[] {
    const request = String(requestRaw || '');
    const out: StatedRule[] = [];
    //  Rules are stated as their own clause, after a comma or «و».
    for (const raw of request.split(/[،,؛;.\n]/)) {
        const clause = raw.trim().replace(/^و\s*/u, '').trim();
        if (!clause) continue;
        //  READS_AS_A_RULE is a list of NEGATIONS — «لا», «يجب», «يمنع».
        //  «والمبلغ أكبر من 50» states a condition and contains none of
        //  them, so it was not seen as a rule at all. Caught by making a
        //  test assert the wiring instead of calling the helper itself:
        //  the old test passed with the link cut, which is a criterion
        //  that cannot fail — a defect, and it was mine.
        //
        //  A clause that STATES A BOUND is a rule whatever words it uses,
        //  and statedBound is the authority on that, not a vocabulary.
        const boundHere = statedBound(clause);
        if (!boundHere && !READS_AS_A_RULE.test(clause)) continue;
        const rule: StatedRule = { text: clause };
        //  Which column is it about? The clause names it, and the name is
        //  the definite noun it opens with — no vocabulary of field names.
        const named = clause.match(/^(?:ال[ء-ي]+|[A-Za-z][A-Za-z0-9_]*)/u);
        if (named) rule.field = named[0];
        //  THE BOUND READER ALREADY EXISTS — statedBound, above, and it
        //  knows «أقل من», «على الأقل», «موجب» and their English twins.
        //  Writing a second one here would be the duplication this file
        //  keeps paying for: two readers drift the first time one of
        //  them learns a phrase the other does not.
        if (boundHere) { rule.min = boundHere.min; rule.minExclusive = boundHere.minExclusive; }
        out.push(rule);
    }
    return out;
}

/** Attach every readable bound to the field it names. Unreadable rules stay unattached. */
export function applyStatedRules(fields: DerivedField[], rules: StatedRule[]): { fields: DerivedField[]; unapplied: StatedRule[] } {
    const unapplied: StatedRule[] = [];
    const next = fields.map(f => ({ ...f }));
    for (const rule of rules) {
        if (rule.min === undefined || !rule.field) { unapplied.push(rule); continue; }
        //  His own label, matched as he wrote it — «السعر» is «السعر».
        const target = next.find(f => f.label === rule.field || f.label.includes(String(rule.field)) || String(rule.field).includes(f.label));
        if (!target || target.type !== 'number') { unapplied.push(rule); continue; }
        target.min = rule.min;
        if (rule.minExclusive) target.minExclusive = true;
    }
    return { fields: next, unapplied };
}

/** The columns a request enumerates, in his words and his order. */
/**
 * EVERY TABLE HE NAMED, NOT THE FIRST ONE.
 *
 * Measured. He wrote, in one breath:
 *
 *     «بدي جدول للمواعيد أسجل فيه: اسم المريض ووقت الموعد.
 *      وبدي جدول ثاني للمصاريف أسجل فيه: البند والمبلغ والتاريخ.»
 *
 * and the reader returned NOTHING. The English twin returned the first table
 * and dropped the second without a word — which is worse, because it looks
 * like success.
 *
 * The cause is that derivedColumns stops at the first opener and reads to the
 * end of that one sentence. A man who asks for two tables in two sentences is
 * not asking for one.
 *
 * This walks every opener in the request and returns one group per table, in
 * his order. What the builder then does with a second table is a separate
 * question — but it can no longer pretend it never saw it.
 */
export interface DerivedTable { subject: string | null; columns: DerivedField[] }

export function derivedTables(requestRaw: string): DerivedTable[] {
    const request = String(requestRaw || '');
    //  Sentences are the natural boundary between two asks — he ended one and
    //  began another. Reading each on its own also stops a list from swallowing
    //  the sentence after it.
    const out: DerivedTable[] = [];
    const seen = new Set<string>();
    for (const piece of request.split(/(?<=[.؟!\n])/u)) {
        const cols = derivedColumns(piece);
        if (!cols) continue;
        const key = cols.map(c => c.label).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ subject: recordedSubject(piece), columns: cols });
    }
    //  A single table stated across two sentences must not become two: when the
    //  whole request reads as one list and nothing split out, keep that reading.
    if (out.length === 0) {
        const whole = derivedColumns(request);
        if (whole) out.push({ subject: recordedSubject(request), columns: whole });
    }
    return out;
}


/**
 *  IS THIS ITEM A NAME, OR A RULE?
 *
 *  Measured on his own sentence:
 *
 *      «جدول مبيعات فيه اسم الصنف والكمية والسعر، وما يقبل مبلغ صفر»
 *       → columns: ["اسم الصنف","الكمية","السعر","وما يقبل مبلغ صفر"]
 *
 *  The last one is not a column. It is the condition he attached to the
 *  table, and the reader put it in the schema as a field whose label is a
 *  whole clause. The app then showed him an input box asking him to type
 *  «وما يقبل مبلغ صفر».
 *
 *  THE CLASS: A CONSTRAINT IS NOT A COLUMN.
 *
 *  The test is shape, not vocabulary. A column is a NAME — a short noun
 *  phrase. A rule is a CLAUSE — it negates, it obliges, or it simply runs
 *  long. The particles below are a closed grammatical class (negation and
 *  obligation), not a list of business words: no domain noun appears here,
 *  and none ever should.
 */
const READS_AS_A_RULE = /(?:^|[\s،])(?:لا|ما|ليس|ليست|غير|بدون|يجب|لازم|يمنع|يرفض|not|must|should|cannot|reject|forbid)(?:$|[\s،])/iu;

function isAName(item: string): boolean {
    const t = String(item || '').trim();
    if (!t) return false;
    if (READS_AS_A_RULE.test(t)) return false;
    //  A name is short. «وما يقبل مبلغ صفر» is four words; «المبلغ المدفوع»
    //  and «اسم المريض» are two. Arabic packs more into a word, so it gets
    //  the tighter cap and English the looser one.
    const words = t.split(/\s+/).filter(Boolean).length;
    const arabic = /[\u0600-\u06FF]/u.test(t);
    return words <= (arabic ? 3 : 4);
}

/**
 *  IS THIS LIST A LIST OF COLUMNS, OR A LIST OF VALUES?
 *
 *  Measured, on the connector alone:
 *
 *      «بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب»   → 3 columns
 *      «بدي جدول للمصاريف يحوي التاريخ والمبلغ والسبب»  → null
 *      «بدي جدول للمصاريف مع التاريخ والمبلغ والسبب»    → null
 *      «بدي جدول للمصاريف أعمدته التاريخ والمبلغ والسبب»→ null
 *      «بدي جدول للمصاريف: التاريخ والمبلغ والسبب»      → null
 *
 *  One word worked and four did not, and the four are the same sentence.
 *  That is the fourth law being broken in the one function it was written
 *  for: the reader had a list of connectors, and «فيه» happened to be on it.
 *
 *  Widening the list would be the same disease with a longer prescription.
 *  So the SHAPE of the items decides instead — and Arabic states it plainly:
 *
 *      columns are DEFINITE   «التاريخ» «اسم المريض» «رقم تلفونه»
 *      values are INDEFINITE  «قهوة» «أدوات» «حلويات» · «صغير» «وسط» «كبير»
 *
 *  This is what kept «متجر بفئات: قهوة، أدوات، حلويات» from becoming five
 *  columns before, and it still does — not because «بفئات» is on a list of
 *  forbidden words, but because coffee and sweets are indefinite nouns and
 *  a column name is not.
 *
 *  EVERY item must qualify. Two of three is what «الرياض، جدة، الدمام»
 *  scores — a list of cities carrying the article inside two proper names —
 *  and a list of values that passes two thirds of a test is a list of values
 *  that gets through.
 */
function everyItemIsADefiniteName(items: string[]): boolean {
    if (!items.length) return false;
    return items.every(raw => {
        const t = String(raw || '').trim();
        if (!isAName(t)) return false;
        /**
         *  A DEFINITENESS TEST IS WRITTEN IN ONE ALPHABET.
         *
         *  Measured, the same sentence in two scripts:
         *
         *      «بدي جدول للعملاء فيه الاسم والهاتف والعنوان»  → 3 columns
         *      «A clients table with name, phone and address»  → null
         *
         *  Not «read badly» — never read at all. The test below is «ال» or
         *  a possessive suffix, and no English noun carries either, so it
         *  could NEVER pass and every English request fell through to a
         *  memorised template.
         *
         *  English marks the difference on the CONTAINER instead of the
         *  noun, and the caller has already established that a container
         *  was named. «name», «phone», «address» are as bare in English as
         *  «قهوة» is in Arabic; what keeps a shopping list out is that a
         *  list holds things while a table holds columns, and that test
         *  belongs to the container, not to the item.
         */
        if (!/[؀-ۿ]/u.test(t)) return true;
        //  «ال» anywhere — on the word itself or on the second half of an
        //  idafa («اسم المريض») — or a possessive suffix («رقم تلفونه»),
        //  which is the other way Arabic makes a noun definite.
        //  Folded, because a diacritic is not a letter and every test here
        //  reads letters. «زُرْقَمُونِي» carries a kasra between its last two
        //  letters, so «a letter then ي» found nothing and his own invented
        //  word was ruled not a name at all.
        const bare = stripArabicDiacritics(t);
        return /(?:^|\s)ال[ء-ي]/u.test(bare)
            || /[ء-ي](?:ه|ها|هم|هن|ي|ك|كم|نا)(?:$|\s)/u.test(bare);
    });
}

/**
 *  A THING THAT HOLDS RECORDS, NAMED IN HIS OWN WORD.
 *
 *  This lived inside derivedColumns as a local. It is needed in a second
 *  place now — the clarifier, which must ask about the container HE named
 *  instead of asking about a website — and a second copy would drift the
 *  first time one of them learned a word the other did not.
 */
export const RECORD_CONTAINER = /(جدول|جداول|قائمة|كشف|سجل|سجلّ|\btable\b|\blist\b|\bsheet\b|\bledger\b|\bregister\b|\btracker\b)/iu;

/**
 *  WHERE THE SENTENCE ENDS AND THE FIRST COLUMN BEGINS.
 *
 *  Two branches read the same sentence — one when a recording verb opens
 *  the list, one when only the container does — and whatever stood between
 *  the container and the list stuck to the first item. One branch had been
 *  taught to strip it. The other had not been taught at all, so a live
 *  round returned this:
 *
 *      «بدي برنامج اسجل فيه اسم الطالب وصفه ودرجته»
 *      → columns: «فيه اسم الطالب» · «صفه» · «درجته»
 *
 *  A column called «فيه». Not a bad reading of his words — the second
 *  reader was never given the lesson the first one learned. So there is
 *  one cleaner now, and both branches call it.
 *
 *  It strips a closed class and nothing else. In both languages what
 *  stands between a container and its columns is a FUNCTION word — a
 *  preposition, a relative, an article — and function words are a closed
 *  set that can be written down honestly. Content words are not, and
 *  guessing at them is how a verb becomes a column.
 */
const ARABIC_FUNCTION_WORD = /^(?:في|إلى|الى|على|عن|مع|من|ل|ب|ف|و)(?:ه|ها|هم|هن|ي|ك|كم|نا)?$/u;

function firstColumnBeginsAtTheName(firstRaw: string, afterAContainer: boolean): string {
    const first = String(firstRaw || '').trim();
    //  English has no «ال», so the preposition is the whole signal:
    //  «with name» is the sentence plus the column, not a column called
    //  «with name».
    const trimmedEn = first
        .replace(/^(?:that\s+(?:has|have|holds?|contains?)|which\s+(?:has|have)|with|of|for|containing|including|holding|showing|having)\s+/iu, '')
        .replace(/^(?:a|an|the)\s+/iu, '')
        .trim();
    if (trimmedEn !== first) return trimmedEn;
    if (!/\s/.test(first)) return first;
    const words = first.split(/\s+/);

    //  A leading Arabic function word — «فيه», «لي», «بها». Strip the run
    //  of them and stop: what follows is his own words.
    let cut = 0;
    while (cut < words.length - 1 && ARABIC_FUNCTION_WORD.test(words[cut])) cut++;
    if (cut > 0) return words.slice(cut).join(' ');

    //  A NAME IS MARKED DEFINITE THREE WAYS, AND THIS KNEW ONE.
    //
    //  «ال», an idafa whose second half carries «ال», and a possessive
    //  suffix — «زبائني», «درجته». everyItemIsADefiniteName already knows
    //  all three; this trim knew only the article, so «يحفظ لي زبائني»
    //  found no start at all and handed back the verb as a column.
    if (afterAContainer) {
        //  Only when the residue is the container's own subject: «جدول
        //  للمصاريف يحوي التاريخ» hands back «للمصاريف يحوي التاريخ», and
        //  the column starts at «التاريخ». After a recording verb the
        //  residue is an idafa he wrote himself — «اسم المريض» — and
        //  cutting to the article there would throw away half his label.
        const article = words.findIndex(w => /^ال[ء-ي]/u.test(w));
        if (article > 0) return words.slice(article).join(' ');
    }
    const owned = words.findIndex(w => !ARABIC_FUNCTION_WORD.test(w) && /[ء-ي](?:ه|ها|هم|هن|ي|ك|كم|نا)$/u.test(w));
    if (owned > 0) return words.slice(owned).join(' ');
    return first;
}

/**
 *  A CAPABILITY HE ASKED FOR IS NOT A COLUMN.
 *
 *  Measured on four of his own sentences:
 *
 *      «…فيه الاسم والصف والدرجة، مع بحث بالاسم وترتيب بالدرجة»
 *      → الاسم · الصف · الدرجة · «مع بحث بالاسم» · «ترتيب بالدرجة»
 *
 *      «…فيه رقم الفاتورة والمبلغ والتاريخ، واعرض لي المجموع»
 *      → … · «واعرض لي المجموع»
 *
 *      «…فيه اسم المنتج والسعر والصورة، مع سلة مشتريات»
 *      → … · «مع سلة مشتريات»
 *
 *      «…فيه اسم العميل ووقت الحجز، ويحفظ البيانات على خادم»
 *      → nothing at all — the capability sank the two real columns
 *        below the floor and the whole request read as no schema.
 *
 *  He asked for a search, a total, a cart, a server. Each became a
 *  column of the table, or drowned the ones that were real. This is the
 *  same shape as the rule that became a column and was given statedRules
 *  — and capabilities were never given the same treatment.
 *
 *  Two closed-class tests, no vocabulary:
 *
 *  1. A column is a DEFINITE NAME, judged by the same three marks used
 *     everywhere else. «مع بحث بالاسم» and «مع سلة مشتريات» carry none.
 *
 *  2. A name is a word or a two-word idafa. A function word standing
 *     INSIDE it means the phrase is a clause, not a name: «واعرض لي
 *     المجموع» has «لي» in it, «يحفظ البيانات على خادم» has «على».
 *     «اسم المريض», «رقم تلفونه», «وقت الموعد» have none.
 *
 *  And the run STOPS at the first one that fails rather than filtering
 *  it out, because a list is contiguous: what follows the boundary is
 *  the next thing he asked for, not a later column.
 */
/**
 *  …AND IN ENGLISH THE BOUNDARY IS THE ONLY MARK THERE IS.
 *
 *  The two tests above are Arabic ones: definiteness, and a function word
 *  standing inside a name. English has neither — every Latin item passes
 *  the definiteness test by design, because English marks that on the
 *  container instead. So this slipped straight through:
 *
 *      «A students table: name, class and grade, with search by name»
 *      → name · class · grade · «with search by name»
 *
 *  The mark English does have is position. «with» opening the FIRST item
 *  is the sentence handing over to the list, and firstColumnBeginsAtTheName
 *  already strips it there. The same word opening a LATER item is him
 *  starting a new request — there is nothing left for it to hand over.
 *
 *  «of» is deliberately absent: «date of birth» is a column he might
 *  really write, and a rule that cannot tell it from a clause would cost
 *  more than it saves.
 */
const OPENS_A_NEW_REQUEST = /^(?:مع|plus|with|along\s+with|together\s+with|including|and)(?=$|[\s،,])/iu;

function isAColumnAndNotAClause(item: string, index: number): boolean {
    const t = String(item || '').trim();
    if (index > 0 && OPENS_A_NEW_REQUEST.test(t)) return false;
    //  A YES-OR-NO COLUMN IS INDEFINITE BY NATURE.
    //
    //  «بدي جدول أسجل فيه الفواتير: اسم الزبون والمبلغ ومدفوع» — «مدفوع»
    //  carries no «ال» and no possessive, so the definiteness test cut the
    //  run before it and he lost the column. It is a column all the same,
    //  marked another way: a question about the row rather than a name of
    //  a thing, which is exactly what ASKS_YES_OR_NO already reads.
    if (ASKS_YES_OR_NO.test(t)) return true;
    if (!everyItemIsADefiniteName([t])) return false;
    const words = t.split(/\s+/);
    return !words.slice(1).some(w => ARABIC_FUNCTION_WORD.test(w));
}

function columnsEndWhereHisNextRequestBegins(parts: string[]): string[] {
    const stop = parts.findIndex((part, i) => !isAColumnAndNotAClause(part, i));
    return stop < 0 ? parts : parts.slice(0, stop);
}

/**
 *  AN ENTITY AND ITS ATTRIBUTES, NAMED BY GRAMMAR ALONE.
 *
 *      «بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم»
 *      → null
 *
 *  He named no container — «برنامج» holds an app, not records — and
 *  «حفظ» is a stem the opener list has never held. Adding it would fix
 *  this one sentence and the next man writes «يخزّن» or «يمسك» and we are
 *  back here with a longer list. Nouns and verbs are open sets; no list
 *  of them is ever finished.
 *
 *  But he DID mark the shape, in grammar. «زبائني» is MINE. «تلفوناتهم»
 *  and «عناوينهم» are THEIRS — and the «هم» points back at the clients he
 *  just named. A run whose later members BELONG TO the first member is an
 *  entity and its attributes, and that is what a table is. The agreement
 *  says it; no verb and no container are needed to hear it.
 *
 *  This is the last path tried, so it can only add readings the other two
 *  refused. It stays strict for that reason: three items at least, every
 *  one a definite name, and at least one of the later ones carrying the
 *  third-person pronoun that does the pointing.
 */
const BELONGS_TO_THE_FIRST = /[ء-ي](?:ه|ها|هم|هن)$/u;
const BELONGS_TO_HIM = /[ء-ي](?:ي|نا)$/u;

//  A TEST ON THE LAST LETTERS, RUN ON TEXT THAT CARRIES DIACRITICS.
//
//  «زُرْقَمُونِي» ends in «ي», but a kasra sits between it and the letter
//  before it, and a kasra is not an Arabic LETTER. The possessive
//  test looked for a letter followed by «ي», found none, and the
//  scan walked straight past his own word and landed on «بدي» — the
//  verb he asked with — handing it back as a column.
//
//  Every test below reads a folded copy for that reason, and returns
//  the word as he wrote it, diacritics and all.
const owned = (word: string) => BELONGS_TO_HIM.test(stripArabicDiacritics(word));
const ownedByTheFirst = (word: string) => BELONGS_TO_THE_FIRST.test(stripArabicDiacritics(word));
const definiteWord = (word: string) => /^ال[ء-ي]/u.test(stripArabicDiacritics(word));

function theNameHeEndedOn(phrase: string): string | null {
    //  The run begins at the last real name in the opening fragment —
    //  «بدي برنامج يحفظ لي زبائني» begins at «زبائني». Reading forward
    //  would stop at «بدي», which ends in «ي» and looks owned but is the
    //  verb he asked with.
    const words = String(phrase || '').trim().split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        if (ARABIC_FUNCTION_WORD.test(w)) continue;
        if (definiteWord(w) || owned(w) || ownedByTheFirst(w)) return w;
    }
    return null;
}

function entityAndItsAttributes(request: string): DerivedField[] | null {
    const sentence = String(request || '').split(/[.؟!\n]/)[0] || '';
    const raw = sentence
        .split(/\s*[،,]\s*|\s+و(?=\S)|\s+and\s+|\s+&\s+/iu)
        .map(part => part.trim())
        .filter(part => part.length >= 2 && part.length <= 32);
    //  Two conditions stood here and neither could ever decide: a length
    //  test the run test already made, and a definiteness test that
    //  columnsEndWhereHisNextRequestBegins had already applied to every
    //  item it returned. Mutations killed nothing through either, which
    //  is what a condition that cannot fail looks like from outside.
    const head = theNameHeEndedOn(raw[0]);
    if (!head) return null;
    const run = columnsEndWhereHisNextRequestBegins([head, ...raw.slice(1)]);
    if (run.length < 3) return null;
    const pointing = run.slice(1).filter(part => ownedByTheFirst(part.split(/\s+/).pop() || ''));
    if (!pointing.length) return null;
    //  A third condition stood here — that no item is a container word —
    //  and it could not fire either: a container word anywhere in the
    //  request sends the sentence down the branch before this one, so
    //  by the time grammar is reading, there is none left to find.
    const built = fieldsFromLabels(run);
    return built ? applyStatedRules(built, statedRules(request)).fields : built;
}

/**
 *  WHAT HE ASKED FOR BEYOND THE COLUMNS, AND NOBODY WROTE DOWN.
 *
 *  columnsEndWhereHisNextRequestBegins cuts the run at the first clause
 *  that is not a column, and everything after the cut is thrown away.
 *  Measured, that is where his other requests live:
 *
 *      «…، مع بحث بالاسم وترتيب بالدرجة»     → search · SORT
 *      «…، وصفحة ثانية تعرض مجموع الرواتب»    → total · A SECOND PAGE
 *      «…، مع سلة مشتريات»                    → A CART
 *      «…، ويحفظ البيانات على خادم»           → A SERVER
 *
 *  The criteria catalogue knows «بحث» and «مجموع» and produces a criterion
 *  for each. It does not know a sort, a second page, a cart or a server,
 *  and for those it produces NOTHING — so Joe can report success without
 *  ever having looked. A criterion that fails is a fact; a criterion that
 *  was never written is a silence, and silence is what he is owed least.
 *
 *  This returns his own clauses so the report can name them. It invents no
 *  vocabulary: a clause is anything the column reader already refused, and
 *  the refusal is the same closed-class test used everywhere else.
 */
export function clausesBeyondTheColumns(requestRaw: string): string[] {
    const request = String(requestRaw || '');
    const out: string[] = [];
    for (const sentence of request.split(/[.؟!\n]/)) {
        const parts = sentence
            .split(/\s*[،,]\s*|\s+و(?=\S)|\s+and\s+|\s+&\s+/iu)
            .map(part => part.trim())
            .filter(part => part.length >= 2 && part.length <= 64);
        //  The first fragment carries the request itself — «بدي جدول
        //  للموظفين فيه الاسم» — and is never one of his extra asks.
        for (let i = 1; i < parts.length; i++) {
            if (isAColumnAndNotAClause(parts[i], i)) continue;
            const clause = parts[i].replace(/^(?:و|مع|with|plus|and)\s*/iu, '').trim();
            if (clause.length >= 4 && !out.includes(clause)) out.push(clause);
        }
    }
    return out;
}

/**
 *  A WORD THIS FILE ALREADY KNOWS AS AN INTRODUCER MAY NOT OPEN A LIST.
 *
 *  Measured, four phrasings of one request:
 *
 *      «Build an expenses app. Columns: date, amount, category and note»
 *          → date · amount · category · note
 *      «Build an expenses app. The fields are date, amount, …»
 *          → date · amount · category · note
 *      «Build a small expenses app. Include date, amount, category and note.»
 *          → NOTHING
 *      «Build an expenses app with date, amount, category and note.»
 *          → NOTHING
 *
 *  «include» and «with» are already in this file's introducer set —
 *  firstColumnBeginsAtTheName strips them off the first column every
 *  day. They were known as words that HAND OVER to a list and not as
 *  words that OPEN one, so the same sentence read two ways depending
 *  on whether a container noun happened to stand nearby.
 *
 *  THE ONE CASE THIS MUST NOT SWALLOW, and how it is told apart:
 *
 *      «Build a small portfolio site with a home page, a projects page
 *       and a contact form.»
 *
 *  Same word, same shape — and every item begins with an ARTICLE. A
 *  column he names is «date», «amount», «note»; a thing he asks to be
 *  built is «a home page», «a contact form». English marks the
 *  difference with a closed class of three words, and that is the
 *  whole test: no catalogue of page names, no list of field names.
 */
const ENGLISH_INTRODUCES_A_LIST = /(?:^|[.!?]\s+|[\s,;:(])(?:include(?:s|d)?|containing|consisting\s+of|made\s+up\s+of|with)(?=\s)/iu;
const OPENS_WITH_AN_ARTICLE = /^(?:a|an|the)\s+/iu;

function theListAnIntroducerHandedOver(request: string): DerivedField[] | null {
    for (const sentence of String(request || '').split(/[.؟!\n]/)) {
        const at = ENGLISH_INTRODUCES_A_LIST.exec(sentence);
        if (!at) continue;
        const tail = sentence.slice((at.index || 0) + at[0].length);
        const items = tail
            .split(/\s*[,，]\s*|\s+and\s+|\s+&\s+/iu)
            .map(part => part.trim())
            .filter(part => part.length >= 2 && part.length <= 32);
        //  No floor here: the run check below is the same floor, and
        //  columnsEndWhereHisNextRequestBegins never grows a list. A
        //  mutation proved this one could never decide anything — with it
        //  lowered to two, all four two-item sentences read identically.
        //  An article means he is asking for the THING, not naming a
        //  column of one.
        if (items.some(part => OPENS_WITH_AN_ARTICLE.test(part))) continue;
        const run = columnsEndWhereHisNextRequestBegins(items);
        if (run.length < 3) continue;
        const named = run.filter(isAName).filter(notAContainerItself);
        if (named.length !== run.length) continue;
        const built = fieldsFromLabels(named);
        if (built) return applyStatedRules(built, statedRules(request)).fields;
    }
    return null;
}

/**
 *  HIS WORDS, WITHOUT THE BLOCK JOE STAPLED TO THEM.
 *
 *  Read out of a real build's own record on his machine:
 *
 *      sourceRequest: 'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ
 *        AUTHORITATIVE REQUIREMENTS EVIDENCE (…): بدي جدول للفواتير فيه
 *        رقم الفاتورة والمبلغ والتاريخ'
 *
 *  His sentence, Joe's paperwork, and his sentence AGAIN. Reading it
 *  gives his columns twice, and the live edit round proved it:
 *
 *      from the record   رقم الفاتورة · المبلغ · المبلغ · التاريخ
 *      from his words    رقم الفاتورة · المبلغ · التاريخ
 *
 *  He asked for one new column and got a duplicated one for free.
 *
 *  The cut lives HERE, at the reader every other reader goes through,
 *  rather than at each writer — because the record is already written
 *  on his disk in every app built so far, and a fix at the writer
 *  heals none of them.
 *
 *  The guard on the guard is unchanged: hisWordsOnly also cuts at a
 *  blank line, which is Joe's mark only when Joe put it there, so the
 *  cut runs only when one of Joe's OWN marks is present.
 */
const JOES_OWN_MARK = /^[ \t]*-{3,}[ \t]+\S|\b[A-Z][A-Z0-9]{2,}(?:\s+[A-Z][A-Z0-9]{2,}){2,}\b/mu;

export function hisSentence(request: string): string {
    const raw = String(request || '');
    if (!JOES_OWN_MARK.test(raw)) return raw;
    const his = hisWordsOnly(raw);
    return his.length >= 4 ? his : raw;
}

export function derivedColumns(requestRaw: string): DerivedField[] | null {
    requestRaw = hisSentence(requestRaw);
    const request = String(requestRaw || '');
    /**
     * A LIST OF COLUMNS IS INTRODUCED BY THE ACT OF RECORDING.
     *
     * A bare colon is not enough, and reading it as one broke a real case:
     * «متجر بفئات: قهوة، أدوات، حلويات» enumerates the VALUES of one field, and
     * this reader turned them into five columns and threw away the shop's own
     * schema. «بفئات» is not the signal either — naming that one word would be
     * the memorised-prompt disease again.
     *
     * What separates the two is who the list belongs to: columns follow the
     * verb of recording — «أسجل فيه …:», «record students:», «فيها الحقول:».
     * Values follow a field. So the enumeration is only read when a recording
     * phrase stands in front of it.
     */
    /**
     *  A VERB STANDS ALONE. A NOUN NEEDS TO BE INTRODUCED.
     *
     *  Manus attacked this and was right. The canonical WeatherGo prompt
     *  contains «a visible city search FIELD with a Search button», and the
     *  bare `field` opener turned the UI requirements that followed into
     *  seven columns of a user record:
     *
     *      with a Search button · Enter-key submission · reject empty input
     *      show loading state · and show clear invalid-city ·
     *      network-failure · and API-error states
     *
     *  Seven columns nobody asked for, and worse: the false schema made the
     *  app look `generic`, so the weather blueprint never got to run.
     *
     *  This is the law of «فخّ العربية» in English clothes — a bare noun
     *  matched without context. «أسجل» and `record` are VERBS: a man who
     *  writes one is doing the recording, and the list follows. «الحقول»,
     *  `columns` and `fields` are NOUNS: they name the thing rather than
     *  do it, and a noun means a declaration only when it is introduced —
     *  by a colon, or by «هي»/`are`/`include`.
     */
    /**
     *  A VERB WAS LEARNED IN ONE PERSON.
     *
     *  He can write the verb about himself — «بدي جدول أتابع فيه الطلبات
     *  والمبلغ والتاريخ» — or about the thing he is asking for — «بدي
     *  برنامج يتابع الطلبات والمبلغ والتاريخ». Same verb, same request,
     *  same three columns. Measured, the first gave three columns and the
     *  second gave none: the list held «أتابع» and «اتابع» and stopped.
     *
     *  This is not new vocabulary and must not become any. Arabic builds
     *  the imperfect by putting a person on the front of a stem — أ for
     *  «I», ي for «he», ت for «she», ن for «we» — so the stems already on
     *  the list are conjugated here instead of being written out four
     *  times each and drifting apart the first time one of them is edited.
     *
     *  «يسجل» hid this for a while by accident: it contains «سجل», which
     *  is a container NOUN, so it matched RECORD_CONTAINER and took the
     *  other branch. «يتابع» and «يدير» contain no such noun and returned
     *  nothing at all.
     */
    const RECORDING_VERB = new RegExp(
        '(?:^|[\\s،:؛(])(?:' + CONJUGATED + '|فيها|فيه|[تي]حتوي على|record|track|log(?!\\s+of\\b)|manage|organi[sz]e)(?=$|[\\s،:؛)])',
        'iu',
    );
    const DECLARED_LIST = /(?:^|[\s،:؛(])(?:الحقول|الأعمدة|الاعمدة)(?=$|[\s،:؛)])\s*(?::|：|هي|include(?:s)?\b)|(?:^|[\s,;:(])(?:\bcolumns?\b|\bfields?\b)(?=$|[\s,;:)])\s*(?::|：|are\b|include(?:s)?\b)/iu;
    const opener = RECORDING_VERB.exec(request) || DECLARED_LIST.exec(request);
    /**
     *  NO TAUGHT WORD STOOD IN FRONT OF IT — SO READ ITS SHAPE.
     *
     *  The container has to be there («جدول», «قائمة», «table», «list»):
     *  a run of definite nouns in a sentence about nothing in particular is
     *  prose, not a schema. With a container in front and every item a
     *  definite name, the run IS the columns, whatever word introduced it —
     *  or no word at all, just a colon.
     */
    if (!opener) {
        const holder = RECORD_CONTAINER.exec(request);
        if (!holder) {
            //  ORDER IS THE WHOLE ARGUMENT HERE.
            //
            //  This first sat above the container check and beat it — six
            //  suites went red at once, because «A clients table with name,
            //  phone and address» has both a container AND an introducer,
            //  and the container reader is the one that knows what «table»
            //  means. An introducer is what you reach for when nothing
            //  better answered, so it runs where nothing better did.
            const handed = theListAnIntroducerHandedOver(request);
            if (handed) return handed;
            //  And grammar last of all.
            return entityAndItsAttributes(request);
        }
        const tail = request.slice((holder.index || 0) + holder[0].length);
        const colonAt = Math.max(tail.indexOf(':'), tail.indexOf('：'));
        const scope = (colonAt >= 0 ? tail.slice(colonAt + 1) : tail).split(/[.؟!\n]/)[0] || '';
        let items = scope
            .split(/\s*[،,]\s*|\s+و(?=\S)|\s+and\s+|\s+&\s+/iu)
            .map(p => p.trim().replace(/^and\s+/iu, '').replace(/^[:：]\s*/u, '').trim())
            .filter(p => p.length >= 2 && p.length <= 32);
        //  The first item carries whatever stood between the container and the
        //  list — «جدول للمصاريف يحوي التاريخ» hands back «للمصاريف يحوي
        //  التاريخ» as one item. The name begins at the first word that opens
        //  with «ال»; everything before it is the sentence, not the column.
        //  A colon has already cut the container away, so what is left is
        //  his own label — «للفواتير: رقم الفاتورة» leaves «رقم الفاتورة»,
        //  and cutting to the article there would hand him «الفاتورة» and
        //  throw away «رقم». Only an uncut residue is the container's own.
        if (items.length) items[0] = firstColumnBeginsAtTheName(items[0], colonAt < 0);
        //  The same job in English, where there is no «ال» to find. What
        //  stands between the container and the list is a preposition — a
        //  closed class of function words, not a catalogue of nouns — and
        //  «with name» is the sentence plus the column, not a column
        //  called «with name».
        //  DROP THE RULE, KEEP THE LIST — in that order.
        //
        //  Caught by a live round, not by a test: «…: التاريخ والمبلغ والسبب،
        //  والمبلغ لا يقبل صفر» has three names and one rule, and asking
        //  «is EVERY item a name?» threw all four away. Joe then built a
        //  memorised expense template — Item, Amount, Category, Date, Note —
        //  and none of the three columns he actually wrote.
        //
        //  The rule is removed first; what remains must then be a list of
        //  definite names, which is what keeps «قهوة، أدوات، حلويات» out.
        //  The list ends where his next request begins — same table.
        items = columnsEndWhereHisNextRequestBegins(items);
        const names = items.filter(isAName).filter(notAContainerItself);
        /**
         *  TWO NAMED COLUMNS ARE A TABLE WHEN HE NAMED THE TABLE.
         *
         *  Live round, and the whole shape of the failure:
         *
         *      «بدي جدول للكتب فيه العنوان والسعر»
         *      → derivedColumns: 0 columns
         *      → template classification: page=generic · app=none
         *      → «I don't know this app type and have no ready engine»
         *      → Navbar · Hero · Features · Steps · FAQ · Contact
         *
         *  He named a container and two columns and received a brochure.
         *  The threshold was three, and three is the right floor for a bare
         *  run of nouns in prose — «الرياض، جدة، الدمام» must not become a
         *  schema. But he did not write a bare run: he wrote «جدول» first.
         *
         *  With a container named, the ambiguity that the third item was
         *  guarding against is gone, and two definite names are a table. One
         *  is still refused: a single noun after «جدول» is its subject, not
         *  its column — «جدول المبيعات» names no columns at all.
         */
        /**
         *  A LIST HOLDS VALUES. A TABLE HOLDS COLUMNS.
         *
         *  In Arabic the items answer this themselves by being definite or
         *  not. English has no such mark, so the container answers: «a
         *  shopping list with milk, bread and eggs» names three things it
         *  holds, and «a clients table with name, phone and address» names
         *  three attributes of each thing it holds. Reading the first as a
         *  schema would give him a two-row app about milk.
         */
        const holdsColumns = !/^(?:list|قائمة)$/iu.test(holder[1] || '');
        const floor = holder ? 2 : 3;
        if (names.length < floor || names.length > 10) return null;
        //  Latin items carry no definiteness of their own, so the container
        //  they hang from decides — and a bare «list» decides no.
        if (names.some(n => !/[؀-ۿ]/u.test(n)) && !holdsColumns) return null;
        if (!everyItemIsADefiniteName(names)) return null;
        //  THE LINK THAT WAS NEVER JOINED.
        //
        //  statedBound reads the condition. DerivedField carries a bound.
        //  react-app-templates emits «min» and «minExclusive» into the
        //  schema. The generated app validates against them and even
        //  says «أكبر من N» in its own error. Four parts of one chain,
        //  built, and this link never joined — so «والسعر لا يقبل صفر»
        //  reached a field with no min and zero was accepted.
        const built = fieldsFromLabels(names);
        return built ? applyStatedRules(built, statedRules(request)).fields : built;
    }
    let after = request.slice((opener.index || 0) + opener[0].length);
    //  A colon further along is the real start of the list: «أسجل فيه المواعيد:
    //  اسم المريض و…» — the noun before it is the subject, not a column.
    const colon = after.indexOf(':') >= 0 ? after.indexOf(':') : after.indexOf('：');
    if (colon >= 0 && colon <= 40) after = after.slice(colon + 1);
    const sentence = after.split(/[.؟!\n]/)[0] || '';
    let parts = sentence
        //  Lists are joined differently in each language: «و» is a prefix on the
        //  next word, «and» is a word of its own. A reader that knows only one of
        //  them reads only one language's requests.
        .split(/\s*[،,]\s*|\s+و(?=\S)|\s+and\s+|\s+&\s+/iu)
        .map(p => p.trim()
            .replace(/^and\s+/iu, '')
            .replace(/^(?:ال)?كل\s+/u, '')
            .replace(/^[:：]\s*/u, '').trim())
        .filter(p => p.length >= 2 && p.length <= 32);
    //  The lesson the container branch learned, applied here too: after
    //  «اسجل» the connector «فيه» is still standing, and it became a column.
    if (parts.length) parts[0] = firstColumnBeginsAtTheName(parts[0], false);
    /**
     *  THE SAME FLOOR, A THIRD TIME — AND THIS IS THE ONE THAT RAN.
     *
     *  «بدي جدول للكتب فيه العنوان والسعر» never reached the shape path at
     *  all: «فيه» is itself a recording opener, so this branch handled it,
     *  and its own floor of three refused two columns. Two copies of the
     *  rule were raised and the third — the one actually taken — was not.
     *
     *  Same reasoning as the others: he named a container, so two definite
     *  names are his table. One is a subject, not a column.
     */
    //  The list ends where his next request begins.
    parts = columnsEndWhereHisNextRequestBegins(parts);
    /**
     *  «فيه» POINTS AT WHATEVER HE NAMED, AND THAT NEED NOT HOLD RECORDS.
     *
     *  I lowered this floor to two whenever «فيه» or «فيها» appeared,
     *  reasoning that the pronoun points back at a container he named.
     *  It does — but at whatever he named, and «صفحة» is a page:
     *
     *      «اعمل صفحة فيها: الاسم والسعر»            must be null
     *      «بدي صفحة فيها الحقول زغرودة والزر إرسال»  must be null
     *
     *  Two tests older than that change say so in words — «two is not a
     *  list» — and I contradicted a stated rule without having read it.
     *  The floor of three is the guard against a run of two nouns in
     *  prose becoming a schema, and a pronoun aimed at a page does not
     *  remove that ambiguity. It stands.
     *
     *  The cost is stated rather than hidden: «بدي تطبيق للحجوزات فيه
     *  اسم العميل ووقت الحجز» names two columns and is refused. That is
     *  the deliberate limit, not a defect of this line.
     */
    const namesFloor = RECORD_CONTAINER.test(request) ? 2 : 3;
    if (parts.length < namesFloor || parts.length > 10) return null;
    //  A rule that rode in on the end of the list is not a column.
    const named = parts.filter(isAName).filter(notAContainerItself);
    if (named.length < namesFloor) return null;
    //  THE LINK THAT WAS NEVER JOINED.
    //
    //  statedBound reads the condition. DerivedField carries a bound.
    //  react-app-templates emits «min» and «minExclusive» into the
    //  schema. The generated app validates against them and even
    //  says «أكبر من N» in its own error. Four parts of one chain,
    //  built, and this link never joined — so «والسعر لا يقبل صفر»
    //  reached a field with no min and zero was accepted.
    const built = fieldsFromLabels(named);
    return built ? applyStatedRules(built, statedRules(request)).fields : built;
}

/** Turn the labels he wrote into fields, once, for every path that finds them. */
function fieldsFromLabels(parts: string[]): DerivedField[] | null {
    const seen = new Map<DerivedRole, number>();
    const out: DerivedField[] = [];
    for (const label of parts) {
        let role: DerivedRole = 'text';
        let type: FieldType = 'text';
        for (const [mark, r, t] of TYPE_MARKS) {
            if (mark.test(label)) { role = r; type = t; break; }
        }
        const n = (seen.get(role) || 0) + 1;
        seen.set(role, n);
        //  The answers are written in the language of his own label, so an
        //  Arabic column offers «نعم/لا» and an English one Yes/No.
        const options = role === 'flag'
            ? (/[\u0600-\u06FF]/.test(label) ? ['نعم', 'لا'] : ['Yes', 'No'])
            : undefined;
        out.push({ label, key: `${role}${n}`, type, role, options });
    }
    //  THE SAME FLOOR, WRITTEN TWICE — AND ONE COPY WAS NOT MOVED.
    //
    //  The caller was raised to two when he names the container, and this
    //  still refused two, so «بدي جدول للكتب فيه العنوان والسعر» kept
    //  coming back empty and kept becoming a brochure. A rule written in
    //  two places is a rule that will be changed in one.
    //
    //  Two is the floor here: one label is a subject, not a table.
    return out.length >= 2 ? out : null;
}

/**
 * A COLUMN HE ASKS TO ADD, AND ONE HE ASKS TO DROP.
 *
 * «ضيف عمود الخصم» is not a new table and not a new app: it is one column,
 * named, on the table already in front of him. Reading it needs no vocabulary
 * of columns — the ADD VERB introduces the noun, and the noun introduces the
 * name, which is the same grammar that lets «الحقول: …» declare a list while a
 * bare «field» does not.
 *
 * What it must never do is guess. If he names nothing after the noun, nothing
 * is added and the edit says so rather than inventing a column called «عمود».
 */
export interface ColumnEdit { add: string[]; remove: string[] }

const ADD_COLUMN = /(?:ضيف|أضف|اضف|اضافة|إضافة|زيد|حط|\badd\b)\s+(?:a|an|the)?\s*(?:عمود|العمود|خانة|الخانة|حقل|الحقل|column|field)\s+(?:اسمه\s+|باسم\s+|called\s+|named\s+|for\s+|the\s+)?([^\n،,.؛;]{2,32})/iu;
const DROP_COLUMN = /(?:شيل|احذف|أحذف|امسح|الغِ?ي?|ألغِ|\bremove\b|\bdrop\b|\bdelete\b)\s+(?:a|an|the)?\s*(?:عمود|العمود|خانة|الخانة|حقل|الحقل|column|field)\s+(?:the\s+)?([^\n،,.؛;]{2,32})/iu;

/** The one-column changes a follow-up message asks for, in his own words. */
export function columnEdit(requestRaw: string): ColumnEdit {
    const request = String(requestRaw || '');
    const clean = (s: string): string => s.trim().replace(/^(?:ال)?(?=.{3,})/u, m => m).trim();
    const add = ADD_COLUMN.exec(request);
    const drop = DROP_COLUMN.exec(request);
    return {
        add: add && add[1].trim().length >= 2 ? [clean(add[1])] : [],
        remove: drop && drop[1].trim().length >= 2 ? [clean(drop[1])] : [],
    };
}

/** Apply those changes to a set of fields, keeping every other column as it is. */
export function applyColumnEdit(fields: AppField[], edit: ColumnEdit, isAr: boolean): AppField[] {
    let out = fields.slice();
    for (const name of edit.remove) {
        out = out.filter(f => f.label.trim() !== name && !f.label.includes(name));
    }
    for (const name of edit.add) {
        if (out.some(f => f.label.trim() === name)) continue;
        const derived = derivedColumns(`أسجل فيه: ${name} و${name} و${name}`)?.[0];
        out.push({
            key: `${derived?.role || 'text'}${out.length + 1}`,
            label: name,
            type: derived?.type || 'text',
            ...(derived?.options ? { options: derived.options } : {}),
        });
    }
    //  A table with no columns left is not an edit, it is a deletion he did not
    //  ask for. The original stands.
    return out.length ? out : fields;
}


export function fieldsFromRequest(requestRaw: string, isAr: boolean): AppField[] | null {
    const cols = derivedColumns(requestRaw);
    if (!cols) return null;
    /**
     *  A COPY THAT LISTS WHAT IT KEEPS LOSES WHAT IT DOES NOT KNOW.
     *
     *  Live round on his machine. He wrote «…والسعر لا يقبل صفر», and the
     *  generated schema came out as:
     *
     *      { key: 'money1', label: 'السعر', type: 'number', required: true }
     *
     *  with no bound, so zero was accepted — the exact thing he forbade.
     *  And every part of the chain was already correct: derivedColumns
     *  attaches min and minExclusive, the template emits them, and the
     *  generated app validates against them and even prints «أكبر من N».
     *
     *  The loss is HERE, in one line. This does not copy a field; it
     *  REBUILDS one from a fixed tuple of five things it happens to know
     *  about. Anything the column carries that is not on that list falls
     *  on the floor silently — no error, no warning, and a unit test on
     *  either side of it passes.
     *
     *  So what the tuple cannot express is carried over explicitly. The
     *  next property added to a column will be lost the same way, which is
     *  why this comment names the shape rather than the symptom.
     */
    return cols.map((c, i) => ({
        ...f(
            [c.key, c.label, c.label, c.type, c.options,
                i === 0 ? ['required', 'primary'] : (c.role === 'money' || c.role === 'count' ? ['required'] : undefined)],
            isAr,
        ),
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.minExclusive ? { minExclusive: true } : {}),
    }));
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
            // Remove only the list marker. Digits are meaningful feature
            // content (`7-day`, `24-hour`) and must never be stripped.
            .replace(/^(?:[-•*–—]\s+|\d+[.)]\s+)/, '')
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
    /**
     * A LIST UNDER «Features:» IS A LIST, BULLETS OR NOT.
     *
     * Measured in the field: the same twelve-feature spec, pasted once with
     * «- » and once without, produced a twelve-item gap list and then a
     * ONE-item gap list. The features had not changed; only the punctuation
     * had. Everything after a Features/المطلوب heading, one short item per
     * line, counts — that is how people actually paste a spec.
     */
    if (out.length < 3) {
        const head = request.match(/^[^\S\r\n]*(?:features?|requirements?|المطلوب|المميزات|الميزات)\s*:?[^\S\r\n]*$/im);
        if (head) {
            const after = request.slice((head.index || 0) + head[0].length).split(/\r?\n/);
            for (const line of after) {
                const t = line.trim();
                if (!t) continue;                       // blank lines separate, they do not end the list
                if (/[.!?؟]$/.test(t) || t.split(/\s+/).length > 7) break;   // prose again — the list is over
                push(t);
            }
        }
    }
    // «… with A, B and C» — the one-line form of the same list.
    // A one-line list is valid for short list-shaped requests only. A long
    // prose paragraph after "with" is not a feature list.
    const sentenceCount = (request.match(/[.!?؟]/g) || []).length;
    if (out.length < 3 && sentenceCount <= 2) {
        const m = request.match(/\b(?:with|including|features?:?)\s+([^.\n]{10,300})/i);
        if (m) {
            for (const part of m[1].split(/,| and | و /i)) {
                if (/^(?:requiring|using|including|from|without|ensuring|plus)\b/i.test(part.trim())) continue;
                push(part);
            }
        }
    }
    return out.slice(0, 30);
}

/** What each engine genuinely delivers, in the words a request would use. */
const ENGINE_COVERS: Record<AppEngine, RegExp> = {
    map: /map|navigation|direction|route|distance|place|location|geo|gps|خريطة|خرائط|مسار|ملاحة|موقع|مسافة/i,
    chat: /chat|messag|room|conversation|dm\b|inbox|محادث|رسائل|دردش|غرف/i,
    // Weather is deliberately conservative here. A bare word such as
    // «forecast» cannot prove a seven-day or hourly forecast; those compound
    // capabilities are checked by WEATHER_FEATURE_RULES against real source
    // evidence below.
    weather: /^(?:current\s+weather|temperature|feels\s+like|humidity|wind(?:\s+speed)?|weather\s+condition|sunrise|sunset|طقس(?:\s+الحالي)?|حرارة|رطوبة|رياح(?:\s+السرعة)?|شروق|غروب)$/i,
    social: /post|feed|timeline|like|comment|follow|profile|share|newsfeed|wall|منشور|منشورات|خيط|إعجاب|تعليق|متابع|ملف\s*شخصي|مشاركة/i,
    records: /list|record|crud|table|entry|entries|manage|track|inventory|booking|order|task|note|expense|customer|student|contact|report|search|filter|export|relation(ship)?s?|foreign\s*key|linked|belongs\s*to|قائمة|سجل|إدارة|تتبع|حجز|طلب|مهمة|ملاحظة|مصروف|عميل|طالب|تقرير|بحث|تصدير|علاقات?|ربط|جداول|مرتبط/i,
    productivity: /task|todo|to-do|note|notes|checklist|habit|routine|productivity|مهمة|مهام|ملاحظة|ملاحظات|قائمة|عادات|إنتاجية/i,
    finance: /finance|financial|budget|income|revenue|salary|earning|expense|spending|money|accounting|مالية|ميزانية|دخل|إيراد|راتب|مصاريف|إنفاق|مال|محاسبة/i,
    calculator: /calculator|calc|arithmetic|addition|subtraction|multiplication|division|decimal|percentage|percent|backspace|clear|sign\s*toggle|history|آلة\s*حاسبة|حاسبة|جمع|طرح|ضرب|قسمة|عشري|نسبة|حذف|مسح|إشارة|سجل\s*العمليات/i,
    // The shop covers the catalogue, the cart and the order — and deliberately
    // NOT payment gateways, shipping carriers or multi-vendor payouts, so a
    // «Shopify-like» request still gets an honest list of what was not built.
    shop: /product|catalog(ue)?|cart|checkout|order|price|pricing|stock|inventory|category|categories|search|storefront|shop|store|منتج|منتجات|كتالوج|سلة|طلب|طلبات|سعر|أسعار|مخزون|تصنيف|تصنيفات|بحث|متجر/i,
};

/** Cross-cutting things the BACKEND covers when one was built alongside. */
const BACKEND_COVERS = /login|sign\s*in|account|auth|password|database|db\b|api\b|rest\b|server|storage|persist|order|تسجيل\s*دخول|حساب|قاعدة\s*بيانات|خادم|واجهة\s*برمجية|طلبات/i;

/**
 * A compound weather capability is covered only by independent source evidence.
 * Matching the word «forecast» in a request is not evidence of hourly or daily
 * data, and matching «weather» is not evidence of search, persistence, units,
 * or negative states. The evidence is the generated production source, not the
 * template name or a prose claim.
 */
const WEATHER_FEATURE_RULES: Array<{ asked: RegExp; evidence: RegExp }> = [
    { asked: /7[-\s]?day[^.]{0,40}forecast|seven[-\s]?day[^.]{0,40}forecast|daily[^.]{0,40}forecast|forecast[^.]{0,40}7[-\s]?day|forecast[^.]{0,40}seven[-\s]?day/i, evidence: /daily\s*:\s*['\"`]|[?&]daily=|\.daily\b|dailyForecast|forecastDays|7[-\s]?day|seven[-\s]?day/i },
    { asked: /hourly[^.]{0,40}forecast|forecast[^.]{0,40}hourly|hourly\s+data/i, evidence: /hourly\s*:\s*['\"`]|hourlyForecast|hourlyData/i },
    // These prose forms are emitted by one-line product requirements. They are
    // proven by executable shapes, not by the words "search" or "weather" alone.
    { asked: /(?:clear\s+)?responsive\s+interface\s+for\s+searching\s+cities|searching\s+cities/i,
        evidence: /(?=[\s\S]*<form\b)(?=[\s\S]*<input\b)(?=[\s\S]*(?:onSubmit|onKey(?:Down|Press|Up)|handleSearch))(?=[\s\S]*(?:geocod|open-meteo|setCity|setWeatherData))/i },
    { asked: /viewing\s+weather\s+details|weather\s+details/i,
        evidence: /(?=[\s\S]*(?:current-weather|weather-details|renderCurrentWeather|currentWeather|row-meta|className=["']now["']))(?=[\s\S]*(?:temperature|temperature_2m|temp))(?=[\s\S]*(?:humidity|relative_humidity_2m))(?=[\s\S]*(?:wind(?:_speed| speed)|windSpeed))(?=[\s\S]*(?:weather_code|describe|description|feels[-\s]?like|apparent_temperature))/i },
    { asked: /search\s+by\s+city|city\s+search|بحث\s+(?:عن|بالـ?)?\s*المدن?/i, evidence: /geocoding-api\.open-meteo|searchCity|citySearch|search.*city/i },
    { asked: /current\s+temperature|\btemperature\b/i, evidence: /temperature_2m|currentWeather|currentTemperature|temperature/i },
    { asked: /\bhumidity\b/i, evidence: /relative_humidity_2m|humidity/i },
    { asked: /current\s+location|geolocation|موقع(?:ي|ك)?\s+الحالي/i, evidence: /navigator\.geolocation|currentLocation|getCurrentPosition/i },
    { asked: /favorite\s+cities|saved\s+cities|المدن\s+المفضلة/i, evidence: /favoriteCities|savedCities|favo[u]?rites?|toggleFavorite/i },
    { asked: /feels[-\s]+like/i, evidence: /apparent_temperature|feelsLike|feels-like/i },
    { asked: /wind\s+speed/i, evidence: /wind_speed|windSpeed/i },
    { asked: /weather\s+condition/i, evidence: /weather[-_]?code|weatherCondition|condition/i },
    { asked: /sunrise/i, evidence: /sunrise/i },
    { asked: /sunset/i, evidence: /sunset/i },
    { asked: /loading/i, evidence: /loading|isLoading|setLoading/i },
    { asked: /api\s+errors?|network\s+failures?|invalid\s+cities?|missing\s+api\s+configuration/i, evidence: /catch|error|failed|invalid|not\s+found|configuration/i },
    { asked: /celsius|fahrenheit|temperature\s+units?/i, evidence: /celsius|fahrenheit|temperatureUnit|unit|°[CF]/i },
    { asked: /12\/24[-\s]?hour|12[-\s]?hour|24[-\s]?hour|hour\s+format|time\s+format/i, evidence: /12|24|hour(?:12|24)?|timeFormat|hourFormat|use24Hour/i },
    { asked: /persist(?:s|ed|ence)?\s+(?:favorites|settings)|restore\s+(?:favorites|settings)|localStorage|full\s+reload/i, evidence: /localStorage|storage|persist|restore/i },
    { asked: /reject\s+empty\s+input|empty\s+input/i, evidence: /trim\(\)|empty|length|!.*(?:city|query|input)/i },
    { asked: /enter[-\s]?key\s+submission|enter\s+key|on\s+enter/i, evidence: /onKeyDown|onKeyPress|onKeyUp|Enter/i },
    { asked: /light\s+mode|dark\s+mode/i, evidence: /dark|light|theme/i },
    { asked: /responsive\s+mobile(?:[-\s]first)?\s+(?:ui|weather|experience)|mobile[-\s]first/i, evidence: /@media|responsive|mobile/i },
    { asked: /weather\s+icons?/i, evidence: /weather.*icon|icon.*weather|weather_code/i },
    { asked: /smooth\s+transitions?/i, evidence: /transition/i },
];

function weatherFeatureCovered(feature: string, evidence: string): boolean {
    const rule = WEATHER_FEATURE_RULES.find(r => r.asked.test(feature));
    if (rule) return !!evidence && rule.evidence.test(evidence);
    return ENGINE_COVERS.weather.test(feature);
}

/** Rule registries are capability contracts, not saved app bodies. */
const FEATURE_RULES_BY_ENGINE: Partial<Record<AppEngine, Array<{ asked: RegExp; evidence: RegExp }>>> = {
    weather: WEATHER_FEATURE_RULES,
};

function ruleDerivedFeatures(request: string, engine: AppEngine | null): string[] {
    const rules = engine ? FEATURE_RULES_BY_ENGINE[engine] : undefined;
    if (!rules) return [];
    const trimmedRequest = String(request || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '');
    const out: string[] = [];
    for (const rule of rules) {
        const match = trimmedRequest.match(rule.asked);
        const feature = match?.[0]?.trim();
        if (!feature || feature.length > 80 || out.some(existing => existing.toLowerCase() === feature.toLowerCase())) continue;
        out.push(feature);
    }
    return out;
}

/**
 * The features the delivery does NOT cover — named exactly as the user wrote
 * them. An empty list means everything asked for is in the build. `evidence`
 * is optional for callers that only want a conservative request-level check;
 * the React delivery path passes the generated source so compound features are
 * judged by implementation evidence rather than by a stock engine keyword.
 */
export function uncoveredFeatures(request: string, engine: AppEngine | null, hasBackend: boolean, evidence = ''): string[] {
    const extracted = requestedFeatures(request);
    // If extraction found no explicit list, inspect the full prose request via
    // the engine's rule registry. This preserves honesty without manufacturing
    // features from a long clause after "with".
    const asked = extracted.length ? extracted : ruleDerivedFeatures(request, engine);
    if (!asked.length) return [];
    const covers = engine ? ENGINE_COVERS[engine] : null;
    return asked.filter(f => {
        if (engine === 'weather' && weatherFeatureCovered(f, evidence)) return false;
        if (engine !== 'weather' && covers && covers.test(f)) return false;
        if (hasBackend && BACKEND_COVERS.test(f)) return false;
        return true;
    });
}
