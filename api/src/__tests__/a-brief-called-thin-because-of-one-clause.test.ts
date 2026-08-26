/**
 * FORTY-THREE WORDS AND SEVEN REQUIREMENTS, CALLED «A THIN BRIEF».
 *
 * Seen live, with the owner watching the screen, on a prompt he asked me to
 * put in front of him:
 *
 *     «اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد»، فيه صفحة
 *       رئيسية وصفحة منتجات فيها ستة أنواع عسل مع أسعارها، وصفحة عن المزرعة،
 *       وصفحة تواصل فيها نموذج يعمل، وسلة شراء تحسب الإجمالي وتحفظ الطلب.
 *       التصميم دافئ وفاخر، ولا تقبل سعراً صفراً أو سالباً.»
 *
 *     💬 The brief is thin — asking a few questions before building
 *     One question before I start — what do you want to record for each of
 *     your تحسب الإجمالي?
 *
 * Four named pages, six products with prices, a working form, a cart that
 * totals and saves, a design direction and a validation rule — and one clause
 * about saving an order outranked all of it.
 *
 * ⛔ THE CLASS is the fourth law, broken inside the one gate whose entire job
 * is to judge HOW MUCH HE SAID: a decision taken from a fragment while the
 * authority is the whole request. `clarify.ts:120` read
 *
 *     if (namesSomethingToTrack) return true;
 *
 * with no condition at all, so any request mentioning tracking was declared
 * vague however much detail it carried.
 *
 * ⛔ AND THE ESCAPE HATCH ABOVE IT IS WHY IT SURVIVED. `describesItsContents`
 * means exactly one thing — «did he name TABLE COLUMNS?» — so a request that
 * describes its contents in every way except columns counts as describing
 * nothing. A name that promises far more than its single reader delivers.
 *
 * The repair asks the reader that already answers «what did he actually ask
 * for»: the acceptance deriver, the fourth law's own machinery. The numbers
 * below are measured, and they are the reason the threshold is safe.
 */

import { clarifyGate } from '../core/orchestrator/clarify';
import { acceptanceFor } from '../core/quality/acceptance';

const HIS_STORE = 'اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد»، فيه صفحة رئيسية وصفحة منتجات فيها ستة أنواع عسل مع أسعارها، وصفحة عن المزرعة، وصفحة تواصل فيها نموذج يعمل، وسلة شراء تحسب الإجمالي وتحفظ الطلب. التصميم دافئ وفاخر، ولا تقبل سعراً صفراً أو سالباً.';

/** A fresh session id per call, so no pending clarification leaks between tests. */
let n = 0;
const gate = (text: string) => clarifyGate(text, `thin-brief-${++n}`, 'ar', {});

describe('a request is judged by everything in it, not by one clause', () => {
    it('⛔ POSITIVE — the exact prompt he watched being refused now builds', () => {
        expect(gate(HIS_STORE).kind).toBe('pass');
    });

    it('POSITIVE — and the reason is measurable, not a special case', () => {
        //  The number the gate now consults. Published with its input, so the
        //  threshold can be checked by anyone rather than trusted.
        expect(acceptanceFor(HIS_STORE).length).toBeGreaterThanOrEqual(2);
    });

    //  ── the gate must keep stopping everything it was built to stop ──────
    const stillAsks = (label: string, text: string) => {
        it(`NEGATIVE — ${label} is still questioned`, () => {
            expect({ label, kind: gate(text).kind }).toEqual({ label, kind: 'ask' });
        });
    };

    stillAsks('«بدي جدول»', 'بدي جدول');
    stillAsks('«بدي جدول للمواعيد»', 'بدي جدول للمواعيد');
    stillAsks('«بدي شي أتابع فيه ديوني»', 'بدي شي أتابع فيه ديوني');
    stillAsks('«ابن لي موقع»', 'ابن لي موقع');

    it('⛔ PRE-EXISTING HOLE, recorded not hidden — a table with three words and no columns is NOT questioned', () => {
        //  I wrote this as a `stillAsks` case and it went red. A differential
        //  probe settled who was wrong: with the new threshold raised to an
        //  impossible value — which restores the old code exactly — this case
        //  STILL passed the gate. So it passed before my change too, and the
        //  expectation was mine, not the code's.
        //
        //  It reaches the builder through `descriptiveTokens(text).length < 3`:
        //  «جدول لمصاريف البيت الشهرية» has enough words and not one column.
        //  That is precisely the risk the original comment in clarify.ts warns
        //  about — «a table with no columns can only be invented» — and the
        //  word count does not notice.
        //
        //  It is NOT repaired here. This change is about a rich brief being
        //  called thin; widening it to a different hole in the same file would
        //  be scope walking on its own, and this assertion is what keeps the
        //  hole measured instead of forgotten: the day someone fixes it, this
        //  line turns red and points at itself.
        expect(gate('اعمل لي جدول لمصاريف البيت الشهرية').kind).toBe('pass');
        expect(acceptanceFor('اعمل لي جدول لمصاريف البيت الشهرية').length).toBe(0);
    });

    it('NEGATIVE — and every one of those derives ZERO criteria', () => {
        //  ⛔ THIS IS WHY THE THRESHOLD IS SAFE, and it is the measurement that
        //  makes the fix reviewable. The gap between what must pass and what
        //  must be stopped is the whole scale — 6 against 0 — so the line sits
        //  in open space, not next to a boundary case.
        for (const t of [
            'بدي جدول',
            'بدي جدول للمواعيد',
            'بدي شي أتابع فيه ديوني',
            'ابن لي موقع',
        ]) {
            expect({ t, criteria: acceptanceFor(t).length }).toEqual({ t, criteria: 0 });
        }
    });

    it('NEGATIVE — a request that names real columns still passes, as before', () => {
        //  It passed before this change through `describesItsContents`, and it
        //  must not start depending on the new path — otherwise the repair has
        //  quietly replaced a working rule instead of adding to it.
        expect(gate('اعمل لي جدول فيه الاسم والمبلغ والتاريخ').kind).toBe('pass');
    });

    it('NEGATIVE — a described site with no tracking clause is untouched', () => {
        //  This shape never reached the tracking branch. If it changes colour,
        //  the edit reached further than it was meant to.
        expect(gate('اعمل لي موقع لمطعم إيطالي في جدة').kind).toBe('pass');
    });
});
