/**
 * ASKED TO EXPLAIN TWO LANGUAGES, JOE RAN ONE AND BUILT THE OTHER.
 *
 * Measured on the planner itself, before the guard this file protects:
 *
 *   «اشرح لي ما هو الفرق بين React و Vue»   → react_project
 *   «اشرح لي ما هو الفرق بين Python و Java» → execute_python → java_builder
 *
 * `capabilityPlan` asks «which tool PERFORMS this?», and that question only has
 * an answer when something is being ordered. Its one guard was `looksLikeBuild`,
 * which sorted the world into build and not-build — two boxes for three kinds of
 * sentence. A question landed in not-build, reached keyword matching, and a bare
 * technology NAME became an engineering order.
 *
 * The tests below are paired on purpose. Refusing questions is only half the
 * contract; the other half is that capabilityPlan still claims real orders. A
 * guard that returned true for everything would satisfy the first half alone.
 */
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';

const toolsOf = (goal: string): string[] => {
    const plan: any = PlanningEngine.capabilityPlan({ goal });
    return (plan?.steps || []).map((s: any) => String(s.tool));
};

describe('INVARIANT: a question is answered, not executed', () => {
    // The two field measurements, verbatim.
    test.each([
        'اشرح لي ما هو الفرق بين React و Vue',
        'اشرح لي ما هو الفرق بين Python و Java',
        'هل React أفضل من Vue للمبتدئين؟',
        'متى أستخدم React ومتى أستخدم Next.js؟',
        'what is the difference between React and Vue',
    ])('no capability route for: %s', (goal) => {
        expect(PlanningEngine.capabilityPlan({ goal })).toBeNull();
    });

    test('a technology name inside a question never reaches a builder', () => {
        const tools = toolsOf('اشرح لي ما هو الفرق بين Python و Java');
        expect(tools).toEqual([]);
        // Named explicitly: these are the tools the field actually got.
        expect(tools).not.toContain('execute_python');
        expect(tools).not.toContain('java_builder');
    });

    it('classifies a how-to question without waiting for deep provider analysis', async () => {
        const intelligentRouter = require('../core/llm/intelligent-router').default;
        const routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('must not be called'));
        const intent = await IntentParser.parse('كيف أشغّل المشروع؟', {} as any);
        expect(intent).toMatchObject({
            suggestedAgent: 'General',
            requiredTools: ['central_answer'],
            rawIntent: { knowledgeQuestion: true, deterministic: true },
        });
        expect(routeToModel).not.toHaveBeenCalled();
        routeToModel.mockRestore();
    });

    it('plans a knowledge question directly instead of spending a semantic-router call', async () => {
        const semanticRoute = jest.spyOn(PlanningEngine, 'classifyRequestIntent').mockRejectedValue(new Error('must not be called'));
        const plan = await PlanningEngine.generatePlan({ intent: {
            goal: 'كيف أشغّل المشروع؟',
            complexity: 'low', riskLevel: 'low', suggestedAgent: 'General', rawIntent: {},
        } as any });
        expect(plan.steps.map(step => step.tool)).toEqual(['project_runtime_guide']);
        expect(semanticRoute).not.toHaveBeenCalled();
        semanticRoute.mockRestore();
    });
});

describe('INVARIANT: the guard refuses questions WITHOUT swallowing orders', () => {
    // Positive control. If isKnowledgeQuestion ever grows to match everything,
    // these fail — which is the whole point of pairing them with the tests above.
    test.each([
        ['فحص أمني للموقع', 'security_scanner'],
        ['اضغط الصور', 'archive_files'],
        ['ترجم هذا النص إلى الإنجليزية', 'browser_translate'],
    ])('capabilityPlan still claims: %s', (goal, expected) => {
        expect(toolsOf(goal)).toContain(expected);
    });

    /**
     * A DEED OUTRANKS A QUESTION MARK.
     *
     * «هل يمكنك بناء موقع لي؟» is shaped like a question and is not one: the
     * thing named is a deed, and the deed is what must happen. isKnowledgeQuestion
     * checks for a deed FIRST, before any interrogative, and this pins that order.
     */
    test.each([
        'هل يمكنك بناء موقع لي؟',
        'كيف أنشر المشروع؟ انشره الآن',
        'can you build me a website?',
    ])('not a question, because it names a deed: %s', (goal) => {
        expect(PlanningEngine.isKnowledgeQuestion(goal)).toBe(false);
    });

    test('a build request is still a build request', () => {
        expect(PlanningEngine.isKnowledgeQuestion('ابن لي تطبيق React')).toBe(false);
        expect(PlanningEngine.looksLikeBuild('ابن لي تطبيق React')).toBe(true);
    });

    it('routes a deterministic capability before the expensive semantic analysis', () => {
        expect(IntentParser.quickIntent('فحص أمني للموقع')).toEqual(expect.objectContaining({
            suggestedAgent: 'General',
            requiredTools: ['security_scanner'],
            rawIntent: expect.objectContaining({
                capabilityCandidate: 'security_scanner',
                deterministic: true,
            }),
        }));
    });

    it('asks for a missing capability target instead of executing a malformed tool call', async () => {
        const intent = IntentParser.quickIntent('فحص أمني للموقع');
        expect(intent).not.toBeNull();
        const plan = await PlanningEngine.generatePlan({ intent: intent! });
        expect(plan.steps.map(step => step.tool)).toEqual(['ask_user']);
        expect(plan.steps[0]?.input.question).toContain('security_scanner');
    });

    it('uses an explicit filesystem target when the capability contract has one', async () => {
        const intent = IntentParser.quickIntent('فحص أمني للموقع في C:\\work\\demo');
        expect(intent).not.toBeNull();
        const plan = await PlanningEngine.generatePlan({ intent: intent! });
        expect(plan.steps.map(step => step.tool)).toEqual(['security_scanner']);
        expect(plan.steps[0]?.input.projectPath).toBe('C:\\work\\demo');
    });

    it('does not turn a capability named in a question into an action', () => {
        expect(IntentParser.quickIntent('ما هو الفحص الأمني للموقع؟')?.rawIntent?.capabilityCandidate).toBeUndefined();
    });
});
