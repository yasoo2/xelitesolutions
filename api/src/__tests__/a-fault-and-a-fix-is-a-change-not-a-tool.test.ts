/**
 * A FAULT AND A FIX IS A CHANGE TO HIS WORK, NEVER A TOOL NAMED BY A NOUN IN IT.
 *
 * When «ما» after a subject became a negation (a-negation-is-not-a-question),
 * the sentences that had been answered — wrongly, and harmlessly — as
 * questions reached the readers that know a sentence only by its words. The
 * pre-merge review found what those readers made of them:
 *
 *   «الصورة ما تظهر، صلحها»            → generate_image
 *   «تسجيل الدخول ما يشتغل، صلحه»      → a browser
 *   «التقرير ما يطلع PDF، صلحه»        → browser_save_pdf
 *   «زر النشر ما يشتغل، صلحه»          → deploy_pages
 *   «لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة» → an answer, no page
 *   «سوي لي موقغ لمطعمي»               → nothing read at all
 *
 * Five readings, each by its grammar:
 *  A. the thing named in a complaint or a repair is a part of his work, not a
 *     capability: the message is matched by no word in it;
 *  B. a denial of file changes beside an order it does not forbid (create,
 *     when only edit and delete are denied) is a condition on that order;
 *  C. a word one letter from a deliverable is that deliverable when an order
 *     governs it, and its own word when nothing does;
 *  D. capturing a page is the browser's; inspecting his project under the
 *     read-only boundary's own words is the inspection;
 *  E. a run order with a file denial is run.
 * And every neighbour keeps the reading it had.
 */
import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBuildRequest, isKnowledgeQuestionStructural, isBrowserRequest, isWebOrder, isReadOnlyStructural, reportsAFaultOrOrdersAFix } from '../core/intelligence/intent-classifier';
import { hasRequestedAction, deniesEveryFileChange, fileDenialBesideItsOrder, negatesWhatAThingDoes, withoutFileDenials } from '../core/intelligence/requested-action';
import { normalizeIntentText, canonicalIntentText } from '../core/orchestrator/promptNormalizer';

let routeToModel: jest.SpyInstance;
beforeAll(() => { routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('no model in this test')); });
afterAll(() => routeToModel.mockRestore());

const parse = (text: string) => IntentParser.parse(text, {} as any);
const toolsOf = async (text: string) => (await parse(text)).requiredTools || [];

