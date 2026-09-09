import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { apiDiscoveryService } from '../../../core/api-discovery/service';

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
    inputSchema = { type: 'object' as const, properties: { query: { type: 'string' }, category: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, requiresNoAuth: { type: 'boolean' }, requiresHttps: { type: 'boolean' }, requiresCors: { type: 'boolean' }, browserSide: { type: 'boolean' }, provider: { type: 'string' }, validateTop: { type: 'boolean' }, limit: { type: 'number', minimum: 1, maximum: 25 } }, required: ['query'] };
    outputSchema = { type: 'object' as const, properties: { candidates: { type: 'array' } } };
    async execute(input: any) {
        if (!String(input?.query || '').trim()) return { ok: false, error: 'query is required', logs: [] };
        try {
            const service = apiDiscoveryService();
            let candidates = await service.search(input);
            let selected = candidates[0];
            if (input?.validateTop === true && selected) {
                const validated = await service.validate(selected.id);
                candidates = await service.search(input);
                selected = candidates.find(candidate => candidate.id === validated.id) || candidates[0];
            }
            return { ok: true, output: { candidates, selected }, logs: [`API_SEARCH completed${input?.validateTop === true ? ' with safe validation' : ''}`] };
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
    description = 'Perform a cached, read-only, SSRF-protected health validation of one catalog API documentation host.';
    auditFields = ['apiId'];
    inputSchema = { type: 'object' as const, properties: { apiId: { type: 'string' }, force: { type: 'boolean' } }, required: ['apiId'] };
    outputSchema = { type: 'object' as const, properties: { api: { type: 'object' } } };
    async execute(input: any) {
        try { return { ok: true, output: { api: await apiDiscoveryService().validate(String(input?.apiId || ''), input?.force === true) }, logs: ['API_VALIDATION completed'] }; }
        catch (error: any) { return { ok: false, error: String(error?.message || error), logs: ['API_VALIDATION failed safely'] }; }
    }
}
