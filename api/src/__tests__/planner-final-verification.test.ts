import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';
import { ensurePlanFinalVerification } from '../core/quality/plan-verification';

const normalize = (plan: any) => (new ProjectPlannerTool() as any).validatePlan(plan, 'User request');
const frontendPlan = () => ({ totalPhases: 1, phases: [{ phaseNumber: 1, tasks: [{ tool: 'react_project', args: { request: 'User request' } }] }] });

describe('final verification across planner sources', () => {
    it.each(['read_file', 'write_file', 'project_detect', 'unregistered_checker'])('does not promote %s into a final quality gate', tool => {
        const input: any = frontendPlan();
        input.phases[0].verificationTask = { tool, args: { path: 'package.json' } };
        const result = ensurePlanFinalVerification(input);
        expect(result.phases[0].verificationTask.tool).toBe('quality_run');
    });
    it('adds the gate to the actual deterministic rescue used by the live checkout run', () => {
        const rescued = deterministicPhasesFor('Create a small browser-based library checkout board in a new local project. It needs title, borrower, due date, a returned toggle, filtering, validation, local persistence, and a responsive layout. Use focused checks while editing, then one final full verification. Report which checks ran and which were reused. Open and inspect the result in the browser. Do not deploy anything.');
        expect(rescued?.phases[0].name).toBe('Application');
        const accepted = ensurePlanFinalVerification(rescued);
        expect(accepted.requireFinalVerification).toBe(true);
        expect(accepted.phases.at(-1).verificationTask).toMatchObject({
            tool: 'quality_run', verificationId: 'frontend:final-quality', verificationMode: 'final',
        });
    });
    it('adds the final gate to a model-produced builder plan without guessing a path', () => {
        const input = frontendPlan();
        const result = normalize(input);
        expect(result.requireFinalVerification).toBe(true);
        expect(result.phases[0].verificationTask).toMatchObject({ tool: 'quality_run', verificationMode: 'final' });
        expect(result.phases[0].verificationTask.args.path).toBeUndefined();
        expect((input.phases[0] as any).verificationTask).toBeUndefined();
        expect(normalize(result)).toEqual(result);
    });
    it('preserves a human-readable verification note and adds executable verification', () => {
        const input: any = frontendPlan();
        input.phases[0].verificationTask = 'Inspect the requested form and run available checks';
        const result = normalize(input);
        expect(result.phases[0].verificationNote).toBe(input.phases[0].verificationTask);
        expect(result.phases[0].verificationTask.tool).toBe('quality_run');
    });
    it('preserves an explicit checker and its identity and arguments', () => {
        const input: any = frontendPlan();
        input.phases[0].verificationTask = { tool: 'browser_run', args: { url: 'http://localhost:4300', verificationId: 'user-gate' } };
        const result = normalize(input);
        expect(result.phases[0].verificationTask).toMatchObject({
            tool: 'browser_run', verificationMode: 'final', verificationId: 'user-gate',
            args: input.phases[0].verificationTask.args,
        });
    });
    it('does not invent frontend checks for blocked or unrelated plans', () => {
        expect(normalize({ ...frontendPlan(), blocker: { code: 'missing-evidence' } }).requireFinalVerification).toBeUndefined();
        expect(normalize({ phases: [{ tasks: [{ tool: 'read_file' }] }] }).requireFinalVerification).toBeUndefined();
    });
});
