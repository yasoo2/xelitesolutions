/**
 * resolveRequestedAnswerLanguage — explicit output-language override.
 *
 * Rule: an explicit, unquoted, non-negated request for the ANSWER language
 * wins over the interface language. Without such a directive, fall back to
 * the interface language when present (normalized to its primary subtag),
 * else to the question's own script (Arabic script -> 'ar', otherwise 'en'),
 * mirroring the existing shared reply-language default without importing it
 * (this module stays dependency-free and pure: no env/net/tools/inference).
 *
 * Kept deliberately narrow — a small set of clear directive shapes, not a
 * general natural-language grammar. See LIMITATIONS below.
 *
 * LIMITATIONS (known, not universal):
 * - Only the listed directive shapes are recognized; paraphrases outside
 *   them ("use the language of Molière", "بالفصحى فقط") fall back.
 * - Mixed ar+en directives in one request are treated as ambiguous and fall
 *   back to UI/script instead of guessing.
 * - Negation is sentence-scoped and bounded (any English "n't" contraction,
 *   "not"/"cannot"/"dont", "never"/"without"/"avoid", and Arabic whole-word negation (plus explicit fused لا output verbs)
 *   such as "لا/دون/بدون/ليس" within the same sentence, up to 128 chars before the
 *   match). A negation in an earlier sentence does not cancel a
 *   later-sentence directive, and a comma does not end the scope. Negative
 *   modals ("shouldn't", "must not", ...) therefore block a directive in
 *   the same sentence instead of counting as a command.
 * - English "Arabic/English sentences" mentions count only as an output
 *   format adjunct: a prepositional "in" shortly before the phrase (e.g.
 *   "in two Arabic sentences") plus a nearby output verb (answer/reply/
 *   respond/write/draft/explain/describe/tell/give/provide) in the same
 *   sentence. Bare topic objects without "in" ("Explain two short Arabic
 *   sentences used in greetings") fall back.
 * - English "answer/reply/respond in Arabic/English" counts only as a matrix
 *   output directive (imperative or second-person/request framing). Noun
 *   mentions with definite/demonstrative determiners ("the answer in
 *   Arabic", "the reply in English"), subordinate interrogative topics
 *   ("whether/why/how/what/..." in the same clause), and first-person
 *   deliberation ("we/I ..." without "you/please/kindly") fall back to
 *   UI/script instead of switching the answer language. A possessive
 *   ("your answer in Arabic") counts only with matrix directive framing
 *   (clause-initial instruction verb such as "Give", or "you/please/
 *   kindly" in the clause), so "Give your answer in Arabic" is a directive
 *   while "why your answer in Arabic is longer" stays a topic. A
 *   subordinate marker or first-person pronoun in an earlier coordinate
 *   clause (bounded by a comma/colon or then/but/so/yet/nor, or by and/or
 *   only when the next clause starts a fresh instruction) does not cancel
 *   a later-clause directive ("Explain why X, then answer in Arabic"); only
 *   the current clause is examined. A noun subject joined by and/or inside
 *   the same subordinate clause ("why John and Mary answer in Arabic") does
 *   not start a fresh clause, so the subordinate marker still blocks.
 * - Arabic bare-phrase mentions (بالعربية/باللغة العربية/بجملتين عربيتين and
 *   the English-side equivalents) count only with output-instruction context
 *   in the same sentence (e.g. أجب/اكتب/اشرح/رد/جاوب/وضح/لخص/ترجم/من فضلك/
 *   please/answer); a bare topic with only the restrictor فقط and no
 *   instruction verb ("The variable بالعربية فقط appears here") falls back.
 * - A standalone language header at the start of a line, followed by a colon
 *   ("بالعربية فقط: ..."), is an output directive without an extra verb.
 * - Quote/code stripping covers ```blocks, `code`, "...", '...', “...”,
 *   ‘...’, «...»; exotic quoting or unclosed quotes may leak through.
 * - Regional UI tags normalize to the primary subtag ('en-US' -> 'en',
 *   'ar-EG' -> 'ar'); non-language UI values pass through as-is.
 */

