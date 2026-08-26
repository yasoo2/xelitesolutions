/**
 * «لا تقبل كمية بالسالب» REACHED THE APP AS NOTHING AT ALL.
 *
 * Measured on his machine, in the project Joe built from his own long
 * request. The three readings, side by side, same shape of sentence:
 *
 *     «لا تقبل كمية صفرًا»    → { kind: 'bound', min: 0, minExclusive: true }   applied
 *     «لا تقبل كمية بالسالب»  → { kind: 'forbid' }                              UNAPPLIED
 *
 * Same constraint, two names, one of them taught. The schema Joe wrote for
 * him carried no bound at all, so a quantity of −5 was accepted by an app
 * that had been told to refuse it — and the condition was filed under
 * «I cannot prove this», which is honest about a check that was never made
 * and silent about one that could have been.
 *
 * The class: A CONSTRAINT KNOWN BY ONE OF ITS NAMES. The reader already knew
 * «موجب» and «صفر» and «أقل من N»; it did not know the word he used. Every
 * such gap looks like a missing feature and is really a missing synonym.
 *
 * And the strictness is not shared, which is the part worth getting right:
 * a man who refuses NEGATIVES has said nothing against zero, while «موجب»
 * excludes zero by definition. Reading them alike would refuse a quantity of
 * zero he never forbade — inventing a rule, which is the fourth law's other
 * half.
 */

import { statedBound, statedRules, applyStatedRules, fieldsFromRequest } from '../core/design/app-blueprints';

const boundOf = (s: string) => statedBound(s);

describe('a floor stated as «no negatives» is a floor', () => {
    it.each([
        ['بالسالب', 'لا تقبل كمية بالسالب'],
        ['سالبة', 'ارفض أي كمية سالبة'],
        ['بالناقص', 'لا تقبل الرصيد بالناقص'],
        ['negative', 'do not accept a negative quantity'],
    ])('%s', (_n, sentence) => {
        expect(boundOf(sentence)).toEqual({ min: 0, minExclusive: false });
    });

    it('and «غير سالب» states it as a requirement, not a refusal', () => {
        expect(boundOf('الكمية غير سالبة')).toEqual({ min: 0, minExclusive: false });
        expect(boundOf('quantity must be non-negative')).toEqual({ min: 0, minExclusive: false });
    });

    it('«موجب» keeps its own stricter floor — zero is excluded there', () => {
        //  The distinction is the point. Two sentences, two different floors,
        //  because he said two different things.
        expect(boundOf('الكمية موجبة')).toEqual({ min: 0, minExclusive: true });
        expect(boundOf('لا تقبل كمية صفرًا')).toEqual({ min: 0, minExclusive: true });
    });

    it('and a sentence that ALLOWS negatives sets no floor', () => {
        //  The negative case. A reader that fires on the word «سالب» alone
        //  would floor a column he deliberately left open.
        expect(boundOf('اقبل أرقاماً سالبة في هذا العمود')).toBeNull();
        expect(boundOf('allow negative values here')).toBeNull();
    });

    it('a sentence with no bound at all is still null', () => {
        expect(boundOf('اعمل جدول فيه الكمية والسعر')).toBeNull();
        expect(boundOf('')).toBeNull();
    });
});

describe('and it reaches the field he stated it about', () => {
    const HIS = 'اعمل جدول فيه اسم القطعة والكمية وسعر الشراء ولا تقبل كمية بالسالب';

    it('the rule is read as a bound, not as an unprovable prohibition', () => {
        const rules = statedRules(HIS).filter(r => r.text.includes('سالب'));
        expect(rules).toHaveLength(1);
        expect(rules[0].kind).toBe('bound');
        expect(rules[0].min).toBe(0);
        expect(rules[0].minExclusive).toBeFalsy();
    });

    it('and the schema carries the floor on «الكمية» and nowhere else', () => {
        const fields = fieldsFromRequest(HIS, true) || [];
        const { fields: out, unapplied } = applyStatedRules(fields as any, statedRules(HIS));
        const by = (l: string) => (out as any[]).find(f => f.label === l);
        expect(by('الكمية')?.min).toBe(0);
        expect(by('الكمية')?.minExclusive).toBeFalsy();
        //  Not on the price — he said nothing about it.
        expect(by('سعر الشراء')?.min).toBeUndefined();
        expect(unapplied).toHaveLength(0);
    });
});
