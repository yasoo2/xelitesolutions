/**
 * THE APP SHIPPED THE GUARD, AND NOTHING EVER FILLED THE VALUE IT READS.
 *
 * Measured in the project Joe built on the owner's machine, from:
 *
 *     «اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ ولا تقبل مبلغًا صفرًا»
 *
 *     RecordsApp.jsx:28   if (field.type !== 'number' || field.min === undefined) return false;
 *     content.js          المبلغ → required: true      ← and no min, of any kind
 *
 * The generated application carries the check. The schema never carries the
 * number it checks against. So zero is accepted — the exact thing he forbade —
 * in a build that reported itself complete, with three correct columns on
 * screen to make it look right.
 *
 * The rule was READ. `statedRules` returned `{ kind: 'bound', min: 0 }`. It
 * was then dropped, because attaching a bound to a field means knowing WHICH
 * field, and that was decided by a literal match: the field is labelled
 * «المبلغ» and his clause says «مبلغًا» — indefinite, accusative, no article.
 * `includes` finds nothing between them, so the rule landed in `unapplied`
 * where nobody looks.
 *
 * Same class as everything else this file's neighbours guard: a match on
 * LETTERS where the question is about a WORD. Fixed with the language layer,
 * which segments by Unicode's rules and stems with the stemmer Elasticsearch
 * ships — so «مبلغًا» is «المبلغ», and «أزرق» is still not «زر».
 */

import { fieldsFromRequest, statedRules, applyStatedRules, blueprintFor } from '../core/design/app-blueprints';

const bound = (request: string) => {
    const fields = fieldsFromRequest(request, true) || [];
    return applyStatedRules(fields as any, statedRules(request));
};

describe('a bound he stated reaches the field he stated it about', () => {
    it('«لا تقبل مبلغًا صفرًا» puts a floor under «المبلغ»', () => {
        const { fields, unapplied } = bound('اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ ولا تقبل مبلغًا صفرًا');
        const money: any = fields.find((f: any) => f.label === 'المبلغ');
        expect(money).toBeDefined();
        expect(money.min).toBe(0);
        expect(money.minExclusive).toBe(true);
        //  Nothing left over: a rule in `unapplied` is a rule he was never told about.
        expect(unapplied).toHaveLength(0);
    });

    it('and it reaches the blueprint the app is generated from', () => {
        //  The step that actually decides what content.js carries. A bound
        //  that stops one layer short is invisible in exactly the same way.
        const bp: any = blueprintFor('records' as any, 'اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ ولا تقبل مبلغًا صفرًا', true);
        const money = (bp.fields || []).find((f: any) => f.label === 'المبلغ');
        expect(money?.min).toBe(0);
    });

    it('and it lands on THAT field, not on every number he listed', () => {
        //  The reader this replaced searched the whole sentence and floored
        //  every column. A bound on the wrong field is a bound that refuses
        //  data he never objected to.
        const { fields } = bound('اعمل جدول فيه الكمية والسعر والخصم ولا تقبل سعرًا صفرًا');
        const byLabel = (l: string) => (fields as any[]).find(f => f.label === l);
        expect(byLabel('السعر')?.min).toBe(0);
        expect(byLabel('الكمية')?.min).toBeUndefined();
        expect(byLabel('الخصم')?.min).toBeUndefined();
    });

    it('a request with no bound puts no floor anywhere', () => {
        const { fields, unapplied } = bound('اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ');
        expect((fields as any[]).every(f => f.min === undefined)).toBe(true);
        expect(unapplied).toHaveLength(0);
    });

    it('and a bound naming a field he never listed stays unapplied, not guessed', () => {
        //  «الرصيد» is in no column. Attaching it to the nearest number would
        //  be inventing a rule he did not state; leaving it unapplied is the
        //  honest answer, and it is what gets reported to him.
        const { fields, unapplied } = bound('اعمل جدول فيه اسم العميل والمبلغ ولا تقبل رصيدًا صفرًا');
        expect((fields as any[]).every(f => f.min === undefined)).toBe(true);
        expect(unapplied.length).toBeGreaterThanOrEqual(1);
    });
});
