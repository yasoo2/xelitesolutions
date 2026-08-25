/**
 *  A COUNT CANNOT TELL A BETTER READING FROM A WORSE ONE.
 *
 *  Two of Joe's own logs, on the same sentence — «بدي جدول للفواتير فيه
 *  رقم الفاتورة والمبلغ والتاريخ»:
 *
 *      before  data model: read from the request itself —
 *              invoices, mblghs, tarykhs, its
 *      after   data model: no model answered at all
 *
 *  The «after» is from the commit that made the reader RIGHT: one table,
 *  named «الفواتير», with his three columns, instead of four — three of
 *  them columns wearing a table's name and one of them a fragment of
 *  Joe's own paperwork.
 *
 *  Every floor downstream said «at least two entities». Four phantom
 *  tables cleared it. One real table did not. So the better reading was
 *  thrown away, and a model was asked a question his sentence had already
 *  answered — for 120 seconds in the live run, on providers with no keys.
 *
 *  A floor of two is right for entities GUESSED from phrase shape: one
 *  vague noun is not a data model. It is wrong for a reading that came
 *  from columns he wrote, and no count can see the difference — because
 *  the count went DOWN when the reading got better.
 *
 *  So the reading carries a flag saying who read it, and the floor
 *  belongs to the caller, which is the only place that knows.
 */
import { inferModel } from '../core/design/entity-inference';
import { validateDesign, designDataModel } from '../core/design/schema-designer';

describe('a table read from his own columns is a whole model', () => {
    const HIS: Array<[string, string, string[]]> = [
        ['بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ', 'invoices',
            ['رقم الفاتورة', 'المبلغ', 'التاريخ']],
        ['بدي جدول للموظفين فيه الاسم والراتب', 'employees', ['الاسم', 'الراتب']],
    ];

    for (const [request, key, labels] of HIS) {
        it(`«${key}» survives validation on its own`, () => {
            const reading = inferModel(request);
            expect(reading.declared).toBe(true);
            expect(reading.entities).toHaveLength(1);
            const valid = validateDesign(reading.entities, 1);
            expect(valid).not.toBeNull();
            expect(valid!.map(e => e.key)).toEqual([key]);
            expect(valid![0].fields.map(f => f.ar)).toEqual(labels);
        });
    }

    it('and the designer returns it without asking a model', async () => {
        const notes: string[] = [];
        const model: any = await designDataModel(
            'بدي جدول للزُرقمونيات فيه الاسم والكمية والسعر',
            { onNote: (n: string) => notes.push(n) } as never,
        );
        expect((model || []).length).toBe(1);
        //  The note is the evidence that no model was consulted: the words
        //  «read from the request itself» are only written on that path.
        expect(notes.join(' ')).toContain('read from the request itself');
        expect(notes.join(' ')).not.toContain('no model answered at all');
    });
});

describe('…and a guess of one is still refused', () => {
    it('a single GUESSED entity does not clear the floor', () => {
        //  The floor of two is kept exactly where it was earned. Same
        //  validator, same single entity, no declaration behind it.
        const guessed = inferModel('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ').entities;
        expect(validateDesign(guessed, 2)).toBeNull();
    });

    it('a reading that is not his declaration carries no flag', () => {
        expect(inferModel('ابن لي موقعاً لمطعمي').declared).toBeFalsy();
        expect(inferModel('مرحبا').declared).toBeFalsy();
    });

    it('a table with no columns is still nothing', () => {
        expect(validateDesign([{ key: 'empty', ar: 'فارغ', en: 'empty', fields: [] }], 1)).toBeNull();
    });
});
