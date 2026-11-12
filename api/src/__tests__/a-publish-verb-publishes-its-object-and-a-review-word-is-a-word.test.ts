/**
 * A PUBLISH VERB PUBLISHES ITS OBJECT, AND A REVIEW WORD IS A WORD.
 *
 * f7a95c498 fixed two real defects — «انشر مقالاً عن القهوة» chose
 * deploy_pages, and «راجع تقرير الجودة … نفّذ الإصلاحات بنفسك» went to
 * project_edit — and the pre-merge review measured what the two fixes took
 * with them (its parent, 239091867, routed every one of these correctly):
 *
 *   1. «خبرني بالرابط» blocked every deploy. The content guard was a bare
 *      substring and had become a veto over every road that can choose a
 *      deploy tool:
 *
 *          انشر الموقع وخبرني بالرابط        «خبر» inside «خبرني»
 *          انشره وأخبرني بالرابط             «خبر» inside «أخبرني»
 *          انشر موقع خبراتي                  «خبر» inside «خبراتي»
 *          انشر الموقع بعد تحديث المحتوى     «محتوى» anywhere
 *          Deploy my blog                     "blog" vetoed the word "deploy"
 *
 *      IntentParser hinted deploy_pages for each; capabilityPlan returned
 *      null, the fast path said no, the capability route was filtered — no
 *      deploy anywhere. «وأخبرني بالرابط» is the most natural thing he can
 *      say after «انشر الموقع».
 *
 *   2. With a built project open, construction went to project_repair:
 *
 *          Checkout flow with delivery options: build it …   "Check" inside "Checkout"
 *          Check the results and build a new chart …          a chart the lexicon does not know
 *          Audit the delivery module and create unit tests …
 *          Verify the delivery and build the missing invoice screen
 *
 * Now a content noun is a whole word, and it vetoes a site deploy only when
 * it is what the publish verb publishes (its object, or its pronoun's
 * antecedent) or when no site is named; "deploy" is never vetoed by its
 * object. The review verbs are whole words, and an imperative creation verb
 * with an object is a construction whatever the object. Every negative the
 * two fixes were made for is pinned beside its positive, so neither can be
 * bought back with the other.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// No model is ever reached from here: a request that falls past the
// deterministic routes falls through, it does not call a provider.
jest.mock('../core/llm/intelligent-router', () => ({
    ...jest.requireActual('../core/llm/intelligent-router'),
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
}));

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import * as normalizer from '../core/orchestrator/promptNormalizer';
import * as artifact from '../core/design/requested-artifact';

const FALLTHROUGH = 'fell-through';
const routeOf = async (goal: string, opts: { hint?: string; sessionId?: string; ms?: number } = {}): Promise<string> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const plan = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: opts.hint ? { capabilityCandidate: opts.hint } : {} } as any },
        undefined,
        opts.sessionId ? { sessionId: opts.sessionId } : {},
    ).then((p: any) => String(p?.steps?.[0]?.tool || FALLTHROUGH)).catch(() => FALLTHROUGH);
    const deadline = new Promise<string>(resolve => { timer = setTimeout(() => resolve(FALLTHROUGH), opts.ms ?? 20000); });
    return Promise.race([plan, deadline]).finally(() => { if (timer) clearTimeout(timer); });
};
const isDeployTool = (tool: string) => PlanningEngine.isSiteDeployTool(tool);

describe('«أخبرني بالرابط» is not news: a site deploy goes through', () => {
    it.each([
        'انشر الموقع وخبرني بالرابط',
        'انشر الموقع واخبرني بالرابط',
        'انشر الموقع بعد تحديث المحتوى',
        'انشر موقع خبراتي',
    ])('«%s» → deploy_pages on the fast path, with no veto', async (goal) => {
        const reading = PlanningEngine.readDeployIntent(goal);
        expect(reading.veto).toBe('');
        expect(reading.deploy).toBe(true);
        expect(await routeOf(goal)).toBe('deploy_pages');
    }, 60000);

    it.each([
        'انشره وأخبرني بالرابط',
        'انشر الموقع وخبرني بالرابط',
        'انشر التطبيق',
        'انشر المتجر',
        'انشره',
        'انشر الموقع',
        'انشر الموقع على GitHub Pages',
    ])('«%s» with IntentParser\'s deploy_pages hint → deploy_pages', async (goal) => {
        expect(PlanningEngine.readDeployIntent(goal).veto).toBe('');
        const plan = PlanningEngine.capabilityPlan({ goal, rawIntent: { capabilityCandidate: 'deploy_pages' } }, {});
        expect(plan?.steps?.map((s: any) => s.tool)).toContain('deploy_pages');
        expect(await routeOf(goal, { hint: 'deploy_pages' })).toBe('deploy_pages');
    }, 60000);

    it.each([
        'Deploy my blog',
        'deploy the site',
        'Deploy the API; the POST endpoint must work',
        'Deploy the app and post the link here',
    ])('"%s": the word "deploy" is never vetoed by its object', async (goal) => {
        const reading = PlanningEngine.readDeployIntent(goal);
        expect(reading.veto).toBe('');
        expect(reading.deploy).toBe(true);
        expect(isDeployTool(await routeOf(goal))).toBe(true);
    }, 60000);

    it('a build that publishes keeps its own road: «اعمل لي متجر وانشره» is not vetoed', () => {
        const reading = PlanningEngine.readDeployIntent('اعمل لي متجر وانشره');
        expect(reading.veto).toBe('');
        expect(reading.hasBuildVerb).toBe(true);
        expect(PlanningEngine.looksLikeBuild('اعمل لي متجر وانشره')).toBe(true);
    });
});

describe('…and publishing content is still not deploying a site', () => {
    it.each([
        'انشر مقالاً',
        'انشر مقالاً عن القهوة',
        'انشر تدوينة عن موقعي',
        'انشر منشوراً على تويتر',
        'اكتب مقالاً ثم انشره',
        'لا تنشر المقال، فقط احفظه',
        'publish a blog post about coffee',
        'publish the article on my site',
        'انشر الخبر على صفحة الشركة',
        'write an article and publish it',
    ])('«%s» → no deploy tool on any road, hinted or not', async (goal) => {
        const reading = PlanningEngine.readDeployIntent(goal);
        expect(reading.veto).not.toBe('');
        expect(reading.deploy).toBe(false);
        const hinted = PlanningEngine.capabilityPlan({ goal, rawIntent: { capabilityCandidate: 'deploy_pages' } }, {});
        expect((hinted?.steps || []).some((s: any) => isDeployTool(s.tool))).toBe(false);
        expect(isDeployTool(await routeOf(goal))).toBe(false);
        expect(isDeployTool(await routeOf(goal, { hint: 'deploy_pages' }))).toBe(false);
    }, 60000);

    it('a content noun that names the site is the site: «انشر موقع المقالات» deploys', () => {
        expect(PlanningEngine.readDeployIntent('انشر موقع المقالات')).toMatchObject({ veto: '', deploy: true });
    });

    it.each(['لا تنشر الموقع', 'لا تنشره', 'ابنِ الصفحة ولا تنشرها'])('«%s» is a denial: no deploy tool even when hinted', (goal) => {
        // Measured while fixing the veto: the denial reader knew «لا نشر/لا انشر»
        // only, so «لا تنشر الموقع» reached capabilityPlan and chose deploy_pages.
        expect(PlanningEngine.readDeployIntent(goal)).toMatchObject({ veto: 'denied', deniesExternalPublish: true, deploy: false });
        const hinted = PlanningEngine.capabilityPlan({ goal, rawIntent: { capabilityCandidate: 'deploy_pages' } }, {});
        expect((hinted?.steps || []).some((s: any) => isDeployTool(s.tool))).toBe(false);
    });
});

describe('a review word is a word, and a construction with a project open stays a construction', () => {
    const sessionId = 'publish-object-review-word-t';
    let projectDir: string;

    beforeAll(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-review-word-'));
        fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'dist', 'index.html'), '<!doctype html><html><body>built</body></html>');
        (global as any).joeProjects = {
            ...((global as any).joeProjects || {}),
            [sessionId]: { dir: projectDir, type: 'page', updatedAt: Date.now() },
        };
    });

    afterAll(() => {
        delete (global as any).joeProjects?.[sessionId];
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it.each([
        'Checkout flow with delivery options: build it with cart summary and payment',
        'Check the results and build a new chart for monthly sales',
        'Audit the delivery module and create unit tests for it',
        'Verify the delivery and build the missing invoice screen',
        'Build an ERP for a coffee shop: inventory, suppliers, an audit log and monthly reports',
        'Build a production-grade autonomous software platform called NEXUS with real backend APIs, database models, authentication, authorization, frontend functionality, tests, and a final visual quality audit after implementation.',
    ])('"%s" is a construction, not project_repair', async (goal) => {
        expect(PlanningEngine.isConstructionBrief(goal)).toBe(true);
        expect(await routeOf(goal, { sessionId, ms: 1500 })).not.toBe('project_repair');
    }, 60000);

    it('the review that orders its own repairs is still the review', async () => {
        const goal = 'راجع تقرير الجودة والنتيجة التي أنشأتها بنفسك. أصلح جميع الملاحظات المتبقية قبل التسليم: أزل المحتوى المكرر والحشو واجعل كل قسم وبطاقة منتجات مختلفاً ومرتبطاً فعلياً بالمشروع، تحقق من أن كل الصور والشعار والروابط المحلية تعمل ولا توجد أصول مفقودة أو روابط مشوهة، ثم أعد تشغيل الفحص البصري وفحص التفاعل ومراجعة الشيفرة والاختبارات المحلية. لا تكتفِ بذكر الملاحظات؛ نفّذ الإصلاحات بنفسك، وأعد الفحص حتى لا تبقى أخطاء JavaScript أو موارد 404 أو عناصر تفاعلية معطلة، ثم اعرض النتيجة النهائية مع الأدلة والملفات التي عدّلتها.';
        expect(PlanningEngine.isConstructionBrief(goal)).toBe(false);
        expect(await routeOf(goal, { sessionId })).toBe('project_repair');
        expect(await routeOf('راجع تقرير الجودة والنتيجة النهائية', { sessionId })).toBe('project_repair');
    }, 60000);

    it('a review whose verb makes only its fixes is not a construction', () => {
        expect(PlanningEngine.isConstructionBrief('Review the QA report and build the fixes')).toBe(false);
        expect(PlanningEngine.isConstructionBrief('Check the delivery and make sure every link works')).toBe(false);
    });
});

describe('both readers run on every request: this file\'s part is linear on a 5 KB adversarial message', () => {
    /*
     * The two readers also call three readers that live in other files —
     * normalizeIntentText, isBuildRequest (through looksLikeBuild) and
     * requestedArtifact. Measured on these very inputs, all three grow faster
     * than the text: at 20 KB, isBuildRequest took 26 s on «لا لا لا…»,
     * requestedArtifact 81 s on "build a a a…", normalizeIntentText 2 s on
     * «انشر مقال المحتوى خبر…». They are reported with this change and held
     * constant here, so the clock reads only what this file adds: the word
     * walks of readPublishedContent and ordersConstructionOfAnObject, and the
     * review-verb and denial patterns.
     */
    const rep = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
    let spies: jest.SpyInstance[] = [];
    beforeAll(() => {
        spies = [
            jest.spyOn(normalizer, 'normalizeIntentText').mockImplementation((s: string) => String(s || '').toLowerCase()),
            jest.spyOn(PlanningEngine, 'looksLikeBuild').mockReturnValue(true),
            jest.spyOn(artifact, 'requestedArtifact').mockReturnValue({ kind: null } as any),
        ];
    });
    afterAll(() => spies.forEach(spy => spy.mockRestore()));

    it.each([
        ['pronoun verbs', 'انشره '],
        ['content and site nouns', 'انشر مقال موقع المقالات خبرني '],
        ['determiners after a creation verb', 'build a a a the new '],
        ['review words', 'راجع وراجعه check checkout '],
        ['no spaces', 'انشرمقالخبرنيpublishpost'],
        ['denials', 'لا لا ولا تنشر do not '],
        ['diacritics', 'اِبْنِ مَقَالاً '],
        ['mixed', 'Check the results and build a new chart; انشر الموقع وخبرني بالرابط. اكتب مقالاً ثم انشره '],
    ])('%s', (_label, unit) => {
        const clock = (n: number) => {
            const text = rep(unit, n);
            const t0 = process.hrtime.bigint();
            PlanningEngine.readDeployIntent(text);
            PlanningEngine.isConstructionBrief(text);
            return Number(process.hrtime.bigint() - t0) / 1e6;
        };
        clock(1000); // warm
        expect(clock(5000)).toBeLessThan(500);
        expect(clock(20000)).toBeLessThan(2000);
    });
});
