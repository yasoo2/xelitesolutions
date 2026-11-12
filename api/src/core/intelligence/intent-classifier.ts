import { stripArabicDiacritics, normalizeIntentText as canonicalReading, foldChars } from '../orchestrator/promptNormalizer';
import { derivedColumns as readDerivedColumns, columnsAnywhereInHisRequest as readColumnsAnywhere } from '../design/app-blueprints';
import { routeToModel } from '../llm/intelligent-router';
import { hasRequestedAction, unquotedIntentText, stripScopedExclusions, withoutDefiniteVerbalNouns, ordersInALaterSentence, ordersInALaterClause, withoutNegatingMa, LATER_DEED_ORDER, OrderWords, rememberLastReadings } from './requested-action';
import { parseExplicitFileReadRequest } from '../orchestrator/file-intent';
import { BUILD_VERBS, hasArabicBuildVerb, hasArabicOrderVerb, maskNegatedSpans, requestedArtifact as readRequestedArtifact } from '../design/requested-artifact';
import { words } from '../language/arabic';
import { readModelJsonObject } from '../../shared/utils/json';

// One message, read once (rememberLastReadings): the readers below ask these
// pure readers about the same text several times each. Their answers are only
// read here, never changed. Each is looked up when called, so a test that
// holds one constant (jest.spyOn) still reaches it.
const normalizeIntentText = rememberLastReadings((text: string) => canonicalReading(text));
const derivedColumns = rememberLastReadings((text: string) => readDerivedColumns(text));
const columnsAnywhereInHisRequest = rememberLastReadings((text: string) => readColumnsAnywhere(text));
const requestedArtifact = rememberLastReadings((text: string) => readRequestedArtifact(text));

export interface IntentClassification {
    isBuild: boolean;
    isBrowser: boolean;
    isReadOnly: boolean;
    isKnowledgeQuestion: boolean;
    confidence: number;
    reason: string;
    hasExternalWebTarget: boolean;
    at?: number;
}

const RECORDING_VERB_PATTERN = /(?:^|[\s،:؛(])(?:أسجل|سجل|تابع|إدارة|تنظيم|record|track|log|manage|organi[sz]e)(?=$|[\s،:؛)])/iu;
const DESIRE_VERB_PATTERN = /(?:^|[\s،:؛])(?:أريد|أرغب|أحتاج|بدي|بدى|ودي|أبغي|عايز|محتاج|نبي|أبنِي|ابنِ|ابني|ابن|أنشئ|أصنع|أصمم|أطور|أعمل|أبرمج|أبني|أقم|أحب|أرغب|صمم|تصميم)(?=$|[\s،:؛])/iu;
const ENGLISH_DESIRE_PATTERN = /\b(i\s+(?:want|need|would\s+like)|can\s+you\s+(?:make|build|create)|could\s+you\s+(?:make|build|create)|please\s+(?:make|build|create|give\s+me))\b/i;
const ENGLISH_IMPERATIVE_PATTERN = /^\s*(build|create|make|develop|generate|scaffold|implement|code|design|deploy)\b/i;
const CONTAINER_PATTERN = /(موقع|صفحة|تطبيق|متجر|نظام|منص[ةه]|لوحة|واجهة|أداة|اداة|برنامج|بوابة|خدمة|جدول|قائمة|كشف|platform|marketplace|storefront|e-?commerce|site|website|page|app|application|software|system|dashboard|panel|console|admin|store|shop|portal|api|backend|tool|service|saas|crm|erp|pos|blog|editor|tracker|game|table|spreadsheet|list|ledger|register|board|workspace|library|directory|manager|log|desk)/iu;
const RECORDING_INDICATOR = /(?:^|[\s،:؛])(?:فيها|فيه|أعمدة|الحقول|الأعمدة|الأعمده|columns?|fields?)(?=$|[\s،:؛)])/iu;

const URL_PATTERN = /https?:\/\/|\b(?:www\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
const KNOWN_SITE_PATTERN = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|\bx\.com\b|انست[غق]رام|instagram|جيميل|gmail|لينكد\s*ان|linkedin|ريديت|reddit|ويكيبيديا|wikipedia|قوقل|جوجل|google|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok)/i;
/** «مثل يوتيوب», «على غرار أمازون», «like Netflix», «a YouTube clone», «Twitter-style»: the site as a model. */
const SITE_AS_MODEL = new RegExp(String.raw`(?:(?<![\p{L}\p{N}_])(?:مثل|متل|زي|شبيه(?:ة|ه)?|على\s+غرار|بأسلوب|باسلوب|بطريقة|بطريقه|بنمط|نسخة\s+من|نسخه\s+من|مستوحى\s+من)\s+(?:ب|ل)?(?:ال)?|\b(?:like|similar\s+to|inspired\s+by|in\s+the\s+style\s+of|clone\s+of|copy\s+of|modeled\s+on|modelled\s+on)\s+)${KNOWN_SITE_PATTERN.source}|${KNOWN_SITE_PATTERN.source}(?:-(?:style|like|clone)|\s+(?:clone|style|copy))\b`, 'giu');

const STRONG_WEB_VERB = /(تصف[حح]|سج[لّ]\s*(ال)?دخول|تسجيل\s*(ال)?دخول|ادخل\s*(على|الى|إلى|ل|حساب|موقع)|اذهب\s*(الى|إلى|ل)|ابحث|دو[رّ]\s*(لي\s*)?عن|open\s*(the\s*)?browser|browse\b|visit\b|go\s*to\b|log\s*-?\s*in|sign\s*-?\s*in|search\b)/i;
/**
 * «خطأ تسجيل الدخول», «صفحة تسجيل الدخول», "the login bug", "the login page":
 * the login FEATURE of his app, a noun in a phrase — not an order to sign in
 * somewhere. «أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد» went to the browser.
 */
const LOGIN_FEATURE = /(?:خط[أا]|اخطاء|أخطاء|مشكل[ةه]|مشاكل|صفح[ةه]|شاش[ةه]|زر|نموذج|فورم|ميز[ةه]|خاصي[ةه]|نظام|واجه[ةه]|عملي[ةه]|قسم|بيانات|كود|منطق)\s+(?:ال)?تسجيل\s*(?:ال)?دخول|\blog[\s-]?in\s+(?:bug|page|screen|form|button|flow|feature|issue|error|problem|system|endpoint|api|logic|code|route|validation)s?\b|\b(?:the|a|my|our|its|his)\s+(?:log[\s-]?in|sign[\s-]?in)\b(?!\s+(?:to|into|with|as|using)\b)/giu;
//  «صف» is «describe» — but never the first letters of «صفحة»: the page he names was both the
//  verb and the noun of this reader, so «الصفحة ما تفتح صلحها» and «أنا ما أبي صفحة جديدة»
//  were orders to browse the moment they stopped being read as questions.
const WEAK_WEB_VERB = /(افتح|انظر|صِ?ف(?!ح)|وصف|لخ[صص]|ترجم|انقر|استخرج|open\b|describe|summari|translate|click|extract)/i;
//  What that accident was carrying, said outright: reading, entering, going to, scrolling and
//  closing A PAGE are the browser's («اقرأ الصفحة», «ادخل الصفحة», «انزل لآخر الصفحة»). Only with
//  a page — «اقرأ كود الموقع» reads his code. Fixing, changing or complaining about a page
//  («صلح الصفحة», «الصفحة ما تفتح») is not browsing it.
const PAGE_BROWSING_VERB = /(اقر[أا]|ادخل|اذهب|انتقل|انزل|اصعد|مر[رّ]|اغلق)/;
const A_PAGE = /صفح[ةه]|صفحات/;
const WEB_NOUN = /(متصفح|موقع|صفحة|رابط|الويب|browser|site|page|link|web)/i;
const UI_INTERACTION_VERB = /(اضغط|انقر|اختر|اكتب|أدخل|مر[رّ]|انزل|عب[ئئ]|املأ|حد[دّ])/i;
const UI_NOUN = /(زر|الزر|حقل|الحقل|خانة|القائمة|قائمة|رابط|مربع|صندوق|التبويب|button|field|link|menu|dropdown|checkbox|tab|box|input)/i;

