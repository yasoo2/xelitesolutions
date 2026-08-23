/**
 * THE CLARIFY GATE — «من الأفضل أن يكون هناك حوار بين جو والمستخدم».
 *
 * A build prompt with almost nothing in it — «ابن لي موقع» — used to start a
 * full build IMMEDIATELY: palette rolled, sections invented, minutes spent on
 * a page about nothing the user actually meant. A real team asks first. This
 * gate is deterministic (no model call, no quota): a THIN fresh-build prompt
 * gets 3-4 targeted questions in the user's language; the answers arrive as
 * the next message, are merged with the original request, and the build runs
 * once with the full picture. «ابدأ مباشرة» (or any detailed prompt) skips
 * the dialogue entirely — questions are for missing information, never a
 * toll booth.
 */

import { asksForSomething, describesItsContents } from './buildIntent';

interface PendingClarify { request: string; at: number }
const TTL_MS = 30 * 60_000;

function pendingMap(): Record<string, PendingClarify> {
    const g: any = global as any;
    return g.joeClarify || (g.joeClarify = {});
}

/** Strip the runtime-injected blocks; the gate judges the USER's words only. */
function userWords(goal: string): string {
    return String(goal || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '')
        .trim();
}

const BUILD_VERB = /\b(build|create|make|design|develop|generate)\b|(ابنِ|ابني|ابن\s|انشئ|أنشئ|اصنع|صمم|اعمل|سوي?\s*لي)/i;
/**
 *  …AND A THING HE SAYS HE WILL KEEP TRACK OF.
 *
 *  Measured live. He wrote «بدي شي أتابع فيه ديوني» — a request to build,
 *  with nothing to build from. This gate should have asked him what he
 *  wanted to record. It did not fire, because it required a noun from its
 *  own private list and he had written «شي».
 *
 *  So Joe fell through to a free answer and improvised a financial
 *  adviser: he asked the man about his interest rates, his minimum
 *  payments and his monthly income, and offered him «طريقة التلال» versus
 *  «طريقة الثلج». Nothing was built and nothing was asked that would let
 *  anything be built.
 *
 *  A tracking verb with an object is a build-shaped request whatever the
 *  object is called — «أتابع ديوني», «أسجل شتلاتي», «track my shipments».
 *  The verb is the closed class here; the object never is.
 */
const TRACKING = /(أتابع|اتابع|أسجل|اسجل|أدوّن|ادون|أحفظ|احفظ|أنظم|انظم|أرتب|ارتب|أدير|ادير|\btrack\b|\bmanage\b|\brecord\b|\blog\b|\bkeep\s+track\b|\borgani[sz]e\b)/i;

const WEB_NOUN = /\b(page|site|website|app|store|dashboard|portfolio|landing)\b|(صفحة|موقع|تطبيق|متجر|لوحة|واجهة|بورتفوليو|هبوط)/i;
const BYPASS = /(مباشرة|مباشره|بدون\s*أ?سئلة|بدون\s*اسئله|على\s*(راحتك|كيفك|ذوقك)|كما\s*تراه|اقترح\s*أنت|directly|no\s*questions|your\s*call|surprise\s*me)/i;

/**
 * A command to operate, verify, or deploy an existing project is a NEW task,
 * never an answer to an earlier "what should I build?" dialogue. Keeping a
 * 30-minute clarify state must not turn «شغّل المشروع» into a request to build
 * the stale project. Deliberately excludes «ابدأ مباشرة»: that is the
 * documented answer which means "build the pending brief now".
 */
const EXPLICIT_OPERATIONAL_INTENT =
    /\b(project_run|run|start|launch|execute|open|test|verify|validate|deploy)\b|شغّ?ل|تشغيل|افتح|اختبر|تحقّ?ق|تأكّ?د|تاكّ?د|ابدأ\s*(?:التشغيل|تشغيل)|نفّ?ذ|انشر/i;

/** Words that carry no description of WHAT to build. */
const STOP = new Set([
    'ابن', 'ابني', 'ابنِ', 'انشئ', 'أنشئ', 'اصنع', 'صمم', 'اعمل', 'سوي', 'سو', 'طور',
    'لي', 'لى', 'له', 'لنا', 'من', 'فضلك', 'اريد', 'أريد', 'ابغى', 'ابي', 'بدي', 'ممكن',
    'موقع', 'موقعا', 'صفحة', 'صفحه', 'تطبيق', 'متجر', 'لوحة', 'واجهة', 'ويب', 'الكتروني', 'إلكتروني', 'الكترونية',
    'جميل', 'جميلة', 'حلو', 'حلوة', 'رائع', 'احترافي', 'احترافية', 'مميز', 'عصري', 'كامل', 'متكامل', 'جديد',
    'build', 'create', 'make', 'design', 'develop', 'a', 'an', 'the', 'me', 'for', 'please', 'new',
    'website', 'site', 'page', 'app', 'web', 'nice', 'beautiful', 'professional', 'modern', 'complete',
    'يا', 'جو', 'joe',
]);

