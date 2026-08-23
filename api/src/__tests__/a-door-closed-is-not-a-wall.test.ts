/**
 * A DOOR CLOSED IS NOT A WALL.
 *
 * His clinic brief — five columns, a search, a total — was hijacked three
 * times by three different routers reading the same word, «أبحث», as an
 * order to Joe rather than a feature he wants in his table:
 *
 *   1. IntentParser's browser fast path — closed, and the log stopped saying
 *      «Deterministic fast intent (Browser)».
 *   2. PlanningEngine's search-priority gate, which asks looksBrowser —
 *      closed by teaching buildVerb the shared question.
 *   3. PlanningEngine's WEB SEARCH FAST-PATH, which asks nothing but the
 *      verb. The brief walked past the two closed doors and through this
 *      one, and the measured plan did not move at all between fix 1 and
 *      fix 2: `browser_search`, both times.
 *
 * So the earlier tests, which pinned each router's own predicate, could all
 * be green while the request still ended in a search box. This file asks the
 * only question that cannot be satisfied by a closed door: what does the
 * planner actually PLAN?
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const CLINIC = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.';

const plan = async (goal: string): Promise<string[]> => {
    const p = await (PlanningEngine as unknown as {
        generatePlan(a: unknown, b: string, c: unknown): Promise<{ steps?: Array<{ tool: string }> }>;
    }).generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', suggestedAgent: 'General', requiredTools: [], rawIntent: { primary: goal } } },
        'test',
        { userId: 'u', sessionId: 's', history: [] },
    );
    return (p?.steps || []).map(s => s.tool);
};

describe('what he describes building is not what he asked Joe to search for', () => {
    // POSITIVE — the exact live brief. No browser tool of any kind.
    it('the clinic brief plans no browser step', async () => {
        const tools = await plan(CLINIC);
        expect(tools.length).toBeGreaterThan(0);
        expect(tools.filter(t => t.startsWith('browser'))).toEqual([]);
    }, 180000);

    // POSITIVE — the same trap in another trade.
    it('a shop brief with a search feature plans no browser step', async () => {
        const tools = await plan('بدي متجر صغير أضيف فيه المنتجات وأبحث عن المنتج باسمه');
        expect(tools.filter(t => t.startsWith('browser'))).toEqual([]);
    }, 180000);

    // NEGATIVE — a real search must still open a browser, or the guard is a wall.
    it('a real search still plans browser_search', async () => {
        expect(await plan('ابحث لي عن سعر الدولار اليوم')).toContain('browser_search');
    }, 180000);

    // NEGATIVE — and so must a search wrapped in "open the browser and…".
    it('open-the-browser-and-search still plans browser_search', async () => {
        expect(await plan('افتح المتصفح وابحث عن أخبار اليوم')).toContain('browser_search');
    }, 180000);
});
