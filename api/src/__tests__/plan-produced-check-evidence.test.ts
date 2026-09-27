/**
 * THE GREENFIELD TESTS THAT NEVER RAN.
 *
 * CRITICAL-REAL-JOE-UI-001 run 3 (linecount CLI, real Joe UI): the planner
 * emitted `npm test` as the Implement-phase verification and as a "Run final
 * tests" task. The sanitizer dropped both because `npm test` was "not a
 * declared check in the discovered project files" — but discovery runs before
 * a greenfield build exists, so NOTHING could ever be declared. The
 * verification was replaced with the project_detect fallback, the phase gate
 * rejected that contract, and the run died at 1/3 with
 * verification_unavailable — without ever running the project's own tests
 * (which were broken: mocha-style describe with no mocha installed).
 *
 * A plan that produces its own Node manifest is not assuming a project: it is
 * declaring one. Package-script checks against a plan-produced manifest must
 * survive planning so execution failures stay honest product feedback.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

describe('plan-produced manifests prove package-script checks', () => {
    const manifestPhases = () => ([
        {
            phaseNumber: 1,
            name: 'Project Setup',
            tasks: [{
                task: 'Create project directory and initial files',
                tool: 'scaffold_project',
                args: {
                    baseDir: 'linecount',
                    structure: {
                        'package.json': '{"name":"linecount","scripts":{"test":"node test.js"}}',
                        'linecount.js': '// cli entry',
                    },
                },
            }],
        },
        {
            phaseNumber: 2,
            name: 'Implement Core Functionality',
            tasks: [{
                task: 'Write test script',
                tool: 'ai_write_file',
                args: { path: 'linecount/test.js', description: 'node test script' },
            }],
            verificationTask: { task: 'Run project tests', tool: 'shell_execute', args: { command: 'npm test' } },
        },
        {
            phaseNumber: 3,
            name: 'Run final tests',
            tasks: [{ task: 'Run final tests', tool: 'shell_execute', args: { command: 'npm test' } }],
        },
    ]);

    it('keeps an npm test verification when an earlier phase scaffolded the manifest', () => {
        const { phases } = sanitisePlanPhases(manifestPhases(), 'linecount', {
            mode: 'greenfield',
            candidateCheckCommands: [],
        });
        expect(phases[1].verificationTask.tool).toBe('shell_execute');
        expect(phases[1].verificationTask).toMatchObject({ args: { command: 'npm test' } });
    });

    it('keeps an npm test task when the manifest comes from the plan itself', () => {
        const { phases } = sanitisePlanPhases(manifestPhases(), 'linecount', {
            mode: 'greenfield',
            candidateCheckCommands: [],
        });
        expect(phases[2].tasks.some((task: any) =>
            task.tool === 'shell_execute' && task.args?.command === 'npm test')).toBe(true);
    });

    it('still drops npm test when the plan produces no manifest', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Docs only',
            tasks: [{ task: 'Write doc', tool: 'write_file', args: { path: 'linecount/README.md', content: '# hi' } }],
            verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
        }], 'linecount', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(phases[0].tasks.some((task: any) =>
            task.tool === 'shell_execute' && task.args?.command === 'npm test')).toBe(false);
        expect(phases[0].verificationTask.tool).toBe('project_detect');
    });

    it('does not let discovery-evidenced manifests prove the check (existing projects unchanged)', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Verify',
            tasks: [{ task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } }],
        }], 'existing-app', {
            mode: 'existing',
            candidateCheckCommands: [],
            evidencedPaths: ['existing-app/package.json'],
        });
        expect(phases[0].tasks.some((task: any) => task.tool === 'shell_execute')).toBe(false);
    });
});
