/**
 * Language of the ANSWER.
 *
 * Joe's replies used to be hardcoded Arabic everywhere, so switching the UI
 * language changed a few buttons while every sentence Joe produced stayed
 * Arabic. The UI language now travels with the run (run route -> AgentLoopService
 * -> orchestrator context -> tools), and this module turns it into the one
 * instruction every model call carries.
 */

export const SUPPORTED_LANGUAGES = ['ar', 'en', 'fr', 'de', 'ru', 'es'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const NAMES: Record<string, string> = {
    ar: 'Arabic (العربية)',
    en: 'English',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
    ru: 'Russian (Русский)',
    es: 'Spanish (Español)',
};

/** Normalise anything ("AR", "en-US", undefined) to a supported code. */
export function normalizeLanguage(value: any, fallback: SupportedLanguage = 'ar'): SupportedLanguage {
    const raw = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(raw) ? (raw as SupportedLanguage) : fallback;
}

export function languageName(value: any): string {
    return NAMES[normalizeLanguage(value)] || NAMES.ar;
}

/** Is this language written right-to-left? */
export function isRtl(value: any): boolean {
    return normalizeLanguage(value) === 'ar';
}

/**
 * The system-prompt line that makes a model answer in the user's language.
 * Deliberately explicit about code and identifiers: translating a file path or a
 * command would break the very thing the user is being told to run.
 */
export function languageDirective(value: any): string {
    const lang = normalizeLanguage(value);
    return [
        `Answer ONLY in ${NAMES[lang]}. This is the language the user selected in the interface.`,
        `Every sentence you write — explanations, summaries, error messages, questions — must be in ${NAMES[lang]}.`,
        'Do NOT translate: code, file paths, commands, URLs, API/tool names, or identifiers. Keep those verbatim.',
    ].join(' ');
}

/** Short UI strings Joe emits outside model calls (status lines, fallbacks). */
const UI: Record<string, Record<SupportedLanguage, string>> = {
    done: { ar: '✅ تم التنفيذ.', en: '✅ Done.', fr: '✅ Terminé.', de: '✅ Fertig.', ru: '✅ Готово.', es: '✅ Hecho.' },
    failed: {
        ar: 'تعذّر إكمال الطلب.', en: 'Could not complete the request.',
        fr: 'Impossible de terminer la demande.', de: 'Die Anfrage konnte nicht abgeschlossen werden.',
        ru: 'Не удалось выполнить запрос.', es: 'No se pudo completar la solicitud.',
    },
    unexpectedError: {
        ar: 'خطأ غير متوقع في التنفيذ', en: 'Unexpected execution error',
        fr: "Erreur d'exécution inattendue", de: 'Unerwarteter Ausführungsfehler',
        ru: 'Непредвиденная ошибка выполнения', es: 'Error de ejecución inesperado',
    },
    recalledContext: {
        ar: '🗂️ استرجعتُ سياق مشروعك من الذاكرة', en: '🗂️ Recalled your project context from memory',
        fr: '🗂️ Contexte du projet récupéré depuis la mémoire', de: '🗂️ Projektkontext aus dem Speicher abgerufen',
        ru: '🗂️ Контекст проекта восстановлен из памяти', es: '🗂️ Contexto del proyecto recuperado de la memoria',
    },
};

/**
 * Localise a one-off string table that lives next to the code that needs it
 * (tool reports, tool-specific errors). `ar` is required so there is always a
 * value to fall back to; every other language degrades to it rather than to an
 * empty string.
 */
export function pick(table: Partial<Record<SupportedLanguage, string>> & { ar: string }, language: any): string {
    return table[normalizeLanguage(language)] ?? table.ar;
}

export function uiText(key: keyof typeof UI, language: any): string {
    const lang = normalizeLanguage(language);
    return UI[key]?.[lang] ?? UI[key]?.ar ?? '';
}


/**
 * How much of a text's LETTERS are Arabic script (0..1).
 *
 * The enforcement metric behind «يجب أن يرد باللغة التي طُلب منه بها»: the
 * user asked in Arabic and a weak fallback model answered in English — an
 * instruction is a request, a measurement is a contract. Digits, spaces and
 * punctuation are excluded so a code snippet or a number does not dilute
 * the score of an otherwise-Arabic reply.
 */
export function arabicShare(text: string): number {
    const t = String(text || '');
    const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const letters = (t.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
    return letters === 0 ? 0 : arabic / letters;
}

/**
 * The language of the MESSAGE beats the language of the SWITCHER.
 *
 * Field-measured: the UI was set to English, the user typed «حلل هذه الصوره»,
 * and the run carried «[RESPONSE LANGUAGE …]: The user's language is English» —
 * so the model produced fluent English nobody asked for. «يجب أن يرد باللغة
 * التي طُلب منه بها»: the reply follows what the user WROTE. The UI language
 * remains the fallback only when the message's script decides nothing
 * (numbers, code, emoji, a bare URL, a two-letter «ok»).
 */
export function messageLanguage(text: string, uiLanguage: any = 'ar'): SupportedLanguage {
    const fallback = normalizeLanguage(uiLanguage);
    const t = String(text || '');
    if (arabicShare(t) >= 0.25) return 'ar';
    const latin = (t.match(/[a-zA-Z]/g) || []).length;
    const cyrillic = (t.match(/[\u0400-\u04FF]/g) || []).length;
    const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const letters = latin + cyrillic + arabic;
    if (letters < 4) return fallback;
    if (cyrillic / letters >= 0.5) return 'ru';
    if (latin / letters >= 0.75) {
        // Latin script alone cannot tell en/fr/de/es apart — trust the switcher
        // when it already names a Latin-script language; otherwise English is
        // the honest reading of a Latin-script message.
        return fallback === 'ar' || fallback === 'ru' ? 'en' : fallback;
    }
    return fallback;
}

/**
 * Narrow pure script predicate: did the ANSWER introduce letter-script the
 * user never asked for?
 *
 * Proved case: a local 7B Arabic SQL prose reply carried unrequested Han
 * letters while `arabicShare` stayed ~0.97 (`arabicShare` only counts the
 * Arabic block vs ASCII Latin, so Han/Cyrillic/Hebrew are invisible to it)
 * and the <0.35 prose trigger never fired. This predicate closes that gap;
 * `arabicShare` itself is untouched for its other callers.
 *
 * Policy (enforced on a scan COPY only; the real answer is never stripped,
 * sanitised, or mutated — this function returns a boolean):
 * - Only the normalised base tags `ar`/`en` are judged; any other language
 *   returns false (unknown => no claim).
 * - `ar` allows Arabic + Latin letters (Latin covers technical identifiers;
 *   a fully-English reply is still caught by the existing ratio gate).
 * - `en` allows Latin letters only.
 * - Only Unicode General_Category=Letter counts as a letter; digits, emoji,
 *   punctuation and symbols are never foreign. Script membership is read via
 *   Script_Extensions (UTS #18 rev 25) with u-mode property escapes
 *   (ECMAScript es2026-errata; supported on the installed Node).
 * - Bounded static exemptions on the scan copy only: fenced code blocks,
 *   inline `code` (<=200 chars per span), URLs and slash paths. Model-added
 *   QUOTES are deliberately NOT exempt: quoted prose is still judged.
 * - Exact user-supplied foreign terms/identifiers are exempt by whole-token
 *   equality only (one token-set pass over the question, capped). A user
 *   literal occurring as a substring of a NEW larger contaminated token does
 *   NOT exempt that token. No regex is ever built from question text, and the
 *   answer is scanned linearly with no repeated whole-answer substitutions.
 * - Documented limitation: generated translations the user never supplied
 *   stay flagged; literal code/identifier identities given by the user are
 *   preserved via the whole-token exemption above.
 * - Bounded: answers above 20k chars or 3000 tokens fail this check instead
 *   of accepting an unchecked suffix. At most 300 exact foreign question
 *   literals are retained; question scanning is linear and does not build
 *   an array of all its tokens. Pure scan; no network or content logging.
 */
const FOREIGN_SCAN_MAX_CHARS = 20000;
const FOREIGN_QUESTION_TOKENS_MAX = 300;
const FOREIGN_ANSWER_TOKENS_MAX = 3000;
const FOREIGN_TOKEN_MAX_LEN = 80;
const FOREIGN_TOKEN_RE = /[\p{L}\p{N}]+/gu;
const FOREIGN_FENCE_RE = /```[\s\S]*?```/g;
const FOREIGN_INLINE_CODE_RE = /`[^`\n]{1,200}`/g;
const FOREIGN_URL_RE = /(?:https?:\/\/|www\.)[^\s)>\]"']{1,500}/g;
const FOREIGN_PATH_RE = /(^|[\s(\["'])((?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|\/)[^\s)>\]"']{1,500}|[\p{L}\p{N}_.~\-]{1,80}(?:[\\/][\p{L}\p{N}_.~\-]{1,80})+)/gu;
const FOREIGN_LETTER_RE = /\p{L}/u;
const FOREIGN_ARABIC_SCX_RE = /\p{Script_Extensions=Arabic}/u;
const FOREIGN_LATIN_SCX_RE = /\p{Script_Extensions=Latin}/u;

function foreignLetterAllowed(ch: string, lang: 'ar' | 'en'): boolean {
    if (FOREIGN_LATIN_SCX_RE.test(ch)) return true;
    return lang === 'ar' && FOREIGN_ARABIC_SCX_RE.test(ch);
}

export type AnswerScriptIssue = 'none' | 'unrequested_letter' | 'answer_length_limit' | 'answer_token_limit';

/** Fixed diagnostic code only; the bounded scanner never returns or logs input text. */
export function diagnoseAnswerScriptIssue(answer: string, question: string, language: string): AnswerScriptIssue {
    const base = String(language ?? '').trim().toLowerCase().split(/[-_]/)[0];
    if (base !== 'ar' && base !== 'en') return 'none';
    const lang = base as 'ar' | 'en';
    let scan = String(answer ?? '');
    if (!scan) return 'none';
    if (scan.length > FOREIGN_SCAN_MAX_CHARS) return 'answer_length_limit';
    // Exemptions apply to this scan copy only; the caller's answer is untouched.
    scan = scan
        .replace(FOREIGN_FENCE_RE, ' ')
        .replace(FOREIGN_INLINE_CODE_RE, ' ')
        .replace(FOREIGN_URL_RE, ' ')
        .replace(FOREIGN_PATH_RE, '$1 ');
    if (!FOREIGN_LETTER_RE.test(scan)) return 'none';
    // One token-set pass over the question: exact user-supplied literals only.
    const allowed = new Set<string>();
    for (const match of String(question ?? '').matchAll(FOREIGN_TOKEN_RE)) {
        const tok = match[0];
        if (tok.length > FOREIGN_TOKEN_MAX_LEN) continue;
        if (![...tok].some(ch => FOREIGN_LETTER_RE.test(ch) && !foreignLetterAllowed(ch, lang))) continue;
        allowed.add(tok);
        if (allowed.size >= FOREIGN_QUESTION_TOKENS_MAX) break;
    }
    let count = 0;
    for (const match of scan.matchAll(FOREIGN_TOKEN_RE)) {
        if (++count > FOREIGN_ANSWER_TOKENS_MAX) return 'answer_token_limit';
        const tok = match[0];
        // Whole-token equality only: a user literal inside a NEW larger token
        // never exempts that token.
        if (allowed.has(tok)) continue;
        for (const ch of tok) {
            if (!FOREIGN_LETTER_RE.test(ch)) continue; // digits are not letters
            if (!foreignLetterAllowed(ch, lang)) return 'unrequested_letter';
        }
    }
    return 'none';
}

/** Preserve the existing boolean contract for every caller. */
export function hasUnrequestedAnswerScript(answer: string, question: string, language: string): boolean {
    return diagnoseAnswerScriptIssue(answer, question, language) !== 'none';
}
