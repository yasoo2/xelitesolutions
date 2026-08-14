import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

describe('ProjectPlannerTool scope coverage gate', () => {
    const specification = `
# Identity and Access
# Workspace Data Model
# External Integration Boundary
# Background Processing
# User Interface Flows
# Local Verification Strategy

Implement the complete system as described above with locally verifiable artifacts.
`;

    const planner = new ProjectPlannerTool() as any;

    it('rejects a documentation-only plan for a multi-domain implementation specification', () => {
        const assessment = planner.assessPlanScope({
            phases: [{
                name: 'Architecture',
                requirementsCovered: ['Identity and Access'],
                deliverables: ['docs/architecture.md'],
                tasks: [{
                    task: 'Write architecture note',
                    tool: 'ai_write_file',
                    args: { path: 'docs/architecture.md', description: 'A planning document.' },
                }],
            }],
        }, specification);

        expect(assessment.ok).toBe(false);
        expect(assessment.phases).toBe(1);
        expect(assessment.implementationArtifacts).toBe(0);
        expect(assessment.message).toContain('under-scoped');
    });

    it('accepts a proportionate plan with implementation artifacts and requirement coverage', () => {
        const phase = (name: string, covered: string[], file: string) => ({
            name,
            requirementsCovered: covered,
            deliverables: [file],
            tasks: [{
                task: `Implement ${name}`,
                tool: 'ai_write_file',
                args: { path: file, description: `Concrete implementation for ${covered.join(' and ')}.` },
            }],
        });
        const assessment = planner.assessPlanScope({
            phases: [
                phase('Identity implementation', ['Identity and Access', 'Workspace Data Model'], 'src/identity.ts'),
                phase('Service implementation', ['External Integration Boundary', 'Background Processing'], 'src/services.ts'),
                phase('Experience and verification', ['User Interface Flows', 'Local Verification Strategy'], 'src/verification.ts'),
            ],
        }, specification);

        expect(assessment.ok).toBe(true);
        expect(assessment.phases).toBe(3);
        expect(assessment.implementationArtifacts).toBe(3);
        expect(assessment.coveredTargets).toBeGreaterThanOrEqual(5);
    });
});
