/**
 * HE STATED A CONDITION, AND IT VANISHED — NOT OBEYED, NOT CHECKED, NOT SAID.
 *
 * Measured across a thousand requests run through Joe's own readers. The tier
 * whose requests carry an explicit condition read clean 5% of the time:
 *
 *     «اعمل موقع شركة تنظيف ولا تقبل مبلغًا صفرًا»   →  no criterion at all
 *     «اعمل موقع محل زهور ولا تضف صفحة تسجيل دخول»   →  no criterion at all
 *     «اعمل موقع مطعم واجعل التصميم داكنًا»          →  no criterion at all
 *
 * Of the three ways a condition can be lost — disobeyed, unchecked, unspoken —
 * the third is the one with no honest reading. He cannot know it was dropped.
 *
 * The cause was one line. statedRules() split the request on punctuation and
 * then stripped a leading «و»; nobody writes a comma before a condition, so
 * «…ولا تقبل مبلغًا صفرًا» was never separated, and the rule's own text came
 * back as the entire request — the sentence that asked for it standing in for
 * the thing asked.
 *
 * So a clause now begins where a rule begins, and every rule becomes a
 * criterion. What Joe can prove it proves; what it cannot comes back
 * `unprovable`, which is DECLARED to him and does not block the delivery.
 */

import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import { statedRules, hisClauses, clauseForbids } from '../core/design/app-blueprints';

const ids = (r: string) => acceptanceFor(r).map(c => c.id);
const rules = (r: string) => acceptanceFor(r).filter(c => c.id.startsWith('rule:'));

describe('a clause begins where a rule begins', () => {
    it('splits before a «و» that opens a rule', () => {
        expect(hisClauses('اعمل موقع شركة تنظيف ولا تقبل مبلغًا صفرًا'))
            .toEqual(['اعمل موقع شركة تنظيف', 'لا تقبل مبلغًا صفرًا']);
        expect(hisClauses('اعمل موقع مطعم واجعل التصميم داكنًا'))
            .toEqual(['اعمل موقع مطعم', 'اجعل التصميم داكنًا']);
    });

    it('and NOT before a «و» that joins a list — this is a boundary, not a chopper', () => {
        //  «والمبلغ» opens with a noun. «والاسترجاع» begins with the letters
        //  «الا», which an opener list without an end-of-word check would have
        //  taken for the negation «ألا» — measured, it split «الشحن
        //  والاسترجاع» in two and turned a column he named into a clause.
        expect(hisClauses('اعمل جدول فيه اسم العميل والمبلغ والتاريخ')).toHaveLength(1);
        expect(hisClauses('اعمل متجر فيه صفحة المنتجات وصفحة الشحن والاسترجاع')).toHaveLength(1);
    });

    it('reads the three kinds apart, because they cannot be judged alike', () => {
        const kind = (r: string) => statedRules(r)[0]?.kind;
        expect(kind('اعمل موقع ولا تقبل مبلغًا صفرًا')).toBe('bound');
        expect(kind('اعمل موقع ولا تضف صفحة تسجيل دخول')).toBe('forbid');
        expect(kind('اعمل موقع واجعل التصميم داكنًا')).toBe('require');
    });

    it('«لازم» is a requirement and not the negation it starts with', () => {
        //  `\b` cannot end a word in Arabic — JavaScript defines it by
        //  [A-Za-z0-9_], so «لا» matches inside «لازم» unless the opener is
        //  explicitly ended.
        expect(clauseForbids('لازم يكون داكنًا')).toBe(false);
        expect(clauseForbids('لا تضف صفحة')).toBe(true);
    });
});

describe('and every rule he stated becomes a criterion', () => {
    it.each([
        ['اعمل موقع شركة تنظيف ولا تقبل مبلغًا صفرًا', 'لا تقبل مبلغًا صفرًا'],
        ['اعمل موقع محل زهور ولا تضف صفحة تسجيل دخول', 'لا تضف صفحة تسجيل دخول'],
        ['اعمل موقع مطعم واجعل التصميم داكنًا', 'اجعل التصميم داكنًا'],
        ['اعمل موقع ولا تستعمل صورًا خارجية', 'لا تستعمل صورًا خارجية'],
    ])('%s', (request, clause) => {
        const r = rules(request);
        expect(r).toHaveLength(1);
        //  HIS clause, not the sentence that carried it.
        expect((r[0] as any).expectedRule.text).toBe(clause);
        expect(r[0].ar).toContain(clause);
    });

    it('the English prohibition in the reference prompt is read too', () => {
        const r = rules('Build a page. Do not modify existing projects.');
        expect(r).toHaveLength(1);
        expect((r[0] as any).expectedRule.text).toBe('Do not modify existing projects');
    });

    it('a request with no condition derives no rule — this reads, it does not invent', () => {
        for (const r of [
            'اعمل لي موقع شركة تنظيف',
            'اعمل جدول فيه اسم العميل والمبلغ والتاريخ',
            'اعمل لي صفحة هبوط وصفحة تواصل',
        ]) {
            expect(ids(r).filter(i => i.startsWith('rule:'))).toEqual([]);
        }
    });
});

describe('what cannot be proven is DECLARED, never dropped', () => {
    it('a prohibition comes back unprovable, and says which one', () => {
        const a = judgeAcceptance(rules('اعمل موقع ولا تضف صفحة تسجيل دخول'), { dir: '' } as any, true);
        expect(a.criteria[0].verdict).toBe('unprovable');
        expect(a.criteria[0].why).toContain('لا تضف صفحة تسجيل دخول');
        //  And it does not pretend: the sentence says it did not check.
        expect(a.criteria[0].why).toContain('لم أدّعِ');
    });

    it('an unprovable rule does not block the delivery', () => {
        //  Blocking on what Joe cannot check would make every conditional
        //  request undeliverable — which is how a guard becomes a wall.
        const a = judgeAcceptance(rules('اعمل موقع ولا تضف صفحة تسجيل دخول'), { dir: '' } as any, true);
        expect(a.unmet).toBe(0);
        expect(a.accepted).toBe(true);
    });

    it('a BOUND is provable, and unmet when no bound reached the schema', () => {
        const a = judgeAcceptance(rules('اعمل جدول ولا تقبل مبلغًا صفرًا'), { dir: '' } as any, true);
        expect(a.criteria[0].verdict).toBe('unmet');
        expect(a.criteria[0].why).toContain('لا تقبل مبلغًا صفرًا');
    });
});
