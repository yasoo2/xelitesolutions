/**
 * A SCOPED «DO NOTHING» IS AN EXCLUSION, NOT A REFUSAL — and three more readings
 * the fourth pre-merge review (2026-11-12) found wrong in the request readers.
 *
 *  1. «لا تسوي شي في الهيدر، بس غير لون الفوتر», "don't do anything to the
 *     database, just fix the form" were answered with words: an order to do
 *     nothing was a global denial wherever it stood. It is one only when it
 *     names no thing and no order follows it.
 *  2. «شغل المشروع», 20 KB of blank lines, «ولا تعدل أي ملف» cost 18.8 s of
 *     processor time in hasRequestedAction (an end-anchored trim). Every reader
 *     is linear; the bound here is on CPU time, never on the wall clock.
 *  3. «بدون تعديل أي ملف، افحص المشروع» lost its read-only inspection because
 *     the denial came first: the order was looked for only at a sentence's head.
 *  4. "Do not modify any files. Make a plan for the refactor." was BUILT: any
 *     «make X» beside a file denial was freed, whatever X was. Only a thing
 *     that is built in files frees the order.
 */
import { hasRequestedAction, fileDenialBesideItsOrder, deniesEveryFileChange } from '../core/intelligence/requested-action';
import { isBuildRequest, isKnowledgeQuestionStructural, isBrowserRequest } from '../core/intelligence/intent-classifier';

describe('an order to do nothing', () => {
    it.each([
        'لا تسوي شي في الهيدر، بس غير لون الفوتر',
        'لا تعمل شي بالتصميم، بس صلح الخطأ',
        "don't do anything to the database, just fix the form",
        'Do nothing to the header; change the footer color to black',
        'لا تعمل شي للهيدر وغير لون الفوتر للأسود',
        'لا تسوي شي عالهيدر، فقط كبر الخط',
        "Don't do anything with the styles. Fix the submit button.",
        'لا تفعل أي شيء في قاعدة البيانات، فقط أصلح النموذج',
    ])('scoped to a named thing, beside an order, refuses nothing: %s', text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(read.isAnswerOnly).toBe(false);
    });

    it.each([
        'لا تسوي شي بس صلح الزر',
        'لا تسوي شي، بس غير لون الفوتر',
        'Do nothing, just fix the login bug',
        "Don't do anything yet, only rename the file to main.ts",
    ])('followed by «بس / just / only» and an order, is that order: %s', text => {
        expect(hasRequestedAction(text).hasDenial).toBe(false);
    });

    it.each([
        'لا تعمل أي شيء',
        'لا تسوي شي الحين',
        'لا تسوي شي الان',
        'Do nothing for now.',
        "Don't do anything at all.",
        'لا تسوي شي في الوقت الحالي',
        'بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين',
        // What he wants instead is words: the denial stands.
        'لا تسوي شي، بس اشرح لي الكود',
        "Don't do anything yet, just explain the plan",
        // An exclusion with nothing else ordered is still a refusal.
        'لا تسوي شي في الهيدر',
        'Explain the header code. Do nothing to the header.',
    ])('with no thing named and no order after it, denies every deed: %s', text => {
        const read = hasRequestedAction(text);
        expect(read.isAnswerOnly).toBe(true);
        expect(read.hasAffirmativeAction).toBe(false);
    });

    it.each(['the button does nothing', 'الزر لا يسوي شي', 'لا تسوي شي غير تصليح الزر'])('is not read where none is given: %s', text => {
        expect(hasRequestedAction(text).isAnswerOnly).toBe(false);
    });
});

describe('an inspection of his project under a denial of changes', () => {
    const inspection = (text: string) => {
        const read = hasRequestedAction(text);
        return read.hasDenial && !read.isAnswerOnly && !read.isNoFileChanges && read.reason === 'explicit read-only request';
    };
    it.each([
        'بدون تعديل أي ملف، افحص المشروع وقل لي المشاكل',
        'دون تعديل أي ملف، راجع المشروع',
        'من فضلك، بدون تعديل أي ملف، افحص المشروع',
        'بدون تعديل أي ملف وافحص المشروع',
        'Without changing any files, review the project and tell me the problems',
        'Review the repo without changing anything',
    ])('is the inspection when the denial comes first: %s', text => {
        expect(inspection(text)).toBe(true);
    });

    it.each([
        'افحص المشروع دون إنشاء أي ملفات أو تعديلها، وأخبرني بما تجده',
        'اعرض ملفات مساحة العمل الرئيسية، ثم لخّص README للمستخدم دون تعديل أي ملف',
        'Do not modify any files. Inspect the project and report what you find.',
    ])('still is when the verb comes first: %s', text => {
        expect(inspection(text)).toBe(true);
    });

    it.each([
        'راجع الكود ولا تعدل أي ملف',
        'Explain hooks. Do not create any files.',
        'بدون تعديل أي ملف، اشرح لي React',
        'Explain React hooks without changing any files',
    ])('is not read where no inspection of the project is ordered: %s', text => {
        const read = hasRequestedAction(text);
        expect(read.isNoFileChanges).toBe(true);
        expect(inspection(text)).toBe(false);
    });

    it('«without changing any other files» still narrows', () => {
        expect(deniesEveryFileChange('Add a footer without changing any other files')).toBe(false);
        expect(deniesEveryFileChange('Fix the form without changing anything else')).toBe(false);
        expect(deniesEveryFileChange('Review the repo without changing anything')).toBe(true);
    });
});

