import { inferModel } from '../core/design/entity-inference';
import { columnsAnywhereInHisRequest, recordedSubject } from '../core/design/app-blueprints';
import { designDataModel } from '../core/design/schema-designer';

const cases = [
    ['checkout', 'Create a small browser-based library checkout board in a new local project, with an Express API and a real database. It needs title, borrower, due date, a returned toggle, filtering, validation, persistence, and a responsive layout.'],
    ['return', 'Create an equipment return board in a new project. It needs item, borrower, due date, and a returned toggle.'],
    ['defect', 'Create a defect board using an Express API. It needs title, severity, and a resolved toggle.'],
] as const;

describe('a record board declares one entity with fields, not infrastructure tables', () => {
    it.each(['in a new local project', 'inside the existing workspace', 'under my selected folder'])(
        'excludes execution location: %s', location => {
            const request = `Create an equipment return board ${location}. It needs item, borrower, and due date.`;
            expect(recordedSubject(request)).toBe('return');
            const model = inferModel(request);
            expect(model.entities).toHaveLength(1);
            expect(model.entities[0].key).toBe('returns');
        },
    );

    it.each(cases)('preserves the %s record contract', (subject, request) => {
        expect(recordedSubject(request)).toBe(subject);
        const columns = columnsAnywhereInHisRequest(request)!;
        expect(columns.length).toBeGreaterThanOrEqual(3);
        const model = inferModel(request);
        expect(model.declared).toBe(true);
        expect(model.entities).toHaveLength(1);
        expect(model.entities[0].fields.map(field => field.key)).toEqual(columns.map(column => column.key));
    });

    it('keeps execution instructions out of the database model without a model call', async () => {
        const request = cases[0][1] + ' Use focused checks while editing, then one final full verification. Report which checks ran and which were reused. Open and inspect the result in the browser. Do not deploy anything.';
        const notes: string[] = [];
        const model = await designDataModel(request, { onNote: note => notes.push(note) });
        expect(model).toHaveLength(1);
        expect(model[0].key).toBe('checkouts');
        expect(model[0].fields.map(field => field.en)).toEqual(['title', 'borrower', 'due date', 'returned']);
        expect(notes.join(' ')).toContain('read from the request itself');
    });
});
