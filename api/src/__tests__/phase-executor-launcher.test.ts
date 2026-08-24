import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    applyPhaseExecutionEvidence,
    inheritRuntimeProjectArguments,
    mapRuntimeArtifactSourceArguments,
    reactProjectServerFallback,
    recoverMissingNpmLauncher,
    RUNTIME_ARTIFACT_SOURCE_KEYS,
    RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS,
    RUNTIME_LOGICAL_SOURCE_TOOLS,
} from '../modules/tools/definitions/PhaseExecutorTool';
import { LsTool, ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { executionEngine } from '../kernel/ExecutionEngine';
import { workspaceService } from '../modules/services/WorkspaceService';
import { resolveToolPath } from '../modules/tools/utils';
import { tools } from '../modules/tools/registry';

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

    it('late-binds deploy_project to the trusted artifact root and contains conceptual paths', () => {
        const context = {
            projectRoot: '/workspace/react-weathergo-a7c8',
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        };
        const logs: string[] = [];
        const missing: Record<string, any> = { action: 'build_static' };
        inheritRuntimeProjectArguments('deploy_project', missing, context, logs);
        expect(missing.projectPath).toBe('/workspace/react-weathergo-a7c8');
        expect(logs.join('\\n')).toContain('deploy_project: inherited projectPath');

        const conceptual: Record<string, any> = { action: 'build_static', projectPath: 'WeatherGo/dist' };
        inheritRuntimeProjectArguments('deploy_project', conceptual, context, logs);
        expect(conceptual.projectPath).toBe('/workspace/react-weathergo-a7c8/dist');

        const explicit: Record<string, any> = { action: 'build_static', projectPath: '/workspace/other-project' };
        inheritRuntimeProjectArguments('deploy_project', explicit, context, logs);
        expect(explicit.projectPath).toBe('/workspace/other-project');

        const escape: Record<string, any> = { action: 'build_static', projectPath: '../outside' };
        inheritRuntimeProjectArguments('deploy_project', escape, context, logs);
        expect(escape.projectPath).toBe('../outside');
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

    it('maps pre-artifact greenfield discovery paths to the active workspace root', () => {
        const activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
        try {
            const context = {
                createsNewProject: true,
                projectRootRuntimeBound: false,
                projectName: 'WeatherGo',
                workspaceId: 'workspace-weathergo',
            };
            const planned: Record<string, any> = { path: 'WeatherGo' };
            const logs: string[] = [];
            inheritRuntimeProjectArguments('project_detect', planned, context, logs);

            expect(planned.path).toBe(workspaceRoot);
            expect(logs.join('\\n')).toContain('mapped pre-artifact greenfield path');

            const analysis: Record<string, any> = {};
            inheritRuntimeProjectArguments('analyze_project', analysis, context, logs);
            expect(analysis.path).toBe(workspaceRoot);

            const directory: Record<string, any> = { path: 'WeatherGo/src' };
            inheritRuntimeProjectArguments('inspect_directory', directory, context, logs);
            expect(directory.path).toBe(workspaceRoot);

            const files: Record<string, any> = { path: 'WeatherGo' };
            inheritRuntimeProjectArguments('search_files', files, context, logs);
            expect(files.path).toBe(workspaceRoot);
        } finally {
            activeRootSpy.mockRestore();
        }
    });

    it('normalizes present conceptual path fields for any tool without inventing missing fields', () => {
        const context = {
            projectRoot: '/workspace/react-weathergo-a7c8',
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        };
        const logs: string[] = [];

        const inspect: Record<string, any> = { path: 'WeatherGo' };
        inheritRuntimeProjectArguments('inspect_directory', inspect, context, logs);
        expect(inspect.path).toBe('/workspace/react-weathergo-a7c8');

        const shell: Record<string, any> = { command: 'ls', cwd: 'WeatherGo' };
        inheritRuntimeProjectArguments('shell_execute', shell, context, logs);
        expect(shell.cwd).toBe('/workspace/react-weathergo-a7c8');

        const generic: Record<string, any> = { projectPath: 'WeatherGo' };
        inheritRuntimeProjectArguments('generic_tool', generic, context, logs);
        expect(generic.projectPath).toBe('/workspace/react-weathergo-a7c8');

        const absent: Record<string, any> = { command: 'ls' };
        inheritRuntimeProjectArguments('generic_tool', absent, context, logs);
        expect(absent.path).toBeUndefined();
        expect(absent.cwd).toBeUndefined();
        expect(absent.projectPath).toBeUndefined();

        const explicit: Record<string, any> = { path: '/workspace/other' };
        inheritRuntimeProjectArguments('inspect_directory', explicit, context, logs);
        expect(explicit.path).toBe('/workspace/other');
    });

    it('does not consult the active workspace root for runtime-bound fallback without workspaceId', () => {
        const context = {
            projectRoot: '/workspace/react-weathergo-a7c8',
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        };
        const logs: string[] = [];
        const activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot');
        const planned: Record<string, any> = { path: 'WeatherGo' };

        try {
            inheritRuntimeProjectArguments('generic_tool', planned, context, logs);

            expect(planned.path).toBe('/workspace/react-weathergo-a7c8');
            expect(activeRootSpy).not.toHaveBeenCalled();
            expect(logs.join('\\n')).toContain('generic_tool: mapped conceptual path onto runtime-bound artifact');
        } finally {
            activeRootSpy.mockRestore();
        }
    });

    it('replaces a conceptual npm cwd with the runtime-bound artifact root', () => {
        const projectRoot = path.join(workspaceRoot, 'react-weathergo-bad8');
        fs.mkdirSync(projectRoot, { recursive: true });
        const planned: Record<string, any> = {
            command: 'install',
            cwd: 'WeatherGo',
            projectPath: 'WeatherGo',
        };
        const logs: string[] = [];
        inheritRuntimeProjectArguments('npm_manager', planned, {
            projectRoot,
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        }, logs);

        expect(planned).toMatchObject({ command: 'install', cwd: projectRoot });
        expect(planned.projectPath).toBeUndefined();
        expect(logs.join('\\n')).toContain('npm_manager: replaced stale cwd');
    });

    it('maps runtime-bound source file arguments onto the artifact root', () => {
        const context = {
            projectRoot: '/workspace/react-weathergo-a7c8',
            projectName: 'WeatherGo',
            projectRootRuntimeBound: true,
        };
        const logs: string[] = [];
        const testInput: Record<string, any> = {
            filePath: 'WeatherGo/src/App.jsx',
            files: ['WeatherGo/src/App.jsx', 'WeatherGo/src/components/WeatherCard.jsx'],
        };
        inheritRuntimeProjectArguments('test_generator', testInput, context, logs);

        expect(testInput.filePath).toBe('/workspace/react-weathergo-a7c8/src/App.jsx');
        expect(testInput.files).toEqual([
            '/workspace/react-weathergo-a7c8/src/App.jsx',
            '/workspace/react-weathergo-a7c8/src/components/WeatherCard.jsx',
        ]);
        expect(logs.join('\\n')).toContain('mapped conceptual filePath');

        const editInput: Record<string, any> = { filename: 'WeatherGo/src/App.jsx' };
        inheritRuntimeProjectArguments('file_edit', editInput, context);
        expect(editInput.filename).toBe('/workspace/react-weathergo-a7c8/src/App.jsx');

        const absolute = { filePath: '/tmp/not-an-artifact/App.jsx' };
        inheritRuntimeProjectArguments('test_generator', absolute, context);
        expect(absolute.filePath).toBe('/tmp/not-an-artifact/App.jsx');
    });

    it('rebases auto_tester conceptual files into the runtime-bound artifact child', () => {
        const context = {
            projectRoot: '/workspace/react-focusboard-b32d2ab4',
            projectName: 'FocusBoard',
            projectRootRuntimeBound: true,
        };
        const planned: Record<string, any> = {
            files: ['../FocusBoard/src/components/Task.jsx'],
        };
        const logs: string[] = [];

        inheritRuntimeProjectArguments('auto_tester', planned, context, logs);

        expect(planned.files).toEqual([
            path.join(context.projectRoot, 'src', 'components', 'Task.jsx'),
        ]);
        expect(logs.join('\\n')).toContain('auto_tester: mapped conceptual files');
    });

    it('keeps unrelated traversal unresolved and proves the owning resolver refuses it', () => {
        const context = {
            projectRoot: '/workspace/react-focusboard-b32d2ab4',
            projectName: 'FocusBoard',
            projectRootRuntimeBound: true,
        };
        const planned: Record<string, any> = {
            files: ['../other-project/src/Task.jsx'],
        };

        inheritRuntimeProjectArguments('auto_tester', planned, context);

        expect(planned.files[0]).toBe('../other-project/src/Task.jsx');
        const activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
        try {
            expect(() => resolveToolPath(planned.files[0], { workspaceId: 'workspace-traversal' }))
                .toThrow(/path_outside_workspace:/);
        } finally {
            activeRootSpy.mockRestore();
        }
    });

    it('preserves ai_write_file logical workspace-relative paths as an explicit opt-out', () => {
        const context = {
            projectRoot: '/workspace/react-focusboard-b32d2ab4',
            projectName: 'FocusBoard',
            projectRootRuntimeBound: true,
        };
        const planned: Record<string, any> = { path: 'FocusBoard/src/App.jsx' };
        const logs: string[] = [];

        mapRuntimeArtifactSourceArguments('ai_write_file', planned, context, logs);

        expect(RUNTIME_LOGICAL_SOURCE_TOOLS.has('ai_write_file')).toBe(true);
        expect(planned.path).toBe('FocusBoard/src/App.jsx');
        expect(logs).toEqual([]);
    });

    it('uses path-key default binding for real and invented tool names', () => {
        const context = {
            projectRoot: '/workspace/react-focusboard-b32d2ab4',
            projectName: 'FocusBoard',
            projectRootRuntimeBound: true,
        };
        const performanceInput: Record<string, any> = { filePath: '../FocusBoard/src/App.jsx' };
        mapRuntimeArtifactSourceArguments('performance_profile', performanceInput, context);
        expect(performanceInput.filePath).toBe(path.join(context.projectRoot, 'src', 'App.jsx'));

        const qzzworpSchema = { type: 'object', properties: { filePath: { type: 'string' } } };
        const inventedInput: Record<string, any> = { filePath: '../FocusBoard/src/Task.jsx' };
        mapRuntimeArtifactSourceArguments('qzzworp_stub', inventedInput, context);

        expect(Object.keys(qzzworpSchema.properties)).toEqual(['filePath']);
        expect(RUNTIME_LOGICAL_SOURCE_TOOLS.has('qzzworp_stub')).toBe(false);
        expect(inventedInput.filePath).toBe(path.join(context.projectRoot, 'src', 'Task.jsx'));
    });

    it('proves an old name-gated discovery path differs from the key-driven ls result', async () => {
        const runtimeRoot = path.join(workspaceRoot, 'react-focusboard-live');
        fs.mkdirSync(path.join(workspaceRoot, 'FocusBoard'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'FocusBoard', 'workspace-marker.txt'), 'workspace');
        fs.mkdirSync(runtimeRoot, { recursive: true });
        fs.writeFileSync(path.join(runtimeRoot, 'runtime-marker.txt'), 'runtime');
        const activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
        const context = {
            projectRoot: runtimeRoot,
            projectName: 'FocusBoard',
            projectRootRuntimeBound: true,
            workspaceId: 'workspace-ls-proof',
        };
        const ls = new LsTool();

        try {
            const before = { path: 'FocusBoard' };
            const beforeResolved = resolveToolPath(before.path, { workspaceId: context.workspaceId });
            const beforeResult: any = await ls.execute(before, { workspaceId: context.workspaceId });

            const after = { path: 'FocusBoard' };
            inheritRuntimeProjectArguments('ls', after, context);
            const afterResolved = after.path;
            const afterResult: any = await ls.execute(after, { workspaceId: context.workspaceId });

            expect(beforeResolved).toBe(path.join(workspaceRoot, 'FocusBoard'));
            expect(beforeResult.ok).toBe(true);
            expect(beforeResult.output.entries).toContain('workspace-marker.txt');
            expect(afterResolved).toBe(runtimeRoot);
            expect(afterResult.ok).toBe(true);
            expect(afterResult.output.entries).toContain('runtime-marker.txt');
            expect(afterResult.output.entries).not.toContain('workspace-marker.txt');
        } finally {
            activeRootSpy.mockRestore();
        }
    });

    it('keeps every registered eleven-key path declaration classified by default key binding or opt-out', () => {
        const censusKeys = new Set([
            'path', 'filename', 'filePath', 'sourceFile', 'targetPath',
            'schemaPath', 'databasePath', 'files', 'filePaths', 'sourceFiles', 'paths',
        ]);
        const unclassified: string[] = [];

        for (const tool of tools) {
            const properties = (tool as any)?.inputSchema?.properties;
            if (!properties || typeof properties !== 'object') continue;
            for (const key of Object.keys(properties)) {
                if (!censusKeys.has(key)) continue;
                const classified = RUNTIME_LOGICAL_SOURCE_TOOLS.has(tool.name)
                    || RUNTIME_ARTIFACT_SOURCE_KEYS.has(key)
                    || RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS.has(key);
                if (!classified) unclassified.push(`${tool.name}.${key}`);
            }
        }

        expect(unclassified).toEqual([]);
    });

    it('routes an explicitly declared npm dev server through project_run', () => {
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            scripts: { start: 'node dist/index.js', dev: 'vite --host 127.0.0.1', build: 'echo build' },
        }));
        const fallback = reactProjectServerFallback(
            'npm run dev',
            'Start the development server and open the live preview',
            { cwd: workspaceRoot },
            { projectRoot: workspaceRoot, projectRootRuntimeBound: true },
            'workspace-launcher',
        );

        expect(fallback).toEqual({ cwd: workspaceRoot, script: 'dev' });
    });

    it('does not infer a preview server from npm run dev in a finite build task', () => {
        expect(reactProjectServerFallback(
            'npm run dev',
            'Run the build checks and report the exit code',
            { cwd: workspaceRoot },
            { projectRoot: workspaceRoot, projectRootRuntimeBound: true },
            'workspace-launcher',
        )).toBeNull();
    });

    it('refuses a declared preview task when the manifest does not declare the script', () => {
        expect(reactProjectServerFallback(
            'npm run preview',
            'Start the preview server and open it',
            { cwd: workspaceRoot },
            { projectRoot: workspaceRoot, projectRootRuntimeBound: true },
            'workspace-launcher',
        )).toBeNull();
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
