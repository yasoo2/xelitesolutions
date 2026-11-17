/**
 * The sixth pre-merge review (2026-11-12) of the readers of every request:
 *
 *  A. «… without changing anything» beside a request for words lost its denial — the
 *     request was built, or handed to a tool. A bare «anything» denies every change
 *     unless its sentence opens with one of the closed verbs that change his work.
 *  L1. The dialects' denial of every file change beside an inspection of his project
 *     («بدون ما تعدل أي ملف، افحص المشروع») is the read-only inspection, in every reader.
 *  L2. «بدون تغيير <one thing>» beside an order is what the change leaves alone, never a
 *     declared read-only request.
 *  M5. An order that carries a prohibition or a second deed is still the order,
 *     not a fault report.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = 'test';

import { hasRequestedAction, deniesEveryFileChange, deniesEveryFileChangeInHisDialect, stripScopedExclusions } from '../core/intelligence/requested-action';
import { isReadOnlyStructural, reportsAFaultOrOrdersAFix, isBuildRequest, isWebOrder, isBrowserRequest, classifyIntent, clearIntentCache } from '../core/intelligence/intent-classifier';
import { isReadOnlyRequest } from '../core/orchestrator/buildIntent';
import { IntentParser } from '../core/intelligence/IntentParser';

describe('A — «without changing anything» beside words is still a denial of every change', () => {
    it.each([
        'Evaluate the design without changing anything',
        'Could you evaluate the design without changing anything?',
        'I want your opinion on the footer without changing anything',
        'I would like your opinion on the layout without changing anything',
        'Rate my design without changing anything',
        'Comment on the code without changing anything',
        'A code review please, without changing anything',
        'Quick question without changing anything: why is the build slow',
        'Without changing anything, I want to know why login fails',
        'Is the build ok? Check without changing anything',
        'Generate a report without changing anything',
        'Document the API without changing anything',
        'Benchmark the API without changing anything',
        'Draft a plan without changing anything',
        'Do a security audit without modifying anything',
        'Debug the login without changing anything',
        'Reproduce the bug without changing anything',
        'Take a look at the header without touching anything',
        'Estimate the work without changing anything',
        'Think about the layout without changing anything',
        'Need a review of the code without changing anything',
        'Your opinion on the design without changing anything',
        'Recommend a color palette without changing anything',
        'Help me pick a font without changing anything',
        'Only look, without changing anything',
        // a head this reader has no word for is denied, never built
        'Brainstorm names without touching a thing',
        'Sanity-check the pricing page without changing anything at all',
        'Make a plan without changing anything',
        'The button looks off. Thoughts? Without changing anything',
    ])('%s → no file may change, nothing is built and no tool is named', async text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(true);
        expect(read.isNoFileChanges).toBe(true);
        expect(read.hasAffirmativeAction).toBe(false);
        expect(deniesEveryFileChange(text)).toBe(true);
        expect(isBuildRequest(text).isBuild).toBe(false);
        clearIntentCache();
        const intent = await classifyIntent(text);
        expect(intent.isBuild).toBe(false);
    });

    it.each([
        'Move the button to the left without touching anything',
        'Fix the typo without changing the layout',
        'Refactor utils.js without changing anything about its behavior',
        'Deploy without changing anything',
        'Without changing anything else, fix the header',
        'Can you make the button blue without changing anything else?',
        'Add dark mode without changing any files except style.css',
        'Make the button blue without changing anything',
        'Please fix the header without changing a thing',
        'I want you to fix the footer without changing anything',
        'Rename the file without touching anything else',
        'Clean up the CSS without changing anything',
        'Update the footer text without modifying anything in the header',
        'Translate the page to Arabic without changing anything',
        'Build a todo app without changing anything',
        'The header is ugly. Fix it without changing anything',
        // one thing kept beside an order this reader has no verb for: still the exclusion it was
        'Polish the homepage without changing the layout',
    ])('%s → an order with what it leaves alone, no denial', text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(read.isAnswerOnly).toBe(false);
        expect(read.isNoFileChanges).toBe(false);
        expect(deniesEveryFileChange(text)).toBe(false);
    });

    it('the order beside the exclusion keeps its tool', () => {
        expect(IntentParser.quickIntent('Deploy without changing anything')?.requiredTools).toEqual(['deploy_pages']);
        expect(IntentParser.quickIntent('Refactor utils.js without changing anything about its behavior')?.requiredTools).toEqual(['auto_refactor']);
    });

    it.each([
        // one thing kept beside a judgement or a reading: the denial it was
        'Evaluate the design without changing the layout',
        'I want your opinion on the footer without changing the layout',
        'Describe the grid without changing the layout',
        'How can I fix the typo without changing the layout?',
        // the sentence the phrase stands in governs it, not the one before
        'Fix it later. Without changing anything, tell me why it broke',
        'Check the build without changing anything and deploy it',
    ])('%s → still a denial', text => {
        expect(hasRequestedAction(text).hasDenial).toBe(true);
        expect(isBuildRequest(text).isBuild).toBe(false);
    });

    it('a review of his project under «without changing anything» is still the read-only inspection', () => {
        for (const text of ['Review the repo without changing anything', 'Without changing any files, review the project', 'Review the project without changing anything in the repo']) {
            const read = hasRequestedAction(text);
            expect(read.hasDenial).toBe(true);
            expect(read.isNoFileChanges).toBe(false);
            expect(read.denialReason).toBe('explicit read-only request');
            expect(isReadOnlyStructural(text)).toBe(true);
            expect(isReadOnlyRequest(text)).toBe(true);
        }
    });

    it('the pipeline\'s boundary reads a judgement as words too', () => {
        expect(isReadOnlyRequest('Evaluate the design without changing anything')).toBe(true);
        expect(isReadOnlyRequest('I want your opinion on the footer without changing any files')).toBe(true);
        expect(isReadOnlyRequest('Move the button to the left without touching anything')).toBe(false);
    });

    it('a quoted «without changing anything» is copy', () => {
        expect(deniesEveryFileChange('Add a banner that says "without changing anything" to the page')).toBe(false);
    });
});

describe('L1 — the dialects\' denial of every file change beside an inspection is the read-only inspection', () => {
    it.each([
        'بدون تعديل أي ملف، افحص المشروع',
        'بدون ما تعدل أي ملف، افحص المشروع',
        'من غير ما تغير أي ملف، راجع المشروع وقل لي المشاكل',
        'ما تعدلش أي ملف، افحص المشروع',
        'متعدلش أي ملف وراجع المشروع',
        'افحص المشروع بدون ما تعدل أي ملف',
        'راجع المشروع ومتغيرش أي ملف',
        'بدونِ ما تُعدّل أي ملف، اِفحص المشروع',
    ])('%s', async text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(true);
        expect(read.isAnswerOnly).toBe(false);
        expect(read.isNoFileChanges).toBe(false);
        expect(read.denialReason).toBe('explicit read-only request');
        expect(isReadOnlyStructural(text)).toBe(true);
        expect(isReadOnlyRequest(text)).toBe(true);
        clearIntentCache();
        expect((await classifyIntent(text)).isReadOnly).toBe(true);
    });

    it('beside words only it is answered, beside an order to create it is the order, and the «ما» that relates denies nothing', () => {
        const words = hasRequestedAction('بدون ما تغير أي ملف، اشرح لي الهيدر');
        expect(words.isNoFileChanges).toBe(true);
        const create = 'ما تعدلش أي ملف، اعملي صفحة جديدة للتواصل';
        expect(hasRequestedAction(create).hasAffirmativeAction).toBe(true);
        expect(isReadOnlyStructural(create)).toBe(false);
        expect(deniesEveryFileChangeInHisDialect('بعد ما تعدل الملفات شغل المشروع')).toBe(false);
        expect(isReadOnlyStructural('بعد ما تعدل الملفات شغل المشروع')).toBe(false);
        // one thing named is no denial of every file change
        expect(isReadOnlyStructural('كبر الخط بدون ما تغير ملف الإعدادات')).toBe(false);
    });
});

describe('L2 — «بدون تغيير <one thing>» beside an order is an exclusion, not a read-only request', () => {
    it.each([
        'كبر الخط دون تغيير الألوان',
        'غير لون الزر بدون تغيير الخط',
        'صغر الشعار من دون تعديل الهيدر',
        'حرك الزر لليمين من غير تغيير الألوان',
        'أضف زر واتساب بدون تعديل التصميم',
        'صلح الزر بدون تعديل التصميم',
        'حدث النص من دون تعديل على الألوان',
        'لون الزر بالأحمر بدون تغيير حجمه',
        'ترجم الصفحة دون تغيير التنسيق',
        'شيل الصورة بدون تغيير الترتيب',
        'خلي الزر أحمر بدون تغيير الخط',
        'ممكن تكبر الخط بدون تغيير الألوان',
        'اجعل العنوان أكبر دون تعديل الألوان',
        'غير الخط دون تغيير أي شيء آخر',
        'كبّر الخطَّ دونَ تغييرِ الألوان',
    ])('%s → an order', async text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(isReadOnlyStructural(text)).toBe(false);
        expect(isReadOnlyRequest(text)).toBe(false);
        clearIntentCache();
        expect((await classifyIntent(text)).isReadOnly).toBe(false);
    });

    it.each([
        // the files, the code, the project, anything — or nothing named
        'صلح الزر بدون تعديل أي ملف',
        'غير لون الزر بدون تعديل الكود',
        'راجع المشروع دون تعديل المشروع',
        'كبر الخط دون تغيير أي شيء',
        'افحص الموقع بدون تغيير أي شيء',
        'عدل العنوان بدون تغيير',
        'دون تعديل',
        // one thing beside a reading or a request for words
        'اشرح الهيدر دون تغيير الألوان',
        'راجع التصميم بدون تغيير الألوان',
        'قيم التصميم بدون تغيير الألوان',
    ])('%s → the denial it was', text => {
        expect(isReadOnlyStructural(text)).toBe(true);
    });

    it('a part that is not to be made is still excluded, and the order beside it stands', () => {
        expect(isReadOnlyStructural('طور نفس المشروع الحالي دون إنشاء مشروع جديد: أضف شعارا')).toBe(false);
        expect(stripScopedExclusions('كبر الخط دون تغيير الألوان')).not.toContain('دون');
        expect(stripScopedExclusions('اشرح الهيدر دون تغيير الألوان')).toContain('دون تغيير');
    });
});

describe('M5 — an order with a prohibition or a second deed is not a fault report', () => {
    it.each([
        'Deploy changes do not wait',
        "Run tests don't deploy",
        'Run tests do not deploy',
        "Run migrations don't seed",
        "Send emails don't wait",
        "Install dependencies don't update the lockfile",
        'افتح الصفحة وخذ لقطة، الزر مش شغال',
        'ادخل الصفحة وخذ سكرين شوت الزر لا يعمل',
        'ادخل على الصفحة والتقط صورة للشاشة، الزر ما يشتغل',
        'Open the page and take a screenshot, the button is not working',
        'Go to the settings page and take a screenshot. The save button doesn\'t work',
        'Go to the login page and capture it, the form doesn\'t work',
    ])('%s → the order', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
    });

    it.each([
        'افتح الصفحة تلاقي الزر ما يشتغل',
        'افتح الصفحة، الزر مش شغال',
        'ادخل على صفحة الدفع، الزر ما يشتغل',
        'تفتح الصفحة لكن الزر ما يشتغل',
        'Search by name is not working',
        'Go to the settings page, the save button doesn\'t work',
        'Open the page and click the button, it is not working',
        'Deploy preview is not working',
        'Deploy still fails',
        'Upload validation fails',
        "Email notifications don't arrive",
        "Search filters don't work",
        "Push notifications don't show on mobile",
        "Deploy hooks don't run",
        'نزل الصورة، الزر لا يعمل',
        'اللي مش شغال هو البحث',
        'The thing that isn\'t working is the search',
        // Still a fault on purpose: as an order its tool would be named from the «search» of its remark.
        'Deploy anyway even though search is broken',
    ])('%s → still a fault', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(true);
    });

    it('the order keeps its route, and a fault names no tool', () => {
        expect(IntentParser.quickIntent('Deploy changes do not wait')?.requiredTools).toEqual(['deploy_pages']);
        expect(IntentParser.quickIntent('افتح الصفحة وخذ لقطة، الزر مش شغال')?.requiredTools).toEqual(['browser_fullpage_shot']);
        expect(isBrowserRequest('Go to the login page and capture it, the form doesn\'t work').isBrowser).toBe(true);
        expect(IntentParser.quickIntent('Deploy anyway even though search is broken')).toBeNull();
        expect(isWebOrder('Deploy anyway even though search is broken')).toBe(false);
        expect(IntentParser.quickIntent('افتح الصفحة تلاقي الزر ما يشتغل')).toBeNull();
    });
});

describe('the new readings are linear', () => {
    const cpuMs = (run: () => void): number => {
        const before = process.cpuUsage();
        run();
        const used = process.cpuUsage(before);
        return (used.user + used.system) / 1000;
    };
    const rep = (unit: string, size: number) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
    it.each<[string, (n: number) => string]>([
        ['«without changing anything» in every sentence', n => rep('Evaluate the design without changing anything. ', n)],
        ['«without changing anything» with no sentence mark', n => rep('evaluate the design without changing anything ', n)],
        ['a long lead before the denial', n => rep('please ', n) + 'evaluate the design without changing anything'],
        ['«دون تغيير» in every clause', n => rep('كبر الخط دون تغيير الألوان، ', n)],
        ['«بدون تغيير» with no mark', n => 'غير لون الزر ' + rep('بدون تغيير ', n) + 'الخط'],
        ['the dialects\' denial', n => rep('ما تعدلش أي ملف، ', n) + 'افحص المشروع'],
        ['a feature and a concession', n => 'Deploy ' + rep('anyway even though ', n) + 'search is broken'],
        ['a plural and «don\'t»', n => 'Run ' + rep('tests ', n) + "don't deploy"],
        ['a second deed', n => 'افتح الصفحة ' + rep('وخذ ', n) + 'لقطة، الزر مش شغال'],
    ])('%s: 20 KB is read in well under half a second by every reader', (_name, make) => {
        const text = make(20000);
        for (const read of [hasRequestedAction, deniesEveryFileChange, deniesEveryFileChangeInHisDialect, stripScopedExclusions, isReadOnlyStructural, reportsAFaultOrOrdersAFix, isReadOnlyRequest, isWebOrder]) {
            expect(cpuMs(() => { read(text); })).toBeLessThan(500);
        }
    });
});
