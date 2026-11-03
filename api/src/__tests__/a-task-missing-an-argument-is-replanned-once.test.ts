const mockCallLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

/**
 * Eval round 8, 2026-10-23 (P001): after a 37-minute local plan, one
 * security_scanner task without a path made the sanitizer raise
 * tool_contract_invalid and the whole build stopped. Like the other planning
 * contracts, it is recovered once: the model sees the exact missing field.
 */
const plan = (scannerArgs: Record<string, unknown>) => JSON.stringify({
    projectName: 'clinic-landing', projectVibe: 'calm', totalPhases: 2, estimatedDuration: '1h',
    phases: [{
        phaseNumber: 1, name: 'Page', description: 'Build the page',
        requirementsCovered: ['landing page'],
        tasks: [
            { task: 'Write the page', tool: 'ai_write_file', args: { path: 'clinic/index.html', description: 'Clinic landing page' }, priority: 'high', realisticMinutes: 10 },
        ],
        deliverables: ['clinic/index.html'], estimatedTime: '10 minutes',
    }, {
        // The shape that stopped P001: a phase whose only work lacks a required field.
        phaseNumber: 2, name: 'Security', description: 'Scan the page',
        requirementsCovered: ['secure page'],
        tasks: [
            { task: 'Scan for security issues', tool: 'security_scanner', args: scannerArgs, priority: 'medium', realisticMinutes: 5 },
        ],
        deliverables: ['security report'], estimatedTime: '5 minutes',
    }],
});

describe('a task missing an argument is re-planned once', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('the model is shown the missing field and its corrected plan is used', async () => {
        mockCallLLM.mockResolvedValueOnce(plan({})).mockResolvedValueOnce(plan({ path: 'clinic' }));
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: 'Build a landing page for a dental clinic.' }, {});
        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(String(mockCallLLM.mock.calls[1][0])).toContain('tool_contract_invalid');
        expect(String(mockCallLLM.mock.calls[1][0])).toContain('security_scanner');
        expect(result.ok).toBe(true);
        expect(JSON.stringify(result.output.phases)).toContain('security_scanner');
    });

    it('a second miss still stops honestly', async () => {
        mockCallLLM.mockResolvedValue(plan({}));
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: 'Build a landing page for a dental clinic.' }, {});
        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).toContain('tool_contract_invalid');
    });
});
