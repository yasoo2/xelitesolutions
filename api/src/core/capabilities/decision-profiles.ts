/**
 * Deterministic capability route selection.
 *
 * Provider discovery may supply candidates, but this layer owns the policy:
 * choose the lowest-burden route that satisfies the request and keep an
 * inspectable receipt. It deliberately contains no provider-specific names.
 */
export type SetupBurden = 'ZERO_SETUP' | 'CONNECT_ACCOUNT' | 'KEY_REQUIRED' | 'ACCOUNT_REQUIRED' | 'PAID_REQUIRED';
export type Reliability = 'PROVEN' | 'UNKNOWN' | 'STALE' | 'FAILING';
export type Privacy = 'LOCAL' | 'EXTERNAL';

export interface CapabilityCandidate {
    id: string;
    family: string;
    route: 'local' | 'public_api' | 'account_connection' | 'api_key' | 'account' | 'paid_service';
    setup: SetupBurden;
    reliability: Reliability;
    privacy: Privacy;
    supportsOffline: boolean;
    supportsDeployment: boolean;
    recurringCost: 'NONE' | 'UNKNOWN' | 'PAID';
    rateLimit?: string;
    maintenance: 'LOW' | 'MEDIUM' | 'HIGH';
    license?: string;
    evidenceCheckedAt?: string;
}

export interface CapabilityConstraints {
    family: string;
    offline?: boolean;
    privacy?: 'LOCAL_ONLY' | 'EXTERNAL_ALLOWED';
    deployment?: boolean;
    requireProvenReliability?: boolean;
    allowPaid?: boolean;
    requiresUnlimitedRate?: boolean;
    allowedLicenses?: string[];
    maxMaintenance?: CapabilityCandidate['maintenance'];
}

/**
 * Conservative request-derived constraints for the decision tool. Explicit
 * structured input always wins; these phrases only add safety requirements
 * that a user clearly stated in natural language.
 */
export function capabilityConstraintsFromRequest(request: string): Omit<CapabilityConstraints, 'family'> {
    const text = String(request || '').toLowerCase();
    return {
        offline: /\boffline\b|without\s+(?:an\s+)?internet|دون\s+إنترنت|بدون\s+إنترنت/u.test(text),
        privacy: /local[-\s]?only|keep\s+(?:it\s+)?local|خصوصية\s+محلية|محلي\s+فقط/u.test(text)
            ? 'LOCAL_ONLY' : undefined,
        deployment: /\b(?:deployed|deployment|hosted|production)\b|منشور|استضافة|بيئة\s+إنتاج/u.test(text),
        requireProvenReliability: /\b(?:proven|verified)\s+(?:reliability|route)|موثوق\s+ومثبت|موثوق\s+بشكل\s+مثبت/u.test(text),
        requiresUnlimitedRate: /\b(?:unlimited|no)\s+(?:rate\s*limits?|quota)|دون\s+(?:حدود|قيود)\s+(?:للمعدل|للاستخدام)/u.test(text),
    };
}

export interface CapabilityDecisionReceipt {
    version: 1;
    family: string;
    selected: CapabilityCandidate | null;
    rankedAlternatives: Array<{ candidate: CapabilityCandidate; score: number }>;
    rejected: Array<{ id: string; reasons: string[] }>;
    evidenceFreshness: 'fresh' | 'stale_or_missing';
    requiredUserAction: SetupBurden | null;
}

const SETUP_SCORE: Record<SetupBurden, number> = {
    ZERO_SETUP: 0, CONNECT_ACCOUNT: 1, KEY_REQUIRED: 2, ACCOUNT_REQUIRED: 3, PAID_REQUIRED: 4,
};
const RELIABILITY_SCORE: Record<Reliability, number> = {
    PROVEN: 0, UNKNOWN: 3, STALE: 5, FAILING: 20,
};
const MAINTENANCE_SCORE: Record<CapabilityCandidate['maintenance'], number> = { LOW: 0, MEDIUM: 1, HIGH: 3 };
const MAINTENANCE_ORDER: Record<CapabilityCandidate['maintenance'], number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function rejectionReasons(candidate: CapabilityCandidate, constraints: CapabilityConstraints): string[] {
    const reasons: string[] = [];
    if (candidate.family !== constraints.family) reasons.push('capability family does not match');
    if (constraints.offline && !candidate.supportsOffline) reasons.push('does not satisfy offline requirement');
    if (constraints.privacy === 'LOCAL_ONLY' && candidate.privacy !== 'LOCAL') reasons.push('does not satisfy local-only privacy');
    if (constraints.deployment && !candidate.supportsDeployment) reasons.push('does not support the deployment target');
    if (constraints.requireProvenReliability && candidate.reliability !== 'PROVEN') reasons.push(`reliability is ${candidate.reliability.toLowerCase()}, not proven`);
    if (constraints.allowPaid === false && (candidate.recurringCost === 'PAID' || candidate.setup === 'PAID_REQUIRED')) reasons.push('requires a paid route');
    if (constraints.requiresUnlimitedRate && candidate.rateLimit) reasons.push('has a declared rate limit');
    if (constraints.allowedLicenses?.length && (!candidate.license || !constraints.allowedLicenses.includes(candidate.license))) reasons.push('license is not allowed by the request');
    if (constraints.maxMaintenance && MAINTENANCE_ORDER[candidate.maintenance] > MAINTENANCE_ORDER[constraints.maxMaintenance]) reasons.push('maintenance burden exceeds the request limit');
    if (candidate.reliability === 'FAILING') reasons.push('recent reliability evidence is failing');
    return reasons;
}

