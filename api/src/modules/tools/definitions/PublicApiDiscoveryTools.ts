import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { apiDiscoveryService } from '../../../core/api-discovery/service';
import { selectionArtifact } from '../../../core/api-discovery/integration-profiles';
import type { ApiSearchQuery, RankedApiCandidate } from '../../../core/api-discovery/types';

type DiscoveryService = Pick<ReturnType<typeof apiDiscoveryService>, 'search' | 'validate'>;

export async function selectValidatedCandidate(
    service: DiscoveryService,
    input: ApiSearchQuery & { integrationRequired?: boolean },
    candidates: RankedApiCandidate[],
): Promise<{ selected?: RankedApiCandidate; candidates: RankedApiCandidate[]; attempted: string[]; allUnavailable: boolean }> {
    const eligible = candidates
        .filter(candidate => !input.integrationRequired || Boolean(candidate.integrationProfileId))
        .slice(0, 3);
    const attempted: string[] = [];
    for (const candidate of eligible) {
        const validated = await service.validate(candidate.id);
        attempted.push(candidate.id);
        if (validated.health !== 'UNAVAILABLE') {
            const refreshed = await service.search(input);
            return {
                selected: refreshed.find(item => item.id === candidate.id) || { ...candidate, ...validated },
                candidates: refreshed,
                attempted,
                allUnavailable: false,
            };
        }
    }
    return { candidates: await service.search(input), attempted, allUnavailable: eligible.length > 0 };
}

abstract class ApiDiscoveryTool extends BaseTool {
    version = '1.0.0';
    tags = ['api', 'discovery', 'safe-network'];
    permissions: ToolPermission[] = ['internet'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    mockSupported = false;
}

export class SearchPublicApisTool extends ApiDiscoveryTool {
    name = 'search_public_apis';
    description = 'Find and rank public APIs for a capability using Joe’s vetted catalog. Does not make arbitrary endpoint requests.';
    auditFields = ['query', 'category', 'requiresNoAuth', 'requiresHttps', 'requiresCors'];
    inputSchema = { type: 'object' as const, properties: { query: { type: 'string' }, category: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, requiresNoAuth: { type: 'boolean' }, requiresHttps: { type: 'boolean' }, requiresCors: { type: 'boolean' }, browserSide: { type: 'boolean' }, provider: { type: 'string' }, validateTop: { type: 'boolean' }, integrationRequired: { type: 'boolean' }, limit: { type: 'number', minimum: 1, maximum: 25 } }, required: ['query'] };
    outputSchema = { type: 'object' as const, properties: { candidates: { type: 'array' }, selection: { type: 'object' } } };
    async execute(input: any) {
        if (!String(input?.query || '').trim()) return { ok: false, error: 'query is required', logs: [] };
        try {
            const service = apiDiscoveryService();
            let candidates = await service.search(input);
            let selected = input?.integrationRequired === true
                ? candidates.find(candidate => Boolean(candidate.integrationProfileId))
                : candidates[0];
            if (input?.validateTop === true && selected) {
                const validation = await selectValidatedCandidate(service, input, candidates);
                candidates = validation.candidates;
                selected = validation.selected;
                if (validation.allUnavailable && !selected) {
                    return {
                        ok: false,
                        error: 'all_api_candidates_unavailable',
                        output: { candidates, validationAttempts: validation.attempted },
                        logs: ['API_SEARCH stopped: every maintained candidate validated as unavailable'],
                    };
                }
            }
            const selection = selected ? selectionArtifact(selected) : null;
            if (input?.integrationRequired === true && !selection) return { ok: false, error: 'no_maintained_integration_profile', output: { candidates }, logs: ['API_SEARCH found no safely integrable candidate'] };
            return { ok: true, output: { candidates, selected, ...(selection ? { selection } : {}) }, logs: [`API_SEARCH completed${input?.validateTop === true ? ' with safe validation' : ''}`] };
        }
        catch (error: any) { return { ok: false, error: String(error?.message || error), logs: ['API_SEARCH failed safely'] }; }
    }
}

export class InspectApiTool extends ApiDiscoveryTool {
    name = 'inspect_api';
    description = 'Inspect catalog metadata, auth, pricing, CORS, source, health, and warnings for one discovered API.';
    auditFields = ['apiId'];
    inputSchema = { type: 'object' as const, properties: { apiId: { type: 'string' } }, required: ['apiId'] };
    outputSchema = { type: 'object' as const, properties: { api: { type: 'object' } } };
    async execute(input: any) {
        const api = await apiDiscoveryService().inspect(String(input?.apiId || ''));
        return api ? { ok: true, output: { api }, logs: [] } : { ok: false, error: 'api_not_found', logs: [] };
    }
}

export class ValidateApiTool extends ApiDiscoveryTool {
    name = 'validate_api';
    description = 'Perform a cached, read-only, SSRF-protected health validation against a Joe-maintained API probe.';
    auditFields = ['apiId'];
    inputSchema = { type: 'object' as const, properties: { apiId: { type: 'string' }, force: { type: 'boolean' } }, required: ['apiId'] };
    outputSchema = { type: 'object' as const, properties: { api: { type: 'object' } } };
    async execute(input: any) {
        try { return { ok: true, output: { api: await apiDiscoveryService().validate(String(input?.apiId || ''), input?.force === true) }, logs: ['API_VALIDATION completed'] }; }
        catch (error: any) { return { ok: false, error: String(error?.message || error), logs: ['API_VALIDATION failed safely'] }; }
    }
}
