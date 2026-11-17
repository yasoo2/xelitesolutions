/**
 * «الزر ما بيشتغل، صلحه» IS AN ORDER TO FIX THE BUTTON. IT ASKS NOTHING.
 *
 * «ما» is «what» — and it is «not». Every question reader knew only the
 * first: wherever a «ما» stood, the message was a knowledge question. So «الزر
 * ما بيشتغل، صلحه», «الصفحة ما تفتح صلحها», «الفورم ما بيبعت، عدله» — the way
 * he reports a fault, in his own dialect — were each answered with a
 * paragraph, and nothing was fixed. «شغّل السيرفر بعد ما تخلص», «عدّل الصفحة زي
 * ما قلت لك», «نفّذ ما طلبته منك» were questions for the same reason.
 *
 * The grammar, not a list of his sentences: «ما» asks where a question can
 * stand — opening its clause, after a verb of telling or knowing, or before
 * what a question is about (a pronoun, a definite noun, «رأيك»). After any
 * other word — a subject, a conjunction, a verb, an indefinite noun — it
 * negates, relates or leaves open. Opening a clause it still negates before
 * what only a negated verb takes: «عم», «رح», «عاد», «زال», the dialect's
 * present «بيشتغل».
 *
 * And every neighbour that was a question is still one — «ليش الزر ما
 * بيشتغل؟» asks why.
 */
import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBuildRequest, isKnowledgeQuestionStructural, isBrowserRequest } from '../core/intelligence/intent-classifier';
import { hasRequestedAction, withoutNegatingMa } from '../core/intelligence/requested-action';
import { normalizeIntentText } from '../core/orchestrator/promptNormalizer';

let routeToModel: jest.SpyInstance;
beforeAll(() => { routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('no model in this test')); });
afterAll(() => routeToModel.mockRestore());

const parse = (text: string) => IntentParser.parse(text, {} as any);
const answered = (intent: any) => (intent.requiredTools || []).includes('central_answer');
const asks = (text: string) => /(?<![\p{L}])ما(?![\p{L}])/u.test(withoutNegatingMa(text));

describe('«ما» after the subject negates: the fault is reported, the fix is ordered', () => {
    const orders = [
        'الزر ما بيشتغل، صلحه',
        'الصفحة ما تفتح صلحها',
        'الفورم ما بيبعت، عدله',
        'زر الحفظ ما يشتغل، أصلحه',
        'الصورة ما بتظهر في الصفحة الرئيسية، صلحها',
        'القائمة ما تنزل على الجوال، عدلها',
        'الزرار ما بيشتغلش، صلحه',
        'صفحتي ما تفتح، صلحها',
        'الكود اللي كتبته ما يشتغل، عدله',
        'الزر ما اشتغل، صلحه',
        'API ما بيرد، صلحه',
        'زر الدفع عندي ما يشتغل أبدا، صلحه',
        'الموقع اللي سويته لي ما يفتح، صلحه',
        'الصفحة ما فيها زر حفظ، ضيفه',
        'زر الإرسال في الفورم ما يرسل البيانات، عدله',
        'الزرُّ ما بيشتغلْ، صلِّحْهُ',
    ];
    it.each(orders)('%s is not a question, and is not answered with words', async (text) => {
        expect(asks(text)).toBe(false);
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(hasRequestedAction(text)).toMatchObject({ hasDenial: false, isAnswerOnly: false, isNoFileChanges: false });
        expect(hasRequestedAction(text).reason).not.toMatch(/question/);
        expect(answered(await parse(text))).toBe(false);
    });

    it.each([
        'الزر ما بيشتغل',
        'الزر ما يشتغل لما أضغط عليه',
        'الصفحة ما تفتح على الجوال',
    ])('%s reports a fault: no question is asked', (text) => {
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
    });
});

