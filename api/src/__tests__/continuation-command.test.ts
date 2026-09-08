import {
  continuationExecutionGoal,
  findInterruptedContinuation,
  isContinuationCommand,
  recoverInterruptedProjectName,
  recoverInterruptedProjectRoot,
} from '../core/resume/continuation-command';

const run = (status: string, type = 'run_interrupted') => ({
  runId: 'run-previous', sessionId: 'session-a', status,
  startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:01:00.000Z',
  events: [{ type }],
});

describe('session continuation commands', () => {
  test.each(['Continue', 'complete', 'أكمل', 'كمل', 'continuer', 'reanuda', 'weiter', 'продолжай', '继续', '続けて', '계속해', 'जारी रखो'])('%s is recognized', value => {
    expect(isContinuationCommand(value)).toBe(true);
  });

  test('does not reinterpret a substantive new request as a continuation command', () => {
    expect(isContinuationCommand('Continue building a different project')).toBe(false);
  });

  test('restores the last substantive request only for proven interrupted work', () => {
    const result = findInterruptedContinuation('Continue', [run('interrupted')], [
      { role: 'user', content: 'Build the weather comparison app' },
      { role: 'assistant', content: 'The run was interrupted' },
      { role: 'user', content: 'Continue' },
    ]);
    expect(result).toEqual({ goal: 'Build the weather comparison app', runId: 'run-previous' });
  });

  test('recovers the scaffolded project identity from interrupted run evidence', () => {
    const interrupted = {
      ...run('interrupted'),
      events: [{ type: 'terminal_output', data: 'react_project: scaffolded 12 files in C:\\work\\react-weather-abc123 — design family: bold' }],
    };
    expect(recoverInterruptedProjectRoot(interrupted)).toBe('C:\\work\\react-weather-abc123');
    expect(recoverInterruptedProjectName(interrupted)).toBe('react-weather-abc123');
    expect(findInterruptedContinuation('Continue', [interrupted], [
      { role: 'user', content: 'Build the weather comparison app' },
    ])).toMatchObject({ projectName: 'react-weather-abc123', projectRoot: 'C:\\work\\react-weather-abc123' });
  });

  test('accepts a user-stopped failed run but rejects an ordinary completed or failed run', () => {
    expect(findInterruptedContinuation('Continue', [run('failed', 'run_cancelled')], [{ role: 'user', content: 'Build it' }])).not.toBeNull();
    expect(findInterruptedContinuation('Continue', [run('failed', 'tool_failed')], [{ role: 'user', content: 'Build it' }])).toBeNull();
    expect(findInterruptedContinuation('Continue', [run('done')], [{ role: 'user', content: 'Build it' }])).toBeNull();
  });

  test('keeps the original restart-interrupted project ahead of a later cancelled resume attempt', () => {
    const original = {
      ...run('interrupted'),
      runId: 'run-origin',
      updatedAt: '2026-01-01T00:01:00.000Z',
      events: [{ type: 'terminal_output', data: 'react_project: scaffolded 12 files in C:\\work\\weather-right — bold' }],
    };
    const cancelledResume = {
      ...run('failed', 'run_cancelled'),
      runId: 'run-resume',
      updatedAt: '2026-01-01T00:03:00.000Z',
      events: [{ type: 'terminal_output', data: 'C:\\work\\weather-wrong $ npm run build' }, { type: 'run_cancelled' }],
    };
    expect(findInterruptedContinuation('Continue', [original, cancelledResume], [
      { role: 'user', content: 'Build weather', createdAt: '2026-01-01T00:00:00.000Z' },
    ])).toMatchObject({ runId: 'run-origin', projectRoot: 'C:\\work\\weather-right' });
  });

  test('does not revive stale interrupted work after a newer substantive request', () => {
    expect(findInterruptedContinuation('Continue', [run('interrupted')], [
      { role: 'user', content: 'Build the old app', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'user', content: 'Summarize a newer project', createdAt: '2026-01-01T00:02:00.000Z' },
    ])).toBeNull();
  });

  test('turns the restored request into an in-place continuation contract', () => {
    const goal = continuationExecutionGoal('Build the weather comparison app', 'react-weather-abc123');
    expect(goal).toContain('latest project');
    expect(goal).toContain('existing workspace');
    expect(goal).toContain('react-weather-abc123');
    expect(goal).toContain('Do not create a new project');
    expect(goal).toContain('Build the weather comparison app');
  });
});
