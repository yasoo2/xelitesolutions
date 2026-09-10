import { integrationProfile, type IntegrationCapability } from './integration-profiles';
import type { ApiSelectionArtifact } from './types';

export interface ExternalApiRequirement {
    id: string;
    text: string;
    quote: string;
}

export interface ExternalApiVerdict extends ExternalApiRequirement {
    verdict: 'met' | 'unmet';
    why: string;
}

export interface ExternalApiAcceptanceEvidence {
    capability: IntegrationCapability;
    selection: ApiSelectionArtifact;
    generated: {
        boundedClient: boolean;
        responseValidation: boolean;
        maintainedTransport: boolean;
        loadingState: boolean;
        errorState: boolean;
        retryState: boolean;
    };
    runtime: {
        status: 'passed' | 'failed' | 'unverified';
        seriousFailures: string[];
    };
}

interface EvidenceInput {
    capability: IntegrationCapability;
    selection: ApiSelectionArtifact;
    clientSource: string;
    appSource: string;
    proxySource?: string;
    audit?: {
        skipped?: string;
        findings?: Array<{ id?: string; severity?: string }>;
        passes?: Array<{ id?: string; status?: string }>;
        externalApiRuntime?: {
            capability?: string;
            integrationProfileId?: string;
            successfulRequests?: number;
            renderedLiveResult?: boolean;
        };
    } | null;
}

