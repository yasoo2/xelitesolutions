/**
 * A REQUEST THAT DESCRIBES SOMETHING TO BUILD.
 *
 * This test lived inside PlanningEngine, where only the planner could ask it.
 * Then a dental-clinic brief — five columns, a search, a total — was claimed
 * by the browser fast path, because it contained the word «أبحث»: a verb he
 * wanted INSIDE his table, read as a command to Joe. The planner already knew
 * the request was a build; the router that ran first could not ask.
 *
 * So the question moves here, to one place both can ask. Two copies of a
 * regex are two answers to the same question, and one of them is always the
 * stale one.
 */
import { stripArabicDiacritics, foldChars } from './promptNormalizer';
import { derivedColumns, columnsAnywhereInHisRequest } from '../design/app-blueprints';

/**
 * Read-only is a safety boundary, not a weaker form of build intent.
 * Long audit prompts often mention "build" while explicitly forbidding it.
 */
export function isReadOnlyRequest(goalRaw: string): boolean {
    const text = stripArabicDiacritics(String(goalRaw || '')).replace(/\s+/g, ' ').trim();
    if (!text) return false;

    const readOnlySignal = /\b(?:read[-\s]?only|readonly|only\s+(?:read|inspect|analy[sz]e|review|verify)|without\s+(?:changing|modifying|writing|creating|editing)|no\s+(?:file\s+)?(?:changes?|writes?|modifications?))\b/i.test(text)
        // "Do not modify anything" is the natural short form used by the
        // live UI prompt. It must enter the same safety boundary as the more
        // formal "read-only audit" wording.
        || /\b(?:do\s+not|don't|never)\b(?:\s+\w+){0,3}\s+\b(?:create|edit|delete|move|install|commit|write|modify|change|build|start|run)\b/i.test(text)
        || /(?:قراءة\s+فقط|للقراءة\s+فقط|بدون\s+(?:تعديل|كتابة|إنشاء|تغيير|حذف))/i.test(text);
    const prohibitedMutation = /\b(?:do\s+not|don't|never)\b(?:\s+\w+){0,3}\s+\b(?:create|edit|delete|move|install|commit|write|modify|change|build|start|run|publish|deploy)\b/i.test(text)
        || /(?:لا|بدون|عدم)\s+(?:أن\s+)?(?:تنشئ|تعدل|تحذف|تنقل|تثبت|تنشر|تكتب|تبني|تشغل|تغير)/i.test(text);

    // A request can contain both a positive mutation and a scoped negative
    // constraint: "Create A, but do not change any other files." Remove the
    // negated clauses before looking for a positive mutation, otherwise the
    // safety gate mistakes the whole request for a read-only audit.
    const mutationPattern = /\b(?:create|edit|delete|move|install|commit|write|modify|change|build|start|run|publish|deploy)\b/gi;
    let positiveMutation = false;
    let mutationMatch: RegExpExecArray | null;
    while ((mutationMatch = mutationPattern.exec(text)) !== null) {
        const before = text.slice(Math.max(0, mutationMatch.index - 90), mutationMatch.index);
        const after = text.slice(mutationMatch.index + mutationMatch[0].length);
        const negated = /\b(?:do\s+not|don't|never)\b[^.!?\n]{0,90}$/i.test(before);
        const readOnlyCheck = mutationMatch[0].toLowerCase() === 'run'
            && /^\s+(?:(?:the|a|an)\s+)?read[-\s]?only(?:\s+\w+){0,3}\s+(?:checks?|diagnostic)\b/i.test(after);
        if (!negated && !readOnlyCheck) {
            positiveMutation = true;
            break;
        }
    }
    if (!positiveMutation) {
        const arabicMutationPattern = /(?:ينشئ|انشئ|أنشئ|اصنع|عدّل|عدل|احذف|انقل|ثبت|ثبّت|انشر|اكتب|ابن|ابني|شغل|شغّل|غيّر|غير)/gi;
        let arabicMatch: RegExpExecArray | null;
        while ((arabicMatch = arabicMutationPattern.exec(text)) !== null) {
            const before = text.slice(Math.max(0, arabicMatch.index - 70), arabicMatch.index);
            if (!/(?:لا|بدون|عدم)\s+(?:أن\s+)?[^.!؟\n]{0,70}$/i.test(before)) {
                positiveMutation = true;
                break;
            }
        }
    }

    return readOnlySignal && prohibitedMutation && !positiveMutation;
}

/**
 * A bounded diagnostic explicitly asks Joe to execute a safe local check.
 * Keep this separate from the broader read-only boundary: the former needs
 * shell_execute, while the latter routes to workspace inspection.
 */
export function isBoundedTerminalDiagnosticRequest(goalRaw: string): boolean {
    const text = stripArabicDiacritics(String(goalRaw || '')).replace(/\s+/g, ' ').trim();
    if (!text) return false;

    const explicitlyRequestsExecution = /\bshell_execute\b/i.test(text)
        || /(?:\b(?:run|execute|perform)\b[^\n]{0,100}\b(?:local\s+)?(?:diagnostic|check)\b)|(?:\b(?:terminal|shell|command\s*(?:line)?)\b[^\n]{0,120}\b(?:run|execute|perform|check|verify|test)\b)|(?:\b(?:نفذ|شغل|اجري|أجرِ|قم\s+ب(?:إجراء|عمل))\b[^\n]{0,120}(?:طرفي[هة]|terminal|shell|فحص|تحقق|اختبر))/i.test(text);
    const diagnosticSignal = /\b(?:diagnostic|check|verify|test|status|version)\b|(?:فحص|تحقق|اختبر|حالة|إصدار|نسخة)/i.test(text);
    if (!explicitlyRequestsExecution || !diagnosticSignal) return false;

    const mutationPattern = /\b(?:create|edit|delete|move|install|commit|write|modify|change|build|start|run|publish|deploy)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = mutationPattern.exec(text)) !== null) {
        const before = text.slice(Math.max(0, match.index - 90), match.index);
        const after = text.slice(match.index + match[0].length);
        const negated = /\b(?:do\s+not|don't|never|without|no)\b[^.!?\n]{0,90}$/i.test(before);
        const readOnlyRun = match[0].toLowerCase() === 'run'
            && /^\s+(?:(?:the|a|an)\s+)?read[-\s]?only(?:\s+\w+){0,3}\s+(?:checks?|diagnostic)\b/i.test(after);
        if (!negated && !readOnlyRun) return false;
    }
    return true;
}

export function looksLikeBuild(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    /**
     * «بنِ» IS THE SAME VERB AS «ابنِ».
     *
     * His request, verbatim: «بنِ نظاماً لمشتل نباتات: النباتات والموردون
     * والطلبيات». Every noun matched; not one verb did — the list carried
     * «ابن» and «ابني» and nothing for the bare imperative «بنِ», which is
     * how the verb is most often written. So the build gate stayed shut, a
     * planner LLM was asked for a DAG instead, Groq's daily quota was
     * already spent, and a request that needed NO model at all died with
     * «تعذّر الوصول إلى محرّك الذكاء». One missing alef.
     */
    /**
     * …AND A VOWEL MARK IS NOT A WORD BOUNDARY.
     *
     * Asserting Arabic boundaries above was right — a bare substring made
     * «واجهة برمجية» look like the imperative «برمج». But the boundary
     * class `[\s،:؛]` knows nothing of harakat, so `«ابنِ نظاماً»` — the
     * verb followed by a KASRA — failed the lookahead and stopped being a
     * build request at all. Measured: true before the boundaries were
     * added, false after.
     *
     * Adding «ابنِ» beside «ابن» would fix this sentence and no other:
     * «ابنُ», «اِبن» and every form nobody has typed yet are already
     * queuing. Strip the marks once and match the letters — the harakat
     * are decoration on a word, never a break between two.
     */
    const bare = stripArabicDiacritics(g);
    const verb = /\b(build|create|make|develop|generate|scaffold|implement|code)\b/i.test(g)
        // Require verb boundaries in Arabic too. A bare substring made
        // «واجهة برمجية» look like the imperative «برمج»، hijacking
        // analysis → security → API-test workflows as project builds.
        || /(?:^|[\s،:؛])(?:ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو|برمج|شيّ?د|أقم|اقم)(?=$|[\s،:؛])/.test(bare)
        /**
         *  ⛔ AND THE OWNER DOES NOT WRITE IN MSA.
         *
         *  Measured on the reference matrix, P14, from a prompt written the
         *  way he actually writes:
         *
         *      أبي تعدّل صفحة النادي: خلّ العنوان أوضح، وحط زر اشتراك…
         *      ->  Executive Summary: «Add an H1 title · Include alt text»
         *
         *  Four imperatives, none of them MSA, and the page was never
         *  touched. The cause was isolated in one measurement -- the same
         *  request in both registers, everything else identical:
         *
         *      أبي تعدّل صفحة النادي وحط زر…    ->  false
         *      أريد تعديل صفحة النادي ووضع زر…  ->  true
         *
         *  The list above is every-verb-MSA, and this file's own comment
         *  already warned that «a closed list of VERBS is the same defect as
         *  a closed list of nouns». It was extended in one register only.
         *
         *  ⛔ It does not FAIL, it DRIFTS: Joe never said it did not
         *  understand. It built something else and called it done, which is
         *  the one outcome he cannot detect by looking.
         *
         *  The boundaries are not optional. JavaScript defines a word boundary by
         *  [A-Za-z0-9_], so there is no boundary between two Arabic letters
         *  and a bare «حط» matches inside «محطة» and «شيل» inside
         *  «تشييل». Same separator class as the line above, deliberately.
         */
        || /(?:^|[\s،:؛])(?:ابي|أبي|حط|خل|شيل|سوي|سوّي|عمل)(?=$|[\s،:؛])/.test(bare)
        || /(^|\s)بنِ?\s/.test(g)
        || /(?:^|[\s،:؛])بن(?=$|[\s،:؛])/.test(bare)
        /**
         * PEOPLE ASK. THEY DO NOT ISSUE COMMANDS.
         *
         * Every verb above is an imperative — ابنِ, اصنع, اعمل, صمّم, build,
         * create. Measured: «اعمل لي صفحة فيها جدول» → true, and the same
         * request phrased the way its owner actually typed it,
         * «بدي صفحة أسجل فيها كل قطعة …», → FALSE. So did «I want a page
         * where I record every part».
         *
         * A build gate that only hears orders does not hear its user. And
         * because `buildRequest` guards several other routes, one missing
         * dialect let an undo fast-path swallow a whole construction brief.
         *
         * Desire is admitted, but not loosely: the wish has to reach a build
         * noun within two words, so «بدي أعرف شيئاً عن الموقع» stays a
         * question and «بدي صفحة» becomes a build.
         */
        || /(?:^|[\s،:؛])(?:بدي|بدى|ودي|ابغي|ابغى|اريد|أريد|أبغي|أبغى|عايز|عاوز|محتاج|نبي|نبغى)(?:\s+\S+){0,2}\s+\S*(?:موقع|صفح|تطبيق|متجر|نظام|منص|لوح|واجه|اداه|برنامج|بوابه|خدمه|جدول|قائم)/.test(bare)
        || /\b(?:i\s+(?:want|need)|can\s+you\s+(?:make|build|create)|could\s+you\s+(?:make|build|create)|please\s+(?:make|build|create))\b(?:\s+\S+){0,3}\s+(?:a|an|the|my)?\s*\S*(?:site|website|page|app|application|system|dashboard|panel|store|shop|portal|tool|tracker|table|list)/i.test(g);
    const noun = /\b(platform|marketplace|storefront|e-?commerce|site|website|page|app|application|software|system|dashboard|panel|console|admin|store|shop|portal|api|backend|tool|service|saas|crm|erp|pos|blog|editor|tracker|game|table|spreadsheet|list|ledger|register|board|workspace|library|directory|manager|log|desk)\b/i.test(g)
        || /(موقع|صفحة|تطبيق|متجر|نظام|منصّ?ة|لوحة|واجهة|أداة|اداة|برنامج|بوابة|خدمة|جدول|قائمة|كشف)/.test(bare);
    /**
     *  A LIST OF NOUNS IS A CATALOGUE OF WORDS.
     *
     *  He said it plainly: «اصلحت النموذج وليس عقل جو — المره القادمه سوف
     *  يتصرف جو نفس الخطء». He was right. «جدول» was added to this list
     *  because his clinic brief failed on it; «دفتر», «فاتورة», «كرّاسة»,
     *  «سِجِلّ» and every word nobody has typed yet were still queuing behind
     *  it, and each would have cost another live round.
     *
     *  Nouns are open. No list of them is ever finished, and a rule that
     *  needs one is a rule that has to be taught every word in the language.
     *
     *  But the SHAPE of the sentence is finite. When a man asks for a thing
     *  and then says what it will hold — «أسجل فيه: اسم المريض ورقم تلفونه
     *  ووقت الموعد» — he has described a table whatever he calls it. That is
     *  a structural fact about his sentence, readable without knowing a
     *  single noun, and derivedColumns already reads it: it needs a recording
     *  phrase and three to ten listed items, and it returns his own words.
     *
     *  So the list stays for short asks that name a thing without listing its
     *  contents («بدي متجر»), and it stops being the only way in.
     */
    const asking = /(?:^|[\s،:؛])(?:بدي|بدى|ودي|ابغي|ابغى|اريد|أريد|أبغي|أبغى|عايز|عاوز|محتاج|نبي|نبغى)(?=$|[\s،:؛])/.test(bare)
        || /(?:^|[\s،:؛])(?:ابن|ابني|انشئ|اصنع|صمم|طور|اعمل|اصمم|سو|سوي|برمج|جهز)(?=$|[\s،:؛])/.test(bare)
        || /\b(?:i\s+(?:want|need)|can\s+you|could\s+you|please|make\s+me|give\s+me|build\s+me)\b/i.test(g);
    const describesItsContents = !!columnsAnywhereInHisRequest(g);
    return (verb && noun) || (asking && describesItsContents);
}

/**
 *  HE IS ASKING FOR SOMETHING, WHATEVER IT IS.
 *
 *  The asking half of looksLikeBuild, on its own, because more than one
 *  layer needs it. The clarify gate carried its OWN noun list and so did
 *  not recognise «بدي شي أتابع فيه ديوني» as a request to build anything —
 *  so instead of asking him which columns he wanted, Joe improvised a
 *  financial adviser and interrogated him about interest rates and his
 *  monthly income. He had asked for a table.
 */
export function asksForSomething(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    const bare = stripArabicDiacritics(g);
    return /(?:^|[\s،:؛])(?:بدي|بدى|ودي|ابغي|ابغى|اريد|أريد|أبغي|أبغى|عايز|عاوز|محتاج|نبي|نبغى)(?=$|[\s،:؛])/.test(bare)
        || /(?:^|[\s،:؛])(?:ابن|ابني|انشئ|اصنع|صمم|طور|اعمل|اصمم|سو|سوي|برمج|جهز)(?=$|[\s،:؛])/.test(bare)
        || /\b(?:i\s+(?:want|need)|can\s+you|could\s+you|please|make\s+me|give\s+me|build\s+me)\b/i.test(g);
}

/** Does the request itself say what the thing will hold? */
export function describesItsContents(goalRaw: string): boolean {
    return !!columnsAnywhereInHisRequest(String(goalRaw || ''));
}


/**
 *  A VERB HE INVENTED IS STILL A VERB.
 *
 *  Manus attacked the tracking gate with «بدي أفهرس ديوني» and was right: a
 *  closed list of VERBS is the same defect as a closed list of nouns, one coat
 *  further in. «أفهرس» is ordinary Arabic; it was simply not on the list.
 *
 *  The obvious repair — any word starting أ/ا/ي/ت is a verb — is worse than
 *  the defect. A word beginning with «ا» is far more often a NOUN in his
 *  sentences, starting with the definite article: «الاسم», «الكمية»,
 *  «التاريخ» — every column he ever names. That rule would interrogate him
 *  about columns for «بدي الاسم والمبلغ».
 *
 *  What makes «أفهرس ديوني» a tracking request is not the verb alone. It is a
 *  verb followed by SOMETHING HE SAYS IS HIS — and Arabic marks that with a
 *  possessive suffix, which is a closed class: «ـي» in ديوني، شحناتي، نوقي,
 *  «ـنا», or he says «فيه/فيها». English says «my».
 *
 *  Verb shape AND owned object. Either alone is noise.
 */
const ARABIC_LETTER = '[\u0621-\u064a]';
const VERB_SHAPED = new RegExp(
    //  Present tense opens with أ/ن/ي/ت — and never with the article «ال».
    `(?:^|[\\\s،:؛])(?!ال)[أاينت]${ARABIC_LETTER}{2,9}(?=$|[\\\s،:؛])`, 'u');
const OWNED_OBJECT = new RegExp(
    `(?:^|[\\s،:؛])(?:فيه|فيها|${ARABIC_LETTER}{3,12}(?:ي|نا|اتي|اتنا))(?=$|[\\s،:؛.])|\\bmy\\b`, 'u');
/**
 *  …AND FOR A VERB WE ONLY INFERRED, «فيه» IS NOT ENOUGH.
 *
 *  «بدي تطبيق فيه بحث وتصفية» reads as verb-plus-object under the shape rule,
 *  because «تطبيق» opens with «ت» like a present-tense verb and «فيه» follows
 *  it. But «فيه» is evidence of CONTAINMENT — an app that HAS search — not of
 *  his ownership. Only the possessive suffix proves the thing is his, and
 *  that is the whole warrant for trusting a verb nobody listed.
 */
const POSSESSIVE_OBJECT = new RegExp(
    `(?:^|[\\s،:؛])${ARABIC_LETTER}{3,12}(?:ي|نا|اتي|اتنا)(?=$|[\\s،:؛.])|\\bmy\\b`, 'u');

/**
 * Does the request name something he keeps track of — with a verb we know, or
 * with one he invented? The object has to be his either way.
 */
export function tracksSomethingOfHis(goalRaw: string, knownVerbs: RegExp): boolean {
    return trackingVerbAt(goalRaw, knownVerbs) !== null;
}

/**
 * Where the tracking verb is, so the caller can read what follows it. One
 * definition for «is this tracking?» and «what is being tracked?» — asking the
 * same question in two places is how they drift apart.
 */
export function trackingVerbAt(goalRaw: string, knownVerbs: RegExp): { index: number; length: number } | null {
    const bare = stripArabicDiacritics(String(goalRaw || ''));
    const known = knownVerbs.exec(bare);
    if (known) return { index: known.index, length: known[0].length };
    /**
     *  THE OBJECT HAS TO FOLLOW THE VERB, NOT MERELY EXIST.
     *
     *  Measured on «ابنِ تطبيقاً لإدارة العملاء مع بحث وتصفية وإجمالي»: the
     *  sentence ends in «إجمالي», which carries the same «ـي» as «ديوني» —
     *  and it is not a possessive at all, it is a nisba adjective. Anywhere in
     *  the sentence was enough, so a CRM request was asked what it wanted to
     *  record for each «ِ تطبيقاً».
     *
     *  A man who says «أفهرس ديوني» puts the thing right after the verb. That
     *  is where it has to be looked for — position is the evidence, and it
     *  costs no vocabulary.
     */
    const re = new RegExp(VERB_SHAPED.source, 'gu');
    for (let m = re.exec(bare); m; m = re.exec(bare)) {
        const lead = m[0].length - m[0].replace(/^[\s،:؛]+/u, '').length;
        const index = m.index + lead;
        const length = m[0].length - lead;
        //  The IMMEDIATELY following word, not a window: «تطبيق فيه بحث
        //  وتصفية وإجمالي» ends in a nisba «إجمالي» that would qualify from
        //  four words away. He puts the thing he owns right after the verb.
        const next = (bare.slice(index + length).trim().split(/[\s،:؛.]+/u)[0] || '');
        if (next && POSSESSIVE_OBJECT.test(' ' + next)) return { index, length };
    }
    return null;
}
