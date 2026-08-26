/**
 * THE PHONE COLUMN SHIPPED WITH NO RULE, IN A BUILD THAT CARRIED THE INPUT FOR IT.
 *
 * Measured in the shop built on his machine. Two sentences, one apart:
 *
 *     «وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي.»
 *     «لا تقبل رقم هاتف أقل من ٩ أرقام.»
 *
 *     content.js            →  { label: 'رقم الهاتف', type: 'tel' }   and nothing else
 *     RecordsApp.jsx        →  minLength={f.minLength …}              already shipped
 *
 * The application carried the input that would have enforced his rule, and the
 * schema carried no value for it to read. Exactly the shape of the very first
 * defect this project measured — the guard shipped, the number missing — and
 * arrived at from a new direction.
 *
 * `derivedTables` finds each table by walking the request sentence by
 * sentence, and `derivedColumns(piece)` ends by applying the rules of THAT
 * PIECE. So a table found in one sentence is judged against one sentence's
 * worth of conditions, and every rule he stated elsewhere is dropped without a
 * word.
 *
 * This is the THIRD site of one class tonight — a decision taken from a
 * fragment when the authority is the whole request — after his columns losing
 * to an earlier list and his rules living in other sentences. Same fix, same
 * reason, and the count is the point: a class is not closed by fixing the
 * first instance of it.
 */

import { derivedTables, blueprintFor } from '../core/design/app-blueprints';
import { fileAppContentJs } from '../modules/tools/definitions/react-app-templates';

const SHOP = 'اعمل لي متجراً فيه صفحة المنتجات وصفحة الطلبات. جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد). وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية. لا تقبل رقم هاتف أقل من ٩ أرقام. ولا تقبل كمية بالسالب.';

const col = (subject: string, label: string) => {
    const t = derivedTables(SHOP).find(x => x.subject === subject);
    return (t?.columns || []).find((c: any) => c.label === label) as any;
};

describe('a rule reaches the table it is about, whichever sentence it is in', () => {
    it('both tables are still read — an empty baseline proves nothing', () => {
        expect(derivedTables(SHOP).map(t => t.subject)).toEqual(['المنتجات', 'الطلبات']);
    });

    it('«لا تقبل رقم هاتف أقل من ٩ أرقام» reaches «رقم الهاتف» in the second table', () => {
        const phone = col('الطلبات', 'رقم الهاتف');
        expect(phone).toBeDefined();
        expect(phone.minLength).toBe(9);
    });

    it('and «لا تقبل كمية بالسالب» reaches «الكمية» in that same table', () => {
        //  Two rules, two sentences, two different columns of one table. A fix
        //  that carried only the rule we happened to be chasing would pass a
        //  single assertion and still be wrong.
        expect(col('الطلبات', 'الكمية')?.min).toBe(0);
    });

    it('and neither rule lands on the products table', () => {
        //  The negative half: applying the whole request's rules to every
        //  table must not scatter a rule across tables it was never about.
        expect(col('المنتجات', 'السعر')?.min).toBeUndefined();
        expect(col('المنتجات', 'اسم الصنف')?.minLength).toBeUndefined();
    });

    it('a request with no rules leaves every column bare', () => {
        const plain = derivedTables('جدول المنتجات فيه اسم الصنف والسعر. وجدول الطلبات فيه اسم الزبون والكمية.');
        expect(plain).toHaveLength(2);
        for (const t of plain) {
            for (const c of t.columns as any[]) {
                expect(c.min).toBeUndefined();
                expect(c.minLength).toBeUndefined();
            }
        }
    });
});

describe('and the rule survives all the way into the file on his disk', () => {
    //  The chain has two emitters — `fields` and `tables` — written months
    //  apart with different expressions for the same field. The first learned
    //  minLength and the second did not, so «رقم الهاتف» came out bare while
    //  every reader upstream had it right. Measured, after the readers were
    //  fixed and before this was: `HAS_minLength: false`.
    //
    //  A guard that stops at the reader tests the reader. This one reads what
    //  is written to his machine.
    const content = () => fileAppContentJs(
        blueprintFor('generic' as any, SHOP, true) as any,
        { brand: 'حلويات أم عمر', isArabic: true, storeKey: 'shop', sourceRequest: SHOP } as any,
    );

    it('content.js carries the phone length and the quantity floor', () => {
        const c = content();
        expect(c).toMatch(/label: 'رقم الهاتف'[^}]*minLength: 9/);
        expect(c).toMatch(/label: 'الكمية'[^}]*min: 0/);
    });

    it('and puts neither on a column he said nothing about', () => {
        const c = content();
        expect(c).not.toMatch(/label: 'اسم الزبون'[^}]*min/);
        expect(c).not.toMatch(/label: 'السعر'[^}]*minLength/);
    });
});
