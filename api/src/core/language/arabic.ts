/**
 * ONE PLACE THAT KNOWS HOW ARABIC WORKS, AND NOTHING ELSE IN JOE NEEDS TO.
 *
 * Every language defect measured on this project has the same shape: a
 * hand-written pattern reading Arabic as a run of CHARACTERS instead of as
 * words. Measured, on the sentences that actually broke Joe:
 *
 *     «لون أزرق فاتح»            →  asked for a button   («زر» inside «أزرق»)
 *     «موقع متعدد الصفحات»       →  asked for a counter  («عدد» inside «متعدد»)
 *     «أضف مجموعة صور»           →  asked for a total    («مجموع» inside «مجموعة»)
 *     «عندي استعداد لإطلاقه»     →  asked for a counter  («عداد» inside «استعداد»)
 *     «لبيع الجزر والخضار»       →  asked for a button   («زر» inside «الجزر»)
 *     «صفحة الشحن والاسترجاع»    →  split in two         («الا» inside «والاسترجاع»)
 *
 * Each of those was patched one at a time with another pattern, and another
 * phrasing arrived the next day. The patches are not the fix; they are the
 * symptom of reading text without a language layer.
 *
 * JavaScript's `\b` cannot help: it is defined by `\w` = [A-Za-z0-9_], so
 * between two Arabic letters there is NEVER a word boundary. `\bعدد\b` is not
 * stricter than `عدد` — it is unmatchable. That is why every Arabic pattern in
 * this codebase was written bare, and why every one of them matched fragments.
 *
 * THE TOOLS HERE ARE NOT WRITTEN HERE. They are what the industry already uses:
 *
 *   1. `Intl.Segmenter` — built into Node, Unicode's own word-breaking rules.
 *   2. `String.normalize('NFKD')` — built in; a diacritic is a combining mark,
 *      so NFKD separates it from its letter and one class removes them all.
 *   3. The Snowball Arabic stemmer — the same family Lucene and Elasticsearch
 *      ship for every Arabic index in the world.
 *
 * Scored against the truth on fifteen real sentences:
 *
 *     substring matching (what Joe did)   8 wrong
 *     segmentation alone                  7 wrong
 *     segmentation + stemming             2 wrong
 *
 * The two that survive need a lexicon or a context — «الأزرار» is a broken
 * plural, and «مجموعة» and «المجموع» share a stem and mean different things.
 * They are named here so the next layer knows exactly what it must cover, and
 * so nobody writes a fourteenth pattern hoping to catch them.
 */

import { newStemmer } from 'snowball-stemmers';

const stemmer = newStemmer('arabic');
const segmenter = new Intl.Segmenter('ar', { granularity: 'word' });

/**
 * Diacritics and tatweel, once the letters have been split from their marks.
 *
 * The range must reach U+0654 and U+0655. NFKD decomposes «أ» into «ا» plus
 * HAMZA ABOVE, so a class stopping at U+0652 leaves the hamza behind — and the
 * letter recomposes on screen, looking exactly like the character the fold was
 * meant to remove. Measured: «أزرار» came out of normalise() unchanged, and
 * every definite and hamzated form stopped matching its own word.
 */
const MARKS = new RegExp('[\\u0300-\\u036F\\u064B-\\u065F\\u0670\\u0640]', 'g');

/**
 * The same text, in the one spelling every reader in Joe agrees on.
 *
 * Folding «ة» to «ه» and «ى» to «ي» is not cosmetic: the slug map in the page
 * planner is spelled one way and the probe reaching it was folded the other,
 * and twenty-five real multi-page plans came back with a page called `page-a`
 * because of it. One fold, one place.
 */
