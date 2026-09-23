import { isVerificationTool } from './verification-ledger';

export function frontendFinalCheck() {
    return {
        task: 'Run the generated project quality scripts and report checks that are unavailable.',
        tool: 'quality_run',
        args: { tasks: ['lint', 'typecheck', 'test', 'build'] },
        verificationId: 'frontend:final-quality',
        verificationMode: 'final',
    };
}

/** Apply after every plan replacement, including deterministic rescue. */
export function ensurePlanFinalVerification(plan: any): any {
    const phases = Array.isArray(plan?.phases) ? plan.phases.map((phase: any) => ({ ...phase })) : [];
    const buildsReact = phases.some((phase: any) => Array.isArray(phase.tasks)
        && phase.tasks.some((task: any) => task?.tool === 'react_project'));
    if (!buildsReact || plan.blocker || plan.deliveryStatus === 'blocked') return { ...plan, phases };
    const finalPhase = phases[phases.length - 1];
    const check = finalPhase.verificationTask;
    if (check && typeof check === 'object' && typeof check.tool === 'string'
        && isVerificationTool(check.tool, { ...check.args, ...check.input })) {
        finalPhase.verificationTask = {
            ...check,
            verificationId: check.verificationId || check.args?.verificationId || check.input?.verificationId || 'project:final-verification',
            verificationMode: 'final',
        };
    } else {
        if (check) finalPhase.verificationNote = check;
        finalPhase.verificationTask = frontendFinalCheck();
    }
    return { ...plan, phases, requireFinalVerification: true };
}
