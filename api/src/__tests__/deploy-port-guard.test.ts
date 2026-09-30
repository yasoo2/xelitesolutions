import fs from 'fs';
import os from 'os';
import path from 'path';
import { DeployProjectTool } from '../modules/tools/definitions/DeployProjectTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ExecutionGateway } from '../kernel/ExecutionGateway';

/**
 * WIRING-P1-009: ToolService performs no inputSchema enforcement, so the
 * declared `type:number` port can arrive as an arbitrary string. Before the
 * guard, `expose_port` interpolated it straight into `lt --port ${port}`
 * under shell:true. The tool must fail closed at its own boundary before
 * any execution — including the `which lt` probe and global install.
 */
describe('deploy_project port guard (WIRING-P1-009)', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-deploy-port-'));
    const projectDir = path.resolve(tempRoot, 'NEXUS');
    const originalGetActiveRoot = workspaceService.getActiveRoot;

    beforeAll(() => {
        fs.mkdirSync(projectDir, { recursive: true });
        (workspaceService.getActiveRoot as any) = jest.fn(() => tempRoot);
    });

    afterAll(() => {
        (workspaceService.getActiveRoot as any) = originalGetActiveRoot;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it.each([
        '3000; touch pwned',
        '3000 && calc.exe',
        '$(whoami)',
        'abc',
        '3.5',
        '0',
        '-1',
        '70000',
    ])('rejects expose_port with port %p before any execution', async (port) => {
        const execute = jest.spyOn(ExecutionGateway, 'execute');
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'expose_port', projectPath: 'NEXUS', port },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/invalid port/i);
            expect(execute).not.toHaveBeenCalled();
        } finally {
            execute.mockRestore();
        }
    });

    it('rejects start_server with a non-numeric port before any execution', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute');
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'start_server', projectPath: 'NEXUS', port: '8080; evil' },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/invalid port/i);
            expect(execute).not.toHaveBeenCalled();
        } finally {
            execute.mockRestore();
        }
    });

    it('accepts a numeric-string port for start_server and reports it in the URL', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue({
            success: true,
            data: { pid: 4242 },
        } as any);
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'start_server', projectPath: 'NEXUS', port: '8080' },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(true);
            expect(result.output.url).toBe('http://localhost:8080');
            expect(execute).toHaveBeenCalledTimes(1);
            expect(fs.readFileSync(path.join(projectDir, '.joe_server.pid'), 'utf8')).toBe('4242');
        } finally {
            execute.mockRestore();
            fs.rmSync(path.join(projectDir, '.joe_server.pid'), { force: true });
        }
    });

    it('keeps the historical 3000 default when no port is supplied', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue({
            success: true,
            data: { pid: 4243 },
        } as any);
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'start_server', projectPath: 'NEXUS' },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(true);
            expect(result.output.url).toBe('http://localhost:3000');
        } finally {
            execute.mockRestore();
            fs.rmSync(path.join(projectDir, '.joe_server.pid'), { force: true });
        }
    });

    it('interpolates only digits into the tunnel command', async () => {
        const execute = jest.spyOn(ExecutionGateway, 'execute')
            .mockResolvedValueOnce({ success: true, data: {} } as any)
            .mockResolvedValueOnce({ success: true, data: { pid: 7 } } as any);
        try {
            const result: any = await new DeployProjectTool().execute(
                { action: 'expose_port', projectPath: 'NEXUS', port: 4567 },
                { workspaceId: 'workspace-under-test' },
            );

            expect(result.ok).toBe(true);
            expect(result.output.port).toBe(4567);
            expect(execute).toHaveBeenCalledTimes(2);
            expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
                payload: expect.objectContaining({ command: 'lt --port 4567' }),
            }));
        } finally {
            execute.mockRestore();
        }
    });
});
