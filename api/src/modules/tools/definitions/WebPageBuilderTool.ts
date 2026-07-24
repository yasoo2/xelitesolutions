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
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');

        const isAr = /[؀-ۿ]/.test(request);

        // Per-session page memory: follow-up requests EDIT the current page instead
        // of regenerating a brand new one from scratch.
        const store: Record<string, { filename: string; html: string }> =
            (global as any).joePages || ((global as any).joePages = {});
        const prev = store[sessionKey];
        const wantsNew = /(new page|from scratch|صفحة جديدة|من الصفر|ابدأ من جديد)/i.test(request);
        const isEdit = !!prev && !wantsNew;

        if (sessionId) broadcastThinkingDetail(sessionId, isEdit
            ? (isAr ? `✏️ أعدّل الصفحة: ${request}` : `✏️ Editing the page: ${request}`)
            : (isAr ? `🏗️ أبني الصفحة: ${request}` : `🏗️ Building the page: ${request}`));

        const baseRules = `STRICT RULES:
- Output ONLY raw HTML for ONE complete self-contained file. No explanations, no markdown fences.
- ALL CSS in a <style> tag and ALL JS in a <script> tag (single file).
- Modern, beautiful, fully responsive. Use inline SVG / CSS gradients / emoji for graphics (never external image hosts / placeholder.com).
${isAr ? '- Arabic page: <html lang="ar" dir="rtl"> with Arabic text.' : ''}`;

        const systemPrompt = isEdit
            ? `You are an elite front-end engineer. MODIFY the existing HTML page: apply EXACTLY the change requested and keep everything else intact. Return the COMPLETE updated HTML file.
${baseRules}`
            : `You are an elite front-end engineer at XElite Solutions. Build a COMPLETE single self-contained HTML file for the request.
${baseRules}`;

        const userContent = isEdit
            ? `Change to apply: ${request}

CURRENT HTML (modify this and return the FULL updated file):
${prev!.html}`
            : request;

        let html = '';
        try {
            html = await routeToModel(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
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
            if (isEdit && prev) { html = prev.html; }
            else { html = `<!DOCTYPE html>\n<html lang="${isAr ? 'ar' : 'en'}"${isAr ? ' dir="rtl"' : ''}>\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>XElite</title></head>\n<body>\n${html}\n</body>\n</html>`; }
        }

        // Stable filename per session so the preview URL stays consistent across edits.
        const filename = (prev?.filename && /\.html?$/i.test(prev.filename))
            ? prev.filename
            : `joe-${sessionKey}.html`;
        try {
            fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
        } catch (e: any) {
            return { ok: false, error: `write_failed: ${e?.message || e}`, logs };
        }
        store[sessionKey] = { filename, html };
        logs.push(`web_page_builder: ${isEdit ? 'edited' : 'wrote'} ${filename} (${html.length} bytes) in ${ARTIFACT_DIR}`);

        // Cache-busting query so the Preview iframe RELOADS to show the change.
        const base = `http://localhost:${PORT}/artifacts/${filename}`;
        const url = `${base}?v=${Date.now()}`;

        // Stream the engineering steps to the terminal panel so the user SEES the work.
        const term = (line: string) => {
            try { ['local', 'default', 'panel-terminal'].forEach(id => broadcast({ type: 'terminal_output', id, data: line + '\r\n' } as any)); } catch { /* ignore */ }
        };
        term('web_page_builder: generating page with the local AI...');
        term('generated ' + html.length + ' bytes of HTML');
        term('wrote file: ' + filename);
        term('preview: ' + url);

        // Open it in the live Preview panel. Two signals for reliability: preview_ready
        // and a step_done carrying an internal URL (the UI auto-opens internal URLs).
        try {
            broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
            broadcast({ type: 'step_done', tool: 'web_page_builder', sessionId, data: { result: { ok: true, output: { url, previewUrl: url } } } } as any);
        } catch { /* non-fatal */ }
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `✅ تم تحديث الصفحة في المعاينة` : `✅ Page updated in Preview`);

        const codeBlock = '```html\n' + html + '\n```';
        const verb = isEdit ? (isAr ? 'تم تعديل الصفحة' : 'Updated the page') : (isAr ? 'تم بناء الصفحة' : 'Built the page');
        const message = isAr
            ? `✅ ${verb} وعُرضت في المعاينة.\n\n📄 الملف: ${filename}\n🌐 الرابط: ${base}\n\nاطلب أي تعديل آخر (مثل: «أضف زر» أو «غيّر اللون») وسيظهر مباشرة في المعاينة.\n\nالكود الكامل:\n${codeBlock}`
            : `✅ ${verb} and shown in Preview.\n\n📄 File: ${filename}\n🌐 URL: ${base}\n\nAsk for any further change (e.g. "add a button" / "change the color") and it updates live.\n\nFull code:\n${codeBlock}`;

        return { ok: true, output: { message, url, previewUrl: url, path: filename }, logs };
    }
}
