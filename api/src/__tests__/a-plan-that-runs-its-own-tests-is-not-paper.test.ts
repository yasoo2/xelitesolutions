import { planTouchesRunnable } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * Round 15: the plan-recovery repair turns «npm test» / «npm run build» into
 * quality_run, which runs the project's own scripts. The all-paper check did
 * not count quality_run, so a plan that writes its files and runs its own
 * tests was still judged paper and replaced by the deterministic rescue.
 */
describe('a plan that runs its own tests is not paper', () => {
    const write = (path: string) => ({ tool: 'ai_write_file', args: { path, description: 'x' } });

    it('ai_write_file tasks plus a quality_run test verification touch something runnable', () => {
        const phases = [
            { name: 'Service', tasks: [write('server.js'), write('package.json')] },
            { name: 'Tests', tasks: [write('tests/patients.test.js')], verificationTask: { tool: 'quality_run', args: { tasks: ['test'] } } },
        ];
        expect(planTouchesRunnable(phases)).toBe(true);
    });

    it('a quality_run task counts too', () => {
        expect(planTouchesRunnable([{ tasks: [write('app.py'), { tool: 'quality_run', args: { tasks: ['build'] } }] }])).toBe(true);
    });

    it('files only — or files checked only by a browser step — are still paper', () => {
        expect(planTouchesRunnable([{ tasks: [write('a.ts'), write('b.ts')], verificationTask: { tool: 'project_detect', args: {} } }])).toBe(false);
        expect(planTouchesRunnable([{ tasks: [write('index.html')], verificationTask: { tool: 'browser_run', args: { instructionText: 'open it' } } }])).toBe(false);
        expect(planTouchesRunnable([])).toBe(false);
        expect(planTouchesRunnable(undefined)).toBe(false);
    });
});
