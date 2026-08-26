/**
 * A REQUEST WRITTEN ENTIRELY IN ARABIC PRODUCED AN ENGLISH SITE.
 *
 * Seen by the owner on his own screen, during a live build he asked to watch:
 *
 *     «اعمل لي موقع لمحمصة قهوة مختصة اسمها وَقّاد، فيه قصة المحمصة
 *       وأنواع القهوة وطريقة التحميص»
 *
 *     content.js   isArabic: false
 *                  tagline:      'محمصة قهوة مختصة'          <- his words
 *                  heroTitle:    'وَقّاد — محمصة قهوة مختصة'  <- his words
 *                  ctaBandTitle: 'Your table is ready tonight'
 *                  stepsTitle:   'How to book'
 *
 * Half the page in his language, half of it English. `artifactLanguageIsArabic`
 * read only the COLUMNS and the PAGE NAMES he had listed, and this request
 * lists neither — so it fell through to the interface language and never
 * looked at the sentence itself.
 *
 * ⛔ THE CLASS is the fourth law, and this is its sixth appearance: A DECISION
 * TAKEN FROM A PART WHILE THE AUTHORITY IS THE WHOLE REQUEST. The doc comment
 * above the function records an earlier instance of the very same defect —
 * «the rule existed and read only the COLUMNS he listed, so a request that
 * names PAGES fell through» — and that repair widened the fragment by exactly
 * one. This one stops widening and reads his sentence.
 *
 * The negatives matter as much: his NAMED words must still outrank the
 * sentence they sit in, an English request must stay English, and a request
 * with no letters at all must still fall back rather than guess.
 */

import { artifactLanguageIsArabic } from '../modules/tools/definitions/ReactProjectTool';

describe('the language of the artifact is read from his whole request', () => {
    it('POSITIVE — the exact request from the live build now builds in Arabic', () => {
        //  Verbatim, including the diacritics, because a fixture that tidies
        //  the input is not the input.
        const request = 'اعمل لي موقع لمحمصة قهوة مختصة اسمها وَقّاد، فيه قصة المحمصة وأنواع القهوة وطريقة التحميص';
        //  replyIsArabic=false is the condition that produced the defect: the
        //  interface was in English and the request was not.
        expect(artifactLanguageIsArabic(request, false)).toBe(true);
    });

    it('POSITIVE — and an English request still builds in English', () => {
        expect(artifactLanguageIsArabic('build me a website for a specialty coffee roastery called Ember', true)).toBe(false);
    });

    it('NEGATIVE — words he NAMED still outrank the sentence around them', () => {
        //  He wrote the page names in English inside an Arabic sentence. Those
        //  are his words about the artifact, and they win — otherwise this fix
        //  would have overwritten the rule it was extending.
        const named = 'اعمل لي موقع فيه صفحة Home وصفحة Contact';
        expect(artifactLanguageIsArabic(named, true)).toBe(false);
    });

    it('NEGATIVE — a request with almost no letters falls back, it does not guess', () => {
        //  Below the threshold there is nothing to read, and inventing a
        //  language from three characters is how a fallback becomes a source.
        expect(artifactLanguageIsArabic('go', true)).toBe(true);
        expect(artifactLanguageIsArabic('', false)).toBe(false);
        expect(artifactLanguageIsArabic('   ', true)).toBe(true);
    });

    it('NEGATIVE — a mixed sentence follows its majority, not its first word', () => {
        //  «Build» first, Arabic body: the decision must come from the whole
        //  sentence, which is the entire point of this file.
        const mixed = 'build اعمل لي موقع لمحمصة قهوة مختصة فيه قصة المحمصة وأنواع القهوة وطريقة التحميص';
        expect(artifactLanguageIsArabic(mixed, false)).toBe(true);

        const mostlyEnglish = 'اعمل a website for a specialty coffee roastery with a story page and a menu page';
        expect(artifactLanguageIsArabic(mostlyEnglish, true)).toBe(false);
    });
});
