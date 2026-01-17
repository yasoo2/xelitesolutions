
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { KnowledgeService } from '../../services/knowledge';

export class KnowledgeSearchTool extends BaseTool {
    name = 'knowledge_search';
    version = '1.0.0';
    tags = ['knowledge', 'search', 'rag'];
    inputSchema = { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] };
    outputSchema = { type: 'object' as const, properties: { results: { type: 'array' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = ['query'];

    async execute(input: any) {
        const query = String(input?.query ?? '');
        try {
            const results = await KnowledgeService.search(query);
            const mapped = results.map(r => ({
                id: r.document.id,
                filename: r.document.filename,
                snippet: r.snippet,
                score: r.score
            })).slice(0, 10);
            return { ok: true, output: { results: mapped }, logs: [`knowledge.search=${query} count=${results.length}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

export class KnowledgeAddTool extends BaseTool {
    name = 'knowledge_add';
    version = '1.0.0';
    tags = ['knowledge', 'add', 'rag'];
    inputSchema = {
        type: 'object' as const,
        properties: { filename: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['filename', 'content']
    };
    outputSchema = { type: 'object' as const, properties: { id: { type: 'string' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 10;
    auditFields = ['filename'];

    async execute(input: any) {
        const filename = String(input?.filename ?? 'unknown.txt');
        const content = String(input?.content ?? '');
        const tags = Array.isArray(input?.tags) ? input.tags : [];
        try {
            const doc = await KnowledgeService.add(filename, content, tags);
            return { ok: true, output: { id: doc.id }, logs: [`knowledge.add=${filename} id=${doc.id}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
