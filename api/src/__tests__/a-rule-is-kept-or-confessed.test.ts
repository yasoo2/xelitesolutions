/**
 *  A RULE THAT IS NEITHER KEPT NOR CONFESSED.
 *
 *  Live round on his machine:
 *
 *      «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *
 *  Three columns arrived, correctly, and the condition vanished. Measured in
 *  the generated project:
 *
 *      { key: 'money1', label: 'السعر', type: 'number', required: true }
 *          — no min, no bound of any kind
 *      RecordsApp.jsx:28
 *          if (field.type !== 'number' || field.min === undefined) return false;
 *
 *  The app SHIPS the guard. Nothing fills the value it reads, so zero is
 *  accepted — the exact thing he forbade. And the ledger reported «3 of what
 *  I know how to prove is proven», naming three columns and never the rule:
 *  true, and useless at the same time.
 */
import { statedRules, applyStatedRules, derivedColumns } from '../core/design/app-blueprints';

const LIVE = 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر';

describe('a stated rule is read, not dropped', () => {
    it('the exact live sentence yields one rule about «السعر»', () => {
        const rules = statedRules(LIVE);
        expect(rules).toHaveLength(1);
        expect(rules[0].field).toBe('السعر');
        expect(rules[0].text).toContain('لا يقبل صفر');
    });

    it('«لا يقبل صفر» becomes a floor above zero', () => {
        expect(statedRules(LIVE)[0].min).toBe(1);
    });

    it('a number he wrote is read as the number he wrote', () => {
        //  «أكبر من 1000» and «لا يقبل صفر» are the same shape: a value the
        //  field must exceed. Nothing here is a phrase from a table.
        const r = statedRules('بدي جدول للموظفين فيه الاسم والراتب، والراتب يجب أن يكون أكبر من 1000');
        expect(r).toHaveLength(1);
        expect(r[0].field).toBe('الراتب');
        expect(r[0].min).toBe(1001);
    });

    it('a sentence that states no condition yields no rule', () => {
        //  The negative. If every clause were a rule, every column list would
        //  come back as constraints.
        expect(statedRules('بدي جدول للكتب فيه العنوان والمؤلف والسعر')).toEqual([]);
        expect(statedRules('مرحبا')).toEqual([]);
    });
});

describe('the bound reaches the field it names', () => {
    it('the live round end to end: the column carries the floor', () => {
        const fields = derivedColumns(LIVE);
        expect(fields).not.toBeNull();
        const { fields: bounded, unapplied } = applyStatedRules(fields!, statedRules(LIVE));
        const price = bounded.find(f => f.label === 'السعر');
        expect(price).toBeDefined();
        expect(price!.min).toBe(1);
        expect(unapplied).toEqual([]);
    });

    it('…and the other columns are left alone', () => {
        const fields = derivedColumns(LIVE)!;
        const { fields: bounded } = applyStatedRules(fields, statedRules(LIVE));
        expect(bounded.filter(f => f.min !== undefined)).toHaveLength(1);
    });

    it('a rule Joe cannot apply is RETURNED, never swallowed', () => {
        //  This is the half that matters most: an unreadable condition must
        //  come back so it can be said out loud. Silence is the defect.
        const rules = statedRules('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ، ولا تقبل طلبات من خارج المدينة');
        expect(rules.length).toBeGreaterThan(0);
        const { unapplied } = applyStatedRules(derivedColumns('بدي جدول للطلبات فيه الاسم والمبلغ والتاريخ')!, rules);
        expect(unapplied.length).toBeGreaterThan(0);
        expect(unapplied[0].text).toContain('خارج المدينة');
    });

    it('a rule about a field that is not a number is not forced onto it', () => {
        const fields = derivedColumns('بدي جدول للكتب فيه العنوان والمؤلف والسعر')!;
        const { fields: bounded, unapplied } = applyStatedRules(fields, [{ text: 'العنوان لا يقبل صفر', field: 'العنوان', min: 1 }]);
        expect(bounded.find(f => f.label === 'العنوان')!.min).toBeUndefined();
        expect(unapplied).toHaveLength(1);
    });
});
