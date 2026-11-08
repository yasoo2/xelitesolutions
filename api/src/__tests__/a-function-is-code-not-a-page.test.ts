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
    ])('«%s» is a program, with no page', request => {
        expect(requestedDeliveryRoles(request)).toEqual({ service: false, interface: false, program: true });
    });

    test.each([
        'Build a web page with a function that converts currencies.',
        'ابني صفحة فيها دالة تحسب الضريبة',
        'Build an app with a helper that formats dates.',
        'Build a price calculator page for a warehouse.',
    ])('«%s» still has an interface', request => {
        expect(requestedDeliveryRoles(request).interface).toBe(true);
    });
});
