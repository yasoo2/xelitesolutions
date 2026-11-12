import { stripArabicDiacritics, normalizeIntentText, foldChars } from '../orchestrator/promptNormalizer';
import { columnsAnywhereInHisRequest } from '../design/app-blueprints';
import { hasArabicOrderVerb, maskNegatedSpans } from '../design/requested-artifact';

// Boundary patterns that work for both English and Arabic
const START_BOUNDARY = '(?:^|[\\s،:؛.!?])';
const END_BOUNDARY = '(?:$|[\\s،:؛.!?])';

// ANSWER_ONLY patterns - check for explicit answer-only / no-execution contracts
// Note: These match global execution denials (without building, no build, do not build, etc.)
// File-only constraints (do not create files, without file changes) are handled by NO_FILE_CHANGES pattern
// Negative lookahead ensures we don't match create/change/write in file-only contexts (files, file changes, file)
const ANSWER_ONLY_EN = `(?:answer\\s+only|answer\\-only|only\\s+answer|without\\s+(?:executing|running|building|creating|implementing|generating|writing|changing|modifying|building|generating|writing)(?!\\s+(?:files?|file\\s+changes?|file|water|data|code|tests?|scripts?|apps?|systems?))|no\\s+(?:execution|build|implementation|creation|generation|writing)\\b|do\\s+not\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|don't\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|explain\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|describe\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|without\\s+(?:building|creating|implementing|generating|writing))`;
// Arabic ANSWER_ONLY: الرد فقط / إجابة فقط / دون تنفيذ / لا تنفيذ / لا بناء / لا تنشئ / لا تكتب / اشرح دون بناء / صف دون بناء / دون بناء / اشرح فقط
const ANSWER_ONLY_AR = `(?:الرد\\s+فقط|إجابة\\s+فقط|بدون\\s+تنفيذ|لا\\s+تنفيذ|لا\\s+بناء|لا\\s+تنشئ|لا\\s+تكتب|اشرح\\s+دون\\s+بناء|صف\\s+دون\\s+بناء|دون\\s+بناء|اشرح\\s+فقط)`;
// Use START_BOUNDARY but not END_BOUNDARY for denial phrases, as they can appear mid-sentence
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY}(?:${ANSWER_ONLY_EN}|${ANSWER_ONLY_AR})`, 'i');

// NO_FILE_CHANGES patterns
// A denial with no object to qualify: «no file changes», «without making any changes».
const NO_FILE_CHANGES_UNQUALIFIED_EN = `(?:no\\s+file\\s+changes?|without\\s+file\\s+changes?|without\\s+(?:creating|writing|modifying|editing|making)\\s+(?:any\\s+)?(?:file\\s+)?changes?)`;
const NO_FILE_CHANGES_UNQUALIFIED = new RegExp(`${START_BOUNDARY}${NO_FILE_CHANGES_UNQUALIFIED_EN}`, 'i');
//  «Without changing any files, review the project», «Review the repo without changing anything»: the
//  same denial said with «without». It was no file denial at all, so the «without changing» in it was
//  taken for «answer only» and the review he ordered was answered from nothing. A word that narrows
//  the object («any other files», «anything else») keeps it out, as it does for «do not».
const WITHOUT_FILE_CHANGES_EN = /(?:^|[\s،:؛.!?])without\s+(?:creating|writing|modifying|editing|changing|touching|altering)(?:\s+or\s+[a-z]+ing)?\s+(?:(?:any\s+of\s+(?:the|my|our)|any|the|my|our|a\s+single)\s+)?(?:(?:project|existing|current|source|code)\s+)?files?\b(?!\s+(?:else|other\s+than|except|but|besides|outside))/i;
/*
 * ⛔ «MOVE THE BUTTON WITHOUT TOUCHING ANYTHING» ORDERS THE MOVE.
 *
 * The fifth pre-merge review (2026-11-12): "Move the button to the left without touching
 * anything" was answered with words once «touching» and «anything» were read as the file
 * denial above; and in every tree "Fix the typo without changing the layout", "Without
 * changing anything else, fix the header", "Can you make the button blue without changing
 * anything else?", "Add dark mode without changing any files except style.css" were
 * «answer only» — the bare «without changing» was a refusal to execute wherever it stood.
 *
 * «Without changing X» beside an order to change his work says what the change must leave
 * alone: an exclusion, like «without creating a database». It denies only
 *  - when X is the files themselves or the code ("any files", "the files", "the code"):
 *    the file denial above, with everything that already follows from it;
 *  - when nothing is ordered beside it, or what is ordered only reads or runs — review,
 *    inspect, analyze, check, run, show… («Review the repo without changing anything» is
 *    the read-only inspection, «Explain the header without changing anything» an answer).
 * Orders that change are an open class; the verbs that only read or run are the small
 * closed one, so every other order keeps its exclusion and is carried out.
 */
const WITHOUT_CHANGING_EN = /\bwithout\s+(?:creating|writing|changing|modifying|editing|touching|altering|affecting|breaking|rewriting|removing|deleting|moving|messing\s+(?:up|with))(?:\s+or\s+[a-z]+ing)?\s+(?:[^.;!?\n,،:]|\.(?=\S)){1,80}?(?=$|[;!?\n,،:]|\.(?:\s|$)|\s+(?:and|then|but)\s)/gi;
const WITHOUT_CHANGING_THE_CODE_EN = /^without\s+[a-z]+(?:\s+(?:up|with))?(?:\s+or\s+[a-z]+ing)?\s+(?:(?:any\s+of\s+(?:the|my|our)|any|the|my|our)\s+)?(?:(?:project|existing|current|source)\s+)?(?:code|codebase|source)\b/i;
/*
 * ⛔ …BUT «WITHOUT CHANGING ANYTHING» BESIDE WORDS IS STILL A DENIAL.
 *
 * The sixth pre-merge review (2026-11-12): with every order that is not a reading taken
 * for a change, the denial was dropped wherever the request was for words this reader
 * had no verb for — and the request was BUILT, or handed to a tool:
 *
 *     Evaluate the design without changing anything          → the build pipeline
 *     I want your opinion on the footer without changing anything
 *     A code review please, without changing anything
 *     Is the build ok? Check without changing anything
 *     Document the API without changing anything             → a project plan
 *     Do a security audit without modifying anything         → the dependency audit
 *
 * What asks for words is an open class too. So which side is open depends on what the
 * phrase keeps:
 *  - EVERYTHING — a bare «anything», «a thing», with no «else», no «except X», no «in /
 *    about X» of one part: a denial of every change, whatever stands beside it, unless
 *    its sentence opens with one of the CLOSED verbs that change his work (fix, move,
 *    add, remove, rename, translate, refactor, deploy…) or makes a thing built in files
 *    («Build a todo app…»). An unknown head is denied: a missed order costs him an
 *    answer in words, a missed denial changes the files he said to leave alone;
 *  - ONE THING («the layout», «anything else», «any files except style.css», «anything
 *    about its behavior») — the exclusion it was, unless its sentence only reads, runs
 *    or asks for words or a judgement.
 * The head read is the head of the phrase's OWN sentence («Is the build ok? Check
 * without…» is governed by «Check»), from the four hundred characters on each side.
 *
 * And the same in Arabic for the one thing: «كبر الخط دون تغيير الألوان», «غير لون الزر
 * بدون تغيير الخط» were a declared read-only request — «دون تغيير» is the boundary's word
 * wherever it stands — and the change was never made. «بدون تعديل أي ملف / الكود /
 * المشروع / أي شيء», or with nothing named, stays the denial it was.
 */
const BEFORE_THE_ORDER = /^(?:[\s.،,;:؛!؟?«»"'()-]|(?:please|pls|kindly|just|now|then|and|also|so|first|ok|okay|hey|hi|joe|let['’]?s|go\s+ahead\s+and|(?:can|could|would|will)\s+you|you\s+(?:can|could|should|may)|(?:i|we)\s+(?:want|need)\s+(?:you\s+)?to|(?:i|we)(?:\s+would|['’]d)\s+like\s+(?:you\s+)?to|من\s+فضلك|لو\s+سمحت|رجاء|ممكن|بليز|ثم|بعدين|[أا]ولا|يا\s+جو|جو|طيب|يلا)(?![\p{L}\p{N}_]))*/iu;
const READS_OR_RUNS_EN = /^(?:review|inspect|audit|examine|check|analy[sz]e|explore|scan|read|look|see|view|show|list|display|print|find|search|locate|count|measure|verify|validate|confirm|test|run|start|launch|execute|open|diagnose|investigate|study|trace|watch|monitor|compare|report|identify|detect|preview|give\s+me|let\s+me\s+know)\b/i;
const READS_AR = /^[وف]?(?:[اإأ]فحص|تفحص|راجع|دقق|استكشف|حلل|عاين|تفقد|تحقق|ت[أا]كد|[اإأ]طلع|[اأ]عرض|[اأ]سرد|[اإ]قر[أا]|قيم|شوف|شف|وري?|فرج|شغل|نفذ|اختبر|جرب|عطني|[اأ]عطني|هات)(?:لي|ني|نا|ي)?(?![\p{L}\p{N}_])|^(?:ما\s+)?ر[أا]يك(?![\p{L}\p{N}_])/u;
/** What asks for a judgement, an opinion or advice — words, whatever it is asked about. */
const ASKS_FOR_A_JUDGEMENT_EN = /^(?:evaluate|assess|rate|critique|judge|comment\s+on|estimate|think|consider|recommend|advise|reproduce|benchmark|profile|know|wonder|help\s+me\s+(?:pick|choose|decide|understand|see)|(?:only|just)\s+look|(?:take|have)\s+a\s+look|(?:(?:i|we)\s+(?:want|need|would\s+like|['’]d\s+like)\s+|need\s+|give\s+me\s+)?(?:your|an?|some|one|another)\s+(?:(?:quick|honest|second|short|brief|code|design|security)\s+){0,2}(?:opinion|thoughts?|feedback|advice|take|view|review|assessment|audit|question|estimate|recommendation|suggestions?)\b|(?:quick\s+)?question\b)\b/i;
export function asksForAJudgement(head: string): boolean {
    return ASKS_FOR_A_JUDGEMENT_EN.test(head);
}
/** The CLOSED verbs that change his work: beside one of them, «without changing anything» says what the change leaves alone. */
const CHANGES_HIS_WORK_EN = /^(?:fix|repair|correct|patch|move|shift|add|insert|append|remove|delete|drop|rename|translate|locali[sz]e|refactor|restructure|reorgani[sz]e|reorder|rearrange|update|change|modify|edit|alter|adjust|tweak|replace|swap|resize|restyle|recolou?r|redesign|rewrite|rework|redo|revert|undo|restore|deploy|redeploy|publish|ship|install|uninstall|upgrade|downgrade|bump|clean(?:\s+up)?|cleanup|tidy(?:\s+up)?|format|reformat|lint|prettify|polish|improve|enhance|optimi[sz]e|simplify|shorten|enlarge|shrink|increase|decrease|reduce|cent(?:er|re)|align|hide|enable|disable|convert|migrate|merge|split|extract|implement|apply|set|put|turn|switch|get\s+rid\s+of|speed\s+up|make\s+(?:it|this|that|them|these|those|the|my|our|its|all|every|each)\b)\b/i;
const CHANGES_HIS_WORK_AR = /^[وف]?(?:[اأإ]?صلح|صحح|عدل|غير|بدل|حرك|[اأ]نقل|[اأإ]ضف|ضيف|زيد|[اإ]حذف|شيل|امسح|سمي?|ترجم|حسن|حدث|استبدل|كبر|صغر|لون|[اأ]نشر|ثبت|رتب|نظف|نسق|خلي?|اجعل|حط|ضع)(?:ي|ه|ها|هم|و|لي)?(?![\p{L}\p{N}_])/u;
const MAKES_A_THING_EN = /^(?:build|create|make|generate|design|scaffold|write|develop|code)\b/i;
function changesHisWork(head: string): boolean {
    return CHANGES_HIS_WORK_EN.test(head) || CHANGES_HIS_WORK_AR.test(head) || (MAKES_A_THING_EN.test(head) && makesAThingBuiltInFiles(head.slice(0, 200)));
}
function onlyReadsOrAsks(head: string): boolean {
    return asksForWordsOnly(head) || READS_OR_RUNS_EN.test(head) || ASKS_FOR_A_JUDGEMENT_EN.test(head) || READS_AR.test(head);
}
/** Every «without changing X», one at a time. */
const EACH_WITHOUT_CHANGING_EN = new RegExp(WITHOUT_CHANGING_EN.source, 'gi');
/** «without changing anything», «without touching a thing» — and «… in the project», which is all of it. */
const KEEPS_EVERYTHING_EN = /^without\s+(?:creating|writing|modifying|editing|changing|touching|altering)(?:\s+or\s+[a-z]+ing)?\s+(?:anything|a\s+(?:single\s+)?thing)(?:\s+(?:at\s+all|whatsoever|please|yet|for\s+now|right\s+now|now))*(?:\s+(?:in|inside|of|within|about|on)\s+(?:the|my|our|this|that)\s+(?:(?:whole|entire|existing|current)\s+)?(?:project|workspace|repo|repository|codebase|code|app|application|site|website|system))?\s*$/i;
/** Where a sentence ends. The dot of «utils.js» ends none. */
const SENTENCE_END = /[!?؟;؛\n]|\.(?:\s|$)/u;
/** The head of the sentence the phrase at `at` stands in, the «without» phrases read out of it. */
function headOfItsSentence(text: string, at: number, length: number, phrases: RegExp): string {
    const before = text.slice(Math.max(0, at - 400), at);
    let from = before.length;
    while (from > 0) {
        const c = before.charCodeAt(from - 1);
        //  \n ! ? ; ؛ ؟ — and a dot only when a space follows it.
        if (c === 10 || c === 33 || c === 63 || c === 59 || c === 0x61B || c === 0x61F) break;
        if (c === 46 && (from === before.length || isSpace(before.charCodeAt(from)))) break;
        from -= 1;
    }
    const after = text.slice(at + length, at + length + 400);
    const end = after.search(SENTENCE_END);
    //  Only its head is read: three hundred characters hold the courtesies and the verb, and keep each phrase's cost a constant.
    return `${before.slice(from)} ${end < 0 ? after : after.slice(0, end)}`.slice(0, 300).replace(phrases, ' ').replace(BEFORE_THE_ORDER, '');
}
/** Is the «without changing X» at `at` what a change must leave alone (true), or a denial (false)? */
function isAnExclusionBesideItsOrder(text: string, at: number, phrase: string): boolean {
    if (WITHOUT_FILE_CHANGES_EN.test(phrase) || WITHOUT_CHANGING_THE_CODE_EN.test(phrase)) return false;
    const head = headOfItsSentence(text, at, phrase.length, WITHOUT_CHANGING_EN);
    if (changesHisWork(head)) return true;
    return !KEEPS_EVERYTHING_EN.test(phrase) && !onlyReadsOrAsks(head);
}
/** «… without changing anything» beside no order that changes his work: every change is denied. */
function deniesEveryChangeWithout(text: string): boolean {
    if (!/\bwithout\s/i.test(text)) return false;
    for (const m of text.matchAll(EACH_WITHOUT_CHANGING_EN)) {
        if (KEEPS_EVERYTHING_EN.test(m[0]) && !changesHisWork(headOfItsSentence(text, m.index as number, m[0].length, WITHOUT_CHANGING_EN))) return true;
    }
    return false;
}
/** «بدون تعديل X», «من دون تغيير X», «من غير تعديل X», «دون أي تعديل على X»: the words the read-only boundary stops on, with what they name. */
const EACH_WITHOUT_CHANGE_AR = /(?<![\p{L}\p{N}_])(?:(?:من\s+)?ب?دون|من\s+غير)\s+(?:(?:أي|اي)\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف)(?![\p{L}\p{N}_])(?<object>[^.؛;!?؟\n،,:]{0,80})/gu;
/** What leaves nothing to change: the code, the project, anything — never with a word that narrows it («شي ثاني», «أي شيء آخر»). */
const EVERYTHING_AR = /^(?:(?:على|في|فى)\s+)?(?:(?:أي|اي|كل|جميع)\s+(?:من\s+)?)?(?:ال)?(?:كود|سورس|مشروع|مستودع|ريبو|شي|شيء|شيئا|شئ|حاج[ةه])(?:ي|نا|ك|ه|ها)?(?![\p{L}\p{N}_])(?!\s+(?:[آا]خر|[أا]خرى|ثاني[ةه]?|جديد[ةه]?|غير|سوى|[إا]لا|عدا|باستثناء|ما\s+عدا)(?![\p{L}\p{N}_]))/u;
const WITHOUT_CHANGE_AR = new RegExp(EACH_WITHOUT_CHANGE_AR.source, 'gu');
const NAMES_NOTHING_AR = /^(?:\s*(?:فقط|[أا]بدا|نهائيا|بتاتا|[إا]طلاقا|الآن|الان|حاليا))*\s*$/u;
/** A list of changes («دون إنشاء أو تعديل…», «دون تعديل ولا حذف…») names no one thing either. */
const ANOTHER_CHANGE_AR = /^\s*(?:[أا]و|ولا|و)\s*(?:تعديل|كتابة|إنشاء|تغيير|حذف)/u;
function namesOneThingAr(phrase: string, object: string): boolean {
    if (NAMES_NOTHING_AR.test(object) || ANOTHER_CHANGE_AR.test(object)) return false;
    return !EVERYTHING_AR.test(object.trimStart()) && !(phrase.includes('ملف') && deniesEveryFileChange(phrase));
}
/** «without changing X» / «بدون تعديل X» where it is an exclusion beside its order (above) — read out; where it denies, kept. */
function withoutChangeExclusions(text: string): string {
    const english = /\bwithout\s/i.test(text)
        ? text.replace(EACH_WITHOUT_CHANGING_EN, (phrase: string, at: number) => isAnExclusionBesideItsOrder(text, at, phrase) ? ' ' : phrase)
        : text;
    if (!/دون\s|غير\s/u.test(english)) return english;
    return english.replace(EACH_WITHOUT_CHANGE_AR, (phrase: string, ...rest: unknown[]) => {
        const { object = '' } = (rest[rest.length - 1] || {}) as { object?: string };
        if (!namesOneThingAr(phrase, object)) return phrase;
        const at = rest[rest.length - 3] as number;
        return onlyReadsOrAsks(headOfItsSentence(english, at, phrase.length, WITHOUT_CHANGE_AR)) ? phrase : ' ';
    });
}
/**
 * ⛔ «DO NOT CHANGE ANY OTHER FILES» IS NOT «DO NOT CHANGE FILES».
 *
 * «Create a file named joe-prompt-02.txt … Do not change any other files.» and
 * a clone-and-commit brief that said «لا تعدل ملفات إنتاج أو إعدادات أو أسرار»
 * were both answered with prose: the old reader matched «do not change … files»
 * across the whole message and «لا تعدل ملفات» whatever followed it, so a
 * denial about SOME files became a denial of every change — and the file he
 * asked for, and the commit, never happened.
 *
 * A denial blocks every file change only when its object is unqualified: the
 * files, any files, the project's files. A word that narrows the object —
 * «other», «else», «existing», «new», a category such as production, config or
 * secret files, «أخرى», «غير ذلك», «الإنتاج» — scopes it, the same way
 * stripScopedExclusions scopes «do not build a database» to the database.
 * The narrowing words are an open class; what keeps a denial whole is the
 * closed class below: determiners and the names of the whole workspace.
 */
/*
 * ⛔ «لا تعدل أو تحذف أي ملف» DENIES EVERY FILE CHANGE, WHICHEVER VERB COMES FIRST.
 *
 * The Arabic reader knew «لا تعدل الملفات» and «لا تنشئ الملفات»: one verb, the
 * plural. «لا تعدل أو تحذف أي ملف», «لا تعدل ولا تحذف أي ملف», «راجع الكود ولا
 * تعدل أي ملف» were no denial at all — and the «أي» in them made each a
 * question, so a review that forbade every change was answered as «which
 * file?». In English the list had to open with a changing verb and could not
 * end «, or delete»: "Do not delete or modify any file" was a read-only audit,
 * "Do not create, modify, or delete any file" an answer-only contract.
 *
 * A denial is a LIST of verbs (one or more, joined by «أو», «ولا», «و», a
 * comma, "or", "and", "nor") and its object. What makes it a denial of file
 * CHANGES is that the list holds a verb that changes a file — create, write,
 * modify, edit, change — wherever it stands; a list that only deletes or moves
 * («لا تحذف أي ملف», "Do not delete any file") forbids that much and is left to
 * the readers it always had. The lookahead finds the changing verb past at
 * most seven others, each item a closed word and each separator disjoint from
 * the next, so the cost per «لا» / "do not" is a constant.
 */
const CHANGING_VERB_EN = '(?:create|write|modify|edit|change)';
const REMOVING_VERB_EN = '(?:delete|touch|remove)';
const VERB_SEPARATOR_EN = String.raw`(?:\s*,\s*(?:(?:or|and|nor)\s+)?|\s+(?:or|and|nor)\s+)`;
const FILE_DENIAL_EN = new RegExp(String.raw`(?:^|[\s،:؛.!?])do\s+not\s+(?=(?:${REMOVING_VERB_EN}${VERB_SEPARATOR_EN}){0,7}${CHANGING_VERB_EN}\b)((?:${CHANGING_VERB_EN}|${REMOVING_VERB_EN})(?:${VERB_SEPARATOR_EN}(?:${CHANGING_VERB_EN}|${REMOVING_VERB_EN})){0,7})\s+([^.;!?\n]*?)\bfiles?\b([^.;!?\n]{0,40})`, 'gi');
/**
 * …AND «THE APP FILES», «MY PROJECT'S FILES», «THE EXISTING FILES» ARE ALL OF THEM.
 *
 * «Check my app for bugs and suggest fixes. Do not modify the app files.» went
 * to archive_files and «Review my code and list the problems. Do not change the
 * existing files.» to a build: the closed class knew «project» but not «app»,
 * «website» or «system», read «project's» as a word of its own, and counted
 * «existing» as a narrowing word. The files that exist ARE the files: «do not
 * change the existing files» forbids every change; «any other files» still
 * narrows.
 */
const WHOLE_OBJECT_EN = new Set(['a', 'an', 'any', 'all', 'the', 'my', 'your', 'our', 'its', 'their', 'this', 'these', 'those', 'of', 'in', 'to', 'on', 'inside', 'within', 'anything', 'everything', 'single',
    'project', 'workspace', 'repo', 'repository', 'source', 'code', 'codebase',
    'app', 'apps', 'application', 'site', 'website', 'web', 'system', 'program', 'software', 'existing', 'current', 'present']);
const NARROWING_TAIL_EN = /^\s*(?:other\s+than|except|besides|apart\s+from|aside\s+from|outside|beyond|else|but\b)/i;
// «ملفاتي», «ملفاته», «ملفاتنا»: the possessive is part of the word.
//  The verbs of «لا <verb>»: those that change a file, and those that only remove or move one.
const CHANGING_VERB_AR = '(?:تنشئ|تنشي|تعدل|تغير|تكتب)';
const REMOVING_VERB_AR = '(?:تحذف|تمسح|تنقل|تلمس|تمس)';
//  «أو تحذف», «ولا تحذف», «وتحذف», «، تحذف», «، ولا تحذف»: every verb opens with «ت», so no separator can be read as part of one.
const VERB_SEPARATOR_AR = String.raw`(?:\s*[،,]\s*(?:(?:أو|او|ولا|و)\s*)?|\s+(?:أو|او|ولا)\s+|\s+و)`;
const DENIED_VERBS_AR = String.raw`(?=(?:${REMOVING_VERB_AR}${VERB_SEPARATOR_AR}){0,7}${CHANGING_VERB_AR}(?![\p{L}\p{N}_]))(?:${CHANGING_VERB_AR}|${REMOVING_VERB_AR})(?:${VERB_SEPARATOR_AR}(?:${CHANGING_VERB_AR}|${REMOVING_VERB_AR})){0,7}`;
//  The dialects' denials: Egypt's «ما …ش» («ما تعدلش أي ملف», «متغيريش الملفات») and «بدون ما تعدل», «من غير ما
//  تغير» ("without your changing"). The «ش» and the «بدون» are what make this «ما» a denial: bare, «بعد ما تعدل
//  الملفات شغل المشروع» relates, and is not read here.
const DIALECT_DENIAL_AR = String.raw`[وف]?(?:ما\s*|م)${CHANGING_VERB_AR}ي?ش\s+|(?:بدون|دون|من\s+غير)\s+ما\s+${CHANGING_VERB_AR}\s+`;
//  The object: «الملفات», «ملفاتي», «أي ملفات», «كل الملفات» — and one file only when it is ANY file
//  («أي ملف»): «لا تعدل ملف الإعدادات» names the one file it protects and is not read here at all.
const FILE_DENIAL_AR = new RegExp(String.raw`(?:^|[\s،:؛.!?])(?:(?:بدون|دون)\s+(?:أي\s+)?(?:تعديل|تغيير|كتابة|إنشاء)\s+(?:على\s+)?|لا\s+تغييرات\s+|دون\s+تغييرات\s+|دون\s+إنشاء\s+|دون\s+تعديل\s+|[وف]?لا\s+${DENIED_VERBS_AR}\s+|${DIALECT_DENIAL_AR})(?:(?:(?:أي|اي|كل|جميع)\s+(?:من\s+)?)?(?:ال)?ملفات(?<own>ي|نا|ك|كم|ه|ها|هم)?|(?:أي|اي)\s+ملف)(?=$|[^\p{L}\p{N}_])(?<tail>[^.؛;!?؟\n]{0,40})`, 'giu');
/**
 * After «الملفات»: what keeps the object whole — the whole workspace's names
 * (with his possessive: «ملفات موقعي», «ملفات مشروعنا»), the dialect
 * possessives («الملفات تبعي / حقتي / بتاعتي / مالتي»), the files that exist
 * («الحالية», «الموجودة»), a list, the clause's end.
 */
const WHOLE_OBJECT_AR = new Set(['مساحة', 'مساحه', 'العمل', 'أو', 'او', 'فقط', 'أبدا', 'ابدا', 'أبداً', 'إطلاقا', 'اطلاقا', 'إطلاقاً', 'نهائيا', 'نهائياً', 'بتاتا', 'بتاتاً', 'كلها', 'جميعها', 'كلهم',
    'الحالية', 'الحاليه', 'الحالي', 'الموجودة', 'الموجوده', 'الموجودين', 'القائمة', 'القائمه', 'الأصلية', 'الاصلية', 'الاصليه']);
const WORKSPACE_NAME_AR = /^(?:ال)?(?:مشروع|موقع|تطبيق|نظام|كود|مستودع|برنامج|سورس|ريبو)(?:ي|نا|ك|كم|ه|ها)?$/u;
const DIALECT_POSSESSIVE_AR = /^(?:تبع|تبعت|حق|حقت|حقات|بتاع|بتاعت|بتوع|مال|مالت|تاع|تاعت|خاص|خاصت|الخاص[ةه]?|الخاصين)(?:ي|ى|نا|ك|كم|ه|ها)$/u;
function fileDenialIsWhole(object: string, tail: string): boolean {
    const words = object.trim().toLowerCase().replace(/['’]s\b/g, '').split(/[\s,]+/).filter(Boolean);
    if (words.some(w => !WHOLE_OBJECT_EN.has(w))) return false;
    return !NARROWING_TAIL_EN.test(tail);
}
/** «أي ملف في المشروع», «الملفات داخل مساحة العمل»: where the files are, when that is the whole workspace. */
const INSIDE_AR = /^(?:في|فى|داخل|ضمن|ب)$/u;
/** A condition on the change, not a narrower object: until he allows it, every file is still denied. */
const UNTIL_AR = /^(?:بدون|دون|بلا|قبل|حتى|الآن|الان|حاليا)$/u;
function arabicFileDenialIsWhole(possessive: string, tail: string): boolean {
    const [next = '', after = ''] = stripArabicDiacritics(tail.trim()).split(/[\s،,:]+/u);
    if (!next) return true;                                   // «لا تعدل الملفات.»
    if (possessive) return !/^(?:الأخرى|الاخرى|الاخري|اخرى|أخرى|الثانية|الثانيه)$/u.test(next);  // «لا تعدل ملفاتي»
    if (/^[وف]\S{2,}/u.test(next)) return true;               // «… الملفات واشرح لي» / «والإعدادات»
    if (UNTIL_AR.test(next)) return true;                     // «… أي ملف بدون إذني», «… الملفات قبل ما أوافق»
    if (INSIDE_AR.test(next)) return WORKSPACE_NAME_AR.test(after) || WHOLE_OBJECT_AR.has(after);   // «… في المشروع», «… داخل مساحة العمل»
    return WHOLE_OBJECT_AR.has(next) || WORKSPACE_NAME_AR.test(next) || DIALECT_POSSESSIVE_AR.test(next);
}
/**
 * «Do not create, edit, delete, move, install, publish, deploy, or commit anything»: a
 * denial of every change is a denial of every file change too. The read-only audit in
 * project-pipeline.test.ts said exactly that, and «You may only read project files»; the
 * old greedy pattern reached «files» in that later sentence by accident, and when it was
 * made exact the audit fell to «answer only» — no files read, no checks run.
 */
//  A LIST of changes denied together («create, edit, delete … anything»); one verb alone
//  («Do not modify anything.») is left to the read-only reader, as it always was.
/*
 * ⛔ A LIST IS READ ONE WORD AT A TIME, NEVER EVERY WAY IT COULD BE CUT.
 *
 * The Arabic list was `(?:\s*(?:،|,|أو|او|ولا|و)\s*\S+)+`: «و» is a separator
 * AND a letter of the word after it, and `\S+` can stop anywhere, so a run of
 * «و»-words after «لا تعدل» could be cut in exponentially many ways — 24 of
 * them took 20.7 s, on every message, 12–14 times per message. Each item is
 * now one whole word ([^\s،,]+ cannot stop inside a word: what follows it must
 * be a space or a comma), its separator one of three disjoint forms, and the
 * list at most eight verbs long — the longest list of changes anyone denies —
 * so the worst case is a constant per «لا <verb>».
 */
const EVERY_CHANGE_DENIAL_EN = /(?:^|[\s،:؛.!?])do\s+not\s+(?:create|write|modify|edit|change|delete)(?:(?:\s*,\s*(?:(?:or|and|nor)\s+)?|\s+(?:or|and|nor)\s+)[a-z]+){1,8}\s+(?:anything|everything)\b/i;
const EVERY_CHANGE_DENIAL_AR = /(?:^|[\s،:؛.!?])لا\s+(?:تنشئ|تعدل|تغير|تحذف|تكتب)(?:(?:\s*[،,]\s*|\s+(?:أو|او|ولا)\s+|\s+و)[^\s،,]+){1,8}\s+(?:أي|اي)\s+شي/u;
//  «لا تعدل ولا تحذف شيئاً», «ولا تعدل أو تحذف شيء»: the same list without «أي». Here every item must
//  be one of the verbs — with any word allowed, «لا تعدل، أضف شيئاً» ("do not edit; add something") would deny.
const EVERY_CHANGE_LIST_AR = new RegExp(String.raw`(?:^|[\s،:؛.!?])[وف]?لا\s+(?=(?:${REMOVING_VERB_AR}${VERB_SEPARATOR_AR}){0,7}${CHANGING_VERB_AR}(?![\p{L}\p{N}_]))(?:${CHANGING_VERB_AR}|${REMOVING_VERB_AR})(?:${VERB_SEPARATOR_AR}(?:${CHANGING_VERB_AR}|${REMOVING_VERB_AR})){1,7}\s+(?:(?:أي|اي)\s+)?شي(?:ء|ئا)?(?![\p{L}\p{N}_])`, 'u');

/**
 * Does the request forbid every file change (not only some files)?
 *
 * Harakat and tatweel are not letters: «لا تُعدِّل الملفات» denies what «لا تعدل
 * الملفات» denies. This reader is exported and was asked with the text as he
 * wrote it, so one vowel mark on the verb made the denial disappear.
 */
export function deniesEveryFileChange(text: string): boolean {
    const t = stripArabicDiacritics(String(text || ''));
    if (NO_FILE_CHANGES_UNQUALIFIED.test(t) || WITHOUT_FILE_CHANGES_EN.test(t)) return true;
    //  «… without changing anything»: every change, unless one of the verbs that change his work stands beside it.
    if (deniesEveryChangeWithout(t)) return true;
    if (EVERY_CHANGE_DENIAL_EN.test(t) || EVERY_CHANGE_DENIAL_AR.test(t) || EVERY_CHANGE_LIST_AR.test(t)) return true;
    for (const m of t.matchAll(FILE_DENIAL_EN)) if (fileDenialIsWhole(m[2] || '', m[3] || '')) return true;
    for (const m of t.matchAll(FILE_DENIAL_AR)) if (arabicFileDenialIsWhole(m.groups?.own || '', m.groups?.tail || '')) return true;
    return false;
}

/**
 * A denial about SOME files is an exclusion, like «do not build a database»:
 * «Do not change any other files» and «لا تعدل ملفات إنتاج أو إعدادات» leave
 * the denial readers (answer-only, read-only) with nothing to read, so «Create
 * a file … Do not change any other files.» is not taken for a read-only audit.
 * What follows the narrowed object stays: «… ملفات أخرى، فقط أنشئ ملف» keeps
 * its order.
 */
function stripNarrowedFileDenials(text: string): string {
    return String(text || '')
        .replace(FILE_DENIAL_EN, (whole, _verbs: string, object: string, tail: string) => fileDenialIsWhole(object, tail) ? whole : ` ${tail}`)
        .replace(FILE_DENIAL_AR, (whole: string, ...rest: unknown[]) => {
            const { own = '', tail = '' } = (rest[rest.length - 1] || {}) as { own?: string; tail?: string };
            return arabicFileDenialIsWhole(own, tail) ? whole : ` ${tail.replace(/^\s*\S+/u, '')}`;
        });
}

// POLITE_BUILD patterns
const POLITE_BUILD_EN = `(?:could\\s+you\\s+please\\s+(?:make|build|create|design|implement|develop|code|write)|can\\s+you\\s+(?:make|build|create|design|implement|develop|code|write)|could\\s+you\\s+(?:make|build|create|design|implement|develop|code|write)|please\\s+(?:make|build|create|design|implement|develop|code|write)|would\\s+you\\s+(?:make|build|create|design|implement|develop|code|write))`;
// Arabic POLITE_BUILD: هل يمكنك بناء / هل تستطيع إنشاء / يرجى بناء / هل من الممكن بناء
const POLITE_BUILD_AR = `(?:هل\\s+يمكنك\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|هل\\s+تستطيع\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|يرجى\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|هل\\s+من\\s+الممكن\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة))`;
const POLITE_BUILD_PATTERN = new RegExp(`${START_BOUNDARY}(?:${POLITE_BUILD_EN}|${POLITE_BUILD_AR})${END_BOUNDARY}`, 'i');

// EXPLAIN_THEN_BUILD patterns: «Explain the approach briefly, then build …»,
// «Describe X first, then implement …», «اشرح المنهج ثم ابنِ …», «صف التصميم ثم أنشئ …».
/*
 * «explain … then build»: the lazy `.+?` between them was tried from every
 * «explain»/«اشرح»/«صف» to the end of the line, and the `\s*,?\s*` and
 * `[,\s]*\s*` around «then» split each run of spaces every way — 5 KB of
 * «اشرح ثم …» took ~100 ms per reading. If any explain verb on a line comes
 * before «then <build>», the line's FIRST one does: one scan per line.
 * «أولاً» is read without its tanween too, since the probe has no diacritics.
 */
const EXPLAIN_APPROACH_THEN_BUILD = /(?:^|[\s،:؛.!?])(?:explain\s+(?:the\s+)?(?:approach|design|plan|solution|architecture)\s+(?:briefly|first|then)(?:[,\s]*(?:then|and\s+then))?[,\s]*(?:build|create|implement|develop|make|code)|اشرح\s+(?:المنهج|التصميم|الخطة|الحل|العمارة)\s+(?:بإيجاز|أولاً|أولا|اولا|ثم)(?:[،\s]*(?:ثم|و\s*ثم))?[،\s]*(?:ابني?|أنشئ|نفذ|طور|اصنع|برمج))(?:$|[\s،:؛.!?])/i;
const EXPLAIN_FIRST_EN = /(?:^|[\s،:؛.!?])(?:briefly\s+)?(?:explain|describe)\s/i;
const THEN_BUILD_EN = /\s(?:first|then|and\s+then)(?:[,\s]*then)?[,\s]*(?:build|create|implement|develop|make|code)(?:$|[\s،:؛.!?])/i;
const EXPLAIN_FIRST_AR = /(?:^|[\s،:؛.!?])(?:بإيجاز\s+)?(?:اشرح|صف)\s/;
const THEN_BUILD_AR = /\s(?:أولاً|أولا|اولا|ثم|و\s*ثم)(?:[،\s]*ثم)?[،\s]*(?:ابني?|أنشئ|نفذ|طور|اصنع|برمج)(?:$|[\s،:؛.!?])/;
const EXPLAIN_THEN_BUILD_PATTERN = {
    test(text: string): boolean {
        const t = String(text || '');
        if (EXPLAIN_APPROACH_THEN_BUILD.test(t)) return true;
        return t.split(LINE_BREAK).some(line => {
            const en = EXPLAIN_FIRST_EN.exec(line);
            if (en && THEN_BUILD_EN.test(line.slice(en.index + en[0].length - 1))) return true;
            const ar = EXPLAIN_FIRST_AR.exec(line);
            return !!ar && THEN_BUILD_AR.test(line.slice(ar.index + ar[0].length - 1));
        });
    },
};

// AFFIRMATIVE_BUILD patterns (imperative verbs)
const AFFIRMATIVE_BUILD_EN = `(?:build|create|make|develop|implement|design|code|scaffold|generate|produce|construct|craft|write|program)`;
// Arabic AFFIRMATIVE_BUILD: ابن / أنشئ / اصنع / طور / نفذ / صمم / برمز / مولد / اكتب / برمج
const AFFIRMATIVE_BUILD_AR = `(?:ابني?|أنشئ|اصنع|طور|نفذ|صمم|برمج|ولد|اكتب)`;
const AFFIRMATIVE_BUILD_PATTERN = new RegExp(`${START_BOUNDARY}(?:${AFFIRMATIVE_BUILD_EN}|${AFFIRMATIVE_BUILD_AR})${END_BOUNDARY}`, 'i');

// DESIRE_VERB patterns (desire/want expressions)
const DESIRE_VERB_EN = `(?:i\\s+(?:want|need|would\\s+like|\\'d\\s+like)|i\\s+wanna|can\\s+you\\s+(?:make|build|create|design|implement|develop|code|write)|could\\s+you\\s+(?:make|build|create|design|implement|develop|code|write))`;
// Arabic DESIRE_VERB: أريد / أحتاج / أود / هل يمكنك / هل تستطيع / من فضلك / ممكن
const DESIRE_VERB_AR = `(?:أريد|أحتاج|أود|هل\\s+يمكنك|هل\\s+تستطيع|من\\s+فضلك|ممكن)`;
const DESIRE_VERB_PATTERN = new RegExp(`${START_BOUNDARY}(?:${DESIRE_VERB_EN}|${DESIRE_VERB_AR})${END_BOUNDARY}`, 'i');

// RECORDING_VERB patterns (record/track/log/manage)
const RECORDING_VERB_EN = `(?:record|track|log|manage|organi[sz]e)`;
// Arabic RECORDING_VERB: سجل / تتبع / دوّن / إدارة / نظم
const RECORDING_VERB_AR = `(?:سجل|تتبع|دوّن|إدارة|نظم)`;
const RECORDING_VERB_PATTERN = new RegExp(`${START_BOUNDARY}(?:${RECORDING_VERB_EN}|${RECORDING_VERB_AR})${END_BOUNDARY}`, 'i');

// RECORDING_INDICATOR (fields/columns) - Arabic: حقل / عمود / حقول / أعمدة
const RECORDING_INDICATOR = /(?:^|[\s،:؛])(?:حقل|عمود|حقول|أعمدة|field|column|fields|columns)(?=$|[\s、:؛)])/iu;

// ENGLISH_DESIRE_PATTERN (polite but direct)
const ENGLISH_DESIRE_PATTERN = /\b(i\s+(?:want|need|would\s+like)|can\s+you\s+(?:make|build|create)|could\s+you\s+(?:make|build|create)|please\s+(?:make|build|create|give\s+me))\b/i;

// ENGLISH_IMPERATIVE_PATTERN
const ENGLISH_IMPERATIVE_PATTERN = /^\s*(build|create|make|develop|generate|scaffold|implement|code|design|deploy)\b/i;

// CONTAINER patterns - works for both English and Arabic with Unicode support
// English: app, website, webapp, site, page, form, component, module, plugin, extension, tool, utility, script, dashboard, panel, interface, UI, frontend, backend, API, service, microservice, database, db, store, cache, queue, worker, job, task, report, document, template, layout, design, view, screen, dialog, modal, popup, menu, navigation, sidebar, header, footer, banner, card, list, table, grid, chart, graph, map, calendar, timeline, feed, stream, wall, gallery, carousel, slider, accordion, tab, panel, section, article, blog, post, comment, review, rating, search, filter, sort, pagination, breadcrumb, toolbar, button, link, input, textarea, select, checkbox, radio, switch, toggle, dropdown, contextmenu, tooltip, popover, alert, notification, badge, tag, avatar, icon, image, video, audio, player, canvas, svg, calculator, houses, login, page, message, note, label, heading
// Arabic: تطبيق / موقع / صفحة / نموذج / مكون / وحدة / إضافة / أداة / سكربت / لوحة / واجهة / خلفية / خدمة / قاعدة بيانات / مخزن / طابور / عامل / مهمة / تقرير / مستند / قالب / تخطيط / تصميم / عرض / شاشة / حوار / نافذة منبثقة / قائمة / تنقل / شريط جانبي / رأس / تذييل / لافتة / بطاقة / قائمة / جدول / شبكة / رسم بياني / رسم بياني / خريطة / تقويم / خط زمني / تغذية / تدفق / جدار / معرض / عرض دوار / شريط تمرير / طي / علامة تبويب / لوحة / قسم / مقال / مدونة / مشاركة / تعليق / مراجعة / تقييم / بحث / تصفية / ترتيب / ترقيم / مسار تنقل / شريط أدوات / زر / رابط / إدخال / منطقة نص / اختيار / خانة اختيار / راديو / مفتاح / تبديل / قائمة منسدلة / قائمة سياقية / تلميح / نافذة منبثقة / تنبيه / إشعار / شارة / وسم / صورة رمزية / أيقونة / صورة / فيديو / صوت / مشغل / كانفاس / SVG / حاسبة / منازل / تسجيل دخول / صفحة / رسالة / ملاحظة / تسمية / عنوان
// «Write a Python CLI that reads invoices …» named no container the list
// knew, so it was never a build (eval round 19); «cli» is bounded because the
// alternation below is not.
const CONTAINER_PATTERN = /(?:\bcli\b|command[\s-]?line|application|system|platform|game|converter|previewer|app|website|webapp|site|page|form|component|module|plugin|extension|tool|utility|script|dashboard|panel|interface|ui|frontend|backend|api|service|microservice|database|db|store|cache|queue|worker|job|task|report|document|template|layout|design|view|screen|dialog|modal|popup|menu|navigation|sidebar|header|footer|banner|card|list|table|grid|chart|graph|map|calendar|timeline|feed|stream|wall|gallery|carousel|slider|accordion|tab|panel|section|article|blog|post|comment|review|rating|search|filter|sort|pagination|breadcrumb|toolbar|button|link|input|textarea|select|checkbox|radio|switch|toggle|dropdown|contextmenu|tooltip|popover|alert|notification|badge|tag|avatar|icon|image|video|audio|player|canvas|svg|calculator|houses|login|page|message|note|label|heading|تطبيق|موقع|صفحة|نموذج|مكون|وحدة|إضافة|أداة|سكربت|لوحة|واجهة|خلفية|خدمة|قاعدة\s+بيانات|مخزن|طابور|عامل|مهمة|تقرير|مستند|نظام|متجر|برنامج|محول|قالب|تخطيط|تصميم|عرض|شاشة|حوار|نافذة\s+منبثقة|قائمة|تنقل|شريط\s+جانبي|رأس|تذييل|لافتة|بطاقة|قائمة|جدول|شبكة|رسم\s+بياني|رسم\s+بياني|خريطة|تقويم|خط\s+زمني|تغذية|تدفق|جدار|معرض|عرض\s+دوار|شريط\s+تمرير|طي|علامة\s+تبويب|لوحة|قسم|مقال|مدونة|مشاركة|تعليق|مراجعة|تقييم|بحث|تصفية|ترتيب|ترقيم|مسار\s+تنقل|شريط\s+أدوات|زر|رابط|إدخال|منطقة\s+نص|اختيار|خانة\s+اختيار|راديو|مفتاح|تبديل|قائمة\s+منسدلة|قائمة\s+سياقية|تلميح|نافذة\s+منبثقة|تنبيه|إشعار|شارة|وسم|صورة\s+رمزية|أيقونة|صورة|فيديو|صوت|مشغل|كانفاس|SVG|حاسبة|منازل|تسجيل\s+دخول|صفحة|رسالة|ملاحظة|تسمية|عنوان)/iu;

// READ_ONLY patterns
const READ_ONLY_EN = `(?:read[-\\s]?only|readonly|only\\s+(?:read|inspect|analy[sz]e|review|verify)|read\\s+(?:the\\s+)?(?:files?|file)\\s+only|without\\s+(?:changing|modifying|writing|creating|editing)|without\\s+(?:making|any)\\s+(?:file\\s+)?(?:changes?|modifications?)|no\\s+(?:file\\s+)?(?:changes?|writes?|modifications?))`;
const READ_ONLY_EN_2 = `(?:do\\s+not|don't|never)\\b(?:\\s+\\w+){0,3}\\s+\\b(?:create|edit|delete|move|install|commit|write|modify|changes?|build|start|run)\\b`;
// Arabic READ_ONLY: قراءة فقط / للقراءة فقط / اقرأ فقط / دون تغيير / دون تعديل / دون كتابة / دون إنشاء / لا تغييرات
const READ_ONLY_AR = `(?:قراءة\\s+فقط|للقراءة\\s+فقط|اقرأ\\s+فقط|دون\\s+تغيير|دون\\s+تعديل|دون\\s+كتابة|دون\\s+إنشاء|لا\\s+تغييرات)`;
const READ_ONLY_PATTERN = new RegExp(`${START_BOUNDARY}(?:${READ_ONLY_EN}|${READ_ONLY_AR})${END_BOUNDARY}|${READ_ONLY_EN_2}`, 'i');

// KNOWLEDGE_QUESTION patterns
const KNOWLEDGE_QUESTION_EN = `(?:what|why|how|when|which|who|explain|compare|difference|versus|vs)\\b`;
// Arabic KNOWLEDGE_QUESTION: ما / لماذا / كيف / متى / أي / من / اشرح / قارن / فرق / مقابل
const KNOWLEDGE_QUESTION_AR = `(?:ما|لماذا|كيف|متى|أي|من|اشرح|قارن|فرق|مقابل)`;
const KNOWLEDGE_QUESTION_START = `(?:^|[\\s、:؛])(?:${KNOWLEDGE_QUESTION_AR})(?=$|[\\s、:؛?])|^\\s*(?:ما|لماذا|كيف|متى|أي|من|اشرح|قارن|فرق|مقابل)(?=$|[\\s、:؛])`;
const KNOWLEDGE_QUESTION_END = `(?:[??]\\s*$)`;
const KNOWLEDGE_QUESTION_PATTERN = new RegExp(`${KNOWLEDGE_QUESTION_START}|${KNOWLEDGE_QUESTION_EN}|${KNOWLEDGE_QUESTION_END}`, 'i');

// Negative constraints on builds
/*
 * A negation, then later on the same line a part it can exclude. One pattern
 * `negation.*part` tried `.*` from EVERY negation to the end of the line and
 * back — quadratic: 5 KB of «لا لا لا…» or «ولا ولا…» took over a second per
 * reading. If any negation on a line precedes the part, the line's FIRST
 * negation does, so each line is scanned once from its first negation.
 */
const NEGATION_WORD = /\b(?:do\s+not|don't|never|without|no)\b|(?<=(?:^|[^\p{L}\p{N}_])[وف]?)(?:لا|دون|بدون)(?![\p{L}\p{N}_])/iu;
const NEGATABLE_PART = /\b(?:database|login|auth|db)\b|(?<=(?:^|[^\p{L}\p{N}_])(?:ال)?)(?:قاعد[ةه]\s+(?:ال)?بيانات|تسجيل\s+(?:ال)?دخول|مصادق[ةه])(?![\p{L}\p{N}_])/iu;
const LINE_BREAK = /[\n\r\u2028\u2029]/u;
const NEGATIVE_CONSTRAINTS_PATTERN = {
    test(text: string): boolean {
        return String(text || '').split(LINE_BREAK).some(line => {
            const at = line.search(NEGATION_WORD);
            return at >= 0 && NEGATABLE_PART.test(line.slice(at + 1));
        });
    },
};

export interface RequestedActionResult {
    hasAffirmativeAction: boolean;
    hasDenial: boolean;
    denialReason?: string;
    isAnswerOnly: boolean;
    isNoFileChanges: boolean;
    isPoliteBuild: boolean;
    isExplainThenBuild: boolean;
    confidence: number;
    reason: string;
}

/**
 * ⛔ A WORD WITH THE ARTICLE IS A NOUN, NEVER THE ORDER.
 *
 * The normalizer turns a verbal noun into the imperative the fast paths match
 * («تصميم موقع شركة» → «صمم …»), and it does so through the article too: in
 * «شغّل مشروع لوحة مهامي … أثبت البناء والتشغيل» the canonical line read
 * «أثبت ابن والتشغيل», and a request to RUN his project became an order to
 * build one. «البناء», «التصميم», «التعديل» name the thing being talked about;
 * an order is never definite. They are kept out of the canonical reading only.
 */
const DEFINITE_VERBAL_NOUN = /(?<![\p{L}\p{N}_])([وفبل]?)ال(?:بناء|تصميم|تطوير|برمجة|برمجه|[إا]نشاء|[إا]ضافة|[إا]ضافه|تغيير|تعديل|تبديل|تكبير|تصغير|تحسين|[إا]زالة|[إا]زاله|حذف)(?![\p{L}\p{N}_])/gu;
/**
 * …UNLESS HE ORDERS IT STARTED. «ابدأ التصميم», «اعتمد التصميم وابدأ البناء»,
 * «كمّل التطوير» order the work the noun names: the verb before it is the
 * order and the noun its object. Stripping the noun there left «ابدأ» with
 * nothing to start, and both fell to the model (they were builds before).
 */
const START_THE_WORK = /(?:^|[^\p{L}\p{N}_])[وف]?(?:ابدأ|ابدا|إبدأ|ابدء|باشر|كمل|اكمل|أكمل|واصل|تابع|استأنف|استانف|نفذ)\s+(?:في\s+|فى\s+)?$/u;
export function withoutDefiniteVerbalNouns(text: string): string {
    const bare = stripArabicDiacritics(String(text || ''));
    return bare.replace(DEFINITE_VERBAL_NOUN, (whole: string, prefix: string, offset: number) =>
        START_THE_WORK.test(bare.slice(Math.max(0, offset - 16), offset)) ? whole : prefix);
}

/**
 * ⛔ AN ORDER AFTER A QUESTION OPENS A SENTENCE THAT IS NOT A QUESTION.
 *
 * «كيف أنشر المشروع؟ انشره الآن», «How do I deploy it? Deploy it now.», «ليش
 * الموقع بطيء؟ صلحه» ask, then order. But the readers looked for a deed word
 * ANYWHERE after the first question mark, and the review found what that
 * cost: «How do I install Node? And then run my app?» ran his app, «What is
 * the best way to learn React? Then build something with it?» opened a React
 * project, «ما الفرق بين React و Vue؟ أيهما أسهل لما ابني متجر؟» built a
 * store, «What is Docker? Run me through the basics.» opened a browser — and
 * «كيف أربي ابني؟ ابني عنيد جدا» («my son is very stubborn»), «عندي شغل كثير»
 * («I have a lot of work»), «جرب أخوي يتعلمها» («my brother tried») lost
 * their answers to words that are also nouns.
 *
 * So: only the sentences after it that are not questions themselves; the
 * order must OPEN the sentence (after «ثم», «طيب،», «من فضلك», "and then",
 * "please"…); a word that is also a noun («ابني» my son, «شغل» work, «جرب»
 * he tried, «حمل», «نزل», «عدل», «سوي») is an order only with its object —
 * a pronoun («شغّله»), «لي», a definite noun («جرب الموقع») or, for «ابني» and
 * «سوي», a deliverable («ابني لي موقع», «ابني متجر»). In English the order
 * needs its object too («Deploy it», «Run my app») — «Run me through the
 * basics», «Update me on…», «Save money tips» order nothing.
 */
/** `withObject`: verbs that order only with a deliverable after them («… عايز جدول», never «… عايز الجواب بسرعة»). */
export interface OrderWords {
    ar: ReadonlySet<string>; en: RegExp; withObject?: ReadonlySet<string>;
    /** A thing these verbs make, besides the deliverables every order reader knows («أنشئ ملف …»). */
    object?: RegExp;
}
/** Folded imperatives that are also nouns or past verbs: an object makes them orders. */
const NOUN_TWIN_AR = new Set(['شغل', 'جرب', 'حمل', 'نزل', 'عدل', 'ثبت', 'نفذ', 'طور', 'ارسل', 'اصلح', 'اوقف', 'انشي', 'حط', 'شيل', 'خل', 'عمل', 'اعمل']);
/** …and those whose pronoun form is a noun too («ابنه» his son, «سويه» together, «ابيه» his father). */
const STRONG_TWIN_AR = new Set(['ابن', 'ابني', 'ابنى', 'بن', 'سوي', 'سو', 'ابي', 'بدي', 'ودي', 'نبي']);
/**
 * Form IV imperatives keep their hamza («أرسل», «أصلح», «أوقف», «أنشئ»); every
 * other «أفعل» is «I do», never «do!»: «أبحث من شهور» is not «ابحث».
 */
const FORM_IV_AR = new Set(['ارسل', 'اصلح', 'اوقف', 'انشي', 'اضف', 'اكمل']);
const AR_PRONOUN_SUFFIX = /(?:لي|لنا|لك|لكم|ها|هم|هما|هن|وه|يه|ني|نا|ه)$/u;
const AR_DELIVERABLE = /^(?:ال|لل)?(?:موقع|صفح[هة]|صفحات|تطبيق|متجر|نظام|منص[هة]|لوح[هة]|واجه[هة]|[اأ]دا[هة]|برنامج|بواب[هة]|خدم[هة]|جدول|قائم[هة]|كشف|سجل|دفتر|لعب[هة]|مدون[هة]|سكربت|بوت|مشروع|نموذج|استمار[هة]|فورم)(?:ا|اً|ي|نا)?$/u;
/** «بدي تعمل لي…», «أبي تسوي…»: a wish whose next word is the doing. */
const AR_DOING = /^(?:تبني|تبنى|تسوي|تعمل|تصمم|تنشي|تنشئ|تطور|تبرمج|تكتب|تضيف|تعدل|تصلح|تشغل|تنشر|تجهز|تحط)(?:لي|لنا|ه|ها)?$/u;
const SEQUENCE_LEAD = /^(?:(?:[وف]?(?:ثم|بعدين|بعدها|الان|الآن|هلا|هلق|هسا|يلا|طيب|خلاص|رجاء|رجاءا)|من\s+فضلك|لو\s+سمحت|and|then|please|now|just|also|so|ok|okay|alright)(?:\s*[،,]\s*|\s+))+/iu;
const EN_OBJECT = /^(?:(?:me|us)\s+)?(?:it|this|that|them|these|those|the|my|our|your|his|her|their|a|an|all|everything|something|both|some|one)\b/i;
/** foldChars for one short word, without its three Unicode normalizations (a sentence costs microseconds). */
const FOLDED_LETTER: Record<string, string> = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ء': '', 'ة': 'ه' };
function foldArabicWord(w: string): string {
    //  One pass: this is asked for every word the readers look at.
    return w.replace(/[أإآٱىئؤءة]/gu, letter => FOLDED_LETTER[letter]).toLowerCase();
}
/** Wishes in the first person are not «I do»: «أريد», «أحتاج», «أبغى». */
const FIRST_PERSON_WISH = new Set(['اريد', 'احتاج', 'ابغي', 'ابغا', 'ابي', 'اود', 'اصمم']);
function opensWithAnOrder(sentence: string, verbs: OrderWords): boolean {
    const rest = sentence.replace(SEQUENCE_LEAD, '');
    const m = /^([^\s،,:;؛]+)(?:[\s،,:;؛]+(\S+))?/u.exec(rest);
    if (!m) return false;
    const [, first, nextRaw = ''] = m;
    const en = verbs.en.exec(rest);
    if (en && en.index === 0) {
        const after = rest.slice(en[0].length).trim();
        return !after || /^(?:now|right\s+now)\b/i.test(after) || EN_OBJECT.test(after) || /\bfor\s+(?:me|us)\b/i.test(after)
            || (/^search$/i.test(en[0]) && /^for\b/i.test(after));
    }
    // An Arabic order opens with an Arabic letter; nothing else is folded.
    if (!/^[؀-ۿ]/u.test(first)) return false;
    // A word is never longer than 40 letters; a 5 KB «word» is cut, not scanned.
    const word = foldArabicWord(first.slice(0, 40));
    const next = foldArabicWord(nextRaw.slice(0, 40)).replace(/[^\p{L}\p{N}_]+$/u, '');
    const hamzaFirst = /^[وف]?أ/u.test(first);
    const candidates = [word, ...(/^[وف]\S{2,}/u.test(word) ? [word.slice(1)] : [])];
    for (const w of candidates) {
        for (const [verb, suffix] of [[w, ''], [w.replace(AR_PRONOUN_SUFFIX, ''), (AR_PRONOUN_SUFFIX.exec(w) || [''])[0]]] as const) {
            if (!verb || !verbs.ar.has(verb)) continue;
            if (hamzaFirst && /^ا/u.test(verb) && !FORM_IV_AR.has(verb) && !FIRST_PERSON_WISH.has(verb)) continue;   // «أبحث», «أكتب», «أعمل»: I do
            const forHim = /^(?:لي|لنا|لك|لكم|الي|الينا)$/u.test(next) || /^(?:لي|لنا|لك|لكم)$/u.test(suffix);
            const itsThing = AR_DELIVERABLE.test(next) || !!verbs.object?.test(next);
            if (STRONG_TWIN_AR.has(verb) || verbs.withObject?.has(verb)) { if (forHim || itsThing || AR_DOING.test(next)) return true; continue; }
            if (NOUN_TWIN_AR.has(verb)) { if (suffix || forHim || /^(?:ال|لل)\S{2,}/u.test(next) || itsThing) return true; continue; }
            return true;
        }
    }
    return false;
}
/**
 * Does a sentence after the first question (or, with `fromAnySentence`, after
 * the first sentence) open with one of these orders — a sentence that is not
 * itself a question?
 */
export function ordersInALaterSentence(text: string, verbs: OrderWords, fromAnySentence = false): boolean {
    const g = stripArabicDiacritics(String(text || ''));
    const at = g.search(fromAnySentence ? /[؟?.!;؛\n]/u : /[؟?]/u);
    if (at < 0) return false;
    for (const m of g.slice(at + 1).matchAll(/[^.!؟?;؛\n]+([.!؟?;؛\n]+|$)/gu)) {
        if (/[؟?]/u.test(m[1] || '')) continue;               // a second question is still a question
        const sentence = m[0].replace(/[.!؟?;؛\n]+$/u, '').trim();
        if (sentence && opensWithAnOrder(sentence, verbs)) return true;
    }
    return false;
}
/**
 * ⛔ A WISH TO KNOW, THEN AN ORDER, IS THE ORDER.
 *
 * «بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة» says why he wants
 * the table and then orders it; «عايز أعرف مين اشترى، اعمل صفحة تعرض الطلبات»
 * and "I want to know how much I spent, make me a table with date, amount and
 * category" do the same. The readers took the wish to know for the whole
 * message — a question — because the order came after a COMMA, and the order
 * reader above looks only after a full stop or a question mark.
 *
 * After a wish to know, a clause is enough: a comma, a full stop, a new line,
 * or «و»/«ف» joined to the verb («… كم صرفت واعملي جدول»). The order must still
 * OPEN its clause and carry its object, exactly as above — and a wish to know
 * HOW («بدي أعرف كيف أعمل جدول، اكتب لي الخطوات», "I want to know how to build
 * a table, write the steps") is a lesson whatever follows it: its callers ask
 * this reader only when the wish names no how.
 */
const CLAUSE_END = /[.!؟?;؛\n،,]/u;
export function ordersInALaterClause(text: string, verbs: OrderWords): boolean {
    const g = stripArabicDiacritics(String(text || ''));
    const at = g.search(CLAUSE_END);
    // «… كم صرفت واعملي جدول»: the order joined by «و»/«ف», read one word at a time.
    const first = at < 0 ? g : g.slice(0, at);
    const joined = first.split(/\s+/u);
    for (let i = 2; i < joined.length && i < 60; i++) {
        if (/^[وف][ء-ي]{2,}$/u.test(joined[i]) && opensWithAnOrder(joined.slice(i, i + 3).join(' '), verbs)) return true;
    }
    if (at < 0) return false;
    for (const m of g.slice(at + 1).matchAll(/[^.!؟?;؛\n،,]+([.!؟?;؛\n،,]+|$)/gu)) {
        if (/[؟?]/u.test(m[1] || '')) continue;               // a question is still a question
        const clause = m[0].replace(/[.!؟?;؛\n،,]+$/u, '').trim();
        if (clause && opensWithAnOrder(clause, verbs)) return true;
    }
    return false;
}

/**
 * ⛔ «الزر ما بيشتغل» SAYS THE BUTTON DOES NOT WORK. IT ASKS NOTHING.
 *
 * «الزر ما بيشتغل، صلحه», «الصفحة ما تفتح صلحها», «الفورم ما بيبعت، عدله» are
 * orders to fix what he names. Every question reader knew «ما» as «what»
 * wherever it stood, so each was answered with words and nothing was fixed;
 * «شغّل السيرفر بعد ما تخلص», «عدّل الصفحة زي ما قلت لك», «نفّذ ما طلبته» and
 * «أضف زر بلون ما» were questions for the same reason.
 *
 * «ما» asks where a question can stand: opening its clause («ما الفرق…», «ما
 * هي أفضل…», «طيب ما معنى…»), after a verb of telling, knowing or asking («قل
 * لي ما…», «أريد أن أعرف ما…»), or before what a question is about when it
 * comes later — a pronoun, a demonstrative, a definite noun, «رأيك» («برأيك
 * الآن ما الحل», «الزر ما هو»). After any other word — the subject («الزر ما
 * بيشتغل», «صفحتي ما تفتح», «API ما بيرد»), a conjunction («بعد ما», «زي ما»,
 * «قبل ما»), a verb («نفّذ ما طلبته»), an indefinite noun («بلون ما») — it
 * negates, relates or leaves open, and asks nothing. And opening its clause it
 * still negates before a word only a negated verb takes: the aspect words «عم»,
 * «رح», «راح», «عاد», «زال» («ما عم يشتغل», «ما زال الخطأ موجود»), or the
 * dialect's present «بيشتغل», «بتفتح» («ما بيشتغل الزر»). «ما يشتغل الزر» and
 * «ما يميز React» have one shape; that one stays a question, as it always was.
 *
 * The words that are closed classes here are the small ones: what may stand
 * before an asking «ما». The subjects, verbs and nouns after which it negates
 * are open, and no list of them is kept.
 *
 * Each «ما» is read with at most 64 characters before it and one word after:
 * linear in the text. The negating «ما» is blanked (and, on request, the verb
 * it negates — «أنا ما بدي صفحة جديدة» wishes for nothing), so the length and
 * every other word stay where they were.
 */
const CLAUSE_OPENS_AFTER = new Set([...'.،,؛;:!?؟\n\r()«»"'].map(mark => mark.charCodeAt(0)));
/** Words a clause may open with before its question: «طيب ما الفرق…», «وبعدين ما رأيك…». */
const CLAUSE_LEAD = /^(?:[وف]|ثم|وثم|بعدين|وبعدين|طيب|يعني|لكن|بس|اوكي|اوك|تمام|اذن|هلا|هلق|الان|برايك|براي[كي]م?|بنظرك|بصراحه|سوال|سوالي|السوال|ok|okay|so|and|but|well)$/iu;
/** After these «ما» opens the question they ask for: «قل لي ما…», «أريد أن أعرف ما…», «ممكن تقول ما…». */
const ASKS_WHAT = /^[وف]?(?:[اتني]?(?:عرف|علم|فهم|قول|قل|خبر|شرح|وضح|بين|ذكر|حدد|سال|دري)(?:ني|لي|لنا|نا|ك|كم|وا|ي|ه|ها)?|معرفه)$/u;
/** What an asking «ما» is followed by when it does not open its clause. */
const ASKED_ABOUT = /^(?:هو|هي|هما|هم|هن|هذا|هذه|هذي|ذلك|تلك|هاد|هادا|هاي|هادي|ده|دي|دا|ذا|راي\S{0,3}|ال\S{2,})$/u;
/** Only a negated verb takes these: «ما عم يشتغل», «ما رح يفتح», «ما عاد يرد», «ما زال الخطأ». */
//  «اذهب» is what the canonical line makes of «رح»: «ما اذهب يفتح» there is «ما رح يفتح» here.
const NEGATED_ASPECT = /^(?:عم|رح|راح|اذهب|عاد|عادت|زال|زالت|زلت|يزال|تزال)$/u;
/** The dialect's present, «بيشتغل», «بتفتح», «بيبعت» — never «بيانات». */
const DIALECT_PRESENT = /^ب[يت](?!\S*ات$)[ء-ي]{3,}$/u;
const MARKED = /[ً-ْٰـ]/u;
const FOLDABLE = /[أإآٱىئؤءةA-Z]/u;
/** One word as the patterns above know it: without marks, folded — and untouched when it has neither. */
function plainWord(w: string): string {
    const bare = (MARKED.test(w) ? stripArabicDiacritics(w) : w).slice(0, 40);
    return FOLDABLE.test(bare) ? foldArabicWord(bare) : bare;
}
/** Is everything the clause said before its «ما» a lead («طيب», «يا جو», «برأيك»)? Leads are few: five words are not. */
function onlyLeads(before: string): boolean {
    const said = before.split(' ').filter(Boolean);
    if (said.length > 4) return false;
    for (let i = 0; i < said.length; i++) {
        const word = plainWord(said[i]);
        if (word === 'يا' && i + 1 < said.length) i += 1;        // «يا جو ما رأيك»
        else if (!CLAUSE_LEAD.test(word)) return false;
    }
    return true;
}
/*
 * The word before the «ما» is cut out by its space, not matched by a pattern:
 * an unanchored pattern run for every «ما» cost a third of a millisecond each
 * on a long text (measured: 20 KB of «الزر ما بيشتغل» took 395 ms with `match`,
 * 10 ms without).
 */
function maAsks(before: string, cutAtClause: boolean, next: string): boolean {
    const y = plainWord(next);
    const said = before.trim();
    if (!said || (cutAtClause && onlyLeads(said))) return !(NEGATED_ASPECT.test(y) || DIALECT_PRESENT.test(y));
    if (y && ASKED_ABOUT.test(y)) return true;
    const at = said.lastIndexOf(' ');
    const word = plainWord(said.slice(at + 1));
    if (word !== 'لي' && word !== 'لنا') return ASKS_WHAT.test(word);
    // «قل لي ما…»: the «لي» belongs to the verb before it; «الموقع اللي سويته لي ما يفتح» tells nothing.
    const rest = said.slice(0, Math.max(at, 0)).trimEnd();
    return ASKS_WHAT.test(plainWord(rest.slice(rest.lastIndexOf(' ') + 1)));
}
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
/** JavaScript's `\s`, by character code. */
function isSpace(code: number): boolean {
    return code === 32 || (code >= 9 && code <= 13) || code === 160 || code === 0x1680 || (code >= 0x2000 && code <= 0x200A)
        || code === 0x2028 || code === 0x2029 || code === 0x202F || code === 0x205F || code === 0x3000 || code === 0xFEFF;
}
/*
 * Each standalone «ما» is found by indexOf and the text rebuilt from its
 * pieces. A replace() with a callback did the same work, but with thousands of
 * replacements in one text its cost stopped following the text's length
 * (measured: 5 KB of «ما ما…» 6 ms, 40 KB over a second).
 */
function readWithoutNegatingMa(t: string, withItsVerb: boolean, seen?: (before: string, opensItsClause: boolean, next: string) => void): string {
    const pieces: string[] = [];
    let kept = 0;
    let from = 0;
    for (;;) {
        const at = t.indexOf('ما', from);
        if (at < 0) break;
        const after = at + 2;
        from = after;
        // A word of its own: «ماذا», «تماما», «كما» are other words.
        if ((at > 0 && WORD_CHARACTER.test(t.charAt(at - 1))) || (after < t.length && WORD_CHARACTER.test(t.charAt(after)))) continue;
        // The word after it, on the same line and in the same clause.
        let wordStart = after;
        while (wordStart < t.length && isSpace(t.charCodeAt(wordStart)) && t.charCodeAt(wordStart) !== 10 && t.charCodeAt(wordStart) !== 13) wordStart += 1;
        let wordEnd = wordStart;
        if (wordStart > after) {
            while (wordEnd < t.length && !isSpace(t.charCodeAt(wordEnd)) && !CLAUSE_OPENS_AFTER.has(t.charCodeAt(wordEnd))) wordEnd += 1;
        }
        const next = wordEnd > wordStart ? t.slice(wordStart, wordEnd) : '';
        // The word after a «ما» is read with it, whatever it is («ما ما»: the second is the first one's word).
        if (next) from = wordEnd;
        // Back to where the clause opens, 64 characters at most: one short string, read by its codes.
        const floor = Math.max(0, at - 64);
        const window = t.slice(floor, at);
        let cut = window.length - 1;
        while (cut >= 0 && !CLAUSE_OPENS_AFTER.has(window.charCodeAt(cut))) cut -= 1;
        // The clause opens inside the window, or the window reaches the start of the text.
        const cutAtClause = cut >= 0 || floor === 0;
        if (maAsks(window.slice(cut + 1), cutAtClause, next)) continue;
        seen?.(window.slice(cut + 1), cutAtClause, next);
        const blankTo = withItsVerb && next ? wordEnd : after;
        pieces.push(t.slice(kept, at), ' '.repeat(blankTo - at));
        kept = blankTo;
    }
    return pieces.length ? pieces.join('') + t.slice(kept) : t;
}
//  The readers ask about the same few strings (his words, their canonical line) many times a message.
const maReadOut = rememberLastReadings((t: string) => readWithoutNegatingMa(t, false));
const maAndItsVerbReadOut = rememberLastReadings((t: string) => readWithoutNegatingMa(t, true));
export function withoutNegatingMa(text: string, withItsVerb = false): string {
    const t = String(text || '');
    if (!t.includes('ما')) return t;
    return withItsVerb ? maAndItsVerbReadOut(t) : maReadOut(t);
}

/**
 * «الصورة ما تظهر», «تسجيل الدخول ما يشتغل», «الجدول ما فيه عمود السعر», «ما عم
 * يشتغل الزر»: a «ما» that NEGATES what a thing does — after its subject, or
 * opening the clause before a word only a negated verb takes. Not the «ما»
 * that relates («بعد ما تخلص», «زي ما قلت», «كل ما أضغط», «نفّذ ما طلبته»): the
 * words it relates through are a closed class, and after a verb it is «what».
 * A subject is a definite noun, a pronoun, a Latin name («API ما بيرد») or a
 * word with its possessive («صفحتي ما تفتح»).
 */
const RELATES_THROUGH_MA = new Set(['بعد', 'قبل', 'كل', 'زي', 'مثل', 'متل', 'عند', 'حسب', 'لين', 'لما', 'حتي', 'بدل', 'طول', 'قد', 'وقت', 'ساعه', 'اول', 'حين',
    'كيف', 'وين', 'بحيث', 'اذا', 'لو', 'الا', 'مهما', 'حيث', 'عشان', 'علشان', 'لان', 'مع', 'بين', 'دون', 'بدون', 'غير', 'ريث', 'عدا', 'نوعا', 'يوما', 'اللي', 'الي', 'الذي', 'التي']);
const A_SUBJECT = /^(?:[وفب]?(?:ال|لل)[؀-ۿ]{2,}|[a-z0-9][a-z0-9_.-]*|انا|انت|انتي|هو|هي|احنا|نحن|هم|[؀-ۿ]{2,}(?:ي|ه|ها|نا|ك|كم|هم))$/iu;
export function negatesWhatAThingDoes(text: string): boolean {
    const t = stripArabicDiacritics(String(text || ''));
    if (!t.includes('ما')) return false;
    let negates = false;
    readWithoutNegatingMa(t, false, (before, opensItsClause, next) => {
        if (negates || !next) return;
        const said = before.trim();
        //  Opening its clause a «ما» is left to this reader only when it negates («ما عم يشتغل», «ما بيفتح»).
        if (!said || (opensItsClause && onlyLeads(said))) { negates = true; return; }
        const word = plainWord(said.slice(said.lastIndexOf(' ') + 1));
        if (RELATES_THROUGH_MA.has(word) || RELATES_THROUGH_MA.has(word.replace(/^[وف](?=.{2})/u, ''))) return;
        negates = A_SUBJECT.test(word);
    });
    return negates;
}

const folded = (list: string) => new Set(list.split(/\s+/).filter(Boolean).map(w => foldChars(w)));
/** The build verbs a later sentence may open with (hasRequestedAction's «laterCommand»). */
export const LATER_BUILD_ORDER: OrderWords = {
    ar: folded('ابن ابني ابنى أنشئ انشئ انشي اصنع طور نفذ صمم اكتب برمج اعمل سوي'),
    en: /^(?:build|create|make|develop|implement|design|code|write)\b/i,
};
/** Any deed a later sentence may open with: making, running, publishing, fixing, deleting… */
export const LATER_DEED_ORDER: OrderWords = {
    ar: folded('ابن ابني انشئ انشي اصنع صمم طور سوي اعمل برمج شغل اوقف انشر عدل احذف امسح اصلح صلح افتح ابحث نفذ ارسل حمل نزل ثبت احفظ انسخ انقل اختبر افحص جرب ارفع نظف'),
    // Not «make it short», «add an example», «write two sentences»: those shape the answer.
    en: /^(?:build|create|develop|generate|scaffold|implement|deploy|publish|run|edit|delete|remove|fix|open|search|execute|install|update|rename|move|copy|save|push|ship|launch|do)\b/i,
};

/**
 * ⛔ A FILE DENIAL BESIDE AN ORDER IT DOES NOT FORBID IS A CONDITION ON THAT ORDER.
 *
 * «لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة» was built, and after the
 * denial reader learnt its list of verbs it was answered with words: the
 * denial of every file change swallowed the order beside it. But the verbs he
 * denied are EDIT and DELETE, and the order is to CREATE — a new page touches
 * no file that exists. And «شغّل المشروع ولا تنشئ أي ملفات» was never run in
 * either tree: running a project writes no file of his, so the denial is how
 * he wants it run, not a refusal to run it.
 *
 * Two orders stand beside a denial of file changes:
 *  - an order to RUN, which opens the message once the denial is read out;
 *  - an order to CREATE a thing, when no verb of the denial creates or writes
 *    («لا تنشئ أو تعدل أي ملف، وابني لي صفحة» still denies the page).
 * An order to add, change or fix edits a file that exists, and stays denied
 * («لا تعدل أو تحذف أي ملف، وأضف زر»); so does anything beside «read only»,
 * «answer only» or a denial of every change («لا تعدل ولا تحذف شيئاً»).
 */
const CREATING_IN_A_DENIAL = /\b(?:create|write)\b|تنشئ|تنشي|تكتب|كتاب[ةه]|[إا]نشاء|تغييرات/iu;
//  «نفّذ فحصاً محلياً باستخدام shell_execute … ولا تعدّل ملفات», «نفّذ فحص بناء … لا تعدّل أي ملف»: to
//  execute a check, a command, a test or a script is to run it. Both were shell runs until the denial
//  reader learnt to read «تعدّل» through its shadda; then both were answered with words.
const RUN_ORDER: OrderWords = {
    ar: folded('شغل شغلي نفذ'), en: /^(?:run|start|launch|execute)\b/i,
    object: /^(?:ال)?(?:فحص|[اأ]مر|[اأ]وامر|اختبار|اختبارات|تستات|سكربت)ا?$/u,
};
/** What is run: his project, app, server, site or tests, a check, a command or a script, or «it» — "Run the code review. Do not modify any files." runs nothing. */
const WHAT_IS_RUN = /(?<![\p{L}\p{N}_])(?:ال|لل)?(?:مشروع|تطبيق|سيرفر|خادم|موقع|نظام|برنامج|متجر|اختبار|اختبارات|تستات|فحص|[اأ]مر|[اأ]وامر|سكربت)(?:ا|ي|نا|ه|ها)?(?![\p{L}\p{N}_])|^[وف]?شغل(?:ه|ها|و|وه)(?![\p{L}\p{N}_])|\b(?:project|app|application|server|site|website|system|program|tests?|checks?|commands?|scripts?|build|it)\b/iu;
const CREATE_ORDER: OrderWords = {
    //  …and as Egypt and the Levant say it to him: «اعملي صفحة», «اعمللي», «سويلي» («لي» joined to the verb).
    ar: folded('ابن ابني ابنى أنشئ انشئ انشي اصنع صمم اعمل سوي سو اعملي اعمللي سويلي'),
    en: /^(?:build|create|make|generate|design|scaffold)\b/i,
    object: /^(?:ال)?(?:ملف|ملفا|ملفات)$/u,
};
/**
 * The finite version-and-path diagnostics («اعرض إصدار Node.js ومسار مساحة العمل
 * الحالية. لا تعدل الملفات…») already have their own way through a file denial,
 * and it is keyed on that denial (boundedNoFileTerminalCommands): they keep it.
 * Asked only of a run order beside a file denial, and required when asked —
 * that module reads its quotes through this one.
 */
function isFileProhibitedDiagnostic(text: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const diagnostics = require('../orchestrator/runtime-diagnostic-contract') as { boundedNoFileTerminalCommands?: (request: string) => string[] | null };
    return typeof diagnostics.boundedNoFileTerminalCommands === 'function' && !!diagnostics.boundedNoFileTerminalCommands(text);
}
/** Every file denial read out of the sentence; what stood after each one stays. */
//  `withWhatTheyName`: what follows the denied files in their own clause goes with them — «… أي ملف غير
//  index.html», «… أي ملف في مجلد tests», "… any file except config.json" name the files the denial is
//  about, never what he orders (the «index.html» of a bare restriction named an HTML tool, and a plan).
export function withoutFileDenials(text: string, withWhatTheyName = false): string {
    const kept = (tail: string) => ` ${withWhatTheyName ? tail.replace(/^[^،,]*/u, '') : tail}`;
    //  …and so does what «without changing» keeps: the «files» of "Add dark mode without changing any files
    //  except style.css" named archive_files once the phrase stopped being a refusal.
    const said = stripArabicDiacritics(String(text || ''));
    return (withWhatTheyName && /\bwithout\s/i.test(said) ? said.replace(EACH_WITHOUT_CHANGING_EN, ' ') : said)
        .replace(FILE_DENIAL_EN, (_whole, _verbs: string, _object: string, tail: string) => kept(tail))
        .replace(FILE_DENIAL_AR, (_whole: string, ...rest: unknown[]) => kept(((rest[rest.length - 1] || {}) as { tail?: string }).tail || ''));
}
/** Its clauses, in order — sixty at most: an order beside a denial is never further in. */
function clausesOf(text: string): string[] {
    const clauses: string[] = [];
    for (const m of text.matchAll(/[^.!؟?;؛\n،,]+/gu)) {
        const clause = m[0].trim();
        if (clause) clauses.push(clause);
        if (clauses.length >= 60) break;
    }
    return clauses;
}
/**
 * The request with its file denial read out, when the denial stands beside an
 * order it does not forbid (above); null when the denial is the whole of it.
 * Asked with the text as he wrote it, without its quoted copy.
 */
export function fileDenialBesideItsOrder(text: string): { freed: string; order: 'run' | 'create' } | null {
    const t = stripArabicDiacritics(String(text || ''));
    if (!deniesEveryFileChange(t)) return null;
    const freed = withoutFileDenials(t);
    //  What is left still denies («no file changes», «لا تعدل ولا تحذف شيئاً»), or says «read only» / «answer only».
    if (freed === t || deniesEveryFileChange(freed) || READ_ONLY_PATTERN.test(freed) || ANSWER_ONLY_PATTERN.test(freed)) return null;
    const clauses = clausesOf(freed);
    if (!clauses.length) return null;
    if (opensWithAnOrder(clauses[0], RUN_ORDER) && WHAT_IS_RUN.test(clauses[0]) && !isFileProhibitedDiagnostic(t)) return { freed, order: 'run' };
    let creates = false;
    for (const m of t.matchAll(FILE_DENIAL_EN)) if (CREATING_IN_A_DENIAL.test(m[1] || '')) creates = true;
    for (const m of t.matchAll(FILE_DENIAL_AR)) {
        const tail = m.groups?.tail || '';
        if (CREATING_IN_A_DENIAL.test(m[0].slice(0, m[0].length - tail.length))) creates = true;
    }
    if (creates) return null;
    return clauses.some(clause => opensWithAnOrder(clause, CREATE_ORDER) && makesAThingBuiltInFiles(clause)) ? { freed, order: 'create' } : null;
}
/**
 * ⛔ «MAKE A PLAN» BESIDE «DO NOT MODIFY ANY FILES» MAKES NO FILE.
 *
 * Once an order to create stood free beside a denial of edits, ANY «make X» did:
 * "Do not modify any files. Make a plan for the refactor.", «لا تعدل أي ملف، سوي لي
 * خطة للتعديلات», «… اعمل لي ملخص للمشروع», "… Make a list of the problems you see."
 * were all BUILT — a project scaffolded for a request that asked for words and
 * forbade every change. The verbs «make», «create», «اعمل», «سوي» say nothing of
 * what is made; the object does.
 *
 * The order is freed only when its object is a thing that is built in files: a
 * page, a site, an app, a component, a screen, a file. A plan, a list, a summary,
 * a report, a backup, an explanation — and any object this reader does not know —
 * leave the denial whole, as it was before the order could be freed at all.
 *
 * The object is the head of what the verb takes. In Arabic the head comes first
 * («صفحة تقرير» is a page, «تقرير عن الصفحة» a report); in English it comes last,
 * before the first preposition («a todo list app» is an app, «a site plan» a plan,
 * «a list of the pages» a list).
 */
const BUILT_IN_FILES_AR = /^(?:ال|لل)?(?:موقع|صفح[ةه]|صفحات|صفحتين|تطبيق|متجر|نظام|منص[ةه]|لوح[ةه]|واجه[ةه]|[اأ]دا[ةه]|برنامج|بواب[ةه]|خدم[ةه]|لعب[ةه]|مدون[ةه]|سكربت|بوت|مشروع|نموذج|استمار[ةه]|فورم|مكون|كومبوننت|شاش[ةه]|ملف|ملفات|داشبورد|حاسب[ةه])(?:ا|ين)?$/u;
const BUILT_IN_FILES_EN = /^(?:pages?|sites?|websites?|webpages?|homepages?|apps?|applications?|webapps?|components?|screens?|dashboards?|forms?|stores?|shops?|blogs?|portfolios?|games?|tools?|scripts?|apis?|servers?|services?|backends?|frontends?|interfaces?|ui|systems?|platforms?|projects?|programs?|modules?|widgets?|calculators?|trackers?|bots?|cli|extensions?|plugins?|templates?|portals?|files?|prototypes?|clones?)$/i;
const MADE_OF_WORDS_EN = /^(?:plans?|lists?|summar(?:y|ies)|reports?|backups?|explanations?|analys[ei]s|reviews?|outlines?|overviews?|checklists?|roadmaps?|proposals?|diagrams?|estimates?|cop(?:y|ies)|notes?|comparisons?|descriptions?|drafts?|sketch(?:es)?|audits?|inventor(?:y|ies)|breakdowns?|guides?|tables?|charts?|strateg(?:y|ies)|documents?|docs?|mockups?|wireframes?|designs?|ideas?|names?|diffs?|snapshots?)$/i;
/** Where the English object ends: what follows says what it is for, of or about. */
const AFTER_THE_OBJECT_EN = /^(?:for|of|about|to|that|with|in|on|from|which|where|who|showing|listing|describing|explaining|using|named|called|and|or|then|so|as|by|at|into)$/i;
/** «أي صفحة», «أول موقع», «كم صفحة»: a word before the head that is not it. */
const BEFORE_THE_OBJECT_AR = /^(?:[أا]ي|[أا]ول|كم|عد[ةه]|بعض|مجموع[ةه])$/u;
function makesAThingBuiltInFiles(clause: string): boolean {
    //  The verb, then «لي» / "me", then the object: twelve words are more than any object's own.
    const words = clause.replace(SEQUENCE_LEAD, '').split(/[\s:]+/u, 14).filter(Boolean)
        .map(word => word.slice(0, 40).replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]$/u, ''));
    let at = 1;
    if (/^(?:لي|لنا|لك|me|us)$/iu.test(words[at] || '')) at += 1;
    if (BEFORE_THE_OBJECT_AR.test(words[at] || '')) at += 1;
    const head = words[at] || '';
    if (!/^[a-z]/i.test(head)) return BUILT_IN_FILES_AR.test(head);
    let built = false;
    for (let i = at; i < words.length; i++) {
        const word = words[i].replace(/['’]s$/i, '');
        if (i > at && AFTER_THE_OBJECT_EN.test(word)) break;
        if (BUILT_IN_FILES_EN.test(word)) built = true;
        else if (MADE_OF_WORDS_EN.test(word)) built = false;
    }
    return built;
}

/**
 * ⛔ AN ORDER TO INSPECT HIS PROJECT, WITH NO CHANGE ALLOWED, IS AN INSPECTION.
 *
 * «افحص المشروع دون إنشاء أي ملفات أو تعديلها، وأخبرني بما تجده» went to the
 * read-only audit — the pipeline reads the workspace and stops before it plans
 * — until the denial reader learnt «أي ملفات»; then it was answered from
 * nothing, no file read. A denial of changes beside an order to inspect, audit
 * or review THE PROJECT (the workspace, the repository — what only reading it
 * can inspect) is the manner of the inspection. It is read only when the words
 * are the ones the read-only boundary itself knows («دون إنشاء», «دون تعديل»,
 * "do not modify", "without changing"): the pipeline stops before planning on
 * those words and no others. «راجع الكود ولا تعدل أي ملف» and «Explain hooks.
 * Do not create any files.» are still answered.
 */
/** The Arabic words isReadOnlyStructural and the pipeline's isReadOnlyRequest both stop on («بدون تعديل», «من دون إنشاء»). */
//  …and the same denial as Egypt and the Levant say it: «بدون ما تعدل أي ملف، افحص المشروع», «من غير ما تغير أي
//  ملف، راجع المشروع», «ما تعدلش أي ملف، افحص المشروع», «متعدلش أي ملف وراجع المشروع» were a file denial and no
//  inspection — answered from nothing, no file read — while the pipeline's boundary already knew them.
const READ_ONLY_BOUNDARY_WORDS_AR = new RegExp(String.raw`(?:^|[\s،:؛.!?])(?:(?:من\s+)?ب?دون\s+(?:أي\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف)(?![\p{L}\p{N}_])|${DIALECT_DENIAL_AR})`, 'u');
const OPENS_IN_HIS_DIALECT = new RegExp(String.raw`^[\s،:؛.!?]?(?:${DIALECT_DENIAL_AR})`, 'u');
/** Does the request deny every file change in the dialects' own words («ما تعدلش أي ملف», «بدون ما تغير الملفات»)? */
export function deniesEveryFileChangeInHisDialect(text: string): boolean {
    const t = stripArabicDiacritics(String(text || ''));
    for (const m of t.matchAll(FILE_DENIAL_AR)) {
        if (OPENS_IN_HIS_DIALECT.test(m[0]) && arabicFileDenialIsWhole(m.groups?.own || '', m.groups?.tail || '')) return true;
    }
    return false;
}
//  After the mark that opens the clause only the spaces of its own line are skipped: with `\s*`
//  every line break of a run opened a clause and skipped the rest of the run (20 KB of blank
//  lines: 2.2 s of processor time for one reading).
/*
 * …AND THE DENIAL MAY COME FIRST. «بدون تعديل أي ملف، افحص المشروع وقل لي المشاكل»,
 * «من فضلك، بدون تعديل أي ملف، افحص المشروع», "Without changing any files, review
 * the project" put the manner before the order; the verb was looked for only at
 * the head of a SENTENCE, so each was answered from nothing, no file read. The
 * order opens a clause: after a comma too, or joined to what came before it by
 * «و» / «ف» / "and" («بدون تعديل أي ملف وافحص المشروع»).
 */
const INSPECTS_HIS_PROJECT = new RegExp([
    //  …and to list or read what the workspace holds is to inspect it: «اعرض ملفات مساحة العمل الرئيسية،
    //  ثم لخّص README للمستخدم دون تعديل أي ملف» was the read-only boundary's, and was answered instead.
    String.raw`(?:(?:^|[.!؟?;؛\n،,])[^\S\n]*(?:(?:من\s+فضلك|لو\s+سمحت|رجاء)\s+)?[وف]?|[^\S\n][وف])(?:[اإأ]فحص|تفحص|راجع|دقق|استكشف|حلل|عاين|تفقد|تحقق\s+من|اطلع\s+على|[اأ]عرض|[اأ]سرد|[اإ]قر[أا])\s+(?:لي\s+)?(?:(?:كل|جميع|كامل|بني[ةه]|هيكل|ملفات|محتويات|كود|حال[ةه])\s+)?(?:ال)?(?:مشروع|مستودع|ريبو|مساح[ةه]\s+العمل)(?:ي|نا)?(?![\p{L}\p{N}_])`,
    String.raw`(?:(?:^|[.!?;\n,،])[^\S\n]*(?:(?:and|then|but|just)\s+)?(?:please\s+)?|[^\S\n](?:and|then)\s+)(?:inspect|review|audit|examine|check|analy[sz]e|explore|scan)\s+(?:(?:the|my|our|this|whole|entire|existing|current)\s+){0,3}(?:project|workspace|repo(?:sitory)?|codebase)\b`,
].join('|'), 'iu');

/** Quoted examples and copy are data; share this boundary with structural build detection. */
export function unquotedIntentText(raw: string): string {
    return String(raw || '').replace(/[\u201C\u201D«»]/g, '"')
        .replace(/[\u2018\u2019`´]/g, "'")
        .replace(/"[^"]*"|(?<!\w)'[^']*'(?!\w)/g, '');
}

/**
 * ⛔ AN EXCLUSION OF ONE THING IS NOT A REFUSAL TO BUILD.
 *
 * «Build a REST API for todos. Do not create a frontend.», «Write a Python CLI …
 * Do not create a web app.», «Don't build a website. Write a Python script …»
 * were read as global execution denials, while «… No UI.» built (eval round
 * 19). A «do not <make> <a part>» clause scopes the denial to that part —
 * a database, a login, an interface, a page, a website — and is removed before
 * the denial readers run. With no object, or «anything / code / files», it
 * stays a global denial.
 *
 * A backend is a part too: «Build a real weather web application … do not
 * build a project-owned backend» was refused as a whole build once the global
 * «do not build» reader arrived (b906f3bc8); the WeatherGo pins (093082cb3)
 * caught it.
 *
 * …AND SO IS A NEW PROJECT. «شغّل مشروع لوحة مهامي القائم … لا تنشئ مشروعاً
 * جديداً ولا تثبّت حزمًا» asked to RUN his project; the bare «لا تنشئ» made it
 * a request to do nothing, and he got prose. «Do not create a new project»,
 * «without creating a new project», «دون إنشاء مشروع جديد» name what is not to
 * be made — the project he already has is what is to be worked on. The
 * «without <making> <a part>» form is the same exclusion: «Build a todo app
 * without creating a database» was refused as a whole build.
 */
const EXCLUDED_PART = String.raw`(?:(?:a|an|the|any)\s+)?(?:(?:new|another|second|separate|react|web|mobile|graphical|user|admin|front[- ]?end|login|project[- ]owned)\s+)?(?:database|db|login(?:\s+page)?|authentication|auth|web\s*app(?:lication)?|website|web\s*site|front[- ]?end|back[- ]?end|ui|gui|user\s+interface|interface|pages?|dashboard|screens?|project|repo(?:sitory)?)`;
// The separators are disjoint («, or», « or ») and the end is a lookahead
// that consumes nothing: `\s*,?\s*` and a trailing `\s*` before `\s+(?:and…)`
// split a run of spaces every way they could (quadratic on 5 KB of them).
const SCOPED_EXCLUSION_EN = new RegExp(String.raw`\b(?:(?:do\s+not|don['’]?t|never)\s+(?:create|build|generate|write|make|add|include|use)|without\s+(?:creating|building|generating|writing|making|adding|including|using))\s+${EXCLUDED_PART}(?:(?:\s*,\s*|\s+)(?:or|and|nor)\s+${EXCLUDED_PART})*(?=\s*(?:[.!?;,:\n]|$)|\s+(?:and|but|or|then)\b)`, 'gi');
/** The parts in Arabic, as written and as folded («إدارة» → «اداره», «مشروعاً» → «مشروعا»). */
const AR_EXCLUDED_PART = String.raw`(?:أي\s+|اي\s+)?(?:واجه[ةه](?:\s+(?:مستخدم|المستخدم|أمامية|امامية|اماميه|ويب|رسومية|رسوميه))?|موقع[اً]?|صفح[ةه]|صفحات|تطبيق[اً]?\s+ويب|لوح[ةه]\s+(?:تحكم|إدارة|ادارة|اداره)|قاعد[ةه]\s+(?:ال)?بيانات|تسجيل\s+(?:ال)?دخول|(?:مشروع|مستودع)[اً]?(?:\s+(?:جديد[اً]?|آخر|اخر|ثاني[اً]?|ثان|منفصل[اً]?))?)`;
const SCOPED_EXCLUSION_AR = new RegExp(String.raw`(?:^|(?<=[\s،:؛.!?]))(?:و?لا\s+(?:تنشئ|تنشي|تبني|تبن|تعمل|تصمم|تضيف|تسوي)|(?:ب?دون|من\s+غير)\s+(?:أي\s+|اي\s+)?(?:إنشاء|انشاء|انشا|بناء|بنا|عمل|تصميم|إضافة|اضافة|اضافه))\s+${AR_EXCLUDED_PART}(?=$|[\s،:؛.!?])`, 'gu');
function stripPartExclusions(text: string): string {
    return withoutChangeExclusions(String(text || '').replace(SCOPED_EXCLUSION_EN, ' ').replace(SCOPED_EXCLUSION_AR, ' '));
}
//  Read without harakat: «ولا تُنشئْ صفحةً جديدةً» excludes what «ولا تنشئ صفحة جديدة» excludes. One text is read
//  once: every reader of a request asks for the same few texts without their exclusions, several times each.
const scopedExclusionsReadOut = rememberLastReadings((text: string) => stripNarrowedFileDenials(stripPartExclusions(stripArabicDiacritics(text))));
export function stripScopedExclusions(text: string): string {
    return scopedExclusionsReadOut(String(text || ''));
}

/**
 * ⛔ AN EXCLUSION WITH NOTHING ELSE ORDERED IS A REFUSAL.
 *
 * «صف لي متجر مثالي بدون بناء موقع», «اقترح لي فكرة متجر بدون بناء موقع»,
 * «خطط لي متجر بدون بناء موقع», «Do not create a new project.» ask for words
 * only; the exclusion is the only deed in them. Scoping it to the part (a
 * site, a new project) is right only when something else is ordered — «اعمل
 * لي تطبيق جوال بدون بناء موقع», «Run the existing app. Do not create a new
 * project.», «أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد». With no order
 * left, the exclusion stays what it always was: a denial of the whole build.
 * Describing, explaining, suggesting and planning are not orders here.
 */
/*
 * …and the test is what is LEFT, never a list of verbs that count as orders. The
 * second review, 2026-11-12: with a closed list, «غيّر لون الزر للأحمر ولا تنشئ صفحة
 * جديدة», «كبّر الخط بدون إنشاء صفحة جديدة», «ممكن تضيف زر واتساب بدون إنشاء صفحة
 * جديدة», "Polish the homepage. Do not create a new project.", "Could you add a
 * footer without creating a new page?" were all «nothing ordered» — answered with
 * words, the change never made. Orders are an open class; what asks for words only
 * is small: nothing left at all, a telling verb at the head (describe, explain,
 * suggest, plan — صف، اشرح، اقترح، خطط), or a question that is not a polite request.
 */
const WORDS_ONLY_LEAD = /^(?:(?:من\s+فضلك|لو\s+سمحت|رجاء|ممكن|please|kindly|can\s+you|could\s+you|would\s+you)\s+)?(?:(?:صف|[اأ]وصف|اشرح|وضح|اقترح|خطط|لخص|قل|قول|خبر|[اأ]خبر|احك|احكي|اذكر|عدد|قارن|فكر)(?:لي|ني|لنا|ي)?(?=$|[^\p{L}\p{N}_])|(?:describe|explain|suggest|propose|plan|outline|tell|summari[sz]e|brainstorm|compare|imagine)\b)/iu;
const QUESTION_LEAD = /^(?:كيف|كيفية|لماذا|ليش|ليه|لي[هش]|وش|شو|[اإأ]يش|ما(?=\s)|ماذا|متى|[اأ]ين|وين|هل\s+(?!ممكن|يمكن|تقدر|تستطيع)|what\b|how\b|why\b|which\b|when\b|where\b|who\b|is\s+it\b|are\s+there\b|does\b|do\s+(?:i|we)\b)/iu;
/*
 * Only the HEAD of what is left is read, so only the head is trimmed. The tail
 * was trimmed too, with `[\s.،…]+$` — and an end-anchored run is tried again from
 * every character of every run in the text: «شغل المشروع», 20 KB of blank lines,
 * «ولا تعدل أي ملف» cost 18.8 s of processor time for one reading. The leading
 * trim already leaves nothing when nothing but marks is left.
 */
function asksForWordsOnly(text: string): boolean {
    const left = String(text || '').replace(/^[\s.،,;:؛!؟?«»"'()-]+/u, '');
    if (!left) return true;
    // «ما عم يشتغل الزر» opens with a negation, not with «what».
    return WORDS_ONLY_LEAD.test(left) || QUESTION_LEAD.test(withoutNegatingMa(left).trimStart());
}

/**
 * ⛔ «EXPLAIN HOW TO BUILD IT» ASKS FOR THE HOW, NOT THE BUILD.
 *
 * «اشرح لي كيف أعمل جدول في إكسل فيه الاسم والراتب والقسم», «علمني كيف أسوي
 * جدول…», «ابغى اعرف كيف اسوي جدول…», «اشرح لي كيف أبني متجراً», «Explain how
 * to design a users table…» name the deliverable as the subject of a lesson.
 * A tell verb followed by a «how», or a wish to know, opens a question exactly
 * as «كيف …» and «How do I …» do; a later order («… ثم ابنه», «Explain it,
 * then build it») still counts.
 */
const TELL_HOW_LEAD = /^\s*(?:(?:من\s+فضلك|لو\s+سمحت|please)\s+)?(?:(?:(?:اشرح|اشرحلي|وضح|وضحلي|علمني|علمنى|فهمني|فهمنى|قلي|قل\s+لي|قولي|خبرني|اخبرني|أخبرني|احكيلي|وريني|ورجيني)\s+(?:لي\s+|لنا\s+)?|(?:ابغى|ابغي|ابغا|ابى|ابي|أبي|بدي|اريد|أريد|ودي|عايز|عاوز|حاب|حابب)\s+(?:اعرف|أعرف|افهم|أفهم|اتعلم|أتعلم)\s+)(?:كيف|كيفية|كيفيه|ازاي|إزاي|شلون|اشلون|كيفاش)(?=$|[\s،:؛؟])|(?:explain|show|teach|tell)\s+(?:me\s+|us\s+)?how\b|i\s+(?:want|need|would\s+like|'d\s+like)\s+to\s+(?:know|learn|understand)\s+how\b)/iu;

/**
 * ⛔ ONE MESSAGE IS READ ONCE.
 *
 * The front door asks hasRequestedAction about the same message 12–14 times
 * (isBuildRequest, isKnowledgeQuestionStructural, asksForAThingThatHolds,
 * classifyIntent, quickIntent… each asks again), and every reading
 * normalizes it, strips its quotes and exclusions and reads its columns. The
 * readers are pure functions of the text, so the last few readings are kept:
 * a 5 KB message costs one reading, not fourteen. Each caller gets its own
 * copy of a reading, so no caller can change another's.
 */
export function rememberLastReadings<R>(read: (text: string) => R, size = 16): (text: string) => R {
    const memo = new Map<string, R>();
    return (text: string) => {
        const key = String(text ?? '');
        if (memo.has(key)) {
            const known = memo.get(key) as R;
            memo.delete(key);
            memo.set(key, known);
            return known;
        }
        const value = read(key);
        memo.set(key, value);
        if (memo.size > size) memo.delete(memo.keys().next().value as string);
        return value;
    };
}
const readRequestedActionOnce = rememberLastReadings(readRequestedAction);
export function hasRequestedAction(goalRaw: string): RequestedActionResult {
    return { ...readRequestedActionOnce(String(goalRaw || '')) };
}

/**
 * «I want to know how much I spent, make me a table…»: a wish to know a
 * quantity, never a wish to learn how. Only this wish lets an order after a
 * comma count (ordersInALaterClause); «how to», «how do I», «how it works»
 * keep the lesson they ask for.
 */
const WISH_TO_KNOW_HOW_MUCH = /^\s*(?:please\s+)?i\s+(?:want|need|would\s+like|'d\s+like)\s+to\s+(?:know|learn|understand|see|find\s+out)\s+how\s+(?:much|many)\b/i;
/** The orders a clause after that wish may open with. Not «write it in two sentences», «make it short»: those shape the answer. */
const CLAUSE_BUILD_ORDER: OrderWords = {
    ar: new Set<string>(),
    en: /^(?:build|create|make|develop|implement|design|generate)(?=\s+(?:(?:me|us)\s+)?(?:a|an|the|my|our|some|one)\b)/i,
};

/**
 * «لا تسوي شي الحين», «لا تعمل أي شيء», "Do nothing for now.": an order to do
 * nothing denies every deed. «بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين»
 * was sent to the deploy tool for the «نشر» in what HE will do. The Arabic is
 * second person («لا تسوي»), never «الزر لا يسوي شي»; the English must open its
 * clause — "the button does nothing" reports a fault.
 */
const DO_NOTHING = /(?:^|[\s،:؛.!?])[وف]?لا\s+(?:تسوي|تسو|تعمل|تفعل)\s+(?:(?:أي|اي)\s+)?(?:شي|شيء|شيئا|شئ|اشي|حاج[ةه])(?![\p{L}\p{N}_])|(?:^|[.!?;,\n])[^\S\n]*(?:please\s+)?(?:do\s+nothing|do\s+not\s+do\s+anything|don['’]?t\s+do\s+anything)\b/giu;
/** «لا تسوي شي غير…», "do nothing else": nothing BUT something — no order to do nothing. */
const NOTHING_BUT = /^\s+(?:غير|الا|إلا|سوى|ثاني|ثانية|اخر|آخر|زياد[ةه]|else|except|but|other|more)(?![\p{L}\p{N}_])/iu;
/**
 * ⛔ «DO NOTHING TO THE HEADER» EXCLUDES THE HEADER. IT REFUSES NOTHING ELSE.
 *
 * «لا تسوي شي في الهيدر، بس غير لون الفوتر», «لا تعمل شي بالتصميم، بس صلح الخطأ»,
 * "don't do anything to the database, just fix the form", "Do nothing to the
 * header; change the footer color to black" were each answered with words and
 * nothing was changed: the order to do nothing was read wherever it stood, and
 * a global denial outranks the order beside it.
 *
 * It denies every deed only when it is about everything and nothing is ordered
 * after it:
 *  - a preposition and the thing it names («في الهيدر», «بالتصميم», «للهيدر»,
 *    "to the database", "with the styles") SCOPE it to that thing — an
 *    exclusion, like «do not build a database». Not the prepositions of time
 *    and manner: «في الوقت الحالي», "for now", "at all", «بالمرة» name no thing;
 *  - «بس», «فقط», «لكن», "just", "only", "but" after it open what he DOES want;
 *    when that is an order («بس صلح الزر», "just fix the form") the order is
 *    the request. When it asks for words («لا تسوي شي، بس اشرح لي الكود»,
 *    "don't do anything yet, just explain the plan") the denial stands.
 * And an exclusion with nothing else ordered is still a refusal, as it is for a
 * part («Explain the header. Don't do anything to it yet»).
 *
 * Each order to do nothing is read with the 240 characters after it, so the
 * reading is linear in the text.
 */
const NO_THING_NAMED_AR = String.raw`(?:(?:هذا|هذه|هذي|ها)\s*)?(?:ال)?(?:وقت|لحظ[ةه]|حين|فتر[ةه]|مرحل[ةه]|يوم|طول|نفسك|راسك|كيفك)`;
const NO_THING_NAMED_EN = String.raw`(?:now|the\s+(?:moment|meantime|time\s+being|present)|a\s+(?:while|bit|moment|second|sec|minute)|today|tonight|your\s+own|yourself|advance|general|particular|return|response|(?:me|us|all|once)\b|this\s+(?:moment|time|point|stage)|that\s+(?:case|point)|any\s+case)`;
const NOTHING_TO_A_THING = new RegExp([
    String.raw`^\s+(?:في|فى|على|علي|ع|مع|داخل|ضمن|بخصوص|حول)\s+(?!${NO_THING_NAMED_AR}(?![\p{L}\p{N}_]))(?:(?:هذا|هذه|هذي)\s+)?[\p{L}\p{N}_-]+`,
    String.raw`^\s+(?:بال|لل|عال|فال)(?!(?:وقت|مر[ةه]|لحظ[ةه]|حين|ان|آن|غلط|خط[أا]|كامل)(?![\p{L}\p{N}_]))[\p{L}\p{N}_-]{2,}`,
    //  «بالتصميم» on the canonical line: its verbal noun is read out there (withoutDefiniteVerbalNouns), the «ب» stays.
    String.raw`^\s+[بل](?![\p{L}\p{N}_])`,
    String.raw`^\s+(?:to|with|on|in|inside|about|for|at|regarding)\s+(?!${NO_THING_NAMED_EN})(?:(?:the|my|our|your|this|that|these|those|any|a|an)\s+)?[\p{L}\p{N}_-]+`,
].join('|'), 'iu');
const WHEN_WORD = String.raw`(?:الحين|الان|الآن|هلا|هلق|هسا|حاليا|ابدا|أبدا|for\s+now|right\s+now|now|yet|please|at\s+all)`;
const WHEN_NOTHING = String.raw`(?:\s+${WHEN_WORD})*`;
const BUT_ONLY_THIS = new RegExp(String.raw`^${WHEN_NOTHING}[\s.،,;:؛!-]*[وف]?(?:بس|فقط|لكن|انما|إنما|just|only|but|instead)(?![\p{L}\p{N}_])[\s،,:]*`, 'iu');
/*
 * ⛔ «DO NOTHING TO THE HEADER FOR NOW» IS STILL A REFUSAL, AND TO WAIT IS NO DEED.
 *
 * The fifth pre-merge review (2026-11-12): «لا تسوي شي في الهيدر الحين», "Don't do anything
 * to the header for now", «لا تسوي شي في المشروع الحين، بس قل لي رايك» were no refusal once
 * the scope was read: what was left opened with the time word, and a time word is not what
 * asks for words. And «لا تسوي شي بس استنى», "Don't do anything, just wait" were orders —
 * «بس», "just" opened something, and anything that is not a telling verb was a deed.
 *
 * The head of what is left is read past its marks, its words of time («الحين», "for now",
 * "yet") and one «بس» / "just" — in that order, each once, from the start of the text, so
 * the reading is linear. And the verbs of waiting order no deed: the refusal stands.
 */
const HEAD_OF_WHAT_IS_LEFT = new RegExp(String.raw`^(?:[\s.،,;:؛!-]*${WHEN_WORD}(?![\p{L}\p{N}_]))*[\s.،,;:؛!-]*(?:[وف]?(?:بس|فقط|لكن|انما|إنما|just|only|but|instead)(?![\p{L}\p{N}_])[\s،,:]*)?`, 'iu');
const WAITS_ONLY = /^(?:[وف]?(?:انتظر|انتظرني|انتظري|استن[ىاي]?|استناني|اصبر|اصبري|تمهل|خليك)|wait|hold\s+on|hold\s+off|hang\s+on|stand\s+by|sit\s+tight)(?![\p{L}\p{N}_])/iu;
function ordersNoDeed(text: string): boolean {
    const left = String(text || '').replace(/^[\s.،,;:؛!؟?«»"'()-]+/u, '');
    return asksForWordsOnly(left) || WAITS_ONLY.test(left);
}
function ordersNothingAtAll(text: string): boolean {
    const left: string[] = [];
    let kept = 0;
    let excludesAThing = false;
    for (const m of text.matchAll(DO_NOTHING)) {
        const end = (m.index || 0) + m[0].length;
        if (end <= kept) continue;
        const after = text.slice(end, end + 240);
        if (NOTHING_BUT.test(after)) continue;
        const thing = NOTHING_TO_A_THING.exec(after);
        const onlyThis = thing ? null : BUT_ONLY_THIS.exec(after);
        if (!thing && !(onlyThis && !ordersNoDeed(after.slice(onlyThis[0].length)))) return true;
        if (thing) excludesAThing = true;
        left.push(text.slice(kept, m.index));
        kept = end + (thing || onlyThis as RegExpExecArray)[0].length;
    }
    if (!excludesAThing) return false;
    left.push(text.slice(kept));
    //  The words of time and «بس», «فقط», "just" before the order that is left are not its head.
    return ordersNoDeed(left.join(' ').replace(HEAD_OF_WHAT_IS_LEFT, ''));
}

function readRequestedAction(goalRaw: string): RequestedActionResult {
    // Harakat and tatweel are stripped once, here: every reader below sees the
    // letters he wrote, so «ولا تُنشئْ صفحةً» and «ولا تنشئ صفحة» are one request.
    const g = stripArabicDiacritics(String(goalRaw || ''));

    // Helper: strip quoted content (straight + smart/curly double quotes) to avoid false positives
    // on denial phrases that appear inside quoted text
    // Single quotes act as delimiters only when NOT intra-word (preserves contractions like "Don't", "designer's")
    // Normalize curly/smart quotes and apostrophes to straight ones for consistent matching
    function normalizeQuotes(text: string): string {
        return text
            .replace(/["""]/g, '"')
            .replace(/[''']/g, "'")
            .replace(/[`´]/g, "'")
            .replace(/[\u2018\u2019]/g, "'")  // left/right single quotation marks
            .replace(/[\u201C\u201D«»]/g, '"'); // double quotation marks, including guillemets
    }

// Check for global execution denial phrases in the ORIGINAL text (before normalization)
    // This preserves Chinese/Arabic denial phrases that might be normalized away
    // Also check stripped version (without quoted content) to avoid false positives
    // from denial phrases inside quoted text
    // Per Muse review: only answer-only phrases belong in global lists; other denials use position check
    const globalExecutionDenialPhrases = [
        'do not execute', 'do not run', 'without executing', 'without running', 'without executing',
        'no execution', 'no build',
        "don't execute", "don't run", "don't build",
        'answer only', 'answer-only', 'only answer',
        '那些 那些', '那些 那些'
    ];
    
    const gNormalized = normalizeQuotes(g);
    const gStripped = unquotedIntentText(gNormalized);
    // Only check the STRIPPED version (without quoted content) for global execution denial.
    // This prevents quoted denial phrases (e.g., "Do not execute" inside a label) from
    // triggering a global execution denial. The original text may contain quoted denial
    // phrases that are part of the build request, not actual user instructions.
    const gScoped = stripScopedExclusions(gStripped);
    const hasGlobalExecutionDenial = globalExecutionDenialPhrases.some(phrase =>
        gScoped.toLowerCase().indexOf(phrase.toLowerCase()) >= 0
    );

    const bare = stripArabicDiacritics(gNormalized);
    // The canonical line is read with the exclusions already removed: the
    // normalizer turns «بدون بناء موقع» into «بدون ابن موقع», which no
    // exclusion reader knows, and «ابن» became the order (the review's «صف لي
    // متجر مثالي بدون بناء موقع» was built).
    const canonicalSource = withoutDefiniteVerbalNouns(stripScopedExclusions(gNormalized));
    const normalized = normalizeIntentText(canonicalSource);
    const probe = normalized && normalized !== canonicalSource.toLowerCase() ? `${gNormalized}\n${normalized}` : gNormalized;
    const bareProbe = stripArabicDiacritics(probe);
    // Stripped probe (without quoted content) for DENIAL pattern matching to avoid
    // false positives from quoted denial phrases (e.g., "Do not execute" in a label)
    const probeStripped = stripArabicDiacritics(unquotedIntentText(probe));
    // A feature exclusion is scoped to that feature, never to other execution denials.
    let denialProbe = stripScopedExclusions(probeStripped);
    // His own words, without the canonical line: where an order stands is read from what he wrote.
    const said = stripArabicDiacritics(gStripped);

    // Check DENIAL patterns first on stripped probe (without quoted content)
    const isExplainThenBuild = EXPLAIN_THEN_BUILD_PATTERN.test(probeStripped);
    const isAnswerOnlyInitial = ANSWER_ONLY_PATTERN.test(denialProbe);
    let isAnswerOnly = isAnswerOnlyInitial;
    let isNoFileChanges = deniesEveryFileChange(probeStripped);
    // «Do not change any other files.» alone orders nothing: the denial about
    // some files is the only deed in it, so it stands as it always did (it
    // went to a registry guess, archive_files, once it was narrowed). With an
    // order beside it («Create a file … Do not change any other files.») it
    // stays narrowed.
    if (!isNoFileChanges && stripNarrowedFileDenials(probeStripped) !== probeStripped && asksForWordsOnly(denialProbe)) {
        isNoFileChanges = true;
    }
    
    // Check AFFIRMATIVE patterns on ORIGINAL probe (with quotes) to preserve
    // affirmative verbs that may be inside quoted content for quoted copy cases
    // The verb of a scoped exclusion is not an order: «Run the existing app.
    // Do not create a new project.» asks for no creation.
    // A denial of file changes beside an order it does not forbid — to run, or to
    // create when no creating verb is denied — is a condition on that order: it
    // is read out here, and the order is read as if it stood alone.
    const besideItsOrder = isNoFileChanges && !isExplainThenBuild ? fileDenialBesideItsOrder(said) : null;
    if (besideItsOrder) denialProbe = withoutFileDenials(denialProbe);
    const hasAffirmativeBuild = AFFIRMATIVE_BUILD_PATTERN.test(denialProbe);
    const hasDesireVerb = DESIRE_VERB_PATTERN.test(probeStripped);
    const hasRecordingVerb = RECORDING_VERB_PATTERN.test(probeStripped);
    const hasRecordingIndicator = RECORDING_INDICATOR.test(bareProbe);
    const hasContainer = CONTAINER_PATTERN.test(probeStripped)
        || /\b(?:register|tracker|ledger|directory|manager|board|workspace)\b/i.test(probeStripped);
    const isPoliteBuild = POLITE_BUILD_PATTERN.test(probeStripped);
    // Read only when a branch below needs it: the column reader is the
    // costliest step of this reading (it folds the whole message).
    let contents: boolean | undefined;
    const describesContents = () => contents ??= !!columnsAnywhereInHisRequest(gNormalized);
    // Negative constraints should also use original probe to catch "without database" etc.
    const hasNegativeConstraints = NEGATIVE_CONSTRAINTS_PATTERN.test(probe);

    
    // An exclusion whose request orders nothing else denies the whole build.
    const exclusionIsTheOnlyDeed = stripPartExclusions(probeStripped) !== probeStripped && asksForWordsOnly(denialProbe);
    const globalDenial = hasGlobalExecutionDenial || exclusionIsTheOnlyDeed || /(?:^|[\s،:؛.!?])(?:do\s+not\s+(?:execute|run|build)|don't\s+(?:execute|run|build)|without\s+(?:executing|running|building)|no\s+(?:execution|build)|answer[-\s]+only|only\s+answer|(?:بدون|دون)\s+(?:تنفيذ|بناء)|لا\s+(?:تنفيذ|بناء)|الرد\s+فقط|[أا]جب\s+فقط|اشرح\s+فقط)/i.test(denialProbe)
        || ordersNothingAtAll(denialProbe);
    if (isNoFileChanges && !globalDenial) isAnswerOnly = false;
    if (globalDenial) { isAnswerOnly = true; isNoFileChanges = false; }
    // The order the denial stands beside is the request; the denial is how it is to be done.
    if (besideItsOrder && !globalDenial) isNoFileChanges = false;
    // An exclusion of a part or of some files has been removed from denialProbe:
    // «… دون إنشاء مشروع جديد: أضف …» is an edit. A declared «Read only.» stays.
    const explicitReadOnly = READ_ONLY_PATTERN.test(denialProbe);
    // An order to inspect his project under the read-only boundary's own words is
    // the inspection (INSPECTS_HIS_PROJECT), not a chat answer about it.
    const readOnlyInspection = isNoFileChanges && (explicitReadOnly || READ_ONLY_BOUNDARY_WORDS_AR.test(denialProbe)) && INSPECTS_HIS_PROJECT.test(said);
    if (readOnlyInspection) isNoFileChanges = false;
    // Denials retain precedence regardless of position; quotation contents grant no authority.
    if (isAnswerOnly || isNoFileChanges || explicitReadOnly || readOnlyInspection) {
        const denialReason = isAnswerOnly ? 'explicit global execution denial'
            : isNoFileChanges ? 'no file changes requested' : 'explicit read-only request';
        return { hasAffirmativeAction: false, hasDenial: true, denialReason,
            isAnswerOnly, isNoFileChanges, isPoliteBuild: false, isExplainThenBuild: false,
            confidence: 0.95, reason: denialReason };
    }

    // A verb inside a question describes a possible action, not an order.
    // An explicit later command or a polite construction request still counts.
    // «ما عم يشتغل الزر، صلحه» opens with a negation: it reports, it does not ask.
    const leadingQuestion = /^\s*(?:what|why|how|when|which|who|ما|ماذا|لماذا|كيف|متى|أين|اين)(?=$|[\s،:؛])/i.test(withoutNegatingMa(probeStripped))
        || TELL_HOW_LEAD.test(probeStripped);
    // «كيف حالك؟ ابني لي موقع», «What is REST? Build me an API.» — but not
    // «كيف أتعامل مع ابني؟ ابني عمره عشر سنوات» (my son), nor a second question.
    // After a wish to know a quantity, the order may follow a comma.
    const laterCommand = ordersInALaterSentence(probeStripped, LATER_BUILD_ORDER, true)
        || (WISH_TO_KNOW_HOW_MUCH.test(probeStripped) && ordersInALaterClause(probeStripped, CLAUSE_BUILD_ORDER));
    //  «ما تعدلش أي ملف، اعملي صفحة…»: the «ما» that opens a denial read beside its order asks nothing.
    if (leadingQuestion && !besideItsOrder && !isPoliteBuild && !isExplainThenBuild && !laterCommand) {
        return { hasAffirmativeAction: false, hasDenial: false, isAnswerOnly: false,
            isNoFileChanges: false, isPoliteBuild: false, isExplainThenBuild: false,
            confidence: 0.9, reason: 'information question, not execution authority' };
    }

    // «لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة»: the order to create that stands
    // beside the denial was read with its object (fileDenialBesideItsOrder) — the
    // «و» joined to its verb must not hide it from the patterns below.
    if (besideItsOrder?.order === 'create') {
        return { hasAffirmativeAction: true, hasDenial: false, isAnswerOnly: false, isNoFileChanges: false,
            isPoliteBuild, isExplainThenBuild: false, confidence: 0.85, reason: 'order to create beside a denial of edits' };
    }

    // SECOND: Check affirmative patterns (only if no denial, or denial was overridden)
    // Check for negative constraints on builds (e.g., "Build a calculator. Do not create a database")
    // This allows builds with negative constraints like "Build a calculator. Do not create a database"
    if ((hasAffirmativeBuild || hasDesireVerb || hasRecordingVerb || isPoliteBuild || isExplainThenBuild) && hasContainer && hasNegativeConstraints) {
        return {
            hasAffirmativeAction: true,
            hasDenial: false,
            isAnswerOnly: false,
            isNoFileChanges: false,
            isPoliteBuild,
            isExplainThenBuild,
            confidence: 0.85,
            reason: 'affirmative build with negative constraints'
        };
    }

    // If there's an affirmative build with container (no negative constraints needed)
    const hasRecordingFields = hasRecordingVerb && (hasRecordingIndicator || describesContents());
    const hasAffirmativeWithContainer = (hasAffirmativeBuild || hasDesireVerb || hasRecordingVerb || (hasRecordingVerb && hasRecordingIndicator) || isPoliteBuild || isExplainThenBuild) && (hasContainer || hasRecordingFields);
    if (hasAffirmativeWithContainer) {
        // Explain-then-build is a strong affirmative signal
        if (isExplainThenBuild) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: false,
                isExplainThenBuild: true,
                confidence: 0.9,
                reason: 'explain-then-build pattern'
            };
        }

        // Recording verb + container + field list
        if (hasRecordingFields) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: false,
                isExplainThenBuild: false,
                confidence: 0.9,
                reason: 'recording verb + container + field list'
            };
        }

        // Desire verb + container + describes contents
        if (hasDesireVerb && hasContainer && describesContents()) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: false,
                isExplainThenBuild: false,
                confidence: 0.85,
                reason: 'desire verb + container + describes contents'
            };
        }

        // Polite build ("Can you create...", "那些 那些...")
        if (isPoliteBuild) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: true,
                isExplainThenBuild: false,
                confidence: 0.85,
                reason: 'polite build with container'
            };
        }

        // Standard affirmative build verb + container
        if (hasAffirmativeBuild || hasDesireVerb) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: false,
                isExplainThenBuild: false,
                confidence: 0.85,
                reason: 'affirmative build with container'
            };
        }

        // Recording verb + container (without field list)
        if (hasRecordingVerb && hasContainer) {
            return {
                hasAffirmativeAction: true,
                hasDenial: false,
                isAnswerOnly: false,
                isNoFileChanges: false,
                isPoliteBuild: false,
                isExplainThenBuild: false,
                confidence: 0.8,
                reason: 'recording verb + container'
            };
        }
    }

    // No clear signal
    return {
        hasAffirmativeAction: false,
        hasDenial: false,
        isAnswerOnly: false,
        isNoFileChanges: false,
        isPoliteBuild: false,
        isExplainThenBuild: false,
        confidence: 0,
        reason: 'no requested action detected'
    };
}
