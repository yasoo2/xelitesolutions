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
