import { executeTool } from './ToolService';
import type { SelfFixPlan } from './SelfFixService';
import { repairMemory } from '../../core/memory/repair-memory';

const ALLOWED_SELF_FIX_TOOLS = new Set([
  'write_file',
  'file_edit',
  'file_edit_advanced',
  'ai_write_file',
  'shell_execute',
  'npm_manager',
]);

function normalisePath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function taskPaths(task: any): string[] {
  const args = { ...(task?.args || {}), ...(task?.input || {}) };
  return [args.path, args.filename, args.filePath, args.filepath, args.target]
    .map(normalisePath)
    .filter(Boolean);
}

function pathsReferToSameFile(left: unknown, right: unknown): boolean {
  const a = normalisePath(left);
  const b = normalisePath(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // The repair ticket may contain the workspace-resolved absolute path while
  // the stored plan keeps the same target relative to the workspace. Require a
  // complete path-segment suffix, never a loose substring, before considering
  // the task repaired.
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function phaseAfterRepair(phase: any, repairedFile?: unknown): { phase: any; skipped: string[] } {
  const file = normalisePath(repairedFile);
  if (!file || !Array.isArray(phase?.tasks)) return { phase, skipped: [] };

  const skipped: string[] = [];
  const tasks = phase.tasks.filter((task: any) => {
    const matches = taskPaths(task).some((candidate) => pathsReferToSameFile(candidate, file));
    if (matches) skipped.push(String(task.task || task.description || task.tool || 'repaired task'));
    return !matches;
  });

  // Never hand an empty phase to the executor: an artifact-only phase still
  // needs a real verification step, and an empty result would be reported as a
  // failure by PhaseExecutorTool. If this was the only task, keep it in the
  // phase so the executor can perform the actual post-repair proof.
  if (tasks.length === 0) return { phase, skipped: [] };
  return { phase: tasks.length === phase.tasks.length ? phase : { ...phase, tasks }, skipped };
}

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
    modelConfig?: any;
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

    if (selfFixPlan.maxAttempts !== 1 || selfFixPlan.safety?.runOnlyOnce !== true) {
      return {
        attempted: false,
        allowed: false,
        ok: false,
        reason: 'Unsafe self-fix plan rejected: automatic repair must be limited to exactly one attempt.',
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

    if (!ALLOWED_SELF_FIX_TOOLS.has(selfFixPlan.suggestedTool)) {
      return {
        attempted: false,
        allowed: false,
        ok: false,
        reason: `Self-fix tool rejected by allowlist: ${selfFixPlan.suggestedTool}`,
        repairTool: selfFixPlan.suggestedTool,
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

    const repairedFile = selfFixPlan.suggestedInput?.path
      || selfFixPlan.suggestedInput?.filename
      || selfFixPlan.suggestedInput?.filePath;
    const resumed = phaseAfterRepair(phase, repairedFile);
    if (resumed.skipped.length > 0) {
      executionContext.onProgress?.(`[self-fix:rerun-phase] skipping repaired task(s): ${resumed.skipped.join('; ').slice(0, 800)}`);
    }

    const rerunResult = await executeTool('phase_executor', { phase: resumed.phase, projectContext }, {
      ...executionContext,
      onProgress: (m: string) => executionContext.onProgress?.(`[self-fix:rerun-phase] ${m}`),
    });

    const rerunStatus = String(rerunResult?.output?.status || 'unknown');
    const rerunPassed = !!rerunResult?.ok && rerunStatus === 'completed';

    // The rerun passing is the PROOF the cure worked — the only moment worth
    // remembering. The store is shared with the orchestrator's recovery loop,
    // so a cure learned in either system heals recurrences in both.
    if (rerunPassed) {
      const ticket = selfFixPlan.sourceTicket;
      // primaryError ALONE — the same key shape recall uses. Composite keys
      // (status prefixes, appended task errors) made signatures that never met.
      const errText = String(ticket?.primaryError || '').trim();
      if (errText) {
        const inputHint = JSON.stringify(selfFixPlan.suggestedInput || {}).slice(0, 200);
        repairMemory.recordRepair(errText, `${selfFixPlan.strategy} via ${repairTool} (${inputHint})`)
          .catch((e) => console.warn('[RepairMemory] record failed:', e?.message));
      }
    }

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
