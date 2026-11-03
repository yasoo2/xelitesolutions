/**
 * Discovery reads the selected project, a bounded number of folders at a time,
 * and seals its listing whole.
 *
 * Round 21 second review:
 *  W6  — inspectInventory read sibling folders with one Promise.all per level,
 *        recursively (4000 folders: a readFile issued 30 ms in waited 495.5 ms,
 *        14.9 alone), and inventoried every candidate project of an existing-
 *        workspace request, though only the selected one is planning input;
 *  W10 — the scoped (sealed) listing was cut at 120 sources / 40 tests with a
 *        blocker the pipeline stops on, halting the scope repair of a project
 *        with 121 sources.
 * Discovery and the filesystem are real; only the scoped path's tool gateway is
 * substituted, as in its own suite.
 */
const mockExecuteTool = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecuteTool(...args) }));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';
import { PROJECT_FS_CONCURRENCY } from '../shared/utils/project-tree';

jest.setTimeout(120_000);

const roots: string[] = [];
afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
const write = (root: string, rel: string, body = '') => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
};

describe('the inventory is the selected project\'s, read a bounded number of folders at a time', () => {
    it('POSITIVE — a wide project is read with at most the shared bound in flight, and listed whole', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-discovery-'));
        roots.push(workspace);
        const project = path.join(workspace, 'clinic');
        write(project, 'package.json', JSON.stringify({ name: 'clinic', scripts: { test: 'node --test' } }));
        for (let i = 0; i < 180; i++) write(project, `src/pages/p${String(i).padStart(3, '0')}/index.js`, 'export default 1;\n');
        const readdir = fs.promises.readdir;
        let inFlight = 0, most = 0;
        const spy = jest.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: any[]) => {
            inFlight++; most = Math.max(most, inFlight);
            try { return await (readdir as any).apply(fs.promises, args); } finally { inFlight--; }
        });
        try {
            const result: any = await new EngineeringDiscoveryTool().execute({ request: 'Fix the existing clinic project in place.', path: project }, { workspaceRoot: workspace });
            expect(result.output.evidence.selectedProject.sourceFiles).toHaveLength(180);
            expect(most).toBeLessThanOrEqual(PROJECT_FS_CONCURRENCY);
        } finally { spy.mockRestore(); }
    });

    it('NEGATIVE — the candidates not selected are never walked', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-discovery-'));
        roots.push(workspace);
        for (const name of ['react-weathergo', 'api-ledger', 'react-notes']) {
            write(workspace, `${name}/package.json`, JSON.stringify({ name, scripts: { build: 'vite build' } }));
            write(workspace, `${name}/src/deep/a/b/c/App.jsx`, 'export default () => null;\n');
        }
        const readdir = fs.promises.readdir;
        const walked: string[] = [];
        const spy = jest.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: any[]) => {
            walked.push(path.resolve(String(args[0])));
            return (readdir as any).apply(fs.promises, args);
        });
        try {
            const result: any = await new EngineeringDiscoveryTool().execute({ request: 'Fix the existing project named react-weathergo in place.' }, { workspaceRoot: workspace });
            const evidence = result.output.evidence;
            expect(path.basename(evidence.selectedProject.root)).toBe('react-weathergo');
            expect(evidence.selectedProject.sourceFiles.map((file: string) => path.basename(file))).toEqual(['App.jsx']);
            // The project search itself stops at depth 3 (…/src/deep); only an
            // inventory reads the folders below it.
            expect(walked.some(dir => dir.startsWith(path.join(workspace, 'react-weathergo', 'src', 'deep', 'a')))).toBe(true);
            for (const other of ['api-ledger', 'react-notes']) {
                expect(walked.some(dir => dir.startsWith(path.join(workspace, other, 'src', 'deep', 'a')))).toBe(false);
            }
        } finally { spy.mockRestore(); }
    });
});

describe('the sealed listing is whole', () => {
    const file = (name: string) => ({ name, type: 'file', size: 128 });
    it('POSITIVE — 121 sources and 41 tests are sealed, with no blocker for their count', async () => {
        const root = path.resolve('D:/owned-wide-site');
        const request = 'Add the missing contact form to the existing site in place.';
        const entries = [file('package.json'), ...Array.from({ length: 121 }, (_, i) => file(`m${String(i).padStart(3, '0')}.js`)),
            ...Array.from({ length: 41 }, (_, i) => file(`t${String(i).padStart(2, '0')}.test.js`))];
        mockExecuteTool.mockReset().mockImplementation(async (name: string) => (name === 'inspect_directory'
            ? { ok: true, output: { tree: entries, truncated: false }, logs: [] }
            : { ok: true, output: JSON.stringify({ name: 'site', scripts: { test: 'node --test' } }), logs: [] }));
        const ctx = issueEngineeringContext({ modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } },
            { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => false);
        const evidence = ((await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx)) as any).output.evidence;
        expect(evidence.selectedProject.sourceFiles).toHaveLength(162);
        expect(evidence.selectedProject.testFiles).toHaveLength(41);
        expect(evidence.blockers.map((b: any) => b.code)).not.toContain('discovery_file_inventory_limited');
    });
});
