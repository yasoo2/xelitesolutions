/**
 * THE TWO LINES THAT REACH HIS DATA COPIES (review 9, H1 M1; review 10, M3 L1).
 *
 * Two rounds of reading his intent from words each opened a new hole: a question, a quote, a «later» or an «if» that
 * held the id and «نعم» brought an old copy back over today's records (review 9, H1), and ordinary work — «رجع
 * البيانات مرتبة حسب التاريخ», «restore the data validation on the form» — was taken for a request for his copies
 * (M1). So no word decides it any more. Two exact lines do, each only as his whole typed message:
 *
 *     اعرض نسخ بياناتي                      show my data copies          → the list of the copies (read-only)
 *     استعِد النسخة 20261117-002502          restore copy 20261117-002502 → that copy back, when the list showed it
 *
 * Review 10 (M3): Joe's told lines said «ask Joe in the chat», and no route led from his own words to the list; in
 * Arabic «استرجع بيانات التطبيق» even reached the CODE undo. Now every told line quotes the first line, and it is read
 * here, the same deterministic way as the second: never by a model, never by a word inside another message.
 *
 * The whole typed message, after trimming whitespace, must be exactly that line; only one final «.» or «!» is
 * tolerated (a space before it too, review 10 L1). Quotes around it, a word before or after it, a question mark, a
 * second line — anything else is not it, and does nothing. What is forgiven is only what the eye cannot see or the
 * keyboard changes on its own: the marks of direction a copy from a right-to-left chat carries, Arabic diacritics and
 * tatweel, Arabic-Indic digits, the case of the English letters (a phone capitalises the first one; ASCII only, so no
 * other letter folds into them), the hamza on the first alif («إستعد», «أستعد», «أعرض»), the long «ي» of «استعيد»,
 * «ه» for the final «ة», and the width of the spaces between the words. Whether the copy the restore line names is
 * one the most recent list of his showed is decided by the tool, from its own records (ProjectDataRecoveryTool) —
 * never by a model.
 */

/** The line he sends back to bring copy `id` back, in the list's language. */
export function restoreLine(id: string, arabic: boolean): string {
    return arabic ? `استعِد النسخة ${id}` : `restore copy ${id}`;
}

export const SHOW_COPIES_AR = 'اعرض نسخ بياناتي';
export const SHOW_COPIES_EN = 'show my data copies';
/** The line he sends to see the copies Joe keeps of his app's data, in the given language. */
export function showCopiesLine(arabic: boolean): string {
    return arabic ? SHOW_COPIES_AR : SHOW_COPIES_EN;
}

/** Marks of direction and zero-width characters: invisible, and carried along when he copies from the chat. */
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿]/gu;
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** The space between the words: a space, a tab or a no-break space, one or more. */
const SP = '[ \\t\\u00A0]+';
/** The restore line, after the forgiving steps: the verb and noun, the copy's id, the end. */
const THE_LINE = new RegExp(`^(?:[اأإ]ستعي?د${SP}النسخ[ةه]|restore${SP}copy)${SP}(\\d{8}-\\d{6}(?:-\\d{1,2})?)$`, 'u');
/** The show line, after the same steps. */
const SHOW_LINE = new RegExp(`^(?:[اأإ]عرض${SP}نسخ${SP}بياناتي|show${SP}my${SP}data${SP}copies)$`, 'u');

/** The message as the two lines are matched against it, or '' when it cannot be one of them. Pure. */
function folded(text: unknown): string {
    if (typeof text !== 'string') return '';
    let t = text.replace(INVISIBLE, '').trim();
    if (!t || t.length > 80) return '';
    //  One final «.» or «!» (a space before it allowed), nothing else.
    t = t.replace(/[ \t ]*[.!]$/u, '');
    return t
        .replace(/[٠-٩]/gu, d => String(ARABIC_INDIC.indexOf(d)))
        .replace(/[۰-۹]/gu, d => String(PERSIAN_DIGITS.indexOf(d)))
        //  Diacritics (U+064B–U+065F, U+0670) and tatweel — after the digits, which sit just above them.
        .replace(/[ً-ٰٟـ]/gu, '')
        //  The case of the English letters, and only theirs: «ſ» or the Kelvin sign never become «s» or «k».
        .replace(/[A-Z]/gu, c => c.toLowerCase());
}

/**
 * The copy id when his whole message is exactly the restore line, else undefined. Pure: it reads nothing but the text.
 * The caller passes what he TYPED — never a file's block, a picture's description or a model's words.
 */
export function restoreReplyCopyId(text: unknown): string | undefined {
    const t = folded(text);
    const m = t ? THE_LINE.exec(t) : null;
    return m ? m[1] : undefined;
}

/** Whether his whole message is exactly the line that shows his data copies. Pure, as restoreReplyCopyId. */
export function isShowCopiesLine(text: unknown): boolean {
    const t = folded(text);
    return !!t && SHOW_LINE.test(t);
}

/** Either of the two lines: the message is project_data_recovery's, and no other route reads it. */
export function isDataCopiesLine(text: unknown): boolean {
    return !!restoreReplyCopyId(text) || isShowCopiesLine(text);
}
