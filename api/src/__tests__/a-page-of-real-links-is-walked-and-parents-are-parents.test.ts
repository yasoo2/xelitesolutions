import { inAppRoutes } from '../core/quality/app-audit';
import { namedEntities } from '../core/design/named-entities';

/**
 * The 500 exam, 2026-11-06, two complete kindergarten builds refused by Joe's
 * own checks four times each:
 *
 *  P071 — an admin dashboard that moves between /children, /parents and
 *  /activities (real addresses its server answers). The browser walk visited
 *  «#/x» routes and «x.html» files only, the control probe counts «#» links
 *  only, and the page was judged «Not one button, link or form».
 *
 *  P121 — «… نقاط وصول لـالأطفال وأولياء الأمور والأنشطة …»: «أولياء الأمور»
 *  was keyed from its letters (`awlya_amwrs`), so /api/parents never matched
 *  it and the coverage gate said «not measured».
 */
describe('a page of real links is walked', () => {
    const P071 = ['/summary', '/children', '/parents', '/activities', '/children', '/parents', '/activities']
        .map(href => ({ href, abs: `http://127.0.0.1:4303${href}` }));

    it('same-origin page addresses are routes (P071)', () => {
        expect(inAppRoutes(P071, 'http://127.0.0.1:4303/')).toEqual(['/summary', '/children', '/parents', '/activities']);
    });

    it('relative addresses and query strings are pages too; the page itself is not', () => {
        const links = [
            { href: 'reports?month=3', abs: 'http://h:1/app/reports?month=3' },
            { href: '/app/', abs: 'http://h:1/app/' },
            { href: 'settings/', abs: 'http://h:1/app/settings/' },
        ];
        expect(inAppRoutes(links, 'http://h:1/app/')).toEqual(['/app/reports?month=3', '/app/settings']);
    });

    it('what the walk already knew stays as it was', () => {
        const links = [{ href: '#/cart', abs: 'http://h:1/#/cart' }, { href: 'about.html', abs: 'http://h:1/about.html' }, { href: '/contact.html', abs: 'http://h:1/contact.html' }];
        expect(inAppRoutes(links, 'http://h:1/')).toEqual(['#/cart', 'about.html', 'contact.html']);
    });

    it('not routes: home, in-page anchors, the API, files, downloads, sign-out, other sites, mail', () => {
        const links = [
            { href: '/', abs: 'http://h:1/' },
            { href: '/index.html', abs: 'http://h:1/index.html' },
            { href: '#contact', abs: 'http://h:1/#contact' },
            { href: '/api/children', abs: 'http://h:1/api/children' },
            { href: '/export.csv', abs: 'http://h:1/export.csv' },
            { href: '/report', abs: 'http://h:1/report', download: true },
            { href: '/logout', abs: 'http://h:1/logout' },
            { href: '/auth/sign-out', abs: 'http://h:1/auth/sign-out' },
            { href: 'https://example.com/x', abs: 'https://example.com/x' },
            { href: 'mailto:a@b.c', abs: 'mailto:a@b.c' },
            { href: 'javascript:void(0)', abs: 'javascript:void(0)' },
        ];
        expect(inAppRoutes(links, 'http://h:1/')).toEqual([]);
    });

    it('bounded: at most twenty', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ href: `/p${i}`, abs: `http://h:1/p${i}` }));
        expect(inAppRoutes(many, 'http://h:1/')).toHaveLength(20);
    });
});

describe('«أولياء الأمور» are the parents', () => {
    it('P121: the request lists children, parents and activities', () => {
        const keys = namedEntities('أنشئ واجهة برمجية REST باستخدام Node.js و Express لـروضة أطفال فيها نقاط وصول لـالأطفال وأولياء الأمور والأنشطة، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.')
            .map(e => e.key);
        expect(keys).toContain('parents');
        expect(keys).not.toContain('awlya_amwrs');
        expect(keys).toContain('children');
    });

    it('in its other spellings', () => {
        for (const text of ['نظام لمدرسة فيه نقاط وصول لـالطلاب وأولياء الأمور والمعلمين', 'تطبيق لروضة فيه نقاط وصول لـالأطفال والأهالي والأنشطة',
            'ابني لوحة تحكم لإدارة روضة أطفال: إضافة وتعديل وحذف الأطفال وأولياء الأمور والأنشطة']) {
            expect(namedEntities(text).map(e => e.key)).toContain('parents');
        }
    });

    it('"parents" and "guardians" in English', () => {
        expect(namedEntities('An API for a kindergarten with endpoints for children, parents and activities').map(e => e.key)).toContain('parents');
    });
});
