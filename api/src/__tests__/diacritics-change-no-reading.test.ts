/**
 * HARAKAT AND TATWEEL CHANGE NO READING.
 *
 * «كيفَ يعملُ الزرُّ؟ ثمَّ أصلِحْهُ» is «كيف يعمل الزر؟ ثم أصلحه»: the marks say
 * how the letters sound, never which request it is. Most readers stripped
 * them — each for itself, somewhere in its middle — and three did not:
 *
 *   • deniesEveryFileChange was asked with the text as he wrote it, so «لا
 *     تُعدِّل الملفات» denied nothing and «لا تعـدل الملفات» (a tatweel) neither;
 *   • the repair reader matched «أصلح» and «عدّل» as listed spellings: «أصلِحِ
 *     الكود» was no repair, and «عدِّل» with its kasra was not «عدّل»;
 *   • the exclusion reader ran on the marked text before the canonical line
 *     was made, and the column reader was handed the marks too (three columns
 *     became two).
 *
 * Now every public reader strips the marks once, at its door — U+064B–U+0652,
 * the dagger alef U+0670, the tatweel U+0640 — and everything behind the door
 * sees letters. Each sentence below is read plain, then with marks put on it
 * four ways and as a person would write them, and every reading must be the
 * same.
 */
import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { hasRequestedAction, deniesEveryFileChange, stripScopedExclusions, withoutNegatingMa, ordersInALaterSentence, LATER_DEED_ORDER } from '../core/intelligence/requested-action';
import { isBuildRequest, isKnowledgeQuestionStructural, isReadOnlyStructural, isWebOrder, isBrowserRequest, isExistingSoftwareRepairRequest, asksForAThingThatHolds, classifyIntent } from '../core/intelligence/intent-classifier';
import { stripArabicDiacritics } from '../core/orchestrator/promptNormalizer';

let routeToModel: jest.SpyInstance;
beforeAll(() => { routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('no model in this test')); });
afterAll(() => routeToModel.mockRestore());

const LETTER = /[ء-ي]/u;
/** Marks put on a sentence four ways: a fatha on every letter, a tatweel inside every word, a shadda and kasra closing every word, a sukun between letters. */
const marked: Array<[string, (text: string) => string]> = [
    ['a fatha on every letter', t => [...t].map(c => (LETTER.test(c) ? `${c}َ` : c)).join('')],
    ['a tatweel inside every word', t => t.replace(/([ء-ي]{2})(?=[ء-ي])/gu, '$1ـ')],
    ['a shadda and kasra closing every word', t => t.replace(/([ء-ي])(?![ء-ي])/gu, '$1ِّ')],
    ['a sukun between letters', t => t.replace(/([ء-ي])([ء-ي])/gu, '$1ْ$2')],
    ['a dagger alef and a tanween', t => t.replace(/([ء-ي])(?=\s|$)/gu, '$1ً').replace(/ذ/gu, 'ذٰ')],
];

function readings(text: string) {
    return {
        requested: hasRequestedAction(text),
        deniesEveryFileChange: deniesEveryFileChange(text),
        build: isBuildRequest(text),
        question: isKnowledgeQuestionStructural(text),
        readOnly: isReadOnlyStructural(text),
        webOrder: isWebOrder(text),
        browser: isBrowserRequest(text),
        repair: isExistingSoftwareRepairRequest(text),
        holds: asksForAThingThatHolds(text),
        deedAfterQuestion: ordersInALaterSentence(text, LATER_DEED_ORDER),
        withoutExclusions: stripScopedExclusions(text),
        askingMa: withoutNegatingMa(stripArabicDiacritics(text)),
    };
}

const sentences = [
    'كيف يعمل الزر؟ ثم أصلحه',
    'كيف أنشر المشروع؟ انشره الآن',
    'ليش الموقع بطيء؟ صلحه',
    'كيف أحذف الملف؟ احذفه',
    'كيف أحسن أداء موقعي؟ افحصه',
    'كيف حالك؟ ابني لي موقع لمطعمي',
    'ما هذا الخطأ؟ أصلحه من فضلك',
    'لماذا لا يعمل النموذج؟ عدله',
    'ما الفرق بين React و Vue؟',
    'ما هي أفضل قاعدة بيانات؟',
    'كيف أربي ابني؟ ابني عنيد جدا',
    'الزر ما بيشتغل، صلحه',
    'الصفحة ما تفتح صلحها',
    'ليش الزر ما بيشتغل',
    'ما عم يشتغل الزر، صلحه',
    'بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة',
    'عايز أعرف مين اشترى، اعمل صفحة تعرض الطلبات',
    'لا تعدل أو تحذف أي ملف',
    'لا تعدل ولا تحذف أي ملف',
    'لا تعدل الملفات',
    'لا تنشئ الملفات',
    'لا تنشئ ولا تعدل ولا تحذف أي شي',
    'لا تعدل ملف الإعدادات',
    'راجع الكود، لا تعدل ملفات موقعي',
    'لا تعدل ملفات أخرى، فقط أنشئ ملف notes.txt فيه كلمة مرحبا',
    'غير العنوان ولا تعدل أو تحذف أي ملف آخر',
    'لا تنشئ مشروعا جديدا، شغل المشروع الحالي',
    'أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد',
    'غير لون الزر للأحمر ولا تنشئ صفحة جديدة',
    'صف لي متجر مثالي بدون بناء موقع',
    'اشرح المنهج أولا ثم ابن متجرا',
    'اشرح لي كيف أبني متجرا',
    'ابن لي موقعا لمطعمي',
    'أنشئ تطبيقا لإدارة المهام',
    'أصلح الكود في الدالة',
    'عدل الكود',
    'ابحث في ملفات المشروع عن الدالة',
    'ابحث لي عن سعر الدولار اليوم',
    'سجل دخول على جيت هاب',
    'اضغط على الزر',
    'جدول مصاريف فيه التاريخ والمبلغ والتصنيف',
    'بدي جدول فيه اسم المريض ورقم تلفونه',
    'هل يمكنك تصميم صفحة هبوط؟',
    'للقراءة فقط',
    'اشرح فقط',
    'لخص الملف ثم شغل الاختبارات',
    'ابدأ التصميم',
    'أريد تصميم موقع شركة',
    'تطبيق البنك: بطيء وثقيل ويستهلك البطارية',
    'نظام فواتير للمحل مع تقارير',
];

