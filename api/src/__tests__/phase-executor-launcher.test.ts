import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyPhaseExecutionEvidence, inheritRuntimeProjectArguments, recoverMissingNpmLauncher } from '../modules/tools/definitions/PhaseExecutorTool';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { executionEngine } from '../kernel/ExecutionEngine';

describe('PhaseExecutor manifest-aware npm launcher recovery', () => {
    it('uses the discovery-selected root for project_run only when the plan has no explicit location', () => {
        const planned: Record<string, any> = {};
        const logs: string[] = [];
        expect(applyPhaseExecutionEvidence('project_run', planned, { projectRoot: '/workspace/repo', projectName: 'repo' }, logs)).toMatchObject({
            cwd: '/workspace/repo',
        });
        expect(planned.projectQuery).toBeUndefined();
        expect(logs.join('\\n')).toContain('discovery-selected project root');

        const greenfield: Record<string, any> = {};
        const greenfieldLogs: string[] = [];
        applyPhaseExecutionEvidence('project_run', greenfield, {
            projectRoot: '/home/ubuntu/xelitesolutions-review',
            projectName: 'nexus-platform',
        }, greenfieldLogs);
        expect(greenfield.cwd).toBeUndefined();
        expect(greenfield.projectQuery).toBe('run the project named "nexus-platform"');
        expect(greenfieldLogs.join('\\n')).toContain('ignored pre-creation root');

        expect(applyPhaseExecutionEvidence('project_run', { cwd: '/explicit/root' }, { projectRoot: '/workspace/repo' })).toMatchObject({
            cwd: '/explicit/root',
        });
        expect(applyPhaseExecutionEvidence('project_run', { projectQuery: 'run nexus' }, { projectRoot: '/workspace/repo' })).toMatchObject({
            projectQuery: 'run nexus',
        });
    });

    let workspaceRoot: string;
    const previousRoot = process.env.JOE_WORKSPACE_ROOT;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-launcher-'));
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            scripts: {
                start: 'node dist/index.js',
                build: 'echo build',
            },
        }));
        process.env.JOE_WORKSPACE_ROOT = workspaceRoot;
    });

    afterEach(() => {
        if (previousRoot === undefined) delete process.env.JOE_WORKSPACE_ROOT;
        else process.env.JOE_WORKSPACE_ROOT = previousRoot;
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('passes the runtime-bound artifact root to quality_run as path', () => {
        const planned: Record<string, any> = {};
        const logs: string[] = [];
        inheritRuntimeProjectArguments('quality_run', planned, {
            projectRoot: '/workspace/weathergo',
            projectRootRuntimeBound: true,
        }, logs);

        expect(planned).toMatchObject({ path: '/workspace/weathergo' });
        expect(logs.join('\\n')).toContain('quality_run: inherited path');

        const explicit: Record<string, any> = { path: '/workspace/other-project' };
        inheritRuntimeProjectArguments('quality_run', explicit, {
            projectRoot: '/workspace/weathergo',
            projectRootRuntimeBound: true,
        });
        expect(explicit.path).toBe('/workspace/other-project');
    });

    it('maps conceptual project paths to the runtime-bound artifact for discovery and analysis', () => {
        const context = {
            projectRoot: '/workspace/react-weathergo-a7c8',
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        };
        const planned: Record<string, any> = { path: 'WeatherGo' };
        const logs: string[] = [];
        inheritRuntimeProjectArguments('project_detect', planned, context, logs);

        expect(planned.path).toBe('/workspace/react-weathergo-a7c8');
        expect(logs.join('\\n')).toContain('mapped conceptual project path');

        const nested: Record<string, any> = { path: 'WeatherGo/src' };
        inheritRuntimeProjectArguments('analyze_project', nested, context);
        expect(nested.path).toBe('/workspace/react-weathergo-a7c8/src');

        const escape: Record<string, any> = { path: '../outside' };
        inheritRuntimeProjectArguments('project_detect', escape, context);
        expect(escape.path).toBe('../outside');
    });

    it('selects the repository start script when a server alias is missing', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run server',
            'Start Joe System',
            '.',
        );

        expect(recovery).not.toBeNull();
        expect(recovery).toMatchObject({
            command: 'npm run start',
            script: 'start',
            background: true,
        });
        expect(recovery?.manifest).toBe(path.join(workspaceRoot, 'package.json'));
    });

    it('does not rewrite an npm script that the manifest already defines', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run build',
            'Build the API',
            '.',
        );

        expect(recovery).toBeNull();
    });

    it('does not invent a launcher for a non-launch task', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run missing-test',
            'Execute the required test suite',
            '.',
        );

        expect(recovery).toBeNull();
    });

    it('reuses an already-live identical background command after bounded recovery', async () => {
        const command = `node -e "console.log('joe-background-dedupe-${Date.now()}')"`;
        const execute = jest.spyOn(executionEngine, 'execute').mockResolvedValue({
            success: true,
            data: { pid: process.pid },
            duration: 0,
        });

        try {
            const tool = new ShellExecuteTool();
            const first = await tool.execute({ command, cwd: '.', background: true });
            const second = await tool.execute({ command, cwd: '.', background: true });

            expect(first.ok).toBe(true);
            expect(first.output?.status).toBe('background');
            expect(second).toMatchObject({
                ok: true,
                output: { status: 'already_running', pid: process.pid },
            });
            expect(execute).toHaveBeenCalledTimes(1);
        } finally {
            execute.mockRestore();
        }
    });
});
