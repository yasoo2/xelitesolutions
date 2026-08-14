/**
 * promptNormalizer — a deterministic, language-universal understanding layer.
 *
 * The planner's fast-paths match literal MSA-Arabic/English keywords, so a prompt
 * in a dialect («فوت على جيت هاب», «ابغى تشوف»), with a typo («سجل دخولو»), or in
 * another language ("ouvre la page", "открой сайт", "打开页面") sailed past every
 * rule and landed on the weak local model, which mis-routed it.
 *
 * normalizeIntentText() produces a canonicalized COPY of the prompt (the original
 * is never mutated — extractions still read the user's own words):
 *   1. Unicode NFKC + strip Arabic diacritics/tatweel + unify alef forms.
 *   2. Fold Latin/Cyrillic accents (é→e, ü→u) and lowercase.
 *   3. Replace dialect & foreign intent verbs with the canonical keyword the
 *      planner already understands (Arabic dialects, en, fr, es, de, it, pt, tr,
 *      ru, hi, fa/ur, zh, ja, ko).
 *   4. Fix near-miss typos (Levenshtein ≤ 1) against the core keyword list.
 *
 * Detection regexes should test `original + '\n' + normalized` so nothing the
 * user literally wrote is ever lost.
 */

/** Dialect + multilingual verbs/nouns → the canonical keyword the planner knows.
 *  Keys are matched as whole words (or as substrings for CJK, which has no word
 *  boundaries). Keep keys in their FOLDED form (lowercase, accents stripped). */
