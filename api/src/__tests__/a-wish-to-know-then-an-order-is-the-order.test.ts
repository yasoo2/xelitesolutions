/**
 * «بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة» ORDERS A TABLE.
 *
 * He says what he wants to know, and then orders the thing that will tell
 * him. The readers took the opening wish to know for the whole message:
 *
 *   • «بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة» — a question
 *     to the build gate, a registry guess (query_optimizer) to the front door;
 *   • «عايز أعرف مين اشترى، اعمل صفحة تعرض الطلبات» — a browser was opened;
 *   • "I want to know how much I spent, make me a table with date, amount and
 *     category" — answered in prose: «know how» was read as a wish to learn
 *     how, though «how much» asks a quantity.
 *
 * The order came after a COMMA, and the order reader looked only after a full
 * stop or a question mark. After a wish to know, a clause is enough — when it
 * OPENS with the order and the order has its object. A wish to know HOW is a
 * lesson whatever follows it; a clause that shapes the answer («اكتب لي
 * الجواب», "make it short") orders nothing.
 */
import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBuildRequest, isKnowledgeQuestionStructural } from '../core/intelligence/intent-classifier';
import { hasRequestedAction, ordersInALaterClause, LATER_BUILD_ORDER } from '../core/intelligence/requested-action';

let routeToModel: jest.SpyInstance;
beforeAll(() => { routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('no model in this test')); });
afterAll(() => routeToModel.mockRestore());

const parse = (text: string) => IntentParser.parse(text, {} as any);
const answered = (intent: any) => (intent.requiredTools || []).includes('central_answer');
const built = (intent: any) => (intent.requiredTools || []).includes('project_pipeline') && !!intent.rawIntent?.buildRequest;

describe('a wish to know, then an order with its object: built', () => {
    it.each([
        'بدي أعرف كم صرفت، اعملي جدول فيه التاريخ والمبلغ والفئة',
        'عايز أعرف مين اشترى، اعمل صفحة تعرض الطلبات',
        'ابغى اعرف كم بعت، سو لي جدول فيه المنتج والسعر والكمية',
        'أبي أعرف كم صرفت، سوي لي جدول فيه التاريخ والمبلغ',
        'ودي أعرف وين تروح فلوسي، سو لي جدول فيه التاريخ والمبلغ والبند',
        'بدي أعرف كم صرفت. اعملي جدول فيه التاريخ والمبلغ والفئة',
        'بدي أعرف كم صرفت واعملي جدول فيه التاريخ والمبلغ والفئة',
        'بدي أعرف كم واحد اشترى، اعمل صفحة تعرض الطلبات',
        'بدي أعرف كم صرفت، اعملي جدول',
        'بدي أعرف كم صرفت، بدي جدول فيه التاريخ والمبلغ والفئة',
        'بدي أعرفَ كم صرفتُ، اعملي جدولاً فيه التاريخُ والمبلغُ والفئةُ',
        'أريد أن أعرف كم صرفت، أنشئ جدولا فيه التاريخ والمبلغ والفئة',
        'حاب أعرف مين سجل، ابني لي صفحة تعرض المسجلين',
        'عايز أشوف مين اشترى، اعمل صفحة تعرض الطلبات',
        'I want to see who signed up, build a page that lists them',
        'I want to know how much I spent, make me a table with date, amount and category',
        'I want to know how many users signed up, build me a dashboard with name, email and date',
        'I need to know who paid, create a table with name, amount and date',
        "I'd like to know which products sell best, build a dashboard that shows sales by product",
        'I want to understand where my money goes, so build me a table with date, amount and category',
    ])('%s', async (text) => {
        expect(isBuildRequest(text).isBuild).toBe(true);
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
        expect(built(await parse(text))).toBe(true);
    });
});