describe('an order to make something beside a denial of file changes', () => {
    it.each([
        'Do not modify any files. Make a plan for the refactor.',
        'Do not edit any file. Make a list of the problems you see.',
        'Do not modify any files. Create a report of the bugs.',
        'Do not edit any files. Make a site plan.',
        'Do not modify any files. Make a list of the pages in the app.',
        'لا تعدل أي ملف، سوي لي خطة للتعديلات',
        'لا تعدل أي ملف، اعمل لي ملخص للمشروع',
        'لا تعدل أي ملف، اعمل لي نسخة احتياطية',
        'لا تعدل أي ملف واعمل لي تقرير عن المشروع',
        'لا تعدل أي ملف، اعمل لي قائمة بالمشاكل',
        'لا تعدل أي ملف، سوي لي تقرير عن الصفحة الرئيسية',
    ])('stays denied when what is made is words: %s', text => {
        expect(fileDenialBesideItsOrder(text)).toBeNull();
        const read = hasRequestedAction(text);
        expect(read.isNoFileChanges).toBe(true);
        expect(read.hasAffirmativeAction).toBe(false);
        expect(isBuildRequest(text).isBuild).toBe(false);
    });

    it.each([
        'لا تعدل أو تحذف أي ملف، وابني لي صفحة جديدة',
        'لا تعدل أي ملف، سوي لي موقع لمطعم',
        'لا تعدل أي ملف، سوي لي landing page',
        'لا تعدل أي ملف، اعمل لي صفحة تقرير للمبيعات',
        'Do not modify any files; build a new landing page for the product.',
        'Do not modify any files. Build me a todo app.',
        'Do not modify any files. Create a todo list app.',
    ])('is freed when what is made is built in files: %s', text => {
        expect(fileDenialBesideItsOrder(text)?.order).toBe('create');
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(read.hasAffirmativeAction).toBe(true);
        expect(isBuildRequest(text).isBuild).toBe(true);
    });

    it.each([
        'لا تعدل أو تحذف أي ملف، وأضف زر',
        'لا تنشئ أو تعدل أي ملف، وابني لي صفحة',
        'لا تعدل أي ملف',
        'Do not modify any files.',
    ])('stays denied where it always was: %s', text => {
        expect(fileDenialBesideItsOrder(text)).toBeNull();
        expect(hasRequestedAction(text).isNoFileChanges).toBe(true);
    });

    it('a denial about one named file stays narrow', () => {
        const read = hasRequestedAction('لا تعدل ملف الإعدادات');
        expect(read.isNoFileChanges).toBe(false);
        expect(read.isAnswerOnly).toBe(false);
    });

    it('an order to run beside the denial is still freed', () => {
        expect(fileDenialBesideItsOrder('شغل المشروع ولا تعدل أي ملف')?.order).toBe('run');
    });
});

describe('the readers stay linear on a long run of blanks between an order and its denial (CPU time)', () => {
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    let nonce = 0;
    const cpuMs = (run: () => unknown): number => {
        const t0 = process.cpuUsage();
        run();
        const spent = process.cpuUsage(t0);
        return (spent.user + spent.system) / 1000;
    };
    const INPUTS: Array<[string, (n: number) => string]> = [
        ['a run order, blank lines, a file denial', n => `شغل المشروع${rep('\n', n)}ولا تعدل أي ملف`],
        ['a run order, spaces, a file denial', n => `شغل المشروع${rep(' ', n)}ولا تعدل أي ملف`],
        ['a run order, marks and spaces, a file denial', n => `شغل المشروع${rep('. ، ', n)}ولا تعدل أي ملف`],
        ['a scoped do-nothing repeated', n => `${rep('لا تسوي شي في الهيدر، ', n)}بس غير لون الفوتر`],
        ['do nothing, spaces, an order', n => `لا تسوي شي${rep(' ', n)}بس صلح الزر`],
        ['a denial, commas, an inspection', n => `بدون تعديل أي ملف${rep('، ', n)}افحص المشروع`],
        ['a denial and a long thing to make', n => `لا تعدل أي ملف، سوي لي ${rep('خطة ', n)}`],
    ];
    const READERS: Array<[string, (text: string) => unknown]> = [
        ['hasRequestedAction', hasRequestedAction],
        ['fileDenialBesideItsOrder', fileDenialBesideItsOrder],
        ['isBuildRequest', isBuildRequest],
        ['isKnowledgeQuestionStructural', isKnowledgeQuestionStructural],
        ['isBrowserRequest', isBrowserRequest],
    ];

    beforeAll(() => {
        // Warm every lazy module and compiled pattern once, outside the measurement.
        for (const [, reader] of READERS) for (const [, input] of INPUTS) reader(input(300));
    });

    describe.each(READERS)('%s', (_name, reader) => {
        it.each(INPUTS)('%s, 20 KB: under 2 s of CPU', (_what, input) => {
            expect(cpuMs(() => reader(`${input(20000)} ${nonce++}`))).toBeLessThan(2000);
        });
    });
});
