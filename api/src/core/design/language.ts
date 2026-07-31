/**
 * The page must be written in the language it was asked for.
 *
 * A user writing entirely in Arabic asked for a company site. The build set
 * `lang="ar" dir="rtl"` correctly and then filled the document with English:
 *
 *     <h1>Transform Your Business with Xelite Solutions</h1>
 *     <p>We provide top-notch consulting services…</p>
 *     <button class="btn">Sign up</button>
 *
 * The section prompt does say "Write in natural Arabic, as an Arabic copywriter
 * would". The model ignored it — which is the same lesson as everywhere else in
 * this build: an instruction in a prompt is not enforcement. The language of a
 * returned section is measurable, so it is measured, and a section that came
 * back in the wrong language is asked for again with the instruction made
 * impossible to miss.
 *
 * The second half of the problem is what happens when Latin text legitimately
 * appears in an Arabic page — a brand name, "Node.js", a version number. Inside
 * an RTL paragraph the bidirectional algorithm reorders the punctuation around
 * it, so «استخدمنا Node.js (نسخة 20)» renders with the bracket on the wrong
 * side. That is not a copy problem and no prompt can fix it; it is fixed by
 * isolating the run, which is exactly what <bdi> is for.
 */

/**
 * Arabic LETTERS — deliberately not the whole Arabic block.
 *
 * U+0660-U+0669 and U+06F0-U+06F9 are the Arabic-Indic digits, and U+066A-U+066D
 * are separators. A digit is not evidence of a language: an English page quoting
 * «٢٠٢٦» would read as partly Arabic, and a price list would read as more Arabic
 * the more numbers it had. Only letters and their diacritics count.
 */