/**
 * A question word asks only where it is one. «الزر ما بيشتغل، صلحه» negates,
 * «بعد ما تخلص» relates (withoutNegatingMa, requested-action.ts); and the «أي»
 * of an exclusion is «any», not «which» — «غيّر العنوان ولا تعدل أي ملف آخر» was
 * answered as a question about files. Both are read out before the question
 * words are looked for. The dialects' «why» («ليش», «ليه») asks as «لماذا»
 * does: «ليش الزر ما بيشتغل» was a question only through its «ما».
 */
const withoutWhatAsksNothing = rememberLastReadings((raw: string) => withoutNegatingMa(stripScopedExclusions(raw)));
function isKnowledgeQuestionPattern(raw: string): boolean {
    const text = withoutWhatAsksNothing(raw);
    return /(?:^|[\s،:؛])(?:ما|ماذا|لماذا|ليش|ليه|لويش|علاش|كيف|متي|اين|أين|كم|اي|ايهما|اشرح|صف|قارن|وش\s+معنى|شو\s+معنى|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/i.test(text)
        || /^\s*هل(?=$|[\s،:؛])/i.test(text)
        || /\b(what|why|how|when|which|who|explain|compare|difference|versus|vs|summari[sz]e|describe|translate)\b/i.test(text)
        || /(?:^|[\s،:؛])(?:لخ[ّ]?ص|لخص|ترجم|اشرح|صف)(?=$|[\s،:؛؟])/u.test(text)
        || /[؟?]\s*$/i.test(text);
}

function isReadOnlyPattern(text: string): boolean {
    return /\b(?:read[-\s]?only|readonly|only\s+(?:read|inspect|analy[sz]e|review|verify)|without\s+(?:changing|modifying|writing|creating|editing)|without\s+(?:making|any)\s+(?:file\s+)?(?:changes?|modifications?)|no\s+(?:file\s+)?(?:changes?|writes?|modifications?))\b/i.test(text)
        || /\b(?:do\s+not|don't|never)\b(?:\s+\w+){0,3}\s+\b(?:create|edit|delete|move|install|commit|write|modify|changes?|build|start|run)\b/i.test(text)
        || /(?:قراءة\s+فقط|للقراءة\s+فقط|(?:من\s+)?دون\s+(?:أي\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف)|بدون\s+(?:أي\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف))/i.test(text);
}

const RESULTATIVE_MAKE_STATE_PATTERN = /\bmake\s+(it|this|that|them)\s+(?:\w+ly\s+)?(available|downloadable|visible|accessible|readable|printable)\b/gi;

/**
 * Classification-only view: masks resultative "make it/this/that/them <state>"
 * (operation/exposure of an existing artifact) so BUILD detection does not
 * borrow that non-construction "make". All other clauses, quoted text,
 * denials and other clauses remain available in this classification view; the shared
 * authority predicate still receives the original request elsewhere. Never passed to tools/models.
 */
function maskResultativeMakeForBuild(raw: string): string {
    return String(raw || '').replace(RESULTATIVE_MAKE_STATE_PATTERN, '$1 $2');
}

const ENGINEERING_VERB_PATTERN = /\b(?:build|create|develop|implement|refactor|repair|debug|test|deploy|code|modify|build\s+out)\b|(?<=(?:^|[^\p{L}\p{N}_])[وف]?)(?:بناء|ابن(?:ِ|ي|ى)|[اأإ]نش(?:ئ|ء|ي)|تطوير|طو[ّ]?ر|برمج|[اأ]ختبر|اختبار|[اأإ]صلح|عد[ّ]?ل|نف[ّ]?ذ|تنفيذ)(?![\p{L}\p{N}_])/iu;
const ENGINEERING_NOUN_PATTERN = /\b(?:repository|repo|codebase|project|system|platform|application|app|api|backend|frontend|database|software|code|tests?)\b|(?<=(?:^|[^\p{L}\p{N}_])[وف]?(?:ال)?)(?:نظام|منص(?:ة|ه)|تطبيق|مشروع|مستودع|كود|برنامج|خادم|قاعد[ةه]\s+(?:ال)?بيانات|واجه[ةه]|اختبار(?:ات)?)(?![\p{L}\p{N}_])/iu;

/**
 * Desire verbs in folded spelling — «أبي», «بدي», «ودي», «أريد» … — and the
 * second-person verbs that turn one into a request to be TOLD something:
 * «أبي تشرح لي كود الموقع» asks for an explanation, «أبي تعدّل صفحة النادي»
 * for an edit (eval round 19: the gate read the first as a build and the
 * talk-only guard replaced the answer with a page build).
 */
const DESIRE_OPENERS = new Set(['اريد', 'ابغي', 'ابغا', 'ابي', 'بدي', 'ودي', 'عايز', 'عاوز', 'محتاج', 'احتاج', 'نبي']);
const TELL_VERBS = new Set(['تشرح', 'تشرحلي', 'تشرحي', 'تفهمني', 'تفهم', 'توضح', 'توضحلي', 'تقول', 'تقولي', 'تخبرني', 'تعلمني', 'تعرفني', 'اعرف', 'افهم', 'اسال', 'اتعلم']);
const DOING_VERBS = new Set(['تبني', 'تسوي', 'تعدل', 'تضيف', 'تصمم', 'تنشي', 'تنشئ', 'تشيل', 'تحط', 'تكتب', 'تطور', 'تعمل', 'تبرمج', 'تغير', 'تصلح', 'تحذف']);

/**
 * A message that OPENS with an Arabic interrogative («كيف …», «هل …») — the
 * dialects' too: «وش أفضل طريقة أسوي جدول…», «ايش الأعمدة…», «شو يعني API»
 * ask as «ما» does (the review: «وش أفضل طريقة…» was built).
 */
function opensWithArabicQuestion(bare: string): boolean {
    // «ما عم يشتغل الزر، صلحه», «ما زال الخطأ موجود»: an opening «ما» that negates asks nothing.
    return /^\s*(?:ما|ماذا|لماذا|ليش|ليه|كيف|متى|اين|أين|كم|ايهما|أيهما|وش|ايش|إيش|شو|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/u.test(withoutNegatingMa(bare))
        || /^\s*هل(?=$|[\s،:؛])/u.test(bare);
}

/**
 * ⛔ «بدي أعرف كم صرفت، اعملي جدول…» WISHES TO KNOW — AND THEN ORDERS THE TABLE.
 *
 * A wish to know that opens the message made the whole of it a question,
 * though the clause after the comma is an order with its object: «عايز أعرف
 * مين اشترى، اعمل صفحة تعرض الطلبات» opened a browser, and the table of «بدي
 * أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة» was never built. The
 * wish says what the thing is for. A wish to know HOW («بدي أعرف كيف أعمل
 * جدول، اكتب لي الخطوات») is still the lesson it asks for.
 */
const HOW_AR = /(?<![\p{L}\p{N}_])[وف]?(?:كيف|كيفي[ةه]|ازاي|إزاي|شلون|اشلون|كيفاش)(?![\p{L}\p{N}_])/u;
function ordersAfterAWishToKnow(bare: string): boolean {
    const [opener = '', second = ''] = words(bare.slice(0, 200));
    return DESIRE_OPENERS.has(opener) && TELL_VERBS.has(second)
        && !HOW_AR.test(bare) && ordersInALaterClause(bare, ORDER_AFTER_A_WISH);
}

/** The shared build and wish verbs, as a later sentence may open with them («كيف حالك؟ ابني لي موقع»). */
const VERBAL_NOUNS_FOLDED = new Set(['بناء', 'انشاء', 'تصميم', 'تطوير', 'عمل'].map(w => foldChars(w)));
const LATER_ARABIC_ORDER: OrderWords = {
    ar: new Set(BUILD_VERBS.flatMap(pair => pair.ar).map(w => foldChars(w)).filter(w => !VERBAL_NOUNS_FOLDED.has(w))),
    en: /(?!)/,
};
/**
 * The orders a clause may open with after a wish to know: the making verbs,
 * and a second wish only with the thing it wishes for («… بدي جدول فيه…»,
 * never «… عايز الجواب بسرعة»). Not the writing verb: «… اكتب لي الجواب»,
 * «… اكتبها في نقاط» shape the answer he asked for.
 */
const ORDER_AFTER_A_WISH: OrderWords = {
    ar: new Set(BUILD_VERBS.filter(pair => pair.concept !== 'write').flatMap(pair => pair.ar).map(w => foldChars(w)).filter(w => !VERBAL_NOUNS_FOLDED.has(w))),
    en: /(?!)/,
    withObject: new Set(BUILD_VERBS.filter(pair => pair.concept === 'want').flatMap(pair => pair.ar).map(w => foldChars(w))),
};

/**
 * ⛔ «EXPLAIN HOW I MAKE A TABLE WITH NAME, SALARY AND DEPARTMENT» IS A LESSON.
 *
 * «اشرح لي كيف أعمل جدول في إكسل فيه الاسم والراتب والقسم», «علمني كيف أسوي
 * جدول فيه الاسم والعمر والجنس», «ابغى اعرف كيف اسوي جدول فيه…», «بدي أفهم
 * كيف أعمل جدول…» were built: the columns were there and «أعمل», «أسوي»,
 * «ابغى» read as asking. A «how» or a verb of telling or knowing BEFORE the
 * thing makes the thing the subject of the lesson; after it («بدي جدول … وبدي
 * أعرف كم قبضت») it is what the thing is for.
 */
//  A verb of knowing counts only with its «how» («ابغى اعرف كيف…»): «عشان أعرف
//  مين دفع، بدي جدول فيه…» says what the table is for.
const HOW_OR_TELL = /(?<![\p{L}\p{N}_])[وف]?(?:كيف|كيفي[ةه]|ازاي|إزاي|شلون|اشلون|كيفاش|اشرح|اشرحلي|علمني|علمنى|وضح|وضحلي|فهمني|فهمنى|(?:[اأ]عرف|[اأ]فهم|[اأ]تعلم|نتعلم)\s+(?:كيف|كيفي[ةه]|ازاي|إزاي|شلون|اشلون|كيفاش))(?![\p{L}\p{N}_])|\bhow\s+(?:to|do|does|did|can|could|should|would|is|are|i|we)\b|\b(?:explain|teach)\b|\b(?:learn|understand|know)\s+how\b(?!\s+(?:much|many)\b)/iu;
const THE_THING = /(?<![\p{L}\p{N}_])[وفب]?(?:ال|لل)?(?:جدول|قائم[ةه]|كشف|سجل|دفتر|كراس[ةه]|نموذج|استمار[ةه]|تطبيق|موقع|نظام|متجر|برنامج|صفح[ةه]|لوح[ةه]|منص[ةه]|قاعد[ةه])|\b(?:table|list|sheet|spreadsheet|form|log|register|ledger|roster|tracker|inventory|database|app|application|site|website|system|store|page|dashboard|program|tool)s?\b/iu;
function asksHowBeforeTheThing(g: string): boolean {
    const bare = stripArabicDiacritics(g);
    const at = bare.search(THE_THING);
    return HOW_OR_TELL.test(at < 0 ? bare : bare.slice(0, at));
}

/**
 * ⛔ «جدول مصاريف فيه التاريخ والمبلغ والتصنيف» NAMES WHAT HE WANTS.
 *
 * A short noun phrase — an indefinite record container and what it holds —
 * is how a man asks for a table: «جدول مصاريف: التاريخ، المبلغ، التصنيف»,
 * «قائمة عملاء فيها الاسم والجوال والمدينة», «A table for expenses with date,
 * amount and category», «Table of expenses: date, amount, category». They were
 * builds before the columns needed an asking signal (de86f9f1d) and fell to a
 * registry guess after it. The container must open the message, be
 * indefinite («الجدول اللي عملته…», "The table I made…" narrate), and its
 * title carry no verb of its own («A table I made yesterday has: …»).
 */
const RECORD_CONTAINER_AR = /^\s*(?:جدول|قائم[ةه]|كشف|سجل|دفتر|كراس[ةه]|كشكول|استمار[ةه]|نموذج)(?![\p{L}\p{N}_])/u;
const RECORD_CONTAINER_EN = /^\s*(?:(?:a|an)\s+)?(?:[a-z-]+\s+){0,2}?(?:table|list|sheet|spreadsheet|log|register|ledger|roster|tracker|inventory|database|directory|form|logbook|catalog(?:ue)?)s?\b/i;
const AR_CONTENTS_INTRODUCER = /[:：]|(?<![\p{L}\p{N}_])(?:فيه|فيها|يحتوي|يحتوى|تحتوي|تحتوى|يضم|تضم|يشمل|تشمل|مع)(?![\p{L}\p{N}_])/u;
const AR_NARRATIVE = /(?<![\p{L}\p{N}_])(?:اللي|الي|الذي|التي|كان|كانت|صار|صارت|عندي|عندنا|قريت|قرأت|شفت|رأيت|حطيت|سجلت|عملت\S*|سويت\S*|سوّيت\S*)(?![\p{L}\p{N}_])/u;
const EN_CONTENTS_INTRODUCER = /[:：]|\b(?:with|containing|including|having|holding|that\s+(?:has|holds|contains)|which\s+(?:has|holds|contains))\b/i;
function opensWithARecordContainer(g: string): boolean {
    const bare = stripArabicDiacritics(g);
    if (RECORD_CONTAINER_AR.test(bare)) {
        const second = bare.trim().split(/[\s،,:：]+/u)[1] || '';
        if (/^ال/u.test(second)) return false;                          // «جدول المصاريف»: that table
        // A title is a few words: its contents begin within the first 120 characters.
        const at = bare.slice(0, 120).search(AR_CONTENTS_INTRODUCER);
        return at > 0 && !AR_NARRATIVE.test(bare.slice(0, at));
    }
    if (RECORD_CONTAINER_EN.test(bare)) {
        const at = bare.slice(0, 120).search(EN_CONTENTS_INTRODUCER);
        return at > 0 && !ENGLISH_FINITE.test(bare.slice(0, at));
    }
    return false;
}

/**
 * «A Flutter app vs a React Native app: performance, size, ecosystem» compares;
 * «تطبيق البنك: بطيء وثقيل…», «موقع الوزارة: بطيء، ويتوقف…» complain about a
 * thing that exists — a container with a definite noun after it («تطبيق
 * البنك») is that bank's app, not one he asks for. Neither is a brief.
 */
const COMPARISON = /\b(?:vs\.?|versus|compared\s+(?:to|with))(?=\s|$)|(?<![\p{L}\p{N}_])(?:مقابل|ضد|مقارن[ةه])(?![\p{L}\p{N}_])/iu;
const EXISTING_THING_AR = /^\s*(?:تطبيق|موقع|نظام|منص[ةه]|متجر|برنامج|صفح[ةه]|لوح[ةه]|خدم[ةه]|بواب[ةه]|جدول|قائم[ةه]|كشف)\s+ال(?!كتروني|إلكتروني|ويب|جوال|موبايل|هاتف|اندرويد|ايفون|آيفون)[\p{L}]{2,}/u;

/** Recording verbs in the form a man uses for HIS OWN recording: «أسجل فيه», «where I record», «to track». */
const RECORDING_ORDER_AR = /(?<![\p{L}\p{N}_])[وف]?(?:[اأ]سجل|نسجل|سجل|[اأ]دون|ندون|[اأ]تابع|نتابع|تابع|[اأ]قيد|نقيد)(?![\p{L}\p{N}_])/u;
const RECORDING_ORDER_EN = /\b(?:i|we)\s+(?:can\s+|could\s+|will\s+|would\s+|want\s+to\s+|need\s+to\s+)?(?:record|track|log|keep\s+track\s+of|note\s+down|write\s+down|manage|organi[sz]e)\b|\bto\s+(?:record|track|log|manage|organi[sz]e|keep\s+track\s+of)\b/i;
/** «الجدول اللي عملته…», «The table I made…», «هذا الموقع»: the opening names a thing that already exists. */
const DEFINITE_OPENING = /^\s*(?:ال[\p{L}]{2,}|هذا|هذه|ذلك|تلك|the|this|that|these|those|my|our)(?![\p{L}\p{N}_])/iu;

/**
 * The request opens by naming a deliverable, with no verb of its own:
 * «A hospital information system: patient records, appointments…»,
 * «نظام فواتير للمحل مع تقارير». The shared object reader already treats the
 * opening noun phrase as the requested artifact; a title is how a brief asks.
 */
function namesADeliverableFirst(g: string): boolean {
    const bare = stripArabicDiacritics(g);
    if (DEFINITE_OPENING.test(bare) || /[؟?]\s*$/u.test(g) || opensWithArabicQuestion(bare)) return false;
    if (COMPARISON.test(bare.split(/[:：]/u)[0] || bare) || EXISTING_THING_AR.test(bare)) return false;
    if (opensWithARecordContainer(g)) return true;
    const artifact = requestedArtifact(g);
    if (artifact.kind && !artifact.evidence.verb) return true;
    // «A stock trading simulator: …», «A Kubernetes-style mini orchestrator: …»
    // — an English title the object lexicon does not read. An indefinite noun
    // phrase naming a piece of software, with no finite verb of its own,
    // closed by the colon that opens its contents. «A table I made yesterday
    // has: …» narrates; «A problem: …», «A quick summary: …» name no software.
    const title = ENGLISH_TITLE.exec(g);
    return !!title && SOFTWARE_HEAD.test(title[1]) && !ENGLISH_FINITE.test(title[1]);
}
const ENGLISH_TITLE = /^\s*an?\s+([^:.!?\n]{2,160}):/i;
const ENGLISH_FINITE = /\b(?:i|we|you|he|she|they|it|is|are|was|were|am|has|have|had|do|does|did|can|could|will|would|should|made|built|wrote|got|broke|keeps?|said|told)\b/i;
const SOFTWARE_HEAD = /\b(?:app|application|site|website|page|platform|marketplace|store|shop|portal|dashboard|panel|console|system|software|tool|service|api|backend|frontend|engine|simulator|suite|client|server|orchestrator|builder|stack|clone|generator|tracker|manager|editor|game|crm|erp|saas|database|bot|extension|plugin|cli)s?\b/i;

/**
 * Does he ask for something — whatever he calls it? A verb of wanting or
 * making of the shared class («بدي», «أريد», «اعمل», «سوّي», «حط»), a
 * recording verb in his own voice («أسجل فيه», «I record»), an English wish
 * or imperative, or a brief whose title is the deliverable itself.
 * Negated spans ask for nothing («لا تبني جدول …»).
 */
function asksForSomething(g: string): boolean {
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(withoutDefiniteVerbalNouns(g));
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    // «أنا ما بدي صفحة جديدة»: a wish that «ما» negates asks for nothing.
    const masked = maskNegatedSpans(withoutNegatingMa(stripArabicDiacritics(probe), true));
    return hasArabicOrderVerb(masked)
        || RECORDING_ORDER_AR.test(masked) || RECORDING_ORDER_EN.test(masked)
        || ENGLISH_DESIRE_PATTERN.test(masked) || ENGLISH_IMPERATIVE_PATTERN.test(maskNegatedSpans(bare))
        || namesADeliverableFirst(g);
}

/**
 * ⛔ A REQUEST THAT ASKS FOR A THING AND SAYS WHAT IT WILL HOLD IS A BUILD,
 * WHATEVER WORDS IT CONTAINS.
 *
 * His clinic brief, verbatim: «عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد:
 * اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث
 * عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.» The «كم» in its
 * last sentence — the total he wants his table to show — made the whole brief
 * an information question, ahead of the five columns it lists, and the planner
 * searched the web for «المريض باسمه أو تلفونه».
 *
 * And the other half (fa810595d made it a build on columns alone): «الجدول
 * اللي عملته أمس فيه: الاسم والسعر والكمية صار بطيء» is a complaint and
 * «قرأت مقالاً فيه: المقدمة والتحليل والخاتمة» a story. Columns make a build
 * only when he asks for something; a request posed as a question («…؟», or
 * opening with «كيف …») is still a question.
 */
export function asksForAThingThatHolds(goalRaw: string): boolean {
    return thingAskedForWithItsContents(goalRaw) !== null;
}
const thingAskedForWithItsContents = rememberLastReadings(readThingAskedFor);
function readThingAskedFor(goalRaw: string): string | null {
    // Harakat are stripped once, here, for every reader below — the column reader too.
    const g = unquotedIntentText(maskResultativeMakeForBuild(stripArabicDiacritics(String(goalRaw || ''))));
    if (!g.trim() || /[؟?]\s*$/u.test(g) || opensWithArabicQuestion(g)) return null;
    if (asksHowBeforeTheThing(g)) return null;
    if (hasRequestedAction(g).hasDenial) return null;
    // Both readings need him to ask (a titled brief asks by its title, which
    // asksForSomething reads), so the column reader — the costliest step,
    // run on every message — is consulted only when he does.
    if (!asksForSomething(g)) return null;
    const columns = derivedColumns(g);
    if (columns && columns.length >= 2) return `asks for a thing and lists ${columns.length} columns`;
    return isTitledBriefWithContents(g) ? 'titled brief + its contents' : null;
}

/**
 * A titled brief that lists what it holds — «منصة توصيل طرود: طلب شحنات،
 * وتخطيط مسارات السائقين، وتتبع لحظي…», «An airline booking engine: flight
 * search …, seat maps …, e-tickets» — asks for that deliverable even when the
 * list is of features rather than columns. Three items at least, and not a
 * fault: «تطبيق المهام: لا يعمل، ويتوقف» opens its list with a negation.
 */
function isTitledBriefWithContents(g: string): boolean {
    if (!namesADeliverableFirst(g)) return false;
    const colon = g.search(/[:：]/u);
    if (colon < 0) return false;
    const list = stripArabicDiacritics(g.slice(colon + 1));
    const items = list.split(/[،,؛;]|\s+و(?=[\p{L}])|\band\b/u).map(s => s.trim()).filter(s => s.length > 1);
    if (items.length < 3) return false;
    // A fault opens with its negation or its symptom («بطيء», "slow"), a set
    // of questions with its question word; a list of what the thing holds
    // does neither.
    return !/^(?:لا|لم|لن|ليس|ليست|مش|مو|ما|ماذا|لماذا|كيف|متى|هل|أين|اين|كم|بطيء|بطيئ[ةه]?|بطئ|ثقيل[ةه]?|معطل[ةه]?|خربان[ةه]?|سيء|سيئ[ةه]?|يعلق|يهنج|مهنج|يتوقف|يقفل|not|no|never|doesn['’]?t|does\s+not|isn['’]?t|is\s+not|can['’]?t|won['’]?t|slow|broken|buggy|laggy|crash(?:es|ing)?|freez(?:es|ing)|what|why|how|when|which|who|where)(?![\p{L}\p{N}_])/iu.test(items[0]);
}

/**
 * ⛔ A DEED NAMED AFTER THE QUESTION IS AN ORDER.
 *
 * «كيف أنشر المشروع؟ انشره الآن» asks how — and then orders it. The
 * question reader saw «كيف» and answered with prose; buildIntent's
 * isKnowledgeQuestion always checked for a deed first. An imperative deed —
 * with its object pronoun («انشره», «احذفه», «صلّحه», «Deploy it») — opening a
 * sentence after the question mark wins over the question before it. A
 * request to explain («اشرحه», «Explain it») or to shape the answer («اكتبها
 * في ثلاث نقاط», «Write two sentences») is still the answer, and so is a
 * second question, a deed word inside a sentence, or a word that is also a
 * noun without its object (ordersInALaterSentence, requested-action.ts).
 */
function ordersADeedAfterTheQuestion(g: string): boolean {
    return ordersInALaterSentence(g, LATER_DEED_ORDER);
}

type BuildStructure = { isBuild: boolean; confidence: number; reason: string };
const buildStructureOnce = rememberLastReadings(readBuildStructure);
function hasBuildStructure(goalRaw: string): BuildStructure {
    return { ...buildStructureOnce(String(goalRaw || '')) };
}
function readBuildStructure(goalRawWithMarks: string): BuildStructure {
    // Harakat and tatweel are not letters: every reader below sees the text without them.
    const goalRaw = stripArabicDiacritics(String(goalRawWithMarks || ''));
    const classificationGoal = maskResultativeMakeForBuild(goalRaw);
    const g = unquotedIntentText(classificationGoal);
    const bare = stripArabicDiacritics(g);
    // «أثبت البناء والتشغيل» names a build; the canonical line must not make it «ابن».
    const normalized = normalizeIntentText(withoutDefiniteVerbalNouns(g));
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);

    // An Arabic information question is answered, not built — unless it asks
    // politely for the work («هل يمكنك تصميم صفحة…؟»). The verbal noun in «هل
    // تصميم موقع جديد مكلف؟» is a topic, not an order (same rule as buildIntent).
    const informationQuestion = opensWithArabicQuestion(bare);
    const politeActionRequest = /(?:^|[\s،:؛])هل\s+(?:يمكنك|تستطيع|تقدر)|(?:^|[\s،:؛])ممكن\s+(?:ان\s+|أن\s+)?(?:تصمم|تصميم|تبني|بناء|تنشئ|انشاء|إنشاء)/u.test(bare);
    // «كيف حالك؟ ابني لي موقع لمطعمي»: a question, then an order. The order
    // after the first sentence still counts — as «How are you? Build me …»
    // always did (eval round 19). A verbal noun after it is still a topic, and
    // so is «ابني» my son: «كيف أربي ابني؟ ابني عنيد جدا» orders nothing.
    const laterOrder = ordersInALaterSentence(bare, LATER_ARABIC_ORDER, true);
    if (informationQuestion && !politeActionRequest && !laterOrder) {
        return { isBuild: false, confidence: 0.9, reason: 'information question' };
    }

    // Delegate to canonical hasRequestedAction predicate
    const requestedAction = hasRequestedAction(classificationGoal);
    if (requestedAction.hasAffirmativeAction) {
        return { isBuild: true, confidence: requestedAction.confidence, reason: requestedAction.reason };
    }
    if (requestedAction.hasDenial) {
        return { isBuild: false, confidence: requestedAction.confidence, reason: requestedAction.reason };
    }

    // A request that OPENS with an Arabic order — «أبي تعدّل صفحة النادي…»,
    // «سوّي لي متجر قهوة» — is an order even when a later clause carries a word
    // the question reader knows: in «ولا تشيل أي قسم», «أي» is «any», not
    // «which» (P14). Not when the order is to know: «أبي أعرف …» is a question.
    // The opening words are read from the opening; the segmenter walks the
    // whole message only when a later word can still decide.
    const opening = words(bare.slice(0, 200));
    const opener = opening[0] || '';
    const second = opening[1] || '';
    // A desire verb that asks to be told something is a question, unless a
    // later word asks for the work itself — or a later clause orders it
    // («بدي أعرف كم صرفت، اعملي جدول…»).
    if (DESIRE_OPENERS.has(opener) && TELL_VERBS.has(second) && !words(bare).slice(2).some(w => DOING_VERBS.has(w)) && !ordersAfterAWishToKnow(bare)) {
        return { isBuild: false, confidence: 0.85, reason: 'information question' };
    }
    // A true imperative («سوّي», «ابن», «اعمل») opens an order with any
    // container. A desire verb opens one only when its own object is a
    // deliverable («بدي موقع …») or the next word is a doing verb («أبي
    // تعدّل …») — a container word elsewhere («… كود الموقع») is the topic.
    // The object reader only when the opening word can make it an order.
    const desireOrder = () => {
        if (DESIRE_OPENERS.has(opener)) {
            if (DOING_VERBS.has(second)) return true;
            const artifact = requestedArtifact(g);
            return !!artifact.kind && artifact.evidence.verb === opener;
        }
        return CONTAINER_PATTERN.test(probe) || !!requestedArtifact(g).kind;
    };
    const opensWithOrder = !/[؟?]\s*$/u.test(g)
        && hasArabicBuildVerb(opener)
        && !TELL_VERBS.has(second)
        && desireOrder();
    if (opensWithOrder) {
        return { isBuild: true, confidence: 0.75, reason: 'opens with an order + container' };
    }

    // Asked for, and its contents listed: a build whatever words it carries —
    // the «كم» of «وبدي أعرف كم قبضت» is a total he wants, not his question.
    const askedWithContents = thingAskedForWithItsContents(goalRaw);
    if (askedWithContents) {
        return { isBuild: true, confidence: 0.9, reason: askedWithContents };
    }

    if (isKnowledgeQuestionStructural(g)) {
        return { isBuild: false, confidence: 0.9, reason: 'information question' };
    }

    const hasRecordingVerb = RECORDING_VERB_PATTERN.test(bareProbe);
    // «أنا ما بدي صفحة جديدة», «الصفحة ما بدي فيها جدول»: the wish «ما» negates is no wish.
    const hasDesireVerb = DESIRE_VERB_PATTERN.test(withoutNegatingMa(bareProbe, true)) || ENGLISH_DESIRE_PATTERN.test(probe) || ENGLISH_IMPERATIVE_PATTERN.test(probe)
        || /^\s*اعمل(?=[\s،:؛])/u.test(bare) // Unaccented leading imperative; questions and negations do not borrow it.
        // The owner writes Gulf and Levantine imperatives — «أبي», «سوّي», «خلّ»,
        // «حط», «شيل», «بنِ» — read from the verb class requestedArtifact uses,
        // so the gate and the object reader agree on what a build verb is.
        || hasArabicBuildVerb(maskNegatedSpans(withoutNegatingMa(bare, true)));
    const hasContainer = CONTAINER_PATTERN.test(probe);
    const hasRecordingIndicator = RECORDING_INDICATOR.test(bareProbe);

    if (hasRecordingVerb && hasContainer && hasRecordingIndicator) {
        return { isBuild: true, confidence: 0.9, reason: 'recording verb + container + field list' };
    }

    // The column reader (the costliest step) only when it can decide something.
    if (hasDesireVerb && hasContainer && columnsAnywhereInHisRequest(g)) {
        return { isBuild: true, confidence: 0.85, reason: 'desire verb + container + describes contents' };
    }

    if (hasDesireVerb && hasContainer && hasRecordingIndicator) {
        return { isBuild: true, confidence: 0.8, reason: 'desire verb + container + field indicator' }
    }

    // Simple build request: desire verb + container (even without explicit column list)
    // e.g., "ابنِ أداة", "create an app", "تصميم موقع" (normalized to صمم)
    if (hasDesireVerb && hasContainer) {
        return { isBuild: true, confidence: 0.7, reason: 'desire verb + container' };
    }
    // The verb's object is a deliverable the shared lexicon knows, in either
    // script: «اعمل لعبة أسئلة» reads like «Make a quiz game» («لعبة» was in no
    // container list).
    if (hasDesireVerb && requestedArtifact(g).kind) {
        return { isBuild: true, confidence: 0.7, reason: 'desire verb + requested artifact' };
    }

    return { isBuild: false, confidence: 0, reason: 'no build structure detected' };
}

function hasBrowserStructure(goalRaw: string): { isBrowser: boolean; confidence: number; reason: string; hasExternalWebTarget: boolean } {
    const g = String(goalRaw || '');
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);

    const hasUrl = URL_PATTERN.test(probe);
    // A site named as the MODEL of what he wants is not a place to go:
    // «منصة محتوى مثل يوتيوب للأطفال», «Build a YouTube clone», «a Twitter-style
    // feed». Only a site he sends Joe to is an external web target.
    const knownSite = KNOWN_SITE_PATTERN.test(probe.replace(SITE_AS_MODEL, ' '));
    const hasExternalWebTarget = hasUrl || knownSite;

    if (hasExternalWebTarget) {
        return { isBrowser: true, confidence: 0.95, reason: hasUrl ? 'explicit URL' : 'known site named', hasExternalWebTarget: true };
    }

    const strongWeb = STRONG_WEB_VERB.test(bareProbe.replace(LOGIN_FEATURE, ' '));
    const weakWeb = WEAK_WEB_VERB.test(bareProbe) || (PAGE_BROWSING_VERB.test(bareProbe) && A_PAGE.test(bareProbe));
    const webNoun = WEB_NOUN.test(bareProbe);
    const interactUi = UI_INTERACTION_VERB.test(bareProbe) && UI_NOUN.test(bareProbe);

    const buildStructure = hasBuildStructure(g);
    if (buildStructure.isBuild && !hasExternalWebTarget) {
        return { isBrowser: false, confidence: buildStructure.confidence, reason: 'build request without external web target', hasExternalWebTarget: false };
    }

    if (strongWeb) {
        return { isBrowser: true, confidence: 0.85, reason: 'strong web verb', hasExternalWebTarget: false };
    }

    if (interactUi) {
        return { isBrowser: true, confidence: 0.9, reason: 'UI interaction on page', hasExternalWebTarget: false };
    }

    if (weakWeb && webNoun) {
        return { isBrowser: true, confidence: 0.75, reason: 'weak web verb + web noun', hasExternalWebTarget: false };
    }

    return { isBrowser: false, confidence: 0, reason: 'no browser structure', hasExternalWebTarget: false };
}

const knowledgeQuestionOnce = rememberLastReadings(readKnowledgeQuestion);
export function isKnowledgeQuestionStructural(goalRaw: string): boolean {
    return knowledgeQuestionOnce(String(goalRaw || ''));
}
function readKnowledgeQuestion(goalRawWithMarks: string): boolean {
    // A complete read/report operation outranks incidental question words in its constraints.
    if (parseExplicitFileReadRequest(goalRawWithMarks)) return false;
    // Harakat and tatweel are not letters: every reader below sees the text without them.
    const goalRaw = stripArabicDiacritics(String(goalRawWithMarks || ''));
    const g = unquotedIntentText(goalRaw);
    const action = hasRequestedAction(g);
    const bare = g;
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    // Reading followed by an operational clause is a mixed request. Nouns
    // such as "test counts" in the reading clause are not execution commands.
    const readingLead = /^(?:\s*please\s+)?\s*(?:summari[sz]e|describe|translate|explain|compare)\b/i.test(bare)
        || /^\s*(?:من\s+فضلك\s+)?(?:لخص|ترجم|اشرح|صف|قارن)(?=$|[\s،:؛؟])/u.test(bare);
    const laterOperation = /(?:[.!?؟;،,:\n]|\b(?:and|then)\b)\s*(?:then\s+)?(?:please\s+)?(?:run|execute|build|create|develop|implement|modify|edit|delete|remove|install|open|save|append|export|overwrite|copy|rename|update|read|inspect|list|browse|search|navigate|click|capture|download|test(?!\s+(?:counts?|results?)\b))\b/i.test(bare)
        || /(?:[.!?؟;،,:\n]|(?:^|\s)(?:ثم|وبعدها|وبعدين))\s*(?:ثم\s+)?(?:من\s+فضلك\s+)?(?:شغل|نفذ|ابن|ابني|انشئ|اكتب|عدل|احذف|افتح|احفظ|انسخ|انقل|اختبر)(?=$|[\s،:؛.!?؟])/u.test(bare);
    if (readingLead && laterOperation) return false;
    // A thing asked for with its contents listed is a request, whatever
    // question word its contents carry; an order after the question wins,
    // and so does an order after a wish to know («بدي أعرف كم واحد اشترى، اعمل
    // صفحة تعرض الطلبات»: the «كم» is what the page is for).
    if (asksForAThingThatHolds(goalRaw) || ordersADeedAfterTheQuestion(g) || ordersAfterAWishToKnow(bare)) return false;

    // A following answer-format instruction must not hide a yes/no question.
    // A later execution command, however, remains an action for normal planning.
    const questionEnd = g.search(/[?؟]/);
    const yesNoLead = /^\s*(?:am|is|are|was|were|do|does|did|has|have|had|can|could|shall|should|will|would|may|might|must)(?:n['’]t)?\b/i.test(g);
    if (yesNoLead && questionEnd >= 0) {
        if (hasRequestedAction(g.slice(0, questionEnd + 1)).hasAffirmativeAction) return false;
        if (/^\s*(?:can|could|would)\s+you\s+(?:please\s+)?(?:run|execute|open|install|delete|remove|save|append|export|overwrite)\b/i.test(g)) return false;
        if (/^\s*do\s+(?:a|an|the|this|that|it)\b/i.test(g)) return false;
        const remainder = g.slice(questionEnd + 1);
        const outputWriteOnly = /^\s*(?:please\s+)?write\s+(?:one|two|three|\d+)\s+(?:\w+\s+)?(?:words?|sentences?)[.!?]?\s*$/i.test(remainder);
        if (action.hasAffirmativeAction && !outputWriteOnly) return false;
        const laterAction = /(?:^|[.!?؟;،,:\n])\s*(?:please\s+)?(?:run|execute|build|create|make|develop|implement|design|code|deploy|generate|scaffold|test|debug|repair|open|install|delete|modify|edit|save|append|export|overwrite|remove|copy|rename|update)\b/i.test(remainder)
            || /(?:^|[.!?؟;،,:\n])\s*(?:من\s+فضلك\s+)?(?:أنشئ|انشئ|احذف|إحذف|اكتب|نفذ|نفّذ|ابن|ابني|صمم|صمّم|احفظ|انسخ|انقل|شغل|شغّل)(?=$|[\s،,:؛.!?؟])/u.test(remainder);
        const laterWrite = !outputWriteOnly && /(?:^|[.!?؟;،,:\n])\s*(?:please\s+)?write\b/i.test(remainder);
        if (laterAction || laterWrite) return false;
        return true;
    }
    if (action.hasAffirmativeAction) return false;
    return isKnowledgeQuestionPattern(bare) || isKnowledgeQuestionPattern(probe);
}

/**
 * ⛔ AN EXCLUSION IS NOT A READ-ONLY BOUNDARY.
 *
 * «طوّر نفس المشروع الحالي دون إنشاء مشروع جديد: أضف شعاراً … وأضف زر …» was
 * read as a read-only audit: «دون إنشاء» matched, every «أضف» after it was
 * ignored, and the planner inspected his project instead of editing it. The
 * same reader took «Create a file … Do not change any other files.» and «Build
 * a calculator. Do not create a database.» for audits. An exclusion of a part
 * (a new project, a database, a page) or of some files is removed first, the
 * same reading hasRequestedAction gives it; a declared «Read only.», «للقراءة
 * فقط» or «Do not modify anything» is still the boundary.
 */
export function isReadOnlyStructural(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    return isReadOnlyPattern(stripScopedExclusions(stripArabicDiacritics(g)));
}

/** Words naming his own workspace: a search there is not a web search. */
//  …and what lives in it, when it is HIS: «ابحث في اللوج عن الخطأ 500», «ابحث عن كل
//  الأخطاء في التطبيق وأصلحها», "Search for TODO comments and list them", "search for
//  the bug and fix it" went to the browser (2026-11-11). A definite or possessive
//  error, log or app is his; «ابحث عن سعر الدولار» names nothing of his and stays the web.
const LOCAL_WORK = new RegExp([
    String.raw`\b(?:files?|folders?|director(?:y|ies)|code(?:base)?|source|repo(?:sitory)?|project|workspace|functions?|classes|modules?|logs?)\b`,
    String.raw`(?<![\p{L}\p{N}_])[وفب]?(?:ال)?(?:ملف|ملفات|مجلد|مجلدات|كود|مشروع|مستودع|مساح[ةه]\s+(?:ال)?عمل|دال[ةه]|سجلات|لوج|لوغ)(?![\p{L}\p{N}_])`,
].join('|'), 'iu');
/*
 * What is probably his — an error, a bug, his app, a TODO comment — unless he names
 * where on the web to look. The second review, 2026-11-12: with these as a hard veto,
 * «ابحث في جوجل عن حل الخطأ ده», "Search Stack Overflow for the error TS2345",
 * «ابحث عن موقعي في جوجل», "search online for the bug in React 18" stopped being web
 * orders. A named venue (Google, the internet, YouTube, a domain) wins over them;
 * bare «comments» and «tests» were dropped — "comments about the new iPhone" and
 * "the test results of the new vaccine" are the world's, not his.
 */
const PROBABLY_HIS = new RegExp([
    String.raw`\b(?:todo|fixme|code|inline)\s+(?:comments?|notes?|items?)\b|\bTODOs\b`,
    //  Not "the site/website": «search the website for…» may be any site.
    String.raw`\b(?:the|my|our|this|its)\s+(?:bugs?|errors?|exceptions?|crash(?:es)?|app|application)\b|\b(?:my|our)\s+(?:site|website|server)\b`,
    String.raw`(?<![\p{L}\p{N}_])[وفب]?ال(?:أخطاء|اخطاء|خطأ|خطا|مشكل[ةه]|مشاكل)(?![\p{L}\p{N}_])`,
    //  «في التطبيق/النظام/البرنامج» is his; «في موقع أمازون» is the web, so a site only as «موقعي».
    String.raw`(?<![\p{L}\p{N}_])(?:في|ب|من)\s*(?:ال)?(?:تطبيق|نظام|برنامج)(?:ي|نا)?(?![\p{L}\p{N}_])`,
    String.raw`(?<![\p{L}\p{N}_])(?:تطبيقي|موقعي|نظامي|برنامجي)(?![\p{L}\p{N}_])`,
].join('|'), 'iu');
/** A place on the web named outright: it wins over every word that might be his ("Search Google for the error 'x is not a function'"). */
const WEB_VENUE_NAMED = new RegExp([
    String.raw`(?<![\p{L}\p{N}_])[وفب]?(?:ال)?(?:جوجل|قوقل|غوغل|[اإ]نترنت|نت|ويب|يوتيوب|تويتر|فيسبوك|[اإ]نستغرام|انستقرام|ويكيبيديا|ريديت|بينج|ستاك\s*[اأ]وفر\s*فلو|متجر\s+(?:جوجل|قوقل|[اأ]بل|التطبيقات)|جوجل\s+بلاي|[اأ]ب\s+ستور)(?![\p{L}\p{N}_])`,
    String.raw`\b(?:google|bing|duckduckgo|online|the\s+(?:web|internet|net)|internet|stack\s*overflow|youtube|twitter|reddit|wikipedia|facebook|instagram|linkedin|github\s+issues|play\s+store|app\s+store)\b`,
].join('|'), 'iu');
/** …or an address: it wins over what is probably his, not over his files and code (a link inside a file search). */
const WEB_ADDRESS = /\bhttps?:\/\/|\b[\w-]+\.(?:com|org|net|io|dev|app|co|ai|sa|ae|jo|eg|uk)\b/iu;
/**
 * ⛔ AN ORDER TO THE BROWSER IS NOT A CAPABILITY GUESS.
 *
 * «ابحث لي عن سعر الدولار اليوم», «ادخل على جيت هاب وشوف آخر إشعارات»,
 * «تصفّح الويب ولخّص لي أول نتيجة» are orders to browse, search or visit the
 * web. The registry matcher, asked first, named browser_find_text, git_ops and
 * browser_page_fix for them — a local git command for his GitHub
 * notifications, and an empty plan for the last. A strong web verb whose
 * object is not his own workspace («ابحث في ملفات المشروع عن TODO» is a file
 * search) addresses the browser, and the browser route answers it.
 */
//  The verbs of STRONG_WEB_VERB without its nouns: «تسجيل الدخول» and "login"
//  name the login FEATURE — «أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد» is
//  a fix to his app, and it went to the browser.
//  "login to my bank account" is the verb, one word or two.
const WEB_ORDER_VERB = /(تصف[حح]|سج[لّ]\s*(?:ال)?دخول|ادخل\s*(?:على|الى|إلى|ل|حساب|موقع)|اذهب\s*(?:الى|إلى|ل)|ابحث|دو[رّ]\s*(?:لي\s*)?عن|open\s*(?:the\s*)?browser|browse\b|visit\b|go\s*to\b|\blog[\s-]?in\s*to\b|\blog\s+in\b|\bsign[\s-]?in\s+(?:to|into)\b|\bsign\s+in\b|search\b)/i;
export function isWebOrder(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);
    if (!WEB_ORDER_VERB.test(bareProbe.replace(LOGIN_FEATURE, ' '))) return false;
    const named = WEB_VENUE_NAMED.test(bareProbe);
    if (LOCAL_WORK.test(bareProbe) && !named) return false;
    //  An upper-case TODO is the code marker; "the best todo apps" are the world's.
    if ((PROBABLY_HIS.test(bareProbe) || /\bTODO\b/u.test(g)) && !named && !WEB_ADDRESS.test(bareProbe)) return false;
    return !hasBuildStructure(g).isBuild;
}

function isEngineeringBriefStructural(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    if (g.length < 240) return false;
    const probe = `${g}\n${normalizeIntentText(g)}`;
    const engVerb = ENGINEERING_VERB_PATTERN.test(probe);
    const engNoun = ENGINEERING_NOUN_PATTERN.test(probe);
    const hasQualifier = /(?:production[- ]grade|from\s+scratch|from\s+beginning|من\s+الألف|من\s+الصفر|حقيقي|كامل|معقّد|complex|autonomous|real\s+working)/i.test(probe);
    return engVerb && engNoun && hasQualifier;
}

let classificationCache = new Map<string, IntentClassification>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

function cacheKey(goal: string): string {
    let hash = 5381;
    for (let i = 0; i < goal.length; i++) hash = ((hash << 5) + hash + goal.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
}

export async function classifyIntent(goalRaw: string): Promise<IntentClassification> {
    const key = cacheKey(goalRaw);
    const cached = classificationCache.get(key);
    if (cached && cached.at && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached;
    }

    const build = hasBuildStructure(goalRaw);
    const browser = hasBrowserStructure(goalRaw);
    const readOnly = isReadOnlyStructural(goalRaw);
    const knowledge = isKnowledgeQuestionStructural(goalRaw);
    const engineering = isEngineeringBriefStructural(goalRaw);

    // Also check requested action for denial/affirmative signals
    const requestedAction = hasRequestedAction(goalRaw);

    let classification: IntentClassification;

    if (engineering && !requestedAction.hasDenial) {
        classification = {
            isBuild: true,
            isBrowser: false,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: 0.9,
            reason: 'engineering brief',
            hasExternalWebTarget: browser.hasExternalWebTarget,
        };
    } else if (requestedAction.hasAffirmativeAction && build.isBuild) {
        // Build request detected via hasRequestedAction (includes polite builds, explain-then-build, etc.)
        classification = {
            isBuild: true,
            isBrowser: browser.hasExternalWebTarget,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: requestedAction.confidence,
            reason: requestedAction.reason,
            hasExternalWebTarget: browser.hasExternalWebTarget,
        };
    } else if (requestedAction.hasDenial) {
        // Explicit denial (answer-only, no file changes, read-only)
        if (requestedAction.isAnswerOnly || requestedAction.isNoFileChanges) {
            classification = {
                isBuild: false,
                isBrowser: false,
                isReadOnly: false,
                isKnowledgeQuestion: true, // Route to central_answer for answer-only
                confidence: requestedAction.confidence,
                reason: requestedAction.reason,
                hasExternalWebTarget: false,
            };
        } else {
            classification = {
                isBuild: false,
                isBrowser: false,
                isReadOnly: true,
                isKnowledgeQuestion: false,
                confidence: requestedAction.confidence,
                reason: requestedAction.reason,
                hasExternalWebTarget: false,
            };
        }
    } else if (readOnly) {
        classification = {
            isBuild: false,
            isBrowser: false,
            isReadOnly: true,
            isKnowledgeQuestion: false,
            confidence: 0.9,
            reason: 'explicit read-only request',
            hasExternalWebTarget: false,
        };
    } else if (knowledge) {
        classification = {
            isBuild: false,
            isBrowser: false,
            isReadOnly: false,
            isKnowledgeQuestion: true,
            confidence: 0.9,
            reason: 'knowledge question',
            hasExternalWebTarget: false,
        };
    } else if (build.isBuild) {
        classification = {
            isBuild: true,
            isBrowser: browser.hasExternalWebTarget,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: build.confidence,
            reason: build.reason,
            hasExternalWebTarget: browser.hasExternalWebTarget,
        };
    } else if (browser.isBrowser) {
        classification = {
            isBuild: false,
            isBrowser: true,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: browser.confidence,
            reason: browser.reason,
            hasExternalWebTarget: browser.hasExternalWebTarget,
        };
    } else {
        classification = {
            isBuild: false,
            isBrowser: false,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: 0.3,
            reason: 'ambiguous - needs LLM analysis',
            hasExternalWebTarget: false,
        };
    }

    if (classificationCache.size >= CACHE_MAX) {
        const firstKey = classificationCache.keys().next().value;
        if (firstKey) classificationCache.delete(firstKey);
    }
    classificationCache.set(key, { ...classification, at: Date.now() });

    return classification;
}

export function clearIntentCache(): void {
    classificationCache.clear();
}

export function isBuildRequest(goalRaw: string): { isBuild: boolean; confidence: number; reason: string } {
    return hasBuildStructure(goalRaw);
}

/** Repair admission is separate from new construction and grants no tool authority. */
export function isExistingSoftwareRepairRequest(goalRaw: string): boolean {
    // «أصلِحْ الكود» is «أصلح الكود»: the verb is matched by its letters, not by a listed spelling of its marks.
    const g = unquotedIntentText(stripArabicDiacritics(String(goalRaw || '')));
    if (hasRequestedAction(goalRaw).hasDenial) return false;
    const repairInstruction = /(?:^|[.!?؟;\n])\s*(?:(?:please|can you|could you|would you|من فضلك|هل يمكنك)\s+)?(?:fix|repair|debug|refactor|modify|edit|update|أصلح|اصلح|صلح|عدّل|عدل)\s+/i.test(g);
    const softwareTarget = /\b(?:repository|repo|codebase|code|function|typescript|javascript|python|node(?:\.js)?)\b|(?:^|[\s،:؛.!?؟])(?:الكود|كود|الدالة|دالة|البرمجيات)(?=$|[\s،:؛.!?؟])/i.test(g);
    return repairInstruction && softwareTarget;
}

export function isBrowserRequest(goalRaw: string): { isBrowser: boolean; confidence: number; reason: string; hasExternalWebTarget: boolean } {
    return hasBrowserStructure(goalRaw);
}

export async function classifyIntentWithLLM(goalRaw: string): Promise<IntentClassification> {
    const systemPrompt = `Classify the user's request. Reply ONLY JSON:
{
  "isBuild": boolean,
  "isBrowser": boolean,
  "isReadOnly": boolean,
  "isKnowledgeQuestion": boolean,
  "confidence": 0..1,
  "reason": "string",
  "hasExternalWebTarget": boolean
}

Rules:
- isBuild: user wants to CREATE/BUILD something (app, site, system, tool, table, etc.)
- isBrowser: user wants to BROWSE/VISIT/SEARCH/INTERACT with an EXTERNAL web page/site
- isReadOnly: user explicitly says "read only", "don't change", "inspect only"
- isKnowledgeQuestion: user asks "what/why/how/when" without wanting an action
- hasExternalWebTarget: explicit URL or named site (GitHub, Google, etc.)
- BUILD requests with internal features (search, filter, login) are isBuild=true, isBrowser=false
- BUILD requests that ALSO say "open GitHub" or "visit example.com" are isBuild=true, isBrowser=true

Examples:
- "Build a task app with projects and search" -> isBuild=true, isBrowser=false
- "افتح https://github.com" -> isBuild=false, isBrowser=true, hasExternalWebTarget=true
- "ابني متجر ثم افتح GitHub للمراجعة" -> isBuild=true, isBrowser=true, hasExternalWebTarget=true
- "أريد تصميم موقع شركة" -> isBuild=true, isBrowser=false
- "ما هو أفضل تصميم؟" -> isKnowledgeQuestion=true
- "اقرأ الملفات فقط، لا تغير شيئاً" -> isReadOnly=true`;

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: goalRaw }
        ];
        const responseText = await routeToModel(messages, undefined, undefined, undefined, undefined, undefined, undefined, { purpose: 'internal' });
        // The shared reader (round 22, W7), not a greedy first-to-last brace.
        const parsed: any = readModelJsonObject(String(responseText || ''));
        if (parsed) {
            return {
                isBuild: !!parsed.isBuild,
                isBrowser: !!parsed.isBrowser,
                isReadOnly: !!parsed.isReadOnly,
                isKnowledgeQuestion: !!parsed.isKnowledgeQuestion,
                confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
                reason: String(parsed.reason || 'llm'),
                hasExternalWebTarget: !!parsed.hasExternalWebTarget,
            };
        }
    } catch (e) {
        // fall through to structural
    }

    return classifyIntent(goalRaw);
}
