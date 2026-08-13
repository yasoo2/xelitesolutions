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
});
