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
        expect(scope.targets).toEqual(productAreas);
        expect(scope.targets).not.toContain('Inspect the result');
        expect(scope.minPhases).toBe(8);
    });

    it('rejects a plan that covers only the former truncated register of a larger brief', () => {
        const phase = (index: number) => ({
            name: `Implementation ${index}`,
            requirementsCovered: [`R${index}`],
            deliverables: [`src/module-${index}.ts`],
            tasks: [{
                task: 'Implement the mapped requirement in source code',
                tool: 'ai_write_file',
                args: { path: `src/module-${index}.ts`, description: 'Concrete source implementation.' },
            }],
        });
        const productAreas = ['AlphaGateway', 'BetaIdentity', 'GammaStorage', 'DeltaSearch', 'EpsilonBilling', 'ZetaAudit', 'EtaWorkflow', 'ThetaNotifications', 'IotaReports', 'KappaImport', 'LambdaExport', 'MuPermissions', 'NuAnalytics', 'XiBackups', 'OmicronSettings', 'PiTeams', 'RhoProjects', 'SigmaComments', 'TauTags', 'UpsilonFiles', 'PhiIntegrations', 'ChiWebhooks', 'PsiQueues', 'OmegaMonitoring', 'ApexPolicies', 'BeaconAlerts', 'CipherSecrets', 'DeltaRegions', 'EchoTemplates', 'FluxThemes', 'GraphSnapshots'];
        const prompt = [
            'MAIN JOE CHALLENGE',
            'Build a production-grade platform.',
            'It must contain:',
            ...productAreas.map((area, index) => `${index + 1}. ${area}`),
            'END OF JOE CHALLENGE',
        ].join('\n');
        const assessment = planner.assessPlanScope({ phases: Array.from({ length: 18 }, (_, index) => phase(index + 1)) }, prompt);

        expect(assessment.targets).toHaveLength(31);
        expect(assessment.coveredTargets).toBe(18);
        expect(assessment.ok).toBe(false);
        expect(assessment.message).toContain('31 requirement areas');
    });

    it('keeps the complete register and dynamic phase floor in compact scope recovery', () => {
        const productAreas = Array.from({ length: 31 }, (_, index) => `Area ${index + 1}`);
        const prompt = [
            'MAIN JOE CHALLENGE',
            'Build a production-grade platform.',
            'It must contain:',
            ...productAreas.map((area, index) => `${index + 1}. ${area}`),
            'END OF JOE CHALLENGE',
        ].join('\n');
        const recovery = planner.createCompactRecoveryPlanningPrompt(prompt, 'under-scoped', {
            missingTargetNames: ['Area 31'],
        });

        expect(recovery).toContain('R31: Area 31');
        expect(recovery).toContain('between 8 and 8 phases');
        expect(recovery).not.toContain('exactly 6 phases');
        expect(recovery).toContain('including every missing area named by the validator');
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

    it('does not count a documentation-only scaffold as an implementation artifact', () => {
        const assessment = planner.assessPlanScope({
            phases: [{
                name: 'Initial scaffold',
                requirementsCovered: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
                deliverables: ['README.md', 'challenge.txt'],
                tasks: [{
                    task: 'Create initial project notes',
                    tool: 'scaffold_project',
                    args: {
                        structure: {
                            'README.md': '# Plan',
                            'challenge.txt': 'Acceptance notes',
                        },
                    },
                }],
            }],
        }, specification);

        expect(assessment.implementationArtifacts).toBe(0);
        expect(assessment.ok).toBe(false);
    });

    it('counts a scaffold source file as an implementation artifact while ignoring documentation', () => {
        const assessment = planner.assessPlanScope({
            phases: [{
                name: 'Executable scaffold',
                requirementsCovered: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
                deliverables: ['src/index.ts', 'README.md'],
                tasks: [{
                    task: 'Create the first executable source',
                    tool: 'scaffold_project',
                    args: {
                        structure: {
                            'src/index.ts': 'export const ready = true;',
                            'README.md': '# Plan',
                        },
                    },
                }],
            }],
        }, specification);

        expect(assessment.implementationArtifacts).toBe(1);
    });

    it('accepts a discovered reference project as stack evidence without selecting it as the write target', () => {
        const evidence = {
            mode: 'greenfield',
            workspaceRoot: '/tmp/joe-reference-workspace',
            selectedProject: undefined,
            referenceProjects: [{
                root: '/tmp/joe-reference-workspace/reference-app',
                projectKinds: ['node'],
                manifests: [{ path: '/tmp/joe-reference-workspace/reference-app/package.json', kind: 'package.json' }],
                git: { isRepository: true, branch: 'main' },
                likelyEntrypoints: ['/tmp/joe-reference-workspace/reference-app/src/index.ts'],
                candidateChecks: [{ kind: 'test', command: 'npm test', source: '/tmp/joe-reference-workspace/reference-app/package.json' }],
            }],
        };

        expect(planner.hasEvidenceBackedStack(evidence)).toBe(true);
        const shaped = planner.planningEvidence(evidence);
        expect(shaped.selectedProject).toBeUndefined();
        expect(shaped.referenceProjects[0]).toMatchObject({
            root: 'reference-app',
            manifests: [{ path: 'reference-app/package.json', kind: 'package.json' }],
            likelyEntrypoints: ['reference-app/src/index.ts'],
        });
        expect(shaped.referenceProjects[0].candidateChecks).toHaveLength(1);
    });

    it('unwraps a persisted evidence envelope before stack inference', () => {
        const reference = {
            root: '/tmp/joe-reference-workspace/reference-app',
            projectKinds: ['node'],
            manifests: [{ path: '/tmp/joe-reference-workspace/reference-app/package.json', kind: 'package.json' }],
            git: { isRepository: true, branch: 'main' },
            likelyEntrypoints: [],
            candidateChecks: [],
        };
        const wrapped = {
            output: {
                evidence: {
                    mode: 'greenfield',
                    workspaceRoot: '/tmp/joe-reference-workspace',
                    referenceProjects: [reference],
                },
            },
        };

        expect(planner.normaliseEvidence(wrapped)).toMatchObject({
            mode: 'greenfield',
            referenceProjects: [reference],
        });
        expect(planner.hasEvidenceBackedStack(planner.normaliseEvidence(wrapped))).toBe(true);
    });

    it('does not infer a stack from an untyped directory without a manifest', () => {
        expect(planner.hasEvidenceBackedStack({
            mode: 'greenfield',
            workspaceRoot: '/tmp/joe-reference-workspace',
            referenceProjects: [{
                root: '/tmp/joe-reference-workspace/unknown',
                projectKinds: ['other'],
                manifests: [],
                git: { isRepository: false },
                likelyEntrypoints: [],
                candidateChecks: [],
            }],
        })).toBe(false);
    });

    it('accepts an explicit planner stack decision tied to a real scaffold artifact', () => {
        expect(planner.hasPlannerStackDecision({
            projectName: 'nexus',
            phases: [{
                name: 'Architecture and TypeScript stack decision',
                description: 'Choose Node.js and TypeScript for the service runtime.',
                tasks: [{
                    task: 'Create the executable package manifest and source entrypoint',
                    tool: 'scaffold_project',
                    args: { structure: {
                        'package.json': '{"scripts":{"test":"jest"}}',
                        'src/index.ts': 'export const app = true;',
                    } },
                }],
            }],
        })).toBe(true);
    });

    it('rejects a greenfield scaffold with product language but no technical decision', () => {
        expect(planner.hasPlannerStackDecision({
            projectName: 'nexus',
            phases: [{
                name: 'NEXUS foundation',
                description: 'Create the complete platform foundation and dashboard.',
                tasks: [{
                    task: 'Create the initial project',
                    tool: 'scaffold_project',
                    args: { structure: { 'README.md': '# NEXUS' } },
                }],
            }],
        })).toBe(false);
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
