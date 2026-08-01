/**
 * What Joe is allowed to LEARN about a user from their own words — and, just
 * as importantly, what he must refuse to learn.
 *
 * The old extractor matched `(?:انا|أنا|name is|i am|i'm)\s+(\w+)` and stored
 * the next word as the user's NAME. Every ordinary build request begins with
 * exactly that shape: «أنا أريد بناء موقع» → name «أريد», «I am building an
 * api» → name «building». Joe then greeted the user by a verb. A wrong fact
 * learned confidently is worse than no fact.
 *
 * These are pure, deterministic, and tested against those exact real inputs.
 * The rule: learn a name ONLY from an explicit self-introduction («اسمي X»,
 * «my name is X», «call me X»), never from the ambiguous «I am …», and reject
 * a captured token that is a verb/stopword or obviously not a name.
 */

export interface ProfileLearnings {
    name?: string;
    programmingLanguages: string[];
    projectTypes: string[];
}

// Words that follow «أنا/انا» or «I am» in ordinary requests — never a name.
// Kept deliberately broad on the verb side: a false "no name" is harmless, a
// false name poisons every future greeting.
const AR_STOPWORDS = new Set([
    'اريد', 'أريد', 'احتاج', 'أحتاج', 'ابني', 'أبني', 'اعمل', 'أعمل', 'اصمم', 'أصمم',
    'ابحث', 'أبحث', 'اكتب', 'أكتب', 'افتح', 'أفتح', 'اطلب', 'أطلب', 'راغب', 'مهتم',
    'جاهز', 'هنا', 'الان', 'الآن', 'ايضا', 'أيضا', 'فقط', 'لا', 'نعم', 'من', 'في',
]);
const EN_STOPWORDS = new Set([
    'building', 'making', 'creating', 'looking', 'trying', 'working', 'writing',
    'needing', 'wanting', 'developing', 'a', 'an', 'the', 'not', 'just', 'here',
    'ready', 'interested', 'going', 'still', 'now', 'also', 'very',
]);

/** A plausible human name: letters only, sane length, not a known stopword. */
function isPlausibleName(raw: string): boolean {
    const w = raw.trim();
    if (w.length < 2 || w.length > 24) return false;
    if (/\d/.test(w)) return false;
    if (AR_STOPWORDS.has(w) || EN_STOPWORDS.has(w.toLowerCase())) return false;
    // Letters (Arabic or Latin), optionally a single internal space for two-part
    // names — but our capture is one token, so just letters here.
    return /^[؀-ۿa-zA-Z][؀-ۿa-zA-Z'’-]*$/.test(w);
}

/**
 * Detect a name ONLY from an explicit introduction. Returns '' when the text
 * is not a self-introduction — the safe default that stops the corruption.
 */
export function extractName(content: string): string {
    const text = String(content || '');
    // Explicit, unambiguous introductions only. Note: «أنا» / «I am» are NOT
    // here on purpose — they precede verbs far more often than names.
    const patterns = [
        /(?:اسمي|إسمي|اسمى)\s+([؀-ۿ][؀-ۿ'’-]{1,23})/,
        /(?:my name is|call me|i am called|this is)\s+([a-zA-Z][a-zA-Z'’-]{1,23})/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && isPlausibleName(m[1])) return m[1].trim();
    }
    return '';
}

const KNOWN_LANGS = /\b(javascript|typescript|python|java|golang|go|rust|php|ruby|c\+\+|c#|swift|kotlin|react|vue|angular|svelte|next\.?js|node\.?js|django|flask|laravel|tailwind)\b/gi;

export function extractProfileLearnings(content: string): ProfileLearnings {
    const text = String(content || '');
    const out: ProfileLearnings = { programmingLanguages: [], projectTypes: [] };

    const name = extractName(text);
    if (name) out.name = name;

    const langs = text.match(KNOWN_LANGS);
    if (langs) out.programmingLanguages = Array.from(new Set(langs.map(l => l.toLowerCase())));

    const types = text.match(/\b(website|web app|webapp|api|mobile app|dashboard|landing page|portfolio|store|blog)\b/gi)
        || text.match(/(موقع|متجر|لوحة تحكم|صفحة هبوط|معرض أعمال|مدونة|تطبيق)/g);
    if (types) out.projectTypes = Array.from(new Set(types.map(l => l.toLowerCase())));

    return out;
}

/**
 * Is a stored profile name one the OLD buggy extractor poisoned? Used to heal
 * profiles already on disk so a returning user stops being called «أريد».
 */
export function isCorruptedName(name: string | undefined): boolean {
    const w = String(name || '').trim();
    if (!w) return false;
    return AR_STOPWORDS.has(w) || EN_STOPWORDS.has(w.toLowerCase()) || !isPlausibleName(w);
}

/** Normalize Arabic so recall matches «البرمجة» against «برمجة». */
export function normalizeForMatch(s: string): string {
    return String(s || '')
        .toLowerCase()
        .replace(/[ً-ٰٟ]/g, '')       // harakat
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ـ/g, '');
}