/**
 * Joe-maintained route profiles. These describe route classes, never hidden
 * credentials or executable provider settings. A selected external route is a
 * decision receipt, not permission to connect, pay, or persist an account.
 */
const CATALOGUE: Record<string, CapabilityCandidate[]> = {
    ocr: [
        { id: 'ocr-local', family: 'ocr', route: 'local', setup: 'ZERO_SETUP', reliability: 'PROVEN', privacy: 'LOCAL', supportsOffline: true, supportsDeployment: false, recurringCost: 'NONE', maintenance: 'LOW', license: 'LOCAL', evidenceCheckedAt: '2026-09-22T00:00:00.000Z' },
        { id: 'ocr-key-service', family: 'ocr', route: 'api_key', setup: 'KEY_REQUIRED', reliability: 'UNKNOWN', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'UNKNOWN', maintenance: 'MEDIUM', license: 'PROVIDER_TERMS' },
    ],
    geocoding: [
        { id: 'geocoding-public', family: 'geocoding', route: 'public_api', setup: 'ZERO_SETUP', reliability: 'STALE', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'NONE', rateLimit: 'provider-dependent', maintenance: 'LOW', license: 'OPEN_DATA' },
        { id: 'geocoding-account', family: 'geocoding', route: 'account', setup: 'ACCOUNT_REQUIRED', reliability: 'PROVEN', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'UNKNOWN', maintenance: 'MEDIUM', license: 'PROVIDER_TERMS', evidenceCheckedAt: '2026-09-22T00:00:00.000Z' },
    ],
    storage: [
        { id: 'storage-local', family: 'storage', route: 'local', setup: 'ZERO_SETUP', reliability: 'PROVEN', privacy: 'LOCAL', supportsOffline: true, supportsDeployment: false, recurringCost: 'NONE', maintenance: 'LOW', license: 'LOCAL', evidenceCheckedAt: '2026-09-22T00:00:00.000Z' },
        { id: 'storage-connect', family: 'storage', route: 'account_connection', setup: 'CONNECT_ACCOUNT', reliability: 'UNKNOWN', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'UNKNOWN', maintenance: 'MEDIUM', license: 'PROVIDER_TERMS' },
    ],
    speech: [
        { id: 'speech-local', family: 'speech', route: 'local', setup: 'ZERO_SETUP', reliability: 'PROVEN', privacy: 'LOCAL', supportsOffline: true, supportsDeployment: false, recurringCost: 'NONE', maintenance: 'MEDIUM', license: 'LOCAL', evidenceCheckedAt: '2026-09-22T00:00:00.000Z' },
        { id: 'speech-key-service', family: 'speech', route: 'api_key', setup: 'KEY_REQUIRED', reliability: 'UNKNOWN', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'UNKNOWN', maintenance: 'MEDIUM', license: 'PROVIDER_TERMS' },
    ],
    routing: [
        { id: 'routing-public', family: 'routing', route: 'public_api', setup: 'ZERO_SETUP', reliability: 'STALE', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'NONE', rateLimit: 'provider-dependent', maintenance: 'LOW', license: 'OPEN_DATA' },
        { id: 'routing-paid', family: 'routing', route: 'paid_service', setup: 'PAID_REQUIRED', reliability: 'PROVEN', privacy: 'EXTERNAL', supportsOffline: false, supportsDeployment: true, recurringCost: 'PAID', maintenance: 'LOW', license: 'PROVIDER_TERMS', evidenceCheckedAt: '2026-09-22T00:00:00.000Z' },
    ],
};

