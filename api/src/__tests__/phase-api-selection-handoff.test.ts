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

    it('late-binds inspect and validate to the candidate selected by search', async () => {
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1,
                    apiId: 'public-apis:frankfurter',
                    integrationProfileId: 'frankfurter-currency-v2',
                } },
            } as any;
            return { ok: true, output: {} } as any;
        });

        const context = { projectName: 'currency-app', workspaceId: 'ws', sessionId: 'session', userId: 'user' };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Discover and inspect', tasks: [
                { task: 'Discover', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } },
                { task: 'Inspect', tool: 'inspect_api', args: {} },
                { task: 'Validate', tool: 'validate_api', args: {} },
            ] },
            projectContext: context,
        }, context);

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool.mock.calls.find(call => call[0] === 'inspect_api')?.[1].apiId)
            .toBe('public-apis:frankfurter');
        expect(mockedExecuteTool.mock.calls.find(call => call[0] === 'validate_api')?.[1].apiId)
            .toBe('public-apis:frankfurter');
    });

    it('preserves an explicit catalog id instead of silently replacing it with the selected id', async () => {
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1,
                    apiId: 'public-apis:frankfurter',
                    integrationProfileId: 'frankfurter-currency-v2',
                } },
            } as any;
            return { ok: true, output: {} } as any;
        });

        const context = { workspaceId: 'ws', sessionId: 'session', userId: 'user' };
        await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Inspect explicit candidate', tasks: [
                { task: 'Discover', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } },
                { task: 'Inspect candidate B', tool: 'inspect_api', args: { apiId: 'public-apis:candidate-b' } },
            ] },
            projectContext: context,
        }, context);

        expect(mockedExecuteTool.mock.calls.find(call => call[0] === 'inspect_api')?.[1].apiId)
            .toBe('public-apis:candidate-b');
    });

    it('stops before integration when validation marks the selected provider unavailable', async () => {
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1,
                    apiId: 'public-apis:frankfurter',
                    integrationProfileId: 'frankfurter-currency-v2',
                } },
            } as any;
            if (toolName === 'validate_api') return {
                ok: true,
                output: { api: { id: 'public-apis:frankfurter', health: 'UNAVAILABLE', healthDetail: 'probe timed out' } },
            } as any;
            return { ok: true, output: {} } as any;
        });

        const context = { workspaceId: 'ws', sessionId: 'session', userId: 'user' };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Validate and build', tasks: [
                { task: 'Discover', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } },
                { task: 'Validate', tool: 'validate_api', args: {} },
                { task: 'Build', tool: 'react_project', args: { request: 'Create a currency converter' } },
            ] },
            projectContext: context,
        }, context);

        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        expect(result.output.apiSelection.health).toBe('UNAVAILABLE');
        expect(mockedExecuteTool).not.toHaveBeenCalledWith('react_project', expect.anything(), expect.anything());
    });

    it('stops on unavailable validation when selection arrived from a previous phase', async () => {
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'search_public_apis') return {
                ok: true,
                output: { selection: {
                    version: 1,
                    apiId: 'public-apis:frankfurter',
                    integrationProfileId: 'frankfurter-currency-v2',
                } },
            } as any;
            if (toolName === 'validate_api') return {
                ok: true,
                output: { api: { id: 'public-apis:frankfurter', health: 'UNAVAILABLE' } },
            } as any;
            return { ok: true, output: {} } as any;
        });

        const context: any = { workspaceId: 'ws', sessionId: 'session', userId: 'user' };
        const discovery: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Discover', tasks: [
                { task: 'Discover', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } },
            ] },
            projectContext: context,
        }, context);
        context.apiSelection = discovery.output.apiSelection;
        mockedExecuteTool.mockClear();

        const validation: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 2, name: 'Validate and build', tasks: [
                { task: 'Validate', tool: 'validate_api', args: {} },
                { task: 'Build', tool: 'react_project', args: { request: 'Create a currency converter' } },
            ] },
            projectContext: context,
        }, context);

        expect(validation.ok).toBe(false);
        expect(validation.output.apiSelection.health).toBe('UNAVAILABLE');
        expect(mockedExecuteTool.mock.calls.some(call => call[0] === 'react_project')).toBe(false);
    });
});
