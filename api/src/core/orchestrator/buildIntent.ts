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
        || /(?:^|[\s،:؛])(?:بدي|بدى|ودي|ابغي|ابغى|اريد|عايز|عاوز|محتاج|نبي)(?:\s+\S+){0,2}\s+\S*(?:موقع|صفح|تطبيق|متجر|نظام|منص|لوح|واجه|اداه|برنامج|بوابه|خدمه|جدول|قائم)/.test(bare)
        || /\b(?:i\s+(?:want|need)|can\s+you\s+(?:make|build|create)|could\s+you\s+(?:make|build|create)|please\s+(?:make|build|create))\b(?:\s+\S+){0,3}\s+(?:a|an|the|my)?\s*\S*(?:site|website|page|app|application|system|dashboard|panel|store|shop|portal|tool|tracker|table|list)/i.test(g);
    const noun = /\b(platform|marketplace|storefront|e-?commerce|site|website|page|app|application|software|system|dashboard|panel|console|admin|store|shop|portal|api|backend|tool|service|saas|crm|erp|pos|blog|editor|tracker|game|table|spreadsheet|list|ledger|register)\b/i.test(g)
        || /(موقع|صفحة|تطبيق|متجر|نظام|منصّ?ة|لوحة|واجهة|أداة|اداة|برنامج|بوابة|خدمة|جدول|قائمة|كشف)/.test(bare);
    return verb && noun;
}
