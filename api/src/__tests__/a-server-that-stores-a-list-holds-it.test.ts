/**
 * ⛔ A SERVER THAT STORES X, Y AND Z HOLDS X, Y AND Z — AND «WITH SERVER TESTS» ASKS FOR TESTS.
 *
 * The thirteenth live check, 2026-11-11 (L232): «a laundry service with a Node server that stores
 * orders, items, pickups in a real database and a clean interface to manage them, with server
 * tests». The plain opener took the first «with»: of his three records the gate read one, and
 * «with server tests» was no request for tests. Read over the 1032 exam prompts, the nine that
 * changed are this family (L232–L240), each now naming every record it listed.
 */
import { requestedRecords, testsRequestedIn } from '../core/quality/request-coverage';

const keys = (request: string) => requestedRecords(request, { backendRequested: true }).entities.map(e => e.key).sort();

describe('what a keeping verb lists is what the system holds', () => {
    test.each([
        ['Build a web app for a laundry service with a Node server that stores orders, items, pickups in a real database and a clean interface to manage them, with server tests.', ['orders', 'pickups', 'products']],
        ['Build a library API that stores books, members, loans in a database, with tests.', ['books', 'loans', 'members']],
        ['ابني تطبيق ويب لـقسم دعم فني بخادم Node يخزن التذاكر والموظفين والأجهزة في قاعدة بيانات حقيقية، وواجهة مرتبة لإدارتها، مع اختبارات للخادم.', ['devices', 'employees', 'tickets']],
        ['ابني تطبيق ويب لـمنصة دورات تعليمية بخادم Node يخزّن الدورات والدروس والتسجيلات في قاعدة بيانات حقيقية.', ['courses', 'enrollments', 'lessons']],
    ])('«%s»', (request, expected) => {
        expect(keys(request)).toEqual(expect.arrayContaining(expected as string[]));
    });

    test('one thing kept is no list: «ويحفظ سجلها» adds no record', () => {
        const before = keys('ابني صفحة روبوت محادثة لخدمة عملاء محل ورود يجيب من قائمة أسئلة مدمجة ويسمح بحجز أو إلغاء التوصيلات من المحادثة.');
        const after = keys('ابني صفحة روبوت محادثة لخدمة عملاء محل ورود يجيب من قائمة أسئلة مدمجة ويسمح بحجز أو إلغاء التوصيلات من المحادثة ويحفظ سجلها.');
        expect(after).toEqual(before);
    });
});

/*
 * The fourth review, 2026-11-11: the kept list REPLACED the «with» list, and «a clinic system with
 * patients, doctors and appointments that stores invoices and payments» lost its first three. Both
 * are read, before and after; and what a keeping verb keeps that is no record is none.
 */
describe('the kept list is read with the «with» list, never instead of it', () => {
    test.each([
        ['Build a clinic system with patients, doctors and appointments that stores invoices and payments in a database.', ['appointments', 'doctors', 'invoices', 'patients', 'payments']],
        ['Build a CRM with contacts, companies and deals, and a Node server that stores notes and tasks in a database.', ['companies', 'contacts', 'deals', 'notes', 'tasks']],
        ['Build an inventory app with products, suppliers and warehouses. It keeps stock movements and audit logs.', ['products', 'suppliers', 'warehouses']],
        ['ابني متجر فيه منتجات وسلة وطلبات ويحفظ الفواتير والمدفوعات في قاعدة بيانات', ['invoices', 'orders', 'payments', 'products']],
        ['A fleet app that keeps track of vehicles, drivers and trips in SQLite.', ['drivers', 'trips']],
    ])('«%s»', (request, expected) => {
        expect(keys(request)).toEqual(expect.arrayContaining(expected as string[]));
    });

    test('«saves you time and money» keeps no record', () => {
        const got = keys('Build a budgeting app that saves you time and money, with expenses, budgets and reports.');
        expect(got).toEqual(expect.arrayContaining(['budgets', 'expenses']));
        expect(got.filter(k => /^(?:times?|moneys?|yous?)$/u.test(k))).toEqual([]);
    });
});

describe('«with server tests» asks for tests, as «with API tests» does', () => {
    test.each([
        'Build a laundry app with a Node server, with server tests.',
        'A notes API with backend tests',
        'Ship UI tests for the booking form',
    ])('«%s»', request => {
        expect(testsRequestedIn(request)).not.toBeNull();
    });

    test('a server that tests nothing asks for no tests', () => {
        expect(testsRequestedIn('Build a quiz app that tests kids on their times tables, with a Node server.')).toBeNull();
    });
});
