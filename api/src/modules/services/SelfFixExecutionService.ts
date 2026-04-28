import { executeTool } from './ToolService';
import type { SelfFixPlan } from './SelfFixService';

export interface SelfFixExecutionInput {
  phase: any;
  projectContext: any;
  selfFixPlan: SelfFixPlan;
  executionContext: {
    sessionId?: string;
    workspaceId?: string;
    userId?: string;
    onProgress?: (message: string) => void;
    onThought?: (message: string) => void;
  };
}

export interface SelfFixExecutionResult {
  attempted: boolean;
  allowed: boolean;
  ok: boolean;
  reason: string;
  repairTool?: string;
  repairResult?: any;
  rerunResult?: any;
  stopped: boolean;
}

export class SelfFixExecutionService {
  static async executeOnce(input: SelfFixExecutionInput): Promise<SelfFixExecutionResult> {
    const { phase, projectContext, selfFixPlan, executionContext } = input;

    if (!selfFixPlan?.allowed) {
      return {
        attempted: false,
        allowed: false,
        ok: false,
        reason: selfFixPlan?.reason || 'Self-fix is not allowed for this failure.',
        stopped: true,
      };
    }

    if (!selfFixPlan.suggestedTool) {
      return {
        attempted: false,
        allowed: true,
        ok: false,
        reason: 'Self-fix plan did not provide a safe suggestedTool.',
        stopped: true,
      };
    }

    if (!executionContext?.sessionId || !executionContext?.workspaceId || !executionContext?.userId) {
      return {
        attempted: false,
        allowed: true,
        ok: false,
        reason: 'Missing trusted execution context for self-fix.',
        stopped: true,
      };
    }

    const repairTool = selfFixPlan.suggestedTool;
    const repairInput = {
      ...(selfFixPlan.suggestedInput || {}),
      sessionId: executionContext.sessionId,
      workspaceId: executionContext.workspaceId,
    };

    const repairResult = await executeTool(repairTool, repairInput, {
      ...executionContext,
      onProgress: (m: string) => executionContext.onProgress?.(`[self-fix:${repairTool}] ${m}`),
    });

    if (!repairResult?.ok) {
      return {
        attempted: true,
        allowed: true,
        ok: false,
        reason: `Self-fix tool failed: ${String(repairResult?.error || 'unknown error')}`,
        repairTool,
        repairResult,
        stopped: true,
      };
    }

    const rerunResult = await executeTool('phase_executor', { phase, projectContext }, {
      ...executionContext,
      onProgress: (m: string) => executionContext.onProgress?.(`[self-fix:rerun-phase] ${m}`),
    });

    const rerunStatus = String(rerunResult?.output?.status || 'unknown');
    const rerunPassed = !!rerunResult?.ok && rerunStatus === 'completed';

    return {
      attempted: true,
      allowed: true,
      ok: rerunPassed,
      reason: rerunPassed
        ? 'Self-fix succeeded and failed phase completed after rerun.'
        : `Self-fix did not complete the failed phase after rerun. Status: ${rerunStatus}`,
      repairTool,
      repairResult,
      rerunResult,
      stopped: !rerunPassed,
    };
  }
}
