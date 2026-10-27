/**
 * A RECORD HE NAMED IS KEYED IN ENGLISH, NOT TRANSLITERATED.
 *
 * Eval run500 (P101-api-ar, 2026-10-26): «… لعيادة أسنان فيها نقاط وصول
 * لـالمرضى والمواعيد والعلاجات …» was built with the tables and routes
 * patients · appointments · alajats — «العلاجات» was in neither dictionary,
 * so its key fell to transliteration, and the eval found «no route or
 * resource: treatments». Measured across the suite's 250 Arabic requests,
 * about seventy ordinary record nouns met the same fate («الجلسات» jlsats,
 * «المتبرعين» mtbrayns, «التذاكر» tdhakrs …).
 *
 * And for a noun the curated list does know, the key and the label read
 * different dictionaries: «المرضى» was keyed `patients` but labelled
 * «المرضى» in English.
 */
import { englishFor, inferModel } from '../core/design/entity-inference';
import { namedEntities } from '../core/design/named-entities';
import { englishSubject } from '../core/design/subject-translation';

const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';

describe('a record he named is keyed in English, not transliterated', () => {
    it('the dental clinic API gets a treatments table, not alajats', () => {
        expect(namedEntities(P101).map(e => e.key)).toEqual(['patients', 'appointments', 'treatments']);
        const treatments = namedEntities(P101).find(e => e.key === 'treatments');
        expect(treatments?.en).toBe('treatments');
        expect(treatments?.ar).toBe('العلاجات');
    });

    it('a curated noun has the same English as its key', () => {
        expect(englishFor('المرضى')).toBe('patients');
        expect(englishFor('المواعيد')).toBe('appointments');
        const patients = inferModel(P101).entities.find(e => e.key === 'patients');
        if (patients) expect(patients.en).toBe('patients');
    });

    it('ordinary record nouns of other systems read as English plurals', () => {
        const cases: Array<[string, string]> = [
            ['الجلسات', 'sessions'], ['التذاكر', 'tickets'], ['المتبرعين', 'donors'],
            ['التبرعات', 'donations'], ['الحيوانات', 'animals'], ['التطعيمات', 'vaccinations'],
            ['المدربين', 'trainers'], ['الاشتراكات', 'subscriptions'], ['التعليقات', 'comments'],
            ['المباريات', 'matches'], ['الشكاوى', 'complaints'], ['النزلاء', 'guests'],
        ];
        for (const [ar, en] of cases) expect([ar, englishFor(ar)]).toEqual([ar, en]);
    });

    it('a noun whose English depends on the business is not guessed', () => {
        // «الوصفات» is recipes in a kitchen and prescriptions in a pharmacy.
        expect(englishFor('الوصفات')).toBeNull();
        expect(englishSubject('باقة ورد').query).not.toMatch(/package/);
    });
});
