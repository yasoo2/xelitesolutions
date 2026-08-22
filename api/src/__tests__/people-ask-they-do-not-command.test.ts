/**
 * A BUILD REQUEST THAT WAS READ AS «UNDO», AND NEVER BUILT.
 *
 * Measured live on the owner's machine, from a request he typed himself in the
 * browser — a car-parts shop page: five fields, persistence across a reload,
 * search by name or number, two computed totals, and a red row under three in
 * stock. Three hundred and eight characters of brief.
 *
 * Joe built nothing. The log:
 *
 *     Starting REAL-TIME orchestration for goal: أنا عندي محل قطع سيارات…
 *     Executing node: project_undo (إرجاع المشروع إلى نسخته السابقة)
 *     PlanningEngine: Generating DAG for: Fix and continue: إرجاع المشروع…
 *     ⚠️ توقّفت عند «تهيئة نظام إدارة النسخ» — approval_required
 *
 * Two independent defects had to line up for that, and both are guarded here.
 *
 * ONE — «أرجع» IS «I COME BACK». The brief says «لما أسكر الصفحة وأرجع أفتحها»:
 * when I close the page and come back to open it. A bare verb match read it as
 * «revert», and one word replaced the whole brief with a rollback step. The
 * contract names this class and prescribes the cure: «اشترط سياقاً.»
 *
 * TWO — THE BUILD GATE ONLY HEARD ORDERS. Every verb it knew was imperative:
 * ابنِ, اصنع, اعمل, build, create. Measured before the fix: «اعمل لي صفحة فيها
 * جدول» → true, «بدي صفحة فيها جدول» → FALSE, and «I want a page where I record
 * every part» → FALSE. So `buildRequest` was false for a plain construction
 * brief, and every route that trusts it was reading the wrong answer.
 *
 * People ask. They do not issue commands.
 */
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const build = (s: string): boolean => (PlanningEngine as any).looksLikeBuild(s);

/** The request as the owner typed it, verbatim. */
const OWNER_BRIEF = 'أنا عندي محل قطع سيارات. بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر البيع. لما أضيف قطعة تنحفظ وتضل موجودة لما أسكر الصفحة وأرجع أفتحها. وبدي أبحث عن القطعة باسمها أو رقمها، وبدي يطلع لي تحت مجموع رأس المال ومجموع الربح المتوقع، وإذا كمية قطعة صارت أقل من 3 يصير لونها أحمر عشان أنتبه.';

describe('INVARIANT: a wish for a page is a build request', () => {
    test('the brief that was swallowed is a build request', () => {
        expect(build(OWNER_BRIEF)).toBe(true);
    });

    test('desire phrasing counts, in both languages', () => {
        expect(build('بدي صفحة فيها جدول')).toBe(true);
        expect(build('محتاج تطبيق لإدارة المخزون')).toBe(true);
        expect(build('I want a page where I record every part')).toBe(true);
        expect(build('can you build a dashboard for my shop')).toBe(true);
    });

    test('and the imperatives that already worked still do', () => {
        expect(build('اعمل لي صفحة فيها جدول')).toBe(true);
        expect(build('اصنع صفحة فيها قائمة')).toBe(true);
        expect(build('Build me a page with a table')).toBe(true);
    });

    test('IS NOT VACUOUS: a wish that reaches no build noun is not a build', () => {
        expect(build('بدي أعرف كم الساعة')).toBe(false);
        expect(build('ارجع للنسخة السابقة')).toBe(false);
        expect(build('I want to know how this works')).toBe(false);
    });
});

/**
 * The planner's own undo condition, held to the same contract: the ambiguous
 * verbs need an object that only an undo has; the unambiguous ones stand alone.
 */
const undoVerb = (probe: string): boolean =>
    /(تراجع|استرجع|\bundo\b|\brollback\b|\brevert\b)/i.test(probe)
    || /(ارجع|أرجع|رجّع|رجع)\s+(?:\S+\s+){0,2}?\S*(نسخ|اصدار|إصدار|تعديل|تغيير|وراء|خلف|سابق)/i.test(probe);

describe('INVARIANT: «أرجع» alone does not mean revert', () => {
    test('the owner coming back to his own page is not a rollback', () => {
        expect(undoVerb(OWNER_BRIEF)).toBe(false);
        expect(undoVerb('لما أسكر الصفحة وأرجع أفتحها')).toBe(false);
    });

    test('an undo that names what to undo is still an undo', () => {
        expect(undoVerb('ارجع للنسخة السابقة')).toBe(true);
        expect(undoVerb('رجّع آخر تعديل')).toBe(true);
        expect(undoVerb('ارجع خطوة للوراء')).toBe(true);
    });

    test('and the verbs that mean nothing else still stand alone', () => {
        expect(undoVerb('تراجع')).toBe(true);
        expect(undoVerb('استرجع')).toBe(true);
        expect(undoVerb('undo the last change')).toBe(true);
        expect(undoVerb('rollback')).toBe(true);
    });
});
