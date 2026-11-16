/**
 * A PAGE FOR A PLATFORM ASKS NOTHING, IN ARABIC TOO (review 3 of r40, 11).
 *
 * «a landing page for a discount platform» asks nothing: the platform is the
 * business the page presents, and its kind is its trade. «صفحة هبوط لمنصة خصومات»
 * kept «خصومات» and asked for coupons, so a landing page without a coupon system
 * was held. The Arabic rule is now the English one: a platform's kind is asked only
 * when the request builds the platform. No model is called.
 */
import { requestedCapabilities } from '../core/quality/scope-audit';

const asked = (t: string) => requestedCapabilities(t).map(c => c.id);

describe('a platform a page only presents is the business', () => {
    it.each([
        'صفحة هبوط لمنصة خصومات',
        'صفحة هبوط احترافية لمنصة خصومات',
        'موقع تعريفي لمنصة خصومات',
        'موقع لمنصة تحليلات',
        'a landing page for a discount platform',
    ])('%s asks nothing', t => {
        expect(asked(t)).toEqual([]);
    });

    it('a request that builds the platform still asks its kind, in both languages', () => {
        expect(asked('ابني نظام حجوزات لمنصة خصومات')).toContain('coupons');
        expect(asked('اعمل تطبيق لمنصة تحليلات')).toContain('analytics');
        expect(asked('لوحة تحكم لمنصة تحليلات')).toContain('analytics');
        expect(asked('Build a REST API for a loyalty rewards platform')).toContain('loyalty');
    });

    it('how the site itself is built is kept on a presented platform too', () => {
        expect(asked('صفحة هبوط لمنصة متعددة البائعين')).toContain('multi_vendor');
    });
});
