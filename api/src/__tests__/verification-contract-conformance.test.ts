/**
 * SANITIZER/GATE VERIFICATION CONTRACT CONFORMANCE.
 *
 * The phase gate accepts only a narrow checker contract (named checkers,
 * strict test-runner shell invocations, single-path read_file existence
 * observations) and reports anything else as verification_unavailable —
 * after all phase tasks already succeeded. Self-fix cannot repair a contract
 * rejection (no evidence-bound file), so a gate-rejected verification kills
 * the whole pipeline.
 *
 * The plan sanitizer must therefore never EMIT a verification the gate
 * rejects. It previously fell back to a project_detect filler ("Inspect
 * phase output on disk") that the gate is pinned to reject; EVAL-002 phase 1
 * (a discovery phase with no produced outputs) died on exactly this.
 * Ungroundable verifications are now dropped — with the original preserved
 * in verificationNote and a session note — so task-successful phases
 * complete instead of dying on planner bookkeeping.
 */
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { isVerificationTool } from '../core/quality/verification-ledger';

describe('sanitizer emits only gate-accepted verifications', () => {
    const phaseGateAccepts = (tool: string, args: Record<string, unknown>) =>
        isVerificationTool(tool, args, false, true);

    it('rewrites a model-named project_detect check into an output observation when the phase produced files', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Build',
            tasks: [{ task: 'Write entry', tool: 'write_file', args: { path: 'app/index.js', content: 'module.exports = {};' } }],
            verificationTask: { task: 'Inspect output', tool: 'project_detect', args: {} },
        }], 'app', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(phases[0].verificationTask.task).toMatch(/^Verify phase output exists: /);
        expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    });

    it('rewrites a model-named project_detect check into the injected-doc observation for inspection-only phases', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Discovery',
            tasks: [{ task: 'Read module', tool: 'read_file', args: { path: 'existing-app/calc.js' } }],
            verificationTask: { task: 'Inspect output', tool: 'project_detect', args: {} },
        }], 'existing-app', { mode: 'existing', candidateCheckCommands: [], evidencedPaths: ['existing-app/calc.js'] });
        // Inspection-only phases get a documenting write_file task, which
        // anchors a real existence observation — never the project_detect
        // filler the gate rejects.
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(phases[0].verificationTask.task).toMatch(/^Verify phase output exists: /);
        expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    });

    it('rewrites an ungrounded non-checker tool verification instead of passing it to the gate', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Discovery',
            tasks: [{ task: 'Read module', tool: 'read_file', args: { path: 'existing-app/calc.js' } }],
            verificationTask: { task: 'Answer about output', tool: 'central_answer', args: { question: 'what changed?' } },
        }], 'existing-app', { mode: 'existing', candidateCheckCommands: [], evidencedPaths: ['existing-app/calc.js'] });
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args)).toBe(true);
    });

    it('drops an unproven npm test verification with no produced outputs (EVAL-002 discovery shape)', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Architecture Discovery',
            tasks: [
                { task: 'Explore repository structure', tool: 'shell_execute', args: { command: 'find . -type f -name "*.js" | head -20' } },
                { task: 'Examine calculator module', tool: 'shell_execute', args: { command: 'cat calculator.js' } },
            ],
            verificationTask: {
                task: 'Verify baseline tests pass',
                tool: 'shell_execute',
                verificationId: 'eval:baseline-tests',
                verificationMode: 'focused',
                args: { command: 'npm test' },
            },
        }], 'calc', { mode: 'existing', candidateCheckCommands: [] });
        // The checker is real but ungrounded (undeclared, no plan-produced
        // manifest); the phase must complete on its tasks rather than die on
        // a filler the gate rejects.
        expect(phases[0].verificationTask).toBeUndefined();
        expect(phases[0].verificationNote).toMatchObject({ tool: 'shell_execute', args: { command: 'npm test' } });
        expect(notes.join('\n')).toMatch(/npm test/);
    });

    const gateCases: Array<{ name: string; tasks: any[]; verificationTask: any; options?: any }> = [
            {
                name: 'project_detect without outputs',
                tasks: [{ task: 'List', tool: 'shell_execute', args: { command: 'find . -type f' } }],
                verificationTask: { task: 'Inspect', tool: 'project_detect', args: {} },
            },
            {
                name: 'project_detect with outputs',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'a/b.js', content: 'x' } }],
                verificationTask: { task: 'Inspect', tool: 'project_detect', args: {} },
            },
            {
                name: 'non-checker search tool',
                tasks: [{ task: 'List', tool: 'shell_execute', args: { command: 'find . -type f' } }],
                verificationTask: { task: 'Search', tool: 'search_text', args: { query: 'power' } },
            },
            {
                name: 'generator as verification',
                tasks: [{ task: 'List', tool: 'shell_execute', args: { command: 'find . -type f' } }],
                verificationTask: { task: 'Write docs', tool: 'write_file', args: { path: 'docs.md', content: 'x' } },
            },
            {
                name: 'smoke command without checker contract',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'app.js', content: 'x' } }],
                verificationTask: { task: 'Smoke', tool: 'shell_execute', args: { command: 'node app.js < in.txt' } },
            },
            {
                name: 'unproven npm test',
                tasks: [{ task: 'Write doc', tool: 'write_file', args: { path: 'README.md', content: 'x' } }],
                verificationTask: { task: 'Test', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            {
                name: 'declared npm test is kept',
                tasks: [{ task: 'Write doc', tool: 'write_file', args: { path: 'README.md', content: 'x' } }],
                verificationTask: { task: 'Test', tool: 'shell_execute', args: { command: 'npm test' } },
                options: { candidateCheckCommands: ['npm test'] },
            },
            {
                name: 'unproven read is rewritten',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'out.txt', content: 'x' } }],
                verificationTask: { task: 'Read imagined', tool: 'read_file', args: { path: 'imagined.md' } },
            },
            {
                name: 'proven read is kept',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'out.txt', content: 'x' } }],
                verificationTask: { task: 'Read output', tool: 'read_file', args: { path: 'out.txt' } },
            },
            {
                name: 'named checker is kept',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'out.txt', content: 'x' } }],
                verificationTask: { task: 'Quality', tool: 'quality_run', args: { path: '.', tasks: ['test'] } },
            },
            {
                name: 'malformed browser_run is preserved for honest gate reporting',
                tasks: [{ task: 'Write', tool: 'write_file', args: { path: 'out.txt', content: 'x' } }],
                verificationTask: { task: 'Browse', tool: 'browser_run', args: { actions: ['open the screen'] } },
            },
            // project_run is deliberately excluded: the sanitizer pins its
            // preservation for runnable phases (dedicated live-run handling),
            // which the gate contract does not cover. That edge stays open.
    ];

    it.each(gateCases)('gate accepts the emitted verification: $name', (input) => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: input.name,
            tasks: input.tasks,
            verificationTask: input.verificationTask,
        }], 'conformance', { mode: 'greenfield', candidateCheckCommands: [], ...(input.options || {}) });
        const emitted = phases[0].verificationTask;
        if (emitted === undefined) return;
        // The historic killer: a project_detect filler the gate must reject.
        expect(emitted.tool).not.toBe('project_detect');
        expect(phaseGateAccepts(emitted.tool, emitted.args || {})).toBe(true);
    });
});
