import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

describe('prose verificationTask normalization (regression for CRITICAL-REAL-JOE-UI-001)', () => {
    it('normalizes a plain-string verificationTask to read_file when observed output exists', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Write file', tool: 'ai_write_file', args: { path: 'src/test.ts', description: 'Test file' }, priority: 'high', realisticMinutes: 10 },
                    ],
                    verificationTask: 'Verify the test file exists and works',
                    deliverables: ['src/test.ts'],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        expect(result.phases[0].verificationTask).toBeDefined();
        expect(typeof result.phases[0].verificationTask).toBe('object');
        expect(result.phases[0].verificationTask.tool).toBe('read_file');
        expect(result.phases[0].verificationTask.args.path).toBe('src/test.ts');
        expect(result.phases[0].verificationNote).toBe('Verify the test file exists and works');
    });

    it('normalizes a plain-string verificationTask to read_file of documentation when phase has only inspection tasks', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Read config', tool: 'read_file', args: { path: 'config.json' }, priority: 'high', realisticMinutes: 5 },
                    ],
                    verificationTask: 'Check the project structure',
                    deliverables: [],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        // Phase with only read_file gets a documentation write_file task, which becomes the observed output
        expect(result.phases[0].verificationTask).toBeDefined();
        expect(typeof result.phases[0].verificationTask).toBe('object');
        expect(result.phases[0].verificationTask.tool).toBe('read_file');
        expect(result.phases[0].verificationTask.args.path).toMatch(/docs\/.*\.md$/);
        expect(result.phases[0].verificationNote).toBe('Check the project structure');
    });

    it('preserves structured verificationTask with valid tool', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Write file', tool: 'ai_write_file', args: { path: 'src/test.ts', description: 'Test file' }, priority: 'high', realisticMinutes: 10 },
                    ],
                    verificationTask: { tool: 'read_file', args: { path: 'src/test.ts' } },
                    deliverables: ['src/test.ts'],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        // Eval round 9 (2026-10-23): probed end to end, a structured read_file
        // verification with no prose origin fails the real phase gate with
        // «unsupported verification tool contract». It is removed, not preserved.
        expect(result.phases[0].verificationTask).toBeUndefined();
        expect(result.phases[0].verificationNote).toBeUndefined();
        expect(result.notes.join('\n')).toMatch(/أزلتُ تحقق «read_file»/);
    });

    it('rejects invalid structured verificationTask rather than handing the gate one it refuses', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Write file', tool: 'ai_write_file', args: { path: 'src/test.ts', description: 'Test file' }, priority: 'high', realisticMinutes: 10 },
                    ],
                    verificationTask: { tool: 'invalid_tool', args: {} },
                    deliverables: ['src/test.ts'],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        // Formerly rewritten into a structured read_file, which the real gate refuses.
        expect(result.phases[0].verificationTask).toBeUndefined();
        expect(result.phases[0].verificationNote).toBeUndefined();
    });

    it('normalizes empty string verificationTask to undefined', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Write file', tool: 'ai_write_file', args: { path: 'src/test.ts', description: 'Test file' }, priority: 'high', realisticMinutes: 10 },
                    ],
                    verificationTask: '',
                    deliverables: ['src/test.ts'],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        expect(result.phases[0].verificationTask).toBeUndefined();
        expect(result.phases[0].verificationNote).toBeUndefined();
    });

    it('handles undefined verificationTask gracefully', () => {
        const rawPlan = {
            projectName: 'test',
            projectVibe: 'test',
            totalPhases: 1,
            estimatedDuration: '10 minutes',
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Test Phase',
                    description: 'Test phase',
                    tasks: [
                        { task: 'Write file', tool: 'ai_write_file', args: { path: 'src/test.ts', description: 'Test file' }, priority: 'high', realisticMinutes: 10 },
                    ],
                    deliverables: ['src/test.ts'],
                    estimatedTime: '10 minutes',
                },
            ],
            dependencies: [],
        };

        const result = sanitisePlanPhases(rawPlan.phases, '', { mode: 'greenfield' });

        expect(result.phases[0].verificationTask).toBeUndefined();
        expect(result.phases[0].verificationNote).toBeUndefined();
    });
});