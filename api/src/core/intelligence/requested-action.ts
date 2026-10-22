import { stripArabicDiacritics, normalizeIntentText } from '../orchestrator/promptNormalizer';
import { columnsAnywhereInHisRequest } from '../design/app-blueprints';

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
const NO_FILE_CHANGES_EN = `(?:no\\s+file\\s+changes?|without\\s+file\\s+changes?|do\\s+not\\s+(?:create|write|modify|edit|change)\\b.*\\bfiles?|without\\s+(?:creating|writing|modifying|editing|making)\\s+(?:any\\s+)?(?:file\\s+)?changes?)`;
// Arabic NO_FILE_CHANGES: لا تغييرات ملفات / دون تغييرات ملفات / لا تنشئ ملفات / دون إنشاء ملفات
const NO_FILE_CHANGES_AR = `(?:(?:بدون|دون)\\s+(?:أي\\s+)?(?:تعديل|تغيير|كتابة|إنشاء)\\s+(?:على\\s+)?(?:ال)?ملفات|لا\\s+تغييرات\\s+(?:ال)?ملفات|دون\\s+تغييرات\\s+(?:ال)?ملفات|لا\\s+تنشئ\\s+(?:ال)?ملفات|دون\\s+إنشاء\\s+(?:ال)?ملفات|لا\\s+تعدل\\s+(?:ال)?ملفات|دون\\s+تعديل\\s+(?:ال)?ملفات)`;
// Use START_BOUNDARY but not END_BOUNDARY for denial phrases, as they can appear mid-sentence
const NO_FILE_CHANGES_PATTERN = new RegExp(`${START_BOUNDARY}(?:${NO_FILE_CHANGES_EN}|${NO_FILE_CHANGES_AR})`, 'i');

// POLITE_BUILD patterns
const POLITE_BUILD_EN = `(?:could\\s+you\\s+please\\s+(?:make|build|create|design|implement|develop|code|write)|can\\s+you\\s+(?:make|build|create|design|implement|develop|code|write)|could\\s+you\\s+(?:make|build|create|design|implement|develop|code|write)|please\\s+(?:make|build|create|design|implement|develop|code|write)|would\\s+you\\s+(?:make|build|create|design|implement|develop|code|write))`;
// Arabic POLITE_BUILD: هل يمكنك بناء / هل تستطيع إنشاء / يرجى بناء / هل من الممكن بناء
const POLITE_BUILD_AR = `(?:هل\\s+يمكنك\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|هل\\s+تستطيع\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|يرجى\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة)|هل\\s+من\\s+الممكن\\s+(?:بناء|إنشاء|تصميم|تنفيذ|تطوير|برمجة|كتابة))`;
const POLITE_BUILD_PATTERN = new RegExp(`${START_BOUNDARY}(?:${POLITE_BUILD_EN}|${POLITE_BUILD_AR})${END_BOUNDARY}`, 'i');

