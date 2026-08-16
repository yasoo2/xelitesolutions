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

function inferSeverity(status: string, error: string): RepairTicketSeverity {
  const s = `${status} ${error}`.toLowerCase();
  if (/unauthorized|forbidden|permission|secret|token|credential|outside_workspace|path_outside/i.test(s)) return 'critical';
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

    const primaryError = truncate(
      phaseResult?.error ||
      failedTasks[0]?.error ||
      phaseResult?.output?.error ||
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
            : typeof t?.output?.cwd === 'string' ? t.output.cwd : undefined;
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
