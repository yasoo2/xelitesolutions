/**
 * HIS COLUMNS WERE IN ONE SENTENCE AND HIS RULE IN ANOTHER, SO THE RULE DIED.
 *
 * Typed into Joe on his machine. The relevant two sentences of a long request,
 * three sentences apart:
 *
 *     «… في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم القطعة والكمية …»
 *     «… لا تقبل كمية بالسالب …»
 *
 * Bisected through the chain, whole request each time:
 *
 *     statedRules(request)          → { kind: 'bound', min: 0 }     ✅ read
 *     applyStatedRules(fields, …)   → الكمية.min = 0                ✅ applies
 *     blueprintFor(request)         → no field carries a min        ❌ lost
 *
 * Read but not kept, which is the worst of the three: the app shipped with no
 * floor, and a negative quantity was accepted by a build that had been told to
 * refuse one.
 *
 * The cause is one line at the end of the sentence-by-sentence column search.
 * `derivedColumns(piece)` finishes by applying the rules of THAT PIECE, so a
 * reader that had just learned to find his columns anywhere in the request
 * then judged them against a single sentence's worth of conditions — and every
 * rule he stated elsewhere was dropped without a word.
 *
 * The class is the same one that hid the columns in the first place: A
 * DECISION MADE FROM A FRAGMENT WHEN THE AUTHORITY IS THE WHOLE REQUEST. The
 * fourth law names the request, not a sentence of it.
 */

import { columnsAnywhereInHisRequest, blueprintFor } from '../core/design/app-blueprints';

const LONG = 'ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم القطعة والكمية وسعر الشراء وسعر البيع واسم المورد وتاريخ الإدخال. لا تقبل كمية بالسالب ولا تقبل سعر بيع أقل من سعر الشراء. أضف بحثاً وتصديراً إلى CSV. ولا تضف صفحة تسجيل دخول. اجعل التصميم داكناً.';

const minOf = (fields: any[], label: string) => (fields || []).find(f => f.label === label)?.min;

describe('a rule stated in one sentence binds a column named in another', () => {
    it('the columns are found at all — an empty list proves nothing', () => {
        const cols = columnsAnywhereInHisRequest(LONG) || [];
        expect(cols.map((c: any) => c.label)).toContain('الكمية');
        expect(cols.length).toBe(7);
    });

    it('and «لا تقبل كمية بالسالب» reaches «الكمية» three sentences away', () => {
        const cols = columnsAnywhereInHisRequest(LONG) || [];
        expect(minOf(cols as any[], 'الكمية')).toBe(0);
    });

    it('it lands on that column only, not on every number he listed', () => {
        //  The bound is about quantity. Flooring his prices would refuse data
        //  he never objected to — inventing a rule is the same defect as
        //  losing one, seen from the other side.
        const cols = (columnsAnywhereInHisRequest(LONG) || []) as any[];
        expect(minOf(cols, 'سعر الشراء')).toBeUndefined();
        expect(minOf(cols, 'سعر البيع')).toBeUndefined();
        expect(minOf(cols, 'رقم القطعة')).toBeUndefined();
    });

    it('and it survives into the blueprint the app is generated from', () => {
        //  The layer that actually decides content.js. A fix that stops one
        //  short of this is invisible on his screen, which is where the
        //  defect was found.
        const bp: any = blueprintFor('generic' as any, LONG, true);
        expect(minOf(bp.fields, 'الكمية')).toBe(0);
    });

    it('a request with no rule anywhere still floors nothing', () => {
        //  The negative case: re-reading the whole request for rules must not
        //  manufacture one out of prose.
        const plain = 'ابنِ لي نظاماً فيه ثلاث صفحات: المخزون والموردين والتقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة والكمية وسعر الشراء. اجعل التصميم داكناً.';
        const cols = (columnsAnywhereInHisRequest(plain) || []) as any[];
        expect(cols.length).toBeGreaterThan(0);
        expect(cols.every(c => c.min === undefined)).toBe(true);
    });

    it('and a short request keeps working exactly as it did', () => {
        //  The path that was already right must not be disturbed by the fix
        //  to the path that was not.
        const short = 'اعمل جدول فيه اسم القطعة والكمية وسعر الشراء ولا تقبل كمية بالسالب';
        expect(minOf((columnsAnywhereInHisRequest(short) || []) as any[], 'الكمية')).toBe(0);
    });
});