const SYNONYMS: Record<string, string> = {
    // ---- Arabic dialects → MSA the fast-paths match ----
    'فوت': 'ادخل', 'فوتلي': 'ادخل', 'خش': 'ادخل', 'دش': 'ادخل',
    'روح': 'اذهب', 'رح': 'اذهب', 'سير': 'اذهب', 'امشي': 'اذهب',
    'ابغى': 'اريد', 'ابغا': 'اريد', 'ابي': 'اريد', 'بدي': 'اريد', 'بغيت': 'اريد', 'عايز': 'اريد', 'عاوز': 'اريد', 'اشتي': 'اريد',
    'شوف': 'انظر', 'شوفلي': 'انظر', 'طالع': 'انظر', 'بص': 'انظر', 'تشوف': 'ترى', 'وريني': 'أرني',
    'دور': 'ابحث', 'دورلي': 'ابحث', 'فتش': 'ابحث', 'حوس': 'ابحث', 'قوقل': 'ابحث',
    'ايش': 'ماذا', 'وش': 'ماذا', 'شو': 'ماذا', 'ايه': 'ماذا', 'شنو': 'ماذا',
    'سو': 'اعمل', 'سوي': 'اعمل', 'سولي': 'اعمل', 'اسوي': 'اعمل',
    'عطني': 'اعطني', 'هات': 'اعطني', 'جيب': 'اعطني', 'جيبلي': 'اعطني',
    // ---- "make/build" verbs: every spelling maps to the one the planner matches.
    // (After folding, «انشئ» «انشيء» «أنشئ» all become «انشي»; «إنشاء» becomes
    // «انشا» — both are listed so either reaches the build fast-path.)
    'انشيء': 'انشئ', 'انشاء': 'انشئ', 'انشا': 'انشئ', 'ننشئ': 'انشئ', 'تنشئ': 'انشئ',
    'ابنيلي': 'ابني', 'اصنعلي': 'اصنع', 'صمملي': 'صمم', 'اعمللي': 'اعمل',
    'بناء': 'ابن', 'تصميم': 'صمم', 'تطوير': 'طور', 'برمجة': 'اعمل',
    // ---- Verbal nouns (masdar) -> the imperative the fast-paths match.
    // «أضف» and «إضافة» are the same request; only the first was recognised.
    'اضافة': 'اضف', 'تغيير': 'غير', 'تعديل': 'عدل', 'تبديل': 'بدل',
    'تكبير': 'كبر', 'تصغير': 'صغر', 'تحسين': 'حسن', 'ازالة': 'احذف', 'حذف': 'احذف',
    // ---- Broken plurals -> the singular the fast-paths match.
    'الوان': 'لون', 'ازرار': 'زر', 'خطوط': 'خط', 'عناوين': 'عنوان', 'خلفيات': 'خلفية', 'احجام': 'حجم',
    'لوقن': 'تسجيل دخول', 'لوق ان': 'تسجيل دخول',
    // ---- French ----
    'ouvre': 'open', 'ouvrir': 'open', 'cherche': 'search', 'recherche': 'search',
    'connecte': 'login', 'connexion': 'login', 'va sur': 'go to', 'vas sur': 'go to',
    'enregistre': 'save', 'sauvegarde': 'save', 'envoie': 'send', 'envoyer': 'send',
    'ecris': 'write', 'traduis': 'translate', 'traduire': 'translate', 'decris': 'describe', 'resume la page': 'summarize the page',
    // ---- Spanish / Portuguese ----
    'abre': 'open', 'abrir': 'open', 'busca': 'search', 'buscar': 'search', 'pesquisa': 'search',
    'inicia sesion': 'login', 'iniciar sesion': 'login', 'guarda': 'save', 'guardar': 'save', 'salva': 'save',
    'envia': 'send', 'enviar': 'send', 'escribe': 'write', 'escreve': 'write',
    'traduce': 'translate', 'traducir': 'translate', 'traduz': 'translate',
    'describe la pagina': 'describe the page', 'descreve': 'describe', 'dime que hay': 'tell me what is on', 'que hay en': "what's on",
    'resumir': 'summarize', 'resuma': 'summarize', 'resumen': 'summary',
    // ---- German ----
    'offne': 'open', 'offnen': 'open', 'suche': 'search', 'suchen': 'search',
    'anmelden': 'login', 'einloggen': 'login', 'melde mich an': 'login',
    'speichere': 'save', 'speichern': 'save', 'sende': 'send', 'schicke': 'send',
    'schreibe': 'write', 'ubersetze': 'translate', 'beschreibe': 'describe',
    'fasse zusammen': 'summarize', 'geh zu': 'go to', 'gehe zu': 'go to', 'webseite': 'website', 'seite': 'page',
    // ---- Italian ----
    'apri': 'open', 'cerca': 'search', 'accedi': 'login', 'invia': 'send',
    'scrivi': 'write', 'traduci': 'translate', 'descrivi': 'describe', 'riassumi': 'summarize', 'vai su': 'go to', 'pagina': 'page',
    // ---- Turkish ----
    'giris yap': 'login', 'kaydet': 'save', 'gonder': 'send', 'cevir': 'translate',
    'ozetle': 'summarize', 'sayfa': 'page', 'sayfayi': 'page', 'web sitesi': 'website', 'sitesine gir': 'go to site',
    // ---- Russian (folded lowercase Cyrillic) ----
    'открой': 'open', 'открыть': 'open', 'найди': 'search', 'поищи': 'search', 'поиск': 'search',
    'войди': 'login', 'войти': 'login', 'вход': 'login', 'сохрани': 'save', 'сохранить': 'save',
    'отправь': 'send', 'отправить': 'send', 'напиши': 'write', 'переведи': 'translate',
    'опиши': 'describe', 'перейди': 'go to', 'страница': 'page', 'страницу': 'page', 'сайт': 'website',
    // ---- Hindi ----
    'खोलो': 'open', 'खोलें': 'open', 'खोजो': 'search', 'खोजें': 'search', 'ढूंढो': 'search',
    'सहेजो': 'save', 'भेजो': 'send', 'लिखो': 'write', 'अनुवाद': 'translate', 'वर्णन': 'describe', 'पेज': 'page', 'पृष्ठ': 'page',
    // ---- Farsi / Urdu (Arabic script, distinct words) ----
    'باز کن': 'open', 'جستجو': 'ابحث', 'وارد شو': 'login', 'ذخیره': 'save', 'بفرست': 'send',
    'کھولو': 'open', 'کھولیں': 'open', 'تلاش کرو': 'ابحث', 'محفوظ کرو': 'save', 'بھیجو': 'send',
    // ---- CJK (matched as substrings — no word boundaries in these scripts) ----
    '打开': 'open', '打開': 'open', '搜索': 'search', '搜尋': 'search', '登录': 'login', '登入': 'login',
    '保存': 'save', '发送': 'send', '翻译': 'translate', '翻譯': 'translate', '总结': 'summarize', '网页': 'page', '网站': 'website',
    '開いて': 'open', '検索': 'search', 'ログイン': 'login', '送信': 'send', '要約': 'summarize', 'ページ': 'page',
    '열어': 'open', '검색': 'search', '로그인': 'login', '저장': 'save', '보내': 'send', '번역': 'translate', '요약': 'summarize', '페이지': 'page',
};

/** Core keywords eligible for typo-repair (Levenshtein ≤ 1). Longer words only —
 *  short words produce false positives (e.g. sand→send). */
const FUZZY_KEYWORDS = [
    // Arabic (≥4 letters)
    'افتح', 'ابحث', 'دخول', 'تسجيل', 'احفظ', 'ارسل', 'اكتب', 'ترجم', 'صفحة', 'متصفح', 'موقع', 'انظر',
    'انشئ', 'اصنع', 'ابني', 'صمم', 'شركة', 'تطبيق', 'واجهة', 'مستودع', 'حلل',
    // Latin (≥5 letters)
    'search', 'login', 'visit', 'browse', 'describe', 'write', 'translate', 'summarize', 'website', 'google', 'browser',
];

const AR_DIACRITICS = /[ً-ْٰـ]/g; // tashkeel + dagger alef + tatweel

/**
 * HARAKAT ARE NOT WORD BOUNDARIES.
 *
 * Exported because a matcher that asserts Arabic word boundaries — and it
 * must, since `\b` is meaningless for Arabic — will otherwise be defeated by
 * a single vowel mark. `«ابنِ نظاماً»` is «ابن» followed by a kasra, and a
 * lookahead for `(?=$|[\s،:؛])` sees the kasra, not the space, and refuses
 * the match. The user then watches a plain build order fall through to a
 * planner it never needed.
 *
 * The answer is never to add «ابنِ» to a list beside «ابن» — that is the
 * whitelist disease, and the next form («ابنُ», «اِبن») is already waiting.
 * Strip the marks and match the letters.
 */
