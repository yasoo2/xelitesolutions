/**
 * WHAT THE SITE IS ABOUT — NOT WHAT THE USER TOLD THE AGENT TO DO.
 *
 * An outside test sent Joe a realistic brief:
 *
 *   «أنت تعمل داخل مساحة اختبار معزولة. أنشئ في مساحة العمل الحالية تطبيق صفحة
 *    هبوط عربية متجاوبة لورشة تصميم اسمها «نور» … لا تستخدم الإنترنت، لا تنشر،
 *    لا تثبت حزمًا من الشبكة … أكمل المهمة ذاتيًا ولا تطلب مني توضيحًا.»
 *
 * and the delivered page's headline was that paragraph. All 500 characters of
 * it, instructions included, set as an `<h1>` — «نور — أنت تعمل داخل مساحة
 * اختبار معزولة…». The tagline and the footer carried it too.
 *
 * The line that did it was one `replace`:
 *
 *   const subject = request.replace(/(ابنِ|ابني|انشئ|…|لي|build|create|…)/gi, ' ')
 *
 * Two faults in a single expression, and both are the same mistake:
 *
 *   1. IT ASSUMED THE REST IS THE SUBJECT. Delete a list of build verbs, call
 *      whatever survives «the subject», and put it in the `<h1>` with no bound
 *      on its length. That works for «ابنِ موقع مطعم» and cannot work for any
 *      brief a person would actually write, because a brief contains
 *      CONSTRAINTS as well as a subject, and constraints are not copy.
 *
 *   2. IT MATCHED SUBSTRINGS, NOT WORDS. `لي` is in the list, so «الحالية»
 *      became «الحا ة» and «محليًا» became «مح ًا». Arabic words were being
 *      cut open from the inside, which is visible in the delivered page.
 *
 * The shape of the fix is the one this project keeps arriving at: a list of
 * DOMAINS is infinite and a list of SHAPES is finite. There is no end to the
 * things a person might build, but there is a very short list of ways a
 * sentence can be an instruction to the agent rather than a description of the
 * product: a negative imperative («لا تنشر»), a meta-verb about the task
 * itself («أكمل المهمة», «اذكر الملفات»), or a sentence addressed to «أنت».
 *
 * So this keeps the clause that NAMES something and drops the ones that
 * COMMAND something — then caps what is left at the length of an actual
 * headline, because a title of 500 characters is not a title even when every
 * word of it is on topic.
 */

