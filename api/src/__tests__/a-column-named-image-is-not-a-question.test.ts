/**
 * A SHOP HE ASKED FOR BECAME A CHAT, BECAUSE A COLUMN WAS CALLED «صورة».
 *
 * Measured on his machine and reproduced deterministically through the
 * planner itself — same input, same output, every run:
 *
 *     «اعمل لي متجراً اسمه «حلويات أم عمر» فيه صفحة المنتجات وصفحة الطلبات.
 *      جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة …
 *      شغّل البناء الحقيقي وافتح المعاينة الحية»
 *
 *     → steps: ["central_answer"]
 *
 * What he was shown was worse than an error: a cheerful plan in six numbered
 * points and «Please confirm if you'd like to proceed» — after telling Joe to
 * run the real build. Two minutes spent, nothing built, and nothing said about
 * why.
 *
 * The planner printed its own reason, and the two matches are the whole story:
 *
 *     VERB «وصف»  matched inside «وصفحة الطلبات»   ← «and a page», not «describe»
 *     NOUN «صور»  matched inside «وصورة»           ← a COLUMN in his table
 *
 * Neither word was his. This is the Arabic word-boundary problem the language
 * layer exists for: JavaScript defines `\b` by `\w`, which never holds an
 * Arabic letter, so a bare pattern reads LETTERS where the question is about
 * WORDS — the same defect as «زر» inside «أزرق» and «عدد» inside «متعدد».
 *
 * And the guard that should have caught it did not: `WANTS_BUILD_RE` did not
 * fire on «اعمل لي متجراً» either. One bad reader was relying on another bad
 * reader to catch it. So the branch now also refuses to fire on anything the
 * shared build test recognises — a request that reads as a build ANYWHERE is
 * never an image question.
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

jest.setTimeout(180000);

const SHOP = 'اعمل لي متجراً اسمه «حلويات أم عمر» فيه صفحة المنتجات وصفحة الطلبات. جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة. وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي. لا تقبل رقم هاتف أقل من ٩ أرقام. شغّل البناء الحقيقي وافتح المعاينة الحية.';

const toolsFor = async (goal: string) => {
    const plan: any = await PlanningEngine.generatePlan({ intent: { goal } as any });
    return (plan?.steps || []).map((s: any) => String(s.tool || s.id));
};

describe('a request to build is planned as a build', () => {
    it('his shop reaches a builder, not central_answer', async () => {
        const tools = await toolsFor(SHOP);
        expect(tools.join(',')).not.toContain('central_answer');
        expect(tools.some((t: string) => /project|react|page_builder|pipeline/i.test(t))).toBe(true);
    });

    it('and «وصفحة» is not «وصف» — the word, not the letters', async () => {
        //  The minimal form of the first match, with no image word at all, so
        //  a failure here can only be the verb reading.
        const tools = await toolsFor('اعمل لي متجراً فيه صفحة المنتجات وصفحة الطلبات. شغّل البناء الحقيقي.');
        expect(tools.join(',')).not.toContain('central_answer');
    });

    it('and a column called «صورة» is a column', async () => {
        const tools = await toolsFor('اعمل جدول منتجات فيه اسم الصنف والسعر وصورة. شغّل البناء الحقيقي.');
        expect(tools.join(',')).not.toContain('central_answer');
    });
});

describe('and a real image question is still answered, not built', () => {
    it('«حلل هذه الصورة» stays an answer', async () => {
        //  The negative case, and the reason this branch exists: a request to
        //  analyse a picture once planned exiftool, grep, a file write and a
        //  browser node — five failing steps and a raw ENOENT as the «answer».
        //  Widening the build guard must not bring that back.
        const tools = await toolsFor('حلل هذه الصورة وقل لي ما فيها');
        expect(tools.join(',')).toContain('central_answer');
    });

    it('«describe this screenshot» too', async () => {
        expect((await toolsFor('describe this screenshot for me')).join(',')).toContain('central_answer');
    });
});
