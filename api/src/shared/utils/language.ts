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
