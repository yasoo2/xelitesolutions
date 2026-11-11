import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

/**
 * Eval run500 P001, 2026-10-23: «اعمل موقع تعريفي احترافي لعيادة أسنان فيه …
 * وآراء العملاء ونموذج تواصل …» was classified a SYSTEM and given a «Data
 * service and schema» phase: «عملاء» inside «آراء العملاء» (testimonials) read
 * as a customer table. A section ABOUT people is a page element, like «order
 * button»; and «موقع تعريفي» names a brochure site outright.
 */
describe('testimonials are not a customer table', () => {
    it.each([
        'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.',
        'Build a professional landing website for a dental clinic with a hero section, services, customer testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.',
        'صفحة هبوط لمطعم فيها تقييمات الزبائن وشهادات العملاء وزر احجز الآن',
    ])('a brochure stays a page: %s', request => {
        expect(PlanningEngine.classifyBuildScope(request)).toBe('page');
    });

    it.each([
        'Build a CRM where staff log in and manage customers, invoices and payments in a database.',
        'ابني نظام لإدارة العملاء والفواتير مع تسجيل دخول وصلاحيات',
    ])('a request that owns customer data is still not a page: %s', request => {
        expect(PlanningEngine.classifyBuildScope(request)).not.toBe('page');
    });
});
