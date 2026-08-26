/**
 * DELETE THE ROW YOU ARE EDITING, PRESS SAVE, AND THE FORM CLEARS AS IF IT WORKED.
 *
 * Found in the app Joe built from «اعمل جدول مبيعات فيه اسم الصنف والكمية
 * والسعر ولا تقبل سعرًا صفرًا». The sequence a person actually performs:
 *
 *     1. press «تعديل» on a row      → editing = that row's id, form filled
 *     2. delete that same row        → rows no longer contains it
 *     3. press «حفظ التعديل»         → rows.map matches nothing
 *                                      setEditing(''), setDraft(blank)
 *
 * Nothing is saved, nothing is said, and the form empties itself in exactly
 * the way it empties after a successful save. What he typed is gone and the
 * app has told him it worked.
 *
 * The class is the one this whole project is about: A SILENT NO-OP DRESSED AS
 * A SUCCESS. Joe refuses to claim a build it did not make; the apps it writes
 * must not claim a save they did not make.
 *
 * Two guards, because there are two ways in. Deleting the row ENDS the edit of
 * it — the edit has no subject any more. And a save whose row has vanished for
 * any other reason (another tab, a server delete) says so instead of clearing.
 *
 * A second defect from the same reading, fixed in the same file: the details
 * dialog's button said «تعديل المهمة» — «edit the task» — in a sales register,
 * one archetype's word frozen into a shell that derives every other label.
 */

import { fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';

const src = fileRecordsAppJsx(true);

describe('an edit whose row is gone is not silently discarded', () => {
    it('the template was really read — an empty scan proves nothing', () => {
        expect(src.length).toBeGreaterThan(2000);
        expect(src).toContain('const remove =');
        expect(src).toContain('if (editing) {');
    });

    it('deleting the row being edited ends the edit', () => {
        const remove = src.slice(src.indexOf('const remove ='), src.indexOf('const toggleDone'));
        expect(remove).toContain("editing === row.id");
        expect(remove).toContain("setEditing('')");
    });

    it('and a save whose row has vanished says so instead of clearing the form', () => {
        const save = src.slice(src.indexOf('if (editing) {'), src.indexOf('const local = {'));
        expect(save).toContain('rows.some(r => r.id === editing)');
        //  It must SPEAK. A silent `return` would fix the data loss and keep
        //  the lie, which is the half-fix this project keeps refusing.
        expect(save).toMatch(/setError\(/);
        expect(save).toContain('لم أحفظ شيئاً');
        //  And the guard must sit BEFORE the write, or it guards nothing.
        expect(save.indexOf('rows.some(r => r.id === editing)'))
            .toBeLessThan(save.indexOf('setRows(rows.map('));
    });
});

describe('the app calls things what he called them', () => {
    it('the details button is derived, not the word «المهمة»', () => {
        expect(src).not.toContain('تعديل المهمة');
        expect(src).not.toContain('Edit task');
        expect(src).toContain('content.entityOne');
    });

    it('and the English build says «Edit» with the entity too', () => {
        //  The negative half: a fix that only reached the Arabic string would
        //  leave «Edit task» in every English app Joe writes.
        const en = fileRecordsAppJsx(false);
        expect(en).not.toContain('Edit task');
        expect(en).toContain('content.entityOne');
    });
});
