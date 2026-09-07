import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const plan = (goal: string) => PlanningEngine.generatePlan({
    intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any,
});

describe('new builds that include QA and repair', () => {
    test('keeps an Arabic application brief on the build pipeline', async () => {
        const goal = 'أنشئ تطبيق ويب عربي لإدارة مصروفات شخصية: إضافة مصروف بالمبلغ والتصنيف والتاريخ والوصف، رفض المبلغ غير الرقمي أو غير الموجب، تصفية حسب التصنيف والشهر، حساب الإجمالي، تعديل وحذف مع تأكيد، حفظ البيانات بعد إعادة التحميل، وتصميم أصلي متجاوب. نفّذ اختبارات Browser QA استكشافية تشمل القيم الصحيحة والخاطئة والكيبورد والهاتف والحالات الفارغة، ثم أصلح ما يمكن إصلاحه وأبلغني فقط بالنتيجة المهمة.';

        const result = await plan(goal);

        expect(result.steps[0].tool).not.toBe('project_repair');
        expect(['project_pipeline', 'react_project']).toContain(result.steps[0].tool);
    });

    test('keeps an English application brief with a QA repair clause on the build pipeline', async () => {
        const goal = 'Create a responsive appointment application with patient, telephone, date, and status fields. Run exploratory browser tests for valid and invalid values, keyboard use, and mobile layout, then fix every measured defect before reporting the result.';

        const result = await plan(goal);

        expect(result.steps[0].tool).not.toBe('project_repair');
        expect(['project_pipeline', 'react_project']).toContain(result.steps[0].tool);
    });
});
