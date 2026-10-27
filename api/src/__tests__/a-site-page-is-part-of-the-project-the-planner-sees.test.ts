const mockExecuteTool = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecuteTool(...args) }));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DISCOVERY_SOURCE_EXTENSION, EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';

/**
 * Eval 2026-10-27, P001-landing-ar (run-1793086226335): the scope repair of a
 * build-free site (`start: npx serve src`, page src/index.html) asked
 * engineering_discovery for the project and got sourceFiles [src/app.js,
 * src/styles.css] and no entrypoint — the page itself was never listed. The
 * repair planner then treated app.js as the server: it planned an Express
 * handler («imports undeclared package(s): express») and a file_edit on app.js
 * for `console.log('Hello World')`, text that was never in the file.
 * A site's HTML page is source, and the page is the site's entrypoint.
 */
jest.setTimeout(120_000);

describe('a site page is part of the project the planner sees', () => {
    const roots: string[] = [];
    afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

    it('lists a build-free site\'s page as source and as its entrypoint (the P001 shape)', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-site-page-'));
        roots.push(root);
        const project = path.join(root, 'clinic-landing-ar');
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'clinic-landing-ar', scripts: { start: 'npx serve src' } }));
        fs.writeFileSync(path.join(project, 'src', 'index.html'), '<!doctype html><html dir="rtl"><body><form id="contact"></form></body></html>\n');
        fs.writeFileSync(path.join(project, 'src', 'app.js'), 'document.querySelector("#contact");\n');
        fs.writeFileSync(path.join(project, 'src', 'styles.css'), 'body { margin: 0; }\n');

        const result: any = await new EngineeringDiscoveryTool().execute({
            request: 'Inspect the existing project in place for a bounded scope-repair pass after a successful live run.',
            path: project,
        }, { workspaceRoot: root });

        const selected = result.output.evidence.selectedProject;
        expect(result.ok).toBe(true);
        expect(selected.root).toBe(project);
        expect(selected.sourceFiles).toEqual(expect.arrayContaining([
            path.join(project, 'src', 'index.html'), path.join(project, 'src', 'app.js'), path.join(project, 'src', 'styles.css'),
        ]));
        expect(selected.likelyEntrypoints).toContain(path.join(project, 'src', 'index.html'));
        expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    it('lists the page in the scoped (sealed) inventory too, and a root index.html as the entrypoint', async () => {
        const root = path.resolve('D:/owned-static-site');
        const request = 'Add the missing contact form to the existing site in place.';
        const file = (name: string) => ({ name, type: 'file', size: 128 });
        const tree: Record<string, any[]> = {
            '': [file('package.json'), file('index.html'), { name: 'pages', type: 'directory', size: 0 }],
            pages: [file('about.htm'), file('site.js')],
        };
        mockExecuteTool.mockReset().mockImplementation(async (name, args) => {
            if (name === 'inspect_directory') return { ok: true, output: { tree: tree[path.relative(root, args.path).replace(/\\/g, '/')] || [], truncated: false }, logs: [] };
            return { ok: true, output: JSON.stringify({ name: 'site', scripts: { start: 'npx serve .' } }), logs: [] };
        });
        const ctx = issueEngineeringContext({ modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } },
            { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => false);

        const selected = ((await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx)) as any).output.evidence.selectedProject;

        expect(selected.sourceFiles).toEqual(['index.html', 'pages/about.htm', 'pages/site.js']);
        expect(selected.likelyEntrypoints).toEqual(['index.html']);
    });

    it('still leaves manifests, documents and data out of source', () => {
        for (const name of ['index.html', 'about.HTM', 'app.mjs', 'App.tsx', 'main.py', 'styles.scss']) expect(DISCOVERY_SOURCE_EXTENSION.test(name)).toBe(true);
        for (const name of ['package.json', 'README.md', 'notes.txt', 'logo.png', 'page.html.bak', 'template.xhtml']) expect(DISCOVERY_SOURCE_EXTENSION.test(name)).toBe(false);
    });
});
