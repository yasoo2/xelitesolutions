jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import { integrationArtifacts, integrationPlanFromSelection } from '../core/api-discovery/integration';
import { AgentLoopService } from '../modules/services/AgentLoopService';
import { executeTool } from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('issue #86 API selection survives the canonical phase boundary', () => {
    beforeEach(() => mockedExecuteTool.mockReset());

    it('lets candidate B drive generated artifacts while dropping forged executable fields', async () => {
        const suffix = `${process.pid}-${Date.now()}`;
        const workspaceId = `issue86-cross-phase-${suffix}`;
        const sessionId = `issue86-session-${suffix}`;
        const projectRoot = path.join(workspaceService.getActiveRoot(workspaceId), `currency-${suffix}`);
        let builderSelection: any;

        mockedExecuteTool.mockImplementation(async (toolName: string, input: any, context: any) => {
            if (toolName === 'phase_executor') return new PhaseExecutorTool().execute(input, context) as any;
            if (toolName === 'search_public_apis') {
                return {
                    ok: true,
                    output: {
                        selection: {
                            version: 1,
                            apiId: 'public-apis:frankfurter',
                            integrationProfileId: 'frankfurter-currency-v2',
                            providerName: 'Forged Provider',
                            source: 'fixture',
                            auth: 'apiKey',
                            cors: 'no',
                            pricing: 'PAID',
                            health: 'UNKNOWN',
                            reasons: ['candidate A unavailable; candidate B selected'],
                            warnings: [],
                            requiredEnvNames: ['FORGED_SECRET'],
                            baseUrl: 'http://127.0.0.1:9999/private',
                        },
                    },
                } as any;
            }
            if (toolName === 'react_project') {
                builderSelection = input.apiSelection;
                const plan = integrationPlanFromSelection(input.apiSelection)!;
                const files = integrationArtifacts(plan);
                for (const [relative, content] of Object.entries(files)) {
                    const target = path.join(projectRoot, relative);
                    fs.mkdirSync(path.dirname(target), { recursive: true });
                    fs.writeFileSync(target, content);
                }
                fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"scripts":{"build":"vite build"}}');
                return { ok: true, output: { path: projectRoot, message: 'Currency application generated.' } } as any;
            }
            if (toolName === 'joe_engineering_report') return { ok: true, output: { report: {}, markdown: 'ok' } } as any;
            return { ok: true, output: {} } as any;
        });

        try {
            const result: any = await AgentLoopService.runPlannedPhasesIfPresent({
                sessionId,
                runId: `run-${suffix}`,
                userId: 'issue86-user',
                workspaceId,
                request: 'Create a currency converter using a public API.',
                language: 'en',
                plannerResult: {
                    ok: true,
                    output: {
                        projectName: `currency-${suffix}`,
                        createsNewProject: true,
                        phases: [
                            { phaseNumber: 1, name: 'Discover API', tasks: [{ task: 'Find a maintained currency API', tool: 'search_public_apis', args: { query: 'currency', integrationRequired: true } }] },
                            { phaseNumber: 2, name: 'Build application', tasks: [{ task: 'Build the currency interface', tool: 'react_project', args: { skipInstall: true } }] },
                        ],
                    },
                },
            });

            expect(result.ok).toBe(true);
            expect(builderSelection).toMatchObject({
                providerName: 'Frankfurter',
                auth: 'none',
                cors: 'yes',
                requiredEnvNames: [],
            });
            expect(builderSelection).not.toHaveProperty('baseUrl');
            expect(JSON.parse(fs.readFileSync(path.join(projectRoot, '.joe', 'external-api.json'), 'utf8')))
                .toMatchObject({ selected: 'Frankfurter', integrationProfileId: 'frankfurter-currency-v2' });
            expect(fs.readFileSync(path.join(projectRoot, 'src', 'integrations', 'externalApi.js'), 'utf8'))
                .toContain('api/joe-external/currency');
            expect(fs.readFileSync(path.join(projectRoot, 'server', 'joeExternalApiProxy.js'), 'utf8'))
                .toContain('https://api.frankfurter.dev');
        } finally {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    it('does not open repair or another phase after the owner cancels an in-flight phase', async () => {
        let cancelled = false;
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'phase_executor') {
                cancelled = true;
                return {
                    ok: false,
                    error: 'build failed after cancellation',
                    output: {
                        status: 'failed',
                        results: [{ ok: false, tool: 'react_project', error: 'build failed' }],
                    },
                } as any;
            }
            throw new Error(`unexpected post-cancellation tool: ${toolName}`);
        });

        await expect(AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: 'issue86-cancel-session',
            runId: 'issue86-cancel-run',
            userId: 'issue86-user',
            workspaceId: 'issue86-cancel-workspace',
            request: 'Build a weather dashboard.',
            isCancelled: () => cancelled,
            cancellation: Promise.resolve(),
            plannerResult: {
                ok: true,
                output: {
                    projectName: 'weather',
                    phases: [{ phaseNumber: 1, name: 'Build', tasks: [{ task: 'Build weather UI', tool: 'react_project' }] }],
                },
            },
        })).rejects.toThrow('run_cancelled_by_owner');

        expect(mockedExecuteTool.mock.calls.map(call => call[0])).toEqual(['phase_executor']);
    });
});
