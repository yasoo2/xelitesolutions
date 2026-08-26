/**
 * «BUILD ME A WEBSITE» IS NOT READ AS A REQUEST FOR A WEBSITE.
 *
 * Measured live by Manus on the owner's reference matrix, P01, from a prompt
 * that opens with the word in question:
 *
 *     PROMPT         Build a responsive WEBSITE for a neighborhood bicycle
 *                    repair studio called Spoke & Stem. Include a service
 *                    list with prices, opening hours, location, phone CTA,
 *                    and a booking form.
 *     CLASSIFICATION page=landing; app=booking; engine=records
 *     VISIBLE_UI     Bookings · Providers · Add a booking · search/status/
 *                    sort controls · Export CSV
 *
 * No service list. No prices. No opening hours. No location. No phone CTA.
 * Six things were asked for and one was built, as a records table.
 *
 * The cause is one line, and it is what it does NOT contain:
 *
 *     PAGE_SIGNAL = /صفحة (هبوط|تعريفية|تسويقية)|landing page|portfolio|
 *                    one-pager|brochure|…/
 *
 * «landing page» is a page signal. «portfolio» is a page signal. «brochure»
 * is a page signal. THE WORD «website» IS NOT — and neither is «موقع». So the
 * single most common way anyone asks for a site does not identify one, the
 * request falls through to the application classifier, «booking form» is the
 * first archetype it recognises, and a marketing site becomes a CRUD table.
 *
 * THE CLASS is the night's second, in its plainest form yet: A DECISION TAKEN
 * FROM A FRAGMENT WHEN THE AUTHORITY IS THE WHOLE REQUEST. «booking form» is
 * one of six items; it won because it was the only one the catalogue knew,
 * and nothing asked whether the sentence had already said what it wanted.
 *
 * The negative case is the point of balance: «صفحة هبوط لتطبيق حجوزات» is a
 * PAGE about an app and must stay a page, and «اعمل تطبيق حجوزات» must stay
 * an app. Widening the signal must not swallow either.
 */

import { detectAppKind } from '../core/design/app-blueprints';

describe('the word for a website identifies a website', () => {
    it('POSITIVE — the exact P01 prompt is not classified as an app', () => {
        const p01 = 'Build a responsive website for a neighborhood bicycle repair studio '
            + 'called Spoke & Stem. Include a service list with prices, opening hours, '
            + 'location, phone CTA, and a booking form.';
        expect(detectAppKind(p01)).toBeNull();
    });

    it('POSITIVE — and its Arabic twin behaves the same', () => {
        //  The English request escaped nothing here; both must be read alike,
        //  because a defect visible in one language only is how this whole
        //  night started.
        expect(detectAppKind(
            'اعمل لي موقع لورشة تصليح دراجات فيه قائمة خدمات بأسعارها وساعات العمل '
            + 'والموقع وزر اتصال ونموذج حجز',
        )).toBeNull();
    });

    it('POSITIVE — a plain site request with no catalogue word at all', () => {
        expect(detectAppKind('اعمل لي موقع لمطعم إيطالي اسمه لا بيلا')).toBeNull();
        expect(detectAppKind('build a website for an Italian restaurant')).toBeNull();
    });

    it('NEGATIVE — asking for an APP still yields an app', () => {
        //  Widening the page signal must not swallow the request it exists to
        //  distinguish itself from. If this goes null, the fix built a wall.
        expect(detectAppKind('اعمل لي تطبيق حجوزات فيه اسم الزبون والتاريخ والحالة')).not.toBeNull();
        expect(detectAppKind('build me a booking app with customer name, date and status')).not.toBeNull();
    });

    it('NEGATIVE — a page ABOUT an app is still a page, as it already was', () => {
        expect(detectAppKind('صفحة هبوط لتطبيق خرائط')).toBeNull();
    });

    it('NEGATIVE — a named collection of columns still outranks a stray noun', () => {
        //  «عندي عيادة أسنان … اسم المريض ورقم تلفونه» — the list is the
        //  contract and the noun is incidental. That reading already worked
        //  and must not be disturbed by anything here.
        expect(detectAppKind(
            'عندي عيادة أسنان، أريد جدولاً فيه اسم المريض ورقم تلفونه وتاريخ الموعد والحالة',
        )).not.toBeNull();
    });
});
