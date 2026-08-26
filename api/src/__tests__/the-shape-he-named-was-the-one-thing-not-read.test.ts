/**
 * HE WROTE «جدول» AS THE FIRST WORD, AND GOT A STACK OF CARDS.
 *
 * From the app Joe built on his machine:
 *
 *     «اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا»
 *
 *     table count: 0 | th count: 0
 *     what the list finally shows:  ممحاة · الكمية 4 · السعر 7
 *
 * Two of the three column names appear, repeated inside every card. «اسم
 * الصنف» appears NOWHERE: the card template filters the primary field out of
 * the meta list (`f.key !== primary.key`) and puts its value in a bare
 * heading, so the column he named loses its name.
 *
 * He cannot read down a column, cannot compare prices, and cannot find one of
 * the three things he asked for. The engine had one presentation and the
 * request's own word for the presentation was never consulted — the catalogue
 * deciding what the sentence had already said, which is the fourth law.
 *
 * The word alone must not decide it. CLAUDE.md names «جدول» among the Arabic
 * words carrying two meanings — a TABLE and a SCHEDULE — and requires context.
 * The context is his: a man who lists the COLUMNS is asking for a table.
 */

import { heAskedForATable } from '../core/design/app-blueprints';
import { fileRecordsAppJsx, fileAppContentJs } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';

const REQUEST = 'اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا';

describe('the shape is read from the sentence', () => {
    it('«جدول» plus named columns is a table', () => {
        expect(heAskedForATable(REQUEST, 3)).toBe(true);
        expect(heAskedForATable('اعمل لي جدول فيه الاسم والراتب', 2)).toBe(true);
        expect(heAskedForATable('make me a table with name, qty and price', 3)).toBe(true);
    });

    it('and the word on its own is not enough', () => {
        //  The negative cases, which are the whole reason this is a function
        //  and not a regex at a call site.
        //  «جدول» with nothing listed could be a schedule; it stays as it was.
        expect(heAskedForATable('اعمل جدول مواعيدي', 1)).toBe(false);
        //  A request that never says it — columns alone do not make a table.
        expect(heAskedForATable('اعمل تطبيق مبيعات فيه اسم الصنف والكمية والسعر', 3)).toBe(false);
        //  And the word must BE a word: «الجدولة» and «جدولي» are not it.
        expect(heAskedForATable('اعمل صفحة عن الجدولة الزمنية والتخطيط', 3)).toBe(false);
    });
});

describe('and it reaches the app that is written to his disk', () => {
    const bp: any = blueprintFor('records' as any, REQUEST, true);

    it('content.js carries the shape, derived from his own sentence', () => {
        const content = fileAppContentJs(bp, {
            brand: 'مبيعات', isArabic: true, storeKey: 'k', sourceRequest: REQUEST,
        } as any);
        expect(content).toContain('asTable: true');
    });

    it('and a request that named no shape does not get one', () => {
        const plain = 'اعمل تطبيق مبيعات فيه اسم الصنف والكمية والسعر';
        const content = fileAppContentJs(blueprintFor('records' as any, plain, true) as any, {
            brand: 'مبيعات', isArabic: true, storeKey: 'k', sourceRequest: plain,
        } as any);
        expect(content).toContain('asTable: false');
    });

    it('the app really renders a table, with a header cell per column', () => {
        const src = fileRecordsAppJsx(true);
        expect(src).toContain('content.asTable');
        expect(src).toMatch(/<table\b/);
        //  A header PER FIELD, from the fields themselves — not a fixed list,
        //  or the columns he named would go missing again in the next request.
        expect(src).toMatch(/<th key=\{f\.key\} scope="col">\{f\.label\}<\/th>/);
    });

    it('and no column loses its label the way «اسم الصنف» did', () => {
        //  The card path drops the primary field from the meta list. The table
        //  path must not filter by `primary` at all — only images, which have
        //  no textual cell. This is the exact defect, guarded by name.
        const src = fileRecordsAppJsx(true);
        const table = src.slice(src.indexOf('<table'), src.indexOf('</table>'));
        expect(table.length).toBeGreaterThan(200);
        expect(table).not.toContain('primary.key');
    });
});
