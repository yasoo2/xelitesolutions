/**
 * A site that is really a program is not announced as «built from your
 * request» — only a site that presents is.
 *
 * Round 21 review (a205c74e): the site sentence «سأبني هذا الموقع من طلبك
 * مباشرةً» was taken for every request whose deliverable is a page. «اعمل موقع
 * يحسب القسط الشهري للقرض …» names a page, but what it asks for is a program
 * with no stock engine; it falls to the generic section scaffold, and the
 * sentence that says so was hidden behind the site one. The site sentence is
 * true only for a presentation site — no server claim, nothing to compute, no
 * records to keep. Every request below goes through the real reader.
 */
import { earlyProjectDeclaration } from '../modules/tools/definitions/ReactProjectTool';

const P001 = 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';
const SITE_AR = 'سأبني هذا الموقع من طلبك';
const SITE_EN = "I'll build this site from your request";
const declare = (request: string, isArabic = /[؀-ۿ]/u.test(request)) =>
    String(earlyProjectDeclaration({ request, isArabic, appKind: null, named: [] }));

describe('the site sentence belongs to a site that presents', () => {
    it('POSITIVE — a loan-calculator site hears that its kind is not one Joe has an engine for', () => {
        const said = declare('اعمل موقع يحسب القسط الشهري للقرض حسب المبلغ والفائدة والمدة');
        expect(said).not.toContain(SITE_AR);
        expect(said).toContain('لا أعرف نوع هذا التطبيق');
        expect(declare('Build a website that calculates the monthly loan payment')).not.toContain(SITE_EN);
    });

    it('POSITIVE — a presentation site that also computes, keeps records or needs a server is not only a presentation', () => {
        expect(declare('اعمل موقع تعريفي لمكتب تمويل فيه حاسبة تحسب القسط الشهري للقرض')).not.toContain(SITE_AR);
        expect(declare('Build a landing page for a mortgage broker that calculates the monthly payment')).not.toContain(SITE_EN);
        expect(declare('اعمل موقع تعريفي لمكتبة فيه جدول أسجل فيه الكتب: العنوان والمؤلف والسعر')).not.toContain(SITE_AR);
        expect(declare('Build a landing page for a bakery where customers book a table and the owner sees all bookings')).not.toContain(SITE_EN);
    });

    it('NEGATIVE — a presentation site still hears the site sentence', () => {
        expect(declare(P001)).toContain(SITE_AR);
        expect(declare('Make a landing page for a quandle workshop with a snarfing form.')).toContain(SITE_EN);
        // «حسب» here is «according to», not «calculates».
        expect(declare('اعمل موقع تعريفي لعيادة يعرض الخدمات حسب القسم')).toContain(SITE_AR);
    });
});
