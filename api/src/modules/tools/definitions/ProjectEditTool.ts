/**
 * STAGE 3 OF THE WORLD-CLASS ROADMAP — surgical, diff-based project editing.
 *
 * What Cursor and Aider got right: an edit to a real project touches LINES,
 * not files. Regenerating a whole component to change one heading is how
 * content gets lost — the exact failure the page builder spent months
 * defending against. This tool edits the way a senior engineer does:
 *
 *   1. Common edits are DETERMINISTIC — a colour change rewrites tokens.css
 *      from Joe's palette engine; no model is asked, nothing else can break.
 *   2. Everything else goes through SEARCH/REPLACE blocks: the model must
 *      quote the exact lines it wants changed and what replaces them. A
 *      block whose SEARCH text is not in the file is refused — the model
 *      cannot invent code it never read.
 *   3. Every edited JS/JSX file passes an esbuild SYNTAX GATE before it is
 *      kept; a file that no longer parses is reverted on the spot.
 *   4. When node_modules exists, the REAL `vite build` verifies the whole
 *      project afterwards — and a red build reverts every file, honestly.
 *
 * Each touched file keeps a per-file history (undo works here too).
 */
import fs from 'fs';
import path from 'path';
import { artifactRootDir } from '../../../shared/artifact-root';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { buildPalette, paletteCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { persistJoeProjects, writeJoeProject } from '../../../api/page-store';
import { publicUrlFor } from '../../../shared/utils/publicUrl';
import { undefinedJsxComponentMismatch } from '../../../core/quality/source-contract';
import { acceptanceFor, judgeAcceptance } from '../../../core/quality/acceptance';
import { saysWord, words, normalise } from '../../../core/language/arabic';
import { foldChars, normalizeIntentText } from '../../../core/orchestrator/promptNormalizer';
import { isArabicReply } from '../../../shared/reply-language';
import { parserDiagnosis } from '../../../shared/utils/parser-diagnosis';
import { byNameOrder, isJsonStore, isLockfile, jsonStoresWrittenBy, listProjectFiles, mapBounded, PROJECT_FS_CONCURRENCY } from '../../../shared/utils/project-tree';

/** One parsed SEARCH/REPLACE block. */
export interface EditBlock { file: string; search: string; replace: string }

/** A browser/visual check named by the user is an acceptance gate, not a bonus. */
export function requestsVisibleBrowserAudit(request: string): boolean {
    const raw = String(request || '');
    const probe = `${raw}\n${normalizeIntentText(raw)}`;
    return /(?:\b(?:test|verify|check|inspect|audit)\b[\s\S]{0,55}\b(?:browser|preview|ui|visual(?:ly)?)\b|\b(?:browser|preview|ui|visual)\s+(?:test|qa|check|audit)\b|(?:اختبر|تحقق|افحص|دقق|راجع)[\s\S]{0,45}(?:المتصفح|المعاينه|الواجهه|بصريا|مرئيا)|(?:اختبار|فحص|تدقيق|مراجعه)[\s\S]{0,35}(?:المتصفح|الواجهه|بصري|مرئي))/i.test(probe);
}

/** Ground a compound contact-link and telephone challenge in measured browser evidence. */
export function provesContactLinkAndPhoneAudit(audit: any, ctaLabel: string): boolean {
    if (!audit || audit.skipped || !ctaLabel) return false;
    const linkWorked = (audit.controls || []).some((control: any) => {
        const label = String(control?.bare || control?.label || '');
        return label.includes(ctaLabel)
            && control?.worked === true
            && (!control?.href || String(control.href).endsWith('#contact'));
    });
    const phoneRejectedInvalid = (audit.semanticValidationEvidence || []).some((evidence: any) =>
        evidence?.expected === 'tel'
        && evidence?.actual === 'tel'
        && evidence?.rejected === true);
    return linkWorked
        && phoneRejectedInvalid
        && Number(audit.fieldsFilled || 0) > 0
        && Number(audit.semanticValidationFailures || 0) === 0;
}

/**
 * Parse the model's reply into blocks. Format (Aider-style, fenced per file):
 *
 *   FILE: src/components/Hero.jsx
 *   <<<<<<< SEARCH
 *   exact current lines
 *   =======
 *   replacement lines
 *   >>>>>>> REPLACE
 */
export function parseEditBlocks(raw: string): EditBlock[] {
    const out: EditBlock[] = [];
    const text = String(raw || '');
    const re = /FILE:\s*([^\n]+)\n<{5,}\s*SEARCH\n([\s\S]*?)\n={5,}\n([\s\S]*?)\n>{5,}\s*REPLACE/g;
    for (const m of text.matchAll(re)) {
        const file = m[1].trim().replace(/^["'`]|["'`]$/g, '');
        if (!file || /\.\./.test(file)) continue;   // no path escapes
        out.push({ file, search: m[2], replace: m[3] });
    }
    return out;
}

/**
 * THE WORD FOR «I CANNOT TELL», WHICH THIS LAYER DID NOT HAVE.
 *
 * The edit prompt ends «nothing else», so a model handed a request that names
 * nothing to change still had to emit an edit block. It did: «سوّي لي شي حلو»
 * rewrote a line of the owner's sales project, and the round reported success.
 *
 * The model is the only layer that reads BOTH the request and the file, so it
 * is the one that can actually tell. It is now allowed to say so, and this
 * reads the answer. Deliberately narrow: the verdict must OPEN the reply, so
 * the phrase inside a sentence about the edit is discussion, not a refusal.
 */
export function modelCannotTell(raw: string): string | null {
    const text = String(raw || '').trim()
        .replace(/^```[a-z]*\s*/i, '')       // a fenced reply
        .replace(/\s*```$/, '')
        .replace(/^\*+\s*/, '')              // bold, which models add to labels
        .trim();
    const m = /^cannot\s+tell\s*:?\**\s*(.*)$/i.exec(text.split('\n')[0].replace(/\*\*/g, ''));
    if (!m) return null;
    return m[1].trim() || 'the request does not say what to change';
}

/**
 * A useful implementation brief can still be rejected by a weak provider.
 * Keep the refusal for genuinely vague requests, but recognise a brief that
 * names an action and a concrete target/behaviour so the editor can make one
 * bounded clarification attempt instead of failing the whole phase.
 */
export function isActionableEditRequest(request: string): boolean {
    const text = String(request || '').trim();
    if (text.length < 12 || /^(?:edit|update|change|modify)\s+(?:the\s+)?(?:project|files?|app|application)\.?$/i.test(text)) return false;
    const action = /\b(?:add|change|modify|update|edit|remove|delete|implement|wire|connect|use|replace|rename|fix|repair)\b|أضف|غيّر|غير|عدّل|عدل|تعديل|حذف|إزالة|ازالة|أصلح|اصلح|إصلاح|اصلاح|اربط|استخدم|استبدل|غيّر/iu.test(text);
    const target = /\b(?:component|context|state|form|button|route|field|input|filter|search|storage|style|color|colour|text|file|api|handler|function|menu|dialog|list|item|validation)\b|\b[A-Z][A-Za-z0-9_]*\b|(?:مكوّن|مكون|حالة|نموذج|زر|حقل|بحث|تخزين|لون|نص|ملف|واجهة|قائمة|تحقق)/iu.test(text);
    return action && target;
}

/** Read an explicit, quoted wording replacement from a short follow-up. */
/**
 * HIS WORDS WITHOUT THEIR MARKS — EXCEPT WHAT HE QUOTED (round 21).
 *
 * Tanween, shadda, the short vowels and tatweel change how a word is typed,
 * not which word it is: «سطراً» and «سطرًا», «أضِف» and «أضف» are one word to a
 * reader. The readers below matched one typing, so «وأضف تحت عنوان خدماتنا
 * سطراً «…»» — alef before the tanween, the way it is most often typed — was
 * not read, and a two-part edit lost its second part without a word. The
 * structure is read with the marks off; a quoted value is his exact text,
 * replaced as he wrote it, so it keeps them.
 */
function withoutMarksOutsideQuotes(request: string): string {
    return String(request || '').replace(/([«"][^»"\n]*[»"])|[\u064B-\u065F\u0670\u0640]/gu, (_mark, quoted) => quoted || '');
}

/**
 * ⛔ HIS STRUCTURE IS READ ON FOLDED TEXT; WHAT HE QUOTED IS KEPT AS HE WROTE IT
 * (round 22, W1).
 *
 * Measured: «أضف قسم الأسئلة الشائعة، وغير نص «احجز جلسة» الي «احجز موعدك»» parsed
 * the FAQ only — «الي» (ى typed as ي) was not «إلى», so the button text stayed,
 * the reply listed the FAQ alone and said ok. The same with “curly” quotes,
 * «استبدل «مرحبا» بـ «اهلا»», «الاسئله الشائعه» (ة typed as ه), «إضف» (the
 * wrong hamza). The marks were off but the letters were not folded, and only
 * « » and " were quote marks. So:
 *  - every pair of quote marks he may type is a boundary — « » (and »…«, typed
 *    the other way round in a right-to-left line), " ", “ ”, „ “, ‘ ’, ‹ ›, and
 *    ' ' where it opens and closes words rather than standing inside one
 *    («the hero's title» has no quote in it);
 *  - outside the quotes the text is folded exactly as promptNormalizer.foldChars
 *    folds a request (أ/إ/آ → ا, ة → ه, ى → ي, ئ → ي, marks dropped), and the
 *    patterns are written in their usual spelling and folded the same way, so
 *    a pattern matches the word, not one way of typing it;
 *  - a quoted value is never folded: it is his exact text, replaced as he
 *    wrote it;
 *  - «إلى», «بـ» and «لـ» all join a replacement pair;
 *  - and a quoted span that no operation consumed is named as not done (see
 *    unreadEditClauses), never reported as success.
 */
const QUOTE_CLOSERS: Readonly<Record<string, string>> = {
    '«': '»', '»': '«', '“': '”“', '”': '”', '„': '“”', '‘': '’', '‚': '‘’', '‹': '›', '"': '"', "'": "'",
};
/** What may stand before a straight single quote that opens a value, and after one that closes it. */
const SINGLE_QUOTE_OPENS_AFTER = /[\s([{«“„‘‚‹:،,؛;]/u;
const SINGLE_QUOTE_CLOSES_BEFORE = /[\s)\]}»”’›.,;:!?،؛؟]/u;

export interface QuotedSpan { value: string; open: number; close: number }

/** Every quoted span he typed, in order, whatever pair of marks he used. Offsets are in his text. */
export function quotedSpans(request: string): QuotedSpan[] {
    const text = String(request || '');
    const out: QuotedSpan[] = [];
    for (let i = 0; i < text.length; i++) {
        const closers = QUOTE_CLOSERS[text[i]];
        if (!closers) continue;
        if (text[i] === "'" && i > 0 && !SINGLE_QUOTE_OPENS_AFTER.test(text[i - 1])) continue;
        let close = -1;
        for (let j = i + 1; j < text.length && text[j] !== '\n'; j++) {
            if (!closers.includes(text[j])) continue;
            if (text[j] === "'" && j + 1 < text.length && !SINGLE_QUOTE_CLOSES_BEFORE.test(text[j + 1])) continue;
            close = j;
            break;
        }
        if (close < 0) continue;
        const value = text.slice(i + 1, close);
        if (value.trim()) out.push({ value, open: i, close });
        i = close;
    }
    return out;
}

/** A request as its structure is read: folded text with every quoted span as «…», and the way back to his text. */
interface EditStructure {
    source: string;
    /** Folded text; every quoted span is «…» (its inner punctuation blanked), every stray quote mark a space. */
    text: string;
    /** For each unit of `text`, the offset in `source` it came from (one more entry: the end). */
    at: number[];
    /** The quoted spans with their place in `text`: `from` is the «, `to` one past the ». */
    spans: Array<QuotedSpan & { from: number; to: number }>;
}

function readEditStructure(request: string): EditStructure {
    const source = String(request || '');
    let text = '';
    const at: number[] = [];
    const emit = (piece: string, origin: number) => { text += piece; for (let u = 0; u < piece.length; u++) at.push(origin); };
    const fold = (from: number, to: number, inside: boolean) => {
        for (let i = from; i < to;) {
            const ch = String.fromCodePoint(source.codePointAt(i) as number);
            const blank = inside ? /[«»،,.;؛!؟?\n]/u.test(ch) : !!QUOTE_CLOSERS[ch];
            emit(blank ? ' ' : foldChars(ch), i);
            i += ch.length;
        }
    };
    const spans: EditStructure['spans'] = [];
    let k = 0;
    for (const span of quotedSpans(source)) {
        fold(k, span.open, false);
        const from = text.length;
        emit('«', span.open);
        fold(span.open + 1, span.close, true);
        emit('»', span.close);
        spans.push({ ...span, from, to: text.length });
        k = span.close + 1;
    }
    fold(k, source.length, false);
    at.push(source.length);
    return { source, text, at, spans };
}

/**
 * A pattern written in his usual spelling, folded as the text is (named-entities'
 * foldPattern): an optional mark (`غيّ?ر`) goes with its `?`, then every mark,
 * and the letters fold as foldChars folds them. The `d` flag gives the place of
 * every capture, so a quoted value is taken from his text, not from the fold.
 * ⛔ No `[ء-ي]` range in a pattern read this way: its first letter folds away.
 */
const foldedPattern = (source: string, flags = 'iu') => new RegExp(source
    .replace(/[\u064B-\u065F\u0670\u0640]\?/gu, '')
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/ة/gu, 'ه')
    .replace(/ئ/gu, 'ي').replace(/ؤ/gu, 'و').replace(/ء/gu, ''), `${flags}d`);

/** The quoted span a capture stands in, or -1. */
function spanOfCapture(st: EditStructure, m: RegExpExecArray | RegExpMatchArray | null, group: number): number {
    const range = m?.indices?.[group];
    if (!range) return -1;
    return st.spans.findIndex(span => range[0] > span.from && range[0] < span.to);
}

/** His exact text for a quoted capture ('' when the capture is not a quoted span). */
function quotedValue(st: EditStructure, m: RegExpExecArray | RegExpMatchArray | null, group: number): string {
    const span = spanOfCapture(st, m, group);
    return span >= 0 ? st.spans[span].value.trim() : '';
}

/** His text, marks off, for an unquoted capture. */
function originalValue(st: EditStructure, m: RegExpExecArray | RegExpMatchArray | null, group: number): string {
    const range = m?.indices?.[group];
    if (!range) return '';
    return st.source.slice(st.at[range[0]], st.at[range[1]]).replace(/[\u064B-\u065F\u0670\u0640]/gu, '').trim();
}

const LITERAL_VERB = foldedPattern(String.raw`(?:غيّ?ر|بدّ?ل|استبدل|تغيير|تبديل|استبدال|\b(?:change|replace)\b)`);
/** «A» … إلى/to/with «B», or «A» بـ/لـ «B». */
const LITERAL_PAIR = foldedPattern(String.raw`«([^»\n]{1,120})»[^«\n]{0,60}?(?:(?:(?<![\p{L}\p{N}_])إلى(?![\p{L}\p{N}_])|\bto\b|\bwith\b)[^«\n]{0,24}?|(?<![\p{L}\p{N}_])[بل]\s*)«([^»\n]{1,120})»`);

function readLiteral(st: EditStructure): { from: string; to: string; spans: number[] } | null {
    if (!LITERAL_VERB.test(st.text)) return null;
    const pair = LITERAL_PAIR.exec(st.text);
    if (!pair) return null;
    const from = quotedValue(st, pair, 1);
    const to = quotedValue(st, pair, 2);
    return from && to && from !== to ? { from, to, spans: [spanOfCapture(st, pair, 1), spanOfCapture(st, pair, 2)] } : null;
}

export function parseLiteralTextReplacement(request: string): { from: string; to: string } | null {
    const literal = readLiteral(readEditStructure(String(request || '').trim()));
    return literal ? { from: literal.from, to: literal.to } : null;
}

export type PresentationEdit =
    | { kind: 'literal'; from: string; to: string }
    | { kind: 'brand_mark'; value: string; beside: string }
    | { kind: 'hero_contact_cta'; label: string }
    | { kind: 'phone_field'; required: boolean; rejectLetters: boolean }
    | { kind: 'faq_section'; label: string; count: number; singleOpen: boolean; closable: boolean }
    | {
        kind: 'calculator_section'; label: string; taxRate: number; rejectNegative: boolean; resetLabel: string;
        currencies: Array<{ code: string; label: string; rate: number }>;
        promoCode: string; discountRate: number; invalidPromoFeedback: boolean;
        preserveStateOnCurrencyChange: boolean; resetAll: boolean;
    }
    | { kind: 'section_subtitle'; section: string; value: string };

export interface ServicesSectionEdit {
    label: string;
    count: number;
    beforeContact: boolean;
}

/** Number words as his text is folded («ثلاثة» and «ثلاثه» are one key). */
const NUMBER_WORDS: Readonly<Record<string, number>> = Object.fromEntries(Object.entries({
    واحد: 1, واحدة: 1, اثنين: 2, اثنتين: 2, اثنان: 2, ثلاث: 3, ثلاثة: 3,
    اربع: 4, اربعة: 4, أربع: 4, أربعة: 4, خمس: 5, خمسة: 5, ست: 6, ستة: 6,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
}).map(([word, n]) => [foldChars(word), n]));

/** The spans of the structure that lie inside [from, to). */
function spansWithin(st: EditStructure, from: number, to: number): number[] {
    return st.spans.map((span, index) => (span.from >= from && span.to <= to ? index : -1)).filter(index => index >= 0);
}

const SERVICES_ADD = foldedPattern(String.raw`(?:أضف|إضاف[ةه]|أنشئ|ضع|حط|\badd\b|\bcreate\b)`);
const SERVICES_NAMED = foldedPattern(String.raw`(?:قسم\s+(?:ال)?خدمات|(?:ال)?خدمات\s+(?:قسم|section)|\bservices?\s+section\b)`);
const QUOTED_LINK = foldedPattern(String.raw`(?:رابط|link)[^«\n]{0,35}«([^»\n]{1,40})»`);
const SERVICES_COUNT = foldedPattern(String.raw`(?:ب|with\s+)?(\d+|واحد(?:ة)?|اثن(?:ين|تان|تين)|ثلاث(?:ة)?|أ?ربع(?:ة)?|خمس(?:ة)?|ست(?:ة)?|one|two|three|four|five|six)\s+(?:خدمات?|services?)`);
const BEFORE_CONTACT = foldedPattern(String.raw`(?:قبل\s+(?:قسم\s+)?التواصل|before\s+(?:the\s+)?contact)`);

function readServicesSectionEdit(st: EditStructure): (ServicesSectionEdit & { spans: number[] }) | null {
    if (!SERVICES_ADD.test(st.text) || !SERVICES_NAMED.test(st.text)) return null;
    const link = QUOTED_LINK.exec(st.text);
    const label = quotedValue(st, link, 1);
    const rawCount = String(SERVICES_COUNT.exec(st.text)?.[1] || '').toLowerCase();
    return {
        label: label || (/\p{Script=Arabic}/u.test(st.source) ? 'الخدمات' : 'Services'),
        count: Math.max(1, Math.min(6, /^\d+$/.test(rawCount) ? Number(rawCount) : (NUMBER_WORDS[rawCount] || 3))),
        beforeContact: BEFORE_CONTACT.test(st.text),
        spans: label ? [spanOfCapture(st, link, 1)] : [],
    };
}

/** Read a concrete request to add a services section to a generated site. */
export function parseServicesSectionEdit(request: string): ServicesSectionEdit | null {
    const read = readServicesSectionEdit(readEditStructure(String(request || '').trim()));
    return read ? { label: read.label, count: read.count, beforeContact: read.beforeContact } : null;
}

const MARK_QUOTED = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+[^،.\n]{0,55}(?:شعار|علام[ةه]|\b(?:logo|mark)\b)[^«\n]{0,55}«([^»\n]{1,24})»[^،.\n]{0,90}(?:بجانب|قرب|محاذاة|beside|next\s+to)[^«\n]{0,45}«([^»\n]{1,80})»`);
const MARK_DERIVED = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+[^،.\n]{0,65}(?:شعار|علام[ةه]|\b(?:logo|mark)\b)[^،.\n]{0,65}(?:بجانب|قرب|محاذاة|beside|next\s+to)\s*«([^»\n]{1,80})»`);
const HERO_CTA = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+(?:لي\s+)?(?:زر|button|cta)\s*«([^»\n]{1,80})»[^،.\n]{0,120}(?:القسم\s+(?:الرئيسي|الافتتاحي)|واجهة\s+(?:الموقع|الصفحة)|\bhero\b)[^،.\n]{0,140}(?:نموذج\s+التواصل|قسم\s+التواصل|\bcontact(?:\s+form|\s+section)?\b)`);
const PHONE_CLAUSE = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+[^،.\n]{0,35}(?:حقل|input|field)[^،.\n]{0,30}(?:رقم\s+هاتف|هاتف|telephone|phone)[^،.\n]*`);
const PHONE_REQUIRED = foldedPattern(String.raw`(?:مطلوب|required)`);
const PHONE_REJECTS_LETTERS = foldedPattern(String.raw`(?:لا\s+يقبل[^،.\n]{0,20}(?:حروف|أحرف)|reject[^،.\n]{0,20}letters?|numeric[ -]?only)`);
const FAQ_CLAUSE = foldedPattern(String.raw`(?:أضف|أنشئ|add|create)\s+[^،.\n]{0,45}(?:قسم\s+)?(?:الأسئلة\s+الشائعة|faq)[^،.\n]*`);
const FAQ_NAME = foldedPattern(String.raw`(?:الأسئلة\s+الشائعة|faq)`);
const FAQ_COUNT = foldedPattern(String.raw`(?:ب|with\s+)?(\d+|ثلاث(?:ة)?|أ?ربع(?:ة)?|خمس(?:ة)?|three|four|five)\s+(?:أسئلة|questions?)`);
const FAQ_SINGLE_OPEN = foldedPattern(String.raw`(?:واحد[^،.\n]{0,12}فقط[^،.\n]{0,12}مفتوح|one\s+(?:item|question)\s+open)`);
const FAQ_CLOSABLE = foldedPattern(String.raw`(?:إمكانية\s+إغلاقه|قابل[^،.\n]{0,20}للإغلاق|closable|can\s+be\s+closed)`);
const CALCULATOR_FIGURES = foldedPattern(String.raw`(?:خصم|تخفيض|كود|رمز|العمل[ةه]|ضريب[ةه]|إعاد[ةه]\s+التعيين|\b(?:promo|discount|code|currenc\w*|tax|reset)\b)`);
const CALCULATOR_CLAUSE = foldedPattern(String.raw`(?:أضف|أنشئ|وسّ?ع|طوّ?ر|عدّ?ل|add|create|extend|enhance|update)\s+[^،.\n]{0,80}(?:حاسب[ةه]|calculator)[^،.\n]*`);
const SUBTITLE_BELOW = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+(?:تحت|أسفل|below|under)\s+(?:عنوان|heading|title)?\s*(?:«([^»\n]{1,60})»|([^«،,.\n]{2,60}))[^«\n]{0,50}(?:سطر(?:ا|ًا)?|نص(?:ا|ًا)?|وصف(?:ا|ًا)?|subtitle|line|text)\s*«([^»\n]{1,220})»`);
const SUBTITLE_LINE_FIRST = foldedPattern(String.raw`(?:أضف|ضع|حط|add)\s+(?:سطر(?:ا|ًا)?|نص(?:ا|ًا)?|وصف(?:ا|ًا)?|subtitle|line|text)\s*«([^»\n]{1,220})»[^،.\n]{0,70}(?:تحت|أسفل|below|under)\s+(?:عنوان|heading|title)?\s*(?:«([^»\n]{1,60})»|([^«،.\n]{2,60}))`);

/** One operation as read, with the quoted spans it consumed. */
interface ReadPresentationEdit { op: PresentationEdit; spans: number[] }

/**
 * Read several explicit presentation changes from one follow-up without asking
 * a provider to rediscover Joe's generated-project contract. Values must be
 * quoted: the quotes are the user's edit boundaries, so a later clause can
 * never be swallowed into an earlier value. The structure is read on folded
 * text (readEditStructure); the calculator's own figures — a promo code in
 * capitals, percentages — are read from his text with the marks off, as before.
 */
function readPresentationEdits(st: EditStructure, plain: string): ReadPresentationEdit[] {
    const text = plain;
    const out: ReadPresentationEdit[] = [];
    const literal = readLiteral(st);
    if (literal) out.push({ op: { kind: 'literal', from: literal.from, to: literal.to }, spans: literal.spans });

    const mark = MARK_QUOTED.exec(st.text);
    if (mark) out.push({ op: { kind: 'brand_mark', value: quotedValue(st, mark, 1), beside: quotedValue(st, mark, 2) }, spans: [spanOfCapture(st, mark, 1), spanOfCapture(st, mark, 2)] });
    else {
        const derivedMark = MARK_DERIVED.exec(st.text);
        const beside = quotedValue(st, derivedMark, 1);
        const value = Array.from(beside.replace(/\s+/g, ''))[0] || '';
        if (beside && value) out.push({ op: { kind: 'brand_mark', value, beside }, spans: [spanOfCapture(st, derivedMark, 1)] });
    }

    const heroCta = HERO_CTA.exec(st.text);
    if (heroCta) out.push({ op: { kind: 'hero_contact_cta', label: quotedValue(st, heroCta, 1) }, spans: [spanOfCapture(st, heroCta, 1)] });

    const phoneClause = PHONE_CLAUSE.exec(st.text)?.[0] || '';
    if (phoneClause) {
        out.push({
            op: { kind: 'phone_field', required: PHONE_REQUIRED.test(phoneClause), rejectLetters: PHONE_REJECTS_LETTERS.test(phoneClause) },
            spans: [],
        });
    }

    const faq = FAQ_CLAUSE.exec(st.text);
    if (faq) {
        const rawCount = String(FAQ_COUNT.exec(faq[0])?.[1] || '').toLowerCase();
        const link = QUOTED_LINK.exec(st.text);
        const label = quotedValue(st, link, 1);
        const range = faq.indices?.[0] || [faq.index, faq.index + faq[0].length];
        // The section's own name, quoted inside the clause («قسم «الأسئلة الشائعة»»), is read by it too.
        const named = spansWithin(st, range[0], range[1]).filter(index => FAQ_NAME.test(st.text.slice(st.spans[index].from, st.spans[index].to)));
        out.push({
            op: {
                kind: 'faq_section',
                label: label || (/\p{Script=Arabic}/u.test(st.source) ? 'الأسئلة الشائعة' : 'FAQ'),
                count: Math.max(1, Math.min(6, /^\d+$/.test(rawCount) ? Number(rawCount) : (NUMBER_WORDS[rawCount] || 3))),
                singleOpen: FAQ_SINGLE_OPEN.test(st.text),
                closable: FAQ_CLOSABLE.test(st.text),
            },
            spans: [...(label ? [spanOfCapture(st, link, 1)] : []), ...named],
        });
    }

    const calculator = CALCULATOR_CLAUSE.exec(st.text);
    if (calculator) {
        // A promo sentence can say "10% before tax" before declaring "tax
        // 16%". The nearest first percentage is then the discount, not the
        // tax rate. The final explicit tax declaration owns the rate.
        const taxMatches = [...text.matchAll(/(?:ضريب[ةه]|tax)[^\d]{0,18}(\d+(?:[.,]\d+)?)\s*%|(?:\bwith\b|مع)\s+(\d+(?:[.,]\d+)?)\s*%\s*(?:ضريب[ةه]|tax)/giu)];
        const tax = taxMatches[taxMatches.length - 1];
        const taxRate = Number(String(tax?.[1] || tax?.[2] || '0').replace(',', '.'));
        const wantsCurrencies = /(?:اختيار|تبديل|تغيير|بين|select|switch|choose)[^،.\n]{0,35}(?:العمل[ةه]|currenc)|(?:العمل[ةه]|currenc)[^،.\n]{0,45}(?:الدينار|دولار|dinar|dollar|jod|usd)/iu.test(text);
        const promo = text.match(/(?:كود|رمز|code)[^،.\n]{0,25}(?:خصم|تخفيض|promo|discount)[^A-Z0-9\n]{0,12}([A-Z][A-Z0-9_-]{2,30})|\b([A-Z][A-Z0-9_-]{2,30})\b[^،.\n]{0,25}(?:خصم|تخفيض|promo|discount)/u);
        const discount = text.match(/(?:خصم|تخفيض|discount)[^،.\n]{0,100}?(\d+(?:[.,]\d+)?)\s*%|(\d+(?:[.,]\d+)?)\s*%[^،.\n]{0,45}(?:خصم|تخفيض|discount)/iu);
        const discountRate = Number(String(discount?.[1] || discount?.[2] || '0').replace(',', '.'));
        const range = calculator.indices?.[0] || [calculator.index, calculator.index + calculator[0].length];
        const figureClauses = clauseRanges(st).filter(([from, to]) => CALCULATOR_FIGURES.test(st.text.slice(from, to)));
        out.push({
            op: {
                kind: 'calculator_section',
                label: /\p{Script=Arabic}/u.test(text) ? 'حاسبة تكلفة الاستشارة' : 'Cost calculator',
                taxRate: Number.isFinite(taxRate) ? Math.max(0, Math.min(100, taxRate)) : 0,
                rejectNegative: /(?:لا\s+(?:يقبل|تقبل)|عدم\s+قبول|ارفض|reject|prevent)[^،.\n]{0,35}(?:سالب|negative)/iu.test(text),
                resetLabel: /\p{Script=Arabic}/u.test(text) ? 'إعادة تعيين' : 'Reset',
                currencies: wantsCurrencies
                    ? [{ code: 'JOD', label: 'الدينار', rate: 1 }, { code: 'USD', label: 'الدولار', rate: 1.41 }]
                    : [],
                promoCode: String(promo?.[1] || promo?.[2] || '').trim(),
                discountRate: Number.isFinite(discountRate) ? Math.max(0, Math.min(100, discountRate)) : 0,
                invalidPromoFeedback: /(?:رسالة|تنبيه|خطأ|واضح|message|feedback|error)[^،.\n]{0,40}(?:خاطئ|غير\s+صحيح|invalid|wrong)|(?:خاطئ|غير\s+صحيح|invalid|wrong)[^،.\n]{0,40}(?:رسالة|تنبيه|خطأ|message|feedback|error)/iu.test(text),
                preserveStateOnCurrencyChange: /(?:حافظ|احتفظ|ابق|بقاء|preserve|keep|retain)[^،.\n]{0,55}(?:الخدم[ةه]|الساعات|القيم|state|service|hours|values)/iu.test(text),
                resetAll: /(?:إعاد[ةه]\s+التعيين|reset)[^،.\n]{0,90}(?:تمسح|تعيد|العمل[ةه]|الخصم|القيم|clear|restore|currency|discount|defaults)/iu.test(text),
            },
            // A calculator is read from its whole clause, and its figures from
            // every clause that states one (a promo code in quotes, currencies …).
            spans: [...spansWithin(st, range[0], range[1]), ...figureClauses.flatMap(([from, to]) => spansWithin(st, from, to))],
        });
    }

    const below = SUBTITLE_BELOW.exec(st.text);
    const lineFirst = below ? null : SUBTITLE_LINE_FIRST.exec(st.text);
    if (below) {
        out.push({
            op: { kind: 'section_subtitle', section: quotedValue(st, below, 1) || originalValue(st, below, 2), value: quotedValue(st, below, 3) },
            spans: [spanOfCapture(st, below, 1), spanOfCapture(st, below, 3)].filter(index => index >= 0),
        });
    } else if (lineFirst) {
        out.push({
            op: { kind: 'section_subtitle', section: quotedValue(st, lineFirst, 2) || originalValue(st, lineFirst, 3), value: quotedValue(st, lineFirst, 1) },
            spans: [spanOfCapture(st, lineFirst, 1), spanOfCapture(st, lineFirst, 2)].filter(index => index >= 0),
        });
    }
    return out;
}

export function parsePresentationEdits(request: string): PresentationEdit[] {
    const trimmed = String(request || '').trim();
    return readPresentationEdits(readEditStructure(trimmed), withoutMarksOutsideQuotes(trimmed)).map(read => read.op);
}

/**
 * A free-form value ends at the next edit clause, never at the prompt's end;
 * a quoted one is exactly what he quoted, whatever marks he quoted it with.
 * Read on the folded structure, so «الى», «إلى» and «إلي» are one word.
 */
const CHANGE_VALUE_MARKER = foldedPattern(String.raw`(?:(?<![\p{L}\p{N}_])(?:إلى|ليصبح|ليصير|يصير|تصير)(?![\p{L}\p{N}_])|=|\bto\b)\s*`);

function readBoundedChangeValue(st: EditStructure): { value: string; span: number } {
    const marker = CHANGE_VALUE_MARKER.exec(st.text);
    if (!marker) return { value: '', span: -1 };
    const after = marker.index + marker[0].length;
    const span = st.spans.findIndex(candidate => candidate.from === after);
    if (span >= 0) return { value: st.spans[span].value.trim(), span };
    const tail = st.source.slice(st.at[after]).split('\n')[0].trim();
    const value = tail.split(/[،.;]\s*(?=(?:ثم\s+)?(?:و?\s*)?(?:[أا]ضف|ضع|حط|غيّ?ر|غير|بدّ?ل|بدل|[اأ]حذف|[اأ]ختبر|ابن[يِى]?|add|change|replace|remove|test|build)(?![\p{L}\p{N}_]))/iu)[0]
        .trim().replace(/^[«"']|[»"'.،!؟]+$/g, '').trim();
    return { value, span: -1 };
}

export function boundedChangeValue(request: string): string {
    return readBoundedChangeValue(readEditStructure(String(request || ''))).value;
}

/**
 * ⛔ A QUOTED PART NO OPERATION READ IS NAMED, NEVER REPORTED AS DONE (round 22).
 *
 * Once one deterministic operation entered the compound path, the general
 * (model) path was skipped, and a part no reader understood — the button text
 * in «أضف قسم الأسئلة الشائعة، وغير نص «احجز جلسة» الي «احجز موعدك»» — was simply
 * not there: ok, a reply listing the FAQ, the button unchanged. Every quoted
 * span he wrote in a clause that asks for an edit is now accounted for: an
 * operation that ran consumed it, or the clause is returned here, in his own
 * words, to be named as not done. A clause that asks only to test or to look
 * («ثم اختبر زر «احجز» في المتصفح») asks for no edit and is never named.
 */
/** An edit verb or its verbal noun, as one whole (folded) word, a conjunction or «بـ»/«الـ» before it. */
const EDIT_CLAUSE_WORD = foldedPattern(String.raw`^(?:[وفب]?(?:ال)?(?:أضف|ضيف|ضف|ضع|حط|غيّ?ر|بدّ?ل|استبدل|عدّ?ل|احذف|امسح|أزل|اجعل|خلّ?ي|إضافة|تغيير|تبديل|استبدال|تعديل|حذف|إزالة)|change|replace|rename|add|insert|put|set|make|remove|delete|update|edit)$`);

/** A clause asks for an edit when one of its first three words is an edit verb: «غير» deep inside «بقيمة غير صحيحة» is «not». */
function asksForAnEdit(clause: string): boolean {
    return clause.replace(/«[^»]*»/gu, ' ').split(/\s+/u).filter(Boolean).slice(0, 3).some(word => EDIT_CLAUSE_WORD.test(word));
}

/** The punctuation-bounded clauses of the structure, as [from, to) ranges. */
function clauseRanges(st: EditStructure): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let start = 0;
    for (const end of [...st.text.matchAll(/[،,.;؛!؟?\n]/gu)].map(m => m.index as number).concat(st.text.length)) {
        ranges.push([start, end]);
        start = end + 1;
    }
    return ranges;
}

function unreadEditClauses(st: EditStructure, consumed: ReadonlySet<number>): string[] {
    const clauses: string[] = [];
    for (const [start, end] of clauseRanges(st)) {
        const inside = spansWithin(st, start, end);
        if (inside.some(index => !consumed.has(index)) && asksForAnEdit(st.text.slice(start, end))) {
            const words = st.source.slice(st.at[start], st.at[end]).replace(/^[\s،,.;؛!؟?]+|[\s،,.;؛!؟?]+$/gu, '');
            if (words) clauses.push(words);
        }
    }
    return clauses;
}

function renderCostCalculator(op: Extract<PresentationEdit, { kind: 'calculator_section' }>, ar: boolean): string {
    const currencies = op.currencies.length
        ? op.currencies
        : [{ code: 'JOD', label: ar ? 'الدينار' : 'Dinar', rate: 1 }];
    const currencyRows = currencies.map(currency =>
        `{ code: '${currency.code}', label: '${currency.label}', rate: ${currency.rate} }`).join(', ');
    const hasCurrencyChoice = currencies.length > 1;
    const hasPromo = !!op.promoCode && op.discountRate > 0;
    const currencyControl = hasCurrencyChoice
        ? `\n          <label>${ar ? 'العملة' : 'Currency'}<select data-calculator-currency aria-label="${ar ? 'العملة' : 'Currency'}" value={currency} onChange={(event) => setCurrency(event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code} data-rate={item.rate}>{item.label} ({item.code})</option>)}</select></label>`
        : '';
    const promoControl = hasPromo
        ? `\n          <div className="calculator-promo"><label>${ar ? 'رمز الخصم' : 'Discount code'}<input data-calculator-promo aria-label="${ar ? 'رمز الخصم' : 'Discount code'}" value={promoInput} onChange={(event) => { setPromoInput(event.target.value); setPromoMessage(''); }} /></label><button type="button" className="btn btn-secondary" data-calculator-apply onClick={applyPromo}>${ar ? 'تطبيق الخصم' : 'Apply discount'}</button><p className="calculator-feedback" role="status" data-calculator-promo-message data-state={promoMessage ? (promoApplied ? 'valid' : 'invalid') : 'idle'}>{promoMessage}</p></div>`
        : '';
    const discountRow = hasPromo
        ? `<div><dt>${ar ? `الخصم (${op.discountRate}%)` : `Discount (${op.discountRate}%)`}</dt><dd data-calculator-discount={discount}>{money(discount)}</dd></div>`
        : '';

    return `import React, { useMemo, useState } from 'react';

const CURRENCIES = [${currencyRows}];

export default function CostCalculator({ services = [] }) {
  const options = (services.length ? services : [{ title: '${ar ? 'استشارة أساسية' : 'Essential consultation'}' }, { title: '${ar ? 'استشارة متقدمة' : 'Advanced consultation'}' }, { title: '${ar ? 'استشارة تنفيذية' : 'Executive consultation'}' }]).slice(0, 3).map((item, index) => ({ label: item.title || item.name || \`${ar ? 'خدمة' : 'Service'} \${index + 1}\`, rate: [120, 180, 250][index] }));
  const [serviceIndex, setServiceIndex] = useState(0);
  const [hours, setHours] = useState('1');
  const [currency, setCurrency] = useState(CURRENCIES[0].code);
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMessage, setPromoMessage] = useState('');
  const currencyInfo = CURRENCIES.find((item) => item.code === currency) || CURRENCIES[0];
  const rate = options[serviceIndex]?.rate || 0;
  const validHours = Math.max(0, Number(hours) || 0);
  const baseSubtotal = useMemo(() => rate * validHours, [rate, validHours]);
  const subtotal = baseSubtotal * currencyInfo.rate;
  const discount = subtotal * (promoApplied ? ${op.discountRate / 100} : 0);
  const taxable = subtotal - discount;
  const tax = taxable * ${op.taxRate / 100};
  const total = taxable + tax;
  const money = (value) => new Intl.NumberFormat('${ar ? 'ar-JO' : 'en-US'}', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  const applyPromo = () => {
    const valid = promoInput.trim().toUpperCase() === '${op.promoCode.toUpperCase()}';
    setPromoApplied(valid);
    setPromoMessage(valid ? '${ar ? 'تم تطبيق الخصم.' : 'Discount applied.'}' : '${ar ? 'رمز الخصم غير صحيح.' : 'Invalid discount code.'}');
  };
  const reset = () => { setServiceIndex(0); setHours('1'); setCurrency(CURRENCIES[0].code); setPromoInput(''); setPromoApplied(false); setPromoMessage(''); };
  return (
    <section className="section calculator-section" id="calculator" data-qa-calculator data-tax-rate="${op.taxRate}" data-discount-rate="${op.discountRate}" data-promo-code="${op.promoCode.toUpperCase()}">
      <div className="wrap calculator-wrap">
        <div className="calculator-copy"><p className="eyebrow">${ar ? 'تقدير فوري' : 'Instant estimate'}</p><h2>${op.label}</h2><p>${ar ? 'اختر الخدمة وعدد الساعات لترى التكلفة بوضوح قبل الحجز.' : 'Choose a service and hours to see a clear estimate before booking.'}</p></div>
        <div className="calculator-panel">
          <label>${ar ? 'نوع الخدمة' : 'Service type'}<select data-calculator-service aria-label="${ar ? 'نوع الخدمة' : 'Service type'}" value={serviceIndex} onChange={(event) => setServiceIndex(Number(event.target.value))}>{options.map((option, index) => <option key={option.label} value={index} data-rate={option.rate}>{option.label} — {money(option.rate * currencyInfo.rate)}</option>)}</select></label>
          <label>${ar ? 'عدد الساعات' : 'Hours'}<input aria-label="${ar ? 'عدد الساعات' : 'Hours'}" type="number" min="0" step="1" value={hours} onChange={(event) => setHours(event.target.value)} /></label>${currencyControl}${promoControl}
          <dl className="calculator-totals"><div><dt>${ar ? 'المجموع قبل الخصم والضريبة' : 'Subtotal'}</dt><dd data-calculator-subtotal={subtotal}>{money(subtotal)}</dd></div>${discountRow}<div><dt>${ar ? `الضريبة (${op.taxRate}%)` : `Tax (${op.taxRate}%)`}</dt><dd data-calculator-tax={tax}>{money(tax)}</dd></div><div className="calculator-grand"><dt>${ar ? 'الإجمالي' : 'Total'}</dt><dd data-calculator-total={total}>{money(total)}</dd></div></dl>
          <button type="button" className="btn btn-secondary calculator-reset" data-calculator-reset onClick={reset}>${op.resetLabel}</button>
        </div>
      </div>
    </section>
  );
}
`;
}

export function isNamedRowTextEditRequest(request: string): boolean {
    const text = String(request || '');
    const mutation = /(?<![ء-ي])(?:غيّ?ر|عدّ?ل|بدّ?ل|استبدل)(?![ء-ي])|\b(?:change|edit|update|rename)\b/iu.test(text);
    const namedField = /(?<![ء-ي])(?:سعر|السعر|بسعر|أسعار|الأسعار|وصف|الوصف|اسم|الاسم)(?![ء-ي])|\b(?:prices?|description|rename)\b/i.test(text);
    return mutation && namedField;
}

/**
 * A RANKING'S PRIOR IS NOT ITS EVIDENCE.
 *
 * `content.js` is given four points before a single word of the request is
 * looked for. That is a sound tie-breaker — when several files match, wording
 * usually lives there — but it also means the ranked list is NEVER empty while
 * that file exists. The guard written below the ranker tests the list, so it
 * has never once fired, and «no evidence at all» has been indistinguishable
 * from «weak evidence» at the only place that could have noticed.
 *
 * So the two are now returned apart: `scored` is the preference, `evidence` is
 * how many files a word of the request was actually found in. The caller can
 * ask the question it meant to ask.
 */
export function rankFilesForEdit(
    request: string,
    files: Array<{ f: string; body: string }>,
): { scored: Array<{ f: string; body: string; score: number }>; evidence: number } {
    const words = String(request || '').split(/[\s،,.!؟?]+/).filter(w => w.length >= 3);
    let evidence = 0;
    const scored = files.map(({ f, body }) => {
        const prior = /content\.js$/.test(f) ? 4 : /components\//.test(f) ? 2 : 0;
        let found = 0;
        for (const w of words) if (body.includes(w)) found += 3;
        if (found > 0) evidence += 1;
        return { f, body, score: prior + found };
    }).sort((a, b) => b.score - a.score).slice(0, 2)
        .filter(x => x.body.length < 16_000);
    return { scored, evidence };
}

/**
 * Apply one block to a file's contents. Exact match first; then a
 * whitespace-tolerant match (models re-indent what they quote). Returns null
 * when the SEARCH text simply is not there — the caller refuses the block.
 */
export function applyEditBlock(content: string, block: EditBlock): string | null {
    if (block.search === block.replace) return null;
    if (content.includes(block.search)) {
        return content.replace(block.search, block.replace);
    }
    // Whitespace-tolerant: match the quoted lines with flexible indentation.
    const lines = block.search.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const pattern = lines.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*\\n\\s*');
    try {
        const re = new RegExp(pattern.replace(/\s+/g, '\\s+'));
        const m = content.match(re);
        if (m && m.index !== undefined) {
            return content.slice(0, m.index) + block.replace + content.slice(m.index + m[0].length);
        }
    } catch { /* pattern too wild — refuse */ }
    return null;
}

/** The esbuild syntax gate: does this file still parse after the edit? */
export function syntaxOk(file: string, code: string): { ok: boolean; error?: string } {
    const ext = path.extname(file).toLowerCase();
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
        // CSS/HTML/JSON get cheap structural checks instead.
        if (ext === '.json') { try { JSON.parse(code); return { ok: true }; } catch (e: any) { return { ok: false, error: e.message }; } }
        if (ext === '.css') {
            const open = (code.match(/\{/g) || []).length, close = (code.match(/\}/g) || []).length;
            return open === close ? { ok: true } : { ok: false, error: `unbalanced braces (${open} vs ${close})` };
        }
        return { ok: true };
    }
    try {
        const esbuild = require('esbuild');
        esbuild.transformSync(code, { loader: ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx' });
        const componentError = undefinedJsxComponentMismatch(file, code);
        if (componentError) return { ok: false, error: componentError };
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: parserDiagnosis(e) };
    }
}

/** A compact ±diff summary for the report. */
export function diffSummary(before: string, after: string): { added: number; removed: number } {
    const a = before.split('\n'), b = after.split('\n');
    const setA = new Map<string, number>(), setB = new Map<string, number>();
    for (const l of a) setA.set(l, (setA.get(l) || 0) + 1);
    for (const l of b) setB.set(l, (setB.get(l) || 0) + 1);
    let removed = 0, added = 0;
    for (const [l, n] of setA) removed += Math.max(0, n - (setB.get(l) || 0));
    for (const [l, n] of setB) added += Math.max(0, n - (setA.get(l) || 0));
    return { added, removed };
}

/** The rows of content.js that can carry a photo, in the serializer's own
 *  single-line format — dishes carry desc, testimonials carry role. */
export function photoRows(body: string): Array<{ name: string; kind: 'dish' | 'person'; second: string; img: string }> {
    return [...String(body).matchAll(/\{ name: '([^']*)', (desc|role): '([^']*)',[^\n]*?img: (null|\{[^}]*\})/g)]
        .map(m => ({ name: m[1], kind: m[2] === 'desc' ? 'dish' as const : 'person' as const, second: m[3], img: m[4] }));
}

/** The row the request names — SCORED by matched name words, never
 *  first-match: «لطبق مشاوي مشكلة» contains «طبق», which is also the first
 *  word of «طبق اليوم», and first-match handed the photo to the wrong dish. */
export function pickPhotoRow<T extends { name: string }>(rows: T[], request: string): T | null {
    return rows
        .map(r => ({ r, hits: words(r.name).filter(w => w.length >= 3 && saysWord(request, w)).length }))
        .filter(x => x.hits > 0)
        .sort((a, b) => b.hits - a.hits)[0]?.r || null;
}

/**
 * The path of an image the user ATTACHED to this message. The run pipeline
 * appends «(raw file on disk at: …)» to the goal for every attachment; when
 * that file is a picture, it is the photograph the user means — no archive
 * search can beat the one they just handed over.
 */
export function attachedImagePath(request: string): string | null {
    const m = [...String(request || '').matchAll(/raw file on disk at:\s*([^)\n]+)\)/g)]
        .map(x => x[1].trim())
        .filter(p => /\.(jpe?g|png|webp|gif|avif)$/i.test(p));
    for (const p of m) { try { if (fs.statSync(p).isFile()) return p; } catch { /* gone */ } }
    return null;
}

/**
 * Copy an attached photograph INTO the project (public/images) under a
 * content-addressed name, exactly where the scaffolder puts archive photos,
 * and answer with the row-ready { src, alt }. The user owns this file, so
 * there is no licence line to write — inventing one would be a lie.
 */
export function adoptLocalImage(src: string, projDir: string, alt: string): { src: string; alt: string } | null {
    try {
        const buf = fs.readFileSync(src);
        if (!buf.length) return null;
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 32);
        const ext = (path.extname(src) || '.jpg').toLowerCase().replace('.jpeg', '.jpg');
        const rel = `images/${hash}${ext}`;
        fs.mkdirSync(path.join(projDir, 'public', 'images'), { recursive: true });
        fs.writeFileSync(path.join(projDir, 'public', rel), buf);
        return { src: rel, alt: String(alt || '').slice(0, 80) };
    } catch { return null; }
}

const EDITABLE = /\.(jsx?|tsx?|mjs|css|html|json)$/i;
// `.joe-versions` is the project's own history. An editor that can see into it
// would offer the model yesterday's copy of App.jsx as a file to change — and a
// rewritten past is worse than no past at all. The same holds for every folder
// tools and Joe keep inside a project (shared/utils/project-tree): this list
// knew `.joe-versions` but not `.checkpoints`, whose JSON holds the page's own
// words, so a literal text edit rewrote Joe's resume state beside the page.
// Build output stays this walker's own choice.
const BUILD_OUTPUT_DIRS = new Set(['dist', 'build']);

/**
 * EVERY EDITABLE FILE THAT IS HIS SOURCE, AT ANY DEPTH (rounds 21 and 22).
 *
 * This stopped after 60 files without a word, so text in the 61st — the
 * content file that sorts after a components folder of 70 — was «not found»
 * and his edit refused on a project that held it (round 21). Made complete, it
 * then walked into what is not his: a literal edit rewrote Composer's vendor/,
 * a virtualenv named env/, client/package-lock.json and the api project's
 * data.json, and src/coverage/Plans.jsx was not seen at all (round 22). The
 * walk is the shared one (shared/utils/project-tree): complete, bounded,
 * asynchronous, in name order, and his source by kind — machine state, tool
 * output where the tool writes it, installed environments by their markers,
 * and the project's own .gitignore files.
 */
async function listFiles(dir: string): Promise<string[]> {
    return listProjectFiles(dir, {
        skipDirectory: name => BUILD_OUTPUT_DIRS.has(name),
        keepFile: (_rel, name) => EDITABLE.test(name),
    });
}

/**
 * Files a wording change never rewrites, at any depth: a package manifest, a
 * lockfile, a build tool's config. (The root index.html keeps its own rule:
 * its title is the brand's, renamed with it.) Round 21 anchored the first
 * three at the root, so client/package-lock.json was rewritten.
 */
function isNotWording(rel: string): boolean {
    return /(?:^|\/)(?:package\.json|vite\.config\.[^/]+)$/iu.test(rel) || isLockfile(rel) || /^index\.html$/iu.test(rel);
}

const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/iu;

/**
 * The files whose text holds this text, read a bounded number at a time
 * (nothing is kept but the answer). A JSON file the project's own code writes
 * — its data store: his users' records — is set apart, never a place his
 * wording lives; the store evidence is read from the same pass (every script,
 * and package.json for a json-server script).
 */
async function filesHolding(files: readonly string[], text: string, read: (rel: string) => Promise<string>): Promise<{ hits: string[]; dataStores: string[] }> {
    const holding: string[] = [];
    const tails = new Set<string>();
    await mapBounded(files, PROJECT_FS_CONCURRENCY, async rel => {
        let body = '';
        try { body = await read(rel); } catch { return; }
        if (SCRIPT_FILE.test(rel) || /(?:^|\/)package\.json$/iu.test(rel)) for (const tail of jsonStoresWrittenBy(body)) tails.add(tail);
        if (body.includes(text)) holding.push(rel);
    });
    holding.sort(byNameOrder);
    const stores = [...tails];
    return { hits: holding.filter(rel => !isJsonStore(rel, stores)), dataStores: holding.filter(rel => isJsonStore(rel, stores)) };
}

/** Every file's text, read a bounded number at a time (an unreadable file reads as empty, as before). */
async function readBodies(dir: string, files: readonly string[]): Promise<string[]> {
    return mapBounded(files, PROJECT_FS_CONCURRENCY, rel => fs.promises.readFile(path.join(dir, rel), 'utf-8').catch(() => ''));
}

export class ProjectEditTool extends BaseTool {
    name = 'project_edit';
    description = 'Surgically edit files of a scaffolded project via SEARCH/REPLACE diffs, with a syntax gate, build verification, and automatic revert.';
    version = '1.0.0';
    tags = ['edit', 'project', 'react', 'diff'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The change, in the user\'s words' },
            dir: { type: 'string', description: 'Project directory (defaults to the session\'s active project)' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        // The RAW text keeps the attachment block: it carries the path of the
        // photograph the user just handed over, and stripping it is exactly
        // why «قم باضافه هذه الصوره» reached for an archive instead.
        const rawRequest = String(input?.request || '');
        const request = rawRequest.trim()
            .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '').trim();
        if (!request) return { ok: false, error: 'no_request', logs };
        const sessionId = context?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const artifactIsAr = /[؀-ۿ]/.test(request);
        const isAr = isArabicReply({ language: context?.language, text: request });
        const visibleAuditRequired = requestsVisibleBrowserAudit(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'project_edit', sessionId } } as any); } catch { /* UI optional */ }

        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        const entry = projects[sessionKey];
        const dir = String(input?.dir || entry?.dir || '');
        if (!dir || !fs.existsSync(path.join(dir, 'package.json'))) {
            return {
                ok: true,
                output: { message: isAr ? 'لا يوجد مشروع نشط لهذه الجلسة — ابنِ مشروعاً أولاً («ابن لي مشروع React …»).' : 'No active project in this session — scaffold one first.' },
                logs,
            } as any;
        }

        /**
         * [UNDO — the integration the audit found missing] Every surgical
         * edit records the files it replaced into the project's history, but
         * nothing ever READ that history: «تراجع» on a project session fell
         * through to the model path and produced noise. Now it is what it
         * says: the last edit batch is restored byte-for-byte, instantly.
         */
        const undoIntent = /(تراجع|ارجع|أرجع|رجّع)[^.\n]{0,25}(تعديل|تغيير|نسخ|سابق|قبل)|\b(undo|rollback|revert)\b|النسخة السابقة/i.test(request);
        if (undoIntent) {
            const history: Array<{ file: string; before: string; at: number }> = entry?.history || [];
            if (!history.length) {
                return { ok: true, output: { message: isAr ? 'لا يوجد تعديل سابق مسجّل على هذا المشروع للتراجع عنه.' : 'No recorded edit to undo on this project.' }, logs } as any;
            }
            // The last BATCH: everything recorded at the newest timestamp.
            const newest = history[history.length - 1].at;
            const batch = history.filter(h => newest - h.at < 5_000);
            const kept = history.filter(h => newest - h.at >= 5_000);
            const restored: string[] = [];
            for (const h of batch) {
                try { fs.writeFileSync(path.join(dir, h.file), h.before, 'utf-8'); restored.push(h.file); }
                catch (e: any) { logs.push(`undo failed for ${h.file}: ${e?.message || e}`); }
            }
            writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history: kept }, context?.runId ?? null);
            persistJoeProjects();
            logs.push(`undo: restored ${restored.length} file(s) from the last edit batch`);
            return {
                ok: true,
                output: {
                    message: isAr
                        ? `↩️ تراجعت عن آخر تعديل — استُرجع ${restored.length} ملف:\n${restored.map(f => `   • ${f}`).join('\n')}\n🗂️ المتبقي في السجل: ${kept.length} تعديل أقدم.`
                        : `↩️ Undid the last edit — restored ${restored.length} file(s).`,
                    restored,
                },
                logs,
            } as any;
        }

        /**
         * [APPLICATION UPGRADE] The field case this exists for: right after a
         * real React maps app was delivered, «اريد اعديل عليه بان يعمل مسارات
         * للتنقل من الى … مع ذكر المسافة وكم الوقت» asked for a CAPABILITY, not
         * for a line of CSS. Handing that to a diff editor means asking a weak
         * model to write Leaflet routing code that must compile.
         *
         * A Joe application is generated deterministically from a blueprint, so
         * the honest answer is to REGENERATE it at the current engine — the
         * brand, the storage key and therefore the user's saved data all stay
         * exactly as they were, and the build proves it compiles. Anything the
         * engine cannot do falls through to the surgical editor below.
         */
        // One flag for the whole tool: a preview only ever refreshes off a
        // build that really passed, on the upgrade path and the surgical one.
        let buildVerified: boolean | null = null;
        const appMeta = (() => {
            try {
                const src = fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8');
                const g = (k: string) => (src.match(new RegExp(`\\n\\s*${k}:\\s*'([^']*)'`)) || [])[1] || '';
                const kind = g('kind'), engine = g('engine'), storeKey = g('storeKey');
                if (!kind || !engine || !storeKey) return null;
                return { kind, engine, storeKey, brand: g('brand'), title: g('title'), entityOne: g('entityOne'), entityMany: g('entityMany'), api: g('api'), sourceRequest: g('sourceRequest'), isArabic: /isArabic:\s*true/.test(src) };
            } catch { return null; }
        })();
        // A request to retain a records filter is a known, bounded change to
        // Joe's own RecordsApp contract. Do not make the user wait for a model
        // to rediscover the exact state/storage wiring we generated ourselves.
        const persistFilterRequest = /(?:فلتر|تصفية|filter)[\s\S]{0,90}(?:حفظ|احتف(?:ظ)?|إعادة\s*تحميل|reload|persist)|(?:حفظ|احتف(?:ظ)?|إعادة\s*تحميل|reload|persist)[\s\S]{0,90}(?:فلتر|تصفية|filter)/iu.test(request);
        const recordsFile = path.join(dir, 'src', 'components', 'RecordsApp.jsx');
        if (persistFilterRequest && appMeta?.engine === 'records' && fs.existsSync(recordsFile)) {
            const before = fs.readFileSync(recordsFile, 'utf-8');
            if (!before.includes("const filterStoreKey = content.storeKey + ':filters';")) {
                const stateNeedle = "  const [filters, setFilters] = useState({});";
                const effectsNeedle = "  useEffect(() => { if (rel) parentStore.write(parents); }, [parents, parentStore, rel]);";
                const persistedState = `  const filterStoreKey = content.storeKey + ':filters';
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(filterStoreKey) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return filterKeys.reduce((next, key) => {
        if (typeof saved[key] === 'string') next[key] = saved[key];
        return next;
      }, {});
    } catch { return {}; }
  });`;
                const persistedEffect = `${effectsNeedle}
  useEffect(() => {
    try { localStorage.setItem(filterStoreKey, JSON.stringify(filters)); } catch { /* private mode */ }
  }, [filterStoreKey, filters]);`;
                const after = before.replace(stateNeedle, persistedState).replace(effectsNeedle, persistedEffect);
                const gate = syntaxOk('src/components/RecordsApp.jsx', after);
                if (!gate.ok || after === before) {
                    return { ok: true, output: { message: isAr ? 'لم أطبّق حفظ الفلتر لأن بنية التطبيق الحالية لا تطابق العقد الآمن للتعديل.' : 'I did not apply filter persistence because this app no longer matches the safe edit contract.' }, logs } as any;
                }
                fs.writeFileSync(recordsFile, after, 'utf-8');
                if (fs.existsSync(path.join(dir, 'node_modules'))) {
                    const { executionEngine } = require('../../../kernel/ExecutionEngine');
                    buildVerified = (await executionEngine.runArgvStreaming('npm', ['run', 'build'], {
                        cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' },
                    }).done).ok;
                    if (!buildVerified) {
                        fs.writeFileSync(recordsFile, before, 'utf-8');
                        logs.push('deterministic filter persistence reverted — build failed');
                        return { ok: true, output: { message: isAr ? 'رفضتُ التعديل لأن البناء فشل بعده، فأرجعت الملف كما كان.' : 'I rejected the change because its build failed and restored the file.' }, logs } as any;
                    }
                }
                const history = (entry?.history || []).concat({ file: 'src/components/RecordsApp.jsx', before, at: Date.now() }).slice(-20);
                writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) }, context?.runId ?? null);
                persistJoeProjects();
                logs.push('deterministic edit: persisted declared RecordsApp filters without a model');
                return {
                    ok: true,
                    output: {
                        message: isAr ? 'حفظتُ اختيار الفلتر للمشروع الحالي. سيعود اختيار الفئة بعد إعادة تحميل الصفحة، ولا تُستعاد إلا الفلاتر الظاهرة في هذه الشاشة.' : 'Saved the current filter selection. It now returns after reload, and only visible filters are restored.',
                        dir,
                        touched: ['src/components/RecordsApp.jsx'],
                        buildVerified,
                    },
                    logs,
                } as any;
            }
        }
        /** What each engine can actually deliver — asked for in the user's own words. */
        const ENGINE_ABILITY: Record<string, RegExp> = {
            map: /مسار|مسارات|طريق|الطرق|اتجاه|المسافة|مسافة|الوقت|كم\s*يبعد|ملاحة|تنقّل|تنقل|route|direction|distance|duration|navigat/i,
            records: /حقل|حقول|عمود|أعمدة|تصدير|بحث|فلتر|تصفية|إحصائ|احصائ|مجموع|field|column|export|filter|search|total/i,
            social: /منشور|منشورات|خيط|إعجاب|تعليق|متابع|ملف\s*شخصي|post|feed|like|comment|follow|profile|timeline/i,
            chat: /غرف|غرفة|بحث|إشعار|مزامنة|room|search|sync/i,
            weather: /توقّع|توقع|أيام|رطوبة|رياح|فهرنهايت|مئوي|forecast|humidity|wind|fahrenheit|celsius/i,
        };
        if (appMeta && ENGINE_ABILITY[appMeta.engine]?.test(request)) {
            const { blueprintFor, columnEdit, applyColumnEdit } = require('../../../core/design/app-blueprints');
            const { buildAppFiles } = require('./react-app-templates');
            /**
             *  AN EDIT MUST NOT REBUILD HIM A DIFFERENT TABLE.
             *
             *  This passed the app's TITLE where a REQUEST belongs, so the
             *  regenerated blueprint knew nothing of the columns he had named.
             *  Measured on his own clinic table:
             *
             *      from his request  [اسم المريض · رقم تلفونه · وقت الموعد …]
             *      from the title    [الاسم · الهاتف · الخدمة · التاريخ …]
             *
             *  So «ضيف عمود الخصم» would have deleted every column he asked
             *  for and replaced them with a stock set — an edit that destroys
             *  the thing it edits.
             *
             *  The app now records the words it was built from, and the edit
             *  re-derives from those. The title is the fallback only for apps
             *  built before this existed.
             */
            const bp = blueprintFor(appMeta.kind, appMeta.sourceRequest || appMeta.title || request, appMeta.isArabic);
            // The app keeps the name it was delivered under.
            if (appMeta.title) bp.title = appMeta.title;
            if (appMeta.entityOne) bp.entityOne = appMeta.entityOne;
            if (appMeta.entityMany) bp.entityMany = appMeta.entityMany;
            /**
             *  AND THE ONE COLUMN HE ASKED FOR IS ADDED TO THE OTHERS.
             *
             *  «ضيف عمود الخصم» is not a new table and not a new app: it is
             *  one column, named, on the table already in front of him. The
             *  blueprint above re-derives his original columns; this puts the
             *  new one beside them instead of hoping the regeneration guesses
             *  it.
             *
             *  If he names no column, nothing is added — an edit that invents
             *  a column called «عمود» is worse than an edit that does nothing.
             */
            const colEdit = columnEdit(request);
            if (colEdit.add.length || colEdit.remove.length) {
                bp.fields = applyColumnEdit(bp.fields, colEdit, appMeta.isArabic);
                logs.push(`column edit: +[${colEdit.add.join(', ')}] -[${colEdit.remove.join(', ')}] → ${bp.fields.length} column(s)`);
            }
            const slugName = String(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).name || 'app');
            const fresh: Record<string, string> = buildAppFiles(bp, {
                brand: appMeta.brand, isArabic: appMeta.isArabic, api: appMeta.api, storeKey: appMeta.storeKey,
                sourceRequest: appMeta.sourceRequest || appMeta.title,
            }, slugName);
            // The real webfont faces at the head of app.css belong to THIS
            // build's design family — they are kept, not regenerated.
            try {
                const oldCss = fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8');
                const head = oldCss.split("/* An application's surface")[0];
                if (head && head.includes('@font-face')) fresh['src/styles/app.css'] = head + "/* An application's surface" + fresh['src/styles/app.css'].split("/* An application's surface")[1];
            } catch { /* no previous stylesheet — the fresh one stands */ }

            const changed: Array<{ file: string; before: string }> = [];
            // A surgical edit already reverts itself when the BUILD fails. What
            // it could never do is give him back a change that compiled fine and
            // that he simply did not want. One snapshot before the first write,
            // and «تراجع» works for projects the way it always has for pages.
            try { require('../../../core/project/versions').snapshotProject(dir, 'قبل التعديل'); }
            catch { /* protection must never break what it protects */ }

            let depsChanged = false;
            for (const [rel, body] of Object.entries(fresh)) {
                const abs = path.join(dir, rel);
                const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
                if (before === body) continue;
                if (rel === 'package.json') depsChanged = true;
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                fs.writeFileSync(abs, body, 'utf-8');
                changed.push({ file: rel, before });
            }
            if (changed.length) {
                const { executionEngine } = require('../../../kernel/ExecutionEngine');
                if (depsChanged) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '📦 أثبّت الحزم الجديدة…' : '📦 Installing the new packages…');
                    await executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done;
                }
                if (fs.existsSync(path.join(dir, 'node_modules'))) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أتحقق بالبناء الحقيقي (vite build)…' : '🏗️ Verifying with the real build…');
                    const { withoutViteConfigForBuild, portableViteBuildArgs } = require('./ReactProjectTool');
                    buildVerified = await withoutViteConfigForBuild(dir, async () =>
                        (await executionEngine.runArgvStreaming('npm', portableViteBuildArgs(), { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done).ok,
                    );
                    if (!buildVerified) {
                        for (const c of changed) fs.writeFileSync(path.join(dir, c.file), c.before, 'utf-8');
                        logs.push('app upgrade reverted — the rebuilt app did not compile');
                        return {
                            ok: true,
                            output: { message: isAr ? '⚠️ رفضتُ الترقية: البناء فشل بعدها فأرجعتُ كل الملفات. مشروعك سليم كما كان.' : '⚠️ Upgrade refused: the rebuild failed, every file was restored.' },
                            logs,
                        } as any;
                    }
                }
                const history = (entry?.history || []).concat(changed.map(c => ({ file: c.file, before: c.before, at: Date.now() }))).slice(-20);
                writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) }, context?.runId ?? null);
                persistJoeProjects();
                if (buildVerified === true) {
                    const url = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
                    try { broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any); } catch { /* UI optional */ }
                }
                const ABILITY_NOTE: Record<string, [string, string]> = {
                    map: ['المسارات: اكتب «من» و«إلى» واضغط «احسب المسار» — يُرسم الطريق الحقيقي على الخريطة مع المسافة بالكيلومترات والزمن بالدقائق (بيانات OSRM المفتوحة).',
                        'Directions: fill From and To, press "Get directions" — the real road route is drawn with distance in km and time in minutes (open OSRM data).'],
                    records: ['السجلات: إضافة وتعديل وحذف وبحث وتصفية وأرقام محسوبة وتصدير CSV.', 'Records: create, edit, delete, search, filter, computed totals and CSV export.'],
                    social: ['الخيط: نشر نصّ وصورة، إعجاب وتعليقات، متابعة تُصفّي الخيط، وملف شخصي.',
                        'The feed: post text and photos, likes and comments, following that filters, and a profile.'],
                    chat: ['المحادثة: غرف ورسائل دائمة وبحث ومزامنة مع الخادم إن وُجد.', 'Chat: rooms, durable messages, search and server sync when one exists.'],
                    weather: ['الطقس: بحث المدن، موقعك، توقّعات سبعة أيام، وتبديل الوحدة.', 'Weather: city search, your location, a seven-day forecast and a unit switch.'],
                };
                // DID THE PROGRAM ACTUALLY CHANGE? A regeneration that only
                // rewrote index.html announced «المسارات جاهزة» to a user whose
                // app already had them, and whose real complaint — a button
                // that would not work — was never even looked at. The claim now
                // follows the engine file, and a bug report gets a real browser
                // audit instead of a headline.
                const engineChanged = changed.some(c => /src\/components\/\w+App\.jsx$/.test(c.file));
                const bugReport = /(لا\s*يعمل|ما\s*(يشتغل|بيشتغل)|معطّ?ل|عطل|مشكلة|خطأ)|(not\s*working|does\s*not\s*work|doesn'?t\s*work|broken|bug|error)/i.test(request);
                let auditNote = '';
                if (!engineChanged && bugReport && buildVerified === true && !input?.skipAudit) {
                    try {
                        const { auditBuiltApp, formatAudit } = require('../../../core/quality/app-audit');
                        const a = await auditBuiltApp(path.join(dir, 'dist'));
                        if (a && !a.skipped) auditNote = '\n' + formatAudit(a, isAr);
                        logs.push(`bug report: audited the built app — ${a?.skipped ? `skipped (${a.skipped})` : `${a?.score}/100`}`);
                    } catch (e: any) { logs.push(`bug-report audit failed: ${String(e?.message || e).slice(0, 80)}`); }
                }
                const note = engineChanged
                    ? (ABILITY_NOTE[appMeta.engine] || ['', ''])[isAr ? 0 : 1]
                    : (isAr
                        ? `التطبيق يحمل هذه القدرة أصلاً — لم أغيّر منطقه، بل ${changed.length} ملفاً ثانوياً فقط.${bugReport ? ' وبما أنك تُبلغ عن عطل، فحصتُ البناء في متصفح حقيقي:' : ''}${auditNote}`
                        : `The app already carries this capability — its logic is unchanged; only ${changed.length} peripheral file(s) moved.${auditNote}`);
                logs.push(`app upgrade: ${appMeta.kind}/${appMeta.engine} — ${changed.length} file(s) regenerated, build ${buildVerified === null ? 'skipped' : buildVerified ? 'OK' : 'FAILED'}`);
                return {
                    ok: true,
                    output: {
                        message: isAr
                            ? `${engineChanged ? '⚙️ حدّثتُ التطبيق نفسه — لا صفحة جديدة عنه.' : 'ℹ️ راجعتُ التطبيق نفسه — لا صفحة جديدة عنه.'}\n\n${note}\n\n📂 ${dir}\n${changed.map(c => `   • ${c.file}`).join('\n')}\n${buildVerified === true ? '\n✅ vite build نجح بعد الترقية — والمعاينة تحدّثت.' : ''}\n💾 بياناتك المحفوظة في التطبيق لم تُمَسّ.`
                            : `${engineChanged ? '⚙️ Upgraded the application itself — not a page about it.' : 'ℹ️ Reviewed the application itself — not a page about it.'}\n\n${note}\n\n📂 ${dir}\n${changed.map(c => `   • ${c.file}`).join('\n')}${buildVerified === true ? '\n✅ vite build passed.' : ''}`,
                        dir, touched: changed.map(c => c.file), buildVerified,
                    },
                    logs,
                } as any;
            }
            logs.push('app upgrade: the engine already carries this capability — nothing to regenerate');
        }

        const touched: Array<{ file: string; before: string; after: string }> = [];
        const refused: string[] = [];
        let deterministicIntentHandled = false;
        const write = (rel: string, body: string): boolean => {
            const abs = path.join(dir, rel);
            const existing = touched.find(t => t.file === rel);
            if (existing) {
                if (existing.after === body) return false;
                fs.writeFileSync(abs, body, 'utf-8');
                existing.after = body;
                return true;
            }
            const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
            if (before === body) return false;
            fs.writeFileSync(abs, body, 'utf-8');
            touched.push({ file: rel, before, after: body });
            return true;
        };

        /**
         * His request as its structure is read (readEditStructure), and the
         * quoted spans each path that ran has read. Whatever is left in a clause
         * that asks for an edit is named as not done at the end
         * (unreadEditClauses) — unless the model, which reads the whole request,
         * was asked.
         */
        const structure = readEditStructure(request);
        const consumed = new Set<number>();
        let modelReadTheRequest = false;
        const consumeSpans = (spans: readonly number[]) => { for (const span of spans) if (span >= 0) consumed.add(span); };
        /** The quoted spans whose text is this value (a row name, a new name). */
        const consumeValue = (value: string) => {
            const wanted = foldChars(String(value || '').trim());
            if (wanted) structure.spans.forEach((span, index) => { if (foldChars(span.value.trim()) === wanted) consumed.add(index); });
        };
        /** The quoted spans of the clause a path read its request from (paths that read a clause, not a value). */
        const consumeClauseOf = (pattern: RegExp) => {
            const at = pattern.exec(request)?.index;
            if (at === undefined) return;
            let i = structure.at.findIndex(origin => origin >= at);
            if (i < 0) i = structure.text.length;
            const before = structure.text.slice(0, i).search(/[،,.;؛!؟?\n][^،,.;؛!؟?\n]*$/u);
            const start = before < 0 ? 0 : before + 1;
            const after = structure.text.slice(i).search(/[،,.;؛!؟?\n]/u);
            consumeSpans(spansWithin(structure, start, after < 0 ? structure.text.length : i + after));
        };
        /**
         * A rename reads its new name and, when he wrote one, the name it renames
         * from: «… من «مشروعي» إلى «بصيرة»» — whatever the current brand is.
         */
        const consumeRename = () => {
            const renamed = readBoundedChangeValue(structure);
            consumeSpans([renamed.span]);
            const previous = renamed.span > 0 ? structure.spans[renamed.span - 1] : null;
            if (previous && /(?:^|[^\p{L}\p{N}_])(?:من|from)\s*$/u.test(structure.text.slice(0, previous.from))) consumeSpans([renamed.span - 1]);
        };
        /** The note of a wording change: every file it changed, by name, and the data it left alone. */
        const literalNote = (from: string, to: string, files: readonly string[], stores: readonly string[]) => isAr
            ? `غيّرت النص «${from}» إلى «${to}» في ${files.length} ملف: ${files.join('، ')}.${stores.length ? ` ولم ألمس ${stores.join('، ')} — بيانات يكتبها تطبيقك، لا نصاً كتبته أنت.` : ''}`
            : `Changed "${from}" to "${to}" in ${files.length} file(s): ${files.join(', ')}.${stores.length ? ` Left ${stores.join(', ')} untouched — data your app writes, not your wording.` : ''}`;

        // ── deterministic fast paths — no model, nothing else can break ─────
        const COLOUR_INTENT = /(غير|غيّر|بدل|بدّل|خلي|خلّي|اجعل)[^.\n]{0,25}(لون|ألوان|الوان)|\b(change|make)\b[^.\n]{0,25}\bcolou?rs?\b/i;
        const colourChange = COLOUR_INTENT.test(request);
        if (colourChange && fs.existsSync(path.join(dir, 'src', 'styles', 'tokens.css'))) {
            deterministicIntentHandled = true;
            consumeClauseOf(COLOUR_INTENT);
            const palette = buildPalette(request);
            const paletteChanged = write('src/styles/tokens.css', `${paletteCss(palette)}
:root[data-theme="dark"]{${darkTokenBlock(palette)}}
:root[data-theme="light"]{${lightTokenBlock(palette)}}
:root[data-theme="dark"]{color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}`);
            logs.push(paletteChanged
                ? `deterministic edit: tokens.css rebuilt around ${palette.primary} — no model call`
                : `deterministic edit already satisfied: palette is ${palette.primary}`);
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? (paletteChanged ? `🎨 أعدت بناء لوحة الألوان حول ${palette.primary}` : `ألوان المشروع مضبوطة بالفعل على ${palette.primary}`)
                : (paletteChanged ? `Rebuilt the palette around ${palette.primary}` : `The project palette is already ${palette.primary}`));
        }

        // ── deterministic fast path: «ضف صورة …» — a REAL photo where the
        //    app already knows how to show one. The target row lives in
        //    content.js (heroImage / a dish's img / a testimonial's img, all
        //    rendered conditionally by construction), and the photo comes
        //    through the SAME engine and licence bookkeeping every build
        //    uses. No model writes code; the row edit is a regex on the
        //    serializer's own single-line format, gated and build-verified
        //    like every other edit — and «تراجع» undoes it.
        // «قم باضافه هذه الصوره…» — the masdar form «إضافة/اضافه» and a «بـ»
        // prefix are how people actually write it; the old pattern only knew
        // the imperative «أضف» and let the field request fall to the model.
        const IMAGE_INTENT = /(ضي?ف|أضف|اضف|إضاف[ةه]|اضاف[ةه]|حطّ?|ركّ?ب|غيّ?ر|بدّ?ل|استخدم|اجعل)[^.\n]{0,30}صور(ة|ه)|صور(ة|ه)\s*(جديدة|حقيقية)|\b(add|change|set|put|use)\b[^.\n]{0,30}\b(photo|image|picture)\b/i;
        const imageIntent = IMAGE_INTENT.test(request);
        const contentRel = 'src/content.js';
        const notes: string[] = [];
        const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const jsEsc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

        /**
         * A compound visual follow-up is one transaction. Previously the first
         * broad fast path won, prevented every later path from running, and a
         * word fragment in a different clause selected an unrelated content
         * row. Parse the explicit quoted operations, stage every file in memory,
         * validate the complete batch, and only then write it once per file.
         */
        const presentationReads = readPresentationEdits(structure, withoutMarksOutsideQuotes(request));
        const presentationEdits = presentationReads.map(edit => edit.op);
        const hasStandaloneDeterministicEdit = presentationEdits.some(op => op.kind === 'faq_section' || op.kind === 'calculator_section');
        // A colour change earlier in the same request is part of this
        // transaction, not a reason to drop the rest of it (round 22: the batch
        // used to require that nothing had been touched yet).
        if ((presentationEdits.length > 1 || hasStandaloneDeterministicEdit) && fs.existsSync(path.join(dir, contentRel))) {
            // A recognized deterministic batch is handled even when every
            // requested value is already present. Falling through merely
            // because no byte changed makes an idempotent retry wait for an
            // LLM and fail when providers are unavailable.
            deterministicIntentHandled = true;
            const pending = new Map<string, string>();
            // Every read is asynchronous and the scans over the whole project
            // are bounded (round 22, W8: 3000 files read with readFileSync held
            // the event loop of every other user for tens of milliseconds).
            const read = async (rel: string): Promise<string> => {
                const staged = pending.get(rel);
                return staged !== undefined ? staged : fs.promises.readFile(path.join(dir, rel), 'utf-8');
            };
            const holding = async (files: readonly string[], text: string) => (await filesHolding(files, text, read)).hits;
            const stage = (rel: string, body: string) => pending.set(rel, body);
            const failures: string[] = [];
            const editable = await listFiles(dir);
            const cssRel = ['src/styles/base.css', 'src/styles/app.css'].find(rel => fs.existsSync(path.join(dir, rel)));
            const ensureCss = async (rule: string, marker: string) => {
                if (!cssRel) return;
                const css = await read(cssRel);
                if (!css.includes(marker)) stage(cssRel, `${css.trimEnd()}\n${rule}\n`);
            };

            for (const op of presentationEdits) {
                if (op.kind === 'literal') {
                    // Every file of his source that holds the text he quoted: a wording
                    // change is made everywhere it stands, and the note names every file
                    // it changed (rounds 21 and 22) — never a manifest, a lockfile or the
                    // data his app writes.
                    const found = await filesHolding(editable, op.from, read);
                    const matches = found.hits.filter(rel => !isNotWording(rel));
                    if (!matches.length) { failures.push(`literal not found: ${op.from}`); continue; }
                    for (const rel of matches) stage(rel, (await read(rel)).split(op.from).join(op.to));
                    notes.push(literalNote(op.from, op.to, matches, found.dataStores));
                    continue;
                }

                if (op.kind === 'brand_mark') {
                    let content = await read(contentRel);
                    const brand = (content.match(/\n\s*brand:\s*'([^']*)'/) || [])[1] || '';
                    const targetMatches = !!brand && (normalise(brand) === normalise(op.beside) || saysWord(brand, op.beside) || saysWord(op.beside, brand));
                    const component = (await holding(editable.filter(rel => /\.(?:jsx|tsx|js|ts)$/.test(rel)), '{content.brand}'))
                        .sort((a, b) => Number(!/(?:Navbar|Header)\./i.test(a)) - Number(!/(?:Navbar|Header)\./i.test(b)))[0];
                    if (!targetMatches || !component) { failures.push(`brand target not found: ${op.beside}`); continue; }
                    if (/\n\s*brandMark:\s*'/.test(content)) content = content.replace(/(\n\s*brandMark:\s*)'[^']*'/, `$1'${jsEsc(op.value)}'`);
                    else content = content.replace(/(\n\s*brand:\s*'[^']*',)/, `$1\n  brandMark: '${jsEsc(op.value)}',`);
                    stage(contentRel, content);
                    let view = await read(component);
                    if (!view.includes('content.brandMark')) {
                        view = view.replace('{content.brand}', `{content.brandMark ? <span className="brand-text-mark" aria-hidden="true">{content.brandMark}</span> : null}<span>{content.brand}</span>`);
                        stage(component, view);
                    }
                    await ensureCss('.brand-text-mark{display:inline-grid;place-items:center;width:1.8rem;height:1.8rem;margin-inline-end:.55rem;border-radius:.4rem;background:var(--brand);color:var(--on-brand);font-size:.78rem;font-weight:800;line-height:1}', '.brand-text-mark{');
                    notes.push(isAr ? `أضفت العلامة النصية «${op.value}» بجانب «${brand}».` : `Added the text mark "${op.value}" beside "${brand}".`);
                    continue;
                }

                if (op.kind === 'hero_contact_cta') {
                    let content = await read(contentRel);
                    const hero = (await holding(editable.filter(rel => /(?:Hero|Header)\.(?:jsx|tsx|js|ts)$/i.test(rel)), 'content.cta'))[0];
                    if (!hero || !(await read(hero)).includes('content.contactHref')) { failures.push('hero contact CTA renderer not found'); continue; }
                    if (/\n\s*cta:\s*'[^']*'/.test(content)) content = content.replace(/(\n\s*cta:\s*)'[^']*'/, `$1'${jsEsc(op.label)}'`);
                    else { failures.push('hero CTA content row not found'); continue; }
                    if (/\n\s*contactHref:\s*'[^']*'/.test(content)) content = content.replace(/(\n\s*contactHref:\s*)'[^']*'/, "$1'#contact'");
                    else content = content.replace(/(\n\s*cta:\s*'[^']*',)/, `$1\n  contactHref: '#contact',`);
                    stage(contentRel, content);
                    notes.push(isAr ? `أضفت زر «${op.label}» في القسم الرئيسي وربطته بنموذج التواصل.` : `Added the “${op.label}” hero button and linked it to the contact form.`);
                    continue;
                }

                if (op.kind === 'phone_field') {
                    const component = (await holding(editable.filter(rel => /Contact\.(?:jsx|tsx|js|ts)$/i.test(rel)), '<form'))[0];
                    if (!component) { failures.push('contact form component not found'); continue; }
                    let view = await read(component);
                    if (!/\bphone\s*:/.test(view)) {
                        const state = /useState\(\{\s*name:\s*'',\s*email:\s*'',\s*msg:\s*''\s*\}\)/;
                        if (!state.test(view)) { failures.push('contact form state contract not found'); continue; }
                        view = view.replace(state, "useState({ name: '', email: '', phone: '', msg: '' })");
                    }
                    if (!/type=["']tel["']/.test(view)) {
                        const textarea = /(\s*)<textarea\s+required/;
                        if (!textarea.test(view)) { failures.push('contact message field insertion point not found'); continue; }
                        const required = op.required ? ' required' : '';
                        const input = `            <input${required} type="tel" inputMode="tel" pattern="[0-9+ ]{7,20}" aria-label={content.isArabic ? 'رقم الهاتف' : 'Phone number'} placeholder={content.isArabic ? 'رقم الهاتف' : 'Phone number'} value={form.phone}\n              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^0-9+ ]/g, '') })} />`;
                        view = view.replace(textarea, `${input}\n$1<textarea required`);
                    }
                    stage(component, view);
                    notes.push(isAr ? 'أضفت حقل هاتف مطلوباً بقيود رقمية قابلة للاختبار.' : 'Added a required telephone field with testable numeric validation.');
                    continue;
                }

                if (op.kind === 'faq_section') {
                    const appRel = ['src/App.jsx', 'src/App.tsx'].find(rel => fs.existsSync(path.join(dir, rel)));
                    if (!appRel) { failures.push('application composition file not found'); continue; }
                    let content = await read(contentRel);
                    let app = await read(appRel);
                    const faqRel = `src/components/Faq.${appRel.endsWith('.tsx') ? 'tsx' : 'jsx'}`;
                    const existingItems = (content.match(/faq:\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || '';
                    const existingCount = (existingItems.match(/\{\s*q:\s*'/g) || []).length;
                    if (existingCount < op.count) { failures.push(`FAQ content has ${existingCount}/${op.count} requested items`); continue; }
                    if (!/\n\s*faqTitle:\s*'/.test(content)) { failures.push('FAQ title content row not found'); continue; }
                    if (!/href:\s*'#faq'/.test(content)) {
                        const contactLink = /(\n\s*\{\s*href:\s*'#contact'[^\n]*\},)/;
                        if (!contactLink.test(content)) { failures.push('contact navigation insertion point not found'); continue; }
                        content = content.replace(contactLink, `\n    { href: '#faq', label: '${jsEsc(op.label)}' },$1`);
                    }
                    stage(contentRel, content);
                    if (!fs.existsSync(path.join(dir, faqRel)) && !pending.has(faqRel)) {
                        stage(faqRel, `import React, { useState } from 'react';\n\nexport default function Faq({ content }) {\n  const [open, setOpen] = useState(null);\n  const items = (content.faq || []).slice(0, ${op.count});\n  return (\n    <section className="section faq-section" id="faq">\n      <div className="wrap faq-wrap">\n        <h2>{content.faqTitle}</h2>\n        <div className="faq-list">\n          {items.map((item, index) => {\n            const expanded = open === index;\n            const panelId = \`faq-panel-\${index}\`;\n            return <div className="faq-item" key={item.q}>\n              <h3>\n                <button type="button" className="faq-trigger" aria-expanded={expanded} aria-controls={panelId}\n                  onClick={() => setOpen(expanded ? null : index)}>\n                  <span>{item.q}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>\n                </button>\n              </h3>\n              <div id={panelId} className="faq-answer" hidden={!expanded}><p>{item.a}</p></div>\n            </div>;\n          })}\n        </div>\n      </div>\n    </section>\n  );\n}\n`);
                    }
                    if (!app.includes("from './components/Faq.")) {
                        const contactImport = /(import\s+Contact\s+from\s+['"]\.\/components\/Contact\.[jt]sx?['"];?)/;
                        if (!contactImport.test(app)) { failures.push('FAQ component import insertion point not found'); continue; }
                        app = app.replace(contactImport, `import Faq from './components/Faq.${appRel.endsWith('.tsx') ? 'tsx' : 'jsx'}';\n$1`);
                    }
                    if (!/<Faq\s+content=/.test(app)) {
                        const contactRender = /(\s*<Contact\s+content=\{content\}\s*\/>)/;
                        if (!contactRender.test(app)) { failures.push('FAQ render insertion point not found'); continue; }
                        app = app.replace(contactRender, `\n        <Faq content={content} />$1`);
                    }
                    stage(appRel, app);
                    await ensureCss('.nav-links{column-gap:18px}', '.nav-links{column-gap:18px}');
                    await ensureCss('.faq-wrap{max-width:820px}.faq-list{border-top:1px solid var(--line)}.faq-item{border-bottom:1px solid var(--line)}.faq-item h3{margin:0}.faq-trigger{width:100%;min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:start;cursor:pointer}.faq-trigger:focus-visible{outline:2px solid var(--brand);outline-offset:4px}.faq-answer{padding:0 0 1rem}.faq-answer p{margin:0;color:var(--text-muted)}', '.faq-wrap{');
                    notes.push(isAr ? `أضفت قسم «${op.label}» التفاعلي وربطته بالقائمة؛ لا يبقى مفتوحاً إلا سؤال واحد ويمكن إغلاقه.` : `Added the interactive “${op.label}” section and navigation link with one closable item open at a time.`);
                    continue;
                }

                if (op.kind === 'calculator_section') {
                    const appRel = ['src/App.jsx', 'src/App.tsx'].find(rel => fs.existsSync(path.join(dir, rel)));
                    if (!appRel) { failures.push('application composition file not found'); continue; }
                    let app = await read(appRel);
                    const calculatorRel = `src/components/CostCalculator.${appRel.endsWith('.tsx') ? 'tsx' : 'jsx'}`;
                    if (!fs.existsSync(path.join(dir, calculatorRel)) && !pending.has(calculatorRel)) {
                        const ar = artifactIsAr;
                        stage(calculatorRel, `import React, { useMemo, useState } from 'react';\n\nexport default function CostCalculator({ services = [] }) {\n  const options = (services.length ? services : [{ title: '${ar ? 'استشارة أساسية' : 'Essential consultation'}' }, { title: '${ar ? 'استشارة متقدمة' : 'Advanced consultation'}' }, { title: '${ar ? 'استشارة تنفيذية' : 'Executive consultation'}' }]).slice(0, 3).map((item, index) => ({ label: item.title || item.name || \`${ar ? 'خدمة' : 'Service'} \${index + 1}\`, rate: [120, 180, 250][index] }));\n  const [serviceIndex, setServiceIndex] = useState(0);\n  const [hours, setHours] = useState('1');\n  const rate = options[serviceIndex]?.rate || 0;\n  const validHours = Math.max(0, Number(hours) || 0);\n  const subtotal = useMemo(() => rate * validHours, [rate, validHours]);\n  const tax = subtotal * ${op.taxRate / 100};\n  const total = subtotal + tax;\n  const money = (value) => new Intl.NumberFormat('${ar ? 'ar' : 'en'}', { maximumFractionDigits: 2 }).format(value);\n  const reset = () => { setServiceIndex(0); setHours('1'); };\n  return (\n    <section className="section calculator-section" id="calculator" data-qa-calculator data-tax-rate="${op.taxRate}">\n      <div className="wrap calculator-wrap">\n        <div className="calculator-copy"><p className="eyebrow">${ar ? 'تقدير فوري' : 'Instant estimate'}</p><h2>${op.label}</h2><p>${ar ? 'اختر الخدمة وعدد الساعات لترى التكلفة بوضوح قبل الحجز.' : 'Choose a service and hours to see a clear estimate before booking.'}</p></div>\n        <div className="calculator-panel">\n          <label>${ar ? 'نوع الخدمة' : 'Service type'}<select aria-label="${ar ? 'نوع الخدمة' : 'Service type'}" value={serviceIndex} onChange={(event) => setServiceIndex(Number(event.target.value))}>{options.map((option, index) => <option key={option.label} value={index} data-rate={option.rate}>{option.label} — {money(option.rate)}</option>)}</select></label>\n          <label>${ar ? 'عدد الساعات' : 'Hours'}<input aria-label="${ar ? 'عدد الساعات' : 'Hours'}" type="number" min="0" step="1" value={hours} onChange={(event) => setHours(event.target.value)} /></label>\n          <dl className="calculator-totals"><div><dt>${ar ? 'المجموع قبل الضريبة' : 'Subtotal'}</dt><dd data-calculator-subtotal={subtotal}>{money(subtotal)}</dd></div><div><dt>${ar ? `الضريبة (${op.taxRate}%)` : `Tax (${op.taxRate}%)`}</dt><dd data-calculator-tax={tax}>{money(tax)}</dd></div><div className="calculator-grand"><dt>${ar ? 'الإجمالي' : 'Total'}</dt><dd data-calculator-total={total}>{money(total)}</dd></div></dl>\n          <button type="button" className="btn btn-secondary calculator-reset" onClick={reset}>${op.resetLabel}</button>\n        </div>\n      </div>\n    </section>\n  );\n}\n`);
                    }
                    if (op.currencies.length > 1 || op.promoCode) {
                        stage(calculatorRel, renderCostCalculator(op, artifactIsAr));
                    }
                    if (!app.includes("from './components/CostCalculator.")) {
                        const contactImport = /(import\s+Contact\s+from\s+['"]\.\/components\/Contact\.[jt]sx?['"];?)/;
                        if (!contactImport.test(app)) { failures.push('calculator import insertion point not found'); continue; }
                        app = app.replace(contactImport, `import CostCalculator from './components/CostCalculator.${appRel.endsWith('.tsx') ? 'tsx' : 'jsx'}';\n$1`);
                    }
                    if (!/<CostCalculator\s+services=/.test(app)) {
                        const contactRender = /(\s*<Contact\s+content=\{content\}\s*\/>)/;
                        if (!contactRender.test(app)) { failures.push('calculator render insertion point not found'); continue; }
                        app = app.replace(contactRender, `\n        <CostCalculator services={content.services || []} />$1`);
                    }
                    stage(appRel, app);
                    await ensureCss('.calculator-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,440px);gap:clamp(2rem,6vw,5rem);align-items:start}.calculator-copy p{color:var(--text-muted)}.calculator-panel{display:grid;gap:1rem;padding:clamp(1rem,3vw,1.5rem);border:1px solid var(--line);background:var(--surface)}.calculator-panel label{display:grid;gap:.5rem;font-weight:700}.calculator-panel select,.calculator-panel input{width:100%;min-height:48px;padding:.7rem .8rem;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}.calculator-promo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.65rem;align-items:end}.calculator-feedback{grid-column:1/-1;min-height:1.4em;margin:0;color:var(--text-muted)}.calculator-feedback[data-state="invalid"]{color:#d84b5b}.calculator-feedback[data-state="valid"]{color:#13865b}.calculator-totals{display:grid;gap:.65rem;margin:0}.calculator-totals div{display:flex;justify-content:space-between;gap:1rem}.calculator-totals dd{margin:0;font-variant-numeric:tabular-nums}.calculator-grand{padding-top:.75rem;border-top:1px solid var(--line);font-weight:800}.calculator-reset{justify-self:start}@media(max-width:720px){.calculator-wrap{grid-template-columns:1fr}.calculator-promo{grid-template-columns:1fr}.calculator-promo .btn{width:100%}}', '.calculator-wrap{');
                    await ensureCss('.calculator-promo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.65rem;align-items:end}.calculator-feedback{grid-column:1/-1;min-height:1.4em;margin:0;color:var(--text-muted)}.calculator-feedback[data-state="invalid"]{color:#d84b5b}.calculator-feedback[data-state="valid"]{color:#13865b}@media(max-width:720px){.calculator-promo{grid-template-columns:1fr}.calculator-promo .btn{width:100%}}', '.calculator-promo{');
                    notes.push(artifactIsAr ? `أضفت «${op.label}» بحساب مباشر وضريبة ${op.taxRate}% وزر «${op.resetLabel}».` : `Added “${op.label}” with live calculation, ${op.taxRate}% tax, and a ${op.resetLabel} button.`);
                    continue;
                }

                let content = await read(contentRel);
                const sectionWords = words(op.section).filter(w => w.length > 2);
                const titles = [...content.matchAll(/\n\s*([A-Za-z][A-Za-z0-9]*Title):\s*'([^']*)'/g)]
                    .map(m => {
                        const valueWords = words(m[2]).filter(w => w.length > 2);
                        const hits = sectionWords.filter(w => saysWord(m[2], w)).length;
                        return { key: m[1], value: m[2], hits, density: hits / Math.max(1, valueWords.length) };
                    })
                    // A long hero may repeat the whole brief and therefore mention
                    // every section once. The actual section heading concentrates
                    // the requested words; rank that evidence instead of first hit.
                    .filter(t => t.hits > 0)
                    .sort((a, b) => (b.density - a.density) || (b.hits - a.hits) || (a.value.length - b.value.length));
                const title = titles[0];
                const component = title && (await holding(editable.filter(rel => /\.(?:jsx|tsx|js|ts)$/.test(rel)), `{content.${title.key}}`))[0];
                if (!title || !component) { failures.push(`section heading not found: ${op.section}`); continue; }
                const subtitleKey = title.key.replace(/Title$/, 'Subtitle');
                if (new RegExp(`\\n\\s*${subtitleKey}:\\s*'`).test(content)) {
                    content = content.replace(new RegExp(`(\\n\\s*${subtitleKey}:\\s*)'[^']*'`), `$1'${jsEsc(op.value)}'`);
                } else {
                    content = content.replace(new RegExp(`(\\n\\s*${title.key}:\\s*'[^']*',)`), `$1\n  ${subtitleKey}: '${jsEsc(op.value)}',`);
                }
                stage(contentRel, content);
                let view = await read(component);
                if (!view.includes(`content.${subtitleKey}`)) {
                    const markerAt = view.indexOf(`{content.${title.key}}`);
                    const headingEnd = markerAt >= 0 ? view.indexOf('</h2>', markerAt) : -1;
                    if (headingEnd < 0 || headingEnd - markerAt > 500) { failures.push(`section renderer not found: ${title.key}`); continue; }
                    const insertAt = headingEnd + '</h2>'.length;
                    view = `${view.slice(0, insertAt)}\n        {content.${subtitleKey} ? <p className="section-intro">{content.${subtitleKey}}</p> : null}${view.slice(insertAt)}`;
                    stage(component, view);
                }
                await ensureCss('.section-intro{max-width:62ch;margin:-1rem 0 1.75rem;color:var(--muted);line-height:1.75}', '.section-intro{');
                notes.push(isAr ? `أضفت النص الداعم تحت عنوان «${title.value}».` : `Added supporting text below "${title.value}".`);
            }

            for (const [rel, body] of pending) {
                const gate = syntaxOk(rel, body);
                if (!gate.ok) failures.push(`${rel}: ${gate.error}`);
            }
            if (failures.length) {
                // Nothing of the batch is written, and what an earlier path of the
                // same request wrote (a colour) goes back: one request, one answer.
                for (const t of touched) fs.writeFileSync(path.join(dir, t.file), t.before, 'utf-8');
                logs.push(`compound presentation batch refused atomically: ${failures.join(' | ')}${touched.length ? ` — ${touched.length} earlier file(s) of this request restored` : ''}`);
                return {
                    ok: false,
                    error: isAr ? `لم أنفّذ دفعة التعديل لأن جزءاً منها لم يُحدَّد بأمان: ${failures.join('؛ ')}` : `The edit batch was not applied safely: ${failures.join('; ')}`,
                    output: { message: isAr ? 'لم أغيّر أي ملف؛ لا أطبّق جزءاً من طلب مركّب ثم أدّعي اكتماله.' : 'No file changed; a compound request is never partially claimed as complete.' },
                    logs,
                } as any;
            }
            for (const [rel, body] of pending) write(rel, body);
            for (const edit of presentationReads) consumeSpans(edit.spans);
            logs.push(`compound presentation batch: ${presentationEdits.length} operation(s), ${pending.size} file(s), atomic and provider-independent`);
        }
        /** The photo the row/hero currently carries — its src, or undefined. */
        const currentSrcOf = (body: string, target: { name: string } | null): string | undefined => target
            ? (body.match(new RegExp(`\\{ name: '${reEsc(target.name)}',[^\\n]*?img: \\{ src: '([^']+)'`)) || [])[1]
            : (body.match(/heroImage: \{ src: '([^']+)'/) || [])[1];
        /** A photo file nothing references any more has no business shipping. */
        const dropUnreferenced = (body: string, src?: string) => {
            if (src && !body.includes(src)) {
                try { fs.unlinkSync(path.join(dir, 'public', src)); logs.push(`image edit: deleted unreferenced ${src}`); }
                catch { /* already gone */ }
            }
        };

        // ── deterministic fast path: «احذف الصورة …» — the mirror of adding.
        //    The row goes back to null (the components render the no-photo
        //    shape by construction), the orphaned file is deleted from
        //    public/, and removing the LAST photo also empties the credits —
        //    no licence line for pictures that left. Same gates, same undo.
        const REMOVE_IMAGE_INTENT = /(احذف|امسح|شيل(?:ي|وا)?|أزل|ازل)[^.\n]{0,30}صور(ة|ه)|\b(remove|delete|drop)\b[^.\n]{0,30}\b(photo|image|picture)\b/i;
        const removeImageIntent = REMOVE_IMAGE_INTENT.test(request);
        if (!touched.length && removeImageIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const target = pickPhotoRow(photoRows(body), request);
            const oldSrc = currentSrcOf(body, target);
            const where = target ? `«${target.name}»` : (isAr ? 'واجهة الصفحة' : 'the hero');
            if (!oldSrc) {
                return {
                    ok: true,
                    output: { message: isAr ? `🖼️ لا توجد صورة على ${where} أصلاً — لا شيء يُحذف.` : `🖼️ ${where} has no photo — nothing to remove.` },
                    logs,
                } as any;
            }
            let next = target
                ? body.replace(new RegExp(`(\\{ name: '${reEsc(target.name)}',[^\\n]*?img: )\\{[^}]*\\}`), '$1null')
                : body.replace(/heroImage: \{[^}]*\}/, 'heroImage: null');
            if (!/img: \{ src: /.test(next) && !/heroImage: \{ src: /.test(next)) {
                next = next.replace(/credits: \[[\s\S]*?\n  \],/, 'credits: [\n  ],');
                logs.push('image edit: last photo removed — credits emptied too');
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok) {
                write(contentRel, next);
                dropUnreferenced(next, oldSrc);
                notes.push(isAr ? `🗑️ أزلت الصورة من ${where} — وعاد الصف نصياً نظيفاً.` : `🗑️ Removed the photo from ${where} — the row is a clean text row again.`);
                consumeClauseOf(REMOVE_IMAGE_INTENT);
                logs.push(`image edit: ${target ? target.name : 'heroImage'} photo removed`);
            } else {
                refused.push(`${contentRel}: image removal breaks the syntax (${gate.error}) — refused`);
            }
        }

        if (!touched.length && imageIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            const rows = photoRows(body);
            const target = pickPhotoRow(rows, request);
            // What the user asked the photo to BE, when they said it.
            let tail = (request.match(/صور(?:ة|ه)\s+([^\n.،!؟]{3,80})/) || request.match(/\b(?:photo|image|picture)\s+(?:of\s+)?([^\n.,!?]{3,80})/i) || [])[1] || '';
            tail = tail.replace(/^(لل|ل|الى|إلى|في|عن|من)\s*/, '')
                .replace(/\b(the|to|for|of|hero|banner|header|section|menu|dish|page)\b/gi, ' ')
                .replace(/(حقيقية|جديدة|أخرى|اخرى|القسم|قسم|طبق|لطبق|البطل|بطل|الواجهة|واجهة|الرئيسية|رئيسية|الترويسة|ترويسة|الغلاف|غلاف|الصفحة|صفحة|الموقع|موقع|القائمة|قائمة|الصورة|بصورة|صورة|الى|إلى)/g, ' ');
            if (target) for (const w of target.name.split(/\s+/)) tail = tail.split(w).join(' ');
            tail = tail.replace(/\s+/g, ' ').trim();
            if (tail.length < 4) tail = '';
            const tagline = (body.match(/tagline: '([^']*)'/) || [])[1] || (body.match(/brand: '([^']*)'/) || [])[1] || '';
            const subject = target
                ? (tail || (target.kind === 'person' ? 'professional headshot portrait' : `${target.name} ${target.second}`))
                : (tail || tagline);
            const slot = target ? (target.kind === 'person' ? 'avatar' as const : 'card' as const) : 'hero' as const;
            if (subject) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `🖼️ أجلب صورة حقيقية مرخّصة: ${subject.slice(0, 60)}`
                    : `🖼️ Fetching a real licensed photo: ${subject.slice(0, 60)}`);
                // THE OWNER'S OWN PHOTOGRAPH WINS. When the message carried an
                // attached image, that file IS the answer — searching an
                // archive for a picture the user already handed over is the
                // field failure «قم باضافه هذه الصوره الى منتج البوس», where
                // Joe described the photo back instead of using it.
                const attached = attachedImagePath(rawRequest);
                let img: { src: string; alt: string } | null = null;
                let credits: Array<{ creator: string; license: string; source: string }> = [];
                if (attached) {
                    img = adoptLocalImage(attached, dir, target?.name || 'صورة');
                    logs.push(`image edit: adopted the ATTACHED file ${path.basename(attached)} → ${img?.src || 'failed'}`);
                    if (img) notes.push(isAr ? '📎 استخدمت الصورة التي أرفقتها أنت — لا حاجة لأرشيف.' : '📎 Used the photo you attached — no archive needed.');
                }
                const { fetchCardImages } = require('./ReactProjectTool');
                if (!img) {
                    const got = await fetchCardImages({
                        subjects: [subject], projDir: dir, hue: (buildPalette(request) as any).hue ?? 260,
                        artifactDir: artifactRootDir(), slot, label: 'edit',
                    });
                    img = got.images[0];
                    credits = got.credits;
                    logs.push(`image edit: subject «${subject}» slot ${slot} → ${got.note}`);
                }
                const got = { images: [img], credits };
                if (!img) {
                    return {
                        ok: true,
                        output: {
                            message: isAr
                                ? `🖼️ لم أجد صورة مرخّصة مناسبة لـ«${subject.slice(0, 50)}» في الأرشيفات — لم أغيّر شيئاً. جرّب وصفاً آخر للصورة.`
                                : `🖼️ The archives had no suitable licensed photo for "${subject.slice(0, 50)}" — nothing was changed. Try another description.`,
                        },
                        logs,
                    } as any;
                }
                const replacedSrc = currentSrcOf(body, target);   // a REPLACE leaves an orphan behind
                let next = target
                    ? body.replace(
                        new RegExp(`(\\{ name: '${reEsc(target.name)}',[^\n]*?img: )(null|\\{[^}]*\\})`),
                        `$1{ src: '${esc(img.src)}', alt: '${esc(img.alt)}' }`)
                    : body.replace(/heroImage: (?:null|\{[^}]*\})/, `heroImage: { src: '${esc(img.src)}', alt: '${esc(img.alt)}' }`);
                if (next === body) {
                    logs.push('image edit: no photo-capable row found in content.js — falling through');
                } else {
                    // The licence line rides along, once per source.
                    for (const c of got.credits) {
                        if (c.source && !next.includes(esc(c.source))) {
                            next = next.replace(/credits: \[\n?/, m => `${m}    { creator: '${esc(c.creator)}', license: '${esc(c.license)}', source: '${esc(c.source)}' },\n`);
                        }
                    }
                    const gate = syntaxOk(contentRel, next);
                    if (gate.ok) {
                        write(contentRel, next);
                        dropUnreferenced(next, replacedSrc);
                        const where = target ? `«${target.name}»` : (isAr ? 'واجهة الصفحة' : 'the hero');
                        notes.push(isAr
                            ? `🖼️ أضفت صورة حقيقية مرخّصة إلى ${where} (${img.src}) — والاعتماد في التذييل.`
                            : `🖼️ Added a real licensed photo to ${where} (${img.src}), credited in the footer.`);
                        logs.push(`image edit: ${target ? target.name : 'heroImage'} ← ${img.src}`);
                        consumeClauseOf(IMAGE_INTENT);
                    } else {
                        refused.push(`${contentRel}: image edit breaks the syntax (${gate.error}) — refused`);
                    }
                }
            }
        }

        // ── deterministic fast path: DESIGN FAMILY swap — «غيّر الطراز إلى
        //    فاخر». The scaffold wrote the family as one marker-wrapped
        //    variable block in base.css; the swap replaces exactly that
        //    block, the palette and every component stay untouched, and the
        //    usual gates, build verify, undo and live preview ride along.
        const STYLE_INTENT = /(غيّ?ر|بدّ?ل|اجعل|خلّ?ي)[^.\n]{0,25}(الطراز|طراز|النمط|نمط|الستايل|ستايل|الأسلوب|أسلوب|التصميم)|\b(change|switch|make)\b[^.\n]{0,25}\b(style|theme|look)\b/i;
        const styleIntent = STYLE_INTENT.test(request);
        const baseCssRel = 'src/styles/base.css';
        if (!touched.length && styleIntent && fs.existsSync(path.join(dir, baseCssRel))) {
            const { familyFor, swapFamilyCss, familyOf, FAMILY_LABEL_AR } = require('../../../core/design/families');
            const wanted = familyFor(request, 'generic');
            // «غيّر الطراز» with no named family must ASK, not silently pick
            // the generic default.
            const named = wanted !== 'minimal' || /(بسيط|نظيف|مينيمال|minimal|clean)/i.test(request);
            const css = fs.readFileSync(path.join(dir, baseCssRel), 'utf-8');
            const current = familyOf(css);
            if (current && !named) {
                return { ok: true, output: { message: `🎨 الطراز الحالي: «${FAMILY_LABEL_AR[current]}». سمِّ الطراز الجديد — «غيّر الطراز إلى فاخر» أو جريء أو دافئ أو بسيط.` }, logs } as any;
            }
            if (current) {
                if (current === wanted) {
                    return { ok: true, output: { message: `🎨 الطراز الحالي هو بالفعل «${FAMILY_LABEL_AR[wanted]}» — اطلب: فاخر، جريء، دافئ، أو بسيط.` }, logs } as any;
                }
                const next = swapFamilyCss(css, wanted);
                if (next) {
                    const gate = syntaxOk(baseCssRel, next);
                    if (gate.ok) {
                        write(baseCssRel, next);
                        notes.push(isAr
                            ? `🎨 بدّلت الطراز من «${FAMILY_LABEL_AR[current]}» إلى «${FAMILY_LABEL_AR[wanted]}» — الألوان والمحتوى كما هما.`
                            : `🎨 Switched the design family to "${wanted}".`);
                        logs.push(`design family: ${current} → ${wanted} — deterministic, no model`);
                        consumeClauseOf(STYLE_INTENT);
                    } else {
                        refused.push(`${baseCssRel}: family swap breaks the css (${gate.error}) — refused`);
                    }
                }
            }
        }

        // ── deterministic fast path: whole-ROW add/delete — «ضف طبق كباب
        //    مشوي بسعر 55»، «احذف منتج طقم الهدية». The serializer's row
        //    format is the contract: a new row is one well-formed line
        //    inserted before the array's close (with a best-effort REAL
        //    photo), a deleted row is one line removed with its orphaned
        //    file and, when it was the last photo, the credits. These run
        //    BEFORE the text-edit branch on purpose: «بسعر 55» would
        //    otherwise read as a price edit on a row that does not exist yet.
        const rowNounM = request.match(/(?<![ء-ي])(?:ال)?(طبق|منتج)(?![ء-ي])|\b(dish|product)\b/i);
        // The field asked «تعديل على المنتجات قم بزياده عطر اسمه البوس» and
        // nothing matched: the verb was «زيادة», and the thing being added was
        // «عطر», not the word «منتج». The narrow pattern sent it to the model,
        // which invented an image path. So a SECOND, broader reading: any
        // add-verb + a named thing + a hint of WHICH list it belongs to.
        // No lookbehind here on purpose: the field wrote «بزياده» — the verb
        // carried a «بـ» prefix, and a strict word boundary refused it. The
        // pair of conditions below (a NAMED thing + the list it belongs to)
        // is what keeps this from firing on ordinary sentences.
        const addVerbPattern = /(ضي?ف|أضف|اضف|زد|زياد[ةه]|إضاف[ةه]|اضاف[ةه]|أدرج|ادرج)|\b(add|insert)\b/i;
        const namedPattern = /(?:اسمه?|باسم|بعنوان|named?|called)\s+([^\n،.]{1,40})/i;
        const listHintPattern = /(?<![ء-ي])(المنتجات|منتجات|products)(?![ء-ي])|(?<![ء-ي])(القائمة|المنيو|الأطباق|menu|dishes)(?![ء-ي])/i;
        // Evidence for a broad row insertion must live in one clause. A compound
        // request such as "rename the brand ..., add a services link to the menu"
        // contains an add verb, a name and a menu word globally, but those words
        // describe two different edits. Combining evidence across punctuation
        // fabricated a menu row from the brand-renaming clause.
        const broadAddRowClause = request
            .split(/[\n،,.؛;!؟?]+/u)
            .map(clause => clause.trim())
            .find(clause => addVerbPattern.test(clause) && namedPattern.test(clause) && listHintPattern.test(clause));
        const addVerb = addVerbPattern.test(request);
        const namedM = (broadAddRowClause || request).match(namedPattern);
        const listHintM = (broadAddRowClause || request).match(listHintPattern);
        const addRowIntent = (!!rowNounM && /((?<![ء-ي])(ضي?ف|أضف|اضف|حطّ?)(?![ء-ي])[^.\n]{0,15}(طبق|منتج))|\badd\b[^.\n]{0,25}\b(dish|product)\b/i.test(request))
            || (addVerb && !!broadAddRowClause && !!namedM && !!listHintM);
        const delRowIntent = !!rowNounM && !addRowIntent && !/صور|photo|image|picture/i.test(request)
            && /((احذف|امسح|شيل|أزل|ازل)[^.\n]{0,20}(طبق|منتج))|\b(remove|delete)\b[^.\n]{0,25}\b(dish|product)\b/i.test(request);
        // WHICH list: the row noun decides when it is there; otherwise the
        // list the request named («على المنتجات» → products).
        const menuArr = rowNounM
            ? (/طبق|dish/i.test(rowNounM[0]) ? 'menu' : 'products')
            : (listHintM && listHintM[2] ? 'menu' : 'products');

        if (!touched.length && addRowIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            // «… عطر اسمه البوس مع صورة له» → «البوس». The explicit «اسمه»
            // capture wins; the old positional read stays the fallback.
            const nameTail = (namedM?.[1] || '').trim()
                || ((request.match(/(?:(?<![ء-ي])(?:طبق|منتج)(?![ء-ي])|\b(?:dish|product)\b)\s+(.+)$/i) || [])[1] || '');
            let name = nameTail.split(/\s+(?:بسعر|بوصف|مع\s)/)[0].split(/\s+(?:price|for|at|with)\b/i)[0] || '';
            name = name.trim().replace(/^(جديد\s+|اسمه\s+|باسم\s+|called\s+|named\s+)/i, '').replace(/^[«"']|[»"'.،!؟]+$/g, '').trim();
            if (!name) {
                return { ok: true, output: { message: isAr ? '➕ سمِّ العنصر الجديد — مثال: «ضف طبق كباب مشوي بسعر 55».' : '➕ Name the new item — e.g. "add a dish Grilled kebab for 55".' }, logs } as any;
            }
            if (body.includes(`name: '${esc(name)}'`)) {
                return { ok: true, output: { message: isAr ? `➕ «${name}» موجود مسبقاً — قل «غيّر سعر ${name} إلى …» لتعديله.` : `➕ "${name}" already exists — say "change the price of ${name} to …".` }, logs } as any;
            }
            const block = (body.match(new RegExp(`${menuArr}: \\[\\n([\\s\\S]*?)\\n  \\],`)) || [])[1] || '';
            const siblingPrice = (block.match(/price: '([^']*)'/) || [])[1] || '';
            const priceRaw = ((request.match(/(?:بسعر|\bprice\b|\bfor\b|\bat\b)\s*\$?([^\n.،]{1,30})/i) || [])[1] || '')
                .split(/\s+(?:بوصف|described)/)[0].trim();
            const price = priceRaw
                ? (/^\d+([.,]\d+)?$/.test(priceRaw) && /\d/.test(siblingPrice) ? siblingPrice.replace(/\d+([.,]\d+)?/, priceRaw) : priceRaw)
                : '—';
            const desc = ((request.match(/(?:بوصف|ووصفه?)\s+(.+)$/) || request.match(/\bdescribed as\s+(.+)$/i) || [])[1] || '').trim()
                || (isAr ? (menuArr === 'menu' ? 'طبق جديد من مطبخنا' : 'إضافة جديدة إلى المتجر') : (menuArr === 'menu' ? 'A new dish from our kitchen' : 'A new addition to the store'));
            // A REAL photo for the newcomer, best-effort like every photo step.
            let img: { src: string; alt: string } | null = null;
            let addCredits: Array<{ creator: string; license: string; source: string }> = [];
            // The owner's OWN photograph, when they attached one, beats any
            // archive — «ضف منتج … مع هذه الصورة» uses the file they sent.
            const attachedForRow = attachedImagePath(rawRequest);
            if (attachedForRow) {
                img = adoptLocalImage(attachedForRow, dir, name);
                if (img) logs.push(`row add: adopted the ATTACHED file → ${img.src}`);
            }
            try {
                if (img) throw { skip: true };
                const { fetchCardImages } = require('./ReactProjectTool');
                const got = await fetchCardImages({
                    subjects: [`${name} ${desc}`], projDir: dir, hue: (buildPalette(request) as any).hue ?? 260,
                    artifactDir: artifactRootDir(), slot: 'card', label: 'edit',
                });
                img = got.images[0];
                addCredits = got.credits;
                logs.push(`row add: photo → ${got.note}`);
            } catch (e: any) { if (!e?.skip) { /* the row ships clean without one */ } }
            // A product row carries a slug — it is the address of its own
            // page. A row added later without one would link to nowhere.
            const rowSlug = (String(name).toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'item';
            // ONLY this array decides — a lazy scan would run past `menu: [`
            // straight into `products: [`, and dishes would sprout urls.
            const ownBlock = (body.match(new RegExp(`${menuArr}: \\[([\\s\\S]*?)\\n  \\],`)) || [])[1] || '';
            const wantsSlug = /slug: '/.test(ownBlock);
            const rowLine = `    { name: '${esc(name)}', desc: '${esc(desc)}', price: '${esc(price)}',${wantsSlug ? ` slug: '${esc(rowSlug)}',` : ''} img: ${img ? `{ src: '${esc(img.src)}', alt: '${esc(img.alt)}' }` : 'null'} },`;
            let next = body.replace(new RegExp(`(${menuArr}: \\[\\n[\\s\\S]*?)(\\n  \\],)`), (_m, a: string, b: string) => `${a}\n${rowLine}${b}`);
            for (const c of addCredits) {
                if (c.source && !next.includes(esc(c.source))) {
                    next = next.replace(/credits: \[\n?/, m2 => `${m2}    { creator: '${esc(c.creator)}', license: '${esc(c.license)}', source: '${esc(c.source)}' },\n`);
                }
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok && next !== body) {
                write(contentRel, next);
                notes.push(isAr
                    ? `➕ أضفت «${name}» إلى ${menuArr === 'menu' ? 'القائمة' : 'المنتجات'} بسعر «${price}»${img ? ' مع صورة حقيقية مرخّصة' : ''}.`
                    : `➕ Added "${name}" (${price})${img ? ' with a real licensed photo' : ''}.`);
                logs.push(`row add: ${name} → ${menuArr}`);
                for (const value of [name, price, desc]) consumeValue(value);
            } else if (!gate.ok) {
                refused.push(`${contentRel}: row insert breaks the syntax (${gate.error}) — refused`);
            }
        }

        if (!touched.length && delRowIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const rows = [...body.matchAll(/^ {4}\{ name: '([^']*)',[^\n]*\},$/gm)]
                .map(m => ({ name: m[1], line: m[0] }))
                .filter(r => /desc: '/.test(r.line) && /price: '/.test(r.line));   // dishes and products, not tiers/people
            const target = pickPhotoRow(rows, request);
            if (!target) {
                const names = rows.map(r => `«${r.name}»`).join('، ');
                return { ok: true, output: { message: isAr ? `🗑️ سمِّ العنصر المطلوب حذفه — العناصر: ${names || 'لا شيء'}.` : `🗑️ Name the item to delete — items: ${names || 'none'}.` }, logs } as any;
            }
            const oldSrc = (target.line.match(/img: \{ src: '([^']+)'/) || [])[1];
            let next = body.replace(target.line + '\n', '');
            if (!/img: \{ src: /.test(next) && !/heroImage: \{ src: /.test(next)) {
                next = next.replace(/credits: \[[\s\S]*?\n  \],/, 'credits: [\n  ],');
                logs.push('row delete: last photo left — credits emptied too');
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok && next !== body) {
                write(contentRel, next);
                dropUnreferenced(next, oldSrc);
                notes.push(isAr ? `🗑️ حذفت «${target.name}» من ${menuArr === 'menu' ? 'القائمة' : 'المنتجات'}.` : `🗑️ Deleted "${target.name}".`);
                logs.push(`row delete: ${target.name}`);
                consumeValue(target.name);
            } else if (!gate.ok) {
                refused.push(`${contentRel}: row delete breaks the syntax (${gate.error}) — refused`);
            }
        }

        // ── deterministic fast path: named-row TEXT edits — «غيّر سعر طقم
        //    الهدية إلى 200»، «عدّل وصف الإصدار الفاخر إلى …»، «غيّر اسم …».
        //    The row lives in content.js in the serializer's own single-line
        //    format; the field swap is a regex on that line — no model writes
        //    code. A bare number keeps the row's currency affix («65 ر.س» +
        //    «200» → «200 ر.س»), and same gates, build verify and undo apply.
        const priceIntent = /(?<![ء-ي])(سعر|السعر|بسعر|أسعار|الأسعار)(?![ء-ي])|\bprices?\b/i.test(request);
        const descIntent = /(?<![ء-ي])(وصف|الوصف)(?![ء-ي])|\bdescription\b/i.test(request);
        const renameIntent = /(?<![ء-ي])(اسم|الاسم)(?![ء-ي])|\brename\b/i.test(request);
        if (!touched.length && isNamedRowTextEditRequest(request) && (priceIntent || descIntent || renameIntent) && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            // Every serialized row, whole line — menu, products, tiers,
            // testimonials all share the `{ name: '…', … },` shape.
            const rowLines = [...body.matchAll(/^ {4}\{ name: '([^']*)',[^\n]*\},$/gm)]
                .map(m => ({ name: m[1], line: m[0] }))
                .filter(r => priceIntent ? /price: '/.test(r.line) : descIntent ? /desc: '/.test(r.line) : true);
            const target = pickPhotoRow(rowLines, request);
            // The new value: whatever follows إلى/ليصبح/=/to, quotes stripped.
            const val = boundedChangeValue(request);
            const field = priceIntent ? (isAr ? 'سعر' : 'price') : descIntent ? (isAr ? 'وصف' : 'description') : (isAr ? 'اسم' : 'name');
            if (!target || !val) {
                // Prices live ONLY in rows, so a rowless price request earns a
                // guided answer. A rowless اسم/وصف request may mean the brand
                // or a section — that belongs to the model path below.
                if (priceIntent) {
                    const names = rowLines.map(r => `«${r.name}»`).join('، ');
                    return {
                        ok: true,
                        output: {
                            message: isAr
                                ? `✏️ لأعدّل ${field} عنصرٍ بعينه، سمِّه واذكر القيمة الجديدة بعد «إلى» — العناصر المتاحة: ${names || 'لا صفوف قابلة للتعديل'}.\nمثال: «غيّر سعر ${rowLines[0]?.name || 'العنصر'} إلى 200»`
                                : `✏️ Name the item and the new value after "to" — available items: ${names || 'none'}.`,
                        },
                        logs,
                    } as any;
                }
            }
            if (target && val) {
                let newLine = target.line;
                if (priceIntent) {
                    const oldPrice = (target.line.match(/price: '([^']*)'/) || [])[1] || '';
                    // A bare number inherits the row's own currency affix.
                    const np = /^\d+([.,]\d+)?$/.test(val) && /\d/.test(oldPrice) ? oldPrice.replace(/\d+([.,]\d+)?/, val) : val;
                    newLine = target.line.replace(/price: '[^']*'/, `price: '${esc(np)}'`);
                } else if (descIntent) {
                    newLine = target.line.replace(/desc: '[^']*'/, `desc: '${esc(val)}'`);
                } else {
                    newLine = target.line.replace(`name: '${target.name}'`, `name: '${esc(val)}'`);
                    // The url follows the name: a renamed product keeps a
                    // working page instead of a slug pointing at its old self.
                    if (/slug: '/.test(newLine)) {
                        const s2 = (String(val).toLowerCase()
                            .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'item';
                        newLine = newLine.replace(/slug: '[^']*'/, `slug: '${esc(s2)}'`);
                    }
                }
                if (newLine !== target.line) {
                    const next = body.replace(target.line, newLine);
                    const gate = syntaxOk(contentRel, next);
                    if (gate.ok) {
                        write(contentRel, next);
                        notes.push(isAr
                            ? `✏️ غيّرت ${field} «${target.name}»${priceIntent || renameIntent ? ` إلى «${(newLine.match(priceIntent ? /price: '([^']*)'/ : /name: '([^']*)'/) || [])[1]}»` : ''}.`
                            : `✏️ Changed the ${field} of "${target.name}".`);
                        logs.push(`text edit: ${target.name} ${field} updated — no model call`);
                        consumeValue(target.name);
                        consumeValue(val);
                    } else {
                        refused.push(`${contentRel}: text edit breaks the syntax (${gate.error}) — refused`);
                    }
                }
            }
        }

        /**
         * THE COMMONEST EDIT OF ALL — AND IT NEEDED A MODEL TO MAKE IT.
         *
         * «غيّر اسم الموقع إلى …» is the first thing anyone says after seeing
         * their build. It had no deterministic path: the row editor above
         * looks for a NAMED row and finds none, and the comment there says
         * plainly that a rowless «اسم» request «belongs to the model path
         * below». So the simplest edit in the product was the one that
         * depended on a network, and on a machine with no key it answered
         * «لم أجد ما يطابق الطلب» — about a name that is sitting in the file
         * in one line.
         *
         * The brand lives in exactly two places and every other file reads it
         * from there: `brand:` in src/content.js, and the `<title>` of
         * index.html. Two known bytes are not a job for a language model.
         */
        {
            const siteWord = /(الموقع|موقعي|التطبيق|تطبيقي|المشروع|مشروعي|النظام|الصفحة|صفحتي|site|website|app|project|page)/i.test(request);
            const nameWord = /(?<![ء-ي])(اسم|الاسم|عنوان|العنوان|سمّه|سمه)(?![ء-ي])|\b(brand|title|rename)\b/i.test(request);
            const brandRenameIntent = /(?:غيّ?ر|بدّ?ل|استبدل)\s+(?:اسم\s+)?(?:العلام[ةه](?:\s+التجاري[ةه])?|الموقع|المشروع|التطبيق|النظام|الصفحة)|\b(?:rename|change|replace)\b[^.\n]{0,35}\b(?:brand|site|website|project|app|application)\b/iu.test(request);
            const val = boundedChangeValue(request);
            const contentAbs = path.join(dir, contentRel);
            if (brandRenameIntent && siteWord && nameWord && val && val.length <= 60 && fs.existsSync(contentAbs)) {
                deterministicIntentHandled = true;
                const body = fs.readFileSync(contentAbs, 'utf-8');
                const oldBrand = (body.match(/\n\s*brand:\s*'([^']*)'/) || [])[1] || '';
                const safe = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
                const next = body.replace(/(\n\s*brand:\s*)'[^']*'/, `$1'${safe}'`);
                const gate = syntaxOk(contentRel, next);
                if (next !== body && gate.ok) {
                    write(contentRel, next);
                    /**
                     * The tab title is the other half of the same fact. Leaving
                     * it behind means the header says one name and the browser
                     * tab says the old one — the kind of half-rename that looks
                     * like the edit silently failed.
                     */
                    const htmlAbs = path.join(dir, 'index.html');
                    if (oldBrand && fs.existsSync(htmlAbs)) {
                        const html = fs.readFileSync(htmlAbs, 'utf-8');
                        const swapped = html.split(oldBrand).join(val);
                        if (swapped !== html) write('index.html', swapped);
                    }
                    notes.push(isAr
                        ? `✏️ غيّرت اسم ${/التطبيق|تطبيقي/i.test(request) ? 'التطبيق' : 'الموقع'}${oldBrand ? ` من «${oldBrand}»` : ''} إلى «${val}» — في المحتوى وفي عنوان التبويب.`
                        : `✏️ Renamed the site${oldBrand ? ` from "${oldBrand}"` : ''} to "${val}" — in the content and in the tab title.`);
                    logs.push(`brand edit: ${oldBrand || '(unset)'} → ${val} — no model call`);
                    consumeRename();
                } else if (next !== body) {
                    refused.push(`${contentRel}: renaming breaks the syntax (${gate.error}) — refused`);
                } else if (oldBrand === val) {
                    logs.push(`brand edit already satisfied: ${val}`);
                    consumeRename();
                }
            }
        }

        // A generated site has a stable content/App contract, so adding a
        // services section and its navigation target does not need a provider.
        // This path composes with colour and brand edits in the same request.
        const servicesEdit = readServicesSectionEdit(structure);
        if (servicesEdit && fs.existsSync(path.join(dir, contentRel)) && fs.existsSync(path.join(dir, 'src', 'App.jsx'))) {
            deterministicIntentHandled = true;
            let body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            let app = fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf-8');
            const bodyBeforeServices = body;
            const appBeforeServices = app;
            const contextText = `${(body.match(/heroTitle:\s*'([^']*)'/) || [])[1] || ''} ${(body.match(/heroLede:\s*'([^']*)'/) || [])[1] || ''}`;
            const consulting = /استشار|consult/i.test(contextText);
            const seeds = artifactIsAr
                ? consulting
                    ? [
                        ['استراتيجية الأعمال', 'نحوّل أهدافك إلى خطة عملية واضحة قابلة للقياس.'],
                        ['تحسين العمليات', 'نبسّط سير العمل ونرفع الكفاءة من دون تعقيد إضافي.'],
                        ['النمو المؤسسي', 'نبني معك مسار نمو متوازناً يدعم القرار والتنفيذ.'],
                    ]
                    : [
                        ['التخطيط', 'نحدّد الاحتياج ونبني مساراً واضحاً للوصول إلى النتيجة.'],
                        ['التنفيذ', 'نحوّل الخطة إلى عمل متقن بمراحل قابلة للقياس.'],
                        ['الدعم المستمر', 'نراجع النتائج ونطوّرها مع تغيّر احتياجاتك.'],
                    ]
                : consulting
                    ? [
                        ['Business strategy', 'We turn your goals into a clear, measurable action plan.'],
                        ['Process improvement', 'We simplify workflows and raise efficiency without added complexity.'],
                        ['Organizational growth', 'We build a balanced path from decision to execution.'],
                    ]
                    : [
                        ['Plan', 'We define the need and map a clear route to the outcome.'],
                        ['Deliver', 'We turn the plan into measured, careful execution.'],
                        ['Support', 'We review results and evolve them with your needs.'],
                    ];
            const rows = Array.from({ length: servicesEdit.count }, (_, index) => {
                const seed = seeds[index % seeds.length];
                const suffix = index < seeds.length ? '' : ` ${index + 1}`;
                return `    { title: '${jsEsc(seed[0] + suffix)}', text: '${jsEsc(seed[1])}' },`;
            }).join('\n');
            if (!/\n\s*servicesTitle:\s*'/.test(body)) {
                body = body.replace(/(\n\s*contactTitle:\s*)/, `\n  servicesTitle: '${jsEsc(servicesEdit.label)}',\n  services: [\n${rows}\n  ],$1`);
            }
            if (/navLinks:\s*\[/.test(body) && !/href:\s*'#services'/.test(body)) {
                body = body.replace(/(navLinks:\s*\[\s*\n)/, `$1    { href: '#services', label: '${jsEsc(servicesEdit.label)}' },\n`);
            }
            if (!/id=["']services["']/.test(app)) {
                const section = `        <section className="section" id="services">\n          <div className="wrap">\n            <h2>{content.servicesTitle}</h2>\n            <div className="grid-3">\n              {content.services.map((service) => (\n                <article className="card" key={service.title}>\n                  <h3>{service.title}</h3>\n                  <p>{service.text}</p>\n                </article>\n              ))}\n            </div>\n          </div>\n        </section>\n`;
                const contact = /(\s*<Contact\s+content=\{content\}\s*\/>)/;
                app = contact.test(app)
                    ? app.replace(contact, `\n${section}$1`)
                    : app.replace(/\s*<\/main>/, `\n${section}      </main>`);
            }
            // Generated projects animate cards individually. A reveal marker
            // on the whole anchor target is never observed by their reveal
            // hook, leaving the requested section at opacity:0 even though its
            // id exists and the URL changes correctly.
            app = app.replace(/(<section\b[^>]*\bid=["']services["'][^>]*)\s+data-reveal(?=[\s>])/iu, '$1');
            const contentGate = syntaxOk(contentRel, body);
            const appGate = syntaxOk('src/App.jsx', app);
            if (contentGate.ok && appGate.ok && /href:\s*'#services'/.test(body) && /id="services"/.test(app)) {
                write(contentRel, body);
                write('src/App.jsx', app);
                const servicesChanged = body !== bodyBeforeServices || app !== appBeforeServices;
                notes.push(isAr
                    ? (servicesChanged
                        ? `أضفت قسم «${servicesEdit.label}» وفيه ${servicesEdit.count} خدمات وربطته بالقائمة قبل التواصل.`
                        : `قسم «${servicesEdit.label}» وخدماته الثلاث وربطه بالقائمة موجودة بالفعل.`)
                    : (servicesChanged
                        ? `Added the “${servicesEdit.label}” section with ${servicesEdit.count} services and linked it from the navigation.`
                        : `The “${servicesEdit.label}” section, its ${servicesEdit.count} services, and navigation link are already in place.`));
                logs.push(servicesChanged
                    ? `services section edit: ${servicesEdit.count} item(s), nav=#services, before-contact=${servicesEdit.beforeContact}`
                    : `services section already satisfied: ${servicesEdit.count} item(s), nav=#services`);
                consumeSpans(servicesEdit.spans);
            } else {
                refused.push(`services section: generated-project contract unavailable or unsafe (${contentGate.error || appGate.error || 'missing link target'})`);
            }
        }

        // A quoted wording replacement is fully specified. Replace only the
        // exact source text, then use the normal syntax, build and QA gates.
        // It runs whenever no path that ran has read its two values (round 22:
        // it ran only when nothing had been touched, so a wording change beside
        // a photo or a section was dropped without a word); a brand rename or a
        // row rename that read the same pair has already made it.
        {
            const literal = readLiteral(structure);
            if (literal && !literal.spans.some(span => consumed.has(span))) {
                // Every file of his source that holds it (see the compound path above).
                const found = await filesHolding(await listFiles(dir), literal.from, rel => fs.promises.readFile(path.join(dir, rel), 'utf-8'));
                const changed: string[] = [];
                for (const rel of found.hits.filter(file => !isNotWording(file))) {
                    const before = await fs.promises.readFile(path.join(dir, rel), 'utf-8');
                    const after = before.split(literal.from).join(literal.to);
                    const gate = syntaxOk(rel, after);
                    if (gate.ok && after !== before) { write(rel, after); changed.push(rel); }
                    else if (!gate.ok) refused.push(`${rel}: literal text edit breaks the syntax (${gate.error}) — refused`);
                }
                if (changed.length) {
                    consumeSpans(literal.spans);
                    notes.push(literalNote(literal.from, literal.to, changed, found.dataStores));
                    logs.push(`literal text edit: ${literal.from} -> ${literal.to} (${changed.join(', ')})`);
                }
            }
        }

        // ── the general path: SEARCH/REPLACE from the model ─────────────────
        if (!touched.length && !deterministicIntentHandled) {
            modelReadTheRequest = true;
            // Read a bounded number at a time (round 22: one Promise.all over
            // every file met EMFILE on a large project and read it as empty),
            // and a data store his app writes is never offered as a file to edit.
            const listed = await listFiles(dir);
            const listedBodies = await readBodies(dir, listed);
            const storeTails = listed.flatMap((rel, i) => (SCRIPT_FILE.test(rel) || /(?:^|\/)package\.json$/iu.test(rel) ? jsonStoresWrittenBy(listedBodies[i]) : []));
            const kept = listed.map((rel, i) => ({ rel, body: listedBodies[i] })).filter(item => !isJsonStore(item.rel, storeTails));
            const files = kept.map(item => item.rel);
            const bodies = kept.map(item => item.body);
            // Rank files by overlap with the request's words; content.js first
            // for wording changes, components for structure.
            const { scored } = rankFilesForEdit(
                request,
                files.map((f, i) => ({ f, body: bodies[i] })),
            );
            if (!scored.length) {
                return { ok: true, output: { message: isAr ? 'لم أستطع تحديد الملف المقصود — سمِّ الملف أو الجزء المطلوب تعديله.' : 'Could not locate the file to edit — name the file or the part to change.' }, logs } as any;
            }
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? `🔬 تعديل جراحي: ${scored.map(s => s.f).join('، ')}`
                : `🔬 Surgical edit: ${scored.map(s => s.f).join(', ')}`);
            const prompt = `You edit code SURGICALLY. Change ONLY what the request asks; never rewrite whole files.
Reply with one or more blocks in EXACTLY this format — nothing else:

FILE: <relative path>
<<<<<<< SEARCH
<the exact lines as they are now — copied verbatim from the file>
=======
<the replacement lines>
>>>>>>> REPLACE

Rules: the SEARCH text must be an exact quote of what is in the file. Keep edits minimal. ${artifactIsAr ? 'Any human-visible text you write must be Arabic.' : ''}

If the request does NOT say what to change in these files — it names no element, no text, no colour, no file, and no behaviour that is in them — then do NOT invent one. Reply with exactly one line and nothing else:
CANNOT TELL: <what you would need the user to say>
This is a correct answer, not a failure. Changing something the user did not ask for is the failure.`;
            let raw = '';
            try {
                raw = await routeToModel([
                    { role: 'system', content: prompt },
                    { role: 'user', content: `THE REQUEST: ${request}\n\n${scored.map(s => `FILE: ${s.f}\n\`\`\`\n${s.body}\n\`\`\``).join('\n\n')}` },
                ], undefined, undefined, undefined, undefined, undefined, undefined, context);
            } catch (e: any) {
                return { ok: false, error: `edit_model_failed: ${e?.message || e}`, logs } as any;
            }
            /**
             * A REQUEST THAT NAMES NOTHING DOES NOT AUTHORISE A CHANGE.
             *
             * «سوّي لي شي حلو» edited the owner's sales project and scored the
             * result 97/100. Nothing in that sentence points at that project,
             * at a file, or at anything in one. Asking costs him a sentence;
             * guessing costs him work he did not ask to have altered.
             */
            let cannot = modelCannotTell(raw);
            if (cannot && isActionableEditRequest(request)) {
                // A provider may mistake a concise, valid engineering brief
                // for an unspecified visual edit. One stronger clarification
                // keeps the safety boundary (the same files and request) while
                // giving the model a chance to produce an evidence-bound diff.
                logs.push(`model asked for clarification on an actionable brief: ${cannot} — retrying once with implementation context`);
                const retryPrompt = `${prompt}\n\nThe request is an actionable engineering brief, not a request for a visual redesign. Implement the named behaviour using the supplied files. Derive the smallest safe SEARCH/REPLACE diff from the existing code; do not ask the user to restate a target that is already named. If the files truly cannot support the request, return CANNOT TELL again.`;
                try {
                    raw = await routeToModel([
                        { role: 'system', content: retryPrompt },
                        { role: 'user', content: `THE REQUEST: ${request}\n\n${scored.map(s => `FILE: ${s.f}\n\`\`\`\n${s.body}\n\`\`\``).join('\n\n')}` },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                    cannot = modelCannotTell(raw);
                } catch (e: any) {
                    logs.push(`actionable edit clarification failed: ${String(e?.message || e).slice(0, 120)}`);
                }
            }
            if (cannot) {
                logs.push(`model declined to guess: ${cannot}`);
                return {
                    // A refusal is useful evidence, but it is not a completed
                    // edit. Returning green here let the pipeline announce a
                    // verified phase after changing zero files.
                    ok: false,
                    error: isAr
                        ? `لم يُنفّذ التعديل: ${cannot}`
                        : `Edit not applied: ${cannot}`,
                    output: {
                        message: isAr
                            ? `طلبك لا يخبرني بما أغيّره في هذا المشروع، فلم أغيّر شيئاً.\nقل لي ما الذي تريد تعديله — عنصراً أو نصاً أو لوناً أو ملفاً.`
                            : `Your request does not say what to change in this project, so I changed nothing.\nTell me what to edit — an element, some text, a colour, or a file.`,
                        askedFor: cannot,
                    },
                    logs,
                } as any;
            }
            const blocks = parseEditBlocks(raw);
            logs.push(`model returned ${blocks.length} edit block(s)`);
            for (const b of blocks.slice(0, 8)) {
                const abs = path.join(dir, b.file);
                if (!fs.existsSync(abs)) { refused.push(`${b.file}: no such file`); continue; }
                const current = touched.find(t => t.file === b.file)?.after ?? fs.readFileSync(abs, 'utf-8');
                const next = applyEditBlock(current, b);
                if (next === null) { refused.push(`${b.file}: SEARCH text not found — refused (the model quoted code that is not there)`); continue; }
                const gate = syntaxOk(b.file, next);
                if (!gate.ok) { refused.push(`${b.file}: edit breaks the syntax (${gate.error}) — refused`); continue; }
                write(b.file, next);
            }
            for (const r of refused) logs.push(`refused: ${r}`);
        }

        if (!touched.length && !deterministicIntentHandled) {
            return {
                ok: true,
                output: {
                    message: isAr
                        ? `لم يتغير أي ملف${refused.length ? ` — رفضت ${refused.length} تعديلاً غير آمن:\n${refused.map(r => `   • ${r}`).join('\n')}` : ' — لم أجد ما يطابق الطلب في ملفات المشروع.'}`
                        : `No file changed${refused.length ? ` — ${refused.length} unsafe edit(s) refused.` : '.'}`,
                },
                logs,
            } as any;
        }

        // ── ANTI-FABRICATION GATE ───────────────────────────────────────────
        // A model-written patch once added a product row carrying
        // `img: { src: 'images/boss.jpg' }` — a file that never existed. The
        // build was green (it is just a string) and the shipped page asked
        // the server for a photo that answered 404.
        //
        // So: every image reference this edit INTRODUCES must point at a file
        // that is really on disk. An invented one is stripped back to `null`
        // — the row survives, the lie does not — and the answer says so.
        const invented: string[] = [];
        for (const t of touched) {
            // EVERY reference in a file this edit just wrote is checked, not
            // only the new ones: a dangling path that slipped in earlier is
            // still a 404 on the shipped page, and this is the moment to heal
            // it rather than the next time someone notices.
            const refsOf = (s: string) => new Set([...s.matchAll(/src: '((?:images|assets)\/[^']+)'/g)].map(m => m[1]));
            const ghosts = [...refsOf(t.after)].filter(r => !fs.existsSync(path.join(dir, 'public', r)) && !fs.existsSync(path.join(dir, r)));
            if (!ghosts.length) continue;
            let repaired = t.after;
            for (const g of ghosts) {
                invented.push(g);
                repaired = repaired.split(`{ src: '${g}', alt: `).join('@@JOE_GHOST@@')
                    .replace(/@@JOE_GHOST@@[^}]*\}/g, 'null');
            }
            if (repaired !== t.after) {
                t.after = repaired;
                fs.writeFileSync(path.join(dir, t.file), repaired, 'utf-8');
                logs.push(`anti-fabrication: ${ghosts.length} invented image path(s) stripped: ${ghosts.join(', ')}`);
            }
        }
        if (invented.length) {
            notes.push(isAr
                ? `🚫 حذفت ${invented.length} مسار صورة مُختلَق (${invented.join('، ')}) — الملف غير موجود فعلاً. أرفق الصورة أو قل «ضف صورة لمنتج …» لأجلب واحدة حقيقية.`
                : `🚫 Removed ${invented.length} invented image path(s) (${invented.join(', ')}) — no such file. Attach a photo or say "add a photo to …".`);
        }

        // ── whole-project verification with the real build ──────────────────
        if (fs.existsSync(path.join(dir, 'node_modules'))) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أتحقق بالبناء الحقيقي (vite build)…' : '🏗️ Verifying with the real build…');
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const { withoutViteConfigForBuild, portableViteBuildArgs } = require('./ReactProjectTool');
            buildVerified = await withoutViteConfigForBuild(dir, async () =>
                (await executionEngine.runArgvStreaming('npm', portableViteBuildArgs(), {
                    cwd: dir, timeout: 180_000, env: { NO_COLOR: '1' },
                }).done).ok,
            );
            if (!buildVerified) {
                for (const t of touched) fs.writeFileSync(path.join(dir, t.file), t.before, 'utf-8');
                logs.push('build FAILED after the edit — every file reverted');
                return {
                    ok: true,
                    output: { message: isAr ? '⚠️ رفضتُ هذا التعديل: البناء فشل بعده، فأرجعت كل الملفات كما كانت. مشروعك سليم. جرّب صياغة أدق.' : '⚠️ Edit refused: the build failed afterwards, so every file was reverted. Your project is intact.' },
                    logs,
                } as any;
            }
        }

        // The verified change is VISIBLE the moment it lands — the preview
        // panel refreshes off the freshly rebuilt dist through the live
        // /project-preview route. Only a green build earns this: a skipped
        // or failed verification has no fresh dist to show.
        if (buildVerified === true) {
            const url = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
            try { broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any); } catch { /* UI optional */ }
        }

        // ── SELF-QA AFTER THE EDIT ──────────────────────────────────────────
        // A green build only proves the code compiles. The field shipped an
        // edit whose build was green and whose page asked the server for a
        // photo that answered 404 — a real browser sees that in one second.
        // Same audit the builder runs, same honest skip when it cannot.
        let audit: any = null;
        let improvement: any = null;
        let editAcceptance: any = null;
        if (buildVerified === true && !input?.skipAudit) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🔎 أفحص النتيجة في متصفح حقيقي…' : '🔎 Auditing the result in a real browser…');
            try {
                const { auditBuiltApp, formatAudit } = require('../../../core/quality/app-audit');
                const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
                const auditSid = String(context?.browserSessionId || '').trim() || PANEL_BROWSER_SID;
                try { broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'self_qa' } } as any); } catch { /* UI optional */ }
                try { await require('../../browser/wsHub').waitForPanelWatcher(auditSid, 15_000); } catch { /* audit reports visibility honestly */ }
                audit = await auditBuiltApp(path.join(dir, 'dist'), {
                    timeoutMs: 180_000,
                    watchSessionId: auditSid,
                    requireVisibleBrowser: true,
                });
                logs.push(`self-QA after edit: ${audit?.skipped ? `skipped (${audit.skipped})` : `${audit?.score}/100`}`);

                // A project continuation used to stop at the first browser
                // verdict, even when the same repair loop used by a new build
                // knew how to answer the measured finding. Continue the same
                // evidence-driven loop here: repair source, rebuild, remeasure,
                // and roll back any round that does not improve the result.
                const { worthRepairing, collectSources } = require('../../../core/quality/self-repair');
                if (!audit?.skipped && worthRepairing(audit?.findings || [])) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? 'أصلح عيوب الجودة التي قاسها المتصفح، ثم أعيد الاختبار نفسه.'
                        : 'Repairing the browser-measured quality findings, then rerunning the same audit.');
                    const { improveUntilItStops, repairRound, improveSummary } = require('../../../core/quality/improve-loop');
                    const { snapshotProject, restoreVersion } = require('../../../core/project/versions');
                    const beforeRepair = collectSources(dir) as Record<string, string>;
                    const measuredAudits: any[] = [audit];
                    const rebuild = async (): Promise<boolean> => {
                        const { executionEngine } = require('../../../kernel/ExecutionEngine');
                        const { withoutViteConfigForBuild, portableViteBuildArgs } = require('./ReactProjectTool');
                        return withoutViteConfigForBuild(dir, async () =>
                            (await executionEngine.runArgvStreaming('npm', portableViteBuildArgs(), {
                                cwd: dir, timeout: 180_000, env: { NO_COLOR: '1' },
                            }).done).ok,
                        );
                    };
                    const firstMeasurement = {
                        score: Number(audit.score || 0),
                        findingIds: (audit.findings || []).map((f: any) => String(f.id)),
                        findings: (audit.findings || []).map((f: any) => ({ id: String(f.id), evidence: f.evidence })),
                    };
                    improvement = await improveUntilItStops(firstMeasurement, {
                        maxRounds: Math.max(1, Number(process.env.JOE_IMPROVE_ROUNDS || 4)),
                        say: (line: string) => logs.push(line),
                        snapshot: (label: string) => String(snapshotProject(dir, label)?.id || ''),
                        rollback: async (id: string) => {
                            const restored = restoreVersion(dir, id);
                            return !!restored?.ok && await rebuild();
                        },
                        repair: async (round: number, _ids: string[], findings: any[]) =>
                            (await repairRound(dir, round, { isArabic: isAr, findings })).changed,
                        rebuild,
                        measure: async () => {
                            const measured = await auditBuiltApp(path.join(dir, 'dist'), {
                                timeoutMs: 180_000,
                                watchSessionId: auditSid,
                                requireVisibleBrowser: true,
                            });
                            if (measured?.skipped) return { score: 0, findingIds: [], skipped: true };
                            measuredAudits.push(measured);
                            return {
                                score: Number(measured.score || 0),
                                findingIds: (measured.findings || []).map((f: any) => String(f.id)),
                                findings: (measured.findings || []).map((f: any) => ({ id: String(f.id), evidence: f.evidence })),
                            };
                        },
                    });
                    // `final` remains the last KEPT measurement after a
                    // rollback. Select the full audit with that same score and
                    // finding set, never the rejected measurement that caused
                    // the rollback.
                    const finalIds = [...(improvement.final?.findingIds || [])].map(String).sort().join('|');
                    const matchingAudit = measuredAudits.slice().reverse().find((candidate: any) =>
                        Number(candidate?.score || 0) === Number(improvement.final?.score || 0)
                        && [...(candidate?.findings || [])].map((f: any) => String(f.id)).sort().join('|') === finalIds,
                    );
                    if (matchingAudit) audit = matchingAudit;
                    notes.push(improveSummary(improvement, isAr));

                    const afterRepair = collectSources(dir) as Record<string, string>;
                    for (const [file, after] of Object.entries(afterRepair)) {
                        const before = beforeRepair[file];
                        if (before === undefined || before === after) continue;
                        const existing = touched.find(t => t.file === file);
                        if (existing) existing.after = after;
                        else touched.push({ file, before, after });
                    }
                    if (improvement.rounds?.some((r: any) => r.verdict === 'improved')) {
                        const url = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
                        try { broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any); } catch { /* UI optional */ }
                    }
                }
                if (audit && !audit.skipped) notes.push(formatAudit(audit, isAr));
                logs.push(`self-QA final after edit: ${audit?.skipped ? `skipped (${audit.skipped})` : `${audit?.score}/100`}`);
            } catch (e: any) { logs.push(`self-QA after edit failed: ${String(e?.message || e).slice(0, 80)}`); }
        }

        // Browser QA answers "does the page work?"; acceptance answers "did
        // this edit do every thing the user named?". A visually clean old page
        // must never score green when a compound follow-up changed one clause.
        const now = (rel: string) => {
            try { return fs.readFileSync(path.join(dir, rel), 'utf-8'); } catch { return ''; }
        };
        const contentNow = now(contentRel);
        const appNow = now('src/App.jsx');
        const htmlNow = now('index.html');
        const tokensNow = now('src/styles/tokens.css');
        const literalRename = parseLiteralTextReplacement(request);
        const brandMarkEdit = presentationEdits.find((op): op is Extract<PresentationEdit, { kind: 'brand_mark' }> => op.kind === 'brand_mark');
        const heroCtaEdit = presentationEdits.find((op): op is Extract<PresentationEdit, { kind: 'hero_contact_cta' }> => op.kind === 'hero_contact_cta');
        const phoneEdit = presentationEdits.find((op): op is Extract<PresentationEdit, { kind: 'phone_field' }> => op.kind === 'phone_field');
        const faqEdit = presentationEdits.find((op): op is Extract<PresentationEdit, { kind: 'faq_section' }> => op.kind === 'faq_section');
        const calculatorEdit = presentationEdits.find((op): op is Extract<PresentationEdit, { kind: 'calculator_section' }> => op.kind === 'calculator_section');
        if (heroCtaEdit && phoneEdit && audit && !audit.skipped) {
            const namedControls = (audit.controls || [])
                .filter((control: any) => String(control?.bare || control?.label || '').includes(heroCtaEdit.label))
                .map((control: any) => ({ label: control.bare || control.label, kind: control.kind, worked: control.worked, effect: control.effect, href: control.href }));
            const phoneEvidence = (audit.semanticValidationEvidence || [])
                .filter((evidence: any) => evidence?.expected === 'tel' || evidence?.actual === 'tel');
            logs.push(`acceptance browser evidence: controls=${JSON.stringify(namedControls)}; phone=${JSON.stringify(phoneEvidence)}; fieldsFilled=${Number(audit.fieldsFilled || 0)}; semanticFailures=${Number(audit.semanticValidationFailures || 0)}`);
        }
        const serviceBlock = (contentNow.match(/services:\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || '';
        const serviceRows = (serviceBlock.match(/\{\s*title:\s*'/g) || []).length;
        const hasServiceTarget = /href:\s*'#services'/.test(contentNow)
            && /id=["']services["']/.test(appNow)
            && !/<section\b[^>]*\bid=["']services["'][^>]*\bdata-reveal\b/iu.test(appNow);
        const wantedPrimary = buildPalette(request).primary;
        const faqNow = now('src/components/Faq.jsx') || now('src/components/Faq.tsx');
        const faqBlock = (contentNow.match(/faq:\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || '';
        const faqRows = (faqBlock.match(/\{\s*q:\s*'/g) || []).length;
        const faqSourceReady = !!faqEdit && faqRows >= faqEdit.count && /id=["']faq["']/.test(faqNow)
            && /<Faq\s+content=/.test(appNow) && /href:\s*'#faq'/.test(contentNow);
        const faqEvidence = (audit?.disclosureEvidence || []) as Array<any>;
        const faqInteractionReady = !!faqEdit && faqEvidence.some(evidence =>
            Number(evidence?.count || 0) >= faqEdit.count
            && Number(evidence?.opened || 0) >= faqEdit.count
            && evidence?.oneAtATime === true
            && evidence?.keyboardClosed === true);
        const faqAnchorContexts: string[] = (audit?.controls || [])
            .filter((control: any) => control?.kind === 'anchor' && control?.href === '#faq' && control?.worked)
            .map((control: any) => String(control?.context || ''));
        const faqResponsiveLinkReady = faqAnchorContexts.some((context: string) => context.startsWith('desktop:'))
            && faqAnchorContexts.some((context: string) => context.startsWith('جوّال:') || context.startsWith('phone:'));
        if (faqEdit && audit && !audit.skipped) {
            logs.push(`FAQ acceptance evidence: disclosures=${JSON.stringify(faqEvidence)}; anchors=${JSON.stringify(faqAnchorContexts)}`);
        }
        const calculatorNow = now('src/components/CostCalculator.jsx') || now('src/components/CostCalculator.tsx');
        const calculatorSourceReady = !!calculatorEdit
            && /data-qa-calculator/.test(calculatorNow)
            && /type="number"/.test(calculatorNow)
            && /min="0"/.test(calculatorNow)
            && (!calculatorEdit.currencies.length || /data-calculator-currency/.test(calculatorNow))
            && (!calculatorEdit.promoCode || (/data-calculator-promo/.test(calculatorNow) && /data-calculator-discount/.test(calculatorNow)))
            && /<CostCalculator\s+services=/.test(appNow);
        const calculatorEvidence = (audit?.calculatorEvidence || []) as Array<any>;
        const calculatorBehaviourReady = !!calculatorEdit && calculatorEvidence.some(evidence =>
            Number(evidence?.choices || 0) > 1
            && Number(evidence?.choicesTested || 0) >= Number(evidence?.choices || 0)
            && evidence?.zeroCorrect === true
            && evidence?.largeCorrect === true
            && evidence?.mathCorrect === true
            && (!calculatorEdit.rejectNegative || evidence?.negativeRejected === true)
            && evidence?.resetWorked === true
            && (!calculatorEdit.currencies.length || (Number(evidence?.currencyChoices || 0) >= calculatorEdit.currencies.length
                && evidence?.currencyRoundTrip === true
                && (!calculatorEdit.preserveStateOnCurrencyChange || evidence?.valuesPreserved === true)))
            && (!calculatorEdit.promoCode || (evidence?.promoCorrect === true
                && (!calculatorEdit.invalidPromoFeedback || evidence?.promoInvalidFeedback === true)
                && evidence?.discountBeforeTaxCorrect === true))
            && (!calculatorEdit.resetAll || (evidence?.resetCurrency === true && evidence?.resetPromo === true)));
        const calculatorResponsiveReady = calculatorEvidence.some(evidence => String(evidence?.viewport || '').startsWith('1280x'))
            && calculatorEvidence.some(evidence => String(evidence?.viewport || '').startsWith('390x'));
        if (calculatorEdit && audit && !audit.skipped) {
            logs.push(`Calculator acceptance evidence: ${JSON.stringify(calculatorEvidence)}`);
        }
        const criteria = acceptanceFor(request).map((criterion: any) => {
            const rule = criterion.expectedRule;
            const decided = (met: boolean, why: string) => ({
                ...criterion,
                preJudged: { verdict: met ? 'met' : 'unmet', why },
            });
            // The generic catalogue calls both an incrementing counter and a
            // computed calculator result `counter`. A calculator has stronger,
            // domain-specific browser evidence, so do not send it through the
            // legacy click-counter detector after that evidence has passed.
            if (criterion.id === 'counter' && calculatorEdit) {
                return decided(calculatorSourceReady && calculatorBehaviourReady,
                    calculatorSourceReady && calculatorBehaviourReady
                        ? 'the browser recomputed and displayed the calculator total for every tested state'
                        : 'the calculator total has not been proven across its tested states');
            }
            if (criterion.id === 'button' && heroCtaEdit) {
                const hero = now('src/components/Hero.jsx');
                const met = contentNow.includes(`cta: '${jsEsc(heroCtaEdit.label)}'`) && contentNow.includes("contactHref: '#contact'") && hero.includes('content.contactHref');
                return decided(met, met ? `the “${heroCtaEdit.label}” hero control resolves to #contact` : 'the requested hero contact control is missing or points elsewhere');
            }
            if (!rule) return criterion;
            const text = String(rule.text || '');
            if (faqEdit && /(?:قسم[^\n]{0,25}(?:الأسئلة\s+الشائعة|الاسئلة\s+الشائعة|faq)|faq\s+section)/iu.test(text)) {
                return decided(faqSourceReady, faqSourceReady
                    ? `${faqRows} FAQ rows render in the #faq section`
                    : `the requested #faq section does not render ${faqEdit.count} question and answer rows`);
            }
            if (faqEdit && /(?:رابط[^\n]{0,35}(?:القائمة|menu)|link[^\n]{0,35}(?:menu|navigation))/iu.test(text)) {
                return decided(faqResponsiveLinkReady, faqResponsiveLinkReady
                    ? 'the browser resolved the #faq navigation target on desktop and phone'
                    : 'the #faq navigation target was not proven on both desktop and phone');
            }
            if (faqEdit && /(?:سؤال[^\n]{0,30}(?:واحد|مفتوح|إغلاق)|one[^\n]{0,30}(?:question|open)|closable)/iu.test(text)) {
                return decided(faqSourceReady && faqInteractionReady, faqSourceReady && faqInteractionReady
                    ? 'the browser opened every FAQ in sequence, kept one open, and closed the last with Enter'
                    : 'the browser has not proven sequential single-open and keyboard-close behaviour');
            }
            if (calculatorEdit
                && /(?:حاسب[ةه]|calculator|(?:اختيار|select)[^\n]{0,25}(?:الخدم[ةه]|service))/iu.test(text)
                && !/(?:ضريب[ةه]|tax|صحة\s+الحساب|calculation|إعاد[ةه]\s+تعيين|reset|سالب|negative|الهاتف|phone|mobile)/iu.test(text)) {
                return decided(calculatorSourceReady, calculatorSourceReady
                    ? 'the cost calculator renders a service choice and constrained numeric hours input'
                    : 'the requested cost calculator contract is not present in the built source');
            }
            if (calculatorEdit && /(?:ضريب[ةه]|tax|صحة\s+الحساب|calculation)/iu.test(text)) {
                return decided(calculatorSourceReady && calculatorBehaviourReady, calculatorSourceReady && calculatorBehaviourReady
                    ? `the browser recomputed subtotal, ${calculatorEdit.taxRate}% tax, and total for every service and boundary value`
                    : 'the browser has not proven the requested total and tax calculation');
            }
            if (calculatorEdit && /(?:العمل[ةه]|currenc|الدينار|الدولار|jod|usd)/iu.test(text)) {
                return decided(calculatorSourceReady && calculatorBehaviourReady, calculatorSourceReady && calculatorBehaviourReady
                    ? 'the browser changed currency both ways without losing the selected service or hours'
                    : 'currency switching and state preservation have not both been proven');
            }
            if (calculatorEdit && /(?:خصم|تخفيض|promo|discount|رمز\s+خاطئ|كود\s+خاطئ)/iu.test(text)) {
                return decided(calculatorSourceReady && calculatorBehaviourReady, calculatorSourceReady && calculatorBehaviourReady
                    ? `the browser rejected a wrong code and applied ${calculatorEdit.discountRate}% before tax for the valid code`
                    : 'valid and invalid discount behavior or discount-before-tax arithmetic is not proven');
            }
            if (calculatorEdit && /(?:إعاد[ةه]\s+تعيين|reset|سالب|negative|قيم[ةه]\s+صفر|قيمة\s+كبيرة|large\s+value)/iu.test(text)) {
                return decided(calculatorBehaviourReady, calculatorBehaviourReady
                    ? 'the browser proved zero, large, negative, and reset behaviour'
                    : 'the browser has not proven every requested calculator boundary and reset');
            }
            if (calculatorEdit && /(?:الهاتف[^\n]{0,30}سطح\s+المكتب|phone[^\n]{0,30}desktop|mobile[^\n]{0,30}desktop)/iu.test(text)) {
                return decided(calculatorResponsiveReady, calculatorResponsiveReady
                    ? 'the calculator was exercised at desktop and phone widths'
                    : 'calculator behaviour was not proven at both desktop and phone widths');
            }
            if (/(?:اختبر|تحقق|افحص|test|verify|check)/iu.test(text)
                && /(?:الرابط|link)/iu.test(text)
                && /(?:الحقل|field)/iu.test(text)
                && /(?:صحيح|valid)/iu.test(text)
                && /(?:غير\s+صحيح|خاطئ|invalid)/iu.test(text)
                && /(?:المتصفح|browser)/iu.test(text)) {
                const met = !!heroCtaEdit && !!phoneEdit && provesContactLinkAndPhoneAudit(audit, heroCtaEdit.label);
                return decided(met, met
                    ? `browser pressed the “${heroCtaEdit?.label}” link, filled the form, and proved the tel field rejects an invalid value`
                    : 'browser evidence does not yet prove both the contact link and valid/invalid telephone values');
            }
            if (/(?:اسم\s+العلامة|اسم\s+(?:الموقع|المشروع)|\b(?:brand|rename)\b)/iu.test(text) && literalRename) {
                const escaped = literalRename.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const newBrand = new RegExp(`brand:\\s*['"]${escaped}['"]`, 'u').test(contentNow);
                const tabRenamed = htmlNow.includes(literalRename.to) && !htmlNow.includes(literalRename.from);
                return decided(newBrand && tabRenamed, newBrand && tabRenamed
                    ? `brand and document metadata now say “${literalRename.to}”`
                    : `brand rename to “${literalRename.to}” is missing from content or document metadata`);
            }
            if (/(?:شعار|علام[ةه]\s+نصي|\b(?:logo|brand\s+mark)\b)/iu.test(text) && brandMarkEdit) {
                const navbar = now('src/components/Navbar.jsx');
                const met = contentNow.includes(`brandMark: '${jsEsc(brandMarkEdit.value)}'`) && navbar.includes('content.brandMark');
                return decided(met, met ? `the derived text mark “${brandMarkEdit.value}” renders beside the brand` : 'the requested text mark is missing from content or the navigation renderer');
            }
            if (/(?:زر|button|cta)/iu.test(text) && heroCtaEdit) {
                const hero = now('src/components/Hero.jsx');
                const met = contentNow.includes(`cta: '${jsEsc(heroCtaEdit.label)}'`) && contentNow.includes("contactHref: '#contact'") && hero.includes('content.contactHref');
                return decided(met, met ? `the “${heroCtaEdit.label}” hero control resolves to #contact` : 'the requested hero contact control is missing or points elsewhere');
            }
            if (/(?:رقم\s+هاتف|هاتف|telephone|phone)/iu.test(text) && phoneEdit) {
                const contact = now('src/components/Contact.jsx');
                const met = /type=["']tel["']/.test(contact)
                    && (!phoneEdit.required || /<input\s+required\s+type=["']tel["']/.test(contact))
                    && /pattern=["'][^"']*0-9/.test(contact)
                    && (!phoneEdit.rejectLetters || /replace\(\/\[\^0-9/.test(contact));
                return decided(met, met ? 'the phone field is native tel, required, constrained, and strips disallowed characters' : 'the phone field contract is incomplete');
            }
            if (/(?:قسم\s+(?:ال)?خدمات|رابط[^\n]{0,30}(?:ال)?خدمات|\bservices?\b)/iu.test(text) && servicesEdit) {
                const met = hasServiceTarget && serviceRows >= servicesEdit.count;
                return decided(met, met
                    ? `${serviceRows} service items render behind the #services navigation target`
                    : `the requested #services target, navigation link, or ${servicesEdit.count} service items are missing`);
            }
            if (/(?:لون|ألوان|الوان|\bcolou?r\b)/iu.test(text)) {
                const met = tokensNow.includes(`--brand:${wantedPrimary}`);
                return decided(met, met ? `the primary token is ${wantedPrimary}` : `the requested primary colour ${wantedPrimary} is not in the design tokens`);
            }
            if (/(?:لا\s+تنشئ[^\n]{0,30}مشروع|do\s+not\s+create[^\n]{0,30}project)/iu.test(text)) {
                return decided(true, `the existing project directory was edited in place: ${dir}`);
            }
            if (/(?:القائمة\s+تصل\s+للقسم|menu[^\n]{0,30}(?:reach|link)[^\n]{0,30}section)/iu.test(text)) {
                return decided(hasServiceTarget, hasServiceTarget ? 'the navigation href and rendered section id both equal #services' : 'the navigation target does not resolve to the requested section');
            }
            return criterion;
        });
        editAcceptance = judgeAcceptance(criteria, { dir, built: buildVerified === true, audit }, isAr);
        const acceptanceBlocked = Number(editAcceptance?.unmet || 0) > 0;
        if (acceptanceBlocked) {
            const missing = (editAcceptance.criteria || []).filter((c: any) => c.verdict === 'unmet');
            notes.push(isAr
                ? `توقف التسليم: ${missing.length} بند مطلوب لم يُثبت بعد — ${missing.map((c: any) => c.ar || c.en || c.id).join(' · ')}.`
                : `Delivery blocked: ${missing.length} requested item(s) remain unproven — ${missing.map((c: any) => c.en || c.ar || c.id).join(' · ')}.`);
        } else if (criteria.length) {
            notes.push(isAr
                ? `تحقق القبول: ${editAcceptance.met}/${criteria.length} بنود مثبتة${editAcceptance.unprovable ? `، و${editAcceptance.unprovable} خارج نطاق القياس الآلي` : ''}.`
                : `Acceptance: ${editAcceptance.met}/${criteria.length} criteria proven${editAcceptance.unprovable ? `; ${editAcceptance.unprovable} not automatically measurable` : ''}.`);
        }

        const visualVerificationBlocked = visibleAuditRequired && (!audit || !!audit.skipped);
        if (visualVerificationBlocked) {
            const reason = String(audit?.skipped || 'browser audit did not return evidence');
            notes.push(isAr
                ? `توقف التسليم: لم يكتمل اختبار المتصفح المرئي المطلوب (${reason}). التعديل محفوظ والبناء ناجح، لكنني لا أعتبره متحققاً بعد.`
                : `Delivery blocked: the requested visible browser audit did not complete (${reason}). The edit is saved and builds, but is not verified yet.`);
        }

        // Per-file history is written after QA so an automatic quality repair
        // is part of the same undoable transaction as the user's edit.
        const history = (entry?.history || []).concat(touched.map(t => ({ file: t.file, before: t.before, at: Date.now() }))).slice(-20);
        writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) }, context?.runId ?? null);
        persistJoeProjects();

        // ⛔ A quoted part no operation read is named, never reported as done
        // (round 22) — unless the model, which reads the whole request, was asked.
        const unread = modelReadTheRequest ? [] : unreadEditClauses(structure, consumed);
        if (unread.length) {
            notes.push(isAr
                ? `لم أنفّذ ${unread.length === 1 ? 'هذا الجزء' : 'هذه الأجزاء'} من طلبك، لأنني لم أعرف ما المطلوب به: ${unread.map(clause => `«${clause}»`).join('؛ ')}. اطلبه وحده بصياغة أوضح.`
                : `Not done — I could not tell what to do with: ${unread.map(clause => `"${clause}"`).join('; ')}. Ask for it on its own.`);
            logs.push(`unread part(s) of the request: ${unread.join(' | ')}`);
        }

        const stats = touched.map(t => {
            const d = diffSummary(t.before, t.after);
            return `   • ${t.file} (+${d.added} −${d.removed})`;
        }).join('\n');
        const deliveryBlocked = visualVerificationBlocked || acceptanceBlocked || unread.length > 0;
        // A part not done at all is said first: it is the most definite of the three.
        const buildVerdict = unread.length
            ? (isAr ? '⚠️ نُفّذ جزء من طلبك فقط — والجزء الباقي مذكور أعلاه.' : '⚠️ Only part of your request was done — the rest is named above.')
            : visualVerificationBlocked
            ? (isAr ? '⚠️ البناء نجح، لكن التسليم متوقف حتى يكتمل اختبار المتصفح المطلوب.' : '⚠️ Build passed, but delivery is blocked until the requested browser audit completes.')
            : acceptanceBlocked
                ? (isAr ? '⚠️ البناء نجح، لكن التسليم متوقف لأن بعض التعديلات المطلوبة لم تُثبت بعد.' : '⚠️ Build passed, but delivery is blocked because some requested edits remain unproven.')
            : (buildVerified === true
                ? (isAr ? '✅ vite build نجح بعد التعديل — المشروع سليم.' : '✅ vite build passed after the edit.')
                : buildVerified === false ? '' : (isAr ? 'ℹ️ (الحزم غير مثبتة — تخطيت تحقق البناء؛ بوابة الفحص النحوي طُبّقت على كل ملف)' : ''));
        const message = isAr
            ? `${touched.length ? `🔬 عُدّل المشروع جراحياً — ${touched.length} ملف:\n${stats}` : unread.length ? 'لم يتغير أي ملف.' : 'لم يحتج المشروع إلى تغيير جديد؛ الحالة المطلوبة موجودة بالفعل.'}
${notes.length ? notes.join('\n') + '\n' : ''}${buildVerdict}${refused.length ? `\n⚠️ رُفض ${refused.length} تعديلاً غير آمن:\n${refused.map(r => `   • ${r}`).join('\n')}` : ''}

🧭 «شغّل خادم التطوير» للمعاينة الحية · «تراجع» يسترجع الملفات السابقة`
            : `${touched.length ? `Surgical edit — ${touched.length} file(s):\n${stats}` : unread.length ? 'No file changed.' : 'No new file changes were needed; the requested state is already in place.'}\n${notes.length ? notes.join('\n') + '\n' : ''}${buildVerdict}`;
        return {
            ok: !deliveryBlocked,
            ...(deliveryBlocked ? { error: unread.length
                ? `edit_part_unread: ${unread.join(' | ')}`
                : visualVerificationBlocked
                ? 'browser_qa_required: requested visible browser verification did not complete'
                : 'edit_acceptance_unmet: one or more requested changes were not proven' } : {}),
            output: { message, dir, touched: touched.map(t => t.file), refused, buildVerified, audit, improvement, invented, visualVerificationBlocked, acceptance: editAcceptance, unread },
            logs,
        } as any;
    }
}