export function capabilityProfilesFor(family: string): CapabilityCandidate[] {
    return (CATALOGUE[String(family || '').trim().toLowerCase()] || []).map(candidate => ({ ...candidate }));
}

export function capabilityFamilyFromRequest(request: string): string | null {
    const text = String(request || '').toLowerCase();
    if (/\bocr\b|scan(?:ning)?\s+(?:a\s+)?document|استخراج.*نص|مسح.*مستند/iu.test(text)) return 'ocr';
    if (/geocod|address.*(?:location|coordinates)|تحويل.*عنوان|ترميز.*جغرافي/iu.test(text)) return 'geocoding';
    if (/\b(?:storage|upload|drive|files?)\b|رفع.*ملف|تخزين.*ملف/iu.test(text)) return 'storage';
    if (/\b(?:speech|transcri(?:be|ption)|voice)\b|تفريغ.*صوت|تحويل.*صوت/iu.test(text)) return 'speech';
    if (/\b(?:routing|directions|route planning)\b|تخطيط.*مسار|اتجاهات/iu.test(text)) return 'routing';
    return null;
}

function score(candidate: CapabilityCandidate): number {
    return SETUP_SCORE[candidate.setup] * 10
        + RELIABILITY_SCORE[candidate.reliability] * 4
        + (candidate.recurringCost === 'PAID' ? 12 : candidate.recurringCost === 'UNKNOWN' ? 2 : 0)
        + MAINTENANCE_SCORE[candidate.maintenance] * 2
        + (candidate.privacy === 'EXTERNAL' ? 1 : 0);
}

export function decideCapabilityRoute(
    constraints: CapabilityConstraints,
    candidates: CapabilityCandidate[],
): CapabilityDecisionReceipt {
    const rejected: CapabilityDecisionReceipt['rejected'] = [];
    const viable: CapabilityCandidate[] = [];
    for (const candidate of candidates) {
        const reasons = rejectionReasons(candidate, constraints);
        if (reasons.length) rejected.push({ id: candidate.id, reasons });
        else viable.push(candidate);
    }
    const rankedAlternatives = viable
        .map(candidate => ({ candidate, score: score(candidate) }))
        .sort((a, b) => a.score - b.score || a.candidate.id.localeCompare(b.candidate.id));
    const selected = rankedAlternatives[0]?.candidate || null;
    return {
        version: 1,
        family: constraints.family,
        selected,
        rankedAlternatives,
        rejected,
        evidenceFreshness: selected?.reliability === 'PROVEN' && !!selected.evidenceCheckedAt ? 'fresh' : 'stale_or_missing',
        requiredUserAction: selected && selected.setup !== 'ZERO_SETUP' ? selected.setup : null,
    };
}

/**
 * Keep the inspectable parts of a decision receipt shallow enough to survive
 * bounded orchestration memory. Full candidate objects stay available at the
 * tool boundary; the user-facing runtime only needs route facts and reasons.
 */
export function compactCapabilityDecisionReceiptForRuntime(receipt: any): Record<string, any> | null {
    if (receipt?.version !== 1 || !receipt?.selected) return null;
    const selected = receipt.selected;
    const viableAlternatives = Array.isArray(receipt.rankedAlternatives)
        ? receipt.rankedAlternatives
            .map((item: any) => item?.candidate)
            .filter((candidate: any) => candidate && candidate.id !== selected.id)
            .slice(0, 3)
            .map((candidate: any) => `${candidate.route} (${candidate.setup})`)
        : [];
    const rejectedAlternatives = Array.isArray(receipt.rejected)
        ? receipt.rejected.slice(0, 3).map((item: any) => {
            const reasons = Array.isArray(item?.reasons)
                ? item.reasons
                : item?.reasons == null ? [] : [String(item.reasons)];
            return `${item?.id || 'candidate'}: ${reasons.slice(0, 2).join('; ')}`;
        })
        : [];
    return {
        version: 1,
        family: String(receipt.family || '').slice(0, 80),
        selected: {
            id: String(selected.id || '').slice(0, 120),
            route: String(selected.route || '').slice(0, 80),
            setup: String(selected.setup || '').slice(0, 80),
            reliability: String(selected.reliability || '').slice(0, 80),
        },
        viableAlternatives,
        rejectedAlternatives,
        evidenceFreshness: receipt.evidenceFreshness === 'fresh' ? 'fresh' : 'stale_or_missing',
        requiredUserAction: receipt.requiredUserAction ? String(receipt.requiredUserAction).slice(0, 80) : null,
    };
}
