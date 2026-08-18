import { executeTool } from './ToolService';
import path from 'path';
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

function isWithinRoot(candidate: string, root: string): boolean {
  const child = path.resolve(candidate);
  const parent = path.resolve(root);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`);
}

/**
 * File repair tools resolve relative destinations against the workspace. A
 * phase may already have proven a generated child project, however, and a
 * missing-file error such as `scripts/smoke-test.test.mjs` is relative to that
 * project's test cwd. Rebind only file-targeting repairs to the runtime-bound
 * project root; never rewrite shell/npm cwd or allow a `..` target to escape it.
 */
function bindRepairTargetToProjectRoot(repairTool: string, input: Record<string, any>, projectContext: any): Record<string, any> {
  const root = String(projectContext?.projectRoot || '').trim();
  if (!root || projectContext?.projectRootRuntimeBound !== true) return input;

  const key = repairTool === 'write_file'
    ? (typeof input.filename === 'string' && input.filename.trim() ? 'filename' : 'path')
    : repairTool === 'ai_write_file'
      ? 'path'
      : ['file_edit', 'file_edit_advanced'].includes(repairTool)
        ? 'filePath'
        : '';
  if (!key || typeof input[key] !== 'string' || !input[key].trim()) return input;

  const raw = String(input[key]).trim();
  const absolute = path.isAbsolute(raw) || path.win32.isAbsolute(raw);
  let resolved = '';
  try {
    if (absolute) {
      resolved = path.resolve(raw);
    } else {
      // Repair evidence can be emitted either relative to the active workspace
      // (`WeatherGo/src/...`) or relative to the already-bound project root
      // (`src/...`). Once the runtime root is bound, strip one leading project
      // directory segment before resolving; otherwise the safe rebind itself
      // creates the very duplicate path it is meant to prevent:
      // `<workspace>/WeatherGo/WeatherGo/src/...`.
      const portable = raw.replace(/\\/g, '/').replace(/^\.\//u, '');
      const projectName = path.basename(path.resolve(root)).replace(/\\/g, '/');
      const relative = portable === projectName
        ? '.'
        : portable.startsWith(`${projectName}/`)
          ? portable.slice(projectName.length + 1)
          : portable;
      resolved = path.resolve(root, relative);
    }
  } catch {
    return input;
  }
  if (!isWithinRoot(resolved, root)) return input;
  return { ...input, [key]: resolved };
}

export function phaseAfterRepair(phase: any, repairedFile?: unknown): { phase: any; skipped: string[] } {
  const file = normalisePath(repairedFile);
  if (!file || !Array.isArray(phase?.tasks)) return { phase, skipped: [] };

  // An npm dependency repair mutates the manifest in the recorded project cwd.
  // Re-running the greenfield scaffold task would recreate the old manifest and
  // erase the dependency before the verification task gets a chance to prove
  // the cure. Preserve the generated project and rerun only the remaining
  // evidence/build checks. Existing file-target repairs keep their old behavior.
  const manifestRepair = /(?:^|\/)package\.json$/u.test(file);
  const isScaffoldTask = (task: any): boolean => {
    const tool = String(task?.tool || task?.name || '').trim().toLowerCase();
    return manifestRepair && (tool === 'react_project' || tool === 'scaffold_project');
  };

  const skipped: string[] = [];
  const tasks = phase.tasks.filter((task: any) => {
    const matches = taskPaths(task).some((candidate) => pathsReferToSameFile(candidate, file));
    const preserveScaffold = isScaffoldTask(task);
    if (matches || preserveScaffold) {
      skipped.push(String(task.task || task.description || task.tool || 'repaired task'));
    }
    return !matches && !preserveScaffold;
  });

  // A greenfield phase can contain only react_project: the dependency guard
  // may fail while that tool is writing the engine, before planner-added build
  // or launch tasks exist. Re-running the scaffold would overwrite the repaired
  // manifest and recreate the exact failure. When the repaired package.json is
  // absolute, its parent is measured project evidence; replace the scaffold by
  // a bounded build + launch proof against that existing project.
  if (tasks.length === 0 && manifestRepair) {
    const projectRoot = path.isAbsolute(file) ? path.dirname(path.resolve(file)) : '';
    if (projectRoot) {
      return {
        phase: {
          ...phase,
          name: `${String(phase.name || 'Project')} — post-repair verification`,
          tasks: [
            {
              task: 'Build the repaired project without rewriting generated files',
              tool: 'shell_execute',
              command: 'npm run build',
              cwd: projectRoot,
            },
            {
              task: 'Verify the repaired project can start',
              tool: 'project_run',
              cwd: projectRoot,
            },
          ],
        },
        skipped,
      };
    }
  }

  // Never hand an empty phase to the executor: an artifact-only phase still
  // needs a real verification step, and an empty result would be reported as a
  // failure by PhaseExecutorTool. If this was the only task and no bounded
  // project root was evidenced, keep the original phase rather than guessing.
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
    const repairInput = bindRepairTargetToProjectRoot(
      repairTool,
      {
        ...(selfFixPlan.suggestedInput || {}),
        sessionId: executionContext.sessionId,
        workspaceId: executionContext.workspaceId,
      },
      projectContext,
    );
    if (repairInput !== selfFixPlan.suggestedInput && repairInput.path !== selfFixPlan.suggestedInput?.path) {
      executionContext.onProgress?.(`[self-fix:${repairTool}] rebound relative repair target to runtime project root`);
    }

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
      || selfFixPlan.suggestedInput?.filePath
      || (repairTool === 'npm_manager' && typeof repairInput.cwd === 'string' && repairInput.cwd.trim()
        ? path.join(repairInput.cwd.trim(), 'package.json')
        : undefined);
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
