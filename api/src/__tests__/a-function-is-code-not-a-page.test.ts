/**
 * A FUNCTION IS CODE, NOT A PAGE.
 *
 * The ladder, 2026-11-08: «Write a JavaScript function that formats a price …
 * with three tests» (L031, L032) was read as an interface, so the live check
 * wanted a page; the model built a server and a page nobody asked for, and the
 * run failed when that server answered on no port. Pinned: a code unit asked
 * for alone is a program its tests prove; one beside a page, an app or a
 * server is not.
 */
import { requestedDeliveryRoles } from '../modules/tools/definitions/ProjectPipelineTool';

describe('what a request for code is proven by', () => {
    test.each([
        'اكتب دالة JavaScript تنسّق السعر لـاستوديو تصوير بمنزلتين عشريتين ورمز العملة، مع ثلاثة اختبارات.',
        'Write a JavaScript function that formats a price for a sports league with two decimals and a currency symbol, with three tests.',
        'Write a Python class for a bank account with deposit and withdraw methods and tests.',
        'اكتب خوارزمية ترتيب سريع بلغة JavaScript مع اختبارات',
        'Write a regex that validates Saudi phone numbers, with tests.',
        //  The product a function is FOR is where it lives, not what is asked (the ladder, 2026-11-09: L033, L034).
        'اكتب دالة JavaScript تنسّق السعر لـموقع أخبار بمنزلتين عشريتين ورمز العملة، مع ثلاثة اختبارات.',
        'Write a JavaScript function that formats a price for a food delivery app with two decimals and a currency symbol, with three tests',
        'Write a scoring function for my game, with tests.',
    ])('«%s» is a program, with no page', request => {
        expect(requestedDeliveryRoles(request)).toEqual({ service: false, interface: false, program: true });
    });

    test.each([
        'Build a web page with a function that converts currencies.',
        'ابني صفحة فيها دالة تحسب الضريبة',
        'Build an app with a helper that formats dates.',
        'Build a price calculator page for a warehouse.',
        'Write a function and a page for a café site.',
    ])('«%s» still has an interface', request => {
        expect(requestedDeliveryRoles(request).interface).toBe(true);
    });

    test('a module for an app still names a product: only a function is read past what it is for', () => {
        const L343 = 'Build an invoicing and payments module for a food delivery app: invoices with line items and tax, a payment flow using a sandbox/mock gateway with webhooks, receipts, refunds and a revenue report.';
        expect(requestedDeliveryRoles(L343).program).toBe(false);
    });
});
