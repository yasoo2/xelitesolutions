
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { search, SafeSearchType } from 'duck-duck-scrape';
import { searchWeb } from '../../../core/engine/web-search';

/**
 * THE WEB, SEARCHED THE WAY THE ENGINE SEARCHES IT.
 *
 * The Manus-style exam, 2026-11-09 (M04): this tool scraped DuckDuckGo alone,
 * and a few searches in a row ended the run with «Search Failed: DDG detected
 * an anomaly in the request, you are likely making requests too quickly». The
 * engine's own search (core/engine/web-search.ts) asks several public sources
 * in turn — Brave, news feeds, an instant answer, Wikipedia — and rests one that
 * refused. This tool asks it first; the DuckDuckGo scrape is the last resort.
 */
export class SearchApiTool extends BaseTool {
    name = 'search_api';
    description = 'Search the public web with strict safe-search filtering.';
    version = '1.1.0';
    tags = ['search', 'web', 'fast'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            query: { type: 'string' },
            limit: { type: 'number', default: 5 },
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
        const limit = Math.max(1, Math.min(10, Number(input.limit || 5)));

        if (!query) return { ok: false, error: 'query is required', logs: [] };

        let engineNote = '';
        try {
            const found = await searchWeb(query, { count: limit });
            if (found.hits.length) {
                return {
                    ok: true,
                    output: { results: found.hits.slice(0, limit).map(h => ({ title: h.title, url: h.url, description: h.snippet })), provider: found.provider },
                    logs: [`searched="${query}" found=${Math.min(limit, found.hits.length)} via ${found.provider}`],
                };
            }
            engineNote = found.note || 'no result';
        } catch (e: any) {
            engineNote = String(e?.message || e);
        }

        try {
            const results = await search(query, {
                safeSearch: SafeSearchType.STRICT,
                offset: 0
            });

            if (results.noResults) {
                return { ok: true, output: { results: [] }, logs: ['No results found', `web search: ${engineNote}`] };
            }

            const simplified = results.results.slice(0, limit).map((r: any) => ({
                title: r.title,
                url: r.url,
                description: r.description
            }));

            return {
                ok: true,
                output: { results: simplified, provider: 'duckduckgo' },
                logs: [`searched="${query}" found=${simplified.length} via duckduckgo (web search: ${engineNote})`]
            };

        } catch (e: any) {
            return { ok: false, error: `Search Failed: ${e.message} (and the web search before it: ${engineNote})`, logs: [] };
        }
    }
}