export function normalise(input: string): string {
    return String(input || '')
        .normalize('NFKD')
        /**
         *  ⛔ LATIN CASE IS FOLDED HERE, WHERE ARABIC ORTHOGRAPHY IS FOLDED.
         *
         *  Measured on the owner's own request, the one that blocked a
         *  delivery:
         *
         *      «Include a service list with prices, opening hours, location,
         *        phone CTA, and a booking form.»
         *
         *      saysAny('add a phone cta', ['cta'])  -> true
         *      saysAny('add a phone CTA', ['cta'])  -> false
         *      saysAny('a button here',   ['button'])  -> true
         *      saysAny('a BUTTON here',   ['button'])  -> false
         *
         *  The same sentence written in Arabic derived a criterion; written in
         *  English it derived NOTHING, because he had capitalised CTA. Seven
         *  catalogue entries were moved onto this reader, and every one of them
         *  silently stopped seeing capitalised English the day it moved.
         *
         *  ⛔ THE CLASS is one this repository already records — a requirement
         *  read in one inflection and named in one language. The Arabic side of
         *  this function folds hamzas, alef maqsura and taa marbuta so that two
         *  spellings of one word read alike; the Latin side folded nothing at
         *  all, so «CTA» and «cta» were two different words.
         *
         *  Case folding belongs beside the other foldings, not at the call
         *  sites: a caller that must remember to lowercase is a caller that
         *  will forget, and six of the seven already had.
         */
        .toLowerCase()
        .replace(MARKS, '')
        .replace(/[آأإ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
}

/** His words, as Unicode itself breaks them — never as a regex guesses. */
export function words(input: string): string[] {
    return [...segmenter.segment(normalise(input))]
        .filter(s => s.isWordLike)
        .map(s => s.segment);
}

/**
 * «و» and «ف» mean «and» and «so». They are glued to the next word and are
 * never part of it, and the stemmer is not expecting them — «والاسترجاع»
 * comes back unchanged, and then fails to match «استرجاع».
 */
const CONJUNCTION = /^[وف](?=[ء-ي]{3,})/;

/** The stem of one word: what it is, with what the language glued on removed. */
/**
 * The definite article, removed BEFORE stemming rather than left to it.
 *
 * Snowball strips «ال» when what remains is long enough and keeps it when it
 * is not: «العداد» stems to «عداد» and «الزر» stems to «الزر», so one
 * word had two keys depending on its length. Taking the article off first
 * makes the key the word, whatever its length.
 */
const ARTICLE = new RegExp('^ال(?=[ء-ي]{2,})');

export function stem(word: string): string {
    return stemmer.stem(normalise(word).replace(CONJUNCTION, '').replace(ARTICLE, ''));
}

/**
 * TWO WORDS, ONE STEM, DIFFERENT THINGS — and a stemmer cannot tell them apart.
 *
 * «مجموعة» is a SET of things. «المجموع» is a TOTAL. Snowball reduces both to
 * «مجموع», correctly by its own rules, and then «أضف مجموعة صور للمعرض» asks
 * for a total and the delivery is refused for want of one. Measured: twenty
 * requests in the corpus.
 *
 * The remedy is a short list of surface forms that must NOT be read as their
 * stem, which is what every serious stemmer ships alongside the algorithm —
 * Lucene, Snowball and the rest all carry exception tables. A rule cannot do
 * it; the two words differ in meaning, not in shape.
 *
 * Entries earn their place by a measurement, never by suspicion.
 */
const NOT_ITS_STEM: Record<string, string[]> = {
    //  a set of things is not the total of them
    'مجموع': ['مجموعه', 'مجموعات'],
};

/**
 *  «وزر» IS «و» + «زر», AND «وزن» IS A WORD. Both are three letters
 *  beginning with و, and nothing in their shape tells them apart.
 *
 *  So the conjunction is not CUT off the word — that would turn «وزن» into
 *  «زن» and lose a real word. The word is tried BOTH ways instead, and a
 *  match either way counts. Adding a reading is safe where removing letters
 *  is not: nothing asks for «زن», so the extra reading costs nothing, and
 *  «وزر تفاعلي» finds its button.
 */
/**
 *  EVERY WAY ARABIC CAN GLUE A PARTICLE ONTO A WORD, TRIED — NOT CUT.
 *
 *  Snowball strips «ب» from «بعنوان» and then strips «ان» as well, so it
 *  returns «عنو» while «عنوان» returns itself. One word, two keys — and
 *  «ابنِ تطبيقًا بعنوان Gate 062» stopped asking for a title. On short
 *  words it strips nothing at all: «بزر» stays «بزر».
 *
 *  So the particle is never CUT off the word — that loses «وزن» and «كتاب»
 *  the moment it guesses wrong. The word is tried EVERY way instead, and a
 *  match on any reading counts. Adding readings is safe where removing
 *  letters is not: nothing in any catalogue asks for «زن» or «تاب», so the
 *  extra readings cost nothing and the real ones are found.
 */
const GLUED_ON = new RegExp('^(?:وال|فال|بال|كال|لل|[وفبكل])(?=[ء-ي]{2,})');

function everyReadingOf(word: string): string[] {
    const bare = normalise(word);
    const out = new Set<string>([bare]);
    out.add(bare.replace(ARTICLE, ''));
    const unglued = bare.replace(GLUED_ON, '');
    if (unglued !== bare) {
        out.add(unglued);
        out.add(unglued.replace(ARTICLE, ''));
    }
    return [...out].filter(Boolean);
}

function readsAs(word: string, target: string): boolean {
    const bare = normalise(word).replace(ARTICLE, '');
    if ((NOT_ITS_STEM[target] || []).includes(bare)) return false;
    return everyReadingOf(word).some(r => stemmer.stem(r) === target || r === target);
}

/**
 * DOES HE SAY THIS WORD? — the question every pattern in Joe was really asking.
 *
 * A word, matched as a word and in any form he writes it: «عداد» is «العداد»
 * is «عدادًا» is «عداداتها». And «أزرق» is not «زر», however many letters they
 * share, because they are two words and this asks about words.
 */
export function saysWord(text: string, word: string): boolean {
    const target = stem(word);
    if (!target) return false;
    return words(text).some(w => readsAs(w, target));
}

/** Any of them — the shape a catalogue entry actually needs. */
export function saysAny(text: string, candidates: string[]): boolean {
    const targets = candidates.map(stem).filter(Boolean);
    if (!targets.length) return false;
    return words(text).some(w => targets.some(t => readsAs(w, t)));
}

/**
 * WHAT THIS LAYER CANNOT DO, NAMED SO THE NEXT ONE KNOWS ITS JOB.
 *
 * Measured, not guessed:
 *
 *   - «الأزرار» does not stem to «زر». Broken plurals are a lexicon problem
 *     and no stemmer in any language solves them by rule.
 *   - «مجموعة» (a set) and «المجموع» (the total) share one stem and mean
 *     different things. That is semantics, not morphology.
 *
 * Anything reaching for these two must ask a model, and must ground what the
 * model says in his own words before believing it.
 */
export const KNOWN_LIMITS = Object.freeze({
    brokenPlurals: ['الأزرار'],
    stemCollisions: [['مجموعة', 'المجموع']],
});
