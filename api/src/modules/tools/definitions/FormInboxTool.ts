/**
 * «اعرض رسائل النموذج» — the reading half of Stage 4's live data.
 *
 * The built site's visitors post into Joe's inbox; the OWNER reads them in
 * the chat, formatted, newest first, without ever opening a file. Scoped to
 * the session's own site/project ids — one session never reads another
 * session's messages.
 */
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { listSubmissions } from '../../../api/form-inbox';
import path from 'path';

export class FormInboxTool extends BaseTool {
    name = 'form_inbox';
    description = 'List the form submissions delivered to this session\'s built site or app.';
    version = '1.0.0';
    tags = ['forms', 'inbox', 'data'];
    inputSchema = { type: 'object' as const, properties: { request: { type: 'string' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const isAr = /[؀-ۿ]/.test(String(input?.request || '')) || true;

        // The ids this session's artifacts post under: the page's sessionKey
        // and the scaffolded project's directory name.
        const sites = [sessionKey];
        const proj = (global as any).joeProjects?.[sessionKey];
        if (proj?.dir) sites.push(path.basename(String(proj.dir)).replace(/[^a-zA-Z0-9._-]/g, ''));

        const subs = listSubmissions(sites, 20);
        if (!subs.length) {
            return {
                ok: true,
                output: { message: isAr ? '📭 لا توجد رسائل في صندوق النموذج بعد — عندما يملأ زائر نموذج موقعك (في المعاينة) ستصل هنا فوراً.' : '📭 No form messages yet.' },
                logs: [],
            } as any;
        }
        const fmt = (t: number) => new Date(t).toLocaleString('ar', { hour12: false });
        const lines = subs.map((s, i) => {
            const fields = Object.entries(s.fields).map(([k, v]) => `      ${k}: ${v}`).join('\n');
            return `   ${i + 1}. 🕐 ${fmt(s.at)}${s.page ? ` — ${s.page}` : ''}\n${fields}`;
        });
        return {
            ok: true,
            output: { message: `📬 صندوق رسائل موقعك — ${subs.length} رسالة (الأحدث أولاً):\n\n${lines.join('\n\n')}`, count: subs.length },
            logs: [],
        } as any;
    }
}
