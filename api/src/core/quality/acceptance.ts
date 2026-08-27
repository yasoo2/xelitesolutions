/**

 * WHAT HE ASKED FOR, CHECKED ONE BY ONE, BEFORE ANYTHING IS CALLED DONE.
 *
 * An outside audit put it exactly right: «نجاح البناء لا يساوي نجاح الوكيل».
 * A wide brief asked for a booking board with six rows, search, a status
 * filter, an add form, empty states, a local export, a README, a production
 * build and a preview. What came back was a working project, a message listing
 * files, and `success: true` — with no build, no README, and no mention that
 * seven of the nine things asked for had not been demonstrated.
 *
 * Nothing in the run was lying. Each individual claim was true. The failure
 * was that nobody ever ASKED the question the user cares about: of the things
 * I was told to deliver, which ones can I actually show?
 *
 * That question is this file. It has three parts, and the third is the one
 * that matters:
 *
 *   1. READ the brief into a list of criteria — features, artifacts and
 *      verifications, each with a stable id.
 *   2. LOOK for evidence of each one in what was really produced: files on
 *      disk, the build flag, a running server, the browser audit, and the
 *      generated source itself.
 *   3. REFUSE to call the run accepted while any criterion is unmet, and name
 *      every one of them in the delivery.
 *
 * The judge never invents a criterion the user did not ask for, and never
 * marks one met on anything except evidence it can point at. A criterion it
 * cannot test says «unprovable» rather than passing quietly — because a check
 * that cannot fail is the thing this project keeps deleting.
 */
import { derivedColumns, statedRules, type DerivedField, columnsAnywhereInHisRequest, detectAppKind } from '../design/app-blueprints';
import { hisWordsOnly } from '../design/page-head';
import fs from 'fs';
import path from 'path';
import { thePagesHeNamed } from '../design/site-plan';
import { saysAny, saysWord } from '../language/arabic';

//  The same folding the page reader itself uses — a request written with
//  tanween must reach it in the shape its patterns are spelled in.
const DIACRITICS_FOR_PAGES = new RegExp('[\\u064B-\\u0652\\u0670\\u0640]', 'g');
const HAMZAS_FOR_PAGES = new RegExp('[أإآ]', 'g');
const MAQSURA_FOR_PAGES = new RegExp('ى', 'g');

/**
 * Gate062's fixed acceptance input: four source-backed UI criteria.
 * Keep this separate from the live-run input below, which also asks for a
 * verified preview and therefore yields five criteria.
 */
export const GATE062_ACCEPTANCE_PROMPT =
    'Build a small project called Gate062. Create one polished page titled Gate 062 with a heading, a short status message, and a button that increments a visible counter.';

export const GATE062_LIVE_PROMPT =
    GATE062_ACCEPTANCE_PROMPT + ' Run the real build and open the live preview. Do not modify existing projects.';

export type CriterionKind = 'feature' | 'artifact' | 'verification';
export type Verdict = 'met' | 'unmet' | 'unprovable';

export interface Criterion {
    id: string;
    kind: CriterionKind;
    ar: string;
    en: string;
    /**
     *  The WORDS that ask for this, in any form he writes them.
     *
     *  A regex over raw Arabic reads characters, not words — «زر» matched
     *  inside «أزرق» and «عدد» inside «متعدد», so a request for a blue
     *  page was refused for want of a button. These go through the language
     *  layer instead, which segments with Unicode's own rules and stems with
     *  the same Snowball stemmer Elasticsearch uses, so «عداد» is «العداد» is
     *  «عدادًا» is «عداداتها» — and is never «استعداد».
     *
     *  `asked` stays for the entries that match a PHRASE rather than a word.
     */
    says?: string[];
    /** Source markers that prove a FEATURE was really generated. */
    markers?: RegExp[];
    /** Exact user-requested title text, when it can be extracted safely. */
    expectedText?: string;
    /**
     *  The page he named, when the criterion is about one.
     *
     *  Measured live on «اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف»,
     *  after Joe had already built both pages correctly:
     *
     *      ⚠️ لم أستخرج معياراً قابلاً للفحص من طلبك، لذلك لم أصدر حكم قبول.
     *
     *  He had named two pages in one sentence, and thePagesHeNamed() had
     *  read them — the page plan was built from them. The judge could not
     *  derive a criterion because nothing asked that reader. The same shape
     *  as the columns below: a reader that already knew, never consulted.
     */
    expectedPage?: { slug: string; title: string };

    /**
     *  A VERDICT THAT WAS READ, NOT PATTERN-MATCHED.
     *
     *  Everything else on this interface is a way to PROVE a criterion with a
     *  marker, a column, a bound. That works because the catalogue only ever
     *  admitted criteria it already knew how to check — and that is exactly
     *  why the denominator was one for a request that named five things.
     *
     *  A requirement taken from HIS sentence has no marker and must not be
     *  given one; inventing a regex per phrase is the catalogue rebuilt under
     *  a new name. It is proven instead by reading the built source, and the
     *  verdict arrives here already settled, with the source line behind it.
     *
     *  ⛔ This is a door for a verdict that has ALREADY been grounded in the
     *  source — see `verifyNamed`, which downgrades any `met` whose evidence
     *  it could not find. It must never become a door for a caller that simply
     *  wants a green mark.
     */
    preJudged?: { verdict: Verdict; why: string };

    /**
     *  The rule he stated, when the criterion is about one.
     *
     *  Measured across a thousand requests: a request carrying an explicit
     *  condition read clean 5% of the time. «اعمل موقع شركة تنظيف ولا تقبل
     *  مبلغًا صفرًا» derived NOTHING — not the site, not the rule. The
     *  condition was not obeyed, not checked, and not mentioned, which is the
     *  worst of the three: he cannot even know it was lost.
     *
     *  statedRules() has read rules on this project for a long time. Nothing
     *  asked it. The same shape as the pages and the columns above.
     *
     *  A rule Joe cannot prove is still a criterion — it comes back
     *  `unprovable`, which is declared to him and does not block delivery.
     *  Silence is the only outcome that is never acceptable.
     */
    /**
     *  THE READER KNEW THE FIELD, THE VALUE AND THE STRICTNESS. THE JUDGE
     *  ASKED FOR NONE OF THEM.
     *
     *  `StatedRule` already carries `field`, `min` and `minExclusive`, and
     *  only `text` and `kind` were copied across. The proof left behind was
     *  `/min:\s*-?\d/` against the WHOLE project — any digit after any `min:`
     *  anywhere earned the ✅. So «لا تقبل سعرًا صفرًا» was reported as met by
     *  a build whose bound sat on a different column, or carried a different
     *  number, or — worst — omitted `minExclusive`, which is a build that
     *  accepts the exact value he forbade while being told it obeys.
     */
    expectedRule?: {
        text: string;
        kind?: 'bound' | 'forbid' | 'require' | 'change';
        field?: string;
        min?: number;
        minExclusive?: boolean;
    };
    /**
     *  The exact column he listed, when the criterion is about one.
     *
     *  Measured live on his own brief — five columns, a search and a total:
     *
     *      «I could not derive a checkable criterion from your request,
     *       so I did not issue an acceptance judgment.»
     *
     *  The schema layer had already read every one of those columns from
     *  his sentence. The judge could not derive a single criterion, because
     *  it only knew five it had been taught: counter, button, title, status
     *  message, search. A checklist, in the one place the fourth law says
     *  must come from the request.
     *
     *  A column he named is the most checkable criterion there is: it is
     *  either a field in the built app or it is not.
     */
    expectedColumn?: string;
    /**
     *  The explicit lower bound stated for a named numeric column, when any.
     *  A view of the same `expectedRule` value, never a second record of it.
     */
    expectedBound?: { min: number; minExclusive: boolean };
}

export interface JudgedCriterion extends Criterion {
    verdict: Verdict;
    /** The evidence, or the reason there is none — in one line. */
    why: string;
}

