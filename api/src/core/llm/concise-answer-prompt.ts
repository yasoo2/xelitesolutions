import { languageName, normalizeLanguage } from '../../shared/utils/language';

/** Small generic prefill for a user-requested concise answer; never supplies an answer. */
export function conciseAnswerBasePrompt(language: unknown, format?: unknown): string {
    // Localized generic Arabic prefill: concise native instructions only.
    // No answer examples, vocabulary, facts, canned answers or rewriting.
    if (normalizeLanguage(language) === 'ar') {
        const arBase = 'أجب بدقة ووضوح بالعربية الفصحى (العربية / Arabic). '
            + 'حافظ على المعنى التقني واتبع المحتوى والتنسيق. '
            + 'عند عدم التأكد قل ذلك ولا تخترع ترجمة. '
            + 'لا تدّعِ أفعالا أو نتائج غير مؤكدة. '
            + 'أبق الشفرة والمسارات والمعرفات حرفيا.';
        // One-sentence contract only for sentence format; word/default/
        // unsupported formats retain the default Arabic base text.
        if (format === 'sentence') return `${arBase} أجب بجملة واحدة فقط.`;
        return arBase;
    }
    const base = `Answer the current question accurately and directly in ${languageName(language)}. `
        + 'Follow the requested content and output format. If uncertain, say so. '
        + 'Never claim unverified actions or results. Keep code, paths and identifiers verbatim.';
    // Explicit format branches: sentence requests carry a generic one-sentence
    // contract; word/default/unsupported formats preserve the default text.
    if (format === 'sentence') return `${base} Return exactly one sentence.`;
    return base;
}

/**
 * Whole input is examined within this bounded size; larger inputs receive no
 * new intent verdict. A truncated prefix must never stand in for the whole
 * request or reply, because later instructions or explanation can change it.
 */
const ECHO_SCAN_LIMIT = 20000;

/** Generic English interrogative openers (reply first token, lowercase). */
const EN_QUESTION_FIRSTS = new Set([
    'why', 'how', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose',
    'is', 'are', 'was', 'were', 'am', 'do', 'does', 'did',
    'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
    'have', 'has', 'had',
    // An imperative restatement of the request ("Explain why ...?") is still a
    // restatement, never an explanation; the terminal-? gate below keeps this narrow.
    'explain', 'describe',
]);

/** Generic Arabic interrogative openers (reply first token, NFKC, diacritics stripped). */
const AR_QUESTION_FIRSTS = new Set([
    'لماذا', 'كيف', 'ماذا', 'ما', 'هل', 'أين', 'اين', 'متى', 'متي',
    'من', 'أي', 'اي', 'لم', 'لما', 'بماذا', 'كم', 'أنى', 'اني',
    // Imperative echo ("اشرح لماذا ...؟") — same rationale as English above.
    'اشرح', 'فسر',
]);

