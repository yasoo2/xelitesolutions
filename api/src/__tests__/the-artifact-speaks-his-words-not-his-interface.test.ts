/**
 * AN ARABIC PAGE UNDER AN ENGLISH HEADING, FROM ONE SENTENCE.
 *
 * Measured live, in front of the owner, with his interface switched to EN:
 *
 *     «اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف اسمها «نور»»
 *
 *       nav:      نور · هبوط · تواصل        ← his words, Arabic
 *       heading:  «Contact us»              ← the reply language, English
 *
 * One request, two languages on one screen. Nobody would ship that.
 *
 * The rule that prevents it already existed and was right: the reply is for
 * HIM and the interface decides its language, but the app is for whoever will
 * use it and is labelled with HIS OWN WORDS. It read only the COLUMNS he
 * listed, so a request that names PAGES fell through to the reply language —
 * the same defect it was written for, one reader short.
 *
 * THIS FILE IS THE SECOND VERSION. The first read the decision out of the
 * source and asserted on the text it found. A mutation that ignored the pages
 * entirely — `hisWords = columns; void namedPageTitles;` — left ALL SIX of its
 * assertions green, because every name it searched for was still spelled in
 * the file. A guard on spelling is not a guard.
 *
 * So the decision was given a name, exported, and is called here with real
 * sentences. It fails when the behaviour changes, which is the only thing
 * worth failing on.
 */

import { artifactLanguageIsArabic } from '../modules/tools/definitions/ReactProjectTool';

describe('his words decide the artifact language, whatever his interface says', () => {
    //  `false` throughout is the interface set to English — the state the
    //  owner was actually in when this was found.
    const withEnglishInterface = (request: string) => artifactLanguageIsArabic(request, false);

    it('pages he named in Arabic make an Arabic artifact', () => {
        expect(withEnglishInterface('اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف اسمها «نور»')).toBe(true);
        expect(withEnglishInterface('اعمل موقع فيه صفحة من نحن وصفحة خدمات')).toBe(true);
    });

    it('columns he listed in Arabic do too — the half that already worked', () => {
        expect(withEnglishInterface('اعمل جدول فيه اسم العميل والمبلغ والتاريخ')).toBe(true);
    });

    it('and an English request under an Arabic interface is English', () => {
        //  The rule runs both ways or it is not a rule.
        expect(artifactLanguageIsArabic('build a site with a pricing page and a docs page', true)).toBe(false);
        expect(artifactLanguageIsArabic('a table with customer name, amount and date', true)).toBe(false);
    });

    it('with none of his words, the language he is spoken to in stands', () => {
        //  Nothing of his reached the artifact, so there is nothing to take a
        //  language from. A fallback — and it must stay a fallback.
        expect(artifactLanguageIsArabic('اعمل لي موقع', false)).toBe(false);
        expect(artifactLanguageIsArabic('اعمل لي موقع', true)).toBe(true);
        expect(artifactLanguageIsArabic('', true)).toBe(true);
    });

    it('the interface cannot override words he actually wrote', () => {
        //  This is the whole finding, in one line: his pages are Arabic, his
        //  interface is English, and the artifact follows his pages.
        expect(artifactLanguageIsArabic('اعمل موقع فيه صفحة قائمة الطعام وصفحة الحجز', false)).toBe(true);
    });
});
