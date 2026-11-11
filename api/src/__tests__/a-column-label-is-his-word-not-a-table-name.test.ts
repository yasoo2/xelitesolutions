/**
 * A COLUMN'S LABEL IS HIS WORD, IN HIS NUMBER — NOT A TABLE'S NAME.
 *
 * Round 21 review of 7c4273e6: englishFor, which labels COLUMNS, asked the
 * curated TABLE list first, so a column «الموظف» (the employee) was labelled
 * "employees", «الفاتورة» "invoices", «المورد» "suppliers". It took one word
 * it knew for a whole label («اسم الموظف» → "employee", «قائمة المواعيد» →
 * "menu"); its suffix stripping turned «القراءة» (reading) into "readers";
 * and the dictionary gained «مرشح» and «كفالة», whose English depends on the
 * business — the kind of word the same commit said must be left out. And
 * «الحيوانات» was keyed `pets` while it was labelled "animals".
 */
import { curatedNounKey } from '../core/design/named-entities';
import { englishFor, inferModel, keyForPhrase, tableEnglishFor } from '../core/design/entity-inference';
import { englishPhrase, englishSubject } from '../core/design/subject-translation';

const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';

describe('a column is labelled in his number', () => {
    it('a singular label stays singular — the table list names tables only', () => {
        expect(englishFor('الموظف')).toBe('employee');
        expect(englishFor('الفاتورة')).toBe('invoice');
        expect(englishFor('الفاتوره')).toBe('invoice');
        expect(englishFor('المورد')).toBe('supplier');
        // «الطلب» is an order, a request or an application: unknown, never `orders`.
        expect(englishFor('الطلب')).toBeNull();
    });

    it('the one table he described keeps its columns\' own English', () => {
        const [table] = inferModel('بدي جدول للمشتريات فيه الموظف والمورد والفاتورة').entities;
        expect(table.key).toBe('purchases');
        expect(table.en).toBe('purchases');
        expect(table.fields.map(f => [f.ar, f.en])).toEqual([['الموظف', 'employee'], ['المورد', 'supplier'], ['الفاتورة', 'invoice']]);
    });

    it('a table\'s English is the table\'s, and agrees with its key', () => {
        expect(tableEnglishFor('المرضى')).toBe('patients');
        expect(tableEnglishFor('الموظف')).toBe('employees');
        expect(tableEnglishFor('قائمة المواعيد')).toBe('appointments');
        const patients = inferModel(P101).entities.find(e => e.key === 'patients');
        expect(patients?.en).toBe('patients');
    });

    it('«الحيوانات» has one English name, as key and as label', () => {
        expect([curatedNounKey('الحيوانات'), keyForPhrase('الحيوانات'), tableEnglishFor('الحيوانات'), englishFor('الحيوانات')])
            .toEqual(['animals', 'animals', 'animals', 'animals']);
        expect(keyForPhrase('pets')).toBe('pets');
        expect(curatedNounKey('الحيوانات الأليفة')).toBe('pets');
    });
});

describe('the English of a label is the English of all of it', () => {
    it('a word it knows never stands in for the label', () => {
        expect(englishFor('اسم الموظف')).toBeNull();
        expect(englishFor('قائمة المواعيد')).toBeNull();
        expect(englishFor('عقود الإيجار')).toBeNull();
    });

    it('every word known: the English, in English order', () => {
        expect(englishFor('شركات الشحن')).toBe('shipping companies');
        expect(englishPhrase('حاويات الشحن')).toBe('shipping containers');
        expect(englishFor('الموظفين')).toBe('employees');
    });
});

describe('a suffix that changes what the word counts lands on the same word', () => {
    it('reading is not readers — in either spelling, singular or plural', () => {
        for (const w of ['القراءة', 'القراءه', 'القراءات']) expect([w, englishFor(w)]).toEqual([w, null]);
        expect(englishSubject('نادي القراءة').query).not.toMatch(/readers/);
        expect(englishFor('الكتابة')).not.toBe('book');
    });

    it('…while a real ending still comes off: readers, an engineer (f.), my services, an adjective in -ية', () => {
        expect(englishFor('القراء')).toBe('readers');
        expect(englishSubject('مهندسة في موقع بناء').query).toContain('engineer');
        expect(englishSubject('خدماتي').query).toBe('services');
        expect(englishFor('البرمجية')).toBe('software');
    });
});

describe('a word whose English depends on the business is not guessed', () => {
    it('«مرشح» is a candidate or a filter; «كفالة» a sponsorship, a warranty or bail', () => {
        expect(englishFor('المرشح')).toBeNull();
        expect(englishSubject('مرشح مياه').query).not.toMatch(/candidate/);
        expect(englishFor('المرشحات')).toBeNull();
        expect(englishFor('الكفالة')).toBeNull();
        expect(englishFor('الكفالات')).toBeNull();
        expect(curatedNounKey('الكفالات')).toBe('');
        expect(keyForPhrase('الكفالات')).not.toMatch(/^(?:warranties|sponsorships)$/);
    });

    it('…and the unambiguous forms are still known', () => {
        expect(englishFor('المرشحين')).toBe('candidates');
        expect(curatedNounKey('المرشحون')).toBe('candidates');
        expect(curatedNounKey('warranties')).toBe('warranties');
    });
});
