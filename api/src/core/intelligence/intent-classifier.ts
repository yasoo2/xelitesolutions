import { stripArabicDiacritics, normalizeIntentText } from '../orchestrator/promptNormalizer';
import { derivedColumns, columnsAnywhereInHisRequest } from '../design/app-blueprints';
import { routeToModel } from '../llm/intelligent-router';

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
    return /(?:^|[\s،:؛])(?:ما|ماذا|لماذا|كيف|متي|اين|أين|كم|اي|ايهما|وش\s+معنى|شو\s+معنى|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/i.test(text)
        || /^\s*هل(?=$|[\s،:؛])/i.test(text)
        || /\b(what|why|how|when|which|who|explain|compare|difference|versus|vs)\b/i.test(text)
        || /[؟?]\s*$/i.test(text);
}

function isReadOnlyPattern(text: string): boolean {
    return /\b(?:read[-\s]?only|readonly|only\s+(?:read|inspect|analy[sz]e|review|verify)|without\s+(?:changing|modifying|writing|creating|editing)|without\s+(?:making|any)\s+(?:file\s+)?(?:changes?|modifications?)|no\s+(?:file\s+)?(?:changes?|writes?|modifications?))\b/i.test(text)
        || /\b(?:do\s+not|don't|never)\b(?:\s+\w+){0,3}\s+\b(?:create|edit|delete|move|install|commit|write|modify|changes?|build|start|run)\b/i.test(text)
        || /(?:قراءة\s+فقط|للقراءة\s+فقط|(?:من\s+)?دون\s+(?:أي\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف)|بدون\s+(?:أي\s+)?(?:تعديل|كتابة|إنشاء|تغيير|حذف))/i.test(text);
}

const ENGINEERING_VERB_PATTERN = /\b(build|create|develop|implement|refactor|repair|debug|test|deploy|code|modify|build\s+out|بناء|ابن(?:ِ|ي|ى)|انش(?:ئ|ء|ي)|تطوير|طو[ّ]?ر|برمج|اختبر|اختبار|اصلح|إصلح|عد[ّ]?ل|نف[ّ]?ذ|تنفيذ)\b/i;
const ENGINEERING_NOUN_PATTERN = /\b(repository|repo|codebase|project|system|platform|application|app|api|backend|frontend|database|software|code|tests?|نظام|منص(?:ة|ه)|تطبيق|مشروع|مستودع|كود|برنامج|خادم|قاعدة\s+بيانات|واجهة|اختبارات?)\b/i;

function hasBuildStructure(goalRaw: string): { isBuild: boolean; confidence: number; reason: string } {
    const g = String(goalRaw || '');
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);

    const derived = derivedColumns(g);
    if (derived && derived.length >= 2) {
        return { isBuild: true, confidence: 0.95, reason: `derivedColumns found ${derived.length} columns` };
    }

    const hasRecordingVerb = RECORDING_VERB_PATTERN.test(bareProbe);
    const hasDesireVerb = DESIRE_VERB_PATTERN.test(bareProbe) || ENGLISH_DESIRE_PATTERN.test(probe) || ENGLISH_IMPERATIVE_PATTERN.test(probe);
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

    const infoQuestion = /^\s*(?:ما|ماذا|لماذا|ليش|كيف|متى|اين|أين|كم|ايهما|أيهما|وش\s+معنى|شو\s+معنى|ما\s+رايك|ما\s+رأيك)(?=$|[\s،:؛؟])/i.test(bare)
        || /^\s*هل(?=$|[\s،:؛])/i.test(bare);
    const politeAction = /(?:^|[\s،:؛])هل\s+(?:يمكنك|تستطيع|تقدر)|(?:^|[\s،:؛])ممكن\s+(?:ان\s+|أن\s+)?(?:تصمم|تصميم|تبني|بناء|تنشئ|انشاء|إنشاء)/i.test(bare);
    if (infoQuestion && !politeAction) {
        return { isBuild: false, confidence: 0.9, reason: 'information question' };
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

/**
 * Whether the text names a web target a browser tool could act on: an
 * explicit URL or a known site. Shared by retrieval (a URL-required tool is
 * a dead end without one) and plan repair (a browser step without one on a
 * local-folder goal is a misroute, not a question).
 */
export function hasExternalWebTarget(text: string): boolean {
    const probe = String(text || '');
    return URL_PATTERN.test(probe) || KNOWN_SITE_PATTERN.test(probe);
}

export function isKnowledgeQuestionStructural(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;

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

    let classification: IntentClassification;

    if (engineering) {
        classification = {
            isBuild: true,
            isBrowser: false,
            isReadOnly: false,
            isKnowledgeQuestion: false,
            confidence: 0.9,
            reason: 'engineering brief',
            hasExternalWebTarget: browser.hasExternalWebTarget,
        };
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

/**
 * Whether the goal orders REPAIR work: named faults in an existing thing
 * must be reproduced, fixed and verified. Structural, like hasBuildStructure:
 * a repair verb aimed at a fault/engineering object, or a fault noun with an
 * explicit work verb. Questions are never repairs, even when they name a
 * fault («why does it crash?» asks; «fix the crash» orders).
 *
 * Measured need (EVAL-001 harborlog): a local repair objective sliced into a
 * browser_page_fix -> deploy_project capability chain collapsed into questions
 * and ended "done" with zero faults fixed. The planner keeps such objectives
 * whole only when it can see they are repairs.
 */
const REPAIR_VERB_PATTERN = /(?:^|[\s،:؛("])(?:fix|fixing|fixed|fixes|repair|repairing|repaired|repairs|reproduce|reproducing|reproduced|diagnose|diagnosing|diagnosed|diagnosis|diagnostic|debug|debugging|debugged|troubleshoot|troubleshooting|patch|patching|patched|resolve|resolving|resolved|correct|correcting|corrected)(?=$|[\s،:؛).,"'])/iu;
const REPAIR_VERB_AR_PATTERN = /(?:^|[\s،:؛("])(?:اصلح|أصلح|اصلاح|إصلاح|تصليح|صلح|يصلح|تشخيص|شخص)(?=$|[\s،:؛).,"'])/iu;
const FAULT_NOUN_PATTERN = /\b(?:bugs?|faults?|crash(?:es|ing|ed)?|failures?|failing|failed|errors?|defects?|broken|breaks?|not\s+working|doesn(?:'t|t)\s+work)\b/i;
const FAULT_NOUN_AR_PATTERN = /(?:^|[\s،:؛("])(?:خطأ|خطا|أخطاء|اخطاء|عطل|اعطال|أعطال|خلل|مشكلة|مشاكل)(?=$|[\s،:؛).,"'])/iu;
const REPAIR_WORK_VERB_PATTERN = /\b(?:investigate|investigating|inspect|inspecting|examine|examining|analy[sz]e|review|verify|verifying|prove|proving|test(?:s|ing)?|checks?|make\s+it\s+work|get\s+it\s+working)\b|(?:^|[\s،:؛("])(?:افحص|فحص|دقق|تدقيق|حلل|تحليل|راجع|مراجعة|تحقق|اختبار|اختبر|شغل|تشغيل)(?=$|[\s،:؛).,"'])/iu;

function hasRepairStructure(goalRaw: string): { isRepair: boolean; confidence: number; reason: string } {
    const g = String(goalRaw || '');
    if (!g.trim()) return { isRepair: false, confidence: 0, reason: 'empty goal' };
    if (isKnowledgeQuestionStructural(g)) {
        return { isRepair: false, confidence: 0.9, reason: 'question, not an order' };
    }
    const bare = stripArabicDiacritics(g);
    const normalized = normalizeIntentText(g);
    const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;
    const bareProbe = stripArabicDiacritics(probe);

    const hasRepairVerb = REPAIR_VERB_PATTERN.test(probe) || REPAIR_VERB_AR_PATTERN.test(bareProbe);
    const hasFault = FAULT_NOUN_PATTERN.test(probe) || FAULT_NOUN_AR_PATTERN.test(bareProbe);
    const hasWorkVerb = REPAIR_WORK_VERB_PATTERN.test(bareProbe);
    const hasEngObject = ENGINEERING_NOUN_PATTERN.test(probe);

    if (hasRepairVerb && (hasFault || hasEngObject || hasWorkVerb)) {
        return { isRepair: true, confidence: 0.9, reason: 'repair verb + fault/engineering object' };
    }
    if (hasFault && hasWorkVerb) {
        return { isRepair: true, confidence: 0.8, reason: 'fault noun + work verb' };
    }
    return { isRepair: false, confidence: 0, reason: 'no repair structure detected' };
}

export function isRepairRequest(goalRaw: string): { isRepair: boolean; confidence: number; reason: string } {
    return hasRepairStructure(goalRaw);
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