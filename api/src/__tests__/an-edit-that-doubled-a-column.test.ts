/**
 *  AN EDIT THAT DOUBLED A COLUMN HE ALREADY HAD.
 *
 *  A live round on his machine: build, then «زيد عمود الملاحظات». The
 *  built file afterwards:
 *
 *      label: 'رقم الفاتورة'
 *      label: 'المبلغ'
 *      label: 'المبلغ'          ← twice
 *      label: 'التاريخ'
 *      label: 'الملاحظات …'
 *
 *  He asked for one new column and got a duplicated one for free. The
 *  cause is in the app's own record of the words it was built from:
 *
 *      sourceRequest: 'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ
 *        AUTHORITATIVE REQUIREMENTS EVIDENCE (…): بدي جدول للفواتير فيه
 *        رقم الفاتورة والمبلغ والتاريخ'
 *
 *  His sentence, Joe's paperwork, and his sentence AGAIN. The edit
 *  re-derives the blueprint from that record — correctly, it must, or an
 *  edit would replace his columns with a stock set — and reads his list
 *  twice.
 *
 *  The cut lives in derivedColumns, the reader every other reader goes
 *  through, rather than at the writer: the record is already on his disk
 *  in every app built so far, and a fix at the writer heals none of them.
 */
import { derivedColumns, hisSentence, blueprintFor, detectAppKind, columnEdit, applyColumnEdit } from '../core/design/app-blueprints';

const HIS = 'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ';
const RECORDED = HIS + '  AUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the complete '
    + 'local specification; do not invent beyond it): ' + HIS;

describe('a record that repeats his sentence does not repeat his columns', () => {
    it('the exact record from his disk', () => {
        expect((derivedColumns(RECORDED) || []).map(f => f.label))
            .toEqual(['رقم الفاتورة', 'المبلغ', 'التاريخ']);
    });

    it('his words alone read the same', () => {
        expect((derivedColumns(HIS) || []).map(f => f.label))
            .toEqual((derivedColumns(RECORDED) || []).map(f => f.label));
    });

    it('the edit adds one column, not one plus a duplicate', () => {
        const bp = blueprintFor(detectAppKind(RECORDED) as never, RECORDED, true);
        const after = applyColumnEdit(bp.fields, columnEdit('زيد عمود الملاحظات'), true);
        expect(after.map(f => f.label)).toEqual(['رقم الفاتورة', 'المبلغ', 'التاريخ', 'الملاحظات']);
    });

    it('a fence Joe draws is cut the same way', () => {
        const fenced = HIS + '\n--- COMPACT REQUIREMENTS EVIDENCE ---\n' + HIS;
        expect((derivedColumns(fenced) || []).map(f => f.label))
            .toEqual(['رقم الفاتورة', 'المبلغ', 'التاريخ']);
    });
});

describe('…and his own words are never cut', () => {
    it('a blank line alone is his paragraph, not Joe\u2019s mark', () => {
        const two = 'عندي عيادة أسنان.\n\nبدي جدول للمواعيد فيه اسم المريض ورقم تلفونه ووقت الموعد';
        expect((derivedColumns(two) || []).map(f => f.label))
            .toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد']);
    });

    it('a request with no mark of Joe\u2019s is returned untouched', () => {
        expect(hisSentence(HIS)).toBe(HIS);
        expect(hisSentence('A clients table with name, phone and address'))
            .toBe('A clients table with name, phone and address');
    });

    it('a brand in capitals is not a shouted heading', () => {
        //  «IBM» alone is a name a man may type. Three capitalised words in
        //  a row are a heading Joe wrote.
        expect(hisSentence('بدي جدول لعملاء IBM فيه الاسم والهاتف والعنوان'))
            .toBe('بدي جدول لعملاء IBM فيه الاسم والهاتف والعنوان');
    });
});
