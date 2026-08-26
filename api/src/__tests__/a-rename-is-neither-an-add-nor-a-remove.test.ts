/**
 *  A RENAME IS NEITHER AN ADD NOR A REMOVE.
 *
 *  His own follow-up, measured:
 *
 *      columnEdit(«غيّر اسم عمود المبلغ إلى القيمة») → { add: [], remove: [] }
 *
 *  Nothing. The reader knew two verbs and his was a third, so a rename
 *  after a build did nothing and said nothing about it — the worst pair
 *  there is.
 *
 *  A rename is not «remove that column and add this one»: the data under
 *  that key is his, and dropping the column drops the rows' values with
 *  it. The key and the type stay; the label he reads changes.
 *
 *  AND A COLUMN NAME THAT SWALLOWED THE ORDER THAT ASKED FOR IT.
 *
 *  From Joe's own log, in the same live round:
 *
 *      column edit: +[الملاحظات زيد عمود الملاحظات] -[] → 4 column(s)
 *      { key: 'text4', label: 'الملاحظات زيد عمود الملاحظات', type: 'text' }
 *
 *  His message reached Joe clean — 18 characters, read straight out of
 *  the chat store. Somewhere between that message and this reader the
 *  text arrived twice on one line, and the capture ran through the seam.
 *
 *  WHERE IT DOUBLES IS NOT YET FOUND, and this does not pretend to fix
 *  that. It fixes what is true whatever the cause: a column he named
 *  never contains the words of the order that asked for it.
 */
import { columnEdit, applyColumnEdit, blueprintFor, detectAppKind } from '../core/design/app-blueprints';

describe('a rename is read, in either language', () => {
    const RENAMES: Array<[string, string, string]> = [
        ['غيّر اسم عمود المبلغ إلى القيمة', 'المبلغ', 'القيمة'],
        ['غيّر عمود المبلغ إلى القيمة', 'المبلغ', 'القيمة'],
        ['بدّل اسم عمود التاريخ الى تاريخ الإصدار', 'التاريخ', 'تاريخ الإصدار'],
        ['rename the amount column to value', 'amount', 'value'],
    ];
    for (const [request, from, to] of RENAMES) {
        it(request.slice(0, 42), () => expect(columnEdit(request).rename).toEqual({ from, to }));
    }

    it('a word this repository has never seen renames the same way', () => {
        expect(columnEdit('غيّر اسم عمود المبلغ إلى الزُرقمونية').rename)
            .toEqual({ from: 'المبلغ', to: 'الزُرقمونية' });
    });

    it('the column keeps its key and its type — the rows under it are his', () => {
        const bp = blueprintFor(detectAppKind('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ') as never,
            'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ', true);
        const before = bp.fields.map(f => `${f.label}:${f.key}`);
        expect(before).toEqual(['رقم الفاتورة:text1', 'المبلغ:money1', 'التاريخ:date1']);
        const after = applyColumnEdit(bp.fields, columnEdit('غيّر اسم عمود المبلغ إلى القيمة'), true);
        expect(after.map(f => `${f.label}:${f.key}`)).toEqual(['رقم الفاتورة:text1', 'القيمة:money1', 'التاريخ:date1']);
    });
});

describe('…and a rename is not an add, nor an add a rename', () => {
    it('an add carries no rename', () => {
        const e = columnEdit('زيد عمود الملاحظات');
        expect(e.add).toEqual(['الملاحظات']);
        expect(e.rename).toBeUndefined();
    });

    it('a remove carries no rename', () => {
        const e = columnEdit('احذف عمود التاريخ');
        expect(e.remove).toEqual(['التاريخ']);
        expect(e.rename).toBeUndefined();
    });

    it('renaming the SITE is not renaming a column', () => {
        expect(columnEdit('غيّر اسم الموقع إلى زرقمونيات').rename).toBeUndefined();
    });

    it('a colour is not a column', () => {
        expect(columnEdit('غيّر لون الخلفية')).toEqual({ add: [], remove: [] });
    });

    it('a rename to the same name is no rename', () => {
        expect(columnEdit('غيّر اسم عمود المبلغ إلى المبلغ').rename).toBeUndefined();
    });
});

describe('the name ends before the order resumes', () => {
    it('the doubled request from the live round', () => {
        expect(columnEdit('زيد عمود الملاحظات زيد عمود الملاحظات').add).toEqual(['الملاحظات']);
        expect(columnEdit('احذف عمود التاريخ احذف عمود التاريخ').remove).toEqual(['التاريخ']);
    });

    it('and a two-word name he really wrote survives whole', () => {
        //  The cut must stop at the ORDER's words, not at any second word.
        expect(columnEdit('زيد عمود تاريخ الميلاد').add).toEqual(['تاريخ الميلاد']);
        expect(columnEdit('زيد عمود سعر البيع').add).toEqual(['سعر البيع']);
        expect(columnEdit('ضيف عمود تاريخ الاستحقاق').add).toEqual(['تاريخ الاستحقاق']);
    });
});
