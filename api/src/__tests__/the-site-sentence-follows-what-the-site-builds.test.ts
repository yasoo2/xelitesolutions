/**
 * The site sentence follows what the site path will build.
 *
 * Round 21 second review (W9): «Build a landing page for an accounting firm
 * that offers tax calculation services» heard «I don't know this app type…»:
 * «calculation» named the firm's service and the computing list read it as an
 * order to compute. The section builder builds his named requirements, so the
 * question is asked of those (of his sentence only when none were named), and
 * a verbal noun names a topic in English as it already did in Arabic («حساب»).
 * The announcement is the real code.
 */
import { earlyProjectDeclaration } from '../modules/tools/definitions/ReactProjectTool';

const SITE_AR = 'سأبني هذا الموقع من طلبك';
const SITE_EN = "I'll build this site from your request";
const declare = (request: string, named: Array<{ text: string }> = []) =>
    String(earlyProjectDeclaration({ request, isArabic: /[؀-ۿ]/u.test(request), appKind: null, named }));

describe('the site sentence follows what the site builds', () => {
    it('POSITIVE — a firm that offers calculation services is a site that presents', () => {
        expect(declare('Build a landing page for an accounting firm that offers tax calculation services')).toContain(SITE_EN);
        expect(declare('اعمل صفحة هبوط لمكتب محاسبة يقدم خدمات حساب الضرائب')).toContain(SITE_AR);
    });

    it('POSITIVE — when his requirements were named, they are what is asked', () => {
        expect(declare('Build a landing page for Nour Accounting', [{ text: 'a list of tax calculation services' }, { text: 'a contact form' }])).toContain(SITE_EN);
    });

    it('NEGATIVE — a page told to compute, or carrying a calculator, is still not only a presentation', () => {
        expect(declare('Build a landing page for a mortgage broker that calculates the monthly payment')).not.toContain(SITE_EN);
        expect(declare('Build a landing page for a mortgage broker', [{ text: 'a calculator for the monthly payment' }])).not.toContain(SITE_EN);
        expect(declare('اعمل موقع تعريفي لمكتب تمويل', [{ text: 'حاسبة القسط الشهري' }])).not.toContain(SITE_AR);
    });
});
