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
const FILE_DENIAL_EN = /(?:^|[\s،:؛.!?])do\s+not\s+((?:create|write|modify|edit|change)(?:\s*(?:,|\bor\b|\band\b|\bnor\b)\s*(?:create|write|modify|edit|change|delete|touch|remove))*)\s+([^.;!?\n]*?)\bfiles?\b([^.;!?\n]{0,40})/gi;
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
const FILE_DENIAL_AR = /(?:^|[\s،:؛.!?])(?:(?:بدون|دون)\s+(?:أي\s+)?(?:تعديل|تغيير|كتابة|إنشاء)\s+(?:على\s+)?|لا\s+تغييرات\s+|دون\s+تغييرات\s+|لا\s+تنشئ\s+|دون\s+إنشاء\s+|لا\s+تعدل\s+|دون\s+تعديل\s+)(?:ال)?ملفات(ي|نا|ك|كم|ه|ها|هم)?(?=$|[^\p{L}\p{N}_])([^.؛;!?؟\n]{0,40})/giu;
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
function arabicFileDenialIsWhole(possessive: string, tail: string): boolean {
    const next = stripArabicDiacritics(tail.trim().split(/[\s،,:]+/u)[0] || '');
    if (!next) return true;                                   // «لا تعدل الملفات.»
    if (possessive) return !/^(?:الأخرى|الاخرى|الاخري|اخرى|أخرى|الثانية|الثانيه)$/u.test(next);  // «لا تعدل ملفاتي»
    if (/^[وف]\S{2,}/u.test(next)) return true;               // «… الملفات واشرح لي» / «والإعدادات»
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

/** Does the request forbid every file change (not only some files)? */
export function deniesEveryFileChange(text: string): boolean {
    const t = String(text || '');
    if (NO_FILE_CHANGES_UNQUALIFIED.test(t)) return true;
    if (EVERY_CHANGE_DENIAL_EN.test(t) || EVERY_CHANGE_DENIAL_AR.test(t)) return true;
    for (const m of t.matchAll(FILE_DENIAL_EN)) if (fileDenialIsWhole(m[2] || '', m[3] || '')) return true;
    for (const m of t.matchAll(FILE_DENIAL_AR)) if (arabicFileDenialIsWhole(m[1] || '', m[2] || '')) return true;
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
        .replace(FILE_DENIAL_AR, (whole, possessive: string | undefined, tail: string) => arabicFileDenialIsWhole(possessive || '', tail) ? whole : ` ${tail.replace(/^\s*\S+/u, '')}`);
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
export interface OrderWords { ar: ReadonlySet<string>; en: RegExp }
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
function foldArabicWord(w: string): string {
    return w.replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/ئ/gu, 'ي').replace(/ؤ/gu, 'و').replace(/ء/gu, '').replace(/ة/gu, 'ه').toLowerCase();
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
            if (STRONG_TWIN_AR.has(verb)) { if (forHim || AR_DELIVERABLE.test(next) || AR_DOING.test(next)) return true; continue; }
            if (NOUN_TWIN_AR.has(verb)) { if (suffix || forHim || /^(?:ال|لل)\S{2,}/u.test(next) || AR_DELIVERABLE.test(next)) return true; continue; }
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
    return String(text || '').replace(SCOPED_EXCLUSION_EN, ' ').replace(SCOPED_EXCLUSION_AR, ' ');
}
export function stripScopedExclusions(text: string): string {
    return stripNarrowedFileDenials(stripPartExclusions(text));
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
const ACTION_ORDER_EN = /(?:^|[.!?;:,\n]\s*|\b(?:and|then|please|just|now)\s+)(?:run|start|launch|open|fix|repair|debug|add|edit|modify|update|change|remove|delete|deploy|publish|install|test|refactor|commit|push|clone|import|serve|restart|stop|move|rename|copy|save|upload|download|search|browse|visit|go|check|review|inspect|analy[sz]e|audit|read|list|scan|verify|validate|migrate|upgrade|convert|set\s+up|configure|connect|continue|resume|proceed|finish|complete|keep|use|work|improve|optimi[sz]e|clean|replace|merge|extend|integrate)\b/i;
// Imperatives only — never a word that is also a common noun or particle
// («حول» about, «غير» other than, «روح» soul, «عطل» fault, «حدث» event).
const ACTION_ORDER_AR = /(?:^|[^\p{L}\p{N}_])[وف]?(?:شغل|[اأإ]صلح|صلح|[اأ]ضف|ضيف|عدل|افتح|انشر|ارفع|ثبت|اختبر|افحص|راجع|حلل|احذف|امسح|انقل|انسخ|احفظ|استنسخ|ادمج|شيك|نظف|[اأ]وقف|ركب|ابحث|ادخل|اذهب|كمل|[اأ]كمل|ابد[أاء]|تابع|واصل|استخرج|استورد|اربط|ارجع|خلي|اجعل)(?:ه|ها|هم|هما|وه|يه|ني|لي|لنا)?(?=$|[^\p{L}\p{N}_])/u;
function ordersSomething(text: string): boolean {
    const t = maskNegatedSpans(text);
    return AFFIRMATIVE_BUILD_PATTERN.test(t) || ENGLISH_DESIRE_PATTERN.test(t) || POLITE_BUILD_PATTERN.test(t)
        || hasArabicOrderVerb(t) || ACTION_ORDER_EN.test(t) || ACTION_ORDER_AR.test(t);
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

function readRequestedAction(goalRaw: string): RequestedActionResult {
    const g = String(goalRaw || '');

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
    const denialProbe = stripScopedExclusions(probeStripped);


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
    if (!isNoFileChanges && stripNarrowedFileDenials(probeStripped) !== probeStripped && !ordersSomething(denialProbe)) {
        isNoFileChanges = true;
    }
    
    // Check AFFIRMATIVE patterns on ORIGINAL probe (with quotes) to preserve
    // affirmative verbs that may be inside quoted content for quoted copy cases
    // The verb of a scoped exclusion is not an order: «Run the existing app.
    // Do not create a new project.» asks for no creation.
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
    const exclusionIsTheOnlyDeed = stripPartExclusions(probeStripped) !== probeStripped && !ordersSomething(denialProbe);
    const globalDenial = hasGlobalExecutionDenial || exclusionIsTheOnlyDeed || /(?:^|[\s،:؛.!?])(?:do\s+not\s+(?:execute|run|build)|don't\s+(?:execute|run|build)|without\s+(?:executing|running|building)|no\s+(?:execution|build)|answer[-\s]+only|only\s+answer|(?:بدون|دون)\s+(?:تنفيذ|بناء)|لا\s+(?:تنفيذ|بناء)|الرد\s+فقط|[أا]جب\s+فقط|اشرح\s+فقط)/i.test(denialProbe);
    if (isNoFileChanges && !globalDenial) isAnswerOnly = false;
    if (globalDenial) { isAnswerOnly = true; isNoFileChanges = false; }
    // An exclusion of a part or of some files has been removed from denialProbe:
    // «… دون إنشاء مشروع جديد: أضف …» is an edit. A declared «Read only.» stays.
    const explicitReadOnly = READ_ONLY_PATTERN.test(denialProbe);
    // Denials retain precedence regardless of position; quotation contents grant no authority.
    if (isAnswerOnly || isNoFileChanges || explicitReadOnly) {
        const denialReason = isAnswerOnly ? 'explicit global execution denial'
            : isNoFileChanges ? 'no file changes requested' : 'explicit read-only request';
        return { hasAffirmativeAction: false, hasDenial: true, denialReason,
            isAnswerOnly, isNoFileChanges, isPoliteBuild: false, isExplainThenBuild: false,
            confidence: 0.95, reason: denialReason };
    }

    // A verb inside a question describes a possible action, not an order.
    // An explicit later command or a polite construction request still counts.
    const leadingQuestion = /^\s*(?:what|why|how|when|which|who|ما|ماذا|لماذا|كيف|متى|أين|اين)(?=$|[\s،:؛])/i.test(probeStripped)
        || TELL_HOW_LEAD.test(probeStripped);
    // «كيف حالك؟ ابني لي موقع», «What is REST? Build me an API.» — but not
    // «كيف أتعامل مع ابني؟ ابني عمره عشر سنوات» (my son), nor a second question.
    const laterCommand = ordersInALaterSentence(probeStripped, LATER_BUILD_ORDER, true);
    if (leadingQuestion && !isPoliteBuild && !isExplainThenBuild && !laterCommand) {
        return { hasAffirmativeAction: false, hasDenial: false, isAnswerOnly: false,
            isNoFileChanges: false, isPoliteBuild: false, isExplainThenBuild: false,
            confidence: 0.9, reason: 'information question, not execution authority' };
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
