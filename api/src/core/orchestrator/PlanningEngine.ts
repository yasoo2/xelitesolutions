import { isCaptureResultInquiry } from '../intelligence/capture-result-inquiry';
import { StructuredIntent } from '../intelligence/IntentParser';
import { boundedNoFileTerminalCommands, hasTerminalExecutionDenial, parseRuntimeDiagnosticFacts } from './runtime-diagnostic-contract';
import { boundedReadNavigationUnderFileConstraint } from '../intelligence/bounded-read-navigation';
import { isReadOnlyWorkspaceOverviewRequest } from './workspace-overview';
import { StructuredSpecification, Requirement, Constraint, ConstraintInteraction, PhasePlan, ExecutionTask, RequirementTraceabilityEntry, ImplicitRequirement, AcceptanceCriterion } from '../intelligence/specification';
import { catalogueFor, registeredToolNames, capabilityRoute, inputForTool } from './toolCatalog';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';
import { normalizeIntentText, stripArabicDiacritics, foldChars } from './promptNormalizer';
import { compactHistoryForPrompt } from './history-compact';
import { enrichWorkspaceToolInput } from './workspace-evidence';
import { findActiveBuiltProject } from './active-built-project';
import { isBoundedTerminalDiagnosticRequest, isReadOnlyRequest } from './buildIntent';
import { capabilityFromRequest } from '../api-discovery/integration';
import { saysAny } from '../language/arabic';
import { parseExplicitAppendFileRequest, parseExplicitFileRequest, parseExplicitFileReadRequest, parseExplicitFileEditRequest, parseExplicitDirectoryInspectionRequest, parseExplicitReadFilesRequest, parseExpectedReadMarkers, hasGlobalExplicitReadDenial } from './file-intent';
import { workspaceService } from '../../modules/services/WorkspaceService';
import { tools as registeredTools } from '../../modules/tools/registry';
import { isBuildRequest, isKnowledgeQuestionStructural, isReadOnlyStructural } from '../intelligence/intent-classifier';
import { hasRequestedAction } from '../intelligence/requested-action';
import { diagnoseFailure, detectParallelGroups, generatePlanAttempts, selectBestPlan, validatePlan, FAILURE_RECOVERY_RULES } from './adaptive-dag-planner';
import fs from 'fs';
import path from 'path';
import { mentionsCommandLine, readsCsvInput, requestedArtifact, statesManagingPurpose } from '../design/requested-artifact';
import { parseModelJsonArray, readModelJsonObject } from '../../shared/utils/json';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    agent: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
    /** Adaptive planner: this step can run in parallel with other independent steps */
    parallel?: boolean;
    /** Adaptive planner: why this step was chosen and positioned here */
    reasoning?: string;
}

/**
 * A no-file-changes request that also says it may only read («read-only
 * checks», «only read project files», «للقراءة فقط») asks Joe to inspect, so it
 * belongs at the read-only boundary, not in an answer-only reply. A bare
 * prohibition («Explain hooks. Do not create any files.») stays a question.
 */
const READ_ONLY_PERMISSION = /\bread[-\s]?only\b|\breadonly\b|\bonly\s+(?:read|inspect|analy[sz]e|review|verify)\b|(?:^|[\s،:؛])(?:قراءة|للقراءة)\s+فقط(?=$|[\s،:؛.!؟])/iu;
function isReadOnlyInspectionRequest(goal: string): boolean {
    // Both readers: the planner's boundary below asks isReadOnlyStructural, the
    // pipeline's stop before planning asks isReadOnlyRequest.
    return READ_ONLY_PERMISSION.test(String(goal || ''))
        && !hasRequestedAction(goal).isAnswerOnly
        && isReadOnlyStructural(goal) && isReadOnlyRequest(goal)
        && !isBoundedTerminalDiagnosticRequest(goal);
}

/**
 * The runtime appends coaching blocks to the goal («[STANDING USER
 * INSTRUCTIONS …]», «[ENGINEERING DISCIPLINE …]», «[ATTACHED FILES …]»,
 * «[RESPONSE LANGUAGE …]»). They carry the very words detection reacts to
 * (deploy, launch, server, publish), so every reader of intent reads only what
 * precedes them. One definition, used by generatePlan and readDeployIntent.
 */
const INJECTED_BLOCK_START = /(?<!\n)\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)/i;
function userPartOf(rawGoal: string): string {
    const raw = String(rawGoal || '');
    const injectedAt = raw.search(INJECTED_BLOCK_START);
    return injectedAt >= 0 ? raw.slice(0, injectedAt).trim() : raw;
}

/**
 * The review verbs the quality-review fast path reads (and isConstructionBrief
 * locates) — AS WHOLE WORDS. The pre-merge review of f7a95c498, with a built
 * project open:
 *
 *     Checkout flow with delivery options: build it with cart summary and payment
 *         → project_repair   (parent: the build path)
 *
 * «check» was a substring, so «Checkout» opened the request with a review, and
 * «delivery» counted as its quality target. «راجع» sat inside «تراجع» the same
 * way. A word keeps its own inflections and Arabic clitics — «وراجعه»,
 * «المراجعة», «الاختبارات», "reviewed", "inspection" — and nothing longer.
 */
/*
 * «انشر الموقع ولا تنشر صفحة الأدمن», «ارفع التطبيق على السيرفر ولا ترفع ملف .env»,
 * «اختبر الموقع وبعدين انشره، لا تنشره قبل الاختبار», "Deploy the site but don't
 * publish the drafts": a denial of a PART, or of a time or a place, beside an order to
 * publish. Read as a denial of the whole publish it vetoed every deploy tool on every
 * road, and nothing was deployed (the second review, 2026-11-12). The publish itself
 * is denied when nothing else orders one («لا تنشر الموقع», «ابنِ الموقع ولا تنشره»),
 * or when the denial names the same site, or its pronoun, with nothing qualifying it.
 */
const PUBLISH_DENIAL = /(?:^|[\s،؛,:.!?])(?:[وف]?(?:لا|ليس|بدون|غير)\s+(?:(?:أي|أية|اي)\s+)?|(?:do\s+not|don't|without|no)\s+(?:(?:any|external)\s+)?)([تن]?نشر(?:ه|ها|هم|وا|ي)?|انشر|أنشر|ت?رفع(?:ه|ها)?|استضافة|deploy(?:ing)?|publish(?:ing)?|host(?:ing)?|go\s*live|github\s*pages)(?=$|[\s،؛,:.!?؟])([^\n.!?؟؛;،,]{0,80})/giu;
const PUBLISH_ORDER = /(?:^|[\s،؛,:.!?])[وف]?(?:انشر|أنشر|ارفع|استضف)(?:ه|ها)?(?=$|[\s،؛,:.!?])|\b(?:deploy|publish|host|go\s*live)\b/iu;
const THE_SITE_ITSELF = /^(?:(?:ال)?(?:موقع|مشروع|تطبيق|متجر|نظام|صفحات)|it|this|them|(?:the|my|our|this)\s+(?:site|website|app|application|project|store))$/iu;
const QUALIFIES_A_DENIAL = /^(?:قبل|حتى|[إا]لا|لحد|لين|لما|على|في|[إا]لى|الان|الآن|حاليا|before|until|unless|till|on|to|yet|now|while|externally)$/iu;
/*
 * «ممكن ما تنشره؟», «ما تنشر الموقع», «بلاش تنشر الموقع», «متنشرش الموقع», "Can you not
 * deploy it yet?": the same denial in the dialects' words, in Egyptian's «ما…ش» wrapped
 * round the verb, and put as a polite question. The denial reader knew «لا / بدون / do
 * not» only, so none of these vetoed anything. Each is rewritten into the form it reads,
 * and the rules above judge them like every other denial (a part, a time, the site
 * itself). «ما» denies only where a clause, a courtesy or a request opens, or after «و»:
 * «بعد ما تنشر الموقع ابعتلي الرابط» is "after you publish", and stays one.
 */
const DENIAL_IN_OTHER_WORDS: Array<[RegExp, string]> = [
    [/(^|[\s،؛,:.!?؟])(?:ما[ \t]*|م)(ت(?:نشر|رفع))[^\s،؛,:.!?؟]{0,3}ش(?=$|[\s،؛,:.!?؟])/gu, '$1لا $2'],
    [/(^|[\n.،؛,:!?؟][ \t]*|(?:^|\s)(?:ممكن|يمكن|تقدر|بتقدر|ينفع|فيك|سمحت|فضلك)[ \t]+)ما[ \t]+(?=ت(?:نشر|رفع))/gu, '$1لا '],
    [/(\s[وف])ما[ \t]+(?=ت(?:نشر|رفع))/gu, '$1لا '],
    [/(^|\s)([وف]?)بلاش[ \t]+(?=ت?(?:نشر|رفع))/gu, '$1$2لا '],
    [/\b(?:can|could|would|will)\s+(?:you|u)\s+(?:(?:please|kindly)\s+)?not\s+(?=(?:deploy|publish|host|go\s*live)\b)/giu, 'do not '],
];
function deniesThePublishItself(userGoalRaw: string): boolean {
    let userGoal = String(userGoalRaw || '');
    for (const [otherWords, asRead] of DENIAL_IN_OTHER_WORDS) userGoal = userGoal.replace(otherWords, asRead);
    const denials = [...userGoal.matchAll(PUBLISH_DENIAL)];
    if (!denials.length) return false;
    if (!PUBLISH_ORDER.test(userGoal.replace(PUBLISH_DENIAL, ' '))) return true;
    return denials.some(m => {
        const verb = m[1];
        const words = (m[2] || '').trim().split(/\s+/u).filter(Boolean);
        //  «لا تنشره»: the pronoun is the site. «لا تنشر الموقع»: the site named, one or two words.
        const carriesPronoun = /(?:نشر|رفع)(?:ه|ها|هم)$/u.test(verb);
        let rest = words;
        if (!carriesPronoun) {
            const two = words.slice(0, 2).join(' '), one = words[0] || '';
            if (THE_SITE_ITSELF.test(two)) rest = words.slice(2);
            else if (THE_SITE_ITSELF.test(one)) rest = words.slice(1);
            else return words.length === 0;         // a part, a file, the drafts: scoped
        }
        return !rest.length || !QUALIFIES_A_DENIAL.test(rest[0]);
    });
}

//  «راجعلي», «افحصلي», «دققلي»: the dialect's «لي» glued to the order is the same order.
const QUALITY_REVIEW_VERB = /(?<![\p{L}\p{N}_])(?:[وف]?(?:راجع|افحص|دقّ?ق|اختبر)(?:ي|وا|و|ه|ها|هم)?(?:لي|لنا)?|[وف]?(?:[بل]?ال|لل|[بل])?(?:مراجع(?:ة|ه|ات)|فحص|تدقيق|اختبار)(?:ا|ات|ه|ها)?|(?:re-?)?(?:review(?:s|ed|ing|ers?)?|audit(?:s|ed|ing|ors?)?|inspect(?:s|ed|ing|ions?)?|check(?:s|ed|ing)?|verif(?:y|ies|ied|ying|ication)))(?![\p{L}\p{N}_])/iu;
/** A request whose first word (after a courtesy) orders that review. Read on diacritic-free text. */
const OPENS_WITH_REVIEW = new RegExp(`^\\s*(?:(?:please|kindly|من\\s+فضلك|لو\\s+سمحت|رجاء[ًا]?)[\\s،,]+)?${QUALITY_REVIEW_VERB.source}`, 'iu');

/**
 * Words and clause breaks of a folded request (foldChars: no harakat, أ/إ/آ→ا,
 * ى→ي, ة→ه, lower case). Every reader below walks this list once.
 */
const WORD_OR_BREAK = /[\p{L}\p{M}\p{N}_]+|\n|[^\s\p{L}\p{M}\p{N}_]/gu;
const CLAUSE_BREAK = /^(?:[\n.,;:!?،؛؟]|ثم|then|after|afterwards|بعد|بعدها)$/u;
/** The Arabic clitics a noun carries in front: «و/ف», «ب/ك/ل», the article. */
const AR_CLITICS = '(?:[وف])?(?:[بكل]?ال|لل|[بكل])?';
/**
 * Content «انشر/publish» also takes — whole tokens, each with only its own
 * endings: «خبر» is «الخبر/خبراً/الأخبار», never «خبرني» or «خبراتي».
 * "blog" alone is a site (a deployed blog is a deployed site); "blog post" is
 * content through "post".
 */
const CONTENT_NOUN_TOKEN = new RegExp(`^(?:${AR_CLITICS}(?:مقال(?:ه|ا|ات|اتي|ي|تي|ته|نا|ك)?|منشور(?:ا|ات|اتي|ي|ه|نا)?|بوست(?:ات)?|تدوين(?:ه|ات|اتي|تي|ته)?|تغريد(?:ه|ات|اتي|تي|ته)?|خبرا?|اخبار|اعلان(?:ا|ات|ي|ه|نا)?|محتو(?:ي|يات|ياتي|اه|اها|انا)|قص(?:ه|ص|تي|ته))|articles?|posts?|tweets?|stor(?:y|ies)|content|newsletters?|announcements?)$`, 'u');
/** A thing that is deployed: a site, a page, an app, a store, a project. */
const SITE_NOUN_TOKEN = new RegExp(`^(?:${AR_CLITICS}(?:(?:موقع|مواقع|مشروع|مشاريع|نظام|خادم|سيرفر|تطبيق|متجر)(?:ي|نا|ه|ها|ك|كم|ا)?|(?:معاين|صفح|منص|مدون)(?:ه|ات|ت(?:ي|نا|ه|ها|ك|كم)))|sites?|websites?|webpages?|pages?|apps?|applications?|projects?|servers?|stores?|shops?|portfolios?|blogs?|platforms?|portals?|previews?)$`, 'u');
/** «انشر/أنشر/تنشر/نشر…» with the object pronoun captured («انشره» publishes what came before). */
const AR_PUBLISH_VERB_TOKEN = /^(?:[وف])?(?:ا|ت|ن|ي)?نشر(?:ي|وا|و)?(ه|ها|هم)?(?:لي|لنا)?$/u;
const EN_PUBLISH_VERB_TOKEN = /^(?:re)?(?:publish(?:es|ed|ing)?|host)$/u;
/** "post" orders a publication only where a clause starts with it. */
const STARTS_A_CLAUSE = /^(?:and|then|please|also|now|just|و)$/u;
const HTTP_TOKEN = /^(?:endpoints?|requests?|routes?|methods?|handlers?|body|calls?|api)$/u;

/**
 * WHAT «انشر» PUBLISHES IS ITS OBJECT, NOT A WORD SOMEWHERE IN THE SENTENCE.
 *
 * The content guard was a bare substring over the whole request, and
 * f7a95c498 made it a veto over every road that can choose a deploy tool.
 * The pre-merge review measured (the parent of that commit deployed each):
 *
 *     انشر الموقع وخبرني بالرابط      → no deploy anywhere («خبر» in «خبرني»)
 *     انشره وأخبرني بالرابط           → no deploy anywhere («خبر» in «أخبرني»)
 *     انشر موقع خبراتي                → no deploy anywhere («خبر» in «خبراتي»)
 *     انشر الموقع بعد تحديث المحتوى   → no deploy anywhere («محتوى» anywhere)
 *     Deploy my blog                   → no deploy anywhere ("blog")
 *     Deploy the API; the POST endpoint must work → no deploy anywhere
 *
 * «وأخبرني بالرابط» is the most natural thing to say after «انشر الموقع».
 * A content noun is now a whole word, and it is CONTENT BEING PUBLISHED only
 * when it is what the publish verb publishes: the verb's first object
 * («انشر مقالاً», «انشر تدوينة عن موقعي», "publish the article on my site"),
 * or the antecedent of its pronoun («اكتب مقالاً ثم انشره», "… publish it").
 * A content noun that only modifies a site («موقع المقالات», "the article
 * page") is the site; a site word that modifies content ("a blog post") is
 * the content. One walk over the words, a bounded look ahead: linear.
 */
function readPublishedContent(userGoal: string): { anywhere: boolean; asObject: boolean; siteNamed: boolean } {
    // An upper-case HTTP method is not a social post: "the POST endpoint".
    const folded = foldChars(String(userGoal || '').replace(/\b(?:GET|POST|PUT|PATCH|DELETE)\b/g, ' '));
    const tokens = folded.match(WORD_OR_BREAK) || [];
    const isArabic = (t: string) => /[؀-ۿ]/.test(t);
    type Role = 'content' | 'site' | 'break' | '';
    const roles: Role[] = tokens.map(t => CLAUSE_BREAK.test(t) ? 'break'
        : CONTENT_NOUN_TOKEN.test(t) ? 'content'
        : SITE_NOUN_TOKEN.test(t) ? 'site' : '');
    for (let i = 0; i < tokens.length; i++) {
        if (roles[i] !== 'content') continue;
        // "the post endpoint", "a POST request": a method of an API.
        if (/^posts?$/.test(tokens[i]) && HTTP_TOKEN.test(tokens[i + 1] || '')) roles[i] = '';
        // A content noun that modifies a site is the site: «موقع المقالات», "the article page".
        else if (isArabic(tokens[i]) ? roles[i - 1] === 'site' : roles[i + 1] === 'site') roles[i] = '';
    }
    // …and in English a site word before content modifies it: "a blog post" is a post.
    for (let i = 0; i + 1 < tokens.length; i++) {
        if (roles[i] === 'site' && roles[i + 1] === 'content' && !isArabic(tokens[i])) roles[i] = '';
    }
    let asObject = false;
    let lastNoun: Role = '';
    for (let i = 0; i < tokens.length && !asObject; i++) {
        const t = tokens[i];
        const ar = t.match(AR_PUBLISH_VERB_TOKEN);
        const clauseStart = i === 0 || roles[i - 1] === 'break' || STARTS_A_CLAUSE.test(tokens[i - 1]);
        const verb = !!ar || EN_PUBLISH_VERB_TOKEN.test(t) || (/^post$/.test(t) && clauseStart);
        if (verb) {
            const pronoun = !!(ar && ar[1]) || (!ar && /^(?:it|them)$/.test(tokens[i + 1] || ''));
            if (pronoun) {
                asObject = lastNoun === 'content';
            } else {
                // The first noun after the verb, inside its clause, is what it publishes.
                for (let j = i + 1, words = 0; j < tokens.length && words < 8; j++) {
                    if (roles[j] === 'break') break;
                    if (roles[j] === 'content') { asObject = true; break; }
                    if (roles[j] === 'site') break;
                    if (/[\p{L}\p{N}]/u.test(tokens[j])) words++;
                }
            }
        }
        if (roles[i] === 'content' || roles[i] === 'site') lastNoun = roles[i];
    }
    return { anywhere: roles.includes('content'), asObject, siteNamed: roles.includes('site') };
}

/**
 * «ممكن تنشر الموقع؟» IS AN ORDER. «كيف أنشر الموقع؟» IS A QUESTION.
 *
 * The deploy decision asked one coarse reader «is this a question?» — a first
 * word (can, is, هل…) or a trailing "?" — and knew the order in one form only,
 * the imperative. Measured on the reader itself, before this:
 *
 *     Can you deploy the site?         → no deploy   ("can" opens it)
 *     Could you publish it now?        → no deploy   (the "?")
 *     هل يمكن نشر الموقع الآن؟          → no deploy   («هل»; «نشر» is not «انشر»)
 *     ممكن تنشر الموقع؟                 → no deploy   («تنشر» is not «انشر»)
 *     تقدر ترفع الموقع على النت؟        → no deploy   («رفع» was never a publish)
 *     ازاي انشر الموقع؟                 → DEPLOY      («ازاي» was not on the list)
 *     ممكن تشرح لي كيف أنشر الموقع؟     → DEPLOY      («كيف» does not open it)
 *
 * The politest way to ask for a publish published nothing, and two ways of
 * asking HOW published his project. What tells them apart is grammar, and it
 * is read here once, over the words:
 *
 *   • A REQUEST FRAME hands Joe the verb: «ممكن / تقدر / هل يمكنك / فيك /
 *     ينفع», "can you / could you / would you / is it possible to", and the
 *     wish «عايزك / ابغاك / بدي ياك», "I'd like you to". The verb after it is
 *     Joe's — second person («تنشر»), the masdar («نشر الموقع») or the English
 *     base form — and it NAMES WHAT TO PUBLISH: a site as its object, or a
 *     pronoun. "Can you deploy to AWS?" names nothing: it asks what Joe can do.
 *   • It stays a question when the frame governs another verb («ممكن تشرح لي
 *     كيف…», "can you explain how…"), when an interrogative stands before it
 *     («كيف ممكن تنشر الموقع؟»), when it asks a choice or a condition («… ولا
 *     أستنى؟», "… or wait?", «مجاناً؟», "for free?", "without a domain?"), or
 *     when nobody is addressed and no particular site is meant ("is it
 *     possible to deploy a site …").
 *   • An INTERROGATIVE before the publish word, in the same clause, is a
 *     question about publishing wherever it stands: «ازاي / شلون / كيف / ليش /
 *     وين», "how / why / where". One inside an order ends at the conjunction —
 *     «شوف وين المشكلة وانشر الموقع» still publishes.
 *   • «ارفع الموقع على النت», "upload the site to the web": an upload of the
 *     site itself to the internet is a publish. «ارفع الصور على الموقع» and
 *     «ارفع الموقع على جيت هاب» are not read here.
 *   • «انشره», "publish it" opening the request, with nothing after it but
 *     «الآن» or a courtesy: the pronoun has no antecedent in the request, so it
 *     is what is open — the project. With an antecedent («اكتب ملخصاً وانشره»)
 *     or a place («انشره على تويتر») it is left to the readers that had it.
 *
 * A denial is read before any of this («ممكن ما تنشره؟» → denied). One walk
 * over the words, bounded looks ahead: linear.
 */
const ASK_COURTESY = /^(?:please|pls|plz|kindly|hey|hi|hello|ok|okay|so|now|well|just|joe|يا|جو|طيب|يلا|تمام|خلاص|اوكي|الان|هلا|هلق|بليز|لطفا|رجا|فضلا|ارجوك|ارجو|[,،!])$/u;
const ASK_CAN_YOU_AR = /^(?:[بهح]?تقدر|تستطيع|تسطيع|يمكنك|بامكانك|بمقدورك|بوسعك|فيك|يمديك|تگدر|تكدر|عايزك|عاوزك|ابغاك|ابيك|اريدك|اباك|نبيك)$/u;
//  «لازم تنشر الموقع», «بدي تنشره», «ياريت تنشر الموقع»: a need or a wish with the verb in the
//  second person hands Joe the verb like «ممكن» does. («بدي انشر الموقع» is his own wish in
//  the first person, read by the order reader as before.)
const ASK_IS_IT_POSSIBLE_AR = /^(?:ممكن|يمكن|بالامكان|ينفع|يصير|بيصير|لازم|يجب|ياريت|ريت|بدي|ابغي|ابي|اريد|عايز|عاوز|نبي|ودي|محتاج)$/u;
/** «هل», and the Maghreb's «واش»: the particle that opens a yes/no question, before the frame. */
const ASK_YES_NO_PARTICLE = /^(?:هل|واش)$/u;
const ASK_YOU_PUBLISH_AR = /^[بهح]?ت(نشر|رفع|ستضيف)(?:ي|وا|و)?(ه|ها)?(?:لي|لنا)?$/u;
const ASK_PUBLISHING_AR = /^(نشر|رفع|استضافه)(ه|ها)?$/u;
const ORDER_PUBLISH_AR = /^[وف]?ا(نشر|رفع|ستضف)(?:ي|وا|و)?(ه|ها)?(?:لي|لنا)?$/u;
const ASK_OBJECT_DETERMINER = /^(?:the|my|our|your|this|that|هذا|هذه|هاد|هاي|ده|دي)$/u;
const ASK_OBJECT_FILLER = /^(?:لي|لنا|me|us)$/u;
const ASK_ADJUNCT_LEAD = /^(?:of|about|for|to|on|in|at|from|with|عن|حول|علي|في|الي|من|مع)$/u;
/** «الموقع», «للموقع», «موقعي», «متجره», «صفحتها»: a particular site, not any site. */
const AR_DEFINITE_SITE = /^[وف]?(?:[بكل]?ال|لل)|(?:ي|نا|ك|كم)$|(?:موقع|مشروع|نظام|تطبيق|متجر|خادم|سيرفر)(?:ه|ها)$|ت(?:ه|ها)$/u;
const ASKS_A_CHOICE_OR_A_CONDITION = /^(?:or|ام|ولا|او|free|without|مجانا|ببلاش|بدون|بلا)$/u;
const FOLLOWS_A_BARE_ORDER = /^(?:now|today|already|immediately|asap|please|pls|thanks|الان|هلق|هلا|دلوقتي|دلوقت|الحين|هسه|اليوم|حالا|فورا|بليز|دابا|دغيا|دروك|ذروك|توا|تو)$/u;
const ONLINE_PLACE = /^(?:(?:[بل]?ال|لل|عال|ع)?(?:نت|انترنت|ويب)|اونلاين|لايف|online|live|internet|web)$/u;
const ASK_INTERROGATIVE = /^(?:how|what|why|where|which|who|whether|كيف|كيفيه|ازاي|شلون|اشلون|كيفاش|ليش|ليه|لماذا|متي|امتي|ايمتي|وين|فين|اين|ايش|شو|ماذا|وش|كم|بكم|هل)$/u;
const ASK_CONNECTIVE = /^(?:and|so|but|و|ف|بس|لكن|بعدين|وبعدين)$/u;
/** The words the deploy decision reacts to, as whole tokens: «انشر», «استضف», "deploy", "publish", "host". */
const PUBLISH_WORD_TOKEN = /^(?:[وف]?ا?نشر(?:ي|وا|و)?(?:ه|ها|هم)?(?:لي|لنا)?|[وف]?استض[\p{L}]{0,6}|(?:re)?deploy|(?:re)?publish|host)$/u;

interface PublishAsk {
    /** A request to publish a named site, put as a polite question or a wish. */
    polite: boolean;
    /** A question about publishing: an interrogative governs the publish word. */
    about: boolean;
    /** An order to upload the site itself to the internet. */
    uploadsTheSite: boolean;
    /** What is published is a pronoun with no antecedent in the request: the open project. */
    pronounTarget: boolean;
    /** «نشر الموقع», and nothing more: the order put as a noun, the way a menu puts it. */
    namesThePublish: boolean;
}

/** Past the courtesies a request opens with: «لو سمحت», «يا جو», "please", "ok,". A few of them — the look ahead is bounded. */
function afterCourtesy(tokens: string[], from: number): number {
    let i = from;
    for (let seen = 0; seen < 8; seen++) {
        const t = tokens[i] || '', u = tokens[i + 1] || '';
        if (ASK_COURTESY.test(t)) i++;
        else if ((/^(?:لو|اذا)$/u.test(t) && /^(?:سمحت|تكرمت|تسمح|ممكن|امكن)$/u.test(u)) || (t === 'من' && u === 'فضلك')) i += 2;
        else break;
    }
    return i;
}

/** The request frame at a position: where the verb it hands over stands, and whether the frame itself addresses Joe. */
function requestFrameAt(tokens: string[], from: number): { next: number; addressed: boolean } | null {
    const j = ASK_YES_NO_PARTICLE.test(tokens[from] || '') ? from + 1 : from;
    const at = (k: number) => tokens[j + k] || '';
    let next = -1, addressed = true;
    if (/^(?:can|could|would|will)$/u.test(at(0)) && /^(?:you|u)$/u.test(at(1))) next = j + 2;
    else if (at(0) === 'is' && at(1) === 'it' && at(2) === 'possible' && at(3) === 'to') { next = j + 4; addressed = false; }
    else if (at(0) === 'would' && at(1) === 'it' && at(2) === 'be' && at(3) === 'possible' && at(4) === 'to') { next = j + 5; addressed = false; }
    else if (at(0) === 'i') {
        let k = 1;
        if (at(k) === 'would') k++;
        else if (/^['’]$/u.test(at(k)) && at(k + 1) === 'd') k += 2;
        if (/^(?:want|need|like)$/u.test(at(k)) && at(k + 1) === 'you' && at(k + 2) === 'to') next = j + k + 3;
    }
    else if (ASK_CAN_YOU_AR.test(at(0))) next = j + 1;
    else if (at(0) === 'بدي' && /^(?:ياك|اياك)$/u.test(at(1))) next = j + 2;
    else if (ASK_IS_IT_POSSIBLE_AR.test(at(0))) { next = j + 1; addressed = false; }
    if (next < 0) return null;
    next = afterCourtesy(tokens, next);
    if (tokens[next] === 'ان') next++;
    return { next, addressed };
}

/** The publish verb at a position: inside a frame, the verb Joe is asked to do («تنشر», «نشر», "deploy"); alone, the order («انشر», "publish"). */
function publishVerbAt(tokens: string[], at: number, framed: boolean): { verb: 'deploy' | 'publish' | 'upload'; pronoun: boolean; second: boolean; next: number } | null {
    const t = tokens[at] || '';
    if (/^(?:re)?deploy$/u.test(t)) return { verb: 'deploy', pronoun: false, second: false, next: at + 1 };
    if (/^(?:(?:re)?publish|host)$/u.test(t)) return { verb: 'publish', pronoun: false, second: false, next: at + 1 };
    if (t === 'upload') return { verb: 'upload', pronoun: false, second: false, next: at + 1 };
    if (t === 'go' && tokens[at + 1] === 'live') return { verb: 'deploy', pronoun: false, second: false, next: tokens[at + 2] === 'with' ? at + 3 : at + 2 };
    const you = framed ? t.match(ASK_YOU_PUBLISH_AR) : null;
    const ar = you || (framed ? t.match(ASK_PUBLISHING_AR) : t.match(ORDER_PUBLISH_AR));
    if (!ar) return null;
    return { verb: ar[1] === 'رفع' ? 'upload' : ar[1] === 'نشر' ? 'publish' : 'deploy', pronoun: !!ar[2], second: !!you, next: at + 1 };
}

/** What the verb publishes: a pronoun, or the site named as its object — never content, never the object of a preposition. */
function publishedThingAt(tokens: string[], at: number, pronounOnVerb: boolean): { pronoun: boolean; definite: boolean; next: number } | null {
    if (pronounOnVerb) return { pronoun: true, definite: true, next: at };
    if (/^(?:it|this)$/u.test(tokens[at] || '') && !SITE_NOUN_TOKEN.test(tokens[at + 1] || '')) return { pronoun: true, definite: true, next: at + 1 };
    let definite = false;
    for (let j = at, words = 0; j < tokens.length && words < 4; j++) {
        const t = tokens[j];
        if (CLAUSE_BREAK.test(t) || CONTENT_NOUN_TOKEN.test(t) || ASK_ADJUNCT_LEAD.test(t)) return null;
        if (ASK_OBJECT_DETERMINER.test(t)) { definite = true; continue; }
        if (ASK_OBJECT_FILLER.test(t)) continue;
        if (SITE_NOUN_TOKEN.test(t)) {
            const arabic = /[؀-ۿ]/u.test(t);
            if (!arabic && CONTENT_NOUN_TOKEN.test(tokens[j + 1] || '')) return null;      // "a blog post" is a post
            return { pronoun: false, definite: definite || (arabic && AR_DEFINITE_SITE.test(t)), next: j + 1 };
        }
        words++;
    }
    return null;
}

function readHowPublishIsAsked(userGoal: string, contentAnywhere: boolean): PublishAsk {
    const tokens = foldChars(String(userGoal || '')).match(WORD_OR_BREAK) || [];
    const out: PublishAsk = { polite: false, about: false, uploadsTheSite: false, pronounTarget: false, namesThePublish: false };
    const head = afterCourtesy(tokens, 0);
    {
        const noun = (tokens[head] || '').match(ASK_PUBLISHING_AR);
        const thing = noun && noun[1] !== 'رفع' ? publishedThingAt(tokens, head + 1, !!noun[2]) : null;
        if (thing) {
            const after = tokens[afterCourtesy(tokens, thing.next)];
            out.namesThePublish = after === undefined || FOLLOWS_AN_ORDER.test(after) || FOLLOWS_A_BARE_ORDER.test(after);
        }
    }
    //  0: no interrogative in this clause. 1: one inside it («شوف وين المشكلة…»), which a
    //  conjunction ends. 2: one that opens it («ازاي أختبر وأنشر الموقع؟»), which only the
    //  end of the clause ends.
    let asking = 0;
    let opens = true;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (CLAUSE_BREAK.test(t)) { asking = 0; opens = true; continue; }
        if (ASK_CONNECTIVE.test(t)) { if (asking === 1) asking = 0; opens = true; continue; }
        const coordinated = /^[وف]/u.test(t) && ORDER_PUBLISH_AR.test(t);
        if (coordinated && asking === 1) asking = 0;
        if ((opens || coordinated) && !asking) {
            const start = opens ? afterCourtesy(tokens, i) : i;
            const frame = requestFrameAt(tokens, start);
            const verb = publishVerbAt(tokens, frame ? frame.next : start, !!frame);
            const thing = verb ? publishedThingAt(tokens, verb.next, verb.pronoun) : null;
            if (verb && thing) {
                let goesOnline = false;
                for (let j = thing.next; j < tokens.length && j < thing.next + 3 && !CLAUSE_BREAK.test(tokens[j]); j++) goesOnline = goesOnline || ONLINE_PLACE.test(tokens[j]);
                //  «انشره لي», «انشره يا جو», «انشره لو سمحت»: for whom, and to whom, add nothing to publish.
                let bare = thing.next;
                if (ASK_OBJECT_FILLER.test(tokens[bare] || '')) bare++;
                bare = afterCourtesy(tokens, bare);
                for (let seen = 0; seen < 4 && FOLLOWS_A_BARE_ORDER.test(tokens[bare] || ''); seen++) bare = afterCourtesy(tokens, bare + 1);
                const after = tokens[bare];
                const nothingElse = after === undefined || CLAUSE_BREAK.test(after) || after === 'and' || /^و[\p{L}]{3,}$/u.test(after);
                let choiceOrCondition = false;
                for (let j = thing.next; j < tokens.length && j < thing.next + 12 && !CLAUSE_BREAK.test(tokens[j]); j++) choiceOrCondition = choiceOrCondition || ASKS_A_CHOICE_OR_A_CONDITION.test(tokens[j]);
                const names = thing.pronoun
                    //  "deploy" is never said of an article: "can you deploy this to production?"
                    //  names what is open, wherever it goes.
                    ? !contentAnywhere && start === head && (verb.verb === 'deploy' || (nothingElse && verb.verb !== 'upload'))
                    : verb.verb !== 'upload' || goesOnline;
                if (names && frame) {
                    if (!choiceOrCondition && (frame.addressed || verb.second || thing.definite)) {
                        out.polite = true;
                        out.pronounTarget = out.pronounTarget || thing.pronoun;
                    }
                } else if (names) {
                    out.uploadsTheSite = out.uploadsTheSite || verb.verb === 'upload';
                    out.pronounTarget = out.pronounTarget || thing.pronoun;
                }
            }
        }
        const opensTheClause = opens;
        opens = false;
        if (ASK_INTERROGATIVE.test(t)) asking = Math.max(asking, opensTheClause ? 2 : 1);
        else if (asking && PUBLISH_WORD_TOKEN.test(t)) out.about = true;
    }
    return out;
}

/**
 * THE WORD «انشر» IN A REQUEST IS NOT YET AN ORDER TO PUBLISH NOW.
 *
 * The readers above decide HOW a publish is asked. None of them asked whether the
 * publish word is an order at all, or whether the order is for now — and the
 * capability matcher chose a deploy tool for any request that carried the word and no
 * veto. The third pre-merge review (2026-11-12) measured, each one → deploy_pages:
 *
 *     كلمة انشره مكتوبة غلط في الزر، صححها     the word is a button's label
 *     أضف زر مكتوب عليه انشر                    … a label he is adding
 *     سمّ الزر انشر الموقع                       … the name he gives a button
 *     زر النشر ما يشتغل، صلحه                   a bug report about a button
 *     انشره غلط كان، رجعه                       an order to undo a publish
 *     انشره بعد ما تصلح الخطأ                   the order is the fix; the publish follows it
 *     انشره لما أقولك · انشره بس بعد ما أقولك   it waits for his word
 *     بعد ما أراجع التصميم بنشره أنا            he publishes it himself
 *     انشره؟ لا لسه                              he asks, and answers no
 *     ارفع الملف                                 an upload of a file
 *
 * One walk over the words reads each publish word where it stands:
 *
 *   • A MENTION is not a use: the word inside quotation marks, the word after a label
 *     noun in its clause («زر / كلمة / نص / عنوان / اسم», "button / label / text /
 *     word"), the English word used as a noun ("the deploy", "the publish button"),
 *     and the publish he does himself («أنا أنشره», «بنفسي», "I'll publish it").
 *     A mention is blanked, so no reader after this one sees it.
 *   • AN ORDER THAT WAITS is not for now: a clause of time or condition stands
 *     before it in its sentence («بعد ما أراجعه، انشره», «لما أقولك، انشره»,
 *     "when I say so, deploy") or after it («انشره لما أقولك», "deploy it once the
 *     tests pass"), or he asks and answers no («انشره؟ لا لسه»). When the clause names
 *     a step of Joe's own («بعد ما تصلح الخطأ، انشره») the publish FOLLOWS that work
 *     instead of waiting for him (see AFTER_AR above). A coordinated order
 *     is a sequence and does not wait: «اختبر الموقع وبعدين انشره». A courtesy is
 *     not a condition: «انشره لو سمحت», «انشره إذا ممكن», "deploy it when you can".
 *     «بعد» with a noun is not read as one either («انشر الموقع بعد تحديث المحتوى»).
 *   • What is left is AN ORDER the matcher may act on: the imperative with an object,
 *     a site, or a pronoun followed by nothing that makes it something else
 *     («انشره غلط كان» is a statement about a publish); an upload only of a site or
 *     of «it» («ارفع الملف» uploads a file); the English verb in use.
 *
 * Bounded looks back and ahead from each word: linear.
 */
const USE_HARD_BREAK = /^[\n.!?؟؛;]$/u;
const USE_COORDINATOR = /^(?:و|ف|ثم|and|then|so|but|بس|لكن|بعدين|وبعدين)$/u;
/** Where the clause a trailing condition belongs to ends: «انشر الموقع وإذا فشل خبرني» conditions the telling. */
const USE_ZONE_END = /^(?:و|ف|ثم|and|then|so)$/u;
const SUBORDINATOR_AR = /^(?:لما|لمن|لين|عندما|حين|حينما|بعدما|قبلما|ريثما|ملي|اذا|لو)$/u;
const SUBORDINATOR_AR_WITH_MA = /^(?:بعد|قبل|وقت|اول|ساعه|يوم|متي|لحد|عقب)$/u;
const SUBORDINATOR_EN = /^(?:after|before|when|once|until|unless|if|till|whenever)$/u;
const EN_CLAUSE_SUBJECT = /^(?:i|you|we|it|he|she|they|everything|all|tests?)$/u;
const A_CONDITION_OF_COURTESY_AR = /^(?:سمحت|سمحتي|تكرمت|تسمح|ممكن|امكن|تقدر|بتقدر|فيك|تريد|بتريد|حبيت)$/u;
const A_CONDITION_OF_COURTESY_EN = /^(?:can|could|want|like|wish|please)$/u;
/** "when you have a moment", "once you get a chance", "when you get to it": a courtesy. "once you have fixed the header" is a step. */
const HAVE_OR_GET = /^(?:have|get)$/u;
const A_MOMENT = /^(?:a|the|some|time|chance|moment|minute|second|sec|to|around)$/u;
/*
 * WHOSE STEP STANDS BEFORE THE PUBLISH. The fourth pre-merge review (2026-11-12): «انشر
 * الموقع بعد ما تختبره», «انشره بعد ما تصلح الخطأ», "once you finish the fixes, deploy",
 * "Publish it after you add the contact page" were read like «انشره بعد ما أراجعه» — a
 * publish that waits for HIM — though the step they name is Joe's own, ordered in the
 * same words. A clause of time that says AFTER («بعد ما / لما / أول ما / عقب ما», "after /
 * once / when / as soon as"), with its verb in the second person, names work Joe does
 * first: the request is that work and then the publish (`follows`), never a publish that
 * waits and never a publish alone that skips the work. When the clause only says he is
 * finished («بعد ما تخلص», "when you're done") no work is named: it is the order, for now.
 * His own act, an approval or a word from him keeps the publish waiting, whoever the verb
 * addresses («بعد ما توافق الإدارة», "once you get my approval").
 */
const AFTER_AR = /^(?:لما|لمن|عندما|حين|حينما|بعدما|ملي)$/u;
const AFTER_AR_WITH_MA = /^(?:بعد|وقت|اول|ساعه|يوم|متي|عقب)$/u;
const AFTER_EN = /^(?:after|when|once|whenever|as)$/u;
const YOU_DO_AR = /^[بهح]?ت[\p{L}]{2,}$/u;
const YOU_FINISH_AR = /^[بهح]?ت(?:خلص|نتهي|كمل|فرغ|جهز|سالي|تم)(?:ي|وا|و)?(?:ه|ها|هم)?$/u;
const BEFORE_YOUR_VERB_AR = /^(?:انت|انتي|انتا|راح|رح|تكون)$/u;
const HIS_APPROVAL_AR = /^(?:[وفبل]?(?:ال|لل)?(?:موافق[\p{L}]{0,4}|اذن[\p{L}]{0,3}|تاكيد[\p{L}]{0,3}|اعتماد[\p{L}]{0,3})|[بهح]?[تي]?(?:وافق|سمح|اكد|اعتمد|قول)[\p{L}]{0,4}|مني|كلمتي|ردي)$/u;
const HIS_APPROVAL_EN = /^(?:approv[a-z]*|permission|confirm[a-z]*|ahead|ok|okay|say|word|hear|heard|told|green|me)$/u;
const YOU_ARE = /^(?:['’]|re|are|ve|have|all)$/u;
const YOU_FINISH_EN = /^(?:done|finished|ready|through|complete|completed|finish)$/u;
/*
 * A PUBLISH THAT WAITS ON SOMEONE ELSE WAITS. The fifth pre-merge review (2026-11-12):
 * "Publish it after the client approves", "…after the client pays", "…after management signs
 * off", "…after the tests pass" each deployed at once — "after" was a subordinator only before
 * a pronoun — and «انشره بعد ما تدفع الشركة», «…بعد ما تشوف رد العميل», "after you receive the
 * logo from the client" were read as a step of Joe's own because the verb opens with «ت» or
 * follows "you". What the publish is conditioned on decides it:
 *
 *   • an event that is not Joe's deed — another party's act, an approval, a payment, a result
 *     nobody ordered him to produce ("after the tests pass", «بعد ما تنجح الاختبارات»,
 *     «بعد موافقة العميل») — keeps it waiting;
 *   • something he must first RECEIVE («تستلم», «توصلك», "receive", "get … from", "hear back")
 *     or another party's answer («رد العميل», "the client's reply") keeps it waiting too;
 *   • a step of his own («بعد ما تصلح», "after you fix") is followed by it, as before;
 *   • a noun of his own work is no condition: "after the content update", «بعد تحديث المحتوى»;
 *   • a result of a deed the same words order is that deed's result: "run the tests and deploy
 *     if they pass", «شغل الاختبارات وانشره لو نجحت» follow the run.
 *
 * English has no mark on a clause but its finite verb: "after the client approves" is a clause,
 * "after the latest changes" is a noun. A word after the subject is read as that verb when it
 * is an auxiliary, a past form, a third-person «-s» that is not a noun's plural by its ending,
 * or a bare verb after a plural subject ("the tests pass").
 */
const AN_APPROVAL_OR_PAYMENT_EN = /^(?:approv[a-z]*|permission|consent|confirm(?:s|ed|ation)?|payments?|paid|pays|signoff|ahead)$/u;
/** The nouns among them, which may also name something else: "the payment bug", "the confirmation email". */
const AN_APPROVAL_OR_PAYMENT_NOUN_EN = /^(?:approvals?|permission|consent|confirmation|payments?|signoff)$/u;
/** What may follow the head of a condition and leave it the head: "payment is confirmed", "approval from legal", "payment clears". */
const AFTER_ITS_HEAD_EN = /^(?:is|are|was|were|has|have|had|gets|got|comes|came|goes|went|clears|cleared|arrives|arrived|lands|landed|succeeds|completes|from|for|and|then|please|now|today|tomorrow|received|confirmed|done|completed|processed|granted|given)$/u;
/** "after getting approval", "after receiving the payment": a gerund of what he is given, not of what he does. */
const GIVEN_TO_HIM_EN = /^(?:getting|receiving|obtaining|hearing|having|awaiting|seeing|marketing|accounting|billing|engineering|testing|staging|meeting|morning|evening|something|anything|nothing|everything|spring|thing|king)$/u;
const NOT_A_SUBJECT_EN = /^(?:the|a|an|my|our|your|his|her|their|its|this|that|these|those|all|some|any|each|every|last|latest|recent|new|final|next|previous|current|other|remaining|pending|first|second|few|more|of|for|to|in|on|with|at|by|from|into)$/u;
const AN_AUXILIARY_EN = /^(?:is|are|was|were|has|have|had|gets|got|does|did|can|will|becomes|goes|comes)$/u;
const A_PLURAL_BY_ITS_ENDING = /(?:ss|us|is|ions|ments|ings|ers|ors|ness|ties|ities|days|weeks|hours|minutes|months|years|fixes|changes|updates|edits|tweaks|tests|checks|builds|releases|sales|pages|images|photos|files|items|steps|tasks|notes|styles|features|sections|details|results|issues|bugs|posts|views|works|needs|plans|designs|costs)$/u;
const A_BARE_VERB_EN = /^(?:pass|succeed|finish|complete|run|clear|agree|approve|confirm|pay|arrive|land|merge|respond|reply|return|come|go|end|work|load|sign|decide)$/u;
const YOU_RECEIVE_EN = /^(?:receive[ds]?|obtain(?:ed)?)$/u;
const YOU_GET_EN = /^(?:get|got|have|hear|heard|see|seen|read|check)$/u;
const AN_ANSWER_EN = /^(?:reply|replies|response|responses|feedback|answer|answers|decision|verdict|input)$/u;
/** «تستلم», «توصلك», «تجي», «تدفع», «تنجح», «تكتمل», «تجهز»: he receives, it arrives, it is paid, it succeeds, it is ready — none is work he does. */
const NOT_YOUR_DEED_AR = /^[بهح]?ت(?:ستلم(?:ي|وا|و)?(?:ه|ها|هم)?|وصل(?:ك|ني|نا|لك|لي|لنا)|جي(?:ك|ني|نا)?|يجي(?:ك|ني|نا)?|دفع|سدد|نجح|كتمل|نتهي|جهز)$/u;
/** …the last four only with their subject after them: «تنتهي الاختبارات», «تجهز الصور»; «بعد ما تجهز» alone is "when you are ready". */
const NEEDS_ITS_SUBJECT_AR = /^[بهح]?ت(?:نجح|كتمل|نتهي|جهز)$/u;
const ANOTHER_PARTY_AR = new RegExp(`^${AR_CLITICS}(?:عميل|عميله|عملا|زبون|زبونه|زباين|شركه|اداره|مدير|مديره|فريق|مالك|صاحب|بنك|محاسب|مصمم|مصممه|مسوول|جهه|لجنه|شريك|شركا|ممول|مستثمر|كلاينت|مشرف|رييس|ريس|محامي|مراجع|مدقق)(?:ي|نا|ه|ها|هم)?$`, 'u');
/** The party a verb in «ت» can have as its SUBJECT: feminine, or many. «تضيف المدير» has Joe as its subject and the manager as its object. */
const SUBJECT_OF_A_VERB_IN_T_AR = new RegExp(`^${AR_CLITICS}(?:عميله|عملا|زبونه|زباين|شركه|اداره|مديره|مصممه|جهه|لجنه|شركا)(?:ي|نا|ه|ها|هم)?$`, 'u');
/** «تدفع التغييرات على جيت هاب»: what is pushed, not paid. */
const PUSHED_AR = /^(?:ال)?(?:تغييرات|تعديلات|تحديثات|كود|كوميت|كوميتات|فرع|براتش|ملفات)$/u;
/** «تجهز الصفحة الرئيسية», «تكتمل صفحة التواصل»: a part of the site is his to make ready; «تجهز الصور», «تكتمل الاختبارات» come from elsewhere. */
const BUILT_BY_HIM_AR = new RegExp(`^${AR_CLITICS}(?:صفحه|صفحات|قسم|اقسام|سكشن|هيدر|فوتر|نموذج|فورم|زر|ازرار|واجهه|قايمه|موقع|تطبيق|متجر|لوحه|داشبورد|تعديلات|اصلاحات|تغييرات|تحديثات|ميزه|خاصيه)(?:ي|نا|ه|ها)?$`, 'u');
const AN_ANSWER_AR = new RegExp(`^${AR_CLITICS}(?:رد|ردود|جواب|راي|ملاحظات|تعليق|تعليقات|قرار|فيدباك|من)$`, 'u');
const AN_APPROVAL_OR_PAYMENT_AR = /^(?:ال|لل)?(?:موافق[\p{L}]{1,4}|اذن|تاكيد|اعتماد|دفع|سداد|توقيع|استلام|تسديد)$/u;
/** The result of a deed ordered beside the publish: "…and deploy if they pass", «…وانشره لو نجحت». */
const ITS_RESULT_EN = /^(?:they|it|all|everything)$/u;
const A_RESULT_AR = /^(?:نجح|نجحت|نجحوا|عدت|عدي|عدوا|مشي|مشت|زبط|زبطت|اشتغل|اشتغلت|كله|كلها|تمام|طلع|طلعت|مر|مرت)$/u;
/*
 * A REFUSAL IS NOT AN ORDER. «مش عايز انشر دلوقتي», «مابي انشره الحين», «ما ابغى انشره»,
 * "I do not want to deploy it now" each planned a deploy: the publish verb stood in the
 * words and the denial reader knew only «لا تنشر». A wish that is negated — the negator,
 * the wish, the publish verb — denies the publish, in the first person («مش عايز انشره»)
 * and in the second («مش عاوزك تنشره»).
 */
const NEGATES_A_WISH = /^(?:مش|مو|مب|موب|ما|لا|مهو|ماني|مانيش|منيش|لست|لسنا|not|never|t)$/u;
const A_WISH = /^(?:عايز|عاوز|عايزه|عاوزه|عايزك|عاوزك|عايزين|ابغي|ابغا|ابغاك|ابي|ابيك|بدي|بدنا|اريد|اريدك|نريد|نبي|نبغي|نبيك|ودي|حاب|حابب|حابه|حابين|ناوي|ناويه|باغي|بغيت|محتاج|راح|رح|want|wanna|need|like|wish|going|gonna|plan|planning|intend|ready|have)$/u;
const A_WISH_NEGATED_IN_ONE_WORD = /^ما(?:بي|بغي|بغا|بدي|ودي|ريد|نبي|بغيت)ش?$/u;
const BETWEEN_A_WISH_AND_ITS_VERB = /^(?:ان|انك|اني|انو|انه|to|you|u|us)$/u;
const BETWEEN_A_NEGATOR_AND_A_WISH = /^(?:['’]|do|does|did|would|am|m|re|are|is|really|انا|احنا|نحن)$/u;
/*
 * «انشره على الفيسبوك» IS A POST, NOT A SITE ON THE INTERNET. A publish word whose clause
 * names a social network is read as content is: no deploy tool.
 */
const SOCIAL_VENUE = /^(?:[وفبلع]?(?:ال|لل)?(?:فيسبوك|فيس|تويتر|انستغرام|انستقرام|انستجرام|انستا|لينكدان|لينكدن|تيكتوك|يوتيوب|واتساب|واتس|تلغرام|تليجرام|تلجرام|سناب|سنابشات|ريديت|سوشيال)|facebook|fb|twitter|instagram|insta|linkedin|tiktok|youtube|whatsapp|telegram|snapchat|reddit|threads|social)$/u;
/*
 * …WHEREVER THE NETWORK STANDS IN THE CLAUSE. The sixth pre-merge review (2026-11-12): the
 * venue was read only right after a preposition of place, so a quantifier or any unlisted
 * word between them deployed the site as the post — «انشره على كل مواقع التواصل», «انشره على
 * جميع حساباتنا: فيسبوك وتويتر», «انشره على ستوري الانستغرام», "Deploy it to all social
 * networks" — and «انشره ففيسبوك», "Publish it in our Facebook group", "…through Twitter",
 * "…to both Facebook and Instagram" lost the reading altogether. The test is turned round: a
 * network named in the publish clause IS where it goes, unless a SITE NOUN stands beside it as
 * what is being published or built — after it in English ("my twitter clone", "the reddit
 * bot", "the app with the WhatsApp button", "the youtube downloader app"), before it in Arabic
 * («موقع يشبه فيسبوك», «تطبيق السوشيال ميديا», «زر واتساب»). A place noun that a preposition
 * leads is the venue again: «انشره على موقع فيسبوك».
 */
const TO_A_VENUE = /^(?:علي|ع|في|الي|ل|عبر|to|on|onto|via|across|in|at|through)$/u;
/** «مواقع التواصل», «وسائل التواصل», «منصات السوشيال»: the networks, named together. */
const THE_NETWORKS_AR = /^[وفبلع]?(?:ال|لل)?(?:وسايل|مواقع|منصات|شبكات|قنوات|حسابات)$/u;
const THE_NETWORKS_EN = /^(?:media|networks?|networking|channels?|accounts?|platforms|pages|profiles|handles|sites)$/u;
const OF_THE_NETWORKS_AR =/^(?:ال)?(?:تواصل|سوشيال|سوشل)$/u;
/** After the network: "twitter clone", "social network app", "WhatsApp button", "facebook login", "youtube downloader app". */
const A_SITE_LIKE_IT = /^(?:apps?|application|sites?|websites?|projects?|stores?|shops?|platform|clone|clones|replica|alternative|style|styled|bot|bots|button|buttons|widgets?|integration|login|signin|auth|oauth|feed|share|sharing|link|links|icon|icons|api|sdk|pixel|webhook|downloader|scraper|viewer|client|dashboard|embed|plugin|tool|analytics|scheduler|manager|template|theme|landing|game)$/u;
/** What ends the noun the network opens: "on Twitter FOR the launch", "to Facebook AND Instagram". */
const ENDS_ITS_NOUN = /^(?:for|to|on|in|at|with|by|from|of|about|and|or|then|so|but|after|before|when|once|if|as|[^\p{L}\p{N}_'’-])$/u;
/** Before the network, in English: "like twitter", "a clone of twitter", "login with facebook", "sign in via google"… */
const A_SITE_OF_IT_EN = /^(?:like|clone|clones|copy|replica|similar|inspired|login|signin|sign|log|share|sharing|style|styled)$/u;
const BETWEEN_IT_AND_THE_NETWORK = /^(?:in|with|via|by|of|to|on|the|a|an|using|through)$/u;
/** Before the network, in Arabic: the thing built («موقع», «تطبيق», «زر», «أيقونات», «بوت») or its likeness («يشبه», «شبيه», «مثل», «زي»). */
const A_SITE_OF_IT_AR = new RegExp(`^${AR_CLITICS}(?:موقع|تطبيق|متجر|مشروع|منصه|نظام|نسخه|نسخ|كلون|بوت|زر|ازرار|ايقونه|ايقونات|رابط|روابط|ودجت|لوجين|محمل|داشبورد|لوحه|مشاركه|تكامل|ربط|تسجيل|دخول|ستايل|شبيه|شبيهه|مشابه|مشابهه)(?:ي|نا|ه|ها|ك)?$|^(?:[يت]شبه|شبه|مثل|زي|متل|بحال|كانه)$`, 'u');
/** …but a PLACE that a preposition leads is where it goes: «على موقع فيسبوك», «في تطبيق انستغرام», «بتطبيق واتساب». */
const A_PLACE_AR = /^(?:[بلع]|عال|بال|لل|ال)?(?:موقع|تطبيق|منصه)$/u;
const A_PLACE_LED_AR = /^(?:[بلع]|عال|بال|لل)(?:موقع|تطبيق|منصه)$/u;
/*
 * "THE DEPLOY FAILED, TRY AGAIN" ORDERS THE DEPLOY AGAIN. The publish named as a thing
 * («النشر», "the deploy") is a mention, and orders nothing — until an order to do it again
 * stands beside it: the retry takes its deed from the thing that failed. «جرب مرة ثانية»,
 * «أعد المحاولة», «أعد النشر», "try again", "retry the deploy". «لا تحاول مرة ثانية» denies it.
 */
const THE_PUBLISH_AR = /^[وفب]?(?:ال|لل)(?:نشر|استضافه|ديبلوي)$/u;
const THE_PUBLISH_EN = /^(?:deployments?|deploying|publishing)$/u;
const AN_ACT_HEAD_EN = /^(?:failed|fails|failure|is|was|isn|wasn|did|does|didn|doesn|steps?|process|pipeline|jobs?|command|scripts?|workflow|errors?)$/u;
const RETRY_AR = /^[وف]?(?:جرب|حاول|عيد|اعد|كرر|عاود)(?:ي|وا|و)?(?:ه|ها)?$/u;
const RETRY_EN = /^(?:retry|redo|rerun)$/u;
const AGAIN_AFTER = /^(?:try|it|that|this|do|run|go)$/u;
const AGAIN_AR = /^(?:مره|تاني|ثاني|ثانيه|تانيه|كمان|من|المحاوله)$/u;
const DENIES_A_RETRY = /^(?:لا|ما|بلاش|مش|مو|not|never|t|no)$/u;
/*
 * …AND ONLY WHEN THE DEPLOY IS WHAT FAILED. "The deploy worked. The login failed, try again" re-deployed:
 * the publish stayed the last thing named across the sentence that said it worked, and across the
 * failure of something else. A publish said to have worked is not what a retry repeats, and a failure
 * stated after it with a subject of its own («فشل تسجيل الدخول», "the login failed") takes the retry.
 */
const IT_WORKED = /^(?:worked|works|working|succeeded|succeeds|passed|fine|ok|okay|good|great|live|done|successful|successfully|اشتغل|اشتغلت|نجح|نجحت|تمام|زبط|مشي|تم|ناجح|كويس|زين|شغال|اوكي)$/u;
const DENIES_IT_WORKED = /^(?:didn|doesn|isn|wasn|hasn|not|never|no|t|ما|مش|مو|لم|مب|موب|ماهو)$/u;
const IT_FAILED = /^(?:failed|fails|failing|broke|broken|crashed|crashes|errored|[وف]?(?:فشل|فشلت|خرب|خربت|علق|علقت|تعطل|تعطلت))$/u;
const ITSELF = /^(?:it|that|this|which|also|again|still|just|and|then|has|have|هو|هي|برضه|كمان|ايضا)$/u;
const A_RESULT_EN = /^(?:pass|passes|passed|passing|succeed|succeeds|succeeded|green|work|works|worked|clean)$/u;
/** «واليوم فشل», "today it failed", "then it broke": a word of time before the failure names nothing else that failed. */
const SINCE_THEN = /^[وف]?(?:اليوم|امس|امبارح|مبارح|البارح|البارحه|الحين|الان|هلق|هلا|دلوقتي|دلوقت|هسه|دابا|بعدين|بعدها|فجاه|today|now|then|later|suddenly|yesterday|since|but|و|ف|بس|لكن)$/u;
/*
 * A CONDITION TOLD AS DONE HOLDS NOTHING BACK. "After the client approved it yesterday I want it live:
 * deploy now" waited for an approval it had just been told of. When the clause of time before the order
 * is in the past («بعد ما وافق العميل امس», "after the client approved it") and the order itself says now
 * («انشره دلوقتي», "deploy now"), the order is for now. «إذا / لو», "if" stay conditions in any tense.
 */
const RIGHT_NOW = /^(?:now|immediately|asap|الحين|الان|هلق|هلا|دلوقتي|دلوقت|هسه|حالا|فورا|دابا|دغيا|توا)$/u;
const PAST_TIME = /^(?:yesterday|already|earlier|امس|امبارح|مبارح|البارح|البارحه|خلاص)$/u;
const A_PAST_FORM_EN = /^(?:[a-z]{3,}ed|paid|gave|said|sent|got|came|went|did)$/u;
const A_FILE_EXTENSION = /^(?:sh|bash|zsh|ps1|bat|cmd|ya?ml|json|js|mjs|cjs|ts|tsx|jsx|py|rb|php|toml|ini|cfg|conf|md|txt|log|env|xml|html?|css|lock|tf|sql|go|rs|java)$/u;
/** "…and deploy it", "…and publish the site", "…and deploy when done": the order in a list, with what it publishes or when. */
const ENDS_A_LIST_EN = /^(?:and|then|also|please)$/u;
const AFTER_AN_ORDER_IN_A_LIST = /^(?:it|this|that|them|the|my|our|your|everything|when|once|after|now|to|on|please|asap|immediately|today)$/u;
/*
 * «نشرو دغيا», «نشروه دابا»: the Maghreb's imperative drops the alif. Without it the word is
 * also the noun and the past («نشر الموقع», «نشره أمس»), so it is the order only where a
 * clause opens with it, carrying its pronoun, and nothing follows but «now» or a courtesy.
 */
const ORDER_PUBLISH_NO_ALIF = /^(نشر)(?:و|وه|وها|ه|ها|يه|يها)$/u;
/*
 * "fields: sku, name, publish date" LISTS A FIELD. "inventory app: sku, name, publish
 * date" deployed the app it was asked to build: the publish word names a column. After a
 * header that announces fields («الحقول:», "columns:") every word up to the end of the
 * sentence is one; and "host" is the verb only with what it hosts ("host it", "host the
 * site") — "host, port, user" are fields wherever they stand.
 */
const FIELD_HEADER = /^(?:fields?|columns?|attributes?|properties|props|schema|[وفب]?(?:ال)?(?:حقول|اعمده|خانات|خصائص))$/u;
const WHAT_HOST_HOSTS = /^(?:it|this|that|them|the|my|our|your|a|an|on|with|at)$/u;
const LABEL_NOUN_AR = new RegExp(`^${AR_CLITICS}(?:زر|ازرار|كلمه|كلمات|نص|نصوص|عنوان|تسميه|اسم|مسمي|عباره|جمله|ايقونه|لافته|تبويب|مكتوب|مكتوبه)(?:ه|ها)?$`, 'u');
const LABEL_WORD = /^(?:buttons?|labels?|text|words?|title|caption|heading|placeholder|tooltip|named|called|says|reads|renamed?|سم|سمي|سمه|سميه|سمها)$/u;
const HE_DOES_IT_AR = /^[وف]?(?:انا|راح|رح|سوف)$/u;
const BY_HIMSELF = /^(?:بنفسي|انا|بيدي|myself|ourselves)$/u;
const HE_DOES_IT_EN = /^(?:i|we|ll|will|shall|gonna|me)$/u;
const EN_NOUN_LEAD = /^(?:the|a|an|this|that|my|our|your|its|last|previous|latest|next|failed|wrong|bad|old|new|first|every|each)$/u;
const EN_NOUN_HEAD = /^(?:buttons?|labels?|links?|text|words?|menu|icon|tab|steps?|scripts?|logs?|keys?|settings?|config|pipeline|status|errors?|failure|process|command|option|feature|screen|form|workflow|jobs?|history|hook|failed|fails|is|was|isn|wasn|did|does|didn|doesn|dates?|times?|datetime|timestamp|states?|urls?|names?|ids?|flags?|fields?|columns?|year|count|toggle|checkbox|targets?|environments?|permissions?|rights|roles?|notifications?|queue|schedule)$/u;
const EN_PUBLISH_USE = /^(?:(?:re)?deploy|(?:re)?publish|host)$/u;
const ANSWERS_NO = /^(?:لا|لسه|لسا|لسع|مو|مش|موب|ليس|كلا|استني|اصبر|no|not|nope|nah|wait)$/u;
const NOT_WORD = /^(?:مو|مش|موب|ليس|not)$/u;
const NOW_WORD = /^(?:الحين|الان|هلق|هلا|دلوقتي|دلوقت|هسه|اليوم|now|today|yet)$/u;
/** What may follow «انشره» and leave it an order: a place, a purpose, a time, a courtesy, another clause. */
const FOLLOWS_AN_ORDER = /^(?:علي|في|الي|من|مع|عند|ع|to|on|at|in|for|with|عشان|علشان|حتي|كي|لكي|لان|because|لو|اذا|يا|مره|كمان|again|(?:لل|عال|بال|[لب])[\p{L}]{2,}|و[\p{L}]*|[^\p{L}\p{N}_])$/u;
const A_QUOTED_SPAN = /«([^»\n]{1,120})»|"([^"\n]{1,120})"|“([^”\n]{1,120})”/gu;
const A_PUBLISH_WORD_INSIDE = /نشر|رفع|ستض|deploy|publish|host/iu;

interface PublishUses {
    /** The request with every mention of a publish word blanked: what the denial and content readers read. */
    said: string;
    /** …and with every order that is not for now blanked too: what decides a publish now. */
    used: string;
    /** An order to publish stands in the words, and it waits for him: his act, his word, a condition. */
    waits: boolean;
    /** An order to publish stands in the words, after work of Joe's own that the same words order. */
    follows: boolean;
    /** He says he does not want to publish («مش عايز انشره», "I don't want to deploy it now"). */
    refused: boolean;
    /** What he publishes goes to a social network («انشره على الفيسبوك»): a post, not a site. */
    social: boolean;
    /** An order to publish stands in the words, for now: the matcher may act on it. */
    orders: boolean;
    /** What is said beside the publish — the clauses that hold no publish word and list no fields — or '' when that is not two words. */
    beside: string;
}

/** '' — nothing holds the publish back; 'waits' — it waits for him; 'follows' — it comes after Joe's own work. */
type PublishWait = '' | 'waits' | 'follows';

function readPublishUses(text: string): PublishUses {
    const found = [...text.matchAll(WORD_OR_BREAK)];
    const folds = new Map<string, string>();
    const f: string[] = found.map(m => {
        let folded = folds.get(m[0]);
        if (folded === undefined) { folded = foldChars(m[0]); folds.set(m[0], folded); }
        return folded;
    });
    const at = (i: number) => f[i] || '';
    // A quoted publish word is a mention — unless the quotation is the whole message.
    const quoted: Array<[number, number]> = [];
    for (const q of text.matchAll(A_QUOTED_SPAN)) {
        const from = q.index || 0, to = from + q[0].length;
        if (!A_PUBLISH_WORD_INSIDE.test(q[0])) continue;
        if (!text.slice(0, from).trim() && !text.slice(to).trim()) continue;
        quoted.push([from, to]);
    }
    let q = 0;
    const isQuoted = (offset: number): boolean => {
        while (q < quoted.length && quoted[q][1] <= offset) q++;
        return q < quoted.length && quoted[q][0] <= offset;
    };
    const isComma = (u: string): boolean => u === ',' || u === '،';
    /** Nothing more is said in the clause from here: its end, a courtesy, «now», or the next order. */
    const endsItsClause = (k: number): boolean => {
        const u = at(k);
        return !u || USE_HARD_BREAK.test(u) || isComma(u) || USE_COORDINATOR.test(u) || ASK_COURTESY.test(u)
            || FOLLOWS_A_BARE_ORDER.test(u) || ORDER_PUBLISH_AR.test(u) || EN_PUBLISH_USE.test(u) || ASK_YOU_PUBLISH_AR.test(u);
    };
    /** The clause after «بعد ما / لما»: his step (the publish waits), Joe's own work (it follows), or only «when you are done» (''). */
    const yourStepAr = (k: number): PublishWait => {
        let v = k;
        for (let seen = 0; seen < 2 && BEFORE_YOUR_VERB_AR.test(at(v)); seen++) v++;
        const verb = at(v);
        if (!YOU_DO_AR.test(verb)) return 'waits';
        //  «تستلم الشعار», «توصلك الصور», «تدفع الشركة», «تنجح الاختبارات»: not a deed of his —
        //  «تنتهي من التعديلات», «تجهز لي صفحة الدفع», «تكتمل صفحة التواصل», «تدفع التغييرات» are: the same verb, with his own work after it.
        const next = at(v + 1);
        const hisWork = /دفع$/u.test(verb) ? PUSHED_AR.test(next)
            : /نتهي$/u.test(verb) ? next === 'من'
            : /(?:جهز|كتمل)$/u.test(verb) ? ASK_OBJECT_FILLER.test(next) || BUILT_BY_HIM_AR.test(next)
            : false;
        if (NOT_YOUR_DEED_AR.test(verb) && !hisWork && !(NEEDS_ITS_SUBJECT_AR.test(verb) && endsItsClause(/^من(?:ه|ها|هم)$/u.test(next) ? v + 2 : v + 1))) return 'waits';
        for (let j = v; j < f.length && j <= v + 6; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u) || (j > v && ORDER_PUBLISH_AR.test(u))) break;
            if (HIS_APPROVAL_AR.test(u)) return 'waits';
            //  Another party as the giver («من العميل»), as the one who answers («رد العميل»), or as the verb's subject — which a
            //  verb in «ت» has only when the party is feminine or many («تدفع الشركة», «توافق الإدارة»). «تضيف المدير», «تراسل
            //  العميل» are Joe's deeds, with the party as their object.
            if (j > v && ANOTHER_PARTY_AR.test(u) && (AN_ANSWER_AR.test(f[j - 1]) || (j === v + 1 && SUBJECT_OF_A_VERB_IN_T_AR.test(u)))) return 'waits';
        }
        return YOU_FINISH_AR.test(verb) && endsItsClause(/^من(?:ه|ها|هم)$/u.test(next) ? v + 2 : v + 1) ? '' : 'follows';
    };
    /** The same after "after / once / when you": `k` is the word after "you". */
    const yourStepEn = (k: number, after: boolean): PublishWait => {
        if (A_CONDITION_OF_COURTESY_EN.test(at(k))) return '';
        let given = false;
        for (let j = k; j < f.length && j <= k + 8; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u) || (j > k && EN_PUBLISH_USE.test(u))) break;
            if (HIS_APPROVAL_EN.test(u)) return 'waits';
            if (j > k && (u === 'from' || AN_ANSWER_EN.test(u))) given = true;
        }
        if (HAVE_OR_GET.test(at(k)) && A_MOMENT.test(at(k + 1))) return '';
        //  "after you receive the logo", "once you get the texts from the client", "when you see their reply": he waits for it.
        let got = k;
        for (let seen = 0; seen < 2 && /^(?:['’]|ve|have|finally|also)$/u.test(at(got)); seen++) got++;
        if (YOU_RECEIVE_EN.test(at(got)) || (given && YOU_GET_EN.test(at(got)))) return 'waits';
        if (!after) return 'waits';
        let v = k;
        for (let seen = 0; seen < 3 && YOU_ARE.test(at(v)); seen++) v++;
        if (!YOU_FINISH_EN.test(at(v))) return 'follows';
        let end = v + 1;
        if (at(end) === 'with') end++;
        if (/^(?:it|that|this|everything|up|all)$/u.test(at(end))) end++;
        return endsItsClause(end) ? '' : 'follows';
    };
    /** After "after / once / when": a clause whose subject is not Joe ("the client approves", "management signs off"), or an approval or a payment named ("the client's approval"). */
    const anotherPartysEvent = (k: number): boolean => {
        let subject = false, last = '';
        //  "after fixing the payment bug", "after adding the confirmation email template": a gerund is work of his own,
        //  whatever its object is called — unless it is what he is given ("after getting the client's approval").
        if (/^[a-z]{2,}ing$/u.test(at(k)) && !GIVEN_TO_HIM_EN.test(at(k))) return false;
        for (let j = k; j < f.length && j <= k + 8; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u) || USE_ZONE_END.test(u) || EN_PUBLISH_USE.test(u)) return false;
            //  An approval or a payment is the condition where it is its HEAD ("after payment", "after the client's approval",
            //  "after approval from legal") — not where it names another noun ("the payment integration", "the payments page").
            const names = AN_APPROVAL_OR_PAYMENT_NOUN_EN.test(u) && /^[a-z]{3,}$/u.test(at(j + 1)) && !AFTER_ITS_HEAD_EN.test(at(j + 1))
                && !AN_APPROVAL_OR_PAYMENT_EN.test(at(j + 1)) && !EN_PUBLISH_USE.test(at(j + 1));
            if ((AN_APPROVAL_OR_PAYMENT_EN.test(u) && !names) || (u === 'off' && /^sign(?:s|ed)?$/u.test(last))) return true;
            if (subject && (AN_AUXILIARY_EN.test(u) || (u.length >= 5 && /ed$/u.test(u))
                || (u.length >= 4 && /[a-z]s$/u.test(u) && (!A_PLURAL_BY_ITS_ENDING.test(u) || /^(?:it|them|this|that|everything)$/u.test(at(j + 1))))
                || (/[a-z]s$/u.test(last) && A_BARE_VERB_EN.test(u)))) return true;
            if (/^[a-z]{2,}$/u.test(u) && !NOT_A_SUBJECT_EN.test(u)) subject = true;
            if (/^[a-z]+$/u.test(u)) last = u;
        }
        return false;
    };
    const subordinatorAt = (i: number, t: string = at(i)): PublishWait => {
        const next = at(i + 1);
        if (SUBORDINATOR_AR.test(t)) {
            if (/^(?:اذا|لو)$/u.test(t)) return A_CONDITION_OF_COURTESY_AR.test(next) || (next === 'ما' && /^(?:عليك|فيها|في)$/u.test(at(i + 2))) ? '' : 'waits';
            return AFTER_AR.test(t) ? yourStepAr(i + 1) : 'waits';
        }
        if (SUBORDINATOR_AR_WITH_MA.test(t)) {
            if (next === 'ما') return AFTER_AR_WITH_MA.test(t) ? yourStepAr(i + 2) : 'waits';
            //  «بعد موافقة العميل», «بعد الدفع»: an approval or a payment is not his to make. «بعد تحديث المحتوى» is his work.
            return /^(?:بعد|عقب)$/u.test(t) && AN_APPROVAL_OR_PAYMENT_AR.test(next) ? 'waits' : '';
        }
        if (t === 'as' && next === 'soon' && at(i + 2) === 'as') return at(i + 3) === 'you' ? yourStepEn(i + 4, true) : 'waits';
        if (!SUBORDINATOR_EN.test(t)) return '';
        if (t === 'before') return EN_CLAUSE_SUBJECT.test(next) ? (next === 'you' ? yourStepEn(i + 2, false) : 'waits') : '';
        if (next === 'you') return yourStepEn(i + 2, AFTER_EN.test(t));
        if (EN_CLAUSE_SUBJECT.test(next) || (t !== 'after' && /^(?:the|my|our|all)$/u.test(next))) return 'waits';
        return anotherPartysEvent(i + 1) ? 'waits' : '';
    };
    /** The clause a publish word conditions: a subordinator after it, before the sentence or the clause ends. */
    const waitAfter = (i: number): PublishWait => {
        for (let j = i + 1; j < f.length && j <= i + 12; j++) {
            const u = f[j];
            //  «انشره؟ لا لسه»: he asks, and answers no.
            if (USE_HARD_BREAK.test(u)) return /^[?؟]$/u.test(u) && ANSWERS_NO.test(at(j + 1)) ? 'waits' : '';
            if (USE_ZONE_END.test(u) || (/^[وف][\p{L}]{3,}$/u.test(u) && j > i + 1)) return '';
            //  «انشره بعدين مو الحين»: not now.
            const kind = subordinatorAt(j) || (NOT_WORD.test(u) && NOW_WORD.test(at(j + 1)) ? 'waits' : '');
            if (kind) return kind;
        }
        return '';
    };
    /** «مش عايز انشره», «مابي انشره», "I don't want to publish": the wish before the verb is negated. */
    const refusedAt = (i: number): boolean => {
        let k = i - 1;
        for (let seen = 0; seen < 2 && BETWEEN_A_WISH_AND_ITS_VERB.test(at(k)); seen++) k--;
        const wish = at(k);
        if (A_WISH_NEGATED_IN_ONE_WORD.test(wish)) return true;
        //  «ما بديش»: the «ش» that closes Egypt's and the Levant's negation.
        if (!A_WISH.test(wish) && !(wish.endsWith('ش') && A_WISH.test(wish.slice(0, -1)))) return false;
        for (let j = k - 1, seen = 0; j >= 0 && seen < 4; j--, seen++) {
            if (NEGATES_A_WISH.test(f[j])) return true;
            if (!BETWEEN_A_NEGATOR_AND_A_WISH.test(f[j])) return false;
        }
        return false;
    };
    /**
     * A social network named in the publish word's own clause is WHERE IT GOES — whatever
     * stands between them («على كل مواقع التواصل», "in our Facebook group", «انشره تويتر») —
     * unless a site noun stands beside it as what is being published or built: "Deploy my
     * twitter clone", «انشر موقع يشبه فيسبوك», "Deploy the app with the WhatsApp button",
     * «انشر تطبيق السوشيال ميديا» publish a site. The clause ends at the next deed: "Deploy
     * the site and share it on twitter" deploys, and the share is a second deed.
     */
    const socialAfter = (i: number): boolean => {
        let ofASite = -100;                                  // the network last read as part of a site
        for (let j = i + 1; j < f.length && j <= i + 10; j++) {
            const u = f[j];
            const together = THE_NETWORKS_AR.test(u) && OF_THE_NETWORKS_AR.test(at(j + 1));
            //  "social" is a network with its noun ("social media", "all our social channels"); "the social proof section" is a section.
            if ((SOCIAL_VENUE.test(u) && (u !== 'social' || THE_NETWORKS_EN.test(at(j + 1)) || !/^\p{L}/u.test(at(j + 1)))) || together) {
                //  A site noun before it: «زر واتساب», «موقع يشبه فيسبوك», «نسخة من تويتر», «البوت بتاع تليجرام», "like twitter", "login with facebook".
                let s = j - 1;
                if (/^(?:من|مع|بتاع|بتاعه|بتاعت|تبع|حق|مال)$/u.test(at(s))) s--;
                let before = s > i && A_SITE_OF_IT_AR.test(at(s)) && !(A_PLACE_AR.test(at(s)) && (TO_A_VENUE.test(at(s - 1)) || A_PLACE_LED_AR.test(at(s))));
                for (let k = j - 1, seen = 0; !before && k > i && seen < 3; k--, seen++) {
                    if (A_SITE_OF_IT_EN.test(f[k])) before = true;
                    else if (!BETWEEN_IT_AND_THE_NETWORK.test(f[k])) break;
                }
                //  A site noun after it, in the noun the network opens: "twitter clone", "social network app", "youtube downloader app".
                let after = false;
                for (let k = j + 1, seen = 0; !after && k < f.length && k <= j + 8 && seen < 3; k++, seen++) {
                    //  "the facebook and twitter icons": the networks are listed, and the noun is theirs together.
                    if (/^(?:and|or|,|&)$/u.test(f[k]) && SOCIAL_VENUE.test(at(k + 1))) { k++; seen = 0; continue; }
                    if (ENDS_ITS_NOUN.test(f[k])) break;
                    after = A_SITE_LIKE_IT.test(f[k]);
                }
                //  …and a network listed with one that names a site names it too: «أيقونات فيسبوك وتويتر», "the facebook and twitter icons".
                const listed = ofASite === j - 1 || (ofASite === j - 2 && /^(?:and|or|و|او|,|،|&)$/u.test(at(j - 1)));
                if (!before && !after && !listed) return true;
                ofASite = together ? j + 1 : j;
                continue;
            }
            if (USE_HARD_BREAK.test(u) || (isComma(u) && ofASite !== j - 1) || (USE_ZONE_END.test(u) && ofASite !== j - 1) || /^[وف][\p{L}]{3,}$/u.test(u)) return false;
        }
        return false;
    };
    const blank: Array<[number, number, boolean]> = [];      // from, to, a mention (true) or not for now (false)
    let subordinated: PublishWait = '';
    let label = false, fields = false, free = false, waiting = false, following = false, refusal = false, social = false;
    let lastPublishNamed = -100;                             // where «النشر», "the deploy" last stood as a thing
    let inItsClause = false;                                 // …and its clause is still being said
    let workedAt = -100;                                     // where the publish was last said to have worked, in this sentence
    let subordinatedAt = -100;                               // where the condition that holds the next order opened
    const inList = new Uint8Array(f.length);                 // words of a field list, and its header
    /** The publish named as a thing — unless it is said to have WORKED: "The deploy worked. The login failed, try again" repeats no publish. */
    const nameThePublish = (i: number): void => {
        let negated = false;
        for (let j = i + 1; j < f.length && j <= i + 5; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u) || USE_COORDINATOR.test(u)) break;
            if (DENIES_IT_WORKED.test(u)) negated = true;
            else if (IT_WORKED.test(u)) { if (negated) break; lastPublishNamed = -100; inItsClause = false; workedAt = i; return; }
        }
        lastPublishNamed = i; inItsClause = true;
    };
    /** A result of a deed ordered beside the publish: "…and deploy if they pass", «…وانشره لو نجحت». */
    const conditionedOnItsResult = (i: number): boolean => {
        for (let j = i + 1; j < f.length && j <= i + 6; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u)) return false;
            if (/^(?:لو|اذا|لما)$/u.test(u)) return A_RESULT_AR.test(at(j + 1));
            if (!/^(?:if|when|once)$/u.test(u)) continue;
            if (!ITS_RESULT_EN.test(at(j + 1))) return false;
            return A_RESULT_EN.test(at(j + 2)) || A_RESULT_EN.test(at(j + 3)) || A_RESULT_EN.test(at(j + 4));
        }
        return false;
    };
    const hold = (kind: PublishWait): void => { if (kind === 'waits') waiting = true; else following = true; };
    /** «انشره دلوقتي», "deploy now", "deploy the site right now": the order says now, in its own clause. */
    const orderedForNow = (i: number): boolean => {
        for (let j = i + 1; j < f.length && j <= i + 4; j++) {
            const u = f[j];
            if (USE_HARD_BREAK.test(u) || isComma(u) || USE_ZONE_END.test(u) || NOT_WORD.test(u)) return false;
            if (RIGHT_NOW.test(u)) return true;
        }
        return false;
    };
    /** The condition before the order is told in the past: a word of past time in it, a past form in English, a verb with no prefix of the present after «ما / لما». */
    const toldAsDone = (from: number, to: number): boolean => {
        if (from < 0 || to - from > 14) return false;
        const opens = f[from].replace(/^[وف](?=[\p{L}]{3})/u, ''), withMa = at(from + 1) === 'ما';
        if (!(AFTER_EN.test(opens) || AFTER_AR.test(opens) || (withMa && AFTER_AR_WITH_MA.test(opens)))) return false;
        const verb = withMa ? at(from + 2) : at(from + 1);
        if (/^[\p{L}]{3,}$/u.test(verb) && /^\p{Script=Arabic}/u.test(verb) && !/^[بهح]?[يتنا]/u.test(verb) && !/^(?:ال|لل)/u.test(verb)) return true;
        //  "is approved", "gets paid" are still to come, and "the fixed header" is a header.
        for (let j = from + 1; j < to; j++) if (PAST_TIME.test(f[j]) || (A_PAST_FORM_EN.test(f[j]) && !/^(?:is|are|be|being|gets|get|isn|aren|the|a|an|my|our|this|that)$/u.test(f[j - 1]))) return true;
        return false;
    };
    /** «deploy.sh», «scripts/deploy.yml»: the word is a file's name, and its dot ends no sentence. */
    const inAFileName = (i: number): boolean => {
        const dot = f[i] === '.' ? i : i + 1;
        if (f[dot] !== '.' || dot < 1 || dot + 1 >= f.length || !A_FILE_EXTENSION.test(f[dot + 1]) || !/^[a-z0-9_-]+$/u.test(f[dot - 1])) return false;
        const dotAt = found[dot].index || 0;
        return (found[dot - 1].index || 0) + found[dot - 1][0].length === dotAt && (found[dot + 1].index || 0) === dotAt + 1;
    };
    for (let i = 0; i < f.length; i++) {
        const t = f[i];
        if (fields) inList[i] = 1;
        if (USE_HARD_BREAK.test(t) && !inAFileName(i)) { subordinated = ''; label = false; fields = false; inItsClause = false; workedAt = -100; continue; }
        if (isComma(t) || t === ':') {
            label = false; inItsClause = false;
            if (t === ':' && (FIELD_HEADER.test(at(i - 1)) || FIELD_HEADER.test(at(i - 2)) || FIELD_HEADER.test(at(i - 3)))) {
                fields = true;
                for (let j = Math.max(0, i - 3); j <= i; j++) inList[j] = 1;
            }
            continue;
        }
        //  "when I say so, deploy": this "so" closes his clause and coordinates nothing.
        if (t === 'so' && /^(?:say|says|said|do|did|think|hope|told)$/u.test(at(i - 1))) continue;
        if (USE_COORDINATOR.test(t)) {
            subordinated = ''; label = false; inItsClause = false;
            if (/^(?:then|ثم|بعدين|وبعدين)$/u.test(t)) fields = false;       // "…, then publish it" leaves the list
            continue;
        }
        const start = found[i].index || 0, end = start + found[i][0].length;
        const prev = at(i - 1);
        let ar = t.match(ORDER_PUBLISH_AR);
        if (!ar && (i === 0 || USE_HARD_BREAK.test(prev) || isComma(prev) || prev === ':' || USE_COORDINATOR.test(prev) || ASK_COURTESY.test(prev))) {
            const noAlif = t.match(ORDER_PUBLISH_NO_ALIF);
            const after = at(i + 1);
            if (noAlif && (!after || USE_HARD_BREAK.test(after) || isComma(after) || FOLLOWS_A_BARE_ORDER.test(after) || ASK_COURTESY.test(after))) ar = [t, noAlif[1], 'ه'] as unknown as RegExpMatchArray;
        }
        //  «احذف ملف النشر deploy.sh»: the publish word is a file's name, and what is ordered is done to the file.
        if (!ar && EN_PUBLISH_USE.test(t) && inAFileName(i)) { blank.push([start, end, true]); continue; }
        const en = !ar && EN_PUBLISH_USE.test(t);
        if (!ar && !en) {
            //  «الحقول: الاسم، استضافة الموقع، التكلفة», «زر الاستضافة»: the noun of the publish in a field list or a label is a field, a label.
            if ((fields || label) && (PUBLISH_WORD_TOKEN.test(t) || THE_PUBLISH_AR.test(t) || ASK_PUBLISHING_AR.test(t) || /^(?:ال)?استضافه$/u.test(t))) { blank.push([start, end, true]); continue; }
            //  «ممكن تنشر الموقع بعد ما أراجعه؟»: the verb he hands Joe waits like the order does.
            //  Only on what follows it: «بعد ما تنشر الموقع ابعتلي الرابط» is not a wait.
            if (ASK_YOU_PUBLISH_AR.test(t)) {
                if (refusedAt(i)) { blank.push([start, end, true]); refusal = true; continue; }
                if (socialAfter(i)) social = true;
                for (let j = i + 1; j < f.length && j <= i + 12; j++) {
                    const u = f[j];
                    if (USE_HARD_BREAK.test(u) || USE_ZONE_END.test(u) || /^[وف][\p{L}]{3,}$/u.test(u)) break;
                    const kind = subordinatorAt(j);
                    if (!kind) continue;
                    blank.push([start, end, false]);
                    hold(kind);
                    break;
                }
                continue;
            }
            if (ASK_PUBLISHING_AR.test(t) && socialAfter(i)) social = true;
            if (!label && !fields && (THE_PUBLISH_AR.test(t) || THE_PUBLISH_EN.test(t)) && !isQuoted(start)) { nameThePublish(i); continue; }
            //  "The deploy was fine yesterday, today it failed, retry": the same publish, said to have failed SINCE — by a pronoun,
            //  by its own name, or with no subject at all («واليوم فشل») — is named again, and the retry is its.
            if (workedAt >= 0 && lastPublishNamed < 0 && IT_FAILED.test(t)) {
                const names = (w: string): boolean => /^[\p{L}]{2,}$/u.test(w) && !ITSELF.test(w) && !SINCE_THEN.test(w)
                    && !THE_PUBLISH_AR.test(w) && !THE_PUBLISH_EN.test(w) && !EN_PUBLISH_USE.test(w);
                if (!names(prev) && !(/^[a-z]/u.test(t) ? false : names(at(i + 1)))) { lastPublishNamed = i; inItsClause = false; }
                workedAt = -100;
                continue;
            }
            //  "…The login failed, try again": what failed last is the login, and the retry is its.
            if (lastPublishNamed >= 0 && !inItsClause && IT_FAILED.test(t)) {
                const another = (w: string): boolean => /^[\p{L}]{2,}$/u.test(w) && !ITSELF.test(w);
                const itsOwn = (w: string): boolean => THE_PUBLISH_AR.test(w) || THE_PUBLISH_EN.test(w) || EN_PUBLISH_USE.test(w);
                const after = /^[a-z]/u.test(t) ? '' : at(i + 1);            // «فشل تسجيل الدخول»: Arabic names it after the verb too
                if (!itsOwn(prev) && !itsOwn(after) && (another(prev) || another(after))) lastPublishNamed = -100;
                continue;
            }
            //  An order to do it again, beside the publish that is named as a thing.
            const again = RETRY_EN.test(t) || (t === 'again' && AGAIN_AFTER.test(prev));
            if ((again || RETRY_AR.test(t)) && !label
                && !(DENIES_A_RETRY.test(prev) || DENIES_A_RETRY.test(at(i - 2)) || (t === 'again' && DENIES_A_RETRY.test(at(i - 3))))) {
                const named = again
                    ? THE_PUBLISH_EN.test(at(i + 1)) || ((THE_PUBLISH_EN.test(at(i + 2)) || EN_PUBLISH_USE.test(at(i + 2))) && EN_NOUN_LEAD.test(at(i + 1)))
                    : THE_PUBLISH_AR.test(at(i + 1)) || THE_PUBLISH_AR.test(at(i + 2));
                const afterIt = i - lastPublishNamed <= 12 && (again || endsItsClause(i + 1) || AGAIN_AR.test(at(i + 1)));
                if (named || afterIt) {
                    const kind = subordinated || waitAfter(i);
                    if (kind) hold(kind); else free = true;
                }
                continue;
            }
            const glued = /^[وف][\p{L}]{2,}$/u.test(t);
            const kind = subordinatorAt(i) || (glued && SUBORDINATOR_AR.test(t.slice(1)) ? subordinatorAt(i, t.slice(1)) : '');
            if (kind) { subordinated = kind; subordinatedAt = i; }
            else if (LABEL_NOUN_AR.test(t) || LABEL_WORD.test(t)) label = true;
            continue;
        }
        if (ar && /^[وف]/u.test(t)) { subordinated = ''; label = false; }      // «… وانشره»: a coordinated order
        const next1 = at(i + 1);
        //  «الحقول: الاسم والايميل وانشره», "fields: name, email and deploy it": an order with its object is no field, and ends the list.
        if (fields && (ar ? !!ar[2] || SITE_NOUN_TOKEN.test(next1) || /^(?:ال|لل)[\p{L}]{2,}$/u.test(next1)
            : ENDS_A_LIST_EN.test(prev) && AFTER_AN_ORDER_IN_A_LIST.test(next1) && !EN_NOUN_HEAD.test(at(i + 2)))) { fields = false; inList[i] = 0; }
        //  "the deploy", "deploy status", "publish date": the English word as a noun.
        const asANoun = en && (EN_NOUN_LEAD.test(prev) || EN_NOUN_HEAD.test(next1));
        const mention = isQuoted(start) || label || fields
            || (ar ? HE_DOES_IT_AR.test(prev) || BY_HIMSELF.test(next1) || BY_HIMSELF.test(at(i + 2)) || BY_HIMSELF.test(at(i + 3))
                : HE_DOES_IT_EN.test(prev) || asANoun || (t === 'host' && !WHAT_HOST_HOSTS.test(next1) && !SITE_NOUN_TOKEN.test(next1)));
        if (mention) {
            //  "The deploy failed": the publish itself, named as a thing — not its button, its date or its status.
            if (asANoun && !label && !fields && (AN_ACT_HEAD_EN.test(next1) || !EN_NOUN_HEAD.test(next1))) nameThePublish(i);
            blank.push([start, end, true]);
            continue;
        }
        if (refusedAt(i)) { blank.push([start, end, true]); refusal = true; continue; }
        if (socialAfter(i)) { blank.push([start, end, false]); social = true; continue; }
        let state: PublishWait = subordinated || waitAfter(i);
        //  "After the client approved it yesterday I want it live: deploy now": the condition is told as done, and the order is for now.
        if (state === 'waits' && subordinated && orderedForNow(i) && toldAsDone(subordinatedAt, i)) state = waitAfter(i);
        //  "Run the tests and deploy if they pass": the condition is the result of the deed ordered before it.
        if (state === 'waits' && !subordinated && i >= 2 && (/^(?:and|then|ثم|بعدين|وبعدين)$/u.test(prev) || (!!ar && /^[وف]/u.test(t))) && conditionedOnItsResult(i)) state = 'follows';
        if (state) { blank.push([start, end, false]); hold(state); continue; }
        // An order for now. Is it one the matcher may act on?
        if (en) { free = true; continue; }
        const verb = ar![1], pronoun = !!ar![2];
        let next = i + 1;
        if (ASK_OBJECT_FILLER.test(at(next))) next++;
        //  A clause of time that held nothing back («انشره اول ما تخلص») leaves the order an order.
        const timeClause = (k: number): boolean => SUBORDINATOR_AR.test(at(k)) || (SUBORDINATOR_AR_WITH_MA.test(at(k)) && at(k + 1) === 'ما') || SUBORDINATOR_EN.test(at(k)) || (at(k) === 'as' && at(k + 1) === 'soon');
        if (pronoun) free = free || next >= f.length || FOLLOWS_AN_ORDER.test(at(next)) || FOLLOWS_A_BARE_ORDER.test(at(next)) || ASK_COURTESY.test(at(next)) || timeClause(next);
        else if (verb === 'رفع') free = free || !!publishedThingAt(f, i + 1, false);
        else free = true;
    }
    //  What is said beside the publish: every clause that holds no publish word and is no field list.
    let beside = '', kept = 0, clauseFrom = 0, itsOwn = false, words = 0;
    const closeClause = (to: number): void => {
        beside += itsOwn ? ' '.repeat(to - clauseFrom) : text.slice(clauseFrom, to);
        if (!itsOwn) kept += words;
        clauseFrom = to; itsOwn = false; words = 0;
    };
    for (let i = 0; i < f.length; i++) {
        const t = f[i];
        const separator = USE_HARD_BREAK.test(t) || isComma(t) || USE_COORDINATOR.test(t);
        if (separator || (/^[وف][\p{L}]{3,}$/u.test(t) && !inList[i])) closeClause(found[i].index || 0);
        //  «ارفع الملف» uploads a file: the upload verb is a publish word only with a site or «it» after it.
        const verb = t.match(ORDER_PUBLISH_AR) || t.match(ASK_YOU_PUBLISH_AR) || t.match(ASK_PUBLISHING_AR);
        const publishes = !!verb && (verb[1] !== 'رفع' || !!verb[2] || !!publishedThingAt(f, i + 1, false));
        if (inList[i] || (!separator && (publishes || PUBLISH_WORD_TOKEN.test(t) || THE_PUBLISH_AR.test(t) || THE_PUBLISH_EN.test(t)))) itsOwn = true;
        else if (!separator && /[\p{L}]/u.test(t)) words++;
    }
    closeClause(text.length);
    const read = { waits: waiting && !free, follows: following && !free && !waiting, refused: refusal && !free, social: social && !free, orders: free, beside: kept >= 2 ? beside : '' };
    if (!blank.length) return { said: text, used: text, ...read };
    let said = '', used = '', last = 0;
    for (const [from, to, mention] of blank) {
        const gap = ' '.repeat(to - from);
        said += text.slice(last, from) + (mention ? gap : text.slice(from, to));
        used += text.slice(last, from) + gap;
        last = to;
    }
    return { said: said + text.slice(last), used: used + text.slice(last), ...read };
}

/** An imperative creation verb (folded spelling) — not «نفّذ/implement/fix», whose object is the repairs. */
const CONSTRUCTION_VERB_TOKEN = /^(?:build|create|scaffold|develop|generate|design|make|[وف]?(?:ابن|ابني|انشي|اصنع|اعمل|صمم|طور|برمج|سوي)(?:لي|لنا)?)$/u;
/** Where an imperative stands: the start of a clause, or after a conjunction or courtesy. */
const IMPERATIVE_LEAD = /^(?:and|then|please|also|now|just|so|ثم|ايضا|الان|رجاء|فضلك|سمحت|كمان|بعدين)$/u;
const OBJECT_LEAD = /^(?:a|an|the|some|new|missing|my|our|its|their|all|another|me|us|لي|لنا|له|لها)$/u;
/** What a review's own verb makes: the review, its report, the fixes — never a new deliverable. */
const NOT_A_DELIVERABLE = /^(?:sure|it|them|this|that|these|those|again|and|or|with|for|of|to|in|on|by|from|report|reports|summary|summaries|fix|fixes|repair|repairs|changes?|improvements?|corrections?|adjustments?|tweaks?|edits?|updates?|enhancements?|patch(?:es)?|notes?|backups?|commits?|pr|[وف]?(?:ال)?(?:اصلاح|اصلاحات|تحسين|تحسينات|تصحيح|تصحيحات|تقرير|تقارير|ملخص|تعديل|تعديلات|ملاحظات|ملاحظه|فحص|مراجعه|لازم|مطلوب)|علي|في|من|الي|مع|عن)$/u;

/**
 * A CREATION VERB WITH AN OBJECT IS A CONSTRUCTION, WHATEVER THE OBJECT.
 *
 * isConstructionBrief asked the artifact lexicon for the deliverable, and
 * treated any request that OPENS with a review verb and names no object the
 * lexicon knows as the review itself. With a built project open, measured on
 * the pre-merge review (parent: the build path for each):
 *
 *     Check the results and build a new chart for monthly sales     → project_repair
 *     Audit the delivery module and create unit tests for it        → project_repair
 *     Verify the delivery and build the missing invoice screen      → project_repair
 *
 * A chart, unit tests and an invoice screen are things to make; the lexicon
 * not knowing their names does not make them a review. An imperative
 * creation verb («build», «create», «ابنِ», «أنشئ», «اعمل»…) followed by an
 * object is a construction — unless the object is the review's own product:
 * its report, its fixes, «الإصلاحات», «اللازم», or a bare pronoun.
 * «راجع تقرير الجودة … نفّذ الإصلاحات بنفسك» has no such verb: «نفّذ» is not
 * one, and «أنشأتها» is a past tense in a relative clause.
 */
function ordersConstructionOfAnObject(goal: string): boolean {
    const tokens = foldChars(goal).match(WORD_OR_BREAK) || [];
    for (let i = 0; i < tokens.length; i++) {
        if (!CONSTRUCTION_VERB_TOKEN.test(tokens[i])) continue;
        const prev = tokens[i - 1];
        const imperative = i === 0 || CLAUSE_BREAK.test(prev) || IMPERATIVE_LEAD.test(prev) || /^[وف]/.test(tokens[i]);
        if (!imperative) continue;
        let j = i + 1;
        for (let k = 0; k < 3 && j < tokens.length && OBJECT_LEAD.test(tokens[j]); k++) j++;
        const object = tokens[j] || '';
        if (/[\p{L}\p{N}]/u.test(object) && !CLAUSE_BREAK.test(object) && !NOT_A_DELIVERABLE.test(object)) return true;
    }
    return false;
}

/** What readDeployIntent read from one request. */
export interface DeployIntentReading {
    /** The deploy fast path's decision: put a site/project on the internet. */
    deploy: boolean;
    /**
     * Why the words themselves rule a deploy out, or '' when nothing does:
     * he said not to publish, or what he publishes is content (an article, a
     * post, a tweet) rather than a site — the publish verb's own object, or
     * content with no site named at all; «انشر الموقع وأخبرني بالرابط» and
     * «انشر الموقع بعد تحديث المحتوى» publish the site. A question is not a veto here: the
     * fast path's `isQuestion` is a coarse reader (a first word, a trailing "?", any
     * «بحث») that the run and stop paths still ask. The deploy decision reads the
     * request frame instead (readHowPublishIsAsked): «هل يمكنك نشر الموقع؟» is a
     * polite order and deploys, «كيف أنشر الموقع؟» asks about publishing and does not.
     *
     * 'waits': the publish is ordered for later — his own act or word, or a condition
     * («انشره لما أقولك»). 'follows': it is ordered after work of Joe's own that the same
     * words order («انشر الموقع بعد ما تختبره», "publish it after you add the contact
     * page"): the request is that work and then the publish, so no deploy tool is chosen
     * ALONE for it — a deploy by itself would skip the work — and the planner that reads
     * the whole request plans both.
     */
    veto: '' | 'denied' | 'content' | 'waits' | 'follows';
    /**
     * An order to publish stands in the words, for now — a use of the publish word, not a
     * mention of it, and not waiting on a time or a condition (readPublishUses), or a
     * polite request. The capability matcher chooses a deploy tool only where this is
     * true; the target it may still infer («انشره» after a build, «ارفع الموقع»).
     */
    ordersAPublish: boolean;
    isQuestion: boolean;
    hasBuildVerb: boolean;
    projectTarget: boolean;
    deniesExternalPublish: boolean;
    /**
     * The deploy was read from a pronoun with no antecedent in the text («انشره»,
     * "publish it"): it names no site of its own. A step cut out of a longer request
     * («اكتب مقالاً ثم انشره») has its antecedent in another step, so the chain reader
     * does not take this for a named site target.
     */
    targetIsPronoun: boolean;
    /**
     * What the request says BESIDE the publish: its clauses that hold no publish word and
     * list no fields, the rest blanked ('' when fewer than two words are left). When a
     * deploy tool is refused, another tool is chosen only for what is ordered here.
     */
    besideThePublish: string;
}

/** Does this string actually look like a web address? Free classifier models
 *  hallucinate the "url" field — they have returned plain Arabic words and even
 *  tool names, which Chromium happily punycodes into a bogus host and then
 *  blocks on for the full navigation timeout. A real target is either an
 *  http(s):// URL or a bare ASCII host with a dot and a plausible TLD. */
export function isLikelyUrl(value: string): boolean {
    const v = String(value || '').trim();
    if (!v || /\s/.test(v)) return false;
    let host = v;
    if (/^https?:\/\//i.test(v)) {
        try { host = new URL(v).hostname; } catch { return false; }
    } else {
        host = v.split(/[/?#]/)[0];
    }
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    // ASCII only: an Arabic "hostname" is always a hallucination here.
    if (!/^[A-Za-z0-9.-]+$/.test(host)) return false;
    return /^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(host);
}

/** Extract a deliberately exact response request before any model planning. */
export function extractExactEchoRequest(goal: string): string | null {
    const raw = String(goal || '').trim();
    const match = raw.match(/^(?:reply|respond|answer)\s+with\s+exactly\s+(.+?)\s+and\s+nothing\s+else\.?$/i);
    if (!match) return null;
    const value = match[1].trim().replace(/^(["'`])([\s\S]*)\1$/, '$2').trim();
    return value && value.length <= 240 ? value : null;
}

/**
 * HIS SITE'S INBOX — SAID SO PLAINLY THAT GMAIL MUST NOT ANSWER.
 *
 * «رسائل» belongs to two different worlds: the mail in his Google account,
 * and the messages visitors left in the contact form of the site Joe built
 * him. The Gmail fast-path claimed the word outright, so «اقرأ رسائل نموذج
 * التواصل» — a question about his own site — went to Google and came back
 * asking him to connect an account he never mentioned.
 *
 * This names the second world unambiguously: the word «رسائل» standing next
 * to «النموذج / الموقع / الزوار / التواصل», in either order. Where it
 * matches, the site's inbox wins and the Gmail path steps aside — the same
 * shape as the four guards already living there (a URL login, a compound
 * browse-then-email, a form field named «بريد»).
 *
 * Exported because both ends of that decision have to agree, and a shared
 * constant is the only way two regexes cannot drift apart.
 */
export const SITE_INBOX = new RegExp(
    [
        // «رسائل النموذج» — the site word first, the message word after.
        '(نموذج|النموذج|الموقع|موقعي|الزوار|زوار|التواصل|اتصل\\s*بنا|تواصل\\s*معنا)\\s*[^.\\n]{0,14}?(رسائل|رساله|رسالة|الرسائل)',
        // «رسائل الموقع» — the same two words, the other way round.
        '(رسائل|رساله|رسالة|الرسائل)\\s*[^.\\n]{0,14}?(النموذج|نموذج|الموقع|موقعي|الزوار|زوار|التواصل)',
        'contact\\s*form',
        'form\\s*(inbox|messages|submissions)',
        'site\\s*messages',
    ].join('|'),
    'i',
);

export interface ExecutionPlan {
    id: string;
    goal: string;
    steps: ExecutionStep[];
    metadata: {
        complexity: string;
        riskLevel: string;
        estimatedDurationMs?: number;
        /**
         * WHY THESE ARE DECLARED RATHER THAN CAST AWAY.
         *
         * Three plans were setting `terminalExecution`, `buildVerification`
         * and `matchedBy` on this object, and `tsc` refused two of them —
         * excess-property checks catch a fresh literal but not one that has
         * been widened on the way in, so the same mistake failed loudly in one
         * place and passed silently in another. They are real, useful facts
         * about a plan: whether it must run in the terminal, whether its
         * result has to be build-verified, and which matcher chose it.
         * Declaring them makes them readable by the orchestrator instead of
         * being a lie the compiler was talked out of.
         */
        terminalExecution?: boolean;
        buildVerification?: boolean;
        matchedBy?: string;
        /**
         * The same omission happened again one commit later: the ORION plan
         * set `deterministic` and `localOnly` and `tsc` went red while the
         * whole Jest suite stayed green — ts-jest runs with `diagnostics:
         * false` and esbuild does not typecheck, so NOTHING in the
         * test-and-build path can see this class of error. `npx tsc
         * --noEmit` is the only gate that can, which is why it is run
         * separately on every batch. Both facts are worth carrying: a
         * deterministic plan was chosen by a matcher rather than a model,
         * and a local-only plan must not reach for the network.
         */
        deterministic?: boolean;
        localOnly?: boolean;
        /**
         * Adaptive DAG planner metadata: parallel execution groups detected,
         * number of planning attempts made, and confidence in the selected plan.
         */
        parallelGroups?: number;
        adaptiveAttempts?: number;
        confidence?: number;
        /**
         * Specification-driven planning metadata: ID of the structured specification
         * this plan was generated from.
         */
        specificationId?: string;
        /**
         * Requirement traceability matrix linking requirements to phases, tasks, and verification.
         */
        requirementTraceability?: RequirementTraceabilityEntry[];
        /**
         * Constraint tensions identified in the specification.
         */
        constraintTensions?: ConstraintInteraction[];
        /**
         * Answer-only contract: the request explicitly asks for an answer without execution.
         */
        answerOnly?: boolean;
        /**
         * No file changes contract: the request explicitly forbids file modifications.
         */
        noFileChanges?: boolean;
    };
}

/**
 *  A UI ELEMENT IS NOT SCOPE EVIDENCE.
 *
 *  Measured on the owner's own sentence, with the classifier itself:
 *
 *      «…Include a service list with prices, opening hours, location,
 *        phone CTA, and a booking form.»            -> scope = system
 *      the same sentence minus «booking form»       -> scope = page
 *
 *  One phrase moved a five-line brochure into `system`, which returns the
 *  two-phase plan — `api_project` then `react_project` — so Joe built him a
 *  database with a `users` table, shipped the `#/admin` screen that every
 *  API-linked app ships, **then failed on the admin page it had invented and
 *  blocked the site he actually asked for.** He never asked for accounts, a
 *  database, or an admin panel.
 *
 *  The cause is one token in `dataSignals`: `bookings?` matches inside
 *  «booking form». **A booking FORM is an element on a page; a bookings
 *  SYSTEM is a system.** And it is not alone — `orders?` does the same to
 *  «order button», `reports?` to «reports section», `payments?` to «payment
 *  form». The signal reads the noun stripped of the thing it is attached to.
 *
 *  ⛔ THE FUNCTION ALREADY KNEW THIS SHAPE. It calls `stripDeclaredOptions`
 *  because «a declared category list is field OPTIONS, not scope evidence» —
 *  the same lesson, one step over, learned once and not carried. So the same
 *  answer: remove what is plainly a page element BEFORE asking whether the
 *  request owns data. A request that genuinely owns bookings says so in a way
 *  that survives this — «a bookings system», «manage bookings», «حجوزات
 *  بحسابات» — because none of those is a noun wearing a widget.
 */
function stripPageElements(text: string): string {
    //  Content sections ABOUT people are page elements too: «آراء العملاء» on a
    //  clinic landing page is testimonials, not a customer table — it made a
    //  brochure a SYSTEM with a database phase (eval run500 P001, 2026-10-23).
    const ELEMENT_EN = '(?:form|button|link|field|input|section|panel|widget|cta|list|page|banner|badge|icon|label|testimonials?|reviews?|stories|quotes|logos)';
    const ELEMENT_AR = '(?:نموذج|استمارة|زر|رابط|حقل|قسم|قائمة|صفحة|لوحة|بطاقة|أيقونة|آراء|اراء|تقييمات|شهادات|قصص|تجارب|انطباعات)';
    return String(text || '')
        //  English is head-final: «booking form», «order button».
        .replace(new RegExp('\\b[\\w-]+\\s+' + ELEMENT_EN + '\\b', 'gi'), ' ')
        //  Arabic is head-initial: «نموذج حجز», «زر الطلب».
        .replace(new RegExp(ELEMENT_AR + '\\s+\\S+', 'g'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Verification directions describe how Joe must prove the work, not what the
 * product stores. Without this small semantic boundary, "Report which checks
 * ran" matches the `reports?` data noun below and promotes a local browser app
 * into an invented backend system.
 */
function stripVerificationReporting(text: string): string {
    return String(text || '')
        .replace(/\b(?:report|list|state|summarize)\s+(?:exactly\s+)?(?:which|what|the)\s+(?:checks?|tests?|verifications?)\b[^.!?\n]*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export class PlanningEngine {
    private static selectedProjectDir(context?: any): string {
        try {
            const candidate = String(context?.workspaceRoot || workspaceService.getActiveRoot(context?.workspaceId) || '');
            return candidate && ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml']
                .some(manifest => fs.existsSync(path.join(candidate, manifest))) ? candidate : '';
        } catch { return ''; }
    }

    /**
     * The only constructor for an existing-project edit plan.
     *
     * Intent detectors may discover an edit in different ways (an attachment,
     * the semantic fallback, or a short contextual command), but they must all
     * converge here so workspace selection and the ToolService contract cannot
     * drift into competing execution paths again.
     */
    private static projectEditPlan(intent: StructuredIntent, context?: any, reasoning?: string): ExecutionPlan {
        const selectedProjectDir = PlanningEngine.selectedProjectDir(context);

        return {
            id: `projedit_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: 'project_edit',
                description: `Surgical edit of the active project: ${intent.goal}`,
                tool: 'project_edit',
                agent: 'Dev',
                input: { request: intent.goal, ...(selectedProjectDir ? { dir: selectedProjectDir } : {}) },
                dependsOn: [],
            }],
            metadata: { complexity: 'medium', riskLevel: 'low', ...(reasoning ? { reasoning } : {}) },
        };
    }

    /** Map a high-level browser action (chosen by the model) to the exact tool. */
    static browserToolForAction(action: string): string | null {
        const map: Record<string, string> = {
            open: 'browser_launch', go: 'browser_launch', visit: 'browser_launch',
            search: 'browser_search', lookup: 'browser_search',
            summarize: 'browser_summarize', read: 'browser_readability',
            analyze: 'browser_smart_agent', full: 'browser_smart_agent', report: 'browser_smart_agent',
            audit: 'browser_ui_audit', ui: 'browser_ui_audit',
            click: 'browser_click', press: 'browser_click',
            fill: 'browser_fill_form', form: 'browser_fill_form',
            extract: 'browser_extract_data', scrape: 'browser_extract_data',
            translate: 'browser_translate', responsive: 'browser_responsive_check',
            compare: 'browser_compare', find: 'browser_find_text',
            seo: 'browser_seo_audit', performance: 'browser_performance', speed: 'browser_performance',
            links: 'browser_check_links', console: 'browser_console_scan', errors: 'browser_console_scan',
            pdf: 'browser_save_pdf', readability: 'browser_readability',
            contrast: 'browser_contrast_audit', a11y: 'browser_a11y_deep', accessibility: 'browser_a11y_deep',
            meta: 'browser_extract_meta', design: 'browser_design_tokens', colors: 'browser_design_tokens',
            autofix: 'browser_autofix', fix: 'browser_autofix', fullpage: 'browser_fullpage_shot', screenshot: 'browser_fullpage_shot',
        };
        return map[action] || null;
    }

    /**
     * A PAGE, AN APPLICATION, OR A SYSTEM WITH ITS OWN DATA.
     *
     * Decided from the user's own words and nothing else, so it is the same
     * answer with the brain running or dead:
     *
     *   page   — one document. «صفحة هبوط», «بورتفوليو», «قائمة طعام».
     *   app    — screens, state, interaction. «تطبيق», «لوحة تحكم», «محرّر»,
     *            or anything compared to a real product («شبيه بخرائط جوجل»).
     *   system — an app that OWNS data: accounts, a database, orders, bookings,
     *            inventory, reports, roles. It gets a backend of its own.
     */
    /**
     * Tools that can only ANSWER. None of them puts a file on disk, so a plan
     * made entirely of them has built nothing, whatever it reports.
     */
    static readonly ANSWER_ONLY = new Set([
        'central_answer', 'ask_user', 'echo', 'multi_agent_debate',
        'ambiguity_resolver', 'self_confidence_evaluator', 'request_analyzer',
    ]);

    /** Does this request ask for something to EXIST afterwards? */
    /** Uses structural classification (recording verbs, containers, feature lists)
     *  instead of closed verb/noun vocabularies. Kept as a static so every
     *  existing call site and test keeps working unchanged. */
    static looksLikeBuild(goalRaw: string): boolean {
        return !isCaptureResultInquiry(goalRaw) && isBuildRequest(goalRaw).isBuild;
    }

    /**
     * ONE READER FOR «IS THIS A SITE DEPLOY?»
     *
     * «انشر» and «publish» order two different things: putting a SITE on the
     * internet, and publishing CONTENT — an article, a post, a tweet. The
     * deploy fast path knew the difference (a content noun vetoed it). The
     * capability matcher did not: its language bridge reads «انشر» as
     * deploy/publish/pages, and deploy_pages wins on its own name. While the
     * fast path ran first that never mattered; when capabilityPlan moved in
     * front of the short-chat fallback (76f66a5d3), measured:
     *
     *     انشر مقالاً عن القهوة   → deploy_pages + deploy_project
     *     انشر تدوينة عن موقعي    → deploy_pages + deploy_project
     *
     * An article request that would have put his project on GitHub Pages.
     * Two guards over one question drift apart, so the question is answered
     * here, once, and every road that can choose a deploy tool asks it:
     *
     *   • `deploy` is the fast path's decision — an unambiguous deploy word,
     *     or a soft publish verb with a site/project target, and no veto, no
     *     question and no build verb (a build owns its own publishing).
     *   • `veto` is what the words themselves forbid. The capability matcher
     *     may infer a target the fast path cannot see («انشره» right after a
     *     build), but it never chooses a deploy tool past a veto.
     */
    static readDeployIntent(goalRaw: string): DeployIntentReading {
        // A diacritized order reads like the plain one: «اُنشُر الموقع» is «انشر الموقع».
        const uses = readPublishUses(stripArabicDiacritics(userPartOf(goalRaw)));
        // Every reader below reads the publish words that are in use, and for now; the
        // denial and the content readers also read an order that waits.
        const userGoal = uses.used;
        const goalNorm = normalizeIntentText(userGoal);
        const probe = goalNorm && goalNorm !== userGoal.toLowerCase() ? `${userGoal}\n${goalNorm}` : userGoal;

        // «لا تنشر الموقع» and «…ولا تنشره» are denials too: the second person
        // («تنشر/ترفع», with its object pronoun) and the conjunction on «ولا»
        // were missing, and the capability matcher chose deploy_pages for both.
        // …and so is a wish he negates: «مش عايز انشره», "I don't want to publish yet".
        const deniesExternalPublish = uses.refused || deniesThePublishItself(uses.said);

        // A question/search ("how do I run…", "ابحث عن كيفية…", "…؟") describes
        // a topic; it does NOT command run/stop/deploy — those must yield to it.
        const isQuestion = /^\s*(how|what|why|when|where|which|can|do|does|is|are|should|explain)\b/i.test(userGoal.trim())
            || /^\s*(كيف|ماذا|لماذا|متى|أين|هل|اشرح|وضّ?ح|ما\s+هو|ما\s+هي)(?=\s|$)/.test(userGoal)
            || /(ابحث|بحث|دوّ?ر\s*عن|ابغى\s*اعرف|search\s+for|google|look\s*up)/i.test(probe)
            || /\?\s*$/.test(userGoal.trim());

        // إنشاء مشروع جديد يتغلب على التشغيل فقط إذا ورد كفعل إنشاء صريح في
        // نص المستخدم الأصلي. لا نقرأ النسخة المطَبَّعة `probe` هنا: فهي قد
        // تحوّل الاسم «البناء» في جملة تحقق مثل «أثبت هل البناء والتشغيل نجحا»
        // إلى «ابن»، فتختطف أمراً واضحاً لتشغيل مشروع قائم.
        // أما «ابنِ المشروع ثم شغّله» فيبقى إنشاءً جديداً كما ينبغي.
        //
        // النفي جزء من النية، لا كلمة فصل يمكن إسقاطها. كان «لا تنشئ مشروعاً
        // جديداً؛ شغّل المشروع القائم» يطابق `انشئ` هنا، فيحجب مسار التشغيل
        // الحتمي ثم تسقط الجملة إلى منشئ React. نزيل فعل الإنشاء فقط حين يقع
        // مباشرة بعد نفي صريح، ونبقي أي فعل إيجابي لاحق في الجملة مرئياً.
        const userGoalWithoutNegatedBuildVerb = userGoal
            .replace(/(^|[\s،؛,:.!?])(?:لا|ليس|بدون)\s+(?:ت?نشئ|ت?نشيء|ت?بن(?:ي|ِ)?|ت?صمم|ت?طور|ت?عمل|ت?سوي|ت?سوّي|ت?ول[ّد]{1,2}|ت?برمج)(?=\s|$|[،,:؛.!?])/giu, '$1')
            .replace(/(^|[\s,;:.!?])(?:do\s+not|don't|no)\s+(?:build|create|make|develop|design|generate|code|scaffold)(?=\s|$|[,;:.!?])/giu, '$1');
        const hasBuildVerb = /\b(build|create|make|develop|scaffold|generate|code)\b/i.test(userGoalWithoutNegatedBuildVerb)
            // The imperative «ابنِ» carries a kasra after the final noon;
            // accept optional Arabic vowel marks while still matching only a
            // standalone explicit creation verb from the original user text.
            || /(^|\s)(?:ابن[\u064B-\u065F]*|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|برمج)(?=\s|$|[،,:؛.!])/i.test(userGoalWithoutNegatedBuildVerb);

        // A concrete project/server target — NOT a browser, NOT content. Word
        // boundaries keep "serve" out of "server" and "app" out of "happen".
        //  A PATTERN WRITTEN WITH THE ARTICLE MATCHES HALF THE LANGUAGE.
        //
        //  Measured through generatePlan, the real road a request takes:
        //
        //      شغّل الخادم   → project_run
        //      شغّل خادم     → central_answer
        //      أوقف الخادم   → project_stop
        //      أوقف خادم     → central_answer
        //
        //  The same sentence, one article apart, and one of them does
        //  nothing. «المشروع» already carried its bare twin «مشروع»
        //  right beside it; the other four did not, and «ال» is a
        //  PREFIX — a bare form matches both, a prefixed one matches
        //  half. Writing the article into a pattern can only subtract.
        const projectTarget = /((?:ال)?مشروع|(?:ال)?نظام|(?:ال)?خادم|(?:ال)?سيرفر|(?:ال)?معاينة|\bproject\b|\bserver\b|\bapp\b|\bapplication\b|\bpreview\b|dev\s*server|localhost)/i.test(probe);
        //  …AND THE SAME PREFIX, ONE LINE DOWN.
        //
        //  Measured through generatePlan on his own phrasings:
        //
        //      انشر الموقع   → deploy_pages
        //      انشر موقع     → browser_launch
        //
        //  One article apart, and the bare one opens a BROWSER instead
        //  of publishing anything. The deploy guard did not match, so
        //  the request fell through to the browser router, which takes
        //  «انشر» and a noun as something to go and look at.
        //
        //  The definite form was not more correct — it was accidentally
        //  protected, and «ال» is a prefix.
        const deployTarget = projectTarget || /((?:ال)?موقع|(?:ال)?صفحة|\bsite\b|\bwebsite\b|\bpage\b)/i.test(probe);

        // Deploy: the unambiguous words (deploy / go live / رابط دائم / استضف)
        // fire on their own; the ambiguous ones (انشر / publish / host) need a
        // site/project target and must not be about content.
        const strongDeploy = /(\bdeploy\b|استضف|استضافة|go\s*live|رابط\s*دائم|github\s*pages|gh-pages)/i.test(probe);
        const softPublish = /(انشر|أنشر|\bpublish\b|\bhost\b)/i.test(probe);

        // Content that "انشر/publish" ALSO applies to — publishing an article is
        // NOT deploying a site («انشر مقالاً» once went to deploy). It vetoes a
        // site deploy only when it is what is being published — the publish
        // verb's object or its pronoun's antecedent — or when he names no site
        // or project at all (readPublishedContent). An unambiguous deploy verb
        // is never vetoed by its object: "Deploy my blog" deploys the blog.
        const published = readPublishedContent(uses.said);
        const deployVerb = /(\bdeploy\b|استضف|go\s*live)/i.test(probe);
        //  «انشره على الفيسبوك»: what goes to a social network is a post, whatever it is called.
        const publishesContent = uses.social || (published.anywhere && !deployVerb
            && (published.asObject || !(deployTarget || published.siteNamed)));

        const veto: DeployIntentReading['veto'] = deniesExternalPublish ? 'denied'
            : publishesContent ? 'content'
            : uses.waits ? 'waits'
            : uses.follows ? 'follows'
            : '';
        // HOW it is asked decides between an order and a question, not the first
        // word or a question mark: a polite request to publish a named site is the
        // order («ممكن تنشر الموقع؟», "Could you deploy the app?"), and an
        // interrogative before the publish word is a question about publishing
        // wherever it stands («ازاي انشر الموقع؟»). See readHowPublishIsAsked.
        const asked = readHowPublishIsAsked(userGoal, published.anywhere);
        const named = deployTarget || asked.pronounTarget;
        const ordered = !isQuestion && !asked.about
            && (strongDeploy || asked.uploadsTheSite || (softPublish && named));
        const deploy = !veto && !hasBuildVerb && (asked.polite || ordered);
        const targetIsPronoun = deploy && asked.pronounTarget && !deployTarget;
        const ordersAPublish = !veto && (deploy || asked.polite || (!asked.about && (uses.orders || strongDeploy || asked.namesThePublish)));
        return { deploy, veto, ordersAPublish, isQuestion, hasBuildVerb, projectTarget, deniesExternalPublish, targetIsPronoun, besideThePublish: uses.beside };
    }

    /**
     * A BUILD VERB IS NOT A BUILD.
     *
     * The quality-review fast path yields to a construction brief, because a
     * brief may carry its own QA and audit sections. It asked looksLikeBuild,
     * which says yes for any build verb beside any container word — and
     * «راجع تقرير الجودة والنتيجة التي أنشأتها بنفسك … نفّذ الإصلاحات بنفسك»
     * has one: «نفّذ», whose object is «الإصلاحات», the repairs themselves.
     * Measured with a built project open: project_edit, the review undone.
     *
     * A construction brief either names its deliverable as the verb's object
     * (requestedArtifact: the NEXUS brief → system), or it does not open by
     * ordering a review. «Build an ERP for a coffee shop … an audit log and
     * monthly reports» and «A compiler … type checker … a test suite» name
     * objects the lexicon does not know, and neither opens with «review» —
     * their audit and check words describe the product. «Check the results
     * and build a new chart» opens with one and still orders a chart: an
     * imperative creation verb with an object is a construction whatever the
     * object (ordersConstructionOfAnObject). Only a request that OPENS with
     * the review and orders nothing made is the review.
     */
    static isConstructionBrief(goalRaw: string): boolean {
        const goal = userPartOf(goalRaw);
        if (!PlanningEngine.looksLikeBuild(goal)) return false;
        // Cheapest reader first; the artifact lexicon (super-linear on a long
        // adversarial message, measured) is asked only of a review-led request
        // that orders nothing made. The answer is the same OR in any order.
        if (!OPENS_WITH_REVIEW.test(stripArabicDiacritics(goal))) return true;
        if (ordersConstructionOfAnObject(goal)) return true;
        return !!requestedArtifact(goal).kind;
    }

    /** A tool that puts a site or project on the internet, by its own declaration (name or `deploy` tag). */
    static isSiteDeployTool(name: string): boolean {
        const toolName = String(name || '');
        if (/^deploy_/.test(toolName)) return true;
        const tool = (registeredTools as any[]).find(t => t?.name === toolName);
        return Array.isArray(tool?.tags) && tool.tags.includes('deploy');
    }

    /**
     * ASKING IS NOT ORDERING.
     *
     * Used by capabilityPlan to refuse a routing decision it has no business
     * making. The order of the two tests matters and is deliberate: a deed is
     * checked FIRST, because a request can be shaped like a question and still
     * be an order — «هل يمكنك بناء موقع لي؟» asks permission to do a thing, and
     * the thing is what must happen. Only a sentence that names no deed at all
     * is treated as a question.
     *
     * The word lists below are written in FOLDED spelling — «متي» not «متى»,
     * «انشي» not «أنشئ», «بنا» not «بناء» — because both sides of every
     * comparison are folded first. Listing hamza and alef-maqsura variants by
     * hand is how «أنشر» quietly stopped being a deed: measured here, the guard
     * missed it until the folding was applied instead of a longer list.
     */
    static isKnowledgeQuestion(goalRaw: string): boolean {
        return isKnowledgeQuestionStructural(goalRaw);
    }

    /**
     * A specification is an engineering source of truth, not a bag of verbs.
     *
     * A user can legitimately say «اقرأ NEXUS_SPECIFICATION.md ثم نفّذها»
     * without also naming the future product type.  Splitting that sentence at
     * «ثم» lets keyword matching turn it into unrelated write/test tools before
     * Joe has read the file.  Require all three signals below: an explicit read,
     * a concrete local source, and an execution verb.  This deliberately does
     * not claim analysis-only requests such as «اقرأ المواصفة ولخّصها».
     */
    static isLocalSpecificationExecutionRequest(goalRaw: string): boolean {
        const goal = String(goalRaw || '');
        const boundary = '(?=$|[\\s،؛,:.!?])';
        const asksToRead = new RegExp(`(?:اقر[أا]|إقرأ|قراءة|read|inspect)${boundary}`, 'i').test(goal);
        const namesSource = /(?:\b[\w.-]+\.(?:md|mdx|txt|rst|pdf|docx?|yaml|yml|json)\b|(?:ملف|وثيقة|مستند)\s+(?:المواصفات|مواصفات|متطلبات|requirements?|spec(?:ification)?|prd))/i.test(goal);
        const asksToExecute = new RegExp(`(?:نفّ?ذ|طبّ?ق|ابنِ|ابني|انشئ|أنشئ|اصنع|طوّ?ر|طوّر|build|create|implement|develop|scaffold)${boundary}`, 'i').test(goal);
        return asksToRead && namesSource && asksToExecute;
    }

static classifyBuildScope(goalRaw: string): 'page' | 'app' | 'system' {
        // A declared category list is field OPTIONS, not scope evidence:
        // «بفئات: طعام، مواصلات، فواتير» made an expense app a billing
        // SYSTEM because the category word «فواتير» sat in dataSignals.
        let g = String(goalRaw || '');
        try {
            const { stripDeclaredOptions } = require('../design/app-blueprints');
            g = stripDeclaredOptions(g);
        } catch { /* the classifier still answers from the raw text */ }
        g = stripVerificationReporting(stripPageElements(g));
        // Its own data, its own users → it needs a server and a database.
        /**
         * ARABIC PLURALS THE LIST DID NOT KNOW.
         *
         * «بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات» — a system
         * with SUPPLIERS and ORDERS, which is a database by definition. The
         * list carried «طلبات» and matched neither «الطلبيات» ولا «الموردون»,
         * so the scope came back «app» and he would have received a front-end
         * with nowhere to put a supplier.
         */
        const dataSignals = /(تسجيل\s*دخول|تسجيل\s*الدخول|حسابات?|مستخدمين|صلاحيات|أدوار\s*(?:المستخدمين|الأعضاء|الاعضاء)?|قاعدة\s*بيانات|قواعد\s*بيانات|حجوزات?|حجز|طلبات|طلبيّ?ات|مخزون|جرد|فواتير|فاتورة|تقارير|إحصائيات|احصائيات|نقاط\s*بيع|كاشير|رواتب|موظفين|عملاء|زبائن|مورّ?دي?ن|مورّ?دون|اشتراكات|مدفوعات|دفع\s*إلكتروني|قاعدة\s*البيانات|\bsign[- ]?in\b|\blogin\b|\bauth(?:entication)?\b|\bdatabase\b|\b(?:member|manager|user)\s+roles?\b|\brole[- ]?based\s+access\b|(?:registered|authenticated|multiple|admin|end)\s+users?\b|users?\s+(?:accounts?|roles?|permissions?|can\s+sign\s+in)|orders?|suppliers?|vendors?|inventory|invoices?|reports?|bookings?|payments?|subscriptions?|crm|erp\b)/i;
        // Consuming a public or third-party API is not the same as asking Joe
        // to own a backend.  Keep explicit API-building requests as systems,
        // while allowing browser apps to call services such as Open-Meteo.
        const ownedApiSignals = /(?:\b(?:build|create|make|develop|implement|design|provide|expose)\s+(?:an?\s+)?(?:rest\s+|graphql\s+)?api\b|\b(?:build|create|make|develop|implement|design|provide|expose|own|internal|private)\s+(?:an?\s+)?backend\b|\b(?:api|backend)\s+(?:server|service|endpoint)\b|(?:ابنِ|ابني|أنشئ|انشئ|طوّر|طور|اصنع|أنشئ)\s+(?:لي\s+)?(?:واجهة\s+)?(?:برمجية|api|backend))/i;
        // Screens and behaviour rather than a single scroll.
        const appSignals = /(تطبيق|برنامج|لوحة\s*تحكم|داشبورد|محرّ?ر|أداة\s*ويب|لعبة|محادثة|دردشة|شات|خرائط|خريطة|تتبّ?ع|حاسبة|مخطّ?ط|جدولة|مهامّ?|شبيه\s*ب|مثل\s*تطبيق|clone|dashboard|applications?\b|app\b|editor|tracker|chat|map|game|planner|scheduler|calculator|todo|to-do|tasks?|(?:web\s+)?console|background\s+(?:jobs?|workers?)|worker\s+(?:queue|process))/i;
        // A functional request can describe its shape without saying "app".
        // "Create a customer directory with fields, search and filtering" is
        // an interactive application, while a brochure with one contact form
        // is still a page. Require at least two structural signals so a single
        // noun such as "form" or "list" cannot promote a simple document.
        const structuredSignals = [
            /\bdirector(?:y|ies)\b|\bcatalog(?:ue)?\b|\brecords?\b|\btable\b|\bregister\b|\bmanager\b/i,
            /\bfields?\b|\bcolumns?\b|\binputs?\b|حقول|أعمدة|سجلات/i,
            /\bsearch\b|\bfilter(?:ing)?\b|\bsort(?:ing)?\b|بحث|فلترة|تصفية|فرز/i,
            /\bvalidation\b|\bempty\b|\brequired\b|تحقّ?ق|تحقق|فارغ|إلزامي/i,
            // «create» is counted in English, so «أنشئ / إنشاء» is counted in Arabic.
            /\b(add|create|edit|delete|remove)\b|إضافة|أضف|تعديل|حذف|إزالة|[أا]نشئ|[إا]نشاء/i,
        ];
        const structuredInteraction = structuredSignals.filter(signal => signal.test(g)).length >= 2;
        /**
         * ⛔ THE OBJECT OF THE VERB DECIDES THE KIND; WHAT IT CLAIMS DECIDES THE SERVER.
         *
         * Eval round 15: this function matched data nouns, domain words and the
         * build verb anywhere in the sentence, with word lists whose English and
         * Arabic halves had drifted. «اكتب أداة سطر أوامر … فيه الزبائن» was a
         * SYSTEM and its English twin a CLI; every English API an 'app', every
         * Arabic one a 'system'. requestedArtifact reads the deliverable from the
         * build verb's object and the server need from declared claims, in both
         * scripts. A CLI keeps the legacy 'page' encoding (file-level, no web
         * server). A page head is promoted by BEHAVIOUR — records he adds, edits,
         * deletes or searches, «لإدارة …», «to manage …» — never skipped by an
         * early return. The body below is the fallback for an object the lexicon
         * does not know («a repair-shop customer directory», «بدي جدول …»).
         */
        const artifact = requestedArtifact(String(goalRaw || ''));
        if (artifact.kind === 'cli') return 'page';
        if (artifact.kind) {
            if (artifact.needsServer) return 'system';
            if (artifact.kind !== 'page') return 'app';
            // A presentation page is a document about its subject: «موقع تعريفي
            // لـإدارة المصاريف الشخصية» presents the service, it does not run it.
            if (artifact.evidence.presentation) return 'page';
            // The build verb itself is not a capability: «Create a page …» adds nothing.
            const capabilities = g.replace(/^\s*(?:please\s+)?(?:create|build|make|develop|design|write|generate)\b/i, ' ')
                .replace(/^\s*(?:من\s+فضلك\s+)?(?:[أا]نشئ|اعمل|ابن[يِى]?|اصنع|صمم|صمّم|طور|طوّر|اكتب)(?![\p{L}\p{N}_])/u, ' ');
            const behaviour = structuredSignals.filter(signal => signal.test(capabilities)).length >= 2 || statesManagingPurpose(goalRaw);
            return behaviour ? 'app' : 'page';
        }
        // A single document, said outright.
        const pageSignals = /(صفحة\s*(هبوط|واحدة)?|موقع\s*تعريفي|تعريفي|لاندنج|بورتفوليو|معرض\s*أعمال|سيرة\s*ذاتية|بروشور|قائمة\s*طعام|منيو|landing|portfolio|brochure|one[- ]?pager|resume|cv)/i;
        
        // A browser application may deliberately consume a public or third-party API and
        // explicitly forbid an owned backend. A conditional "if authentication
        // is needed" with local/demo persistence is not evidence that Joe must
        // invent one. Keep this exception narrow: an explicit no-backend
        // contract and a conditional local/demo auth fallback must both exist.
        const publicApiWithoutBackend = /\b(?:public|third[- ]party|external)\b[^.!?\n]{0,80}\bapis?\b/i.test(g)
            && /\b(?:do\s+not|don't|without)\s+(?:build|create|implement)?\s*(?:a\s+)?(?:project[- ]owned\s+)?backend\b/i.test(g);
        const conditionalDemoAuth = /\bif\s+authentication\s+is\s+needed\b[^.!?\n]{0,160}\b(?:local|demo)\b[^.!?\n]{0,80}\bpersistence\b/i.test(g);
        const ownsBackend = ownedApiSignals.test(g) && !publicApiWithoutBackend;
        const data = ownsBackend || (dataSignals.test(g) && !(publicApiWithoutBackend && conditionalDemoAuth));
        // CLI/utility/script requests are NOT web systems; CSV/TSV input with
        // columns is input data, not a persistent record schema. The fallback
        // readers of requested-artifact, in both scripts.
        const cli = mentionsCommandLine(g);
        const csvInput = readsCsvInput(g);
        const app = appSignals.test(g) || structuredInteraction;
        const page = pageSignals.test(g);
        const publicApi = publicApiWithoutBackend && conditionalDemoAuth;
const ownsBackendEffective = ownsBackend && !cli && !csvInput;
        const dataEffective = data && !cli && !csvInput && !publicApi;
        const appEffective = app && !cli && !csvInput;
        const pageEffective = page && !dataEffective;
 
        // Genuine POS (point of sale) systems are systems, not apps — detect before general app logic
        const posSignals = /\b(?:pos|point[- ]?of[- ]?sale)\b/i;
        const isPos = posSignals.test(g);
 
        // «صفحة هبوط لتطبيق جوال» is a PAGE about an app, not an app: when the
        // request names the document it wants, that wins over the subject it is
        // about. Only owning data outranks it.
        if (pageEffective && !dataEffective) return 'page';
        if (cli) return 'page'; // CLI/utility/script → treat as page (file-level, not web system)
        if (csvInput) return 'page'; // CSV/TSV input → treat as page (file-level, not web system)
        if (isPos) return 'system'; // Genuine POS systems are systems, not apps
        // Strong app signals with data signals → app (web app with data), not system
        // System only when there are clear backend signals without strong app signals
        if (dataEffective && !appEffective) return 'system';
        if (appEffective) return 'app';
return 'page';
    }

    /** True when the request explicitly asks to SEARCH/look up something (a real
     *  search verb — not merely "open google"). Kept narrow on purpose so plain
     *  "افتح جوجل" stays an open, while "ابحث عن X" / "search for X" is a search. */
    static hasSearchIntent(goalRaw: string): boolean {
        return /(ابحث|إبحث|ابحثي|ابحثلي|دوّ?ر\s*(?:لي\s*)?عن|فتّ?ش\s*عن|بحث\s*عن|\bsearch\s*for\b|\bsearch\b|\blook\s*up\b|جِ?د\s*لي|ابغى?\s*ابحث)/i.test(goalRaw || '');
    }

    /** Extract the CLEAN search topic from natural composite phrasings, using the
     *  user's own words (never the LLM's — which mangles names like نابلس->نبعلس).
     *  Prefers text after a search verb / "عن/about/for", strips command noise and
     *  any trailing engine mention ("... في جوجل"). */
    static extractSearchQuery(goalRaw: string): string {
        let query = '';
        const about = String(goalRaw || '').match(/(?:ابحث\s*(?:لي\s*)?عن|ابحثي\s*عن|ابحثلي\s*عن|دوّ?ر\s*(?:لي\s*)?عن|فتّ?ش\s*عن|بحث\s*عن|بخصوص|على\s*موضوع|عن|حول|about|search\s*for|look\s*up|for)\s+(.+)$/i);
        if (about && about[1]) {
            query = about[1].trim();
        } else {
            query = String(goalRaw || '')
                .replace(/(افتح|شغّ?ل|ادخل|اذهب|روح|رح|open|go\s*to|launch|visit)\s*(لي\s*)?(على|الى|إلى|to)?\s*/gi, ' ')
                .replace(/(المتصفّ?ح|المتصفح|browser|جوجل|google|قوقل|غوغل|قووقل)/gi, ' ')
                .replace(/(و?اكتب|و?ابحث|و?إبحث|و?بحث|دوّ?ر|فتّ?ش|type|search|write)\s*(في\s*)?(البحث|بالبحث|خانة\s*البحث|search\s*box)?\s*(عن|for|:)?\s*/gi, ' ')
                .replace(/^(لي|من\s*فضلك|please|رجاء|و|ثم|ومن\s*ثم)\s+/i, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        // A COMMA (or semicolon) starts a new clause too: «برج إيفل، افتح مقاله، مرّر…»
        // must search for «برج إيفل» only, not the follow-up instructions. Cut there
        // first (a search phrase rarely contains a comma).
        query = query.split(/[،؛]|,\s/)[0].trim();
        // Compound requests ("ابحث عن X ومن ثم ابحث عن Y", "search X then Y") carry a
        // SECOND clause the greedy capture swallowed. Keep only the FIRST search term
        // by cutting at a clause boundary. Note: a bare "و" is NOT a boundary (so
        // "الفرق بين X و Y" stays intact) — only explicit sequencing words are.
        query = query.split(/\s+(?:ومن\s*ثم|ثم\s*ابحث|ثمّ|ثم|وبعد(?:ها|\s*ذلك)?|و\s*ابحث|وابحث|وأيضاً|وكذلك|وادخل|وأدخل|ثم\s*ادخل|وافتح|ثم\s*افتح|واذهب|ثم\s*اذهب|وانقر|and\s+then|then\s+search|then\s+open|then|after\s+that)\s+/i)[0].trim();
        // strip a trailing engine/browser mention: "... في جوجل" / "... in google"
        query = query.replace(/\s*(?:في|على|من|عبر|بواسطة|in|on|via)?\s*(?:جوجل|google|قوقل|غوغل|قووقل|المتصفّ?ح|المتصفح|النت|الإنترنت|الانترنت|الويب|browser|the\s*web)\s*$/i, '').trim();
        // strip leading residue + trailing punctuation
        query = query.replace(/^(?:لي|من\s*فضلك|please|عن|في|على|ثم|و)\s+/i, '').replace(/[.،,]+$/, '').trim();
        return query;
    }

    /**
     * Semantic REQUEST router — what the user actually wants, in any phrasing.
     *
     * The fast-paths below are keyword matches, which is precisely the wrong
     * instrument for natural language: «أضف» matched and «إضافة» did not, so one
     * spelling of one request edited the page and the other went off searching the
     * web. Every miss was answered by lengthening a regex, which only ever fixes
     * the phrasings someone already complained about.
     *
     * This asks the model instead. It runs ONLY when every deterministic path has
     * missed, so the fast, offline-safe routes still win and cost nothing; and it
     * returns null on timeout, junk, or an unknown label, leaving the previous
     * behaviour exactly as it was. Whitelisted output only — the model chooses
     * among capabilities Joe has, it does not invent one.
     */
    static async classifyRequestIntent(
        goal: string,
        opts: { hasActivePage: boolean },
        context?: any
    ): Promise<{ intent: string; repo: string } | null> {
        const sys = `You route a software agent's requests. Read the user's request in ANY language, dialect or spelling and pick the single capability that fulfils it. Output ONLY one compact JSON object, no markdown, no prose:
{"intent":"build_page|edit_page|analyze_repo|answer|other","repo":""}
Definitions:
- build_page: the user wants a NEW web page / site / landing page / UI built.
- edit_page: the user wants the page that was JUST built changed — colours, styling, text, layout, adding or removing an element. ${opts.hasActivePage ? 'A page IS currently open in this session.' : 'No page is open in this session, so edit_page is almost certainly wrong.'}
- analyze_repo: the user wants a GitHub repository/codebase analysed, reviewed or described. Put "owner/repo" in "repo" only if they named one.
- answer: the user is asking a question, chatting, or wants an explanation — no artefact to produce.
- other: anything else (running commands, files, browsing the web, email, deployment...).
Rules:
- Judge INTENT, not vocabulary. Verbal nouns, plurals, dialects and misspellings all count.
- A question ABOUT design or about a repo is "answer", not a build or an analysis.
- When genuinely unsure, output "other".`;
        let raw = '';
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
            // Semantic routing is part of the engineering pipeline when the caller
            // is already executing a real build.  Its short chat timeout used to
            // abort the LLM7 request before the bounded engineering deadline,
            // leaving the rest of the run to mis-route numbered QA bullets into
            // browser searches.  Preserve the short fast-path for ordinary chat,
            // but inherit the caller's explicit engineering patience here.
            const inheritedContext = { ...(context || {}), purpose: 'internal' };
            const requested = Number(inheritedContext.providerTimeoutMs ?? inheritedContext.plannerTimeoutMs);
            const classifierTimeoutMs = inheritedContext.engineeringPipeline === true
                ? Math.min(180_000, Math.max(90_000, Number.isFinite(requested) && requested > 0 ? requested : 90_000))
                : 12_000;
            const timeoutPromise = new Promise<never>((_, rej) => {
                timeoutHandle = setTimeout(() => rej(new Error('timeout')), classifierTimeoutMs);
            });
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, inheritedContext),
                timeoutPromise,
            ]);
        } catch { return null; }
        finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
        // The shared reader: a sentence with a brace after the answer, or a raw
        // line break inside a string, no longer turns the router's answer into null.
        const obj: any = readModelJsonObject(raw);
        if (!obj) return null;
        const intent = String(obj?.intent || '').toLowerCase().trim();
        const allowed = ['build_page', 'edit_page', 'analyze_repo', 'answer', 'other'];
        if (!allowed.includes(intent) || intent === 'other') return null;
        // Never let the router claim an edit when there is nothing to edit.
        if (intent === 'edit_page' && !opts.hasActivePage) return null;
        const repo = String(obj?.repo || '').trim();
        return { intent, repo: /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : '' };
    }

    /**
     * Semantic browser-intent router. Uses the model to understand the request in
     * ANY language/phrasing and return {action, url, query, text, lang}. Robust:
     * strict JSON, whitelist-validated, times out, returns null on any failure so
     * the deterministic keyword paths can take over.
     */
    static async classifyBrowserIntent(goal: string, context?: any): Promise<{ action: string; tool: string; url: string; query: string; text: string; lang: string } | null> {
        const sys = `You are the intent router of a smart AI browser. Read the user's request in ANY language or phrasing and pick the single best browser action. Output ONLY one compact JSON object, no markdown/no prose:
{"action":"open|search|summarize|analyze|audit|click|fill|extract|translate|responsive|compare|find|seo|performance|links|console|pdf|readability|contrast|a11y|meta|design|autofix|fullpage|none","url":"","query":"","text":"","lang":""}
Rules:
- Wants to look up a topic / ask a question to research / "search"/"find info about" -> action="search"; put the topic in "query".
- Names a website or gives a link and wants to open it -> action="open"; put it in "url".
- Summarize/read a page -> "summarize" (url). Full/deep/comprehensive analysis -> "analyze" (url).
- Click a button/link -> "click"; put the label in "text" (and url if given).
- Fill a form -> "fill". Translate a page -> "translate" (set "lang"). Audit UI/design -> "audit".
- If the request is NOT about the web/browser at all -> action="none".
- Put a value in "url" ONLY if the user explicitly named a site or link.`;
        let raw = '';
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
            // Browser-intent classification can be reached from the QA part of a
            // project pipeline.  Do not let its ordinary 18s chat guard cancel a
            // real engineering LLM7 turn; non-engineering browser requests retain
            // the original quick semantic probe.
            const inheritedContext = { ...(context || {}), purpose: 'internal' };
            const requested = Number(inheritedContext.providerTimeoutMs ?? inheritedContext.plannerTimeoutMs);
            const classifierTimeoutMs = inheritedContext.engineeringPipeline === true
                ? Math.min(180_000, Math.max(90_000, Number.isFinite(requested) && requested > 0 ? requested : 90_000))
                : 18_000;
            const timeoutPromise = new Promise<never>((_, rej) => {
                timeoutHandle = setTimeout(() => rej(new Error('timeout')), classifierTimeoutMs);
            });
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, inheritedContext),
                timeoutPromise,
            ]);
        } catch { return null; }
        finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
        const obj: any = readModelJsonObject(raw);
        if (!obj) return null;
        const action = String(obj?.action || '').toLowerCase().trim();
        if (!action || action === 'none') return null;
        const tool = PlanningEngine.browserToolForAction(action);
        if (!tool) return null;
        return {
            action, tool,
            url: String(obj?.url || '').trim(),
            query: String(obj?.query || '').trim(),
            text: String(obj?.text || '').trim(),
            lang: String(obj?.lang || '').trim(),
        };
    }

    /**
     * Generate a dynamic multi-step execution DAG based on intent and optional memory
     */
    /** A plan built from what the TOOLS say they do — or null, honestly. */
    static capabilityPlan(intent: any, context?: any): any | null {
        try {
            const { capableTools, capabilityChain } = require('./capability-match');
            const goal = String(intent?.goal || '');

            // A construction request is one engineering objective, not a bag of
            // browser/deployment verbs. It must reach the evidence-first project
            // pipeline as a whole, even when a model or intent parser has failed.
            // Keeping this guard here is essential because capabilityPlan is also
            // called before the later routing guards.
            if (PlanningEngine.looksLikeBuild(goal)) return null;

            /**
             * A QUESTION IS NOT AN ORDER, AND A TECHNOLOGY'S NAME IS NOT A
             * REQUEST TO USE IT.
             *
             * This function asks one thing: «which tool PERFORMS this?» That
             * question only has an answer when something is being ordered. The
             * only guard above it was `looksLikeBuild`, so the world was sorted
             * into two boxes — build, and everything else — while it actually
             * has three: build, order, and question. A question fell into
             * «everything else» and was handed to keyword matching, where a
             * bare product name outranked the fact that nobody had asked for
             * anything to be done.
             *
             * Measured on the planner itself, before this guard:
             *
             *   «اشرح لي ما هو الفرق بين React و Vue»   → react_project
             *   «اشرح لي ما هو الفرق بين Python و Java» → execute_python → java_builder
             *
             * The second one is the whole defect in one line: asked to explain
             * two languages, Joe ran Python and then built a Java project.
             *
             * The rule «product names never decide an engineering route» was
             * already written elsewhere in this class — but it lives in the
             * later routing guards, and capabilityPlan runs BEFORE them (see the
             * comment above). Two correct layers in the wrong order, again.
             *
             * Questions that legitimately need a tool are not lost here: they
             * are claimed by their own earlier routes. Measured — «كم عدد
             * الطلبات الجديدة؟» and «أرني الطلبات» both reach orders_read while
             * capabilityPlan returns null for them, so returning null earlier
             * changes nothing for either.
             */
            if (PlanningEngine.isKnowledgeQuestion(goal)) {
                console.log('[PlanningEngine] a question, not an order → no capability route (answer it)');
                return null;
            }

            /**
             * A SENTENCE WITH FOUR VERBS IS FOUR STEPS — AND THEY FLOW.
             *
             * «الخطّة تصل إلى أداتين كحدّ أقصى، لا سلسلة طويلة» — his question,
             * and he was reading the code correctly. capableTools ranks the
             * WHOLE sentence and took the top two, and BOTH of them were handed
             * the same raw request, so nothing flowed: two attempts, not a
             * pipeline.
             *
             * When the request names its own order — «ثم», «بعد ذلك», «then»,
             * a numbered list — each part gets its own tool, and each step
             * after the first receives the PREVIOUS step's result through
             * {{FROM:id}}, which this orchestrator already resolves.
             */
            /*
             * A DEPLOY TOOL IS CHOSEN ONLY WHERE THE DEPLOY READER ALLOWS IT.
             * The language bridge reads «انشر» as deploy/publish/pages, so
             * deploy_pages outranked everything for «انشر مقالاً عن القهوة».
             * readDeployIntent is the reader the deploy fast path uses; a
             * deploy tool is refused here past its veto (content, or a
             * denial). A chain step is read on its own clause — «لخّص المقال
             * ثم انشر الموقع» still publishes the site — but when the sentence
             * as a whole publishes content, the step must name its own site
             * target: «اكتب مقالاً ثم انشره» publishes the article, not his
             * project. A denial anywhere in the sentence covers every step.
             */
            const whole = PlanningEngine.readDeployIntent(goal);
            const refusedDeployStep = (name: string, part: string): boolean => {
                if (!PlanningEngine.isSiteDeployTool(name)) return false;
                if (whole.veto === 'denied' || whole.veto === 'waits') return true;
                const own = PlanningEngine.readDeployIntent(part);
                // The word in the step is not yet an order to publish: a label, a bug
                // report, a publish he does himself (readPublishUses).
                if (!own.ordersAPublish && !whole.ordersAPublish) return true;
                // «انشره» cut out of «اكتب مقالاً ثم انشره» names no site: its pronoun's
                // antecedent is the article, in the step before it.
                return !!own.veto || (!!whole.veto && !(own.deploy && !own.targetIsPronoun));
            };
            const chain = capabilityChain(goal, 5)
                .filter((c: any) => !refusedDeployStep(c?.name, String(c?.part || goal)));
            if (chain.length >= 2) {
                console.log(`[PlanningEngine] capability chain -> ${chain.map((c: any) => c.name).join(' → ')}`);
                return {
                    id: `chain_${Date.now()}`,
                    goal: intent.goal,
                    steps: chain.map((c: any, i: number) => {
                        // A registry capability may match a clause without exposing
                        // a normalized `part`. Preserve the user's original request
                        // rather than throwing into the broad capabilityPlan catch
                        // and silently losing the entire multi-step workflow.
                        const taskPart = String(c?.part || goal).trim();
                        const prior = i === 0 ? '' : `\n\nنتيجة الخطوة السابقة:\n{{FROM:chain_${i - 1}}}`;
                        const text = `${taskPart}${prior}`;
                        return {
                            id: `chain_${i}`,
                            description: `${c.name} — ${taskPart.slice(0, 60)}`,
                            tool: c.name,
                            agent: 'General',
                            input: { request: text, question: text, query: text },
                            dependsOn: i === 0 ? [] : [`chain_${i - 1}`],
                        };
                    }),
                    metadata: { complexity: 'high', riskLevel: 'low', matchedBy: 'capability-chain' },
                };
            }

            /*
             * A REFUSED DEPLOY IS NOT A REQUEST FOR THE NEXT TOOL ON THE LIST. The fifth
             * pre-merge review (2026-11-12): with the deploy tool refused, the runner-up
             * took the request — «مش عايز انشر الصور» and «انشره على الفيسبوك مع صورة
             * للشعار» → generate_image, "columns: id, deploy target, delete flag, run
             * count, send date" → delete_file with the raw message as its input. The
             * runner-up matched words of the very clause that was refused. When the best
             * match is a deploy tool and it is refused — a refusal, a field list, a
             * mention, a post, a publish that waits — another tool is chosen only for
             * what the request orders BESIDE the publish, in a clause of its own ("Don't
             * deploy, just delete the file temp.txt"). A publish that FOLLOWS his own
             * work names that work in its own clause («انشره بعد ما تصلح الهيدر»), so its
             * match stands.
             */
            const ranked = capableTools(goal, 3);
            const refusedDeploy = (c: any): boolean => !!(whole.veto || !whole.ordersAPublish) && PlanningEngine.isSiteDeployTool(c?.name);
            let capable = ranked.filter((c: any) => !refusedDeploy(c));
            if (ranked.length && refusedDeploy(ranked[0]) && whole.veto !== 'follows') {
                const beside = whole.besideThePublish;
                const orderedBeside = new Set(beside ? capableTools(beside, 3).map((c: any) => c.name) : []);
                //  …and a destroying tool is matched only by the deed the request ORDERS (capability-match), never by a word of the refused publish.
                capable = capable.filter((c: any) => orderedBeside.has(c.name) || c.byDeed);
            }
            /*
             * A DESTROYING TOOL IS PLANNED ONLY ON THE THING THE REQUEST NAMES. «احذف الملف temp.txt» names
             * its file; «احذف الملفات التي لا تستخدم», "Please delete the old backup file" name none — which
             * file that is, is for the planner that reads the workspace to find out, not for a tool call
             * with nothing to act on. And the thing is the deed's own object, as the deed reader read it
             * (capability-match): "Delete a.txt and write hello to b.txt" deletes a.txt, never the file
             * another clause names.
             */
            const toolByName = new Map((registeredTools as any[]).map(tool => [tool.name, tool]));
            const derive = (candidate: any): Record<string, any> | null => {
                const tool = toolByName.get(candidate.name);
                const input = inputForTool(tool, goal, context);
                if (!candidate.byDeed) return input;
                const field = Object.keys(tool?.inputSchema?.properties || {}).find(key => /^(?:path|file|filename|filepath)$/i.test(key));
                return field && candidate.target ? { ...(input || {}), [field]: candidate.target } : null;
            };
            capable = capable.filter((c: any) => !c.byDeed || !!derive(c));
            if (!capable.length) return null;
            // IntentParser may supply one registry-backed deterministic
            // candidate. Revalidate it against the current matcher, then keep
            // the requested capability singular: a simple order must not grow
            // a second unrelated tool invocation merely because it shares a
            // word with another description.
            const hint = String(intent?.rawIntent?.capabilityCandidate || '');
            const hinted = hint && capable.find((candidate: any) => candidate.name === hint);
            const selected = hinted ? [hinted] : capable.slice(0, 2);
            const actionable = hint
                ? selected.map((candidate: any) => ({
                    candidate,
                    input: derive(candidate),
                })).filter(({ input }: any) => input)
                //  …and it is handed that thing whichever road the request came by.
                : selected.map((candidate: any) => ({ candidate, input: candidate.byDeed ? derive(candidate) : null }));

            // A tool name is not enough to perform a task. When the registry
            // declares that its inputs cannot be derived, stop before calling
            // it and surface the missing contract as a user question. This is
            // generic across capabilities and keeps ToolService from receiving
            // a knowingly malformed invocation.
            if (!actionable.length) {
                const tool = toolByName.get(selected[0]?.name);
                const requiredAny = Array.isArray(tool?.inputSchema?.requiredAny)
                    ? tool.inputSchema.requiredAny.flat().map(String).filter(Boolean)
                    : [];
                const required = Array.isArray(tool?.inputSchema?.required)
                    ? tool.inputSchema.required.map(String).filter(Boolean)
                    : [];
                const fields = [...new Set([...requiredAny, ...required])];
                if (!fields.length) return null;
                /*
                 * A TOOL'S OWN FIELD NAMES ARE NEVER HIS QUESTION. The exams, 2026-11-09:
                 * \u00AB\u062D\u062F\u0651\u062F \u0647\u062F\u0641 ai_write_file \u0642\u0628\u0644 \u0627\u0644\u062A\u0646\u0641\u064A\u0630: path \u0623\u0648 description\u00BB and \u00AB\u062D\u062F\u0651\u062F \u0647\u062F\u0641
                 * project_planner \u0642\u0628\u0644 \u0627\u0644\u062A\u0646\u0641\u064A\u0630: projectDescription\u00BB were asked of the owner,
                 * who wrote a speed fix and a trip plan, and the runs ended \u00ABdone\u00BB with
                 * nothing done. The matcher has no plan here: the request goes on to the
                 * planners after it, which read it whole.
                 */
                if (process.env.JOE_ASK_TOOL_FIELDS !== 'on') {
                    console.log(`[PlanningEngine] capability ${selected[0].name} needs ${fields.join('/')} it cannot derive: no plan from the matcher`);
                    return null;
                }
                const arabic = /[\u0600-\u06FF]/.test(goal);
                const question = arabic
                    ? `حدّد هدف ${selected[0].name} قبل التنفيذ: ${fields.join(' أو ')}.`
                    : `Specify a target for ${selected[0].name} before execution: ${fields.join(' or ')}.`;
                console.log(`[PlanningEngine] capability ${selected[0].name} needs explicit input -> ask_user`);
                return {
                    id: `capability_input_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'capability_input_needed',
                        description: question,
                        tool: 'ask_user',
                        agent: 'General',
                        input: { question },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'capability-input-needed' },
                };
            }
            const selectedActionable = actionable.map(({ candidate }: any) => candidate);
            const derivedInput = new Map(actionable.map(({ candidate, input }: any) => [candidate.name, input]));
            console.log(`[PlanningEngine] capability match -> ${selected.map((c: any) => c.name).join(', ')}`);
            return {
                id: `capable_${Date.now()}`,
                goal: intent.goal,
                steps: selectedActionable.map((c: any, i: number) => ({
                    id: `capable_${i}`,
                    description: `${c.name} — matched on: ${c.why.join(', ')}`,
                    tool: c.name,
                    agent: 'General',
                    input: { request: intent.goal, question: intent.goal, query: intent.goal, ...(derivedInput.get(c.name) || {}) },
                    dependsOn: i === 0 ? [] : ['capable_0'],
                })),
                metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'capability' },
            };
        } catch { return null; }
    }

    static async generatePlan(params: { intent: StructuredIntent, memory?: any }, traceId?: string, context?: any): Promise<ExecutionPlan> {
        const { intent, memory } = params;
        // Language-universal understanding: `probe` = the user's original words PLUS
        // a canonicalized companion (dialects, typos, and other languages mapped to
        // the keywords the fast-paths know). ALL detection regexes test the probe;
        // extraction (queries, filenames, emails) still reads the original goal so
        // the user's own words are never mangled.
        //
        // CRITICAL: intent detection must see ONLY the user's request. The runtime
        // appends coaching blocks to the goal — "[STANDING USER INSTRUCTIONS …]"
        // and "[ENGINEERING DISCIPLINE … apply when you build launch/update/deploy
        // scripts or long-running services]". Those blocks contain the very words
        // the fast-paths trigger on (deploy, launch, server, install), so a plain
        // "Build an admin dashboard" was routed to deploy_pages. Strip every
        // injected block before detection; the FULL goal still reaches the tools.
        // [ATTACHED FILES …] is injected too — and it is the most dangerous
        // block of all for detection: it carries the attachment's own words
        // (file names, «disk», «file», extracted text), which is exactly what
        // sent «حلل هذه الصوره» + an image block into the browser+file
        // compound fast-path («browse then write is.txt», field-measured).
        const rawGoal = String(intent.goal || '');
        const userGoal = userPartOf(rawGoal);
        const goalNorm = normalizeIntentText(userGoal);
        const probe = goalNorm && goalNorm !== userGoal.toLowerCase()
            ? `${userGoal}\n${goalNorm}` : userGoal;
        const goalLower = probe.toLowerCase();

        // [ANSWER-ONLY FRONT-DOOR GUARD] Check for explicit answer-only / no-execution contracts
        // BEFORE any planning. This catches long quoted specifications that say
        // "Explain this without executing" or "Answer only" before they reach
        // the planner and get turned into a build task.
        // Always run text-based analysis first — rawIntent metadata is supplementary,
        // not a substitute for explicit user language. Explicit "Answer only" in text
        // must always win over metadata flags.
        let requestedAction = hasRequestedAction(userGoal);
        
        // Supplement with IntentParser metadata only when text analysis is inconclusive
        const intentRaw = intent.rawIntent || {};
        if (!requestedAction.hasDenial) {
            // Text didn't detect denial; check if IntentParser found one
            if (intentRaw.answerOnly === true) {
                requestedAction = { ...requestedAction, isAnswerOnly: true, hasDenial: true };
            } else if (intentRaw.noFileChanges === true) {
                requestedAction = { ...requestedAction, isNoFileChanges: true, hasDenial: true };
            }
        } else if (requestedAction.isAnswerOnly && intentRaw.noFileChanges === true) {
            // Text says "Answer only" but IntentParser also notes noFileChanges;
            // Answer-only is stronger (no execution at all), so keep isAnswerOnly=true.
            // Do NOT add isNoFileChanges — global execution denial must win over
            // file-only metadata, otherwise the NO-FILE-CHANGES GUARD could allow
            // browser navigation for a request that explicitly forbids ALL execution.
            // requestedAction = { ...requestedAction, isNoFileChanges: true }; // REMOVED
        }
        
        // [ANSWER-ONLY FRONT-DOOR GUARD] Check for explicit answer-only / no-execution contracts
        // BEFORE any planning. This catches long quoted specifications that say
        // "Explain this without executing" or "Answer only" before they reach
        // the planner and get turned into a build task.
        const boundedExplicitRead = parseExplicitFileReadRequest(userGoal);
        if (hasGlobalExplicitReadDenial(userGoal) || requestedAction.isAnswerOnly && !boundedExplicitRead || hasTerminalExecutionDenial(userGoal)) {
            console.log('[PlanningEngine] ⚡ Answer-only contract detected — returning answer-only plan.');
            return {
                id: `answer_only_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'answer_only',
                    description: 'Answer the question directly without executing any tools',
                    tool: 'central_answer',
                    agent: 'General',
                    input: { question: intent.goal },
                    dependsOn: [],
                }],
                metadata: {
                    complexity: 'low',
                    riskLevel: 'low',
                    matchedBy: 'answer-only-contract',
                    deterministic: true,
                    answerOnly: true,
                    noFileChanges: false,
                },
            };
        }
        

        // A question about a saved result is not a new browser action.
        // Derive this from the current user text, never client metadata alone.
        if (isCaptureResultInquiry(userGoal)) return {
            id: `capture_result_answer_${Date.now()}`, goal: intent.goal,
            steps: [{ id: 'capture_result_answer', description: 'Answer from owned saved capture evidence',
                tool: 'central_answer', agent: 'General', input: { question: intent.goal }, dependsOn: [] }],
            metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'capture-result-inquiry', deterministic: true },
        };
        // [NO-FILE-CHANGES GUARD] Check for no-file-changes constraint.
        // This should NOT block browser navigation requests (URL + browser verb).
        // A "no file changes" request with an explicit browser navigation target
        // should proceed with the constraint preserved, not be routed to central_answer.
        if (requestedAction.isNoFileChanges && isReadOnlyWorkspaceOverviewRequest(userGoal)) {
            return { id: `workspace_overview_${Date.now()}`, goal: intent.goal,
                steps: [{ id: 'workspace_overview', description: 'Read the owned workspace root and README without changes',
                    tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'readonly-workspace-overview', deterministic: true, noFileChanges: true } };
        }
        const runtimeFacts = parseRuntimeDiagnosticFacts(userGoal);
        if (runtimeFacts) return {
            id: `runtime_diagnostics_${Date.now()}`, goal: intent.goal,
            steps: [{ id: 'runtime_diagnostics', description: 'Observe Joe API runtime and authorized workspace facts',
                tool: 'runtime_diagnostics', agent: 'Dev', input: { request: intent.goal, facts: runtimeFacts, path: '.' }, dependsOn: [] }],
            metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'runtime-diagnostics', noFileChanges: true, deterministic: true },
        };
        const terminalCommands = requestedAction.isNoFileChanges ? boundedNoFileTerminalCommands(userGoal) : null;
        if (terminalCommands) return {
            id: `terminal_check_${Date.now()}`, goal: intent.goal,
            steps: terminalCommands.map((command, index) => ({
                id: `terminal_diagnostic_${index}`, description: `Read-only local diagnostic: ${command}`,
                tool: 'shell_execute', agent: 'Dev', input: { command, request: intent.goal },
                dependsOn: index ? [`terminal_diagnostic_${index - 1}`] : [],
            })),
            metadata: { complexity: 'low', riskLevel: 'low', terminalExecution: true, noFileChanges: true, deterministic: true },
        };
        // IntentParser has already proven that this is a bounded route decision.
        // Honor its one-tool contract before broad build/read-only/capability routes
        // can reinterpret words from the example application as a new project — and
        // before the no-file-changes answer below: the decision changes no file, so
        // «Choose the least-setup route … Do not change files.» is its own request.
        if (Array.isArray(intent.requiredTools) && intent.requiredTools.length === 1 && intent.requiredTools[0] === 'decide_capability_route') {
            return {
                id: `capability_decision_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'decide_capability_route',
                    description: intent.goal,
                    tool: 'decide_capability_route',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-capability-decision', deterministic: true, noFileChanges: true },
            };
        }
        if (requestedAction.isNoFileChanges && !boundedExplicitRead) {
            if (boundedReadNavigationUnderFileConstraint(userGoal)) {
                console.log('[PlanningEngine] ⚡ No file changes constraint with browser target — preserving constraint, allowing browser navigation.');
            } else if (isReadOnlyInspectionRequest(userGoal)) {
                // An audit that says it may only read is an inspection, not a
                // question: it continues to the read-only safety boundary below,
                // as it did before this guard arrived (b906f3bc8). The pipeline
                // stops it before planning through the same isReadOnlyRequest.
                console.log('[PlanningEngine] ⚡ No file changes constraint on a read-only inspection — routing to the read-only boundary.');
            } else {
                console.log('[PlanningEngine] ⚡ No file changes contract detected — returning answer-only plan.');
                return {
                    id: `answer_only_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'answer_only',
                        description: 'Provide explanation without making file changes',
                        tool: 'central_answer',
                        agent: 'General',
                        input: { question: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: {
                        complexity: 'low',
                        riskLevel: 'low',
                        matchedBy: 'no-file-changes-contract',
                        deterministic: true,
                        answerOnly: true,
                        noFileChanges: true,
                    },
                };
            }
        }

        // Exact-response requests are complete without a planner or a second
        // model call. Keeping this before every semantic route prevents a weak
        // provider from turning a one-line contract into an invented build task.
        const exactEcho = extractExactEchoRequest(userGoal);
        if (exactEcho) {
            return {
                id: `echo_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'exact_response',
                    description: `Return exactly: ${exactEcho}`,
                    tool: 'echo',
                    agent: 'General',
                    input: { text: exactEcho },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'exact-response' },
            };
        }

        // IntentParser attaches this marker only after a registry match for a
        // non-build, non-question imperative. Revalidate it through
        // capabilityPlan before any broad browser or chat classifier can spend
        // a model round. The returned plan still uses the normal ToolService
        // path; this merely gives a proven tool order its proper precedence.
        const capabilityCandidate = String((intent as any)?.rawIntent?.capabilityCandidate || '');
        // Concrete literal arguments outrank an inferred capability label.
        // Execution still uses the existing file plan and ToolService guards.
        const explicitEdit = parseExplicitFileEditRequest(userGoal);
        const explicitAppend = parseExplicitAppendFileRequest(userGoal);
        const explicitFile = parseExplicitFileRequest(userGoal);
        const explicitReadFile = parseExplicitFileReadRequest(userGoal);
        if (capabilityCandidate && !explicitEdit && !explicitAppend && !explicitFile && !explicitReadFile) {
            const capabilityPlan = PlanningEngine.capabilityPlan({ ...intent, goal: userGoal }, context);
            if (capabilityPlan?.metadata?.matchedBy === 'capability-input-needed'
                || capabilityPlan?.steps?.some((step: ExecutionStep) => step.tool === capabilityCandidate)) {
                return capabilityPlan;
            }
        }

        if (explicitEdit) {
            const steps: ExecutionStep[] = [{
                id: 'file_edit_literal', description: `تعديل النص المحدد في ${explicitEdit.path}`,
                tool: 'file_edit', agent: 'Dev', dependsOn: [],
                input: { path: explicitEdit.path, find: explicitEdit.find, replace: explicitEdit.replace, request: intent.goal },
            }];
            if (explicitEdit.readBack) steps.push({
                id: 'file_read_back', description: `قراءة ${explicitEdit.path} بعد التعديل`,
                tool: 'read_file', agent: 'Dev', dependsOn: ['file_edit_literal'],
                input: { path: explicitEdit.path, request: intent.goal },
            });
            return { id: `file_edit_${Date.now()}`, goal: intent.goal, steps,
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-file-edit-contract', deterministic: true, localOnly: true } };
        }

        // Appending literal content to an existing file is a deterministic
        // mutation contract. It must win before the broader create/write route
        // and must never ask a provider to guess how to preserve the file.
        if (explicitAppend) {
            const appendAr = /[\u0600-\u06FF]/.test(userGoal);
            const steps: ExecutionStep[] = [{
                id: 'file_append',
                description: appendAr
                    ? `إضافة المحتوى المحدد إلى الملف الموجود: ${explicitAppend.path}`
                    : `Append the specified content to the existing file: ${explicitAppend.path}`,
                tool: 'write_file',
                agent: 'Dev',
                input: {
                    path: explicitAppend.path,
                    filename: explicitAppend.path,
                    content: explicitAppend.content,
                    mode: 'append',
                    requireExisting: true,
                    ensureSingleAppend: true,
                    expectedFinalLineCount: explicitAppend.expectedFinalLineCount,
                    request: intent.goal,
                },
                dependsOn: [],
            }];
            if (explicitAppend.readBack) {
                steps.push({
                    id: 'file_read_back',
                    description: appendAr
                        ? `قراءة ${explicitAppend.path} بعد الإضافة والتحقق من محتواه وعدد أسطره`
                        : `Read ${explicitAppend.path} back and verify its content and line count`,
                    tool: 'read_file',
                    agent: 'Dev',
                    input: { path: explicitAppend.path, request: intent.goal },
                    dependsOn: ['file_append'],
                });
            }
            return {
                id: `file_append_contract_${Date.now()}`,
                goal: intent.goal,
                steps,
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-file-append-contract', deterministic: true, localOnly: true },
            };
        }

        // An explicit named-file contract is a real filesystem task, not a
        // request to invent an application. Keep the plan deterministic and
        // pass concrete arguments to the policy gateway's file tools.
        if (explicitFile) {
            const steps: ExecutionStep[] = [{
                id: 'file_write',
                description: `كتابة الملف المحدد: ${explicitFile.path}`,
                tool: 'write_file',
                agent: 'Dev',
                input: { path: explicitFile.path, filename: explicitFile.path, content: explicitFile.content, request: intent.goal },
                dependsOn: [],
            }];
            if (explicitFile.readBack) {
                steps.push({
                    id: 'file_read_back',
                    description: `قراءة ${explicitFile.path} بعد الكتابة والتحقق من محتواه`,
                    tool: 'read_file',
                    agent: 'Dev',
                    input: { path: explicitFile.path, request: intent.goal },
                    dependsOn: ['file_write'],
                });
            }
            return {
                id: `file_contract_${Date.now()}`,
                goal: intent.goal,
                steps,
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-file-contract', deterministic: true, localOnly: true },
            };
        }

        // An explicit directory target must win over file-name extraction. A
        // request such as "inspect directory X and confirm README.txt exists"
        // is about opening X; README.txt is an entry to verify inside it.
        const explicitDirectory = parseExplicitDirectoryInspectionRequest(userGoal);
        if (isReadOnlyStructural(userGoal) && explicitDirectory) {
            return {
                id: `inspect_directory_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'inspect_directory_target',
                    description: `استكشاف المجلد المحدد والتحقق من محتوياته: ${explicitDirectory.path}${explicitDirectory.expectedEntry ? ` (expected entry: ${explicitDirectory.expectedEntry})` : ''}`,
                    tool: 'inspect_directory',
                    agent: 'Dev',
                    input: { path: explicitDirectory.path, depth: 1, expectedEntry: explicitDirectory.expectedEntry, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-directory-inspection', deterministic: true, localOnly: true },
            };
        }

        // A URL is a browser target even when the user also says "do not
        // modify files". Resolve bounded navigation and observation before the
        // workspace read-only boundary so an IP address or domain is never
        // reinterpreted as a local file or project audit.
        const earlyUrlMatch = userGoal.match(/https?:\/\/[^\s<>'\"]+/i)
            || userGoal.match(/\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s<>'\"]*)?/i);
        /**
         *  A PROHIBITION IS NOT AN ORDER.
         *
         *  «…أنشئ commit محلياً، لكن لا تنفذ git push ولا تفتح Pull Request»
         *  — a clone-and-commit contract that ends by FORBIDDING a PR. The
         *  verb «فتح» sits inside «تفتح», so that clause read as an intent to
         *  open the repository's URL, and the whole contract became one
         *  browser_launch. Negated clauses are removed before the open intent
         *  is read, the same way a negated build verb already is.
         */
        const openProbe = probe
            .replace(/(^|[\s،؛,:.!?])و?(?:لا|ليس|بدون|دون|عدم)\s+(?:أن\s+)?ت?(?:فتح|ذهب|نتقل|زور|دخل)\S*/gu, '$1')
            .replace(/\b(?:do\s+not|don't|never|without)\s+(?:open(?:ing)?|visit(?:ing)?|navigat\w*|go(?:ing)?\s*to)\b/gi, ' ');
        const earlyOpenIntent = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(openProbe);
        const earlyTitleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
        // Test the CANONICAL multilingual verbs too. The normalizer maps
        // «опиши», «decris», «descrivi» and similar forms to `describe`; if this
        // gate ignores that canonical word it stops at browser_launch and never
        // lets the observing agent describe the page the user asked about.
        const earlyPageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|describe|translate|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
        const earlyVisibleContent = /(اقر[أا]|اعرض|أظهر|اظهر|الحالة|المحتوى|النص\s+الظاهر|report|read|show|displayed|visible\s+(?:text|content)|page\s+content|response\s+body|status\s+(?:shown|displayed|returned)?)/i.test(probe);
        if (earlyUrlMatch && earlyOpenIntent && (earlyTitleOnly || !earlyPageWork)) {
            const url = earlyUrlMatch[0].startsWith('http') ? earlyUrlMatch[0] : `https://${earlyUrlMatch[0]}`;
            const readContent = !earlyTitleOnly && earlyVisibleContent;
            console.log(`[PlanningEngine] early explicit URL open -> browser_launch ${url}${readContent ? ' + visible content' : ''}`);
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: earlyTitleOnly
                        ? `افتح ${url} وأعد عنوان الصفحة`
                        : readContent
                            ? `افتح ${url} واقرأ المحتوى الظاهر`
                            : `افتح ${url}`,
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url, request: intent.goal, readContent },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-browser-open' },
            };
        }

        // An explicit read-only file list is more precise than selecting one
        // project from a multi-project workspace. Read each safe relative path
        // through ToolService and let the normal result composer explain the
        // collected evidence in the chat.
        const explicitReadFiles = explicitReadFile ? [explicitReadFile] : parseExplicitReadFilesRequest(userGoal);
        if ((explicitReadFile || isReadOnlyStructural(userGoal)) && explicitReadFiles) {
            const expectedMarkers = parseExpectedReadMarkers(userGoal);
            return {
                id: `read_files_${Date.now()}`,
                goal: intent.goal,
                steps: explicitReadFiles.map((file, index) => ({
                    id: `read_file_${index}`,
                    description: `قراءة الملف المحدد والتحقق من محتواه: ${file}${expectedMarkers[file] ? ` (expected marker: ${expectedMarkers[file]})` : ''}`,
                    tool: 'read_file',
                    agent: 'Dev',
                    input: { path: file, expectedMarker: expectedMarkers[file], request: intent.goal },
                    dependsOn: index === 0 ? [] : [`read_file_${index - 1}`],
                })),
                metadata: { complexity: 'low', riskLevel: 'low', matchedBy: 'explicit-read-file-contract', deterministic: true, localOnly: true },
            };
        }

        // A read-only audit is a safety boundary, not a generic keyword route.
        // Handle it before run/stop/build fast-paths so words such as "stop
        // conditions" cannot be mistaken for an instruction to stop a server.
        // The pipeline performs discovery through ToolService, then halts before
        // planning or mutation when the evidence carries the same constraint.
        if (isReadOnlyStructural(userGoal) && !isBoundedTerminalDiagnosticRequest(userGoal)) {
            return {
                id: `read_only_audit_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'read_only_audit',
                    description: 'استكشاف قراءة فقط دون تخطيط أو تعديل أو تشغيل',
                    tool: 'project_pipeline',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'read-only-safety-boundary' },
            };
        }

        // Decide explicit repairs before broad build routes so "rebuild this
        // project" cannot be downgraded to a fresh project run.
        {
            const repairVerb = /(repair|fix|modify|update)/i.test(userGoal);
            const existingProjectWords = /(existing project|current project|same project)/i.test(userGoal);
            const explicitProjectDir = (userGoal.match(/C:[^\s.]+/i)?.[0] || '').trim();
            const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
            const activeProject = ((global as any).joeProjects || {})[sessionKey];
            const repairProjectDir = String(explicitProjectDir || activeProject?.scaffoldDir || activeProject?.dir).trim();
            if (repairVerb && existingProjectWords && repairProjectDir) {
                return {
                    id: `projrepair_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: 'Re-audit and repair the existing project in place, then rebuild and verify it',
                        tool: 'project_repair',
                        agent: 'Dev',
                        input: { projectDir: repairProjectDir, auditDir: path.join(repairProjectDir, 'dist'), request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'explicit-existing-project-repair' },
                };
            }
        }

        /**
         * [PROJECT QUALITY REVIEW FAST-PATH] A review of the delivered result is
         * not an integration test request. A built project without a package.json
         * or test harness still needs a real-browser audit: inspect the rendered
         * build, repair measurable defects, rebuild, and measure again. The
         * generic planner used to interpret «راجع تقرير الجودة والنتيجة النهائية»
         * as auto_tester(integration), which then correctly refused because there
         * was no harness. This guard keeps the choice evidence-first and works for
         * any active built project, not a product name or a template.
         *
         * It runs before every other action route. A long review request can
         * contain words such as «الكود» or «اختبارات» and otherwise look like
         * code_reviewer/auto_tester; the existence of a measurable built artifact
         * is stronger evidence than those incidental words.
         */
        {
            const reviewVerb = QUALITY_REVIEW_VERB.test(probe);
            const qualityTarget = /(جودة|الجودة|تقرير|النتيجة|النتائج|المخرجات|التسليم|quality|\bqa\b|browser\s+test(?:ing)?|report|result|output|delivery|deliverable)/i.test(probe);
            const explicitQualityReview = /(تقرير\s*الجودة|النتيجة\s*النهائية|quality\s*report|final\s+(?:result|output|deliverable))/i.test(probe);
            const built = findActiveBuiltProject(context?.sessionId);
            // A construction brief may contain its own QA, audit, and acceptance
            // sections. Those words describe the deliverable's verification plan;
            // they must not hijack the construction request into repairing the
            // currently active (possibly unrelated) artifact. Only a request that
            // is not itself an explicit build should use this fast-path —
            // and a build verb alone does not make one (isConstructionBrief,
            // asked only of a request that reads as a review, with a build open).
            if ((explicitQualityReview || (reviewVerb && qualityTarget)) && built && !PlanningEngine.isConstructionBrief(userGoal)) {
                return {
                    id: `quality_review_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: 'إعادة تدقيق البناء في متصفح حقيقي وإصلاح ما يظهر ثم إعادة البناء والقياس',
                        tool: 'project_repair',
                        agent: 'Dev',
                        input: { projectDir: built.projectDir, auditDir: built.auditDir, request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'active-built-project-quality-review' },
                };
            }
        }

        /**
         * LOCAL BUILD IS A CONTRACT, NOT A KEYWORD TIE.
         *
         * A real acceptance run asked Joe to build and preview a React dashboard
         * locally, then stated «لا نشر خارجي». The generic capability chain split
         * the sentence at «ثم», saw the bare word «نشر», and planned deploy_pages
         * anyway. The permission gate correctly blocked it, but Joe had already
         * abandoned every requested local action. When a build request explicitly
         * denies publishing, neither a chain nor the capability scorer may choose
         * deployment; the deterministic builder below owns the whole request.
         */
        const deployReading = PlanningEngine.readDeployIntent(userGoal);
        const deniesExternalPublish = deployReading.deniesExternalPublish;
        const localBuildContract = PlanningEngine.looksLikeBuild(userGoal) && deniesExternalPublish;
        // A long construction brief can quote its own rollback/version-history
        // acceptance requirements. Those words are evidence about the product,
        // not an instruction to undo the currently active project. Keep the
        // direct undo fast-path for short, explicit requests, but never let a
        // build brief with an active (possibly stale) project hijack the build.
        const buildRequest = PlanningEngine.looksLikeBuild(userGoal);
        const longConstructionBrief = buildRequest && userGoal.length >= 1000;
        const localSpecificationExecution = PlanningEngine.isLocalSpecificationExecutionRequest(userGoal);

        // Product names never decide an engineering route. A request that calls
        // itself ORION, Atlas, or anything new must be classified from the work
        // it asks for, then pass through the same evidence-first pipeline as every
        // other system. This prevents a named example from becoming Joe's answer.

        /**
         * A TERMINAL REQUEST MUST EXECUTE, NOT JUST OPEN A PANEL OR ANSWER ABOUT IT.
         *
         * During a visible acceptance run, «نفّذ فحصاً محلياً باستخدام أداتك
         * الطرفية» was sent to terminal_manager and ended in a central prose
         * answer. The Terminal panel correctly waited for output, but no command
         * was ever planned. A bounded diagnostic request therefore owns a safe,
         * cross-platform command below. It deliberately does NOT interpret raw
         * command text from a natural-language request: shell_execute still owns
         * its own safety gate and real project build/edit routes retain their
         * richer pipelines.
         */
        const explicitTerminalSurface = /(استخدم|استعمل|نفّ?ذ|شغّ?ل|اجري|أجرِ|قم\s+ب(?:إجراء|عمل))[^\n]{0,120}(?:طرفي[ةه]|terminal|shell|command\s*(?:line)?|سطر\s*(?:الأوامر|اوامر))|(?:طرفي[ةه]|terminal|shell)[^\n]{0,120}(?:نفّ?ذ|شغّ?ل|اجري|أجرِ|فحص|تحقّ?ق|check|verify|execute|run)/i.test(probe);
        const genericSystemDiagnostic = /(?:run|execute|perform)[^\n]{0,100}(?:local\s+)?(?:diagnostic|check)[^\n]{0,140}(?:node(?:\.js)?|workspace|working\s+directory|current\s+directory|\bpwd\b|\becho\b|version|status)/i.test(probe)
            && !/(?:browser|visual|responsive|viewport|desktop|tablet|mobile|navigation|page|website|\bui\b|متصفح|واجهة|مرئي|تجاوب|شاشة)/i.test(probe);
        const explicitlyRequestsTerminalExecution = /\bshell_execute\b/i.test(probe)
            || explicitTerminalSurface
            || genericSystemDiagnostic;
        // The user can safely say «لا تبنِ / لا تعدّل ملفات» to constrain a
        // terminal check. Those negated verbs are NOT a request to build or edit.
        const terminalDiagnosticProbe = probe.replace(
            /(?:لا|ليس|بدون|غير|do\s+not|don't|without)\s+(?:تبن[ِي]?|ابن[ِي]?|ابني|انشئ|أنشئ|طوّ?ر|تطوير|تعدّ?ل|عدّ?ل|تعديل|أصلح|اصلح|build|create|develop|implement|modify|edit|fix)(?:\s+[^\s،؛.:!?]+){0,3}/gi,
            '',
        );
        const boundedTerminalDiagnostic = isBoundedTerminalDiagnosticRequest(userGoal) || (/(فحص|تحقّ?ق|اختبر|حالة|إصدار|نسخ[ةه]|version|status|check|verify|test|diagnostic)/i.test(probe)
            && !/(?:ابنِ|ابني|انشئ|أنشئ|طوّ?ر|تطوير|عدّل|تعديل|أصلح|اصلح|build|create|develop|implement|modify|edit|fix)/i.test(terminalDiagnosticProbe));

        /**
         * VERIFYING AN EXISTING PROJECT IS NOT REQUESTING A NEW PROJECT.
         *
         * "Run npm run build in folder X; do not edit" used to match the React
         * builder later in this method and silently scaffold a replacement. The
         * caller named both the execution tool and an existing simple directory,
         * so keep the operation bounded: one fixed build command, no inferred
         * shell text, and no traversal-capable cwd. This sits before every React
         * or generic build route by design.
         */
        // A phrase such as «داخل هذا المجلد» is a reference, not a directory
        // name. We only accept a directory explicitly named after «الموجود في»
        // (or the equivalent English construction), so a later pronoun cannot
        // replace the project identifier supplied earlier in the request.
        const existingProjectDirMatch = userGoal.match(
            /(?:الموجود\s+في|project\s+(?:located\s+)?in|folder\s+)(?:\s+)[`'\"]?([A-Za-z0-9_\-\u0600-\u06FF]+)[`'\"]?/i,
        );
        const existingProjectDir = String(existingProjectDirMatch?.[1] || '').trim();
        const explicitExistingProjectBuild = explicitlyRequestsTerminalExecution
            && /\bnpm\s+run\s+build\b/i.test(probe)
            && /^[A-Za-z0-9_\-\u0600-\u06FF]+$/.test(existingProjectDir);
        if (explicitExistingProjectBuild) {
            console.log(`[PlanningEngine] explicit existing-project build → shell_execute (npm run build in ${existingProjectDir})`);
            return {
                id: `terminal_build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'terminal_existing_project_build',
                    description: `تشغيل فحص بناء محلي للمشروع القائم: ${existingProjectDir}`,
                    tool: 'shell_execute',
                    agent: 'Dev',
                    input: { command: 'npm run build', cwd: existingProjectDir, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'medium', riskLevel: 'medium', terminalExecution: true, buildVerification: true },
            };
        }

        if (explicitlyRequestsTerminalExecution && boundedTerminalDiagnostic) {
            // Never execute arbitrary natural-language shell text here. We only
            // honour a deliberately small, read-only diagnostic allowlist, which
            // lets the user see the exact requested command and its real output.
            const requestedCommands: string[] = [];
            if (/\bpwd\b/i.test(userGoal)) requestedCommands.push('pwd');
            if (/\bnode\s+--version\b/i.test(userGoal) || /\bnode(?:\.js)?\b[^\n]{0,30}\bversion\b|\bversion\b[^\n]{0,30}\bnode(?:\.js)?\b/i.test(userGoal)) {
                requestedCommands.push('node --version');
            }
            if (/\b(?:workspace|working\s+directory|current\s+directory)\b[^\n]{0,40}\bpath\b|\bpath\b[^\n]{0,40}\b(?:workspace|working\s+directory|current\s+directory)\b/i.test(userGoal)) {
                requestedCommands.push('pwd');
            }
            const echo = userGoal.match(/\becho\s+([A-Za-z0-9_.:/=-]{1,120})\b/i);
            if (echo) requestedCommands.push(`echo ${echo[1]}`);
            if (!requestedCommands.length) {
                requestedCommands.push("node -e \"console.log('Joe terminal execution verified')\"");
            }

            console.log(`[PlanningEngine] explicit terminal diagnostic → shell_execute (${requestedCommands.join(' → ')})`);
            return {
                id: `terminal_check_${Date.now()}`,
                goal: intent.goal,
                steps: requestedCommands.map((command, index) => ({
                    id: `terminal_diagnostic_${index}`,
                    description: `تنفيذ فحص طرفية محلي: ${command}`,
                    tool: 'shell_execute',
                    agent: 'Dev',
                    input: { command, request: intent.goal },
                    dependsOn: index === 0 ? [] : [`terminal_diagnostic_${index - 1}`],
                })),
                metadata: { complexity: 'low', riskLevel: 'low', terminalExecution: true },
            };
        }

        /**
         * A GITHUB REPOSITORY IS NOT A WEB PAGE WHEN THE USER ASKS TO WORK ON IT.
         *
         * The URL-open guard below correctly handles “open GitHub and read this
         * page”, but it used to see “افحص README” inside a long local Git workflow
         * as browser work and return immediately. The request then ended after a
         * single navigation even though it explicitly required clone, branch,
         * diff, test, and a local commit. Decide that engineering contract before
         * *any* URL route: ImportProjectTool provides the real checkout from which
         * the subsequent local operations can be proved. A plain view/open request
         * still reaches browser_launch because it has none of these work signals.
         */
        const earlyGithubRepository = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(userGoal);
        const earlyGithubLocalWork = /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|فرع|التزام|كوميت|git\s*(?:status|diff|checkout|commit|branch)|build|develop|implement|modify|edit|fix|test|run|clone|import|branch|commit|analy[sz]e|review|inspect)/i.test(probe);
        // Import is deliberately sufficient for an analysis-only request. Add the
        // constrained follow-through only when the user names actual local Git
        // deliverables. This distinction prevents a harmless “analyse this repo”
        // from silently creating a branch or commit.
        const requestsBoundedLocalGitWorkflow = /(فرع|برانش|التزام|كوميت|commit|branch|(?:docs|documentation)\/[A-Za-z0-9._/-]+\.md|ملف\s*(?:توثيق|ملاحظات)|وثّ?ق|توثيق)/i.test(probe);
        if (earlyGithubRepository && earlyGithubLocalWork) {
            const steps: ExecutionStep[] = [{
                id: 'repo_import',
                description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً وربطه بالجلسة',
                tool: 'import_project',
                agent: 'Dev',
                input: { request: intent.goal },
                dependsOn: [],
            }];
            if (requestsBoundedLocalGitWorkflow) {
                steps.push({
                    id: 'local_git_workflow',
                    description: 'إنشاء فرع محلي وملف توثيق محدود والتحقق من الفرق ثم الالتزام محلياً دون دفع أو نشر خارجي',
                    tool: 'git_local_workflow',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: ['repo_import'],
                });
            }
            console.log(`[PlanningEngine] early GitHub local-work contract → import_project${requestsBoundedLocalGitWorkflow ? ' + git_local_workflow' : ''}`);
            return {
                id: `repo_import_${Date.now()}`,
                goal: intent.goal,
                steps,
                metadata: { complexity: requestsBoundedLocalGitWorkflow ? 'high' : 'medium', riskLevel: 'medium' },
            };
        }

        // A recovery goal ("Fix and continue: <task>\n[THE STEP FAILED WITH THIS
        // ERROR]: …") must NEVER enter the keyword fast-paths below. The goal now
        // carries the failed task's own words plus raw error text — both full of
        // exactly the keywords the fast-paths trigger on. Measured failure modes:
        // a short recovery goal (<30 chars) fell into the chat fast-path and the
        // "repair" was a paragraph of prose; a failed search step matched the web
        // search fast-path and re-ran the identical failing search with zero
        // analysis. Recovery is planned from the error, by the real planner, always.
        /**
         * A ROUTE THAT SAW ONE CLAUSE MUST NOT CLAIM THE WHOLE SENTENCE.
         *
         * Measured end to end: «حلّل المستودع، ثم راجع الكود، ثم اضغط الملفات»
         * hit the repo-analysis fast-path on its FIRST clause and returned a
         * single github_repo_manager step. The other two tasks — which the
         * user wrote down, in order — vanished. The chain sits below the
         * hand-written routes by design, and it never got to see this.
         *
         * So a request that names its own sequence is checked first. It defers
         * to the hand-written routes for anything that is really a BUILD:
         * those are hand-checked, richer, and «ابنِ متجراً ثم أضف صفحة» is
         * better served by them than by two generic steps.
         */
        const BUILDERS = new Set(['react_project', 'api_project', 'web_page_builder', 'project_pipeline', 'scaffold_project']);
        try {
            const { capabilityChain, hasExplicitSequence } = require('./capability-match');
            const goalText = String(intent.goal || '');
            // A GitHub link plus analysis/development verbs has a stronger
            // deterministic contract below: clone it locally before inspecting
            // or changing it. Do not let a generic multi-step chain consume the
            // first clause and lose the repository checkout.
            const isGithubWorkRequest = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(goalText)
                && /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|build|develop|implement|modify|edit|fix|test|run|clone|import|analy[sz]e|review|inspect)/i.test(probe);
            // Only an explicit «ثم»/«then» — a newline is layout, not order.
            // A build request must remain one coherent engineering plan even when
            // it contains words that describe a later verification or delivery
            // step. For example, "build an internal web console ... then test it,
            // never deploy" is NOT a browser-console step followed by deployment.
            // Splitting it here used to let generic capability scoring outrank the
            // evidence-first pipeline before that pipeline had a chance to inspect
            // the workspace. Any construction request therefore owns its whole
            // sentence; only non-build multi-task requests may use this chain.
            const early = !isGithubWorkRequest
                && !localBuildContract
                && !localSpecificationExecution
                && !PlanningEngine.looksLikeBuild(userGoal)
                && hasExplicitSequence(goalText)
                ? capabilityChain(goalText, 5)
                : [];
            if (early.length >= 2 && !early.some((c: any) => BUILDERS.has(c.name))) {
                const chained = PlanningEngine.capabilityPlan(intent);
                if (chained && chained.metadata?.matchedBy === 'capability-chain') {
                    console.log('[PlanningEngine] multi-task request — the chain outranks a single-clause route');
                    return chained;
                }
            }
        } catch { /* the registry is optional — every route below still stands */ }

        if (/^fix and continue:/i.test(String(intent.goal || '').trim())) {
            return PlanningEngine.generateDynamicDag(intent, memory, context);
        }

        /**
         * [LOCAL SPECIFICATION → EVIDENCE-FIRST ENGINEERING PIPELINE]
         *
         * The source file already exists in the selected workspace.  Joe must
         * read it, discover the actual project shape, plan from that evidence,
         * then execute and verify.  A capability chain must not split the
         * request merely because the specification also says «write» or «test».
         */
        if (localSpecificationExecution) {
            console.log('[PlanningEngine] local specification + execution verb → project_pipeline');
            return {
                id: `local_spec_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'project_pipeline',
                    description: 'اقرأ مواصفة مساحة العمل، استكشف الأدلة، ثم خطط ونفّذ وتحقق محلياً',
                    tool: 'project_pipeline',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'high', riskLevel: 'medium', localOnly: true, matchedBy: 'local-specification' },
            };
        }

        // IntentParser has already made a provider-independent, explicit
        // construction decision for these requests.  It is a contract, not a
        // weak routing hint: dropping it here used to send an ordinary records
        // application brief back through generateDynamicDag, paying for a model
        // call before the evidence-first pipeline could even inspect the
        // workspace.  Keep the existing file, read-only, GitHub, terminal, and
        // local-specification contracts above this point; this branch covers the
        // remaining clear build/engineering brief and still delegates all work to
        // project_pipeline through the normal ToolService path.
        const deterministicPipelineIntent = Boolean((intent as any)?.rawIntent?.deterministic)
            && (Boolean((intent as any)?.rawIntent?.buildRequest)
                || Boolean((intent as any)?.rawIntent?.engineeringBrief))
            && Array.isArray(intent.requiredTools)
            && intent.requiredTools.length === 1
            && intent.requiredTools[0] === 'project_pipeline';
        if (deterministicPipelineIntent) {
            console.log('[PlanningEngine] deterministic build contract → evidence-first project_pipeline');
            return {
                id: `deterministic_pipeline_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'project_pipeline',
                    description: 'استكشف الأدلة، ثم خطط ونفّذ وتحقق من طلب البناء محلياً',
                    tool: 'project_pipeline',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: intent.complexity || 'medium', riskLevel: intent.riskLevel || 'medium', matchedBy: 'deterministic-build-contract' },
            };
        }

        /**
         * [ATTACHMENTS ARE THE SUBJECT — DECIDED BEFORE EVERY FAST-PATH]
         * «حلل هذه الصورة» plus an [ATTACHED FILES …] block is a question
         * about the ATTACHED CONTENT — never a browser job, a repo job or a
         * file-write job. This guard used to sit just before the semantic
         * router, AFTER all the keyword fast-paths — and the field log shows
         * the browser+file compound path firing first on the English words
         * inside the attachment block itself and planning «browse then write
         * is.txt» for an image question. Attachment questions are therefore
         * decided HERE, at the top, from the USER'S OWN WORDS only.
         */
        // نفّذ/طبّق are BUILD verbs. They were missing, so «نفّذ هذا الـPRD»
        // with the document attached fell into the ask-about-the-attachment
        // guard and produced a chat ABOUT the requirements instead of a build.
        // DESIGN requests are builds too — field log: «اريد تصميم مختلف لهذه
        // الصوره» fell into the guard and got a CHAT about the picture. The
        // design words are matched as REQUESTS (صمّم، تصميم مختلف/جديد/صفحة،
        // redesign, design a/new…), never as bare nouns — «ما رأيك بهذا
        // التصميم؟» stays an opinion question.
        const WANTS_BUILD_RE = /\b(build|create|implement|develop|scaffold|execute|apply|redesign)\b|\bdesign\s+(a|an|new|another|different|similar)\b|ابنِ|ابني|انشئ|أنشئ|اصنع|نفّ?ذ|طبّ?ق|صمّ?م(?![ء-ي])|أ?عد\s*تصميم|تصميم\s*(مختلف|جديد|آخر|اخر|مشابه|صفح|موقع|واجه)|حوّل|حول .*موقع|موقع من|صفحة من/i;
        if (/\[ATTACHED FILES/.test(rawGoal)) {
            const userPart = rawGoal.split('[ATTACHED FILES')[0];
            // FIELD FAILURE: «قم باضافه هذه الصوره الى منتج البوس» with the
            // photo attached landed here and Joe DESCRIBED the picture back
            // instead of using it. Putting an attached image INTO the active
            // project is an edit, not a conversation about a file.
            // No lookbehind: the field wrote «قم باضافه هذه الصوره» — the verb
            // carried a «بـ» prefix and a strict boundary refused the match.
            const putsFileInProject = /(ضي?ف|أضف|اضف|إضاف[ةه]|اضاف[ةه]|حطّ?|ركّ?ب|بدّ?ل|غيّ?ر|استخدم|اجعل)[\s\S]{0,40}(هذه\s*الصور|الصور[ةه]|هالصور)|\b(add|use|set|replace|make)\b[\s\S]{0,40}\b(this\s+)?(photo|image|picture)\b/i.test(userPart);
            const hasProject = !!((global as any).joeProjects || {})[String((intent as any)?.context?.sessionId || (intent as any)?.sessionId || '')]?.dir
                || Object.keys((global as any).joeProjects || {}).length > 0;
            if (putsFileInProject && hasProject) {
                console.log('[PlanningEngine] attached image + «أضفها إلى …» → project_edit (the file is used, not described)');
                return PlanningEngine.projectEditPlan(intent, context, 'attached image placed into the active project');
            }
            if (!WANTS_BUILD_RE.test(userPart)) {
                console.log('[PlanningEngine] attachments present + no build verb → direct answer about the attached content');
                return {
                    id: `chat_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'direct_response',
                        description: 'Answering about the attached file(s)',
                        tool: 'central_answer',
                        agent: 'General',
                        input: { question: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' }
                };
            }
        }

        /**
         * [THE PRD ROUTE] «نفّذ هذا الـPRD وطبّق كل ما فيه» + an attached
         * requirements document is the user's declared end-goal for Joe.
         * The document's full text (extracted from pdf/docx/txt, or read by
         * OCR from a photographed page) already rides in the goal's
         * [ATTACHED FILES] block — what was missing is the ROUTE: a build
         * verb plus a document lands in the canonical engineering pipeline
         * (phases → execution with real checks → honest report), never in
         * a chat about the requirements and never in the one-page builder.
         */
        if (/\[ATTACHED FILES/.test(rawGoal) && WANTS_BUILD_RE.test(rawGoal.split('[ATTACHED FILES')[0])) {
            const attachSection = rawGoal.slice(rawGoal.indexOf('[ATTACHED FILES'));
            // A document attachment (anything whose declared type is not
            // pure media), or an explicit requirements word from the user —
            // including a PHOTOGRAPHED requirements page (image + OCR text).
            const hasDocAttachment = /—\s*(application|text)\//.test(attachSection);
            const prdWord = /\bPRD\b|متطلبات|مواصفات|كراس(ة)?\s*شروط|requirements?|specification|spec\b/i
                .test(rawGoal.split('[ATTACHED FILES')[0]);
            const hasOcrText = attachSection.includes('OCR — the EXACT text read inside the image');
            if (hasDocAttachment || (prdWord && hasOcrText) || (prdWord && /—\s*image\//.test(attachSection))) {
                console.log('[PlanningEngine] PRD/document + build verb → project_pipeline (build what the document says)');
                return {
                    id: `prd_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: 'تنفيذ ما يطلبه المستند المرفق: مراحل ← تنفيذ مع فحص حقيقي ← تقرير صادق',
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' }
                };
            }
        }

        /**
         * [A DESIGN REQUEST OVER A PICTURE IS A BUILD — WITH OR WITHOUT A MODEL]
         *
         * «اريد تصميم مختلف لهذه الصوره» + the screenshot had no deterministic
         * route: it relied on the semantic router, and when every provider is
         * exhausted — which is exactly what the field log shows, Groq at its
         * daily limit and the mesh 429ing — the plan fell through to a CHAT
         * about the picture. Joe's determinism must not evaporate the moment
         * the quota does. A build verb aimed at an attached IMAGE builds.
         *
         * «هل هذا التصميم جميل؟» is still an opinion: the guard above already
         * requires a build verb in the user's own words.
         */
        if (/\[ATTACHED FILES/.test(rawGoal)) {
            const userPart = rawGoal.split('[ATTACHED FILES')[0];
            const attachSection = rawGoal.slice(rawGoal.indexOf('[ATTACHED FILES'));
            const imageOnly = /—\s*image\//.test(attachSection) && !/—\s*(application|text)\//.test(attachSection);
            if (imageOnly && WANTS_BUILD_RE.test(userPart)) {
                console.log('[PlanningEngine] design verb + attached image → build the page (no model needed)');
                return {
                    id: `design_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'build_page',
                        description: 'بناء صفحة انطلاقاً من التصميم المرفق',
                        tool: 'web_page_builder',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' }
                } as any;
            }
        }

        /**
         * [IMAGE ANALYSIS IS AN ANSWER, NEVER A TOOL CIRCUS] «قم بتحليل هذه
         * الصوره» arriving with NO attachment block (the follow-up message
         * that lost its file, or a restart that emptied the memory) went to
         * the generic DAG, which planned exiftool (not installed on Windows),
         * grep, write-file and a BROWSER node — five failing steps and a raw
         * ENOENT as the final «answer» (field log, verbatim). Analyzing a
         * picture is central_answer's job in every case: with a description
         * it describes, without one it honestly says vision is unavailable.
         */
        {
            /**
             *  TWO BARE PATTERNS, AND A SHOP HE ASKED FOR BECAME A CHAT.
             *
             *  Measured on his machine, deterministically reproducible through
             *  the planner itself:
             *
             *      «اعمل لي متجراً … فيه صفحة المنتجات وصفحة الطلبات.
             *       جدول المنتجات فيه اسم الصنف والسعر والحالة … وصورة …
             *       شغّل البناء الحقيقي وافتح المعاينة الحية»
             *      → steps: ["central_answer"]
             *
             *  Joe answered with a plan and asked permission to proceed, after
             *  being told to run the real build. The two matches, printed:
             *
             *      VERB «وصف»  inside «وصفحة الطلبات»   ← «and a page», not «describe»
             *      NOUN «صور»  inside «وصورة»           ← a COLUMN in his table
             *
             *  Neither word was his. This is the Arabic \b problem the language
             *  layer was built for: `\w` never holds an Arabic letter, so a bare
             *  pattern reads letters where the question is about words — the same
             *  defect as «زر» inside «أزرق» and «عدد» inside «متعدد».
             *
             *  So both halves go through the word reader, and the guard against
             *  a build is widened: WANTS_BUILD_RE did not fire on «اعمل لي
             *  متجراً» either, and one bad reader should not depend on another
             *  bad reader to be caught. A request that reads as a build anywhere
             *  is never an image question.
             */
            const asksImageAnalysis =
                saysAny(probe, ['حلل', 'تحليل', 'وصف', 'فحص', 'قرا', 'شرح'])
                && saysAny(probe, ['صوره', 'صور', 'لقطه', 'سكرين'])
                || (/\b(analy[sz]e|describe|inspect|examine|explain|read)\b/i.test(probe)
                    && /\b(image|photo|picture|screenshot)\b/i.test(probe));
            if (asksImageAnalysis
                && !WANTS_BUILD_RE.test(userGoal)
                && !PlanningEngine.looksLikeBuild(String(intent.goal || ''))) {
                console.log('[PlanningEngine] image-analysis request → direct answer (no tool circus, with or without the file)');
                return {
                    id: `chat_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'direct_response',
                        description: 'Analyzing the image (or honestly reporting vision state)',
                        tool: 'central_answer',
                        agent: 'General',
                        input: { question: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' }
                };
            }
        }

        // A test request that also asks for repair is a repair loop, not a plain
        // project start. Keep diagnosis, bounded repair, and rerun together so
        // the request cannot be reduced to project_run by the word "run".
        {
            const testRepairRequest = /(test\s+suite|failing\s+tests?|اختبارات?\s*(المشروع|الكود)?|الاختبارات|فشل(?:ت|ت?\s+في)?\s*الاختبار)/i.test(userGoal)
                && /(repair|fix|correct|إصلاح|اصلح|أصلح|صحح|صلح|عالج)/i.test(userGoal);
            // A new construction brief may explicitly require a complete QA
            // and repair cycle. Those clauses belong to the builder after it
            // creates the artifact; they are not evidence that an existing
            // project is available to repair before the first build step.
            if (testRepairRequest && !buildRequest) {
                return {
                    id: `project_repair_tests_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: 'Run the project tests, repair measured failures, and rerun the same checks',
                        tool: 'project_repair',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'test-repair-loop' },
                };
            }
        }

        // [RUN / STOP FAST-PATH] "شغّل المشروع" / "run the project" starts the
        // built system live and opens its preview; "أوقف المشروع" / "stop it"
        // stops it. Deterministic so a weak model can't turn "run my system"
        // back into a chat answer. Checked before the build path so "شغّل" is
        // never mistaken for "ابنِ".
        {
            // The question, build-verb and target readings — and the deploy
            // decision itself — come from readDeployIntent, the one reader the
            // capability matcher asks too (see its comment for why there is one).
            const { isQuestion, hasBuildVerb, projectTarget } = deployReading;
            const hasProjectMutation = /\b(add|change|modify|update|edit|remove|delete|implement|repair|fix)\b/i.test(userGoal)
                || /(أضف|اضف|إضافة|اضافة|غيّر|غير|تغيير|عدّل|عدل|تعديل|حذف|إزالة|أصلح|اصلح|إصلاح|صلّح|عالج)/.test(userGoal);

            const stopIntent = !isQuestion && !hasBuildVerb && projectTarget
                && /(أوقف|اوقف|إيقاف|ايقاف|اقفل|\bstop\b|\bkill\b|shut\s*down)/i.test(probe);
            const runIntent = !isQuestion && !hasBuildVerb && !hasProjectMutation && !stopIntent && projectTarget
                && /(شغّ?ل|تشغيل|شغلي|\brun\b|\bstart\b|\blaunch\b|\bserve\b|\bpreview\b)/i.test(probe);

            const deployIntent = deployReading.deploy;

            if (stopIntent) {
                return {
                    id: `stop_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'project_stop', description: 'إيقاف الخادم', tool: 'project_stop', agent: 'Dev', input: {}, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
            if (runIntent) {
                return {
                    id: `run_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'project_run', description: 'تشغيل المشروع ومعاينته حيّاً', tool: 'project_run', agent: 'Dev', input: { projectQuery: userGoal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
            if (deployIntent) {
                return {
                    id: `deploy_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'deploy_pages', description: 'نشر المشروع بشكل دائم على GitHub Pages', tool: 'deploy_pages', agent: 'Dev', input: {}, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [API PROJECT FAST-PATH] An EXPLICIT backend request — «ابنِ لي API
        // للطلبات», «باك اند بقاعدة بيانات» — scaffolds a runnable Express +
        // SQLite backend with a live write/read proof. Explicit only, and a
        // request that ALSO names a site/frontend keeps its richer path
        // (pipeline or react) — this serves the backend-alone ask.
        {
            const apiNoun = /\b(api|backend|rest)\b|باك\s?[إا]ند|واجهة برمجية|قاعدة بيانات|خادم بيانات/i.test(probe);
            const frontendNoun = /\b(react|vite|spa|landing|site|website|page)\b|ريأكت|رياكت|موقع|صفح[ةه]|فيت(?![\p{L}\p{N}_])/iu.test(probe);
            const fullish = /(متكامل|كامل|full[-\s]?stack|complete)/i.test(probe);
            const apiBuildVerb = /\b(build|create|make|develop|scaffold|generate)\b/.test(goalLower)
                || /(ابن|ابني|انشئ|أنشئ|اصنع|طور|اعمل|سو)/.test(probe);
            // …but «نظام إدارة مخزون مع تسجيل دخول وقاعدة بيانات» is not a request
            // for a bare API. It says «نظام» and it owns data, so the scope
            // classifier calls it a SYSTEM — a backend AND the app that uses it.
            // Shipping only the server there is the same «half a thing» the user
            // objected to, from the other end.
            // «اعمل باك اند بقاعدة بيانات للمخزون» IS a bare backend ask, even
            // though it owns data — the user named the server and nothing else.
            // What turns it into a full system is naming the THING: an app, a
            // system, a platform, a dashboard.
            const namesAnApp = /(تطبيق|نظام|منصّ?ة|لوحة\s*تحكم|برنامج|\bapp\b|dashboard|platform|system)/i.test(probe);
            const bareApiAsk = !namesAnApp;
            if (apiBuildVerb && apiNoun && !frontendNoun && !fullish && bareApiAsk) {
                return {
                    id: `engineering_api_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف سياق العمل ثم خطط ونفّذ خدمة الواجهة البرمجية المطلوبة بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [FULL-PROJECT FAST-PATH] A complete multi-file project (backend, API,
        // database, full stack) goes to the canonical engineering pipeline:
        // plan phases -> execute with verification and auto build checks ->
        // repair tickets and one self-fix on failure -> honest report. Before
        // this route existed, «ابنِ لي مشروعاً متكاملاً بباك اند» fell to the
        // page fast-path below and shipped as ONE HTML file, or to the generic
        // DAG which wrote files nothing ever executed. This must be checked
        // BEFORE the page builder — «تطبيق» matches its webNoun too.
        {
            const projectVerb = /\b(build|create|make|develop|scaffold|generate)\b/.test(goalLower)
                || /(ابن|ابني|انشئ|أنشئ|اصنع|طور|اعمل|سو)/.test(probe);
            const fullStackNoun = /(باك\s*اند|واجهة\s*خلفية|خادم|سيرفر|قاعدة\s*بيانات|مشروع\s*(متكامل|كامل)|تطبيق\s*(متكامل|كامل)|نظام\s*(متكامل|كامل|إدارة|اداره)|back\s*-?end|\bserver\b|server\s*side|database|rest\s*api|api\s*server|full[-\s]?stack|complete\s+(project|app|application|system))/i.test(probe);
            // A general engineering signal is a distinct required capability, not
            // the product's label. Two or more signals require discovery before
            // construction because they may constrain the existing workspace,
            // architecture, test strategy, or tool selection.
            const engineeringSignals = [
                /(?:multi[\s-]?tenant|tenant|مستأجر|متعدد\s*المستأجرين)/i,
                /(?:rbac|role|permission|authorization|صلاحيات|أدوار|ادوار)/i,
                /(?:approval|workflow|موافقة|سير\s*عمل)/i,
                /(?:audit|ledger|accounting|تدقيق|دفتر|محاسبة)/i,
                /(?:inventory|orders?|payments?|stock|مخزون|طلبات|مدفوعات)/i,
                /(?:integration|event|webhook|contract|تكامل|أحداث|احداث|عقد)/i,
            ].filter((pattern) => pattern.test(probe)).length;
            const namesASystem = /(تطبيق|نظام|منصّ?ة|لوحة\s*تحكم|برنامج|\bapp\b|dashboard|platform|system|application)/i.test(probe);
            const needsEngineeringPipeline = fullStackNoun || (namesASystem && engineeringSignals >= 2);
            // A PHONE app is the page builder's job (it ships an installable
            // PWA); «تطبيق جوال متكامل» must not fall into the backend pipeline.
            const { wantsMobileApp } = require('../design/pwa');
            if (projectVerb && needsEngineeringPipeline && !wantsMobileApp(probe)) {
                console.log(`[PlanningEngine] engineering scope -> evidence-first project_pipeline (signals: ${engineeringSignals})`);
                return {
                    id: `project_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف سياق العمل ثم خطط ونفّذ النظام المطلوب بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' }
                };
            }
        }

        // [CAPABILITY ROUTER] Joe owns 151 tools; ranking them for the planner
        // was worth nothing while requests never reached the planner. Measured:
        // «دقّق السيو في موقعي» short-circuited to a spoken answer (a goal under
        // 30 characters does), and «افحص الروابط المكسورة في موقعي» was claimed
        // by the BUILD path below — Joe tried to BUILD a site in answer to a
        // request to INSPECT one, while owning a broken-link checker.
        //
        // So the ranking decides here, before the builders, and only when the
        // sentence carries an act verb AND one specialist wins clearly AND its
        // required arguments can be filled from the sentence. Anything less
        // falls through to exactly the paths that ran before.
        // An EDIT of the open page always belongs to the page's own tool: «حط
        // صورة في الأعلى» is not a request to analyse an image, and the edit
        // path below has years of dialect handling in it. The router yields.
        const editKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const pageIsOpen = !!((global as any).joePages && (global as any).joePages[editKey]);
        const looksLikeEdit = /(اضف|أضف|ضيف|ضف|حط|خلي|خلّي|شيل|سوي|سوّي|غير|غيّر|عدل|عدّل|بدل|بدّل|احذف|امسح|كبر|كبّر|صغر|صغّر|رتب|رتّب|ركب|ركّب|جمل|جمّل|حسن|حسّن)/.test(String(intent.goal || ''))
            || /\b(add|change|replace|remove|make it|set the)\b/i.test(String(intent.goal || ''));
        const explicitBrowserWorkflowRequest = /(متصفح|براوزر|browser|browser\s+qa|real\s+browser|live\s+page)/i.test(String(intent.goal || ''))
            && /(test|exercise|verify|inspect|audit|check|click|fill|form|button|flow|retest|repair|اختبر|اختبار|تحقق|افحص|تدقيق|اضغط|انقر|نموذج|زر|إعادة\s*اختبار)/i.test(String(intent.goal || ''));
        // The capability scorer sees token overlap only. A construction request
        // has one coherent engineering contract: inspect evidence, plan, build,
        // verify, and report. It must never be claimed by a single matching tool
        // (Git, browser, deploy, or otherwise), even when the request omits an
        // explicit «never deploy» clause. The later build routes select the
        // correct general engineering workflow from the actual workspace.
        const routed = (pageIsOpen && looksLikeEdit)
            || localBuildContract
            || explicitBrowserWorkflowRequest
            || PlanningEngine.looksLikeBuild(String(intent.goal || ''))
            ? null
            : capabilityRoute(String(intent.goal || ''), context);
        // The same deploy reader the fast path and capabilityPlan ask: a
        // deploy tool is never chosen past its veto (content, or a denial)
        // on this road either.
        const capable = routed && PlanningEngine.isSiteDeployTool(routed.tool) && (deployReading.veto || !deployReading.ordersAPublish) ? null : routed;
        if (capable) {
            console.log(`[PlanningEngine] capability router -> ${capable.tool} (score ${capable.score}, runner-up ${capable.runnerUp || 'none'})`);
            return {
                id: `capability_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: capable.tool,
                    description: intent.goal,
                    tool: capable.tool,
                    agent: capable.tool.startsWith('browser_') ? 'Browser' : 'Dev',
                    input: capable.input,
                    dependsOn: [],
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' },
            };
        }

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        // A QUESTION IS NOT AN ORDER. «ما هو أفضل تصميم لموقع مطعم؟» built a
        // restaurant site: the sentence carries a build verb («تصميم») and a web
        // noun («موقع»), and nothing asked whether the user was requesting work
        // or asking about it. Interrogatives are answered, not executed.
        const isQuestion = /[؟?]\s*$/.test(String(intent.goal || '').trim())
            && /(^|\s)(ما|ماذا|لماذا|كيف|متى|اين|أين|هل|كم|ايهما|أيهما|من\s+هو|ما\s+هو|ما\s+هي)(\s|$)/.test(probe);
        const buildVerb = !isQuestion && (/\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            // «قم ببناء…» / «قم بعمل…» / «أريد بناء…» are how people actually ask.
            // Field log: «قم ببناء صفحة جميله لشركة أدوية ومعدات طبية» matched no
            // build verb, so with the brain unreachable it fell to the failover
            // node — which OPENED A BROWSER for a request to build a page.
            // «بنِ نظاماً…» — the bare imperative, and the one that cost him a
            // whole run: every noun matched, no verb did, and the request went
            // to a planner LLM whose quota was gone.
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو|شيّ?د|أقم|اقم)/.test(probe)
            || /(^|\s)بنِ?\s/.test(probe)
            || /قم\s*ب?(بناء|عمل|انشاء|إنشاء|تصميم|تطوير|صنع)/.test(probe)
            || /(اريد|أريد|ابغى|أبغى|بدي|ودي)\s*(ب?بناء|عمل|انشاء|إنشاء|تصميم|موقع|صفحة|تطبيق|متجر|نظام|منصّ?ة|لوحة|أداة|اداة)/.test(probe)
            || /(?<=(?:^|[^\p{L}\p{N}_])[وف]?)(بناء|تصميم|[إا]نشاء)\s+(?:ال)?(موقع|صفح[ةه]|تطبيق|متجر|واجه[ةه]|لوح[ةه])/u.test(probe)
            /**
             *  …AND A THIRD COPY OF THE SAME QUESTION.
             *
             *  Everything above answers «is this a build?» — and so does the
             *  shared looksLikeBuild, and so did looksLikeEngineeringBrief.
             *  Three answers to one question, and his clinic brief got a
             *  different one from each: the shared test said yes, this list
             *  said no, and because it said no, looksBrowser said yes and Joe
             *  typed «المريض باسمه أو تلفونه» into a search engine.
             *
             *  The list above stays — it carries cases the shared test does
             *  not, and every one of them was paid for. But it stops being the
             *  last word. Ask the shared question too, so a request that is a
             *  build anywhere is a build here.
             */
            || PlanningEngine.looksLikeBuild(String(intent.goal || '')));
        /**
         * THE ENGLISH LIST WAS NEVER BROUGHT UP TO THE ARABIC ONE.
         *
         * His request, verbatim: «Build a world-class e-commerce PLATFORM
         * similar to Shopify … Multi-vendor MARKETPLACE … Mobile APP …
         * Generate complete production-ready code.»
         *
         * `buildVerb` matched on «build». `webNoun` did not match ANYTHING:
         * platform, marketplace, e-commerce and a bare «app» were all missing,
         * while the Arabic branch below has known «نظام», «منصّة», «أداة» and
         * «برنامج» for months. So the build gate stayed shut, the request fell
         * through to the generic planner, and Joe answered a request for a
         * production-ready platform with FIFTEEN nodes of `central_answer` —
         * «Good evening, Younes. I'll outline the optimal project structure…».
         * Not one file was written.
         */
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface|converter)\b/.test(goalLower)
            || /\b(platform|marketplace|e-?commerce|storefront|system|app|application|software|tool|service|portal|panel|admin|backend|api|saas|crm|erp|pos|blog|editor|tracker|planner|scheduler|booking|marketplace|network|clone|table|spreadsheet|ledger|register|list|board|workspace|library|directory|manager|log|desk)\b/.test(goalLower)
            // «نظام نقاط بيع للمطاعم مع تقارير مبيعات» named no «موقع» and no
            // «صفحة», so the build gate never opened and Joe just TALKED about it.
            // A system, a platform, a dashboard and a tool are things people ask
            // to have built, exactly like a site.
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط|نظام|منصّ?ة|أداة|اداة|برنامج|بوابة|خدمة|محرّ?ر|مدوّ?نة|سيرة\s*ذاتية|منيو|قائمة\s*(?:طعام|أسعار|منتجات)|جدول|كشف|قائمة)/.test(probe);
        // Route follow-up edits (add button / change colour / ...) to the SAME page.
        const activeKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
        // Arabic asks for an edit with a VERBAL NOUN at least as often as with a
        // verb — «أضف» but also «إضافة», «غيّر» but also «تغيير» — and it pluralises
        // the thing being changed («لون» -> «ألوان»). Matching only the imperative
        // singular meant «اريد اضافة الوان جميله» missed the edit path entirely and
        // the request was handed to the generic planner, which went off searching
        // the web for colour palettes instead of touching the page.
        // The dialect verbs the user actually types — «ضيف زر», «حط صورة»,
        // «خلي الخلفية غامقة», «شيل القسم الأخير», «سوي الخط أكبر» — were not
        // edit verbs, so with a page open the message fell to the generic
        // planner and «جو صار يتهبل» (field report, verbatim). They are gated
        // by hasActivePage below, so they can never hijack a fresh build.
        const editIntent = /\b(add|change|modify|update|edit|remove|bigger|smaller|colou?r|button|background|header|footer|font|title|style|design|prettier|nicer)\b/i.test(goalLower)
            || /(أضف|اضف|إضافة|اضافة|غيّر|غير|تغيير|عدّل|عدل|تعديل|بدّل|بدل|تبديل|اجعل|احذف|حذف|كبّر|كبر|تكبير|صغّر|صغر|تصغير|حسّن|حسن|تحسين|تنسيق|تجميل|جمّل|امسح|أزل|ازل)/.test(probe)
            // Typed by a human, not by a spell-checker: «اريد اعديل علىيه بان
            // يعمل مسارات…» carried no verb this list knew, so the request fell
            // through to the semantic router and came back as a NEW marketing
            // page — while the React app it was about sat untouched on disk.
            || /(?<![ء-ي])[اأي]?ع[دّ]?[يى]?ل(ه|ها|ين|وا)?(?![ء-ي])/.test(probe)
            // A capability asked for in plain words is an edit too.
            || /(اجعله|خليه|أريد(ه)?\s+(أن\s+)?ي|اريد(ه)?\s+(ان\s+)?ي|يعمل|يدعم|يحدّد|يحدد|يعرض|ميزة|ميزه|خاصية|خاصيه|إضافة\s*ميزة)/.test(probe)
            // The SHORT dialect verbs need Arabic boundaries — bare /خلي/ fires
            // inside «الداخلية» and /سوي/ inside «تساوي», turning ordinary
            // questions into page edits.
            || /(?<![ء-ي])(ضيف|ضِف|حطّ?(ي|ه|ها)?|خلّ?ي(ه|ها)?|شيل(ي|ه|ها)?|سوّ?ي(ه|ها)?|ركّ?ب|رتّ?ب|ظبط|ضبط|صلّ?ح|أصلح|اصلح)(?![ء-ي])/.test(probe)
            // Concrete page parts only. Generic words like «تصميم» or «شكل» appear in
            // ordinary questions ("ما هو تصميم قاعدة البيانات؟") and would rebuild the
            // page on a question — the verbs above already cover "improve the design".
            || /(لون|ألوان|الوان|زر|أزرار|ازرار|خلفية|خلفيه|خلفيات|حجم|أحجام|عنوان|عناوين|خط|خطوط|قسم|أقسام|اقسام|صورة|صور|فوتر|هيدر|ترويسة|تذييل|قائمة|أيقونة|ايقونة|فقرة|نصوص)/.test(probe)
            // Version history: rollback/undo and the versions list belong to
            // the page's own tool (instant restore, no model call).
            || /(تراجع|استرجع|(ارجع|أرجع|رجّع)[^.\n]{0,20}نسخ|نسخ(ة|ه)\s*(السابق|القديم|رقم)|اعرض\s*النسخ|إصدار\s*سابق|\bundo\b|\brollback\b|\brevert\b|version\s*history)/i.test(probe);

        /**
         * [UNDO FAST-PATH] «تراجع» on a PROJECT goes to the project's own
         * history, not to the page tool's.
         *
         * The rollback sentence has always been recognised — and always routed
         * to the page builder, which is where version history lived. A session
         * whose active project is a React app would have its «تراجع» answered by
         * a tool that knows nothing about it. Projects have snapshots of their
         * own now, taken before every edit and every self-repair.
         */
        {
            /**
             * «أرجع» IS «I COME BACK». IT IS ALSO «REVERT». ONE WORD, TWO ACTS.
             *
             * Measured on the owner's machine, from a request he typed himself:
             *
             *     «… لما أسكر الصفحة وأرجع أفتحها …»   (when I close the page and come back to open it)
             *
             * A bare match on «أرجع» read that as an instruction to roll the
             * active project back. The whole 308-character brief — five fields,
             * persistence, search, two totals, a colour rule — was replaced by a
             * single `project_undo` step, and nothing was ever built. The
             * contract names this class by name and says what to do about it:
             * «أيّ مطابقةٍ على اسمٍ مجرّدٍ من هذه ستعطي معياراً خاطئاً. اشترط سياقاً.»
             *
             * So the ambiguous verbs now need an object that only an undo has:
             * a version, a release, an edit, a change, «الوراء». The verbs that
             * mean nothing else — «تراجع», «استرجع», undo, rollback, revert —
             * still stand alone, because they are not ambiguous.
             */
            const undoAlone = /(تراجع|استرجع|\bundo\b|\brollback\b|\brevert\b)/i.test(probe);
            const undoWithObject = /(ارجع|أرجع|رجّع|رجع)\s+(?:\S+\s+){0,2}?\S*(نسخ|اصدار|إصدار|تعديل|تغيير|وراء|خلف|سابق)/i.test(probe);
            const undoVerb = undoAlone || undoWithObject;
            const listVerb = /(اعرض|أظهر|اظهر|ما\s*هي)\s*(النسخ|الإصدارات|الاصدارات)|\bversions?\b|version\s*history/i.test(probe);
            const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
            const active = ((global as any).joeProjects || {})[sessionKey];
            if ((undoVerb || listVerb) && active?.dir && !longConstructionBrief) {
                return {
                    id: `undo_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_undo',
                        description: listVerb ? 'عرض النسخ المحفوظة للمشروع' : 'إرجاع المشروع إلى نسخته السابقة وإعادة بنائه',
                        tool: 'project_undo',
                        agent: 'Dev',
                        input: { projectDir: active.dir, ...(listVerb && !undoVerb ? { list: true } : {}) },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        /**
         * [UI REPAIR FAST-PATH] «اريده ان يصلح ui لاي نظام ولاي صفحة عندما
         * يطلب منه».
         *
         * «أصلح واجهة المشروع» is not an ordinary edit: it is a measured loop —
         * audit in a real browser, repair the source deterministically, rebuild,
         * measure again — and routing it to the generic editor would hand a
         * whole-project accessibility pass to a model one string at a time.
         *
         * Gated on an ACTIVE PROJECT so it can never hijack a fresh build, and
         * on the words meaning the interface ITSELF rather than one element of
         * it: «أصلح الزر» stays a surgical edit, «أصلح الواجهة» is this.
         */
        {
            const repairVerb = /(أصلح|اصلح|صلّح|صحّح|عالج|رقّع|حسّن|حسن|fix|repair|improve|clean\s*up)/i.test(probe);
            const uiWhole = /(الواجهة|واجهة\s*(المشروع|النظام|التطبيق|الموقع)|\bui\b|\bux\b|الوصولية|إمكانية\s*الوصول|accessibility|a11y|جودة\s*الواجهة|مشاكل\s*الواجهة|كل\s*(المشاكل|الملاحظات))/i.test(probe);
            const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
            const activeProject = ((global as any).joeProjects || {})[sessionKey]?.dir;
            // A build request may mention QA, accessibility, or repairing defects
            // as acceptance criteria. It must still enter the evidence-first
            // pipeline so the project is created/inspected before any UI repair;
            // otherwise a stale active-project path can trigger `no_project` and
            // abort a fresh build before project_pipeline gets a chance to run.
            if (repairVerb && uiWhole && activeProject && !buildRequest && !longConstructionBrief) {
                return {
                    id: `ui_fix_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_ui_fix',
                        description: 'قياس الواجهة في متصفح حقيقي، وإصلاح مصدرها، وإعادة القياس',
                        tool: 'browser_ui_fix',
                        agent: 'Dev',
                        input: { projectDir: activeProject },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [REACT PROJECT FAST-PATH] An EXPLICIT framework request — «مشروع
        // React», «تطبيق Vite», «SPA» — gets a real scaffolded project with a
        // verified build, not a static page. Explicit only: a plain «ابن لي
        // موقع» keeps the page builder that serves it best.
        {
            const reactNoun = /\b(react|vite|jsx|spa)\b|ريأكت|رياكت|ري أكت|فيت(?![\p{L}\p{N}_])|سبا(?![\p{L}\p{N}_])/iu.test(probe);
            if (buildVerb && reactNoun) {
                return {
                    id: `engineering_react_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ تطبيق React المطلوب بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [IMPORT PROJECT] «استورد هذا المستودع وافهمه» — a GitHub URL plus an
        // import/understand/work verb clones it, reads it, and makes it the
        // session's active project for the surgical editor.
        {
            const hasGithub = /github\.com\/[\w.-]+\/[\w.-]+/i.test(probe);
            const importVerb = /(استورد|استيراد|اجلب|حمّل|افهم|حلل|اعمل\s*على|طوّر|طور|import|clone|understand|analy[sz]e|work\s*on)/i.test(probe);
            if (hasGithub && importVerb) {
                return {
                    id: `import_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'import_project', description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً ثم تفعيله للجلسة', tool: 'import_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        /**
         *  READING WHAT EXISTS IS NOT BUILDING WHAT DOES NOT.
         *
         *  Measured on his machine, deterministically. A shop he asked to have
         *  built was planned as one step:
         *
         *      ▶ orders_read
         *      «لا توجد طلبات بعد — حين يضغط زائر «اطلب الآن» في موقعك …»
         *
         *  One sentence of his request — «اعرض عدد الطلبات اليوم» — is a
         *  REQUIREMENT OF THE THING BEING BUILT: a figure the shop must show.
         *  The orders branch read it as an instruction to go and read orders
         *  from a database, and answered a request to build a shop by
         *  reporting that no orders had arrived.
         *
         *  The same class as everything else tonight: A DECISION TAKEN FROM A
         *  FRAGMENT WHEN THE AUTHORITY IS THE WHOLE REQUEST. The three
         *  branches below all answer «show me my existing data», and none of
         *  them carried a build guard — each was relying on nobody writing a
         *  build request that happens to contain their words. He just did.
         *
         *  So the guard is shared, and stated once: a request that reads as a
         *  build anywhere is never a request to read existing rows.
         */
        const heIsAskingToBuild = PlanningEngine.looksLikeBuild(String(intent.goal || ''));

        // [BUSINESS PROFILE] «احفظ بيانات عملي» — Joe's business memory:
        // save/show/clear the real contact details every build injects.
        {
            const profileAsk = /(احفظ|خزن|خزّن|سجل|سجّل|اعرض|أعرض|امسح|احذف)\s*[^.\n]{0,12}?(بيانات|ملف)\s*(عملي|العمل|المشروع|النشاط|شركتي|متجري|مطعمي)|\b(business|my)\s*profile\b/i.test(probe);
            if (profileAsk && !heIsAskingToBuild) {
                return {
                    id: `profile_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'business_profile', description: 'إدارة بيانات العمل المحفوظة', tool: 'business_profile', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [ORDERS READ] «اعرض الطلبات» — the owner reads visitor orders from
        // the API project's database, in the chat, server up or not.
        {
            const ordersAsk = /(اعرض|أعرض|ارني|أرني|شوف|اقرأ|كم|هات)\s*[^.\n]{0,15}?(ال)?طلبات|طلبات\s*(جديدة|الزبائن|العملاء|الموقع)|كم\s*(من\s*)?طلب|هل\s*وصل[^.\n]{0,12}طلب|\b(show|list|read)\b[^.\n]{0,15}\borders\b/i.test(probe);
            if (ordersAsk && !heIsAskingToBuild) {
                return {
                    id: `orders_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'orders_read', description: 'قراءة طلبات الزوار من قاعدة بيانات المشروع', tool: 'orders_read', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [FORM INBOX] «اعرض رسائل النموذج» — the live-data reading path.
        {
            /**
             * «اقرأ» IS A READING VERB, AND IT WAS THE ONE MISSING.
             *
             * The list held اعرض/شوف/كم/هل and not the plainest word of them
             * all. So «اقرأ الطلبات» reached the orders inbox and «اقرأ
             * الرسائل» fell through this path entirely — and landed on the
             * Gmail fast-path below, which reads «رسائل» as the user's own
             * mailbox. He asked for his site's messages and Joe went to
             * Google. The two ends of one wire, both wrong.
             */
            const inboxAsk = SITE_INBOX.test(probe)
                || /(اعرض|أعرض|شوف|كم|هل\s*(وصل|فيه)|اقرأ|اقرا|أقرأ|ارني|أرني|وريني|راجع|جاني|وصلني)\s*[^.\n]{0,25}?(رسائل|رساله|رسالة|الرسائل)|صندوق\s*(الرسائل|النموذج|الوارد)|من\s*راسل|form\s*(inbox|messages|submissions)/i.test(probe);
            const hasArtifact = !!((global as any).joePages?.[activeKey] || (global as any).joeProjects?.[activeKey]);
            if (inboxAsk && hasArtifact && !heIsAskingToBuild) {
                return {
                    id: `inbox_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'form_inbox', description: 'قراءة رسائل نموذج الموقع', tool: 'form_inbox', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [SURGICAL PROJECT EDIT] When the session's ACTIVE artifact is a
        // scaffolded project (newer than any built page), an edit belongs to
        // the diff editor — it changes lines in real files, verifies with the
        // real build, and reverts on red. A page-only session keeps the page
        // editor below.
        {
            const pageEntry = (global as any).joePages?.[activeKey];
            const rememberedProject = (global as any).joeProjects?.[activeKey];
            // The folder picker is workspace-scoped authority. A fresh chat may
            // not have an in-memory project entry yet, but it must still edit a
            // selected project instead of scaffolding a sibling directory.
            const selectedProjectDir = PlanningEngine.selectedProjectDir(context);
            const projEntry = selectedProjectDir
                ? { dir: selectedProjectDir, scaffoldDir: selectedProjectDir, updatedAt: Date.now() }
                : rememberedProject;
            const projectNewer = !!projEntry && (!pageEntry || !!selectedProjectDir || (Number(projEntry.updatedAt) || 0) > (Number(pageEntry.updatedAt) || 0));
            // A BUG REPORT AND AN ENHANCEMENT ARE EDITS TOO. From the field:
            // «زر get directions لا يعمل بشكل صحيح» and «The current route system
            // is not sufficient. I want to transform it into a real turn-by-turn
            // navigation system» — neither carried an edit verb, so the second
            // one built a THIRD copy of the app from scratch instead of
            // improving the one the session already had.
            const fixOrGrow = /(لا\s*يعمل|ما\s*(يشتغل|بيشتغل)|فيه\s*(مشكلة|خلل)|معطّ?ل|عطل|خطأ\s*في|غير\s*كاف|لا\s*يكفي|حوّ?له\s*إلى|طوّ?ره|حسّ?نه)|(not\s*working|does\s*not\s*work|doesn'?t\s*work|is\s*broken|not\s*sufficient|insufficient|not\s*enough|transform\s*it|turn\s*it\s*into|convert\s*it\s*into|improve\s*it|upgrade\s*it)/i.test(probe);
            const explicitlyTargetsCurrentProject = /(?:نفس|ذات)\s*(?:هذا\s*)?(?:المشروع|التطبيق|الموقع|النظام)|(?:المشروع|التطبيق|الموقع|النظام)\s*(?:نفسه|الحالي|الموجود)|\b(?:same|current|existing|this|active)\s+(?:project|application|app|site|system|workspace)\b/i.test(probe);
            const explicitlyForbidsNewProject = /(?:دون|بدون|لا)\s+(?:أن\s+)?(?:تنشئ|إنشاء|انشاء|بناء)\s+(?:أي\s+)?(?:مشروع|تطبيق|موقع)\s+جديد|\b(?:without|do\s+not|don't|no)\b[^.!?\n]{0,45}\b(?:create|build|scaffold)\b[^.!?\n]{0,35}\bnew\s+(?:project|app|site)\b/i.test(probe);
            /**
             * «أصلح ما تبقّى» — THE COMMAND THE DELIVERY MESSAGE OFFERS.
             *
             * When a build is handed over with defects still open, its message
             * ends with «قل ‹أصلح ما تبقّى› وسأفتح المتصفّح على هذه بالذات».
             * That sentence was a promise with nothing behind it until this
             * route existed: the phrase fell through to the surgical editor,
             * which asks a model to rewrite text it was never told about.
             *
             * It is deterministic on purpose — a repair that re-measures in a
             * real browser needs no planning, only doing.
             */
            const repairRemaining = /(أصلح|اصلح|صلّ?ح)\s*(لي\s*)?(ما\s*)?(تبقّ?ى|بقي|المتبقّ?ي|الباقي|العيوب|الأعطال)/.test(probe)
                || /\bfix\s+(what(?:'?s| is)\s+left|the\s+(rest|remaining|defects|blockers))\b/i.test(probe);
            const repairExisting = /\b(?:repair|fix|modify|update)\b[\s\S]{0,100}\b(?:existing|current|same)\s+project\b/i.test(probe);
            const explicitProjectDir = (String(intent.goal || '').match(/C:[^\s.]+/i)?.[0] || '').trim();
            const repairProjectDir = String(explicitProjectDir || projEntry?.scaffoldDir || projEntry?.dir).trim();
            // A construction brief may contain its own QA loop: "build it,
            // test it, and fix any real problems". With an older active
            // project in the session, treating that final "fix" as a repair
            // command hijacks the new build before it exists. Explicit build
            // intent owns the route; its repair instructions belong to the
            // builder's post-build QA cycle.
            if ((repairRemaining || repairExisting) && !!repairProjectDir && !buildRequest) {
                return {
                    id: `projrepair_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: `Re-audit and repair what is still broken in the active project`,
                        tool: 'project_repair', agent: 'Dev',
                        input: repairProjectDir
                            ? { projectDir: repairProjectDir, auditDir: path.join(repairProjectDir, 'dist'), request: intent.goal }
                            : { request: intent.goal }, dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }

            /*
             * ⛔ «TRANSFORM IT INTO …» NAMES THE WORK HE HAS.
             *
             * The analysis of 2026-11-11: since fa810595d (2026-09-26) the build reader calls «I want
             * to transform it into a real turn-by-turn navigation system» a build — «system» is a web
             * noun — and the enhancement rebuilt the app from scratch again, the very failure the
             * line above was written for. A request whose own words point at what exists («it», «the
             * current …», «حوّله», «طوّره», «حسّنه») is an edit, unless it asks for something new.
             */
            /*
             * …and only when nothing before those words builds: «Create a todo app …, then turn it
             * into a PWA», «اصنع تطبيق مهام ثم طوّره» are new builds whose «it» is the app they ask
             * for (the fifth review, 2026-11-11). «New» may stand a few words before its noun («a
             * new chat application», «تطبيق حجز جديد»).
             */
            const POINTS_AT_CURRENT = /\b(?:transform|turn|convert|improve|upgrade|extend|rework|expand)\s+it\b|\bthe\s+(?:current|existing)\s+(?:[\w-]+\s+){0,2}(?:system|app|application|site|page|project|feature|engine|flow)\b|حوّ?له\s*(?:إلى|الى|ل)|طوّ?ره|حسّ?نه|(?:ال)?(?:نظام|تطبيق|موقع|مشروع)\s+(?:الحالي|الموجود)/iu;
            const pointedAt = probe.search(POINTS_AT_CURRENT);
            const buildsFirst = pointedAt > 0 && /\b(?:build|create|make|develop|design|generate|scaffold|code|write)\b|(?:^|\s)(?:ابن[يِ]?|إبن[ي]?|اصنع|إصنع|أنشئ|انشئ|اعمل|سوّ?ي|صمّ?م|طوّ?ر\s+(?:لي\s+)?(?:تطبيق|موقع|نظام))(?=\s|$)/iu.test(probe.slice(0, pointedAt));
            const pointsAtCurrentWork = pointedAt >= 0 && !buildsFirst;
            const asksForSomethingNew = /\b(?:a|another|brand)\s+new\s+(?:[\w-]+\s+){0,3}?(?:project|app|application|site|website|system|page|tool|platform)\b|\bfrom\s+scratch\b|(?:مشروع|تطبيق|موقع|نظام|صفحة|منصة|أداة)(?:\s+\S+){0,3}?\s+جديد(?:ة)?|من\s+الصفر/iu.test(probe);
            if (projectNewer && (editIntent || fixOrGrow || explicitlyTargetsCurrentProject)
                && (!(buildVerb && webNoun) || explicitlyTargetsCurrentProject || explicitlyForbidsNewProject
                    || (fixOrGrow && pointsAtCurrentWork && !asksForSomethingNew))) {
                return PlanningEngine.projectEditPlan(intent, context);
            }
        }

        // Recovery goals were bounced out of generatePlan at the very top — by the
        // time execution reaches here the goal is a genuine user request.
        if ((buildVerb && webNoun) || (hasActivePage && editIntent)) {
            // A PAGE IS NOT AN APPLICATION.
            //
            // «ابني تطبيق خرائط شبيه بخرائط جوجل» produced index.html + styles.css
            // — a POSTER of a maps app. Measured across six real requests, five
            // came back as a static page or as chat: a chat app, a clinic booking
            // system with a doctor's dashboard, a point-of-sale with reports.
            // Joe owns react_project (a real Vite app) and api_project (a real
            // Express + SQLite server) and almost never reached them.
            //
            // The scope is decided from the request itself, deterministically —
            // no model needed, so it holds when the brain is down:
            //   page   → one document: a landing page, a menu, a portfolio
            //   app    → screens, state, interaction: a real React project
            //   system → app + its own data: a backend, and the app wired to it
            const externalDataCapability = buildVerb ? capabilityFromRequest(intent.goal) : null;
            const scope = PlanningEngine.classifyBuildScope(probe);
            if ((scope !== 'page' || externalDataCapability || requestedArtifact(probe).kind === 'cli') && !(hasActivePage && editIntent)) {
                console.log(`[PlanningEngine] build scope = ${scope} -> evidence-first project_pipeline`);
                return {
                    id: `engineering_${scope}_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ التطبيق أو النظام بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
            /**
             * A NEW SITE IS BUILT BY THE ENGINE THAT CAN ACTUALLY BUILD.
             *
             * «ابنِ موقعاً لمشغل عطور اسمه «ريحان» بخلفية داكنة ولمسة ذهبية،
             * الشعار في المنتصف، زوايا كبسولية» — driven through the real
             * chat UI — planned web_page_builder, which asked an LLM to write
             * one HTML file. With no provider it wrote NOTHING («no LLM
             * provider answered»); with one it writes a single page that has
             * never met the design-directives reader, the design families,
             * the photo pipeline, the visible self-QA or the improvement
             * loop. The month of engine work sat unreachable behind the
             * word «موقع», because that word is in none of the scope lists
             * and 'page' is the classifier's default.
             *
             * react_project is deterministic — it builds, measures and
             * repairs with ZERO model calls, so this route also survives
             * every provider being down. web_page_builder keeps the two
             * jobs that genuinely need model eyes: editing the session's
             * ACTIVE page, and building from an attached design image.
             */
            // …and «edit» must not swallow an explicit build: editIntent hears
            // nouns like «خلفية» and «لون», which a NEW brief also carries
            // («ابنِ موقعاً بخلفية داكنة»). A build verb + a web noun is a
            // build, whatever page happens to be open.
            if (hasActivePage && editIntent && !(buildVerb && webNoun)) {
                return {
                    id: `build_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'build_page',
                        description: `Building: ${intent.goal}`,
                        tool: 'web_page_builder',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' }
                };
            }
            console.log('[PlanningEngine] new page-scope build -> react_project (deterministic engine, no model needed)');
            return {
                id: `build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'build_page',
                    description: `Building: ${intent.goal}`,
                    tool: 'react_project',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [MY-BROWSER FAST-PATH] "... in my (real) browser" -> drive the user's OWN
        // browser through the installed Joe extension (their logins, any site).
        {
            const g = intent.goal || '';
            const myBrowser = /(في|بـ?|على)?\s*متصفّ?حي(\s*(الشخصي|الحقيقي))?|بمتصفّ?حي|my\s+(own\s+)?browser|in\s+my\s+browser|on\s+my\s+browser/i.test(probe);
            if (myBrowser) {
                const urlM = g.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
                const action = urlM ? 'open' : /(اقرأ|لخّ?ص|read|summar)/i.test(probe) ? 'read' : /(لقطة|screenshot|صورة)/i.test(probe) ? 'screenshot' : 'open';
                const input: any = { action, request: intent.goal };
                if (urlM) input.url = urlM[0].startsWith('http') ? urlM[0] : `https://${urlM[0]}`;
                return {
                    id: `mybrowser_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'user_browser', description: `user_browser ${action}`, tool: 'user_browser', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [GOOGLE ACCOUNT FAST-PATH] "read my email / calendar / drive" -> act in the
        // user's connected Google account via official APIs (needs OAuth connect first).
        {
            const g = intent.goal || '';
            const gmailRead = /(بريد|ايميل|إيميل|رسائل|جيميل|gmail|inbox|صندوق\s*الوارد|mail)/i.test(probe);
            const calList = /(تقويم|مواعيد|أجندة|اجندة|calendar|events?|اجتماعات)/i.test(probe);
            const driveList = /(درايف|ملفاتي|drive|ملفات\s*جوجل)/i.test(probe);
            const sendMail = /(أرسل|ارسل|ابعث|send)\s+(بريد|ايميل|إيميل|رسالة|mail|email)/i.test(probe);
            // Guard: "log in to https://mail.<site>" is a SITE login, not "read my
            // Gmail" — the word "mail" inside the URL must not hijack it to the API.
            const hasUrl = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)\b/i.test(probe);
            const loginToSite = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin/i.test(probe);
            // Guard: "browse a site, THEN email the result to someone@x" is a compound
            // browse->email task (handled below), not a bare "read my Gmail". The word
            // "بريد/mail" here is the delivery channel, not the target — don't hijack it.
            const emailCompound = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(probe) && /(أرسل|ارسل|ابعث|أبعث|send)/i.test(probe) && hasUrl;
            // Guard: "type in the email FIELD" / "click the mail button" is a page
            // interaction (the word «بريد/mail» names a form field, not the inbox) —
            // let the continue-on-live-page path below handle it, not the Gmail API.
            const pageInteraction = /(اضغط|انقر|اختر|عبّ?ئ|املأ|اكتب|حدّ?د|click|press|select|type|fill)/i.test(probe)
                && /(زر|الزر|حقل|الحقل|خانة|القائمة|مربع|صندوق|button|field|menu|box|input)/i.test(probe);
            // Guard: «رسائل نموذج التواصل» is the inbox of the site Joe built
            // him, not the mail in his Google account. Without this, the word
            // «رسائل» alone sent a question about his own site to Google — and
            // the answer was a request to connect an account he never named.
            const siteInbox = SITE_INBOX.test(probe);
            //  A REQUEST TO BUILD IS NOT A REQUEST TO READ HIS GOOGLE ACCOUNT.
            //
            //  Measured live on the owner's machine. He wrote:
            //
            //      «عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم
            //       تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع …»
            //
            //  «مواعيد» matched the calendar verb, and two hundred characters of
            //  brief — five columns, a search, a total — were replaced by one
            //  line: «لم يتم ربط حساب Google بعد». Nothing was built, and he was
            //  sent to a door his own order had frozen shut.
            //
            //  «مواعيد» there is the NOUN OF WHAT HE RECORDS, not an instruction
            //  to open a calendar. The contract names this class and prescribes
            //  the cure: «اشترط سياقاً». So the account verbs need to be about
            //  HIS account — «تقويمي», «من جوجل», «افتح التقويم» — and a request
            //  that describes something to build never routes here at all.
            const buildsSomething = PlanningEngine.looksLikeBuild(userGoal);
            const googleOwned = /(تقويمي|بريدي|ايميلي|إيميلي|درايفي|حسابي|من\s*(?:جوجل|قوقل|google)|في\s*(?:جوجل|قوقل|google)|my\s+(?:calendar|inbox|drive|mail)|\bgoogle\b)/iu.test(probe);
            const googleImperative = /(افتح|اعرض|أعرض|هات|جيب|شوف|check|open|show|list|read)/iu.test(probe);
            if ((gmailRead || calList || driveList || sendMail)
                && !buildsSomething
                && (sendMail || googleOwned || googleImperative)
                && !(hasUrl && loginToSite) && !emailCompound && !pageInteraction && !siteInbox) {
                const action = sendMail ? 'gmail_send' : calList ? 'calendar_list' : driveList ? 'drive_list' : 'gmail_list';
                const input: any = { action, request: intent.goal };
                if (action === 'gmail_list') { const q = g.match(/(?:عن|من|بخصوص|about|from)\s+(.+)$/i); if (q) input.query = q[1].trim(); }
                return {
                    id: `google_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'google_account', description: `Google: ${action}`, tool: 'google_account', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [GITHUB REPOSITORY WORK FAST-PATH] A link plus an implementation verb
        // means the user expects a local, inspectable checkout — not a metadata
        // report. ImportProjectTool clones, analyzes and makes that checkout active
        // so later edit/run/test requests operate on real files. Detailed analysis
        // is local too: meaningful findings must come from tracked files, not only
        // repository metadata. A mere "view this link" still falls through.
        {
            const goalText = String(intent.goal || '');
            const hasGithubUrl = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(goalText);
            const wantsLocalRepositoryWork = /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|build|develop|implement|modify|edit|fix|test|run|clone|import|analy[sz]e|review|inspect)/i.test(probe);
            if (hasGithubUrl && wantsLocalRepositoryWork) {
                console.log('[PlanningEngine] GitHub implementation request → import_project');
                return {
                    id: `repo_import_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'repo_import',
                        description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً وربطه بالجلسة',
                        tool: 'import_project',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'medium' },
                };
            }
        }

        // [REPO ANALYSIS FAST-PATH] «حلل الريبو المتصل / analyze the repo» is a
        // GitHub-API task, NOT a browser or shell task. Before this path existed,
        // the DAG planner produced blind shell nodes ("Connect to the repository"
        // with no command) that failed, and recovery then hijacked the task into
        // the browser. Route it straight to github_repo_manager(action:analyze),
        // which reads the REAL repo (metadata/tree/README/commits) via the API and
        // resolves the workspace's connected repo when none is named.
        {
            const repoNoun = /(الريبو|ريبو|مستودع|المستودع|ريبوزتوري|\brepo\b|repository)/i.test(probe);
            const analyzeVerb = /(حلّ?ل|تحليل|افحص|فحص|قيّ?م|تقييم|قرأ|اقرأ|لخّ?ص|ملخص|analy[sz]e|analysis|inspect|review|summari)/i.test(probe);
            if (repoNoun && analyzeVerb) {
                // "github.com/owner/repo" first (so the domain never pollutes the
                // name), then a bare "owner/repo".
                const gh = (intent.goal || '').match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
                const named = gh ? gh : (intent.goal || '').match(/(?:^|\s)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\s|$)/);
                const input: any = { action: 'analyze', request: intent.goal };
                if (named) input.repoName = named[1].replace(/\.git$/i, '');
                console.log(`[PlanningEngine] repo-analysis fast-path -> github_repo_manager(analyze) repo="${input.repoName || '(workspace connected repo)'}"`);
                return {
                    id: `repo_analyze_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'repo_analyze', description: `تحليل المستودع ${input.repoName || 'المتصل'}`, tool: 'github_repo_manager', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [EVIDENCE-FIRST ENGINEERING PRECEDENCE]
        // A request to BUILD an application or system is engineering work, even
        // when it names a web console or local verification. The browser router
        // below is intentionally broad for research, but must never turn a new
        // engineering request into a network classifier call before Joe has
        // inspected its workspace and planned from evidence.
        {
            const scope = PlanningEngine.classifyBuildScope(probe);
            if (buildVerb && (scope !== 'page' || requestedArtifact(probe).kind === 'cli')) {
                console.log(`[PlanningEngine] engineering scope = ${scope} -> evidence-first project_pipeline before browser routing`);
                return {
                    id: `engineering_${scope}_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ التطبيق أو النظام بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // [BROWSER SMART TOOLS FAST-PATH] summarise / audit a URL reliably.
        const goalRaw = intent.goal || '';
        const urlMatch = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);

        // [INTELLIGENT BROWSER ROUTER] Understand the request semantically (any
        // language / any phrasing) with the model, instead of relying on brittle
        // keyword regexes. This is the primary path; the keyword fast-paths below
        // remain only as a deterministic fallback when the model is unavailable.
        const looksBrowser = !!urlMatch || (
            !buildVerb && (
                String(intent.suggestedAgent || '') === 'Browser'
                || /(متصفح|براوزر|موقع|صفحة|الويب|الإنترنت|الانترنت|ابحث|إبحث|بحث|جد|جِد|دوّ?ر|فتّ?ش|افتح|تصفّ?ح|عايِ?ن|لخّ?ص|حلّ?ل|دقّ?ق|افحص|انقر|اضغط|املأ|عبّ?ئ|ترجم|قارن|استخرج|browser|web|site|page|search|find|look\s*up|google|open|visit|go\s*to|summari|analy|audit|click|fill|translate|compare|extract|scrape|seo)/i.test(probe)
            )
        );
        // A multi-action browser QA request is a workflow, even when its nouns
        // overlap with Git, files, search, or forms. Keep it out of the
        // capability scorer so it reaches the live observe -> decide -> act loop.
        const browserWorkflowIntent = !buildVerb && explicitBrowserWorkflowRequest;

        // [LOCAL BROWSER CONSENT GATE] When Joe is configured to drive the user's own
        // local Chrome profile (persistent mode), he must ASK permission once before
        // using it. If the user hasn't approved yet: a bare "أوافق" grants it; any
        // other browser request is intercepted with the consent prompt.
        try {
            const mgr = require('../../modules/browser/manager');
            if (mgr.isPersistentBrowserMode && mgr.isPersistentBrowserMode()) {
                const bsid = String((context && context.browserSessionId) || '').trim();
                // Consent is a per-browser-session capability. Never consult or
                // mutate a shared panel session when an execution context forgot
                // to carry its browser identity; BrowserAgent will fail closed.
                if (bsid && !mgr.hasBrowserConsent(bsid)) {
                    // NOTE: no \b after the words — \b is an ASCII word boundary and
                    // does NOT match after Arabic letters, so "اوافق" failed before.
                    const affirm = /^\s*(أوافق|اوافق|موافق|موافقة|نعم|أقبل|اقبل|أوكي|اوكي|تمام|أكيد|اكيد|ok|okay|yes|agree)(\s|$|[.،,!]|ي)/i.test(goalRaw.trim() + ' ');
                    if (affirm) {
                        return { id: `consent_${Date.now()}`, goal: intent.goal, steps: [{ id: 'browser_consent', description: 'grant local-browser consent', tool: 'browser_consent', agent: 'Browser', input: { grant: true }, dependsOn: [] }], metadata: { complexity: 'low', riskLevel: 'low' } };
                    }
                    if (looksBrowser) {
                        return { id: `consent_${Date.now()}`, goal: intent.goal, steps: [{ id: 'browser_consent', description: 'request local-browser consent', tool: 'browser_consent', agent: 'Browser', input: { grant: false }, dependsOn: [] }], metadata: { complexity: 'low', riskLevel: 'low' } };
                    }
                }
            }
        } catch { /* consent module optional; never block planning */ }

        // [CONTINUE-ON-LIVE-PAGE FAST-PATH] A bare interaction verb with NO URL
        // («اضغط على زر تسجيل الدخول», «اكتب في الحقل», «انزل تحت», «اختر من القائمة»,
        // "click the login button", "scroll down") is a CONTINUATION of the page the
        // user is already looking at — not a fresh request and definitely not a text
        // answer. Route it to the ReAct agent, which (with no start URL) observes the
        // CURRENT live page and acts on it. Fires when EITHER a UI-element noun is
        // present (deterministic) OR a browser page is actually live right now. Guarded
        // so «اكتب لي قصيدة» / «اشرح لي كذا» (no UI noun, verb used generally) never
        // gets hijacked.
        {
            const g = goalRaw;
            const interactVerb = /(اضغط|انقر|اختر|اكتب|أدخل|ادخل\s*في|مرّ?ر|انزل|اصعد|اسحب|عبّ?ئ|املأ|فعّ?ل|حدّ?د|ارجع|تابع|أكمل|اكمل|click|press|tap|scroll|select|choose|type|enter|fill|check|toggle|submit|go\s+back|continue)/i.test(probe);
            const noUrl = !urlMatch;
            const uiNoun = /(زر|الزر|زرّ|حقل|الحقل|خانة|القائمة|قائمة|رابط|الرابط|مربع|صندوق|الأيقونة|ايقونة|التبويب|علامة\s*التبويب|button|field|link|menu|dropdown|checkbox|icon|tab|box|input)/i.test(probe);
            // A navigation TARGET in the task (a known site, or an "open/go to <site>"
            // phrase) means this is NOT a pure continuation of the current page — it must
            // navigate first. Let the login / ReAct fast-paths below handle it (they
            // derive a start URL). Without this guard, «ادخل على جيت هاب واضغط الزر…»
            // was hijacked into resume-mode and never left the current page.
            const hasNavTarget = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|انست[غق]رام|instagram|جيميل|gmail|لينكد\s*ان|linkedin|ريديت|reddit|ويكيبيديا|wikipedia|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok)/i.test(probe)
                || /((ادخل|روح|اذهب)\s*(على|الى|إلى|ل)\s*\S+|افتح\s+(موقع|صفحة|رابط|\S+\.\S+)|go\s*to\s+\S+|open\s+\S+\.\S+|visit\s+\S+)/i.test(probe);
            let pageLive = false;
            try { const mgr = require('../../modules/browser/manager'); pageLive = !!(mgr.hasLiveBrowserPage && mgr.hasLiveBrowserPage()); } catch { /* optional */ }
            // Guard: orchestrator RECOVERY goals are prefixed "Fix and continue: <task>"
            // — the word "continue" matched interactVerb, so every failed NON-browser
            // node (e.g. a Dev shell step) got hijacked into browser resume-mode
            // whenever a page happened to be live. Recovery goals may only take this
            // path when the failed node itself was a Browser node.
            const nonBrowserRecovery = /^fix and continue:/i.test(String(intent.goal || '').trim())
                && String(intent.suggestedAgent || '') !== 'Browser';
            if (interactVerb && noUrl && !hasNavTarget && !nonBrowserRecovery && (uiNoun || pageLive)) {
                console.log(`[PlanningEngine] continue-on-live-page -> browser_run (resume) "${g.slice(0, 60)}"`);
                return {
                    id: `browser_continue_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_task',
                        description: intent.goal,
                        tool: 'browser_run',
                        agent: 'Browser',
                        // resume:true => the agent does NOT re-navigate; it acts on the
                        // page currently open in the panel session.
                        input: { task: intent.goal, request: intent.goal, resume: true },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [BROWSER + EMAIL COMPOUND FAST-PATH] "browse/extract X, THEN email it to
        // someone@site" — browser extracts, then google_account/gmail_send consumes the
        // result via {{FROM:browse}}. If Google isn't connected, gmail_send answers
        // honestly ("connect Google once"), it does not pretend to send.
        {
            const g = goalRaw;
            const email = (g.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
            const wantsSend = /(أرسل|ارسل|ابعث|أبعث|send|e-?mail|بريدياً)/i.test(probe);
            if (email && wantsSend && (!!urlMatch || looksBrowser)) {
                const browsePart = (g.split(/\s*(?:ثم|وبعدها|بعد\s*ذلك|بعدها|و?أرسل|و?ارسل|و?ابعث|then\b|and\s+then\b)\s*/i)[0] || g).trim() || g;
                console.log(`[PlanningEngine] browser+email compound -> browse then email ${email}`);
                return {
                    id: `browser_email_${Date.now()}`,
                    goal: intent.goal,
                    steps: [
                        { id: 'browse', description: browsePart, tool: 'browser_run', agent: 'Browser', input: { task: browsePart, request: intent.goal }, dependsOn: [] },
                        { id: 'send', description: `أرسل النتيجة بريداً إلى ${email}`, tool: 'google_account', agent: 'General', input: { action: 'gmail_send', to: email, subject: 'نتيجة من جو', body: '{{FROM:browse}}', request: intent.goal }, dependsOn: ['browse'] },
                    ],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // [BROWSER + FILE COMPOUND FAST-PATH] "browse/extract X, THEN write/save it to
        // a file" is TWO tools in one request. Build a 2-node plan — browser extracts,
        // then write_file consumes the browser result via {{FROM:browse}} — so the
        // browser chains with the other tools instead of the fast-path stopping early.
        {
            const g = goalRaw;
            const wantsFile = /(اكتب|اكتبها|احفظ|احفظها|دوّ?ن|خزّ?ن|صدّ?ر|صدّ?رها|write|save|export|store)/i.test(probe)
                && (/(ملف|file)/i.test(probe) || /\.(txt|md|csv|json|html|log)\b/i.test(probe));
            if ((!!urlMatch || looksBrowser) && wantsFile) {
                const fnameMatch = g.match(/\b([\w\-]+\.(?:txt|md|csv|json|html|log))\b/i)
                    || g.match(/(?:ملف|file)\s+["']?([\w\-.]+)["']?/i);
                let fname = (fnameMatch && fnameMatch[1]) ? fnameMatch[1] : 'joe-output.txt';
                if (!/\.[a-z0-9]{2,5}$/i.test(fname)) fname += '.txt';
                const browsePart = (g.split(/\s*(?:ثم|وبعدها|بعد\s*ذلك|بعدها|و?اكتبها?|و?احفظها?|then\b|and\s+then\b)\s*/i)[0] || g).trim() || g;
                console.log(`[PlanningEngine] browser+file compound -> browse then write ${fname}`);
                return {
                    id: `browser_file_${Date.now()}`,
                    goal: intent.goal,
                    steps: [
                        { id: 'browse', description: browsePart, tool: 'browser_run', agent: 'Browser', input: { task: browsePart, request: intent.goal }, dependsOn: [] },
                        { id: 'save', description: `احفظ النتيجة في ${fname}`, tool: 'write_file', agent: 'Dev', input: { path: fname, content: '{{FROM:browse}}' }, dependsOn: ['browse'] },
                    ],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // ORDER IS THE POINT. This gate used to sit BELOW the ReAct fast-path
        // while its own comment claimed priority — and the fast-path swallowed
        // «…وابحث عن دوله فلسطين» because the sentence named a known site. An
        // explicit search verb with no URL is a SEARCH; it is decided here,
        // first, from the user's own words.
        // [SEARCH HAS PRIORITY] A request with an explicit search verb ("ابحث عن X",
        // "search for X") is a SEARCH — even when it's wrapped in "افتح المتصفح و…".
        // The LLM classifier tends to latch onto the leading "افتح" and misroute the
        // whole thing to a plain open, and it also corrupts names (نابلس->نبعلس). So
        // we resolve search deterministically FIRST, from the user's own words, and
        // send it to the VISIBLE search tool. Only when there's no explicit site URL.
        if (looksBrowser && !urlMatch && !browserWorkflowIntent && PlanningEngine.hasSearchIntent(probe)) {
            const q = PlanningEngine.extractSearchQuery(goalRaw) || PlanningEngine.extractSearchQuery(goalNorm);
            if (q.length >= 2) {
                console.log(`[PlanningEngine] search priority -> browser_search query="${q}"`);
                return {
                    id: `browser_search_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'browser_smart', description: `Search (live typing): ${q}`, tool: 'browser_search', agent: 'Browser', input: { query: q, question: q, request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [EXPLICIT URL OPEN FAST-PATH] A bounded request to open a URL (or to
        // return only its title) must navigate before any page-local action. The
        // ReAct route can otherwise choose `browser_find_text` against an empty
        // panel, after which recovery incorrectly proposes browser installation.
        // `browser_launch` performs the real goto and returns the final URL + title.
        {
            const explicitOpen = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(probe);
            const titleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
            const pageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|describe|translate|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
            if (urlMatch && explicitOpen && (titleOnly || !pageWork)) {
                const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
                console.log(`[PlanningEngine] explicit URL open -> browser_launch ${url}`);
                return {
                    id: `browser_open_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_open',
                        description: titleOnly ? `افتح ${url} وأعد عنوان الصفحة` : `افتح ${url}`,
                        tool: 'browser_launch',
                        agent: 'Browser',
                        input: { url, request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [BROWSER AGENT FAST-PATH] A request to LOG IN to a site, or to DO an
        // interactive action on a site (fill/post/book/order/send/subscribe…), needs
        // the closed-loop ReAct agent — not a one-shot search. Route it to the
        // "Browser" agent via a browser_run node (the orchestrator sends browser_run
        // nodes through the agent, which runs observe→decide→act until done or it
        // needs the user for 2FA/CAPTCHA/credentials). Placed AFTER the my-browser and
        // Google-account fast-paths so those keep priority, and after the consent gate.
        {
            const g = goalRaw;
            const loginIntent = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?\s*(إلى|الى|على)?\s*(حساب|موقع)|دخّ?لني\s*(إلى|الى|على)|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin|log-in/i.test(probe);
            const actionVerb = /(املأ|عبّ?ئ|انشر|احجز|اطلب|أرسل|ارسل|اشترك|قدّ?م|علّ?ق|أضف|اضف|ادفع|اشترِ?ي?|صوّ?ت|احجز|سجّ?لني|fill\s+in|fill\s+out|submit|post|publish|book|order|subscribe|apply|comment|checkout|add\s+to\s+cart|purchase|\bbuy\b|reserve|register|sign\s*up)/i.test(probe);
            // "Look at the page and DESCRIBE what you see / what's on it / read it" is a
            // question ABOUT a live page — it needs the agent to actually observe (and,
            // when the page isn't readable as text, SEE via the vision model), not a
            // blind one-shot browser_launch that just opens the URL and stops. Without
            // this, «افتح URL وصِف لي ما تراه» fell to the plain open fast-path.
            // Read/summarise a page is also a "look at the live page" task — «لخّص لي
            // عن X من ويكيبيديا» must reach the ReAct read agent (which goes straight to
            // the article and summarises), NOT the one-shot search that types the whole
            // sentence into a search box.
            // ARABIC HAS NO \b, AND THAT COST A WHOLE FEATURE.
            // `صِ?ف` unanchored matches inside «المتصفّح» — so the word BROWSER
            // itself read as «describe». Field log: «قم باستخدام المتصفح وافتح
            // على جوجل وابحث عن دوله فلسطين» matched describe («صف» inside
            // المتصفح) + a known site («جوجل»), was routed to the free-form
            // ReAct agent, and that agent typed the user's own instruction into
            // Google's search box. Every Arabic verb here is now fenced by
            // Arabic-letter lookarounds so it only matches as a WORD.
            const AR = '\u0621-\u064A';
            // The TRAILING guard is what kills «صف» inside «المتصفّح». The leading
            // one must stay permissive, because Arabic glues its conjunctions and
            // articles onto the word: «ولخّص» is «and summarise», and a strict
            // letter-boundary rejected it — a fix that broke «افتح ويكيبيديا
            // ولخّص عن ابن سينا» while repairing the search misroute. Both cases
            // are in the proof.
            const arWord = (...alts: string[]) => `(?<![${AR}])(?:و|ف|ول|فل|ال)?(?:${alts.join('|')})(?![${AR}])`;
            const describeIntent = new RegExp(
                `${arWord('صِ?ف', 'وصف', 'اوصف', 'أوصف', 'انظر', 'أنظر', 'شاهد', 'اطّ?لع', 'اقرأ', 'لخّ?ص', 'ملخّ?ص')}`
                + `|ماذا\\s*(ترى|يوجد|فيها?)|ما\\s*الذي\\s*(تراه|فيها?)|ما\\s*محتوى`
                + `|${arWord('من\\s*هو', 'من\\s*هي', 'ما\\s*هو', 'ما\\s*هي')}`
                + `|أخبرني\\s*(عن|بما)|اخبرني\\s*(عن|بما)`
                + `|\\bdescribe\\b|\\bsummari[sz]e\\b|what\\s*(do\\s*you\\s*)?see|what'?s\\s*on`
                + `|tell\\s*me\\s*(about|what)|\\bwho\\s*is\\b|\\bwhat\\s*is\\b`, 'i').test(probe);
            // A named well-known site counts as a site reference too, so «سجّل الدخول
            // على جيت هاب» (no URL, no literal «موقع») still routes to the ReAct agent.
            // Content sites (Wikipedia) are included so «ادخل ويكيبيديا ولخّص عن X» routes here.
            const knownSite = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|انست[غق]رام|instagram|جيميل|gmail|جوجل|قوقل|غوغل|google|لينكد\s*ان|linkedin|ريديت|reddit|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok|ويكيبيديا|wikipedia)/i.test(probe);
            const siteRef = !!urlMatch || knownSite || /(موقع|منصّ?ة|حساب|بوابة|لوحة\s*تحكم|site|website|portal|account|dashboard)/i.test(probe);
            const hasTarget = !!urlMatch || knownSite;
            const isReactTask = (loginIntent && siteRef) || (hasTarget && (actionVerb || describeIntent));
            if (isReactTask) {
                console.log(`[PlanningEngine] browser-agent (ReAct) fast-path -> "${g.slice(0, 80)}"`);
                return {
                    id: `browser_agent_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_task',
                        description: intent.goal,                 // becomes node.task for the agent
                        tool: 'browser_run',                      // excluded from direct-tool path -> runs the agent
                        agent: 'Browser',
                        input: { task: intent.goal, request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }


        if (browserWorkflowIntent && !urlMatch) {
            console.log('[PlanningEngine] explicit browser workflow -> browser_run');
            return {
                id: `browser_workflow_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_task',
                    description: intent.goal,
                    tool: 'browser_run',
                    agent: 'Browser',
                    input: { task: intent.goal, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'high', riskLevel: 'low', matchedBy: 'explicit-browser-workflow' },
            };
        }

        if (looksBrowser) {
            try {
                const c = await PlanningEngine.classifyBrowserIntent(intent.goal, context);
                if (c && c.tool) {
                    let url = c.url;
                    // "search" routes to the VISIBLE search agent (browser_search):
                    // it opens the engine, types the query into the box live, then
                    // reads the results — no results-URL needed, just the query.
                    if (c.tool === 'browser_search') {
                        const q = (c.query || c.text || '').trim();
                        if (q.length >= 2) {
                            console.log(`[PlanningEngine] AI browser router -> browser_search query="${q}"`);
                            return {
                                id: `browser_ai_${Date.now()}`,
                                goal: intent.goal,
                                steps: [{ id: 'browser_smart', description: `search: ${q}`, tool: 'browser_search', agent: 'Browser', input: { query: q, question: c.query || intent.goal, request: intent.goal }, dependsOn: [] }],
                                metadata: { complexity: 'medium', riskLevel: 'low' },
                            };
                        }
                    }
                    if (!url && urlMatch) url = urlMatch[0];
                    // The classifier is a free LLM and DOES hallucinate the "url"
                    // field: it returned the Arabic word «الريبو» (Chromium then
                    // punycoded it to https://xn--mgbc0a5ewak/ and hung 30s) and
                    // even the tool's own name. Only accept something that really
                    // looks like a web address; otherwise drop it and let the
                    // deterministic paths below decide.
                    if (url && !isLikelyUrl(url)) {
                        console.warn(`[PlanningEngine] AI browser router returned a non-URL target ("${url}") — ignoring it.`);
                        url = '';
                    }
                    const input: any = { url: url || '', request: intent.goal, question: c.query || intent.goal };
                    if (c.tool === 'browser_click' && c.text) input.text = c.text;
                    if (c.tool === 'browser_find_text') input.query = c.query || c.text || '';
                    if (c.tool === 'browser_translate' && c.lang) input.target = c.lang;
                    // Tools other than launch/search need a real URL; if we
                    // don't have one, fall through to the deterministic paths.
                    const hasUsableTarget = !!url || c.tool === 'browser_launch';
                    if (hasUsableTarget) {
                        console.log(`[PlanningEngine] AI browser router -> ${c.tool} (action=${c.action}) url=${url || '(default)'}`);
                        return {
                            id: `browser_ai_${Date.now()}`,
                            goal: intent.goal,
                            steps: [{ id: 'browser_smart', description: `${c.tool} (${c.action})`, tool: c.tool, agent: 'Browser', input, dependsOn: [] }],
                            metadata: { complexity: 'medium', riskLevel: 'low' },
                        };
                    }
                }
            } catch (e) {
                console.warn('[PlanningEngine] AI browser router failed, using keyword fallback:', (e as any)?.message || e);
            }
        }

        const summarizeIntent = /(لخّ?ص|تلخيص|summari[sz]e|اقرأ\s*الصفحة|ما\s*مضمون)/i.test(probe);
        const auditIntent = /(دقّ?ق|تدقيق|افحص\s*الواجهة|audit|فحص\s*ui|راجع\s*التصميم|مشاكل\s*الواجهة|accessib)/i.test(probe);
        const extractIntent = /(استخرج|استخراج|extract|جدول|قائمة|csv|بيانات\s*الصفحة)/i.test(probe);
        const linksIntent = /(روابط\s*مكسور|مكسور|broken\s*links|فحص\s*الروابط|check\s*links)/i.test(probe);
        const perfIntent = /(أداء|السرعة|سرعة\s*الصفحة|performance|speed|زمن\s*التحميل)/i.test(probe);
        const seoIntent = /(seo|سيو|تحسين\s*محركات|meta\s*tags|الوسوم)/i.test(probe);
        const compareIntent = /(قارن|مقارنة|before\s*\/?\s*after|قبل\s*وبعد|قبل\/بعد)/i.test(probe);
        const consoleIntent = /(أخطاء|errors?|console|كونسول|جافا\s*سكربت|javascript|أعطال)/i.test(probe);
        const pdfIntent = /(pdf|احفظ.*صفحة|صدّ?ر.*صفحة|export\s*pdf|save\s*pdf)/i.test(probe);
        const readIntent = /(المقال|اقرأ\s*المقال|readab|article|نص\s*المقال|محتوى\s*نظيف)/i.test(probe);
        const contrastIntent = /(تباين|contrast|ألوان\s*الوصول|wcag)/i.test(probe);
        const a11yIntent = /(وصولية|accessib|a11y|aria|قارئ\s*الشاشة|لوحة\s*المفاتيح)/i.test(probe);
        const metaIntent = /(بيانات\s*وصفية|metadata|meta\s*tags|structured\s*data|json-?ld|الوسوم\s*الوصفية)/i.test(probe);
        const translateIntent = /(ترجم|ترجمة|translate|translation|بالعربية|to\s*(english|arabic|french))/i.test(probe);
        const responsiveIntent = /(تجاوب|responsive|الجوال|موبايل|mobile\s*view|أحجام\s*الشاشات|شاشات|breakpoints?)/i.test(probe);
        const findIntent = /(ابحث\s*عن|جد\s|find\s|أين\s*ورد|كم\s*مرة|highlight|ظلّل|علّم)/i.test(probe);
        const designIntent = /(نظام\s*التصميم|الألوان|ألوان\s*الصفحة|design\s*tokens?|palette|لوحة\s*ألوان|الخطوط\s*المستخدمة|typography)/i.test(probe);
        const clickIntent = /(انقر|اضغط|click|press|فعّل\s*الزر|اضغط\s*على)/i.test(probe);
        const fullshotIntent = /(لقطة\s*كاملة|screenshot\s*كامل|full\s*page|صورة\s*كاملة|كامل\s*الصفحة|طويلة)/i.test(probe);
        const agentIntent = /(تحليل\s*شامل|تقرير\s*شامل|حلّ?ل\s*الصفحة\s*بالكامل|وكيل\s*ذكي|smart\s*agent|full\s*analysis|analyze\s*(the\s*)?page|فحص\s*شامل|كل\s*شيء\s*عن\s*الصفحة)/i.test(probe);
        const autofixIntent = /(أصلح|اصلح|إصلاح\s*تلقائي|autofix|auto-?fix|صحّح\s*الصفحة|رقّع|عالج\s*المشاكل|fix\s*(the\s*)?(page|issues))/i.test(probe);
        // A page-title request is not a text search inside an already-open page.
        // Decide it before the smart-tool matrix, whose `findIntent` otherwise sees
        // «عنوان» and selects browser_find_text before there is a document to search.
        const explicitOpen = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(probe);
        const titleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
        const pageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
        if (urlMatch && explicitOpen && (titleOnly || !pageWork)) {
            const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
            console.log(`[PlanningEngine] explicit URL open -> browser_launch ${url}`);
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: titleOnly ? `افتح ${url} وأعد عنوان الصفحة` : `افتح ${url}`,
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low' },
            };
        }
        if (urlMatch && (autofixIntent || agentIntent || summarizeIntent || auditIntent || extractIntent || linksIntent || perfIntent || seoIntent || compareIntent || consoleIntent || pdfIntent || readIntent || contrastIntent || a11yIntent || metaIntent || translateIntent || responsiveIntent || findIntent || designIntent || clickIntent || fullshotIntent)) {
            // «أصلح واجهة https://…» — a page Joe does NOT own gets the CSS
            // patch tool, not the generic autofix: it measures, applies live,
            // measures again, and hands over a file instead of claiming it
            // changed a server it cannot write to.
            const uiRepairIntent = /(أصلح|اصلح|صلّح|حسّن|حسن|عالج|fix|repair|improve)/i.test(probe)
                && /(الواجهة|التصميم|\bui\b|\bux\b|css|التباين|contrast|التجاوب|responsive|الجوال|mobile|الوصولية|accessibility)/i.test(probe);
            const tool = uiRepairIntent ? 'browser_page_fix'
                : autofixIntent ? 'browser_autofix'
                : agentIntent ? 'browser_smart_agent'
                : clickIntent ? 'browser_click'
                : fullshotIntent ? 'browser_fullpage_shot'
                : designIntent ? 'browser_design_tokens'
                : findIntent ? 'browser_find_text'
                : responsiveIntent ? 'browser_responsive_check'
                : translateIntent ? 'browser_translate'
                : metaIntent ? 'browser_extract_meta'
                : a11yIntent ? 'browser_a11y_deep'
                : contrastIntent ? 'browser_contrast_audit'
                : readIntent ? 'browser_readability'
                : pdfIntent ? 'browser_save_pdf'
                : consoleIntent ? 'browser_console_scan'
                : compareIntent ? 'browser_compare'
                : linksIntent ? 'browser_check_links'
                : perfIntent ? 'browser_performance'
                : seoIntent ? 'browser_seo_audit'
                : extractIntent ? 'browser_extract_data'
                : auditIntent ? 'browser_ui_audit'
                : 'browser_summarize';
            const urls = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/ig) || [urlMatch[0]];
            const smartInput: any = { url: urlMatch[0], question: intent.goal, request: intent.goal };
            if (tool === 'browser_compare' && urls.length >= 2) { smartInput.before = urls[0]; smartInput.after = urls[1]; }
            if (tool === 'browser_translate') {
                const tm = goalRaw.match(/to\s+(english|arabic|french|spanish|german|turkish)|إلى\s*(الإنجليزية|الانجليزية|العربية|الفرنسية)/i);
                if (tm) smartInput.target = (tm[1] || tm[2] || '').toLowerCase();
            }
            if (tool === 'browser_find_text') {
                // pull the search term: quoted text, or the words after "find"/"ابحث عن"
                const qm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:ابحث\s*عن|جد|find|search\s*for)\s+([^\s].{0,60})/i);
                if (qm) smartInput.query = String(qm[1]).replace(/\s+(في|على|بالصفح[ةه]|in|on)(?![\p{L}\p{N}_]).*$/iu, '').trim();
            }
            if (tool === 'browser_click') {
                // pull the button/link label: quoted text, or the words after "click"/"انقر"
                const cm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:انقر\s*(?:على)?|اضغط\s*(?:على)?|click|press)\s+([^\s].{0,50})/i);
                if (cm) smartInput.text = String(cm[1]).replace(/\s+(في|على\s*الصفح[ةه]|زر|in|on|the\s*button)(?![\p{L}\p{N}_]).*$/iu, '').trim();
            }
            return {
                id: `browser_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_smart',
                    description: `${tool} on ${urlMatch[0]}`,
                    tool,
                    agent: 'Browser',
                    input: smartInput,
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [WEB SEARCH FAST-PATH] "ابحث عن X" / "search for X" -> actually SEARCH
        // (navigate to Google results for X) instead of just opening a blank Google.
        // Previously a search fell to the failover which opened the browser on the
        // homepage and did nothing.
        // NOTE: match the verb even with an attached "و" (and) prefix — e.g.
        // "افتح المتصفح وابحث عن X". The old (^|\s) anchor missed "وابحث", so the
        // request fell to the plain open-browser path and only showed Google.
        const searchIntent = PlanningEngine.hasSearchIntent(probe);
        /**
         *  A DOOR CLOSED IS NOT A WALL.
         *
         *  The search-priority gate above asks looksBrowser first, and
         *  looksBrowser now refuses a build. This branch asks nothing but the
         *  verb — so his clinic brief walked straight past the closed door and
         *  through this one, and Joe typed «المريض باسمه أو تلفونه» into a
         *  search engine anyway. Measured directly on the planner, twice: the
         *  first fix moved nothing.
         *
         *  A defect fixed at one router is not fixed. Same property, stated
         *  here too: what he describes building is not what he asked Joe to
         *  search for.
         */
        if (searchIntent && !urlMatch && !buildVerb) {
            // Extract the CLEAN topic from the user's own words (shared helper —
            // same logic used by the search-priority path above).
            const query = PlanningEngine.extractSearchQuery(goalRaw) || PlanningEngine.extractSearchQuery(goalNorm);
            if (query.length >= 2) {
                // Route to browser_search: it opens the engine, moves the cursor to
                // the search box, types the query LETTER-BY-LETTER in the live stream,
                // presses Enter, then reads and answers from the results — the human,
                // visible way (instead of silently jumping to a results URL).
                return {
                    id: `browser_search_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_smart',
                        description: `Search (live typing): ${query}`,
                        tool: 'browser_search',
                        agent: 'Browser',
                        input: { query, question: query, request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' }
                };
            }
        }

        // [OPEN BROWSER FAST-PATH] "open the browser", "go to <url>", "visit <site>".
        // This must be deterministic: a bare "افتح المتصفح" has no URL, so it would
        // otherwise fall through to the LLM DAG planner (which on weak free models
        // returns malformed JSON and invents non-existent tools). Route it straight
        // to browser_open, which navigates the LIVE-streamed session so the user
        // actually watches the page load.
        const openBrowserIntent = /(افتح|شغّ?ل|شغل|ادخل|روح|اذهب|استخدم|جرّ?ب|شوف|اعرض)\s*(لي\s*)?(ال)?(متصفح|براوزر|المتصفّح)|open\s*(the\s*)?browser|launch\s*browser|use\s*(the\s*)?browser|شغّ?ل\s*المتصفح/i.test(probe);
        const navigateIntent = /(?:(?:اذهب|روح)\s*(?:(?:إلى|الى)(?![\p{L}\p{N}_])|ل(?=\p{L}))|(?:افتح(?:\s+(?:موقع|رابط|صفح[ةه]|الموقع))?|زر\s+(?:الموقع|الرابط)|ادخل\s+(?:موقع|على)|تصفّ?ح|عايِ?ن|افحص\s+الموقع)(?![\p{L}\p{N}_])|(?:go\s*to|navigate\s*(?:to)?|visit|browse|open)\b)/iu.test(probe);
        const browserWord = /(متصفح|براوزر|browser|الويب(?![\p{L}\p{N}_])|صفح[ةه]\s*الويب|الموقع|website|web\s*page)/iu.test(probe);
        // Route to the live browser when: an explicit open/use-browser phrasing is
        // present; OR a URL is mentioned with any navigate/browser cue; OR the
        // intent analyser already decided this is a Browser task. Deterministic so
        // it never falls into the weak-model DAG planner.
        if (openBrowserIntent
            || (urlMatch && (navigateIntent || browserWord))
            || (urlMatch && String(intent.suggestedAgent || '') === 'Browser')) {
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: urlMatch ? `Open browser at ${urlMatch[0]}` : 'Open the live browser',
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url: urlMatch ? urlMatch[0] : '', request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        // (The [ATTACHMENTS ARE THE SUBJECT] guard now runs at the TOP of this
        // method, before every keyword fast-path — see above. It used to live
        // here and the browser+file compound path beat it to the goal.)

        // [SEMANTIC ROUTER] Every keyword path above has missed. Rather than hand
        // the request to the generic DAG planner — which is what produced six
        // English steps and a web search when the user asked for nicer colours —
        // ask the model what was actually meant. Deterministic paths already had
        // their chance, so this costs nothing on the requests they handle.
        if (String(intent.goal || '').trim().length >= 6) {
            const routed = await PlanningEngine.classifyRequestIntent(intent.goal, { hasActivePage }, context);
            if (routed) {
                console.log(`[PlanningEngine] semantic router -> ${routed.intent}${routed.repo ? ` (${routed.repo})` : ''}`);
                // THE SESSION'S ACTIVE ARTIFACT DECIDES WHO EDITS IT. Measured
                // in the field: right after a real React maps app was built,
                // «اريد اعديل علىيه بان يعمل مسارات للتنقل» reached this router,
                // came back as edit_page, and web_page_builder produced a
                // BROCHURE about maps — pricing plans and a stock photograph —
                // while the app itself was never opened. A project session's
                // edits belong to the project editor, always.
                {
                    const pageEntry = (global as any).joePages?.[activeKey];
                    const projEntry = (global as any).joeProjects?.[activeKey];
                    const projectIsActive = !!projEntry
                        && (!pageEntry || (Number(projEntry.updatedAt) || 0) > (Number(pageEntry.updatedAt) || 0));
                    if (projectIsActive && routed.intent === 'edit_page') {
                        return PlanningEngine.projectEditPlan(intent, context, 'semantic edit intent for the active project');
                    }
                    // …and a BUILD that only got this far is still scoped: an
                    // application must not become a document because the
                    // keyword paths missed it.
                    if (routed.intent === 'build_page') {
                        const scope = PlanningEngine.classifyBuildScope(probe);
                        if (scope !== 'page' || requestedArtifact(probe).kind === 'cli') {
                            // A semantic classification can identify that this is
                            // more than a page, but it cannot prescribe a stack.
                            // The evidence-first pipeline chooses and proves the
                            // implementation from the workspace and requirements.
                            console.log(`[PlanningEngine] semantic engineering scope = ${scope} -> project_pipeline`);
                            return {
                                id: `engineering_${scope}_${Date.now()}`,
                                goal: intent.goal,
                                steps: [{
                                    id: 'project_pipeline',
                                    description: `استكشف السياق ثم خطط ونفّذ الطلب الهندسي بأدلة واختبارات: ${intent.goal}`,
                                    tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                                }],
                                metadata: { complexity: 'high', riskLevel: 'medium' },
                            };
                        }
                    }
                }
                if (routed.intent === 'build_page' || routed.intent === 'edit_page') {
                    // Same split as the deterministic branch: an EDIT keeps the
                    // page editor; a NEW page-scope build belongs to the
                    // deterministic React engine — directives, QA and repairs
                    // included, model or no model.
                    return {
                        id: `build_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'build_page',
                            description: `Building: ${intent.goal}`,
                            tool: routed.intent === 'edit_page' ? 'web_page_builder' : 'react_project',
                            agent: 'Dev',
                            input: { request: intent.goal },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'medium', riskLevel: 'low' }
                    };
                }
                if (routed.intent === 'analyze_repo') {
                    return {
                        id: `repo_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'repo_analyze',
                            description: routed.repo ? `تحليل المستودع ${routed.repo}` : 'تحليل المستودع المتصل',
                            tool: 'github_repo_manager',
                            agent: 'General',
                            input: { action: 'analyze', ...(routed.repo ? { repoName: routed.repo } : {}) },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'medium', riskLevel: 'low' }
                    };
                }
                if (routed.intent === 'answer') {
                    return {
                        id: `chat_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'direct_response',
                            description: `Answering: ${intent.goal}`,
                            tool: 'central_answer',
                            agent: 'General',
                            input: { question: intent.goal },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'low', riskLevel: 'low' }
                    };
                }
            }
        }

        /**
         *  A SHORT ORDER IS STILL AN ORDER.
         *
         *  Live round on his machine. He built a book table, then wrote,
         *  in the same chat:
         *
         *      «زيد عمود المؤلف»
         *
         *  and Joe's own log says what happened:
         *
         *      21:01:32  🗂️ Recalled your project context from memory
         *      21:01:37  ▶ central_answer
         *      21:01:40  «Let's elevate your book table with an author
         *                 column—a premium feature…»
         *
         *  It recalled the project and then TALKED about the column. The
         *  column was never added: «المؤلف» appears zero times in the
         *  source and zero times in the 151-line session log.
         *
         *  The reason is the third clause below: `goal.length < 30`. His
         *  sentence is fifteen characters. LENGTH IS NOT INTENT — every
         *  short imperative he can type («غيّر اللون», «احذف العمود»,
         *  «زيد عموداً») was routed to chat because it was short.
         *
         *  So the shortcut may not fire on text that a parser already
         *  recognises as a concrete instruction. columnEdit is one such
         *  parser — measured: «زيد عمود المؤلف» → {add:['المؤلف']} — and
         *  any future parser belongs in this same test rather than in a
         *  list of verbs.
         */
        let readsAsAnOrder = false;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { columnEdit } = require('../design/app-blueprints');
            const edit = columnEdit(intent.goal);
            readsAsAnOrder = (edit?.add?.length || 0) > 0 || (edit?.remove?.length || 0) > 0;
        } catch { readsAsAnOrder = false; }

        /**
         *  THE THING IN FRONT OF HIM DECIDES WHAT HIS WORD MEANS.
         *
         *  Live round, straight after the fast path stopped sending short
         *  orders to chat. He had a React book table on screen and typed
         *  «زيد عمود المؤلف». Joe took it as an order this time — and then
         *  went looking for a DATABASE:
         *
         *      exec=sqlite3 books.db 'CREATE TABLE IF NOT EXISTS books (…'
         *      ERROR: 'sqlite3' is not recognized as an internal command
         *      Stopped at step «Check if SQLite is installed on the system»
         *
         *  «عمود» is a column in a rendered table and a column in SQL, and
         *  the word alone cannot say which. This is the Arabic trap the
         *  contract names — «جدول» is a table and a schedule, «قائمة» is a
         *  list and a menu — and the cure is never a longer word list. It
         *  is CONTEXT: the man has a project open, its type is on record,
         *  and a column added to what he is looking at is an edit of that
         *  project. Nothing here reads the words «sqlite» or «react»; it
         *  reads whether something of his is open.
         *
         *  If no project is open the request keeps its old road, because
         *  then «add a column» really might be about a database.
         */
        if (readsAsAnOrder) {
            const sid = String((context as any)?.sessionId || (intent as any)?.context?.sessionId || (intent as any)?.sessionId || '');
            const open = ((global as any).joeProjects || {})[sid];
            if (open?.dir && open?.type !== 'api') {
                console.log(`[PlanningEngine] a column order with a project open → project_edit (${open.type})`);
                return PlanningEngine.projectEditPlan(intent, context, 'a column requested on the active project');
            }
        }

        /**
         * BEFORE THE SHORT-CHAT FALLBACK — ASK THE TOOLS WHAT THEY ARE FOR.
         *
         * A request can be short and still be an imperative. Letting the
         * length-based chat fallback run first turned "فحص أمني للموقع" into
         * a slow local-model answer even after the parser had identified the
         * security capability. capabilityPlan revalidates the registry match
         * and rejects knowledge questions, so it is the general boundary
         * between a real tool order and chat, not a prompt-specific shortcut.
         */
        const byCapability = PlanningEngine.capabilityPlan(intent, context);
        if (byCapability) return byCapability;

        // [ELITE FAST-PATH] Direct answer for general questions or chat
        if (!readsAsAnOrder && ((intent as any).type === 'general' || (intent as any).type === 'chat' || intent.goal.length < 30)) {
            return {
                id: `chat_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'direct_response',
                    description: `Answering: ${intent.goal}`,
                    tool: 'central_answer',
                    agent: 'General',
                    input: { question: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        return PlanningEngine.generateDynamicDag(intent, memory, context);
    }

    /**
     * The real planner: an LLM-generated execution DAG. Reached two ways —
     * a genuine goal that no fast-path claimed, or a RECOVERY goal that was
     * deliberately routed here past every fast-path (a repair must be planned
     * from the error, never keyword-matched back into the step that failed).
     */
    private static async generateDynamicDag(intent: StructuredIntent, memory: any, context?: any): Promise<ExecutionPlan> {
        console.log(`[PlanningEngine] Generating ADAPTIVE DAG for: ${intent.goal}`);
        const ANSWER_ONLY_TOOLS = PlanningEngine.ANSWER_ONLY;
        const looksLikeBuildRequest = PlanningEngine.looksLikeBuild;

        const isRecovery = /^fix and continue:/i.test(String(intent.goal || '').trim());

        // Use adaptive planner for multi-attempt, parallel-aware planning
        const attempts = await generatePlanAttempts(intent, memory, context || {}, {
            maxAttempts: isRecovery ? 3 : 2,
            enableParallelDetection: true,
            enableFailureDiagnosis: isRecovery,
            entropySeed: Math.random().toString(36).substring(7)
        });

        const bestAttempt = selectBestPlan(attempts);
        if (bestAttempt && bestAttempt.steps.length > 0) {
            const validation = validatePlan(bestAttempt.steps, intent);
            if (validation.valid) {
                const parallelGroups = detectParallelGroups(bestAttempt.steps);
                const stepsWithParallel = bestAttempt.steps.map(step => ({
                    ...step,
                    parallel: parallelGroups.some(g => g.stepIds.includes(step.id))
                }));

                console.log(`[PlanningEngine] Adaptive DAG generated: ${stepsWithParallel.length} steps, ${parallelGroups.length} parallel groups, confidence: ${bestAttempt.confidence}`);
                return {
                    id: `dag_${Date.now()}`,
                    goal: intent.goal,
                    steps: stepsWithParallel,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel,
                        parallelGroups: parallelGroups.length,
                        adaptiveAttempts: attempts.length,
                        confidence: bestAttempt.confidence
                    }
                };
            } else {
                console.warn(`[PlanningEngine] Best plan validation failed: ${validation.issues.join(', ')}`);
            }
        }

        // Fallback to single-attempt if adaptive planner fails
        console.warn('[PlanningEngine] Adaptive planner failed, falling back to single attempt');
        // Compacted, never raw: one completed page-builder node used to drag an
        // entire HTML page into this prompt and the planning call itself died on
        // free-tier token limits — turning every recovery into the failover node.
        const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(compactHistoryForPrompt(memory))}` : "";
        // A recovery that reaches this fallback is still a recovery: the same
        // rules as the adaptive prompt, from the same text.
        const recoveryRules = isRecovery ? `\n${FAILURE_RECOVERY_RULES}` : '';
        const fallbackEntropySeed = Math.random().toString(36).substring(7);
        const fallbackSystemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${fallbackEntropySeed} (Use this to explore different optimal paths if possible)

Constraints:
- Use ONLY tools from THIS catalogue (name(args) — purpose). An argument ending with ? is optional:
${catalogueFor(intent.goal)}
- If nothing in the catalogue fits, use central_answer(question) — never invent a tool name.
- Define explicit dependencies (dependsOn).
- DATA FLOW: when a step needs what an earlier step PRODUCED, put {{FROM:<that step's id>}} inside its input where the data belongs — it is replaced with that step's real output at run time. Describing the data instead ("the results from step 1") passes nothing. Example: [{"id":"scan","tool":"link_checker",...},{"id":"report","tool":"write_file","input":{"path":"report.md","content":"# تقرير — {{FROM:scan}}"},"dependsOn":["scan"]}]
- Any id you write inside {{FROM:...}} MUST also appear in that step's dependsOn.
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.${recoveryRules}

Goal: ${intent.goal}
Complexity: ${intent.complexity}
Risk: ${intent.riskLevel}${historyContext}

Return ONLY a JSON array of steps:
[
  {
    "id": "node_id",
    "task": "precise task description",
    "tool": "tool_name",
    "agent": "agent_type",
    "input": { "instruction": "..." },
    "dependsOn": ["prev_node_id"],
    "parallel": true|false,
    "reasoning": "why this step and why this position"
  }
]`;

        try {
            // Using routeToModel for planning
            const response = await routeToModel([
                { role: 'system', content: fallbackSystemPrompt },
                { role: 'user', content: `Analyze goal and generate DAG for: ${intent.goal}` }
            ], undefined, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' });

            const rawSteps = PlanningEngine.parseJsonArrayLoose(response);
            if (rawSteps) {
                const steps: ExecutionStep[] = PlanningEngine.sanitizeSteps((Array.isArray(rawSteps) ? rawSteps : []).map((step: any) => ({
                    id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
                    description: String(step.description || step.task || step.task_description || `Execute task`),
                    tool: String(step.tool || 'shell_execute'),
                    agent: String(step.agent || 'General'),
                    input: step.input || {},
                    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [],
                    parallel: step.parallel === true,
                    reasoning: step.reasoning || ''
                })), String(intent.goal || ''), context);

                /**
                 * A REQUEST TO BUILD IS NOT ANSWERED BY TALKING ABOUT BUILDING.
                 *
                 * His run, verbatim, against «Build a world-class e-commerce
                 * platform … Generate complete production-ready code»:
                 *
                 *     Executing node: define_project_structure   → central_answer
                 *     Executing node: generate_auth_system       → central_answer
                 *     Executing node: create_multi_vendor_marketplace → central_answer
                 *     «Good evening, Younes. As we embark on building …»
                 *
                 * Fifteen nodes, six essays, and not one file on disk. Worse,
                 * an essay always "succeeds", so the failed step's repair got
                 * stamped as a PROVEN cure and replayed on the next unrelated
                 * error («proven 2x» in his log).
                 *
                 * A plan that answers a BUILD with nothing but answering tools
                 * is not a plan. It is refused here, and the deterministic
                 * builders take the request instead.
                 */
                const talkOnly = steps.length > 0 && steps.every((st: any) =>
                    ANSWER_ONLY_TOOLS.has(String(st.tool || '')));
                if (talkOnly && looksLikeBuildRequest(String(intent.goal || ''))) {
                    console.warn(`[PlanningEngine] the model planned ${steps.length} talking step(s) for a BUILD — refusing invented construction.`);
                    const scope = PlanningEngine.classifyBuildScope(String(intent.goal || ''));
                    if (scope === 'page' && requestedArtifact(String(intent.goal || '')).kind !== 'cli') {
                        return {
                            id: `build_page_rescue_${Date.now()}`,
                            goal: intent.goal,
                            steps: [{ id: 'build_page', description: `بناء الموقع بمحرك React الحتمي: ${intent.goal}`, tool: 'react_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                            metadata: { complexity: 'medium', riskLevel: 'low' },
                        };
                    }
                    return {
                        id: `engineering_rescue_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'project_pipeline',
                            description: `استكشف السياق ثم خطط ونفّذ طلب البناء بأدلة واختبارات: ${intent.goal}`,
                            tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                        }],
                        metadata: { complexity: 'high', riskLevel: 'medium' },
                    };
                }

                return {
                    id: `dag_${Date.now()}`,
                    goal: intent.goal,
                    steps,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel
                    }
                };
            }
        } catch (err) {
            console.error('[PlanningEngine] Dynamic DAG generation failed:', err);
        }

        /**
         * A BUILD MUST NOT DIE BECAUSE A PLANNER RAN OUT OF QUOTA.
         *
         * From his log, in full: the DAG planner reached Groq, Groq answered
         * «429 … tokens per day (TPD): Limit 100000, Used 100000», every
         * keyless provider was dead (401/418/402), the local brain had timed
         * out — and a request to BUILD A SYSTEM ended with «تعذّر الوصول إلى
         * محرّك الذكاء». Nothing in that build needed a model: the scaffolder,
         * the database, the CRUD, the screens and the self-QA are all
         * deterministic. Only the ROUTE to them went through an LLM.
         *
         * So when planning fails and the goal is a build, the builders take it.
         * This is the same rescue the talk-only plan already gets — it just has
         * to survive the planner being unreachable, not merely wrong.
         */
        if (looksLikeBuildRequest(String(intent.goal || ''))) {
            console.warn('[PlanningEngine] the planner was unreachable for a BUILD — routing systems to evidence-first planning, never an invented stack.');
            const scope = PlanningEngine.classifyBuildScope(String(intent.goal || ''));
            if (scope === 'page' && requestedArtifact(String(intent.goal || '')).kind !== 'cli') {
                return {
                    id: `build_page_offline_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'build_page', description: `بناء الموقع بمحرك React الحتمي: ${intent.goal}`, tool: 'react_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
            return {
                id: `engineering_offline_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'project_pipeline',
                    description: `استكشف السياق ثم خطط ونفّذ طلب البناء بأدلة واختبارات: ${intent.goal}`,
                    tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                }],
                metadata: { complexity: 'high', riskLevel: 'medium' },
            };
        }

        // Emergency Fallback (Dynamic but minimal)
        console.warn(`[PlanningEngine] Using failover node for: ${intent.goal}`);
        const fallbackUrl = String(intent.goal || '').match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
        // A planner failure must not reinterpret an engineering build as a browser
        // visit just because upstream intent analysis was unavailable or imprecise.
        // URLs remain explicit browser evidence; otherwise a browser fallback is
        // permitted only for a non-build request.
        const isBrowserFallback = !!fallbackUrl || (
            !looksLikeBuildRequest(String(intent.goal || '')) && (
                intent.suggestedAgent === 'Browser'
                || Boolean(intent.requiredTools && intent.requiredTools.includes('browser_run'))
            )
        );
        // For browser intents, open the live browser deterministically instead of
        // the generic browser_run (which needs explicit actions and otherwise dies
        // with "actions_or_instruction_required" -> "Recovery failed").
        return {
            id: `failover_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: isBrowserFallback ? 'browser_open' : 'recovery_node',
                description: `Respond to: ${intent.goal}`,
                tool: isBrowserFallback ? 'browser_launch' : 'central_answer',
                agent: isBrowserFallback ? 'Browser' : (intent.suggestedAgent || 'General'),
                input: isBrowserFallback ? { url: fallbackUrl ? fallbackUrl[0] : '', request: intent.goal } : { question: intent.goal },
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }

    /**
     * TOLERANT JSON. The field log: «Dynamic DAG generation failed:
     * SyntaxError: Expected ',' or '}' after property value at position
     * 1306» — one bad character from a weak model threw away an otherwise
     * valid 5-node plan and dropped the run into the failover node. The
     * repairs and the salvage live in the shared reader (shared/utils/json),
     * which the adaptive planner reads through too: one reader, so a reply
     * one planner can read the other can as well.
     */
    static parseJsonArrayLoose(text: string): any[] | null {
        return parseModelJsonArray(text, kept =>
            console.warn(`[PlanningEngine] JSON was broken — salvaged ${kept} valid node(s) instead of failing over.`));
    }

    /**
     * PLAN SANITY. The field log again, verbatim: «Node node_3 failed:
     * central_answer was called without a question», «Node node_4 failed:
     * filename or path is required» — the model planned tool calls with
     * empty inputs and each one became a user-visible failure plus a
     * recovery cycle. Every step now leaves planning with the inputs its
     * tool cannot run without.
     */
    static sanitizeSteps<T extends { tool: string; description: string; input: any }>(steps: T[], goal: string, context?: any): T[] {
        const userGoal = goal.split(/(?<!\n)\n+\[(?:ATTACHED FILES|STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|RESPONSE LANGUAGE)/)[0].trim();
        // A planner is now shown a REAL catalogue, so a name outside it is a
        // hallucination rather than a gap. An unknown name used to travel all
        // the way to the executor and come back as «tool not found», which the
        // recovery loop then tried to plan around. It is turned into an honest
        // answer here instead — once, at the source.
        const known = new Set(registeredToolNames());
        const { TOOL_ALIASES } = require('../../modules/services/ToolService');
        for (const s of steps) {
            const name = String(s.tool || '').trim();
            if (known.has(name)) continue;
            const viaAlias = TOOL_ALIASES?.[name];
            if (viaAlias && known.has(viaAlias)) { s.tool = viaAlias; continue; }
            console.warn(`[PlanningEngine] planner named an unknown tool «${name}» — answering instead of pretending`);
            s.tool = 'central_answer';
            s.input = { question: s.description || userGoal };
        }
        for (const s of steps) {
            s.input = s.input && typeof s.input === 'object' ? s.input : {};
            const t = String(s.tool || '');
            if (t === 'central_answer' && !String(s.input.question || '').trim()) {
                s.input.question = s.description && s.description !== 'Execute task'
                    ? `${s.description}\n\n(السياق الكامل للطلب): ${userGoal}` : userGoal;
            }
            if ((t === 'browser_run' || t === 'browser_launch') && !String(s.input.task || s.input.url || s.input.instructionText || '').trim()) {
                s.input.task = s.description || userGoal;
            }
            if (t === 'write_file' && !String(s.input.path || s.input.filename || '').trim()) {
                s.input.path = `joe-output-${Date.now()}.txt`;
            }
            if (!s.input.request) s.input.request = userGoal;
        }
        return PlanningEngine.wireDataFlow(PlanningEngine.fillRequiredArgs(steps as any, userGoal, context) as any) as any;
    }

    /**
     * THE MIND MAY NOT SCHEDULE WORK THE TOOLS CANNOT BE FED.
     *
     * 132 of the 151 tools declare required arguments. The sanitiser filled
     * exactly three of them by hand, so for everything else a step that named
     * the right tool and forgot its argument was scheduled anyway — and died at
     * run time with a machine word. Measured, on a sentence that CONTAINED the
     * answer:
     *
     *   «دقّق السيو في https://example.com»
     *   plan: browser_seo_audit, input {}
     *   result: ok=false, «no_url»
     *
     * The URL was in the user's own sentence. The tool was the right one. The
     * intelligence layer already knew how to fill that argument — it does it
     * for the capability router — and nobody connected the three.
     *
     * So every step is now checked against what its tool actually requires:
     *   - what the planner wrote is never overwritten;
     *   - a missing required argument is filled from the sentence, the open
     *     page, or the session's project, by the same code the router uses;
     *   - and when it truly cannot be found, the step is not scheduled to fail.
     *     It becomes a question that names what is missing, because asking is
     *     an answer and «no_url» is not.
     */
    static fillRequiredArgs<T extends { tool: string; description: string; input: any }>(steps: T[], goal: string, context?: any): T[] {
        // Arguments the RUNTIME supplies, never the planner: ToolService puts the
        // signed-in user, the workspace and the live session into every call.
        // Counting them as «missing» turned a perfectly good browser step into a
        // question asking the user for a session id — caught by the sanitizer's
        // own older test, which is why it exists.
        const RUNTIME_SUPPLIED = new Set(['sessionId', 'userId', 'workspaceId', 'context', '__userId', '__workspaceId']);
        const { tools } = require('../../modules/tools/registry');
        const byName = new Map<string, any>((tools as any[]).map(t => [t.name, t]));
        for (const s of steps) {
            const tool = byName.get(String(s.tool || ''));
            const required: string[] = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
            const requiredAny: string[][] = Array.isArray(tool?.inputSchema?.requiredAny)
                ? tool.inputSchema.requiredAny.filter((group: any) => Array.isArray(group) && group.length).map((group: any[]) => group.map(String))
                : [];
            if (!required.length && !requiredAny.length) continue;
            s.input = s.input && typeof s.input === 'object' ? s.input : {};

            // Repair omitted project evidence before the generic URL/text filler.
            // The helper only uses the active session project inside the trusted
            // workspace; it never invents a path or a test harness.
            /**
             *  A DESCRIPTION STAPLED TO THE THING IT DESCRIBES.
             *
             *  Read out of a live run's own evidence file:
             *
             *      "tool": "project_edit",
             *      "input": { "request": "Surgical edit of the active
             *        project: زيد عمود الملاحظات زيد عمود الملاحظات" }
             *
             *  His message was eighteen characters, read straight out of
             *  the chat store. Every step here is described as «Surgical
             *  edit of the active project: ${intent.goal}» — the goal is
             *  already IN the description — and this line then joins the
             *  description to the goal again.
             *
             *  Downstream, columnEdit read «عمود الملاحظات زيد عمود
             *  الملاحظات» and named his new column after the whole order.
             *
             *  A description that already carries the goal adds nothing
             *  by being repeated. One or the other — never both.
             */
            const said = String(s.description || '').trim();
            const forFilling = said && goal && said.includes(goal) ? said : `${said} ${goal}`.trim();
            s.input = enrichWorkspaceToolInput(String(s.tool || ''), s.input, forFilling, context);

            const hasValue = (key: string) => {
                if (RUNTIME_SUPPLIED.has(key)) return true;
                const v = (s.input as any)[key];
                if (v === undefined || v === null) return false;
                // An explicitly declared empty string is data (for example an
                // edit that removes text). Omitted values are still missing.
                if (typeof v === 'string' && !v.trim() && tool?.inputSchema?.properties?.[key]?.minLength !== 0) return false;
                if (Array.isArray(v) && !v.length) return false;
                return true;
            };
            const missing = () => required.filter(r => !hasValue(r));
            const missingAny = () => requiredAny.filter(group => !group.some(hasValue));
            if (!missing().length && !missingAny().length) continue;

            // The router's own filler: a URL from the sentence or the open page,
            // the goal for a question/query/instruction. For one-of groups copy
            // only the first alias it can derive, preserving any alias already
            // supplied by the planner.
            try {
                const filled = inputForTool(tool, forFilling, context);
                if (filled) {
                    for (const k of missing()) if (filled[k] !== undefined) (s.input as any)[k] = filled[k];
                    for (const group of missingAny()) {
                        const candidate = group.find(k => filled[k] !== undefined);
                        if (candidate) (s.input as any)[candidate] = filled[candidate];
                    }
                }
            } catch { /* the filler is a helper, never a blocker */ }

            const still = missing();
            const stillAny = missingAny();
            if (!still.length && !stillAny.length) continue;
            const missingLabels = [...still, ...stillAny.map(group => group.join(' أو '))];

            console.warn(`[PlanningEngine] «${s.tool}» needs ${missingLabels.join(', ')} and nothing in the request provides it — asking instead of failing`);
            s.tool = 'central_answer';
            s.input = {
                question: `${s.description || goal}\n\n(لأنفّذ هذه الخطوة أحتاج: ${missingLabels.join('، ')} — لم أجده في الطلب. اسأل المستخدم عنه بوضوح، بلغته، ولا تختلق قيمة.)`,
                request: goal,
            };
        }
        return steps;
    }

    /**
     * THE PLAN'S DATA FLOW — the difference between two steps and one job.
     *
     * The executor has always understood `{{FROM:<id>}}`: a placeholder inside a
     * step's input that resolves to an earlier step's OUTPUT. But the planning
     * prompt never taught it, so only two hand-written fast paths ever emitted
     * one. Every plan the model wrote carried `dependsOn` as pure ORDERING —
     * «افحص الروابط المكسورة ثم اكتب تقريراً بالنتيجة» became a scan whose
     * findings were thrown away, followed by a write_file whose content was the
     * words «تقرير بالنتائج». The second step never saw the first one's work.
     *
     * The prompt now teaches the syntax, and this pass makes the graph honest:
     *
     *   - ids are unique. `completedNodes` is a Set — two nodes sharing an id
     *     make `size < nodes.length` true forever, and the run dies on the
     *     iteration limit instead of finishing.
     *   - a dependency on a step that does not exist is dropped. It could never
     *     be satisfied: the node stays "pending", the loop sees no ready nodes,
     *     and after two replans the run ends with «Execution stopped».
     *   - a dependency that would close a cycle is dropped, for the same reason.
     *   - a `{{FROM:x}}` reference IS a dependency and is declared as one.
     *     Referencing a step without depending on it resolves the placeholder
     *     BEFORE that step runs — an empty string, silently: an empty file, an
     *     empty email. A reference to an id that does not exist at all is
     *     retargeted to the step's own first dependency, or removed.
     *   - and a step that depends on another yet never mentions it gets the
     *     producer's output carried into it. Empty content slot: filled. A short
     *     one (under 400 chars — a DESCRIPTION of the material, not the material
     *     itself): appended to, never overwritten. A long one is the payload the
     *     model authored and is left untouched.
     *
     * Idempotent by construction: the carry only fires when a step contains no
     * reference at all, so running this twice cannot append twice.
     */
    static wireDataFlow<T extends { id?: string; tool?: string; input?: any; dependsOn?: any }>(steps: T[]): T[] {
        const list = (Array.isArray(steps) ? steps : []).filter(s => s && typeof s === 'object');
        if (list.length < 2) return steps;

        const FROM = /\{\{\s*FROM:([a-zA-Z0-9_-]+)\s*\}\}/g;
        const refsIn = (v: any, out: Set<string> = new Set()): Set<string> => {
            if (typeof v === 'string') { for (const m of v.matchAll(FROM)) out.add(m[1]); }
            else if (Array.isArray(v)) v.forEach(x => refsIn(x, out));
            else if (v && typeof v === 'object') Object.values(v).forEach(x => refsIn(x, out));
            return out;
        };
        const mapStrings = (v: any, f: (s: string) => string): any => {
            if (typeof v === 'string') return f(v);
            if (Array.isArray(v)) return v.map(x => mapStrings(x, f));
            if (v && typeof v === 'object') {
                const o: any = {}; for (const k of Object.keys(v)) o[k] = mapStrings(v[k], f); return o;
            }
            return v;
        };

        // 1. Unique ids. The first holder of a name keeps it, so references
        //    written against it stay valid.
        const used = new Set<string>();
        list.forEach((s, i) => {
            let id = String(s.id ?? '').trim() || `step_${i + 1}`;
            if (used.has(id)) { let n = 2; while (used.has(`${id}_${n}`)) n++; id = `${id}_${n}`; }
            used.add(id);
            s.id = id;
        });

        // 2. Edges that can actually be scheduled: the target must exist, must
        //    not be the step itself, and must not already depend on it.
        const deps = new Map<string, string[]>(list.map(s => [String(s.id), [] as string[]]));
        const dependsTransitively = (from: string, on: string, seen = new Set<string>()): boolean => {
            if (from === on) return true;
            if (seen.has(from)) return false;
            seen.add(from);
            return (deps.get(from) || []).some(d => dependsTransitively(d, on, seen));
        };
        const addEdge = (id: string, dep: string): boolean => {
            if (!deps.has(dep) || dep === id) return false;
            const mine = deps.get(id)!;
            if (mine.includes(dep)) return true;
            if (dependsTransitively(dep, id)) return false;   // would close a cycle
            mine.push(dep);
            return true;
        };
        for (const s of list) {
            const declared = Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [];
            for (const d of declared) addEdge(String(s.id), d);
        }

        // 3. Every reference is a real, declared, ordered edge — or it goes away.
        for (const s of list) {
            const id = String(s.id);
            if (!s.input || typeof s.input !== 'object') continue;
            for (const ref of refsIn(s.input)) {
                if (deps.has(ref) && addEdge(id, ref)) continue;
                const fallback = (deps.get(id) || [])[0];
                // The id charset is [A-Za-z0-9_-] — nothing here needs escaping.
                const placeholder = new RegExp(`\\{\\{\\s*FROM:${ref}\\s*\\}\\}`, 'g');
                s.input = mapStrings(s.input, (str) => str.replace(placeholder, fallback ? `{{FROM:${fallback}}}` : ''));
                if (fallback) console.warn(`[PlanningEngine] «${id}» referenced «${ref}» which is not usable — retargeted to «${fallback}»`);
                else console.warn(`[PlanningEngine] «${id}» referenced «${ref}» which does not exist — reference removed`);
            }
        }

        // 4. The carry: a step that depends on work it never mentions.
        const CONTENT_KEYS = ['content', 'body', 'text', 'markdown', 'message'];
        for (const s of list) {
            const id = String(s.id);
            const mine = deps.get(id) || [];
            s.dependsOn = mine;
            if (!mine.length) continue;
            if (!s.input || typeof s.input !== 'object') { s.input = {}; }
            if (refsIn(s.input).size) continue;                       // the plan already says it
            const carried = mine.map(d => `{{FROM:${d}}}`).join('\n\n');

            if (String(s.tool || '') === 'central_answer') {
                const q = String(s.input.question || '').trim();
                s.input.question = `${q}\n\n[نتيجة الخطوات السابقة — اعتمد عليها]\n${carried}`.trim();
                continue;
            }
            const slot = CONTENT_KEYS.find(k => k in s.input) || (String(s.tool || '') === 'write_file' ? 'content' : null);
            if (!slot) continue;
            const existing = typeof s.input[slot] === 'string' ? s.input[slot] : '';
            if (!existing.trim()) s.input[slot] = carried;
            else if (existing.length < 400) s.input[slot] = `${existing}\n\n${carried}`;
        }

        return steps;
    }

    /**
     * Generate an execution plan from a structured specification.
     * Maps requirements → phases → tasks with full traceability.
     * Handles constraint tensions, implicit requirements, and acceptance criteria.
     */
    static generatePlanFromSpecification(
        spec: StructuredSpecification,
        context?: any
    ): ExecutionPlan {
        const phasePlans = this.mapRequirementsToPhases(spec);
        const verificationPhase = this.createSpecificationVerificationPhase(spec);

        // Flatten phase tasks into steps
        const allSteps: ExecutionStep[] = [];
        for (const phase of phasePlans) {
            for (const task of phase.tasks) {
                allSteps.push({
                    id: task.id,
                    description: task.description,
                    tool: task.tool,
                    agent: task.agent,
                    input: task.input,
                    dependsOn: task.dependsOn,
                    parallel: task.parallel,
                    reasoning: task.reasoning,
                });
            }
        }
        allSteps.push(verificationPhase);

        // Build traceability matrix
        const traceability = this.buildTraceabilityMatrix(spec, phasePlans);

        return {
            id: `spec_${spec.specificationId}`,
            goal: spec.sourceText.substring(0, 200),
            steps: allSteps,
            metadata: {
                complexity: 'extreme',
                riskLevel: 'high',
                matchedBy: 'specification-driven',
                specificationId: spec.specificationId,
                requirementTraceability: traceability,
                constraintTensions: spec.constraintInteractions,
            },
        };
    }

    /**
     * Map requirements to logical phases based on dependency analysis and constraint types.
     * Groups related requirements into phases: infrastructure, core services, features, verification.
     */
    private static mapRequirementsToPhases(spec: StructuredSpecification): PhasePlan[] {
        // Separate requirements by type and priority
        const functionalReqs = spec.requirements.filter(r => r.type === 'functional');
        const nonFunctionalReqs = spec.requirements.filter(r => r.type === 'non-functional');
        const constraintReqs = spec.requirements.filter(r => r.type === 'constraint');
        const implicitReqs = spec.implicitRequirements;

        // Group by constraint type for tension-aware ordering
        const securityConstraints = spec.constraints.filter(c => c.type === 'security');
        const performanceConstraints = spec.constraints.filter(c => c.type === 'performance');
        const availabilityConstraints = spec.constraints.filter(c => c.type === 'availability');

        const phases: PhasePlan[] = [];
        let phaseNumber = 1;

        // Phase 1: Infrastructure & Security Foundation
        if (securityConstraints.length > 0 || constraintReqs.some(r => spec.constraints.some(c => c.relatedRequirements.includes(r.id) && c.type === 'security'))) {
            const securityTasks = this.createTasksForConstraints(securityConstraints, spec, 'security_foundation');
            if (securityTasks.length > 0) {
                phases.push({
                    phaseNumber: phaseNumber++,
                    name: 'Security & Infrastructure Foundation',
                    tasks: securityTasks,
                    requirementsCovered: securityTasks.flatMap(t => t.requirementIds),
                });
            }
        }

        // Phase 2: Core Data & Storage Layer
        const dataReqs = functionalReqs.filter(r => 
            /database|storage|persist|schema|migration|data|model/i.test(r.description)
        );
        if (dataReqs.length > 0) {
            phases.push({
                phaseNumber: phaseNumber++,
                name: 'Core Data & Storage Layer',
                tasks: this.createTasksForRequirements(dataReqs, spec, 'data_layer'),
                requirementsCovered: dataReqs.map(r => r.id),
            });
        }

        // Phase 3: Business Logic & Services
        const serviceReqs = functionalReqs.filter(r => 
            /service|api|endpoint|business|logic|workflow|process/i.test(r.description)
        );
        if (serviceReqs.length > 0) {
            phases.push({
                phaseNumber: phaseNumber++,
                name: 'Business Logic & Services',
                tasks: this.createTasksForRequirements(serviceReqs, spec, 'services'),
                requirementsCovered: serviceReqs.map(r => r.id),
            });
        }

        // Phase 4: UI & Interaction Layer
        const uiReqs = functionalReqs.filter(r => 
            /ui|interface|frontend|component|page|screen|form|dashboard|display/i.test(r.description)
        );
        if (uiReqs.length > 0) {
            phases.push({
                phaseNumber: phaseNumber++,
                name: 'UI & Interaction Layer',
                tasks: this.createTasksForRequirements(uiReqs, spec, 'ui'),
                requirementsCovered: uiReqs.map(r => r.id),
            });
        }

        // Phase 5: Non-functional Requirements (Performance, Availability, etc.)
        const nfReqs = nonFunctionalReqs.length > 0 ? nonFunctionalReqs : [];
        const perfReqs = constraintReqs.filter(r => spec.constraints.some(c => c.relatedRequirements.includes(r.id) && c.type === 'performance'));
        const availReqs = constraintReqs.filter(r => spec.constraints.some(c => c.relatedRequirements.includes(r.id) && c.type === 'availability'));
        if (nfReqs.length > 0 || perfReqs.length > 0 || availReqs.length > 0) {
            const nfTasks = [
                ...this.createTasksForRequirements(nfReqs, spec, 'non_functional'),
                ...this.createTasksForConstraints(performanceConstraints, spec, 'performance'),
                ...this.createTasksForConstraints(availabilityConstraints, spec, 'availability'),
            ];
            if (nfTasks.length > 0) {
                phases.push({
                    phaseNumber: phaseNumber++,
                    name: 'Non-Functional Requirements',
                    tasks: nfTasks,
                    requirementsCovered: [...nfReqs, ...perfReqs, ...availReqs].map(r => r.id),
                });
            }
        }

        // Phase 6: Implicit Requirements (inferred but not explicitly stated)
        if (implicitReqs.length > 0) {
            phases.push({
                phaseNumber: phaseNumber++,
                name: 'Implicit Requirements & Edge Cases',
                tasks: this.createTasksForImplicitRequirements(implicitReqs, spec),
                requirementsCovered: implicitReqs.map(r => r.id),
            });
        }

        // Phase 7: Constraint Tension Resolution
        if (spec.constraintInteractions.length > 0) {
            phases.push({
                phaseNumber: phaseNumber++,
                name: 'Constraint Tension Resolution',
                tasks: this.createTasksForConstraintTensions(spec.constraintInteractions, spec),
                requirementsCovered: spec.constraintInteractions.flatMap(c => c.constraintIds),
            });
        }

        // Add verification tasks for acceptance criteria to the last implementation phase
        // or create a dedicated verification phase
        const lastImplPhase = phases[phases.length - 1];
        if (lastImplPhase && spec.acceptanceCriteria.length > 0) {
            const verificationTasks = this.createVerificationTasks(spec.acceptanceCriteria, spec);
            if (verificationTasks.length > 0) {
                lastImplPhase.tasks.push(...verificationTasks);
            }
        }

        return phases;
    }

    /**
     * Create execution tasks for a set of requirements.
     */
    private static createTasksForRequirements(
        reqs: Requirement[],
        spec: StructuredSpecification,
        category: string
    ): ExecutionTask[] {
        return reqs.map((req, i) => ({
            id: `task_${category}_${req.id}`,
            description: req.description,
            tool: this.selectToolForRequirement(req, spec),
            agent: 'Dev',
            input: { request: req.description, requirementId: req.id },
            dependsOn: req.relatedRequirements.map(id => `task_${category}_${id}`).filter(dep => 
                reqs.some(r => r.id === dep.replace(`task_${category}_`, ''))
            ),
            requirementIds: [req.id],
            parallel: req.priority !== 'critical' && i > 0,
            reasoning: `Implements ${req.id} (${req.priority} priority ${req.type} requirement)`,
        }));
    }

    /**
     * Create execution tasks for constraints.
     */
    private static createTasksForConstraints(
        constraints: Constraint[],
        spec: StructuredSpecification,
        category: string
    ): ExecutionTask[] {
        return constraints.map((constraint, i) => {
            const dependsOn = constraint.relatedRequirements
                .map(id => {
                    // Find which phase/task this requirement belongs to
                    const req = spec.requirements.find(r => r.id === id);
                    if (req) {
                        const cat = req.type === 'functional' ? 
                            (req.description.includes('data') || req.description.includes('storage') ? 'data_layer' :
                             req.description.includes('service') || req.description.includes('api') ? 'services' : 'ui') :
                            'non_functional';
                        return `task_${cat}_${id}`;
                    }
                    return undefined;
                })
                .filter((v): v is string => v !== undefined);

            return {
                id: `task_${category}_${constraint.id}`,
                description: `Implement ${constraint.type} constraint: ${constraint.description}`,
                tool: this.selectToolForConstraint(constraint),
                agent: 'Dev',
                input: { request: constraint.description, constraintId: constraint.id, constraintType: constraint.type },
                dependsOn,
                requirementIds: constraint.relatedRequirements,
                parallel: false,
                reasoning: `Enforces ${constraint.id} (${constraint.type} constraint with tension: ${constraint.tensionWith.join(', ') || 'none'})`,
            };
        });
    }

    /**
     * Create tasks for implicit requirements.
     */
    private static createTasksForImplicitRequirements(
        implicitReqs: ImplicitRequirement[],
        spec: StructuredSpecification
    ): ExecutionTask[] {
        return implicitReqs.map((req, i) => {
            const dependsOn = req.inferredFrom
                .map(id => {
                    const srcReq = spec.requirements.find(r => r.id === id);
                    if (srcReq) {
                        const category = srcReq.type === 'functional' ? 
                            (srcReq.description.includes('data') || srcReq.description.includes('storage') ? 'data_layer' :
                             srcReq.description.includes('service') || srcReq.description.includes('api') ? 'services' : 'ui') :
                            'non_functional';
                        return `task_${category}_${id}`;
                    }
                    return undefined;
                })
                .filter((v): v is string => v !== undefined);

            return {
                id: `task_implicit_${req.id}`,
                description: `Address implicit requirement: ${req.description} (confidence: ${Math.round(req.confidence * 100)}%)`,
                tool: this.selectToolForImplicitRequirement(req),
                agent: 'Dev',
                input: { request: req.description, implicitRequirementId: req.id, inferredFrom: req.inferredFrom },
                dependsOn,
                requirementIds: [req.id],
                parallel: false,
                reasoning: `Implicit requirement inferred from ${req.inferredFrom.join(', ')} (${req.type})`,
            };
        });
    }

    /**
     * Create tasks for constraint tension resolution.
     */
    private static createTasksForConstraintTensions(
        interactions: ConstraintInteraction[],
        spec: StructuredSpecification
    ): ExecutionTask[] {
        return interactions.map((interaction, i) => {
            // Build dependsOn array with proper null filtering
            const dependsOn = interaction.constraintIds
                .flatMap(id => {
                    const constraint = spec.constraints.find(c => c.id === id);
                    return constraint ? constraint.relatedRequirements : [];
                })
                .map(id => {
                    const req = spec.requirements.find(r => r.id === id);
                    if (req) {
                        const category = req.type === 'functional' ? 'data_layer' : 
                                       req.type === 'constraint' ? 'non_functional' : 'services';
                        return `task_${category}_${id}`;
                    }
                    return undefined;
                })
                .filter((v): v is string => v !== undefined);

            return {
                id: `task_tension_${interaction.constraintIds.join('_')}`,
                description: `Resolve ${interaction.tensionType} tension: ${interaction.description}. Strategy: ${interaction.resolutionStrategy}`,
                tool: 'central_answer',
                agent: 'Architect',
                input: { 
                    request: interaction.description, 
                    tensionType: interaction.tensionType,
                    constraintIds: interaction.constraintIds,
                    resolutionStrategy: interaction.resolutionStrategy,
                },
                dependsOn,
                requirementIds: interaction.constraintIds,
                parallel: false,
                reasoning: `Resolves tension between ${interaction.constraintIds.join(' and ')} (${interaction.tensionType})`,
            };
        });
    }

    /**
     * Create verification tasks for acceptance criteria.
     */
    private static createVerificationTasks(
        criteria: AcceptanceCriterion[],
        spec: StructuredSpecification
    ): ExecutionTask[] {
        return criteria.map((criterion, i) => ({
            id: `task_verify_${criterion.id}`,
            description: `Verify acceptance criterion: ${criterion.description}`,
            tool: this.selectToolForVerification(criterion),
            agent: 'QA',
            input: { 
                request: criterion.description, 
                acceptanceCriterionId: criterion.id,
                requirementId: criterion.requirementId,
                testType: criterion.testType,
            },
            dependsOn: [], // Will be resolved by wireDataFlow
            requirementIds: [criterion.requirementId],
            parallel: true,
            reasoning: `Verifies ${criterion.id} for requirement ${criterion.requirementId} (${criterion.testType} test)`,
        }));
    }

    /**
     * Select appropriate tool for a requirement based on its description.
     */
    private static selectToolForRequirement(req: Requirement, spec: StructuredSpecification): string {
        const desc = req.description.toLowerCase();
        
        if (/database|schema|migration|storage|persist/i.test(desc)) return 'project_pipeline';
        if (/api|endpoint|service|rest|graphql/i.test(desc)) return 'project_pipeline';
        if (/ui|frontend|component|page|screen|form|dashboard/i.test(desc)) return 'project_pipeline';
        if (/auth|authentication|login|security|permission/i.test(desc)) return 'project_pipeline';
        if (/test|verify|validate/i.test(desc)) return 'shell_execute';
        
        return 'project_pipeline'; // Default to the evidence-first pipeline
    }

    /**
     * Select appropriate tool for a constraint.
     */
    private static selectToolForConstraint(constraint: Constraint): string {
        switch (constraint.type) {
            case 'security': return 'project_pipeline';
            case 'performance': return 'project_pipeline';
            case 'availability': return 'project_pipeline';
            case 'compliance': return 'project_pipeline';
            default: return 'project_pipeline';
        }
    }

    /**
     * Select appropriate tool for an implicit requirement.
     */
    private static selectToolForImplicitRequirement(req: ImplicitRequirement): string {
        const desc = req.description.toLowerCase();
        if (/test|verify|validate/i.test(desc)) return 'shell_execute';
        if (/document|readme|comment/i.test(desc)) return 'write_file';
        return 'project_pipeline';
    }

    /**
     * Select appropriate tool for verification based on test type.
     */
    private static selectToolForVerification(criterion: AcceptanceCriterion): string {
        switch (criterion.testType) {
            case 'unit': return 'shell_execute';
            case 'integration': return 'shell_execute';
            case 'e2e': return 'browser_run';
            case 'manual': return 'central_answer';
            case 'observability': return 'shell_execute';
            default: return 'shell_execute';
        }
    }

    /**
     * Create the final specification verification phase.
     */
    private static createSpecificationVerificationPhase(spec: StructuredSpecification): ExecutionStep {
        return {
            id: 'spec_verification',
            description: 'Verify all specification requirements are satisfied',
            tool: 'specification_verification',
            agent: 'QA',
            input: { specificationId: spec.specificationId },
            dependsOn: [], // Will be resolved by wireDataFlow to depend on all implementation tasks
            parallel: false,
            reasoning: 'Final verification against all requirements, constraints, and acceptance criteria',
        };
    }

    /**
     * Build traceability matrix linking requirements to phases, tasks, and verification.
     */
    private static buildTraceabilityMatrix(
        spec: StructuredSpecification,
        phases: PhasePlan[]
    ): RequirementTraceabilityEntry[] {
        const matrix: RequirementTraceabilityEntry[] = [];

        for (const req of spec.requirements) {
            const entry: RequirementTraceabilityEntry = {
                requirementId: req.id,
                phaseNumber: 0,
                taskIds: [],
                acceptanceCriteriaIds: req.acceptanceCriteria,
            };

            // Find which phase and tasks cover this requirement
            for (const phase of phases) {
                if (phase.requirementsCovered.includes(req.id)) {
                    entry.phaseNumber = phase.phaseNumber;
                    entry.taskIds = phase.tasks
                        .filter(t => t.requirementIds.includes(req.id))
                        .map(t => t.id);
                    break;
                }
            }

            // Find verification task for acceptance criteria
            for (const phase of phases) {
                const verifyTask = phase.tasks.find(t => 
                    t.tool === 'specification_verification' || 
                    (t.id.startsWith('task_verify_') && t.requirementIds.includes(req.id))
                );
                if (verifyTask) {
                    entry.verificationTaskId = verifyTask.id;
                    break;
                }
            }

            matrix.push(entry);
        }

        // Also add entries for implicit requirements
        for (const imp of spec.implicitRequirements) {
            matrix.push({
                requirementId: imp.id,
                phaseNumber: phases.find(p => p.requirementsCovered.includes(imp.id))?.phaseNumber || 0,
                taskIds: phases.flatMap(p => p.tasks
                    .filter(t => t.requirementIds.includes(imp.id))
                    .map(t => t.id)),
                verificationTaskId: undefined,
                acceptanceCriteriaIds: [],
            });
        }

        return matrix;
    }
}

