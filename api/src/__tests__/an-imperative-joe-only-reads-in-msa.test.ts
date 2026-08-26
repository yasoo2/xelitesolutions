/**
 * THE OWNER'S OWN ARABIC IS NOT READ AS A REQUEST.
 *
 * Measured live on the reference matrix, P14, from a prompt written the way
 * the owner actually writes:
 *
 *     أبي تعدّل صفحة النادي: خلّ العنوان أوضح، وحط زر اشتراك بارز، وأضف
 *     قسم يشرح مواعيد التمرين، ولا تشيل أي قسم موجود.
 *
 *     ->  Executive Summary: «Add an H1 title · Include alt text · Set lang="ar"»
 *
 * Four imperatives in one sentence, not one of them in Modern Standard
 * Arabic, and the page was never touched. Joe produced an English audit of a
 * page it did not change and reported it as the answer.
 *
 * The cause was isolated in ONE measurement — the same request in both
 * registers, everything else identical:
 *
 *     أبي تعدّل صفحة النادي وحط زر اشتراك بارز      ->  looksLikeBuild = false
 *     أريد تعديل صفحة النادي ووضع زر اشتراك بارز    ->  looksLikeBuild = true
 *
 * So the dialect alone decides it. The verb list carries «ابنِ» and «اصنع»
 * and «صمّم» — every one of them MSA — and nothing for «أبي», «حط», «خلّ»,
 * «شيل», which is how a Gulf speaker gives an order.
 *
 * THE CLASS: A CLOSED LIST OF VERBS IN ONE REGISTER OF A LANGUAGE THAT HAS
 * MANY. The file's own comment already says «a closed list of VERBS is the
 * same defect as a closed list of nouns, one coat further in» — written, and
 * then extended only in MSA.
 *
 * ⛔ And it does not FAIL, it DRIFTS. Joe never said «I did not understand».
 * It built something else and called it done, which is the one outcome the
 * owner cannot detect by looking.
 *
 * The negative cases are the boundary: a question must stay a question, and
 * a dialect word must not be found inside a longer word — «حط» lives inside
 * «محطة» and «شيل» inside «تشييل», and Arabic has no \b to stop it.
 */

import { looksLikeBuild } from '../core/orchestrator/buildIntent';

describe('an order is an order in the register he actually writes', () => {
    it('POSITIVE — the P14 prompt, verbatim', () => {
        expect(looksLikeBuild(
            'أبي تعدّل صفحة النادي: خلّ العنوان أوضح، وحط زر اشتراك بارز، '
            + 'وأضف قسم يشرح مواعيد التمرين باللهجة العربية المفهومة، ولا تشيل أي قسم موجود.',
        )).toBe(true);
    });

    it('POSITIVE — each dialect imperative on its own', () => {
        for (const request of [
            'أبي موقع لمطعمي',
            'ابي جدول مصاريف فيه البند والمبلغ',
            'حط لي زر اشتراك في الصفحة',
            'خلّ لي صفحة هبوط للنادي',
            'شيل القسم الفارغ من الصفحة',
            'سوّي لي متجر قهوة',
        ]) {
            expect({ request, build: looksLikeBuild(request) })
                .toEqual({ request, build: true });
        }
    });

    it('POSITIVE — and MSA still reads as it always did', () => {
        //  The half that already worked. A fix that traded one register for
        //  the other would be the same defect facing the other way.
        for (const request of [
            'أريد تعديل صفحة النادي ووضع زر اشتراك بارز',
            'ابنِ لي نظاماً لمشتل نباتات',
            'اصنع لي جدول مصاريف',
        ]) {
            expect({ request, build: looksLikeBuild(request) })
                .toEqual({ request, build: true });
        }
    });

    it('NEGATIVE — a question is still a question', () => {
        for (const request of [
            'ما هي عاصمة فرنسا؟',
            'كيف أشغّل جو على جهازي؟',
            'وش الفرق بين React وVue؟',
        ]) {
            expect({ request, build: looksLikeBuild(request) })
                .toEqual({ request, build: false });
        }
    });

    it('NEGATIVE — a dialect verb is not matched inside a longer word', () => {
        //  Arabic has no \b: JavaScript defines it by [A-Za-z0-9_], so there
        //  is no boundary between two Arabic letters and a bare «حط» would
        //  match inside «محطة». This is the class this repository has closed
        //  four times; adding verbs must not reopen it.
        for (const request of [
            'ما هي أقرب محطة قطار من هنا؟',
            'كم سعر تشييل الأثاث؟',
            'وش معنى الاستحطاب؟',
        ]) {
            expect({ request, build: looksLikeBuild(request) })
                .toEqual({ request, build: false });
        }
    });
});
