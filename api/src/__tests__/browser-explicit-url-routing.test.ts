import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const plan = (goal: string) =>
    PlanningEngine.generatePlan({
        intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any,
    });

describe('explicit URL browser routing', () => {
    test('opens a URL before reading its title instead of searching an empty page', async () => {
        const p = await plan('استخدم متصفح Joe لفتح https://example.com واقرأ عنوان الصفحة فقط. لا تسجل دخولاً ولا تنفذ أي إجراء آخر.');

        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('browser_launch');
        expect(p.steps[0].input).toMatchObject({ url: 'https://example.com' });
        expect(p.steps[0].description).toContain('عنوان الصفحة');
    });

    test('a request to summarize page content is not swallowed by the title-only open path', async () => {
        const p = await plan('افتح https://example.com ثم لخّص محتوى الصفحة.');

        expect(p.steps[0].tool).toBe('browser_readability');
        expect(p.steps[0].input).toMatchObject({ url: 'https://example.com' });
    });
});
