export type RepairTicketSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RepairTicketInput {
  projectName?: string;
  phase?: any;
  phaseIndex?: number;
  phaseStatus?: string;
  phaseResult?: any;
  runId?: string;
  sessionId?: string;
  workspaceId?: string;
}

export interface RepairTicket {
  type: 'phase_repair_ticket';
  projectName: string;
  phaseNumber: number;
  phaseName: string;
  status: string;
  severity: RepairTicketSeverity;
  primaryError: string;
  failedTasks: Array<{
    task: string;
    tool: string;
    error: string;
    /** Sanitised execution evidence; never carries session or credential fields. */
    command?: string;
    cwd?: string;
    background?: boolean;
    /** Evidence for deterministic file editors, preserved for safe recovery. */
    file?: string;
    find?: string;
    replace?: string;
    /** Original generation brief/context for bounded ai_write_file recovery. */
    description?: string;
    artifactContext?: string;
  }>;
  suggestedNextAction: string;
  retryPolicy: {
    maxRepairAttempts: number;
    continueOnlyIfPhaseStatusBecomes: 'completed';
  };
  context: {
    runId?: string;
    sessionId?: string;
    workspaceId?: string;
  };
  createdAt: string;
}

function truncate(value: unknown, max = 1000) {
  return String(value ?? '').slice(0, max);
}

/**
 * Keep the semantic brief needed to regenerate one failed artifact, while
 * removing credential-shaped values before the brief enters a repair ticket.
 */
function repairEvidence(value: unknown, max = 5000) {
  return truncate(value, max)
    .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/giu, '$1: [REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_-]{16,})/gu, '[REDACTED]');
}

function inferSeverity(status: string, error: string): RepairTicketSeverity {
  const s = `${status} ${error}`.toLowerCase();
  const isLocalImportContext = /unresolved_local_import/i.test(s);
  const explicitSecurityEvidence = /\bunauthorized\b|\bforbidden\b|\bsecret\b|\btoken\b|\bcredential\b|\boutside_workspace\b|\bpath_outside\b/i.test(s);
  const permissionEvidence = /permission/i.test(s);
  // A stale permission-like status must not outrank deterministic evidence
  // that a generated source file references a missing local asset. Explicit
  // security/path violations remain critical even when another error is present.
  if (explicitSecurityEvidence || (!isLocalImportContext && permissionEvidence)) return 'critical';
  if (/build failed|compile|syntax|typeerror|cannot find module|missing dependency/i.test(s)) return 'high';
  if (/partial|timeout|network|rate_limited/i.test(s)) return 'medium';
  return 'low';
}

export class RepairTicketService {
  static build(input: RepairTicketInput): RepairTicket {
    const phase = input.phase || {};
    const phaseResult = input.phaseResult || {};
    const status = truncate(input.phaseStatus || phaseResult?.output?.status || 'unknown', 100);
    const failedTasks = Array.isArray(phaseResult?.output?.results)
      ? phaseResult.output.results.filter((r: any) => r && r.ok === false)
      : [];

    // The failed task is the narrowest evidence boundary. Some phase
    // adapters put a mixed stdout/log transcript in phaseResult.error; using
    // that transcript for severity lets unrelated words such as `token` or
    // `credential` turn a deterministic local-import repair into a critical
    // security stop. Classify the normalized task error first, and only fall
    // back to phase-level fields when no failed task carried an error.
    const primaryError = truncate(
      failedTasks.find((task: any) => String(task?.error || '').trim())?.error ||
      phaseResult?.output?.error ||
      phaseResult?.error ||
      `Phase ended with status ${status}`,
      2000,
    );

    return {
      type: 'phase_repair_ticket',
      projectName: truncate(input.projectName || 'Planned Project', 200),
      phaseNumber: Number(phase?.phaseNumber || (typeof input.phaseIndex === 'number' ? input.phaseIndex + 1 : 1)),
      phaseName: truncate(phase?.name || `Phase ${typeof input.phaseIndex === 'number' ? input.phaseIndex + 1 : 1}`, 300),
      status,
      severity: inferSeverity(status, primaryError),
      primaryError,
      failedTasks: failedTasks.slice(0, 5).map((t: any) => {
        const rawArgs = t?.args && typeof t.args === 'object'
          ? t.args
          : t?.input && typeof t.input === 'object'
            ? t.input
            : {};
        const command = typeof t?.command === 'string'
          ? t.command
          : typeof rawArgs.command === 'string' ? rawArgs.command : undefined;
        const cwd = typeof t?.cwd === 'string'
          ? t.cwd
          : typeof rawArgs.cwd === 'string'
            ? rawArgs.cwd
            : typeof rawArgs.projectPath === 'string'
              ? rawArgs.projectPath
              : typeof t?.output?.cwd === 'string'
                ? t.output.cwd
                : typeof t?.output?.projectPath === 'string' ? t.output.projectPath : undefined;
        const background = typeof t?.background === 'boolean'
          ? t.background
          : typeof rawArgs.background === 'boolean' ? rawArgs.background : undefined;
        const file = typeof t?.file === 'string'
          ? t.file
          : typeof rawArgs.filename === 'string'
            ? rawArgs.filename
            : typeof rawArgs.filePath === 'string'
              ? rawArgs.filePath
              : typeof rawArgs.path === 'string' ? rawArgs.path : undefined;
        const find = typeof t?.find === 'string'
          ? t.find
          : typeof rawArgs.find === 'string'
            ? rawArgs.find
            : typeof rawArgs.search === 'string'
              ? rawArgs.search
              : typeof rawArgs.old_string === 'string' ? rawArgs.old_string : undefined;
        const replace = typeof t?.replace === 'string'
          ? t.replace
          : typeof rawArgs.replace === 'string'
            ? rawArgs.replace
            : typeof rawArgs.new_string === 'string' ? rawArgs.new_string : undefined;
        const description = typeof t?.description === 'string'
          ? repairEvidence(t.description, 6000)
          : typeof rawArgs.description === 'string'
            ? repairEvidence(rawArgs.description, 6000)
            : undefined;
        const artifactContext = typeof t?.artifactContext === 'string'
          ? repairEvidence(t.artifactContext, 6000)
          : typeof rawArgs.context === 'string'
            ? repairEvidence(rawArgs.context, 6000)
            : undefined;
        return {
          task: truncate(t.task || 'unknown task', 500),
          tool: truncate(t.tool || 'unknown tool', 100),
          error: truncate(t.error || 'failed', 1000),
          ...(command ? { command: truncate(command, 1000) } : {}),
          ...(cwd ? { cwd: truncate(cwd, 1000) } : {}),
          ...(typeof background === 'boolean' ? { background } : {}),
          ...(file ? { file: truncate(file, 1000) } : {}),
          ...(find ? { find: truncate(find, 4000) } : {}),
          ...(replace !== undefined ? { replace: truncate(replace, 4000) } : {}),
          ...(description ? { description } : {}),
          ...(artifactContext ? { artifactContext } : {}),
        };
      }),
      suggestedNextAction: 'Run one controlled repair pass, then re-run the failed phase and continue only if it becomes completed.',
      retryPolicy: {
        maxRepairAttempts: 1,
        continueOnlyIfPhaseStatusBecomes: 'completed',
      },
      context: {
        runId: input.runId,
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
      },
      createdAt: new Date().toISOString(),
    };
  }
}
