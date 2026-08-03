/**
 * STAGE 5 — import & understand an existing project, locked.
 *
 * The analyzer reports FACTS from the files (a framework it names must be in
 * package.json); the URL parser accepts the shapes people actually paste;
 * the import registers the project so the surgical editor composes with it;
 * and routing needs BOTH a GitHub URL and an intent verb.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeProject, formatAnalysis } from '../core/project/analyze';
import { githubUrlFrom, ImportProjectTool } from '../modules/tools/definitions/ImportProjectTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

describe('githubUrlFrom — the shapes people paste', () => {
    const cases: Array<[string, string | null]> = [
        ['استورد https://github.com/yasoo2/xelitesolutions وافهمه', 'https://github.com/yasoo2/xelitesolutions.git'],
        ['import https://github.com/octocat/Hello-World.git please', 'https://github.com/octocat/Hello-World.git'],
        ['اعمل على github.com/user/repo-name', 'https://github.com/user/repo-name.git'],
        ['https://github.com/a/b/tree/main/src', 'https://github.com/a/b.git'],
        ['لا يوجد رابط هنا', null],
    ];
    for (const [text, want] of cases) {
        it(`«${text.slice(0, 40)}» → ${want || 'null'}`, () => expect(githubUrlFrom(text)).toBe(want));
    }
});

describe('analyzeProject — facts only', () => {
    let tmp: string;
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-analyze-'));
        fs.mkdirSync(path.join(tmp, 'src', 'components'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'node_modules', 'react'), { recursive: true });   // must be SKIPPED
        fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
            name: 'shop-front', main: 'src/index.js',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.0.0' }, devDependencies: { vite: '^5.0.0', typescript: '^5' },
        }));
        fs.writeFileSync(path.join(tmp, 'src', 'index.js'), 'console.log(1)\n'.repeat(10));
        fs.writeFileSync(path.join(tmp, 'src', 'components', 'App.jsx'), 'export default 1\n'.repeat(5));
        fs.writeFileSync(path.join(tmp, 'node_modules', 'react', 'big.js'), 'x\n'.repeat(1000));
        fs.writeFileSync(path.join(tmp, 'README.md'), '# متجر الواجهة\nمشروع تجريبي\n');
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('detects the stack from package.json, never invents one', () => {
        const a = analyzeProject(tmp);
        expect(a.name).toBe('shop-front');
        expect(a.stack).toEqual(expect.arrayContaining(['React', 'Vite', 'TypeScript']));
        expect(a.stack).not.toContain('Vue');
        expect(a.scripts.dev).toBe('vite');
    });
    it('node_modules never pollutes the counts', () => {
        const a = analyzeProject(tmp);
        expect(a.totalFiles).toBeLessThan(10);
        expect(a.totalLines).toBeLessThan(100);   // the 1000-line node_modules file is excluded
    });
    it('the Arabic report carries stack, structure, scripts and the README head', () => {
        const msg = formatAnalysis(analyzeProject(tmp), true);
        expect(msg).toContain('React');
        expect(msg).toContain('src');
        expect(msg).toContain('dev: vite');
        expect(msg).toContain('متجر الواجهة');
    });
});

describe('the import composes with the surgical editor', () => {
    it('a local-path import registers the ACTIVE project for the session', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-import-'));
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"local-proj"}');
        const res: any = await new ImportProjectTool().execute({ request: 'افهم هذا المشروع', path: tmp }, { sessionId: 'imp-t' });
        expect(res.ok).toBe(true);
        expect(res.output.message).toContain('local-proj');
        expect((global as any).joeProjects['imp-t']?.dir).toBe(tmp);
        expect((global as any).joeProjects['imp-t']?.type).toBe('imported');
        delete (global as any).joeProjects['imp-t'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });
    it('no URL and no path → an honest ask, not a crash', async () => {
        const res: any = await new ImportProjectTool().execute({ request: 'استورد مشروعي' }, { sessionId: 'imp-none' });
        expect(res.ok).toBe(true);
        expect(res.output.message).toContain('github.com');
    });
});

describe('routing: URL + intent verb, and only that', () => {
    const FALLTHROUGH = 'llm-fallthrough';
    const route = async (goal: string): Promise<string> => {
        const p = PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any })
            .then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
        return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
    };
    it('«استورد … github.com/…» → import_project', async () => {
        expect(await route('استورد https://github.com/octocat/Hello-World وافهمه')).toBe('import_project');
    });
    it('"work on github.com/…" → import_project', async () => {
        expect(await route('work on https://github.com/user/repo and improve it')).toBe('import_project');
    });
    it('a github link with NO intent verb is not hijacked', async () => {
        expect(await route('شاهد https://github.com/octocat/Hello-World')).not.toBe('import_project');
    });
});
