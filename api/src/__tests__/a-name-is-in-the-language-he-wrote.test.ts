/**
 *  A NAME FOR HIS THING IS IN THE LANGUAGE HE WROTE.
 *
 *  Live round on his machine. He typed, in Arabic:
 *
 *      «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *
 *  and Joe answered: A full React project scaffolded — "MyApp".
 *
 *  Measured on the function afterwards:
 *
 *      his words ARABIC  · interface ARABIC   → «مشروعي»
 *      his words ARABIC  · interface ENGLISH  → «MyApp»    ← this round
 *      his words ENGLISH · interface ARABIC   → «مشروعي»
 *
 *  The name followed the SWITCHER. A man writing Arabic was handed «MyApp»
 *  because a control at the top of the screen said English. The interface
 *  language governs what Joe SAYS to him — that is right and it stays. It
 *  does not govern what his project is CALLED.
 */
import { brandFallback } from '../core/design/page-head';

const ARABIC = 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر';
const ENGLISH = 'I want a sales table with item, quantity and price';

describe('the name takes the script of his words', () => {
    it('the exact live round: Arabic words, English interface', () => {
        expect(brandFallback(ARABIC, false, 'generic')).toBe('مشروعي');
    });

    it('…and Arabic words with an Arabic interface are unchanged', () => {
        expect(brandFallback(ARABIC, true, 'generic')).toBe('مشروعي');
    });

    it('the mirror: English words, Arabic interface', () => {
        //  The same defect the other way round, and it was there too.
        expect(brandFallback(ENGLISH, true, 'generic')).toBe('MyApp');
    });

    it('…and English words with an English interface are unchanged', () => {
        expect(brandFallback(ENGLISH, false, 'generic')).toBe('MyApp');
    });
});

describe('…and the flag still answers when his words carry no script', () => {
    it('an empty request falls back to the interface', () => {
        //  The negative: with nothing of his to read, the switcher is the
        //  only thing left, and removing that would leave no answer at all.
        expect(brandFallback('', true, 'generic')).toBe('مشروعي');
        expect(brandFallback('', false, 'generic')).toBe('MyApp');
    });

    it('a request of only digits and punctuation falls back to the interface', () => {
        expect(brandFallback('123 456 !!', true, 'generic')).toBe('مشروعي');
        expect(brandFallback('123 456 !!', false, 'generic')).toBe('MyApp');
    });
});