export interface Acceptance {
    criteria: JudgedCriterion[];
    met: number;
    unmet: number;
    /** Stated, judged, and impossible for THIS judge to check. Never hidden. */
    unprovable: number;
    /** True only when nothing he asked for was looked for and missing. */
    accepted: boolean;
}

/**
 * THE CATALOGUE OF THINGS A BRIEF CAN ASK FOR.
 *
 * Shapes, not domains: «بحث» is a shape a request has or has not got, and it
 * means the same thing for a clinic, a warehouse and a bookings board. Each
 * entry carries what would have to exist in the generated source for the
 * answer to be yes — so «met» is a grep with a reason, never an opinion.
 */
const CATALOGUE: Array<Criterion & { asked: RegExp }> = [
    {
        id: 'search', kind: 'feature',
        says: ['بحث', 'ابحث', 'search'],
        asked: /(بحث|ابحث|\bsearch\b)/iu,
        ar: 'بحث داخل البيانات', en: 'search across the data',
        markers: [/type=["']search["']/i, /\bsearch\b/i, /بحث/u, /filter\(/],
    },
    {
        id: 'filter', kind: 'feature',
        says: ['مرشح', 'فلتر', 'تصفية', 'filter'],
        asked: /(مرشّ?ح|فلتر|تصفية|\bfilter\b)/iu,
        ar: 'مُرشّح حالة', en: 'a status filter',
        markers: [/status/i, /الحالة/u, /<select/i],
    },
    {
        id: 'counter', kind: 'feature',
        says: ['عداد', 'عدد', 'إجمالي', 'مجموع', 'counter', 'count', 'total', 'badge'],
        //  A PATTERN WRITTEN WITH THE ARTICLE MATCHES HALF THE LANGUAGE.
        //
        //  «المجموع» cannot match «مجموع», and «العدد» cannot match «عدد».
        //  So «وصفحة ثانية تعرض مجموع الرواتب» asked for a total and
        //  produced no criterion at all — not a criterion that failed, one
        //  that was never written, which Joe can report success around.
        //  The bare form matches both, which is why every other entry in
        //  this catalogue is written bare and only these two were not.
        asked: /(عداد|عدد|إجمالي|اجمالي|مجموع|\bcounter\b|\bcount\b|\btotal\b|\bbadge\b)/iu,
        ar: 'عداد أو إجمالي', en: 'a counter or total',
        markers: [],
    },
    {
        id: 'button', kind: 'feature',
        says: ['زر', 'أزرار', 'button', 'cta'],
        asked: /(زر|أزرار|\bbutton\b|\bcta\b|call[- ]?to[- ]?action)/iu,
        ar: 'زر تفاعلي', en: 'an interactive button',
        markers: [],
    },
    {
        id: 'title', kind: 'feature',
        says: ['عنوان', 'title', 'titled', 'heading', 'headline'],
        asked: /(عنوان|العنوان|\btitle\b|\btitled\b|\bheading\b|\bheadline\b)/iu,
        ar: 'عنوان أو رأس صفحة', en: 'a title or heading',
        markers: [/<h[1-6]\b/i, /<title\b/i],
    },
    {
        id: 'status_message', kind: 'feature',
        asked: /(رسالة\s*(?:حالة|نجاح|خطأ)|حالة\s*(?:نجاح|خطأ)|status\s*message|success\s*message|error\s*message|\btoast\b)/iu,
        ar: 'رسالة حالة أو نتيجة', en: 'a status or result message',
        markers: [],
    },
    {
        id: 'add_row', kind: 'feature',
        asked: /(?:إضافة|اضافة|أضف|\badd\b|\bcreate\b)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?(?:حجز|صف|عنصر|سجل|بيان|مهمة|مشروع|عميل|جهة|منتج|طلب|تذكرة|ملاحظة|row|record|entry|item|booking|task|project|customer|contact|product|order|ticket|note)(?:\s+(?:record|entry|item))?/iu,
        ar: 'إضافة سجلّ جديد', en: 'adding a new record',
        markers: [/<form/i, /onSubmit/i, /\bcreate\b/i, /إضافة/u],
    },
    {
        id: 'export', kind: 'feature',
        says: ['تصدير', 'صدر', 'تنزيل', 'export', 'download', 'csv'],
        asked: /(تصدير|صدّ?ر|تنزيل|\bexport\b|\bdownload\b|\bcsv\b)/iu,
        ar: 'تصدير محلّي', en: 'a local export',
        markers: [/createObjectURL|download=|\bcsv\b|toCSV|Blob\(/i],
    },
    {
        id: 'dashboard', kind: 'feature',
        asked: /(لوحة\s*(مؤشرات|تحكم|قيادة)|إحصاء|احصاء|مؤشرات|\bdashboard\b|\bkpi\b|\bstats?\b)/iu,
        ar: 'لوحة مؤشّرات', en: 'a dashboard of indicators',
        markers: [/stat|kpi|مؤشر|إحصاء/iu],
    },
    {
        id: 'empty_state', kind: 'feature',
        asked: /(حالات?\s*(فراغ|فارغة|خطأ)|\bempty\s*state|\berror\s*state)/iu,
        ar: 'حالات الفراغ والخطأ', en: 'empty and error states',
        markers: [/empty|لا توجد|لا يوجد|فارغ/iu],
    },
    {
        id: 'rtl', kind: 'feature',
        asked: /\brtl\b|عربية?\s*(متجاوبة|واجهة)?|اتجاه\s*عربي/iu,
        ar: 'واجهة عربية RTL', en: 'an Arabic RTL interface',
        markers: [/dir=["']rtl["']/i],
    },
    {
        id: 'readme', kind: 'artifact',
        asked: /\breadme\b|ملف\s*(تعريف|شرح)/iu,
        ar: 'ملف README', en: 'a README file',
    },
    {
        id: 'production_build', kind: 'verification',
        asked: /(?:بناء|ابنِ)\s*(?:لي\s*)?(?:نسخة\s*)?(?:إنتاج|الإنتاج)|(?:نسخة|بيئة)\s*(?:إنتاج|الإنتاج)|production\s+build|build\s+for\s+production|npm\s+run\s+build/iu,
        ar: 'بناء نسخة الإنتاج', en: 'a production build',
    },
    {
        id: 'preview', kind: 'verification',
        says: ['معاينة', 'عاين', 'preview', 'serve'],
        asked: /(معاينة|عاين|\bpreview\b|\bserve\b)/iu,
        ar: 'معاينة محلّية تعمل', en: 'a working local preview',
    },
    {
        id: 'browser_check', kind: 'verification',
        asked: /(متصفح|المتصفح|\bbrowser\b|فحص\s*بصري|visual\s*check)/iu,
        ar: 'فحص في متصفّح حقيقي', en: 'a check in a real browser',
    },
];

/** Extract a literal title only when the request gives a safe structural boundary. */
function extractRequestedTitle(request: string): string | undefined {
    const patterns = [
        // Quoted, in either language: the closing quote IS the boundary,
        // so there is no lookahead and no guessing where the name stops.
        /(?:titled|called|named|بعنوان|عنوانها|عنوانه|اسمها|إسمها|اسمه|إسمه)\s*[:：]?\s*[«"'`‘“]([^»"'`’”]{1,60})[»"'`’”]/iu,
        /\btitled\s+(.+?)(?=\s+(?:with|that|which|containing|including|and)\b|[,.;]|$)/iu,
        /(?:بعنوان|عنوانها|عنوانه|اسمها|إسمها|اسمه|إسمه)\s+(.+?)(?=\s+(?:فيها|يحتوي|تحتوي|مع|وبها|والتي|و)(?=\s|[،,؛.;]|$)|[،,؛.;]|$)/u,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(request);
        if (!match) continue;
        const value = match[1].trim().replace(/["'`]+$/g, '').trim();
        const words = value.split(/\s+/u).filter(Boolean);
        if (words.length > 0 && words.length <= 4) return value;
    }
    return undefined;
}

/** The named, regression-tested title extractor used by acceptanceFor. */
export function titleTextFrom(request: string): string | undefined {
    return extractRequestedTitle(request);
}

/**
 * A WORD, NOT A RUN OF LETTERS THAT HAPPENS TO SIT INSIDE ONE.
 *
 * Every English alternative in the catalogue above is written \bcounter\b.
 * Not one Arabic alternative had a boundary of any kind, and it could not:
 * JavaScript defines \b by \w, which is [A-Za-z0-9_], so between two
 * Arabic letters there is NEVER a \b position. Writing \bعدد\b does not
 * make it stricter — it makes it unmatchable. So the Arabic side was left
 * bare, and matched fragments.
 *
 * Measured, before this existed — each of these BLOCKED delivery on a
 * criterion the request never asked for:
 *
 *     «متعدد الصفحات»        -> counter   («عدد» inside «متعدد»)
 *     «لون أزرق فاتح»        -> button    («زر» inside «أزرق»)
 *     «مجموعة صور»            -> counter   («مجموع» inside «مجموعة»)
 *     «عندي استعداد»          -> counter   («عداد» inside «استعداد»)
 *     «لبيع الجزر والخضار»    -> button    («زر» inside «الجزر»)
 *
 * So the boundary is checked on the MATCH instead of inside the pattern:
 * a hit that begins or ends flush against another Arabic letter was a
 * fragment — unless the letters before it are one of the particles Arabic
 * glues onto the front of a word (ال، و، ب، ل، ك، ف and their pairs), or the
 * letters after it are one of the endings it takes (ات، ها، ين …). «العداد»
 * is the counter; «استعداد» is readiness; only a boundary tells them apart.
 *
 * This is deliberately generic: it fixes every pattern in the catalogue at
 * once, and every pattern added to it later, instead of the one that was
 * caught. A fix that names «عدد» would leave «زر» standing.
 */
const DIACRITIC = new RegExp('[\\u064B-\\u0652\\u0670\\u0640]', 'gu');
const AR_LETTER = new RegExp('[\\u0621-\\u064A]', 'u');
const AR_LEAD = new RegExp('[\\u0621-\\u064A]+$', 'u');
const AR_TAIL = new RegExp('^[\\u0621-\\u064A]+', 'u');
/** The particles Arabic writes joined to the front of the next word. */
const GLUED_BEFORE = new RegExp('^(?:[وفبك]?ال|لل|[وفبكل])$', 'u');
/** The endings a noun takes without becoming a different noun. */
//  «عدادًا» keeps its accusative alif after the tanween mark is stripped,
//  and «عدادان» is two of them. Neither is a different word.
const GLUED_AFTER = new RegExp('^(?:ان|ات|ها|هم|هن|ين|ون|نا|كم|ا|ه|ي)$', 'u');

export function requestAsksFor(asked: RegExp, text: string): boolean {
    const flags = asked.flags.includes('g') ? asked.flags : asked.flags + 'g';
    const re = new RegExp(asked.source, flags);
    //  Diacritics are not letters and must not split a word: «عدّاد» with a
    //  shadda is the same word as «عداد», and a pattern spelled without one
    //  never reaches it. Strip them before asking, never in what is stored.
    text = String(text || '').replace(DIACRITIC, '');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const hit = m[0];
        if (!hit) { re.lastIndex = m.index + 1; continue; }
        //  Step by ONE on rejection, never past it: the alternative that
        //  matched a fragment here may have a longer sibling starting later.
        const reject = () => { re.lastIndex = m!.index + 1; };
        if (AR_LETTER.test(hit.charAt(0))) {
            const lead = (text.slice(0, m.index).match(AR_LEAD) || [''])[0];
            if (lead && !GLUED_BEFORE.test(lead)) { reject(); continue; }
        }
        if (AR_LETTER.test(hit.charAt(hit.length - 1))) {
            const tail = (text.slice(m.index + hit.length).match(AR_TAIL) || [''])[0];
            if (tail && !GLUED_AFTER.test(tail)) { reject(); continue; }
        }
        return true;
    }
    return false;
}
/** The criteria THIS brief actually asks for — never a fixed checklist. */
export function acceptanceFor(request: string): Criterion[] {
    /**
     *  ⛔ HIS WORDS ONLY. THE JUDGE MUST NEVER READ JOE'S OWN PAPERWORK.
     *
     *  Measured on a real run, from the ledger that blocked the delivery:
     *
     *      { "id": "rule:1", "kind": "feature",
     *        "en": "your condition: «do not invent beyond it) ---»",
     *        "expectedRule": { "text": "do not invent beyond it) ---",
     *                          "kind": "forbid", "field": "invent" } }
     *
     *  «do not invent beyond it) ---» is not his condition. It is a fragment
     *  of the wrapper `ProjectPipelineTool.ts:1050` appends to his sentence —
     *  including the trailing `) ---` of the banner it was cut out of. Joe
     *  derived the owner's requirement from Joe's own scaffolding, failed to
     *  prove it, and refused to deliver a site it had actually built.
     *
     *  ⛔ AND THE REPAIR ALREADY EXISTED. `hisWordsOnly` cuts exactly that
     *  block, it handles BOTH banners — measured in its own comment:
     *  «AUTHORITATIVE DISCOVERY EVIDENCE» and «COMPACT REQUIREMENTS EVIDENCE»
     *  — and `entity-inference` and `app-blueprints` have both called it for
     *  months. The acceptance judge, the one reader whose whole job is «what
     *  did HE ask for», never did.
     *
     *  That is this session's most repeated class, and its ninth appearance:
     *  a layer exists and a second reader never asks. The guard beside the
     *  entity reader even says it out loud — «its only caller was inside its
     *  own file» — and the sentence was true of this file too.
     */
    /**
     *  ⛔ AND THE CUT RUNS ONLY WHERE JOE'S PAPERWORK REALLY STARTS.
     *
     *  `hisWordsOnly` also cuts at a BLANK LINE, which is Joe's mark only
     *  when Joe put it there. Measured on this very function while wiring it:
     *
     *      «اعمل لي متجراً لبيع العسل.

ولا تقبل سعراً صفراً أو سالباً.»
     *          -> «اعمل لي متجراً لبيع العسل.»
     *
     *  His rule, in his own second paragraph, gone. A man who writes two
     *  paragraphs must not lose the second — and the judge losing a
     *  CONDITION he stated is the same defect as the judge inventing one, in
     *  the opposite direction.
     *
     *  So the cut is applied only when one of Joe's own banners is actually
     *  present. When it is, `hisWordsOnly` removes it and everything after;
     *  when it is not, his sentence is untouched, blank lines and all.
     */
    const raw = String(request || '');
    const JOE_WROTE_THIS = new RegExp('(?:AUTHORITATIVE|COMPACT)[^' + String.fromCharCode(10) + ']{0,80}EVIDENCE', 'i');
    const t = JOE_WROTE_THIS.test(raw) ? hisWordsOnly(raw) : raw;
    //  A word is asked as a word; a phrase keeps its pattern. Entries with
    //  `says` no longer touch a regex over Arabic at all.
    const catalogue = CATALOGUE.filter(c => (c.says ? saysAny(t, c.says) : requestAsksFor(c.asked, t)))
        .map(({ asked, ...rest }) => rest)
        .map(c => c.id === 'title'
            ? { ...c, expectedText: titleTextFrom(t) }
        : c);

    //  His columns, in his words, each one its own criterion. No catalogue
    //  is consulted: derivedColumns reads them from the sentence he wrote.
    /**
     *  ⛔ A COLUMN BELONGS TO A TABLE, AND A WEBSITE HAS NONE.
     *
     *  Caught on a live run, from a sentence the owner wrote himself:
     *
     *      أبي موقع لمحمصة قهوة… حط فيه قائمة قهوة بأسعارها
     *      ودرجة التحميص، وساعات العمل والموقع…
     *
     *          acceptance_criteria_unmet: column:text1 … column:text4
     *
     *  Measured on the same sentence: detectAppKind returns null -- Joe
     *  knows perfectly well it is a site -- and the judge asked for four
     *  table columns anyway. So the website gets built and then refused,
     *  because it has no columns, which a website never has.
     *
     *  ⛔ That is a criterion that can NEVER BE MET, and it is the mirror
     *  of the one this file keeps deleting: a check that cannot fail proves
     *  nothing, and a check that cannot pass blocks everything.
     *
     *  The classifier was taught that a site noun means a site and the
     *  judge was not -- two readers of one request, each correct alone and
     *  the pair fatal. When nothing table-shaped will be built, the nouns
     *  in his sentence are CONTENT, and the sections reader already carries
     *  them: a coffee list with its prices becomes a listing, not four
     *  columns nobody can point at.
     */
    const willBuildATable = detectAppKind(t) !== null;
    const columns = willBuildATable ? (columnsAnywhereInHisRequest(t) || []) : [];


    /**
     *  THE PAGES HE NAMED ARE CRITERIA, exactly as his columns are.
     *
     *  Only when he named TWO or more: one named page becomes the single
     *  page of a single-page build, and «the page exists» would then be a
     *  criterion that cannot fail. Two is where a page becomes a thing
     *  that can be missing.
     */
    const named = thePagesHeNamed(
        t.replace(DIACRITICS_FOR_PAGES, '').replace(HAMZAS_FOR_PAGES, 'ا').replace(MAQSURA_FOR_PAGES, 'ي'),
    );
    /**
     *  ONE NAMED PAGE IS A CRITERION WHEN HE IS ADDING IT.
     *
     *  The two-page floor exists for a real reason: a single-page build writes
     *  index.html by definition, so «the page exists» could never fail, and a
     *  criterion that cannot fail is the thing this file keeps deleting.
     *
     *  But «أضف صفحة الأسعار» is not a single-page build — it is an addition
     *  to something already on disk, and `pricing.html` either arrives or it
     *  does not. Measured across a thousand requests: forty edit requests
     *  naming a page derived NO criterion at all, so the page he asked to be
     *  added was never checked for.
     *
     *  The verb is the whole distinction and it is in his own sentence, so no
     *  session state is consulted: «أضف» / «add» means the thing must be there
     *  afterwards, and one is enough.
     */
    const HE_IS_ADDING = /(?:^|\s)(?:أضف|اضف|ضيف|أضيف|اضيف|add)(?:\s|$)/iu;
    const adding = HE_IS_ADDING.test(t);
    const pages = (named.length >= 2 || (adding && named.length >= 1)) ? named : [];

    //  Every rule he stated, whether or not Joe can prove it. The judge says
    //  `unprovable` for what it cannot check, and that is declared to him —
    //  a rule that vanishes is the one outcome with no honest reading.
    const rules = statedRules(t);

    /**
     *  A BOUND BELONGS TO ITS COLUMN, NOT TO A NUMBERED LIST.
     *
     *  Two readings of the same sentence grew independently — «شرطك: السعر لا
     *  يقبل صفرًا» as `rule:1`, and «القيد على السعر» as `constraint:money1:min`
     *  — and they met in a merge. Keeping both would have been the seam class
     *  itself: two records of one fact, maintained separately, with nothing
     *  forcing them to agree.
     *
     *  So there is ONE derivation, `statedRules`, and two presentations of it.
     *  A rule that IS a bound and names a column he asked for is that column's
     *  constraint and is emitted beside it, carrying both shapes so either
     *  reader is served from the same value. Everything else — a forbid, a
     *  require, a bound with no column to sit on — stays a numbered rule,
     *  because a rule that vanishes is the one outcome with no honest reading.
     */
    const boundFor = new Map<string, typeof rules[number]>();
    const loose: typeof rules = [];
    for (const r of rules) {
        const said = String(r.field || r.text || '');
        const owner = (r.kind === 'bound' && r.min !== undefined && said)
            ? (columns as DerivedField[]).find(col => {
                const label = String(col.label || '');
                if (!label) return false;
                //  Through the language layer, both ways: he writes «سعرًا»
                //  and the schema says «السعر». Matching raw text would read
                //  letters, not words.
                if (label === said || saysWord(said, label)) return true;
                if (label.split(/\s+/).some(w => w.length > 2 && saysWord(said, w))) return true;
                /**
                 *  An identifier is not a word, and the word layer cannot see
                 *  it. `zqixdal_val` segments into three pieces, so asking the
                 *  stemmer for it always answers no — measured on an invented
                 *  column name with no catalogue behind it.
                 *
                 *  Plain containment is the right test for exactly this shape
                 *  and the wrong one for Arabic, where «العنوان» sits inside
                 *  «العنوانين». So it is allowed only for a label carrying NO
                 *  Arabic letter, which is where the word layer has nothing to
                 *  offer and where the trap it guards cannot occur.
                 */
                if (label.length >= 3 && !/[؀-ۿ]/.test(label)) return said.includes(label);
                return false;
            })
            : undefined;
        if (owner && !boundFor.has(owner.key)) boundFor.set(owner.key, r);
        else loose.push(r);
    }

    return [
        ...catalogue,
        ...loose.map((r, i) => ({
            id: `rule:${i + 1}`,
            kind: 'feature' as CriterionKind,
            ar: `شرطك: «${r.text}»`,
            en: `your condition: «${r.text}»`,
            //  Everything the reader derived, carried to the judge. Dropping
            //  three of five fields here is what made the proof unprovable.
            expectedRule: { text: r.text, kind: r.kind, field: r.field, min: r.min, minExclusive: r.minExclusive },
        })),
        ...pages.map((p: { slug: string; title: string }) => ({
            id: `page:${p.slug}`,
            kind: 'feature' as CriterionKind,
            ar: `صفحة «${p.title}» موجودة وتحمل اسمها`,
            en: `a page «${p.title}» exists and carries its name`,
            expectedPage: { slug: p.slug, title: p.title },
        })),
        //  …and each column carries its own constraint immediately after it,
        //  where he can read the two together.
        ...(columns as DerivedField[]).flatMap((col: DerivedField) => {
            const own: Criterion[] = [{
                id: `column:${col.key}`,
                kind: 'feature' as CriterionKind,
                ar: `عمود «${col.label}» موجود في الجدول`,
                en: `a column «${col.label}» exists in the table`,
                expectedColumn: col.label,
            }];
            const r = boundFor.get(col.key);
            if (r && r.min !== undefined) {
                own.push({
                    id: `constraint:${col.key}:min`,
                    kind: 'feature' as CriterionKind,
                    ar: `القيد «${col.label}» ${r.minExclusive ? 'أكبر من' : 'لا يقل عن'} ${r.min}`,
                    en: `the column «${col.label}» rejects values ${r.minExclusive ? 'at or below' : 'below'} ${r.min}`,
                    expectedColumn: col.label,
                    expectedBound: { min: r.min, minExclusive: !!r.minExclusive },
                    //  The same value in the shape the stronger judge reads —
                    //  derived here, never maintained twice.
                    expectedRule: { text: r.text, kind: r.kind, field: r.field, min: r.min, minExclusive: r.minExclusive },
                });
            }
            return own;
        }),
    ];
}

export interface Evidence {
    /** The generated project directory, when one exists. */
    dir?: string;
    built?: boolean;
    /** A preview/server url that was verified alive. */
    liveUrl?: string;
    /** The browser audit, or its skip reason. */
    audit?: { skipped?: string; score?: number } | null;
}

/** Read every source file once — the judge greps this, not the disk. */
function sourceOf(dir: string): string {
    const out: string[] = [];
    const walk = (d: string, depth = 0) => {
        if (depth > 4) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p, depth + 1); continue; }
            if (!/\.(jsx?|tsx?|html|css)$/i.test(e.name)) continue;
            try { out.push(fs.readFileSync(p, 'utf-8')); } catch { /* unreadable is not evidence */ }
        }
    };
    walk(dir);
    return out.join('\n');
}

