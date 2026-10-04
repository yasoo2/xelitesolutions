/**
 * AN APPLICATION IS NOT A BROCHURE ظ¤ ┬س┘â┘à╪د ┘é┘╪ز ┘┘â ╪د┘┘╪╕╪د┘à ┘┘é╪╖ ┘ç┘ê ┘à╪╣╪▒╪╢ ╪╡┘ê╪▒ ┘ê┘â┘┘à╪د╪ز
 * ┘ê┘┘è╪│ ╪ز╪╖╪ذ┘è┘é╪د╪ز ╪ص┘é┘è┘é┘è╪ر┬╗.
 *
 * Asked for ┬س╪ز╪╖╪ذ┘è┘é ╪«╪▒╪د╪خ╪╖ ╪┤╪ذ┘è┘ç ╪ذ╪«╪▒╪د╪خ╪╖ ╪ش┘ê╪ش┘┬╗, Joe delivered a real Vite + React
 * project ظ¤ and inside it: Hero, Features, Steps, Cta, Faq, Contact, a
 * restaurant menu, a pricing table and two fabricated customers. No map. The
 * routing was fixed; the CONTENT never was. Measured, four different app
 * requests produced byte-identical component lists.
 *
 * The scope decides WHAT container to build (page / app / system). This file
 * decides WHAT THE APP DOES: which domain it belongs to, which engine can
 * really run it, what a record of it looks like, and which numbers matter.
 * Deterministic on purpose ظ¤ an application must come out of the request even
 * when the brain is unreachable, exactly like the scope does.
 *
 * Four engines, because four kinds of application cover the overwhelming
 * majority of what people ask for:
 *   map     ظ¤ a real Leaflet map: tiles, geolocation, place search, saved pins
 *   chat    ظ¤ rooms, messages, persistence, and a real server when one exists
 *   weather ظ¤ live forecasts from open-meteo (no key, no account)
 *   records ظ¤ the working shape of every management app: create, edit, delete,
 *             search, filter, totals, CSV ظ¤ driven by a per-domain schema
 */

//  The one folder of Arabic diacritics this repository owns. A second
//  copy of that character set would drift the first time one of them
//  learned a mark the other did not.
import { stripArabicDiacritics } from '../orchestrator/promptNormalizer';
import { saysWord, words, normalise } from '../language/arabic';
import { hisWordsOnly } from './page-head';
//  The reader that already knows which noun stands beside the container.
import { subjectAfterContainer } from './subject-phrase';

export type AppEngine = 'map' | 'chat' | 'weather' | 'records' | 'ledger' | 'social' | 'shop' | 'calculator' | 'productivity' | 'finance' | 'custom';

export type AppKind =
    | 'maps' | 'chat' | 'weather' | 'social' | 'store' | 'calculator' | 'productivity'
    | 'tasks' | 'notes' | 'expenses' | 'finance' | 'inventory' | 'booking'
    | 'pos' | 'crm' | 'lms' | 'contacts' | 'habits' | 'media' | 'generic' | 'custom';

/**
 * `image` is a real picture, not a text box with a URL in it: the app picks a
 * file, shrinks it in the browser, and stores the picture itself ظ¤ so a photo
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
    /**  A floor on the COUNT of characters ظ¤ ┬س┘ر ╪ث╪▒┘é╪د┘à┬╗. */
    minLength?: number;
    /** Shown in the compact row summary ظ¤ keeps the list readable. */
    primary?: boolean;
    /** Render an explicitly requested binary field as a switch, not a menu. */
    control?: 'toggle';
}

/** A number worth showing at the top of the app, computed from the rows. */
export interface AppMetric {
    label: string;
    kind: 'count' | 'sum' | 'sumProduct' | 'sumMargin' | 'avg' | 'countWhere' | 'todayCount' | 'todaySum' | 'topGroup' | 'progress';
    field?: string;
    field3?: string;
    field2?: string;
    equals?: string;
    /** For money-shaped metrics ظ¤ appended to the value. */
    unit?: string;
}

/**
 * THE CATEGORIES THE REQUEST DECLARED ظ¤ read, never invented.
 *
 * ┬س╪د╪ذ┘┘ ╪ز╪╖╪ذ┘è┘é ┘à╪╡╪د╪▒┘è┘ ╪ذ┘╪خ╪د╪ز: ╪╖╪╣╪د┘à╪î ┘à┘ê╪د╪╡┘╪د╪ز╪î ┘┘ê╪د╪ز┘è╪▒╪î ╪ز╪▒┘┘è┘ç┬╗ names the exact
 * select options the owner wants, and the engine used to answer with its own
 * five stock categories regardless ظ¤ the same ┬سtool never read the request┬╗
 * failure the fishing law exists to measure, this time on the DATA SHAPE
 * rather than the design.
 *
 * A shape of two languages, not a domain list: a categories noun
 * (┬س┘╪خ╪د╪ز/╪ز╪╡┘┘è┘╪د╪ز/╪ث┘é╪│╪د┘à┬╗, "categories/types"), a separator (┬س:┬╗ or ┬س┘ç┘è┬╗),
 * then the owner's own comma-or-┘ê separated words. Silence returns null and
 * the blueprint keeps its stock options byte-for-byte.
 */
export function readDeclaredOptions(requestRaw: string): string[] | null {
    const r = String(requestRaw || '').replace(/[┘ï-┘ْ┘]/g, '');
    const m = r.match(/(?:╪ذ|┘ê╪د┘|╪د┘)?(?:┘╪خ╪د╪ز|╪ز╪╡┘┘è┘╪د╪ز|╪ث┘é╪│╪د┘à|╪د┘é╪│╪د┘à|categories|types)\s*(?:┘ç┘è|are)?\s*[:ي╝أ]\s*([^.\n╪ا?!]{2,160})/i)
        || r.match(/(?:╪ذ┘╪خ╪د╪ز|╪ذ╪ز╪╡┘┘è┘╪د╪ز|╪ذ╪ث┘é╪│╪د┘à|╪ذ╪د┘é╪│╪د┘à|with\s+categories)\s+([^.\n╪ا?!:╪î]{2,160}(?:╪î[^.\n╪ا?!]{0,120})?)/i);
    if (!m) return null;
    /**
     * Arabic attaches its ┬س┘ê┬╗ to the next word, so ┬س┘à┘ê╪د╪» ╪ذ┘╪د╪ة ┘ê╪ث╪»┘ê╪د╪ز ┘ê╪│╪ذ╪د┘â╪ر┬╗
     * has no free-standing separator at all. When commas exist they rule ظ¤
     * a ┬س ┘ê┬╗ inside an item (┬س┘à┘ê╪د╪» ╪د┘╪ذ┘╪د╪ة ┘ê╪د┘╪╣╪▓┘╪î ╪ث╪»┘ê╪د╪ز┬╗) stays part of it ظ¤
     * and the comma swallows a following attached ┬س┘ê┬╗. With no commas, the
     * space+┬س┘ê┬╗ IS the list's separator; an item that truly starts with waw
     * writes it twice (┬س┘é┘ç┘ê╪ر ┘ê┘ê╪▒╪»┬╗) and keeps its own.
     */
    const raw = m[1];
    const parts = /[╪î,]/.test(raw)
        ? raw.split(/\s*[╪î,]\s*(?:┘ê(?=[╪ة-┘è]))?/)
        : raw.split(/\s+┘ê(?=[╪ة-┘è])|\s+(?:or|and)\s+/i);
    const list = parts
        .map(s => s.trim())
        .filter(s => s.length >= 2 && s.length <= 24 && !/^(╪د┘╪«|╪ح┘╪«|┘ê╪║┘è╪▒┘ç╪د|etc\.?)$/i.test(s));
    const unique = [...new Set(list)];
    return unique.length >= 2 && unique.length <= 8 ? unique : null;
}

/**
 * THE SAME CLAUSE, REMOVED ظ¤ for the readers it must never reach.
 *
 * ┬س╪ذ┘╪خ╪د╪ز: ╪╖╪╣╪د┘à╪î ┘à┘ê╪د╪╡┘╪د╪ز╪î ┘┘ê╪د╪ز┘è╪▒╪î ╪ز╪▒┘┘è┘ç┬╗ declares OPTIONS of one field, and
 * every other reader of the sentence heard it as something else, measured on
 * one live build: the entity readers turned the list into three TABLES
 * (mwaslats/invoices/trfyhs), the brand reader shipped ┬س┘à╪┤╪▒┘ê╪╣ ╪د┘╪د╪ز╪î┬╗ as the
 * project's name, and the scope classifier read the category word ┬س┘┘ê╪د╪ز┘è╪▒┬╗
 * as a billing SYSTEM. The categories belong to the category field alone;
 * everyone else reads the sentence without them.
 */
