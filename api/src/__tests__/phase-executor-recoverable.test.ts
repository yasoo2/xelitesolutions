const executeToolMock = jest.fn();

jest.mock('../modules/services/ToolService', () => ({
    executeTool: (...args: any[]) => executeToolMock(...args),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

describe('PhaseExecutor recoverable source failures', () => {
    beforeEach(() => executeToolMock.mockReset());

    it('continues downstream verification after recoverable ai_write_file syntax failure', async () => {
        executeToolMock
            .mockResolvedValueOnce({
                ok: false,
                recoverable: true,
                error: 'source_syntax_mismatch: WeatherGo/src/__tests__/app.integration.test.ts is not valid TS syntax',
                logs: ['generated source failed the destination-extension syntax contract after bounded retry; nothing was written'],
            })
            .mockResolvedValueOnce({
                ok: true,
                output: { stdout: 'downstream verification ran' },
                logs: [],
            });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 5,
                name: 'Tests',
                tasks: [
                    {
                        task: 'Generate the integration test',
                        tool: 'ai_write_file',
                        args: {
                            path: 'WeatherGo/src/__tests__/app.integration.test.ts',
                            description: 'Write a complete TypeScript integration test.',
                        },
                        priority: 'high',
                        required: true,
                    },
                    {
                        task: 'Run downstream verification',
                        tool: 'shell_execute',
                        args: { command: 'echo downstream verification ran', cwd: '.' },
                    },
                ],
            },
            projectContext: {},
        }, {
            sessionId: 'recoverable-session',
            workspaceId: 'recoverable-workspace',
            userId: 'recoverable-user',
        });

        expect(executeToolMock).toHaveBeenCalledTimes(2);
        expect(executeToolMock.mock.calls.map((call: any[]) => call[0])).toEqual([
            'ai_write_file',
            'shell_execute',
        ]);
        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        expect(result.output.results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tool: 'ai_write_file',
                ok: false,
                recoverable: true,
            }),
            expect.objectContaining({
                tool: 'shell_execute',
                ok: true,
                message: 'downstream verification ran',
            }),
        ]));
    });
});
