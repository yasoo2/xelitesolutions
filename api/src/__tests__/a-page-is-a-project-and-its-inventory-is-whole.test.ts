const mockExecuteTool = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecuteTool(...args) }));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';

/**
 * A page makes a folder a project, and the project's inventory is the whole
 * project.
 *
 * Round 21 review (ceeaa645): discovery selected a project only by a manifest,
 * so a build-free site — index.html and styles.css, no package.json — was
 * invisible to the scope-repair planner, which then planned from nothing; and
 * the source inventory stopped silently at 120 files, a bound the generated
 * HTML of out/, _site/ and storybook-static/ filled before the site's own files
 * were reached. Discovery, the filesystem and the sealed inventory are real.
 */
jest.setTimeout(120_000);

const REPAIR = 'Inspect the existing project in place for a bounded scope-repair pass after a successful live run.';

describe('a page is a project', () => {
    const roots: string[] = [];
    afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
    const site = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-page-project-'));
        roots.push(root);
        const project = path.join(root, 'clinic-landing-ar');
        fs.mkdirSync(project, { recursive: true });
        return { root, project };
    };

    it('a manifest-less site is the selected project, its page the entrypoint', async () => {
        const { root, project } = site();
        fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><html dir="rtl"><body><h1>عيادة</h1></body></html>\n');
        fs.writeFileSync(path.join(project, 'styles.css'), 'body { margin: 0; }\n');
        const result: any = await new EngineeringDiscoveryTool().execute({ request: REPAIR, path: project }, { workspaceRoot: root });
        const evidence = result.output.evidence;
        expect(evidence.mode).toBe('existing_workspace');
        expect(evidence.selectedProject.root).toBe(project);
        expect(evidence.selectedProject.sourceFiles).toEqual([path.join(project, 'index.html'), path.join(project, 'styles.css')]);
        expect(evidence.selectedProject.likelyEntrypoints).toEqual([path.join(project, 'index.html')]);
    });

    it('the inventory holds every source and test file, and no tool output', async () => {
        const { root, project } = site();
        const write = (rel: string, body: string) => {
            fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
            fs.writeFileSync(path.join(project, rel), body);
        };
        write('package.json', JSON.stringify({ name: 'clinic', scripts: { build: 'next build && next export' } }));
        for (let i = 0; i < 150; i++) write(`out/page-${i}.html`, '<html></html>');
        for (let i = 0; i < 40; i++) write(`_site/p${i}.html`, '<html></html>');
        for (let i = 0; i < 40; i++) write(`storybook-static/s${i}.html`, '<html></html>');
        for (let i = 0; i < 130; i++) write(`src/components/C${String(i).padStart(3, '0')}.tsx`, 'export default () => null;\n');
        for (let i = 0; i < 50; i++) write(`tests/t${String(i).padStart(2, '0')}.test.ts`, 'test("x", () => {});\n');
        const result: any = await new EngineeringDiscoveryTool().execute({ request: REPAIR, path: project }, { workspaceRoot: root });
        const selected = result.output.evidence.selectedProject;
        const sources = selected.sourceFiles.map((file: string) => path.relative(project, file).replace(/\\/g, '/'));
        expect(sources.filter((file: string) => file.startsWith('src/'))).toHaveLength(130);
        expect(sources.filter((file: string) => /^(?:out|_site|storybook-static)\//u.test(file))).toEqual([]);
        expect(selected.testFiles).toHaveLength(50);
        expect(result.output.evidence.blockers).toEqual([]);
    });
});

describe('the sealed (scoped) inventory', () => {
    const file = (name: string) => ({ name, type: 'file', size: 128 });
    const dir = (name: string) => ({ name, type: 'directory', size: 0 });
    const discover = async (root: string, tree: Record<string, any[]>, manifest?: string) => {
        const request = 'Add the missing contact form to the existing site in place.';
        mockExecuteTool.mockReset().mockImplementation(async (name, args) => {
            if (name === 'inspect_directory') return { ok: true, output: { tree: tree[path.relative(root, args.path).replace(/\\/g, '/')] || [], truncated: false }, logs: [] };
            return { ok: true, output: manifest ?? '', logs: [] };
        });
        const ctx = issueEngineeringContext({ modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } },
            { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => false);
        return ((await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx)) as any).output.evidence;
    };

    it('a page selects a manifest-less site, and tool output is never walked', async () => {
        const root = path.resolve('D:/owned-static-site');
        const evidence = await discover(root, { '': [file('index.html'), file('styles.css'), dir('out')], out: [file('index.html')] });
        expect(evidence.mode).toBe('existing_workspace');
        expect(evidence.selectedProject.projectKinds).toEqual(['other']);
        expect(evidence.selectedProject.manifests).toEqual([]);
        expect(evidence.selectedProject.sourceFiles).toEqual(['index.html', 'styles.css']);
        expect(evidence.selectedProject.likelyEntrypoints).toEqual(['index.html']);
        expect(mockExecuteTool.mock.calls.some(([name, args]) => name === 'inspect_directory' && /[\\/]out$/u.test(String(args.path)))).toBe(false);
    });

    it('a list exactly at its bound is not reported as cut; one past it is, with the counts', async () => {
        const root = path.resolve('D:/owned-node-site');
        const sources = (n: number) => Array.from({ length: n }, (_, i) => file(`m${String(i).padStart(3, '0')}.js`));
        const manifest = JSON.stringify({ name: 'site', scripts: { start: 'node m000.js' } });
        const atBound = await discover(root, { '': [file('package.json'), ...sources(120)] }, manifest);
        expect(atBound.blockers.map((b: any) => b.code)).not.toContain('discovery_file_inventory_limited');
        const pastBound = await discover(root, { '': [file('package.json'), ...sources(121)] }, manifest);
        expect(pastBound.blockers).toContainEqual(expect.objectContaining({ code: 'discovery_file_inventory_limited', message: expect.stringContaining('120 of 121 source files') }));
    });
});
