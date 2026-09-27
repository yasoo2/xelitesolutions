/**
 * RESILIENT NAVIGATION — bounded retries, evidence-based readiness.
 *
 * The executor's navigation step used to attempt each URL variant once and
 * then sleep a fixed 250ms: a momentary blip (local preview server still
 * starting, one 502 from a cold gateway) failed the whole step, while the
 * fixed sleep proved nothing about readiness. The route layer already had
 * bounded retry thinking (transientNavigationError); this module brings the
 * same discipline to the executor path, where the QA evidence is produced:
 *
 *   - PASS 1: every candidate URL once, in order (existing fallback preserved).
 *   - PASS 2 (once): only when every pass-1 attempt failed AND at least one
 *     failure was transient — the transient-failed candidates again after one
 *     bounded backoff. Total extra cost: one sleep plus one pass. Never more.
 *   - HTTP responses are NOT retried: page.goto resolves (not throws) for
 *     HTTP error statuses, and a 404/500 is genuine app evidence, recorded
 *     with its status — retrying it would only burn the step budget.
 *   - READINESS replaces the fixed sleep: after a successful goto, poll
 *     document.readyState plus body presence within a small budget, recording
 *     what was actually observed. Early exit when ready; the budget caps the
 *     worst case far below any arbitrary long sleep.
 *
 * Everything is recorded: per-attempt url/outcome/ms/status and the readiness
 * observation. The caller keeps its result shapes and only gains fields.
 * Concurrency is untouched — this navigates the page it is handed, serially,
 * exactly like the loop it replaces.
 */

/** Minimal page surface: real Playwright pages and test fakes both satisfy it. */
export interface NavigablePage {
    goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<{ status(): number } | null>;
    evaluate<T>(fn: () => T): Promise<T>;
    url(): string;
}

export type NavigationOutcomeKind = 'ok' | 'http_error' | 'transient' | 'error';

export interface NavigationAttempt {
    url: string;
    pass: 1 | 2;
    outcome: NavigationOutcomeKind;
    ms: number;
    httpStatus?: number;
    error?: string;
}

export interface NavigationReadiness {
    ready: boolean;
    readyState: string;
    bodyElements: number;
    waitedMs: number;
    polls: number;
}

export interface NavigationResult {
    ok: boolean;
    url: string;
    attempts: NavigationAttempt[];
    readiness: NavigationReadiness | null;
    /** Machine reason for the final failure (ok === false only). */
    reason?: 'timeout' | 'http_error' | 'navigation_failed';
    message?: string;
}

