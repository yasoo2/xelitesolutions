/**
 *  A READER OF HIS WORDS WAS HANDED JOE'S OWN PAPERWORK.
 *
 *  From a real run's log, on his machine:
 *
 *      data model: read from the request itself — invoices, mblghs, tarykhs, its
 *      🗂️ شاشات إدارة لكل جدول: invoices · mblghs · tarykhs · its
 *
 *  «its» is not a word he wrote. It is the tail of Joe's own instruction —
 *  «do not invent beyond it)» — which the pipeline appends to his sentence
 *  as AUTHORITATIVE REQUIREMENTS EVIDENCE. He was shown an admin screen
 *  for a table named after a fragment of Joe's paperwork.
 *
 *  hisWordsOnly already cuts exactly that block, and a test one directory
 *  away has proved it for months. Its only caller was inside its own file.
 *
 *  The guard on the guard: hisWordsOnly also cuts at a blank line, which
 *  is Joe's mark only when Joe put it there. A man writing two paragraphs
 *  must not lose the second, so the cut runs only when one of Joe's OWN
 *  marks is present — a fence it draws, or a shouted heading it writes.
 */
import { inferModel } from '../core/design/entity-inference';

const PAPER = '\n\nAUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the complete local '
    + 'specification; do not invent beyond it):\nhere is the brief text';
const keys = (request: string) => inferModel(request).entities.map(e => e.key);

describe('Joe\u2019s own paperwork never becomes one of his tables', () => {
    it('the request that produced «its» on his screen', () => {
        expect(keys('ابن لي متجراً صغيراً')).toEqual([]);
        expect(keys('ابن لي متجراً صغيراً' + PAPER)).toEqual([]);
    });

    it('a declared column list is unchanged by the block', () => {
        const bare = keys('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ');
        expect(bare).toEqual(['invoices']);
        expect(keys('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ' + PAPER)).toEqual(bare);
    });

    it('a fence Joe draws is cut the same way', () => {
        const fenced = 'ابن لي متجراً صغيراً\n--- COMPACT REQUIREMENTS EVIDENCE ---\nzurqumony brief';
        expect(keys(fenced)).toEqual([]);
    });
});

describe('…and his own second paragraph survives', () => {
    it('a blank line alone is not Joe\u2019s mark', () => {
        //  The guard on the guard. Two paragraphs, no fence and no shouted
        //  heading: every word is his, and none of it may be cut.
        const two = 'عندي عيادة أسنان.\n\nبدي جدول للمواعيد فيه اسم المريض ورقم تلفونه ووقت الموعد';
        const model = inferModel(two).entities;
        expect(model).toHaveLength(1);
        expect(model[0].fields.map(f => f.ar)).toEqual(['اسم المريض', 'رقم تلفونه', 'وقت الموعد']);
    });

    it('a request that is nothing but paperwork is not rescued into nonsense', () => {
        //  Cutting to nothing would leave an empty string; the reader keeps
        //  the raw text rather than inventing from a fragment.
        expect(keys(PAPER.trim()).length).toBeLessThanOrEqual(3);
    });
});
