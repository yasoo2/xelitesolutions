/**
 * A SITE IS NOT AN APP JOE FAILED TO RECOGNISE.
 *
 * Eval P001 (run-1793116203492): «اعمل موقع تعريفي احترافي لـعيادة أسنان…»
 * classified page=landing · app=none, and Joe's terminal told him
 * «لا أعرف نوع هذا التطبيق، ولا أملك محرّكاً جاهزاً له — ما سأبنيه هيكلٌ عامّ».
 * He asked for a site; the sentence confessed to an unknown app. Every site
 * request without a stock app engine heard it.
 */
import { earlyProjectDeclaration } from '../modules/tools/definitions/ReactProjectTool';

const P001 = 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';

describe('a site is not announced as an unknown app', () => {
    it('POSITIVE — the Arabic site request hears that its site is built from its words', () => {
        const said = earlyProjectDeclaration({
            request: P001, isArabic: true, appKind: null,
            named: [{ text: 'قسم رئيسي جذاب' }, { text: 'آراء العملاء' }],
        });
        expect(said).not.toContain('لا أعرف نوع هذا التطبيق');
        expect(said).not.toContain('هيكلٌ عامّ');
        expect(said).toContain('سأبني هذا الموقع من طلبك');
        expect(said).toContain('قسم رئيسي جذاب · آراء العملاء');
    });

    it('POSITIVE — an English landing page is a site too, whatever its subject', () => {
        const said = earlyProjectDeclaration({
            request: 'Make a landing page for a quandle workshop with a snarfing form.',
            isArabic: false, appKind: null, named: [{ text: 'a snarfing form' }],
        });
        expect(said).not.toContain("I don't know this app type");
        expect(said).toContain("I'll build this site from your request");
        expect(said).toContain('From your request I understood: a snarfing form');
    });

    it('NEGATIVE — a request that names an app with no stock engine still says so', () => {
        const said = earlyProjectDeclaration({
            request: 'ابنِ تطبيقاً بعنوان Gate 062 يحتوي على عداد ظاهر وزر تفاعلي ورسالة حالة قصيرة.',
            isArabic: true, appKind: null,
        });
        expect(said).toContain('لا أعرف نوع هذا التطبيق');
    });

    it('NEGATIVE — a request that names no deliverable keeps the unknown-app sentence', () => {
        const said = earlyProjectDeclaration({
            request: 'a button that increments a visible counter', isArabic: false, appKind: null, named: [],
        });
        expect(said).toContain("I don't know this app type");
    });
});
