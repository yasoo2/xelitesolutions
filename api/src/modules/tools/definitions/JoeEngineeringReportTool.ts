import { BaseTool } from '../base';
import { ToolPermission } from '../types';

function summarizePipeline(pipeline: any) {
  if (!pipeline || typeof pipeline !== 'object') return null;

  const results = Array.isArray(pipeline.results) ? pipeline.results : [];
  return {
    ok: !!pipeline.ok,
    completedPhases: Number(pipeline.completedPhases || 0),
    executedPhases: Number(pipeline.executedPhases || results.length || 0),
    totalPlannedPhases: Number(pipeline.totalPlannedPhases || results.length || 0),
    stoppedEarly: !!pipeline.stoppedEarly,
    phases: results.map((r: any) => ({
      phaseNumber: r.phaseNumber,
      ok: !!r.ok,
      status: r.status || 'unknown',
      selfFixAttempted: !!r.selfFixExecution?.attempted,
      selfFixOk: !!r.selfFixExecution?.ok,
      repairTool: r.selfFixExecution?.repairTool,
      repairReason: r.selfFixExecution?.reason,
      failureCategory: r.repairTicket?.failureCategory,
      primaryError: r.repairTicket?.primaryError || r.error,
    })),
  };
}

function buildMarkdown(report: any) {
  const lines: string[] = [];
  lines.push('# Joe Engineering Execution Report');
  lines.push('');
  lines.push(`Status: ${report.status}`);
  lines.push(`Canonical pipeline: ${report.canonicalPipeline.join(' → ')}`);
  lines.push('');
  lines.push('## Verified capabilities');
  for (const item of report.verifiedCapabilities) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Safety rules');
  for (const item of report.safetyRules) lines.push(`- ${item}`);
  lines.push('');

  if (report.pipelineSummary) {
    const p = report.pipelineSummary;
    lines.push('## Current pipeline summary');
    lines.push(`- Result: ${p.ok ? 'completed' : 'not completed'}`);
    lines.push(`- Completed phases: ${p.completedPhases}/${p.executedPhases}`);
    lines.push(`- Total planned phases: ${p.totalPlannedPhases}`);
    lines.push(`- Stopped early: ${p.stoppedEarly ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('### Phase details');
    for (const phase of p.phases) {
      lines.push(`- Phase ${phase.phaseNumber}: ${phase.status}${phase.selfFixAttempted ? ` | self-fix: ${phase.selfFixOk ? 'succeeded' : 'failed'} via ${phase.repairTool || 'unknown'}` : ''}`);
      if (phase.primaryError && phase.status !== 'completed') lines.push(`  - Error: ${phase.primaryError}`);
      if (phase.repairReason) lines.push(`  - Repair result: ${phase.repairReason}`);
    }
    lines.push('');
  }

  lines.push('## Remaining engineering work');
  for (const item of report.remainingWork) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Required verification suite');
  for (const cmd of report.requiredTests) lines.push(`- ${cmd}`);
  return lines.join('\n');
}

export class JoeEngineeringReportTool extends BaseTool {
  name = 'joe_engineering_report';
  description = 'Return a clear engineering status report for Joe, including canonical pipeline, verified capabilities, safety rules, and optional pipeline execution summary.';
  version = '1.0.0';
  tags = ['joe', 'engineering', 'report', 'observability'];
  inputSchema = {
    type: 'object' as const,
    properties: {
      pipelineResult: { type: 'object' },
      includeMarkdown: { type: 'boolean' },
    },
  };
  outputSchema = {
    type: 'object' as const,
    properties: {
      report: { type: 'object' },
      markdown: { type: 'string' },
    },
  };
  permissions: ToolPermission[] = ['read'];
  sideEffects: ToolPermission[] = [];
  rateLimitPerMinute = 60;
  auditFields = [];
  mockSupported = true;

  async execute(input: any) {
    const pipelineSummary = summarizePipeline(input?.pipelineResult);
    const report = {
      status: pipelineSummary?.ok ? 'pipeline_completed' : 'engineering_infrastructure_ready',
      canonicalPipeline: [
        'ProjectPlannerTool',
        'AgentLoopService',
        'PhaseExecutorTool',
        'ToolService',
        'QualityGate',
        'RepairTicketService',
        'SelfFixService',
        'SelfFixExecutionService',
        'RerunFailedPhase',
      ],
      verifiedCapabilities: [
        'Planner remains planner-only.',
        'AgentLoopService orchestrates planned phases sequentially.',
        'PhaseExecutorTool executes phase tasks through ToolService.',
        'Quality gate requires status === completed, not only ok === true.',
        'RepairTicketService creates diagnostic repair tickets.',
        'SelfFixService creates one-attempt repair plans.',
        'SelfFixExecutionService executes repairs through ToolService and reruns the failed phase.',
        'TypeScript self-fix covers TS2322 string-to-number, TS2322 number-to-string, and TS2304 simple missing-name cases.',
        'ToolService resolves workspace-relative paths with explicit workspace context.',
        'Deterministic full engineer flow E2E test exists via test:joe:engineer-flow.',
      ],
      safetyRules: [
        'One automatic self-fix attempt only.',
        'Unsafe repair tools are rejected by allowlist.',
        'Deploy/delete/secret/production mutation actions require explicit approval and guardrails.',
        'Progression stops on failed, partial, or fatal phases unless controlled self-fix succeeds.',
        'Workspace/user context must come from trusted execution context.',
      ],
      pipelineSummary,
      remainingWork: [
        'Add a less-mocked E2E test to verify real planner quality.',
        'Harden TypeScript/build repair across more error shapes.',
        'Verify ai_write_file behavior before broad build_fix reliance.',
        'Add UI observability for repair tickets, plans, and executions.',
        'Canonicalize browser automation and deployment flows with safety gates.',
      ],
      requiredTests: [
        'npm run guard:architecture',
        'npm run guard:package-scripts',
        'npm run test:joe:engineer-flow',
        'npm run test:self-fix:build-context',
        'npm run test:self-fix:execution-safety',
        'npm run test:self-fix:typescript-repair',
        'npm run test:self-fix:typescript-missing-name',
        'npm run test:self-fix:typescript-number-to-string',
        'npm run test:self-healing:failure',
        'npm run test:self-healing:success',
      ],
    };

    return {
      ok: true,
      output: {
        report,
        markdown: input?.includeMarkdown === false ? undefined : buildMarkdown(report),
      },
      logs: ['joe_engineering_report.generated=1'],
    };
  }
}