describe('marks on the letters change no reading', () => {
    it.each(sentences)('%s', async (plain) => {
        const expected = readings(plain);
        const classified = { ...(await classifyIntent(plain)), at: 0 };
        for (const [how, mark] of marked) {
            const written = mark(plain);
            expect(stripArabicDiacritics(written)).toBe(plain);
            expect({ how, ...readings(written) }).toEqual({ how, ...expected });
            expect({ how, ...(await classifyIntent(written)), at: 0 }).toEqual({ how, ...classified });
        }
    });
});

describe('written the way a person writes them', () => {
    const pairs: Array<[string, string]> = [
        ['كيف يعمل الزر؟ ثم أصلحه', 'كيفَ يعملُ الزرُّ؟ ثمَّ أصلِحْهُ'],
        ['كيف أنشر المشروع؟ انشره الآن', 'كيفَ أنشرُ المشروعَ؟ انشُرْهُ الآنَ'],
        ['ليش الموقع بطيء؟ صلحه', 'ليشْ الموقعُ بطيءٌ؟ صلِّحْهُ'],
        ['الزر ما بيشتغل، صلحه', 'الزرُّ ما بيشتغلْ، صلِّحْهُ'],
        ['لا تعدل الملفات', 'لا تُعدِّلِ الملفاتِ'],
        ['لا تعدل الملفات', 'لا تعـــدل الملفـــات'],
        ['لا تعدل أو تحذف أي ملف', 'لا تُعدِّلْ أو تحذِفْ أيَّ ملفٍ'],
        ['أصلح الكود في الدالة', 'أصلِحِ الكودَ في الدالّةِ'],
        ['عدل الكود', 'عدِّلِ الكودَ'],
        ['غير لون الزر للأحمر ولا تنشئ صفحة جديدة', 'غيِّرْ لونَ الزرِّ للأحمرِ ولا تُنشئْ صفحةً جديدةً'],
        ['بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة', 'بدّي أعرفَ كم صرفتُ، اعملي جدول فيه التاريخُ والمبلغُ والفئةُ'],
        ['صف لي متجر مثالي بدون بناء موقع', 'صِفْ لي متجر مثالي بدونِ بناءِ موقعٍ'],
    ];

    it.each(pairs)('%s == %s', async (plain, written) => {
        expect(stripArabicDiacritics(written)).toBe(plain);
        expect(readings(written)).toEqual(readings(plain));
        // The front door: answered, built, sent to the browser, or denied — the same either way.
        const route = (intent: any) => ({
            answered: (intent.requiredTools || []).includes('central_answer'),
            built: (intent.requiredTools || []).includes('project_pipeline'),
            browsed: (intent.requiredTools || []).includes('browser_run'),
            noFileChanges: !!intent.rawIntent?.noFileChanges,
        });
        expect(route(await IntentParser.parse(written, {} as any))).toEqual(route(await IntentParser.parse(plain, {} as any)));
    });

    it('a question then an order is read whole, marked or not', async () => {
        for (const text of ['كيف يعمل الزر؟ ثم أصلحه', 'كيفَ يعملُ الزرُّ؟ ثمَّ أصلِحْهُ']) {
            expect(isKnowledgeQuestionStructural(text)).toBe(false);
            expect(((await IntentParser.parse(text, {} as any)).requiredTools || [])).not.toContain('central_answer');
        }
    });

    it('the denial and the repair no longer depend on a listed spelling of the marks', () => {
        expect(deniesEveryFileChange('لا تُعدِّلِ الملفاتِ')).toBe(true);
        expect(deniesEveryFileChange('لا تعـــدل الملفـــات')).toBe(true);
        expect(deniesEveryFileChange('لا تُنشئْ ولا تُعدِّلْ ولا تحذِفْ أيَّ شيءٍ')).toBe(true);
        expect(isExistingSoftwareRepairRequest('أصلِحِ الكودَ في الدالّةِ')).toBe(true);
        expect(isExistingSoftwareRepairRequest('عدِّلِ الكودَ')).toBe(true);
    });
});
