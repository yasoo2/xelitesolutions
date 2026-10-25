import { stripArabicDiacritics, normalizeIntentText } from '../orchestrator/promptNormalizer';
import { derivedColumns, columnsAnywhereInHisRequest } from '../design/app-blueprints';
import { routeToModel } from '../llm/intelligent-router';
import { hasRequestedAction, unquotedIntentText } from './requested-action';
import { parseExplicitFileReadRequest } from '../orchestrator/file-intent';
import { hasArabicBuildVerb, hasArabicOrderVerb, maskNegatedSpans, requestedArtifact } from '../design/requested-artifact';
import { words } from '../language/arabic';

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

const STRONG_WEB_VERB = /(تصف[حح]|سج[لّ]\s*(ال)?دخول|تسجيل\s*(ال)?دخول|ادخل\s*(على|الى|إلى|ل|حساب|موقع)|اذهب\s*(الى|إلى|ل)|ابحث|دو[رّ]\s*(لي\s*)?عن|open\s*(the\s*)?browser|browse\b|visit\b|go\s*to\b|log\s*-?\s*in|sign\s*-?\s*in|search\b)/i;
const WEAK_WEB_VERB = /(افتح|انظر|صِ?ف|وصف|لخ[صص]|ترجم|انقر|استخرج|open\b|describe|summari|translate|click|extract)/i;
const WEB_NOUN = /(متصفح|موقع|صفحة|رابط|الويب|browser|site|page|link|web)/i;
const UI_INTERACTION_VERB = /(اضغط|انقر|اختر|اكتب|أدخل|مر[رّ]|انزل|عب[ئئ]|املأ|حد[دّ])/i;
const UI_NOUN = /(زر|الزر|حقل|الحقل|خانة|القائمة|قائمة|رابط|مربع|صندوق|التبويب|button|field|link|menu|dropdown|checkbox|tab|box|input)/i;