// EXPLAIN_THEN_BUILD patterns
const EXPLAIN_THEN_BUILD_EN = `(?:explain\\s+(?:the\\s+)?(?:approach|design|plan|solution|architecture)\\s+(?:briefly|first|then)(?:\\s*,?\\s*(?:then|and\\s+then))?[,\\s]*\\s*(?:build|create|implement|develop|make|code)|(?:briefly\\s+)?(?:explain|describe)\\s+(?:.+?\\s+)?(?:first|then|and\\s+then)(?:\\s*,?\\s*(?:then|那些|那些))?[,\\s]*\\s*(?:build|create|implement|develop|make|code))`;
// Arabic EXPLAIN_THEN_BUILD: اشرح المنهج ثم بناء / صف التصميم ثم إنشاء / اشرح brevemente ثم بناء
const EXPLAIN_THEN_BUILD_AR = `(?:اشرح\\s+(?:المنهج|التصميم|الخطة|الحل|العمارة)\\s+(?:بإيجاز|أولاً|ثم)\\s*(?:،\\s*(?:ثم|و\\s*ثم))?[،\\s]*\\s*(?:ابني?|أنشئ|نفذ|طور|اصنع|برمج)|(?:بإيجاز\\s+)?(?:اشرح|صف)\\s+(?:.+?\\s+)?(?:أولاً|ثم|و\\s*ثم)\\s*(?:،\\s*(?:ثم|那些|那些))?[،\\s]*\\s*(?:ابني?|أنشئ|نفذ|طور|اصنع|برمج))`;
const EXPLAIN_THEN_BUILD_PATTERN = new RegExp(`${START_BOUNDARY}(?:${EXPLAIN_THEN_BUILD_EN}|${EXPLAIN_THEN_BUILD_AR})${END_BOUNDARY}`, 'i');

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
const CONTAINER_PATTERN = /(?:application|system|platform|game|converter|previewer|app|website|webapp|site|page|form|component|module|plugin|extension|tool|utility|script|dashboard|panel|interface|ui|frontend|backend|api|service|microservice|database|db|store|cache|queue|worker|job|task|report|document|template|layout|design|view|screen|dialog|modal|popup|menu|navigation|sidebar|header|footer|banner|card|list|table|grid|chart|graph|map|calendar|timeline|feed|stream|wall|gallery|carousel|slider|accordion|tab|panel|section|article|blog|post|comment|review|rating|search|filter|sort|pagination|breadcrumb|toolbar|button|link|input|textarea|select|checkbox|radio|switch|toggle|dropdown|contextmenu|tooltip|popover|alert|notification|badge|tag|avatar|icon|image|video|audio|player|canvas|svg|calculator|houses|login|page|message|note|label|heading|تطبيق|موقع|صفحة|نموذج|مكون|وحدة|إضافة|أداة|سكربت|لوحة|واجهة|خلفية|خدمة|قاعدة\s+بيانات|مخزن|طابور|عامل|مهمة|تقرير|مستند|نظام|متجر|برنامج|محول|قالب|تخطيط|تصميم|عرض|شاشة|حوار|نافذة\s+منبثقة|قائمة|تنقل|شريط\s+جانبي|رأس|تذييل|لافتة|بطاقة|قائمة|جدول|شبكة|رسم\s+بياني|رسم\s+بياني|خريطة|تقويم|خط\s+زمني|تغذية|تدفق|جدار|معرض|عرض\s+دوار|شريط\s+تمرير|طي|علامة\s+تبويب|لوحة|قسم|مقال|مدونة|مشاركة|تعليق|مراجعة|تقييم|بحث|تصفية|ترتيب|ترقيم|مسار\s+تنقل|شريط\s+أدوات|زر|رابط|إدخال|منطقة\s+نص|اختيار|خانة\s+اختيار|راديو|مفتاح|تبديل|قائمة\s+منسدلة|قائمة\s+سياقية|تلميح|نافذة\s+منبثقة|تنبيه|إشعار|شارة|وسم|صورة\s+رمزية|أيقونة|صورة|فيديو|صوت|مشغل|كانفاس|SVG|حاسبة|منازل|تسجيل\s+دخول|صفحة|رسالة|ملاحظة|تسمية|عنوان)/iu;

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
const NEGATIVE_CONSTRAINTS_PATTERN = /\b(?:do\s+not|don't|never|without|no|لا|دون|بدون)\b.*\b(?:database|login|auth|db|قاعدة\s+بيانات|تسجيل\s+دخول|مصادقة)\b/i;

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

/** Quoted examples and copy are data; share this boundary with structural build detection. */
export function unquotedIntentText(raw: string): string {
    return String(raw || '').replace(/[\u201C\u201D«»]/g, '"')
        .replace(/[\u2018\u2019`´]/g, "'")
        .replace(/"[^"]*"|(?<!\w)'[^']*'(?!\w)/g, '');
}

export function hasRequestedAction(goalRaw: string): RequestedActionResult {
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
    const hasGlobalExecutionDenial = globalExecutionDenialPhrases.some(phrase => 
        gStripped.toLowerCase().indexOf(phrase.toLowerCase()) >= 0
    );

    const bare = stripArabicDiacritics(gNormalized);
    const normalized = normalizeIntentText(gNormalized);
    const probe = normalized && normalized !== gNormalized.toLowerCase() ? `${gNormalized}\n${normalized}` : gNormalized;
    const bareProbe = stripArabicDiacritics(probe);
    // Stripped probe (without quoted content) for DENIAL pattern matching to avoid
    // false positives from quoted denial phrases (e.g., "Do not execute" in a label)
    const probeStripped = stripArabicDiacritics(unquotedIntentText(probe));
    // A feature exclusion is scoped to that feature, never to other execution denials.
    const denialProbe = probeStripped.replace(/\b(?:do\s+not|don't|never)\s+(?:create|build|generate|write)\s+(?:(?:a|an|the|any)\s+)?(?:database|db|login(?:\s+page)?|authentication|auth)(?:\s+(?:or|and)\s+(?:(?:a|an|the|any)\s+)?(?:database|db|login(?:\s+page)?|authentication|auth))*\s*(?=[.!?;,]|$)/gi, '');


    // Check DENIAL patterns first on stripped probe (without quoted content)
    const isExplainThenBuild = EXPLAIN_THEN_BUILD_PATTERN.test(probeStripped);
    const isAnswerOnlyInitial = ANSWER_ONLY_PATTERN.test(denialProbe);
    let isAnswerOnly = isAnswerOnlyInitial;
    let isNoFileChanges = NO_FILE_CHANGES_PATTERN.test(probeStripped);
    
    // Check AFFIRMATIVE patterns on ORIGINAL probe (with quotes) to preserve
    // affirmative verbs that may be inside quoted content for quoted copy cases
    const hasAffirmativeBuild = AFFIRMATIVE_BUILD_PATTERN.test(probeStripped);
    const hasDesireVerb = DESIRE_VERB_PATTERN.test(probeStripped);
    const hasRecordingVerb = RECORDING_VERB_PATTERN.test(probeStripped);
    const hasRecordingIndicator = RECORDING_INDICATOR.test(bareProbe);
    const hasContainer = CONTAINER_PATTERN.test(probeStripped)
        || /\b(?:register|tracker|ledger|directory|manager|board|workspace)\b/i.test(probeStripped);
    const isPoliteBuild = POLITE_BUILD_PATTERN.test(probeStripped);
    const describesContents = !!columnsAnywhereInHisRequest(gNormalized);
    // Negative constraints should also use original probe to catch "without database" etc.
    const hasNegativeConstraints = NEGATIVE_CONSTRAINTS_PATTERN.test(probe);

    
    const globalDenial = hasGlobalExecutionDenial || /(?:^|[\s،:؛.!?])(?:do\s+not\s+(?:execute|run|build)|don't\s+(?:execute|run|build)|without\s+(?:executing|running|building)|no\s+(?:execution|build)|answer[-\s]+only|only\s+answer|(?:بدون|دون)\s+(?:تنفيذ|بناء)|لا\s+(?:تنفيذ|بناء)|الرد\s+فقط|[أا]جب\s+فقط|اشرح\s+فقط)/i.test(denialProbe);
    if (isNoFileChanges && !globalDenial) isAnswerOnly = false;
    if (globalDenial) { isAnswerOnly = true; isNoFileChanges = false; }
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
    const leadingQuestion = /^\s*(?:what|why|how|when|which|who|ما|ماذا|لماذا|كيف|متى|أين|اين)(?=$|[\s،:؛])/i.test(probeStripped);
    const laterCommand = /[.!?؟;]\s*(?:please\s+)?(?:build|create|make|develop|implement|design|code|write|ابني?|أنشئ|اصنع|طور|نفذ|صمم|اكتب)(?=$|[\s،:؛])/i.test(probeStripped);
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
    const hasRecordingFields = hasRecordingVerb && (hasRecordingIndicator || describesContents);
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
        if (hasDesireVerb && hasContainer && describesContents) {
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
