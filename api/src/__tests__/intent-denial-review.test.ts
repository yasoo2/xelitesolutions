import { PlanningEngine } from 'D:/Joe/xelitesolutions/api/src/core/orchestrator/PlanningEngine';

describe('authoritative user denial survives intent metadata', () => {
    const goal = 'Answer only. Do not execute anything. Explain how to open http://example.test in a browser. Do not change any files.';
    test.each([
        {},
        { noFileChanges: true },
        { noFileChanges: true, answerOnly: false },
    ])('keeps explicit no-execution with metadata %j', async (rawIntent) => {
        const plan = await PlanningEngine.generatePlan({ intent: {
            goal, rawIntent, complexity: 'low', riskLevel: 'low', suggestedAgent: 'General',
        } });
        expect(plan.steps.map(step => step.tool)).toEqual(['central_answer']);
    });

    test('still permits a direct observation with a file-only constraint', async () => {
        const plan = await PlanningEngine.generatePlan({ intent: {
            goal: 'Open http://example.test in the browser and read the status. Do not change any files.',
            rawIntent: { noFileChanges: true }, complexity: 'low', riskLevel: 'low', suggestedAgent: 'Browser',
        } });
        expect(plan.steps[0].tool).toBe('browser_launch');
    });
});
