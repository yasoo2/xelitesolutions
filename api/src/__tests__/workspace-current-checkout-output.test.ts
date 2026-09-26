import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const fixtureParent = path.join(repoRoot, 'api', 'data', 'tests');
const pathKeys = ['EXTERNAL_PROJECTS_DIR', 'JOE_WORKSPACE_ROOT', 'JOE_DATA_DIR', 'JOE_CHAT_STORE_DIR'] as const;

describe('explicit workspace output follows the current checkout', () => {
    const previous = new Map(pathKeys.map(key => [key, process.env[key]]));
    let fixtureRoot: string;
    let workspaceService: typeof import('../modules/services/WorkspaceService').workspaceService;
    let WorkspaceService: typeof import('../modules/services/WorkspaceService').WorkspaceService;
    let executeTool: typeof import('../modules/services/ToolService').executeTool;
    let executionFirewall: typeof import('../orchestration/AgentExecutionFirewall').executionFirewall;

    beforeAll(() => {
        fs.mkdirSync(fixtureParent, { recursive: true });
        fixtureRoot = fs.mkdtempSync(path.join(fixtureParent, 'workspace-checkout-'));
        process.env.EXTERNAL_PROJECTS_DIR = path.join(fixtureRoot, 'projects');
        process.env.JOE_WORKSPACE_ROOT = path.join(fixtureRoot, 'default');
        process.env.JOE_DATA_DIR = path.join(fixtureRoot, 'data');
        process.env.JOE_CHAT_STORE_DIR = path.join(fixtureRoot, 'store');
        ({ workspaceService, WorkspaceService } = require('../modules/services/WorkspaceService'));
        ({ executeTool } = require('../modules/services/ToolService'));
        ({ executionFirewall } = require('../orchestration/AgentExecutionFirewall'));
    });

    afterAll(() => {
        for (const key of pathKeys) {
            const value = previous.get(key);
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        if (fixtureRoot) {
            // Cleanup is limited to the temporary directory this test created.
            const relative = path.relative(fixtureParent, path.resolve(fixtureRoot));
            if (path.dirname(relative) !== '.' || !path.basename(relative).startsWith('workspace-checkout-')) {
                throw new Error('Refusing cleanup outside the checkout test fixture');
            }
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('writes and reads through ToolService in the selected workspace, preserving the default and another workspace', async () => {
        const selectedId = 'checkout-output-selected';
        const otherId = 'checkout-output-other';
        const selectedRoot = path.join(fixtureRoot, 'selected');
        const otherRoot = path.join(fixtureRoot, 'other');
        const defaultRoot = path.join(fixtureRoot, 'default');
        const relativeFile = path.join('output', 'workspace-proof.txt');
        const selectedFile = path.join(selectedRoot, relativeFile);
        const defaultFile = path.join(defaultRoot, relativeFile);
        const otherFile = path.join(otherRoot, relativeFile);
        const content = 'Created through the explicit current-checkout workspace.';

        expect(await workspaceService.setActiveRoot(defaultRoot)).toBe(true);
        expect(await workspaceService.setActiveRoot(selectedRoot, selectedId)).toBe(true);
        expect(await workspaceService.setActiveRoot(otherRoot, otherId)).toBe(true);
        for (const file of [defaultFile, otherFile]) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, 'Keep this workspace unchanged.');
        }
        expect(workspaceService.getActiveRoot(selectedId)).toBe(selectedRoot);
        expect(new WorkspaceService().getActiveRoot(selectedId)).toBe(selectedRoot);
        expect(path.parse(selectedRoot).root).toBe(path.parse(repoRoot).root);
        expect(path.relative(repoRoot, selectedRoot)).not.toMatch(/^\.\.(?:[\\/]|$)/);

        const run = (name: string, input: any, workspaceId: string) => executionFirewall.runInContext(
            undefined,
            () => executeTool(name, input, { workspaceId, userId: 'checkout-test-user' }),
        );
        const written: any = await run('file_write', { path: relativeFile, content }, selectedId);
        expect(written.ok).toBe(true);
        expect(fs.readFileSync(selectedFile, 'utf8')).toBe(content);
        expect(fs.readFileSync(defaultFile, 'utf8')).toBe('Keep this workspace unchanged.');
        expect(fs.readFileSync(otherFile, 'utf8')).toBe('Keep this workspace unchanged.');

        const selected: any = await run('file_read', { filePath: relativeFile }, selectedId);
        const other: any = await run('file_read', { filePath: relativeFile }, otherId);
        expect(selected.ok).toBe(true);
        expect(selected.output.content).toContain(content);
        expect(other.ok).toBe(true);
        expect(other.output.content).toContain('Keep this workspace unchanged.');
    });
});
