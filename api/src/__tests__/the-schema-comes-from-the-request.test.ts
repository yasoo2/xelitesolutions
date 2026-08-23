/**
 * A CANNED TABLE FOR A MAN WHO NAMED HIS COLUMNS.
 *
 * Measured live, third iteration of the same brief. The planner routed it
 * correctly and the records engine was finally chosen — and then handed him
 * the generic blueprint's five: العنوان, التفاصيل, قيمة, التاريخ, الحالة.
 *
 * He had written his columns in the same sentence:
 *
 *     «بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر البيع
 *      … وبدي يطلع لي تحت مجموع رأس المال ومجموع الربح المتوقع، وإذا كمية قطعة
 *      صارت أقل من 3 يصير لونها أحمر عشان أنتبه»
 *
 * Not one of his five existed. Neither total existed. The threshold did not
 * exist. The engine was right and the product was still somebody else's.
 *
 * So the request dictates the schema when the request states it: the columns
 * he listed, the totals his columns imply — a quantity beside a buy price IS
 * capital, a quantity beside both prices IS margin — and the threshold in the
 * number he actually typed. Read stingily: an enumeration only after a colon
 * or «فيها», only to the end of that sentence, only at three parts or more.
 */
import { detectAppKind, blueprintFor, fieldsFromRequest } from '../core/design/app-blueprints';

/** The brief as the owner typed it. */
const OWNER = 'أنا عندي محل قطع سيارات. بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر البيع. لما أضيف قطعة تنحفظ وتضل موجودة لما أسكر الصفحة وأرجع أفتحها. وبدي أبحث عن القطعة باسمها أو رقمها، وبدي يطلع لي تحت مجموع رأس المال ومجموع الربح المتوقع، وإذا كمية قطعة صارت أقل من 3 يصير لونها أحمر عشان أنتبه.';

const planOf = (request: string) => blueprintFor(detectAppKind(request)!, request, true);

describe('INVARIANT: the columns a request lists are the columns it gets', () => {
    test('his five, in his order, with the types his words imply', () => {
        expect((fieldsFromRequest(OWNER, true) || []).map(f => f.key))
            .toEqual(['name', 'number', 'qty', 'buyPrice', 'sellPrice']);
        expect((fieldsFromRequest(OWNER, true) || []).map(f => f.type))
            .toEqual(['text', 'text', 'number', 'number', 'number']);
    });

    test('IS NOT VACUOUS: a request that lists nothing gets no derived schema', () => {
        expect(fieldsFromRequest('بدي صفحة فيها جدول', true)).toBeNull();
        expect(fieldsFromRequest('اعمل صفحة فيها: الاسم والسعر', true)).toBeNull();   // two is not a list
    });

    test('and a request with no enumeration keeps the general blueprint', () => {
        //  Asked of the general blueprint directly: «بدي نظام إدارة للعملاء»
        //  resolves to `crm`, a sharper archetype with its own columns, which
        //  is a better answer and not the one under test here.
        expect(blueprintFor('generic', 'بدي نظام إدارة لأشيائي', true).fields.map(f => f.key))
            .toEqual(['title', 'details', 'amount', 'date', 'status']);
    });
});

describe('INVARIANT: the totals follow the columns, and the threshold is his', () => {
    test('quantity with a buy price is capital; with both prices, margin', () => {
        const labels = planOf(OWNER).metrics.map(m => m.label);
        expect(labels).toContain('رأس المال');
        expect(labels).toContain('الربح المتوقع');
        const margin = planOf(OWNER).metrics.find(m => m.kind === 'sumMargin')!;
        expect([margin.field, margin.field2, margin.field3]).toEqual(['qty', 'sellPrice', 'buyPrice']);
    });

    test('the low-stock rule carries the number he wrote, not a default', () => {
        expect(planOf(OWNER).lowStock).toEqual({ field: 'qty', below: 3 });
    });

    test('IS NOT VACUOUS: no threshold in the request means no rule at all', () => {
        expect(blueprintFor('generic', 'بدي نظام إدارة لأشيائي', true).lowStock).toBeUndefined();
    });

    test('IS NOT VACUOUS: a threshold with no colour or warning is not a rule', () => {
        const quiet = 'بدي صفحة أسجل فيها: الاسم والرقم والكمية. وما بدي شي إذا صارت أقل من 3.';
        expect(planOf(quiet).lowStock).toBeUndefined();
    });
});
