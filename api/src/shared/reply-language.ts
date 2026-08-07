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
