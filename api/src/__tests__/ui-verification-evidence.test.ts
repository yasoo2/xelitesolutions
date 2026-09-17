import { inspectVerificationEvidence, readNavigationFailureEvidence } from '../tests/manual/verification-evidence';

describe('bounded browser navigation diagnostics', () => {
    test('keeps document readiness but rejects arbitrary document data', async () => {
        expect(await readNavigationFailureEvidence(async () => ({ detail: 'timeout', attempts: 2, documentState: 'interactive' })))
            .toEqual({ kind: 'timeout', attempts: 2, documentState: 'interactive' });
        expect(await readNavigationFailureEvidence(async () => ({ documentState: 'private text' })))
            .toEqual({ kind: 'unknown', attempts: null, documentState: 'unavailable' });
    });
    test.each([
        ['page.goto: Timeout 20000ms exceeded', 'timeout'],
        ['Navigation interrupted by another navigation', 'navigation_interrupted'],
        ['Target page, context or browser has been closed', 'page_closed'],
        ['net::ERR_CONNECTION_REFUSED', 'connection'],
        ['net::ERR_NAME_NOT_RESOLVED', 'dns'],
        ['net::ERR_CERT_AUTHORITY_INVALID', 'tls'],
    ])('classifies %s without retaining raw detail', async (detail, kind) => {
        expect(await readNavigationFailureEvidence(async () => ({ detail, attempts: 2, password: 'test-only' })))
            .toEqual({ kind, attempts: 2 });
    });
    it('does not retain unrecognized response content', async () => {
        expect(await readNavigationFailureEvidence(async () => ({ detail: 'private page text', attempts: 99 })))
            .toEqual({ kind: 'unknown', attempts: null });
    });
    it('bounds a stalled response body without retrying it', async () => {
        jest.useFakeTimers();
        try {
            const read = jest.fn(() => new Promise<unknown>(() => {}));
            const result = readNavigationFailureEvidence(read, 100);
            await jest.advanceTimersByTimeAsync(100);
            expect(await result).toEqual({ kind: 'evidence_unavailable', attempts: null });
            expect(read).toHaveBeenCalledTimes(1);
        } finally { jest.useRealTimers(); }
    });
});

const summary = () => ({ type: 'verification_summary', data: {
    metrics: { receipts: 1, selected: 1, reused: 0, passed: 1, failed: 0, cancelled: 0, timedOut: 0, incomplete: 0 },
    evidence: { checks: [{ checkId: 'final-build', tool: 'shell_execute', mode: 'final', result: 'passed' }] },
} });

describe('real UI verification evidence gate', () => {
    it('rejects missing and empty summaries', () => {
        expect(inspectVerificationEvidence([]).present).toBe(false);
        const empty = summary();
        empty.data.metrics = { receipts: 0, selected: 0, reused: 0, passed: 0, failed: 0, cancelled: 0, timedOut: 0, incomplete: 0 };
        empty.data.evidence.checks = [];
        expect(inspectVerificationEvidence([empty]).failures).toContain('verification_no_checks');
    });
    it('accepts a substantive final check and does not double-count cumulative snapshots', () => {
        const result = inspectVerificationEvidence([summary(), summary()]);
        expect(result.present).toBe(true);
        expect(result.totals?.selected).toBe(1);
    });
    it('does not use an earlier passing summary to hide a later empty one', () => {
        expect(inspectVerificationEvidence([summary(), { type: 'verification_summary', data: {} }]).present).toBe(false);
    });
    it.each(['failed', 'cancelled', 'timedOut', 'incomplete'] as const)('rejects %s checks', key => {
        const event = summary();
        event.data.metrics[key] = 1;
        event.data.metrics.receipts = 2;
        expect(inspectVerificationEvidence([event]).failures).toContain('verification_unsuccessful_checks');
    });
    it('requires both inspectable checks and final verification', () => {
        const event = summary();
        event.data.evidence.checks[0].mode = 'focused';
        expect(inspectVerificationEvidence([event]).failures).toContain('verification_final_check_missing');
        event.data.evidence.checks = [];
        expect(inspectVerificationEvidence([event]).present).toBe(false);
    });
    it('rejects malformed and inconsistent metrics', () => {
        const event = summary();
        event.data.metrics.passed = NaN;
        expect(inspectVerificationEvidence([event]).present).toBe(false);
        event.data.metrics.passed = 2;
        expect(inspectVerificationEvidence([event]).failures).toContain('verification_metrics_inconsistent');
    });
});
