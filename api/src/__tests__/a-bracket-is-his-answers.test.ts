/**
 * «الحالة (متوفر أو نافد)» LOST THE COLUMN, AND «صورة» WITH IT.
 *
 * From a shop he asked for, typed the way a shopkeeper writes:
 *
 *     «جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة»
 *     → ["اسم الصنف", "السعر"]
 *
 * Two of four. Bisected one word at a time, which is what made it findable:
 *
 *     «الحالة (متوفر)»          → kept
 *     «الحالة (متوفر/نافد)»     → kept
 *     «الحالة (متوفر أو نافد)»  → LOST, and everything after it
 *     «وصورة»                   → lost on its own
 *     «والصورة»                 → kept
 *
 * Two separate faults with one shape between them: A GUARD MEASURING THE
 * WRONG THING.
 *
 *   1. A name is capped at three Arabic words. «الحالة (متوفر أو نافد)»
 *      counts as four — because the CAP COUNTED HIS ANSWERS AS PART OF THE
 *      NAME. He was not listing four things; he named a column and said in
 *      the same breath what its answers are, which is how anyone describes a
 *      status field. And because the list stops at the first item that does
 *      not read as a column, «صورة» behind it was truncated away too: one
 *      bracket cost two columns.
 *
 *   2. The definiteness test refuses «صورة» and accepts «الصورة». It is a
 *      good guard — it stops prose becoming a schema — and it already
 *      carried one exception, for a yes-or-no column that is indefinite by
 *      nature. This is the second, and narrow: ONE word, and only after two
 *      columns are already confirmed. A bare noun standing third in a run of
 *      named columns is not prose; it is the item he did not bother to
 *      define.
 *
 * The bracket now becomes what he meant by it — the column's OPTIONS — so
 * «الحالة» is a select offering «متوفر» and «نافد», not a text box he retypes
 * into every row.
 */

import { derivedColumns } from '../core/design/app-blueprints';

const cols = (r: string) => (derivedColumns(r) || []).map((c: any) => c.label);
const field = (r: string, label: string) => (derivedColumns(r) || []).find((c: any) => c.label === label) as any;

const HIS = 'جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة';

describe('a bracket after a column names its answers', () => {
    it('his four columns are four', () => {
        expect(cols(HIS)).toEqual(['اسم الصنف', 'السعر', 'الحالة', 'صورة']);
    });

    it('and the bracket becomes the column’s options, not part of its name', () => {
        const f = field(HIS, 'الحالة');
        expect(f).toBeDefined();
        expect(f.options).toEqual(['متوفر', 'نافد']);
        expect(f.type).toBe('select');
    });

    it.each([
        ['أو', 'جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد)'],
        ['او', 'جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر او نافد)'],
        ['slash', 'جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر/نافد)'],
        ['comma', 'جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر، نافد)'],
    ])('the separator inside it does not matter: %s', (_n, request) => {
        expect(cols(request)).toContain('الحالة');
    });

    it('and the English side of this is a STATED limit, not a claim', () => {
        //  «the status (in stock or sold out)» comes back without the status
        //  column. The bracket reader above is written for the Arabic list
        //  and the English path has its own definiteness rules, which this
        //  change did not touch. Declaring the limit is the point: an
        //  untested claim of English support would be the fake capability
        //  this project keeps deleting. The assertion locks the CURRENT
        //  behaviour so the day someone fixes it, this line tells them.
        expect(cols('a products table with the item name, the price and the status (in stock or sold out)'))
            .not.toContain('the status');
    });

    it('a single value in brackets is a note, not a list of options', () => {
        //  One answer is not a choice. Turning «(متوفر)» into a select with a
        //  single option would be inventing a constraint he did not state.
        const f = field('جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر)', 'الحالة');
        expect(f?.options).toBeUndefined();
    });
});

describe('a bare noun among named columns is a column', () => {
    it('«وصورة» is kept, and «والصورة» still is', () => {
        expect(cols('جدول المنتجات فيه اسم الصنف والسعر وصورة')).toContain('صورة');
        expect(cols('جدول المنتجات فيه اسم الصنف والسعر والصورة')).toContain('الصورة');
    });

    it('but prose is still refused', () => {
        //  The negative half, and the reason the exception is narrow. If this
        //  breaks, the guard has been widened into the defect it prevents.
        expect(derivedColumns('اعمل صفحة فيها: الاسم والسعر')).toBeNull();
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
        expect(derivedColumns('الكتاب فيه الورق والحبر')).toBeNull();
    });

    it('and a bare noun at the HEAD of a list still has to prove itself', () => {
        //  The exception requires two confirmed columns in front of it, so a
        //  run that opens with an undefined word is not a schema.
        expect(cols('جدول المنتجات فيه صورة والسعر واسم الصنف')).not.toContain('صورة');
    });
});
