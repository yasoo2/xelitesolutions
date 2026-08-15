import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { adaptPlannedArgsFromDescription, plannedArgsIssue } from '../core/orchestrator/plan-tools';

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

    it('extracts the product requirement register instead of execution-protocol headings', () => {
        const prompt = `
CRITICAL INSTRUCTION — THIS IS A REAL EXECUTION TEST OF JOE
START THE REAL JOE SYSTEM
Diagnose it.
Fix it.

MAIN JOE CHALLENGE
Build a production-grade platform.
It must contain:
1. Multi-tenant authentication
2. Organizations
3. Teams
4. Roles
5. Permissions
6. Projects
7. Tasks
8. Notifications

END OF JOE CHALLENGE
OBSERVE JOE — DO NOT TAKE OVER
`;
        const scope = planner.requirementScope(prompt);

        expect(scope.requiresImplementation).toBe(true);
        expect(scope.targets).toEqual([
            'Multi-tenant authentication', 'Organizations', 'Teams', 'Roles',
            'Permissions', 'Projects', 'Tasks', 'Notifications',
        ]);
        expect(scope.targets).not.toContain('Diagnose it.');
        expect(scope.targets).not.toContain('START THE REAL JOE SYSTEM');
    });

    it('recognises a numbered NEXUS challenge marker and keeps the primary register', () => {
        const productAreas = [
            'Multi-tenant authentication', 'Organizations', 'Teams', 'Roles', 'Permissions',
            'RBAC', 'Audit logs', 'Projects', 'Tasks', 'Kanban', 'Gantt', 'CRM',
            'Customers', 'Products', 'Orders', 'Inventory', 'Invoices', 'Accounting',
            'Notifications', 'File management', 'Search', 'AI assistant', 'AI agents',
            'Workflow automation', 'API management', 'Developer portal', 'Analytics',
            'Admin dashboard', 'Security center', 'Monitoring', 'Real-time updates',
        ];
        const prompt = [
            '4. MAIN JOE CHALLENGE',
            'Build a production-grade autonomous software platform.',
            'It must contain:',
            ...productAreas.map((area, index) => `${index + 1}. ${area}`),
            '5. FINAL ACCEPTANCE TEST',
            '1. Inspect the result',
            '2. Verify the result',
            'END OF JOE CHALLENGE',
        ].join('\n');
        const scope = planner.requirementScope(prompt);

        expect(scope.requiresImplementation).toBe(true);
        expect(scope.targets).toEqual(productAreas.slice(0, 18));
        expect(scope.targets).not.toContain('Inspect the result');
        expect(scope.minPhases).toBe(6);
    });

    it('counts stable R-number requirement references as coverage evidence', () => {
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
                phase('Identity implementation', ['R1', 'R2'], 'src/identity.ts'),
                phase('Service implementation', ['R3', 'R4'], 'src/services.ts'),
                phase('Experience and verification', ['R5', 'R6'], 'src/verification.ts'),
            ],
        }, specification);

        expect(assessment.ok).toBe(true);
        expect(assessment.coveredTargets).toBe(6);
        expect(assessment.missingTargetNames).toEqual([]);
    });

    it('repairs a described browser task upstream but rejects a truly empty browser contract', () => {
        const adapted = adaptPlannedArgsFromDescription(
            'browser_run',
            { sessionId: 'panel-test' },
            'Open the locally built application in the visible browser and inspect the main flow',
        );

        expect(adapted.instructionText).toContain('Open the locally built application');
        expect(plannedArgsIssue('browser_run', adapted)).toBeNull();
        expect(plannedArgsIssue('browser_run', { sessionId: 'panel-test' })).toMatch(/instructionText|actions/);
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