/** Build acceptance evidence only from Joe-owned integration data and browser results. */
export function buildExternalApiAcceptanceEvidence(input: EvidenceInput): ExternalApiAcceptanceEvidence {
    const profile = integrationProfile(input.selection.integrationProfileId);
    const client = String(input.clientSource || '');
    const app = String(input.appSource || '');
    const proxy = String(input.proxySource || '');
    const findings = Array.isArray(input.audit?.findings) ? input.audit!.findings! : [];
    const runtimePass = input.audit?.passes?.find(pass => pass.id === 'runtime')?.status === 'passed';
    const live = input.audit?.externalApiRuntime;
    const positiveLiveProof = live?.capability === input.capability
        && live?.integrationProfileId === input.selection.integrationProfileId
        && Number(live?.successfulRequests || 0) > 0
        && live?.renderedLiveResult === true;
    const seriousFailures = findings
        .filter(finding => finding.severity === 'high'
            || /(?:console|runtime|failed_requests?|page_errors?|external_api|api_request)/iu.test(String(finding.id || '')))
        .map(finding => String(finding.id || 'runtime_failure'));
    const maintainedTransport = !!profile
        && profile.capability === input.capability
        && profile.id === input.selection.integrationProfileId
        && (profile.transport === 'server-proxy'
            ? !!profile.proxyPath && client.includes(profile.proxyPath.replace(/^\/+/, ''))
                && proxy.includes(profile.requestBaseUrl) && /redirect\s*:\s*['"]error['"]/u.test(proxy)
            : client.includes(profile.requestBaseUrl));
    return {
        capability: input.capability,
        selection: {
            ...input.selection,
            reasons: [...input.selection.reasons],
            warnings: [...input.selection.warnings],
            requiredEnvNames: [...input.selection.requiredEnvNames],
        },
        generated: {
            boundedClient: /AbortController/u.test(client) && /setTimeout\([^,]+,\s*timeoutMs\)/u.test(client),
            responseValidation: /response\.ok/u.test(client),
            maintainedTransport,
            loadingState: /role\s*=\s*["']status["']/u.test(app),
            errorState: /role\s*=\s*["']alert["']/u.test(app),
            retryState: />Retry<|onClick=\{run\}/u.test(app),
        },
        runtime: {
            status: !input.audit || input.audit.skipped || !positiveLiveProof ? 'unverified'
                : runtimePass && seriousFailures.length === 0 ? 'passed' : 'failed',
            seriousFailures,
        },
    };
}

interface RequirementSemantics {
    capability?: IntegrationCapability;
    externalData: boolean;
    noAuth: boolean;
    freeTier: boolean;
    unsupported: string[];
}

function semanticsOf(requirement: ExternalApiRequirement): RequirementSemantics {
    const text = `${requirement.text} ${requirement.quote}`.toLowerCase();
    const capability: IntegrationCapability | undefined = /\bweather\b|forecast|temperature|طقس|حرارة/u.test(text) ? 'weather'
        : /currency|exchange\s+rate|forex|تحويل\s+عمل|سعر\s+الصرف/u.test(text) ? 'currency'
            : /\bip\b.*(?:info|information|location|geolocation)|(?:info|information|location|geolocation).*\bip\b|معلومات.*ip|موقع.*ip/u.test(text) ? 'ip'
                : undefined;
    const unsupported = [
        [/histor(?:y|ical)|سجل\s+تاريخي/u, 'historical data'],
        [/\bchart\b|graph|رسم\s+بياني/u, 'charting'],
        [/\boffline\b|دون\s+اتصال|بلا\s+إنترنت/u, 'offline operation'],
    ].filter(([pattern]) => (pattern as RegExp).test(text)).map(([, name]) => String(name));
    return {
        capability,
        externalData: /\bapi\b|external\s+(?:api|data)|public\s+(?:api|data)|live\s+data|بيانات\s+(?:حية|خارجية)|واجهة\s+برمجة/u.test(text),
        noAuth: /(?:without|no|does\s+not\s+require|not\s+require)\s+(?:authentication|auth|an?\s+api\s+key)|بدون\s+(?:مصادقة|مفتاح)|لا\s+يتطلب\s+(?:مصادقة|مفتاح)/u.test(text),
        freeTier: /\bfree\b|مجاني/u.test(text),
        unsupported,
    };
}

/** Source text alone can never certify a live external integration. */
export function externalApiSourceVerdict(
    requirement: ExternalApiRequirement,
    evidence?: ExternalApiAcceptanceEvidence | string | null,
): ExternalApiVerdict | null {
    if (!evidence || typeof evidence === 'string') return null;
    const semantics = semanticsOf(requirement);
    if (!semantics.capability && !semantics.externalData && !semantics.noAuth && !semantics.freeTier) return null;
    if (semantics.unsupported.length) return null;

    const missing: string[] = [];
    if (semantics.capability && semantics.capability !== evidence.capability) missing.push(`the requested ${semantics.capability} capability`);
    if (!evidence.selection.apiId || !evidence.selection.integrationProfileId) missing.push('a trusted API selection');
    if (!evidence.generated.boundedClient) missing.push('a bounded client');
    if (!evidence.generated.responseValidation) missing.push('response validation');
    if (!evidence.generated.maintainedTransport) missing.push('the maintained transport contract');
    if (!evidence.generated.loadingState || !evidence.generated.errorState) missing.push('visible loading and error states');
    if (semantics.noAuth && (evidence.selection.auth !== 'none' || evidence.selection.requiredEnvNames.length > 0)) missing.push('a no-auth provider');
    if (semantics.freeTier && !['FREE', 'FREEMIUM'].includes(evidence.selection.pricing)) missing.push('verified free-tier metadata');
    if (evidence.runtime.status !== 'passed') {
        missing.push(evidence.runtime.status === 'failed'
            ? `a passing runtime check${evidence.runtime.seriousFailures.length ? ` (${evidence.runtime.seriousFailures.join(', ')})` : ''}`
            : 'runtime browser evidence');
    }
    return {
        ...requirement,
        verdict: missing.length ? 'unmet' : 'met',
        why: missing.length
            ? `the external-data acceptance evidence is missing ${missing.join(', ')}`
            : `structured generation and browser evidence prove the maintained ${evidence.capability} integration${semantics.noAuth ? ' with a no-auth provider' : ''}`,
    };
}
