import { normalizeDocumentState } from '../../modules/browser/navigation-diagnostics';

/** Retain diagnostic categories, never arbitrary URLs, credentials, or page text. */
export async function readNavigationFailureEvidence(readBody: () => Promise<unknown>, timeoutMs = 1000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const body = await Promise.race([
            Promise.resolve().then(readBody),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('body_timeout')), timeoutMs); }),
        ]);
        const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const detail = String(record.detail || record.error || '').toLowerCase();
        const kind = /closed|has been disposed/.test(detail) ? 'page_closed'
            : /interrupted by another navigation|err_aborted/.test(detail) ? 'navigation_interrupted'
            : /timeout|timed out/.test(detail) ? 'timeout'
            : /err_connection|econnrefused|connection refused|connection reset/.test(detail) ? 'connection'
            : /err_name_not_resolved|enotfound/.test(detail) ? 'dns'
            : /err_cert|certificate|ssl/.test(detail) ? 'tls'
            : 'unknown';
        const attempts = typeof record.attempts === 'number' && Number.isSafeInteger(record.attempts)
            && record.attempts >= 0 && record.attempts <= 2 ? record.attempts : null;
        return { kind, attempts, ...(record.documentState === undefined ? {} : {
            documentState: normalizeDocumentState(record.documentState),
        }) };
    } catch {
        return { kind: 'evidence_unavailable', attempts: null };
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/** Validate the last cumulative summary, not merely its event envelope. */
export function inspectVerificationEvidence(events: unknown) {
    const summaries = Array.isArray(events)
        ? events.filter(event => event?.type === 'verification_summary') : [];
    const summary = summaries[summaries.length - 1]?.data;
    const metrics = summary?.metrics;
    const checks = summary?.evidence?.checks;
    const failures: string[] = [];
    if (!summary) failures.push('verification_summary_missing');
    const counters = ['receipts', 'selected', 'reused', 'passed', 'failed', 'cancelled', 'timedOut', 'incomplete'];
    const validCounters = counters.every(key => Number.isSafeInteger(metrics?.[key]) && metrics[key] >= 0);
    if (!validCounters) failures.push('verification_metrics_invalid');
    if (validCounters) {
        if (!metrics.receipts || !metrics.passed || !(metrics.selected + metrics.reused)) failures.push('verification_no_checks');
        if (metrics.failed || metrics.cancelled || metrics.timedOut || metrics.incomplete) failures.push('verification_unsuccessful_checks');
        if (metrics.receipts !== metrics.passed + metrics.failed + metrics.cancelled + metrics.timedOut + metrics.incomplete) {
            failures.push('verification_metrics_inconsistent');
        }
    }
    if (!Array.isArray(checks) || !checks.length) failures.push('verification_check_evidence_missing');
    else {
        if (checks.some(check => !check || typeof check.checkId !== 'string' || !check.checkId.trim()
            || typeof check.tool !== 'string' || !check.tool.trim() || check.result !== 'passed')) {
            failures.push('verification_check_evidence_invalid');
        }
        if (!checks.some(check => check?.mode === 'final' && check.result === 'passed')) {
            failures.push('verification_final_check_missing');
        }
    }
    return {
        present: failures.length === 0,
        failures,
        totals: validCounters ? {
            selected: metrics.selected, reused: metrics.reused, passed: metrics.passed, failed: metrics.failed,
        } : null,
    };
}
