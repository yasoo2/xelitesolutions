const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

describe('project planner structured recovery', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('retries a valid-but-empty JSON response before stopping honestly', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({ projectName: 'Empty', phases: [] }))
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Recovered utility',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Write the portable artifact',
                    description: 'Create the requested JavaScript artifact as a real file.',
                    tasks: [{
                        task: 'Write the artifact',
                        tool: 'write_file',
                        args: { path: 'src/artifact.js', content: 'module.exports = { verified: true };' },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: {
                        task: 'Verify the artifact exists',
                        tool: 'read_file',
                        args: { path: 'src/artifact.js' },
                    },
                    deliverables: ['src/artifact.js'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['the requested JavaScript artifact'],
                }],
            }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a small portable utility and verify its output.',
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/Do not return an empty phases array/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(1);
        expect(result.logs.join('\n')).toMatch(/Planner recovery completed/);
    });

    it('keeps the honest blocker when both the initial and recovery plans are unusable', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({ projectName: 'Empty', phases: [] }))
            .mockResolvedValueOnce(JSON.stringify({ projectName: 'Still empty', phases: [] }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a small portable utility and verify its output.',
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(result.output.fallback).toBe(true);
        expect(result.output.deliveryStatus).toBe('blocked');
        expect(result.logs.join('\n')).toMatch(/Planner recovery failed/);
    });
});

export {};
