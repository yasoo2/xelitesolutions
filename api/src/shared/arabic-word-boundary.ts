/**
 * WORD BOUNDARIES THAT SEE ARABIC.
 *
 * JavaScript's `\b` is defined over `\w` = [A-Za-z0-9_], even with the /u
 * flag, so next to an Arabic letter it never fires where a reader expects it:
 *
 *     /^(?:عرض|تحقق)\b/u.test('تحقق من المدخلات')   // false
 *
 * Every Arabic alternative written as `\b(…|تحقق|…)\b` was silently dead.
 * Eval round 15 (2026-10-24) counted 37 such sites, among them intent,
 * build-scope, edit and browser routing.
 *
 * English alternatives keep their ASCII `\b`, so what an English branch
 * matches does not change; Arabic alternatives use these lookarounds (with the
 * /u flag). Arabic glues the conjunctions «و» «ف» and the article «ال» to the
 * next word — «واضغط», «الموقع» — where English writes «and click», «the
 * site». The *_CONJ / *_NOUN starts accept those particles WITHOUT consuming
 * them, so a match never begins with the particle, and they deliberately do
 * not accept the prepositions «ب» «ل» «ك», which change what the word means.
 */

/** No letter, digit or underscore before (use with /u). */
export const AR_START = '(?<![\\p{L}\\p{N}_])';
/** No letter, digit or underscore after (use with /u). Diacritics are marks, not letters, so «ابنِ» still ends. */
export const AR_END = '(?![\\p{L}\\p{N}_])';
const NOT_WORD = '(?:^|[^\\p{L}\\p{N}_])';
/** A word that may carry a glued «و» or «ف» (not consumed). */
export const AR_START_CONJ = `(?<=${NOT_WORD}[وف]?)`;
/** A noun that may carry «و»/«ف» and the article «ال» (not consumed). */
export const AR_START_NOUN = `(?<=${NOT_WORD}[وف]?(?:ال)?)`;

/**
 * Whole words in either script, as one regex source: English alternatives
 * bounded by ASCII `\b`, Arabic alternatives by the boundaries above.
 * Alternatives are regex sources (escape them as such).
 */
export function wordsPattern(english: readonly string[], arabic: readonly string[], arabicStart: string = AR_START_CONJ): string {
    const parts: string[] = [];
    if (english.length) parts.push(`\\b(?:${english.join('|')})\\b`);
    if (arabic.length) parts.push(`${arabicStart}(?:${arabic.join('|')})${AR_END}`);
    return `(?:${parts.join('|')})`;
}

/** wordsPattern as a RegExp; the /u flag is always added (the lookarounds need it). */
export function wordsRegex(english: readonly string[], arabic: readonly string[], flags = 'i', arabicStart: string = AR_START_CONJ): RegExp {
    return new RegExp(wordsPattern(english, arabic, arabicStart), flags.includes('u') ? flags : `${flags}u`);
}
