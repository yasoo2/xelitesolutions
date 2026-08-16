jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

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

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Run the produced system',
                tasks: [{ task: 'Create the runnable manifest', tool: 'write_file', args: { path: 'NEXUS/package.json', content: '{"scripts":{"start":"node index.js"}}' } }],
                verificationTask: { task: 'Start the NEXUS system', tool: 'project_run', args: {} },
            },
            projectContext: {
                projectName: 'NEXUS',
                sessionId: 'chat-run',
                workspaceId: 'workspace-run',
                userId: 'user-run',
            },
        }, { sessionId: 'chat-run', workspaceId: 'workspace-run', userId: 'user-run' });

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool.mock.calls[1][0]).toBe('project_run');
        expect(mockedExecuteTool.mock.calls[1][1]).toMatchObject({
            projectQuery: 'run the project named "NEXUS"',
            workspaceId: 'workspace-run',
            sessionId: 'chat-run',
        });
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
