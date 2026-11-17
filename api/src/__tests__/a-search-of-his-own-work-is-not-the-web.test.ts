/**
 * «ابحث في اللوج عن الخطأ 500» IS A SEARCH OF HIS OWN WORK, NOT OF THE WEB.
 *
 * isWebOrder (2026-11-11) keeps an unmistakable web order on the browser:
 * «ابحث لي عن سعر الدولار اليوم» had lost it to a capability guess. Its list of
 * words that name his own workspace knew files, folders and code, and not what
 * lives in them: "Search for TODO comments and list them", «ابحث في اللوج عن
 * الخطأ 500», "search for the bug … and fix it", «ابحث عن كل الأخطاء في التطبيق
 * وأصلحها» were sent to the browser to search the internet for his bug.
 *
 * What is his is what he names as his: a TODO, a comment, the log, «الأخطاء»,
 * "the bug", "my app", «في التطبيق», «موقعي». A site with a name — «في موقع
 * أمازون», "the website" — is anybody's, and a search of it is still the web.
 */
import { isWebOrder } from '../core/intelligence/intent-classifier';

describe('a search of his own work', () => {
    it.each([
        'Search for TODO comments and list them',
        'ابحث في اللوج عن الخطأ 500',
        'search for the bug in the checkout and fix it',
        'ابحث عن كل الأخطاء في التطبيق وأصلحها',
        'ابحث في ملفات المشروع عن الدالة X',
        'search my website for broken links',
    ])('%s is not a web order', text => {
        expect(isWebOrder(text)).toBe(false);
    });

    it.each([
        'ابحث لي عن سعر الدولار اليوم',
        'ادخل على جيت هاب وشوف آخر إشعارات',
        'تصفّح الويب ولخّص لي أول نتيجة',
        'ابحث في موقع أمازون عن سماعات بلوتوث',
        'search the web for the best coffee in Amman',
        'visit example.com and read the title',
        'ابحث عن أفضل مطعم في عمّان',
        'Search for flights to Dubai next week',
    ])('%s is still a web order', text => {
        expect(isWebOrder(text)).toBe(true);
    });
});