describe('A. a fault and a fix reach no tool by a word in them', () => {
    const faults = [
        // the review's regressions: answered before, sent to a tool after
        'الصورة ما تظهر، صلحها',
        'الصور ما كتتحملش، صاوبها',
        'تسجيل الدخول ما يشتغل، صلحه',
        'البحث ما يرجع نتايج، صلحه',
        'الصفحة ما بتفتح عندي، شوف المشكلة وصلحها',
        'خلي الزر ما يشتغل إلا بعد تعبئة النموذج',
        'كل ما أضغط الزر يطلع خطأ، صلحه',
        'الزر ما بيشتغل صلحه بسرعة لو سمحت',
        'الجدول ما فيه عمود السعر، ضيفه',
        'الجدول ما يترتب حسب التاريخ، رتبه',
        'الصفحة ما بدي فيها جدول',
        'الترجمة ما تشتغل، صلحها',
        'التقرير ما يطلع PDF، صلحه',
        'الملف ما ينحفظ، صلحه',
        'ملف الإكسل ما يتحمل، صلحه',
        'زر النشر ما يشتغل، صلحه',
        'انشره بعد ما تصلح الخطأ',
        // the same fault said the other ways, and in English: wrong in both trees
        'الصورة مو ظاهرة، صلحها',
        'البحث لا يعمل، أصلحه',
        'الصفحة لا تفتح',
        'صلح البحث',
        'زر الأرشفة مش شغال',
        'الأرشيف ما ينضغط، ظبطه',
        'The image does not show, fix it',
        'The login is broken, fix it',
        'Fix the search, it returns nothing',
        'My deploy button doesn\'t work',
        'الصُّورةُ ما تَظهَرْ، صَلِّحْها',
    ];
    it.each(faults)('%s', async (text) => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(true);
        expect(IntentParser.quickIntent(text)).toBeNull();
        expect(isBrowserRequest(text).isBrowser).toBe(false);
        expect(isWebOrder(text)).toBe(false);
        const intent = await parse(text);
        // The neutral reading «صلح الكود» always had: no tool chosen at the door.
        expect(intent.requiredTools).toEqual([]);
        expect(intent.rawIntent.capabilityCandidate).toBeUndefined();
    });

    it('«صلح الكود» is where they go', async () => {
        expect(await toolsOf('صلح الكود')).toEqual([]);
        expect(await toolsOf('الكود فيه خطأ صلحه')).toEqual([]);
    });

    it.each([
        ['انشره', 'deploy_pages'],
        ['انشر الموقع', 'deploy_pages'],
        ['بعد ما تخلص التعديلات انشره', 'deploy_pages'],
        ['اعمل لي صورة لشعار المطعم', 'generate_image'],
        ['اضغط الملفات في أرشيف', 'archive_files'],
        ['احفظ الصفحة PDF', 'browser_save_pdf'],
        ['رتب الجدول حسب التاريخ', 'query_optimizer'],
        ['حسّن استعلام قاعدة البيانات', 'query_optimizer'],
        ['ابحث عن سعر الدولار', 'browser_run'],
        ['سجل دخول إلى حسابي', 'browser_run'],
        ['خذ لقطة شاشة للصفحة', 'browser_fullpage_shot'],
    ])('an order for the capability itself still names it: %s → %s', async (text, tool) => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
        expect(await toolsOf(text)).toEqual([tool]);
    });

    it.each([
        'نفذ ما طلبته',
        'شغل السيرفر بعد ما تخلص',
        'عدل الصفحة زي ما قلت لك',
        'أضف زر بلون ما',
        'انشر الموقع ولا تغير شي',
        'الموقع لا تنشره الآن',
        'انشر الموقع لا تنتظر',
        'ما الفرق بين React و Vue',
        'ابحث في جوجل عن حل الخطأ ده',
        'Is the site deployed?',
        'the button does nothing when clicked twice?',
        'اعمل جدول ما فيه عمود السعر',
    ])('neither a fault nor a fix: %s', (text) => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
    });

    it('a «ما» negates what a thing does after its subject, and relates after a conjunction or a verb', () => {
        for (const text of ['الزر ما بيشتغل', 'صفحتي ما تفتح', 'API ما بيرد', 'زر الحفظ ما عم يشتغل', 'ما عم يشتغل الزر', 'الصفحة ما بدي فيها جدول', 'أنا ما بدي صفحة جديدة']) {
            expect([text, negatesWhatAThingDoes(text)]).toEqual([text, true]);
        }
        for (const text of ['قبل ما تنشر، اختبر الموقع', 'بعد ما تخلص انشره', 'كل ما أضغط الزر يطلع خطأ', 'نفذ ما طلبته', 'زي ما قلت لك', 'ما الفرق بين الاثنين', 'ما هي أفضل طريقة', 'أضف زر بلون ما']) {
            expect([text, negatesWhatAThingDoes(text)]).toEqual([text, false]);
        }
    });

    it('what he forbids names no capability: the files of a denial are read out with what names them', async () => {
        // «ملف» named ai_write_file, "delete … file" delete_file, and the «index.html» of a bare restriction an HTML tool.
        for (const text of [
            'لا تعدل أو تحذف أي ملف غير index.html',
            'غيّر العنوان ولا تعدل أي ملف آخر',
            'أضف زر حذف ولا تعدل أو تحذف أي ملف css',
            'add a logout button and do not edit or delete any other file',
        ]) {
            const tools = await toolsOf(text);
            expect([text, tools.filter(tool => /file|html|archive/.test(tool))]).toEqual([text, []]);
        }
    });

    it('a site he names outright is still the browser\'s', () => {
        expect(isBrowserRequest('افتح https://example.com وشوف ليش الزر ما يشتغل').isBrowser).toBe(true);
        expect(isWebOrder('ابحث في جوجل ليش الزر ما يشتغل')).toBe(true);
    });

    it('an order to do nothing denies every deed, whatever he says he will do himself', async () => {
        for (const text of ['بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين', 'لا تسوي شي الحين', 'لا تعمل أي شيء', 'Do nothing for now.', 'Don\'t do anything yet']) {
            expect([text, hasRequestedAction(text).isAnswerOnly]).toEqual([text, true]);
            expect(await toolsOf(text)).toEqual(['central_answer']);
        }
        for (const text of ['لا تسوي شي غير تغيير لون الزر', 'خلي الزر لا يسوي شي', 'the button does nothing, fix it', 'Do nothing else, just rename the file']) {
            expect([text, hasRequestedAction(text).isAnswerOnly]).toEqual([text, false]);
        }
    });
});

