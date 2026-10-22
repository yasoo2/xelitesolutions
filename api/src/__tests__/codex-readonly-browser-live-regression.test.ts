import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const goal = 'Open http://127.0.0.1:5000/api/health in Joe’s Browser and report the status shown on the page. Do not create or change any files. Do not use any paid provider.';

describe('fresh official5002 read-only browser contract', () => {
    test('front-door intent preserves requested browser observation with no file changes', async () => {
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.rawIntent.answerOnly).not.toBe(true);
        expect(intent.requiredTools).not.toContain('central_answer');
    });
test('planner preserves exact live prompt navigation, not just modify-files spelling', async () => {
        // Use actual IntentParser output to ensure proper rawIntent flags
        const intent = await IntentParser.parse(goal, {} as any);
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'browser_launch', input: { url: 'http://127.0.0.1:5000/api/health', readContent: true } });
    });
    test('explicit no-execution remains answer-only even when an example contains a URL', async () => {
        const intent = await IntentParser.parse('Answer only. Do not execute anything. Explain how one could open http://127.0.0.1:5000/api/health in a browser.', {} as any);
        expect(intent.requiredTools).toEqual(['central_answer']);
    });
});
