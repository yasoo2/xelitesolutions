/**
 * A WEBSITE, JUDGED BY THE TABLE COLUMNS IT CAN NEVER HAVE.
 *
 * Caught on a live run, from a sentence the owner wrote himself:
 *
 *     أبي موقع لمحمصة قهوة مختصة اسمها إمبرلاين. حط فيه قائمة قهوة
 *     بأسعارها ودرجة التحميص، وساعات العمل والموقع، وزر اتصال بارز،
 *     ونموذج حجز تذوق…
 *
 *     ⚠️ توقف البناء بصدق
 *     acceptance_criteria_unmet: column:text1, column:text2,
 *                                column:text3, column:text4
 *
 * Measured on the same sentence:
 *
 *     detectAppKind(request)   ->  null          ← it IS a site, and Joe knows
 *     acceptanceFor(request)   ->  … column:text1 … column:text4
 *
 * So the classifier learned that a site is a site, and the acceptance judge
 * did not. Joe builds the website he was asked for and then refuses to
 * deliver it because it has no table columns — which a website never has.
 *
 * ⛔ THAT IS A CRITERION THAT CAN NEVER BE MET, and it is the mirror of the
 * one this project keeps deleting. A check that cannot fail proves nothing;
 * a check that cannot pass blocks everything. The delivery is refused for
 * ever, on evidence that could not exist.
 *
 * THE CLASS is the third: two readers of one request, maintained separately,
 * with nothing forcing them to agree. `siteNounWithoutAppRequest` was taught
 * to the classifier and not to the judge, so the two now disagree about what
 * kind of thing is being built — each correct on its own, and the pair fatal.
 *
 * A column belongs to a table. When the request will not produce a table, the
 * columns in his sentence are content — a coffee list with its prices — and
 * the sections reader already carries them.
 *
 * The negative cases hold the other side: a request that IS an app must keep
 * every column criterion it had, because that is the fourth law working, and
 * a stated rule stays a criterion whatever kind of thing is built.
 */

import { acceptanceFor } from '../core/quality/acceptance';
import { detectAppKind } from '../core/design/app-blueprints';

const HIS_SENTENCE = 'أبي موقع لمحمصة قهوة مختصة اسمها إمبرلاين. حط فيه قائمة قهوة '
    + 'بأسعارها ودرجة التحميص، وساعات العمل والموقع، وزر اتصال بارز، ونموذج حجز تذوق. '
    + 'خلّ التصميم دافئ ولا تشيل أي قسم أطلبه.';

const ids = (r: string) => acceptanceFor(r).map(c => c.id);

describe('what is judged matches what is built', () => {
    it('POSITIVE — his own sentence yields no table-column criterion', () => {
        expect(detectAppKind(HIS_SENTENCE)).toBeNull();
        expect(ids(HIS_SENTENCE).filter(id => id.startsWith('column:'))).toEqual([]);
    });

    it('POSITIVE — and it still yields the things a site CAN be judged on', () => {
        //  Removing an impossible criterion must not empty the ledger: a
        //  judgement with nothing in it is its own defect.
        const got = ids(HIS_SENTENCE);
        expect(got.length).toBeGreaterThan(0);
        expect(got.some(id => id.startsWith('rule:'))).toBe(true);
    });

    it('POSITIVE — the English twin behaves the same', () => {
        const en = 'Build a website for a specialty coffee roastery called Emberline. '
            + 'Include a coffee list with prices and roast level, opening hours, '
            + 'location, a phone CTA, and a tasting booking form.';
        expect(detectAppKind(en)).toBeNull();
        expect(ids(en).filter(id => id.startsWith('column:'))).toEqual([]);
    });

    it('NEGATIVE — an APP request keeps every column criterion it had', () => {
        //  This is the fourth law working and the fix must not touch it: a
        //  list he WROTE is the contract, and those columns are provable
        //  because a table is what gets built.
        const app = 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر';
        expect(detectAppKind(app)).not.toBeNull();
        expect(ids(app).filter(id => id.startsWith('column:')).length).toBeGreaterThanOrEqual(3);
    });

    it('NEGATIVE — a stated rule is still a criterion for a site', () => {
        //  «ولا تشيل أي قسم أطلبه» is a condition he stated, and a site can
        //  be judged on it. Only the TABLE-shaped criteria are impossible.
        expect(ids(HIS_SENTENCE).some(id => id.startsWith('rule:'))).toBe(true);
    });

    it('NEGATIVE — a bare app request with no site noun is untouched', () => {
        const plain = 'اعمل لي تطبيق حجوزات فيه اسم الزبون والتاريخ والحالة';
        expect(ids(plain).filter(id => id.startsWith('column:')).length).toBeGreaterThan(0);
    });
});