describe('B. a denial of edits and deletions does not swallow the order to create beside it', () => {
    it.each([
        'لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة',
        'لا تعدل ولا تحذف أي ملف، وأنشئ صفحة تواصل',
        'ابني لي صفحة جديدة، ولا تعدل أو تحذف أي ملف',
        'لا تعدل أو تحذف أي ملف في المشروع، وابني لي صفحة جديدة',
        'لا تُعدِّل أو تَحذِف أيَّ ملف، وابنِ لي صفحة جديدة',
        'Do not modify or delete any file, and build me a new page',
        'Do not modify any files. Build a calculator.',
    ])('%s is a build', async (text) => {
        expect(deniesEveryFileChange(text)).toBe(true);                     // the denial is still read…
        expect(fileDenialBesideItsOrder(text)?.order).toBe('create');       // …as the condition of the order beside it
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: false, isNoFileChanges: false, isAnswerOnly: false });
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(isReadOnlyStructural(text)).toBe(false);
        expect(isBuildRequest(text).isBuild).toBe(true);
        expect(await toolsOf(text)).toEqual(['project_pipeline']);
    });

    it.each([
        'لا تعدل أو تحذف أي ملف',
        'لا تعدل أو تحذف أي ملف، وأضف زر',                                  // adding a button edits a file that exists
        'لا تعدل أو تحذف أي ملف، فقط اشرح لي ماذا يفعل الكود',
        'لا تنشئ أو تعدل أي ملف، وابني لي صفحة جديدة',                       // creating is denied too
        'لا تعدل ولا تحذف شيئا، وابني لي صفحة جديدة',                         // every change, not every file
        'Do not create, modify, or delete any file. Build me a page.',
        'No file changes. Build me a page.',
        'Review the code. Do not modify or delete any file.',
    ])('%s still denies', (text) => {
        expect(fileDenialBesideItsOrder(text)).toBeNull();
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: true, hasAffirmativeAction: false });
        expect(isBuildRequest(text).isBuild).toBe(false);
    });

    it('«أضف صفحة تواصل، ولا تعدل أو تحذف أي ملف موجود» was already an order, and is', () => {
        expect(hasRequestedAction('أضف صفحة تواصل، ولا تعدل أو تحذف أي ملف موجود')).toMatchObject({ hasDenial: false, isNoFileChanges: false });
    });

    it('the denial is read out, and what stood after it stays', () => {
        expect(withoutFileDenials('لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة').trim()).toBe('، وابني لي صفحة جديدة');
        expect(withoutFileDenials('ابني لي صفحة جديدة').trim()).toBe('ابني لي صفحة جديدة');
    });
});