describe('a wish to know with no order after it is still a question', () => {
    it.each([
        'بدي أعرف كم صرفت',
        'بدي أعرف كم صرفت، قل لي بالتفصيل',
        'بدي أعرف كم صرفت، اكتب لي الجواب',
        'بدي أعرف شو الفرق بين الجدول والقائمة',
        'ابغى اعرف كيف اسوي جدول فيه الاسم والسعر والكمية',
        'بدي أفهم كيف أعمل جدول فيه اسم الموظف وراتبه وقسمه',
        'بدي أعرف كيف اعمل جدول، اشرح لي بالتفصيل',
        'بدي أعرف كيف أعمل جدول، وكيف اعمل صفحة',
        'بدي أعرف كيف أعمل جدول، اعمل لي مثال',
        'I want to know how to build a table with name and phone',
        'I want to know how much a table costs',
        'I want to know how much I spent, write it in two sentences',
        'I want to know how much I spent, make it short',
        'I want to understand how the login works, explain it step by step',
        'I want to know how to make a table, and how to build a page',
    ])('%s', async (text) => {
        expect(isBuildRequest(text).isBuild).toBe(false);
        expect(isKnowledgeQuestionStructural(text)).toBe(true);
        expect(answered(await parse(text))).toBe(true);
    });

    it.each([
        'عايز أعرف مين اشترى',
        'أبي تشرح لي كود الموقع',
        'بدي أعرف كم صرفت وبدي أعرف كم ربحت',
        'بدي أعرف كم صرفت، عايز الجواب بسرعة',
    ])('%s builds nothing', (text) => {
        expect(isBuildRequest(text).isBuild).toBe(false);
    });
});

describe('what was a build is still a build', () => {
    it.each([
        'بدي جدول فيه اسم المريض ورقم تلفونه',
        'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.',
        'اعملي جدول فيه التاريخ والمبلغ والفئة',
        'أبي تعدل صفحة النادي',
    ])('%s', (text) => {
        expect(isBuildRequest(text).isBuild).toBe(true);
    });
});

describe('the clause reader', () => {
    it('reads an order that opens a later clause, never a word inside one', () => {
        expect(ordersInALaterClause('بدي أعرف كم صرفت، اعمل لي جدول', LATER_BUILD_ORDER)).toBe(true);
        expect(ordersInALaterClause('بدي أعرف كم صرفت واعمل لي جدول', LATER_BUILD_ORDER)).toBe(true);
        expect(ordersInALaterClause('بدي أعرف كم صرفت', LATER_BUILD_ORDER)).toBe(false);
        expect(ordersInALaterClause('بدي أعرف مين اللي اعمل له الصفحة', LATER_BUILD_ORDER)).toBe(false);
        expect(ordersInALaterClause('بدي أعرف كم صرفت، هل اعمل جدول؟', LATER_BUILD_ORDER)).toBe(false);
        expect(ordersInALaterClause('I want to know who paid, build me a table', LATER_BUILD_ORDER)).toBe(true);
        expect(ordersInALaterClause('I want to know who paid, the table you build is fine', LATER_BUILD_ORDER)).toBe(false);
    });

    it('the wish to know a quantity lets the order count; the request reader then reads the order', () => {
        expect(hasRequestedAction('I want to know how much I spent, make me a table with date, amount and category').hasAffirmativeAction).toBe(true);
        expect(hasRequestedAction('I want to know how much a table costs').hasAffirmativeAction).toBe(false);
    });

    it('is linear: eight times the clauses cost about eight times the time', () => {
        const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
        const ms = (text: string): number => {
            let best = Infinity;
            for (let i = 0; i < 5; i++) {
                const t0 = process.hrtime.bigint();
                ordersInALaterClause(`${text} ${i}`, LATER_BUILD_ORDER);
                best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
            }
            return Math.max(best, 1);
        };
        // A loaded machine makes absolute times say little (the same reading varies tenfold),
        // so the best of five is compared across sizes: a quadratic reader takes sixty-four
        // times as long for eight times the text.
        for (const unit of ['بدي أعرف، ', 'واعمل ', '، ', 'ثم الآن من فضلك طيب، ', 'and then, ']) {
            ms(rep(unit, 2000));
            const small = ms(rep(unit, 5000));
            const whole = ms(rep(unit, 40000));
            expect(whole).toBeLessThan(Math.max(20 * small, 600));
            expect(whole).toBeLessThan(5000);
        }
    });
});
