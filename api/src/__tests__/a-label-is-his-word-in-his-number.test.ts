/**
 * A LABEL IS HIS WORD, IN HIS NUMBER (round 22, R7 of the second review of
 * round 21): «الاجتماعات» was labelled "meeting", «قائمه الطلاب» "students
 * menu", the table of «بدي قائمة الطلاب فيها: …» was named «الطلاب فيها», and a
 * shape-read students table «بدي نظام للمدرسة فيه جدول الطلاب». Every case
 * below failed on 3c8302e2 (eval/proof/r22/reading/labels-before.txt).
 */
import { englishFor, inferModel } from '../core/design/entity-inference';
import { recordedSubject } from '../core/design/app-blueprints';

/* ─────────────────────────────── R7 ─────────────────────────────── */

describe('R7 — a label is his word, in his number, without the words around it', () => {
    it('a plural stays plural, and the word that holds the records is not part of the name', () => {
        expect(englishFor('الاجتماعات')).toBe('meetings');
        expect(englishFor('المهندسين')).toBe('engineers');
        expect(englishFor('قائمه الطلاب')).toBe('students');
        // a singular is still singular
        expect(englishFor('الموظف')).toBe('employee');
    });

    it('the opener is not part of the table\'s name', () => {
        expect(recordedSubject('بدي قائمة الطلاب فيها: الاسم والعمر')).toBe('الطلاب');
        expect(inferModel('بدي قائمة الطلاب فيها: الاسم والعمر').entities[0].ar).toBe('الطلاب');
        for (const entity of inferModel('بدي نظام للمدرسة فيه جدول الطلاب وجدول المعلمين وجدول الصفوف').entities) {
            expect(entity.ar).not.toMatch(/بدي|نظام|فيه/u);
        }
    });
});
