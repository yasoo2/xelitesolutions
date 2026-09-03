/**
 * «I COULD NOT CHECK IT» AND «IT IS APPLIED», FOUR LINES APART, ABOUT ONE CLAUSE.
 *
 * Measured in a single reply on the owner's screen, from one sentence:
 *
 *     «اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا»
 *
 *     ⚠️ You wrote these and I have no way to check them, so I did not
 *        — and I am not claiming I did: لا تقبل سعرًا صفرًا
 *     …
 *     your condition: «لا تقبل سعرًا صفرًا» — the bound is in the schema
 *
 * Both were true from where they stood. The scope audit lists clauses that no
 * known CAPABILITY matches, and it has done that honestly for a long time. The
 * acceptance ledger learned today to read those same clauses as RULES and to
 * judge them. Neither knew about the other, so one reply told him two opposite
 * things about his own sentence.
 *
 * The ledger is the one voice, because it can say all three things a clause
 * can be — met, unmet, or declared unprovable. A clause it has spoken about is
 * not unchecked; it is judged.
 *
 * The class is the seam, not either reader: two reporters describing the same
 * material with nothing making them agree. Same shape as the delivery list and
 * the judge's vocabulary drifting apart earlier today.
 */

import { requestedCapabilities, scopeReport } from '../core/quality/scope-audit';
import { acceptanceFor } from '../core/quality/acceptance';

const unchecked = (r: string) => scopeReport(r, []).unchecked;
const ruleTexts = (r: string) => acceptanceFor(r)
    //  By what it carries, not by its id — see the note in
    //  a-tick-that-any-digit-could-earn.test.ts.
    .filter(c => !!c.expectedRule)
    .map(c => String((c as any).expectedRule?.text || ''));

const fold = (s: string) => s
    .replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();

describe('a clause the ledger judges is not also called unchecked', () => {
    it.each([
        ['اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا'],
        ['اعمل موقع مطعم ولا تضف صفحة تسجيل دخول'],
        ['اعمل موقع شركة واجعل التصميم داكنًا'],
    ])('%s', (request) => {
        const judged = ruleTexts(request).map(fold);
        expect(judged.length).toBeGreaterThan(0);
        //  Nothing the ledger speaks about may appear in the other list, in
        //  either direction of containment — the two readers cut a sentence
        //  at different places, so equality alone would let it through.
        for (const c of unchecked(request).map(fold)) {
            expect(judged.some(j => j === c || j.includes(c) || c.includes(j))).toBe(false);
        }
    });
});

describe('and the honest silence it protects is still there', () => {
    it('does not call a reading-log rating column a customer-review system', () => {
        expect(requestedCapabilities('Build a reading log with title and rating')).toEqual([]);
    });

    it('does not call a named reading-status column unchecked', () => {
        const report = scopeReport(
            'Build a personal reading log with book title, author, pages, start date, finish date, rating, and reading status. Add filters for status and rating plus a progress metric.',
            [],
        );
        expect(report.unchecked.map(value => value.toLowerCase())).not.toContain('reading status');
    });

    it('a clause that is NOT a rule is still declared unchecked', () => {
        //  This audit exists because Joe used to say nothing at all about the
        //  parts of a request he could not verify. Silencing it entirely to
        //  fix a duplicate would be a worse defect than the duplicate.
        expect(unchecked('اعمل جدول فيه الاسم والراتب مع تصدير').length).toBeGreaterThan(0);
    });

    it('a request with no extra clauses declares nothing', () => {
        expect(unchecked('اعمل جدول فيه الاسم والراتب والقسم')).toEqual([]);
    });

    it('and the rule itself is still reported — once', () => {
        //  The point is not to lose the clause. It moves to the ledger, where
        //  it carries a verdict instead of a shrug.
        const r = 'اعمل جدول مبيعات فيه اسم الصنف والسعر ولا تقبل سعرًا صفرًا';
        expect(ruleTexts(r)).toHaveLength(1);
        expect(ruleTexts(r)[0]).toContain('لا تقبل');
    });
});
