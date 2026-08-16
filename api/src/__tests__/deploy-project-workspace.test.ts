import fs from 'fs';
import path from 'path';
import { DeployProjectTool } from '../modules/tools/definitions/DeployProjectTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ExecutionGateway } from '../kernel/ExecutionGateway';

describe('deploy_project workspace-relative paths', () => {
    const tempRoot = fs.mkdtempSync(path.join('/tmp', 'joe-deploy-workspace-'));
    const projectDir = path.join(tempRoot, 'NEXUS');
    const originalGetActiveRoot = workspaceService.getActiveRoot;

    beforeAll(() => {
        fs.mkdirSync(projectDir, { recursive: true });
        (workspaceService.getActiveRoot as any) = jest.fn(() => tempRoot);
    });

    afterAll(() => {
        (workspaceService.getActiveRoot as any) = originalGetActiveRoot;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('anchors a relative NEXUS path inside the trusted workspace before building', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue({
            success: true,
            data: { output: 'build ok' },
        } as any);
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'build_static', projectPath: 'NEXUS', buildCommand: 'echo build' },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(true);
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({
                payload: expect.objectContaining({
                    command: 'echo build',
                    options: expect.objectContaining({ cwd: projectDir }),
                }),
            }));
        } finally {
            execute.mockRestore();
        }
    });

    it('rejects a path outside the workspace before any execution', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute');
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'build_static', projectPath: '/tmp' },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/outside workspace/i);
            expect(execute).not.toHaveBeenCalled();
        } finally {
            execute.mockRestore();
        }
    });
});
