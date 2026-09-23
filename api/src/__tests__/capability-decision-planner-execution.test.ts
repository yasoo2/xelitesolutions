jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));

import { executeTool } from '../modules/services/ToolService';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('capability decision planned execution', () => {
    it('routes a public-data build through ToolService decision before discovery and construction', async () => {
        const plan = (new ProjectPlannerTool() as any)
            .constrainedFrontendPlan('Build a simple weather dashboard using a free public API.');
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'decide_capability_route') return {
                ok: true,
                output: { receipt: {
                    version: 1,
                    family: 'public_data',
                    selected: { id: 'public-data-catalog', route: 'public_api', setup: 'ZERO_SETUP' },
                    requiredUserAction: null,
                } },
                logs: [],
            } as any;
            if (toolName === 'quality_run') return { ok: true, output: { status: 'passed', results: [] }, logs: [] } as any;
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1,
                    apiId: 'public-apis:open-meteo',
                    integrationProfileId: 'open-meteo-weather-v1',
                } },
                logs: [],
            } as any;
            return { ok: true, output: {}, logs: [] } as any;
        });

        const context = { workspaceId: 'ws', sessionId: 'session', userId: 'user', projectRoot: process.cwd(), projectRootRuntimeBound: true };
        const result: any = await new PhaseExecutorTool().execute({ phase: plan.phases[0], projectContext: context }, context);

        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
        expect(mockedExecuteTool.mock.calls.map(call => call[0]).slice(0, 4))
            .toEqual(['decide_capability_route', 'search_public_apis', 'react_project', 'quality_run']);
        expect(mockedExecuteTool.mock.calls[0][1]).toMatchObject({ request: 'Build a simple weather dashboard using a free public API.' });
    });
});