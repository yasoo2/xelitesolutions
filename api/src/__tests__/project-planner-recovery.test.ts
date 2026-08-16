const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';

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
        expect(mockCallLLM.mock.calls[0][2]).toMatchObject({ purpose: 'internal', providerTimeoutMs: 120000 });
        expect(mockCallLLM.mock.calls[1][2]).toMatchObject({ purpose: 'internal', providerTimeoutMs: 120000 });
        expect(mockCallLLM.mock.calls[1][0]).toMatch(/Do not return an empty phases array/i);
        expect(result.ok).toBe(true);
        expect(result.output.fallback).not.toBe(true);
        expect(result.output.phases).toHaveLength(1);
        expect(result.logs.join('\n')).toMatch(/Planner recovery completed/);
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
