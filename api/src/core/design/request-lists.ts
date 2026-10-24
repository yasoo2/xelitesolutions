/**
 * HOW A PERSON WRITES A LIST — read once, for every reader that needs it.
 *
 * Eval round 15 (2026-10-24, P101):
 *
 *     «أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها
 *      نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز
 *      أخطاء صحيحة واختبارات آلية لكل نقطة.»
 *
 * Three readers of that sentence each lost it a different way, and Joe built
 * a stock booking API that passed every gate:
 *
 *   - the requirement reader put `\b` after every Arabic verb — JavaScript's
 *     `\b` is ASCII-only even with /u, so no Arabic clause could ever match,
 *     and the request produced zero acceptance criteria;
 *   - the entity reader skipped «نقاط وصول لـالمرضى» for having three words,
 *     because nothing took the interface head «نقاط وصول لـ» off the noun;
 *   - the shape reader split «وصول» at its first letter as if it were the
 *     conjunction «و», and made a table out of «صول لـالمرضى».
 *
 * Everything here is a shape of the language — a word boundary, a waw that
 * belongs to its word, a preposition glued to its noun, the noun phrases
 * software requests use to introduce their resources — never a domain.
 */

/** A word ends here: the next character is not a letter or digit in ANY script (use with /u). */
export const WORD_END = '(?![\\p{L}\\p{N}])';
/** A word starts here (use with /u). */
export const WORD_START = '(?<![\\p{L}\\p{N}])';
/** One alef, whichever hamza form the writer typed: «أنشئ» «انشئ» «إنشئ». */
export const ALEF = '[اأإآ]';

const AR_LETTER = '[\\u0621-\\u064A]';

/**
 * Words whose FIRST LETTER is a root waw, not the conjunction: «وصول»,
 * «وصف», «وقت», «وزن», «وحدات»… Splitting them gives «صول», «صف», «قت».
 * A short list of the language's own words — it does not grow with domains.
 */
const RADICAL_WAW = `(?:صول|صف|صفات?|صف[ةه]|قت|قات|زن|حد[ةه]|حدات|ثائق|ثيق[ةه]|ظائف|ظيف[ةه]|رش[ةه]?|كلاء|كيل|سائل|سيل[ةه]|جه[ةه]|جهات|كال[ةه]|زار[ةه]|لاي[ةه]|جبات|جب[ةه])(?!${AR_LETTER})`;

/** The conjunction «و» glued to the next item: space + waw + an Arabic letter, unless the waw is the word's own. */
export const CONJUNCTION_WAW_SOURCE = `\\s+و(?=${AR_LETTER})(?!${RADICAL_WAW})`;

/** Every list separator a request uses: punctuation, «and», and the glued «و». */
export const LIST_SEPARATOR = new RegExp(`(?:\\s*(?:،|,|؛|;|\\/|\\+)\\s*)|(?:\\s+and\\s+)|(?:${CONJUNCTION_WAW_SOURCE})`, 'iu');

/**
 * The noun phrases a software request uses to introduce its resources:
 * «نقاط وصول لـ…», «endpoints for …», «management of …», «إدارة الـ…».
 * What follows them is the list of things the system holds; the head itself
 * is never a table.
 */
// Not «API», «page», «screen», «section»: «an API for a school» names the
// artifact, and «sections for about, services and contact» lists a landing
// page's sections — those heads are not followed by a system's tables.
const HEAD_NOUN = '(?:end-?points?|routes?|resources?|crud(?:\\s+operations?)?|management'
    + '|نقاط\\s+(?:ال)?وصول|نقاط\\s+(?:ال)?نهاية|مسارات|موارد)';
const INTERFACE_HEAD = new RegExp(
    `${WORD_START}${HEAD_NOUN}\\s+(?:for|of)\\s+`
    + `|${WORD_START}${HEAD_NOUN}\\s+(?=[لب]ـ|لل|ل(?=ال))`
    + `|${WORD_START}(?:إدارة|ادارة)\\s+(?=ال|[لب]ـ|لل)`
    + `|${WORD_START}manag(?:e|ing)\\s+(?!(?:the|a|an|to|it|them|this|that|their|your|my|our|all)\\b)`,
    'iu');

/** The plain openers: «فيها», «يشمل», «including», «with» … */
const OPENER = /(?:يشمل|تشمل|يحتوي(?: على)?|تحتوي(?: على)?|فيه|فيها|به|بها|مكوّ?ن من|يتكوّ?ن من|including|includes?|containing|contains?|with)\s+(.+)$/i;

export type ListMarker = 'head' | 'colon' | 'opener';

/**
 * The listed part of a sentence and what introduced it — an interface head
 * first (it is the most specific), then a colon, then a plain opener. A head's
 * list ends at the next colon or sentence end: «manage patients, appointments,
 * treatments: add, edit…» lists three tables, not the actions after them.
 */
