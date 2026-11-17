/**
 * THE ONE LINE THAT BRINGS A COPY OF HIS DATA BACK (review 9, H1 M1).
 *
 * Two rounds of reading his intent from words each opened a new hole: a question, a quote, a «later» or an «if» that
 * held the id and «نعم» brought an old copy back over today's records (review 9, H1), and ordinary work — «رجع
 * البيانات مرتبة حسب التاريخ», «restore the data validation on the form» — was taken for a request for his copies
 * (M1). So no word decides it any more. Joe's list of the copies ends with one line, and ONLY that line, sent back by
 * him as his whole message, restores the copy it names:
 *
 *     استعِد النسخة 20261117-002502          restore copy 20261117-002502
 *
 * The whole typed message, after trimming whitespace, must be exactly that line; only one final «.» or «!» is
 * tolerated. Quotes around it, a word before or after it, a question mark, a second line — anything else is not it,
 * and restores nothing. What is forgiven is only what the eye cannot see or the keyboard changes on its own: the
 * marks of direction a copy from a right-to-left chat carries, Arabic diacritics and tatweel, Arabic-Indic digits,
 * the case of the English letters (a phone capitalises the first one), «ه» for the final «ة», and the width of the
 * spaces between the words. Whether the copy it names is one the most recent list of his showed is decided by the
 * tool, from its own records (ProjectDataRecoveryTool) — never by a model.
 */

/** The line he sends back to bring copy `id` back, in the list's language. */
export function restoreLine(id: string, arabic: boolean): string {
    return arabic ? `استعِد النسخة ${id}` : `restore copy ${id}`;
}

/** Marks of direction and zero-width characters: invisible, and carried along when he copies from the chat. */
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿]/gu;
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** The line itself, after the forgiving steps above: the verb and noun, one space-run, the copy's id, the end. */
const THE_LINE = /^(?:استعد[ \t ]+النسخ[ةه]|restore[ \t ]+copy)[ \t ]+(\d{8}-\d{6}(?:-\d{1,2})?)$/iu;

/**
 * The copy id when his whole message is exactly the restore line, else undefined. Pure: it reads nothing but the text.
 * The caller passes what he TYPED — never a file's block, a picture's description or a model's words.
 */
export function restoreReplyCopyId(text: unknown): string | undefined {
    if (typeof text !== 'string') return undefined;
    let t = text.replace(INVISIBLE, '').trim();
    if (!t || t.length > 80) return undefined;
    //  One final «.» or «!», nothing else.
    if (/[.!]$/u.test(t)) t = t.slice(0, -1);
    t = t
        .replace(/[٠-٩]/gu, d => String(ARABIC_INDIC.indexOf(d)))
        .replace(/[۰-۹]/gu, d => String(PERSIAN_DIGITS.indexOf(d)))
        //  Diacritics (U+064B–U+065F, U+0670) and tatweel — after the digits, which sit just above them.
        .replace(/[ً-ٰٟـ]/gu, '');
    const m = THE_LINE.exec(t);
    return m ? m[1] : undefined;
}
