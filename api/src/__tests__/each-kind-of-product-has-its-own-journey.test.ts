/**
 * ⛔ EACH KIND OF PRODUCT HAS ITS OWN JOURNEY (qa-product-profile.ts).
 *
 * The owner, 2026-11-10: «اختبار الجودة للمتجر غير اختبار الجودة لصفحة واجهة شركة …
 * لكل واحد فيهم اختبار جودة مختص فيه». Pinned: what was built is read from the
 * request; only the journeys its words named are asked for; each is proven or
 * not on what the walk measured; and the coverage sentence says each with ✓
 * or ✗.
 */
import { productProfile, proveJourneys } from '../core/quality/qa-product-profile';
import { qaCoverageLine, qaCoverageOf } from '../core/engine/certificate';

const ids = (r: string) => productProfile(r).journeys.map(j => j.id);

test('what was built, and only the journeys its request named', () => {
    expect(productProfile('ابني متجر إلكتروني لبيع العطور مع سلة ودفع').kind).toBe('store');
    expect(ids('ابني متجر إلكتروني لبيع العطور مع سلة ودفع')).toEqual(['cart', 'checkout']);
    expect(productProfile('ابني نظام حجز مواعيد لعيادة أسنان').kind).toBe('booking');
    expect(ids('ابني نظام حجز مواعيد لعيادة أسنان')).toEqual(['booking']);
    expect(productProfile('Build a social network like Facebook with posts, likes and comments').kind).toBe('social');
    expect(ids('Build a social network like Facebook with posts, likes and comments')).toEqual(['post', 'like']);
    expect(ids('Build a real-time chat app with rooms')).toEqual(['message']);
    expect(ids('ابني لوحة تحكم لإدارة متجر عطور: إضافة وتعديل وحذف وبحث في العطور')).toContain('manage');
    //  A shop page nobody asked a cart of is not asked for one.
    expect(ids('Build a professional landing website for an electronics store with a hero section and a contact form')).toEqual([]);
});

test('each journey is proven, or not, on what the walk measured', () => {
    const store = productProfile('an online store with a cart and checkout');
    const proven = proveJourneys(store, {
        intentsMetBy: { add_to_cart: 2 },
        forms: [{ label: 'Place order', effect: 'submitted' }],
    });
    expect(proven.map(j => [j.id, j.proven])).toEqual([['cart', true], ['checkout', true]]);
    const broken = proveJourneys(store, {
        intentsMetBy: {}, intentFailures: [{ intent: 'add_to_cart' }],
        forms: [{ label: 'Newsletter', effect: 'submitted' }],
    });
    expect(broken.map(j => [j.id, j.proven])).toEqual([['cart', false], ['checkout', false]]);
    expect(broken[0].why).toMatch(/did not count/);
    expect(broken[1].why).toMatch(/no such form/);
    const booking = proveJourneys(productProfile('a clinic appointment booking system'), {
        forms: [{ label: 'Book appointment', effect: 'submitted' }],
    });
    expect(booking[0].proven).toBe(false);
    expect(booking[0].why).toMatch(/not found after a reload/);
    expect(proveJourneys(productProfile('a clinic appointment booking system'), {
        forms: [{ label: 'Book appointment', effect: 'submitted', persisted: true }],
    })[0].proven).toBe(true);
});

test('the coverage sentence says what was built and each journey with ✓ or ✗', () => {
    const line = qaCoverageLine(qaCoverageOf({
        routes: ['/', '#/cart'], pressed: 20, intentsMet: 3,
        product: { kind: 'store', ar: 'متجر', en: 'a store' },
        journeys: [{ id: 'cart', ar: 'الإضافة إلى السلة', en: 'adding to the cart', proven: true, why: '' }, { id: 'checkout', ar: 'إتمام الطلب والدفع', en: 'checking out', proven: false, why: '' }],
    }), 'ar');
    //  Counted as Arabic counts (certificate.ts arabicCount): «3 أزرار», not «3 زراً».
    expect(line).toContain('وتأكّد أن كلاً من 3 أزرار أدّى عمله بالضبط');
    expect(line).toContain('ورحلات متجر: ✓ الإضافة إلى السلة، ✗ إتمام الطلب والدفع.');
});
