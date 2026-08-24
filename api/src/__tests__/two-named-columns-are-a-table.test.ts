/**
 *  TWO NAMED COLUMNS ARE A TABLE WHEN HE NAMED THE TABLE.
 *
 *  Live round, and the whole shape of the failure:
 *
 *      «بدي جدول للكتب فيه العنوان والسعر»
 *      → derivedColumns: 0 columns
 *      → template classification: page=generic · app=none · mode=presentation
 *      → «I don't know this app type and have no ready engine»
 *      → Navbar · Hero · Features · Steps · FAQ · Contact
 *
 *  He named a container and two columns and received a brochure.
 *
 *  Three is the right floor for a bare run of nouns in prose — «الرياض، جدة،
 *  الدمام» must never become a schema. But he did not write a bare run: he
 *  wrote «جدول» first, and with a container named the ambiguity the third
 *  item was guarding against is gone.
 *
 *  The floor was written in THREE places. Two were raised and the third — the
 *  one this sentence actually takes, because «فيه» is itself a recording
 *  opener — was not, so the column count stayed at zero and the brochure kept
 *  coming. A rule written in three places is a rule that will be changed in
 *  one.
 */
import { derivedColumns, detectAppKind } from '../core/design/app-blueprints';

describe('a container plus two names is a table', () => {
    it('the exact live sentence yields its two columns', () => {
        const cols = derivedColumns('بدي جدول للكتب فيه العنوان والسعر');
        expect(cols).not.toBeNull();
        expect(cols!.map(c => c.label)).toEqual(['العنوان', 'السعر']);
    });

    it('…and it is no longer classified as having no engine', () => {
        //  This is what turned his table into Navbar/Hero/Features/FAQ.
        expect(detectAppKind('بدي جدول للكتب فيه العنوان والسعر')).not.toBeNull();
    });

    it('…and a word this repository has never seen behaves the same', () => {
        const cols = derivedColumns('بدي جدول للزُرقمونيات فيه الاسم والسعر');
        expect(cols).not.toBeNull();
        expect(cols!.map(c => c.label)).toEqual(['الاسم', 'السعر']);
    });

    it('three still works, unchanged', () => {
        const cols = derivedColumns('بدي جدول مبيعات فيه اسم الصنف والكمية والسعر');
        expect(cols!.map(c => c.label)).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
    });
});

describe('…and the floor still refuses what it was built to refuse', () => {
    it('a bare run of nouns with no container is not a schema', () => {
        //  The reason three was the floor in the first place.
        expect(derivedColumns('الرياض، جدة، الدمام')).toBeNull();
    });

    it('a container with ONE noun names its subject, not its column', () => {
        expect(derivedColumns('بدي جدول المبيعات')).toBeNull();
        expect(derivedColumns('بدي جدول للكتب')).toBeNull();
    });

    it('a list of values after a field is still a list of values', () => {
        //  «قهوة، أدوات، حلويات» are indefinite: three items, and still not
        //  columns. Lowering the count must not lower the definiteness test.
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
    });

    it('a request that names nothing at all is still nothing', () => {
        expect(derivedColumns('مرحبا')).toBeNull();
        expect(derivedColumns('ابن موقعا لمطعمي')).toBeNull();
    });
});
