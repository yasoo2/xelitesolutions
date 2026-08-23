import router from '../api/routes/run';
import { broadcast, addRunEventListener, removeRunEventListener, registerRunSession, unregisterRunSession } from '../api/ws';
import {
  MAX_EVENTS_PER_RUN,
  appendRunEvidenceEvent,
  createRunEvidence,
  getRunEvidence,
  runEvidenceStore,
  saveRunReceipt,
} from '../shared/run-evidence-store';
import { extractRunReceiptEvidence } from '../modules/services/AgentLoopService';

process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';

function routeHandler(routePath: string): (req: any, res: any, next: any) => Promise<void> {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath);
  if (!layer?.route?.stack?.[0]?.handle) throw new Error(`route not found: ${routePath}`);
  return layer.route.stack[0].handle;
}

function responseDouble() {
  const response: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    jsonBody: undefined,
    json(body: unknown) { this.jsonBody = body; return this; },
  };
  return response;
}

async function cleanup(runId: string) {
  await runEvidenceStore.deleteOne({ runId });
}

describe('048b durable run evidence contract', () => {
  const runId = `run-regression-${process.pid}-${Date.now()}`;
  const concurrentRunId = `${runId}-concurrent`;

  beforeAll(async () => {
    const records = await runEvidenceStore.find();
    for (const record of records) {
      await runEvidenceStore.deleteOne({ runId: record.runId });
    }
  });

  afterAll(async () => {
    await cleanup(runId);
    await cleanup(concurrentRunId);
  });

  test('persists the canonical runId, bounded events, and receipt fields', async () => {
    await createRunEvidence(runId, { sessionId: 'session-regression', status: 'running' });
    for (let i = 0; i < MAX_EVENTS_PER_RUN + 25; i += 1) {
      await appendRunEvidenceEvent(runId, {
        type: i === 0 ? 'file_stream' : 'terminal_output',
        sessionId: 'session-regression',
        data: { line: String(i), runId },
      });
    }
    await saveRunReceipt(runId, {
      projectRoot: '/tmp/weathergo-regression',
      taskReceipts: [{ tool: 'phase_executor', ok: true, error: '' }],
      fidelityVerdict: { label: 'verified' },
      selfFixReason: 'bounded regression reason',
    });

    const evidence = await getRunEvidence(runId);
    expect(evidence?.runId).toBe(runId);
    expect(evidence?.events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_RUN);
    expect(evidence?.events[0]?.data).toEqual({ line: '0', runId });
    expect(evidence?.events.some(event => event.type === 'phase_receipt')).toBe(true);
    expect(evidence?.events.at(-1)?.type).toBe('phase_receipt');
    expect(evidence?.receipt?.projectRoot).toBe('/tmp/weathergo-regression');
    expect(evidence?.receipt?.fidelityVerdict).toEqual({ label: 'verified' });
  }, 120_000);

  test('event listeners receive normalized runId even when broadcast has no socket', () => {
    const seen: any[] = [];
    addRunEventListener(runId, event => seen.push(event));
    try {
      broadcast({ type: 'file_stream', runId, data: { file: 'src/App.tsx' } } as any);
      expect(seen[0]?.runId).toBe(runId);
      expect(seen[0]?.type).toBe('file_stream');
    } finally {
      removeRunEventListener(runId);
    }
  });

  test('session mapping keeps concurrent runs separate when events omit runId', () => {
    const first: any[] = [];
    const second: any[] = [];
    registerRunSession(runId, 'session-one');
    registerRunSession(concurrentRunId, 'session-two');
    addRunEventListener(runId, event => first.push(event));
    addRunEventListener(concurrentRunId, event => second.push(event));
    try {
      broadcast({ type: 'terminal_output', sessionId: 'session-one', data: { line: 'one' } } as any);
      broadcast({ type: 'terminal_output', sessionId: 'session-two', data: { line: 'two' } } as any);
      expect(first.map(event => event.data.line)).toEqual(['one']);
      expect(second.map(event => event.data.line)).toEqual(['two']);
      expect(first[0].runId).toBe(runId);
      expect(second[0].runId).toBe(concurrentRunId);
    } finally {
      removeRunEventListener(runId);
      removeRunEventListener(concurrentRunId);
      unregisterRunSession(runId, 'session-one');
      unregisterRunSession(concurrentRunId, 'session-two');
    }
  });

  test('storage failure is isolated from the run', async () => {
    const create = jest.spyOn(runEvidenceStore, 'create').mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(createRunEvidence(`${runId}-disk-failure`, { status: 'running' })).resolves.toBeUndefined();
    create.mockRestore();
    await cleanup(`${runId}-disk-failure`);
  });

  test('extractRunReceiptEvidence marks an empty {ok,result} envelope as an extraction miss', () => {
    const receipt = extractRunReceiptEvidence({ ok: true, result: null }, 'run-empty-envelope', 'session-empty-envelope', 'failed');
    expect(receipt.extractionMiss).toBe(true);
    expect(receipt.envelopeKeys).toEqual(['ok', 'result']);
  });

  test('receipt preserves per-finding reviewer provenance when a quality gate blocks', () => {
    const receipt = extractRunReceiptEvidence({
      phaseNumber: 1,
      phaseName: 'Review',
      results: [{
        tool: 'code_reviewer',
        ok: false,
        error: 'code_reviewer quality gate failed: 1 verified critical finding(s) remain',
        output: {
          filesRequested: 1,
          filesReviewed: 1,
          reviewedFiles: ['src/App.tsx'],
          missingFiles: [],
          issues: [{
            file: 'src/App.tsx',
            line: 7,
            severity: 'critical',
            category: 'security',
            message: 'A deterministic security check found a secret.',
            verificationStatus: 'verified',
            evidenceEligible: true,
          }],
          summary: { critical: 1, verifiedCritical: 1, warning: 0, info: 0 },
          qualityGate: { failOnCritical: true, blockingCritical: 1, passed: false },
        },
      }],
    }, 'run-review-findings', 'session-review-findings', 'failed');

    expect(receipt.reviewerFindingsLost).toBeUndefined();
    expect(receipt.taskReceipts[0]).toMatchObject({
      tool: 'code_reviewer',
      reviewerFindings: [{
        file: 'src/App.tsx',
        line: 7,
        message: 'A deterministic security check found a secret.',
        verificationStatus: 'verified',
        evidenceEligible: true,
      }],
    });
  });

  test('a blocked reviewer with missing findings raises a named reporting defect', () => {
    const receipt = extractRunReceiptEvidence({
      phaseNumber: 1,
      results: [{
        tool: 'code_reviewer',
        ok: false,
        error: 'code_reviewer quality gate failed: 6 critical finding(s) remain',
        output: {
          filesRequested: 4,
          filesReviewed: 4,
          reviewedFiles: ['src/App.tsx', 'src/Total.tsx', 'src/ExpenseForm.tsx', 'src/ExpenseList.tsx'],
          issues: [],
          summary: { critical: 6, verifiedCritical: 0 },
          qualityGate: { failOnCritical: true, passed: false },
        },
      }],
    }, 'run-review-findings-lost', 'session-review-findings-lost', 'failed');

    expect(receipt).toMatchObject({
      reviewerFindingsLost: true,
      reportingDefect: 'reviewer_findings_lost',
    });
    expect(receipt.taskReceipts[0]).toMatchObject({
      tool: 'code_reviewer',
      reviewerFindings: [],
      reviewerFindingsLost: true,
      reportingDefect: 'reviewer_findings_lost',
    });
  });

  test('GET /:id/receipt returns the structural receipt for a textual runId', async () => {
    const handler = routeHandler('/:id/receipt');
    const res = responseDouble();
    await handler({ params: { id: runId } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.runId).toBe(runId);
    expect(res.jsonBody.projectRoot).toBe('/tmp/weathergo-regression');
    expect(res.jsonBody.taskReceipts).toHaveLength(1);
    expect(res.jsonBody.fidelityVerdict).toEqual({ label: 'verified' });
  });

  test('GET /:id resolves the same textual runId instead of requiring an ObjectId', async () => {
    const handler = routeHandler('/:id');
    const res = responseDouble();
    await handler({ params: { id: runId } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.run.runId).toBe(runId);
    expect(res.jsonBody.execs.length).toBeGreaterThan(0);
  });
});
