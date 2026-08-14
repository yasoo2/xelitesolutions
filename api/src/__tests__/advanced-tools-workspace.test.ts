import fs from 'fs';
import os from 'os';
import path from 'path';
import { DocumentationGeneratorTool } from '../modules/tools/definitions/AdvancedTools';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('DocumentationGeneratorTool workspace-bound contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-doc-generator-'));
        fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('resolves a relative source path from the active workspace rather than API cwd', async () => {
        fs.writeFileSync(
            path.join(workspaceRoot, 'src', 'service.js'),
            'export function createService() { return true; }\n',
        );

        const result: any = await new DocumentationGeneratorTool().execute({
            filePath: 'src/service.js',
            outputFormat: 'markdown',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.outputPath).toBe(path.join(workspaceRoot, 'src', 'service.md'));
        expect(fs.existsSync(path.join(workspaceRoot, 'src', 'service.md'))).toBe(true);
        expect(fs.readFileSync(path.join(workspaceRoot, 'src', 'service.md'), 'utf8')).toContain('# service.js');
    });

    it('rejects a path outside the active workspace before reading it', async () => {
        const result: any = await new DocumentationGeneratorTool().execute({
            filePath: '../outside.js',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('path_outside_workspace');
    });
});
