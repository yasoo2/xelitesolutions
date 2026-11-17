/**
 * ⛔ A QUESTION THEN A DEED IS READ WHOLE — AND SO IS EVERY OTHER REQUEST
 *    THE PRE-MERGE REVIEW OF de86f9f1d CAUGHT.
 *
 * de86f9f1d («The request reader reads what he asks for again») fixed real
 * regressions — the dental brief, «كيف أنشر المشروع؟ انشره الآن», «لا تنشئ
 * مشروعاً جديداً، شغّل المشروع الحالي». An independent review before the merge
 * then ran the readers against what he writes every day, and found what the
 * fixes cost:
 *
 *  - A question became an action. «How do I install Node? And then run my
 *    app?» ran his app; «What is the best way to learn React? Then build
 *    something with it?» opened a React project; «ما الفرق بين React و Vue؟
 *    أيهما أسهل لما ابني متجر؟» built a store; «What is Docker? Run me through
 *    the basics.» opened a browser; «كيف أربي ابني؟ ابني عنيد جدا» — «my son is
 *    very stubborn» — lost its answer to «ابني» read as «build!». The deed
 *    reader looked for a deed word anywhere after the first question mark.
 *  - «صف لي متجر مثالي بدون بناء موقع» (describe an ideal store without
 *    building a site) was BUILT: the exclusion was removed from his words but
 *    the normalizer had already turned it into «بدون ابن موقع».
 *  - «جدول مصاريف فيه التاريخ والمبلغ والتصنيف» was no longer a build, while
 *    «اشرح لي كيف أعمل جدول في إكسل فيه الاسم والراتب والقسم», a lesson, was.
 *  - «شيك على الكود وقلي وين الغلط، لا تعدل ملفاتي» wrote a file: «ملفاتي» and
 *    «the app files» were not read as all of his files.
 *  - One regex took 20.7 s on 24 «و»-words — on every message, 12–14 times
 *    per message (requested-action-readers-stay-linear.test.ts pins that).
 *
 * Each case below is the review's own sentence, and the route it must take.
 * No model is ever asked: the router rejects, and a request that reaches it
 * would come back as a neutral intent, which these tests refuse.
 */
import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBuildRequest, isKnowledgeQuestionStructural, isWebOrder } from '../core/intelligence/intent-classifier';
import { hasRequestedAction, deniesEveryFileChange, withoutDefiniteVerbalNouns } from '../core/intelligence/requested-action';

let routeToModel: jest.SpyInstance;
beforeAll(() => { routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('no model in this test')); });
afterAll(() => routeToModel.mockRestore());

const parse = (text: string) => IntentParser.parse(text, {} as any);
const answered = (intent: any) => (intent.requiredTools || []).includes('central_answer');
const built = (intent: any) => (intent.requiredTools || []).includes('project_pipeline') && !!intent.rawIntent?.buildRequest;

describe('a question followed by words is still a question', () => {
    test.each([
        'How do I install Node? And then run my app?',
        'What is the best way to learn React? Then build something with it?',
        'ما الفرق بين React و Vue؟ أيهما أسهل لما ابني متجر؟',
        'What is Docker? Run me through the basics.',
        'كيف أربي ابني؟ ابني عنيد جدا',
        'كيف أتعامل مع ابني؟ ابني عمره عشر سنوات ولا يحب الدراسة',
        'ما أفضل طريقة لتنظيم وقتي؟ عندي شغل كثير ودراسة',
        'هل البرمجة صعبة؟ جرب أخوي يتعلمها وما قدر',
        'What is the difference between git merge and rebase? Also, update me on best practices.',
        'Why is my app slow? Open to any suggestions.',
        'How much does hosting cost? Save money tips please.',
    ])('%s → answered', async (text) => {
        expect(isKnowledgeQuestionStructural(text)).toBe(true);
        expect(isBuildRequest(text).isBuild).toBe(false);
        expect(answered(await parse(text))).toBe(true);
    });
});

describe('an order that opens the sentence after the question is the order', () => {
    test.each([
        'كيف أنشر المشروع؟ انشره الآن',
        'How do I deploy it? Deploy it now.',
        'ليش الموقع بطيء؟ صلحه',
        'كيف أحسن أداء موقعي؟ افحصه',
        'كيف أحذف الملف؟ احذفه',
    ])('%s → not an answer', async (text) => {
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(answered(await parse(text))).toBe(false);
    });

    test('«كيف حالك؟ ابني لي موقع لمطعمي» — «ابني لي» with its object is «build me»', async () => {
        expect(built(await parse('كيف حالك؟ ابني لي موقع لمطعمي'))).toBe(true);
    });
});

describe('an exclusion with nothing else ordered refuses the build', () => {
    test.each([
        'صف لي متجر مثالي بدون بناء موقع',
        'اقترح لي فكرة متجر بدون بناء موقع',
        'خطط لي متجر بدون بناء موقع',
        'Do not create a new project.',
    ])('%s → answer only', async (text) => {
        expect(hasRequestedAction(text)).toMatchObject({ hasAffirmativeAction: false, isAnswerOnly: true });
        expect(answered(await parse(text))).toBe(true);
    });

    test.each([
        ['Build a todo app without creating a database', true],
        ['Build a todo app without a database', true],
        ['Run the existing app. Do not create a new project.', false],
        ['لا تنشئ مشروعاً جديداً، شغّل المشروع الحالي', false],
    ])('%s keeps its order', async (text, isBuild) => {
        const intent = await parse(text);
        expect(answered(intent)).toBe(false);
        expect(built(intent)).toBe(isBuild);
    });

    test('«أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد» fixes his login, it does not browse', async () => {
        const text = 'أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد';
        expect(isWebOrder(text)).toBe(false);
        const intent = await parse(text);
        expect(intent.requiredTools || []).not.toContain('browser_run');
        expect(answered(intent)).toBe(false);
    });
});

