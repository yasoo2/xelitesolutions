/**
 * HE NAMED NINE COLUMNS ACROSS TWO TABLES AND WAS HANDED A MARKETING SITE.
 *
 * Built on his machine from the shop request. What reached disk, read from
 * the generated content.js:
 *
 *     heroTitle · heroLede · features · perks · galleryTitle · storyTitle
 *     storyBody · storyImage · stepsTitle · compareTitle · ctaBandTitle
 *
 * A brochure. For a request that named «جدول المنتجات فيه اسم الصنف والسعر
 * والحالة (متوفر أو نافد) وصورة» and «جدول الطلبات فيه اسم الزبون ورقم الهاتف
 * والصنف والكمية والإجمالي». Nine columns, two tables, and not one of them on
 * the page.
 *
 * Measured cause, in one line:
 *
 *     detectAppKind(shop)  → null
 *     derivedTables(shop)  → 2 tables
 *     columnsAnywhere(shop)→ 4 columns
 *
 * With no app kind, the builder falls through to the site path — which is the
 * SCAFFOLD-FALLBACK-UNGUARDED debt named in CLAUDE.md, reached from a
 * direction nobody had written down: not a failure to understand the request,
 * but ONE READER ANSWERING A QUESTION ANOTHER READER HAD ALREADY ANSWERED
 * BETTER. The line that decides «this is an application» asked the
 * single-shot column reader, which loses to the earlier list in «فيه صفحة
 * المنتجات وصفحة الطلبات» — the same defect fixed in five other call sites
 * tonight, and this was the sixth.
 *
 * The fourth law decides it: a man who writes out his columns has described
 * an application, whatever nouns the rest of his sentence happens to contain.
 */

import { detectAppKind } from '../core/design/app-blueprints';

const SHOP = 'اعمل لي متجراً اسمه «حلويات أم عمر» فيه صفحة المنتجات وصفحة الطلبات. جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة. وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي.';

describe('a request that names columns is an application', () => {
    it('his shop is an app, not a brochure', () => {
        expect(detectAppKind(SHOP)).toBe('generic');
    });

    it('and so is a table whose columns arrive two sentences late', () => {
        expect(detectAppKind('ابنِ لي نظاماً فيه ثلاث صفحات: المخزون والموردين والتقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة والكمية وسعر الشراء.'))
            .toBe('generic');
    });
});

describe('and a request that names none is still what it was', () => {
    it('a site with pages and no columns stays a site', () => {
        //  The negative case that matters most: widening this line until
        //  every request becomes an app would replace a brochure defect with
        //  an application defect, and he would get a data table where he
        //  asked for a restaurant page.
        expect(detectAppKind('اعمل لي موقعاً جميلاً لمطعمي فيه صفحة من نحن وصفحة تواصل')).toBeNull();
    });

    it('and a recognised archetype keeps its own engine', () => {
        //  A weather app must not become «generic» because this line now
        //  reads more requests. It runs after the archetypes that carry a
        //  real contract, and this proves the order held.
        expect(detectAppKind('اعمل تطبيق طقس يعرض توقعات سبعة أيام مع بحث عن المدن')).toBe('weather');
    });
});
