import fs from 'fs';
import os from 'os';
import path from 'path';

import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('AutoTesterTool acceptance contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-auto-tester-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('rejects an undefined or unsupported test type before execution', async () => {
        const result: any = await new AutoTesterTool().execute({
            testType: undefined as any,
            projectPath: '.',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ passed: false });
        expect(result.error).toContain('requires testType');
    });

    it('fails unit verification honestly when the selected project declares no test script', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'empty-project', scripts: {} }));

        const result: any = await new AutoTesterTool().execute({
            testType: 'unit',
            projectPath: '.',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ passed: false });
        expect(result.error).toContain('No declared unit-test script');
        expect(result.logs.join('\n')).toContain('No declared script found');
    });
});