export function stripDeclaredOptions(requestRaw: string): string {
    const r = String(requestRaw || '');
    return r
        .replace(/(?:╪ذ|┘ê╪د┘|╪د┘)?(?:┘╪خ╪د╪ز|╪ز╪╡┘┘è┘╪د╪ز|╪ث┘é╪│╪د┘à|╪د┘é╪│╪د┘à|categories|types)\s*(?:┘ç┘è|are)?\s*[:ي╝أ]\s*[^.\n╪ا?!]{2,160}/gi, ' ')
        .replace(/(?:╪ذ┘╪خ╪د╪ز|╪ذ╪ز╪╡┘┘è┘╪د╪ز|╪ذ╪ث┘é╪│╪د┘à|╪ذ╪د┘é╪│╪د┘à|with\s+categories)\s+[^.\n╪ا?!:╪î]{2,160}(?:╪î[^.\n╪ا?!]{0,120})?/gi, ' ')
        // Preserve newlines: block schema declarations use them as boundaries.
        // Tidy within lines only. Collapsing every run of whitespace would
        // flatten structured schema declarations; line structure is data.
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * A SECOND TABLE, AND THE LINE BETWEEN THEM ظ¤ ┬س╪╣┘╪د┘é╪د╪ز ╪ذ┘è┘ ╪ث┘â╪س╪▒ ┘à┘ ╪ش╪»┘ê┘
 * (╪╖╪ذ┘è╪ذ ظ ┘à┘ê╪د╪╣┘è╪»┘ç)┬╗.
 *
 * Every system built so far owned exactly ONE table. That is enough for a
 * notes app and nowhere near enough for a real system: a clinic's appointment
 * belongs to a DOCTOR, an enrolment to a COURSE, an item to a SUPPLIER. With
 * one table the doctor's name is retyped on every appointment ظ¤ misspelt on
 * the third one, unsearchable by the fifth, and impossible to rename at all.
 *
 * So a blueprint may declare a PARENT: its own rows, its own fields, and a
 * foreign key on the child that points at it. The generated database creates
 * both tables, the API serves both collections plus ┬سthis parent's children┬╗,
 * and the interface picks the parent from a list instead of asking anyone to
 * type it again.
 */
export interface AppRelation {
    /** Collection name ظ¤ the table and the URL: 'providers', 'courses'. */
    resource: string;
    /** ┬س╪╖╪ذ┘è╪ذ┬╗ ظ¤ one of them. */
    one: string;
    /** ┬س╪د┘╪ث╪╖╪ذ╪د╪ة┬╗ ظ¤ the collection, as a heading. */
    many: string;
    /** The foreign-key column added to the CHILD row: 'provider_id'. */
    key: string;
    /** Which parent field names it wherever a child refers to its parent. */
    labelKey: string;
    /** The parent's own fields ظ¤ a real record, not a label. */
    fields: AppField[];
    /** What the picker says before any parent exists. */
    emptyHint: string;
}

export interface AppBlueprint {
    kind: AppKind;
    engine: AppEngine;
    /** The app's own name for what it manages ظ¤ ┬س╪د┘┘à┘ç╪د┘à┬╗, ┬س╪د┘╪ص╪ش┘ê╪▓╪د╪ز┬╗. */
    title: string;
    lede: string;
    entityOne: string;
    entityMany: string;
    fields: AppField[];
    /** The select field that drives the status filter and the done state. */
    statusField?: string;
    /** ┬س╪ح╪░╪د ┘â┘à┘è╪ر ┘é╪╖╪╣╪ر ╪╡╪د╪▒╪ز ╪ث┘é┘ ┘à┘ 3 ┘è╪╡┘è╪▒ ┘┘ê┘┘ç╪د ╪ث╪ص┘à╪▒┬╗ ظ¤ his rule, in his numbers. */
    lowStock?: { field: string; below: number };
    doneValue?: string;
    metrics: AppMetric[];
    /** Field keys explicitly named as filters in the request. */
    filterFields?: string[];
    /** The parent table this system's rows belong to, when it has one. */
    relation?: AppRelation;
    /** Extra npm dependencies this engine really needs. */
    deps: Record<string, string>;
    /** What the app says when it has no rows yet ظ¤ never fabricated rows. */
    emptyHint: string;
    /**
     * HE NAMED THE SHAPE, AND THE SHAPE WAS THE ONE THING NOT READ.
     *
     * ┬س╪د╪╣┘à┘ **╪ش╪»┘ê┘** ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒┬╗ ظ¤ the first word of
     * the request. Measured in the delivered app: `table count: 0, th count: 0`.
     * Rows came back as a stack of cards, and ┬س╪د╪│┘à ╪د┘╪╡┘┘┬╗ ظ¤ one of the three
     * columns he named ظ¤ had its LABEL dropped entirely, because the card
     * template filters the primary field out of the meta list and puts its
     * value in a bare heading.
     *
     * He cannot read down a column, compare prices, or find the column he
     * asked for. The engine had one presentation and the request's own word
     * for the presentation was never consulted ظ¤ the catalogue deciding what
     * the sentence already said.
     */
    asTable?: boolean;
    /** Keep the exact uploaded image bytes instead of producing a card-sized derivative. */
    preserveOriginalImages?: boolean;
}

/* ظ¤ظ¤ which domain the request belongs to ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ */

/** Ordered: the specific archetypes are tested before the broad ones. */
export const APP_KIND_SIGNALS: Array<[AppKind, RegExp]> = [
    /**
     *  ظؤ¤ ┬سNAVIGATION┬╗ ALONE USED TO BE HERE, AND IT COST A WHOLE REQUEST.
     *
     *  Measured live on the owner's machine. He asked for a page with ┬سa
     *  navigation menu that collapses into a hamburger button on a phone, a
     *  servings counter ظخ and a print button┬╗ and received `MapApp.jsx` ظ¤ 491
     *  lines of Leaflet, place search and saved pins. The three things he
     *  named appear in the built project exactly once: on the line of
     *  `content.js` that stores his request text.
     *
     *  `\bmaps?\b` is anchored. `\bgps\b` is anchored. `geo\s*app` demands
     *  context. **`navigation` was bare** ظ¤ and ┬سa navigation menu┬╗ is what
     *  every website on earth calls the row of links at the top of a page.
     *
     *  ظؤ¤ AND THE COST IS NOT SYMMETRIC, WHICH IS THE WHOLE ARGUMENT. A wrong
     *  map DISCARDS THE ENTIRE REQUEST and builds a different application. A
     *  missed map costs one word and the page is still built from his
     *  sentence. Where a signal is ambiguous the safe direction is ┬سnot this
     *  archetype┬╗, so navigation is admitted only with the context that makes
     *  it mean travel: an app, turn-by-turn, or GPS.
     *
     *  The file already knew this. Sixty lines below, the weather entry says a
     *  bare ┬سforecast┬╗ cannot prove a forecast and anchors itself whole-string.
     *  The lesson was learned once and not carried across.
     */
    ['maps', /╪«╪▒╪د╪خ╪╖|╪«╪▒┘è╪╖╪ر|╪«╪د╪▒╪╖╪ر|┘à┘ê╪د┘é╪╣\s*╪ش╪║╪▒╪د┘┘è|┘à┘╪د╪ص╪ر|╪ز╪ز╪ذ╪╣\s*(╪د┘┘à┘ê╪د┘é╪╣|╪د┘┘à┘ê┘é╪╣)|╪ش┘è\s*╪ذ┘è\s*╪د╪│|\bmaps?\b|\bgps\b|navigation\s*app|turn[-\s]?by[-\s]?turn|gps\s*navigation|driving\s*(?:navigation|directions)|geo\s*app/i],
    // Keep ┬س╪د┘╪ش┘ê┬╗ as a standalone weather noun.  An unbounded substring
    // match also matches ┬س╪د┘╪ش┘ê╪»╪ر┬╗, turning unrelated quality/form requests
    // into the weather engine.
    ['weather', /╪╖┘é╪│|(?<![\u0621-\u064A])╪د┘╪ش┘ê(?![\u0621-\u064A])|╪»╪▒╪ش╪د╪ز?\s*╪د┘╪ص╪▒╪د╪▒╪ر|╪ث╪ص┘ê╪د┘\s*╪ش┘ê┘è╪ر|weather|forecast|temperature app|open[- ]?meteo/i],
    // A calculator is a distinct interaction contract, not a records page.
    // Detect it before generic app/manage fallbacks so a request such as
    // "Build a calculator" never becomes Hero + Features + Contact.
    ['calculator', /╪ت┘╪ر\s*╪ص╪د╪│╪ذ╪ر|╪ص╪د╪│╪ذ╪ر|╪ص╪│╪د╪ذ╪د╪ز?\s*╪▒┘è╪د╪╢┘è╪ر|╪╣┘à┘┘è╪د╪ز\s*╪ص╪│╪د╪ذ┘è╪ر|calculator|calc\s*(app|pro)?|arithmetic|scientific\s*calculator/i],
    // An asset-review workspace is an application even when the user calls it
    // a board rather than an app. Missing this signal used to ship a marketing
    // page with testimonials and a contact form instead of an upload workflow.
    ['media', /(?:media|image|photo|asset)\s+(?:review|library|catalog(?:ue)?|collection)\s*(?:board|app|tool|workspace)?|(?:board|app|tool|workspace)\s+for\s+(?:reviewing|managing)\s+(?:media|images?|photos?|assets?)|┘┘ê╪ص╪ر\s+(?:┘à╪▒╪د╪ش╪╣╪ر|╪ح╪»╪د╪▒╪ر)\s+(?:╪د┘┘ê╪│╪د╪خ╪╖|╪د┘╪╡┘ê╪▒)|┘à┘â╪ز╪ذ╪ر\s+(?:┘ê╪│╪د╪خ╪╖|╪╡┘ê╪▒)/iu],
    // A social network CONTAINS messaging, so it is tested before chat:
    // ┬س┘à┘╪╡╪ر ╪ز┘ê╪د╪╡┘ ╪د╪ش╪ز┘à╪د╪╣┘è ظخ Messaging┬╗ is a feed with messages in it, not a
    // messenger. Measured from the field request that produced a chat app.
    ['social', /╪ز┘ê╪د╪╡┘\s*╪د╪ش╪ز┘à╪د╪╣┘è|╪┤╪ذ┘â╪ر\s*╪د╪ش╪ز┘à╪د╪╣┘è╪ر|┘à┘╪┤┘ê╪▒╪د╪ز|╪ز╪║╪▒┘è╪»|┘à╪ز╪د╪ذ╪╣┘è┘|social\s*(media|network|platform)|newsfeed|news\s*feed|timeline|posts?\s*and\s*(comments?|likes?)|followers?/i],
    ['chat', /┘à╪ص╪د╪»╪س|╪»╪▒╪»╪┤|╪┤╪د╪ز|╪▒╪│╪د╪خ┘\s*(┘┘ê╪▒┘è╪ر|┘╪╡┘è╪ر)?|┘à╪▒╪د╪│┘╪ر|\bchat\b|messaging|messenger|instant\s*messages/i],
    /**
     * A SHOP IS A SHOP, EVEN WHEN IT ASKS FOR EVERYTHING ELSE TOO.
     *
     * ┬سBuild a world-class e-commerce platform similar to Shopify ظخ Inventory
     * management ظخ Analytics┬╗ used to detect as `inventory`, because a store
     * manages stock and the inventory pattern was tested first. It produced a
     * stock-list CRUD: no products, no cart, nothing anyone could buy from.
     * The store is the SUBJECT; inventory is one of its features, so it is
     * tested before inventory and before point-of-sale.
     */
    /**
     * NARROW ON PURPOSE. ┬س┘à╪ز╪ش╪▒ ╪╣╪╖┘ê╪▒ ┘╪د╪«╪▒┬╗ is a BOUTIQUE'S WEBSITE ظ¤ a
     * presentation site with product cards, which the section builder already
     * does beautifully, and turning it into a shop application regressed nine
     * measured builds the moment a broad /┘à╪ز╪ش╪▒/ pattern landed here. What
     * makes it an application is the TRANSACTION: a cart, a checkout, an
     * online store, a marketplace, a platform ظ¤ said outright.
     */
    // Arabic carries case endings: ┬س┘à╪ز╪ش╪▒╪د┘ï ╪ح┘┘â╪ز╪▒┘ê┘┘è╪د┘ï┬╗ is ┬س┘à╪ز╪ش╪▒ ╪ح┘┘â╪ز╪▒┘ê┘┘è┬╗ to
    // any reader and to no naive regex ظ¤ the first live run of this engine
    // detected null on the user's own sentence for exactly that reason.
    ['store', /┘à╪ز╪ش╪▒\S{0,2}\s*(╪ح┘┘â╪ز╪▒┘ê┘|╪د┘┘â╪ز╪▒┘ê┘|╪ث┘ê┘┘╪د┘è┘|╪د┘ê┘┘╪د┘è┘|╪▒┘é┘à)|╪ز╪ش╪د╪▒[╪ر┘ç]\S{0,2}\s*(╪ح┘┘â╪ز╪▒┘ê┘|╪د┘┘â╪ز╪▒┘ê┘)|┘à┘╪╡┘ّ?[╪ر┘ç]\S{0,2}\s*(╪ز╪ش╪د╪▒|╪ذ┘è╪╣|╪ز╪│┘ê┘ّ?┘é)|┘╪╕╪د┘à\s*┘à╪ز╪ش╪▒|╪ز╪╖╪ذ┘è┘é\s*┘à╪ز╪ش╪▒|╪│┘┘ّ?[╪ر┘ç]\s*(╪د┘)?(┘à╪┤╪ز╪▒┘è╪د╪ز|╪┤╪▒╪د╪ة|╪ز╪│┘ê┘ّ?┘é)|╪╣╪▒╪ذ[╪ر┘ç]\s*(╪د┘)?╪ز╪│┘ê┘ّ?┘é|╪ذ┘ê╪د╪ذ[╪ر┘ç]\s*╪»┘╪╣|e-?commerce|ecommerce|marketplace|shopify|woocommerce|magento|storefront|(?:shopping|cart|payment|purchase|order)\s+checkout|checkout\s+(?:page|flow|cart|payment|purchase|order)|shopping\s*cart|online\s*(store|shop|selling|marketplace)/i],
    ['pos', /┘┘é╪د╪╖\s*╪ذ┘è╪╣|┘┘é╪╖╪ر\s*╪ذ┘è╪╣|┘â╪د╪┤┘è╪▒|┘â╪د╪┤┘è┘è╪▒|\bpos\b|point\s*of\s*sale|cash\s*register/i],
    ['booking', /╪ص╪ش┘ê╪▓╪د╪ز|╪ص╪ش╪▓|┘à┘ê╪د╪╣┘è╪»|┘à┘ê╪╣╪»|╪╣┘è╪د╪»|┘à╪▒╪╢┘ë|reservation|booking|appointment|clinic/i],
    ['inventory', /┘à╪«╪▓┘ê┘|╪ش╪▒╪»|┘à╪│╪ز┘ê╪»╪╣|╪ث╪╡┘╪د┘|╪د╪╡┘╪د┘|inventory|stock|warehouse/i],
    ['expenses', /┘à╪╡╪د╪▒┘è┘|┘à╪╡╪▒┘ê┘╪د╪ز|┘┘┘é╪د╪ز|expense|spending/i],
    // ┘┘ê╪ص╪د╪ز ╪د┘╪ح╪╡╪»╪د╪▒ ┘ê╪د┘╪ز╪┤╪║┘è┘ ┘┘è╪│╪ز ╪╡┘╪ص╪د╪ز ╪ز╪╣╪▒┘è┘┘è╪ر ╪ص╪ز┘ë ┘┘ê ┘┘à ╪ز┘é┘ ┬س╪ز╪╖╪ذ┘è┘é┬╗:
    // ┘à╪ج╪┤╪▒╪د╪ز + ╪ش╪»┘ê┘ + ╪ذ╪ص╪س/╪ز╪╡┘┘è╪ر/╪ز┘╪د╪╡┘è┘ ┘ç┘è ╪ح╪┤╪د╪▒╪ر ╪ذ╪▒┘╪د┘à╪ش ╪ح╪»╪د╪▒╪ر ┘à┘ç╪د┘à ╪╡╪▒┘è╪ص╪ر.
    // A QA instruction such as ┬س┘╪د ╪ز╪╣╪ز╪ذ╪▒ ╪د┘┘à┘ç┘à╪ر ┘à┘â╪ز┘à┘╪ر┬╗ is not a task app.
    // Bare ┬س┘à┘ç┘à╪ر┬╗ used to win classification over an explicit custom app and
    // send it to the records scaffold. Require an app-shaped task phrase;
    // generic completion language must stay in the user's requirements.
    ['tasks', /(?:╪ز╪╖╪ذ┘è┘é|╪ذ╪▒┘╪د┘à╪ش|┘╪╕╪د┘à|╪ح╪»╪د╪▒╪ر|┘é╪د╪خ┘à╪ر|╪ش╪»┘ê┘|┘┘ê╪ص╪ر|┘à╪▒┘â╪▓)\s*(?:╪د┘┘à┘ç╪د┘à|┘à┘ç╪د┘à|╪د┘┘à┘ç┘à╪د╪ز|┘à┘ç┘à╪د╪ز)|┘à┘ç┘à╪د╪ز|┘┘ê╪ص╪ر\s*(?:┘à┘ç╪د┘à|╪ح╪╡╪»╪د╪▒|╪د╪╡╪»╪د╪▒|╪ش╪د┘ç╪▓┘è╪ر)|┘à╪▒┘â╪▓\s*╪ش╪د┘ç╪▓┘è╪ر\s*(?:╪د┘╪ح╪╡╪»╪د╪▒|╪د┘╪د╪╡╪»╪د╪▒)|╪ش╪»┘ê┘\s*┘à┘ç╪د┘à|╪ذ╪╖╪د┘é╪د╪ز\s*┘à╪ج╪┤╪▒╪د╪ز|task\s*(?:app|manager|list|board)|release\s*(?:readiness|center|board)|kanban|to-?do|todo/i],
    ['notes', /┘à┘╪د╪ص╪╕╪د╪ز|┘à╪░┘â╪▒╪د╪ز|┘à┘┘â╪▒╪ر|┘à╪ص╪▒╪▒\s*┘╪╡┘ê╪╡|┘à╪ص╪▒╪▒\s*┘╪╡|notes?\s*app|notepad|note\s*taking|text\s*editor|markdown/i],
    ['lms', /┘à┘╪╡╪ر\s*╪ز╪╣┘┘è┘à|╪ز╪╣┘┘è┘à┘è╪ر|╪╖┘╪د╪ذ|╪╖╪د┘╪ذ|╪»┘ê╪▒╪د╪ز|┘à╪»╪▒╪│╪ر|╪ش╪د┘à╪╣╪ر|╪»╪▒╪ش╪د╪ز|\blms\b|courses?|students?|school|grade(book)?/i],
    ['crm', /╪╣┘à┘╪د╪ة|╪▓╪ذ╪د╪خ┘|╪╣┘╪د┘é╪د╪ز\s*╪د┘╪╣┘à┘╪د╪ة|╪╡┘┘é╪د╪ز|┘à╪ذ┘è╪╣╪د╪ز\s*┘à╪ز╪د╪ذ╪╣╪ر|\bcrm\b|leads?|pipeline|deals?/i],
    ['contacts', /╪ش┘ç╪د╪ز\s*╪د╪ز╪╡╪د┘|╪»┘╪ز╪▒\s*╪╣┘╪د┘ê┘è┘|╪ث╪▒┘é╪د┘à\s*╪د┘┘ç┘ê╪د╪ز┘|contacts?\s*(app|book)|address\s*book|phone\s*book/i],
    ['habits', /╪╣╪د╪»╪د╪ز|╪▒┘ê╪ز┘è┘|╪ز╪ز╪ذ╪╣\s*╪د┘╪╣╪د╪»╪د╪ز|habits?\s*(tracker|app)|routine\s*tracker/i],
];

/** The request asks for something to be MANAGED ظ¤ a records app, not a poster. */
const MANAGE_SIGNAL = /╪ح╪»╪د╪▒╪ر|╪د╪»╪د╪▒╪ر|╪ز╪ز╪ذ┘ّ╪╣|╪ز╪ز╪ذ╪╣|╪ز┘╪╕┘è┘à|╪ث╪▒╪┤┘╪ر|╪د╪▒╪┤┘╪ر|╪ز╪│╪ش┘è┘|┘à╪ز╪د╪ذ╪╣╪ر|╪│╪ش┘┘ّ|╪│╪ش┘\b|┘╪╕╪د┘à|manage(ment)?|tracker|tracking|organiz|registry|records?\b/i;
/** ظخand it is an application, not a document about one. */
const APP_SIGNAL = /╪ز╪╖╪ذ┘è┘é|╪ذ╪▒┘╪د┘à╪ش|┘╪╕╪د┘à|┘à┘╪╡┘ّ╪ر|┘à┘╪╡╪ر|╪ث╪»╪د╪ر|╪د╪»╪د╪ر|┘┘ê╪ص╪ر\s*╪ز╪ص┘â┘à|\bapp\b|application|system|platform|tool|dashboard/i;
/**
 * A booking system for a clinic calls its provider ┬س╪╖╪ذ┘è╪ذ┬╗ ظ¤ that is the user's
 * own example (┬س╪╖╪ذ┘è╪ذ ظ ┘à┘ê╪د╪╣┘è╪»┘ç┬╗). A salon's is ┬س┘à┘é╪»┘ّ┘à ╪د┘╪«╪»┘à╪ر┬╗. The relation is
 * the same shape either way; only the words change, and the words are what
 * make the system feel like it was built for this business.
 */
const CLINIC_SIGNAL = /╪╣┘è╪د╪»|╪╖╪ذ┘è╪ذ|╪ث╪╖╪ذ╪د╪ة|╪د╪╖╪ذ╪د╪ة|╪╖╪ذ┘ّ┘è|┘à╪▒╪╢┘ë|┘à╪▒┘è╪╢|╪ث╪│┘╪د┘|╪د╪│┘╪د┘|┘à╪│╪ز╪┤┘┘ë|clinic|doctor|dentist|patient|medical|hospital/i;
/** A page ABOUT something wins over the subject it describes. */
// ┘â┘┘à╪ر ┬س╪د┘╪╡┘╪ص╪ر┬╗ ┘ê╪ص╪»┘ç╪د ┘┘è╪│╪ز ┘┘è╪ر ╪╡┘╪ص╪ر ┘ç╪ذ┘ê╪╖: ╪ز╪╕┘ç╪▒ ┘â╪س┘è╪▒╪د┘ï ┘â╪ح╪ش╪▒╪د╪ة ╪ش┘ê╪»╪ر
// (┬س╪د┘╪ص╪╡ ╪د┘╪╡┘╪ص╪ر ╪ذ┘┘╪│┘â┬╗) ╪ذ╪╣╪» ╪╖┘╪ذ ╪ز╪╖╪ذ┘è┘é ┘â╪د┘à┘. ┘┘à┘╪╣ ╪د┘╪ز╪╖╪ذ┘è┘é ┘┘é╪╖ ╪╣┘╪» ╪ز╪│┘à┘è╪ر
// ┘à╪د╪»╪ر ╪ز┘é╪»┘è┘à┘è╪ر ╪╡╪▒┘è╪ص╪ر╪î ┘â┘è ┘╪د ╪ز┘╪║┘è ┘à╪▒╪ص┘╪ر ╪د┘╪ز╪»┘é┘è┘é ┘é╪د┘╪ذ ┘┘ê╪ص╪ر ┘à┘ç╪د┘à ╪ص┘é┘è┘é┘è╪د┘ï.
const PAGE_SIGNAL = /╪╡┘╪ص╪ر\s*(?:┘ç╪ذ┘ê╪╖|╪ز╪╣╪▒┘è┘(?:┘è╪ر)?|╪ز╪│┘ê┘è┘é┘è╪ر)|┘╪د┘╪»┘╪ش|╪ذ┘ê╪▒╪ز┘┘ê┘┘è┘ê|┘à╪╣╪▒╪╢\s*╪ث╪╣┘à╪د┘|╪│┘è╪▒╪ر\s*╪░╪د╪ز┘è╪ر|landing\s*page|portfolio|one\s*-?\s*pager|brochure/i;

/**
 * Masks bounded spans governed by a negation marker before intent detection.
 * The same rule is shared by page and application signals, so a phrase such
 * as "not a brochure" or "requiring no API key or account" cannot create a
 * false subject while an affirmative "brochure for my bakery" remains visible.
 */
/**
 *  ظؤ¤ THE WORD FOR A WEBSITE IDENTIFIES A WEBSITE.
 *
 *  PAGE_SIGNAL above knows ┬سlanding page┬╗, ┬سportfolio┬╗, ┬سbrochure┬╗ and
 *  ┬سone-pager┬╗ ظ¤ and did not know ┬سwebsite┬╗ or ┬س┘à┘ê┘é╪╣┬╗, the single most
 *  common way anyone asks for one. Measured live on the reference matrix:
 *
 *      Build a responsive WEBSITE for a bicycle repair studio. Include a
 *      service list with prices, opening hours, location, phone CTA, and a
 *      booking form.
 *          ->  app=booking, engine=records
 *          ->  Bookings | Providers | Add a booking | search | Export CSV
 *
 *  Six things asked for, one built, as a CRUD table. ┬سbooking form┬╗ is one
 *  item of the six; it won because it was the only one the catalogue knew,
 *  and nothing asked whether the sentence had already said what it wanted.
 *
 *  A site noun is not as loud as ┬سlanding page┬╗, so it does not get the same
 *  unconditional early return: it answers only when the request does NOT
 *  also ask for an application. ┬س╪د╪╣┘à┘ ╪ز╪╖╪ذ┘è┘é ╪ص╪ش┘ê╪▓╪د╪ز┬╗ stays an app,
 *  ┬س╪د╪╣┘à┘ ┘à┘ê┘é╪╣ ┘┘è┘ç ┘┘à┘ê╪░╪ش ╪ص╪ش╪▓┬╗ becomes the site he asked for. Reading
 *  the whole request is the whole point.
 */
const SITE_NOUN = /(?:^|[^\p{L}\p{N}_])(?:┘à┘ê┘é╪╣|┘à┘ê┘é╪╣╪د|website|web\s?site)(?:[^\p{L}\p{N}_]|$)/iu;

export function siteNounWithoutAppRequest(request: string): boolean {
    const t = String(request || '');
    return SITE_NOUN.test(t) && !APP_SIGNAL.test(t);
}

export function maskNegatedSpans(text: string): string {
    return String(text || '').replace(
        // JS `\\b` is ASCII-oriented and therefore unsafe for Arabic. Require
        // the marker to be outside every Unicode letter/number/identifier word
        // on the left, and followed by whitespace/end-of-input on the right.
        /(?<![\p{L}\p{N}_-])(?:not|no|never|without|┘┘è╪│|┘┘è╪│╪ز|┘╪د|╪ذ╪»┘ê┘|╪║┘è╪▒)(?=\s|$)(?:(?:\s+)[\p{L}\p{N}_-]+){0,8}/giu,
        span => span.replace(/[^\r\n]/gu, ' '),
    );
}

/**
 * A release/task-board contract names concrete program surfaces, rather than
 * merely a business subject. It therefore outranks incidental words inherited
 * from a planner or prior conversation (for example ┬س┘à╪ص╪د╪»╪س╪ر┬╗) ظ¤ but only
 * AFTER an explicit landing-page request has been honoured above.
 */
const TASK_BOARD_CONTRACT = /┘à╪▒┘â╪▓\s*╪ش╪د┘ç╪▓┘è╪ر\s*(?:╪د┘╪ح╪╡╪»╪د╪▒|╪د┘╪د╪╡╪»╪د╪▒)|┘┘ê╪ص╪ر\s*(?:┘à┘ç╪د┘à|╪ح╪╡╪»╪د╪▒|╪د╪╡╪»╪د╪▒|╪ش╪د┘ç╪▓┘è╪ر)|╪ش╪»┘ê┘\s*┘à┘ç╪د┘à|(?:╪ذ╪╖╪د┘é╪د╪ز\s*┘à╪ج╪┤╪▒╪د╪ز[\s\S]{0,180}(?:╪ذ╪ص╪س|╪ز╪╡┘┘è╪ر|┘╪د┘╪░╪ر\s*╪ز┘╪د╪╡┘è┘)|(?:╪ذ╪ص╪س|╪ز╪╡┘┘è╪ر|┘╪د┘╪░╪ر\s*╪ز┘╪د╪╡┘è┘)[\s\S]{0,180}╪ذ╪╖╪د┘é╪د╪ز\s*┘à╪ج╪┤╪▒╪د╪ز)|release\s*(?:readiness|center|board)|task\s*(?:board|manager|list)|kanban/i;

/** A request that names two first-class collections is a composite app, not the first matching single-domain blueprint. */
const PRODUCTIVITY_CONTRACT = /(?:┘à┘╪د╪ص╪╕╪د╪ز|┘à╪░┘â╪▒╪د╪ز|┘à┘┘â╪▒╪ر|notes?|notepad)[\s\S]{0,260}(?:┘à┘ç╪د┘à|┘à┘ç┘à╪د╪ز|┘à┘ç╪د┘à┘ّ?|tasks?|to-?do)|(?:┘à┘ç╪د┘à|┘à┘ç┘à╪د╪ز|┘à┘ç╪د┘à┘ّ?|tasks?|to-?do)[\s\S]{0,260}(?:┘à┘╪د╪ص╪╕╪د╪ز|┘à╪░┘â╪▒╪د╪ز|┘à┘┘â╪▒╪ر|notes?|notepad)/i;

/** A finance dashboard owns three first-class collections, not one generic ledger. */
const FINANCE_CONTRACT = /(?:income|incomes|earnings?|salary|revenue|╪د┘╪»╪«┘|╪د┘╪ح┘è╪▒╪د╪»╪د╪ز?|╪د┘╪▒╪د╪ز╪ذ)[\s\S]{0,320}(?:expense|expenses|spending|costs?|budget|budgets?|╪د┘┘à╪╡╪د╪▒┘è┘?|╪د┘┘┘┘é╪د╪ز?|╪د┘┘à┘è╪▓╪د┘┘è(?:╪ر|╪د╪ز))|(?:expense|expenses|spending|costs?|budget|budgets?|╪د┘┘à╪╡╪د╪▒┘è┘?|╪د┘┘┘┘é╪د╪ز?|╪د┘┘à┘è╪▓╪د┘┘è(?:╪ر|╪د╪ز))[\s\S]{0,320}(?:income|incomes|earnings?|salary|revenue|╪د┘╪»╪«┘|╪د┘╪ح┘è╪▒╪د╪»╪د╪ز?|╪د┘╪▒╪د╪ز╪ذ)/i;

/** A capability list for a coordinated workflow is not a record schema. */
export function hasWorkflowApplicationContract(requestRaw: string): boolean {
    const request = maskNegatedSpans(String(requestRaw || ''));
    const workItem = /\b(?:issues?|tickets?|cases?|tasks?|work\s+items?|review\s+queues?|approval\s+(?:queues?|workflows?|requests?))\b|┘é╪╢╪د┘è╪د|╪ز╪░╪د┘â╪▒|╪ص╪د┘╪د╪ز|┘à┘ç╪د┘à|╪╖╪د╪ذ┘ê╪▒\s*┘à╪▒╪د╪ش╪╣╪ر|╪╖┘╪ذ╪د╪ز?\s*┘à┘ê╪د┘┘é╪ر/iu;
    const families = [
        /\bsign[- ]?in\b|\blogin\b|\bauth(?:entication)?\b|╪ز╪│╪ش┘è┘\s*╪د┘╪»╪«┘ê┘|╪ز╪│╪ش┘è┘\s*╪»╪«┘ê┘/iu,
        /\b(?:member|manager|admin|user)\s+roles?\b|\bpermissions?\b|\brbac\b|╪╡┘╪د╪ص┘è╪د╪ز|╪ث╪»┘ê╪د╪▒\s*(?:╪د┘┘à╪│╪ز╪«╪»┘à┘è┘|╪د┘╪ث╪╣╪╢╪د╪ة|╪د┘╪د╪╣╪╢╪د╪ة)?/iu,
        /\bprivate\b|\bvisibility\b|\baccess\s+control\b|\bown(?:er|ership)?\b|╪«╪د╪╡(?:╪ر|┘ç)?|╪«╪╡┘ê╪╡┘è(?:╪ر|┘ç)|┘à┘┘â┘è(?:╪ر|┘ç)/iu,
        /\bassign(?:ment|ed|ee)?\b|\bworkflow\b|\bstatus\s+transitions?\b|╪ح╪│┘╪د╪»|╪ز╪╣┘è┘è┘|╪│┘è╪▒\s*╪د┘╪╣┘à┘|╪د┘╪ز┘é╪د┘╪د╪ز?\s*╪د┘╪ص╪د┘╪ر/iu,
        /\bcomments?\b|\bcollaborat(?:e|ion|ive)\b|╪ز╪╣┘┘è┘é╪د╪ز|╪ز╪╣╪د┘ê┘/iu,
        /\baudit(?:\s+(?:log|trail|history))?\b|\bhistory\b|╪│╪ش┘\s*╪د┘╪ز╪»┘é┘è┘é|╪ز╪د╪▒┘è╪«\s*╪د┘╪ز╪║┘è┘è╪▒╪د╪ز/iu,
    ];
    return workItem.test(request)
        && families.filter(pattern => pattern.test(request)).length >= 2
        && (APP_SIGNAL.test(request) || MANAGE_SIGNAL.test(request));
}

/**
 * WHICH application this is ظ¤ or null when the request is genuinely a
 * presentation site (a caf├ر, a clinic's landing page, a shop window), which
 * the section builder already does well and must keep doing.
 */
/**
 * THE TABLE EACH APPLICATION KIND STORES ظ¤ one reading for BOTH halves.
 *
 * The server names its primary table from this map, and the interface uses the
 * same map to ask one measurable question: is the detected kind's own table
 * one of the tables this system is actually building? A kind whose table the
 * system does not have was matched on a stray word ظ¤ ┬س╪د┘┘à╪│╪ز┘ê╪»╪╣╪د╪ز┬╗ inside an
 * eleven-domain freight sentence read as an inventory app ظ¤ and it stands
 * down instead of renaming the whole system after one word.
 *
 * This lived as a private copy inside ApiProjectTool; a second copy for the
 * interface would drift the first time either changed. [kind]: [table, labelAr].
 */
export const RECORDS_TABLE_BY_KIND: Record<string, [string, string]> = {
    social: ['posts', '╪د┘┘à┘╪┤┘ê╪▒╪د╪ز'], chat: ['messages', '╪د┘╪▒╪│╪د╪خ┘'], maps: ['places', '╪د┘╪ث┘à╪د┘â┘'], tasks: ['tasks', '╪د┘┘à┘ç╪د┘à'],
    notes: ['notes', '╪د┘┘à┘╪د╪ص╪╕╪د╪ز'], productivity: ['notes', '╪د┘┘à┘╪د╪ص╪╕╪د╪ز ┘ê╪د┘┘à┘ç╪د┘à'], expenses: ['expenses', '╪د┘┘à╪╡╪د╪▒┘è┘'], finance: ['incomes', '╪د┘╪»╪«┘'], inventory: ['items', '╪د┘╪ث╪╡┘╪د┘'],
    booking: ['bookings', '╪د┘╪ص╪ش┘ê╪▓╪د╪ز'], pos: ['sales', '╪د┘┘à╪ذ┘è╪╣╪د╪ز'], crm: ['customers', '╪د┘╪╣┘à┘╪د╪ة'],
    lms: ['enrolments', '╪د┘╪ز╪│╪ش┘è┘╪د╪ز'], contacts: ['contacts', '╪ش┘ç╪د╪ز ╪د┘╪د╪ز╪╡╪د┘'], habits: ['habits', '╪د┘╪╣╪د╪»╪د╪ز'], media: ['media', '╪د┘┘ê╪│╪د╪خ╪╖'],
};

export function detectAppKind(requestRaw: string): AppKind | null {
    const request = String(requestRaw || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '');
    if (!request.trim()) return null;
    const intentRequest = maskNegatedSpans(request);
    // ┬س╪╡┘╪ص╪ر ┘ç╪ذ┘ê╪╖ ┘╪ز╪╖╪ذ┘è┘é ╪«╪▒╪د╪خ╪╖┬╗ is a page about an app ظ¤ the document the user
    // named wins, exactly as classifyBuildScope decides it.
    if (PAGE_SIGNAL.test(intentRequest)) return null;
    //  ظخand the plain word for a site, when nothing in the request asks for
    //  an application. See siteNounWithoutAppRequest above for what this cost.
    if (siteNounWithoutAppRequest(intentRequest)) return null;
    // Two named collections are a stronger contract than either word alone.
    // This prevents ┬سnotes and tasks┬╗ from becoming only a task table or a
    // React-Native-shaped scaffold; the builder receives both surfaces.
    if (PRODUCTIVITY_CONTRACT.test(intentRequest) && APP_SIGNAL.test(intentRequest)) return 'productivity';
    // Explicit interaction surfaces are a stronger contract than a stray
    // domain word that may have been appended to a long execution context.
    // This prevents a release board from becoming ChatApp merely because its
    // self-audit or planner context happened to mention a conversation.
    if (TASK_BOARD_CONTRACT.test(intentRequest)) return 'tasks';
    if (FINANCE_CONTRACT.test(intentRequest)) return 'finance';
    /**
     * A named expense tracker or ledger is a domain declaration, not an
     * incidental noun beside a list of fields.  The user's columns still
     * replace the stock schema in `blueprintFor`, but retaining this kind lets
     * the build use the financial vocabulary, metrics and workflow rather
     * than rendering every new ledger as the same anonymous records screen.
     */
    if (/(?:expense|expenses|spending|costs?|┘à╪╡╪▒┘ê┘╪د╪ز?|┘┘┘é╪د╪ز|╪ح┘┘╪د┘é)[\s\S]{0,80}(?:tracker|ledger|register|app|application|dashboard|╪ز╪╖╪ذ┘è┘é|┘à╪ز╪د╪ذ╪╣|╪│╪ش┘|╪»┘╪ز╪▒)|(?:tracker|ledger|register|app|application|dashboard|╪ز╪╖╪ذ┘è┘é|┘à╪ز╪د╪ذ╪╣|╪│╪ش┘|╪»┘╪ز╪▒)[\s\S]{0,80}(?:expense|expenses|spending|costs?|┘à╪╡╪▒┘ê┘╪د╪ز?|┘┘┘é╪د╪ز|╪ح┘┘╪د┘é)/iu.test(intentRequest)) return 'expenses';
    if (hasWorkflowApplicationContract(intentRequest)) return 'custom';
    //  A LIST HE WROTE OUTRANKS A NOUN HE HAPPENED TO USE.
    //
    //  ┬س╪╣┘╪»┘è ╪╣┘è╪د╪»╪ر ╪ث╪│┘╪د┘ ظخ ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ ┘ê╪▒┘é┘à ╪ز┘┘┘ê┘┘ç ظخ┬╗ carries the word
    //  ┬س╪╣┘è╪د╪»╪ر┬╗ and a list of five columns. The word is incidental; the list
    //  is the contract. Scoring archetypes first let a stock relation come
    //  back and quietly replace what he wrote.
    //
    //  Ported from main (Manus, da586c92) ظ¤ the same property this branch
    //  argues everywhere: what he stated beats what we recognised.
    //  ظخand it asks the reader that finds his list ANYWHERE in the request.
    //
    //  Measured on the shop he asked for: two tables read, nine columns
    //  between them, and this line returned nothing ظ¤ because the
    //  single-shot reader loses to the earlier list in ┬س┘┘è┘ç ╪╡┘╪ص╪ر ╪د┘┘à┘╪ز╪ش╪د╪ز
    //  ┘ê╪╡┘╪ص╪ر ╪د┘╪╖┘╪ذ╪د╪ز┬╗. With no app kind, the builder fell through to the
    //  brochure path and handed him a marketing site: heroTitle, features,
    //  a story section and a gallery, for a request that named columns.
    //
    //  That is the SCAFFOLD-FALLBACK-UNGUARDED debt in CLAUDE.md, reached
    //  from a new direction: not a failure to understand, but one reader
    //  answering a question another reader had already answered better.
    /**
     *  ظؤ¤ ONE COLUMN IS NOT A LIST.
     *
     *  This fired on `length >= 1`, and it sits ABOVE the archetype scoring
     *  and above MANAGE_SIGNAL -- so a single derived column, right or
     *  wrong, short-circuits every reading that follows it.
     *
     *  Measured cost, on a sentence shaped the way the owner writes:
     *
     *      ╪د╪╣┘à┘ ┘┘è ╪╡┘╪ص╪ر ╪ث╪│╪ش┘ ┘┘è┘ç╪د ┘à╪╡╪د╪▒┘è┘┘è ┘ê┘è╪╖┘╪╣ ╪د┘┘à╪ش┘à┘ê╪╣
     *          -> generic, and the expenses engine that knows how to total
     *             a column was never reached.
     *
     *  The rule itself is right and its comment says so: a list he WROTE
     *  outranks a noun he happened to use. The defect is that it was never
     *  conditioned on being a list at all.
     *
     *  And this repository already decided the same question one layer
     *  over, in the schema designer's own guards:
     *
     *      ┬سone table is not a design ظ¤ that is what we already had┬╗
     *      ┬سa table with no columns is a table with nothing in it┬╗
     *
     *  Two readers of one idea, and only one of them held to it. Two is
     *  where a name becomes an enumeration, and it needs no vocabulary and
     *  no catalogue to know it.
     */
    if (hasExplicitRecordSchema(intentRequest)) return 'generic';

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
    // Nothing named, but ┬س┘╪╕╪د┘à ╪ح╪»╪د╪▒╪ر ظخ┬╗ / ┬س╪ز╪╖╪ذ┘è┘é ┘╪ز╪ز╪ذ╪╣ ظخ┬╗ is unmistakably an
    // application that owns records. It gets the records engine with an entity
    // named after the request itself.
    if (APP_SIGNAL.test(intentRequest) && MANAGE_SIGNAL.test(intentRequest)) return 'generic';
    // An explicit application with no known domain is still an application.
    // Send it to model authoring instead of silently turning it into the
    // remembered brochure sections. There is no deterministic custom-app
    // template here: the model must define the requested behavior.
    if (APP_SIGNAL.test(intentRequest)) return 'custom';
    /**
     * WHAT THE PAGE MUST DO OUTRANKS WHAT THE USER CALLED IT.
     *
     * Measured live, from a request the owner typed himself:
     *
     *     ┬س╪ذ╪»┘è ╪╡┘╪ص╪ر ╪ث╪│╪ش┘ ┘┘è┘ç╪د ┘â┘ ┘é╪╖╪╣╪ر: ╪د╪│┘à┘ç╪د ┘ê╪▒┘é┘à┘ç╪د ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪│╪╣╪▒ ╪د┘╪┤╪▒╪د╪ة ┘ê╪│╪╣╪▒
     *      ╪د┘╪ذ┘è╪╣ ظخ ┘ê╪ذ╪»┘è ╪ث╪ذ╪ص╪س ╪╣┘ ╪د┘┘é╪╖╪╣╪ر ظخ ┘ê╪ذ╪»┘è ┘è╪╖┘╪╣ ┘┘è ╪ز╪ص╪ز ┘à╪ش┘à┘ê╪╣ ╪▒╪ث╪│ ╪د┘┘à╪د┘┬╗
     *
     * Five named fields, a search, two totals, a stock rule. `detectAppKind`
     * returned null, because the only door left open here demanded the words
     * ┬س┘╪╕╪د┘à┬╗ or ┬س╪ز╪╖╪ذ┘è┘é┬╗ beside ┬س╪ح╪»╪د╪▒╪ر┬╗ ظ¤ and he had written ┬س╪╡┘╪ص╪ر ╪ث╪│╪ش┘ ┘┘è┘ç╪د┬╗.
     * With no kind, the builder fell through to the marketing scaffold and
     * shipped him a storefront: Hero, Gallery, Testimonials, FAQ, ┬س╪ز╪│┘ê┘é ╪د┘╪ت┘┬╗.
     * Nothing he asked for existed, and the acceptance ledger proved exactly
     * one of his requirements.
     *
     * A category noun is a label. Recording rows, searching them and totalling
     * them is WORK, and work is the stronger evidence. So a request that
     * describes the work gets the records engine even when it never names an
     * application ظ¤ held to two independent signals, so that ┬س╪│╪ش┘ّ┘ ╪»╪«┘ê┘┘è┬╗ and
     * ┬س╪╡┘╪ص╪ر ╪ز╪╣╪▒┘è┘┘è╪ر┬╗ stay outside.
     */
    const RECORD_VERB = /(╪ث╪│╪ش┘|╪د╪│╪ش┘|╪│╪ش┘ّ┘|╪ث╪╢┘è┘|╪د╪╢┘è┘|╪ث╪»╪«┘|╪د╪»╪«┘|╪د╪ص┘╪╕|╪ث╪ص┘╪╕|╪ث╪»┘ê┘ّ┘|╪د╪»┘ê┘|\brecord\b|\blog\b|\btrack\b|\benter\b)/i;
    const RECORD_SURFACE = /(╪ش╪»┘ê┘|┘é╪د╪خ┘à╪ر|┘é╪د╪خ┘à┘ç|┘╪د╪خ╪ص╪ر|┘â╪┤┘|\btable\b|\blist\b|\bregister\b|\bsheet\b|\binventory\b|┘à╪«╪▓┘ê┘)/i;
    const RECORD_MATH = /(┘à╪ش┘à┘ê╪╣|╪ح╪ش┘à╪د┘┘è|╪د╪ش┘à╪د┘┘è|╪▒╪ذ╪ص|\btotal\b|\bsum\b|\bprofit\b)/i;
    const RECORD_FIND = /(╪ث╪ذ╪ص╪س|╪د╪ذ╪ص╪س|╪ذ╪ص╪س|┘┘╪ز╪▒|╪ز╪╡┘┘è╪ر|\bsearch\b|\bfilter\b)/i;
    // A CRUD contract is stronger evidence than a domain noun. A reading
    // list, packing list, or a future domain Joe has never catalogued still
    // needs a working records app when it names a collection plus lifecycle
    // actions and persistence.
    const RECORD_ACTION = /(╪ث╪╢┘è┘|╪د╪╢┘è┘|╪د╪ص╪░┘|╪ث╪ص╪░┘|╪ص╪░┘|╪د╪ص┘╪╕|╪ث╪ص┘╪╕|╪ز╪╣╪»┘è┘|╪╣╪»┘ّ┘|\b(?:add|create|remove|delete|save|edit)\b)/i;
    const RECORD_PERSISTENCE = /(╪ذ╪╣╪»\s*(?:╪ز╪ص╪»┘è╪س|╪ح╪╣╪د╪»╪ر\s*╪ز╪ص┘à┘è┘)|┘è╪ذ┘é┘ë|╪ز╪╕┘|╪ز╪ذ┘é┘ë|┘à╪ص┘┘ê╪╕|local\s*storage|\b(?:persist|stored?|save[ds]?)\b[\s\S]{0,48}\b(?:refresh|reload|return)\b|\bafter\s+(?:a\s+)?(?:refresh|reload)\b)/i;
    if (RECORD_VERB.test(intentRequest)
        && (RECORD_SURFACE.test(intentRequest) || RECORD_MATH.test(intentRequest) || RECORD_FIND.test(intentRequest))) {
        return 'generic';
    }
    const actionCount = (intentRequest.match(new RegExp(RECORD_ACTION.source, 'gi')) || []).length;
    if (RECORD_SURFACE.test(intentRequest) && actionCount >= 2 && RECORD_PERSISTENCE.test(intentRequest)) {
        return 'generic';
    }
    return null;
}

/* ظ¤ظ¤ what each application is made of ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ */

/** [key, ar, en, type, options?, flags] ظ¤ authored once, read in both languages. */
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

/** The subject of the request, cleaned of the build verbs ظ¤ used to name a
 *  generic app after what the user actually asked to manage. */
export function subjectOf(request: string): string {
    /**
     * WHAT IT IS CALLED ظ¤ NOT THE FIRST FORTY CHARACTERS OF THE REQUEST.
     *
     * His build shipped with this on screen, as the app's own subtitle:
     *
     *     ┬س╪د┘ï ┘┘à╪┤╪ز┘ ┘╪ذ╪د╪ز╪د╪ز: ╪د┘┘╪ذ╪د╪ز╪د╪ز ┘ê╪د┘┘à┘ê╪▒╪»┘ê┘ ┘ê╪د┘╪╖┬╗
     *
     * Three faults in one string, all visible in the screenshot he sent:
     *   ┬╖ ┬س┘╪╕╪د┘à╪د┘ï┬╗ minus ┬س┘╪╕╪د┘à┬╗ leaves the case ending ┬س╪د┘ï┬╗ stranded in front;
     *   ┬╖ the colon and the table list belong to the DATABASE, not to the name;
     *   ┬╖ and slice(0, 40) cut ┬س┘ê╪د┘╪╖┘╪ذ┘è╪د╪ز┬╗ in half.
     */
    const head = String(request || '')
        .replace(/\n[\s\S]*$/, '')
        .split(/[:ي╝أ]/)[0]                                   // the list after ┬س:┬╗ is the tables
        // `\b` is defined by `\w`, which holds no Arabic letter ظ¤ ┬س┘┘è\b┬╗ never
        // matched, which is why ┬س╪د╪ذ┘ ┘┘è ┘à╪ز╪ش╪▒╪د┘ï┬╗ kept its ┬س┘┘è┬╗.
        .replace(/(╪د╪ذ┘┘|╪د╪ذ┘┘è|╪د╪ذ┘|╪ث┘╪┤╪خ|╪د┘╪┤╪خ|╪د╪╡┘╪╣|╪د╪╣┘à┘|╪│┘ê┘ّ┘è|╪│┘ê┘è|╪╡┘à┘ّ┘à|╪╡┘à┘à|╪╖┘ê┘ّ╪▒|╪╖┘ê╪▒|╪ث╪▒┘è╪»|╪د╪▒┘è╪»|╪ث╪▒╪║╪ذ|┘é┘à\s*╪ذ|┘à┘\s*┘╪╢┘┘â)/g, ' ')
        .replace(/(^|\s)(┘┘è|┘┘╪د)(?=\s|$)/g, ' ')
        /**
         * A NOISE WORD IS A WORD, NOT A RUN OF LETTERS.
         *
         * These were stripped wherever they appeared, so ┬س┘â╪د┘à┘┬╗ inside
         * ┬س┘à╪ز┘â╪د┘à┘╪د┘ï┬╗ was eaten and ┬س┘╪╕╪د┘à╪د┘ï ┘à╪ز┘â╪د┘à┘╪د┘ï ┘╪┤╪▒┘â╪ر ╪┤╪ص┘┬╗ came back as
         * ┬س┘à╪ز ┘╪┤╪▒┘â╪ر ╪┤╪ص┘┬╗ ظ¤ the app's own title, on screen, measured.
         *
         * They now match only at a word boundary, with the Arabic case endings
         * that ride on them (┬س┘╪╕╪د┘à╪د┘ï┬╗, ┬س┘à┘ê┘é╪╣╪د┘ï┬╗, ┬س╪ز╪╖╪ذ┘è┘é╪د┘ï┬╗) allowed as a
         * suffix ظ¤ which is what let the substring match look necessary in the
         * first place. ┬س┘à╪ز┘â╪د┘à┘┬╗ joins the list as its own word.
         */
        .replace(
            new RegExp(
                '(^|\\s)(?:╪ز╪╖╪ذ┘è┘é|╪ذ╪▒┘╪د┘à╪ش|┘╪╕╪د┘à|┘à┘╪╡┘ّ╪ر|┘à┘╪╡╪ر|╪ث╪»╪د╪ر|╪د╪»╪د╪ر|┘à┘ê┘é╪╣|┘à╪┤╪▒┘ê╪╣|╪ذ╪│┘è╪╖|╪ش╪»┘è╪»|┘â╪د┘à┘|┘à╪ز┘â╪د┘à┘|╪┤╪د┘à┘|╪د╪ص╪ز╪▒╪د┘┘è'
                + '|react|╪▒┘è╪د┘â╪ز|╪▒┘è╪ث┘â╪ز|vite|build|create|make|app|system|platform|project|simple|full)'
                + '(?:╪د┘ï|┘ï╪د|╪د╪ز|╪ر|┘ç)?(?=\\s|$)',
                'gi',
            ),
            ' ',
        )
        // The accusative ending left behind by ┬س┘╪╕╪د┘à╪د┘ï┬╗ / ┬س┘à┘ê┘é╪╣╪د┘ï┬╗ / ┬س╪ز╪╖╪ذ┘è┘é╪د┘ï┬╗.
        .replace(/(^|\s)(╪د┘ï|┘ï╪د|╪د)(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ').trim()
        // ┬س┘┘à╪┤╪ز┘ ┘╪ذ╪د╪ز╪د╪ز┬╗ is ┬س┘à╪┤╪ز┘ ┘╪ذ╪د╪ز╪د╪ز┬╗ with a preposition glued on.
        .replace(/^┘(?=[╪ة-┘è]{3,})/, '')
        // ظخand the English articles the verb strip leaves behind.
        .replace(/^(?:a|an|the|for|me|us|my|our)\s+/i, '')
        .replace(/\s+(?:a|an|the|for)$/i, '');

    if (head.length <= 40) return head;
    // Cut at a space, never through a word ظ¤ ┬س┘ê╪د┘╪╖┬╗ is not a name.
    const cut = head.slice(0, 40);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trim();
}

const STRICT_POSITIVE_CONSTRAINT = /non[-\s]?positive|strictly\s+positive|positive[-\s]?only|(?:must|should|need(?:s)?|require(?:s)?|validation(?:\s+that)?|validate|reject(?:s)?|disallow(?:s)?|not\s+accept)\s+(?:be\s+)?positive|(?:greater|more)\s+than\s+zero|above\s+zero|╪║┘è╪▒\s*(?:┘à┘ê╪ش╪ذ|┘à┘ê╪ش╪ذ╪ر|┘à┘ê╪ش╪ذ┘è┘)|(?:┘à┘ê╪ش╪ذ|┘à┘ê╪ش╪ذ╪ر)\s+┘┘é╪╖|╪ث┘â╪ذ╪▒\s+┘à┘\s+╪د┘╪╡┘╪▒|┘┘ê┘é\s+╪د┘╪╡┘╪▒|(?:┘è╪▒┘╪╢|┘╪د\s+┘è┘é╪ذ┘)\s+(?:╪د┘╪╡┘╪▒|╪د┘╪│╪د┘╪ذ)/iu;

/**
 * A BOUND IS A COMPARISON AND A NUMBER, NOT A PHRASE SOMEONE REMEMBERED.
 *
 * Measured. Six ways of saying the same constraint; two were understood:
 *
 *     ┬س┘ê╪د╪▒┘╪╢ ╪د┘┘à╪ذ┘╪║ ╪ح╪░╪د ┘â╪د┘ ╪╡┘╪▒ ╪ث┘ê ╪ث┘é┘┬╗               ظْ no bound
 *     ┬س╪د┘┘à╪ذ┘╪║ ┘è╪ش╪ذ ╪ث┘ ┘è┘â┘ê┘ ┘à┘ê╪ش╪ذ╪د┘ï ┘┘é╪╖┬╗                  ظْ no bound
 *     ┬س╪د┘┘â┘à┘è╪ر ┘╪د ╪ز┘é┘ ╪╣┘ 1┬╗                            ظْ no bound
 *     ┬س╪د┘┘à╪ذ┘╪║ ╪ث┘â╪ذ╪▒ ┘à┘ ╪د┘╪╡┘╪▒┬╗                          ظْ min 0, exclusive
 *     "rejects non-positive amounts"                  ظْ min 0, exclusive
 *
 * The four that failed are the ones he is most likely to type. The cause was a
 * list of remembered phrasings ظ¤ and ┬س┘à┘ê╪ش╪ذ╪د┘ï ┘┘é╪╖┬╗ failed against a pattern
 * that knew ┬س┘à┘ê╪ش╪ذ ┘┘é╪╖┬╗, which is the same word wearing a tanween.
 *
 * A bound is not a phrase. It is a COMPARISON and a NUMBER, and both are
 * closed classes: there are only so many ways to say greater, smaller, at
 * least, and only so many digits. What is open ظ¤ the field, the trade, the
 * wording around it ظ¤ is exactly what this must not depend on.
 *
 * The one subtlety is which SIDE was named. ┬س╪ث┘â╪ذ╪▒ ┘à┘ ┘ة┘ب┬╗ names what is
 * allowed; ┬س╪د╪▒┘╪╢ ┘à╪د ┘ç┘ê ╪ث┘é┘ ┘à┘ ┘ة┘ب┬╗ names what is refused, and the same number
 * means a different bound. So the rejection verb is read too, and it flips the
 * reading ظ¤ that is one closed class more, not a catalogue.
 */
const REJECTS = /(╪د╪▒┘╪╢|╪ث╪▒┘╪╢|╪▒┘╪╢|╪ز╪▒┘╪╢|┘╪د\s*┘è┘é╪ذ┘|┘╪د\s*╪ز┘é╪ذ┘|╪د┘à┘╪╣|\breject|\bdisallow|\bnot\s+accept|\bmust\s+not\s+be)/iu;
const AR_DIGITS = /[\u0660-\u0669]/g;

/** ┬س╪╡┘╪▒┬╗ and ┬سzero┬╗ are numbers he wrote in words. */
function numberIn(text: string): number | null {
    const normalised = text.replace(AR_DIGITS, d => String(d.charCodeAt(0) - 0x0660));
    const m = normalised.match(/-?\d+(?:[.,]\d+)?/);
    if (m) return Number(String(m[0]).replace(',', '.'));
    if (/(?:^|[^\u0621-\u064a])(?:╪╡┘╪▒|╪د┘╪╡┘╪▒)(?:$|[^\u0621-\u064a])|\bzero\b/iu.test(text)) return 0;
    return null;
}

/**
 *  ┬س┘ر ╪ث╪▒┘é╪د┘à┬╗ IS NINE DIGITS, NOT THE NUMBER NINE.
 *
 *  Measured on the shop he asked for: ┬س┘╪د ╪ز┘é╪ذ┘ ╪▒┘é┘à ┘ç╪د╪ز┘ ╪ث┘é┘ ┘à┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗ was
 *  read as `{ min: 9 }` ظ¤ the same reading as ┬س╪ث┘é┘ ┘à┘ ┘ر┬╗ with the counted
 *  unit thrown away. A phone whose number is ┬س12┬╗ satisfies that bound, and
 *  he had just forbidden anything shorter than nine digits.
 *
 *  The class: A BOUND ON THE COUNT OF SOMETHING READ AS A BOUND ON THE VALUE.
 *  The word after the number is not decoration ظ¤ it says what is being
 *  counted, and dropping it changes the rule into a different rule that
 *  happens to use the same digit.
 *
 *  Returned separately from `statedBound` rather than folded into it, because
 *  they attach to different things: a floor goes on a number field, a length
 *  goes on the text he types. Merging them is how the digit got lost.
 */
export function statedLengthBound(window: string): { minLength: number } | null {
    const text = String(window || '');
    if (!REJECTS.test(text) && !/(╪╣┘┘ë\s*╪د┘╪ث┘é┘|at\s+least|no\s+less\s+than|minimum)/iu.test(text)) return null;
    //  The number and its unit, adjacent ظ¤ ┬س┘ر ╪ث╪▒┘é╪د┘à┬╗, ┬س9 digits┬╗, ┬س┘ث ╪ث╪ص╪▒┘┬╗.
    const m = /(\d+|[┘ب-┘ر]+)\s*(╪ث╪▒┘é╪د┘à|╪▒┘é┘à|╪ث╪▒┘é╪د┘à╪د┘ï|╪«╪د┘╪د╪ز|╪«╪د┘╪ر|╪ث╪ص╪▒┘|╪ص╪▒┘|╪ص╪▒┘╪د┘ï|digits?|characters?|chars?|letters?)/iu
        .exec(text.replace(/[┘ب-┘ر]/g, d => String(d.charCodeAt(0) - 0x0660)));
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 64) return null;
    //  ┬س╪ث┘é┘ ┘à┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗ forbids eight; ┬س╪╣┘┘ë ╪د┘╪ث┘é┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗ requires nine.
    //  Both land on the same floor ظ¤ nine ظ¤ because the refused side is what
    //  is below it either way.
    return { minLength: n };
}

/** The lower bound a sentence states about a number, or null when it states none. */
export function statedBound(window: string): { min: number; minExclusive: boolean } | null {
    //  ظخand a counted unit is never a value bound. Measured: ┬س╪ث┘é┘ ┘à┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗
    //  came back as `{ min: 9 }`, which a two-digit phone satisfies.
    if (statedLengthBound(window)) return null;
    const text = String(window || '');
    const rejecting = REJECTS.test(text);

    //  ┬س┘à┘ê╪ش╪ذ┬╗ / positive names zero as the floor without naming a number.
    if (/(┘à┘ê╪ش╪ذ|┘à┘ê╪ش╪ذ╪ر|┘à┘ê╪ش╪ذ╪د|┘à┘ê╪ش╪ذ╪د┘ï|\bpositive\b)/iu.test(text) && !/(╪║┘è╪▒|non-?|┘╪د)\s*(?:┘à┘ê╪ش╪ذ|positive)/iu.test(text)) {
        return { min: 0, minExclusive: true };
    }
    if (/(╪║┘è╪▒\s*(?:┘à┘ê╪ش╪ذ|┘à┘ê╪ش╪ذ╪ر|┘à┘ê╪ش╪ذ╪د|┘à┘ê╪ش╪ذ╪د┘ï)|non-?positive)/iu.test(text) && rejecting) {
        return { min: 0, minExclusive: true };
    }

    /**
     *  AND THE FLOOR NAMED FROM THE OTHER SIDE ظ¤ ┬س╪ذ╪د┘╪│╪د┘╪ذ┬╗.
     *
     *  Measured on his own request: ┬س┘╪د ╪ز┘é╪ذ┘ ┘â┘à┘è╪ر ╪ذ╪د┘╪│╪د┘╪ذ┬╗ read as a plain
     *  prohibition, so no bound reached the schema and negative quantities
     *  were accepted by the app he was given. The reader knew ┬س┘à┘ê╪ش╪ذ┬╗ and
     *  ┬س╪╡┘╪▒┬╗ and not the word he actually used ظ¤ one constraint, several
     *  names, one of them taught.
     *
     *  The strictness is NOT the same as ┬س┘à┘ê╪ش╪ذ┬╗, and the difference is his:
     *  a man who refuses NEGATIVES has said nothing against zero, while
     *  ┬س┘à┘ê╪ش╪ذ┬╗ excludes it. So this floor is inclusive and that one is not ظ¤
     *  reading them alike would refuse a quantity of zero he never forbade.
     */
    //  `rejecting` is the whole discriminator, and it must be the only one:
    //  a guard I added against ┬س╪د┘é╪ذ┘ ╪د┘╪│╪د┘╪ذ┬╗ matched ┬سdo NOT ACCEPT a
    //  NEGATIVE quantity┬╗ too, because the refusal is spelled with the same
    //  verb. A sentence that permits negatives carries no refusal at all, so
    //  it never reaches this line.
    if (/(╪ذ╪د┘╪│╪د┘╪ذ|╪د┘╪│╪د┘╪ذ|╪│╪د┘╪ذ|╪│╪د┘╪ذ╪ر|╪│╪د┘╪ذ╪د|╪│╪د┘╪ذ╪د┘ï|╪ذ╪د┘┘╪د┘é╪╡|\bnegative\b)/iu.test(text) && rejecting) {
        return { min: 0, minExclusive: false };
    }
    //  ┬س╪║┘è╪▒ ╪│╪د┘╪ذ┬╗ / non-negative states the same floor as a requirement
    //  rather than a refusal, so it does not need the rejecting verb.
    if (/(╪║┘è╪▒\s*╪│╪د┘╪ذ|╪║┘è╪▒\s*╪│╪د┘╪ذ╪ر|non-?negative)/iu.test(text)) {
        return { min: 0, minExclusive: false };
    }

    const n = numberIn(text);
    if (n === null) return null;

    const below = /(╪ث┘é┘|╪د┘é┘|╪ث╪╡╪║╪▒|╪د╪╡╪║╪▒|╪ز╪ص╪ز|╪»┘ê┘|less\s+than|below|under|smaller)/iu.test(text);
    const above = /(╪ث┘â╪ذ╪▒|╪د┘â╪ذ╪▒|╪ث╪╣┘┘ë|╪د╪╣┘┘ë|┘┘ê┘é|greater\s+than|more\s+than|above|over)/iu.test(text);
    const atLeast = /(┘╪د\s*(?:┘è┘é┘|╪ز┘é┘)\s*╪╣┘|╪╣┘┘ë\s*╪د┘╪ث┘é┘|╪╣┘┘ë\s*╪د┘╪د┘é┘|at\s+least|no\s+less\s+than|minimum(?:\s+of)?)/iu.test(text);

    if (atLeast) return { min: n, minExclusive: false };
    //  A rejection names the refused side, so ┬س╪د╪▒┘╪╢ ┘à╪د ┘ç┘ê ╪ث┘é┘ ┘à┘ ┘ة┘ب┬╗ allows ┘ة┘ب
    //  while ┬س╪ث┘â╪ذ╪▒ ┘à┘ ┘ة┘ب┬╗ does not.
    //  ┬سN ╪ث┘ê ╪ث┘é┘┬╗ refuses N itself; ┬س╪ث┘é┘ ┘à┘ N┬╗ refuses only what is under it.
    //  Same number, different floor ظ¤ and he says the first far more often.
    const inclusiveOfN = /(╪ث┘ê\s*╪ث┘é┘|╪ث┘ê\s*╪د┘é┘|╪ث┘ê\s*╪ث╪»┘┘ë|╪ث┘ê\s*╪د╪»┘┘ë|╪ث┘ê\s*╪ث╪╡╪║╪▒|or\s+less|or\s+lower|or\s+below|or\s+under)/iu.test(text);
    if (rejecting && below) return { min: n, minExclusive: inclusiveOfN };
    if (rejecting && above) return null;                       // he refused the HIGH side; not a floor
    if (above) return { min: n, minExclusive: true };
    if (rejecting && n === 0) return { min: 0, minExclusive: true };
    return null;
}


/**
 *  A SENTENCE OWNS ITS OWN CONSTRAINT.
 *
 *  Measured: ┬س╪د┘┘â┘à┘è╪ر ┘╪د ╪ز┘é┘ ╪╣┘ 1┬╗ set a floor of one on ┬س╪د┘╪│╪╣╪▒┬╗ as well,
 *  because the reader took ninety-six characters on either side of each field
 *  name and asked whether a bound appeared anywhere inside. A window that
 *  wide contains the neighbour's sentence ظ¤ the haystack was big enough to
 *  contain every needle.
 *
 *  He states a constraint in a sentence, and that sentence names the field it
 *  is about. So the sentence is the unit: a bound applies to the fields named
 *  IN IT, and to no others.
 */
function boundsByField(requestRaw: string, fields: AppField[]): Map<string, { min: number; minExclusive: boolean }> {
    const out = new Map<string, { min: number; minExclusive: boolean }>();
    for (const sentence of String(requestRaw || '').split(/[.╪ا!\n]/u)) {
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
/**
 *  A BOUND READ ONCE AND SPREAD BY NAME.
 *
 *  Manus measured it on a real artifact and named the class; this is
 *  the same thing reproduced here, on the same sentence:
 *
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒╪î ┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗
 *
 *      from blueprintFor                  ╪د┘╪│╪╣╪▒ bounded ┬╖ ╪د┘┘â┘à┘è╪ر free
 *      after applyRequestFieldConstraints ╪د┘╪│╪╣╪▒ bounded ┬╖ ╪د┘┘â┘à┘è╪ر BOUNDED
 *
 *  He put a floor under a price and a quantity he never mentioned in
 *  that clause got the same floor. boundsByField split the request on
 *  sentence punctuation ظ¤ and his whole request is ONE sentence ظ¤ then
 *  stamped every field whose label appeared anywhere in it. Every
 *  column he listed appears in it: that is what listing them means.
 *
 *  A rule belongs to the field named in the CLAUSE that states it.
 *  statedRules already reads clauses ظ¤ it splits on the comma and the
 *  ┬س┘ê┬╗ and takes the definite noun the clause opens with ظ¤ and
 *  applyStatedRules already attaches each to the field it names.
 *  Two readers for one rule, and this was the one that spread.
 *
 *  So this keeps its job ظ¤ carrying his stated bounds into an
 *  AppBlueprint ظ¤ and stops having its own opinion about which field
 *  a rule is about.
 */
export function applyRequestFieldConstraints(bp: AppBlueprint, request: string): AppBlueprint {
    const rules = statedRules(request);
    if (!rules.length) return bp;
    //  applyStatedRules speaks DerivedField; an AppBlueprint field carries
    //  the same label, type and bound, so the shapes meet on those three.
    const carried = applyStatedRules(bp.fields as unknown as DerivedField[], rules).fields;
    const fields = bp.fields.map((field, i) => {
        const next = carried[i] as unknown as AppField;
        //  No type check of my own: applyStatedRules already refuses a
        //  target that is not a number, so a rule naming ┬س╪د┘╪د╪│┘à┬╗ never
        //  arrives here with a bound. A mutation proved the second check
        //  could not decide anything, and two guards for one rule is how
        //  they come apart.
        if (next?.min === undefined) return field;
        return { ...field, min: next.min, ...(next.minExclusive ? { minExclusive: true } : {}) };
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
 * page still called itself ┬س╪د┘╪ص╪ش┘ê╪▓╪د╪ز┬╗, with ┬س╪ص╪ش╪▓┬╗ for a row and the lede
 * ┬س╪د╪ص╪ش╪▓╪î ╪ث┘â┘ّ╪»╪î ┘ê╪ز╪د╪ذ╪╣ ┘à┘ê╪د╪╣┘è╪» ╪د┘┘è┘ê┘à ┘┘è ┘┘ê╪ص╪ر ┘ê╪د╪ص╪»╪ر┬╗. He had written ┬س╪ذ╪»┘è ╪ش╪»┘ê┘
 * ╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»┬╗. His word existed, in the same sentence the columns came
 * from, and the archetype's word was printed over it.
 *
 * derivedColumns already walks past this noun on its way to the list ظ¤ the
 * colon is what separates them: ┬س╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»: ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ ┘êظخ┬╗. So the
 * subject is read the same way the columns are, from his sentence, and it
 * needs no vocabulary of trades: a clinic, a nursery or a camel farm all name
 * their own table.
 */
//  Hoisted from derivedColumns: two readers need the same stems, and a
//  second copy would drift the first time one of them learned a verb
//  the other did not.
const RECORDING_STEM = ['╪│╪ش┘', '╪│╪ش┘ّ┘', '╪╢┘è┘', '╪»╪«┘', '╪»┘ê┘ّ┘', '╪»┘ê┘', '╪ز╪د╪ذ╪╣', '╪»┘è╪▒', '┘╪╕┘à'];
const CONJUGATED = RECORDING_STEM.map(stem => '[╪ث╪د┘è┘╪ز]' + stem).join('|');
const A_RECORDING_VERB = new RegExp('^(?:' + CONJUGATED + ')$', 'u');

//  The recording words, hoisted: theNounBesideTheContainer must refuse a
//  verb as a name, and it runs before recordedSubject's local copy exists.
const RECORDING_WORD = /(╪ث╪│╪ش┘|╪د╪│╪ش┘|╪│╪ش┘ّ┘|╪ث╪╢┘è┘|╪د╪╢┘è┘|╪ث╪»╪«┘|╪د╪»╪«┘|╪ث╪»┘ê┘ّ┘|╪د╪»┘ê┘|╪د┘╪ص┘é┘ê┘|╪ز╪ص╪ز┘ê┘è ╪╣┘┘ë|┘è╪ص╪ز┘ê┘è ╪╣┘┘ë|╪ث╪ز╪د╪ذ╪╣|╪د╪ز╪د╪ذ╪╣|╪ث╪»┘è╪▒|╪د╪»┘è╪▒|╪ث┘╪╕┘à|╪د┘╪╕┘à|\brecord\b|\btrack\b|\blog\b|\bmanage\b|\borgani[sz]e\b)/iu;

/**
 *  A NAME THAT IS THE SENTENCE THAT ASKED FOR IT.
 *
 *  Measured on four real requests, and three of them came out like this:
 *
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒╪î ┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗
 *      ظْ title: ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر┬╗
 *
 *  His own words, cut off mid-phrase, printed back to him as the name of
 *  his application ظ¤ in the reply, on the page, in the empty state. The
 *  one that came out right had a colon in it, because the only reader
 *  wired to the title needed a recording verb AND a colon within forty
 *  characters, and gave up on everything else.
 *
 *  There is a reader that already knows: subjectAfterContainer reads the
 *  noun standing beside the container he named. It answered ┬س┘à╪ذ┘è╪╣╪د╪ز┬╗,
 *  ┬س╪د┘┘à┘ê╪╕┘┘è┘┬╗, ┬س╪د┘┘â╪ز╪ذ┬╗ and ┬سclients┬╗ on the same four sentences while the
 *  title was still a truncated request. Nothing needed inventing ظ¤ the
 *  two readers were simply not joined.
 *
 *  Order matters and is not arbitrary. What he declared AFTER a recording
 *  verb wins, because that is him naming the thing outright. The noun
 *  beside the container comes next. And a verb is never a name: ┬س╪ش╪»┘ê┘
 *  ╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»┬╗ puts ┬س╪ث╪│╪ش┘┬╗ beside the container, and it is refused
 *  here even though the earlier reader is the one that saves it.
 */
function theNounBesideTheContainer(request: string): string | null {
    const beside = String(subjectAfterContainer(request) || '').trim();
    //  A NAME IS WHAT IS LEFT AFTER THE PARTICLES, NOT THE PARTICLES.
    //
    //  ┬س┘à╪د ╪د┘┘╪▒┘é ╪ذ┘è┘ ┘é╪د╪╣╪»╪ر ╪د┘╪ذ┘è╪د┘╪د╪ز ┘ê╪د┘╪ش╪»┘ê┘╪ا┬╗ handed back ┬س┘ê╪د┘┬╗ ظ¤ a
    //  conjunction and an article with nothing behind them. Three
    //  characters is a length, not a word; what has to be three is what
    //  remains once the prefixes he did not choose are taken off.
    const core = beside.replace(/^┘ê/u, '').replace(/^(?:┘┘|╪د┘|┘)/u, '');
    //  AND A VERB IS NEVER A NAME, IN ANY PERSON HE WRITES IT.
    //
    //  ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘è╪│╪ش┘ ╪د┘╪د╪│┘à ┘ê╪د┘┘ç╪د╪ز┘ ┘ê╪د┘╪╣┘┘ê╪د┘┬╗ put ┬س┘è╪│╪ش┘┬╗ beside the
    //  container and the app was named ┬س┘è╪│╪ش┘ ╪د┘╪د╪│┘à┬╗. The older list
    //  held ┬س╪ث╪│╪ش┘┬╗ and not ┬س┘è╪│╪ش┘┬╗, so the guard let it through ظ¤ the
    //  same one-person blindness that cost the column reader a whole
    //  class of requests. Same stems, same four persons, one table.
    const first = beside.split(/\s+/)[0] || '';
    if (core.length >= 3 && !RECORDING_WORD.test(beside) && !A_RECORDING_VERB.test(first)) return beside;
    //  No container either ظ¤ but grammar may still have found the entity,
    //  and the first column of an entity-and-its-attributes run IS the
    //  entity: ┬س╪ذ╪»┘è ╪ذ╪▒┘╪د┘à╪ش ┘è╪ص┘╪╕ ┘┘è ╪▓╪ذ╪د╪خ┘┘è ┘êظخ┬╗ is about ╪▓╪ذ╪د╪خ┘┘è.
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
    const colon = after.indexOf(':') >= 0 ? after.indexOf(':') : after.indexOf('ي╝أ');
    // No colon means the list starts immediately: there is no subject to read,
    // and inventing one would be worse than keeping the archetype's word.
    if (colon < 0 || colon > 40) return null;
    //  ┬س┘┘è┘ç┬╗, ┬س┘┘è┘ç╪د┬╗, ┬سin┬╗, ┬سmy┬╗ are grammar between the verb and the subject.
    const LEAD = /^(?:┘┘è┘ç|┘┘è┘ç╪د|╪ذ┘ç|╪ذ┘ç╪د|┘┘è|┘┘ë|the|my|our|a|an|all|of|for)$/i;
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
     *  ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à┘ê╪د╪╣┘è╪» ╪ث╪│╪ش┘ ┘┘è┘ç: ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ظخ┬╗ names the table BEFORE the
     *  recording verb, so reading forward finds only ┬س┘┘è┘ç┬╗ and gives up. The
     *  word he wants is the one immediately in front of the verb.
     *
     *  This runs only when reading forward found nothing, so ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ╪ث╪│╪ش┘
     *  ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»: ظخ┬╗ still yields ┬س╪د┘┘à┘ê╪د╪╣┘è╪»┬╗ and never ┬س╪ش╪»┘ê┘┬╗.
     */
    const before = request.slice(0, opener.index || 0).trim().split(/\s+/);
    const tail = before.slice(-1)[0] || '';
    const bare = tail.replace(/^(?:┘┘|╪د┘|┘)/, '');
    return bare.length >= 3 ? bare : theNounBesideTheContainer(request);
}

/**
 * A title explicitly attached to an application-shaped noun. This is kept
 * separate from `recordedSubject`: "expense tracker named Pocket Ledger"
 * names the product Pocket Ledger and its records expenses.
 */
export function namedProductTitle(requestRaw: string): string | null {
    const request = String(requestRaw || '');
    const english = request.match(
        /\b(?:app(?:lication)?|website|web\s*site|site|project|tracker|directory|ledger|system|tool)\b\s+(?:named|called)\s+["'ظ£ظإ]?([A-Za-z0-9][A-Za-z0-9 &'ظآ-]{1,58}?)["'ظ£ظإ]?(?=[.╪î,╪ؤ;\n]|$)/i,
    );
    const arabic = request.match(
        /(?:╪ز╪╖╪ذ┘è┘é|┘à┘ê┘é╪╣|┘à╪┤╪▒┘ê╪╣|┘╪╕╪د┘à|╪ث╪»╪د╪ر|╪د╪»╪د╪ر|╪│╪ش┘|┘à╪ز╪د╪ذ╪╣[╪ر╪ر])\s+(?:╪د╪│┘à┘ç|╪د╪│┘à┘ç╪د|╪ذ╪د╪│┘à|┘è╪│┘à┘ë|╪ز╪│┘à┘ë)\s+[┬س"ظ£]?([^┬س┬╗"ظ£ظإ.╪î,╪ؤ;\n]{2,60})/u,
    );
    const title = String(english?.[1] || arabic?.[1] || '')
        .replace(/[┬س┬╗"ظ£ظإ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return title.length >= 2 ? title : null;
}

export function blueprintFor(kind: AppKind, request: string, isAr: boolean): AppBlueprint {
    /**
     * AN EXPLICIT LIST BEATS EVERY ARCHETYPE, WHATEVER THE DOMAIN LOOKS LIKE.
     *
     * Measured: ┬س╪╣┘╪»┘è ╪╣┘è╪د╪»╪ر ╪ث╪│┘╪د┘. ╪ذ╪»┘è ╪ش╪»┘ê┘ ╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»: ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ ┘ê╪▒┘é┘à
     * ╪ز┘┘┘ê┘┘ç ┘ê┘ê┘é╪ز ╪د┘┘à┘ê╪╣╪» ┘ê┘┘ê╪╣ ╪د┘╪╣┘╪د╪ش ┘ê╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪»┘┘ê╪╣┬╗ matched the bookings
     * archetype on the word ┬س┘à┘ê╪د╪╣┘è╪»┬╗ and received its canned columns and its
     * canned totals ظ¤ ┬س┘â┘ ╪د┘╪ص╪ش┘ê╪▓╪د╪ز ┬╖ ┘à╪ج┘â┘ّ╪»╪ر ┬╖ ╪ص╪ش┘ê╪▓╪د╪ز ╪د┘┘è┘ê┘à┬╗. He had just listed
     * five columns of his own, and not one of them survived.
     *
     * Recognising a domain is useful when the user names no columns. When he
     * DOES name them, the recognition has nothing left to add: he is the
     * authority on his own table. So the archetype keeps its title, its engine
     * and its copy, and his list replaces its columns, its totals and its
     * threshold ظ¤ for every kind, not only for `generic`.
     */
    const L = (ar: string, en: string) => (isAr ? ar : en);
    const requestedColumns = fieldsFromRequest(request, isAr);
    if (requestedColumns) {
        const base = blueprintForKind(kind, request, isAr);
        // An explicit schema owns its labels and ordering. When it names one
        // of the archetype's canonical fields exactly, retain that field's
        // native contract too (for example the expense category select and
        // the required amount).
        const explicitColumns = ensureRequestedStatusFilterField(request, requestedColumns.map(field => {
            const native = base.fields.find(candidate => candidate.key === field.key);
            if (!native) return field;
            return {
                ...native,
                ...field,
                type: field.type === 'text' && native.type === 'select' ? native.type : field.type,
                ...(field.options ? { options: field.options } : native.options ? { options: native.options } : {}),
                ...(field.required || native.required ? { required: true } : {}),
                ...(field.primary || native.primary ? { primary: true } : {}),
            };
        }), isAr);
        const cols = columnsAnywhereInHisRequest(request) || [];
        const subject = recordedSubject(request);
        const productTitle = namedProductTitle(request);
        const counts = cols.filter(c => c.role === 'count');
        const monies = cols.filter(c => c.role === 'money');
        const wantsTotal = /┘à╪ش┘à┘ê╪╣|╪د╪ش┘à╪د┘┘è|╪ح╪ش┘à╪د┘┘è|┘é┘è┘à╪ر\s*╪د┘|┘â┘à\s|\btotal\b|\bsum\b|how much/iu.test(request);
        const lowMatch = /(?:╪د┘é┘|╪ث┘é┘|╪ز╪ص╪ز|╪»┘ê┘|less\s+than|under|below|<)\s*(?:┘à┘\s*)?(\d{1,4})/iu.exec(request);
        const wantsAlert = /(╪د╪ص┘à╪▒|╪ث╪ص┘à╪▒|╪ذ╪د┘╪د╪ص┘à╪▒|╪ذ╪د┘╪ث╪ص┘à╪▒|\bred\b|╪ز┘╪ذ┘è┘ç|╪د┘╪ز╪ذ┘ç|╪ث┘╪ز╪ذ┘ç|\bwarn|\balert)/iu.test(request);
        const flag = cols.find(c => c.role === 'flag');
        const doneValue = flag ? completionOption(flag.options || [], isAr) : undefined;
        const wantsProgress = wantsProgressMetric(request);
        const metrics: AppMetric[] = [
            { label: L('╪╣╪»╪» ╪د┘╪│╪ش┘╪د╪ز', 'Records'), kind: 'count' },
            ...(wantsTotal && counts[0] && monies[0]
                ? [{ label: `${L('╪ح╪ش┘à╪د┘┘è', 'Total')} ${counts[0].label} ├ù ${monies[0].label}`,
                    kind: 'sumProduct', field: counts[0].key, field2: monies[0].key } as AppMetric] : []),
            ...(wantsTotal && counts[0] && monies[1]
                ? [{ label: `${L('╪د┘┘╪▒┘é ╪ذ┘è┘', 'Margin between')} ${monies[1].label} ${L('┘ê', 'and')} ${monies[0].label}`,
                    kind: 'sumMargin', field: counts[0].key, field2: monies[1].key, field3: monies[0].key } as AppMetric] : []),
            ...(wantsTotal && monies[0] && !counts[0]
                ? [{ label: `${L('┘à╪ش┘à┘ê╪╣', 'Total')} ${monies[0].label}`, kind: 'sum', field: monies[0].key } as AppMetric] : []),
            ...(counts[0]
                ? [{ label: `${L('┘à╪ش┘à┘ê╪╣', 'Total')} ${counts[0].label}`, kind: 'sum', field: counts[0].key } as AppMetric] : []),
            ...(wantsProgress && flag && doneValue
                ? [{ label: L('┘╪│╪ذ╪ر ╪د┘╪ز┘é╪»┘à', 'Progress'), kind: 'progress', field: flag.key, equals: doneValue } as AppMetric] : []),
        ];
        const filterFields = requestedFilterFields(request, explicitColumns);
        const requestedStatus = requestsStatusFilter(request)
            ? explicitColumns.find(field => /status|state|┘à╪▒╪ص┘╪ر|╪ص╪د┘╪ر|┘ê╪╢╪╣/iu.test(String(field.label || '')))
            : undefined;
        return {
            ...base,
            fields: explicitColumns,
            asTable: heAskedForATable(request, explicitColumns.length),
            metrics,
            statusField: requestedStatus?.key,
            doneValue: undefined,
            filterFields,
            /**
             *  AND NO PARENT HE NEVER NAMED.
             *
             *  Measured live. His five columns finally reached the generated
             *  app ظ¤ and the booking archetype attached its own parent table
             *  on top: ┬س╪د╪│┘à ╪د┘╪╖╪ذ┘è╪ذ *┬╗, ┬س╪د┘╪ز╪«╪╡┘ّ╪╡┬╗, ┬س╪د┘┘ç╪د╪ز┘┬╗, with a picker
             *  ┬س┘╪د ╪ث╪╖╪ذ╪د╪ة ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╖╪ذ┘è╪ذ ╪س┘à ╪د╪ص╪ش╪▓ ┘┘ç ┘à┘ê╪╣╪»╪د┘ï┬╗.
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
             *  overruling the request. A stock booking app ظ¤ one where he
             *  named no columns ظ¤ keeps its ┬س╪╖╪ذ┘è╪ذ ظ ┘à┘ê╪د╪╣┘è╪»┘ç┬╗ relation.
             */
            relation: undefined,
            /**
             *  ظخAND A YES/NO COLUMN IS THE APP'S DONE-STATE.
             *
             *  He wrote ┬س┘ê┘ç┘ ╪ز┘à ╪د┘╪│╪»╪د╪»┬╗. That is not a fifth text box: it is
             *  the state of the row, and the records engine already knows how
             *  to draw a row as done. Naming it here is what connects the two,
             *  so a settled debt looks settled instead of holding the word
             *  ┬س┘╪╣┘à┬╗ in a box.
             */
            ...(flag
                ? { statusField: flag.key, doneValue }
                : {}),
            /**
             *  ظخAND HIS WORD FOR THE THING, WHEN HE SAID IT.
             *
             *  The archetype titled his clinic table ┬س╪د┘╪ص╪ش┘ê╪▓╪د╪ز┬╗ and told him
             *  ┬س╪د╪ص╪ش╪▓╪î ╪ث┘â┘ّ╪»╪î ┘ê╪ز╪د╪ذ╪╣ ┘à┘ê╪د╪╣┘è╪» ╪د┘┘è┘ê┘à┬╗ while his own sentence said
             *  ┬س╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»┬╗. Its copy is a fallback for a man who
             *  named nothing ظ¤ never an overwrite of a man who did.
             */
            ...(subject ? {
                title: productTitle || subject,
                entityOne: subject,
                entityMany: subject,
                lede: isAr ? `╪ث╪╢┘ ${subject}╪î ┘ê╪د╪ذ╪ص╪س ┘┘è┘ç╪د╪î ┘ê╪▒╪ز┘ّ╪ذ┘ç╪د╪î ┘ê╪╡╪»┘ّ╪▒┘ç╪د.`
                    : `Add ${subject}, search them, sort them and export them.`,
                emptyHint: isAr ? `┘╪د ${subject} ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ┘ê╪د╪ص╪» ┘à┘ ╪د┘┘┘à┘ê╪░╪ش.`
                    : `No ${subject} yet ظ¤ add the first one from the form.`,
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
     * The declared categories replace the stock ones ظ¤ on whichever field
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
            title: L('╪د┘╪«╪▒┘è╪╖╪ر', 'The map'),
            lede: L('╪د╪ذ╪ص╪س ╪╣┘ ╪ث┘è ┘à┘â╪د┘╪î ╪ص╪»┘ّ╪» ┘à┘ê┘é╪╣┘â╪î ┘ê╪د╪ص┘╪╕ ╪د┘╪ث┘à╪د┘â┘ ╪د┘╪ز┘è ╪ز┘ç┘à┘ّ┘â.', 'Search any place, find yourself, and keep the places that matter.'),
            entityOne: L('┘à┘â╪د┘', 'place'), entityMany: L('╪د┘╪ث┘à╪د┘â┘ ╪د┘┘à╪ص┘┘ê╪╕╪ر', 'Saved places'),
            fields: [], metrics: [], deps: { leaflet: '^1.9.4' },
            emptyHint: L('┘╪د ╪ث┘à╪د┘â┘ ┘à╪ص┘┘ê╪╕╪ر ╪ذ╪╣╪» ظ¤ ╪د╪ذ╪ص╪س ╪╣┘ ┘à┘â╪د┘ ╪ث┘ê ╪د┘┘é╪▒ ╪╣┘┘ë ╪د┘╪«╪▒┘è╪╖╪ر ┘╪ز╪س╪ذ┘è╪ز ╪ث┘ê┘ ╪╣┘╪د┘à╪ر.',
                'No saved places yet ظ¤ search for one, or click the map to drop your first pin.'),
        };

        case 'weather': return {
            kind, engine: 'weather',
            title: L('╪د┘╪╖┘é╪│', 'Weather'),
            lede: L('╪ص╪د┘╪ر ╪د┘╪ش┘ê ╪د┘╪ت┘ ┘ê╪ز┘ê┘é┘ّ╪╣╪د╪ز ╪│╪ذ╪╣╪ر ╪ث┘è╪د┘à ظ¤ ┘à┘ ┘à╪╡╪»╪▒ ┘à┘╪ز┘ê╪ص ╪ذ┘╪د ┘à┘╪ز╪د╪ص ┘ê┘╪د ╪ص╪│╪د╪ذ.',
                'Current conditions and a seven-day forecast ظ¤ open data, no key, no account.'),
            entityOne: L('┘à╪»┘è┘╪ر', 'city'), entityMany: L('┘à╪»┘┘è ╪د┘┘à╪ص┘┘ê╪╕╪ر', 'Saved cities'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('╪د╪ذ╪ص╪س ╪╣┘ ┘à╪»┘è┘╪ر╪î ╪ث┘ê ╪د╪│┘à╪ص ╪ذ╪د┘┘ê╪╡┘ê┘ ┘┘à┘ê┘é╪╣┘â ┘╪╣╪▒╪╢ ╪╖┘é╪│┘â ╪د┘╪ت┘.',
                'Search for a city, or allow location access to see your own weather.'),
        };

        case 'social': return {
            kind, engine: 'social',
            title: L('╪د┘╪«┘è╪╖', 'The feed'),
            lede: L('╪د┘╪┤╪▒╪î ╪ز╪د╪ذ┘╪╣╪î ╪ث╪╣╪ش╪ذ╪î ╪╣┘┘ّ┘é ظ¤ ╪«┘è╪╖ ╪ص┘é┘è┘é┘è ╪ذ╪ص╪│╪د╪ذ╪د╪ز ╪ص┘é┘è┘é┘è╪ر.',
                'Post, follow, like and comment ظ¤ a real feed with real accounts.'),
            entityOne: L('┘à┘╪┤┘ê╪▒', 'post'), entityMany: L('╪د┘┘à┘╪┤┘ê╪▒╪د╪ز', 'Posts'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('┘╪د ┘à┘╪┤┘ê╪▒╪د╪ز ╪ذ╪╣╪» ظ¤ ╪د┘â╪ز╪ذ ╪ث┘ê┘ ┘à┘╪┤┘ê╪▒╪î ╪ث┘ê ╪ز╪د╪ذ┘╪╣ ╪ث╪ص╪»╪د┘ï ┘╪ز╪▒┘ë ┘à┘╪┤┘ê╪▒╪د╪ز┘ç.',
                'No posts yet ظ¤ write the first one, or follow someone to see theirs.'),
        };

        case 'chat': return {
            kind, engine: 'chat',
            title: L('╪د┘┘à╪ص╪د╪»╪س╪ر', 'Chat'),
            lede: L('╪║╪▒┘╪î ╪▒╪│╪د╪خ┘╪î ┘ê╪ص┘╪╕ ╪»╪د╪خ┘à ظ¤ ┘ê╪«╪د╪»┘à ╪ص┘é┘è┘é┘è ╪ص┘è┘ ┘è┘ê╪ش╪».',
                'Rooms, messages, durable storage ظ¤ and a real server when one exists.'),
            entityOne: L('╪▒╪│╪د┘╪ر', 'message'), entityMany: L('╪د┘╪▒╪│╪د╪خ┘', 'Messages'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('┘╪د ╪▒╪│╪د╪خ┘ ┘┘è ┘ç╪░┘ç ╪د┘╪║╪▒┘╪ر ╪ذ╪╣╪» ظ¤ ╪د┘â╪ز╪ذ ╪ث┘ê┘ ╪▒╪│╪د┘╪ر.', 'No messages in this room yet ظ¤ write the first one.'),
        };

        case 'productivity': return {
            kind, engine: 'productivity',
            title: L('╪د┘┘à┘╪د╪ص╪╕╪د╪ز ┘ê╪د┘┘à┘ç╪د┘à', 'Notes & Tasks'),
            lede: L('┘╪╕┘ّ┘à ┘à┘╪د╪ص╪╕╪د╪ز┘â ┘ê┘à┘ç╪د┘à┘â ┘┘è ┘à╪│╪د╪ص╪ر ┘ê╪د╪ص╪»╪ر╪î ┘à╪╣ ╪ص┘╪╕ ╪»╪د╪خ┘à ╪╣┘┘ë ╪ش┘ç╪د╪▓┘â.', 'Keep notes and tasks together, with durable local storage.'),
            entityOne: L('╪╣┘╪╡╪▒', 'item'), entityMany: L('╪د┘┘à┘╪د╪ص╪╕╪د╪ز ┘ê╪د┘┘à┘ç╪د┘à', 'Notes and tasks'),
            fields: [], metrics: [
                { label: L('╪د┘┘à┘╪د╪ص╪╕╪د╪ز', 'Notes'), kind: 'count' },
                { label: L('╪د┘┘à┘ç╪د┘à', 'Tasks'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('╪د╪ذ╪»╪ث ╪ذ╪ح╪╢╪د┘╪ر ┘à┘╪د╪ص╪╕╪ر ╪ث┘ê ┘à┘ç┘à╪ر.', 'Start by adding a note or task.'),
        };

        case 'tasks': return {
            kind, engine: 'records',
            title: L('╪د┘┘à┘ç╪د┘à', 'Tasks'),
            lede: L('╪ث╪╢┘ ┘à┘ç╪د┘à┘â╪î ╪▒╪ز┘ّ╪ذ┘ç╪د ╪ذ╪د┘╪ث┘ê┘┘ê┘è╪ر╪î ┘ê╪ز╪د╪ذ╪╣ ┘à╪د ╪ث┘┘╪ش╪▓.', 'Add your tasks, rank them, and track what is done.'),
            entityOne: L('┘à┘ç┘à╪ر', 'task'), entityMany: L('╪د┘┘à┘ç╪د┘à', 'Tasks'),
            fields: [
                f(['title', '╪د┘┘à┘ç┘à╪ر', 'Task', 'text', undefined, ['required', 'primary']], isAr),
                f(['notes', '╪ز┘╪د╪╡┘è┘', 'Details', 'textarea'], isAr),
                f(['priority', '╪د┘╪ث┘ê┘┘ê┘è╪ر', 'Priority', 'select', SELECT_AR_EN(['╪╣╪د┘┘è╪ر', '┘à╪ز┘ê╪│╪╖╪ر', '┘à┘╪«┘╪╢╪ر'], ['High', 'Medium', 'Low'], isAr)], isAr),
                f(['due', '╪ز╪د╪▒┘è╪« ╪د┘╪د╪│╪ز╪ص┘é╪د┘é', 'Due date', 'date'], isAr),
                f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['┘é┘è╪» ╪د┘╪ز┘┘┘è╪░', '┘à┘╪ش╪▓╪ر'], ['In progress', 'Done'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('┘à┘╪ش╪▓╪ر', 'Done'),
            metrics: [
                { label: L('┘â┘ ╪د┘┘à┘ç╪د┘à', 'All tasks'), kind: 'count' },
                { label: L('┘à┘╪ش╪▓╪ر', 'Done'), kind: 'countWhere', field: 'status', equals: L('┘à┘╪ش╪▓╪ر', 'Done') },
                { label: L('╪ز╪│╪ز╪ص┘é ╪د┘┘è┘ê┘à', 'Due today'), kind: 'todayCount', field: 'due' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘à┘ç╪د┘à ╪ذ╪╣╪» ظ¤ ╪د┘â╪ز╪ذ ╪ث┘ê┘ ┘à┘ç┘à╪ر ┘┘è ╪د┘┘┘à┘ê╪░╪ش.', 'No tasks yet ظ¤ write your first one in the form.'),
        };

        case 'notes': return {
            kind, engine: 'records',
            title: L('╪د┘┘à┘╪د╪ص╪╕╪د╪ز', 'Notes'),
            lede: L('╪د┘â╪ز╪ذ╪î ╪د╪ذ╪ص╪س╪î ┘ê╪╣╪»┘ّ┘ ظ¤ ┘â┘ ╪┤┘è╪ة ┘à╪ص┘┘ê╪╕ ╪╣┘┘ë ╪ش┘ç╪د╪▓┘â ┘┘ê╪▒╪د┘ï.', 'Write, search, edit ظ¤ saved on your device instantly.'),
            entityOne: L('┘à┘╪د╪ص╪╕╪ر', 'note'), entityMany: L('╪د┘┘à┘╪د╪ص╪╕╪د╪ز', 'Notes'),
            fields: [
                f(['title', '╪د┘╪╣┘┘ê╪د┘', 'Title', 'text', undefined, ['required', 'primary']], isAr),
                f(['body', '╪د┘┘╪╡', 'Body', 'textarea', undefined, ['required']], isAr),
                f(['tag', '╪د┘┘ê╪│┘à', 'Tag', 'text'], isAr),
            ],
            metrics: [
                { label: L('┘â┘ ╪د┘┘à┘╪د╪ص╪╕╪د╪ز', 'All notes'), kind: 'count' },
                { label: L('╪ث┘╪╢┘è┘╪ز ╪د┘┘è┘ê┘à', 'Added today'), kind: 'todayCount', field: 'createdAt' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘à┘╪د╪ص╪╕╪د╪ز ╪ذ╪╣╪» ظ¤ ╪د┘â╪ز╪ذ ╪ث┘ê┘ ┘à┘╪د╪ص╪╕╪ر.', 'No notes yet ظ¤ write your first one.'),
        };

        case 'media': return {
            kind, engine: 'records',
            title: L('┘┘ê╪ص╪ر ┘à╪▒╪د╪ش╪╣╪ر ╪د┘┘ê╪│╪د╪خ╪╖', 'Media Review Board'),
            lede: L('╪د╪▒┘╪╣ ╪د┘╪╡┘ê╪▒ ┘ê╪▒╪د╪ش╪╣ ╪ذ┘è╪د┘╪د╪ز┘ç╪د ┘ê┘╪╕┘ّ┘à┘ç╪د ╪ذ╪د┘┘ê╪│┘ê┘à ظ¤ ┘à╪ص┘┘ê╪╕╪ر ╪╣┘┘ë ╪ش┘ç╪د╪▓┘â.',
                'Upload images, review their metadata and organize them by tag ظ¤ saved on your device.'),
            entityOne: L('┘ê╪│┘è╪╖', 'media item'), entityMany: L('╪د┘┘ê╪│╪د╪خ╪╖', 'Media items'),
            fields: [
                f(['image', '╪د┘╪╡┘ê╪▒╪ر', 'Image', 'image', undefined, ['required']], isAr),
                f(['title', '╪د┘╪╣┘┘ê╪د┘', 'Title', 'text', undefined, ['required', 'primary']], isAr),
                f(['tags', '╪د┘┘ê╪│┘ê┘à', 'Tags', 'text'], isAr),
                f(['notes', '╪د┘┘à┘╪د╪ص╪╕╪د╪ز', 'Notes', 'textarea'], isAr),
            ],
            filterFields: ['tags'],
            preserveOriginalImages: true,
            metrics: [
                { label: L('┘â┘ ╪د┘┘ê╪│╪د╪خ╪╖', 'All media'), kind: 'count' },
                { label: L('╪ث┘╪╢┘è┘╪ز ╪د┘┘è┘ê┘à', 'Added today'), kind: 'todayCount', field: 'createdAt' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘ê╪│╪د╪خ╪╖ ╪ذ╪╣╪» ظ¤ ╪د╪▒┘╪╣ ╪ث┘ê┘ ╪╡┘ê╪▒╪ر ┘à╪╣ ╪╣┘┘ê╪د┘┘ç╪د.',
                'No media yet ظ¤ upload the first image with its title.'),
        };

        case 'finance': return {
            kind, engine: 'finance',
            title: L('╪د┘┘à╪د┘', 'MoneyTrack'),
            lede: L('╪ز╪د╪ذ╪╣ ╪د┘╪»╪«┘ ┘ê╪د┘┘à╪╡╪د╪▒┘è┘ ┘ê╪د┘┘à┘è╪▓╪د┘┘è╪د╪ز ┘à╪╣ ╪ص╪│╪د╪ذ ╪╡╪د┘┘è ╪د┘╪▒╪╡┘è╪».', 'Track income, expenses and budgets with a computed net balance.'),
            entityOne: L('╪╣┘à┘┘è╪ر ┘à╪د┘┘è╪ر', 'financial entry'), entityMany: L('╪د┘╪╣┘à┘┘è╪د╪ز ╪د┘┘à╪د┘┘è╪ر', 'Financial entries'),
            fields: [
                f(['source', '┘à╪╡╪»╪▒ ╪د┘╪»╪«┘', 'Income source', 'text', undefined, ['required', 'primary']], isAr),
                f(['amount', '╪د┘┘à╪ذ┘╪║', 'Amount', 'number', undefined, ['required']], isAr),
                f(['category', '╪د┘┘╪خ╪ر', 'Category', 'text'], isAr),
                f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date'], isAr),
                f(['note', '┘à┘╪د╪ص╪╕╪ر', 'Note', 'textarea'], isAr),
            ],
            metrics: [
                { label: L('╪ح╪ش┘à╪د┘┘è ╪د┘╪»╪«┘', 'Total income'), kind: 'sum', field: 'amount', unit: L('╪▒.╪│', 'SAR') },
                { label: L('╪ح╪ش┘à╪د┘┘è ╪د┘┘à╪╡╪د╪▒┘è┘', 'Total expenses'), kind: 'sum', field: 'amount', unit: L('╪▒.╪│', 'SAR') },
                { label: L('╪╡╪د┘┘è ╪د┘╪▒╪╡┘è╪»', 'Net balance'), kind: 'sum', field: 'amount', unit: L('╪▒.╪│', 'SAR') },
            ],
            deps: {},
            emptyHint: L('╪ث╪╢┘ ╪»╪«┘╪د┘ï ╪ث┘ê ┘à╪╡╪▒┘ê┘╪د┘ï ╪ث┘ê ┘à┘è╪▓╪د┘┘è╪ر ┘╪ذ╪»╪ة ╪د┘┘à╪ز╪د╪ذ╪╣╪ر.', 'Add income, expense or budget entries to get started.'),
        };

        case 'expenses': return {
            // Expenses are a ledger, not a generic admin table. Keeping this
            // separate prevents every request with fields from becoming the
            // same records screen and preserves the quick-entry workflow.
            kind, engine: 'ledger',
            title: L('╪د┘┘à╪╡╪د╪▒┘è┘', 'Expenses'),
            lede: L('╪│╪ش┘ّ┘ ┘â┘ ┘à╪╡╪▒┘ê┘╪î ┘ê╪┤╪د┘ç╪» ╪ح╪ش┘à╪د┘┘è┘â ┘è╪ز╪ص╪»┘ّ╪س ┘┘ê╪▒╪د┘ï.', 'Log every expense and watch the totals move.'),
            entityOne: L('┘à╪╡╪▒┘ê┘', 'expense'), entityMany: L('╪د┘┘à╪╡╪د╪▒┘è┘', 'Expenses'),
            fields: [
                f(['amount', '╪د┘┘à╪ذ┘╪║', 'Amount', 'number', undefined, ['required']], isAr),
                f(['category', '╪د┘┘╪خ╪ر', 'Category', 'select', SELECT_AR_EN(['╪╖╪╣╪د┘à', '┘à┘ê╪د╪╡┘╪د╪ز', '┘┘ê╪د╪ز┘è╪▒', '╪ز╪│┘ê┘ّ┘é', '╪ث╪«╪▒┘ë'], ['Food', 'Transport', 'Bills', 'Shopping', 'Other'], isAr)], isAr),
                f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date'], isAr),
                f(['note', '┘à┘╪د╪ص╪╕╪ر', 'Note', 'textarea', undefined, ['primary']], isAr),
            ],
            statusField: 'category',
            metrics: [
                { label: L('╪د┘╪ح╪ش┘à╪د┘┘è', 'Total'), kind: 'sum', field: 'amount' },
                { label: L('┘à╪╡╪▒┘ê┘ ╪د┘┘è┘ê┘à', 'Spent today'), kind: 'todaySum', field: 'date', field2: 'amount' },
                { label: L('╪ث╪╣┘┘ë ┘╪خ╪ر', 'Top category'), kind: 'topGroup', field: 'category', field2: 'amount' },
                { label: L('╪╣╪»╪» ╪د┘╪╣┘à┘┘è╪د╪ز', 'Entries'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘à╪╡╪د╪▒┘è┘ ┘à╪│╪ش┘ّ┘╪ر ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╣┘à┘┘è╪ر.', 'Nothing logged yet ظ¤ add your first entry.'),
        };

        /**
         * THE SHOP ENGINE ظ¤ the one kind that must be able to SELL.
         *
         * Everything a records app has (rows, search, totals) plus the three
         * things that make it a store and that no CRUD screen has: a product
         * grid a customer reads, a cart that survives a reload, and a checkout
         * that writes a REAL order to the server's /api/orders. Without those
         * three it is an inventory list with prices on it.
         */
        case 'store': return {
            kind, engine: 'shop',
            title: L('╪د┘┘à╪ز╪ش╪▒', 'Store'),
            lede: L('╪د╪╣╪▒╪╢ ┘à┘╪ز╪ش╪د╪ز┘â╪î ┘ê╪د╪│╪ز┘é╪ذ┘ ╪╖┘╪ذ╪د╪ز ╪ص┘é┘è┘é┘è╪ر ┘à┘ ╪▓╪ذ╪د╪خ┘┘â.', 'Show your products and take real orders from your customers.'),
            entityOne: L('┘à┘╪ز╪ش', 'product'), entityMany: L('╪د┘┘à┘╪ز╪ش╪د╪ز', 'Products'),
            fields: [
                f(['name', '╪د╪│┘à ╪د┘┘à┘╪ز╪ش', 'Product', 'text', undefined, ['required', 'primary']], isAr),
                f(['price', '╪د┘╪│╪╣╪▒', 'Price', 'number', undefined, ['required']], isAr),
                f(['category', '╪د┘╪ز╪╡┘┘è┘', 'Category', 'text'], isAr),
                f(['description', '╪د┘┘ê╪╡┘', 'Description', 'textarea'], isAr),
                f(['image', '╪▒╪د╪ذ╪╖ ╪د┘╪╡┘ê╪▒╪ر', 'Image URL', 'text'], isAr),
                f(['stock', '╪د┘┘à╪«╪▓┘ê┘', 'Stock', 'number'], isAr),
            ],
            metrics: [
                { label: L('╪╣╪»╪» ╪د┘┘à┘╪ز╪ش╪د╪ز', 'Products'), kind: 'count' },
                { label: L('┘é┘è┘à╪ر ╪د┘┘à╪╣╪▒┘ê╪╢', 'Catalogue value'), kind: 'sumProduct', field: 'stock', field2: 'price' },
                { label: L('┘à╪ز┘ê╪│╪╖ ╪د┘╪│╪╣╪▒', 'Average price'), kind: 'avg', field: 'price' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘à┘╪ز╪ش╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ┘à┘╪ز╪ش ┘à┘ ┘┘ê╪ص╪ر ╪د┘╪ز╪د╪ش╪▒.', 'No products yet ظ¤ add the first one from the merchant panel.'),
        };

        case 'inventory': return {
            kind, engine: 'records',
            title: L('╪د┘┘à╪«╪▓┘ê┘', 'Inventory'),
            lede: L('╪ث╪╡┘╪د┘┘â ┘ê┘â┘à┘è╪د╪ز┘ç╪د ┘ê┘é┘è┘à╪ز┘ç╪د ظ¤ ┘┘è ┘à┘â╪د┘ ┘ê╪د╪ص╪».', 'Your items, their quantities and their value ظ¤ in one place.'),
            entityOne: L('╪╡┘┘', 'item'), entityMany: L('╪د┘╪ث╪╡┘╪د┘', 'Items'),
            fields: [
                f(['name', '╪د┘╪╡┘┘', 'Item', 'text', undefined, ['required', 'primary']], isAr),
                f(['sku', '╪د┘╪▒┘à╪▓', 'SKU', 'text'], isAr),
                f(['qty', '╪د┘┘â┘à┘è╪ر', 'Quantity', 'number', undefined, ['required']], isAr),
                f(['price', '╪│╪╣╪▒ ╪د┘┘ê╪ص╪»╪ر', 'Unit price', 'number'], isAr),
                f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['┘à╪ز┘ê┘╪▒', '┘é╪د╪▒╪ذ ╪╣┘┘ë ╪د┘┘┘╪د╪»', '┘┘╪»'], ['In stock', 'Low', 'Out of stock'], isAr)], isAr),
            ],
            // The supplier used to be a word typed on each item ظ¤ so ┬س╪د┘╪┤╪▒┘â╪ر
            // ╪د┘┘à╪ز╪ص╪»╪ر┬╗ and ┬س╪د┘╪┤╪▒┘â┘ç ╪د┘┘à╪ز╪ص╪»╪ر┬╗ were two suppliers, and a changed
            // phone number had to be chased through the whole table.
            relation: {
                resource: 'suppliers', one: L('┘à┘ê╪▒┘ّ╪»', 'supplier'), many: L('╪د┘┘à┘ê╪▒┘ّ╪»┘ê┘', 'Suppliers'),
                key: 'supplier_id', labelKey: 'name',
                fields: [
                    f(['name', '╪د╪│┘à ╪د┘┘à┘ê╪▒┘ّ╪»', 'Supplier', 'text', undefined, ['required', 'primary']], isAr),
                    f(['phone', '╪د┘┘ç╪د╪ز┘', 'Phone', 'tel'], isAr),
                    f(['email', '╪د┘╪ذ╪▒┘è╪»', 'Email', 'email'], isAr),
                ],
                emptyHint: L('┘╪د ┘à┘ê╪▒┘ّ╪»┘è┘ ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ┘à┘ê╪▒┘ّ╪» ╪س┘à ╪د╪▒╪ذ╪╖ ╪ذ┘ç ╪ث╪╡┘╪د┘┘ç.', 'No suppliers yet ظ¤ add the first one, then link its items.'),
            },
            statusField: 'status',
            metrics: [
                { label: L('╪╣╪»╪» ╪د┘╪ث╪╡┘╪د┘', 'Items'), kind: 'count' },
                { label: L('╪ح╪ش┘à╪د┘┘è ╪د┘┘â┘à┘è╪ر', 'Total quantity'), kind: 'sum', field: 'qty' },
                { label: L('┘é┘è┘à╪ر ╪د┘┘à╪«╪▓┘ê┘', 'Stock value'), kind: 'sumProduct', field: 'qty', field2: 'price' },
            ],
            deps: {},
            emptyHint: L('╪د┘┘à╪«╪▓┘ê┘ ┘╪د╪▒╪║ ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╡┘┘.', 'The inventory is empty ظ¤ add your first item.'),
        };

        case 'booking': {
            const clinic = CLINIC_SIGNAL.test(request);
            return {
            kind, engine: 'records',
            title: L('╪د┘╪ص╪ش┘ê╪▓╪د╪ز', 'Bookings'),
            lede: L('╪د╪ص╪ش╪▓╪î ╪ث┘â┘ّ╪»╪î ┘ê╪ز╪د╪ذ╪╣ ┘à┘ê╪د╪╣┘è╪» ╪د┘┘è┘ê┘à ┘┘è ┘┘ê╪ص╪ر ┘ê╪د╪ص╪»╪ر.', 'Book, confirm and follow today\'s appointments in one board.'),
            entityOne: L('╪ص╪ش╪▓', 'booking'), entityMany: L('╪د┘╪ص╪ش┘ê╪▓╪د╪ز', 'Bookings'),
            fields: [
                f(['name', '╪د┘╪د╪│┘à', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['phone', '╪د┘┘ç╪د╪ز┘', 'Phone', 'tel'], isAr),
                f(['service', '╪د┘╪«╪»┘à╪ر', 'Service', 'text'], isAr),
                f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date', undefined, ['required']], isAr),
                f(['time', '╪د┘┘ê┘é╪ز', 'Time', 'time'], isAr),
                f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['╪ذ╪د┘╪ز╪╕╪د╪▒ ╪د┘╪ز╪ث┘â┘è╪»', '┘à╪ج┘â┘ّ╪»', '┘à┘╪║┘è'], ['Pending', 'Confirmed', 'Cancelled'], isAr)], isAr),
            ],
            // ┬س╪╖╪ذ┘è╪ذ ظ ┘à┘ê╪د╪╣┘è╪»┘ç┬╗: the appointment belongs to a person who has a
            // record of their own ظ¤ a specialty, a phone, a name that can be
            // corrected in ONE place and be right on every past booking.
            relation: {
                resource: 'providers',
                one: clinic ? L('╪╖╪ذ┘è╪ذ', 'doctor') : L('┘à┘é╪»┘ّ┘à ╪د┘╪«╪»┘à╪ر', 'provider'),
                many: clinic ? L('╪د┘╪ث╪╖╪ذ╪د╪ة', 'Doctors') : L('┘à┘é╪»┘ّ┘à┘ê ╪د┘╪«╪»┘à╪ر', 'Providers'),
                key: 'provider_id', labelKey: 'name',
                fields: [
                    f(['name', clinic ? '╪د╪│┘à ╪د┘╪╖╪ذ┘è╪ذ' : '╪د┘╪د╪│┘à', clinic ? 'Doctor' : 'Name', 'text', undefined, ['required', 'primary']], isAr),
                    f(['specialty', clinic ? '╪د┘╪ز╪«╪╡┘ّ╪╡' : '╪د┘╪د╪«╪ز╪╡╪د╪╡', clinic ? 'Specialty' : 'Speciality', 'text'], isAr),
                    f(['phone', '╪د┘┘ç╪د╪ز┘', 'Phone', 'tel'], isAr),
                ],
                emptyHint: clinic
                    ? L('┘╪د ╪ث╪╖╪ذ╪د╪ة ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╖╪ذ┘è╪ذ ╪س┘à ╪د╪ص╪ش╪▓ ┘┘ç ┘à┘ê╪╣╪»╪د┘ï.', 'No doctors yet ظ¤ add the first one, then book them an appointment.')
                    : L('┘╪د ┘à┘é╪»┘ّ┘à┘è ╪«╪»┘à╪ر ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘┘ç┘à ╪س┘à ╪د╪ص╪ش╪▓ ┘┘ç ┘à┘ê╪╣╪»╪د┘ï.', 'No providers yet ظ¤ add the first one, then book an appointment.'),
            },
            statusField: 'status', doneValue: L('┘à╪ج┘â┘ّ╪»', 'Confirmed'),
            metrics: [
                { label: L('┘â┘ ╪د┘╪ص╪ش┘ê╪▓╪د╪ز', 'All bookings'), kind: 'count' },
                { label: L('┘à╪ج┘â┘ّ╪»╪ر', 'Confirmed'), kind: 'countWhere', field: 'status', equals: L('┘à╪ج┘â┘ّ╪»', 'Confirmed') },
                { label: L('╪ص╪ش┘ê╪▓╪د╪ز ╪د┘┘è┘ê┘à', 'Today'), kind: 'todayCount', field: 'date' },
            ],
            deps: {},
            emptyHint: L('┘╪د ╪ص╪ش┘ê╪▓╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ┘à┘ê╪╣╪».', 'No bookings yet ظ¤ add the first appointment.'),
            };
        }

        case 'pos': return {
            kind, engine: 'records',
            title: L('╪د┘┘à╪ذ┘è╪╣╪د╪ز', 'Sales'),
            lede: L('╪│╪ش┘ّ┘ ┘â┘ ╪╣┘à┘┘è╪ر ╪ذ┘è╪╣ ┘ê╪د╪╣╪▒┘ ╪ح┘è╪▒╪د╪» ╪د┘┘è┘ê┘à ┘╪ص╪╕╪ر ╪ذ┘╪ص╪╕╪ر.', 'Ring up every sale and know today\'s revenue as it happens.'),
            entityOne: L('╪╣┘à┘┘è╪ر ╪ذ┘è╪╣', 'sale'), entityMany: L('╪د┘┘à╪ذ┘è╪╣╪د╪ز', 'Sales'),
            fields: [
                f(['item', '╪د┘╪╡┘┘', 'Item', 'text', undefined, ['required', 'primary']], isAr),
                f(['qty', '╪د┘┘â┘à┘è╪ر', 'Quantity', 'number', undefined, ['required']], isAr),
                f(['price', '╪│╪╣╪▒ ╪د┘┘ê╪ص╪»╪ر', 'Unit price', 'number', undefined, ['required']], isAr),
                f(['method', '╪╖╪▒┘è┘é╪ر ╪د┘╪»┘╪╣', 'Payment', 'select', SELECT_AR_EN(['┘┘é╪»┘è', '╪ذ╪╖╪د┘é╪ر', '╪ز╪ص┘ê┘è┘'], ['Cash', 'Card', 'Transfer'], isAr)], isAr),
                f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date'], isAr),
            ],
            statusField: 'method',
            metrics: [
                { label: L('╪ح╪ش┘à╪د┘┘è ╪د┘┘à╪ذ┘è╪╣╪د╪ز', 'Total sales'), kind: 'sumProduct', field: 'qty', field2: 'price' },
                { label: L('┘à╪ذ┘è╪╣╪د╪ز ╪د┘┘è┘ê┘à', 'Sold today'), kind: 'todayCount', field: 'date' },
                { label: L('╪╣╪»╪» ╪د┘╪╣┘à┘┘è╪د╪ز', 'Transactions'), kind: 'count' },
            ],
            deps: {},
            emptyHint: L('┘╪د ┘à╪ذ┘è╪╣╪د╪ز ╪د┘┘è┘ê┘à ظ¤ ╪│╪ش┘ّ┘ ╪ث┘ê┘ ╪╣┘à┘┘è╪ر.', 'No sales yet ظ¤ ring up the first one.'),
        };

        case 'crm': return {
            kind, engine: 'records',
            title: L('╪د┘╪╣┘à┘╪د╪ة', 'Customers'),
            lede: L('┘â┘ ╪╣┘à┘è┘ ┘ê┘à╪▒╪ص┘╪ز┘ç ظ¤ ┘à┘ ╪ث┘ê┘ ╪ز┘ê╪د╪╡┘ ╪ح┘┘ë ╪د┘╪ح╪║┘╪د┘é.', 'Every customer and their stage ظ¤ first touch to closed.'),
            entityOne: L('╪╣┘à┘è┘', 'customer'), entityMany: L('╪د┘╪╣┘à┘╪د╪ة', 'Customers'),
            fields: [
                f(['name', '╪د┘╪د╪│┘à', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['phone', '╪د┘┘ç╪د╪ز┘', 'Phone', 'tel'], isAr),
                f(['email', '╪د┘╪ذ╪▒┘è╪»', 'Email', 'email'], isAr),
                f(['value', '┘é┘è┘à╪ر ╪د┘╪╡┘┘é╪ر', 'Deal value', 'number'], isAr),
                f(['stage', '╪د┘┘à╪▒╪ص┘╪ر', 'Stage', 'select', SELECT_AR_EN(['╪╣┘à┘è┘ ┘à╪ص╪ز┘à┘', '╪ز┘à ╪د┘╪ز┘ê╪د╪╡┘', '╪╣╪▒╪╢ ╪│╪╣╪▒', '┘à╪║┘┘é'], ['Lead', 'Contacted', 'Proposal', 'Closed'], isAr)], isAr),
            ],
            // Several contacts sit inside ONE company; the company is a record
            // with an industry and a website, not a repeated string.
            relation: {
                resource: 'companies', one: L('╪ش┘ç╪ر', 'company'), many: L('╪د┘╪ش┘ç╪د╪ز', 'Companies'),
                key: 'company_id', labelKey: 'name',
                fields: [
                    f(['name', '╪د╪│┘à ╪د┘╪ش┘ç╪ر', 'Company', 'text', undefined, ['required', 'primary']], isAr),
                    f(['sector', '╪د┘┘é╪╖╪د╪╣', 'Sector', 'text'], isAr),
                    f(['website', '╪د┘┘à┘ê┘é╪╣', 'Website', 'text'], isAr),
                ],
                emptyHint: L('┘╪د ╪ش┘ç╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪ش┘ç╪ر ╪س┘à ╪د╪▒╪ذ╪╖ ╪ذ┘ç╪د ╪╣┘à┘╪د╪ة┘ç╪د.', 'No companies yet ظ¤ add the first one, then link its people.'),
            },
            statusField: 'stage', doneValue: L('┘à╪║┘┘é', 'Closed'),
            metrics: [
                { label: L('┘â┘ ╪د┘╪╣┘à┘╪د╪ة', 'All customers'), kind: 'count' },
                { label: L('╪╡┘┘é╪د╪ز ┘à╪║┘┘é╪ر', 'Closed'), kind: 'countWhere', field: 'stage', equals: L('┘à╪║┘┘é', 'Closed') },
                { label: L('┘é┘è┘à╪ر ╪د┘╪╡┘┘é╪د╪ز', 'Pipeline value'), kind: 'sum', field: 'value' },
            ],
            deps: {},
            emptyHint: L('┘╪د ╪╣┘à┘╪د╪ة ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╣┘à┘è┘.', 'No customers yet ظ¤ add the first one.'),
        };

        case 'lms': return {
            kind, engine: 'records',
            title: L('╪د┘╪╖┘╪د╪ذ ┘ê╪د┘╪»╪▒╪ش╪د╪ز', 'Students & grades'),
            lede: L('╪│╪ش┘ّ┘ ╪د┘╪╖┘╪د╪ذ ┘┘è ╪د┘┘à┘ê╪د╪» ┘ê╪ز╪د╪ذ╪╣ ╪»╪▒╪ش╪د╪ز┘ç┘à ┘ê┘à╪╣╪»┘ّ┘┘ç┘à.', 'Enrol students, follow their grades and the average.'),
            entityOne: L('╪ز╪│╪ش┘è┘', 'enrolment'), entityMany: L('╪د┘╪ز╪│╪ش┘è┘╪د╪ز', 'Enrolments'),
            fields: [
                f(['student', '╪د┘╪╖╪د┘╪ذ', 'Student', 'text', undefined, ['required', 'primary']], isAr),
                f(['grade', '╪د┘╪»╪▒╪ش╪ر', 'Grade', 'number'], isAr),
                f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['┘à╪│╪ش┘ّ┘', '┘à┘╪ش╪▓', '┘à┘╪│╪ص╪ذ'], ['Enrolled', 'Completed', 'Withdrawn'], isAr)], isAr),
            ],
            // A course is taught once and enrolled in many times: it owns a
            // teacher and a credit count, and the enrolment points at it.
            relation: {
                resource: 'courses', one: L('┘à╪د╪»╪ر', 'course'), many: L('╪د┘┘à┘ê╪د╪»', 'Courses'),
                key: 'course_id', labelKey: 'title',
                fields: [
                    f(['title', '╪د╪│┘à ╪د┘┘à╪د╪»╪ر', 'Course', 'text', undefined, ['required', 'primary']], isAr),
                    f(['teacher', '╪د┘┘à╪»╪▒┘ّ╪│', 'Teacher', 'text'], isAr),
                    f(['hours', '╪د┘╪│╪د╪╣╪د╪ز', 'Credit hours', 'number'], isAr),
                ],
                emptyHint: L('┘╪د ┘à┘ê╪د╪» ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ┘à╪د╪»╪ر ╪س┘à ╪│╪ش┘ّ┘ ┘┘è┘ç╪د ╪╖┘╪د╪ذ┘â.', 'No courses yet ظ¤ add the first one, then enrol students in it.'),
            },
            statusField: 'status', doneValue: L('┘à┘╪ش╪▓', 'Completed'),
            metrics: [
                { label: L('╪د┘╪ز╪│╪ش┘è┘╪د╪ز', 'Enrolments'), kind: 'count' },
                { label: L('╪د┘┘à╪╣╪»┘ّ┘', 'Average grade'), kind: 'avg', field: 'grade' },
                { label: L('┘à┘╪ش╪▓', 'Completed'), kind: 'countWhere', field: 'status', equals: L('┘à┘╪ش╪▓', 'Completed') },
            ],
            deps: {},
            emptyHint: L('┘╪د ╪ز╪│╪ش┘è┘╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╖╪د┘╪ذ.', 'No enrolments yet ظ¤ add the first student.'),
        };

        case 'contacts': return {
            kind, engine: 'records',
            title: L('╪ش┘ç╪د╪ز ╪د┘╪د╪ز╪╡╪د┘', 'Contacts'),
            lede: L('╪»┘╪ز╪▒ ╪╣┘╪د┘ê┘è┘ ╪ص┘é┘è┘é┘è ظ¤ ╪ذ╪ص╪س ┘┘ê╪▒┘è ┘ê╪د╪ز╪╡╪د┘ ╪ذ╪╢╪║╪╖╪ر.', 'A real address book ظ¤ instant search, one-tap dialling.'),
            entityOne: L('╪ش┘ç╪ر ╪د╪ز╪╡╪د┘', 'contact'), entityMany: L('╪ش┘ç╪د╪ز ╪د┘╪د╪ز╪╡╪د┘', 'Contacts'),
            fields: [
                f(['name', '╪د┘╪د╪│┘à', 'Name', 'text', undefined, ['required', 'primary']], isAr),
                f(['phone', '╪د┘┘ç╪د╪ز┘', 'Phone', 'tel', undefined, ['required']], isAr),
                f(['email', '╪د┘╪ذ╪▒┘è╪»', 'Email', 'email'], isAr),
                f(['group', '╪د┘┘à╪ش┘à┘ê╪╣╪ر', 'Group', 'select', SELECT_AR_EN(['╪╣╪د╪خ┘╪ر', '╪╣┘à┘', '╪ث╪╡╪»┘é╪د╪ة', '╪ث╪«╪▒┘ë'], ['Family', 'Work', 'Friends', 'Other'], isAr)], isAr),
                f(['note', '┘à┘╪د╪ص╪╕╪ر', 'Note', 'textarea'], isAr),
            ],
            statusField: 'group',
            metrics: [{ label: L('╪╣╪»╪» ╪ش┘ç╪د╪ز ╪د┘╪د╪ز╪╡╪د┘', 'Contacts'), kind: 'count' }],
            deps: {},
            emptyHint: L('╪د┘╪»┘╪ز╪▒ ┘╪د╪▒╪║ ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪ش┘ç╪ر ╪د╪ز╪╡╪د┘.', 'The book is empty ظ¤ add the first contact.'),
        };

        case 'calculator': return {
            kind, engine: 'calculator',
            title: L('╪د┘╪ت┘╪ر ╪د┘╪ص╪د╪│╪ذ╪ر', 'Calculator'),
            lede: L('╪د╪ص╪│╪ذ ╪ذ╪│╪▒╪╣╪ر╪î ╪▒╪د╪ش╪╣ ╪ت╪«╪▒ ╪╣┘à┘┘è╪د╪ز┘â╪î ┘ê╪د╪╣┘à┘ ╪ذ╪س┘é╪ر ╪╣┘┘ë ╪د┘┘ç╪د╪ز┘ ╪ث┘ê ╪│╪╖╪ص ╪د┘┘à┘â╪ز╪ذ.',
                'Calculate quickly, review recent operations, and stay confident on phone or desktop.'),
            entityOne: L('╪╣┘à┘┘è╪ر', 'calculation'), entityMany: L('╪د┘╪╣┘à┘┘è╪د╪ز ╪د┘╪ث╪«┘è╪▒╪ر', 'Recent calculations'),
            fields: [],
            metrics: [],
            deps: {},
            emptyHint: L('┘╪د ╪ز┘ê╪ش╪» ╪╣┘à┘┘è╪د╪ز ╪ذ╪╣╪» ظ¤ ╪د╪ذ╪»╪ث ╪ذ╪╣┘à┘┘è╪ر ╪ص╪│╪د╪ذ┘è╪ر.', 'No calculations yet ظ¤ start an operation.'),
        };

        case 'custom': return {
            kind, engine: 'custom',
            title: L('╪د┘╪ز╪╖╪ذ┘è┘é', 'Application'),
            lede: L('╪ز╪╖╪ذ┘è┘é ┘à╪«╪╡╪╡ ┘à╪ذ┘┘è ┘à┘ ┘à╪ز╪╖┘╪ذ╪د╪ز┘â ┘à╪ذ╪د╪┤╪▒╪ر.', 'A custom application authored directly from your requirements.'),
            entityOne: L('╪╣┘╪╡╪▒', 'item'), entityMany: L('╪د┘╪╣┘╪د╪╡╪▒', 'Items'),
            fields: [], metrics: [], deps: {},
            emptyHint: L('┘╪د ╪ز┘ê╪ش╪» ╪ذ┘è╪د┘╪د╪ز ╪ذ╪╣╪».', 'No data yet.'),
        };

        case 'habits': return {
            kind, engine: 'records',
            title: L('╪د┘╪╣╪د╪»╪د╪ز', 'Habits'),
            lede: L('╪╣╪د╪»╪ر ┘ê╪د╪ص╪»╪ر ┘â┘ ┘è┘ê┘à ظ¤ ┘ê╪│╪ش┘┘ّ ┘è╪س╪ذ╪ز ╪د┘╪ز╪▓╪د┘à┘â.', 'One habit a day ظ¤ and a log that proves the streak.'),
            entityOne: L('╪╣╪د╪»╪ر', 'habit'), entityMany: L('╪د┘╪╣╪د╪»╪د╪ز', 'Habits'),
            fields: [
                f(['title', '╪د┘╪╣╪د╪»╪ر', 'Habit', 'text', undefined, ['required', 'primary']], isAr),
                f(['repeat', '╪د┘╪ز┘â╪▒╪د╪▒', 'Repeat', 'select', SELECT_AR_EN(['┘è┘ê┘à┘è', '╪ث╪│╪ذ┘ê╪╣┘è'], ['Daily', 'Weekly'], isAr)], isAr),
                f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date'], isAr),
                f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['┘é┘è╪» ╪د┘┘à╪ز╪د╪ذ╪╣╪ر', '╪ز┘à┘ّ╪ز ╪د┘┘è┘ê┘à'], ['Tracking', 'Done today'], isAr)], isAr),
            ],
            statusField: 'status', doneValue: L('╪ز┘à┘ّ╪ز ╪د┘┘è┘ê┘à', 'Done today'),
            metrics: [
                { label: L('╪د┘╪╣╪د╪»╪د╪ز', 'Habits'), kind: 'count' },
                { label: L('╪ز┘à┘ّ╪ز ╪د┘┘è┘ê┘à', 'Done today'), kind: 'countWhere', field: 'status', equals: L('╪ز┘à┘ّ╪ز ╪د┘┘è┘ê┘à', 'Done today') },
            ],
            deps: {},
            emptyHint: L('┘╪د ╪╣╪د╪»╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪╣╪د╪»╪ر ╪ز╪▒┘è╪» ╪د┘╪د┘╪ز╪▓╪د┘à ╪ذ┘ç╪د.', 'No habits yet ظ¤ add the first one you want to keep.'),
        };

        default: {
        /**
         * THE COLUMNS HE NAMED, WHEN HE NAMED THEM.
         *
         * The canned five below are a starting point for a request that
         * describes no schema. When the request DOES list its columns, that
         * list wins ظ¤ and the totals follow it: a quantity beside a price is a
         * stock value, and saying so is arithmetic, not a guess.
         */
        const asked = fieldsFromRequest(request, isAr);
        /**
         * METRICS BIND TO ROLES, NOT TO NAMES.
         *
         * The first version matched keys it had invented ظ¤ `qty`, `buyPrice`,
         * `sellPrice` ظ¤ which is the same disease as relabelling his columns:
         * it worked for the request it was written from. A column's ROLE is
         * what a total needs to know. ┬س╪د┘┘â┘à┘è╪ر┬╗, ┬س╪╣╪»╪» ╪د┘┘╪│╪«┬╗ and ┬سquantity┬╗ are
         * all counts; ┬س╪│╪╣╪▒ ╪د┘╪┤╪▒╪د╪ة┬╗, ┬س╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪»┘┘ê╪╣┬╗ and ┬سunit price┬╗ are all
         * money. The arithmetic is the same in every shop, clinic and farm.
         *
         * And the label of each total is built from HIS words, so a clinic
         * never reads ┬س╪▒╪ث╪│ ╪د┘┘à╪د┘┬╗ about its fees.
         */
        const cols = columnsAnywhereInHisRequest(request) || [];
        const counts = cols.filter(c => c.role === 'count');
        const monies = cols.filter(c => c.role === 'money');
        const wantsTotal = /┘à╪ش┘à┘ê╪╣|╪د╪ش┘à╪د┘┘è|╪ح╪ش┘à╪د┘┘è|┘é┘è┘à╪ر\s*╪د┘|┘â┘à\s|\btotal\b|\bsum\b|how much/iu.test(request);
        const derivedMetrics: AppMetric[] = asked
            ? [
                { label: L('╪╣╪»╪» ╪د┘╪│╪ش┘╪د╪ز', 'Records'), kind: 'count' },
                ...(wantsTotal && counts[0] && monies[0]
                    ? [{ label: `${L('╪ح╪ش┘à╪د┘┘è', 'Total')} ${counts[0].label} ├ù ${monies[0].label}`,
                        kind: 'sumProduct', field: counts[0].key, field2: monies[0].key } as AppMetric] : []),
                ...(wantsTotal && counts[0] && monies[1]
                    ? [{ label: `${L('╪د┘┘╪▒┘é ╪ذ┘è┘', 'Margin between')} ${monies[1].label} ${L('┘ê', 'and')} ${monies[0].label}`,
                        kind: 'sumMargin', field: counts[0].key, field2: monies[1].key, field3: monies[0].key } as AppMetric] : []),
                ...(wantsTotal && !counts[0] && monies[0]
                    ? [{ label: `${L('┘à╪ش┘à┘ê╪╣', 'Total')} ${monies[0].label}`, kind: 'sum', field: monies[0].key } as AppMetric] : []),
                ...(counts[0]
                    ? [{ label: `${L('┘à╪ش┘à┘ê╪╣', 'Total')} ${counts[0].label}`, kind: 'sum', field: counts[0].key } as AppMetric] : []),
            ]
            : [];
        /**
         * ┬س┘ê╪ح╪░╪د ┘â┘à┘è╪ر ┘é╪╖╪╣╪ر ╪╡╪د╪▒╪ز ╪ث┘é┘ ┘à┘ 3 ┘è╪╡┘è╪▒ ┘┘ê┘┘ç╪د ╪ث╪ص┘à╪▒ ╪╣╪┤╪د┘ ╪ث┘╪ز╪ذ┘ç┬╗
         *
         * His threshold, his number, on whichever column counts ظ¤ read from the
         * sentence, never defaulted, and only when he also asked to be warned.
         */
        const lowStockMatch = /(?:╪د┘é┘|╪ث┘é┘|╪ز╪ص╪ز|╪»┘ê┘|less\s+than|under|below|<)\s*(?:┘à┘\s*)?(\d{1,4})/iu.exec(request);
        const wantsAlert = /(╪د╪ص┘à╪▒|╪ث╪ص┘à╪▒|╪ذ╪د┘╪د╪ص┘à╪▒|╪ذ╪د┘╪ث╪ص┘à╪▒|\bred\b|╪ز┘╪ذ┘è┘ç|╪د┘╪ز╪ذ┘ç|╪ث┘╪ز╪ذ┘ç|\bwarn|\balert)/iu.test(request);
        const lowStock = (counts[0] && lowStockMatch && wantsAlert)
            ? { field: counts[0].key, below: Number(lowStockMatch[1]) }
            : undefined;
        const recordFields = asked || [
            f(['title', '╪د┘╪╣┘┘ê╪د┘', 'Title', 'text', undefined, ['required', 'primary']], isAr),
            f(['details', '╪د┘╪ز┘╪د╪╡┘è┘', 'Details', 'textarea'], isAr),
            f(['amount', '┘é┘è┘à╪ر', 'Value', 'number'], isAr),
            f(['date', '╪د┘╪ز╪د╪▒┘è╪«', 'Date', 'date'], isAr),
            f(['status', '╪د┘╪ص╪د┘╪ر', 'Status', 'select', SELECT_AR_EN(['╪ش╪»┘è╪»', '┘é┘è╪» ╪د┘╪╣┘à┘', '┘à┘╪ش╪▓'], ['New', 'In progress', 'Done'], isAr)], isAr),
        ];
        const requestedFilters = requestedFilterFields(request, recordFields);
        const progress = wantsProgressMetric(request)
            ? { label: L('┘╪│╪ذ╪ر ╪د┘╪ز┘é╪»┘à', 'Progress'), kind: 'progress' as const, field: 'status', equals: L('┘à┘╪ش╪▓', 'Done') }
            : undefined;
        return {
            kind: 'generic', engine: 'records',
            title: subject || L('╪د┘╪│╪ش┘╪د╪ز', 'Records'),
            lede: L('╪ث╪╢┘╪î ╪╣╪»┘ّ┘╪î ╪د╪ذ╪ص╪س╪î ┘ê╪╡╪»┘ّ╪▒ ظ¤ ╪ز╪╖╪ذ┘è┘é ┘è╪╣┘à┘ ┘╪╣┘╪د┘ï ┘╪د ╪╡┘╪ص╪ر ╪ز╪ز╪ص╪»╪س ╪╣┘┘ç.',
                'Add, edit, search and export ظ¤ an app that works, not a page about one.'),
            entityOne: L('╪│╪ش┘┘ّ', 'record'), entityMany: subject || L('╪د┘╪│╪ش┘╪د╪ز', 'Records'),
            fields: recordFields,
            statusField: 'status', doneValue: L('┘à┘╪ش╪▓', 'Done'),
            filterFields: requestedFilters.length ? requestedFilters : undefined,
            lowStock,
            metrics: [
                ...derivedMetrics,
                ...(progress ? [progress] : []),
                ...(derivedMetrics.length || progress ? [] : [
                { label: L('┘â┘ ╪د┘╪│╪ش┘╪د╪ز', 'All records'), kind: 'count' },
                { label: L('┘à┘╪ش╪▓', 'Done'), kind: 'countWhere', field: 'status', equals: L('┘à┘╪ش╪▓', 'Done') },
                { label: L('╪ث┘╪╢┘è┘ ╪د┘┘è┘ê┘à', 'Added today'), kind: 'todayCount', field: 'createdAt' },
                ]),
            ] as AppMetric[],
            deps: {},
            emptyHint: L('┘╪د ╪│╪ش┘╪د╪ز ╪ذ╪╣╪» ظ¤ ╪ث╪╢┘ ╪ث┘ê┘ ╪│╪ش┘┘ّ ┘à┘ ╪د┘┘┘à┘ê╪░╪ش.', 'No records yet ظ¤ add the first one in the form.'),
        };
        }
    }
}


/* ظ¤ظ¤ the schema the request itself dictates ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ */

/**
 * HIS WORDS, HIS COLUMNS ظ¤ WHATEVER HE IS TALKING ABOUT.
 *
 * The first version of this reader carried a table of MEANINGS: ┬س╪│╪╣╪▒ ╪د┘╪┤╪▒╪د╪ة┬╗
 * became `buyPrice` and was relabelled ┬س╪│╪╣╪▒ ╪د┘╪┤╪▒╪د╪ة┬╗, ┬س┘â┘à┘è╪ر┬╗ became `qty` and
 * was relabelled ┬س╪د┘┘â┘à┘è╪ر┬╗. It read the request that built it and degraded on
 * every other one. Measured across three domains it had never seen:
 *
 *     ╪╣┘è╪د╪»╪ر ╪ث╪│┘╪د┘   ┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗ -> ┬س╪د┘╪د╪│┘à┬╗    ┬س╪▒┘é┘à ╪ز┘┘┘ê┘┘ç┬╗ -> ┬س╪د┘╪▒┘é┘à┬╗
 *                   ┬س┘ê┘é╪ز ╪د┘┘à┘ê╪╣╪»┬╗ -> plain text  ┬س╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪»┘┘ê╪╣┬╗ -> ┬س╪د┘╪│╪╣╪▒┬╗
 *     ┘à┘â╪ز╪ذ╪ر        ┬س╪د╪│┘à ╪د┘┘à╪ج┘┘┬╗ -> ┬س╪د┘╪د╪│┘à┬╗    ┬س╪│┘╪ر ╪د┘╪ح╪╡╪»╪د╪▒┬╗ -> plain text
 *     ┘à╪▓╪▒╪╣╪ر        ┬س┘â┘à┘è╪ر ╪د┘╪ص┘┘è╪ذ┬╗ -> ┬س╪د┘┘â┘à┘è╪ر┬╗   ┬س┘ê╪▓┘┘ç╪د┬╗ -> plain text
 *
 * A phone number became a part number. A patient's name became ┬س╪د┘╪د╪│┘à┬╗. That
 * is a memorised prompt wearing the costume of understanding, and the owner
 * named it as law: Joe builds ANY request, it does not rehearse a few.
 *
 * So the reader keeps exactly one thing from him and infers exactly one thing
 * itself:
 *
 *   ┬╖ THE LABEL IS HIS, always, unchanged. ┬س┘â┘à┘è╪ر ╪د┘╪ص┘┘è╪ذ┬╗ stays ┬س┘â┘à┘è╪ر ╪د┘╪ص┘┘è╪ذ┬╗.
 *   ┬╖ THE TYPE is inferred from a small CLOSED vocabulary ظ¤ the input types a
 *     form can have at all, not a list of things people might record. There
 *     are nine of those and infinitely many of the other, which is exactly why
 *     one of them can be a table and the other cannot.
 *
 * The key is mechanical, derived from the role its type implies, so metrics can
 * bind to ┬سthe money column┬╗ without ever knowing what the money is for.
 */
type DerivedRole = 'money' | 'count' | 'scalar' | 'date' | 'time' | 'tel' | 'email' | 'flag' | 'note' | 'image' | 'text';

/** Closed vocabulary: what KIND of value this is, never what it is called. */
/**
 *  A COLUMN THAT ASKS A QUESTION IS A YES OR A NO.
 *
 *  Measured live. He answered Joeظآs question with ┬س╪د╪│┘à ╪د┘┘à╪»┘è┘ ┘ê╪د┘┘à╪ذ┘╪║
 *  ┘ê╪ز╪د╪▒┘è╪« ╪د┘╪»┘è┘ ┘ê┘ç┘ ╪ز┘à ╪د┘╪│╪»╪د╪»┬╗ and got four columns ظ¤ three right, and a
 *  free-text box labelled ┬س┘ç┘ ╪ز┘à ╪د┘╪│╪»╪د╪»┬╗. He would have had to type the
 *  word ┬س┘╪╣┘à┬╗ into it, and no total could ever count it.
 *
 *  The signal is grammatical and needs no list of states: a label that
 *  OPENS WITH AN INTERROGATIVE ظ¤ ┬س┘ç┘┬╗, ┬سis┬╗, ┬سhas┬╗, ┬سdid┬╗ ظ¤ or ends in a
 *  question mark is a question, and a column that asks a question holds an
 *  answer of yes or no. A handful of past participles people write instead
 *  of the question (┬س┘à╪»┘┘ê╪╣┬╗, ┬س╪ز┘à ╪د┘╪»┘╪╣┬╗, `paid`, `done`) are the same
 *  column with the question left implicit.
 */
const ASKS_YES_OR_NO = /^(?:┘ç┘|is|are|was|were|has|have|did|does)(?=$|\s)|[?╪ا]\s*$|^(?:╪ز┘à|┘à╪»┘┘ê╪╣|┘à╪»┘┘ê╪╣╪ر|┘à╪│╪»╪»|┘à╪│╪»┘ّ╪»|┘à┘╪ش╪▓|┘à┘â╪ز┘à┘|┘à╪║┘┘é|paid|done|completed|settled|closed|shipped|delivered)(?=$|\s)/iu;

const TYPE_MARKS: Array<[RegExp, DerivedRole, FieldType]> = [
    [ASKS_YES_OR_NO, 'flag', 'select'],
    [/╪╡┘ê╪▒╪ر|╪╡┘ê╪▒|┘à┘┘\s*┘ê╪│╪د╪خ╪╖|\bimage\b|\bphoto\b|\bpicture\b|media\s*file/iu, 'image', 'image'],
    [/status|state|┘à╪▒╪ص┘╪ر|╪ص╪د┘╪ر|┘ê╪╢╪╣/iu, 'flag', 'select'],
    [/╪ز┘┘┘ê┘|┘ç╪د╪ز┘|╪ش┘ê╪د┘|┘à┘ê╪ذ╪د┘è┘|┘ê╪د╪ز╪│|\bphone\b|\bmobile\b|\btel\b|whatsapp/iu, 'tel', 'tel'],
    [/╪د┘è┘à┘è┘|╪ح┘è┘à┘è┘|╪ذ╪▒┘è╪»\s*╪د┘┘â╪ز╪▒┘ê┘┘è|╪ذ╪▒┘è╪»\s*╪ح┘┘â╪ز╪▒┘ê┘┘è|\bemail\b|\be-?mail\b/iu, 'email', 'email'],
    [/╪ز╪د╪▒┘è╪«|┘è┘ê┘à\s|╪د┘╪ز┘ç╪د╪ة|╪╡┘╪د╪ص┘è╪ر|\bdate\b|\bday\b|\bexpiry\b|\bexpiration\b|\bexpires?\b|\bdeadline\b|\bdue\s+date\b/iu, 'date', 'date'],
    [/┘ê┘é╪ز|╪│╪د╪╣╪ر|┘à┘ê╪╣╪»|\btime\b|\bhour\b/iu, 'time', 'time'],
    [/╪│╪╣╪▒|┘à╪ذ┘╪║|╪ز┘â┘┘╪ر|╪س┘à┘|┘é┘è┘à╪ر|╪▒╪د╪ز╪ذ|╪د╪ش╪▒╪ر|╪ث╪ش╪▒╪ر|╪▒╪│┘ê┘à|╪»┘╪╣|┘à╪»┘┘ê╪╣|\bprice\b|\bamount\b|\bcost\b|\bfee\b|\bsalary\b|\bpaid\b|\btotal\b/iu, 'money', 'number'],
    //  A year and an age are numbers you read, not quantities you add.
    //  Summing ┬س╪│┘╪ر ╪د┘╪ح╪╡╪»╪د╪▒┬╗ yields a number that means nothing, and printing
    //  it as a total is a confident lie about the user's own data.
    [/╪│┘╪ر|╪╣╪د┘à|╪╣┘à╪▒|╪╡┘╪ص╪د╪ز?|\byear\b|\bage\b|\bpages?\b/iu, 'scalar', 'number'],
    [/╪ز┘é┘è┘è┘à|╪ز┘é╪»┘è╪▒|┘╪ش┘ê┘à|\brating\b|\bscore\b/iu, 'scalar', 'number'],
    [/┘â┘à┘è|╪╣╪»╪»|┘ê╪▓┘|╪╖┘ê┘|╪╣╪▒╪╢|╪د╪▒╪ز┘╪د╪╣|┘à╪│╪د╪ص╪ر|┘╪│╪ذ|╪│╪╣╪ر|┘à┘é╪د╪╣╪»|╪ص╪╢┘ê╪▒|\bcapacity\b|\bseats?\b|\battendees?\b|\bqty\b|\bquantity\b|\bcount\b|\bweight\b|\bsize\b/iu, 'count', 'number'],
    [/┘à┘╪د╪ص╪╕|┘ê╪╡┘|╪ز┘╪د╪╡┘è┘|╪┤╪▒╪ص|╪ز╪╣┘┘è┘é|\bnote\b|\bdescription\b|\bdetails\b|\bcomment\b/iu, 'note', 'textarea'],
];

export interface DerivedField { label: string; key: string; type: FieldType; role: DerivedRole; options?: string[]; min?: number; minExclusive?: boolean; control?: 'toggle' }

/** A condition he stated, and the field it is about. */
/**
 *  Words that open a clause without naming anything in it. The Arabic side
 *  needs no twin: its test is the definite article, which a conjunction
 *  cannot wear.
 */
const NOT_A_FIELD_NAME = new Set([
    'and', 'or', 'but', 'the', 'a', 'an', 'also', 'then', 'plus', 'with', 'so',
    'it', 'this', 'that', 'they', 'there', 'here', 'each', 'every', 'all', 'any',
    'if', 'when', 'while', 'where', 'which', 'who', 'is', 'are', 'be', 'was',
    'must', 'should', 'shall', 'may', 'can', 'do', 'does', 'not', 'no', 'never',
    'please', 'make', 'build', 'create', 'add', 'set', 'use', 'ensure', 'keep',
    'let', 'give', 'show', 'allow', 'reject', 'accept', 'run', 'open',
]);

export interface StatedRule {
    text: string;
    field?: string;
    min?: number;
    minExclusive?: boolean;
    /**  ┬س┘ر ╪ث╪▒┘é╪د┘à┬╗ ظ¤ a floor on the COUNT of characters, not on the value. */
    minLength?: number;
    /**
     *  What KIND of rule it is, because the three cannot be judged alike.
     *
     *    bound   ظ¤ a number the value may not cross (┬س┘╪د ╪ز┘é╪ذ┘ ┘à╪ذ┘╪║┘ï╪د ╪╡┘╪▒┘ï╪د┬╗)
     *    forbid  ظ¤ a thing that must not be there (┬س┘ê┘╪د ╪ز╪╢┘ ╪╡┘╪ص╪ر ╪ز╪│╪ش┘è┘ ╪»╪«┘ê┘┬╗)
     *    require ظ¤ a thing that must be (┬س┘ê╪د╪ش╪╣┘ ╪د┘╪ز╪╡┘à┘è┘à ╪»╪د┘â┘┘ï╪د┬╗)
     *
     *  Only `bound` can be turned into a field constraint. The other two are
     *  returned all the same: a condition Joe cannot apply must be SAID, and
     *  before this they were not even read.
     */
    //  `change` is fourth on purpose: ┬س╪ث╪╣╪» ╪ز╪│┘à┘è╪ر┬╗ is a change and ┬س╪د╪ش╪╣┘┬╗
    //  is a requirement, and a clause that is both is more usefully read as
    //  the change ظ¤ it names a thing that must be different afterwards.
    kind?: 'bound' | 'forbid' | 'require' | 'change';
}

/**
 *  A RULE STATED AFTER ┬س┘ê┬╗ WITH NO COMMA IS STILL ITS OWN CLAUSE.
 *
 *  statedRules split the request on punctuation and then stripped a leading
 *  ┬س┘ê┬╗. Nobody writes a comma before a condition:
 *
 *      ┬س╪د╪╣┘à┘ ┘à┘ê┘é╪╣ ╪┤╪▒┘â╪ر ╪ز┘╪╕┘è┘ ┘ê┘╪د ╪ز┘é╪ذ┘ ┘à╪ذ┘╪║┘ï╪د ╪╡┘╪▒┘ï╪د┬╗
 *
 *  is ONE clause by that split, so the rule's own text came back as the whole
 *  request ظ¤ the sentence that asked for it standing in for the thing asked.
 *  Measured across a thousand requests, tier 5 (┬سan explicit condition┬╗) read
 *  clean 5% of the time: the condition was not obeyed, not checked, and not
 *  mentioned.
 *
 *  So the split happens before a ┬س┘ê┬╗ that OPENS a rule, and only there. It is
 *  a short list of verbs on purpose ظ¤ ┬س┘ê╪د┘┘à╪ذ┘╪║┬╗ in a column list must not
 *  split, and ┬س┘ê╪د┘╪د╪│╪ز╪▒╪ش╪د╪╣┬╗ must stay attached to ┬س╪د┘╪┤╪ص┘┬╗. A rule begins with
 *  a prohibition or an instruction, never with a noun.
 */
const A_RULE_OPENS_HERE = new RegExp(
    '\\s\u0648(?=(?:\u0644\u0627|\u0623\u0644\u0627|\u0627\u0644\u0627|\u0628\u062f\u0648\u0646|\u062f\u0648\u0646|\u064a\u062c\u0628|\u0644\u0627\u0632\u0645|\u0627\u0645\u0646\u0639|\u0627\u0631\u0641\u0636|\u0627\u062c\u0639\u0644|\u064a\u0643\u0648\u0646|\u062a\u0643\u0648\u0646|\u062a\u0623\u0643\u062f|\u062a\u0627\u0643\u062f|\u0627\u062d\u0631\u0635)\\s)',
    'gu',
);

/** The clauses he wrote, with a rule after ┬س┘ê┬╗ counted as one of them. */
export function hisClauses(requestRaw: string): string[] {
    return String(requestRaw || '')
        .replace(A_RULE_OPENS_HERE, '\u0000')
        //  AND A COLON IS A SEPARATOR ظ¤ it was not one, and that alone hid a
        //  whole tier. The way anyone states an edit is ┬س┘┘è ┘à┘ê┘é╪╣ ┘â╪░╪د: ╪د┘╪╣┘
        //  ┘â╪░╪د┬╗; without the colon here the sentence stayed one clause opening
        //  with ┬س┘┘è┬╗, so ┬س╪د╪ش╪╣┘ ╪د┘╪«╪╖ ╪ث┘â╪ذ╪▒┬╗ never opened anything. Measured
        //  across a thousand requests: every edit phrased that way derived
        //  nothing at all.
        .split(/[\u0000╪î,╪ؤ;:.\n]|ظ¤/)
        .map(c => c.trim().replace(/^┘ê\s*/u, '').trim())
        .filter(Boolean);
}

/**
 *  THE OPENER MUST END WHERE A WORD ENDS ظ¤ AND `\b` CANNOT SAY THAT IN ARABIC.
 *
 *  JavaScript defines `\b` by `\w` = [A-Za-z0-9_], so between two Arabic
 *  letters there is never a `\b` position at all. `^┘╪د\b` does not match ┬س┘╪د
 *  ╪ز╪╢┘┬╗ ظ¤ the space after ┬س┘╪د┬╗ is a non-word character and so is ┬س╪د┬╗, so no
 *  boundary falls between them. Written that way, every prohibition in this
 *  file read as no rule at all.
 *
 *  And without an end to the opener, ┬س┘╪د┬╗ matches inside ┬س┘╪د╪▓┘à┬╗ and ┬س╪د┘╪د┬╗
 *  matches inside ┬س╪د┘╪د╪│╪ز╪▒╪ش╪د╪╣┬╗ ظ¤ measured: ┬س╪╡┘╪ص╪ر ╪د┘╪┤╪ص┘ ┘ê╪د┘╪د╪│╪ز╪▒╪ش╪د╪╣┬╗ split into
 *  two, and a column he named became a clause.
 *
 *  So the openers end explicitly: a space, or the end of the clause.
 */
const ENDS_A_WORD = '(?=\\s|$)';
const FORBIDS = new RegExp('^(?:┘╪د|╪ث┘╪د|╪د┘╪د|╪ذ╪»┘ê┘|╪»┘ê┘|╪د┘à┘╪╣|╪د╪▒┘╪╢|┘è┘à┘╪╣|┘è╪▒┘╪╢|no|never|without)' + ENDS_A_WORD
    + "|^(?:don'?t|do not)" + ENDS_A_WORD, 'iu');
const REQUIRES = new RegExp('^(?:┘è╪ش╪ذ|┘╪د╪▓┘à|╪د╪ش╪╣┘|╪د╪ش╪╣┘┘ç|╪د╪ش╪╣┘┘ç╪د|┘è┘â┘ê┘|╪ز┘â┘ê┘|╪ز╪ث┘â╪»|╪ز╪د┘â╪»|╪د╪ص╪▒╪╡|must|make|ensure|should)' + ENDS_A_WORD, 'iu');

/**
 *  A CHANGE HE ASKED FOR IS A THING THAT MUST BE TRUE AFTERWARDS.
 *
 *  ┬س╪د╪ص╪░┘ ┘é╪│┘à ╪د┘╪ت╪▒╪د╪ة┬╗ ┬╖ ┬س╪║┘è┘ّ╪▒ ╪د┘┘┘ê┘ ╪ح┘┘ë ╪ث╪▓╪▒┘é ┘╪د╪ز╪ص┬╗ ┬╖ ┬س╪ث╪╢┘ ╪╣┘à┘ê╪» ╪د┘┘à┘╪د╪ص╪╕╪د╪ز┬╗
 *
 *  Each states a change, and a change is checkable in the way a condition
 *  is: either the built thing shows it afterwards or it does not. Measured
 *  across a thousand requests, the tier that edits an existing build derived
 *  nothing for four of its eight verbs ظ¤ so the edit was carried out on
 *  trust and reported as done with nothing behind the word.
 */
const EDIT_OPENS = new RegExp(
    '^(?:╪ث╪╢┘|╪د╪╢┘|╪╢┘è┘|╪ث╪╢┘è┘|╪د╪╢┘è┘|╪║┘è┘ّ╪▒|╪║┘è╪▒|╪ذ╪»┘ّ┘|╪ذ╪»┘|╪د╪ص╪░┘|╪د┘à╪│╪ص|╪ث╪▓┘|╪د╪▓┘|╪╣╪»┘ّ┘|╪╣╪»┘|╪ث╪╣╪»|╪د╪╣╪»|╪╢╪╣|╪ص╪»┘ّ╪س|╪ص╪»╪س'
    + '|add|change|remove|delete|rename|update|replace|set)' + ENDS_A_WORD, 'iu');

/** Does this clause ask for a CHANGE to something that already exists? */
export function clauseChanges(clause: string): boolean {
    return EDIT_OPENS.test(String(clause || '').trim());
}

/** Does this clause FORBID something rather than ask for it? */
export function clauseForbids(clause: string): boolean {
    return FORBIDS.test(String(clause || '').trim());
}

/** Does it state a requirement ظ¤ a thing that must be so? */
function clauseRequires(clause: string): boolean {
    return REQUIRES.test(String(clause || '').trim());
}

/**
 *  A RULE THAT IS NEITHER KEPT NOR CONFESSED.
 *
 *  Live round on his machine:
 *
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒╪î ┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗
 *
 *  Three columns arrived, correctly, and the condition vanished. Measured
 *  in the generated project:
 *
 *      { key: 'money1', label: '╪د┘╪│╪╣╪▒', type: 'number', required: true }
 *          ظ¤ no min, no bound of any kind
 *      RecordsApp.jsx:28
 *          if (field.type !== 'number' || field.min === undefined) return false;
 *
 *  The app SHIPS the guard. Nothing ever fills the value it reads, so
 *  zero is accepted ظ¤ the exact thing he forbade. And the ledger said
 *  ┬س3 of what I know how to prove is proven┬╗, naming three columns and
 *  never the rule, so the report was true and useless at the same time.
 *
 *  isAName already RECOGNISES the sentence as a rule ظ¤ that is how it
 *  keeps ┬س┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗ out of the column list. It recognised it
 *  and dropped it on the floor.
 *
 *  So a rule is read, and what can be turned into a bound is turned into
 *  one. What cannot is still returned, because a condition Joe cannot
 *  apply must be SAID rather than silently lost ظ¤ that is the whole of
 *  the difference between a report and a receipt.
 */
/**
 *  A COLUMN IS NOT THE WORD FOR THE THING THAT HOLDS IT.
 *
 *  Lowering the floor to two ظ¤ because he named the container ظ¤ let a
 *  QUESTION through:
 *
 *      ┬س┘à╪د ╪د┘┘╪▒┘é ╪ذ┘è┘ ╪د┘╪ش╪»┘ê┘ ┘ê╪د┘┘é╪د╪خ┘à╪ر ┘ê╪د┘╪│╪ش┘╪ا┬╗
 *        ظْ columns: ┬س╪د┘┘é╪د╪خ┘à╪ر┬╗, ┬س╪د┘╪│╪ش┘┬╗
 *
 *  Three container words, compared with each other, read as a schema of
 *  two. Nobody puts a column called ┬س╪د┘╪ش╪»┘ê┘┬╗ inside his ╪ش╪»┘ê┘, and that is
 *  the whole rule ظ¤ no list of question words, no punctuation trick, and
 *  nothing that would break ┬سظخ┘ê┘ç┘ ╪د┘╪ز┘ç╪ز╪ا┬╗, a real build request that ends
 *  in a question mark because his last column asks one.
 *
 *  It reads the same RECORD_CONTAINER the rest of this file reads.
 */
function notAContainerItself(label: string): boolean {
    const bare = String(label || '').trim().replace(/^╪د┘(?=[╪ة-┘è])/u, '');
    if (!bare) return false;
    const hit = RECORD_CONTAINER.exec(bare);
    //  Only when the container word IS the whole label: ┬س╪ش╪»┘ê┘ ╪د┘┘à┘ç╪د┘à┬╗ is a
    //  name he chose, ┬س╪د┘╪ش╪»┘ê┘┬╗ on its own is the word for the box.
    return !(hit && hit[0].length === bare.length);
}

export function statedRules(requestRaw: string): StatedRule[] {
    const request = String(requestRaw || '');
    const out: StatedRule[] = [];
    //  Rules are stated as their own clause, after a comma or ┬س┘ê┬╗ ظ¤ and
    //  hisClauses is the one place that knows where a clause begins. It
    //  used to split on punctuation alone, so a condition joined by ┬س┘ê┬╗
    //  with no comma was never separated from the request that carried it.
    for (const clause of hisClauses(request)) {
        //  READS_AS_A_RULE is a list of NEGATIONS ظ¤ ┬س┘╪د┬╗, ┬س┘è╪ش╪ذ┬╗, ┬س┘è┘à┘╪╣┬╗.
        //  ┬س┘ê╪د┘┘à╪ذ┘╪║ ╪ث┘â╪ذ╪▒ ┘à┘ 50┬╗ states a condition and contains none of
        //  them, so it was not seen as a rule at all. Caught by making a
        //  test assert the wiring instead of calling the helper itself:
        //  the old test passed with the link cut, which is a criterion
        //  that cannot fail ظ¤ a defect, and it was mine.
        //
        //  A clause that STATES A BOUND is a rule whatever words it uses,
        //  and statedBound is the authority on that, not a vocabulary.
        const boundHere = statedBound(clause);
        const forbids = clauseForbids(clause);
        const requires = clauseRequires(clause);
        const changes = clauseChanges(clause);
        if (!boundHere && !forbids && !requires && !changes && !READS_AS_A_RULE.test(clause)) continue;
        //  A bound is the strongest reading ظ¤ it can become a real constraint.
        //  A prohibition outranks a requirement because ┬س┘╪د ╪ز╪ش╪╣┘┬╗ opens with
        //  the negation and would otherwise be read as ┬س╪د╪ش╪╣┘┬╗.
        const rule: StatedRule = {
            text: clause,
            kind: boundHere ? 'bound' : forbids ? 'forbid' : changes ? 'change' : requires ? 'require' : undefined,
        };
        //  Which column is it about? The clause names it, and the name is
        //  the definite noun it opens with ظ¤ no vocabulary of field names.
        /**
         *  ظؤ¤ ظخAND THE ENGLISH SIDE MUST TEST SOMETHING TOO.
         *
         *  The Arabic branch asks for the definite article ظ¤ a real claim
         *  about the token it accepts. The English branch asked only ┬سis it a
         *  word┬╗, so ┬سand zqixdal_val must be greater than 4┬╗ named the field
         *  ┬سand┬╗. Measured: the constraint never found its column and fell
         *  back to a numbered rule, and a schema that dropped the bound
         *  entirely would still have scored green.
         *
         *  This is the night's first class in its plainest form ظ¤ a rule that
         *  grants a claim from POSITION without testing it ظ¤ and it hid because
         *  the two languages were held to different standards inside one
         *  pattern. So the openers are skipped, not accepted, and a function
         *  word is never a column name.
         */
        let opening = clause;
        for (let hop = 0; hop < 4; hop++) {
            const lead = opening.match(/^([A-Za-z][A-Za-z0-9_]*)\s+/);
            if (lead && NOT_A_FIELD_NAME.has(lead[1].toLowerCase())) {
                opening = opening.slice(lead[0].length);
                continue;
            }
            break;
        }
        const named = opening.match(/^(?:╪د┘[╪ة-┘è]+|[A-Za-z][A-Za-z0-9_]*)/u);
        if (named && !NOT_A_FIELD_NAME.has(named[0].toLowerCase())) rule.field = named[0];
        //  THE BOUND READER ALREADY EXISTS ظ¤ statedBound, above, and it
        //  knows ┬س╪ث┘é┘ ┘à┘┬╗, ┬س╪╣┘┘ë ╪د┘╪ث┘é┘┬╗, ┬س┘à┘ê╪ش╪ذ┬╗ and their English twins.
        //  Writing a second one here would be the duplication this file
        //  keeps paying for: two readers drift the first time one of
        //  them learns a phrase the other does not.
        if (boundHere) { rule.min = boundHere.min; rule.minExclusive = boundHere.minExclusive; }
        //  ظخand a bound on how MANY characters, which lands on a different
        //  kind of field and must not be confused with a floor on a value.
        const lengthHere = statedLengthBound(clause);
        if (lengthHere) { rule.minLength = lengthHere.minLength; rule.kind = 'bound'; }
        out.push(rule);
    }
    return out;
}

/** Attach every readable bound to the field it names. Unreadable rules stay unattached. */
export function applyStatedRules(fields: DerivedField[], rules: StatedRule[]): { fields: DerivedField[]; unapplied: StatedRule[] } {
    const unapplied: StatedRule[] = [];
    const next = fields.map(f => ({ ...f }));
    for (const rule of rules) {
        //  A rule with no OPENING noun is not a rule with no field: the
        //  clause below can still name one. Bailing here is what kept
        //  ┬س┘ê╪د╪▒┘╪╢ ╪د┘┘à╪ذ┘╪║ ╪ح╪░╪د ┘â╪د┘ ╪╡┘╪▒ ╪ث┘ê ╪ث┘é┘┬╗ unattached.
        /**
         *  A LENGTH GOES ON THE TEXT HE TYPES, NOT ON A NUMBER.
         *
         *  ┬س┘╪د ╪ز┘é╪ذ┘ ╪▒┘é┘à ┘ç╪د╪ز┘ ╪ث┘é┘ ┘à┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗ attaches to ┬س╪▒┘é┘à ╪د┘┘ç╪د╪ز┘┬╗, which
         *  is a `tel` field ظ¤ and the floor loop below only ever touched
         *  `number` fields, so his rule was read, classed as a bound, and then
         *  dropped for want of a number to sit on. Measured: the phone column
         *  came out with no constraint of any kind.
         */
        if (rule.minLength !== undefined) {
            const said = String(rule.field || rule.text || '');
            const target = next.find(f => (f.type === 'tel' || f.type === 'text')
                && f.label && (String(f.label) === rule.field
                    || String(f.label).split(/\s+/).some(w => w.length > 2 && saysWord(said, w))));
            if (target) (target as any).minLength = rule.minLength;
            else unapplied.push(rule);
            continue;
        }
        if (rule.min === undefined) { unapplied.push(rule); continue; }
        //  His own label, matched as he wrote it ظ¤ ┬س╪د┘╪│╪╣╪▒┬╗ is ┬س╪د┘╪│╪╣╪▒┬╗.
        //
        //  AND THE CLAUSE DOES NOT ALWAYS OPEN WITH THE FIELD.
        //
        //  Four natural phrasings put the VERB first and the field second:
        //
        //      ┬س┘ê╪د╪▒┘╪╢ ╪د┘┘à╪ذ┘╪║ ╪ح╪░╪د ┘â╪د┘ ╪╡┘╪▒ ╪ث┘ê ╪ث┘é┘┬╗
        //      ┬س╪د╪▒┘╪╢ ╪د┘┘â┘à┘è╪ر ╪ح╪░╪د ┘â╪د┘╪ز ╪ث┘é┘ ┘à┘ 10┬╗
        //      ┬سValidation that rejects non-positive amounts┬╗
        //      ┬سQuantity at least 2┬╗   ظ¤ his capital, the field's lowercase
        //
        //  The opening noun is the STRONGEST signal and stays first. When
        //  it names nothing, the field is whichever one his CLAUSE
        //  mentions ظ¤ the clause, never the whole request. That boundary
        //  is the entire difference from the reader this replaced, which
        //  searched the whole sentence and put a floor under every column
        //  he had listed.
        const said = String(rule.text || '').toLocaleLowerCase();
        const target = next.find(f => f.label === rule.field
                || f.label.includes(String(rule.field))
                || String(rule.field).includes(f.label))
            || next.find(f => f.type === 'number' && f.label
                && said.includes(String(f.label).toLocaleLowerCase()))
            //  AND ARABIC DOES NOT SAY THE LABEL BACK LETTER FOR LETTER.
            //
            //  ┬س┘╪د ╪ز┘é╪ذ┘ ┘à╪ذ┘╪║┘ï╪د ╪╡┘╪▒┘ï╪د┬╗ names the field ظ¤ ┬س┘à╪ذ┘╪║┘ï╪د┬╗ ظ¤ and the field is
            //  labelled ┬س╪د┘┘à╪ذ┘╪║┬╗. Indefinite, accusative, no article: a literal
            //  `includes` finds nothing, and the bound he stated was dropped
            //  into `unapplied` where nobody ever saw it again.
            //
            //  Measured on his own machine, in the built app:
            //
            //      RecordsApp.jsx:28  if (field.min === undefined) return false;
            //      content.js         ╪د┘┘à╪ذ┘╪║ ظْ required: true, and no min
            //
            //  The application SHIPS the guard. Nothing fills the value it
            //  reads, so zero is accepted ظ¤ the exact thing he forbade, in a
            //  build that reported itself complete.
            //
            //  saysWord() is the language layer added today: it segments with
            //  Unicode's own rules and stems with the same stemmer Elasticsearch
            //  ships, so ┬س┘à╪ذ┘╪║┘ï╪د┬╗ and ┬س╪د┘┘à╪ذ┘╪║┬╗ are one word ظ¤ and ┬س╪ث╪▓╪▒┘é┬╗ is still
            //  not ┬س╪▓╪▒┬╗.
            || next.find(f => f.type === 'number' && f.label
                && String(f.label).split(/\s+/).some(w => w.length > 2 && saysWord(said, w)));
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
 *     ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à┘ê╪د╪╣┘è╪» ╪ث╪│╪ش┘ ┘┘è┘ç: ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ ┘ê┘ê┘é╪ز ╪د┘┘à┘ê╪╣╪».
 *      ┘ê╪ذ╪»┘è ╪ش╪»┘ê┘ ╪س╪د┘┘è ┘┘┘à╪╡╪د╪▒┘è┘ ╪ث╪│╪ش┘ ┘┘è┘ç: ╪د┘╪ذ┘╪» ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«.┬╗
 *
 * and the reader returned NOTHING. The English twin returned the first table
 * and dropped the second without a word ظ¤ which is worse, because it looks
 * like success.
 *
 * The cause is that derivedColumns stops at the first opener and reads to the
 * end of that one sentence. A man who asks for two tables in two sentences is
 * not asking for one.
 *
 * This walks every opener in the request and returns one group per table, in
 * his order. What the builder then does with a second table is a separate
 * question ظ¤ but it can no longer pretend it never saw it.
 */
export interface DerivedTable { subject: string | null; columns: DerivedField[] }

export function derivedTables(requestRaw: string): DerivedTable[] {
    const request = String(requestRaw || '');
    //  Sentences are the natural boundary between two asks ظ¤ he ended one and
    //  began another. Reading each on its own also stops a list from swallowing
    //  the sentence after it.
    const out: DerivedTable[] = [];
    const seen = new Set<string>();
    for (const piece of request.split(/(?<=[.╪ا!\n])/u)) {
        const found = derivedColumns(piece);
        if (!found) continue;
        /**
         *  A TABLE IS READ FROM ONE SENTENCE. HIS RULES ARE IN THE OTHERS.
         *
         *  Measured in the shop built on his machine: ┬س┘ê╪ش╪»┘ê┘ ╪د┘╪╖┘╪ذ╪د╪ز ┘┘è┘ç ╪د╪│┘à
         *  ╪د┘╪▓╪ذ┘ê┘ ┘ê╪▒┘é┘à ╪د┘┘ç╪د╪ز┘ ظخ┬╗ and ┬س┘╪د ╪ز┘é╪ذ┘ ╪▒┘é┘à ┘ç╪د╪ز┘ ╪ث┘é┘ ┘à┘ ┘ر ╪ث╪▒┘é╪د┘à┬╗ are two
         *  sentences, and the phone column came out of the build with no
         *  constraint of any kind ظ¤ `content.js` carried no minLength at all,
         *  while the generated app already shipped the input that would have
         *  enforced one.
         *
         *  `derivedColumns(piece)` ends by applying the rules of THAT PIECE, so
         *  a table found sentence-by-sentence is judged against one sentence's
         *  worth of conditions. This is the third site of one class tonight ظ¤
         *  a decision taken from a fragment when the authority is the whole
         *  request ظ¤ and it is fixed here the same way as the other two.
         */
        const cols = applyStatedRules(found, statedRules(request)).fields;
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
 *      ┬س╪ش╪»┘ê┘ ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒╪î ┘ê┘à╪د ┘è┘é╪ذ┘ ┘à╪ذ┘╪║ ╪╡┘╪▒┬╗
 *       ظْ columns: ["╪د╪│┘à ╪د┘╪╡┘┘","╪د┘┘â┘à┘è╪ر","╪د┘╪│╪╣╪▒","┘ê┘à╪د ┘è┘é╪ذ┘ ┘à╪ذ┘╪║ ╪╡┘╪▒"]
 *
 *  The last one is not a column. It is the condition he attached to the
 *  table, and the reader put it in the schema as a field whose label is a
 *  whole clause. The app then showed him an input box asking him to type
 *  ┬س┘ê┘à╪د ┘è┘é╪ذ┘ ┘à╪ذ┘╪║ ╪╡┘╪▒┬╗.
 *
 *  THE CLASS: A CONSTRAINT IS NOT A COLUMN.
 *
 *  The test is shape, not vocabulary. A column is a NAME ظ¤ a short noun
 *  phrase. A rule is a CLAUSE ظ¤ it negates, it obliges, or it simply runs
 *  long. The particles below are a closed grammatical class (negation and
 *  obligation), not a list of business words: no domain noun appears here,
 *  and none ever should.
 */
const READS_AS_A_RULE = /(?:^|[\s╪î])(?:┘╪د|┘à╪د|┘┘è╪│|┘┘è╪│╪ز|╪║┘è╪▒|╪ذ╪»┘ê┘|┘è╪ش╪ذ|┘╪د╪▓┘à|┘è┘à┘╪╣|┘è╪▒┘╪╢|not|must|should|cannot|reject|forbid)(?:$|[\s╪î])/iu;

function isAName(item: string): boolean {
    const t = String(item || '').trim();
    if (!t) return false;
    if (READS_AS_A_RULE.test(t)) return false;
    //  A name is short. ┬س┘ê┘à╪د ┘è┘é╪ذ┘ ┘à╪ذ┘╪║ ╪╡┘╪▒┬╗ is four words; ┬س╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪»┘┘ê╪╣┬╗
    //  and ┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗ are two. Arabic packs more into a word, so it gets
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
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘ ┘┘è┘ç ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ┬╗   ظْ 3 columns
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘ ┘è╪ص┘ê┘è ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ┬╗  ظْ null
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘ ┘à╪╣ ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ┬╗    ظْ null
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘ ╪ث╪╣┘à╪»╪ز┘ç ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ┬╗ظْ null
 *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘: ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ┬╗      ظْ null
 *
 *  One word worked and four did not, and the four are the same sentence.
 *  That is the fourth law being broken in the one function it was written
 *  for: the reader had a list of connectors, and ┬س┘┘è┘ç┬╗ happened to be on it.
 *
 *  Widening the list would be the same disease with a longer prescription.
 *  So the SHAPE of the items decides instead ظ¤ and Arabic states it plainly:
 *
 *      columns are DEFINITE   ┬س╪د┘╪ز╪د╪▒┘è╪«┬╗ ┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗ ┬س╪▒┘é┘à ╪ز┘┘┘ê┘┘ç┬╗
 *      values are INDEFINITE  ┬س┘é┘ç┘ê╪ر┬╗ ┬س╪ث╪»┘ê╪د╪ز┬╗ ┬س╪ص┘┘ê┘è╪د╪ز┬╗ ┬╖ ┬س╪╡╪║┘è╪▒┬╗ ┬س┘ê╪│╪╖┬╗ ┬س┘â╪ذ┘è╪▒┬╗
 *
 *  This is what kept ┬س┘à╪ز╪ش╪▒ ╪ذ┘╪خ╪د╪ز: ┘é┘ç┘ê╪ر╪î ╪ث╪»┘ê╪د╪ز╪î ╪ص┘┘ê┘è╪د╪ز┬╗ from becoming five
 *  columns before, and it still does ظ¤ not because ┬س╪ذ┘╪خ╪د╪ز┬╗ is on a list of
 *  forbidden words, but because coffee and sweets are indefinite nouns and
 *  a column name is not.
 *
 *  EVERY item must qualify. Two of three is what ┬س╪د┘╪▒┘è╪د╪╢╪î ╪ش╪»╪ر╪î ╪د┘╪»┘à╪د┘à┬╗
 *  scores ظ¤ a list of cities carrying the article inside two proper names ظ¤
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
         *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘╪╣┘à┘╪د╪ة ┘┘è┘ç ╪د┘╪د╪│┘à ┘ê╪د┘┘ç╪د╪ز┘ ┘ê╪د┘╪╣┘┘ê╪د┘┬╗  ظْ 3 columns
         *      ┬سA clients table with name, phone and address┬╗  ظْ null
         *
         *  Not ┬سread badly┬╗ ظ¤ never read at all. The test below is ┬س╪د┘┬╗ or
         *  a possessive suffix, and no English noun carries either, so it
         *  could NEVER pass and every English request fell through to a
         *  memorised template.
         *
         *  English marks the difference on the CONTAINER instead of the
         *  noun, and the caller has already established that a container
         *  was named. ┬سname┬╗, ┬سphone┬╗, ┬سaddress┬╗ are as bare in English as
         *  ┬س┘é┘ç┘ê╪ر┬╗ is in Arabic; what keeps a shopping list out is that a
         *  list holds things while a table holds columns, and that test
         *  belongs to the container, not to the item.
         */
        if (!/[╪-█┐]/u.test(t)) return true;
        //  ┬س╪د┘┬╗ anywhere ظ¤ on the word itself or on the second half of an
        //  idafa (┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗) ظ¤ or a possessive suffix (┬س╪▒┘é┘à ╪ز┘┘┘ê┘┘ç┬╗),
        //  which is the other way Arabic makes a noun definite.
        //  Folded, because a diacritic is not a letter and every test here
        //  reads letters. ┬س╪▓┘╪▒┘ْ┘é┘┘à┘┘ê┘┘┘è┬╗ carries a kasra between its last two
        //  letters, so ┬سa letter then ┘è┬╗ found nothing and his own invented
        //  word was ruled not a name at all.
        const bare = stripArabicDiacritics(t);
        return /(?:^|\s)╪د┘[╪ة-┘è]/u.test(bare)
            || /[╪ة-┘è](?:┘ç|┘ç╪د|┘ç┘à|┘ç┘|┘è|┘â|┘â┘à|┘╪د)(?:$|\s)/u.test(bare);
    });
}

/**
 *  A THING THAT HOLDS RECORDS, NAMED IN HIS OWN WORD.
 *
 *  This lived inside derivedColumns as a local. It is needed in a second
 *  place now ظ¤ the clarifier, which must ask about the container HE named
 *  instead of asking about a website ظ¤ and a second copy would drift the
 *  first time one of them learned a word the other did not.
 */
export const RECORD_CONTAINER = /(?:╪ش╪»┘ê┘|┘é╪د╪خ┘à╪ر|┘â╪┤┘|╪│╪ش┘|╪│╪ش┘┘ّ)(?:╪د┘ï|┘ï╪د|╪د)?|╪ش╪»╪د┘ê┘|\btable\b|\blist\b|\bsheet\b|\bboard\b|\bqueue\b|\bledger\b|\bregister\b|\btracker\b|\bdirectory\b|\bregistry\b|\bcatalog(?:ue)?\b/iu;

/**
 *  WHERE THE SENTENCE ENDS AND THE FIRST COLUMN BEGINS.
 *
 *  Two branches read the same sentence ظ¤ one when a recording verb opens
 *  the list, one when only the container does ظ¤ and whatever stood between
 *  the container and the list stuck to the first item. One branch had been
 *  taught to strip it. The other had not been taught at all, so a live
 *  round returned this:
 *
 *      ┬س╪ذ╪»┘è ╪ذ╪▒┘╪د┘à╪ش ╪د╪│╪ش┘ ┘┘è┘ç ╪د╪│┘à ╪د┘╪╖╪د┘╪ذ ┘ê╪╡┘┘ç ┘ê╪»╪▒╪ش╪ز┘ç┬╗
 *      ظْ columns: ┬س┘┘è┘ç ╪د╪│┘à ╪د┘╪╖╪د┘╪ذ┬╗ ┬╖ ┬س╪╡┘┘ç┬╗ ┬╖ ┬س╪»╪▒╪ش╪ز┘ç┬╗
 *
 *  A column called ┬س┘┘è┘ç┬╗. Not a bad reading of his words ظ¤ the second
 *  reader was never given the lesson the first one learned. So there is
 *  one cleaner now, and both branches call it.
 *
 *  It strips a closed class and nothing else. In both languages what
 *  stands between a container and its columns is a FUNCTION word ظ¤ a
 *  preposition, a relative, an article ظ¤ and function words are a closed
 *  set that can be written down honestly. Content words are not, and
 *  guessing at them is how a verb becomes a column.
 */
const ARABIC_FUNCTION_WORD = /^(?:┘┘è|╪ح┘┘ë|╪د┘┘ë|╪╣┘┘ë|╪╣┘|┘à╪╣|┘à┘|┘|╪ذ|┘|┘ê)(?:┘ç|┘ç╪د|┘ç┘à|┘ç┘|┘è|┘â|┘â┘à|┘╪د)?$/u;

function firstColumnBeginsAtTheName(firstRaw: string, afterAContainer: boolean): string {
    const first = String(firstRaw || '').trim();
    //  English has no ┬س╪د┘┬╗, so the preposition is the whole signal:
    //  ┬سwith name┬╗ is the sentence plus the column, not a column called
    //  ┬سwith name┬╗.
    const trimmedEn = first
        .replace(/^(?:that\s+(?:has|have|holds?|contains?)|which\s+(?:has|have)|with|of|for|containing|including|holding|showing|having)\s+/iu, '')
        .replace(/^(?:a|an|the)\s+/iu, '')
        .trim();
    if (trimmedEn !== first) return trimmedEn;
    if (!/\s/.test(first)) return first;
    const words = first.split(/\s+/);

    //  A leading Arabic function word ظ¤ ┬س┘┘è┘ç┬╗, ┬س┘┘è┬╗, ┬س╪ذ┘ç╪د┬╗. Strip the run
    //  of them and stop: what follows is his own words.
    let cut = 0;
    while (cut < words.length - 1 && ARABIC_FUNCTION_WORD.test(words[cut])) cut++;
    if (cut > 0) return words.slice(cut).join(' ');

    //  A NAME IS MARKED DEFINITE THREE WAYS, AND THIS KNEW ONE.
    //
    //  ┬س╪د┘┬╗, an idafa whose second half carries ┬س╪د┘┬╗, and a possessive
    //  suffix ظ¤ ┬س╪▓╪ذ╪د╪خ┘┘è┬╗, ┬س╪»╪▒╪ش╪ز┘ç┬╗. everyItemIsADefiniteName already knows
    //  all three; this trim knew only the article, so ┬س┘è╪ص┘╪╕ ┘┘è ╪▓╪ذ╪د╪خ┘┘è┬╗
    //  found no start at all and handed back the verb as a column.
    if (afterAContainer) {
        //  Only when the residue is the container's own subject: ┬س╪ش╪»┘ê┘
        //  ┘┘┘à╪╡╪د╪▒┘è┘ ┘è╪ص┘ê┘è ╪د┘╪ز╪د╪▒┘è╪«┬╗ hands back ┬س┘┘┘à╪╡╪د╪▒┘è┘ ┘è╪ص┘ê┘è ╪د┘╪ز╪د╪▒┘è╪«┬╗, and
        //  the column starts at ┬س╪د┘╪ز╪د╪▒┘è╪«┬╗. After a recording verb the
        //  residue is an idafa he wrote himself ظ¤ ┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗ ظ¤ and
        //  cutting to the article there would throw away half his label.
        const article = words.findIndex(w => /^╪د┘[╪ة-┘è]/u.test(w));
        if (article > 0) return words.slice(article).join(' ');
    }
    const owned = words.findIndex(w => !ARABIC_FUNCTION_WORD.test(w) && /[╪ة-┘è](?:┘ç|┘ç╪د|┘ç┘à|┘ç┘|┘è|┘â|┘â┘à|┘╪د)$/u.test(w));
    if (owned > 0) return words.slice(owned).join(' ');
    return first;
}

/**
 *  A CAPABILITY HE ASKED FOR IS NOT A COLUMN.
 *
 *  Measured on four of his own sentences:
 *
 *      ┬سظخ┘┘è┘ç ╪د┘╪د╪│┘à ┘ê╪د┘╪╡┘ ┘ê╪د┘╪»╪▒╪ش╪ر╪î ┘à╪╣ ╪ذ╪ص╪س ╪ذ╪د┘╪د╪│┘à ┘ê╪ز╪▒╪ز┘è╪ذ ╪ذ╪د┘╪»╪▒╪ش╪ر┬╗
 *      ظْ ╪د┘╪د╪│┘à ┬╖ ╪د┘╪╡┘ ┬╖ ╪د┘╪»╪▒╪ش╪ر ┬╖ ┬س┘à╪╣ ╪ذ╪ص╪س ╪ذ╪د┘╪د╪│┘à┬╗ ┬╖ ┬س╪ز╪▒╪ز┘è╪ذ ╪ذ╪د┘╪»╪▒╪ش╪ر┬╗
 *
 *      ┬سظخ┘┘è┘ç ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«╪î ┘ê╪د╪╣╪▒╪╢ ┘┘è ╪د┘┘à╪ش┘à┘ê╪╣┬╗
 *      ظْ ظخ ┬╖ ┬س┘ê╪د╪╣╪▒╪╢ ┘┘è ╪د┘┘à╪ش┘à┘ê╪╣┬╗
 *
 *      ┬سظخ┘┘è┘ç ╪د╪│┘à ╪د┘┘à┘╪ز╪ش ┘ê╪د┘╪│╪╣╪▒ ┘ê╪د┘╪╡┘ê╪▒╪ر╪î ┘à╪╣ ╪│┘╪ر ┘à╪┤╪ز╪▒┘è╪د╪ز┬╗
 *      ظْ ظخ ┬╖ ┬س┘à╪╣ ╪│┘╪ر ┘à╪┤╪ز╪▒┘è╪د╪ز┬╗
 *
 *      ┬سظخ┘┘è┘ç ╪د╪│┘à ╪د┘╪╣┘à┘è┘ ┘ê┘ê┘é╪ز ╪د┘╪ص╪ش╪▓╪î ┘ê┘è╪ص┘╪╕ ╪د┘╪ذ┘è╪د┘╪د╪ز ╪╣┘┘ë ╪«╪د╪»┘à┬╗
 *      ظْ nothing at all ظ¤ the capability sank the two real columns
 *        below the floor and the whole request read as no schema.
 *
 *  He asked for a search, a total, a cart, a server. Each became a
 *  column of the table, or drowned the ones that were real. This is the
 *  same shape as the rule that became a column and was given statedRules
 *  ظ¤ and capabilities were never given the same treatment.
 *
 *  Two closed-class tests, no vocabulary:
 *
 *  1. A column is a DEFINITE NAME, judged by the same three marks used
 *     everywhere else. ┬س┘à╪╣ ╪ذ╪ص╪س ╪ذ╪د┘╪د╪│┘à┬╗ and ┬س┘à╪╣ ╪│┘╪ر ┘à╪┤╪ز╪▒┘è╪د╪ز┬╗ carry none.
 *
 *  2. A name is a word or a two-word idafa. A function word standing
 *     INSIDE it means the phrase is a clause, not a name: ┬س┘ê╪د╪╣╪▒╪╢ ┘┘è
 *     ╪د┘┘à╪ش┘à┘ê╪╣┬╗ has ┬س┘┘è┬╗ in it, ┬س┘è╪ص┘╪╕ ╪د┘╪ذ┘è╪د┘╪د╪ز ╪╣┘┘ë ╪«╪د╪»┘à┬╗ has ┬س╪╣┘┘ë┬╗.
 *     ┬س╪د╪│┘à ╪د┘┘à╪▒┘è╪╢┬╗, ┬س╪▒┘é┘à ╪ز┘┘┘ê┘┘ç┬╗, ┬س┘ê┘é╪ز ╪د┘┘à┘ê╪╣╪»┬╗ have none.
 *
 *  And the run STOPS at the first one that fails rather than filtering
 *  it out, because a list is contiguous: what follows the boundary is
 *  the next thing he asked for, not a later column.
 */
/**
 *  ظخAND IN ENGLISH THE BOUNDARY IS THE ONLY MARK THERE IS.
 *
 *  The two tests above are Arabic ones: definiteness, and a function word
 *  standing inside a name. English has neither ظ¤ every Latin item passes
 *  the definiteness test by design, because English marks that on the
 *  container instead. So this slipped straight through:
 *
 *      ┬سA students table: name, class and grade, with search by name┬╗
 *      ظْ name ┬╖ class ┬╖ grade ┬╖ ┬سwith search by name┬╗
 *
 *  The mark English does have is position. ┬سwith┬╗ opening the FIRST item
 *  is the sentence handing over to the list, and firstColumnBeginsAtTheName
 *  already strips it there. The same word opening a LATER item is him
 *  starting a new request ظ¤ there is nothing left for it to hand over.
 *
 *  ┬سof┬╗ is deliberately absent: ┬سdate of birth┬╗ is a column he might
 *  really write, and a rule that cannot tell it from a clause would cost
 *  more than it saves.
 */
const OPENS_A_NEW_REQUEST = /^(?:┘à╪╣|plus|with|along\s+with|together\s+with|including|and)(?=$|[\s╪î,])/iu;

/** A behaviour beside fields is an app requirement, not another column. */
const CAPABILITY_CLAUSE = /^(?:(?:(?:distinct|clear|visible|live|forced|offline)\s+)*(?:loading|success|empty|error|retry|fallback|network(?:[-\s]+failure)?)(?:[-/\s]+(?:loading|success|empty|error|retry|fallback|states?))*|(?:empty[-\s]+)?(?:name|field|input)\s+validation|(?:status|state)\s+(?:filter(?:ing)?|selection)|(?:text\s+)?search(?:ing)?|filter(?:ing)?|sort(?:ing)?|export(?:ing)?(?:\s+(?:csv|data|records))?|validation|(?:╪ذ╪ص╪س|╪ز╪╡┘┘è╪ر|┘┘╪ز╪▒╪ر|┘╪▒╪▓|╪ز╪╡╪»┘è╪▒|╪ز╪ص┘é┘é|╪ز╪ص┘é┘ّ┘é|╪╡┘╪د╪ص┘è╪ر|╪د┘╪ز╪ص┘é┘é|╪د┘╪ز╪ث┘â╪»|╪ز╪ث┘â┘è╪»)(?:\s|$))/iu;

/**
  ظؤ¤ AND THIS LIST IS EXPLICIT ON PURPOSE, AFTER A LETTER RULE FAILED.
 *
 *  The first attempt read the leading LETTER: an Arabic present-tense verb
 *  opens with ┘è ╪ز ┘ or ╪ث and carries no article, so the pattern was
 *  /^[┘è╪ز┘╪ث](?!┘).../ . It threw away two of his columns immediately:
 *
 *      ╪ز╪د╪▒┘è╪« ╪د┘┘à┘è┘╪د╪»      <- opens with ╪ز
 *      ┘┘ê╪╣ ╪د┘╪ص┘┘è╪ذ         <- opens with ┘
 *
 *  Both are nouns, and the letter cannot tell. That is the class this file
 *  keeps closing -- a pattern that reads letters where it must read words
 *  -- and it was reopened here while closing a different member of it.
 *
 *  Nothing lexical separates them: ┬س┘è╪╖┘╪╣ ╪د┘┘à╪ش┘à┘ê╪╣┬╗ and ┬س╪ز╪د╪▒┘è╪« ╪د┘┘à┘è┘╪د╪»┬╗
 *  have the same shape, the same definiteness pattern, the same word count.
 *  Only knowing that ╪╖┘╪╣ is a verb and ╪ز╪د╪▒┘è╪« is a noun settles it, and no
 *  stemmer here carries part of speech.
 *
 *  So the list is narrow and it is about BEHAVIOUR: these are the verbs a
 *  person uses to say what the page should DO with a column, never to name
 *  the column. It is matched through the language layer, so ┬س┘è╪╖┘╪╣┬╗ is
 *  ┬س┘è╪╖┘╪╣┬╗ in any inflection he writes it.
 *
 *  A narrow list that is right beats a broad rule that is wrong, and the
 *  negative cases below it name the two columns the broad rule ate.
 */
const BEHAVIOUR_VERBS = [
    '┘è╪╖┘╪╣', '╪ز╪╖┘╪╣', '┘è╪ص╪│╪ذ', '╪ز╪ص╪│╪ذ', '┘è╪╕┘ç╪▒', '╪ز╪╕┘ç╪▒', '┘è╪╣╪▒╪╢', '╪ز╪╣╪▒╪╢',
    '┘è╪ش┘à╪╣', '╪ز╪ش┘à╪╣', '┘è╪▒╪ز╪ذ', '╪ز╪▒╪ز╪ذ', '┘è╪ذ╪ص╪س', '╪ز╪ذ╪ص╪س', '┘è╪╖╪ذ╪╣', '╪ز╪╖╪ذ╪╣',
];

function opensAsABehaviour(word: string): boolean {
    const w = String(word || '').trim();
    if (!w) return false;
    try {
        const { saysAny } = require('../language/arabic');
        return saysAny(w, BEHAVIOUR_VERBS);
    } catch { return BEHAVIOUR_VERBS.includes(w); }
}

function isAColumnAndNotAClause(item: string, index: number): boolean {
    const t = String(item || '').trim();
    if (index > 0 && OPENS_A_NEW_REQUEST.test(t)) return false;
    // Stop at the first action phrase so "search" and "status filtering" do
    // not become text inputs in a user-declared record schema.
    if (index > 0 && CAPABILITY_CLAUSE.test(t)) return false;
    //  A YES-OR-NO COLUMN IS INDEFINITE BY NATURE.
    //
    //  ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘┘ê╪د╪ز┘è╪▒: ╪د╪│┘à ╪د┘╪▓╪ذ┘ê┘ ┘ê╪د┘┘à╪ذ┘╪║ ┘ê┘à╪»┘┘ê╪╣┬╗ ظ¤ ┬س┘à╪»┘┘ê╪╣┬╗
    //  carries no ┬س╪د┘┬╗ and no possessive, so the definiteness test cut the
    //  run before it and he lost the column. It is a column all the same,
    //  marked another way: a question about the row rather than a name of
    //  a thing, which is exactly what ASKS_YES_OR_NO already reads.
    if (ASKS_YES_OR_NO.test(t)) return true;
    /**
     *  AND A BARE NOUN AMONG NAMED COLUMNS IS A COLUMN.
     *
     *  Measured, one word apart:
     *
     *      ┬سظخ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘╪│╪╣╪▒ ┘ê╪د┘╪╡┘ê╪▒╪ر┬╗  ظْ 3 columns
     *      ┬سظخ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘╪│╪╣╪▒ ┘ê╪╡┘ê╪▒╪ر┬╗    ظْ 2 ظ¤ ┬س╪╡┘ê╪▒╪ر┬╗ thrown away
     *
     *  He writes it the second way. The definiteness test is a guard against
     *  prose becoming a schema, and it is a good one ظ¤ the file already
     *  carries one exception to it for ┬س┘à╪»┘┘ê╪╣┬╗, a yes-or-no column that is
     *  indefinite by nature.
     *
     *  This is the second, and it is narrow on purpose: ONE word, and only
     *  after two columns have already been confirmed. A single noun standing
     *  third in a run of named columns is not prose; it is the item he did
     *  not bother to define. A longer run, or one at the head of the list,
     *  still has to prove itself the old way.
     */
    if (index >= 2 && !everyItemIsADefiniteName([t])) {
        const words = t.split(/\s+/).filter(Boolean);
        if (words.length === 1 && t.length >= 3
            && !ARABIC_FUNCTION_WORD.test(t) && !READS_AS_A_RULE.test(t)) return true;
    }
    /**
     *  ظؤ¤ A COLUMN IS NAMED BY A NOUN, NEVER BY A VERB.
     *
     *  Measured on a sentence shaped the way the owner writes:
     *
     *      ╪د╪╣┘à┘ ┘┘è ╪╡┘╪ص╪ر ╪ث╪│╪ش┘ ┘┘è┘ç╪د ┘à╪╡╪د╪▒┘è┘┘è ┘ê┘è╪╖┘╪╣ ╪د┘┘à╪ش┘à┘ê╪╣
     *          columns  ->  ["┘à╪╡╪د╪▒┘è┘┘è", "┘è╪╖┘╪╣ ╪د┘┘à╪ش┘à┘ê╪╣"]
     *          engine   ->  generic          (his expenses engine, lost)
     *
     *  The second item is a verb and its subject: something the page DOES.
     *  It passed on the strength of its SECOND word -- ┬س╪د┘┘à╪ش┘à┘ê╪╣┬╗ is
     *  definite and is not a function word -- so a definite noun ANYWHERE
     *  in the phrase proved the whole phrase was a name.
     *
     *  That is this repository's first class: evidence that matches the
     *  occurrence of a word instead of testing the claim, exactly as the
     *  bound proof once granted a tick from any digit anywhere.
     *
     *  And the cost is the whole archetype, not one column: detectAppKind
     *  returns 'generic' the moment ANY column is derived, so one misread
     *  phrase costs him the engine that knows how to total his expenses.
     *
     *  Only the LEADING word is judged, and only when the phrase has more
     *  than one -- a single word is settled by the tests around this one.
     */
    const leadWords = t.split(/\s+/).filter(Boolean);
    if (leadWords.length > 1 && opensAsABehaviour(leadWords[0])) return false;
    if (!everyItemIsADefiniteName([t])) return false;
    const words = t.split(/\s+/);
    return !words.slice(1).some(w => ARABIC_FUNCTION_WORD.test(w));
}

/**
 *  ┬س╪╡┘╪ص╪ر ╪د┘┘à┘╪ز╪ش╪د╪ز┬╗ IS A PAGE HE NAMED, NOT A COLUMN IN A TABLE.
 *
 *  One sentence, two readers, and no boundary between them. ┬س┘┘è┘ç┬╗ opens a
 *  list, and the column reader took everything after it:
 *
 *      ┬س╪د╪╣┘à┘ ┘à╪ز╪ش╪▒ ┘┘è┘ç ╪╡┘╪ص╪ر ╪د┘┘à┘╪ز╪ش╪د╪ز ┘ê╪╡┘╪ص╪ر ╪د┘╪┤╪ص┘ ┘ê╪د┘╪د╪│╪ز╪▒╪ش╪د╪╣┬╗
 *        ظْ columns: ┬س╪╡┘╪ص╪ر ╪د┘┘à┘╪ز╪ش╪د╪ز┬╗ ┬س╪╡┘╪ص╪ر ╪د┘╪┤╪ص┘┬╗ ┬س╪د┘╪د╪│╪ز╪▒╪ش╪د╪╣┬╗
 *
 *  Three acceptance criteria demanding three table columns, from a request
 *  that asked for a shop with pages. A site of pages can never satisfy them,
 *  so the delivery is refused forever ظ¤ a criterion that cannot be met, which
 *  is the mirror of a criterion that cannot fail and just as dead.
 *
 *  The word ┬س╪╡┘╪ص╪ر┬╗ settles it: that item belongs to the page plan, which
 *  reads it in thePagesHeNamed(). It is REMOVED rather than used as a stop,
 *  so a sentence that names a page AND real columns keeps the columns:
 *  ┬س┘┘è┘ç ╪╡┘╪ص╪ر ╪د┘┘à┘╪ز╪ش╪د╪ز ┘ê╪د╪│┘à ╪د┘╪╣┘à┘è┘ ┘ê╪د┘┘à╪ذ┘╪║┬╗ still yields two.
 */
const HE_NAMED_A_PAGE = new RegExp('^(?:╪د┘)?╪╡┘╪ص[╪ر┘ç](?:$|\\s)|^(?:a|an|the)?\\s*[a-z0-9-]+\\s+page$', 'i');

function columnsEndWhereHisNextRequestBegins(parts: string[]): string[] {
    const mine = parts.filter(p => !HE_NAMED_A_PAGE.test(String(p || '').trim()));
    const stop = mine.findIndex((part, i) => !isAColumnAndNotAClause(part, i));
    return stop < 0 ? mine : mine.slice(0, stop);
}

/**
 *  AN ENTITY AND ITS ATTRIBUTES, NAMED BY GRAMMAR ALONE.
 *
 *      ┬س╪ذ╪»┘è ╪ذ╪▒┘╪د┘à╪ش ┘è╪ص┘╪╕ ┘┘è ╪▓╪ذ╪د╪خ┘┘è ┘ê╪د╪▒┘é╪د┘à ╪ز┘┘┘ê┘╪د╪ز┘ç┘à ┘ê╪╣┘╪د┘ê┘è┘┘ç┘à┬╗
 *      ظْ null
 *
 *  He named no container ظ¤ ┬س╪ذ╪▒┘╪د┘à╪ش┬╗ holds an app, not records ظ¤ and
 *  ┬س╪ص┘╪╕┬╗ is a stem the opener list has never held. Adding it would fix
 *  this one sentence and the next man writes ┬س┘è╪«╪▓┘ّ┘┬╗ or ┬س┘è┘à╪│┘â┬╗ and we are
 *  back here with a longer list. Nouns and verbs are open sets; no list
 *  of them is ever finished.
 *
 *  But he DID mark the shape, in grammar. ┬س╪▓╪ذ╪د╪خ┘┘è┬╗ is MINE. ┬س╪ز┘┘┘ê┘╪د╪ز┘ç┘à┬╗
 *  and ┬س╪╣┘╪د┘ê┘è┘┘ç┘à┬╗ are THEIRS ظ¤ and the ┬س┘ç┘à┬╗ points back at the clients he
 *  just named. A run whose later members BELONG TO the first member is an
 *  entity and its attributes, and that is what a table is. The agreement
 *  says it; no verb and no container are needed to hear it.
 *
 *  This is the last path tried, so it can only add readings the other two
 *  refused. It stays strict for that reason: three items at least, every
 *  one a definite name, and at least one of the later ones carrying the
 *  third-person pronoun that does the pointing.
 */
const BELONGS_TO_THE_FIRST = /[╪ة-┘è](?:┘ç|┘ç╪د|┘ç┘à|┘ç┘)$/u;
const BELONGS_TO_HIM = /[╪ة-┘è](?:┘è|┘╪د)$/u;

//  A TEST ON THE LAST LETTERS, RUN ON TEXT THAT CARRIES DIACRITICS.
//
//  ┬س╪▓┘╪▒┘ْ┘é┘┘à┘┘ê┘┘┘è┬╗ ends in ┬س┘è┬╗, but a kasra sits between it and the letter
//  before it, and a kasra is not an Arabic LETTER. The possessive
//  test looked for a letter followed by ┬س┘è┬╗, found none, and the
//  scan walked straight past his own word and landed on ┬س╪ذ╪»┘è┬╗ ظ¤ the
//  verb he asked with ظ¤ handing it back as a column.
//
//  Every test below reads a folded copy for that reason, and returns
//  the word as he wrote it, diacritics and all.
const owned = (word: string) => BELONGS_TO_HIM.test(stripArabicDiacritics(word));
const ownedByTheFirst = (word: string) => BELONGS_TO_THE_FIRST.test(stripArabicDiacritics(word));
const definiteWord = (word: string) => /^╪د┘[╪ة-┘è]/u.test(stripArabicDiacritics(word));

function theNameHeEndedOn(phrase: string): string | null {
    //  The run begins at the last real name in the opening fragment ظ¤
    //  ┬س╪ذ╪»┘è ╪ذ╪▒┘╪د┘à╪ش ┘è╪ص┘╪╕ ┘┘è ╪▓╪ذ╪د╪خ┘┘è┬╗ begins at ┬س╪▓╪ذ╪د╪خ┘┘è┬╗. Reading forward
    //  would stop at ┬س╪ذ╪»┘è┬╗, which ends in ┬س┘è┬╗ and looks owned but is the
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
    const sentence = String(request || '').split(/[.╪ا!\n]/)[0] || '';
    const raw = sentence
        .split(/\s*[╪î,]\s*|\s+┘ê(?=\S)|\s+and\s+|\s+&\s+/iu)
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
    //  A third condition stood here ظ¤ that no item is a container word ظ¤
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
 *      ┬سظخ╪î ┘à╪╣ ╪ذ╪ص╪س ╪ذ╪د┘╪د╪│┘à ┘ê╪ز╪▒╪ز┘è╪ذ ╪ذ╪د┘╪»╪▒╪ش╪ر┬╗     ظْ search ┬╖ SORT
 *      ┬سظخ╪î ┘ê╪╡┘╪ص╪ر ╪س╪د┘┘è╪ر ╪ز╪╣╪▒╪╢ ┘à╪ش┘à┘ê╪╣ ╪د┘╪▒┘ê╪د╪ز╪ذ┬╗    ظْ total ┬╖ A SECOND PAGE
 *      ┬سظخ╪î ┘à╪╣ ╪│┘╪ر ┘à╪┤╪ز╪▒┘è╪د╪ز┬╗                    ظْ A CART
 *      ┬سظخ╪î ┘ê┘è╪ص┘╪╕ ╪د┘╪ذ┘è╪د┘╪د╪ز ╪╣┘┘ë ╪«╪د╪»┘à┬╗           ظْ A SERVER
 *
 *  The criteria catalogue knows ┬س╪ذ╪ص╪س┬╗ and ┬س┘à╪ش┘à┘ê╪╣┬╗ and produces a criterion
 *  for each. It does not know a sort, a second page, a cart or a server,
 *  and for those it produces NOTHING ظ¤ so Joe can report success without
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
    for (const sentence of request.split(/[.╪ا!\n]/)) {
        const parts = sentence
            .split(/\s*[╪î,]\s*|\s+┘ê(?=\S)|\s+and\s+|\s+&\s+/iu)
            .map(part => part.trim())
            .filter(part => part.length >= 2 && part.length <= 64);
        //  The first fragment carries the request itself ظ¤ ┬س╪ذ╪»┘è ╪ش╪»┘ê┘
        //  ┘┘┘à┘ê╪╕┘┘è┘ ┘┘è┘ç ╪د┘╪د╪│┘à┬╗ ظ¤ and is never one of his extra asks.
        for (let i = 1; i < parts.length; i++) {
            if (isAColumnAndNotAClause(parts[i], i)) continue;
            const clause = parts[i].replace(/^(?:┘ê|┘à╪╣|with|plus|and)\s*/iu, '').trim();
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
 *      ┬سBuild an expenses app. Columns: date, amount, category and note┬╗
 *          ظْ date ┬╖ amount ┬╖ category ┬╖ note
 *      ┬سBuild an expenses app. The fields are date, amount, ظخ┬╗
 *          ظْ date ┬╖ amount ┬╖ category ┬╖ note
 *      ┬سBuild a small expenses app. Include date, amount, category and note.┬╗
 *          ظْ NOTHING
 *      ┬سBuild an expenses app with date, amount, category and note.┬╗
 *          ظْ NOTHING
 *
 *  ┬سinclude┬╗ and ┬سwith┬╗ are already in this file's introducer set ظ¤
 *  firstColumnBeginsAtTheName strips them off the first column every
 *  day. They were known as words that HAND OVER to a list and not as
 *  words that OPEN one, so the same sentence read two ways depending
 *  on whether a container noun happened to stand nearby.
 *
 *  THE ONE CASE THIS MUST NOT SWALLOW, and how it is told apart:
 *
 *      ┬سBuild a small portfolio site with a home page, a projects page
 *       and a contact form.┬╗
 *
 *  Same word, same shape ظ¤ and every item begins with an ARTICLE. A
 *  column he names is ┬سdate┬╗, ┬سamount┬╗, ┬سnote┬╗; a thing he asks to be
 *  built is ┬سa home page┬╗, ┬سa contact form┬╗. English marks the
 *  difference with a closed class of three words, and that is the
 *  whole test: no catalogue of page names, no list of field names.
 */
const ENGLISH_INTRODUCES_A_LIST = /(?:^|[.!?]\s+|[\s,;:(])(?:(?:must|should)\s+(?:provide|include|have)|needs?|requires?|add|include(?:s|d)?|containing|consisting\s+of|made\s+up\s+of|with)(?=\s)/iu;
const OPENS_WITH_AN_ARTICLE = /^(?:a|an|the)\s+/iu;

/**
 * A long product brief can contain several English `with` clauses. The first
 * one may describe the page, while the list inside a form names the data the
 * application must actually collect. Prefer that bounded, structural signal
 * over a later visual-state list such as "accessible contrast, loading and
 * error states".
 */
function fieldsDeclaredInsideAForm(request: string): DerivedField[] | null {
    const match = /\bform\b[^.\n]{0,180}?\bwith\s+([^.\n]{6,260})/iu.exec(request);
    if (!match) return null;
    const tail = match[1].split(/\s*(?:[;ي╝ؤ]\s*|(?=(?:required(?:[-\s]field)?\s+validation|validation|allow|add|delete|ensure|fix|persist|show|test|validate|verify)\b))/iu)[0];
    const parts = tail
        .split(/\s*[,ي╝î]\s*|\s+and\s+|\s+&\s+/iu)
        .map(part => part.replace(/^(?:a|an|the|and)\s+/iu, '').replace(/\s*\([^)]{0,80}\)\s*$/u, '').trim())
        .filter(part => part.length >= 2 && part.length <= 32);
    if (parts.length < 3) return null;
    // A form's controls are data fields; its buttons and display states are
    // not. This keeps a request for a search form from becoming a fake table.
    if (parts.some(part => /\b(?:button|state|theme|layout|dashboard|title|link|page|preview|build|loading|error)\b/iu.test(part))) return null;
    if (parts.some(part => !isAName(part) || !notAContainerItself(part))) return null;
    const built = fieldsFromLabels(parts);
    return built ? applyStatedRules(built, statedRules(request)).fields : null;
}

function theListAnIntroducerHandedOver(request: string): DerivedField[] | null {
    const formFields = fieldsDeclaredInsideAForm(request);
    if (formFields) return formFields;
    for (const rawSentence of String(request || '').split(/[.╪ا!\n]/)) {
        const sentence = rawSentence.trim();
        const at = ENGLISH_INTRODUCES_A_LIST.exec(sentence);
        if (!at) continue;
        const rawTail = sentence.slice((at.index || 0) + at[0].length);
        // A semicolon often separates the declared schema from the next
        // behavior: "add amount, category, date, and note; validate...".
        // Keeping that clause attached makes the last label fail the bounded
        // name check and silently falls back to a stock schema.
        const tail = rawTail.split(/\s*(?:[;ي╝ؤ]\s*|(?=(?:(?:empty|blank|missing)[-\s]+(?:name|field|input)\s+validation|required(?:[-\s]field)?\s+validation|validation|allow|add|delete|ensure|fix|persist|show|test|validate|verify)\b))/iu)[0];
        const rawItems = tail
            .split(/\s*[,ي╝î]\s*|\s+and\s+|\s+&\s+/iu)
            // Parenthetical type hints describe the field contract; they are
            // not part of the user's field name ("amount (numeric only)").
            .map(part => part.replace(/^and\s+/iu, '').replace(/\s*\([^)]{0,80}\)\s*$/u, '').trim())
            .filter(part => part.length >= 2 && part.length <= 32);
        const items = rawItems.map(part => part
            .replace(/^(?:a|an|the)\s+/iu, '')
            // "numeric-only amount" declares the amount's contract; it is
            // not the label a person should see on the form.
            .replace(/^(?:numeric|number)(?:[-\s]only)?\s+/iu, '')
            .replace(/\s+fields?$/iu, '')
            .trim());
        // A field list may be followed by capabilities in the same sentence:
        // "needs title, owner, due date, filtering and validation". The first
        // capability is a boundary, not evidence that the preceding field
        // names were imaginary. `columnsEndWhereHisNextRequestBegins` performs
        // that bounded cut; a capability in first position still yields no run.
        //  No floor here: the run check below is the same floor, and
        //  columnsEndWhereHisNextRequestBegins never grows a list. A
        //  mutation proved this one could never decide anything ظ¤ with it
        //  lowered to two, all four two-item sentences read identically.
        //  An article means he is asking for the THING, not naming a
        //  column of one.
        if (rawItems.length && rawItems.every(part => OPENS_WITH_AN_ARTICLE.test(part))) continue;
        const run = columnsEndWhereHisNextRequestBegins(items);
        const containerPrefix = sentence.slice(0, at.index);
        const typedPair = /\b(?:app|application|board|tracker|table|register|directory|form)\b/iu.test(containerPrefix)
            && run.some(part => /\b(?:toggle|checkbox|switch|input|field)\s*$/iu.test(part));
        if (run.length < (typedPair ? 2 : 3)) continue;
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
 *      sourceRequest: '╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘┘ê╪د╪ز┘è╪▒ ┘┘è┘ç ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«
 *        AUTHORITATIVE REQUIREMENTS EVIDENCE (ظخ): ╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘┘ê╪د╪ز┘è╪▒ ┘┘è┘ç
 *        ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«'
 *
 *  His sentence, Joe's paperwork, and his sentence AGAIN. Reading it
 *  gives his columns twice, and the live edit round proved it:
 *
 *      from the record   ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر ┬╖ ╪د┘┘à╪ذ┘╪║ ┬╖ ╪د┘┘à╪ذ┘╪║ ┬╖ ╪د┘╪ز╪د╪▒┘è╪«
 *      from his words    ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر ┬╖ ╪د┘┘à╪ذ┘╪║ ┬╖ ╪د┘╪ز╪د╪▒┘è╪«
 *
 *  He asked for one new column and got a duplicated one for free.
 *
 *  The cut lives HERE, at the reader every other reader goes through,
 *  rather than at each writer ظ¤ because the record is already written
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
    // A nested form schema is more specific than the surrounding tracker or
    // dashboard container. Read it before the broad container reader can
    // mistake a later visual-quality list for record fields.
    const formFields = fieldsDeclaredInsideAForm(request);
    if (formFields) return formFields;
    /**
     * A LIST OF COLUMNS IS INTRODUCED BY THE ACT OF RECORDING.
     *
     * A bare colon is not enough, and reading it as one broke a real case:
     * ┬س┘à╪ز╪ش╪▒ ╪ذ┘╪خ╪د╪ز: ┘é┘ç┘ê╪ر╪î ╪ث╪»┘ê╪د╪ز╪î ╪ص┘┘ê┘è╪د╪ز┬╗ enumerates the VALUES of one field, and
     * this reader turned them into five columns and threw away the shop's own
     * schema. ┬س╪ذ┘╪خ╪د╪ز┬╗ is not the signal either ظ¤ naming that one word would be
     * the memorised-prompt disease again.
     *
     * What separates the two is who the list belongs to: columns follow the
     * verb of recording ظ¤ ┬س╪ث╪│╪ش┘ ┘┘è┘ç ظخ:┬╗, ┬سrecord students:┬╗, ┬س┘┘è┘ç╪د ╪د┘╪ص┘é┘ê┘:┬╗.
     * Values follow a field. So the enumeration is only read when a recording
     * phrase stands in front of it.
     */
    /**
     *  A VERB STANDS ALONE. A NOUN NEEDS TO BE INTRODUCED.
     *
     *  Manus attacked this and was right. The canonical WeatherGo prompt
     *  contains ┬سa visible city search FIELD with a Search button┬╗, and the
     *  bare `field` opener turned the UI requirements that followed into
     *  seven columns of a user record:
     *
     *      with a Search button ┬╖ Enter-key submission ┬╖ reject empty input
     *      show loading state ┬╖ and show clear invalid-city ┬╖
     *      network-failure ┬╖ and API-error states
     *
     *  Seven columns nobody asked for, and worse: the false schema made the
     *  app look `generic`, so the weather blueprint never got to run.
     *
     *  This is the law of ┬س┘╪«┘ّ ╪د┘╪╣╪▒╪ذ┘è╪ر┬╗ in English clothes ظ¤ a bare noun
     *  matched without context. ┬س╪ث╪│╪ش┘┬╗ and `record` are VERBS: a man who
     *  writes one is doing the recording, and the list follows. ┬س╪د┘╪ص┘é┘ê┘┬╗,
     *  `columns` and `fields` are NOUNS: they name the thing rather than
     *  do it, and a noun means a declaration only when it is introduced ظ¤
     *  by a colon, or by ┬س┘ç┘è┬╗/`are`/`include`.
     */
    /**
     *  A VERB WAS LEARNED IN ONE PERSON.
     *
     *  He can write the verb about himself ظ¤ ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ╪ث╪ز╪د╪ذ╪╣ ┘┘è┘ç ╪د┘╪╖┘╪ذ╪د╪ز
     *  ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«┬╗ ظ¤ or about the thing he is asking for ظ¤ ┬س╪ذ╪»┘è
     *  ╪ذ╪▒┘╪د┘à╪ش ┘è╪ز╪د╪ذ╪╣ ╪د┘╪╖┘╪ذ╪د╪ز ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪ز╪د╪▒┘è╪«┬╗. Same verb, same request,
     *  same three columns. Measured, the first gave three columns and the
     *  second gave none: the list held ┬س╪ث╪ز╪د╪ذ╪╣┬╗ and ┬س╪د╪ز╪د╪ذ╪╣┬╗ and stopped.
     *
     *  This is not new vocabulary and must not become any. Arabic builds
     *  the imperfect by putting a person on the front of a stem ظ¤ ╪ث for
     *  ┬سI┬╗, ┘è for ┬سhe┬╗, ╪ز for ┬سshe┬╗, ┘ for ┬سwe┬╗ ظ¤ so the stems already on
     *  the list are conjugated here instead of being written out four
     *  times each and drifting apart the first time one of them is edited.
     *
     *  ┬س┘è╪│╪ش┘┬╗ hid this for a while by accident: it contains ┬س╪│╪ش┘┬╗, which
     *  is a container NOUN, so it matched RECORD_CONTAINER and took the
     *  other branch. ┬س┘è╪ز╪د╪ذ╪╣┬╗ and ┬س┘è╪»┘è╪▒┬╗ contain no such noun and returned
     *  nothing at all.
     */
    const RECORDING_VERB = new RegExp(
        '(?:^|[\\s╪î:╪ؤ(])(?:' + CONJUGATED + '|┘┘è┘ç╪د|┘┘è┘ç|[╪ز┘è]╪ص╪ز┘ê┘è ╪╣┘┘ë|record|track|log(?!\\s+of\\b)|manage|organi[sz]e)(?=$|[\\s╪î:╪ؤ)])',
        'iu',
    );
    const DECLARED_LIST = /(?:^|[\s╪î:╪ؤ(])(?:╪د┘╪ص┘é┘ê┘|╪د┘╪ث╪╣┘à╪»╪ر|╪د┘╪د╪╣┘à╪»╪ر)(?=$|[\s╪î:╪ؤ)])\s*(?::|ي╝أ|┘ç┘è|include(?:s)?\b)|(?:^|[\s,;:(])(?:\bcolumns?\b|\bfields?\b)(?=$|[\s,;:)])\s*(?::|ي╝أ|are\b|include(?:s)?\b)/iu;
    const opener = RECORDING_VERB.exec(request) || DECLARED_LIST.exec(request);
    /**
     *  NO TAUGHT WORD STOOD IN FRONT OF IT ظ¤ SO READ ITS SHAPE.
     *
     *  The container has to be there (┬س╪ش╪»┘ê┘┬╗, ┬س┘é╪د╪خ┘à╪ر┬╗, ┬سtable┬╗, ┬سlist┬╗):
     *  a run of definite nouns in a sentence about nothing in particular is
     *  prose, not a schema. With a container in front and every item a
     *  definite name, the run IS the columns, whatever word introduced it ظ¤
     *  or no word at all, just a colon.
     */
    if (!opener) {
        // A direct English field list is more specific than a broad container
        // noun such as "tracker". The list reader rejects UI nouns beginning
        // with an article, so this precedence keeps "Add a button" out while
        // preserving "Add amount, category, date, and note" as a schema.
        const handed = theListAnIntroducerHandedOver(request);
        if (handed) return handed;
        const holder = RECORD_CONTAINER.exec(request);
        if (!holder) {
            //  ORDER IS THE WHOLE ARGUMENT HERE.
            //
            //  This first sat above the container check and beat it ظ¤ six
            //  suites went red at once, because ┬سA clients table with name,
            //  phone and address┬╗ has both a container AND an introducer,
            //  and the container reader is the one that knows what ┬سtable┬╗
            //  means. An introducer is what you reach for when nothing
            //  better answered, so it runs where nothing better did.
            //  And grammar last of all.
            return entityAndItsAttributes(request);
        }
        const tail = request.slice((holder.index || 0) + holder[0].length);
        const colonAt = Math.max(tail.indexOf(':'), tail.indexOf('ي╝أ'));
        const scope = (colonAt >= 0 ? tail.slice(colonAt + 1) : tail).split(/[.╪ا!\n]/)[0] || '';
        let items = scope
            .split(/\s*[╪î,]\s*|\s+┘ê(?=\S)|\s+and\s+|\s+&\s+/iu)
            .map(p => p.trim().replace(/^and\s+/iu, '').replace(/^[:ي╝أ]\s*/u, '').trim())
            .filter(p => p.length >= 2 && p.length <= 32);
        //  The first item carries whatever stood between the container and the
        //  list ظ¤ ┬س╪ش╪»┘ê┘ ┘┘┘à╪╡╪د╪▒┘è┘ ┘è╪ص┘ê┘è ╪د┘╪ز╪د╪▒┘è╪«┬╗ hands back ┬س┘┘┘à╪╡╪د╪▒┘è┘ ┘è╪ص┘ê┘è
        //  ╪د┘╪ز╪د╪▒┘è╪«┬╗ as one item. The name begins at the first word that opens
        //  with ┬س╪د┘┬╗; everything before it is the sentence, not the column.
        //  A colon has already cut the container away, so what is left is
        //  his own label ظ¤ ┬س┘┘┘┘ê╪د╪ز┘è╪▒: ╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر┬╗ leaves ┬س╪▒┘é┘à ╪د┘┘╪د╪ز┘ê╪▒╪ر┬╗,
        //  and cutting to the article there would hand him ┬س╪د┘┘╪د╪ز┘ê╪▒╪ر┬╗ and
        //  throw away ┬س╪▒┘é┘à┬╗. Only an uncut residue is the container's own.
        if (items.length) items[0] = firstColumnBeginsAtTheName(items[0], colonAt < 0);
        //  The same job in English, where there is no ┬س╪د┘┬╗ to find. What
        //  stands between the container and the list is a preposition ظ¤ a
        //  closed class of function words, not a catalogue of nouns ظ¤ and
        //  ┬سwith name┬╗ is the sentence plus the column, not a column
        //  called ┬سwith name┬╗.
        //  DROP THE RULE, KEEP THE LIST ظ¤ in that order.
        //
        //  Caught by a live round, not by a test: ┬سظخ: ╪د┘╪ز╪د╪▒┘è╪« ┘ê╪د┘┘à╪ذ┘╪║ ┘ê╪د┘╪│╪ذ╪ذ╪î
        //  ┘ê╪د┘┘à╪ذ┘╪║ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗ has three names and one rule, and asking
        //  ┬سis EVERY item a name?┬╗ threw all four away. Joe then built a
        //  memorised expense template ظ¤ Item, Amount, Category, Date, Note ظ¤
        //  and none of the three columns he actually wrote.
        //
        //  The rule is removed first; what remains must then be a list of
        //  definite names, which is what keeps ┬س┘é┘ç┘ê╪ر╪î ╪ث╪»┘ê╪د╪ز╪î ╪ص┘┘ê┘è╪د╪ز┬╗ out.
        //  The list ends where his next request begins ظ¤ same table.
        items = columnsEndWhereHisNextRequestBegins(items);
        const names = items.filter(isAName).filter(notAContainerItself);
        /**
         *  TWO NAMED COLUMNS ARE A TABLE WHEN HE NAMED THE TABLE.
         *
         *  Live round, and the whole shape of the failure:
         *
         *      ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘â╪ز╪ذ ┘┘è┘ç ╪د┘╪╣┘┘ê╪د┘ ┘ê╪د┘╪│╪╣╪▒┬╗
         *      ظْ derivedColumns: 0 columns
         *      ظْ template classification: page=generic ┬╖ app=none
         *      ظْ ┬سI don't know this app type and have no ready engine┬╗
         *      ظْ Navbar ┬╖ Hero ┬╖ Features ┬╖ Steps ┬╖ FAQ ┬╖ Contact
         *
         *  He named a container and two columns and received a brochure.
         *  The threshold was three, and three is the right floor for a bare
         *  run of nouns in prose ظ¤ ┬س╪د┘╪▒┘è╪د╪╢╪î ╪ش╪»╪ر╪î ╪د┘╪»┘à╪د┘à┬╗ must not become a
         *  schema. But he did not write a bare run: he wrote ┬س╪ش╪»┘ê┘┬╗ first.
         *
         *  With a container named, the ambiguity that the third item was
         *  guarding against is gone, and two definite names are a table. One
         *  is still refused: a single noun after ┬س╪ش╪»┘ê┘┬╗ is its subject, not
         *  its column ظ¤ ┬س╪ش╪»┘ê┘ ╪د┘┘à╪ذ┘è╪╣╪د╪ز┬╗ names no columns at all.
         */
        /**
         *  A LIST HOLDS VALUES. A TABLE HOLDS COLUMNS.
         *
         *  In Arabic the items answer this themselves by being definite or
         *  not. English has no such mark, so the container answers: ┬سa
         *  shopping list with milk, bread and eggs┬╗ names three things it
         *  holds, and ┬سa clients table with name, phone and address┬╗ names
         *  three attributes of each thing it holds. Reading the first as a
         *  schema would give him a two-row app about milk.
         */
        const holdsColumns = !/^(?:list|┘é╪د╪خ┘à╪ر)$/iu.test(holder[1] || '');
        const floor = holder ? 2 : 3;
        if (names.length < floor || names.length > 10) return null;
        //  Latin items carry no definiteness of their own, so the container
        //  they hang from decides ظ¤ and a bare ┬سlist┬╗ decides no.
        if (names.some(n => !/[╪-█┐]/u.test(n)) && !holdsColumns) return null;
        if (!everyItemIsADefiniteName(names)) return null;
        //  THE LINK THAT WAS NEVER JOINED.
        //
        //  statedBound reads the condition. DerivedField carries a bound.
        //  react-app-templates emits ┬سmin┬╗ and ┬سminExclusive┬╗ into the
        //  schema. The generated app validates against them and even
        //  says ┬س╪ث┘â╪ذ╪▒ ┘à┘ N┬╗ in its own error. Four parts of one chain,
        //  built, and this link never joined ظ¤ so ┬س┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗
        //  reached a field with no min and zero was accepted.
        const built = fieldsFromLabels(names);
        return built ? applyStatedRules(built, statedRules(request)).fields : built;
    }
    let after = request.slice((opener.index || 0) + opener[0].length);
    //  A colon further along is the real start of the list: ┬س╪ث╪│╪ش┘ ┘┘è┘ç ╪د┘┘à┘ê╪د╪╣┘è╪»:
    //  ╪د╪│┘à ╪د┘┘à╪▒┘è╪╢ ┘êظخ┬╗ ظ¤ the noun before it is the subject, not a column.
    const colon = after.indexOf(':') >= 0 ? after.indexOf(':') : after.indexOf('ي╝أ');
    if (colon >= 0 && colon <= 40) after = after.slice(colon + 1);
    const sentence = after.split(/[.╪ا!\n]/)[0] || '';
    /**
     *  A BRACKET AFTER A COLUMN NAMES ITS ANSWERS, NOT THE NEXT COLUMN.
     *
     *  Measured on a real request: ┬س╪ش╪»┘ê┘ ╪د┘┘à┘╪ز╪ش╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘╪│╪╣╪▒
     *  ┘ê╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒ ╪ث┘ê ┘╪د┘╪») ┘ê╪╡┘ê╪▒╪ر┬╗ produced TWO columns ظ¤ ┬س╪د╪│┘à ╪د┘╪╡┘┘┬╗
     *  and ┬س╪د┘╪│╪╣╪▒┬╗. ┬س╪د┘╪ص╪د┘╪ر┬╗ and ┬س╪╡┘ê╪▒╪ر┬╗ were both lost, because ┬س╪ث┘ê┬╗ inside
     *  his bracket is on the list separator, so the split cut the sentence
     *  in the middle of a parenthesis and left ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒┬╗ and ┬س┘╪د┘╪»)┬╗,
     *  neither of which survives the name test.
     *
     *  He was not listing four things and then two more. He was naming a
     *  column and, in the same breath, saying what its answers are ظ¤ which
     *  is how anyone describes a status field. So the bracket is shielded
     *  from the split and then read as OPTIONS, which makes ┬س╪د┘╪ص╪د┘╪ر┬╗ a real
     *  select column offering ┬س┘à╪ز┘ê┘╪▒┬╗ and ┬س┘╪د┘╪»┬╗ instead of a free-text box
     *  he has to retype into every row.
     */
    const SHIELD = String.fromCharCode(2);
    //  The separator is REPLACED, not merely fenced. The first version wrapped
    //  it ظ¤ ┬س┘à╪ز┘ê┘╪▒╪î┘╪د┘╪»┬╗ ظ¤ and the comma was still a comma, so the
    //  split cut through it exactly as before and ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒┬╗ came out as a
    //  column name. A shield that leaves the blade in place is not a shield.
    const shielded = sentence.replace(/[(ي╝ê][^)ي╝ë]{1,60}[)ي╝ë]/g,
        m => m.replace(/\s*[╪î,]\s*|\s+┘ê(?=\S)|\s+and\s+|\s+╪ث┘ê\s+|\s+╪د┘ê\s+|\s+or\s+/giu, SHIELD));
    let parts = shielded
        //  Lists are joined differently in each language: ┬س┘ê┬╗ is a prefix on the
        //  next word, ┬سand┬╗ is a word of its own. A reader that knows only one of
        //  them reads only one language's requests.
        .split(/\s*[╪î,]\s*|\s+┘ê(?=\S)|\s+and\s+|\s+&\s+/iu)
        //  Restored as a SEPARATOR, not a space: the option reader below
        //  splits ┬س┘à╪ز┘ê┘╪▒╪î ┘╪د┘╪»┬╗ into two answers and ┬س┘à╪ز┘ê┘╪▒ ┘╪د┘╪»┬╗ into one,
        //  so joining with a space silently turned his choice into a single
        //  meaningless value ظ¤ measured, the column survived and its answers
        //  did not.
        .map(p => p.split(SHIELD).join('╪î ').replace(/\s{2,}/g, ' '))
        .map(p => p.trim()
            .replace(/^and\s+/iu, '')
            .replace(/^(?:╪د┘)?┘â┘\s+/u, '')
            .replace(/^[:ي╝أ]\s*/u, '').trim())
        .filter(p => p.length >= 2 && p.length <= 32);
    //  The lesson the container branch learned, applied here too: after
    //  ┬س╪د╪│╪ش┘┬╗ the connector ┬س┘┘è┘ç┬╗ is still standing, and it became a column.
    if (parts.length) parts[0] = firstColumnBeginsAtTheName(parts[0], false);
    /**
     *  THE SAME FLOOR, A THIRD TIME ظ¤ AND THIS IS THE ONE THAT RAN.
     *
     *  ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘â╪ز╪ذ ┘┘è┘ç ╪د┘╪╣┘┘ê╪د┘ ┘ê╪د┘╪│╪╣╪▒┬╗ never reached the shape path at
     *  all: ┬س┘┘è┘ç┬╗ is itself a recording opener, so this branch handled it,
     *  and its own floor of three refused two columns. Two copies of the
     *  rule were raised and the third ظ¤ the one actually taken ظ¤ was not.
     *
     *  Same reasoning as the others: he named a container, so two definite
     *  names are his table. One is a subject, not a column.
     */
    /**
     *  THE BRACKET IS HIS ANSWERS, AND IT IS NOT PART OF THE NAME.
     *
     *  Measured. ┬سظخ┘ê╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒ ╪ث┘ê ┘╪د┘╪»)┬╗ lost the column entirely, and the
     *  cause was not the split ظ¤ it was the name test three lines down. A
     *  name is capped at three Arabic words; ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒ ╪ث┘ê ┘╪د┘╪»)┬╗ counts
     *  as four, so the whole column was thrown away with its answers.
     *
     *  Bisected to be sure: ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒)┬╗ survives, ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒/┘╪د┘╪»)┬╗
     *  survives, ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒ ╪ث┘ê ┘╪د┘╪»)┬╗ does not. One word over the cap.
     *
     *  So the bracket comes off before the name is measured, and what was in
     *  it becomes the column's OPTIONS ظ¤ which is what he meant: a status
     *  field offering ┬س┘à╪ز┘ê┘╪▒┬╗ and ┬س┘╪د┘╪»┬╗, not a free-text box he retypes into
     *  every row. The cap still guards the name itself, which is its job.
     */
    const declaredOptions = new Map();
    parts = parts.map(p => {
        const m = /^([\s\S]*?)\s*[(ي╝ê]([^)ي╝ë]{1,60})[)ي╝ë]\s*$/.exec(p);
        if (!m) return p;
        const label = m[1].trim();
        const opts = m[2].split(/\s*[╪î,\/|]\s*|\s+╪ث┘ê\s+|\s+╪د┘ê\s+|\s+or\s+/iu)
            .map(x => x.trim()).filter(x => x.length >= 1 && x.length <= 24);
        if (label.length >= 2 && opts.length >= 2) declaredOptions.set(label, opts);
        return label.length >= 2 ? label : p;
    });
    //  ظخand the bracket comes off BEFORE the list is cut, not after.
    //  `columnsEndWhereHisNextRequestBegins` stops at the first part that
    //  does not read as a column, and ┬س╪د┘╪ص╪د┘╪ر (┘à╪ز┘ê┘╪▒ ╪ث┘ê ┘╪د┘╪»)┬╗ does not ظ¤
    //  so the truncation took ┬س╪╡┘ê╪▒╪ر┬╗ with it. Measured: stripping after the
    //  cut fixed the bracket and still lost everything behind it.
    //  The list ends where his next request begins.
    parts = columnsEndWhereHisNextRequestBegins(parts);
    /**
     *  ┬س┘┘è┘ç┬╗ POINTS AT WHATEVER HE NAMED, AND THAT NEED NOT HOLD RECORDS.
     *
     *  I lowered this floor to two whenever ┬س┘┘è┘ç┬╗ or ┬س┘┘è┘ç╪د┬╗ appeared,
     *  reasoning that the pronoun points back at a container he named.
     *  It does ظ¤ but at whatever he named, and ┬س╪╡┘╪ص╪ر┬╗ is a page:
     *
     *      ┬س╪د╪╣┘à┘ ╪╡┘╪ص╪ر ┘┘è┘ç╪د: ╪د┘╪د╪│┘à ┘ê╪د┘╪│╪╣╪▒┬╗            must be null
     *      ┬س╪ذ╪»┘è ╪╡┘╪ص╪ر ┘┘è┘ç╪د ╪د┘╪ص┘é┘ê┘ ╪▓╪║╪▒┘ê╪»╪ر ┘ê╪د┘╪▓╪▒ ╪ح╪▒╪│╪د┘┬╗  must be null
     *
     *  Two tests older than that change say so in words ظ¤ ┬سtwo is not a
     *  list┬╗ ظ¤ and I contradicted a stated rule without having read it.
     *  The floor of three is the guard against a run of two nouns in
     *  prose becoming a schema, and a pronoun aimed at a page does not
     *  remove that ambiguity. It stands.
     *
     *  The cost is stated rather than hidden: ┬س╪ذ╪»┘è ╪ز╪╖╪ذ┘è┘é ┘┘╪ص╪ش┘ê╪▓╪د╪ز ┘┘è┘ç
     *  ╪د╪│┘à ╪د┘╪╣┘à┘è┘ ┘ê┘ê┘é╪ز ╪د┘╪ص╪ش╪▓┬╗ names two columns and is refused. That is
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
    //  react-app-templates emits ┬سmin┬╗ and ┬سminExclusive┬╗ into the
    //  schema. The generated app validates against them and even
    //  says ┬س╪ث┘â╪ذ╪▒ ┘à┘ N┬╗ in its own error. Four parts of one chain,
    //  built, and this link never joined ظ¤ so ┬س┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗
    //  reached a field with no min and zero was accepted.
    const built = fieldsFromLabels(named);
    //  ظخand the answers reach the field, so the app renders a select.
    if (built) for (const f of built) {
        const opts = declaredOptions.get(String(f.label));
        if (opts) { (f as any).options = opts; (f as any).type = 'select'; }
    }
    return built ? applyStatedRules(built, statedRules(request)).fields : built;
}

/**
 *  A LIST THAT LOST TO AN EARLIER LIST IS STILL HIS LIST.
 *
 *  Measured on his machine, in front of him, from a long request. Bisected by
 *  adding one sentence at a time, same columns clause throughout:
 *
 *      ┬سظخ ╪د╪╣┘à┘ ╪ش╪»┘ê┘ ┘┘è┘ç ╪د╪│┘à ╪د┘┘é╪╖╪╣╪ر ┘ê╪▒┘é┘à ╪د┘┘é╪╖╪╣╪ر ┘êظخ┬╗              ظْ 7 columns
 *      ┬سظخ ┘╪╕╪د┘à╪د┘ï ┘┘è┘ç ╪س┘╪د╪س ╪╡┘╪ص╪د╪ز: ╪╡┘╪ص╪ر ╪د┘┘à╪«╪▓┘ê┘ ┘êظخ . <the same>┬╗   ظْ 0 columns
 *
 *  And it is not the colon ظ¤ the same request without one also read zero. It
 *  is ORDER. `derivedColumns` finds the first opener in the request, reads the
 *  enumeration after it, and when that yields nothing usable it returns null
 *  instead of looking at the next one. ┬س┘┘è┘ç ╪س┘╪د╪س ╪╡┘╪ص╪د╪ز┬╗ is an opener; the
 *  pages after it are not columns; and the seven columns two sentences later
 *  were never reached.
 *
 *  What Joe then said to him was worse than silence:
 *
 *      ┬سOne question before I start ظ¤ what do you want to record for each of
 *       your ╪د╪╣╪▒╪╢ ╪ح╪ش┘à╪د┘┘è?┬╗
 *
 *  ظ¤ a question whose answer he had already written, seven times, in the same
 *  breath. The fourth law is that the request is the authority; a reader that
 *  gives up on the first miss hands that authority back.
 *
 *  The class: A READER THAT TAKES THE FIRST CANDIDATE AND NEVER RETRIES. In a
 *  short request the column list is usually the only list. In a real one it
 *  almost never is. `derivedTables` already walks every sentence for exactly
 *  this reason ظ¤ the walk just never reached the reader everyone calls.
 *
 *  So: the whole request first, unchanged, because a list stated across two
 *  sentences must stay one list. Only when that finds nothing are the
 *  sentences tried one at a time, and the first that yields columns wins.
 */
export function columnsAnywhereInHisRequest(requestRaw: string): DerivedField[] | null {
    const request = String(requestRaw || '');
    // Capabilities joined by commas are a workflow contract, not a declaration
    // of record fields. Let the workflow schema own its data shape.
    if (hasWorkflowApplicationContract(request)) return null;
    const whole = derivedColumns(request);
    if (whole && whole.length) return whole;
    //  More than one sentence, or there is nothing new to try and the guard
    //  below would only repeat the reading that just failed.
    const pieces = request.split(/(?<=[.╪ا!\n])/u).map(p => p.trim()).filter(p => p.length > 8);
    if (pieces.length < 2) return whole;
    for (const piece of pieces) {
        /**
         *  A SECOND CHANCE MUST BE STRICTER THAN THE FIRST, OR IT INVENTS.
         *
         *  Measured the moment this loop was written. On an English brief it
         *  returned, as a table schema:
         *
         *      ["accessible contrast", "helpful empty", "loading"]
         *
         *  ظ¤ read out of ┬سUse a clean light theme with accessible contrast and
         *  helpful empty, loading, and error states┬╗. A sentence about colour
         *  became three columns, and the expenses archetype that had been
         *  right for years was overruled by it.
         *
         *  The whole-request read is allowed to be generous because it sees
         *  the whole request. A per-sentence retry sees a fragment, so it must
         *  demand the fragment DECLARE a table: ┬س╪ش╪»┘ê┘┬╗, ┬س╪│╪ش┘┬╗, ┬سtable┬╗,
         *  ┬سlist┬╗ ظ¤ the container test this file already owns. His inventory
         *  sentence says ┬س╪د╪╣┘à┘ ╪ش╪»┘ê┘ ┘┘è┘çظخ┬╗ and passes; a sentence about a
         *  theme says nothing of the kind and is refused.
         */
        if (!RECORD_CONTAINER.test(piece)) continue;
        const cols = derivedColumns(piece);
        if (!cols || !cols.length) continue;
        /**
         *  HIS COLUMNS ARE IN ONE SENTENCE. HIS RULES ARE IN THE OTHERS.
         *
         *  Measured on his own long request. The bound was read, and applied,
         *  and still reached the generated app as nothing:
         *
         *      statedRules(whole)        ظْ { kind: 'bound', min: 0 }   ظ£à
         *      applyStatedRules(ظخ, that) ظْ ╪د┘┘â┘à┘è╪ر.min = 0              ظ£à
         *      blueprintFor(whole)       ظْ no field carries a min      ظإî
         *
         *  `derivedColumns(piece)` ends by applying the rules of THAT PIECE,
         *  and ┬س┘╪د ╪ز┘é╪ذ┘ ┘â┘à┘è╪ر ╪ذ╪د┘╪│╪د┘╪ذ┬╗ is two sentences away from ┬س╪د╪╣┘à┘ ╪ش╪»┘ê┘
         *  ┘┘è┘ç ╪د╪│┘à ╪د┘┘é╪╖╪╣╪ر ┘êظخ┬╗. So a reader that found his columns by looking
         *  sentence-by-sentence then judged them against one sentence's
         *  worth of conditions, and dropped every rule he stated elsewhere.
         *
         *  The same class as the search that found them: a decision made
         *  from a fragment when the authority is the whole request.
         */
        return applyStatedRules(cols, statedRules(request)).fields;
    }
    return whole;
}

/** Turn the labels he wrote into fields, once, for every path that finds them. */
/**
 * Preserve the stable identity of a universally understood field only when
 * the person named it exactly. Role-based keys remain necessary for distinct
 * values such as purchase and sale price.
 */
function canonicalFieldKey(label: string): string | null {
    const normalized = stripArabicDiacritics(String(label || ''))
        .trim()
        .toLocaleLowerCase()
        .replace(/\s+/gu, ' ')
        .replace(/\s+(?:field|fields|╪ص┘é┘|╪د┘╪ص┘é┘ê┘)$/iu, '');
    if (/^(?:amount|╪د┘┘à╪ذ┘╪║)$/iu.test(normalized)) return 'amount';
    if (/^(?:category|╪د┘┘╪خ╪ر|╪د┘╪ز╪╡┘┘è┘)$/iu.test(normalized)) return 'category';
    if (/^(?:date|╪د┘╪ز╪د╪▒┘è╪«)$/iu.test(normalized)) return 'date';
    if (/^(?:description|╪د┘┘ê╪╡┘)$/iu.test(normalized)) return 'description';
    if (/^(?:note|┘à┘╪د╪ص╪╕╪ر)$/iu.test(normalized)) return 'note';
    if (/^(?:image|photo|picture|╪د┘╪╡┘ê╪▒╪ر|╪╡┘ê╪▒╪ر)$/iu.test(normalized)) return 'image';
    if (/^(?:title|╪د┘╪╣┘┘ê╪د┘|╪╣┘┘ê╪د┘)$/iu.test(normalized)) return 'title';
    if (/^(?:tags?|╪د┘┘ê╪│┘ê┘à|┘ê╪│┘ê┘à)$/iu.test(normalized)) return 'tags';
    if (/^(?:notes|╪د┘┘à┘╪د╪ص╪╕╪د╪ز|┘à┘╪د╪ص╪╕╪د╪ز)$/iu.test(normalized)) return 'notes';
    return null;
}

/**
 * One canonical answer to whether the user explicitly declared stored fields.
 * Callers must not grow their own field-name catalogues: those duplicate paths
 * drift and eventually mistake capability lists for record schemas.
 */
export function isCliRequest(requestRaw: string): boolean {
    const request = stripArabicDiacritics(String(requestRaw || '')).trim();
    const cliSignals = /\b(?:cli|command[- ]?line|utility|script|tool|utility\s+script|command[- ]?line\s+tool|console\s+app|terminal\s+app|standalone\s+(?:tool|script|utility)|runnable\s+(?:script|tool|utility)|exit\s+code|stdin|stdout|stderr|argument\s+parsing|flag\s+parsing)\b/i;
    if (cliSignals.test(request)) return true;
    const csvInputSignals = /\b(?:csv|tsv)\b.*\b(?:column|field|header)\b|\bcolumn\b.*\b(?:csv|tsv)\b|(?:\binput\b|\bfile\b).*\b(?:csv|tsv)\b|\b(?:csv|tsv)\b.*\b(?:input|file)\b/i;
    if (csvInputSignals.test(request)) return true;
    return false;
}

export function hasExplicitRecordSchema(requestRaw: string): boolean {
    if (hasWorkflowApplicationContract(requestRaw)) return false;
    const request = stripArabicDiacritics(String(requestRaw || '')).trim();
    const clauseStart = '(?:^|[.╪ا!\\n]\\s*)';
    const isBuildRequest = new RegExp(`${clauseStart}(?:please\\s+)?(?:create|build|make|develop|design|scaffold|generate)\\b`, 'i').test(request)
        || new RegExp(`${clauseStart}(?:╪ذ╪»┘è|╪ث╪▒┘è╪»|╪د╪▒┘è╪»|╪ث┘╪┤╪خ|╪د┘╪┤╪خ|╪د╪ذ┘|╪د╪╡┘╪╣|╪╡┘à┘à|╪╖┘ê┘ّ╪▒|╪╖┘ê╪▒|╪د╪╣┘à┘)(?:\\s|$)`, 'iu').test(request);
    if (!isBuildRequest) return false;
    // CLI/utility/script requests are NOT persistent record schemas
    if (isCliRequest(requestRaw)) return false;
    const columns = columnsAnywhereInHisRequest(requestRaw);
    return Array.isArray(columns) && columns.length >= 2;
}

function fieldsFromLabels(parts: string[]): DerivedField[] | null {
    const seen = new Map<DerivedRole, number>();
    const usedKeys = new Set<string>();
    const out: DerivedField[] = [];
    for (const rawLabel of parts) {
        const toggle = /\b(?:toggle|checkbox|switch)\b|(?:┘à┘╪ز╪د╪ص|╪«┘è╪د╪▒)\s*(?:╪ز╪ذ╪»┘è┘|╪ز╪┤╪║┘è┘)/iu.test(rawLabel);
        const label = toggle
            ? rawLabel.replace(/\s+(?:toggle|checkbox|switch)\s*$/iu, '').trim() || rawLabel
            : rawLabel;
        let role: DerivedRole = 'text';
        let type: FieldType = 'text';
        if (toggle) {
            role = 'flag';
            type = 'select';
        } else {
            for (const [mark, r, t] of TYPE_MARKS) {
                if (mark.test(label)) { role = r; type = t; break; }
            }
        }
        const n = (seen.get(role) || 0) + 1;
        seen.set(role, n);
        const canonicalKey = canonicalFieldKey(label);
        const key = canonicalKey && !usedKeys.has(canonicalKey) ? canonicalKey : `${role}${n}`;
        usedKeys.add(key);
        //  The answers are written in the language of his own label, so an
        //  Arabic column offers ┬س┘╪╣┘à/┘╪د┬╗ and an English one Yes/No.
        const status = /status|state|┘à╪▒╪ص┘╪ر|╪ص╪د┘╪ر|┘ê╪╢╪╣/iu.test(label);
        const options = role === 'flag'
            ? status
                ? (/[╪-█┐]/.test(label)
                    ? ['┘é┘è╪» ╪د┘╪د┘╪ز╪╕╪د╪▒', '┘é┘è╪» ╪د┘╪ح╪╡┘╪د╪ص', '╪ز┘à ╪د┘╪ح╪╡┘╪د╪ص']
                    : ['Pending', 'In progress', 'Completed'])
                : toggle
                    ? (/[╪-█┐]/.test(label) ? ['┘╪د', '┘╪╣┘à'] : ['No', 'Yes'])
                    : (/[╪-█┐]/.test(label) ? ['┘╪╣┘à', '┘╪د'] : ['Yes', 'No'])
            : undefined;
        out.push({ label, key, type, role, options, ...(toggle ? { control: 'toggle' as const } : {}) });
    }
    //  THE SAME FLOOR, WRITTEN TWICE ظ¤ AND ONE COPY WAS NOT MOVED.
    //
    //  The caller was raised to two when he names the container, and this
    //  still refused two, so ┬س╪ذ╪»┘è ╪ش╪»┘ê┘ ┘┘┘â╪ز╪ذ ┘┘è┘ç ╪د┘╪╣┘┘ê╪د┘ ┘ê╪د┘╪│╪╣╪▒┬╗ kept
    //  coming back empty and kept becoming a brochure. A rule written in
    //  two places is a rule that will be changed in one.
    //
    //  Two is the floor here: one label is a subject, not a table.
    return out.length >= 2 ? out : null;
}

/**
 * A COLUMN HE ASKS TO ADD, AND ONE HE ASKS TO DROP.
 *
 * ┬س╪╢┘è┘ ╪╣┘à┘ê╪» ╪د┘╪«╪╡┘à┬╗ is not a new table and not a new app: it is one column,
 * named, on the table already in front of him. Reading it needs no vocabulary
 * of columns ظ¤ the ADD VERB introduces the noun, and the noun introduces the
 * name, which is the same grammar that lets ┬س╪د┘╪ص┘é┘ê┘: ظخ┬╗ declare a list while a
 * bare ┬سfield┬╗ does not.
 *
 * What it must never do is guess. If he names nothing after the noun, nothing
 * is added and the edit says so rather than inventing a column called ┬س╪╣┘à┘ê╪»┬╗.
 */
/**
 *  A RENAME IS NEITHER AN ADD NOR A REMOVE.
 *
 *  Measured on his own follow-up:
 *
 *      columnEdit(┬س╪║┘è┘ّ╪▒ ╪د╪│┘à ╪╣┘à┘ê╪» ╪د┘┘à╪ذ┘╪║ ╪ح┘┘ë ╪د┘┘é┘è┘à╪ر┬╗)
 *          ظْ { add: [], remove: [] }
 *
 *  Nothing. This reader knows two verbs and his was a third, so a
 *  rename after a build did nothing at all and said nothing about
 *  it ظ¤ the worst pair there is.
 *
 *  A rename is not ┬سremove that column and add this one┬╗: the data
 *  in it is his, and dropping the column drops the rows' values
 *  with it. The key and the type stay; the label he reads changes.
 */
export interface ColumnEdit { add: string[]; remove: string[]; rename?: { from: string; to: string } }

const ADD_COLUMN = /(?:╪╢┘è┘|╪ث╪╢┘|╪د╪╢┘|╪د╪╢╪د┘╪ر|╪ح╪╢╪د┘╪ر|╪▓┘è╪»|╪ص╪╖|\badd\b)\s+(?:a|an|the)?\s*(?:╪╣┘à┘ê╪»|╪د┘╪╣┘à┘ê╪»|╪«╪د┘╪ر|╪د┘╪«╪د┘╪ر|╪ص┘é┘|╪د┘╪ص┘é┘|column|field)\s+(?:╪د╪│┘à┘ç\s+|╪ذ╪د╪│┘à\s+|called\s+|named\s+|for\s+|the\s+)?([^\n╪î,.╪ؤ;]{2,32})/iu;
const DROP_COLUMN = /(?:╪┤┘è┘|╪د╪ص╪░┘|╪ث╪ص╪░┘|╪د┘à╪│╪ص|╪د┘╪║┘?┘è?|╪ث┘╪║┘|\bremove\b|\bdrop\b|\bdelete\b)\s+(?:a|an|the)?\s*(?:╪╣┘à┘ê╪»|╪د┘╪╣┘à┘ê╪»|╪«╪د┘╪ر|╪د┘╪«╪د┘╪ر|╪ص┘é┘|╪د┘╪ص┘é┘|column|field)\s+(?:the\s+)?([^\n╪î,.╪ؤ;]{2,32})/iu;
/**
 *  The connector is the closed class, not the verb. ┬س╪ح┘┘ë / ╪د┘┘ë /
 *  ┘┘è╪╡╪ذ╪ص / ┘┘è╪╡┘è╪▒ / to┬╗ is the same set ProjectEditTool already uses
 *  to rename an app, and a second copy would drift the first time one
 *  of them learned a word the other did not.
 */
const RENAME_COLUMN = /(?:╪║┘è┘ّ?╪▒|╪ذ╪»┘ّ?┘|╪│┘à┘ّ?┘?|\brename\b|\bchange\b)\s+(?:╪د╪│┘à\s+)?(?:a|an|the)?\s*(?:╪╣┘à┘ê╪»|╪د┘╪╣┘à┘ê╪»|╪«╪د┘╪ر|╪د┘╪«╪د┘╪ر|╪ص┘é┘|╪د┘╪ص┘é┘|column|field)\s+([^\n╪î,.╪ؤ;]{2,32}?)\s*(?:╪ح┘┘ë|╪د┘┘ë|┘┘è╪╡╪ذ╪ص|┘┘è╪╡┘è╪▒|┘è╪╡┘è╪▒|╪ز╪╡┘è╪▒|\bto\b)\s+([^\n╪î,.╪ؤ;]{2,32})/iu;
//  ARABIC PUTS THE NAME AFTER THE CONTAINER, ENGLISH BEFORE IT.
//
//  ┬س╪╣┘à┘ê╪» ╪د┘┘à╪ذ┘╪║┬╗ and ┬سthe amount column┬╗ are the same phrase in two
//  orders, and a pattern that reads one reads half his messages. The
//  same fact is already written down beside subjectAfterContainer; it
//  is a fact about the two languages, not about renaming.
const RENAME_COLUMN_EN = /(?:\brename\b|\bchange\b)\s+(?:a|an|the)?\s*([A-Za-z][A-Za-z0-9 _-]{1,31}?)\s+(?:column|field)\s+(?:\bto\b|\binto\b)\s+([A-Za-z][A-Za-z0-9 _-]{1,31})/i;

/** The one-column changes a follow-up message asks for, in his own words. */
/**
 *  A COLUMN NAME THAT SWALLOWED THE ORDER THAT ASKED FOR IT.
 *
 *  From a live round, in Joeظآs own log:
 *
 *      column edit: +[╪د┘┘à┘╪د╪ص╪╕╪د╪ز ╪▓┘è╪» ╪╣┘à┘ê╪» ╪د┘┘à┘╪د╪ص╪╕╪د╪ز] -[] ظْ 4 column(s)
 *
 *  and on his disk afterwards:
 *
 *      { key: 'text4', label: '╪د┘┘à┘╪د╪ص╪╕╪د╪ز ╪▓┘è╪» ╪╣┘à┘ê╪» ╪د┘┘à┘╪د╪ص╪╕╪د╪ز', type: 'text' }
 *
 *  His message reached Joe clean ظ¤ 18 characters, ┬س╪▓┘è╪» ╪╣┘à┘ê╪»
 *  ╪د┘┘à┘╪د╪ص╪╕╪د╪ز┬╗, read straight out of the chat store. Somewhere between
 *  that message and this reader the text arrived twice on one line, and
 *  the capture ran happily through the seam.
 *
 *  WHERE IT DOUBLES IS NOT YET FOUND, and this does not pretend to fix
 *  that. What it fixes is a thing that is true whatever the cause: a
 *  column he named never contains the words of the order that asked for
 *  it. ┬س╪╣┘à┘ê╪»┬╗ and ┬س╪▓┘è╪»┬╗ are the instruction, not the name ظ¤ the same
 *  closed class this file already reads to find the order in the first
 *  place, used a second time to say where the name ends.
 */
const AN_EDIT_WORD = /(?:^|\s)(?:╪╣┘à┘ê╪»|╪د┘╪╣┘à┘ê╪»|╪«╪د┘╪ر|╪د┘╪«╪د┘╪ر|╪ص┘é┘|╪د┘╪ص┘é┘|column|field|╪╢┘è┘|╪ث╪╢┘|╪د╪╢┘|╪▓┘è╪»|╪ص╪╖|╪┤┘è┘|╪د╪ص╪░┘|╪ث╪ص╪░┘|╪د┘à╪│╪ص|\badd\b|\bremove\b|\bdrop\b|\bdelete\b)(?=$|\s)/iu;

function theNameEndsBeforeTheOrderResumes(name: string): string {
    const t = String(name || '').trim();
    const at = t.search(AN_EDIT_WORD);
    return (at > 0 ? t.slice(0, at) : t).trim();
}

export function columnEdit(requestRaw: string): ColumnEdit {
    const request = String(requestRaw || '');
    const clean = (s: string): string => s.trim().replace(/^(?:╪د┘)?(?=.{3,})/u, m => m).trim();
    const add = ADD_COLUMN.exec(request);
    const drop = DROP_COLUMN.exec(request);
    const ren = RENAME_COLUMN.exec(request) || RENAME_COLUMN_EN.exec(request);
    const from = ren ? clean(ren[1]) : '';
    const to = ren ? clean(ren[2]) : '';
    return {
        add: add && add[1].trim().length >= 2 ? [theNameEndsBeforeTheOrderResumes(clean(add[1]))].filter(x => x.length >= 2) : [],
        remove: drop && drop[1].trim().length >= 2 ? [theNameEndsBeforeTheOrderResumes(clean(drop[1]))].filter(x => x.length >= 2) : [],
        ...(from.length >= 2 && to.length >= 2 && from !== to ? { rename: { from, to } } : {}),
    };
}

/**
 * DID HE ASK FOR A TABLE, OR DID WE ASSUME A SHAPE?
 *
 * ┬س╪د╪╣┘à┘ **╪ش╪»┘ê┘** ┘à╪ذ┘è╪╣╪د╪ز ┘┘è┘ç ╪د╪│┘à ╪د┘╪╡┘┘ ┘ê╪د┘┘â┘à┘è╪ر ┘ê╪د┘╪│╪╣╪▒┬╗ ظ¤ the shape is the first
 * word he wrote, and the engine had exactly one presentation regardless. The
 * delivered app measured `table count: 0, th count: 0`.
 *
 * ┬س╪ش╪»┘ê┘┬╗ carries two meanings ظ¤ a TABLE and a SCHEDULE ظ¤ and CLAUDE.md names
 * that pair as a source of false criteria, so the bare word is not enough. The
 * context that settles it is his own: a man who lists the COLUMNS is asking for
 * a table, whatever else ┬س╪ش╪»┘ê┘┬╗ could have meant. So both are required, and the
 * word must be a word ظ¤ `saysWord`, not a substring, or ┬س╪د┘╪ش╪»┘ê┘╪ر┬╗ and ┬س╪ش╪»┘ê┘┘è┬╗
 * would answer for it.
 */
export function heAskedForATable(request: string, fieldCount: number): boolean {
    const said = String(request || '');
    // A layout grid arranges controls/cards; a data grid presents records.
    // Classify each mention independently so a card grid cannot hide a later
    // explicit data-grid request in the same sentence.
    const namedDataGrid = Array.from(said.matchAll(/\bgrid\b/gi)).some(match => {
        const before = said.slice(Math.max(0, match.index! - 48), match.index);
        const after = said.slice(match.index! + match[0].length, match.index! + match[0].length + 64);
        if (/\bdata\s*$/i.test(before)) return true;
        if (/\b(?:css|css3|card|photo|image|form)\s*[- ]?\s*$/i.test(before)) return false;
        if (/^\s*(?:[- ]based\s+)?layout\b/i.test(after)) return false;
        if (/^\s+of\s+(?:(?:responsive|interactive|product|form)\s+)*(?:cards|photos|images|fields|inputs|controls)\b/i.test(after)) return false;
        return true;
    });
    /**
     * The stem is too wide HERE, and that is a measurement, not a preference:
     * `saysWord(said, '╪ش╪»┘ê┘')` answers TRUE for ┬س╪د┘╪ش╪»┘ê┘╪ر ╪د┘╪▓┘à┘┘è╪ر┬╗ ظ¤ Snowball
     * reduces the verbal noun to the same root, which is correct stemming and
     * the wrong question. A man discussing scheduling has not asked for a
     * grid. So the shape must be named by its own word, in any of the forms it
     * really appears in, with the article and conjunction folded off.
     */
    const namedTheShape = words(said)
        .map(w => normalise(w).replace(/^(?:┘ê╪د┘|┘╪د┘|╪ذ╪د┘|┘â╪د┘|[┘ê┘╪ذ┘â┘]╪د┘|╪د┘)/, ''))
        .some(w => w === '╪ش╪»┘ê┘' || w === '╪ش╪»┘ê┘╪د' || w === '╪ش╪»╪د┘ê┘')
        || /\b(table|spreadsheet)\b/i.test(said)
        || namedDataGrid;
    return namedTheShape && fieldCount >= 2;
}

/** Apply those changes to a set of fields, keeping every other column as it is. */
export function applyColumnEdit(fields: AppField[], edit: ColumnEdit, isAr: boolean): AppField[] {
    let out = fields.slice();
    //  RENAME FIRST, AND IN PLACE.
    //
    //  Not a remove followed by an add: the column keeps its key and
    //  its type, so the rows already stored under that key are still
    //  his. Dropping it would drop their values with it.
    if (edit.rename) {
        const { from, to } = edit.rename;
        const at = out.findIndex(f => f.label.trim() === from || f.label.trim().includes(from));
        if (at >= 0) out[at] = { ...out[at], label: to };
    }
    for (const name of edit.remove) {
        out = out.filter(f => f.label.trim() !== name && !f.label.includes(name));
    }
    for (const name of edit.add) {
        if (out.some(f => f.label.trim() === name)) continue;
        const derived = derivedColumns(`╪ث╪│╪ش┘ ┘┘è┘ç: ${name} ┘ê${name} ┘ê${name}`)?.[0];
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
    //  His list wherever he put it in the sentence ظ¤ see
    //  columnsAnywhereInHisRequest. Asking the single-shot reader here is
    //  what sent ┬س┘à╪«╪▓┘ ╪د┘┘ê╪▒╪┤╪ر┬╗ to the archetype: seven columns he named,
    //  five canned ones delivered, ┬س╪│╪╣╪▒ ╪د┘╪┤╪▒╪د╪ة┬╗ and ┬س╪│╪╣╪▒ ╪د┘╪ذ┘è╪╣┬╗ merged into
    //  one, ┬س╪د╪│┘à ╪د┘┘à┘ê╪▒╪»┬╗ and ┬س╪ز╪د╪▒┘è╪« ╪د┘╪ح╪»╪«╪د┘┬╗ gone, ┬س╪د┘╪ص╪د┘╪ر┬╗ invented.
    const cols = columnsAnywhereInHisRequest(requestRaw);
    if (!cols) return null;
    /**
     *  A COPY THAT LISTS WHAT IT KEEPS LOSES WHAT IT DOES NOT KNOW.
     *
     *  Live round on his machine. He wrote ┬سظخ┘ê╪د┘╪│╪╣╪▒ ┘╪د ┘è┘é╪ذ┘ ╪╡┘╪▒┬╗, and the
     *  generated schema came out as:
     *
     *      { key: 'money1', label: '╪د┘╪│╪╣╪▒', type: 'number', required: true }
     *
     *  with no bound, so zero was accepted ظ¤ the exact thing he forbade.
     *  And every part of the chain was already correct: derivedColumns
     *  attaches min and minExclusive, the template emits them, and the
     *  generated app validates against them and even prints ┬س╪ث┘â╪ذ╪▒ ┘à┘ N┬╗.
     *
     *  The loss is HERE, in one line. This does not copy a field; it
     *  REBUILDS one from a fixed tuple of five things it happens to know
     *  about. Anything the column carries that is not on that list falls
     *  on the floor silently ظ¤ no error, no warning, and a unit test on
     *  either side of it passes.
     *
     *  So what the tuple cannot express is carried over explicitly. The
     *  next property added to a column will be lost the same way, which is
     *  why this comment names the shape rather than the symptom.
     */
    const fields = cols.map((c, i) => ({
        ...f(
            [c.key, c.label, c.label, c.type, c.options,
                i === 0 ? ['required', 'primary'] : (c.role === 'money' || c.role === 'count' ? ['required'] : undefined)],
            isAr,
        ),
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.minExclusive ? { minExclusive: true } : {}),
        ...(c.control ? { control: c.control } : {}),
    }));
    if (!fields.some(field => field.type === 'image')) {
        const intent = maskNegatedSpans(requestRaw);
        const action = /\bupload(?:s|ing)?\s+(?:(?:an?|the)\s+)?(image|photo|picture)s?\b|(?:╪▒┘╪╣|╪د╪▒┘╪╣|╪ث╪▒┘╪╣)\s+(?:╪د┘)?(╪╡┘ê╪▒╪ر|╪╡┘ê╪▒)/giu;
        for (const match of intent.matchAll(action)) {
            const prefix = intent.slice(0, match.index).split(/[.!?╪ؤ;\n]/u).pop() || '';
            if (/\b(?:explain|describe|instructions?|guide|how\s+to)\b|╪د╪┤╪▒╪ص|╪┤╪▒╪ص|╪»┘┘è┘/iu.test(prefix)) continue;
            const label = match[1] || match[2];
            const mapping = TYPE_MARKS.find(([pattern]) => pattern.test(label));
            if (!mapping || mapping[2] !== 'image') continue;
            const baseKey = canonicalFieldKey(label) || mapping[1];
            let key = baseKey;
            for (let index = 1; fields.some(field => field.key === key); index++) key = `${baseKey}${index}`;
            fields.push(f([key, label, label, mapping[2]], isAr));
            break;
        }
    }
    return fields;
}

/* ظ¤ظ¤ what was asked for, in the user's own words ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ */

/**
 * THE GAP LIST MUST COME FROM THE REQUEST, NOT FROM A KEYWORD TABLE I WROTE.
 *
 * Measured in the field: a request listing twelve features ظ¤ Posts, Stories,
 * Reels, Live streaming, Groups, Pages, Messaging, Video calls, AI moderation,
 * Recommendations, an Ads platform, a Creator dashboard ظ¤ was answered with a
 * chat app and an honesty block naming exactly ONE unbuilt thing, because my
 * table happened to contain the words ┬سAI assistant┬╗ and none of the others.
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
            .replace(/^(?:[-ظت*ظôظ¤]\s+|\d+[.)]\s+)/, '')
            .replace(/[.,;:╪ؤ╪î]+$/, '')
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
    // Bulleted or numbered lines ظ¤ the shape people actually write specs in.
    for (const line of request.split(/\r?\n/)) {
        if (/^\s*[-ظت*ظôظ¤]\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line)) push(line);
    }
    /**
     * A LIST UNDER ┬سFeatures:┬╗ IS A LIST, BULLETS OR NOT.
     *
     * Measured in the field: the same twelve-feature spec, pasted once with
     * ┬س- ┬╗ and once without, produced a twelve-item gap list and then a
     * ONE-item gap list. The features had not changed; only the punctuation
     * had. Everything after a Features/╪د┘┘à╪╖┘┘ê╪ذ heading, one short item per
     * line, counts ظ¤ that is how people actually paste a spec.
     */
    if (out.length < 3) {
        const head = request.match(/^[^\S\r\n]*(?:features?|requirements?|╪د┘┘à╪╖┘┘ê╪ذ|╪د┘┘à┘à┘è╪▓╪د╪ز|╪د┘┘à┘è╪▓╪د╪ز)\s*:?[^\S\r\n]*$/im);
        if (head) {
            const after = request.slice((head.index || 0) + head[0].length).split(/\r?\n/);
            for (const line of after) {
                const t = line.trim();
                if (!t) continue;                       // blank lines separate, they do not end the list
                if (/[.!?╪ا]$/.test(t) || t.split(/\s+/).length > 7) break;   // prose again ظ¤ the list is over
                push(t);
            }
        }
    }
    // ┬سظخ with A, B and C┬╗ ظ¤ the one-line form of the same list.
    // A one-line list is valid for short list-shaped requests only. A long
    // prose paragraph after "with" is not a feature list.
    const sentenceCount = (request.match(/[.!?╪ا]/g) || []).length;
    if (out.length < 3 && sentenceCount <= 2) {
        const m = request.match(/\b(?:with|including|features?:?)\s+([^.\n]{10,300})/i);
        if (m) {
            for (const part of m[1].split(/,| and | ┘ê /i)) {
                if (/^(?:requiring|using|including|from|without|ensuring|plus)\b/i.test(part.trim())) continue;
                push(part);
            }
        }
    }
    return out.slice(0, 30);
}

/** What each engine genuinely delivers, in the words a request would use. */
const ENGINE_COVERS: Record<AppEngine, RegExp> = {
    map: /map|navigation|direction|route|distance|place|location|geo|gps|╪«╪▒┘è╪╖╪ر|╪«╪▒╪د╪خ╪╖|┘à╪│╪د╪▒|┘à┘╪د╪ص╪ر|┘à┘ê┘é╪╣|┘à╪│╪د┘╪ر/i,
    chat: /chat|messag|room|conversation|dm\b|inbox|┘à╪ص╪د╪»╪س|╪▒╪│╪د╪خ┘|╪»╪▒╪»╪┤|╪║╪▒┘/i,
    // Weather is deliberately conservative here. A bare word such as
    // ┬سforecast┬╗ cannot prove a seven-day or hourly forecast; those compound
    // capabilities are checked by WEATHER_FEATURE_RULES against real source
    // evidence below.
    weather: /^(?:current\s+weather|temperature|feels\s+like|humidity|wind(?:\s+speed)?|weather\s+condition|sunrise|sunset|╪╖┘é╪│(?:\s+╪د┘╪ص╪د┘┘è)?|╪ص╪▒╪د╪▒╪ر|╪▒╪╖┘ê╪ذ╪ر|╪▒┘è╪د╪ص(?:\s+╪د┘╪│╪▒╪╣╪ر)?|╪┤╪▒┘ê┘é|╪║╪▒┘ê╪ذ)$/i,
    social: /post|feed|timeline|like|comment|follow|profile|share|newsfeed|wall|┘à┘╪┤┘ê╪▒|┘à┘╪┤┘ê╪▒╪د╪ز|╪«┘è╪╖|╪ح╪╣╪ش╪د╪ذ|╪ز╪╣┘┘è┘é|┘à╪ز╪د╪ذ╪╣|┘à┘┘\s*╪┤╪«╪╡┘è|┘à╪┤╪د╪▒┘â╪ر/i,
    records: /list|record|crud|table|entry|entries|manage|track|inventory|booking|order|task|note|expense|customer|student|contact|report|search|filter|export|relation(ship)?s?|foreign\s*key|linked|belongs\s*to|┘é╪د╪خ┘à╪ر|╪│╪ش┘|╪ح╪»╪د╪▒╪ر|╪ز╪ز╪ذ╪╣|╪ص╪ش╪▓|╪╖┘╪ذ|┘à┘ç┘à╪ر|┘à┘╪د╪ص╪╕╪ر|┘à╪╡╪▒┘ê┘|╪╣┘à┘è┘|╪╖╪د┘╪ذ|╪ز┘é╪▒┘è╪▒|╪ذ╪ص╪س|╪ز╪╡╪»┘è╪▒|╪╣┘╪د┘é╪د╪ز?|╪▒╪ذ╪╖|╪ش╪»╪د┘ê┘|┘à╪▒╪ز╪ذ╪╖/i,
    ledger: /expense|spending|money|amount|category|total|budget|┘à╪╡╪▒┘ê┘|┘à╪╡╪د╪▒┘è┘|┘à╪ذ┘╪║|┘╪خ╪ر|╪ح╪ش┘à╪د┘┘è|┘à┘è╪▓╪د┘┘è╪ر/i,
    productivity: /task|todo|to-do|note|notes|checklist|habit|routine|productivity|┘à┘ç┘à╪ر|┘à┘ç╪د┘à|┘à┘╪د╪ص╪╕╪ر|┘à┘╪د╪ص╪╕╪د╪ز|┘é╪د╪خ┘à╪ر|╪╣╪د╪»╪د╪ز|╪ح┘╪ز╪د╪ش┘è╪ر/i,
    finance: /finance|financial|budget|income|revenue|salary|earning|expense|spending|money|accounting|┘à╪د┘┘è╪ر|┘à┘è╪▓╪د┘┘è╪ر|╪»╪«┘|╪ح┘è╪▒╪د╪»|╪▒╪د╪ز╪ذ|┘à╪╡╪د╪▒┘è┘|╪ح┘┘╪د┘é|┘à╪د┘|┘à╪ص╪د╪│╪ذ╪ر/i,
    calculator: /calculator|calc|arithmetic|addition|subtraction|multiplication|division|decimal|percentage|percent|backspace|clear|sign\s*toggle|history|╪ت┘╪ر\s*╪ص╪د╪│╪ذ╪ر|╪ص╪د╪│╪ذ╪ر|╪ش┘à╪╣|╪╖╪▒╪ص|╪╢╪▒╪ذ|┘é╪│┘à╪ر|╪╣╪┤╪▒┘è|┘╪│╪ذ╪ر|╪ص╪░┘|┘à╪│╪ص|╪ح╪┤╪د╪▒╪ر|╪│╪ش┘\s*╪د┘╪╣┘à┘┘è╪د╪ز/i,
    // The shop covers the catalogue, the cart and the order ظ¤ and deliberately
    // NOT payment gateways, shipping carriers or multi-vendor payouts, so a
    // ┬سShopify-like┬╗ request still gets an honest list of what was not built.
    shop: /product|catalog(ue)?|cart|checkout|order|price|pricing|stock|inventory|category|categories|search|storefront|shop|store|┘à┘╪ز╪ش|┘à┘╪ز╪ش╪د╪ز|┘â╪ز╪د┘┘ê╪ش|╪│┘╪ر|╪╖┘╪ذ|╪╖┘╪ذ╪د╪ز|╪│╪╣╪▒|╪ث╪│╪╣╪د╪▒|┘à╪«╪▓┘ê┘|╪ز╪╡┘┘è┘|╪ز╪╡┘┘è┘╪د╪ز|╪ذ╪ص╪س|┘à╪ز╪ش╪▒/i,
    // Custom engines are authored from the request; no stock capability is
    // assumed here, so named requirements remain visible to the quality gate.
    custom: /(?!)/i,
};

/** Cross-cutting things the BACKEND covers when one was built alongside. */
const BACKEND_COVERS = /login|sign\s*in|account|auth|password|database|db\b|api\b|rest\b|server|storage|persist|order|╪ز╪│╪ش┘è┘\s*╪»╪«┘ê┘|╪ص╪│╪د╪ذ|┘é╪د╪╣╪»╪ر\s*╪ذ┘è╪د┘╪د╪ز|╪«╪د╪»┘à|┘ê╪د╪ش┘ç╪ر\s*╪ذ╪▒┘à╪ش┘è╪ر|╪╖┘╪ذ╪د╪ز/i;

/**
 * A compound weather capability is covered only by independent source evidence.
 * Matching the word ┬سforecast┬╗ in a request is not evidence of hourly or daily
 * data, and matching ┬سweather┬╗ is not evidence of search, persistence, units,
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
    { asked: /search\s+by\s+city|city\s+search|╪ذ╪ص╪س\s+(?:╪╣┘|╪ذ╪د┘┘?)?\s*╪د┘┘à╪»┘?/i, evidence: /geocoding-api\.open-meteo|searchCity|citySearch|search.*city/i },
    { asked: /current\s+temperature|\btemperature\b/i, evidence: /temperature_2m|currentWeather|currentTemperature|temperature/i },
    { asked: /\bhumidity\b/i, evidence: /relative_humidity_2m|humidity/i },
    { asked: /current\s+location|geolocation|┘à┘ê┘é╪╣(?:┘è|┘â)?\s+╪د┘╪ص╪د┘┘è/i, evidence: /navigator\.geolocation|currentLocation|getCurrentPosition/i },
    { asked: /favorite\s+cities|saved\s+cities|╪د┘┘à╪»┘\s+╪د┘┘à┘╪╢┘╪ر/i, evidence: /favoriteCities|savedCities|favo[u]?rites?|toggleFavorite/i },
    { asked: /feels[-\s]+like/i, evidence: /apparent_temperature|feelsLike|feels-like/i },
    { asked: /wind\s+speed/i, evidence: /wind_speed|windSpeed/i },
    { asked: /weather\s+condition/i, evidence: /weather[-_]?code|weatherCondition|condition/i },
    { asked: /sunrise/i, evidence: /sunrise/i },
    { asked: /sunset/i, evidence: /sunset/i },
    { asked: /loading/i, evidence: /loading|isLoading|setLoading/i },
    { asked: /api\s+errors?|network\s+failures?|invalid\s+cities?|missing\s+api\s+configuration/i, evidence: /catch|error|failed|invalid|not\s+found|configuration/i },
    { asked: /celsius|fahrenheit|temperature\s+units?/i, evidence: /celsius|fahrenheit|temperatureUnit|unit|┬░[CF]/i },
    { asked: /12\/24[-\s]?hour|12[-\s]?hour|24[-\s]?hour|hour\s+format|time\s+format/i, evidence: /12|24|hour(?:12|24)?|timeFormat|hourFormat|use24Hour/i },
    { asked: /persist(?:s|ed|ence)?\s+(?:favorites|settings)|restore\s+(?:favorites|settings)|localStorage|full\s+reload/i, evidence: /localStorage|storage|persist|restore/i },
    { asked: /reject\s+empty\s+input|empty\s+input/i, evidence: /trim\(\)|empty|length|!.*(?:city|query|input)/i },
    { asked: /enter[-\s]?key\s+submission|enter\s+key|on\s+enter/i, evidence: /onKeyDown|onKeyPress|onKeyUp|Enter/i },
    { asked: /light\s+mode|dark\s+mode/i, evidence: /dark|light|theme/i },
    { asked: /responsive\s+mobile(?:[-\s]first)?\s+(?:ui|weather|experience)|mobile[-\s]first/i, evidence: /@media|responsive|mobile/i },
    { asked: /weather\s+icons?/i, evidence: /weather.*icon|icon.*weather|weather_code/i },
    { asked: /smooth\s+transitions?/i, evidence: /transition/i },
];

const RECORDS_FEATURE_RULES: Array<{ asked: RegExp; evidence: RegExp; fieldType?: FieldType }> = [
    { asked: /upload(?:ed|ing)?\s+(?:an?\s+)?(?:image|photo)|╪▒┘╪╣\s+(?:╪╡┘ê╪▒╪ر|╪د┘╪╡┘ê╪▒)/iu, evidence: /type=["']file["'][^>]*accept=["']image\/\*/iu, fieldType: 'image' },
    { asked: /invalid\s+file\s+rejection|reject\s+(?:an?\s+)?invalid\s+file|╪▒┘╪╢\s+┘à┘┘\s+╪║┘è╪▒\s+╪╡╪د┘╪ص/iu, evidence: /Choose a valid image file|╪د╪«╪ز╪▒ ┘à┘┘ ╪╡┘ê╪▒╪ر ╪╡╪د┘╪ص/iu },
    { asked: /filter(?:ing)?\s+(?:items?\s+)?by\s+tags?|╪ز╪╡┘┘è╪ر[^.]{0,40}┘ê╪│┘à/iu, evidence: /^(?=[\s\S]*filterFields\s*:\s*\[['"]tags['"]\])(?=[\s\S]*filterKeys)(?=[\s\S]*setFilters)/iu },
    { asked: /preview\s+(?:the\s+)?uploaded\s+(?:image|photo)|┘à╪╣╪د┘è┘╪ر\s+(?:╪د┘╪╡┘ê╪▒╪ر|╪د┘╪╡┘ê╪▒)/iu, evidence: /record-modal-pic[\s\S]{0,300}imageOf\(selected/iu },
    { asked: /delete[^.]{0,80}(?:only\s+)?after\s+confirmation|confirm[- ]delete|╪ص╪░┘[^.]{0,80}╪ز╪ث┘â┘è╪»/iu, evidence: /window\.confirm\(/iu },
    { asked: /persistent\s+local\s+storage|persist(?:ence)?\s+after\s+reload|╪ص┘╪╕\s+┘à╪ص┘┘è\s+╪»╪د╪خ┘à/iu, evidence: /createStore[\s\S]{0,500}localStorage|localStorage[\s\S]{0,500}setItem/iu },
    { asked: /preserve\s+(?:the\s+)?original\s+uploaded\s+(?:image|photo)|╪د┘╪ص┘╪د╪╕\s+╪╣┘┘ë\s+╪د┘╪╡┘ê╪▒╪ر\s+╪د┘╪ث╪╡┘┘è╪ر/iu, evidence: /^(?=[\s\S]*preserveOriginalImages\s*:\s*true)(?=[\s\S]*maxEdge\s*===\s*0)/iu },
    { asked: /metadata\s+edit(?:ing)?|edit(?:ing)?\s+metadata|╪ز╪╣╪»┘è┘\s+╪د┘╪ذ┘è╪د┘╪د╪ز\s+╪د┘┘ê╪╡┘┘è╪ر/iu, evidence: /const edit\s*=|Save changes|╪ص┘╪╕ ╪د┘╪ز╪╣╪»┘è┘/iu },
    { asked: /keyboard\s+access|keyboard[- ]accessible|┘┘ê╪ص╪ر\s+╪د┘┘à┘╪د╪ز┘è╪ص/iu, evidence: /tabIndex=\{0\}[\s\S]{0,300}onKeyDown/iu },
    { asked: /empty\s+state|╪ص╪د┘╪ر\s+┘╪د╪▒╪║╪ر/iu, evidence: /emptyHint|className=["']empty["']/iu },
];

function weatherFeatureCovered(feature: string, evidence: string): boolean {
    const rule = WEATHER_FEATURE_RULES.find(r => r.asked.test(feature));
    if (rule) return !!evidence && rule.evidence.test(evidence);
    return ENGINE_COVERS.weather.test(feature);
}

function requestsStatusFilter(requestRaw: string): boolean {
    const request = String(requestRaw || '').replace(/[┘ï-┘ْ┘]/g, '').toLowerCase();
    return /(?:status\s+filter|filter\s+(?:for|by)\s+status|┘┘╪ز╪▒\s*╪د┘╪ص╪د┘╪ر|┘┘╪ز╪▒╪ر\s*(?:╪ص╪│╪ذ|╪╣┘┘ë)\s*╪د┘╪ص╪د┘╪ر|╪ز╪╡┘┘è╪ر\s*(?:╪ص╪│╪ذ|╪╣┘┘ë)\s*╪د┘╪ص╪د┘╪ر)/iu.test(request);
}

function ensureRequestedStatusFilterField(requestRaw: string, fields: AppField[], isAr: boolean): AppField[] {
    if (!requestsStatusFilter(requestRaw)) return fields;
    if (fields.some(field => /status|state|┘à╪▒╪ص┘╪ر|╪ص╪د┘╪ر|┘ê╪╢╪╣/iu.test(String(field.label || '')))) return fields;
    let key = 'status';
    for (let index = 2; fields.some(field => field.key === key); index += 1) key = `status${index}`;
    // A status filter with no choices is an empty control. The request named
    // the behavior but not a domain taxonomy, so provide only the minimal,
    // editable lifecycle used by the records engine. A stated field/options
    // always wins above and is never replaced here.
    return [...fields, {
        key,
        label: isAr ? '╪د┘╪ص╪د┘╪ر' : 'Status',
        type: 'select',
        options: isAr ? ['╪ش╪»┘è╪»', '┘é┘è╪» ╪د┘╪ز┘┘┘è╪░', '┘à┘â╪ز┘à┘'] : ['New', 'In progress', 'Completed'],
    }];
}

/** A request-derived filter contract, shared by every records-shaped app. */
export function requestedFilterFields(requestRaw: string, fields: Array<{ key: string; label: string; role?: string; type?: string }>): string[] {
    const request = String(requestRaw || '').replace(/[┘ï-┘ْ┘]/g, '').toLowerCase();
    const keys: string[] = [];
    // ظ£status filterظإ is a complete request even when no value follows
    // ظ£filterظإ. Bind it to the request's status/select field instead of
    // silently returning an empty contract.
    if (requestsStatusFilter(request)) {
        const status = fields.find(field => /status|state|┘à╪▒╪ص┘╪ر|╪ص╪د┘╪ر|┘ê╪╢╪╣/iu.test(String(field.label || '')))
            || fields.find(field => field.role === 'flag' || field.type === 'select');
        if (status) keys.push(status.key);
    }
    // Once ظ£status filterظإ has been handled above, do not let the trailing
    // words (ظ£capacity summaryظإ, for example) be mistaken for more filter
    // fields. Other forms such as ظ£filters for status and ratingظإ remain
    // available to the normal phrase parser.
    const requestForClause = request.replace(/(?:status\s+filter|┘┘╪ز╪▒\s*╪د┘╪ص╪د┘╪ر|┘┘╪ز╪▒╪ر\s*(?:╪ص╪│╪ذ|╪╣┘┘ë)\s*╪د┘╪ص╪د┘╪ر|╪ز╪╡┘┘è╪ر\s*(?:╪ص╪│╪ذ|╪╣┘┘ë)\s*╪د┘╪ص╪د┘╪ر)/giu, '');
    const clause = requestForClause.match(/(?:filter(?:ing|s)?|┘┘╪ز╪▒╪ر|╪ز╪╡┘┘è╪ر|┘┘╪د╪ز╪▒|┘à╪▒╪┤╪ص╪د╪ز?)\s*(?:for|by|╪ص╪│╪ذ|╪╣┘┘ë|┘(?:┘|┘)?|┘à┘)?\s*([^.!?╪ا\n]+)/iu)?.[1] || '';
    if (!clause) {
        if (!keys.length && /\bfilter(?:ing|s)?\b|┘┘╪ز╪▒╪ر|╪ز╪╡┘┘è╪ر/iu.test(request)) {
            const natural = fields.find(field => field.role === 'flag' || field.type === 'select');
            if (natural) keys.push(natural.key);
        }
        return keys;
    }
    const stop = clause.split(/\s+(?:plus|with|and\s+(?:a|an|the)?\s*(?:progress|metric)|┘ê┘à┘é┘è╪د╪│|┘ê╪ح╪╢╪د┘╪ر|┘ê╪د╪╢╪د┘╪ر)\b/iu)[0];
    const tokens = new Set(stop.split(/[^\p{L}\p{N}_]+/u).filter(t => t.length >= 2));
    for (const field of fields) {
        const label = String(field.label || '').toLowerCase().replace(/[┘ï-┘ْ┘]/g, '');
        const labelTokens = label.split(/[^\p{L}\p{N}_]+/u).filter(t => t.length >= 2);
        const matches = tokens.has(label) || labelTokens.some(token => token.length >= 3 && tokens.has(token));
        if (matches && !keys.includes(field.key)) keys.push(field.key);
    }
    if (!keys.length && /^\s*[,╪î]/u.test(clause)) {
        const natural = fields.find(field => field.role === 'flag' || field.type === 'select');
        if (natural) keys.push(natural.key);
    }
    return keys;
}

function wantsProgressMetric(requestRaw: string): boolean {
    return /progress\s+metric|progress\s+percentage|progress|┘à┘é┘è╪د╪│\s+(?:╪ز┘é╪»┘à|╪د┘╪ز┘é╪»┘à)|┘à╪ج╪┤╪▒\s+(?:╪ز┘é╪»┘à|╪د┘╪ز┘é╪»┘à)/iu.test(String(requestRaw || ''));
}

function completionOption(options: string[], isAr: boolean): string | undefined {
    const affirmative = options.find(option => /^(?:yes|┘╪╣┘à)$/iu.test(String(option || '').trim()));
    if (affirmative) return affirmative;
    return options.find(option => /done|complete|completed|finished|closed|┘à┘╪ش╪▓|┘à┘â╪ز┘à┘|╪ز┘à(?:╪ز|┘ّ)?(?:╪ز|╪ر)?|┘à╪║┘┘é|┘à┘╪ز┘ç/iu.test(option))
        || options[options.length - 1]
        || (isAr ? '┘à┘╪ش╪▓' : 'Done');
}

/**
 * Records requirements need executable evidence too. A generic engine name is
 * not proof that a requested field or action exists in the generated app.
 */
function hasConfiguredUpload(source: string, fieldType: FieldType): boolean {
    const ts = require('typescript') as typeof import('typescript');
    const file = ts.createSourceFile('record-evidence.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let configured = false;
    const inputs: import('typescript').Node[] = [];
    const named = (name: import('typescript').PropertyName, value: string) =>
        (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === value;
    const visit = (node: import('typescript').Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'content'
            && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            const fields = node.initializer.properties.find(property => ts.isPropertyAssignment(property) && named(property.name, 'fields'));
            configured = !!fields && ts.isPropertyAssignment(fields) && ts.isArrayLiteralExpression(fields.initializer)
                && fields.initializer.elements.some(element => ts.isObjectLiteralExpression(element)
                && element.properties.some(property => ts.isPropertyAssignment(property) && named(property.name, 'type')
                    && ts.isStringLiteral(property.initializer) && property.initializer.text === fieldType));
        }
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === 'input') {
            const attribute = (name: string) => node.attributes.properties.find(property => ts.isJsxAttribute(property)
                && property.name.getText(file) === name);
            const value = (name: string) => {
                const prop = attribute(name);
                return prop && ts.isJsxAttribute(prop) && prop.initializer && ts.isStringLiteral(prop.initializer)
                    ? prop.initializer.text : '';
            };
            if (value('type') === 'file' && value('accept').startsWith('image/*')) inputs.push(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return inputs.some(input => {
        for (let parent = input.parent; parent; parent = parent.parent) {
            if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
                && parent.expression.name.text === 'map') {
                // Only the known records renderer can be tied to content.fields.
                const target = parent.expression.expression.getText(file);
                return /^(?:fields|content\.fields|controller\.fields)$/.test(target) && configured;
            }
        }
        return true;
    });
}

export function recordFeatureCovered(feature: string, request: string, evidence: string): boolean {
    const f = String(feature || '').trim();
    const src = String(evidence || '');
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasDeclaredLabel = f.length >= 3 && new RegExp(
        `(?:label|placeholder|aria-label)\\s*[:=]\\s*['\"]${escaped}['\"]`, 'iu',
    ).test(src);
    const explicitRule = RECORDS_FEATURE_RULES.find(rule => rule.asked.test(f));
    if (explicitRule) {
        if (!explicitRule.evidence.test(src)) return false;
        // A generic field renderer can contain an inactive upload branch.
        // Independent upload components do not require a records schema.
        if (explicitRule.fieldType) {
            return hasConfiguredUpload(src, explicitRule.fieldType);
        }
        return true;
    }
    if (hasDeclaredLabel) return true;
    if (/appointment\s+scheduling[^.]*linked\s+to\s+both|┘à┘ê╪د╪╣┘è╪»[^.]*┘à╪▒╪ز╪ذ╪╖/iu.test(f)) {
        return /patient_id/iu.test(src) && /doctor_id/iu.test(src)
            && /relations[\s\S]{0,500}select|parents\[/iu.test(src);
    }
    if (/double[-\s]?booking|╪ز╪╣╪د╪▒╪╢\s*╪د┘┘à┘ê╪د╪╣┘è╪»|╪ص╪ش╪▓\s*┘à╪▓╪»┘ê╪ش/iu.test(f)) {
        return /double_booking/iu.test(src) && /already has an appointment|┘╪»┘è┘ç ┘à┘ê╪╣╪» ╪ت╪«╪▒/iu.test(src);
    }
    if (/status\s+transitions?|╪د┘╪ز┘é╪د┘╪د╪ز?\s*╪د┘╪ص╪د┘╪ر/iu.test(f)) {
        return /invalid_status_transition/iu.test(src)
            && ['scheduled', 'confirmed', 'completed', 'cancelled'].every(status =>
                new RegExp(`(?:['\"]${status}['\"]|\\b${status}\\b)`, 'iu').test(src));
    }
    if (/audit(?:\s+(?:log|trail|history))?|╪│╪ش┘\s*╪د┘╪ز╪»┘é┘è┘é|╪ز╪د╪▒┘è╪«\s*╪د┘╪ز╪║┘è┘è╪▒╪د╪ز/iu.test(f)) {
        return /audit_history/iu.test(src)
            && /View changes|Show changes|Audit history|╪╣╪▒╪╢ ╪د┘╪ز╪║┘è┘è╪▒╪د╪ز|╪│╪ش┘ ╪د┘╪ز╪»┘é┘è┘é|<details|<summary/iu.test(src);
    }
    if (/secure\s+sign[-\s]?in|secure\s+login|╪»╪«┘ê┘\s+╪ت┘à┘|╪ز╪│╪ش┘è┘\s+╪»╪«┘ê┘\s+╪ت┘à┘/iu.test(f)) {
        return /apiLogin|auth\/login/iu.test(src)
            && /Authorization[^\n]{0,120}Bearer|TOKEN_KEY|localStorage\.setItem\([^,]*token/iu.test(src);
    }
    if (/search\s+and\s+filter(?:ing)?|╪ذ╪ص╪س\s+┘ê(?:╪ز╪╡┘┘è╪ر|┘┘╪ز╪▒╪ر)/iu.test(f)) {
        return /setQuery|query\.trim/iu.test(src) && /statusFilter|Filter by status|╪ز╪╡┘┘è╪ر ╪ص╪│╪ذ ╪د┘╪ص╪د┘╪ر/iu.test(src);
    }
    if (/^(?:search|text\s+search|searching|╪ذ╪ص╪س|╪د┘╪ذ╪ص╪س)$/iu.test(f)) {
        return /setQuery|query\.trim|filtered|visible\s*=|onChange=.*query|search/i.test(src);
    }
    if (/^(?:filter|filtering|status\s+filtering|status\s+filter|╪ز╪╡┘┘è╪ر|┘┘╪ز╪▒╪ر|╪د┘╪ز╪╡┘┘è╪ر)$/iu.test(f)) {
        return /setFilter|content\.statusField|filter\s*&&|filter.*statusField/i.test(src);
    }
    if (/(?:validation|╪ز╪ص┘é┘é|╪╡┘╪د╪ص┘è╪ر)/iu.test(f)) {
        return /checkValidity|required|setError|missing|invalid/i.test(src);
    }
    if (/^(?:export|exporting|export\s+csv|╪ز╪╡╪»┘è╪▒)$/iu.test(f)) {
        return /toCsv|download\s*\(/i.test(src);
    }
    if (/(?:summary|overview|┘à┘╪«╪╡|┘à┘╪«┘ّ╪╡)/iu.test(f)) {
        // A summary of a numeric field is an executable aggregate, not a
        // heading. Require the configured metric, its row-backed renderer,
        // and the numeric aggregation branch before accepting the claim.
        return /metrics\s*:\s*\[[\s\S]{0,1600}?kind\s*:\s*['"](?:sum|sumProduct|avg)['"]/i.test(src)
            && /computeMetric\s*\([^)]*rows|case\s*['"](?:sum|sumProduct|avg)['"]/i.test(src)
            && /reduce\s*\(/i.test(src);
    }
    if (/(?:responsive|mobile|browser-tested|┘à╪ز╪ش╪د┘ê╪ذ|┘à╪ز╪ش╪د┘ê╪ذ╪ر|╪د┘┘ç╪د╪ز┘|╪د┘╪ش┘ê╪د┘)/iu.test(f)) {
        // Responsiveness is proved by layout rules, not by the word itself in
        // a title or comment. These are the portable signals shared by the
        // generated app shells and authored projects.
        return /@media\b|clamp\s*\(|flex-wrap\s*:|grid-template-columns\s*:/i.test(src);
    }
    // Keep the generic engine contract for a request that names the engine
    // itself, while all concrete fields/actions above require source proof.
    return /^(?:records?|crud|table|list|directory|registry|╪│╪ش┘|╪ش╪»┘ê┘|┘é╪د╪خ┘à╪ر)$/iu.test(f)
        && ENGINE_COVERS.records.test(f)
        && /RecordsApp|createStore|rows-table|className=.*rows/i.test(src);
}

/** Rule registries are capability contracts, not saved app bodies. */
const FEATURE_RULES_BY_ENGINE: Partial<Record<AppEngine, Array<{ asked: RegExp; evidence: RegExp }>>> = {
    weather: WEATHER_FEATURE_RULES,
    records: RECORDS_FEATURE_RULES,
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
 * The features the delivery does NOT cover ظ¤ named exactly as the user wrote
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
        if (engine === 'records') return !recordFeatureCovered(f, request, evidence);
        if (engine !== 'weather' && covers && covers.test(f)) return false;
        if (hasBackend && BACKEND_COVERS.test(f)) return false;
        return true;
    });
}
