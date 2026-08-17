const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';

describe('project planner structured recovery', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('injects authoritative selected-project paths into compact live-repair prompts', () => {
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            'Repair the existing application after a launchability failure.',
            'missing_runnable_contract: package.json or the existing entrypoint must be repaired before project_run',
            undefined,
            true,
            false,
            [],
            {
                mode: 'existing_workspace',
                workspaceRoot: '/tmp/joe-workspace',
                selectedProject: {
                    root: '/tmp/joe-workspace',
                    projectKinds: ['node'],
                    manifests: [{ path: '/tmp/joe-workspace/package.json' }],
                    likelyEntrypoints: ['/tmp/joe-workspace/src/server.js'],
                    testFiles: ['/tmp/joe-workspace/tests/server.test.js'],
                    candidateChecks: [{ command: 'node --check src/server.js' }],
                },
                referenceProjects: [],
            },
        );

        expect(prompt).toMatch(/AUTHORITATIVE DISCOVERY EVIDENCE/i);
        expect(prompt).toMatch(/package\.json/i);
        expect(prompt).toContain('src/server.js');
        expect(prompt).toContain('tests/server.test.js');
        expect(prompt).not.toMatch(/api-taskflow-ai/i);
    });

    it('propagates selected-project evidence into contract recovery', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Existing application',
                projectVibe: 'Contract recovery',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Implement the application',
                    description: 'Implement the requested application.',
                    tasks: [{
                        task: 'Create the runnable project foundation',
                        tool: 'scaffold_project',
                        args: {},
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    deliverables: ['package.json', 'src/server.js'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['R1'],
                }],
            }))
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Existing application',
                projectVibe: 'Evidence-backed runnable repair',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Repair the existing runnable contract',
                    description: 'Repair the existing manifest and entrypoint using discovered paths.',
                    tasks: [{
                        task: 'Write the existing package manifest',
                        tool: 'write_file',
                        args: { path: 'package.json', content: '{"scripts":{"start":"node src/server.js"}}' },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: {
                        task: 'Verify the manifest',
                        tool: 'read_file',
                        args: { path: 'package.json' },
                    },
                    deliverables: ['package.json'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['R1'],
                }],
            }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Implement and repair the existing application, then verify it locally.',
            evidence: {
                mode: 'existing_workspace',
                workspaceRoot: '/tmp/joe-workspace',
                selectedProject: {
                    root: '/tmp/joe-workspace',
                    projectKinds: ['node'],
                    manifests: [{ path: '/tmp/joe-workspace/package.json' }],
                    likelyEntrypoints: ['/tmp/joe-workspace/src/server.js'],
                    testFiles: ['/tmp/joe-workspace/tests/server.test.js'],
                    candidateChecks: [{ command: 'node --check src/server.js' }],
                },
                referenceProjects: [],
            },
        }, {
            repairMode: true,
            engineeringPipeline: true,
            requireRunnableContract: true,
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/AUTHORITATIVE DISCOVERY EVIDENCE/i);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/package\.json/i);
        expect(mockCallLLM.mock.calls[1][0]).toContain('src/server.js');
        expect(mockCallLLM.mock.calls[1][0]).not.toMatch(/api-taskflow-ai/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(1);
    });

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
        expect(mockCallLLM.mock.calls[0][2]).toMatchObject({ purpose: 'internal', providerTimeoutMs: 120000 });
        expect(mockCallLLM.mock.calls[1][2]).toMatchObject({ purpose: 'internal', providerTimeoutMs: 120000 });
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/Do not return an empty phases array/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(1);
        expect(result.logs.join('\n')).toMatch(/Planner recovery completed/);
    });

    it('repairMode accepts one runnable-contract phase without full multi-domain scope coverage', async () => {
        mockCallLLM.mockResolvedValueOnce(JSON.stringify({
            projectName: 'Existing application',
            projectVibe: 'Bounded runnable-contract repair',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Fix entrypoint contract',
                description: 'Update the manifest so the existing start command points to the evidenced entrypoint.',
                tasks: [{
                    task: 'Repair package manifest',
                    tool: 'ai_write_file',
                    args: { path: 'package.json', description: 'Update only the existing start script to target the current entrypoint.' },
                    priority: 'high',
                    realisticMinutes: 5,
                }],
                verificationTask: 'Run the existing build or tests and perform one real start/readiness check.',
                deliverables: ['package.json'],
                estimatedTime: '10 minutes',
                requirementsCovered: ['R1'],
            }],
        }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Repair the existing application after a launchability failure; fix only the manifest or entrypoint and verify it locally.',
        }, {
            repairMode: true,
            engineeringPipeline: true,
            requireRunnableContract: true,
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(1);
        expect(mockCallLLM.mock.calls[0][0]).toMatch(/BOUNDED REPAIR CONTRACT/i);
        expect(result.ok).toBe(true);
        expect(result.output.phases).toHaveLength(1);
        expect(result.output.scopeAssessment).toMatchObject({ ok: true, phases: 1, coveredTargets: 1 });
    });

    it('keeps quality-contract recovery ahead of generic scope recovery', () => {
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            'Repair the existing web project after a project quality contract failure.',
            'project quality contract failed — package.json has no truthful test script although the request requires it',
            undefined,
            true,
            true,
            ['a truthful local test script in the existing package manifest'],
        );

        expect(prompt).toMatch(/BOUNDED QUALITY-CONTRACT REPAIR/i);
        expect(prompt).toMatch(/package\.json/i);
        expect(prompt).toMatch(/deterministic test/i);
        expect(prompt).not.toMatch(/BOUNDED SCOPE-REPAIR/i);
    });

    it('retries an under-scoped implementation plan with the requirement register', async () => {
        const specification = `
# Identity and Access
# Workspace Data Model
# External Integration Boundary
# Background Processing
# User Interface Flows
# Local Verification Strategy

Build the complete system with locally verifiable implementation artifacts.
`;
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Under-scoped system',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Identity only',
                    description: 'Implement only the identity area.',
                    tasks: [{
                        task: 'Write identity implementation',
                        tool: 'write_file',
                        args: { path: 'src/identity.js', content: 'module.exports = { identity: true };' },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: {
                        task: 'Verify identity implementation',
                        tool: 'read_file',
                        args: { path: 'src/identity.js' },
                    },
                    deliverables: ['src/identity.js'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['Identity and Access'],
                }],
            }))
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Recovered complete system',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 3,
                estimatedDuration: '15 minutes',
                dependencies: {},
                phases: [
                    {
                        phaseNumber: 1,
                        name: 'Identity and workspace',
                        description: 'Implement identity and workspace data.',
                        tasks: [{ task: 'Write identity and workspace', tool: 'write_file', args: { path: 'src/core.js', content: 'module.exports = { core: true };' }, priority: 'high', realisticMinutes: 1 }],
                        verificationTask: { task: 'Verify core', tool: 'read_file', args: { path: 'src/core.js' } },
                        deliverables: ['src/core.js'],
                        estimatedTime: '5 minutes',
                        requirementsCovered: ['Identity and Access', 'Workspace Data Model'],
                    },
                    {
                        phaseNumber: 2,
                        name: 'Services and processing',
                        description: 'Implement integrations and background processing.',
                        tasks: [{ task: 'Write service implementation', tool: 'write_file', args: { path: 'src/services.js', content: 'module.exports = { services: true };' }, priority: 'high', realisticMinutes: 1 }],
                        verificationTask: { task: 'Verify services', tool: 'read_file', args: { path: 'src/services.js' } },
                        deliverables: ['src/services.js'],
                        estimatedTime: '5 minutes',
                        requirementsCovered: ['External Integration Boundary', 'Background Processing'],
                    },
                    {
                        phaseNumber: 3,
                        name: 'Interface and verification',
                        description: 'Implement the user interface and local verification.',
                        tasks: [{ task: 'Write interface implementation', tool: 'write_file', args: { path: 'src/ui.js', content: 'module.exports = { ui: true };' }, priority: 'high', realisticMinutes: 1 }],
                        verificationTask: { task: 'Verify interface', tool: 'read_file', args: { path: 'src/ui.js' } },
                        deliverables: ['src/ui.js'],
                        estimatedTime: '5 minutes',
                        requirementsCovered: ['User Interface Flows', 'Local Verification Strategy'],
                    },
                ],
            }));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: specification });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/under-scoped|coverage gate|requirement register/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(3);
        expect(result.output.scopeAssessment.ok).toBe(true);
        expect(result.logs.join('\n')).toMatch(/scope recovery completed/i);
    });

    it('uses a second bounded scope recovery attempt when the first repair remains under-scoped', async () => {
        const specification = `
# Identity and Access
# Workspace Data Model
# External Integration Boundary
# Background Processing
# User Interface Flows
# Local Verification Strategy

Build the complete system with locally verifiable implementation artifacts.
`;
        const phase = (name: string, covered: string[], file: string) => ({
            name,
            description: `Implement ${name}.`,
            tasks: [{ task: `Write ${name}`, tool: 'write_file', args: { path: file, content: `module.exports = ${JSON.stringify(covered)};` }, priority: 'high', realisticMinutes: 1 }],
            verificationTask: { task: `Verify ${name}`, tool: 'read_file', args: { path: file } },
            deliverables: [file],
            estimatedTime: '5 minutes',
            requirementsCovered: covered,
        });
        const underScoped = {
            projectName: 'Still incomplete system',
            projectVibe: 'Evidence-backed implementation',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [phase('Identity only', ['Identity and Access'], 'src/identity.js')],
        };
        const complete = {
            projectName: 'Second recovery system',
            projectVibe: 'Evidence-backed implementation',
            totalPhases: 3,
            estimatedDuration: '15 minutes',
            dependencies: {},
            phases: [
                phase('Identity and workspace', ['Identity and Access', 'Workspace Data Model'], 'src/core.js'),
                phase('Services and processing', ['External Integration Boundary', 'Background Processing'], 'src/services.js'),
                phase('Interface and verification', ['User Interface Flows', 'Local Verification Strategy'], 'src/ui.js'),
            ],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(underScoped))
            .mockResolvedValueOnce(JSON.stringify(underScoped))
            .mockResolvedValueOnce(JSON.stringify(complete));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: specification });

        expect(mockCallLLM).toHaveBeenCalledTimes(3);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/Missing areas|under-scoped|coverage gate/i);
        expect(mockCallLLM.mock.calls[2][0]).toMatch(/Missing areas|under-scoped|coverage gate/i);
        expect(result.ok).toBe(true);
        expect(result.output.scopeAssessment.ok).toBe(true);
        expect(result.logs.join('\n')).toMatch(/attempt 2\/2/);
        expect(result.logs.join('\n')).toMatch(/scope recovery completed/i);
    });

    it('recovers one scaffold contract blocker when the replacement plan supplies a concrete structure', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Malformed scaffold plan',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Initialize application',
                    description: 'Create the application seed.',
                    tasks: [{
                        task: 'Scaffold the application',
                        tool: 'scaffold_project',
                        args: {},
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: { task: 'Verify the seed', tool: 'read_file', args: { path: 'package.json' } },
                    deliverables: ['package.json'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['the requested application'],
                }],
            }))
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Recovered scaffold plan',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Initialize application',
                    description: 'Create the application seed from the selected stack.',
                    tasks: [{
                        task: 'Scaffold the application with the evidenced structure',
                        tool: 'scaffold_project',
                        args: {
                            structure: {
                                'package.json': '{"private":true}',
                                'src/index.ts': 'export const app = true;',
                            },
                        },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: { task: 'Verify the seed', tool: 'read_file', args: { path: 'package.json' } },
                    deliverables: ['package.json', 'src/index.ts'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['the requested application'],
                }],
            }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a TypeScript application using the explicitly selected Vite stack and verify it locally.',
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/scaffold contract|structure|non-empty/i);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/args\.structure.*non-empty|safe workspace-relative/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(1);
        expect(result.logs.join('\\n')).toMatch(/scaffold contract recovery completed/i);
    });

    it('recovers a docs-only scaffold into a real implementation scaffold', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Documentation-only scaffold',
                projectVibe: 'Invalid implementation plan',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Describe the application',
                    description: 'Record the requested application in planning notes.',
                    tasks: [{
                        task: 'Create planning notes',
                        tool: 'scaffold_project',
                        args: {
                            structure: {
                                'README.md': '# App',
                                'challenge.txt': 'Build the app.',
                            },
                        },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: { task: 'Read the notes', tool: 'read_file', args: { path: 'README.md' } },
                    deliverables: ['README.md', 'challenge.txt'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['the requested application'],
                }],
            }))
            .mockResolvedValueOnce(JSON.stringify({
                projectName: 'Recovered real scaffold',
                projectVibe: 'Evidence-backed implementation',
                totalPhases: 1,
                estimatedDuration: '5 minutes',
                dependencies: {},
                phases: [{
                    phaseNumber: 1,
                    name: 'Create the executable seed',
                    description: 'Create source and configuration files for the explicitly selected TypeScript stack.',
                    tasks: [{
                        task: 'Create the executable seed',
                        tool: 'scaffold_project',
                        args: {
                            structure: {
                                'package.json': '{"private":true,"scripts":{"test":"node test/app.test.js"}}',
                                'src/index.ts': 'export const app = true;',
                                'test/app.test.js': 'const assert = require("node:assert"); assert.equal(true, true);',
                            },
                        },
                        priority: 'high',
                        realisticMinutes: 1,
                    }],
                    verificationTask: { task: 'Verify the source seed', tool: 'read_file', args: { path: 'src/index.ts' } },
                    deliverables: ['package.json', 'src/index.ts', 'test/app.test.js'],
                    estimatedTime: '5 minutes',
                    requirementsCovered: ['the requested application'],
                }],
            }));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a TypeScript application using the explicitly selected Vite stack and verify it locally.',
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/SCAFFOLD RECOVERY CONTRACT|structure.*non-empty/i);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/README|Markdown\/TXT|implementation artifact/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases[0].tasks[0].args.structure['src/index.ts']).toBeDefined();
        expect(result.logs.join('\\n')).toMatch(/contract recovery completed/i);
    });

    it('retries portability recovery once after a provider rate limit and accepts only the portable plan', async () => {
        const nativePlan = {
            projectName: 'Native storage plan',
            projectVibe: 'Greenfield implementation',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Create persistence layer',
                description: 'Implement the requested persistence layer with sqlite3.',
                tasks: [{
                    task: 'Create the sqlite3 persistence adapter',
                    tool: 'ai_write_file',
                    args: { path: 'src/db.ts', description: 'Use the sqlite3 native package for persistence.' },
                    priority: 'high',
                    realisticMinutes: 1,
                }],
                verificationTask: { task: 'Verify the adapter', tool: 'read_file', args: { path: 'src/db.ts' } },
                deliverables: ['src/db.ts'],
                estimatedTime: '5 minutes',
                requirementsCovered: ['the requested persistence layer'],
            }],
        };
        const portablePlan = {
            ...nativePlan,
            projectName: 'Portable storage plan',
            phases: [{
                ...nativePlan.phases[0],
                name: 'Create portable persistence layer',
                description: 'Implement persistence with node:sqlite or a JSON fallback.',
                tasks: [{
                    ...nativePlan.phases[0].tasks[0],
                    task: 'Create the portable persistence adapter',
                    args: { path: 'src/db.ts', description: 'Use node:sqlite when available and a JSON file fallback with the same interface.' },
                }],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(nativePlan))
            .mockResolvedValueOnce(`${PROVIDER_FAILURE_PREFIX} — السبب: 429 rate limit; retry after 0 seconds`)
            .mockResolvedValueOnce(JSON.stringify(portablePlan));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a greenfield TypeScript persistence utility and verify it locally.',
            evidence: { mode: 'greenfield', referenceProjects: [], facts: [], blockers: [] } as any,
        }, { plannerRecoveryRetryDelayMs: 0 });

        expect(mockCallLLM).toHaveBeenCalledTimes(3);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/PORTABILITY RECOVERY CONTRACT|native npm addons/i);
        expect(mockCallLLM.mock.calls[2][0]).toMatch(/PORTABILITY RECOVERY CONTRACT|native npm addons/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases[0].tasks[0].args.description).toMatch(/node:sqlite|JSON/i);
        expect(result.logs.join('\\n')).toMatch(/rate limit; waiting 0ms/i);
        expect(result.logs.join('\\n')).toMatch(/contract recovery completed/i);
    });

    it('normalizes a native dependency after bounded recovery is still unusable', async () => {
        const nativePlan = {
            projectName: 'Native storage plan',
            projectVibe: 'Greenfield implementation',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Create persistence layer',
                description: 'Implement the persistence layer with sqlite3.',
                tasks: [{
                    task: 'Create the sqlite3 persistence adapter',
                    tool: 'ai_write_file',
                    args: { path: 'src/db.ts', description: 'Use the sqlite3 native package for persistence.' },
                    priority: 'high',
                    realisticMinutes: 1,
                }],
                verificationTask: { task: 'Verify the adapter', tool: 'read_file', args: { path: 'src/db.ts' } },
                deliverables: ['src/db.ts'],
                estimatedTime: '5 minutes',
                requirementsCovered: ['the requested persistence layer'],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(nativePlan))
            .mockResolvedValueOnce(`${PROVIDER_FAILURE_PREFIX} — recovery unavailable`);

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Build a greenfield TypeScript persistence utility and verify it locally.',
            evidence: { mode: 'greenfield', referenceProjects: [], facts: [], blockers: [] } as any,
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases[0].tasks[0].args.description).toMatch(/node:sqlite|JSON/i);
        expect(result.logs.join('\\n')).toMatch(/portability normalization completed/i);
    });

    it('treats live-repair and fix requests as implementation work and blocks docs-only recovery', async () => {
        const docsOnlyPlan = {
            projectName: 'Repair target',
            projectVibe: 'Evidence-backed repair',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Record repair notes',
                description: 'Document the repair instead of changing the runnable artifact.',
                tasks: [{
                    task: 'Write repair notes',
                    tool: 'write_file',
                    args: { path: 'docs/repair.md', content: '# Repair notes' },
                    priority: 'high',
                    realisticMinutes: 1,
                }],
                verificationTask: { task: 'Read repair notes', tool: 'read_file', args: { path: 'docs/repair.md' } },
                deliverables: ['docs/repair.md'],
                estimatedTime: '5 minutes',
                requirementsCovered: ['the runnable contract'],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(docsOnlyPlan))
            .mockResolvedValueOnce(JSON.stringify(docsOnlyPlan));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: 'Repair the current project and fix the runnable contract after a failed live-run check.',
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(result.output.fallback).toBe(true);
        expect(result.output.blocker.code).toBe('no_implementation_artifacts_after_contract_recovery');
        expect(result.logs.join('\\n')).toMatch(/contract recovery failed|no non-document implementation artifact/i);
    });

    it('preserves the greenfield runnable-contract gate during scope recovery', async () => {
        const specification = [
            '# Identity and Access',
            '# Workspace Data Model',
            '# External Integration Boundary',
            '# Background Processing',
            '# User Interface Flows',
            '# Local Verification Strategy',
            '',
            'Build a complete Node.js task application with locally verifiable implementation artifacts.',
        ].join('\n');
        const runnableSeed = {
            projectName: 'TaskFlow AI',
            projectVibe: 'Evidence-backed Node.js implementation',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Runnable foundation',
                description: 'Create the manifest and application entrypoint before implementation.',
                tasks: [
                    { task: 'Create the runnable manifest', tool: 'ai_write_file', args: { path: 'package.json', description: 'Create a Node.js manifest with a local start script.' }, priority: 'high', realisticMinutes: 1 },
                    { task: 'Create the application entrypoint', tool: 'ai_write_file', args: { path: 'src/index.ts', description: 'Create the HTTP application entrypoint.' }, priority: 'high', realisticMinutes: 1 },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
                deliverables: ['package.json', 'src/index.ts'],
                estimatedTime: '5 minutes',
                requirementsCovered: ['Identity and Access'],
            }],
        };
        const scopeRecoveryWithoutRunnableContract = {
            projectName: 'TaskFlow AI',
            projectVibe: 'Evidence-backed Node.js implementation',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Complete capability slice',
                description: 'Implement every requirement area in source code.',
                tasks: [{
                    task: 'Implement the complete capability slice',
                    tool: 'ai_write_file',
                    args: { path: 'src/capabilities.ts', description: 'Implement the complete task application capability slice.' },
                    priority: 'high',
                    realisticMinutes: 1,
                }],
                verificationTask: { task: 'Read the capability slice', tool: 'read_file', args: { path: 'src/capabilities.ts' } },
                deliverables: ['src/capabilities.ts'],
                estimatedTime: '5 minutes',
                requirementsCovered: [
                    'Identity and Access', 'Workspace Data Model', 'External Integration Boundary',
                    'Background Processing', 'User Interface Flows', 'Local Verification Strategy',
                ],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(runnableSeed))
            .mockResolvedValueOnce(JSON.stringify(scopeRecoveryWithoutRunnableContract))
            .mockResolvedValueOnce(JSON.stringify(scopeRecoveryWithoutRunnableContract));

        const result: any = await new ProjectPlannerTool().execute({
            projectDescription: specification,
            evidence: {
                mode: 'greenfield',
                workspaceRoot: '/tmp/joe-scope-workspace',
                selectedProject: undefined,
                referenceProjects: [{
                    root: '/tmp/joe-scope-workspace/reference-app',
                    projectKinds: ['node'],
                    manifests: [{ path: '/tmp/joe-scope-workspace/reference-app/package.json', kind: 'package.json' }],
                    git: { isRepository: true, branch: 'main' },
                    likelyEntrypoints: ['/tmp/joe-scope-workspace/reference-app/src/index.ts'],
                    candidateChecks: [{ kind: 'test', command: 'npm test', source: '/tmp/joe-scope-workspace/reference-app/package.json' }],
                }],
            },
        }, {
            engineeringPipeline: true,
            requireRunnableContract: true,
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(3);
        expect(result.ok).toBe(false);
        expect(result.output.fallback).toBe(true);
        expect(result.logs.join('\\n')).toMatch(/scope recovery attempt 1 failed/i);
        expect(result.logs.join('\\n')).toMatch(/package\.json|entrypoint|قابلاً للتشغيل/i);
    });

    it('rejects a browser-facing plan that has no concrete frontend artifact', async () => {
        const specification = [
            '# Identity and Access',
            '# Workspace Data Model',
            '# External Integration Boundary',
            '# Background Processing',
            '# Browser User Interface',
            '# Local Verification Strategy',
            '',
            'Build a browser-based web application with locally verifiable implementation artifacts.',
        ].join('\n');
        const backendOnlyPlan = {
            projectName: 'Backend-only web plan',
            projectVibe: 'Evidence-backed implementation',
            totalPhases: 3,
            estimatedDuration: '15 minutes',
            dependencies: {},
            phases: [
                { phaseNumber: 1, name: 'Identity and data', description: 'Implement identity and workspace data.', tasks: [{ task: 'Write identity service', tool: 'write_file', args: { path: 'src/auth.js', content: 'module.exports = {}; ' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify identity service.', deliverables: ['src/auth.js'], estimatedTime: '5 minutes', requirementsCovered: ['Identity and Access', 'Workspace Data Model'] },
                { phaseNumber: 2, name: 'Services and jobs', description: 'Implement integrations and background jobs.', tasks: [{ task: 'Write service layer', tool: 'write_file', args: { path: 'src/services.js', content: 'module.exports = {}; ' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify service layer.', deliverables: ['src/services.js'], estimatedTime: '5 minutes', requirementsCovered: ['External Integration Boundary', 'Background Processing'] },
                { phaseNumber: 3, name: 'Runtime verification', description: 'Implement the server runtime and verification.', tasks: [{ task: 'Write server entrypoint', tool: 'write_file', args: { path: 'src/server.js', content: 'module.exports = {}; ' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify the server runtime.', deliverables: ['src/server.js'], estimatedTime: '5 minutes', requirementsCovered: ['Browser User Interface', 'Local Verification Strategy'] },
            ],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(backendOnlyPlan))
            .mockResolvedValueOnce(JSON.stringify(backendOnlyPlan))
            .mockResolvedValueOnce(JSON.stringify(backendOnlyPlan));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: specification });

        expect(mockCallLLM).toHaveBeenCalledTimes(3);
        expect(result.ok).toBe(false);
        expect(result.output.fallback).toBe(true);
        expect(result.output.blocker.code).toBe('plan_scope_insufficient');
        expect(result.output.scopeAssessment).toMatchObject({ browserContractRequired: true, browserAuditableArtifact: false });
        expect(result.output.scopeAssessment.missingTargetNames).toContain('browser-auditable frontend artifact');
        expect(result.logs.join('\\n')).toMatch(/frontend artifact|browser-facing/i);
    });

    it('accepts a browser-facing plan with a concrete frontend artifact path', async () => {
        const specification = [
            '# Identity and Access',
            '# Workspace Data Model',
            '# External Integration Boundary',
            '# Background Processing',
            '# Browser User Interface',
            '# Local Verification Strategy',
            '',
            'Build a browser-based web application with locally verifiable implementation artifacts.',
        ].join('\n');
        const plan = {
            projectName: 'Auditable web plan',
            projectVibe: 'Evidence-backed implementation',
            totalPhases: 3,
            estimatedDuration: '15 minutes',
            dependencies: {},
            phases: [
                { phaseNumber: 1, name: 'Identity and data', description: 'Implement identity and workspace data.', tasks: [{ task: 'Write identity service', tool: 'write_file', args: { path: 'src/auth.js', content: 'module.exports = {}; ' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify identity service.', deliverables: ['src/auth.js'], estimatedTime: '5 minutes', requirementsCovered: ['Identity and Access', 'Workspace Data Model'] },
                { phaseNumber: 2, name: 'Services and jobs', description: 'Implement integrations and background jobs.', tasks: [{ task: 'Write service layer', tool: 'write_file', args: { path: 'src/services.js', content: 'module.exports = {}; ' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify service layer.', deliverables: ['src/services.js'], estimatedTime: '5 minutes', requirementsCovered: ['External Integration Boundary', 'Background Processing'] },
                { phaseNumber: 3, name: 'Browser UI and verification', description: 'Implement the browser interface and local verification.', tasks: [{ task: 'Write the frontend entrypoint', tool: 'write_file', args: { path: 'src/App.tsx', content: 'export default function App() { return null; }' }, priority: 'high', realisticMinutes: 1 }], verificationTask: 'Verify the browser UI.', deliverables: ['src/App.tsx'], estimatedTime: '5 minutes', requirementsCovered: ['Browser User Interface', 'Local Verification Strategy'] },
            ],
        };
        mockCallLLM.mockResolvedValueOnce(JSON.stringify(plan));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: specification });

        expect(mockCallLLM).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
        expect(result.output.scopeAssessment).toMatchObject({ browserContractRequired: true, browserAuditableArtifact: true, ok: true });
    });

    it('rejects a runtime-import repair plan that omits an evidenced import edge and accepts explicit recovery coverage', async () => {
        const failureEvidence = 'Repair the current project after failure: local runtime imports missing (server/index.js -> ./routes/authRoutes)';
        const incompletePlan = {
            projectName: 'Runtime repair',
            projectVibe: 'Bounded repair',
            totalPhases: 1,
            estimatedDuration: '5 minutes',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Repair manifest',
                description: 'Update the existing package manifest and verify launchability.',
                tasks: [{ task: 'Repair package manifest', tool: 'ai_write_file', args: { path: 'package.json', description: 'Update only the existing start command.' }, priority: 'high', realisticMinutes: 1 }],
                verificationTask: 'Run the existing build and one real readiness check.',
                deliverables: ['package.json'],
                estimatedTime: '5 minutes',
                requirementsCovered: ['R1'],
            }],
        };
        const coveredPlan = {
            ...incompletePlan,
            phases: [{
                ...incompletePlan.phases[0],
                name: 'Repair exact import edge',
                description: 'Repair the evidenced local runtime import edge in the existing server.',
                tasks: [{ task: 'Repair the exact local import', tool: 'ai_write_file', args: { path: 'server/index.js', description: 'Repair the exact edge server/index.js -> ./routes/authRoutes after inspecting the existing routes/auth.js file; preserve the real exported contract.' }, priority: 'high', realisticMinutes: 1 }],
                deliverables: ['server/index.js'],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(incompletePlan))
            .mockResolvedValueOnce(JSON.stringify(coveredPlan));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: failureEvidence }, {
            repairMode: true,
            engineeringPipeline: true,
            requireRunnableContract: true,
        });

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/MISSING LOCAL RUNTIME IMPORT LEDGER/i);
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/server\/index\.js.*routes\/authRoutes/i);
        expect(result.ok).toBe(true);
        expect(result.output.scopeAssessment).toMatchObject({ ok: true, coveredTargets: 1, missingTargetNames: [] });
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
