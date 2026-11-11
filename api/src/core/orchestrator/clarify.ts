/**
 * THE CLARIFY GATE — «من الأفضل أن يكون هناك حوار بين جو والمستخدم».
 *
 * A build prompt with almost nothing in it — «ابن لي موقع» — used to start a
 * full build IMMEDIATELY: palette rolled, sections invented, minutes spent on
 * a page about nothing the user actually meant. So this gate learned to ask
 * first: deterministic (no model call, no quota), a THIN fresh-build prompt
 * got targeted questions in the user's language.
 *
 * ⛔ AND THEN THE OWNER RULED OUT THE QUESTION ITSELF — 2026-11-03.
 *
 *     «اريد جو مستقل وقادر على بناء اي نظام مهما كان معقد لوحده وبدون تدخل
 *      بشري»
 *
 * A question before building is the human intervention he ruled out. On the
 * 500-prompt exam the same day it was worse than a pause: a detailed chatbot
 * request (P454) was asked «ما الذي تريد تسجيله لكل واحد من «رياضي يجاوب»؟»,
 * and the run that asked ended under another id, so its own record said
 * «running» for eight hours. A thin request is now BUILT with Joe's own
 * choices: the gate says up front what he did not say and what Joe is
 * choosing — about HIS thing, never a website questionnaire — and the reply
 * names the choices so he can change them. Nothing is invented silently, and
 * nothing waits for him.
 */

import { RECORD_CONTAINER } from '../design/app-blueprints';
import { asksForSomething, describesItsContents, tracksSomethingOfHis, trackingVerbAt } from './buildIntent';
import { isBuildRequest } from '../intelligence/intent-classifier';
import { isArabicReply } from '../../shared/reply-language';

/** Strip the runtime-injected blocks; the gate judges the USER's words only. */
function userWords(goal: string): string {
    return String(goal || '')
        .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '')
        .trim();
}

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

const BYPASS = /(مباشرة|مباشره|بدون\s*أ?سئلة|بدون\s*اسئله|على\s*(راحتك|كيفك|ذوقك)|كما\s*تراه|اقترح\s*أنت|directly|no\s*questions|your\s*call|surprise\s*me)/i;

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
    /**
     *  AND «بدي جدول» IS A REQUEST TOO.
     *
     *  Measured: the emptiest request a man can type — «بدي جدول» — was not
     *  asked a single question. It went straight to the builder with nothing
     *  to build from, and the builder invented a stock table for him.
     *
     *  This gate carried its OWN list of build verbs — ابنِ, انشئ, اعمل,
     *  build, create — and «بدي» was not on it. A seventh private answer to
     *  «is this a build?», in the one place whose whole job is to notice a
     *  request too thin to build.
     */
    const namesAThing = isBuildRequest(text).isBuild;
    const namesSomethingToTrack = asksForSomething(text) && tracksSomethingOfHis(text, TRACKING);
    if (!namesAThing && !namesSomethingToTrack) return false;
    //  «Enough detail» means two different things for the two shapes.
    //  For a named artefact it is descriptive words — «موقع لمطعم إيطالي»
    //  needs no questions. For something he will track, the only detail
    //  that counts is WHAT IT HOLDS, and that was already checked above:
    //  «بدي شي أتابع فيه ديوني» has three descriptive words and not one
    //  column, so counting words would call it complete and build him a
    //  table out of thin air.
    if (namesSomethingToTrack) {
        //  A request that says this much about its thing is not thin, whatever
        //  the acceptance deriver could turn into criteria. P454 (2026-11-03): a
        //  chatbot that answers FAQs, books and cancels subscriptions and keeps
        //  its history derived one criterion and was judged empty. «بدي شي
        //  أتابع فيه ديوني» carries four describing words.
        if (descriptiveTokens(text).length >= 8) return false;
        /**
         *  ⛔ BUT «HE MENTIONED SAVING SOMETHING» IS NOT «HE SAID NOTHING».
         *
         *  Seen live, with the owner watching. He typed forty-three words and
         *  seven explicit requirements -- a honey store named «شهد», four named
         *  pages, six products with prices, a working contact form, a cart
         *  that totals and saves the order, a warm and elegant design, and a
         *  rule that no price may be zero or negative -- and Joe answered:
         *
         *      «The brief is thin -- asking a few questions before building»
         *      «what do you want to record for each of your تحسب الإجمالي?»
         *
         *  One clause about saving an order outranked every other thing he
         *  said. That is the fourth law broken in the one gate whose whole job
         *  is to judge how much he said: A DECISION TAKEN FROM A FRAGMENT
         *  WHILE THE AUTHORITY IS THE WHOLE REQUEST.
         *
         *  And the reason it survived is worth more than the line itself. The
         *  escape hatch above is `describesItsContents`, which means exactly
         *  one thing: «did he name TABLE COLUMNS?». So a request that describes
         *  its contents in every way except columns -- pages, products,
         *  prices, a design, a constraint -- counts as describing nothing.
         *
         *  So the question goes to the one reader in this system that already
         *  answers «what did he actually ask for»: the acceptance deriver, the
         *  fourth law’s own machinery. Measured on the real sentences:
         *
         *      6   his honey store
         *      3   «اعمل لي جدول فيه الاسم والمبلغ والتاريخ»
         *      0   «بدي جدول»
         *      0   «بدي جدول للمواعيد»
         *      0   «بدي شي أتابع فيه ديوني»
         *      0   «اعمل لي جدول لمصاريف البيت الشهرية»
         *
         *  Every request this gate exists to stop derives ZERO. The gap is the
         *  whole scale, so the threshold sits in it with room on both sides,
         *  and nothing that used to be questioned stops being questioned.
         */
        let derived = 0;
        try {
            const { acceptanceFor } = require('../quality/acceptance');
            derived = (acceptanceFor(String(goal || '')) || []).length;
        } catch { derived = 0; }
        if (derived >= 2) return false;
        return true;
    }
    //  «بدي جدول للمواعيد» and "I want a table" both named a thing and
    //  nothing else about it. Two words was a low enough bar to let a
    //  request through with a subject and no columns — and a table with no
    //  columns can only be invented. Three.
    return descriptiveTokens(text).length < 3;
}