interface StateBinding {
    value: string;
    setter: string;
}

function stateBindings(src: string): StateBinding[] {
    const bindings: StateBinding[] = [];
    const pattern = /\b(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\.)?use(?:State|Reducer)\s*\(/gi;
    for (const match of src.matchAll(pattern)) {
        bindings.push({ value: match[1], setter: match[2] });
    }
    return bindings;
}

function hasCounterEvidence(src: string): boolean {
    return stateBindings(src).some(({ value, setter }) => {
        const setterCall = new RegExp(`\\b${escapeRegExp(setter)}\\s*\\([\\s\\S]{0,180}?(?:\\+\\s*1|-\\s*1|\\bprev[A-Za-z_$]*\\b)`, 'i').test(src);
        const visibleValue = new RegExp(`(?:data-(?:count|total)\\s*=\\s*\\{\\s*${escapeRegExp(value)}\\s*\\}|>\\s*\\{\\s*${escapeRegExp(value)}\\s*\\}\\s*<)`, 'i').test(src);
        const action = new RegExp(`\\b(?:onClick|onChange|onSubmit)\\s*=\\s*[\\s\\S]{0,220}?\\b${escapeRegExp(setter)}\\s*\\(`, 'i').test(src);
        return setterCall && visibleValue && action;
    });
}

function hasActionBoundButtonEvidence(src: string): boolean {
    const clickButton = /<button\b[^>]*\bonClick\s*=/i.test(src)
        || /\brole=["']button["'][^>]*\bonClick\s*=/i.test(src);
    const submitButton = /<form\b[^>]*\bonSubmit\s*=\s*[\s\S]*?<button\b[\s\S]*?<\/form>/i.test(src)
        || /<button\b[^>]*\btype=["']submit["']/i.test(src);
    return clickButton || submitButton;
}

function hasStatusMessageEvidence(src: string): boolean {
    return stateBindings(src).some(({ value, setter }) => {
        if (!/(?:status|message|notice|feedback|success|error|toast|result|alert)/i.test(value)) return false;
        const setterCall = new RegExp(`\\b${escapeRegExp(setter)}\\s*\\([\\s\\S]{0,180}?\\)`, 'i').test(src);
        const semanticNode = new RegExp(`<(?:(?:p|div|span|output|section))\\b[^>]*(?:role=["']status["']|aria-live=["'][^"']+["']|className=["'][^"']*(?:status|message|notice|feedback)[^"']*["'])[^>]*>[\\s\\S]*?\\{\\s*${escapeRegExp(value)}\\s*\\}[\\s\\S]*?<\\/\\w+>`, 'i').test(src);
        return setterCall && semanticNode;
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A TOTAL IS NOT A CLICK COUNTER, AND ARABIC SAYS BOTH WITH ONE WORD.
 *
 * The contract warns about exactly this pair: «الإجمالي» and «المجموع» mean
 * a computed total OR an incrementing counter, and the catalogue maps both to
 * `counter`. Proof, until now, was `hasCounterEvidence`: a state binding whose
 * setter adds one, wired to a click. A sum over rows has no setter and no
 * button — so a page that computed the total and displayed it was judged to
 * have no total at all.
 *
 * Measured live on the owner's machine: he asked for a page showing the total
 * of his expenses at the bottom, Joe built it, and delivery was BLOCKED with
 * `acceptance_criteria_unmet`. Correct work, refused — and the user was told
 * only that one English error code.
 *
 * So a fold that reaches the screen proves it too. It is held to the same
 * standard as the counter: TWO facts bound by ONE shared identifier — a value
 * accumulated with `+` inside a reduce, and that same name rendered. A bare
 * `.reduce(` proves nothing, and neither does the word «total» in a comment.
 */
function foldedTotalBindings(src: string): string[] {
    const names: string[] = [];
    const declared = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]{0,240}?\.reduce\s*\(/g;
    for (const match of src.matchAll(declared)) {
        // `reduce` plus `+` is not enough: it may concatenate labels. Require
        // an amount/value-like operand or an explicit numeric conversion.
        const body = src.slice(match.index || 0, (match.index || 0) + 340);
        const numericAdd = /=>[\s\S]{0,220}?\+\s*(?:(?:Number|num)\s*\([^)]*\)|[A-Za-z_$][\w$]*\s*\.\s*(?:amount|value|total|price|cost|quantity)\b|(?:amount|value|total|price|cost|quantity)\b)/i.test(body);
        if (numericAdd) names.push(match[1]);
    }
    return names;
}

function recordsMetricTotalEvidence(src: string): boolean {
    // The general records engine computes a sum from the actual rows. Prove the
    // configuration, the renderer's binding to those rows, and the executable
    // numeric sum branch together; a template name or the word "total" alone
    // never passes.
    const configured = /\bmetrics\s*:\s*\[[\s\S]{0,900}?\bkind\s*:\s*['"]sum['"][\s\S]{0,240}?\bfield\s*:\s*['"][A-Za-z_$][\w$]*['"]/i.test(src);
    const rendered = /\bcomputeMetric\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*rows\s*\)/i.test(src);
    const implementation = /\bcase\s*['"]sum['"]\s*:[\s\S]{0,280}?\breduce\s*\([\s\S]{0,220}?\+\s*(?:num|Number)\s*\(/i.test(src);
    return configured && rendered && implementation;
}

export function computedTotalEvidence(src: string): boolean {
    const BS = String.fromCharCode(92);
    /**
     *  ⛔ THE TOTAL REACHES THE PAGE — HOWEVER IT IS FORMATTED.
     *
     *  Measured on a live build the owner watched. He asked for «sa cart that
     *  computes the total»; Joe's own store engine did exactly that:
     *
     *      const total = useMemo(() => lines.reduce(
     *          (s, l) => s + Number(l.product.price || 0) * l.qty, 0), [lines]);
     *      <p className="cart-total"><span>{'الإجمالي'}</span><b>{money(total)}</b></p>
     *
     *  And the judgement came back `acceptance_criteria_unmet: counter`, so the
     *  delivery was refused. The criterion accepted `{total}` and
     *  `{total.toLocaleString()}` — a value shown bare, or with a method called
     *  ON it — and had no shape for a value passed THROUGH a formatter, which
     *  is how every currency in this repository is printed.
     *
     *  ⛔ SO IT WAS A CRITERION JOE'S OWN GENERATOR COULD NOT SATISFY: the
     *  mirror of one that can never fail, and worse, because it blocked a
     *  correct delivery and told the owner his store had no total. It is the
     *  session's most expensive class one more time — EVIDENCE MATCHING A
     *  SPELLING INSTEAD OF TESTING THE CLAIM.
     *
     *  The claim is «the computed total reaches the page». All three ways of
     *  doing that count, and nothing else does:
     *      {total}              bare
     *      {total.toFixed(2)}   a method on it
     *      {money(total)}       passed through a formatter
     */
    const foldedAndShown = foldedTotalBindings(src).some(name => {
        const n = escapeRegExp(name);
        const IDENT = '[A-Za-z_$][' + BS + 'w$]*';
        const bare = new RegExp('[{]' + BS + 's*' + n + BS + 's*[}]');
        const method = new RegExp('[{]' + BS + 's*' + n + BS + '.' + IDENT + BS + 's*' + BS + '([^)]*' + BS + ')' + BS + 's*[}]');
        //  …or handed to a formatter, which is how money is printed.
        const formatted = new RegExp('[{]' + BS + 's*' + IDENT + BS + 's*' + BS + '([^)]*' + BS + 'b' + n + BS + 'b[^)]*' + BS + ')');
        return bare.test(src) || method.test(src) || formatted.test(src);
    });
    return foldedAndShown || recordsMetricTotalEvidence(src);
}

/**
 * THE TITLE THE PAGE SHOWS, NOT THE LETTERS THE FILE HAPPENS TO CONTAIN.
 *
 * Measured live on the owner's machine. He asked for a page under a quoted
 * Arabic name; Joe built exactly that, and the judge called it unmet:
 *
 *     <h1 className="app-name">{content.brand}</h1>   // what the page renders
 *     brand: '<the requested name>',                    // where the value lives
 *
 * The heading is right on screen and wrong in a grep, because the old proof
 * matched literal text inside the tag and a React page almost never puts it
 * there. A judge that refuses correct work is not strict — it is broken in the
 * expensive direction, and it blocked that delivery outright.
 *
 * So the proof follows the binding — ONE hop, and only to a string literal on
 * one line of the same generated source. Anything computed, concatenated, or
 * imported from elsewhere does not resolve and stays unproven: one hop is what
 * a page needs and what a guess would exceed.
 */
function structuralMask(src: string): string {
    const out = src.split('');
    let mode: 'code' | 'single' | 'double' | 'template' | 'line' | 'block' = 'code';
    let escaped = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        const next = src[i + 1];
        if (mode === 'code') {
            if (ch === '/' && next === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 'line'; i++; continue; }
            if (ch === '/' && next === '*') { out[i] = ' '; out[i + 1] = ' '; mode = 'block'; i++; continue; }
            if (ch === "'") { mode = 'single'; escaped = false; continue; }
            if (ch === '"') { mode = 'double'; escaped = false; continue; }
            if (ch === '`') { mode = 'template'; escaped = false; continue; }
            continue;
        }
        if (mode === 'line') {
            if (ch === '\n' || ch === '\r') { mode = 'code'; continue; }
            out[i] = ' ';
            continue;
        }
        if (mode === 'block') {
            if (ch === '*' && next === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 'code'; i++; continue; }
            if (ch !== '\n' && ch !== '\r') out[i] = ' ';
            continue;
        }
        if (escaped) { if (ch !== '\n' && ch !== '\r') out[i] = ' '; escaped = false; continue; }
        if (ch === '\\') { out[i] = ' '; escaped = true; continue; }
        if ((mode === 'single' && ch === "'") || (mode === 'double' && ch === '"') || (mode === 'template' && ch === '`')) {
            mode = 'code';
            continue;
        }
        if (ch !== '\n' && ch !== '\r') out[i] = ' ';
    }
    return out.join('');
}

function objectLiteralBody(src: string, objectName: string): { source: string; mask: string } | undefined {
    const mask = structuralMask(src);
    const declaration = new RegExp('\\b(?:const|let|var)\\s+' + escapeRegExp(objectName) + '\\s*=\\s*\\{', 'g');
    const match = declaration.exec(mask);
    if (!match) return undefined;
    const open = mask.indexOf('{', match.index);
    let depth = 1;
    for (let i = open + 1; i < mask.length; i++) {
        if (mask[i] === '{') depth++;
        else if (mask[i] === '}') {
            depth--;
            if (depth === 0) return { source: src.slice(open + 1, i), mask: mask.slice(open + 1, i) };
        }
    }
    return undefined;
}

function topLevelSegments(mask: string): Array<[number, number]> {
    const segments: Array<[number, number]> = [];
    let start = 0;
    let depth = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === '{' || mask[i] === '[' || mask[i] === '(') depth++;
        else if (mask[i] === '}' || mask[i] === ']' || mask[i] === ')') depth = Math.max(0, depth - 1);
        else if (mask[i] === ',' && depth === 0) { segments.push([start, i]); start = i + 1; }
    }
    segments.push([start, mask.length]);
    return segments;
}

function objectPropertyLiteral(src: string, objectName: string, property: string): string | undefined {
    const body = objectLiteralBody(src, objectName);
    if (!body) return undefined;
    const key = escapeRegExp(property);
    for (const [start, end] of topLevelSegments(body.mask)) {
        const maskedSegment = body.mask.slice(start, end);
        const keyMatch = new RegExp('^\\s*' + key + '\\s*:\\s*([\\\'"`])').exec(maskedSegment);
        if (!keyMatch) continue;
        const open = start + keyMatch.index + keyMatch[0].lastIndexOf(keyMatch[1]);
        const close = body.mask.indexOf(keyMatch[1], open + 1);
        if (close < 0) return undefined;
        const after = body.mask.slice(close + 1, end).trim();
        if (after) return undefined;
        const value = body.source.slice(open + 1, close).trim();
        if (keyMatch[1] === '`' && value.includes('${')) return undefined;
        return value;
    }
    return undefined;
}

function literalVariableValue(src: string, name: string): string | undefined {
    const mask = structuralMask(src);
    const declaration = new RegExp('\\b(?:const|let|var)\\s+' + escapeRegExp(name) + '\\s*=\\s*([\\\'"`])', 'g');
    const match = declaration.exec(mask);
    if (!match) return undefined;
    const close = mask.indexOf(match[1], match.index + match[0].length);
    if (close < 0 || mask.slice(close + 1, close + 120).trim()) return undefined;
    const value = src.slice(match.index + match[0].length, close).trim();
    if (match[1] === '`' && value.includes('${')) return undefined;
    return value;
}

function resolvedTitleText(src: string, expression: string): string | undefined {
    const path = expression.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
    if (path) return objectPropertyLiteral(src, path[1], path[2]);
    if (/^[A-Za-z_$][\w$]*$/.test(expression)) return literalVariableValue(src, expression);
    return undefined;
}

export function titleEvidence(src: string, expected: string): boolean {
    const literal = escapeRegExp(expected);
    //  Built from an explicit backslash: this file has been mangled once by an
    //  escaping layer between an editor and disk, and a regex that silently
    //  degrades to matching a backspace character is exactly the kind of guard
    //  that passes review and proves nothing.
    const BS = String.fromCharCode(92);
    const heading = new RegExp('<h[1-6]' + BS + 'b[^>]*>' + BS + 's*' + literal + BS + 's*</h[1-6]>', 'iu');
    const docTitle = new RegExp('<title' + BS + 'b[^>]*>' + BS + 's*' + literal + BS + 's*</title>', 'iu');
    if (heading.test(src) || docTitle.test(src)) return true;
    const bound = /<(?:h[1-6]|title)\b[^>]*>\s*\{\s*([A-Za-z_$][\w$.]*)\s*\}\s*<\/(?:h[1-6]|title)>/giu;
    for (const match of src.matchAll(bound)) {
        if (resolvedTitleText(src, match[1]) === expected) return true;
    }
    return false;
}

/**
 * Judge what was asked against what exists.
 *
 * Every «met» points at something real: a file, a flag that came from a
 * process, or a marker in the generated source. Nothing is met by default.
 */
export function judgeAcceptance(criteria: Criterion[], ev: Evidence, isAr = true): Acceptance {
    const dir = String(ev.dir || '');
    const src = dir && fs.existsSync(dir) ? sourceOf(dir) : '';

    const judged: JudgedCriterion[] = criteria.map(c => {
        const say = (verdict: Verdict, why: string): JudgedCriterion => ({ ...c, verdict, why });

        //  A verdict established by READING the source outranks every pattern
        //  below it, because the patterns can only speak about the handful of
        //  features the catalogue knows. Nothing here re-derives it: a settled
        //  verdict that this function second-guessed would be two judges on one
        //  claim, and the weaker one would win by being last.
        if (c.preJudged) return say(c.preJudged.verdict, c.preJudged.why);

        /**
         *  ⛔ THE NARROWER CLAIM IS JUDGED FIRST.
         *
         *  A constraint criterion carries its column's label so the ledger can
         *  name it, and «the column exists» is TRUE for a schema that dropped
         *  the bound entirely. Judging by the wider claim first answers a
         *  question nobody asked and marks the constraint met — measured: a
         *  mutation that deleted `minExclusive: true` still scored green.
         *
         *  So a criterion that carries a rule is judged by its rule, and the
         *  column it names is context, not the test.
         */
        if (c.expectedColumn && !c.expectedRule) {
            //  The label he wrote, quoted in the generated source. A column
            //  that is not there cannot be greped into existence.
            //  As a COLUMN, not as loose text: a label that happens to
            //  appear in a comment or a sentence proves nothing about the
            //  table. The generated schema writes `label: '…'`.
            const quoted = c.expectedColumn.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&");
            const has = !!src && new RegExp("label:\\s*'" + quoted + "'").test(src);
            return has
                ? say('met', isAr ? `العمود «${c.expectedColumn}» في مخطّط الجدول` : `the column «${c.expectedColumn}» is in the table schema`)
                : say('unmet', isAr ? `العمود «${c.expectedColumn}» غير موجود` : `the column «${c.expectedColumn}» is missing`);
        }
        if (c.expectedRule) {
            //  A BOUND is the one kind that becomes a real constraint, and
            //  the generated app already ships the guard that reads it —
            //  `if (field.type !== 'number' || field.min === undefined)`.
            //  So the proof is the value that guard needs, in the schema.
            if (c.expectedRule.kind === 'bound') {
                /**
                 *  A BOUND IS PROVEN ON A COLUMN, WITH A NUMBER, AT A
                 *  STRICTNESS — OR IT IS NOT PROVEN.
                 *
                 *  This asked `/min:\s*-?\d/` of the whole project, so any
                 *  digit after any `min:` anywhere earned the ✅ — a bound on
                 *  the wrong column, a different number, or a build missing
                 *  `minExclusive` and therefore ACCEPTING the exact value he
                 *  forbade, all reported as met.
                 *
                 *  The schema writes one line per column, and that line is the
                 *  unit of proof:
                 *
                 *    { key: 'money1', label: 'السعر', type: 'number', … min: 0, minExclusive: true },
                 */
                const want = c.expectedRule;
                const labelOf = (line: string) => (/label:\s*'([^']*)'/.exec(line) || [])[1] || '';
                const columnLines = String(src || '').split('\n')
                    .filter(l => /label:\s*'/.test(l) && /\bmin:\s*-?\d/.test(l));
                //  On HIS column when he named one. `saysWord` both ways,
                //  because he writes «سعرًا» and the schema says «السعر».
                //  `field` is only filled when the clause OPENS with the noun
                //  — «المبلغ إذا كان صفرًا». «لا تقبل سعرًا صفرًا» opens with
                //  the negation, so it arrives empty, and the column is named
                //  in the middle of his sentence instead. So the CLAUSE is
                //  asked about each column, through the language layer: it
                //  says «سعرًا», the schema says «السعر», and one stemmer
                //  settles it. It does not say «كمية», so «الكمية» is out.
                const said = want.field || want.text || '';
                const onHisColumn = columnLines.filter(l => {
                    const label = labelOf(l);
                    if (!label || !said) return !!label;
                    return label === said || saysWord(said, label)
                        || label.split(/\s+/).some(w => w.length > 2 && saysWord(said, w));
                });
                //  With HIS number, when the sentence carried one.
                const withHisNumber = onHisColumn.filter(l => want.min === undefined
                    || new RegExp('\\bmin:\\s*' + want.min + '\\b').test(l));
                //  And at HIS strictness. «لا تقبل سعرًا صفرًا» forbids the
                //  value itself; a schema with `min: 0` and no `minExclusive`
                //  accepts zero, which is the opposite of what he asked.
                const proven = withHisNumber.filter(l => !want.minExclusive || /minExclusive:\s*true/.test(l));
                if (proven.length) {
                    return say('met', isAr
                        ? `الشرط مطبَّق على العمود «${labelOf(proven[0])}»: «${want.text}»`
                        : `the bound is on the column «${labelOf(proven[0])}»: «${want.text}»`);
                }
                //  A verdict that says WHICH of the three failed. «unmet» on
                //  its own sent an hour of searching in the wrong direction
                //  the last time a bound went missing.
                const why = onHisColumn.length === 0
                    ? (isAr ? `لم يصل حدٌّ إلى العمود الذي سمّيتَه` : `no bound reached the column you named`)
                    : withHisNumber.length === 0
                        ? (isAr ? `الحدّ على العمود بقيمة غير التي ذكرتها (${want.min})` : `the bound on that column is not the number you gave (${want.min})`)
                        : (isAr ? `الحدّ يقبل القيمة نفسها — «${want.min}» مسموحة، وأنت منعتها` : `the bound admits the value itself — «${want.min}» is allowed, and you forbade it`);
                return say('unmet', isAr
                    ? `اشترطتَ «${want.text}» — ${why}`
                    : `you asked for «${want.text}» — ${why}`);
            }
            //  A PROHIBITION and a REQUIREMENT are about the whole build, and
            //  Joe has no general way to check either. It says so, in his own
            //  words, rather than dropping the condition — `unprovable` is
            //  declared to him and does not block the delivery.
            return say('unprovable', isAr
                ? `قرأتُ شرطك «${c.expectedRule.text}» ولا أملك طريقة أُثبته بها، فلم أدّعِ أنّي فحصته`
                : `I read your condition «${c.expectedRule.text}» and have no way to prove it, so I did not claim to have checked it`);
        }
        if (c.expectedPage) {
            //  A page is proven the way a column is: by what the build
            //  actually wrote. Either a file of its own on disk (the page
            //  builder) or a route carrying his title (the React router).
            //  Nothing is greped into existence, and nothing is assumed
            //  from the plan — the plan is what we are checking.
            const slug = c.expectedPage.slug;
            const file = slug === 'index' ? 'index.html' : `${slug}.html`;
            const onDisk = !!dir && fs.existsSync(path.join(dir, file));
            const route = slug === 'index' ? '/' : `/${slug}`;
            //  The generator writes the route literally: `{ path: '/contact', … }`.
            //  A plain substring is enough, and leaves no escape to get wrong.
            const routed = !!src && src.includes(`path: '${route}'`);
            return (onDisk || routed)
                ? say('met', isAr
                    ? `صفحة «${c.expectedPage.title}» مبنية (${onDisk ? file : route})`
                    : `the page «${c.expectedPage.title}» was built (${onDisk ? file : route})`)
                : say('unmet', isAr
                    ? `صفحة «${c.expectedPage.title}» طلبتها ولم تُبنَ`
                    : `the page «${c.expectedPage.title}» was asked for and not built`);
        }
        if (c.id === 'readme') {
            const has = !!dir && ['README.md', 'readme.md'].some(f => fs.existsSync(path.join(dir, f)));
            return has
                ? say('met', isAr ? 'README.md موجود في المشروع' : 'README.md is in the project')
                : say('unmet', isAr ? 'لم أكتب README' : 'no README was written');
        }
        if (c.id === 'production_build') {
            return ev.built
                ? say('met', isAr ? 'dist/index.html موجود على القرص' : 'dist/index.html exists on disk')
                : say('unmet', isAr ? 'لم تُبنَ نسخة إنتاج' : 'no production build was produced');
        }
        if (c.id === 'preview') {
            return ev.liveUrl
                ? say('met', isAr ? `خادم يعمل على ${ev.liveUrl}` : `a server is live at ${ev.liveUrl}`)
                : say('unmet', isAr ? 'لم يبقَ خادم معاينة يعمل' : 'no preview server was left running');
        }
        if (c.id === 'browser_check') {
            if (!ev.audit) return say('unmet', isAr ? 'لم يُجرَ أي فحص في المتصفح' : 'no browser check ran');
            if (ev.audit.skipped) {
                return say('unmet', isAr
                    ? `تعذّر تشغيل المتصفح (${ev.audit.skipped})`
                    : `the browser could not start (${ev.audit.skipped})`);
            }
            return say('met', isAr
                ? `فُحصت في متصفّح حقيقي — ${ev.audit.score}/100`
                : `checked in a real browser — ${ev.audit.score}/100`);
        }

        // A FEATURE is met when the generated source really contains it.
        if (!src) {
            return say('unprovable', isAr
                ? 'لا مصدر أستطيع قراءته لأثبت هذا'
                : 'no source to read, so nothing can be proven');
        }
        let hit: boolean;
        let counterProvedByTotal = false;
        if (c.id === 'counter') {
            hit = hasCounterEvidence(src);
            if (!hit && computedTotalEvidence(src)) { hit = true; counterProvedByTotal = true; }
        } else if (c.id === 'button') {
            hit = hasActionBoundButtonEvidence(src);
        } else if (c.id === 'status_message') {
            hit = hasStatusMessageEvidence(src);
        } else if (c.id === 'title' && c.expectedText) {
            hit = titleEvidence(src, c.expectedText);
        } else {
            hit = (c.markers || []).some(re => re.test(src));
        }
        if (hit) {
            const why = counterProvedByTotal
                ? (isAr ? 'مجموع محسوب من بياناتك ومعروض في الصفحة' : 'a total computed from your rows and shown on the page')
                : c.id === 'title' && c.expectedText
                ? (isAr ? `العنوان المطلوب «${c.expectedText}» موجود في مصدر المشروع` : `requested title “${c.expectedText}” is present in the generated source`)
                : (isAr ? 'موجود في مصدر المشروع' : 'present in the generated source');
            return say('met', why);
        }
        return say('unmet', isAr ? 'لا يوجد دليل فعلي كافٍ في المصدر المولَّد' : 'no sufficient behavioral evidence in the generated source');
    });

    const met = judged.filter(c => c.verdict === 'met').length;
    /**
     *  ⛔ THREE OUTCOMES, AND ONLY ONE OF THEM MAY BLOCK.
     *
     *  Merging two branches put two guards in one tree arguing opposite
     *  sides, and both were written from real incidents:
     *
     *    • «an unprovable rule does not block the delivery» — because
     *      blocking on what Joe cannot check makes every conditional
     *      request undeliverable, which is how a guard becomes a wall.
     *      Every Gate062 run states «Do not modify existing projects»,
     *      so counting it against acceptance freezes acceptance forever,
     *      and a criterion that can NEVER be met is the same defect as
     *      one that can never fail.
     *
     *    • «unmet must cover every criterion» — because otherwise a run
     *      scores 100% by proving only the subset the judge knew how to
     *      inspect.
     *
     *  Both are right, and picking one silently would have discarded a
     *  measured incident. So the count is three-way: `unmet` blocks,
     *  `unprovable` does not, and NEITHER is hidden — the ledger head
     *  below never says «all proven» while an unprovable one stands, so
     *  no claim is made that the run cannot support.
     */
    const unmet = judged.filter(c => c.verdict === 'unmet').length;
    const unprovable = judged.filter(c => c.verdict === 'unprovable').length;
    /**
     *  ⛔ AND NOTHING PROVEN IS NEVER ACCEPTED.
     *
     *  `unmet === 0` alone made a run where the judge could check NOTHING
     *  come back accepted: zero proven, zero failed, every criterion
     *  unprovable — and a green verdict over a ledger with no evidence in
     *  it at all. That is the exact false success this file exists to stop,
     *  and it walked in through the door opened for `unprovable`.
     *
     *  So acceptance needs something demonstrated, not merely nothing
     *  refuted. One met criterion is the floor.
     */
    return {
        criteria: judged, met, unmet, unprovable,
        accepted: judged.length > 0 && unmet === 0 && met > 0,
    };
}

/**
 * The ledger, for the delivery message.
 *
 * Printed whenever the brief asked for anything at all — a clean ledger is
 * worth as much as a dirty one, because it is what makes the dirty one
 * believable.
 */
export function acceptanceBlock(a: Acceptance, isAr: boolean): string {
    /**
     *  A LEDGER THAT DOES NOT ADD UP IS NOT PUBLISHED.
     *
     *  The counts and the rows are two records of one judgement, and nothing
     *  but this line forces them to agree. A ledger printing «4 proven» over
     *  eleven rows is a report that reads as an answer, so it stops here
     *  rather than reaching him.
     */
    if (a.met + a.unmet + (a.unprovable || 0) !== a.criteria.length) {
        throw new Error('acceptance_ledger_count_mismatch');
    }
    if (!a.criteria.length) {
        return isAr
            ? '⚠️ لم أستخرج معياراً قابلاً للفحص من طلبك، لذلك لم أصدر حكم قبول.'
            : '⚠️ I could not derive a checkable criterion from your request, so I did not issue an acceptance judgment.';
    }
    const gaps = a.unprovable || 0;
    /**
     *  ⛔ «ALL PROVEN» IS A CLAIM, AND IT IS FALSE WHILE ONE IS UNCHECKED.
     *
     *  `unprovable` does not block delivery — blocking on what this judge
     *  cannot check would make every conditional request undeliverable. But
     *  not blocking is not permission to round it away: the head said «all
     *  requested criteria were proven» over a ledger with an unchecked row
     *  in it, which is exactly the false-success this file exists to stop.
     *
     *  So the gap is stated in the same sentence as the acceptance, in his
     *  language, with its number. He decides what to do about it; Joe only
     *  has to stop pretending it is not there.
     */
    /**
     *  ⛔ AND THE MARK IS THE EVIDENCE THAT REACHES HIM.
     *
     *  `✅` sat on «1 of 5 proven, 4 never checked» and on «5 of 5 proven»
     *  alike — and his eye cannot tell those apart, whatever the sentence
     *  after the mark says. That is `accepted` carrying two meanings in one
     *  boolean, which this repository already closed once under the name
     *  «a boolean that means two things cannot be guarded».
     *
     *  The two are separated where each belongs. `accepted` stays the
     *  DELIVERY gate — nothing he asked for was looked for and missing —
     *  because tying delivery to «everything proven» would wall off every
     *  request carrying a criterion this judge cannot check, and the
     *  reference prompt itself carries one, so that gate would never open
     *  again. The MARK answers the other question: a tick means everything
     *  he asked for was proven, and nothing less earns one.
     *
     *  He decides whether a partial delivery is good enough. Joe does not
     *  decide it for him with a green tick.
     */
    const head = a.accepted
        ? (gaps
            ? (isAr
                ? `⚠️ حكم قبول ناقص: لم يسقط شيءٌ ممّا فحصتُه (${a.met}/${a.criteria.length}) — و${gaps} من طلبك لم أعرف كيف أفحصه، ولم أدَّعِ أنّي فحصتُه:`
                : `⚠️ Accepted with gaps: nothing I checked failed (${a.met}/${a.criteria.length}) — and ${gaps} of your request I did not know how to check, and did not claim to have checked:`)
            : (isAr
                ? `✅ حكم القبول: أثبتُّ جميع المعايير المطلوبة (${a.met}/${a.criteria.length}).`
                : `✅ Acceptance accepted: all ${a.met}/${a.criteria.length} requested criteria were proven.`))
        : (isAr
            ? `⚠️ التسليم محجوب: أثبتُّ ${a.met} من أصل ${a.criteria.length} معياراً مشتقاً — و${a.unmet} لم يُثبت${gaps ? `، و${gaps} لم أعرف كيف أفحصه` : ''}:`
            : `⚠️ Delivery blocked: ${a.met} of ${a.criteria.length} requested criteria were proven — ${a.unmet} were not proven${gaps ? `, and ${gaps} I did not know how to check` : ''}:`);
    const lines = a.criteria.map(c => {
        //  Two marks, because there are two outcomes he can act on: proven,
        //  or not. WHICH kind of not-proven is in `why`, where it belongs.
        const mark = c.verdict === 'met' ? '✅' : '❌';
        return `   ${mark} ${isAr ? c.ar : c.en} — ${c.why}`;
    });
    return [head, ...lines].join('\n');
}
