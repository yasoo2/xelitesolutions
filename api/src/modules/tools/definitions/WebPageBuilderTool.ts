import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
const PORT = String(process.env.PORT || '5002');

/**
 * WebPageBuilderTool - turns a "build me a page/site" request into REAL work:
 * it generates a complete self-contained HTML file, WRITES it to disk (served at
 * /artifacts), and opens it in the live Preview panel. This is what makes Joe act
 * like an engineering team (build + show) instead of just replying with code text.
 */
export class WebPageBuilderTool implements ToolDefinition {
    name = 'web_page_builder';
    version = '1.0.0';
    description = 'Generate a complete standalone web page (HTML/CSS/JS), write it to a file, and open it in the live preview.';
    tags = ['web', 'build', 'preview'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string' as const, description: 'Description of the page/site to build' },
            filename: { type: 'string' as const, description: 'Optional output filename (e.g. index.html)' }
        },
        required: ['request']
    };

    get parameters() { return this.inputSchema; }

    outputSchema = { type: 'object' as const };
    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 0;
    auditFields = [];
    mockSupported = false;

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const request = String(
            input?.request || input?.question || input?.instruction || input?.task || input?.goal || ''
        ).trim();
        const sessionId = context?.sessionId;
        if (!request) return { ok: false, error: 'no_request', logs };

        const isAr = /[؀-ۿ]/.test(request);
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `🏗️ أبني الصفحة: ${request}` : `🏗️ Building the page: ${request}`);

        const systemPrompt = `You are an elite front-end engineer at XElite Solutions.
Build a COMPLETE, single self-contained HTML file for the user's request.
STRICT RULES:
- Output ONLY raw HTML. No explanations, no markdown code fences.
- Put ALL CSS inside a <style> tag and ALL JavaScript inside a <script> tag (one single file).
- Modern, beautiful, fully responsive design with real layout, spacing and colors.
- For graphics use inline SVG, CSS gradients or emoji. Do NOT reference external image hosts that may 404 (never use placeholder.com).
${isAr ? '- The page is in Arabic: set <html lang="ar" dir="rtl"> and write all visible text in Arabic.' : ''}`;

        let html = '';
        try {
            html = await routeToModel(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: request }],
                undefined, undefined, undefined, undefined, undefined, undefined, context
            );
        } catch (e: any) {
            return { ok: false, error: `generation_failed: ${e?.message || e}`, logs };
        }

        // Extract clean HTML from whatever the model returned.
        html = String(html || '').trim();
        const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (fence) html = fence[1].trim();
        const docIdx = html.search(/<!DOCTYPE html>|<html[\s>]/i);
        if (docIdx > 0) html = html.slice(docIdx);
        if (!/<html[\s>]/i.test(html)) {
            html = `<!DOCTYPE html>\n<html lang="${isAr ? 'ar' : 'en'}"${isAr ? ' dir="rtl"' : ''}>\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>XElite</title></head>\n<body>\n${html}\n</body>\n</html>`;
        }

        // Write the file into the artifacts dir (served by the API at /artifacts).
        let filename = String(input?.filename || '').trim();
        if (!filename || !/\.html?$/i.test(filename)) filename = `page-${Date.now()}.html`;
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        try {
            fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
        } catch (e: any) {
            return { ok: false, error: `write_failed: ${e?.message || e}`, logs };
        }
        logs.push(`web_page_builder: wrote ${filename} (${html.length} bytes) to ${ARTIFACT_DIR}`);

        const url = `http://localhost:${PORT}/artifacts/${filename}`;

        // Open it in the live Preview panel (frontend switches to the preview tab).
        try {
            broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
        } catch { /* non-fatal */ }
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `✅ تم بناء الصفحة وفتحها في المعاينة` : `✅ Page built and opened in Preview`);

        const message = isAr
            ? `✅ تم بناء الصفحة فعلياً وحفظها وعرضها في نافذة المعاينة (Preview).\n\n📄 الملف: ${filename}\n🌐 الرابط: ${url}\n\nاطلب أي تعديل وسأعيد بناءها.`
            : `✅ Built the page for real, saved it, and opened it in the Preview panel.\n\n📄 File: ${filename}\n🌐 URL: ${url}\n\nAsk for any change and I'll rebuild it.`;

        return { ok: true, output: { message, url, previewUrl: url, path: filename }, logs };
    }
}
