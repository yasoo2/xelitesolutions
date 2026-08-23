/**
 * A VAGUE REQUEST GETS A QUESTION, NOT A LECTURE.
 *
 * Measured live on the owner's machine. He wrote, in full:
 *
 *     «بدي شي أتابع فيه ديوني»
 *
 * That is a request to build, with nothing to build from. The right answer is
 * one question — «ماذا تريد أن تسجّل لكلّ دين؟». What he got was a financial
 * adviser:
 *
 *     «لبدء العمل، أحتاج إلى بعض المعلومات الإضافية:
 *      إجمالي مبلغ الديون … معدلات الفائدة … المدفوعات الشهرية الدنيا …
 *      الدخل الشهري … يمكننا استخدام استراتيجيات مثل طريقة التلال
 *      (تسديد الديون ذات أعلى معدلات فائدة أولاً) أو طريقة الثلج»
 *
 * Nothing was built and nothing was asked that would let anything be built.
 *
 * The clarify gate exists precisely for this and did not fire, because it
 * required a noun from its OWN private list — «موقع», «تطبيق», «متجر» — and
 * he had written «شي». A sixth vocabulary answering a question that already
 * had a shared answer.
 *
 * The repair is a shape, not a list: a tracking verb with an object is a
 * build-shaped request whatever the object is called. The VERB is the closed
 * class; the object never is. And «enough detail» for such a request means
 * one thing only — that he said what it will HOLD.
 */

import { isVagueBuildRequest } from '../core/orchestrator/clarify';

describe('something he says he will keep track of is something to be built', () => {
    // POSITIVE — the live request, and the same shape with objects in no list.
    it.each([
        ['الطلب الحيّ', 'بدي شي أتابع فيه ديوني'],
        ['شحنات', 'بدي أتابع شحناتي'],
        ['نوق', 'بدي أسجل نوقي'],
        ['كلمة بلا معنى', 'بدي أتابع الزنابق تبعي'],
        ['English', 'I want to track my shipments'],
        ['English manage', 'I need to manage my clients'],
    ])('%s is asked about, not answered', (_label, ask) => {
        expect(isVagueBuildRequest(ask)).toBe(true);
    });

    // POSITIVE — the gate's original case still works.
    it('a bare build request is still asked about', () => {
        expect(isVagueBuildRequest('ابن لي موقع')).toBe(true);
    });

    // NEGATIVE — a request that says what it holds is complete: build it, do not ask.
    it.each([
        ['العيادة', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'],
        ['English clinic', 'I want a table to record my clients: name, phone and email'],
        ['كشف ديون بالأعمدة', 'بدي أتابع ديوني: اسم المدين والمبلغ وتاريخ الدين'],
    ])('%s is built without questions', (_label, brief) => {
        expect(isVagueBuildRequest(brief)).toBe(false);
    });

    // NEGATIVE — a detailed build request is not interrogated either.
    it('a detailed site request is not asked about', () => {
        expect(isVagueBuildRequest('بدي متجر لبيع القهوة فيه صفحة منتجات وصفحة أسعار وسلة شراء')).toBe(false);
    });

    // NEGATIVE — and things that are not build requests at all stay out.
    it.each([
        ['سؤال', 'ما الفرق بين React وVue؟'],
        ['بحث', 'ابحث لي عن سعر الدولار'],
        ['شكوى', 'الجدول اللي عملته أمس صار بطيء'],
    ])('%s is neither built nor questioned', (_label, ask) => {
        expect(isVagueBuildRequest(ask)).toBe(false);
    });
});
