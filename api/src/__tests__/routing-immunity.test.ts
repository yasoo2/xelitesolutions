/**
 * Fast-path immunity: the whole CLASS of the deploy-hijack bug.
 *
 * Two failure modes this locks out:
 *   1. Injected coaching text (STANDING INSTRUCTIONS / ENGINEERING DISCIPLINE,
 *      which the runtime appends and which contains build/deploy/launch/server)
 *      must NOT change where a request routes.
 *   2. Ambiguous verbs must not collide across intents — "انشر مقالاً" (publish
 *      content) is not deploy; "كيف أشغّل المشروع" (a question) is not run;
 *      "شغّل المتصفح" (browser) is not project_run.
 */
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const DISCIPLINE =
    '\n\n[STANDING USER INSTRUCTIONS — always apply to HOW you work]:\nuse the terminal.' +
    '\n\n[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts or long-running services]:' +
    '\n1. Dependency freshness ... never skip installing ... server ...' +
    '\n2. Crash-loop guard ... restart ... deploy ...' +
    '\n3. Failure taxonomy ... launch ... publish ...';

const plan = (goal: string) =>
    PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any });

// The deterministic fast-paths run BEFORE any LLM. So a plan that resolves fast
// took a fast-path; one that doesn't (a content/question request with no
// provider in the test) fell through to the semantic router — which by
// definition means NO deterministic fast-path claimed it. Race a short timer so
// the fall-through cases don't hang the suite.
const FALLTHROUGH = 'llm-fallthrough';
const tool = async (goal: string): Promise<string> => {
    const raced = await Promise.race([
        plan(goal).then(p => p.steps[0].tool).catch(() => FALLTHROUGH),
        new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); }),
    ]);
    return raced;
};

describe('injected coaching text never changes routing', () => {
    const cases: Array<[string, string]> = [
        ['Build an admin dashboard for an online store', 'web_page_builder'],
        ['ابنِ لي نظام إدارة متكامل بباك اند وقاعدة بيانات', 'project_pipeline'],
        ['اصنع لي صفحة هبوط لمطعم', 'web_page_builder'],
        ['شغّل المشروع', 'project_run'],
        ['أوقف المشروع', 'project_stop'],
        ['انشر المشروع على GitHub Pages', 'deploy_pages'],
    ];
    for (const [g, expected] of cases) {
        it(`«${g}» routes the same with and without the injected block`, async () => {
            expect(await tool(g)).toBe(expected);
            // Identical routing once the coaching block is appended.
            expect(await tool(g + DISCIPLINE)).toBe(expected);
        });
    }
});

describe('ambiguous verbs do not collide across intents', () => {
    it('"انشر مقالاً عن القهوة" (publish CONTENT) is NOT deploy', async () => {
        expect(await tool('انشر مقالاً عن القهوة')).not.toBe('deploy_pages');
    });
    it('"publish a blog post about coffee" is NOT deploy', async () => {
        expect(await tool('publish a blog post about coffee')).not.toBe('deploy_pages');
    });
    it('"انشر المشروع" (deploy the SITE) IS deploy', async () => {
        expect(await tool('انشر المشروع')).toBe('deploy_pages');
    });
    it('"publish my website" IS deploy', async () => {
        expect(await tool('publish my website')).toBe('deploy_pages');
    });
    it('"كيف أشغّل المشروع؟" (a QUESTION) is NOT project_run', async () => {
        expect(await tool('كيف أشغّل المشروع؟')).not.toBe('project_run');
    });
    it('"how do I run the project" (a question) is NOT project_run', async () => {
        expect(await tool('how do I run the project')).not.toBe('project_run');
    });
    it('"ابحث عن كيفية تشغيل المشروع" (SEARCH) is NOT project_run', async () => {
        expect(await tool('ابحث عن كيفية تشغيل المشروع')).not.toBe('project_run');
    });
    it('"ابنِ وشغّل المشروع" (BUILD wins) is not project_run', async () => {
        expect(await tool('ابنِ وشغّل المشروع')).not.toBe('project_run');
    });
    it('"شغّل المشروع الآن" (plain run) IS project_run', async () => {
        expect(await tool('شغّل المشروع الآن')).toBe('project_run');
    });
});