/**
 *  WHAT HE SAYS HE WILL TRACK IS WHAT THE DECISION IS ABOUT.
 *
 *  Measured live, after the gate was taught to fire on «بدي شي أتابع فيه
 *  ديوني». Joe stopped lecturing him about interest rates — and asked:
 *
 *      What is the site about? (a restaurant? a store? a portfolio?)
 *      Which sections do you want? Any colours? One page or multi-page?
 *
 *  Four website questions for a man who wants to track his debts. Right
 *  instinct, wrong questions — the question list was a fixed catalogue
 *  that knew only one kind of request.
 *
 *  There is exactly one thing Joe cannot build without and cannot invent:
 *  WHAT EACH ROW HOLDS. So that is the question, and it names his own word
 *  back to him.
 */
function trackedObject(goal: string): string {
    const text = userWords(goal);
    //  The same reading as the gate — a verb we know, or one he invented
    //  followed by something he says is his.
    const m = trackingVerbAt(text, TRACKING);
    if (!m) return '';
    const after = text.slice(m.index + m.length).split(/[.،,؛;!؟?\n]/)[0] || '';
    const LEAD = /^(?:فيه|فيها|به|بها|في|فى|كل|جميع|my|the|all|of|for|a|an)$/i;
    const words: string[] = [];
    for (const w of after.trim().split(/\s+/)) {
        if (!w) continue;
        if (words.length === 0 && LEAD.test(w)) continue;
        words.push(w);
        if (words.length === 2) break;
    }
    return words.join(' ').trim();
}

/**
 *  What Joe tells him he is choosing, because he did not say it — and then
 *  builds. Until 2026-11-03 this was the question; it is the decision now,
 *  said about the same thing the question was about.
 */
export function decisionNote(goal: string, language: string): string {
    const isAr = isArabicReply({ language, text: goal });
    //  A man who named something to track is told what Joe chooses for HIS
    //  thing — never sections and colours.
    const tracked = trackedObject(goal);
    if (tracked) {
        return isAr
            ? `💬 لم تذكر ما يُسجَّل لكل واحد من «${tracked}» — أختار بنفسي الحقول التي يحتاجها نظام مثله، وأذكرها في الرد لتغيّرها متى شئت.`
            : `💬 You did not say what each of your ${tracked} holds — I am choosing the fields a system like this needs, and I will name them in the reply so you can change them.`;
    }
    /**
     *  A CONTAINER HE NAMED IS NOT A WEBSITE.
     *
     *  Live round, in Chrome, on his machine. He wrote three words:
     *
     *      «بدي جدول»
     *
     *  and Joe answered with a website questionnaire: the site's subject, its
     *  sections, its colours, one page or several. He asked for a TABLE. A
     *  container that holds records is about WHAT GOES IN IT, and nothing
     *  about colours. The word is echoed back exactly as he wrote it — his
     *  «كشف» is a كشف, not a «جدول» we prefer.
     */
    const container = RECORD_CONTAINER.exec(userWords(goal));
    if (container) {
        //  The pattern has no group: the whole match is his word (it was `[1]`,
        //  which printed «undefined» once the reading fork folded the regex).
        const word = container[0];
        return isAr
            ? `💬 لم تذكر ما يُسجَّل في «${word}» — أختار الأعمدة بنفسي، وأذكرها في الرد لتغيّرها متى شئت.`
            : `💬 You did not say what your ${word} records — I am choosing its columns, and I will name them in the reply so you can change them.`;
    }
    const wantsApp = /(تطبيق|app)/i.test(userWords(goal));
    return isAr
        ? `💬 الطلب مختصر — أختار بنفسي موضوع ${wantsApp ? 'التطبيق' : 'الموقع'} وأقسامه وألوانه، وأذكر ما اخترته في الرد لتغيّره متى شئت.`
        : `💬 The request is brief — I am choosing the ${wantsApp ? 'app' : 'site'}'s subject, sections and colours myself, and I will say what I chose in the reply so you can change it.`;
}

export type ClarifyDecision =
    | { kind: 'decide'; note: string }
    | { kind: 'pass' };

/**
 * One call per incoming message, and it never stops the run: a thin fresh
 * build is built with Joe's own choices, and `note` says up front what he did
 * not say and what Joe is choosing. Nothing is remembered between messages —
 * there is no question waiting for an answer.
 */
export function clarifyGate(goal: string, language: string, opts?: { hasActivePage?: boolean }): ClarifyDecision {
    if (isVagueBuildRequest(goal, opts)) return { kind: 'decide', note: decisionNote(goal, language) };
    return { kind: 'pass' };
}
