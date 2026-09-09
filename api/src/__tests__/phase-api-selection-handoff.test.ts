jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));

import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { integrationArtifacts, integrationPlanFromSelection } from '../core/api-discovery/integration';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('PhaseExecutor API selection handoff', () => {
    it('causally passes the selected candidate to React through the canonical tool boundary', async () => {
        mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1, apiId: 'candidate-b', integrationProfileId: 'frankfurter-currency-v2',
                    providerName: 'Untrusted override', source: 'fixture', auth: 'apiKey', cors: 'no', pricing: 'PAID',
                    health: 'HEALTHY', reasons: ['candidate B won'], warnings: [], requiredEnvNames: ['EVIL'],
                    baseUrl: 'http://127.0.0.1/private',
                } },
            } as any;
            if (toolName === 'react_project') return { ok: true, output: { message: 'built' } } as any;
            return { ok: true, output: {} } as any;
        });

        const context = { projectName: 'currency-app', workspaceId: 'ws', sessionId: 'session', userId: 'user', createsNewProject: true };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Build', tasks: [
                { task: 'Discover', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } },
                { task: 'Build', tool: 'react_project', args: { request: 'Create a currency converter' } },
            ] }, projectContext: context,
        }, context);

        expect(result.ok).toBe(true);
        const reactCall = mockedExecuteTool.mock.calls.find(call => call[0] === 'react_project');
        expect(reactCall?.[1].apiSelection).toMatchObject({
            apiId: 'candidate-b', integrationProfileId: 'frankfurter-currency-v2', providerName: 'Frankfurter',
            auth: 'none', cors: 'yes', pricing: 'UNKNOWN', requiredEnvNames: [],
        });
        expect((reactCall?.[1].apiSelection as any).baseUrl).toBeUndefined();
        const files = integrationArtifacts(integrationPlanFromSelection(reactCall?.[1].apiSelection)!);
        expect(JSON.parse(files['.joe/external-api.json']).apiId).toBe('candidate-b');
        expect(files['src/integrations/externalApi.js']).toContain('"api/joe-external/currency"');
        expect(files['src/integrations/externalApi.js']).not.toContain('api.frankfurter.app');
        expect(files['server/joeExternalApiProxy.js']).toContain('https://api.frankfurter.dev');
    });
});