function isKnowledgeQuestionPattern(text: string): boolean {
    return /(?:^|[\s،:؛])(?:ما|ماذا|لماذا|كيف|متي|اين|أين|كم|اي|ايهما|اشرح|صف|قارن|وش\s+معنى|شو\s+معنى|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/i.test(text)
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

function hasBuildStructure(goalRaw: string): { isBuild: boolean; confidence: number; reason: string } {
    const classificationGoal = maskResultativeMakeForBuild(String(goalRaw || ''));
    const g = unquotedIntentText(classificationGoal);
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);

    // An Arabic information question is answered, not built — unless it asks
    // politely for the work («هل يمكنك تصميم صفحة…؟»). The verbal noun in «هل
    // تصميم موقع جديد مكلف؟» is a topic, not an order (same rule as buildIntent).
    const informationQuestion = /^\s*(?:ما|ماذا|لماذا|ليش|كيف|متى|اين|أين|كم|ايهما|أيهما|وش\s+معنى|شو\s+معنى|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/u.test(bare)
        || /^\s*هل(?=$|[\s،:؛])/u.test(bare);
    const politeActionRequest = /(?:^|[\s،:؛])هل\s+(?:يمكنك|تستطيع|تقدر)|(?:^|[\s،:؛])ممكن\s+(?:ان\s+|أن\s+)?(?:تصمم|تصميم|تبني|بناء|تنشئ|انشاء|إنشاء)/u.test(bare);
    // «كيف حالك؟ ابني لي موقع لمطعمي»: a question, then an order. The order
    // after the first sentence still counts — as «How are you? Build me …»
    // always did (eval round 19). A verbal noun after it is still a topic.
    const afterFirstSentence = bare.split(/[؟?.!]/u).slice(1).join(' ');
    const laterOrder = afterFirstSentence.trim().length > 0 && hasArabicOrderVerb(afterFirstSentence);
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
    const opening = words(bare);
    const opener = opening[0] || '';
    const second = opening[1] || '';
    // A desire verb that asks to be told something is a question, unless a
    // later word asks for the work itself.
    if (DESIRE_OPENERS.has(opener) && TELL_VERBS.has(second) && !opening.slice(2).some(w => DOING_VERBS.has(w))) {
        return { isBuild: false, confidence: 0.85, reason: 'information question' };
    }
    // A true imperative («سوّي», «ابن», «اعمل») opens an order with any
    // container. A desire verb opens one only when its own object is a
    // deliverable («بدي موقع …») or the next word is a doing verb («أبي
    // تعدّل …») — a container word elsewhere («… كود الموقع») is the topic.
    const artifact = requestedArtifact(g);
    const desireOrder = DESIRE_OPENERS.has(opener)
        ? (!!artifact.kind && artifact.evidence.verb === opener) || DOING_VERBS.has(second)
        : CONTAINER_PATTERN.test(probe) || !!artifact.kind;
    const opensWithOrder = !/[؟?]\s*$/u.test(g)
        && hasArabicBuildVerb(opener)
        && !TELL_VERBS.has(second)
        && desireOrder;
    if (opensWithOrder) {
        return { isBuild: true, confidence: 0.75, reason: 'opens with an order + container' };
    }

    if (isKnowledgeQuestionStructural(g)) {
        return { isBuild: false, confidence: 0.9, reason: 'information question' };
    }

    const derived = derivedColumns(g);
    if (derived && derived.length >= 2) {
        return { isBuild: true, confidence: 0.95, reason: `derivedColumns found ${derived.length} columns` };
    }

    const hasRecordingVerb = RECORDING_VERB_PATTERN.test(bareProbe);
    const hasDesireVerb = DESIRE_VERB_PATTERN.test(bareProbe) || ENGLISH_DESIRE_PATTERN.test(probe) || ENGLISH_IMPERATIVE_PATTERN.test(probe)
        || /^\s*اعمل(?=[\s،:؛])/u.test(bare) // Unaccented leading imperative; questions and negations do not borrow it.
        // The owner writes Gulf and Levantine imperatives — «أبي», «سوّي», «خلّ»,
        // «حط», «شيل», «بنِ» — read from the verb class requestedArtifact uses,
        // so the gate and the object reader agree on what a build verb is.
        || hasArabicBuildVerb(maskNegatedSpans(bare));
    const hasContainer = CONTAINER_PATTERN.test(probe);
    const hasRecordingIndicator = RECORDING_INDICATOR.test(bareProbe);
    const describesContents = !!columnsAnywhereInHisRequest(g);

    if (hasRecordingVerb && hasContainer && hasRecordingIndicator) {
        return { isBuild: true, confidence: 0.9, reason: 'recording verb + container + field list' };
    }

    if (hasDesireVerb && hasContainer && describesContents) {
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
    const knownSite = KNOWN_SITE_PATTERN.test(probe);
    const hasExternalWebTarget = hasUrl || knownSite;

    if (hasExternalWebTarget) {
        return { isBrowser: true, confidence: 0.95, reason: hasUrl ? 'explicit URL' : 'known site named', hasExternalWebTarget: true };
    }

    const strongWeb = STRONG_WEB_VERB.test(bareProbe);
    const weakWeb = WEAK_WEB_VERB.test(bareProbe);
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

export function isKnowledgeQuestionStructural(goalRaw: string): boolean {
    // A complete read/report operation outranks incidental question words in its constraints.
    if (parseExplicitFileReadRequest(goalRaw)) return false;
    const g = unquotedIntentText(String(goalRaw || ''));
    const action = hasRequestedAction(g);
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    // Reading followed by an operational clause is a mixed request. Nouns
    // such as "test counts" in the reading clause are not execution commands.
    const readingLead = /^(?:\s*please\s+)?\s*(?:summari[sz]e|describe|translate|explain|compare)\b/i.test(bare)
        || /^\s*(?:من\s+فضلك\s+)?(?:لخص|ترجم|اشرح|صف|قارن)(?=$|[\s،:؛؟])/u.test(bare);
    const laterOperation = /(?:[.!?؟;،,:\n]|\b(?:and|then)\b)\s*(?:then\s+)?(?:please\s+)?(?:run|execute|build|create|develop|implement|modify|edit|delete|remove|install|open|save|append|export|overwrite|copy|rename|update|read|inspect|list|browse|search|navigate|click|capture|download|test(?!\s+(?:counts?|results?)\b))\b/i.test(bare)
        || /(?:[.!?؟;،,:\n]|(?:^|\s)(?:ثم|وبعدها|وبعدين))\s*(?:ثم\s+)?(?:من\s+فضلك\s+)?(?:شغل|نفذ|ابن|ابني|انشئ|اكتب|عدل|احذف|افتح|احفظ|انسخ|انقل|اختبر)(?=$|[\s،:؛.!?؟])/u.test(bare);
    if (readingLead && laterOperation) return false;

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

export function isReadOnlyStructural(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    return isReadOnlyPattern(g);
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
    const g = unquotedIntentText(String(goalRaw || ''));
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
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
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