const ARABIC = /[ؠ-ٟٮ-ۓۺ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ARABIC_G = new RegExp(ARABIC.source, 'g');
const LATIN_G = /[A-Za-z]/g;

/** Markup that is code or data, never prose. */
const NON_PROSE = /<(script|style|template|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * The visible words of a fragment.
 *
 * Attributes are dropped along with the tags: a class of "testimonials" and an
 * href of "/about" are Latin, and counting them would make an entirely Arabic
 * page look half-English.
 */
export function visibleText(html: string): string {
    return String(html || '')
        .replace(NON_PROSE, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;|&#\d+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface ScriptMix {
    arabic: number;
    latin: number;
    /** Arabic letters as a share of all letters. 0 when there are no letters. */
    arabicShare: number;
    letters: number;
}

export function scriptMix(text: string): ScriptMix {
    const s = String(text || '');
    const arabic = (s.match(ARABIC_G) || []).length;
    const latin = (s.match(LATIN_G) || []).length;
    const letters = arabic + latin;
    return { arabic, latin, letters, arabicShare: letters ? arabic / letters : 0 };
}

/**
 * Did this fragment come back in the wrong language?
 *
 * Deliberately lenient. A brand name, a product name and a technical term are
 * expected to stay Latin in an Arabic page — nobody writes «نود.جي إس». The
 * threshold catches a section that is ENGLISH PROSE, not one that mentions
 * English words: below 40% Arabic letters, the sentences themselves are English.
 *
 * Short fragments are never judged. A three-word heading can legitimately be a
 * product name, and re-asking for it would be noise.
 */
export function wrongLanguage(html: string, isArabic: boolean): { wrong: boolean; share: number; reason: string } {
    const text = visibleText(html);
    const mix = scriptMix(text);
    if (!isArabic) {
        // The reverse case is real too: an English request answered in Arabic.
        const wrong = mix.letters >= 60 && mix.arabicShare > 0.6;
        return { wrong, share: mix.arabicShare, reason: wrong ? 'the request was in English and the text came back in Arabic' : '' };
    }
    if (mix.letters < 60) return { wrong: false, share: mix.arabicShare, reason: '' };
    const wrong = mix.arabicShare < 0.4;
    return {
        wrong,
        share: mix.arabicShare,
        reason: wrong ? `the request was in Arabic and ${Math.round((1 - mix.arabicShare) * 100)}% of the text came back in English` : '',
    };
}

/**
 * The instruction added to a retry. Blunt on purpose: the polite version was
 * already in the prompt and was ignored.
 */
export function languageRetryNote(isArabic: boolean): string {
    return isArabic
        ? `STOP. Your previous answer was in ENGLISH. This page is for an ARABIC-speaking audience and is
already marked dir="rtl". EVERY heading, EVERY paragraph, EVERY button label and EVERY list item must be
written in ARABIC. Not translated English — Arabic as an Arabic copywriter writes it.
The ONLY things that may stay in Latin script are the brand's own name and technical product names
(e.g. React, Node.js). Button labels are NOT technical names: write «تسجيل الدخول», not "Sign in".
Rewrite the section now, in Arabic.`
        : `STOP. Your previous answer was in Arabic. This page is in ENGLISH. Every heading, paragraph and
button label must be written in English. Rewrite the section now, in English.`;
}

/* ---------- bidirectional isolation ------------------------------------------ */

/** Inside these, text is not prose and must not be touched. */
/**
 * `title` and `option` are in this list because their content is TEXT, not
 * markup: a browser shows `<bdi>` inside them literally. Measured end to end —
 * a site's tab read «<bdi>xelitesolutions</bdi> — الرئيسية».
 */
const SKIP_BLOCKS = /<(script|style|template|svg|noscript|bdi|code|pre|kbd|samp|title|option|textarea)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * A run worth isolating: at least two Latin letters, plus whatever trailing
 * digits, dots and version punctuation belong to it. Single letters are left
 * alone — an initial in an Arabic name is not a direction change worth marking.
 */
const LATIN_RUN = /[A-Za-z][A-Za-z0-9]*(?:[.'&\-+/][A-Za-z0-9]+)*(?:\s+[A-Za-z][A-Za-z0-9]*(?:[.'&\-+/][A-Za-z0-9]+)*)*/g;

/**
 * Wrap Latin runs that sit inside Arabic prose in <bdi>.
 *
 * <bdi> is `unicode-bidi: isolate` by definition, so the run is laid out on its
 * own and the surrounding Arabic punctuation stops migrating around it. It has
 * no styling and no script; a page that already renders correctly is unchanged
 * by it.
 *
 * Only text NODES are touched. Tag names, attribute values, urls, class names
 * and everything inside a script, a style or a <code> block are left byte for
 * byte as they were — wrapping any of those would corrupt the document.
 */
export function isolateLatinRuns(html: string): string {
    const src = String(html || '');
    if (!ARABIC.test(src)) return src;

    // Carve the document into "leave alone" and "prose" spans first, so the
    // text-node walk below never sees the inside of a script or a <code>.
    const holes: Array<[number, number]> = [];
    for (const m of src.matchAll(SKIP_BLOCKS)) holes.push([m.index!, m.index! + m[0].length]);
    const inHole = (i: number) => holes.some(([a, b]) => i >= a && i < b);

    let out = '';
    let cursor = 0;
    // Walk tags; everything between them is a text node.
    const tag = /<[^>]+>/g;
    let m: RegExpExecArray | null;
    const emitText = (text: string, at: number) => {
        if (inHole(at) || !ARABIC.test(text)) { out += text; return; }
        out += text.replace(LATIN_RUN, (run) => (run.trim().length >= 2 ? `<bdi>${run}</bdi>` : run));
    };
    while ((m = tag.exec(src))) {
        emitText(src.slice(cursor, m.index), cursor);
        out += m[0];
        cursor = m.index + m[0].length;
    }
    emitText(src.slice(cursor), cursor);
    return out;
}

/**
 * The stylesheet half of the same problem.
 *
 * A phone number, a price and a Latin brand inside an RTL block each need
 * isolating, and `<bdi>` covers the ones in prose. These cover the ones that are
 * whole elements — an input the visitor types a URL into, a code block, a
 * number that must read left to right whatever surrounds it.
 */
export function bidiCss(): string {
    return `
/* Direction isolation — a Latin run inside Arabic prose keeps its own layout,
   so the brackets and full stops around it stay where they were written. */
bdi{unicode-bidi:isolate}
[dir="rtl"] code,[dir="rtl"] pre,[dir="rtl"] kbd,[dir="rtl"] samp{direction:ltr;unicode-bidi:isolate;text-align:start}
[dir="rtl"] input[type="email"],[dir="rtl"] input[type="url"],[dir="rtl"] input[type="tel"],
[dir="rtl"] input[type="number"],[dir="rtl"] input[type="password"]{direction:ltr;text-align:start}
[dir="rtl"] .price,[dir="rtl"] .stat b,[dir="rtl"] time,[dir="rtl"] [data-count-to]{unicode-bidi:isolate}
/* Tabular numerals so a column of figures lines up in either direction. */
.stat b,td,th,.price,[data-count-to]{font-variant-numeric:tabular-nums}
`.trim();
}
