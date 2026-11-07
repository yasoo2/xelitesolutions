/**
 * AN ARABIC KEYWORD IS A WORD, NOT A STRING OF LETTERS.
 *
 * «ابني تطبيق حجز لـمغسلة ملابس» (P272, 2026-11-06) asked for a laundry's
 * booking app. «مغسلة» — laundry — carries the three letters of «سلة»,
 * basket, and every reader that wrote «سلة» bare read a shopping cart in it:
 * the page kind came out «store», and the scope gate demanded «orders» and
 * refused the delivery four times in a row, «artifact coverage 0% — missing:
 * orders», for a request that never said order, cart or buy. A comment beside
 * those readers said Arabic needs no word boundary because its keywords are
 * whole distinctive words; a word inside another word is the counterexample.
 *
 * A Latin keyword is bounded with \b. An Arabic one cannot be: the language
 * glues its little words to the next one («والسلة», «بالمتجر», «لـمغسلة»,
 * «سيبحث») and its endings to the stem («حجوزاتي», «إحصائيات»). So a match
 * is accepted as a word when what stands before it, inside the same word, is
 * only those prefixes (و ف, ب ك ل, the article, لل, the future س, the
 * imperfect ي ت ن أ, a tatweel), and what stands after it is only an ending
 * (the plural and feminine endings, the nisba, the attached pronouns). Both
 * lists are closed classes of the language; they do not grow with domains.
 *
 * Every match in the text is tried, not only the first: «مغسلة … مع سلة
 * مشتريات» is a cart at its second «سلة».
 *
 * The acceptance catalogue already reads its own words this way
 * (acceptance.ts requestAsksFor, with its own shorter lists); this is the
 * same rule for every other reader. probe/arabic-inside-words.cjs in the
 * eval folder lists the readers that still match inside words on the exam
 * prompts (2026-11-06: «لون» in «صالون», «وردي» in «الموردين», «قوي» in
 * «تقويم» in design readers the engine does not reach).
 */

/** A letter, a digit or a mark: the characters a word is made of. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const MARKS = /\p{M}/gu;
const ARABIC = /[؀-ۿ]/u;

/** What may stand before an Arabic keyword inside its word. */
const PREFIX = /^[وف]?(?:لل|[بكل]ـ?ال|[بكل]ـ?|ال|س?[يتنأ])?$/u;
/** What may stand after it. */
const SUFFIX = /^(?:يات|يين|يون|ية|يه|ات|ون|ين|ان|تين|تان|ة|ه|ي|ا|ت)?(?:ها|هما|هم|هن|ه|نا|كما|كم|كن|ك|ي)?$/u;

function charAt(text: string, i: number): string {
    return i >= 0 && i < text.length ? text[i] : '';
}

/** The match [start, end) stands as whole Arabic words in text (a Latin end is the pattern's own business). */
export function standsAsWords(text: string, start: number, end: number): boolean {
    if (end <= start) return true;
    const first = charAt(text, start);
    const last = charAt(text, end - 1);
    if (ARABIC.test(first)) {
        let a = start;
        while (a > 0 && WORD_CHAR.test(charAt(text, a - 1))) a--;
        if (!PREFIX.test(text.slice(a, start).replace(MARKS, ''))) return false;
    }
    if (ARABIC.test(last)) {
        let b = end;
        while (b < text.length && WORD_CHAR.test(charAt(text, b))) b++;
        if (!SUFFIX.test(text.slice(end, b).replace(MARKS, ''))) return false;
    }
    return true;
}

/**
 * The first match of `re` in `text` whose Arabic ends stand as words. A plain
 * RegExp is walked with a global copy, so lookbehinds keep their context; a
 * RegExp subclass with its own exec (FoldedRegExp) is walked by slicing.
 */
export function wordMatch(re: RegExp, text: string): RegExpExecArray | null {
    const s = String(text ?? '');
    if (re.constructor === RegExp) {
        const g = new RegExp(re.source, re.flags.replace(/[gy]/gu, '') + 'g');
        for (let m = g.exec(s); m; m = g.exec(s)) {
            if (standsAsWords(s, m.index, m.index + m[0].length)) return m;
            g.lastIndex = m.index + 1;
        }
        return null;
    }
    for (let pos = 0; pos <= s.length;) {
        const m = re.exec(s.slice(pos));
        if (!m) return null;
        const at = pos + m.index;
        if (standsAsWords(s, at, at + m[0].length)) {
            (m as any).index = at;
            (m as any).input = s;
            return m;
        }
        pos = at + 1;
    }
    return null;
}

/** `re` names something in `text` as a word, not as letters inside another word. */
export function asksAsWords(re: RegExp, text: string): boolean {
    return wordMatch(re, text) !== null;
}
