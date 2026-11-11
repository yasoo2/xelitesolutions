/**
 * ⛔ «TRANSFORM IT INTO …» IMPROVES THE APP HE HAS; «A NEW APP» BUILDS ANOTHER.
 *
 * The analysis of 2026-11-11 (wiring-policy, failing on main): since fa810595d (2026-09-26) the
 * build reader called «I want to transform it into a real turn-by-turn navigation system» a build
 * — «system» is a web noun — and the enhancement rebuilt the open app from scratch, the failure
 * the fix-or-grow route was written for. Words that point at what exists make it an edit; words
 * asking for something new still build.
 */
const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');

const g: any = global as any;
const tools = async (goal: string) => (await PlanningEngine.generatePlan(
    { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } }, undefined, { sessionId: 's1' }))
    .steps.map((s: any) => s.tool).join(' + ');

beforeEach(() => {
    g.joeProjects = { s1: { dir: '/tmp/x', type: 'react', updatedAt: Date.now() } };
    g.joePages = {};
});
afterAll(() => { g.joeProjects = {}; g.joePages = {}; });

test.each([
    'The current route system is not sufficient. I want to transform it into a real turn-by-turn navigation system.',
    'The booking page is not enough — turn it into a full multi-step booking system with payments.',
    'نظام الحجز الحالي لا يكفي، حوّله إلى نظام حجز كامل بمواعيد ودفع',
    'التطبيق فيه مشكلة في السلة، طوّره ليصبح متجر كامل',
])('«%s» edits the open project', async goal => {
    expect(await tools(goal)).toBe('project_edit');
});

test.each([
    'Build a new app from scratch for a gym with classes and bookings.',
    'ابني تطبيق جديد لمطعم فيه قائمة طعام وطلبات',
])('«%s» builds another', async goal => {
    expect(await tools(goal)).not.toBe('project_edit');
});
