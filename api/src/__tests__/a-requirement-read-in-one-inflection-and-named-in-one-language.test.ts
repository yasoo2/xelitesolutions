/**
 * SIX THINGS ASKED FOR, ONE EXTRACTED — AND ITS NAME CAME BACK IN THE WRONG
 * LANGUAGE.
 *
 * Measured on the owner's own reference prompt and its Arabic twin:
 *
 *     EN  «…a service list with prices, opening hours, location, phone CTA,
 *          and a booking form»          ->  sections: ["الأسعار"]
 *     AR  «…قائمة خدمات بأسعارها وساعات العمل والموقع وزر اتصال ونموذج حجز»
 *                                       ->  sections: []
 *
 * Two defects sit in the same four lines.
 *
 * ONE — THE NAME IS ALWAYS ARABIC. `sections.push(c.ar)` runs whatever
 * language the request was written in, and the entry it pushes from already
 * carries an `en` twin, unused. An English brief comes back asking for
 * «الأسعار». This is the language-parity class: the two sides of one table
 * maintained together and only one of them ever read.
 *
 * TWO — THE PATTERN DEMANDS ONE EXACT INFLECTION. The services entry is
 *
 *     re:    /خدماتنا|services/i        <- used to EXTRACT
 *     match: /خدمات|services/i          <- used to VERIFY
 *
 * so «قائمة خدمات» does not match «خدماتنا» and «a service list» does not
 * match «services». One concept, two patterns, and the strict one does the
 * extracting — which is this repository's third class again: two records of
 * one fact with nothing forcing them to agree. And the strict one reads
 * letters rather than words, which is the class the language layer exists to
 * close: «خدمات» is «خدماتنا» is «خدماتكم», and none of them is «خدم».
 *
 * The negative cases are the boundary: a control the user never mentioned
 * must still not be invented, and a page that merely mentions contact must
 * not be failed for lacking a contact BUTTON.
 */

import { extractRequirements } from '../core/design/content-contract';

const EN = 'Build a responsive website for a neighborhood bicycle repair studio '
    + 'called Spoke & Stem. Include a service list with prices, opening hours, '
    + 'location, phone CTA, and a booking form.';
const AR = 'اعمل لي موقع لورشة تصليح دراجات فيه قائمة خدمات بأسعارها '
    + 'وساعات العمل والموقع وزر اتصال ونموذج حجز';

describe('a requirement is read in any inflection and named in his language', () => {
    it('POSITIVE — an English brief comes back in English', () => {
        const req = extractRequirements(EN);
        for (const s of req.sections) expect(s).toMatch(/^[\x20-\x7e]+$/);
        expect(req.sections).toContain('Pricing');
    });

    it('POSITIVE — «خدمات» is «خدماتنا», and «a service list» is services', () => {
        //  The extractor reads WORDS now, through the same language layer the
        //  rest of Joe uses, so a possessive suffix or a singular no longer
        //  hides a requirement.
        expect(extractRequirements(AR).sections).toContain('خدماتنا');
        expect(extractRequirements(EN).sections).toContain('Services');
    });

    it('POSITIVE — the Arabic brief is no longer empty', () => {
        //  Zero of six was the measurement that started this.
        expect(extractRequirements(AR).sections.length).toBeGreaterThanOrEqual(2);
    });

    it('NEGATIVE — nothing he never mentioned is invented', () => {
        //  A wider reader must not become a guessing one.
        const plain = extractRequirements('اعمل لي موقع لمطعم إيطالي اسمه لا بيلا');
        expect(plain.sections).not.toContain('تسجيل الدخول');
        expect(plain.sections).not.toContain('إنشاء حساب');
    });

    it('NEGATIVE — a control is only REQUIRED as a button when he said button', () => {
        //  «every page that merely mentions contact would be failed for
        //  lacking a contact button» — that reading is already correct and
        //  must survive.
        expect(extractRequirements('صفحة فيها من نحن وتواصل معنا').buttons).toEqual([]);
        expect(extractRequirements('صفحة فيها زر تواصل معنا').buttons.length).toBeGreaterThan(0);
    });

    it('NEGATIVE — a word is not matched inside a longer word', () => {
        //  «خدم» must not find «خدمات», and «price» must not be found inside
        //  «priceless». Reading letters instead of words is the defect this
        //  fix exists to close, not one to reintroduce from the other side.
        const none = extractRequirements('اعمل موقعاً عن استخدام الطاقة الشمسية');
        expect(none.sections).not.toContain('خدماتنا');
    });
});
