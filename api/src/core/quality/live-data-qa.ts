import type { AppAuditFinding } from './app-audit';

const LIVE_DATA_REQUEST = /(?:\b(?:live|real[ -]?time|current|external)\s+(?:data|api|feed)|\b(?:api|fetch)\b|(?:بيانات\s*(?:حية|مباشرة)|لحظي|واجهة\s*برمجة))/iu;

export function isLiveDataQaRequest(request: string): boolean {
    return LIVE_DATA_REQUEST.test(String(request || ''));
}

export interface LiveDataQaResult {
    findings: AppAuditFinding[];
    metrics: Record<string, number>;
}

/** Verify the user can observe a real-data contract, rather than trusting a static label. */
export async function runLiveDataQa(args: {
    page: any;
    url: string;
    request: string;
    timeoutMs: number;
    onProgress?: (message: string) => void;
}): Promise<LiveDataQaResult> {
    const findings: AppAuditFinding[] = [];
    const metrics: Record<string, number> = { statesVisited: 0 };
    if (!isLiveDataQaRequest(args.request)) return { findings, metrics };

    args.onProgress?.('live data: checking the request trail and freshness state');
    const timeout = Math.min(Math.max(Number(args.timeoutMs) || 0, 4_000), 15_000);
    await args.page.goto(args.url, { waitUntil: 'load', timeout });
    try {
        const proof = await args.page.evaluate(() => {
            const text = String(document.body?.innerText || '');
            const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
            const requests = resources.map(entry => entry.name).filter(name => /(?:\/api\/|api\.|graphql|forecast|geocod|open-meteo|json)/i.test(name));
            return {
                requests: Array.from(new Set(requests)).slice(0, 8),
                freshnessVisible: /(?:live\s+data|last\s+updated|updated\s*(?:at|just\s+now)|refreshed?|بيانات\s+حية|آخر\s+تحديث|تم\s+التحديث)/iu.test(text),
                fallbackVisible: /(?:offline|fallback|cached|sample\s+data|دون\s+اتصال|بديل|مخز)/iu.test(text),
            };
        });
        metrics.statesVisited = 1;
        if (!proof.requests.length) findings.push({
            id: 'live_data_no_request', severity: 'high',
            detail: 'طُلبت بيانات حيّة لكن المتصفح لم ير أي طلب API أو مصدر بيانات أثناء الفحص',
            detailEn: 'Live data was requested, but the browser observed no API or data-source request during the audit',
        });
        if (!proof.freshnessVisible && !proof.fallbackVisible) findings.push({
            id: 'live_data_state_hidden', severity: 'medium',
            detail: 'لا تعرض الواجهة حالة حداثة البيانات أو حالة بديلة عند تعذر الشبكة',
            detailEn: 'The interface exposes neither a data-freshness state nor an honest offline/fallback state',
            evidence: proof.requests.map((url: string) => ({ url: url.slice(-140) })),
        });
    } catch (error: any) {
        findings.push({
            id: 'live_data_qa_failed', severity: 'medium',
            detail: `تعذر إكمال فحص البيانات الحيّة: ${String(error?.message || error).slice(0, 120)}`,
            detailEn: `Live-data QA could not complete: ${String(error?.message || error).slice(0, 120)}`,
        });
    }
    return { findings, metrics };
}