describe('C. a misspelt deliverable is repaired where an order governs it', () => {
    it.each([
        ['سوي لي موقغ لمطعمي', 'موقع'],
        ['اعمل صفخة هبوط', 'صفحة'],
        ['ابني موقف سيارات ذكي', 'موقع'],
        ['بدي موقغ لمحلي', 'موقع'],
        ['افتح صفخة المنتجات', 'صفحة'],
        ['روح على صفخة المنتجات', 'صفحة'],
    ])('%s reads «%s»', (text, word) => {
        expect(normalizeIntentText(text)).toContain(word);
    });

    it.each(['سوي لي موقغ لمطعمي', 'اعمل صفخة هبوط', 'ابني موقف سيارات ذكي', 'بدي موقغ لمحلي'])('%s is a build', async (text) => {
        expect(isBuildRequest(text).isBuild).toBe(true);
        expect(await toolsOf(text)).toEqual(['project_pipeline']);
    });

    it.each(['افتح موقغ الشركة', 'افتح صفخة المنتجات', 'روح على صفخة المنتجات'])('%s is the browser\'s again', async (text) => {
        expect(await toolsOf(text)).toEqual(['browser_run']);
    });

    it('the repair is only to a thing an order makes or opens: a network stays a network', () => {
        expect(normalizeIntentText('اعمل شبكة اجتماعية')).not.toContain('شركة');
        expect(normalizeIntentText('اعمل شبكة صور')).not.toContain('شركة');
    });

    it.each([
        ['صلحه', 'صفح'],
        ['الزر ما بيشتغل، صلحه', 'صفح'],
        ['الزر مش شغال صلحه', 'صفح'],
        ['شبكة', 'شرك'],
        ['شبكة الانترنت ضعيفة', 'شرك'],
        ['الشبكة عندي ضعيفة، شبكة البيت', 'شرك'],
        ['موقف سيارات', 'موقع'],
        ['عندي موقف غريب', 'موقع'],
    ])('with no order before it, %s is the word he wrote (no «%s»)', (text, word) => {
        expect(normalizeIntentText(text)).not.toContain(word);
    });

    it('«صلحه» alone is still not a page, and not the browser\'s', async () => {
        expect(isBrowserRequest('صلحه').isBrowser).toBe(false);
        expect(await toolsOf('صلحه')).toEqual([]);
    });
});

describe('D. a screenshot of the page is the browser\'s; an inspection without changes is the inspection', () => {
    it.each(['خذ لقطة شاشة للصفحة', 'التقط صورة للصفحة الرئيسية', 'خذ سكرين شوت للموقع', 'take a screenshot of the page'])('%s is a browser task', (text) => {
        expect(isBrowserRequest(text).isBrowser).toBe(true);
    });

    it.each(['الصفحة ما تفتح صلحها', 'أنا ما أبي صفحة جديدة', 'صلح الصفحة الرئيسية', 'لقطة الشاشة ما تظهر في الصفحة، صلحها'])('%s is not', (text) => {
        expect(isBrowserRequest(text).isBrowser).toBe(false);
    });

    it.each([
        'افحص المشروع دون إنشاء أي ملفات أو تعديلها، وأخبرني بما تجده',
        'افحص المشروع دون تعديل أي ملف',
        'راجع المشروع بدون تعديل الملفات وقل لي المشاكل',
        'اعرض ملفات مساحة العمل الرئيسية، ثم لخّص README للمستخدم دون تعديل أي ملف.',
        'Review the project. Do not modify any files.',
        'Inspect the project and report what you find. Do not change any files.',
    ])('%s is a read-only inspection of the project', async (text) => {
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: true, isNoFileChanges: false, isAnswerOnly: false, reason: 'explicit read-only request' });
        expect(isReadOnlyStructural(text)).toBe(true);
        const intent = await parse(text);
        expect(intent.requiredTools).toEqual(['project_pipeline']);
        expect(intent.rawIntent.readOnly).toBe(true);
    });

    it.each([
        'راجع الكود ولا تعدل أو تحذف أي ملف',
        'بدون تعديل أي ملف، اشرح لي المشكلة',
        'Explain hooks. Do not create any files.',
        'Review my code and list the problems. Do not change the existing files.',
        'اشرح لي المشروع دون تعديل أي ملف',
    ])('%s is still answered, with no file changed', async (text) => {
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: true, isNoFileChanges: true });
        expect(await toolsOf(text)).toEqual(['central_answer']);
    });
});

