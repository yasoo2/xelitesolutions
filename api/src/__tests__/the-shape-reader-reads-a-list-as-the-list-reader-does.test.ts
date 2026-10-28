import { inferModel } from '../core/design/entity-inference';
import { namedEntities } from '../core/design/named-entities';
import { designDataModel } from '../core/design/schema-designer';
import { requestedRecords } from '../core/quality/request-coverage';

/**
 * Round 21 (entities fork's hand-back, measured further at integration): the
 * shape reader (inferModel) read three lists differently from the list reader
 * and the delivery gate — and where it heard more items, the designer built
 * from it:
 *
 *   - «… فيه: إدارة المرضى، وقائمة المواعيد، والفواتير» became ONE
 *     `appointments` table with the other items for columns: the container
 *     «قائمة» sat inside an item and was read as the table the list describes;
 *   - «بدي قائمه الطلاب فيها: الاسم، العمر، الصف» — «قائمة» typed with ه —
 *     missed the container, and its columns became tables (`asms`, `amrs`);
 *   - «A clinic system with: patient records, an appointment list, invoices»
 *     became `withs`, `records`, `lists`, `invoices`: the chunk before the
 *     colon was an item, and English items were keyed by their last word.
 */
const keys = (request: string) => inferModel(request).entities.map(e => e.key);
const designed = async (request: string) => (await designDataModel(request)).map(e => e.key);

describe('the shape reader reads a list as the list reader does', () => {
    it('a container inside one item names that item, not a table the whole list describes', async () => {
        const request = 'نظام لعيادة فيه: إدارة المرضى، وقائمة المواعيد، والفواتير';
        expect(keys(request)).toEqual(['patients', 'appointments', 'invoices']);
        expect(inferModel(request).declared).toBeFalsy();
        expect(await designed(request)).toEqual(['patients', 'appointments', 'invoices']);
        expect(requestedRecords(request, { backendRequested: true }).entities.map(e => e.key)).toEqual(['patients', 'appointments', 'invoices']);
    });

    it('a table he described is one table, in the spelling he typed it in', () => {
        for (const request of ['بدي قائمة الطلاب فيها: الاسم، العمر، الصف', 'بدي قائمه الطلاب فيها: الاسم، العمر، الصف']) {
            const reading = inferModel(request);
            expect(reading.declared).toBe(true);
            expect(reading.entities.map(e => e.key)).toEqual(['students']);
            expect(reading.entities[0].fields.map(f => f.ar)).toEqual(['الاسم', 'العمر', 'الصف']);
        }
    });

    it('…and keeps its columns when one of them is itself a list, in Arabic and English', () => {
        const ar = inferModel('بدي جدول الموظفين فيه: الاسم، الراتب، قائمة المهام');
        expect(ar.entities.map(e => e.key)).toEqual(['employees']);
        expect(ar.entities[0].fields).toHaveLength(3);
        const en = inferModel('An employees table with name, salary, task list');
        expect(en.entities.map(e => e.key)).toEqual(['employees']);
        expect(en.entities[0].fields).toHaveLength(3);
    });

    it('English: the chunk before the colon introduces the list, and an item is keyed by its head', async () => {
        const request = 'A clinic system with: patient records, an appointment list, invoices';
        expect(keys(request)).toEqual(['patients', 'appointments', 'invoices']);
        expect(await designed(request)).toEqual(['patients', 'appointments', 'invoices']);
        expect(namedEntities(request).map(e => e.key)).toEqual(['patients', 'appointments', 'invoices']);
    });

    it('a container in front of every item is still one table each', () => {
        expect(keys('بدي نظام للمدرسة فيه جدول الطلاب وجدول المعلمين وجدول الصفوف')).toEqual(['students', 'teachers', 'classes']);
    });
});