describe('«ما» that opens the clause still negates before what only a negated verb takes', () => {
    it.each([
        'ما عم يشتغل الزر، صلحه',
        'ما بيشتغل الزر، صلحه',
        'ما رح يفتح الموقع هيك، عدل الإعدادات',
        'ما زال الخطأ موجود، صلحه',
        'طيب ما عم يفتح الموقع، صلحه',
    ])('%s', async (text) => {
        expect(asks(text)).toBe(false);
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(hasRequestedAction(text).reason).not.toMatch(/question/);
        expect(answered(await parse(text))).toBe(false);
    });
});

describe('«ما» that relates or leaves open asks nothing either', () => {
    it.each([
        'شغل السيرفر بعد ما تخلص',
        'عدل الصفحة زي ما قلت لك',
        'رتب الملفات مثل ما تشوف',
        'نفذ ما طلبته منك',
        'أضف زر بلون ما',
        'احذف الملف قبل ما تنشر',
    ])('%s', async (text) => {
        expect(asks(text)).toBe(false);
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(answered(await parse(text))).toBe(false);
    });
});

describe('every question is still a question', () => {
    it.each([
        'ما الفرق بين React و Vue؟',
        'ما الفرق بين React و Vue',
        'ما هي أفضل قاعدة بيانات؟',
        'ما هي أفضل قاعدة بيانات',
        'ما هو Docker',
        'ما معنى API',
        'ما رأيك في التصميم',
        'ما يميز React عن Vue',
        'ما أفضل طريقة لتنظيم وقتي',
        'ما بيانات الاعتماد المطلوبة للنشر',
        'ما بنية المشروع المناسبة',
        'طيب ما الفرق بين الاثنين',
        'يا جو ما رأيك في التصميم',
        'برأيك ما أفضل لغة برمجة',
        'قل لي ما معنى API',
        'ممكن تقول لي ما سبب الخطأ',
        'اشرح لي ما يفعله هذا الكود',
        'أريد أن أعرف ما هو الفرق بين SQL و NoSQL',
        'الزر ما هو',
    ])('%s — its «ما» asks', async (text) => {
        expect(asks(text)).toBe(true);
        expect(isKnowledgeQuestionStructural(text)).toBe(true);
        expect(isBuildRequest(text).isBuild).toBe(false);
        expect(answered(await parse(text))).toBe(true);
    });

    it.each([
        'ليش الزر ما بيشتغل؟',
        'ليش الزر ما بيشتغل',
        'ليه الزرار ما بيشتغلش',
        'لماذا الزر ما يعمل',
        'هل الزر ما بيشتغل عندك',
        'الزر ما لونه؟',
        'ما سبب أن الزر ما بيشتغل؟',
        'ليش الموقع بطيء',
        'What is the difference between let and const',
    ])('%s — asked by its question word or its mark', async (text) => {
        expect(isKnowledgeQuestionStructural(text)).toBe(true);
        expect(answered(await parse(text))).toBe(true);
    });

    it('«ليش الموقع بطيء؟ صلحه» still asks, then orders: the order wins', () => {
        expect(isKnowledgeQuestionStructural('ليش الموقع بطيء؟ صلحه')).toBe(false);
    });
});

describe('a wish that «ما» negates is no wish', () => {
    it.each([
        'أنا ما أبي صفحة جديدة',
        'أنا ما بدي قاعدة بيانات',
        'الصفحة ما بدي فيها جدول',
    ])('%s builds nothing', (text) => {
        expect(isBuildRequest(text).isBuild).toBe(false);
    });

    it.each([
        'بدي صفحة جديدة',
        'أبي صفحة جديدة لمطعمي',
        'الجدول ما يظهر، اعمل جدول جديد فيه الاسم والسعر',
    ])('%s still builds', (text) => {
        expect(isBuildRequest(text).isBuild).toBe(true);
    });
});

