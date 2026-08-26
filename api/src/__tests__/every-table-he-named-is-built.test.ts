/**
 * HE NAMED TWO TABLES. JOE READ BOTH, BUILT ONE, AND SAID SO.
 *
 * From a shop request:
 *
 *     «جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة.
 *      وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي»
 *
 *     derivedTables →  المنتجات (4 columns) · الطلبات (5 columns)
 *     blueprint     →  اسم الصنف | السعر | الحالة | صورة   — and nothing else
 *
 * The delivery told him plainly: «بنيتُ «المنتجات» فقط — ولم أبنِ: «الطلبات»».
 * So this was never a lie. It was a capability that did not exist, declared
 * where he could see it — which is the behaviour this project exists to
 * produce, and exactly why it was safe to leave until now.
 *
 * It exists now, and it cost almost nothing because the pieces were already
 * here: every table he names gets its own page, and the records screen is
 * handed a content object carrying THAT table's fields and its own store key.
 * The screen itself did not change by one line.
 *
 * The store key is the part that matters for his data. Two tables sharing one
 * key would put the orders he types into the products list — a silent
 * corruption far worse than the honest refusal it replaces.
 */

import { fileAppContentJs, fileAppShellJsx } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor, derivedTables } from '../core/design/app-blueprints';

const SHOP = 'اعمل لي متجراً اسمه «حلويات أم عمر» فيه صفحة المنتجات وصفحة الطلبات. جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة. وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي.';
const ONE_TABLE = 'اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر';

const contentFor = (request: string) => fileAppContentJs(
    blueprintFor('generic' as any, request, true) as any,
    { brand: 'حلويات أم عمر', isArabic: true, storeKey: 'shop', sourceRequest: request } as any,
);

describe('every table he named reaches the app', () => {
    it('the reader finds both — the baseline this rests on', () => {
        const t = derivedTables(SHOP);
        expect(t.map(x => x.subject)).toEqual(['المنتجات', 'الطلبات']);
        expect(t.map(x => x.columns.length)).toEqual([4, 5]);
    });

    it('and content.js carries both, with his columns in each', () => {
        const c = contentFor(SHOP);
        expect(c).toContain("title: 'المنتجات'");
        expect(c).toContain("title: 'الطلبات'");
        expect(c).toContain("label: 'اسم الزبون'");
        expect(c).toContain("label: 'رقم الهاتف'");
        expect(c).toContain("label: 'الإجمالي'");
    });

    it('each table has its own store key, so his orders are not filed as products', () => {
        //  The assertion that protects his data rather than his criteria. One
        //  shared key is a silent corruption, and silent corruption is worse
        //  than the honest refusal this replaces.
        const c = contentFor(SHOP);
        const keys = [...c.matchAll(/storeKey: '([^']+)'/g)].map(m => m[1]);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.length).toBeGreaterThanOrEqual(3);
    });

    it('a request naming one table carries no table list at all', () => {
        //  The negative case: a single-table app must not grow a page switcher
        //  and a nested structure it has no use for.
        expect(contentFor(ONE_TABLE)).toMatch(/tables: \[\s*\]/);
    });

    it('and the shell renders the page’s own table', () => {
        const shell = fileAppShellJsx(blueprintFor('generic' as any, SHOP, true) as any, true);
        expect(shell).toContain('TABLE_FOR');
        expect(shell).toContain('content.tables');
        //  Handed THIS table's fields and key — not the blueprint's.
        expect(shell).toContain('fields: TABLE_FOR(page).fields');
        expect(shell).toContain('storeKey: TABLE_FOR(page).storeKey');
    });
});
