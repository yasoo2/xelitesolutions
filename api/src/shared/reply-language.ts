/**
 * «عند وضع بروميت بالانجليزية … يجب ان تكون النتيجة والذكاء العصبي كلها انجليزية»
 *
 * The rule he describes already existed — and only inside the build tools:
 *
 *     const uiLang = String(context?.language || '').toLowerCase();
 *     const isAr = uiLang ? uiLang.startsWith('ar') : /[؀-ۿ]/.test(request);
 *
 * The interface's language wins; with none set, the prompt's own script
 * decides. Correct, and copied by hand into every tool that needed it — which
 * is why the NEURAL TRACE never got it. Its ten status lines were hardcoded
 * Arabic, so an English prompt in English mode produced:
 *
 *     جاري تنفيذ: api project…
 *     🗄️ Building a real backend with a database: MyApp
 *
 * — two languages in one trace, from one request.
 *
 * One rule, one file. A twelfth caller cannot invent a twelfth spelling of it.
 */

/** Any script that reads right to left and is not Latin. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export interface LanguageSource {
    /** What the interface is set to — «ar», «en-US», … Wins when present. */
    language?: string;
    /** The user's own words, when the interface has said nothing. */
    text?: string;
}

/**
 * Is the answer to this request Arabic?
 *
 * The interface's setting is the authority: a user who switched Joe to
 * English wants English even when they typed one Arabic word. Only when no
 * setting exists does the script of the request decide — which is right for
 * a script, a webhook, or any caller with no interface at all.
 */
export function isArabicReply(src: LanguageSource | string | undefined): boolean {
    if (typeof src === 'string') return ARABIC.test(src);
    const ui = String(src?.language || '').trim().toLowerCase();
    if (ui) return ui.startsWith('ar');
    return ARABIC.test(String(src?.text || ''));
}

/** Pick the sentence in the reader's language. The whole helper, in one line. */
export function say(isAr: boolean, ar: string, en: string): string {
    return isAr ? ar : en;
}

/**
 * THE LANGUAGE CODE JOE ANSWERS IN.
 *
 * The same question as isArabicReply, answered for a system that knows more
 * than two languages — and answered in ONE place, because it used to be
 * answered in two that disagreed. AgentLoopService let the message decide and
 * the switcher break ties; ReactProjectTool and this file say the opposite.
 * The owner watched an English interface narrate his build in Arabic:
 *
 *     «النظام الان باللغه الانجليزية فلماذا تظهر بعض الكلمات باللغه العربية»
 *
 * The interface he is looking at decides what Joe SAYS. The script of what he
 * typed decides only when no interface language arrived at all. His own words
 * are untouched either way — a column he named stays in the language he named
 * it in, inside an English sentence if that is the interface he chose.
 */
export function replyLanguageCode(uiLanguage: string | undefined, text: string): string {
    const ui = String(uiLanguage || '').trim().toLowerCase().split('-')[0];
    if (ui) return ui;
    //  An 'ar' default here would answer an English message in Arabic the
    //  moment the interface language went missing — the very defect this
    //  helper exists to end, wearing its other face. isArabicReply has always
    //  read the script and nothing else in that case; this gives the same
    //  answer, and a permanent test asserts the two never diverge again.
    return isArabicReply({ text }) ? 'ar' : 'en';
}