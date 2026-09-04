import { deterministicExistingEditPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

describe('existing-project planner fallback', () => {
    test('keeps an explicit edit executable when the planning model is unavailable', () => {
        const plan = deterministicExistingEditPhasesFor(
            'عدّل صفحة Visit وأضف تحققاً لحقل الهاتف ثم اختبره في المتصفح',
            'C:/workspace/react-science-museum',
        );

        expect(plan?.phases).toHaveLength(1);
        expect(plan?.phases[0].tasks[0]).toMatchObject({
            tool: 'project_edit',
            args: { dir: 'C:/workspace/react-science-museum' },
        });
    });

    test('does not invent an edit plan without an explicit mutation or project root', () => {
        expect(deterministicExistingEditPhasesFor('اقرأ المشروع واذكر ما فيه', 'C:/workspace/app')).toBeNull();
        expect(deterministicExistingEditPhasesFor('عدّل صفحة Visit', '')).toBeNull();
    });
});
