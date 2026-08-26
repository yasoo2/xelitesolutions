/**
 *  THE THING HE NAMED, NOT THE SENTENCE HE SAID IT IN.
 *
 *  Measured on his machine:
 *
 *      subjectPhrase(«بدي جدول مبيعات فيه اسم الصنف والكمية والسعر،
 *                     والسعر لا يقبل صفر»)
 *        → «بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر»
 *
 *  The function that is supposed to extract the SUBJECT handed back the whole
 *  request. It then became the app's title and its entity name, so his
 *  generated app was called by the sentence that asked for it, cut at
 *  thirty-seven characters in the middle of his own list.
 *
 *  A function that cannot fail is the same defect as a criterion that cannot
 *  fail: it always returns something, so nothing ever looks wrong.
 *
 *  Arabic says it plainly and so does English — «جدول مبيعات» is a table OF
 *  sales, «a clients table» is the same words in the other order. That is
 *  grammar, not a catalogue.
 */
import { subjectPhrase, subjectAfterContainer } from '../core/design/subject-phrase';

describe('the subject is the noun beside the container', () => {
    it('the exact live sentence', () => {
        expect(subjectPhrase('بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر')).toBe('مبيعات');
    });

    it('…and the preposition belonged to his sentence, not to the name', () => {
        //  «للكتب» is «ل» + «الكتب» with the alef elided.
        expect(subjectPhrase('بدي جدول للكتب فيه العنوان والسعر')).toBe('الكتب');
    });

    it('…and a word this repository has never seen reads the same way', () => {
        //  If a catalogue were doing the reading, this would come back as the
        //  whole sentence again.
        expect(subjectPhrase('بدي جدول للزُرقمونيات فيه الاسم والكمية')).toBe('الزُرقمونيات');
    });

    it('English puts it on the other side, and it is still read', () => {
        expect(subjectPhrase('A clients table with name, phone and address')).toBe('clients');
    });
});

describe('…and it refuses rather than inventing', () => {
    it('a request with no container is left to the older reading', () => {
        //  The negative: this must not hijack a sentence that names no
        //  container. «ابنِ موقعاً لمطعمي» has no table, list or ledger in it.
        expect(subjectAfterContainer('ابنِ موقعاً لمطعمي')).toBe('');
    });

    it('a container with nothing beside it yields nothing', () => {
        expect(subjectAfterContainer('بدي جدول')).toBe('');
        expect(subjectAfterContainer('I want a table')).toBe('');
    });

    it('a clause is never a name', () => {
        //  The whole defect in one assertion: whatever comes back, it is not
        //  the sentence.
        const long = 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر';
        expect(subjectAfterContainer(long).length).toBeLessThan(20);
        expect(subjectAfterContainer(long)).not.toBe(long);
    });
});
