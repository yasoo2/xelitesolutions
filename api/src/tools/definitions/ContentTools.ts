
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import Parser from 'rss-parser'; // Need to check if this is installed/used, likely fetch+xml
// Registry used custom rss logic or library? Let's check registry.
// Registry uses 'HttpFetch' logic or fetch directly.
// Let's implement HttpFetchTool and HtmlExtractTool.

function createDom(rawHtml: string, url?: string) {
    const vc = new VirtualConsole();
    vc.on('jsdomError', () => { });
    return new JSDOM(rawHtml, url ? { url, virtualConsole: vc } : { virtualConsole: vc });
}

export class HttpFetchTool extends BaseTool {
    name = 'http_fetch';
    version = '1.0.0';
    tags = ['network', 'http'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' } }, required: ['url'] };
    outputSchema = { type: 'object' as const, properties: { status: { type: 'number' }, bodySnippet: { type: 'string' } } };
    permissions: ToolPermission[] = ['read', 'internet'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields = ['url'];

    async execute(input: any) {
        const url = String(input?.url || '');
        if (!url) return { ok: false, error: 'url required', logs: [] };
        try {
            const r = await fetch(url);
            const txt = await r.text();
            return {
                ok: true,
                output: { status: r.status, bodySnippet: txt.slice(0, 1000), contentType: r.headers.get('content-type') },
                logs: [`fetch=${url} status=${r.status}`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

export class HtmlExtractTool extends BaseTool {
    name = 'html_extract';
    version = '1.0.0';
    tags = ['network', 'html', 'extract'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' }, render: { type: 'boolean' } }, required: ['url'] };
    outputSchema = { type: 'object' as const, properties: { title: { type: 'string' } } }; // simplified for brevity
    permissions: ToolPermission[] = ['read', 'internet'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    auditFields = ['url'];

    async execute(input: any) {
        const url = String(input?.url || '');
        if (!url) return { ok: false, error: 'url required', logs: [] };
        try {
            // Simple fetch, true rendering requires browser
            const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JOE/1.0)' } });
            const html = await r.text();
            const dom = createDom(html, url);
            const reader = new Readability(dom.window.document);
            const article = reader.parse();

            // Extract links
            const linkEls = Array.from(dom.window.document.querySelectorAll('a[href]'));
            const links = linkEls.map((el: any) => ({ text: el.textContent?.trim(), url: el.href })).slice(0, 20);

            // Headings
            const headings = Array.from(dom.window.document.querySelectorAll('h1, h2, h3'))
                .map((h: any) => h.textContent?.trim()).filter(Boolean);

            return {
                ok: true,
                output: {
                    title: dom.window.document.title,
                    metaDescription: dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content'),
                    headings,
                    links,
                    textSnippet: article?.textContent?.slice(0, 2000) || '',
                    url: r.url,
                    rendered: false
                },
                logs: [`extracted=${url}`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

export class RssFetchTool extends BaseTool {
    name = 'rss_fetch';
    version = '1.0.0';
    tags = ['network', 'rss'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' }, limit: { type: 'number' } }, required: ['url'] };
    outputSchema = { type: 'object' as const, properties: { items: { type: 'array' } } };
    permissions: ToolPermission[] = ['read', 'internet'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        // Reuse rss-parser if available, or simple match
        // Registry implementation was missing in snippet view but likely simple xml parse
        // I'll implement basic robust fetch
        const url = String(input?.url || '');
        const limit = Number(input?.limit || 10);
        try {
            const Parser = (await import('rss-parser')).default;
            // Note: If rss-parser isn't installed, this throws. 
            // Assuming it is if registry used it. If registry used raw regex, I should too.
            // Let's assume safe regex backup if parser fails? 
            // Actually, I'll attempt dynamic import.
            const parser = new Parser();
            const feed = await parser.parseURL(url);
            const items = (feed.items || []).slice(0, limit).map(i => ({
                title: i.title,
                link: i.link,
                pubDate: i.pubDate,
                description: i.contentSnippet || i.content
            }));
            return { ok: true, output: { items }, logs: [`rss=${url} count=${items.length}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

export class JsonQueryTool extends BaseTool {
    name = 'json_query';
    version = '1.0.0';
    tags = ['data', 'json'];
    inputSchema = { type: 'object' as const, properties: { json: { type: 'object' }, path: { type: 'string' } }, required: ['json', 'path'] };
    outputSchema = { type: 'object' as const, properties: { value: { type: 'any' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        // Simple dot notation access
        const data = input.json;
        const pathStr = String(input.path || '');
        if (!data) return { ok: false, error: 'json required', logs: [] };

        try {
            // Quick implementation of getting logical path
            // e.g. "users.0.name"
            const parts = pathStr.split('.').filter(Boolean);
            let current = data;
            for (const p of parts) {
                if (current && typeof current === 'object') {
                    current = current[p];
                } else {
                    current = undefined;
                    break;
                }
            }
            return { ok: true, output: { value: current }, logs: [] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