describe('a record container and its contents is a build; a lesson about one is not', () => {
    test.each([
        'جدول مصاريف فيه التاريخ والمبلغ والتصنيف',
        'جدول مصاريف: التاريخ، المبلغ، التصنيف',
        'جدول للمواعيد فيه اسم المريض والتاريخ والوقت',
        'قائمة عملاء فيها الاسم والجوال والمدينة',
        'كشف رواتب فيه اسم الموظف والراتب والخصم',
        'A table for expenses with date, amount and category',
        'Table of expenses: date, amount, category',
        'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.',
        'بدي جدول فيه اسم المريض ورقم تلفونه',
        'أبي جدول فيه الاسم والجوال والمدينة',
        'عايز جدول فيه الاسم والجوال والمدينة',
        'نبي جدول فيه الاسم والجوال والمدينة',
    ])('%s → built', async (text) => {
        expect(isBuildRequest(text).isBuild).toBe(true);
        expect(built(await parse(text))).toBe(true);
    });

    test.each([
        'اشرح لي كيف أعمل جدول في إكسل فيه الاسم والراتب والقسم',
        'علمني كيف أسوي جدول فيه الاسم والعمر والجنس',
        'وش أفضل طريقة أسوي جدول فيه الاسم والجوال والإيميل',
        'ابغى اعرف كيف اسوي جدول فيه الاسم والسعر والكمية',
        'بدي أفهم كيف أعمل جدول فيه اسم الموظف وراتبه وقسمه',
        'A Flutter app vs a React Native app: performance, size, ecosystem',
        'اشرح لي كيف أبني متجراً',
        'how do I build a store?',
    ])('%s → answered, and both readers agree', async (text) => {
        expect(isBuildRequest(text).isBuild).toBe(false);
        expect(isKnowledgeQuestionStructural(text)).toBe(true);
        expect(answered(await parse(text))).toBe(true);
    });

    test.each([
        'تطبيق البنك: بطيء وثقيل ويستهلك البطارية',
        'موقع الوزارة: بطيء، ويتوقف، ولا يفتح',
        'الجدول اللي عملته أمس فيه: الاسم والسعر والكمية صار بطيء',
    ])('%s — a thing that exists, complained about — is not built', (text) => {
        expect(isBuildRequest(text).isBuild).toBe(false);
    });
});

describe('«my files», «the app files», «the existing files» are all of his files', () => {
    test.each([
        'شيك على الكود وقلي وين الغلط، لا تعدل ملفاتي',
        'راجع الكود وقلي المشاكل، لا تعدل الملفات الموجودة',
        'راجع الكود وقلي المشاكل، لا تعدل الملفات الحالية',
        'راجع الكود، لا تعدل ملفات موقعي',
        'راجع الكود، لا تعدل الملفات تبعي',
        'راجع الكود، لا تعدل الملفات حقتي',
        'راجع الكود، لا تعدل الملفات بتاعتي',
        'Check my app for bugs and suggest fixes. Do not modify the app files.',
        'Review my code and list the problems. Do not change the existing files.',
        "Review the code. Do not modify my project's files.",
        'Review the code. Do not modify the website files.',
    ])('%s → no file is changed', async (text) => {
        expect(deniesEveryFileChange(text)).toBe(true);
        const intent = await parse(text);
        expect(intent.rawIntent?.noFileChanges || intent.rawIntent?.readOnly).toBe(true);
        expect(intent.requiredTools || []).not.toEqual(expect.arrayContaining(['write_file']));
    });

    test.each([
        'Do not change any other files.',
        'لا تعدل ملفات إنتاج أو إعدادات أو أسرار',
        'لا تعدل ملفات أخرى، فقط أنشئ ملف notes.txt فيه كلمة مرحبا',
    ])('%s still narrows the denial to some files', (text) => {
        expect(deniesEveryFileChange(text)).toBe(false);
    });

    test('«Do not modify anything. Read only.» stays read-only', async () => {
        expect((await parse('Do not modify anything. Read only.')).rawIntent).toMatchObject({ readOnly: true });
    });
});

describe('«ابدأ التصميم» orders the design started', () => {
    test('a definite verbal noun after a start verb is kept for the canonical reading', () => {
        expect(withoutDefiniteVerbalNouns('ابدأ التصميم')).toBe('ابدأ التصميم');
        expect(withoutDefiniteVerbalNouns('اعتمد التصميم وابدأ البناء')).toBe('اعتمد  وابدأ البناء');
        expect(withoutDefiniteVerbalNouns('أثبت البناء والتشغيل')).toBe('أثبت  والتشغيل');
    });

    test.each(['ابدأ التصميم', 'اعتمد التصميم وابدأ البناء'])('%s → built', async (text) => {
        expect(built(await parse(text))).toBe(true);
    });
});
