/**
 * AN EDIT ADDS A COLUMN. IT DOES NOT REPLACE THE TABLE.
 *
 * Measured before the fix, on his own clinic table:
 *
 *     from his request  [اسم المريض · رقم تلفونه · وقت الموعد · نوع العلاج · المبلغ المدفوع]
 *     from the title    [الاسم · الهاتف · الخدمة · التاريخ · الوقت · الحالة]
 *
 * The edit path rebuilt the blueprint from the app's TITLE, so «ضيف عمود
 * الخصم» would have deleted every column he named and replaced them with a
 * stock set — an edit that destroys the thing it edits.
 *
 * Two repairs, and they only work together:
 *
 *   · the app records the words it was built from, and the edit re-derives
 *     his columns from those instead of from its own name;
 *   · the one column he asked for is added beside them, read from his
 *     sentence by the same grammar that lets «الحقول: …» declare a list — the
 *     ADD VERB introduces the noun, and the noun introduces the name.
 *
 * And it never guesses: a message with no column named changes nothing.
 */

import { columnEdit, applyColumnEdit, blueprintFor } from '../core/design/app-blueprints';

const CLINIC = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.';
const base = () => blueprintFor('booking' as never, CLINIC, true).fields;

describe('one column changes, the rest survive', () => {
    // POSITIVE — the exact follow-up he typed, and its English twin.
    it.each([
        ['ضيف عمود الخصم', 'الخصم', 'text'],
        ['أضف عمود تاريخ الزيارة', 'تاريخ الزيارة', 'date'],
        ['add a column called discount', 'discount', 'text'],
    ])('%s appends «%s» and keeps the other five', (message, name, type) => {
        const after = applyColumnEdit(base(), columnEdit(message), true);
        expect(after).toHaveLength(6);
        expect(after.slice(0, 5).map(f => f.label)).toEqual(base().map(f => f.label));
        expect(after[5].label).toBe(name);
        expect(after[5].type).toBe(type);
    });

    // POSITIVE — and a column he asks to drop is dropped, by his own words.
    it.each([
        ['شيل عمود نوع العلاج', 'نوع العلاج'],
        ['remove the field رقم تلفونه', 'رقم تلفونه'],
    ])('%s removes «%s» and keeps the rest', (message, name) => {
        const after = applyColumnEdit(base(), columnEdit(message), true);
        expect(after).toHaveLength(4);
        expect(after.map(f => f.label)).not.toContain(name);
    });

    // NEGATIVE — a message about anything else leaves the schema untouched.
    it.each([
        ['لون', 'غيّر لون الخلفية إلى غامق'],
        ['عنوان', 'كبّر العنوان'],
        ['English style', 'make the buttons rounder'],
    ])('%s changes no column', (_label, message) => {
        const e = columnEdit(message);
        expect(e.add).toEqual([]);
        expect(e.remove).toEqual([]);
        expect(applyColumnEdit(base(), e, true).map(f => f.label)).toEqual(base().map(f => f.label));
    });

    // NEGATIVE — «add a column» with no name invents nothing.
    it('an unnamed column is not invented', () => {
        expect(columnEdit('ضيف عمود').add).toEqual([]);
        expect(columnEdit('add a column').add).toEqual([]);
    });

    // NEGATIVE — and an edit can never empty the table.
    it('removing everything leaves the table as it was', () => {
        const all = base().map(f => f.label);
        let fields = base();
        for (const label of all) fields = applyColumnEdit(fields, { add: [], remove: [label] }, true);
        expect(fields.length).toBeGreaterThan(0);
    });
});