/** Arabic-script range, same semantics as the shared default helper. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

function normalizeUiLanguage(uiLanguage: string | undefined): string {
    const primary = String(uiLanguage ?? '')
        .trim()
        .toLowerCase()
        .split(/[-_]/)[0]
        .trim();
    return primary;
}

function stripQuotedOrCode(input: string): string {
    let s = String(input ?? '');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/`[^`]*`/g, ' ');
    s = s.replace(/"[^"]*"/g, ' ');
    s = s.replace(/'[^']*'/g, ' ');
    s = s.replace(/“[^”]*”/g, ' ');
    s = s.replace(/‘[^’]*’/g, ' ');
    s = s.replace(/«[^»]*»/g, ' ');
    return s;
}

/** Text of the current sentence before matchIndex, bounded to maxLen chars. */
function currentSentenceBefore(text: string, matchIndex: number, maxLen = 128): string {
    const window = text.slice(Math.max(0, matchIndex - maxLen), matchIndex);
    const m = window.match(/[^.!?؟;\n]*$/);
    return m ? m[0] : window;
}

/** Current sentence around a match (bounded look-back/forward). */
function currentSentenceAround(text: string, matchIndex: number, matchLen: number): string {
    const before = text.slice(Math.max(0, matchIndex - 128), matchIndex);
    const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 32);
    const b = before.match(/[^.!?؟;\n]*$/)?.[0] ?? '';
    const a = after.match(/^[^.!?؟;\n]*/)?.[0] ?? '';
    return b + ' ' + a;
}

function hasNegationBefore(text: string, matchIndex: number): boolean {
    const scope = currentSentenceBefore(text, matchIndex, 128);
    if (/\b\w+n't\b/i.test(scope)) return true;
    if (/\bnot\b/i.test(scope)) return true;
    if (/\bcannot\b/i.test(scope)) return true;
    if (/\bdont\b/i.test(scope)) return true;
    if (/\b(do\s+not|never|without|avoid)\b/i.test(scope)) return true;
    // Arabic negation is a word or an explicit fused output-verb prefix across grammatical persons.
    // Embedded letters in مدخلات/إعلانات/مدونة are not a negation instruction.
    const normalized = scope.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '');
    if (/(?:^|[^\p{L}\p{N}])(?:لا|بدون|دون|ليس|ليست|إياك|اياك)(?=$|[^\p{L}\p{N}])/u.test(normalized)) return true;
    if (/(?:^|[^\p{L}\p{N}])لا(?=(?:[أاإيتن])?(?:رد|جب|كتب|جاوب|جيب|شرح|وضح|لخص|رجم|عرف|قدم|فسر|حاول))/u.test(normalized)) return true;
    return false;
}

const EN_ANSWER_IN_AR = /\b(?:answer|reply|respond)\s+in\s+arabic\b/gi;
const EN_ANSWER_IN_EN = /\b(?:answer|reply|respond)\s+in\s+english\b/gi;
// A bounded word-format instruction is an output directive, not a topic.
const EN_WORD_IN_AR = /\b(?:answer|reply|respond)\s+(?:with|in)\s+(?:exactly\s+)?(?:one|a\s+single)\s+(?:short\s+)?arabic\s+word\b/gi;
const EN_WORD_IN_EN = /\b(?:answer|reply|respond)\s+(?:with|in)\s+(?:exactly\s+)?(?:one|a\s+single)\s+(?:short\s+)?english\s+word\b/gi;
const EN_AR_SENTENCES = /\barabic\s+sentences?\b/gi;
const EN_EN_SENTENCES = /\benglish\s+sentences?\b/gi;
/**
 * Output verbs that turn an "in ... sentences" format adjunct into an
 * output directive. Includes both creation verbs and exposition verbs when
 * they govern a prepositional format phrase.
 */
const EN_OUTPUT_VERB =
    /\b(?:answer|replies|reply|respond|write|draft|explain|describe|tell|give|provide)\b/i;
/** Output-instruction context that turns an Arabic bare phrase into a directive. */
const AR_OUTPUT_CONTEXT =
    /أجب|اجب|اكتب|اشرح|رد|جاوب|وضح|لخص|ترجم|قدم|من فضلك|لو سمحت|answer|reply|respond|write|draft|please|(?:^|[\s،,؛;:：.!?؟()])و?(?:أخبرني|اخبرني|أخبرنا|اخبرنا|قل\s+لي|أبلغني|ابلغني|اذكر|أذكر|صف|صِف|بيّن)(?=$|[\s،,؛;:：.!?؟()])/iu;

