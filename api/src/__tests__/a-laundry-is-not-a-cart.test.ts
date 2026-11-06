/**
 *  A LAUNDRY IS NOT A CART.
 *
 *  P272, 2026-11-06: «ابني تطبيق حجز لـمغسلة ملابس: الزبون يختار التاريخ
 *  والوقت…». «مغسلة», a laundry, carries the letters of «سلة», a cart. The page
 *  kind came out «store» and the scope gate demanded «orders», refusing the
 *  delivery four times: «artifact coverage 0% — missing: orders». Read over
 *  all 520 exam prompts, the four laundry prompts were the only readings that
 *  changed: three lose an «orders» nobody asked for, the one that says «إدارة
 *  الطلبات» keeps it, and none of the four is a shop.
 */
import { asksAsWords, standsAsWords, wordMatch } from '../core/design/arabic-words';
import { FoldedRegExp } from '../core/design/request-lists';
import { detectPageKind } from '../core/design/blueprints';
import { requestedCapabilities } from '../core/quality/scope-audit';

const P172 = 'ابني نظام متكامل لـمغسلة ملابس: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلبات والقطع ومواعيد الاستلام، وكل موظف يرى سجلاته فقط.';
const P272 = 'ابني تطبيق حجز لـمغسلة ملابس: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.';
const P372 = 'اعمل صفحة تقرير تفاعلية لـمغسلة ملابس تحمّل بيانات تجريبية عن القطع، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.';
const P472 = 'ابني صفحة روبوت محادثة لخدمة عملاء مغسلة ملابس يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء القطع من خلال المحادثة، ويحفظ سجل المحادثة.';

const caps = (t: string) => requestedCapabilities(t).map(c => c.id);

describe('an Arabic keyword is a word', () => {
    const cart = /سلة/u;
    test.each([
        ['مغسلة ملابس', false],
        ['أضف إلى السلة', true],
        ['والسلة فارغة', true],
        ['بالسلة', true],
        ['سلة مشتريات', true],
        ['لـسلة المشتريات', true],
    ])('«سلة» in «%s»: %s', (text, word) => {
        expect(asksAsWords(cart, text)).toBe(word);
    });

    test('the glued little words and the endings are kept: «سيبحث», «إحصائيات», «حجوزاتهم», «لـمتجر»', () => {
        expect(asksAsWords(/بحث/u, 'المستخدم سيبحث عن موعد')).toBe(true);
        expect(asksAsWords(/إحصائ/u, 'صفحة إحصائيات')).toBe(true);
        expect(asksAsWords(/حجوز/u, 'يرى حجوزاتهم')).toBe(true);
        expect(asksAsWords(/متجر/u, 'صفحة لـمتجر ورد')).toBe(true);
        expect(asksAsWords(/بحث/u, 'مبحثرة')).toBe(false);
    });

    test('every match is tried: a laundry that also sells has its cart', () => {
        const m = wordMatch(/سلة/u, 'مغسلة ملابس مع سلة مشتريات');
        expect(m?.index).toBe('مغسلة ملابس مع '.length);
    });

    test('a Latin match keeps its own boundaries, and a folded pattern is walked too', () => {
        expect(standsAsWords('a cart here', 2, 6)).toBe(true);
        const folded = new FoldedRegExp('قائمة', 'u');
        expect(wordMatch(folded, 'مغسلة وقايمة الأسعار')?.index).toBe('مغسلة و'.length);
        expect(wordMatch(new FoldedRegExp('سلة', 'u'), 'مغسلة')).toBeNull();
    });
});

describe('the four laundry prompts', () => {
    test('none is a shop', () => {
        for (const t of [P172, P272, P372, P472]) expect(detectPageKind(t)).not.toBe('store');
    });

    test('orders only where he asked for them', () => {
        expect(caps(P272)).not.toContain('orders');
        expect(caps(P372)).toEqual(['filtering']);
        expect(caps(P472)).not.toContain('orders');
        expect(caps(P172)).toContain('orders');
    });

    test('a real shop is still a shop, with its orders', () => {
        expect(detectPageKind('ابني متجر إلكتروني للعطور مع سلة مشتريات')).toBe('store');
        expect(caps('ابني متجر إلكتروني للعطور مع سلة مشتريات والدفع عند الاستلام')).toEqual(expect.arrayContaining(['catalog', 'orders']));
        expect(caps('Build a store with a cart and checkout')).toContain('orders');
    });
});