/** How many words actually DESCRIBE the thing to build. */
export function descriptiveTokens(text: string): string[] {
    return String(text || '')
        .split(/[\s،,.!؟?:؛;()«»"']+/)
        .map(w => w.trim().replace(/^ال/, ''))
        .filter(w => w.length >= 2 && !STOP.has(w) && !STOP.has('ال' + w) && !/^\d+$/.test(w));
}

/** Is this a fresh build prompt too thin to build from? */
export function isVagueBuildRequest(goal: string, opts?: { hasActivePage?: boolean; hasAttachments?: boolean }): boolean {
    const text = userWords(goal);
    if (!text || opts?.hasActivePage) return false;                 // edits are never questioned
    if (/\[ATTACHED FILES/i.test(String(goal)) || opts?.hasAttachments) return false; // the attachment IS the brief
    if (BYPASS.test(text)) return false;
    //  Two ways to be a build request: he names a thing to be made, or he
    //  names something he will keep track of. Either way, if he has already
    //  said what it will HOLD, there is nothing left to ask — that request
    //  is complete and goes straight to the builder.
    if (describesItsContents(text)) return false;
    const namesAThing = BUILD_VERB.test(text) && WEB_NOUN.test(text);
    const namesSomethingToTrack = asksForSomething(text) && TRACKING.test(text);
    if (!namesAThing && !namesSomethingToTrack) return false;
    //  «Enough detail» means two different things for the two shapes.
    //  For a named artefact it is descriptive words — «موقع لمطعم إيطالي»
    //  needs no questions. For something he will track, the only detail
    //  that counts is WHAT IT HOLDS, and that was already checked above:
    //  «بدي شي أتابع فيه ديوني» has three descriptive words and not one
    //  column, so counting words would call it complete and build him a
    //  table out of thin air.
    if (namesSomethingToTrack) return true;
    return descriptiveTokens(text).length < 2;
}

/** The questions, deterministic, in the user's language. */
export function clarifyQuestions(goal: string, language: string): string {
    const isAr = String(language || 'ar').startsWith('ar');
    const wantsApp = /(تطبيق|app)/i.test(userWords(goal));
    if (isAr) {
        return `سؤال قبل أن أبدأ — حتى أبني ما تريده فعلاً لا ما أتخيله 🎯

1️⃣ ما موضوع ${wantsApp ? 'التطبيق' : 'الموقع'}؟ (مطعم؟ متجر؟ شركة؟ معرض أعمال؟ …)
2️⃣ ما الأقسام التي تريدها؟ (مثلاً: رئيسية، خدمات، أسعار، تواصل)
3️⃣ هل لديك ألوان أو هوية معينة؟ (أو أتركها لي)
4️⃣ صفحة واحدة أم موقع متعدد الصفحات؟

أجب بما تعرفه فقط — وسأتصرف في الباقي. أو قل «ابدأ مباشرة» وسأبني فوراً على ذوقي.`;
    }
    return `One thing before I start — so I build what you actually mean 🎯

1️⃣ What is the ${wantsApp ? 'app' : 'site'} about? (a restaurant? a store? a company? a portfolio?)
2️⃣ Which sections do you want? (e.g. home, services, pricing, contact)
3️⃣ Any colours or brand identity? (or leave it to me)
4️⃣ One page, or a multi-page site?

Answer what you know — I'll handle the rest. Or say "start now" and I'll build immediately.`;
}

export type ClarifyDecision =
    | { kind: 'ask'; text: string }
    | { kind: 'merge'; goal: string }
    | { kind: 'pass' };

/**
 * One call per incoming message. Owns the pending state:
 *  - a vague fresh build   → remember it, return the questions;
 *  - the NEXT message      → merge answers with the remembered request;
 *  - anything else         → pass through untouched.
 */
export function clarifyGate(goal: string, sessionId: string, language: string, opts?: { hasActivePage?: boolean }): ClarifyDecision {
    const key = String(sessionId || 'default');
    const map = pendingMap();
    const pending = map[key];
    const text = userWords(goal);

    if (pending && Date.now() - pending.at < TTL_MS) {
        delete map[key];
        // An explicit run/verification/deploy command targets the current
        // project, not the unanswered build brief. Pass it unchanged so the
        // planner can select project_run (or the relevant operational tool).
        if (EXPLICIT_OPERATIONAL_INTENT.test(text)) {
            return { kind: 'pass' };
        }
        // A brand-new DETAILED build request replaces the old conversation.
        if (BUILD_VERB.test(text) && WEB_NOUN.test(text) && descriptiveTokens(text).length >= 2) {
            return { kind: 'pass' };
        }
        const isAr = String(language || 'ar').startsWith('ar');
        const merged = `${pending.request}\n\n${isAr ? '[توضيحات المستخدم عن المشروع]' : '[The user\'s clarifications]'}: ${text}`;
        return { kind: 'merge', goal: merged };
    }
    if (pending) delete map[key];   // expired

    if (isVagueBuildRequest(goal, opts)) {
        map[key] = { request: text, at: Date.now() };
        return { kind: 'ask', text: clarifyQuestions(goal, language) };
    }
    return { kind: 'pass' };
}