const AR_PATTERNS = [
    /بالعربية/g,
    /باللغة\s+العربية/g,
    /بجملتين\s+عربيتين/g,
    /بجملة\s+عربية/g,
];
const EN_PATTERNS_AR = [
    /بالإ?نجل[يى]زي[ةه]/g,
    /باللغة\s+الإ?نجل[يى]زي[ةه]/g,
    /بجملتين\s+إ?نجل[يى]زيتين/g,
    /بجملة\s+[إا]نجل[يى]زي[ةه]/g,
];

function collectMatches(re: RegExp, text: string): number[] {
    const out: number[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push(m.index);
        if (m[0].length === 0) re.lastIndex += 1;
    }
    re.lastIndex = 0;
    return out;
}

/**
 * Sentence-mention counts only as an output format adjunct: a prepositional
 * "in" shortly before the phrase plus a nearby output verb in the same
 * sentence (e.g. "Explain in two Arabic sentences"), so topic objects
 * ("Explain two short Arabic sentences used in greetings") fall back.
 */
function collectQualifiedSentenceMatches(re: RegExp, text: string): number[] {
    const out: number[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const scope = currentSentenceBefore(text, m.index, 48);
        const inWindow = text.slice(Math.max(0, m.index - 24), m.index);
        if (/\bin\b/i.test(inWindow) && EN_OUTPUT_VERB.test(scope) && !hasNegationBefore(text, m.index)) {
            out.push(m.index);
        }
        if (m[0].length === 0) re.lastIndex += 1;
    }
    re.lastIndex = 0;
    return out;
}

/** Definite/demonstrative determiner immediately before answer/reply/respond signals noun use. */
const EN_NOUN_DEFINITE_BEFORE =
    /\b(?:the|a|an|this|that|these|those|such|any|each|every|no|some)\s*$/i;
/** Possessive immediately before answer/reply/respond signals noun use unless directive-framed. */
const EN_POSSESSIVE_BEFORE = /\b(?:my|your|his|her|its|our|their)\s*$/i;
/** Subordinate interrogative in the same clause turns the match into a topic. */
const EN_SUBORDINATE_BEFORE = /\b(?:whether|why|how|what|when|where|which|who|whom|whose)\b/i;
/** Clause-initial instruction verbs that frame a possessive as a directive ("Give your ..."). */
const EN_CLAUSE_INSTRUCTION_START =
    /^\s*(?:please|kindly|give|provide|write|draft|send|present|answer|reply|respond|explain|describe|tell|show)\b/i;

function hasDirectiveFraming(clause: string): boolean {
    if (EN_CLAUSE_INSTRUCTION_START.test(clause)) return true;
    if (/\b(?:please|kindly|you)\b/i.test(clause)) return true;
    return false;
}

/**
 * Current coordinate clause before a match: the suffix of the current
 * sentence after the last comma/colon or coordinating word
 * (then/but/so/yet/nor). And/or start a fresh clause only when the next
 * segment starts a fresh instruction (empty up to the match, or an
 * instruction opening such as "answer ..."/"please ..."); a noun subject
 * joined by and/or ("John and Mary ...") stays in the same clause so an
 * earlier subordinate marker still applies.
 */
function currentClauseBefore(text: string, matchIndex: number): string {
    const sentence = currentSentenceBefore(text, matchIndex, 64);
    const majorParts = sentence.split(/[,:]|\b(?:then|but|so|yet|nor)\b/i);
    const major = majorParts[majorParts.length - 1] ?? sentence;
    const andParts = major.split(/\b(?:and|or)\b/i);
    if (andParts.length > 1) {
        const last = andParts[andParts.length - 1] ?? '';
        if (last.trim() === '') return last;
        if (/^\s*(?:please|kindly|you\b|answer|reply|respond|explain|tell|give|write|draft|describe|provide|do\b|never\b)\b/i.test(last)) {
            return last;
        }
        return major;
    }
    return major;
}

/**
 * GENERAL directive-vs-topic guard for "answer/reply/respond in X".
 * Accepts matrix directives ("Answer in Arabic.", "Please reply in English.",
 * "You should answer in Arabic.", "Give your answer in Arabic.",
 * "Explain why X, then answer in Arabic.") and rejects noun uses
 * ("the answer in Arabic"), same-clause embedded topics ("whether we
 * should answer in Arabic", "why John and Mary answer in Arabic"), and
 * same-clause first-person deliberation without second-person/request
 * framing.
 */
