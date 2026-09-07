import {
  reconcileInterruptedRunEvidence,
  runEvidenceStore,
} from '../shared/run-evidence-store';

describe('interrupted run recovery', () => {
  afterEach(() => jest.restoreAllMocks());

  test('closes durable running evidence and records why it stopped', async () => {
    const record: any = {
      id: 'run-before-restart',
      runId: 'run-before-restart',
      sessionId: 'session-before-restart',
      startedAt: '2026-09-07T12:00:00.000Z',
      updatedAt: '2026-09-07T12:01:00.000Z',
      status: 'running',
      events: [],
    };
    jest.spyOn(runEvidenceStore, 'find').mockResolvedValue([record]);
    jest.spyOn(runEvidenceStore, 'findOne').mockResolvedValue(record);
    const update = jest.spyOn(runEvidenceStore, 'updateOne').mockResolvedValue(undefined as any);

    await expect(reconcileInterruptedRunEvidence()).resolves.toEqual(['run-before-restart']);
    expect(update).toHaveBeenCalledWith(
      { runId: 'run-before-restart' },
      expect.objectContaining({
        status: 'interrupted',
        events: [expect.objectContaining({
          type: 'run_interrupted',
          runId: 'run-before-restart',
          sessionId: 'session-before-restart',
          data: { reason: 'api_restart' },
        })],
      }),
    );
  });

  test('does not rewrite a run that completed while reconciliation waited', async () => {
    jest.spyOn(runEvidenceStore, 'find').mockResolvedValue([{
      runId: 'run-finished',
      sessionId: 'session-finished',
      startedAt: '2026-09-07T12:00:00.000Z',
      updatedAt: '2026-09-07T12:01:00.000Z',
      status: 'running',
      events: [],
    }]);
    jest.spyOn(runEvidenceStore, 'findOne').mockResolvedValue({
      runId: 'run-finished',
      sessionId: 'session-finished',
      startedAt: '2026-09-07T12:00:00.000Z',
      updatedAt: '2026-09-07T12:02:00.000Z',
      status: 'done',
      events: [],
    });
    const update = jest.spyOn(runEvidenceStore, 'updateOne');

    await expect(reconcileInterruptedRunEvidence()).resolves.toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });
});