export function listRegion(text: string): { region: string; marker: ListMarker; head?: string } | null {
    const req = String(text || '').replace(/\s+/g, ' ').trim();
    if (!req) return null;
    const head = req.match(INTERFACE_HEAD);
    if (head && head.index !== undefined) {
        const after = req.slice(head.index + head[0].length);
        const region = after.split(/[:：.!?؟]/u)[0].trim();
        if (region) return { region, marker: 'head', head: head[0].trim() };
    }
    const colon = req.match(/[:：]\s*(.+)$/);
    if (colon) return { region: colon[1], marker: 'colon' };
    const opener = req.match(OPENER);
    return opener ? { region: opener[1], marker: 'opener' } : null;
}

/**
 * The noun under an attached preposition: «لـالمرضى» → «المرضى», «للمرضى» →
 * «المرضى» (the article's alef drops after lam), «بـالكتب» → «الكتب».
 */
export function stripAttachedPreposition(token: string): string {
    const t = String(token || '').trim();
    const tatweel = t.match(/^[لب]ـ+\s*(.+)$/u);
    if (tatweel) return tatweel[1].trim();
    const lamLam = t.match(new RegExp(`^لل(${AR_LETTER}{2,}.*)$`, 'u'));
    if (lamLam) return `ال${lamLam[1]}`;
    const withArticle = t.match(new RegExp(`^[بل](ال${AR_LETTER}{2,}.*)$`, 'u'));
    if (withArticle) return withArticle[1];
    return t;
}

/** One list item, cleaned: no leading conjunction or article, its noun out of its preposition. */
export function cleanListItem(raw: string): string {
    let item = String(raw || '').trim()
        .replace(/^(?:and|or|then|with|مع)\s+/iu, '')
        .replace(/^(?:a|an|the)\s+/i, '')
        .replace(/[.،؛!?؟"'()«»:]+$/gu, '')
        .replace(/^[.،؛!?؟"'()«»:]+/gu, '')
        .trim();
    const words = item.split(/\s+/);
    if (words.length) words[0] = stripAttachedPreposition(words[0]);
    item = words.join(' ').trim();
    return item;
}

/** A list split into its items, each cleaned. */
export function splitListItems(region: string): string[] {
    return String(region || '').split(LIST_SEPARATOR)
        .map(cleanListItem)
        .filter(Boolean);
}

/**
 * A DELIVERABLE, NOT A TABLE.
 *
 * «التحقق من المدخلات», «رموز أخطاء صحيحة», «اختبارات آلية لكل نقطة»,
 * «input validation», «proper error codes», «automated tests» — qualities the
 * built software must HAVE. Reading them as tables gave P101 three phantom
 * collections (almdkhlats, shyhas, testings); they are requirements, and the
 * requirement reader carries them.
 */
export const DELIVERABLE = new RegExp(
    `(?:^|\\s)(?:ال)?(?:تحقق|تحقّق|اختبار|رموز\\s+(?:ال)?أخطاء|أكواد\\s+(?:ال)?أخطاء|رسائل\\s+(?:ال)?أخطاء|معالجة\\s+(?:ال)?أخطاء|توثيق)`
    + '|\\b(?:validat\\w*|tests?|testing|error\\s+(?:codes?|handling|messages?)|status\\s+codes?|documentation|docs)\\b',
    'iu');

export function isDeliverable(phrase: string): boolean {
    return DELIVERABLE.test(String(phrase || ''));
}

/** The head itself, standing alone («نقاط وصول», «endpoints») — the way in to the tables, never one of them. */
export function isInterfaceNoun(phrase: string): boolean {
    return new RegExp(`^${HEAD_NOUN}$`, 'iu').test(String(phrase || '').trim());
}

/**
 * A PHRASE OWNED BY SOMEONE IS A FIELD OF WHAT THEY DO, NEVER A CAPABILITY.
 *
 * Eval round 15 (2026-10-24, P251): «… book with their name and phone …»
 * ended the build with «requested capabilities not proven: their name» —
 * the gap reader took the fields of the booking action for a feature of the
 * app. «their name», «باسمه ورقم هاتفه», «مواعيدها» name what a person
 * enters or owns. English marks it with a possessive determiner; Arabic with
 * a pronoun suffix — two-letter suffixes (ها/هم/هن/كم/كن) on any word, or the
 * one-letter ه/ك on two words of the item («اسمه ورقم هاتفه»), never on one
 * word alone, because informal Arabic writes ة as ه («سله مشتريات»).
 */
export function isPossessivePhrase(phrase: string): boolean {
    const t = String(phrase || '').trim();
    if (!t) return false;
    if (/^(?:their|his|her|your|my|our|its)\s/i.test(t)) return true;
    const words = t.split(/\s+/);
    if (words.some(w => new RegExp(`^${AR_LETTER}{2,}(?:ها|هم|هن|كم|كن)$`, 'u').test(w))) return true;
    const suffixed = words.filter(w => new RegExp(`^${AR_LETTER}{2,}[هك]$`, 'u').test(w) && !/يه$/u.test(w));
    return suffixed.length >= 2;
}
