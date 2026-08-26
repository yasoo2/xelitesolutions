/**
 * A SHOP HE ASKED TO HAVE BUILT WAS ANSWERED WITH «YOU HAVE NO ORDERS YET».
 *
 * Measured on his machine and reproducible through the planner:
 *
 *     «اعمل لي متجراً … وجدول الطلبات فيه اسم الزبون … اعرض عدد الطلبات اليوم.
 *      شغّل البناء الحقيقي وافتح المعاينة الحية»
 *
 *     → steps: ["orders_read"]
 *     → «لا توجد طلبات بعد — حين يضغط زائر «اطلب الآن» في موقعك سيظهر طلبه هنا»
 *
 * One sentence of his request — «اعرض عدد الطلبات اليوم» — is a REQUIREMENT OF
 * THE THING BEING BUILT: a figure the shop must display. The orders branch read
 * it as an instruction to go and read orders out of a database, and so a
 * request to build a shop was answered by reporting that no orders had
 * arrived. Nothing was built and nothing was wrong, as far as Joe could tell.
 *
 * The class is the one this whole night keeps returning to: A DECISION TAKEN
 * FROM A FRAGMENT WHEN THE AUTHORITY IS THE WHOLE REQUEST — his columns losing
 * to an earlier list, his rules living in other sentences, his page names
 * swallowing the orders behind them, and now a reporting requirement mistaken
 * for a command.
 *
 * Three branches answer «show me my existing data» — orders, the form inbox,
 * and the business profile — and not one of them carried a build guard. Each
 * was relying on nobody writing a build request that happens to contain its
 * words. He just did. So the guard is shared and stated once, which is the
 * third law: fix the class, not the instance.
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

jest.setTimeout(180000);

const toolsFor = async (goal: string) => {
    const plan: any = await PlanningEngine.generatePlan({ intent: { goal } as any });
    return (plan?.steps || []).map((s: any) => String(s.tool || s.id));
};

const SHOP = 'اعمل لي متجراً اسمه «حلويات أم عمر» فيه صفحة المنتجات وصفحة الطلبات. جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر أو نافد) وصورة. وجدول الطلبات فيه اسم الزبون ورقم الهاتف والصنف والكمية والإجمالي. اعرض عدد الطلبات اليوم. شغّل البناء الحقيقي وافتح المعاينة الحية.';

describe('a requirement of the build is not a command of its own', () => {
    it('his shop is built, not answered with an order count', async () => {
        const tools = await toolsFor(SHOP);
        expect(tools).not.toContain('orders_read');
        expect(tools.some((t: string) => /project|react|page_builder|pipeline/i.test(t))).toBe(true);
    });

    it('and the same holds for the inbox and the profile wordings', async () => {
        //  The other two branches of the same family, named one by one so a
        //  fix that reaches only the one that bit us cannot pass.
        expect(await toolsFor('اعمل لي موقعاً للمطعم واعرض رسائل النموذج فيه. شغّل البناء الحقيقي.'))
            .not.toContain('form_inbox');
        expect(await toolsFor('اعمل لي موقعاً واعرض بيانات عملي في صفحة من نحن. شغّل البناء الحقيقي.'))
            .not.toContain('business_profile');
    });
});

describe('and reading his rows still works when that is what he asked', () => {
    it('«اعرض الطلبات» on its own reaches orders_read', async () => {
        //  The negative case, and the reason these branches exist: he reads
        //  visitor orders in the chat, server up or not. A build guard that
        //  swallowed this would replace one defect with another.
        expect(await toolsFor('اعرض الطلبات')).toContain('orders_read');
    });

    it('«كم طلب وصلني اليوم؟» too', async () => {
        expect(await toolsFor('كم طلب وصلني اليوم؟')).toContain('orders_read');
    });
});
