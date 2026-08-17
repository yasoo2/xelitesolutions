jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executeTool } from '../modules/services/ToolService';
import { applyPhaseExecutionEvidence, PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('PhaseExecutorTool observable trusted context', () => {
    beforeEach(() => mockedExecuteTool.mockReset());

    it('retains the visible browser session and reports structured shell output', async () => {
        let observedContext: any;
        mockedExecuteTool.mockImplementation(async (_tool: any, _input: any, context: any) => {
            observedContext = context;
            return {
                ok: true,
                output: {
                    stdout: '/workspace/project',
                    stderr: 'minor diagnostic',
                    exitCode: 0,
                },
            } as any;
        });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 1,
                name: 'Read-only inspection',
                tasks: [{ task: 'Print the current folder', tool: 'shell_execute', args: { command: 'pwd' } }],
            },
        }, {
            sessionId: 'chat-42',
            browserSessionId: 'browser:chat-42',
            workspaceId: 'workspace-42',
            userId: 'user-42',
        });

        expect(result.ok).toBe(true);
        expect(observedContext).toMatchObject({
            sessionId: 'chat-42',
            browserSessionId: 'browser:chat-42',
            workspaceId: 'workspace-42',
            userId: 'user-42',
        });
        expect(result.output.results[0]).toMatchObject({
            tool: 'shell_execute',
            ok: true,
            message: '/workspace/project\nstderr: minor diagnostic',
        });
    });

    it('binds a react_project artifact and inherits its cwd for downstream npm_manager', async () => {
        const workspaceId = `workspace-react-bind-${process.pid}`;
        const sessionId = `chat-react-bind-${process.pid}`;
        const workspaceRoot = workspaceService.getActiveRoot(workspaceId);
        const projectRoot = path.join(workspaceRoot, `react-weathergo-${process.pid}`);
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
            name: 'react-weathergo',
            scripts: { build: 'vite build' },
        }));

        try {
            mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
                if (toolName === 'react_project') {
                    return { ok: true, output: { path: projectRoot, message: 'React artifact created.' } } as any;
                }
                if (toolName === 'npm_manager') {
                    return { ok: true, output: { message: 'npm mocked; no install executed.' } } as any;
                }
                return { ok: true, output: {} } as any;
            });

            const projectContext: any = {
                projectName: `react-weathergo-${process.pid}`,
                createsNewProject: true,
                sessionId,
                workspaceId,
                userId: 'user-react-bind',
            };
            const result: any = await new PhaseExecutorTool().execute({
                phase: {
                    phaseNumber: 1,
                    name: 'Build and install WeatherGo',
                    tasks: [
                        { task: 'Create the React artifact', tool: 'react_project', args: { request: 'Build WeatherGo.' } },
                        { task: 'Install the artifact dependencies', tool: 'npm_manager', args: { command: 'install' } },
                    ],
                },
                projectContext,
            }, { sessionId, workspaceId, userId: 'user-react-bind' });

            expect(result.ok).toBe(true);
            expect(projectContext.projectRoot).toBe(projectRoot);
            expect(projectContext.projectRootRuntimeBound).toBe(true);
            expect(mockedExecuteTool).toHaveBeenCalledTimes(2);
            expect(mockedExecuteTool.mock.calls[0][0]).toBe('react_project');
            expect(mockedExecuteTool.mock.calls[1][0]).toBe('npm_manager');
            expect(mockedExecuteTool.mock.calls[1][1]).toMatchObject({
                command: 'install',
                cwd: projectRoot,
            });
            expect(result.logs.join('\\n')).toContain('npm_manager: inherited cwd from runtime-bound project root');
        } finally {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    it('installs missing local npm script binaries before executing a shell build', async () => {
        const workspaceId = `workspace-npm-preflight-${process.pid}`;
        const sessionId = `chat-npm-preflight-${process.pid}`;
        const workspaceRoot = workspaceService.getActiveRoot(workspaceId);
        const projectRoot = path.join(workspaceRoot, `vite-preflight-${process.pid}`);
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
            name: 'vite-preflight',
            scripts: { build: 'vite build' },
            devDependencies: { vite: '^5.0.0' },
        }));

        try {
            const calls: string[] = [];
            mockedExecuteTool.mockImplementation(async (toolName: string) => {
                calls.push(toolName);
                if (toolName === 'npm_manager') {
                    const binDir = path.join(projectRoot, 'node_modules', '.bin');
                    fs.mkdirSync(binDir, { recursive: true });
                    fs.writeFileSync(path.join(binDir, 'vite'), '#!/usr/bin/env node\\n');
                    return { ok: true, output: { output: 'installed' } } as any;
                }
                return { ok: true, output: { stdout: 'build complete' } } as any;
            });

            const projectContext: any = {
                projectName: `vite-preflight-${process.pid}`,
                createsNewProject: true,
                projectRoot,
                projectRootRuntimeBound: true,
                sessionId,
                workspaceId,
                userId: 'user-npm-preflight',
            };
            const result: any = await new PhaseExecutorTool().execute({
                phase: {
                    phaseNumber: 4,
                    name: 'Build generated project',
                    tasks: [{ task: 'Build with the declared npm script', tool: 'shell_execute', args: { command: 'npm run build' } }],
                },
                projectContext,
            }, { sessionId, workspaceId, userId: 'user-npm-preflight' });

            expect(result.ok).toBe(true);
            expect(calls).toEqual(['npm_manager', 'shell_execute']);
            expect(result.logs.join('\\n')).toContain('npm preflight installed dependencies for npm run build');
        } finally {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    it('installs missing npm script binaries before an auto_tester build', async () => {
        const workspaceId = `workspace-auto-tester-preflight-${process.pid}`;
        const sessionId = `chat-auto-tester-preflight-${process.pid}`;
        const workspaceRoot = workspaceService.getActiveRoot(workspaceId);
        const projectRoot = path.join(workspaceRoot, `auto-tester-vite-${process.pid}`);
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
            name: 'auto-tester-vite',
            scripts: { build: 'vite build' },
            devDependencies: { vite: '^5.0.0' },
        }));

        try {
            const calls: string[] = [];
            mockedExecuteTool.mockImplementation(async (toolName: string) => {
                calls.push(toolName);
                if (toolName === 'npm_manager') {
                    const binDir = path.join(projectRoot, 'node_modules', '.bin');
                    fs.mkdirSync(binDir, { recursive: true });
                    fs.writeFileSync(path.join(binDir, 'vite'), '#!/usr/bin/env node\\n');
                    return { ok: true, output: { message: 'dependencies installed' } } as any;
                }
                return { ok: true, output: { passed: true, summary: 'build passed' } } as any;
            });

            const result: any = await new PhaseExecutorTool().execute({
                phase: {
                    phaseNumber: 5,
                    name: 'Build readiness',
                    tasks: [{
                        task: 'Run the declared build readiness check',
                        tool: 'auto_tester',
                        args: { testType: 'build', projectPath: projectRoot },
                    }],
                },
                projectContext: {
                    projectName: `auto-tester-vite-${process.pid}`,
                    createsNewProject: true,
                    projectRoot,
                    projectRootRuntimeBound: true,
                    sessionId,
                    workspaceId,
                    userId: 'user-auto-tester-preflight',
                },
            }, { sessionId, workspaceId, userId: 'user-auto-tester-preflight' });

            expect(result.ok).toBe(true);
            expect(calls).toEqual(['npm_manager', 'auto_tester']);
            expect(result.logs.join('\\n')).toContain('npm preflight installed dependencies for npm run build');
        } finally {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    it('preserves engineering LLM routing context across delegated tool execution', async () => {
        let observedContext: any;
        mockedExecuteTool.mockImplementation(async (_tool: any, _input: any, context: any) => {
            observedContext = context;
            return { ok: true, output: {} } as any;
        });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Engineering implementation',
                tasks: [{ task: 'Generate an implementation file', tool: 'ai_write_file', args: { path: 'src/index.ts', description: 'Create the entry point.' } }],
            },
        }, {
            sessionId: 'chat-engineering',
            workspaceId: 'workspace-engineering',
            userId: 'user-engineering',
            modelConfig: { provider: 'llm7', model: 'engineering-model' },
            purpose: 'internal',
            engineeringPipeline: true,
            providerTimeoutMs: 120000,
            plannerMaxCompletionTokens: 12000,
        });

        expect(result.ok).toBe(true);
        expect(observedContext).toMatchObject({
            sessionId: 'chat-engineering',
            workspaceId: 'workspace-engineering',
            userId: 'user-engineering',
            modelConfig: { provider: 'llm7', model: 'engineering-model' },
            purpose: 'internal',
            engineeringPipeline: true,
            providerTimeoutMs: 120000,
            plannerMaxCompletionTokens: 12000,
        });
    });

    it('preserves the failed ai_write_file path for artifact-specific self-fix', async () => {
        mockedExecuteTool.mockResolvedValue({
            ok: false,
            error: 'artifact_type_mismatch: TaskFlow AI/docs/documentation.md still contains an incomplete Markdown fence',
        } as any);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 7,
                name: 'Documentation',
                tasks: [{
                    task: 'Generate the final documentation artifact',
                    tool: 'ai_write_file',
                    args: {
                        path: 'TaskFlow AI/docs/documentation.md',
                        description: 'Write the final documentation for the generated project.',
                    },
                }],
            },
        }, { sessionId: 'chat-docs', workspaceId: 'workspace-docs', userId: 'user-docs' });

        expect(result.ok).toBe(false);
        expect(result.output.results[0]).toMatchObject({
            tool: 'ai_write_file',
            ok: false,
            file: 'TaskFlow AI/docs/documentation.md',
        });
    });

    it('does not fabricate a terminal report when a non-terminal tool has no message', async () => {
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { stdout: 'internal value' } } as any);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Non-terminal task',
                tasks: [{ task: 'Use a project tool', tool: 'project_detect', args: {} }],
            },
        }, { sessionId: 'chat-1', userId: 'user-1' });

        expect(result.ok).toBe(true);
        expect(result.output.results[0].message).toBeUndefined();
    });

    it('passes the inspected requirements brief only to a file-generation task', async () => {
        mockedExecuteTool.mockResolvedValue({ ok: true, output: {} } as any);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Architecture',
                tasks: [{
                    task: 'Write the architecture plan',
                    tool: 'ai_write_file',
                    args: { path: 'architecture/initial_plan.md', description: 'Document system boundaries.' },
                }],
            },
            projectContext: {
                workspaceId: 'workspace-architecture',
                sessionId: 'chat-architecture',
                userId: 'user-architecture',
                requirementsContext: 'AUTHORITATIVE REQUIREMENTS EVIDENCE: explicit tenant boundaries are required.',
            },
        }, { sessionId: 'chat-architecture', workspaceId: 'workspace-architecture', userId: 'user-architecture' });

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool.mock.calls[0][0]).toBe('ai_write_file');
        expect(mockedExecuteTool.mock.calls[0][1]).toMatchObject({
            path: 'architecture/initial_plan.md',
            description: 'Document system boundaries.',
            workspaceId: 'workspace-architecture',
        });
        expect(mockedExecuteTool.mock.calls[0][1].context).toMatch(/AUTHORITATIVE REQUIREMENTS EVIDENCE/);
    });

    it('passes accepted project identity to live verification instead of using the workspace root', async () => {
        mockedExecuteTool.mockResolvedValue({ ok: true, output: {} } as any);
        // Use a per-process path so an old live-run artifact cannot be mistaken
        // for runtime evidence and turn this query assertion into a cwd assertion.
        const projectName = `NEXUS-observability-${process.pid}`;

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Run the produced system',
                tasks: [{ task: 'Create the runnable manifest', tool: 'write_file', args: { path: `${projectName}/package.json`, content: '{"scripts":{"start":"node index.js"}}' } }],
                verificationTask: { task: `Start the ${projectName} system`, tool: 'project_run', args: {} },
            },
            projectContext: {
                projectName,
                sessionId: 'chat-run',
                workspaceId: 'workspace-run',
                userId: 'user-run',
            },
        }, { sessionId: 'chat-run', workspaceId: 'workspace-run', userId: 'user-run' });

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool.mock.calls[1][0]).toBe('project_run');
        expect(mockedExecuteTool.mock.calls[1][1]).toMatchObject({
                            projectQuery: `run the project named "${projectName}"`,

            workspaceId: 'workspace-run',
            sessionId: 'chat-run',
        });
    });

    it('ignores an explicit stale workspace cwd for greenfield live verification', () => {
        const workspaceRoot = require('../modules/services/WorkspaceService').workspaceService.getActiveRoot('workspace-greenfield-cwd');
        const planned: any = { cwd: workspaceRoot };
        const logs: string[] = [];

        applyPhaseExecutionEvidence('project_run', planned, {
            projectName: 'TaskFlow AI',
            createsNewProject: true,
            workspaceId: 'workspace-greenfield-cwd',
        }, logs);

        expect(planned.cwd).toBeUndefined();
        expect(planned.projectQuery).toBe('run the project named "TaskFlow AI"');
        expect(logs.join('\\n')).toContain('ignored stale greenfield cwd');
    });

    it('lets runtime-bound artifact evidence override a stale planned cwd', () => {
        const workspaceRoot = require('../modules/services/WorkspaceService').workspaceService.getActiveRoot('workspace-runtime-bound');
        const projectRoot = require('path').join(workspaceRoot, 'TaskFlow AI');
        const planned: any = { cwd: workspaceRoot, projectQuery: 'old selector' };
        const logs: string[] = [];

        applyPhaseExecutionEvidence('project_run', planned, {
            projectName: 'TaskFlow AI',
            projectRoot,
            createsNewProject: true,
            projectRootRuntimeBound: true,
            workspaceId: 'workspace-runtime-bound',
        }, logs);

        expect(planned).toMatchObject({ cwd: projectRoot });
        expect(planned.projectQuery).toBeUndefined();
        expect(logs.join('\\n')).toContain('runtime-bound project root');
    });

    it('binds an acceptance review to the selected workspace before execution', async () => {
        mockedExecuteTool.mockResolvedValue({ ok: true, output: {} } as any);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 3,
                name: 'Review a produced artifact',
                tasks: [{ task: 'Create the artifact', tool: 'write_file', args: { path: 'architecture.md', content: '# architecture' } }],
                verificationTask: {
                    task: 'Review the produced artifact',
                    tool: 'code_reviewer',
                    args: { files: ['architecture.md'], reviewType: 'quick' },
                },
            },
        }, { sessionId: 'chat-3', workspaceId: 'workspace-3', userId: 'user-3' });

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool).toHaveBeenCalledTimes(2);
        expect(mockedExecuteTool.mock.calls[1][0]).toBe('code_reviewer');
        expect(mockedExecuteTool.mock.calls[1][1]).toMatchObject({
            files: ['architecture.md'],
            workspaceId: 'workspace-3',
            sessionId: 'chat-3',
            minimumScore: 70,
            failOnCritical: true,
        });
        expect(mockedExecuteTool.mock.calls[1][2]).toMatchObject({
            workspaceId: 'workspace-3',
            sessionId: 'chat-3',
            userId: 'user-3',
        });
    });
});