export function stripArabicDiacritics(raw: string): string {
    return String(raw || '').replace(AR_DIACRITICS, '');
}

function foldChars(s: string): string {
    let out = String(s || '').normalize('NFKC');
    out = out.replace(AR_DIACRITICS, '');
    out = out.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');
    // Hamza carriers are the single biggest source of Arabic "same word, different
    // spelling": «انشئ» / «انشيء» / «إنشاء» are one verb to a reader and three
    // distinct strings to a regex. One of those spellings cost a user their whole
    // request — the build fast-path missed and the request fell through to the
    // generic planner. Fold them all to a bare carrier; keys are folded the same
    // way, so both sides of every comparison agree.
    out = out.replace(/ئ/g, 'ي').replace(/ؤ/g, 'و').replace(/ء/g, '').replace(/ة/g, 'ه');
    // Strip accents from Latin/Cyrillic (NFD splits the base letter from the mark).
    out = out.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    return out.toLowerCase();
}

function levenshtein1(a: string, b: string): boolean {
    // true iff edit distance is EXACTLY 1 (equality is handled elsewhere)
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (la === lb) { i++; j++; }        // substitution
        else if (la > lb) { i++; }          // deletion in b
        else { j++; }                       // insertion in b
    }
    edits += (la - i) + (lb - j);
    return edits === 1;
}

// The lookup table with its keys passed through the SAME character folding the
// input text gets — otherwise a key like Russian 'открой' (whose й decomposes
// under NFD) can never match the folded input.
const FOLDED_SYNONYMS: Record<string, string> = {};
for (const [k, v] of Object.entries(SYNONYMS)) FOLDED_SYNONYMS[foldChars(k)] = v;
const PHRASE_KEYS = Object.keys(FOLDED_SYNONYMS)
    .filter(k => k.includes(' ') || /[　-鿿぀-ヿ가-힯]/.test(k))
    .sort((a, b) => b.length - a.length);

// Typo repair compares a FOLDED token against these, so the keywords have to be
// folded too — otherwise a keyword that changes under folding (صفحة → صفحه) can
// only ever be reached by accident, through the edit-distance slack. Each entry
// keeps the original spelling as the value: that is what gets written into the
// canonical text, and it is what the planner's regexes look for.
const FOLDED_FUZZY: Array<[string, string]> = FUZZY_KEYWORDS.map(k => [foldChars(k), k]);

/** Produce the canonicalized companion text for intent detection. */
export function normalizeIntentText(raw: string): string {
    let text = foldChars(raw);
    if (!text.trim()) return '';

    // 1) Multi-word + CJK synonym phrases first (longest keys win).
    for (const key of PHRASE_KEYS) {
        if (text.includes(key)) text = text.split(key).join(` ${FOLDED_SYNONYMS[key]} `);
    }

    // 2) Single-word synonyms + typo repair, token by token (spaces/punctuation
    //    delimited scripts). The Arabic conjunction prefix «و» is peeled so
    //    «وشوف» still canonicalizes to «وانظر».
    const tokens = text.split(/(\s+|[.,،;:!؟?()«»"'-])/);
    const mapped = tokens.map(tok => {
        if (!tok || /^\s+$/.test(tok) || tok.length < 2) return tok;
        const bare = tok;
        let prefix = '';
        let core = bare;
        if (/^و[؀-ۿ]/.test(core)) { prefix = 'و'; core = core.slice(1); }
        if (FOLDED_SYNONYMS[core]) return prefix + FOLDED_SYNONYMS[core];
        // The definite article hides the word from the table: «الالوان» is «الوان».
        // Peel it and retry once — matching is against intent keywords only, so a
        // stray peel cannot invent an intent that isn't in the table.
        if (/^ال[؀-ۿ]{2,}/.test(core)) {
            const bare = core.slice(2);
            if (FOLDED_SYNONYMS[bare]) return prefix + FOLDED_SYNONYMS[bare];
        }
        // typo repair: exact-1 edit from a core keyword
        const minLen = /[؀-ۿ]/.test(core) ? 4 : 5;
        if (core.length >= minLen) {
            for (const [folded, kw] of FOLDED_FUZZY) {
                // Exact match AFTER folding: the user wrote the same word with a
                // different (equally correct) spelling — «صفحه» for «صفحة». Restore
                // the spelling the planner's regexes are written against.
                if (core === folded) return prefix + kw;
                if (Math.abs(folded.length - core.length) <= 1 && levenshtein1(core, folded)) return prefix + kw;
            }
        }
        return tok;
    });
    return mapped.join('').replace(/\s{2,}/g, ' ').trim();
}

/** Convenience: the string detection regexes should probe — the user's original
 *  words plus the canonicalized companion, newline-separated. */
export function intentProbe(raw: string): string {
    const norm = normalizeIntentText(raw);
    return norm && norm !== String(raw || '').toLowerCase() ? `${raw}\n${norm}` : String(raw || '');
}