/** A clause that tells the AGENT what to do. Shapes, not topics. */
const INSTRUCTION: RegExp[] = [
    // Negative imperatives: «لا تنشر»، «لا تستخدم الإنترنت»، "do not deploy".
    /(^|\s)(لا|ولا)\s*ت\S+/u,
    /\b(do\s+not|don'?t|never)\b/i,
    // Meta-verbs about the task rather than about the product.
    /(أكمل|اكمل|نفّ?ذ|نفذ|اذكر|أذكر|اشرح|وضّ?ح|أرسل|ارسل|أضف\s+ملاحظة|قم\s+ب|تأكد|تحقّ?ق|تحقق|افحص|اختبر|راجع|استخدم|استعمل|احفظ|شغّ?ل|شغل|ثبّ?ت|ثبت|انشر|اعرض\s+النتيجة)/u,
    /\b(make\s+sure|verify|check|test|report|run\s+the|install|deploy|publish|use\s+the|complete\s+the\s+task)\b/i,
    // Sentences addressed to the agent, or about the run itself.
    /(أنت\s+تعمل|انت\s+تعمل|مساحة\s+(اختبار|العمل)|بيئة\s+معزولة|في\s+النهاية|المطلوب\s*:|بدون\s+أن\s+تطلب|ولا\s+تطلب)/u,
    /\b(you\s+are\s+(working|running)|sandbox|workspace|at\s+the\s+end|without\s+asking)\b/i,
];

/**
 * Build verbs, removed only when they stand as WHOLE words.
 *
 * `\b` does not work on Arabic in a useful way — Arabic letters are word
 * characters, but so is everything around them, and there is no case or
 * punctuation to lean on. The boundary is asserted explicitly instead: what
 * precedes and follows must not be another Arabic letter.
 */
const BUILD_VERBS = [
    'ابنِ', 'ابني', 'ابن', 'انشئ', 'أنشئ', 'اصنع', 'اعمل', 'سوي', 'صمّم', 'صمم', 'جهّز', 'جهز',
    'لي', 'مشروع', 'تطبيق', 'موقع', 'صفحة', 'هبوط', 'landing', 'react', 'ريأكت', 'رياكت', 'vite', 'فيت', 'جديد', 'جديدة',
    'build', 'create', 'make', 'app', 'project', 'site', 'website', 'page', 'a', 'an', 'the', 'for',
];

const AR = '\\u0621-\\u064A';

/** Strip a whole word, in a way that cannot cut «الحالية» into «الحا ة». */
function stripWord(text: string, word: string): string {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // One shape for both scripts, and always exactly one capture group, so the
    // replacement never has to guess what `replace` handed it. (An earlier
    // version used `\b…\b` with no group for Latin words and pasted the match
    // OFFSET into the text: «Build a landing page» came out «0 a landing 13».)
    const re = new RegExp(`(^|[^${AR}\\w])${esc}(?=[^${AR}\\w]|$)`, 'gi');
    return text.replace(re, (_m, pre: string) => `${pre || ''} `);
}

/**
 * THE PHRASE THAT NAMES THE THING.
 *
 * «لورشة تصميم اسمها «نور»» — the words just before «اسمها» say what it IS,
 * and that is the whole tagline anyone needs. This is a SHAPE («… اسمها X»,
 * «a … called X»), not a list of domains, so it works for a workshop, a
 * clinic, a bakery and everything nobody has thought of yet.
 */
const NAMING = /(?:اسمها|اسمه|تسمى|يسمى|باسم|called|named)\s/u;

function phraseBeforeName(clause: string): string {
    const m = NAMING.exec(clause);
    if (!m) return '';
    const before = clause.slice(0, m.index).trim();
    // The last few words before the name are the description of the thing;
    // anything earlier belongs to the sentence that carried it.
    const words = before.split(/\s+/).filter(Boolean);
    return words.slice(-4).join(' ');
}

/** Split on sentence ends AND on the semicolons a brief uses for its clauses. */
function clausesOf(request: string): string[] {
    return String(request || '')
        .split(/[.؟?!\n؛;]+/u)
        .map(s => s.trim())
        .filter(Boolean);
}

export function isInstructionClause(clause: string): boolean {
    return INSTRUCTION.some(re => re.test(clause));
}

/**
 * The subject of the build, as a phrase short enough to be a headline.
 *
 * Returns '' when the request says nothing about a subject — the caller then
 * uses its own generic line, which is the honest outcome: better a neutral
 * tagline than the user's own instructions read back at him.
 */
export function subjectPhrase(request: string, maxChars = 72): string {
    const all = clausesOf(request);

    /**
     * The naming phrase is searched in EVERY clause, including the ones that
     * read as instructions — because «أنشئ في مساحة العمل الحالية … لورشة
     * تصميم اسمها «نور»» is an instruction that happens to carry the only true
     * description of the subject in the whole brief. The shape validates
     * itself: whatever sits before «اسمها» is what the thing IS, no matter
     * which sentence it arrived in.
     */
    let best = '';
    for (const c of all) {
        const p = phraseBeforeName(c);
        if (p) { best = p; break; }
    }
    // Only the FALLBACK needs the instruction filter: with no naming phrase,
    // the shortest descriptive clause is the best guess available, and an
    // instruction must never become one.
    if (!best) {
        const said = all.filter(c => !isInstructionClause(c));
        if (!said.length) return '';
        best = said.slice().sort((a, b) => a.length - b.length)[0] || '';
    }

    for (const w of BUILD_VERBS) best = stripWord(best, w);
    best = best
        .replace(/(^|\s)(عربية|عربي|متجاوبة|متجاوب|responsive|arabic)(?=\s|$)/gu, ' ')
        .replace(/[«»"']/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,،:\-–—]+|[\s,،:\-–—]+$/g, '')
        // «لورشة تصميم» describes the thing, but as a HEADLINE it wants to be
        // «ورشة تصميم» — the preposition belonged to the sentence it came from.
        .replace(/^ل(?=[\u0621-\u064A]{3,})/u, '')
        .trim();

    if (!best) return '';
    if (best.length <= maxChars) return best;
    // Cut on a word boundary — a headline sliced mid-word looks like a bug,
    // because it is one.
    const cut = best.slice(0, maxChars);
    const at = cut.lastIndexOf(' ');
    return (at > maxChars * 0.5 ? cut.slice(0, at) : cut).trim();
}

/**
 * «لا تثبت حزمًا من الشبكة» IS AN INSTRUCTION JOE HAS TO OBEY.
 *
 * The build always ran `npm install`, whatever the brief said. Told plainly
 * not to install packages from the network, it installed 63 of them and then
 * reported the install as an achievement. The tool already accepts
 * `skipInstall`; nothing was reading the user's own words into it.
 *
 * Same discipline as the rest of this file: match the SHAPE of the refusal,
 * not a list of phrasings — a negation next to the install/network verb.
 */
export function saysNoInstall(request: string): boolean {
    const t = String(request || '');
    return /(لا|بدون|دون|من\s*غير)\s*(ت\S*)?\s*(تثبيت|تثبّ?ت|تنزيل|تحميل|حزم|حزمًا|حزماً)/u.test(t)
        || /(لا|بدون|دون)\s*(ت\S*)?\s*(استخدام\s*)?(ال)?(إنترنت|انترنت|شبكة|اتصال)/u.test(t)
        || /\b(no|without|do\s*not|don'?t)\s+(install|installing|network|internet|npm\s+install)\b/i.test(t)
        || /\boffline\b/i.test(t);
}

/**
 * WHAT HE ASKED TO BE *VERIFIED* — SO THE REPORT CAN NAME WHAT DID NOT HAPPEN.
 *
 * A wide brief asks for more than a product: «… ثم ابنِ نسخة إنتاج، وافتح
 * معاينة محلية، واكتب README، واذكر الفحوص التي نفذتها». A run that delivers
 * the files and stays silent about the verification steps it skipped reads as
 * complete success — an outside reviewer read exactly that, on a run where
 * `built` was false and no README existed.
 *
 * These are not features; they are PROMISES, and each is either kept or named.
 */
export interface AskedFor {
    build: boolean;
    preview: boolean;
    check: boolean;
    readme: boolean;
}

export function asksFor(request: string): AskedFor {
    const t = String(request || '');
    return {
        build: /(ابنِ?\s*(نسخة\s*)?(الإنتاج|إنتاج)|بناء\s*(الإنتاج|إنتاج)|production\s*build|\bbuild\b)/iu.test(t),
        preview: /(معاينة|عاين|preview|\bserve\b|dev\s*server|خادم\s*تطوير)/iu.test(t),
        check: /(افحص|فحص|تحقّ?ق|تحقق|اختبر|اختبار|دقّ?ق|verify|\bcheck\b|audit|\btest\b)/iu.test(t),
        readme: /\breadme\b|ملف\s*(تعريف|شرح)/iu.test(t),
    };
}
