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
import { derivedColumns, type DerivedField } from '../design/app-blueprints';
import fs from 'fs';
import path from 'path';
import { thePagesHeNamed } from '../design/site-plan';

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
    /** True only when every asked-for criterion is met. */
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
        asked: /(بحث|ابحث|\bsearch\b)/iu,
        ar: 'بحث داخل البيانات', en: 'search across the data',
        markers: [/type=["']search["']/i, /\bsearch\b/i, /بحث/u, /filter\(/],
    },
    {
        id: 'filter', kind: 'feature',
        asked: /(مرشّ?ح|فلتر|تصفية|\bfilter\b)/iu,
        ar: 'مُرشّح حالة', en: 'a status filter',
        markers: [/status/i, /الحالة/u, /<select/i],
    },
    {
        id: 'counter', kind: 'feature',
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
        asked: /(زر|أزرار|\bbutton\b|\bcta\b|call[- ]?to[- ]?action)/iu,
        ar: 'زر تفاعلي', en: 'an interactive button',
        markers: [],
    },
    {
        id: 'title', kind: 'feature',
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
    const t = String(request || '');
    const catalogue = CATALOGUE.filter(c => requestAsksFor(c.asked, t))
        .map(({ asked, ...rest }) => rest)
        .map(c => c.id === 'title'
            ? { ...c, expectedText: titleTextFrom(t) }
        : c);

    //  His columns, in his words, each one its own criterion. No catalogue
    //  is consulted: derivedColumns reads them from the sentence he wrote.
    const columns = derivedColumns(t) || [];

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
    const pages = named.length >= 2 ? named : [];

    return [
        ...catalogue,
        ...pages.map((p: { slug: string; title: string }) => ({
            id: `page:${p.slug}`,
            kind: 'feature' as CriterionKind,
            ar: `صفحة «${p.title}» موجودة وتحمل اسمها`,
            en: `a page «${p.title}» exists and carries its name`,
            expectedPage: { slug: p.slug, title: p.title },
        })),
        ...columns.map((col: DerivedField) => ({
            id: `column:${col.key}`,
            kind: 'feature' as CriterionKind,
            ar: `عمود «${col.label}» موجود في الجدول`,
            en: `a column «${col.label}» exists in the table`,
            expectedColumn: col.label,
        })),
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
    const foldedAndShown = foldedTotalBindings(src).some(name => {
        const n = escapeRegExp(name);
        // …and the same name reaches the page: {total} or {total.toLocaleString()}
        const shown = new RegExp('[{]' + BS + 's*' + n + '(?:' + BS + '.[A-Za-z_$][' + BS + 'w$]*' + BS + 's*' + BS + '([^)]*' + BS + '))?' + BS + 's*[}]', 'u');
        return shown.test(src);
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

        if (c.expectedColumn) {
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
    const unmet = judged.filter(c => c.verdict === 'unmet').length;
    return { criteria: judged, met, unmet, accepted: judged.length > 0 && unmet === 0 };
}

/**
 * The ledger, for the delivery message.
 *
 * Printed whenever the brief asked for anything at all — a clean ledger is
 * worth as much as a dirty one, because it is what makes the dirty one
 * believable.
 */
export function acceptanceBlock(a: Acceptance, isAr: boolean): string {
    if (!a.criteria.length) {
        return isAr
            ? '⚠️ لم أستخرج معياراً قابلاً للفحص من طلبك، لذلك لم أصدر حكم قبول.'
            : '⚠️ I could not derive a checkable criterion from your request, so I did not issue an acceptance judgment.';
    }
    const head = a.accepted
        ? (isAr
            ? `✅ حكم القبول الجزئي: أثبتُّ ${a.met} مما أعرف كيف أثبته — ولم أفحص بقية نص طلبك.`
            : `✅ Partial acceptance: I proved ${a.met} of what I know how to prove — I did not inspect the rest of your request.`)
        : (isAr
            ? `⚠️ حكم القبول الجزئي: أثبتُّ ${a.met} مما أعرف كيف أثبته — و${a.unmet} مما أعرف كيف أثبته لم أُثبته، ولم أفحص بقية نص طلبك:`
            : `⚠️ Partial acceptance: I proved ${a.met} things I know how to prove — ${a.unmet} things I know how to prove were not proven, and I did not inspect the rest of your request:`);
    const lines = a.criteria.map(c => {
        const mark = c.verdict === 'met' ? '✅' : c.verdict === 'unmet' ? '❌' : '⏭️';
        return `   ${mark} ${isAr ? c.ar : c.en} — ${c.why}`;
    });
    return [head, ...lines].join('\n');
}