describe('the page he names is not a verb, and «صلحه» is not a page', () => {
    it.each([
        'الزر ما بيشتغل، صلحه',
        'الصفحة ما تفتح صلحها',
        'أنا ما أبي صفحة جديدة',
        'عدل الصفحة زي ما قلت لك',
        'الزر مش شغال، صلحه',
        'صلحه',
        'الصفحة لا تفتح، صلحها',
        'صلح الصفحة الرئيسية',
        'غير لون الصفحة',
        'الصفحة بطيئة',
        'اقرأ كود الموقع وقلي المشاكل',
    ])('%s is not an order to browse', async (text) => {
        expect(isBrowserRequest(text).isBrowser).toBe(false);
        expect((await parse(text)).requiredTools || []).not.toContain('browser_run');
    });

    it('«صلحه», «شبكة», «موقف» are words, not misspellings of «صفحة», «شركة», «موقع»', () => {
        expect(normalizeIntentText('الزر ما بيشتغل، صلحه')).not.toContain('صفحة');
        expect(normalizeIntentText('اعمل شبكة اجتماعية')).not.toContain('شركة');
        expect(normalizeIntentText('موقف السيارات')).not.toContain('موقع');
        expect(isBuildRequest('بدي الزر يشتغل، صلحه').isBuild).toBe(false);
        // A dropped or added letter is still a typo, and so is a changed letter in a longer word.
        expect(normalizeIntentText('اعمل صفحهه')).toContain('صفحة');
        expect(normalizeIntentText('لشركه برمجيات')).toBe(normalizeIntentText('لشركة برمجيات'));
        expect(normalizeIntentText('بدي امني صفحة')).toBe(normalizeIntentText('بدي ابني صفحة'));
    });

    it.each([
        'افتح الصفحة الرئيسية',
        'لخص الصفحة',
        'صف الصفحة',
        'شوف الصفحة وقلي شو فيها',
        'اضغط على زر الدفع في الصفحة',
        'اقرأ الصفحة',
        'ادخل الصفحة',
        'روح على صفحة المنتجات',
        'انزل لآخر الصفحة',
    ])('%s is still the browser\'s', (text) => {
        expect(isBrowserRequest(text).isBrowser).toBe(true);
    });
});

describe('the «ما» reader is linear', () => {
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    let salt = 0;
    /** A cold reading (the reader remembers its last ones): the best of three, each of a text it has not read. */
    const ms = (text: string): number => {
        let best = Infinity;
        for (let i = 0; i < 5; i++) {
            const fresh = `${text} ${++salt}`;
            const t0 = process.hrtime.bigint();
            withoutNegatingMa(fresh);
            withoutNegatingMa(fresh, true);
            best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
        }
        return Math.max(best, 1);
    };
    it.each([
        ['«ما ما ما»', 'ما '],
        ['«الزر ما بيشتغل» repeated', 'الزر ما بيشتغل '],
        ['«ما الفرق؟» repeated', 'ما الفرق؟ '],
        ['one endless clause with «ما» at its end', 'كلمة '],
        ['«ما» between commas', '، ما ،'],
    ])('%s: eight times the text costs about eight times the time', (_label, unit) => {
        for (let i = 0; i < 3; i++) ms(rep(unit, 1000) + ' ما بيشتغل');
        // A loaded machine makes absolute times say little (the same reading varies tenfold),
        // so the best of five is compared across sizes: a reader that grows with the square
        // of the text takes sixty-four times as long for eight times the text.
        const small = ms(rep(unit, 5000) + ' ما بيشتغل');
        const whole = ms(rep(unit, 40000) + ' ما بيشتغل');
        expect(whole).toBeLessThan(Math.max(20 * small, 600));
        expect(whole).toBeLessThan(5000);
    });

    it('a reading asked for again is remembered, and is the same reading', () => {
        const text = 'الزر ما بيشتغل، صلحه — ما الفرق؟';
        expect(withoutNegatingMa(text)).toBe(withoutNegatingMa(text));
        // The «ما» that negates is blanked (with its verb, on request); the one that asks stays; no word moves.
        expect(withoutNegatingMa(text)).toBe(`الزر ${' '.repeat(2)} بيشتغل، صلحه — ما الفرق؟`);
        expect(withoutNegatingMa(text, true)).toBe(`الزر ${' '.repeat(9)}، صلحه — ما الفرق؟`);
        expect(withoutNegatingMa(text, true)).toHaveLength(text.length);
    });
});
