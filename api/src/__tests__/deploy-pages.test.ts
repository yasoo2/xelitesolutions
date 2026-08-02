/**
 * Permanent deployment (proposal ب): a finished frontend goes from "works on my
 * machine" to a permanent public URL, FREE and keyless, via GitHub Pages. And
 * honestly: a backend can't run on Pages, so it says so instead of pretending.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const src = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'DeployPagesTool.ts'), 'utf-8');
const orch = fs.readFileSync(
    path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

const plan = (goal: string) =>
    PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });

describe('"انشر / deploy" routes to permanent deployment, deterministically', () => {
    test.each([
        'انشر المشروع',
        'أنشر الموقع على الإنترنت',
        'deploy the project',
        'publish my site',
        'ابغى رابط دائم للمشروع',
    ])('«%s» → deploy_pages', async (g) => {
        const p = await plan(g);
        expect(p.steps[0].tool).toBe('deploy_pages');
    });

    test('"شغّل المشروع" is NOT deploy', async () => {
        expect((await plan('شغّل المشروع')).steps[0].tool).toBe('project_run');
    });
    test('"ابنِ مشروعاً" is NOT deploy', async () => {
        expect((await plan('ابنِ لي نظام إدارة متكامل بباك اند')).steps[0].tool).toBe('project_pipeline');
    });

    // REGRESSION (from a real run): the runtime appends an ENGINEERING DISCIPLINE
    // block containing the words "deploy/launch/server/install". Intent detection
    // must see ONLY the user's request — a plain build must not be hijacked by
    // keywords inside the injected coaching text.
    test('a build request with the injected discipline block still routes to BUILD, not deploy', async () => {
        const injected = 'Build an admin dashboard for an online store'
            + '\n\n[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts or long-running services]:'
            + '\n1. Dependency freshness … never skip installing …'
            + '\n2. Crash-loop guard … restart … server …'
            + '\n3. Failure taxonomy in updaters … deploy …';
        const p = await plan(injected);
        expect(['web_page_builder', 'project_pipeline']).toContain(p.steps[0].tool);
        expect(p.steps[0].tool).not.toBe('deploy_pages');
        expect(p.steps[0].tool).not.toBe('project_run');
    });
    test('deploy_pages is deterministic in the orchestrator', () => {
        expect(orch).toMatch(/'deploy_pages'/);
    });
});

describe('the deploy is free, keyless, and reuses the connected token', () => {
    test('it resolves the GitHub token and the connected repo — no new key', () => {
        expect(src).toMatch(/getUserSecret|getSessionSecret/);
        expect(src).toMatch(/activeRepo/);
        expect(src).toMatch(/GitHub غير مربوط/);
        expect(src).toMatch(/لا يوجد مستودع مربوط/);
    });
    test('a static build is base-path-aware and pushed to gh-pages', () => {
        expect(src).toMatch(/--base=\$\{base\}/);
        expect(src).toMatch(/'checkout', \['-B', 'gh-pages'\]/);
        expect(src).toMatch(/'push', \['--force', 'origin', 'gh-pages'\]/);
        expect(src).toMatch(/\.nojekyll/);
    });
    test('it pushes from an ISOLATED temp dir — never touches the working tree', () => {
        expect(src).toMatch(/mkdtempSync/);
        expect(src).toMatch(/fs\.cpSync\(outDir, stage/);
        expect(src).toMatch(/rmSync\(stage/);
    });
    test('it enables Pages via the API and returns the permanent URL', () => {
        expect(src).toMatch(/ghApi\('POST', `\/repos\/\$\{owner\}\/\$\{repoName\}\/pages`/);
        expect(src).toMatch(/https:\/\/\$\{owner\}\.github\.io\/\$\{repoName\}\//);
    });
});

describe('honesty: a backend is refused, not faked', () => {
    test('a Node backend is rejected with a clear message and the local-run alternative', () => {
        expect(src).toMatch(/unsupported: 'backend'/);
        expect(src).toMatch(/suggestion: 'project_run'/);
        expect(src).toMatch(/باك اند/);
        expect(src).toMatch(/GitHub Pages يستضيف الملفات الثابتة فقط/);
    });
});