/** Remove ONE harmless outer formatting wrapper; operates on a copy, never mutates input. */
function stripOneOuterWrap(value: string): string {
    const paired = value.match(/^(\*\*|__|`{1,3})([\s\S]+)\1$/);
    if (paired) return paired[2];
    const wraps: Array<[RegExp, number]> = [
        [/^«([\s\S]+)»$/, 1],
        [/^"([\s\S]+)"$/, 1],
        [/^“([\s\S]+)”$/, 1],
        [/^'([\s\S]+)'$/, 1],
        [/^‘([\s\S]+)’$/, 1],
    ];
    for (const [pattern, group] of wraps) {
        const match = value.match(pattern);
        if (match) return match[group];
    }
    return value;
}

/**
 * Fixed preserved-intent patterns (translation / rephrasing / question-writing).
 * They are constants: caller input is only TESTED against them, never
 * interpolated into them, so no dynamic regex injection is possible.
 */
const TRANSFORM_INTENT = /(?:^|[.!?؟;:،,\n]|\b(?:then|but|and)\s+|(?:ثم|لكن)\s+)[ \t]*(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:من فضلك|لو سمحت)\s+)?(?:(?:translate|rephrase|reword|paraphrase|rewrite)\b|(?:ترجم|أعد\s+صياغة|اعد\s+صياغة)(?=\s|$))/i;
const QUESTION_WRITING_INTENT = /(?:^|[.!?؟;:،,\n]|\b(?:then|but|and)\s+|(?:ثم|لكن)\s+)[ \t]*(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:من فضلك|لو سمحت)\s+)?(?:(?:write|generate|compose|draft|ask|give|provide|return|output|quote)[^.!?؟;\n]{0,100}\b(?:questions?|faq|questionnaire|quiz)\b|(?:اكتب|اطرح|اسأل|اسال|صغ|أعد|اعد)[^.!?؟;\n]{0,80}(?:سؤال|أسئلة|اسئلة))/i;
const EXPLANATION_INTENT = /(?:^|[.!?؟;:،,\n]|\b(?:then|but|and)\s+|(?:ثم|لكن)\s+)[ \t]*(?:(?:do|please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:من فضلك|لو سمحت)\s+)?(?:(?:explain|describe|clarify|why|how|what|tell\s+me|walk\s+(?:me\s+)?through)\b|(?:اشرح|فسر|وضح|لماذا|كيف|ما الذي|ما التي)(?=\s|$))/i;

/** First whitespace-delimited token of the reply core, normalized for set lookup. */
function firstTokenOf(core: string): string {
    const raw = core.split(/[\s:،,؛\-–—()[\]{}«»"'“”‘’]+/u).filter(Boolean)[0] || '';
    return raw.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * isUnansweredExplanation(question, reply): true only when the reply is a
 * WHOLE single interrogative restatement of a current explanation/description
 * request — e.g. an Arabic "لماذا ...؟" echo of "Explain why ...", or an
 * English "Why ...?" echo of a how/why explanation request — instead of an
 * explanation. It claims NO semantic or factual correctness; it detects only
 * the generic interrogative shape described below.
 *
 * Supported directive shapes (resolved from the CURRENT question): English or
 * Arabic explanation/description requests ("explain", "describe", "why",
 * "how", "what", "اشرح", "فسر", "لماذا", "كيف", ...), including direct
 * why/how questions.
 *
 * A reply counts ONLY when ALL of these hold:
 * - after stripping harmless outer formatting (bold, code ticks, quotes) on a
 *   COPY, it is one whole question ending in `?` or `؟` with no second
 *   interrogative and no explanatory statement attached (no sentence boundary
 *   with content after it);
 * - it opens with a recognizable generic interrogative first word (fixed
 *   English/Arabic sets above — never topic vocabulary or canned answers);
 * - it contains letters (numbers/empty stay false; existing usability gates
 *   own content-free drafts); punctuation inside code/URL/quote literals is
 *   ignored on the scan copy without exempting an unanswered whole question;
 * - the current question unambiguously requests an explanation, while quoted /
 *   code / URL spans and negated instruction mentions ("do not translate",
 *   "لا تترجم") are ignored when resolving intent.
 *
 * Deliberately returns FALSE (preserving existing behavior) for: ordinary
 * explanations even when they contain quoted questions, code or URLs; a
 * rhetorical question followed by an explanation;
 * numbers or empty replies; explicitly requested translations, rephrasings,
 * question-writing, clarifying questions or FAQ examples; unsupported or
 * uncertain intents. It never forbids questions broadly and never truncates
 * or extracts the actual answer.
 *
 * Bounded input behavior: whole strings up to ECHO_SCAN_LIMIT are examined;
 * larger strings receive no new verdict. Outer-wrap stripping runs at most
 * 3 rounds. Pure: no I/O, no mutation. These scoped grammar checks do not
 * establish arbitrary factual correctness or all natural-language intents.
 */
export function isUnansweredExplanation(question: string, reply: string): boolean {
    if (typeof question !== 'string' || typeof reply !== 'string') return false;
    if (question.length > ECHO_SCAN_LIMIT || reply.length > ECHO_SCAN_LIMIT) return false;
    const directiveSource = question;
    let cleaned = reply;
    cleaned = cleaned.trim();
    if (!cleaned) return false;
    // Strip harmless outer formatting on the COPY only (bold, code ticks, quotes).
    for (let round = 0; round < 3; round++) {
        const unwrapped = stripOneOuterWrap(cleaned.trim());
        if (unwrapped === cleaned.trim()) break;
        cleaned = unwrapped;
    }
    cleaned = cleaned.trim();
    // Numbers, symbols or empty carry no interrogative restatement; the
    // existing usability gates already handle content-free drafts.
    if (!cleaned || !/[\p{L}]/u.test(cleaned)) return false;
    // A WHOLE single question only: a rhetorical question followed by an
    // explanation arrives on extra lines and is an ordinary explanation.
    const whole = cleaned.replace(/\s+/gu, ' ').trim();
    // A recognizable interrogative must TERMINATE the reply (? or Arabic ؟);
    // tolerate trailing closing quotes left over from partial wrapping.
    const terminal = whole.replace(/["'»”’\s]+$/u, '');
    if (!/[?؟]$/.test(terminal)) return false;
    const core = terminal.slice(0, -1).trim();
    // Exactly one question: no second interrogative, no explanatory statement
    // attached after a sentence boundary.
    const punctuationCore = instructionText(core);
    if (!core || /[?؟]/.test(punctuationCore)) return false;
    if (/[.!。]\s*[\p{L}\p{N}]/u.test(punctuationCore)) return false;
    // Technical literals do not exempt an otherwise unanswered whole question.
    // Their punctuation is ignored on this scan copy; the actual reply stays intact.
    // Generic interrogative opener across topics — never topic vocabulary.
    if (!EN_QUESTION_FIRSTS.has(firstTokenOf(core)) && !AR_QUESTION_FIRSTS.has(firstTokenOf(core))) return false;
    // Resolve the ACTUAL output intent from the current question. Mentions
    // inside code spans, quotes or URLs, and negated instructions
    // ("do not translate", "لا تترجم"), must not count as requested.
    // The shared current-intent predicate excludes requested transformations
    // and question writing. Unsupported/uncertain intents retain behavior.
    return requestsExplanation(directiveSource);
}

function instructionText(question: string): string {
    return question.replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/"[^"]*"|“[^”]*”|«[^»]*»|‘[^’]*’/g, ' ')
        .replace(/(^|[^\p{L}\p{N}])'[^'\n]*'/gu, '$1 ');
}

/** Supported explanation intent only; shared by the prompt and output check. */
export function requestsExplanation(question: string): boolean {
    if (typeof question !== 'string' || question.length > ECHO_SCAN_LIMIT) return false;
    const intent = instructionText(question);
    return !TRANSFORM_INTENT.test(intent) && !QUESTION_WRITING_INTENT.test(intent)
        && EXPLANATION_INTENT.test(intent);
}
