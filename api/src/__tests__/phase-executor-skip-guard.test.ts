jest.mock('../modules/services/ToolService', () => ({
  executeTool: jest.fn(async (toolName: string) => ({
    ok: true,
    output: { message: `mock executed ${toolName}` },
  })),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

type AnyRecord = Record<string, any>;

const projectContext = {
  projectName: 'phase-status-probe',
  workspaceId: 'phase-status-workspace',
  sessionId: 'phase-status-session',
  userId: 'phase-status-user',
};

const argsSkippedTask = (task: string): AnyRecord => ({
  task,
  tool: 'ai_write_file',
  args: {
    path: 'node npm',
    description: task,
  },
});

const runPhase = (tasks: AnyRecord[], verificationTask?: AnyRecord) => new PhaseExecutorTool().execute({
  phase: {
    phaseNumber: 2,
    name: 'Status probe',
    tasks,
    ...(verificationTask ? { verificationTask } : {}),
  },
  projectContext,
}, projectContext);

describe('phase status reports executed work separately from skipped work', () => {
  it('does not call three skipped generation tasks completed or verified', async () => {
    const result: any = await runPhase([
      argsSkippedTask('First invalid generated-file task'),
      argsSkippedTask('Second invalid generated-file task'),
      argsSkippedTask('Third invalid generated-file task'),
    ], { tool: 'project_detect', task: 'Verify phase output', args: {} });
    expect(result.ok).toBe(false);
    expect(result.output.status).toBe('skipped');
    expect(result.output.completedTasks).toBe(0);
    expect(result.output.totalTasks).toBe(3);
    expect(result.output.results).toHaveLength(3);
    expect(result.output.results.every((entry: AnyRecord) => entry.execution === 'skipped')).toBe(true);
    expect(result.logs.some((line: string) => line.includes('0/3 executed · 3 skipped'))).toBe(true);
    expect(result.logs.some((line: string) => line.includes('Verification passed for Phase'))).toBe(false);
  });

  it('keeps a phase with executed work completed and verified on the existing surface', async () => {
    const result: any = await runPhase([
      { task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } },
    ], { tool: 'project_detect', task: 'Verify phase output', args: {} });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('completed');
    expect(result.output.completedTasks).toBe(1);
    expect(result.logs.some((line: string) => line.includes('1/1 executed · 0 skipped') || line.includes('completed: 1/1 tasks completed'))).toBe(true);
    expect(result.logs.some((line: string) => line.includes('Verification passed for Phase'))).toBe(true);
  });

  it('reports mixed executed and skipped work as neither completed nor failed', async () => {
    const result: any = await runPhase([
      { task: 'Run the real phase task', tool: 'echo', args: { message: 'ran' } },
      argsSkippedTask('Create a second file'),
    ]);

    expect(result.ok).toBe(true);
    expect(result.output.status).not.toBe('completed');
    expect(result.output.status).not.toBe('failed');
    expect(result.output.completedTasks).toBe(1);
    expect(result.output.results.filter((entry: AnyRecord) => entry.execution === 'ran')).toHaveLength(1);
    expect(result.output.results.filter((entry: AnyRecord) => entry.execution === 'skipped')).toHaveLength(1);
    expect(result.logs.some((line: string) => line.includes('1/2 executed · 1 skipped'))).toBe(true);
  });
});