function isEnglishAnswerDirective(text: string, matchIndex: number): boolean {
    const clause = currentClauseBefore(text, matchIndex);
    if (EN_SUBORDINATE_BEFORE.test(clause)) return false;
    if (EN_NOUN_DEFINITE_BEFORE.test(clause)) return false;
    if (EN_POSSESSIVE_BEFORE.test(clause) && !hasDirectiveFraming(clause)) return false;
    if (/\b(?:i|we)\b/i.test(clause) && !/\b(?:you|please|kindly)\b/i.test(clause)) return false;
    return true;
}

function collectValid(re: RegExp, text: string): number[] {
    return collectMatches(re, text).filter(
        (i) => !hasNegationBefore(text, i) && isEnglishAnswerDirective(text, i),
    );
}

/**
 * Arabic bare-phrase matches count only with output-instruction context in
 * the same sentence, so topic mentions ("عبارة مكتوبة باللغة العربية",
 * "The variable بالعربية فقط appears here") fall back to UI/script instead
 * of switching the answer language.
 */
// Clause-initial Arabic definition/display instructions are also output framing.
// Bound the word and framing explicitly: embedded/topic display words stay topics.
const AR_DEFINITION_CONTEXT = /(?:^|[.:،,؛;!?؟\n])\s*(?:من فضلك\s+|لو سمحت\s+)?(?:عرف|اعرض)\s+/u;

function collectArabicDirectiveMatches(re: RegExp, text: string): number[] {
    const out: number[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (!hasNegationBefore(text, m.index)) {
            const sentence = currentSentenceAround(text, m.index, m[0].length);
            const linePrefix = text.slice(0, m.index).split('\n').pop() ?? '';
            const languageHeader = /^\s*$/.test(linePrefix)
                && /^\s*(?:فقط\s*)?[:：]/.test(text.slice(m.index + m[0].length));
            if (AR_OUTPUT_CONTEXT.test(sentence)
                || languageHeader
                || AR_DEFINITION_CONTEXT.test(sentence.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, ''))) out.push(m.index);
        }
        if (m[0].length === 0) re.lastIndex += 1;
    }
    re.lastIndex = 0;
    return out;
}

/**
 * Resolve the language the ANSWER content should be written in.
 * Returns 'ar' / 'en' for explicit directives, else the normalized UI
 * language when present, else the question-script fallback.
 */
/** Generated attachment facts stay in the model message, not the output contract. */
export function answerRequestText(question: string): string {
    const q = String(question ?? '');
    // Preserve positions while masking the quote/code forms already excluded
    // by the language resolver; a quoted header is user text, not a boundary.
    const visible = q.replace(/```[\s\S]*?```|`[^`]*`|"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’|«[^»]*»/g,
        match => ' '.repeat(match.length));
    const boundary = visible.search(/\n+\[ATTACHED FILES — the user attached \d+ file\(s\) to this message\.[^\n]*\]/u);
    return boundary < 0 ? q : q.slice(0, boundary);
}

export function resolveRequestedAnswerLanguage(question: string, uiLanguage?: string): string {
    const q = answerRequestText(question);
    const stripped = stripQuotedOrCode(q);

    let arHits = 0;
    for (const re of AR_PATTERNS) arHits += collectArabicDirectiveMatches(re, stripped).length;
    arHits += collectValid(EN_ANSWER_IN_AR, stripped).length;
    arHits += collectValid(EN_WORD_IN_AR, stripped).length;
    arHits += collectQualifiedSentenceMatches(EN_AR_SENTENCES, stripped).length;

    let enHits = 0;
    for (const re of EN_PATTERNS_AR) enHits += collectArabicDirectiveMatches(re, stripped).length;
    enHits += collectValid(EN_ANSWER_IN_EN, stripped).length;
    enHits += collectValid(EN_WORD_IN_EN, stripped).length;
    enHits += collectQualifiedSentenceMatches(EN_EN_SENTENCES, stripped).length;

    if (arHits > 0 && enHits === 0) return 'ar';
    if (enHits > 0 && arHits === 0) return 'en';

    const ui = normalizeUiLanguage(uiLanguage);
    if (ui) return ui;
    return ARABIC_SCRIPT.test(q) ? 'ar' : 'en';
}
