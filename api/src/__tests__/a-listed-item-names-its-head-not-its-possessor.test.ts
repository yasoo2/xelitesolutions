import { namedEntities } from '../core/design/named-entities';
import { requestedRecords } from '../core/quality/request-coverage';

/**
 * Eval run500 (2026-10-26, P001-landing-ar): a dental-clinic landing page
 * «فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء …» was built with its services
 * and testimonials sections, then failed delivery with
 * «requested_entities_not_delivered: services (not built); customers (not
 * built)». «آراء العملاء» (customers' opinions — testimonials) had been read as
 * a `customers` table by its second word; the same request in English read
 * no table at all. A listed item names its head noun, never its possessor.
 */
const P001 = 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';
const keys = (request: string) => namedEntities(request).map(e => e.key);

describe('a listed item names its head, not its possessor', () => {
    it('P001: a landing page\'s sections in Arabic are not records, as in English', () => {
        expect(keys(P001)).toEqual([]);
        expect(requestedRecords(P001, { backendRequested: false })).toEqual({ entities: [], unread: [], testsRequested: null });
    });
    it('«آراء العملاء» and «صور المنتجات» do not make customers or products tables', () => {
        const k = keys('ابنِ نظاماً لمكتبة فيه: الكتب، والأعضاء، وآراء العملاء، وصور المنتجات');
        expect(k).toEqual(expect.arrayContaining(['books', 'members']));
        expect(k).not.toContain('customers');
        expect(k).not.toContain('products');
    });
    it('English reads the head last: «customer reviews» are not customers', () => {
        const k = keys('Build a library system with: books, members, customer reviews');
        expect(k).toEqual(expect.arrayContaining(['books', 'members']));
        expect(k).not.toContain('customers');
    });
    it('a head that holds or works the records still names them', () => {
        expect(keys('نظام لعيادة فيه: سجل المرضى، وجدول المواعيد')).toEqual(expect.arrayContaining(['patients', 'appointments']));
        expect(keys('A clinic app with: patient records, appointment list')).toEqual(expect.arrayContaining(['patients', 'appointments']));
    });
    it('a two-word noun on the list is read whole before its words', () => {
        const k = keys('نظام مبيعات فيه: العملاء المحتملون، والفواتير');
        expect(k).toEqual(expect.arrayContaining(['contacts', 'invoices']));
        expect(k).not.toContain('customers');
    });
});