describe('E. a run order with a denial of file changes is run', () => {
    it.each([
        'شغّل المشروع ولا تنشئ أي ملفات',
        'شغل المشروع، لا تنشئ أي ملفات',
        'شغل السيرفر ولا تعدل أي ملف',
        'لا تنشئ أي ملفات، شغل المشروع',
        'Run the project. Do not create any files.',
        'Start the server and do not modify any files',
    ])('%s', async (text) => {
        expect(fileDenialBesideItsOrder(text)?.order).toBe('run');
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: false, isNoFileChanges: false, isAnswerOnly: false });
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(isReadOnlyStructural(text)).toBe(false);
        const tools = await toolsOf(text);
        expect(tools).not.toContain('central_answer');
        // …and the «ملف» of what he forbade names no file-writing tool.
        expect(tools.filter(tool => /file|archive/.test(tool))).toEqual([]);
    });

    it('to execute a check or a command is to run it: the denial beside it is read through its shadda, and it is still run', async () => {
        for (const text of [
            'نفّذ فحصاً محلياً باستخدام shell_execute فقط: اعرض pwd، ثم نفّذ node --version، ثم echo TERMINAL_VISIBILITY_TEST. لا تبنِ تطبيقاً ولا تعدّل ملفات ولا تستخدم المتصفح أو Git.',
            'نفّذ فحص بناء محلياً فقط لمشروع React الموجود في react-app: استخدم shell_execute لتشغيل npm run build داخل هذا المجلد. لا تعدّل أي ملف، ولا تثبّت حزمًا.',
        ]) {
            expect(deniesEveryFileChange(text)).toBe(true);
            expect(fileDenialBesideItsOrder(text)?.order).toBe('run');
            expect(hasRequestedAction(text)).toMatchObject({ hasDenial: false, isNoFileChanges: false, isAnswerOnly: false });
            expect(await toolsOf(text)).not.toContain('central_answer');
        }
    });

    it('the version-and-path diagnostics keep the way they already had through a file denial', async () => {
        const text = 'نفذ فحصا محليا باستخدام shell_execute: اعرض إصدار Node.js ومسار مساحة العمل الحالية. لا تعدل الملفات ولا تثبت حزم ولا تشغل خادما.';
        expect(fileDenialBesideItsOrder(text)).toBeNull();
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: true, isNoFileChanges: true });
        const intent = await parse(text);
        expect(intent.requiredTools).toEqual(['shell_execute']);
        expect(intent.rawIntent).toMatchObject({ terminalDiagnostic: true, noFileChanges: true });
    });

    it('it is read as the run order alone', async () => {
        expect(await toolsOf('شغّل المشروع ولا تنشئ أي ملفات')).toEqual(await toolsOf('شغّل المشروع'));
    });

    it.each([
        'لا تنشئ أي ملفات',
        'اشرح لي المشروع ولا تنشئ أي ملفات',
        'كيف أشغل المشروع؟ لا تنشئ أي ملفات',
        'Run the read-only checks only. Do not create any files.',
        'Run the code review. Do not modify any files.',                       // nothing of his is run
        'Start by reviewing the code. Do not modify any files.',
    ])('%s still denies', (text) => {
        expect(fileDenialBesideItsOrder(text)).toBeNull();
        expect(hasRequestedAction(text).hasDenial).toBe(true);
    });
});

describe('the new readers cost what the text is long', () => {
    //  Wall time on a busy laptop measures the laptop; the processor time of this process measures the reader.
    const cpuMs = (run: () => void) => { const before = process.cpuUsage(); run(); const used = process.cpuUsage(before); return (used.user + used.system) / 1000; };
    it.each([
        ['faults', 'الزر ما بيشتغل، صلحه. '],
        ['negated states', 'الصفحة لا تفتح والزر مش شغال '],
        ['english faults', 'the the the button does not the '],
        ['denials', 'لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة. '],
        ['misspelt things', 'اعمل صفخة سوي لي موقغ '],
        ['spaces', 'the   ' + ' '.repeat(40) + 'ال' + ' '.repeat(40)],
        ['blank lines', '\n'],
        ['blank lines after a full stop', '.\n \n'],
        ['a denial on every line', 'لا تعدل أي ملف\n\n\n'],
    ])('%s: eight times the text is about eight times the work', (_name, unit) => {
        const read = (text: string) => {
            reportsAFaultOrOrdersAFix(text); negatesWhatAThingDoes(text); fileDenialBesideItsOrder(text); withoutFileDenials(text); canonicalIntentText(text);
            hasRequestedAction(text); isReadOnlyStructural(text);
        };
        const small = unit.repeat(Math.ceil(5_000 / unit.length));
        const large = small.repeat(8);
        read(small);                                         // compile the patterns outside the measurement
        const one = Math.max(cpuMs(() => read(small + ' ')), 1);
        const eight = cpuMs(() => read(large + ' '));
        expect(eight).toBeLessThan(one * 40 + 400);          // linear is ×8; quadratic would be ×64
    });
});
