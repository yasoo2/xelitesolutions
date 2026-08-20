import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

describe('PhaseExecutor preserves bounded delivery evidence', () => {
    const executeToolMock = executeTool as jest.Mock;
    let projectRoot: string;

    beforeEach(() => {
        executeToolMock.mockReset();
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-phase-delivery-'));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('carries acceptance and fidelity evidence through the real executor wrapper', async () => {
        const delivery = {
            accepted: false,
            blockers: ['acceptance_criteria_unmet'],
            askedButMissing: ['live_weather_data'],
            fidelityMismatch: false,
            acceptanceBlocked: true,
            acceptanceUnmet: ['weather_live_data'],
            requestedVisualAudit: true,
            visualAuditUnavailable: false,
        };
        executeToolMock.mockResolvedValue({
            ok: false,
            error: 'acceptance_criteria_unmet',
            output: {
                path: projectRoot,
                delivery,
            },
        });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 1,
                name: 'Build WeatherGo',
                tasks: [{
                    task: 'Build the requested WeatherGo application',
                    tool: 'react_project',
                    args: { projectPath: projectRoot, request: 'Build WeatherGo with live weather data' },
                }],
            },
            projectContext: {
                projectName: 'WeatherGo',
                projectRoot,
                projectRootRuntimeBound: true,
                runId: 'run-042b-delivery',
                workspaceId: 'workspace-042b-delivery',
            },
        }, {
            runId: 'run-042b-delivery',
            sessionId: 'session-042b-delivery',
            workspaceId: 'workspace-042b-delivery',
            userId: 'owner-042b-delivery',
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('acceptance_criteria_unmet');
        expect(result.output.delivery).toEqual(delivery);
        expect(result.output.results[0]).toMatchObject({
            ok: false,
            error: 'acceptance_criteria_unmet',
            delivery,
            acceptanceUnmet: ['weather_live_data'],
            fidelityMismatch: false,
        });
        expect(executeToolMock).toHaveBeenCalledTimes(1);
    });

    it('does not invent delivery evidence when a failed tool returns none', async () => {
        executeToolMock.mockResolvedValue({
            ok: false,
            error: 'verification_failed',
            output: { path: projectRoot },
        });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 1,
                name: 'Evidence-free failure',
                tasks: [{ task: 'Run verification', tool: 'react_project', args: { projectPath: projectRoot } }],
            },
            projectContext: { projectRoot, projectRootRuntimeBound: true },
        });

        expect(result.ok).toBe(false);
        expect(result.output.delivery).toBeUndefined();
        expect(result.output.results[0].delivery).toBeUndefined();
        expect(result.output.results[0].acceptanceUnmet).toBeUndefined();
    });
});
