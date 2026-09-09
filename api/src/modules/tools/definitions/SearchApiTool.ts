
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { search, SafeSearchType } from 'duck-duck-scrape';
import { apiDiscoveryService } from '../../../core/api-discovery/service';

export class SearchApiTool extends BaseTool {
    name = 'search_api';
    description = 'Search the web, or use mode="public-api" to search Joe’s ranked public API catalog with HTTPS/auth/CORS metadata.';
    version = '1.0.0';
    tags = ['search', 'web', 'fast'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            query: { type: 'string' },
            limit: { type: 'number', default: 5 },
            mode: { type: 'string', enum: ['web', 'public-api'], default: 'web' },
            category: { type: 'string' },
            requiresNoAuth: { type: 'boolean' },
            requiresHttps: { type: 'boolean' },
            requiresCors: { type: 'boolean' },
            browserSide: { type: 'boolean' }
        },
        required: ['query']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            results: { type: 'array' }
        }
    };
    permissions: ToolPermission[] = ['internet'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = ['query'];

    async execute(input: any) {
        const query = String(input.query || '');
        const limit = Number(input.limit || 5);

        if (!query) return { ok: false, error: 'query is required', logs: [] };

        if (input?.mode === 'public-api') {
            try {
                const candidates = await apiDiscoveryService().search({ ...input, query, limit });
                return { ok: true, output: { results: candidates, candidates }, logs: [`API_SEARCH catalog query="${query}" found=${candidates.length}`] };
            } catch (e: any) {
                return { ok: false, error: `Catalog Search Failed: ${e.message}`, logs: ['API_SEARCH failed safely'] };
            }
        }

        try {
            const results = await search(query, {
                safeSearch: SafeSearchType.STRICT,
                offset: 0
            });

            if (results.noResults) {
                return { ok: true, output: { results: [] }, logs: ['No results found'] };
            }

            const simplified = results.results.slice(0, limit).map((r: any) => ({
                title: r.title,
                url: r.url,
                description: r.description
            }));

            return {
                ok: true,
                output: { results: simplified },
                logs: [`searched="${query}" found=${simplified.length}`]
            };

        } catch (e: any) {
            return { ok: false, error: `Search Failed: ${e.message}`, logs: [] };
        }
    }
}
