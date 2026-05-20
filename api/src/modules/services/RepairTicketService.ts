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
  failedTasks: Array<{ task: string; tool: string; error: string }>;
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
      failedTasks: failedTasks.slice(0, 5).map((t: any) => ({
        task: truncate(t.task || 'unknown task', 500),
        tool: truncate(t.tool || 'unknown tool', 100),
        error: truncate(t.error || 'failed', 1000),
      })),
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
