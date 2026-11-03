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
 * Field-measured: the UI was set to English, the user typed \u00AB\u062D\u0644\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0647\u00BB,
 * and the run carried \u00AB[RESPONSE LANGUAGE \u2026]: The user's language is English\u00BB \u2014
 * so the model produced fluent English nobody asked for. \u00AB\u064A\u062C\u0628 \u0623\u0646 \u064A\u0631\u062F \u0628\u0627\u0644\u0644\u063A\u0629
 * \u0627\u0644\u062A\u064A \u0637\u064F\u0644\u0628 \u0645\u0646\u0647 \u0628\u0647\u0627\u00BB: the reply follows what the user WROTE. The UI language
 * remains the fallback only when the message's script decides nothing
 * (numbers, code, emoji, a bare URL, a two-letter \u00ABok\u00BB).
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
        // Latin script alone cannot tell en/fr/de/es apart \u2014 trust the switcher
        // when it already names a Latin-script language; otherwise English is
        // the honest reading of a Latin-script message.
        return fallback === 'ar' || fallback === 'ru' ? 'en' : fallback;
    }
    return fallback;
}