export interface NavigationOptions {
    timeoutMs?: number;
    /** Single backoff before pass 2. Default 600. */
    backoffMs?: number;
    /** Readiness poll budget after success. Default 2000. */
    readinessBudgetMs?: number;
    /** Poll interval for readiness. Default 120. */
    readinessPollMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

/**
 * Transient transport failures: worth one more attempt after a breath.
 * (Relocated here from the browser route so the executor shares one
 * definition; the route re-exports it and its tests are unchanged.)
 */
export function transientNavigationError(error: unknown): boolean {
    const text = String((error as any)?.message || error || '').toLowerCase();
    return /econnrefused|econnreset|net::err_connection|target page.*closed|timeout.*exceed|timed out/.test(text);
}

/** Genuinely invalid targets: never worth any attempt. */
export function invalidNavigationTarget(url: string): boolean {
    const value = String(url || '').trim();
    if (!value) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
    } catch {
        return true;
    }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function probeReadiness(
    page: NavigablePage,
    budgetMs: number,
    pollMs: number,
    sleep: (ms: number) => Promise<void>,
    now: () => number,
): Promise<NavigationReadiness> {
    const started = now();
    let polls = 0;
    let readyState = 'unknown';
    let bodyElements = -1;
    while (now() - started < budgetMs) {
        polls++;
        try {
            const observed = await page.evaluate(() => ({
                rs: typeof document === 'undefined' ? 'unknown' : document.readyState,
                body: typeof document === 'undefined' || !document.body ? -1 : document.body.childElementCount,
            }));
            readyState = String((observed as any)?.rs || 'unknown');
            bodyElements = Number((observed as any)?.body ?? -1);
        } catch {
            break; // page died mid-probe: report what we have
        }
        if (readyState === 'complete' && bodyElements >= 0) break;
        if (now() - started + pollMs > budgetMs) break;
        await sleep(pollMs);
    }
    return {
        ready: readyState === 'complete' && bodyElements >= 0,
        readyState,
        bodyElements,
        waitedMs: Math.max(0, now() - started),
        polls,
    };
}

/**
 * Probe page readiness on its own: the same bounded poll goto uses after a
 * successful navigation, exposed so history-traversal steps (back/forward/
 * reload) can replace their fixed sleep with observed readiness. Never
 * throws: an unreadable page yields a not-ready verdict, never an exception.
 */
export async function probeNavigationReadiness(
    page: NavigablePage,
    opts: NavigationOptions = {},
): Promise<NavigationReadiness> {
    const readinessBudgetMs = Math.max(0, Math.min(5000, Math.floor(opts.readinessBudgetMs ?? 2000)));
    const readinessPollMs = Math.max(20, Math.min(1000, Math.floor(opts.readinessPollMs ?? 120)));
    const sleep = opts.sleep ?? defaultSleep;
    const now = opts.now ?? Date.now;
    try {
        return await probeReadiness(page, readinessBudgetMs, readinessPollMs, sleep, now);
    } catch {
        return { ready: false, readyState: 'unknown', bodyElements: -1, waitedMs: 0, polls: 0 };
    }
}

/**
 * Navigate with one bounded second pass over transient failures, then probe
 * readiness. Never throws: every failure is returned as data.
 */
export async function gotoResilient(
    page: NavigablePage,
    candidates: string[],
    opts: NavigationOptions = {},
): Promise<NavigationResult> {
    const timeoutMs = opts.timeoutMs ?? 45000;
    const backoffMs = Math.max(0, Math.min(5000, Math.floor(opts.backoffMs ?? 600)));
    const readinessBudgetMs = Math.max(0, Math.min(5000, Math.floor(opts.readinessBudgetMs ?? 2000)));
    const readinessPollMs = Math.max(20, Math.min(1000, Math.floor(opts.readinessPollMs ?? 120)));
    const sleep = opts.sleep ?? defaultSleep;
    const now = opts.now ?? Date.now;
    const attempts: NavigationAttempt[] = [];

    const attemptOnce = async (url: string, pass: 1 | 2): Promise<{ ok: boolean; httpStatus?: number; error?: string }> => {
        if (invalidNavigationTarget(url)) {
            attempts.push({ url, pass, outcome: 'error', ms: 0, error: 'invalid URL' });
            return { ok: false, error: 'invalid URL' };
        }
        const started = now();
        try {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
            const ms = Math.max(0, now() - started);
            const httpStatus = typeof response?.status === 'function' ? response.status() : undefined;
            if (httpStatus !== undefined && httpStatus >= 400) {
                attempts.push({ url, pass, outcome: 'http_error', ms, httpStatus });
                return { ok: false, httpStatus, error: `HTTP ${httpStatus}` };
            }
            attempts.push({ url, pass, outcome: 'ok', ms, httpStatus });
            return { ok: true, httpStatus };
        } catch (error: any) {
            const ms = Math.max(0, now() - started);
            const message = String(error?.message || error || 'navigation_failed').slice(0, 300);
            const outcome: NavigationOutcomeKind = transientNavigationError(error) ? 'transient' : 'error';
            attempts.push({ url, pass, outcome, ms, error: message });
            return { ok: false, error: message };
        }
    };

    try {
        const unique = [...new Set((candidates || []).map(url => String(url || '').trim()).filter(Boolean))];
        // Pass 1: every candidate once, in the caller's fallback order.
        for (const url of unique) {
            const result = await attemptOnce(url, 1);
            if (result.ok) {
                const readiness = await probeReadiness(page, readinessBudgetMs, readinessPollMs, sleep, now);
                return { ok: true, url, attempts, readiness };
            }
        }
        // Pass 2 (once): transient failures deserve one more attempt after a
        // breath — e.g. the preview server was still starting. HTTP errors and
        // invalid targets are verdicts, not blips: never re-attempted.
        const transientUrls = [...new Set(
            attempts.filter(a => a.pass === 1 && a.outcome === 'transient').map(a => a.url),
        )];
        if (transientUrls.length && backoffMs > 0) {
            await sleep(backoffMs);
            for (const url of transientUrls) {
                const result = await attemptOnce(url, 2);
                if (result.ok) {
                    const readiness = await probeReadiness(page, readinessBudgetMs, readinessPollMs, sleep, now);
                    return { ok: true, url, attempts, readiness };
                }
            }
        }
        const last = attempts[attempts.length - 1];
        const sawHttp = attempts.some(a => a.outcome === 'http_error');
        const sawTimeout = attempts.some(a => /timeout|timed out/i.test(a.error || ''));
        return {
            ok: false,
            url: last?.url || '',
            attempts,
            readiness: null,
            reason: sawHttp && !attempts.some(a => a.outcome === 'transient') ? 'http_error'
                : sawTimeout ? 'timeout' : 'navigation_failed',
            message: (last?.error || last?.httpStatus !== undefined && `HTTP ${last.httpStatus}` || 'navigation_failed').slice(0, 600),
        };
    } catch (error: any) {
        return {
            ok: false, url: '', attempts, readiness: null,
            reason: 'navigation_failed', message: String(error?.message || error || 'navigation_failed').slice(0, 600),
        };
    }
}
