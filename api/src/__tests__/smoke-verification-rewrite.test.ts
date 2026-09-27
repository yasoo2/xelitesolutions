/**
 * THE SMOKE CHECK THAT KILLED THE BUILD BEFORE THE TESTS RAN.
 *
 * CRITICAL-REAL-JOE-UI-001 run 4b (taglines CLI, real Joe UI, fresh unseen
 * prompt): the planner emitted `node index.js < sample.txt` as the Implement
 * phase verification — a legitimate runtime smoke run of the program it had
 * just written. The plan sanitizer trusted it (it is not an unproven
 * package-script check), but the phase gate only accepts test-runner
 * invocations as shell_execute verifications, so the run died at 1/4 with
 * verification_unavailable — before the test-writing and test-running phases
 * ever executed. Independent artifact checks showed the run-4b deliverable
 * itself fell short (missing taglines.js entrypoint, redirected-stdin --count
 * exited 3, and npm test ran zero assertions) -- so this rewrite only unblocks
 * execution toward the genuine test phases; it is intermediate evidence,
 * never final acceptance.
 *
 * The sanitizer and the gate must agree on what a shell verification is. A
 * mid-phase smoke command that is neither a recognized checker contract nor a
 * package-script check is rewritten into the same output-existence observation
 * used for other unverifiable checkers, so execution continues to the genuine
 * test phases. Final delivery gates stay strict: a read must never count as
 * final evidence.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

describe('smoke verification without a checker contract', () => {
    const smokePhases = (command: string) => ([
        {
            phaseNumber: 1,
            name: 'Project Setup',
            tasks: [{
                task: 'Initialize project',
                tool: 'scaffold_project',
                args: {
                    baseDir: 'taglines',
                    structure: {
                        'package.json': '{"name":"taglines","scripts":{"test":"node test.js"}}',
                        'index.js': '// entry',
                        'sample.txt': 'Line 1',
                    },
                },
            }],
        },
        {
            phaseNumber: 2,
            name: 'Implement Core Functionality',
            tasks: [{
                task: 'Write main application file',
                tool: 'ai_write_file',
                args: { path: 'taglines/index.js', description: 'cli entry' },
            }],
            verificationTask: { task: 'Verify core functionality', tool: 'shell_execute', args: { command, cwd: 'taglines' } },
        },
    ]);

    it('rewrites a runtime smoke verification into an output-existence observation', () => {
        const { phases, notes } = sanitisePlanPhases(smokePhases('node index.js < sample.txt'), 'taglines', {
            mode: 'greenfield',
            candidateCheckCommands: [],
        });
        const verification = phases[1].verificationTask;
        expect(verification.tool).toBe('read_file');
        expect(verification.task).toMatch(/^Verify phase output exists: /);
        expect(notes.join('\n')).toContain('الأمر المسقط');
        expect(notes.join('\n')).toContain('node index.js < sample.txt');
    });

    it('rewrites other non-checker shell shapes (cd chains, direct node runs)', () => {
        for (const command of ['cd taglines && npm test', 'node test.js', 'npm --prefix taglines test']) {
            const { phases } = sanitisePlanPhases(smokePhases(command), 'taglines', {
                mode: 'greenfield',
                candidateCheckCommands: [],
            });
            expect(phases[1].verificationTask.tool).not.toBe('shell_execute');
        }
    });

    it('keeps a genuine npm test verification when the plan produced the manifest', () => {
        const { phases } = sanitisePlanPhases(smokePhases('npm test'), 'taglines', {
            mode: 'greenfield',
            candidateCheckCommands: [],
        });
        expect(phases[1].verificationTask.tool).toBe('shell_execute');
        expect(phases[1].verificationTask).toMatchObject({ args: { command: 'npm test' } });
    });

    it('keeps the unproven package-script path on project_detect (no manifest produced)', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Docs only',
            tasks: [{ task: 'Write doc', tool: 'write_file', args: { path: 'taglines/README.md', content: '# hi' } }],
            verificationTask: { task: 'Run tests', tool: 'shell_execute', args: { command: 'npm test' } },
        }], 'taglines', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(phases[0].verificationTask.tool).toBe('project_detect');
    });

    it('observes the generated doc when a non-file phase is documented', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Research',
            tasks: [{ task: 'Think', tool: 'central_answer', args: { question: 'x' } }],
            verificationTask: { task: 'Verify', tool: 'shell_execute', args: { command: 'node app.js < in.txt' } },
        }], 'taglines', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(phases[0].verificationTask.task).toMatch(new RegExp("^Verify phase output exists: "));
    });
});
