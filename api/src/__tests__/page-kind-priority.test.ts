/**
 * THE SUBJECT OF THE REQUEST, NOT A BULLET INSIDE IT.
 *
 * He asked why a Shopify-like build produced nothing that resembles a shop,
 * and the answer was not the pipeline. It was one line of detection:
 *
 *   "Build a world-class e-commerce platform similar to Shopify.
 *    Features: … Analytics …"      →  detectPageKind = 'dashboard'
 *
 * `dashboard` was first in a first-match-wins list, «Analytics» was bullet
 * nine, and «e-commerce» was in the opening sentence. The store blueprint —
 * product grid, working cart, checkout, all of it built and tested months ago
 * — could never fire for an e-commerce request, because every serious
 * e-commerce brief asks for analytics.
 */
import { detectPageKind } from '../core/design/blueprints';

const HIS_REQUEST = `Build a world-class e-commerce platform similar to Shopify.

Features:
- Multi-vendor marketplace
- AI product generation
- Inventory management
- Payments
- Shipping
- Coupons
- Loyalty program
- Mobile app
- Analytics
- Customer support
- Marketing automation
- SEO
- Multi-language
- Multi-currency

Generate complete production-ready code.`;

describe('the page kind follows what the request is ABOUT', () => {
    it('his e-commerce platform is a store, analytics bullet and all', () => {
        expect(detectPageKind(HIS_REQUEST)).toBe('store');
    });

    it('and a dashboard FOR a store is still a dashboard', () => {
        // the subject leads the sentence in both cases; position decides
        expect(detectPageKind('لوحة تحكم لمتجري الإلكتروني')).toBe('dashboard');
        expect(detectPageKind('admin panel for my shop')).toBe('dashboard');
    });

    it('a store that also wants analytics is a store', () => {
        expect(detectPageKind('متجر إلكتروني مع تحليلات المبيعات')).toBe('store');
        expect(detectPageKind('an online shop with sales analytics')).toBe('store');
    });

    it('the kinds that were never ambiguous still work', () => {
        expect(detectPageKind('مطعم إيطالي مع قائمة طعام')).toBe('restaurant');
        expect(detectPageKind('معرض أعمال لمصور')).toBe('portfolio');
        expect(detectPageKind('مدونة مقالات تقنية')).toBe('blog');
        expect(detectPageKind('لوحة تحكم بالإحصائيات')).toBe('dashboard');
        expect(detectPageKind('صفحة هبوط لشركة خدمات')).toBe('landing');
        expect(detectPageKind('Create a four-page science museum website')).toBe('museum');
        expect(detectPageKind('Build a cultural institution site with exhibitions and visitor hours')).toBe('museum');
    });

    it('and something with no signal at all is still generic', () => {
        expect(detectPageKind('اكتب لي شيئاً جميلاً')).toBe('generic');
    });

    it('does not turn a content catalogue into an online shop', () => {
        expect(detectPageKind('Build a public website for a community seed library with a seasonal catalog')).not.toBe('store');
        expect(detectPageKind('Create a museum website with an exhibit catalogue and visitor hours')).not.toBe('store');
        expect(detectPageKind('Create a museum website with an exhibit catalogue and visitor hours')).toBe('museum');
    });
});
