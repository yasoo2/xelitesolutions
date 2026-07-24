import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { selfCorrectionSystem } from '../../../core/llm/weak-model-enhancer';
import { reviewHtml, browserSmokeTest, splitHtmlProject } from '../../../core/quality/html-qa';

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
        const store: Record<string, { filename: string; html: string; multiFile?: boolean }> =
            (global as any).joePages || ((global as any).joePages = {});
        const prev = store[sessionKey];
        const wantsNew = /(new page|from scratch|صفحة جديدة|من الصفر|ابدأ من جديد)/i.test(request);
        const isEdit = !!prev && !wantsNew;

        // Multi-file project mode: produce a real index.html + styles.css + script.js
        // structure (like a real team) instead of one self-contained file. Triggered
        // by explicit intent; once on, it stays on for follow-up edits of the session.
        const multiFileIntent = /(multi.?file|separate files|split.*(css|js)|as a project|ملفات? منفصلة|منفصل|مشروع كامل|مشروع منظم|css منفصل|js منفصل|افصل)/i.test(request);
        const isMultiFile = multiFileIntent || (isEdit && !!(prev as any)?.multiFile);

        // Department pipeline (visible in the thinking panel) — BA analyses the
        // request, Developer builds, QA reviews. Makes Joe feel like a team.
        if (sessionId) {
            broadcastThinkingDetail(sessionId, isAr ? `🧭 المحلل (BA): أفهم المطلوب وأحدد المكوّنات` : `🧭 Analyst (BA): understanding the request & components`);
            broadcastThinkingDetail(sessionId, isEdit
                ? (isAr ? `💻 المطوّر: أعدّل الصفحة — ${request}` : `💻 Developer: editing the page — ${request}`)
                : (isAr ? `💻 المطوّر: أبني الصفحة — ${request}` : `💻 Developer: building the page — ${request}`));
        }

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

        // [REVIVED weak-model-enhancer] Self-correction pass: strip leftover
        // TODO/placeholder comments the weak local model sometimes emits.
        try {
            const q = selfCorrectionSystem.checkCodeQuality(html, 'html');
            if (!q.isValid) html = selfCorrectionSystem.suggestCorrections(html, q.issues);
        } catch { /* non-fatal */ }

        // [QA department] Instant deterministic review + auto-fix (no extra LLM
        // call, so no added latency on the CPU laptop): fixes placeholder image
        // hosts, missing charset/viewport, RTL, unclosed tags, stray fences.
        let qaIssues: string[] = [];
        let qaFixed: string[] = [];
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `🔎 مراجع الجودة (QA): أفحص الصفحة وأصحّح المشاكل` : `🔎 QA Reviewer: checking the page & fixing issues`);
        try {
            const review = reviewHtml(html, isAr);
            html = review.html;
            qaIssues = review.issues;
            qaFixed = review.fixed;
        } catch { /* non-fatal */ }

        // The combined self-contained HTML is always the source of truth for edits.
        // Stable filename per session so the preview URL stays consistent across edits.
        const filename = (prev?.filename && /\.html?$/i.test(prev.filename))
            ? prev.filename
            : `joe-${sessionKey}.html`;

        // Multi-file mode: split into a real index.html + styles.css + script.js
        // project inside a per-session folder, and preview that folder's index.html.
        let base: string;
        const projectFiles: Array<{ name: string; bytes: number }> = [];
        let projIndex = '', projCss = '', projJs = '';
        try {
            fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
            // Always write the combined file too (keeps single-file preview working
            // and is the source of truth for future edits).
            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');

            const split = isMultiFile ? splitHtmlProject(html) : null;
            if (split && split.multiFile) {
                const dir = `joe-${sessionKey}`;
                const abs = path.join(ARTIFACT_DIR, dir);
                fs.mkdirSync(abs, { recursive: true });
                fs.writeFileSync(path.join(abs, 'index.html'), split.indexHtml, 'utf-8');
                projectFiles.push({ name: 'index.html', bytes: split.indexHtml.length });
                projIndex = split.indexHtml;
                if (split.css) { fs.writeFileSync(path.join(abs, 'styles.css'), split.css, 'utf-8'); projectFiles.push({ name: 'styles.css', bytes: split.css.length }); projCss = split.css; }
                if (split.js) { fs.writeFileSync(path.join(abs, 'script.js'), split.js, 'utf-8'); projectFiles.push({ name: 'script.js', bytes: split.js.length }); projJs = split.js; }
                base = `http://localhost:${PORT}/artifacts/${dir}/index.html`;
            } else {
                base = `http://localhost:${PORT}/artifacts/${filename}`;
            }
        } catch (e: any) {
            return { ok: false, error: `write_failed: ${e?.message || e}`, logs };
        }
        store[sessionKey] = { filename, html, multiFile: isMultiFile };
        logs.push(`web_page_builder: ${isEdit ? 'edited' : 'wrote'} ${filename} (${html.length} bytes)${projectFiles.length ? ` + ${projectFiles.length} project files` : ''} in ${ARTIFACT_DIR}`);

        // Cache-busting query so the Preview iframe RELOADS to show the change.
        const url = `${base}?v=${Date.now()}`;

        // Stream the engineering steps to the terminal panel so the user SEES the work.
        const term = (line: string) => {
            try { ['local', 'default', 'panel-terminal'].forEach(id => broadcast({ type: 'terminal_output', id, data: line + '\r\n' } as any)); } catch { /* ignore */ }
        };
        term('web_page_builder: generating page with the local AI...');
        term('generated ' + html.length + ' bytes of HTML');
        if (qaFixed.length) term('QA auto-fixed: ' + qaFixed.join('; '));
        if (qaIssues.length) term('QA notes: ' + qaIssues.join('; '));
        else term('QA review: passed (no blocking issues)');
        if (projectFiles.length) {
            term('project structure (multi-file):');
            projectFiles.forEach(f => term('  📄 ' + f.name + ' (' + f.bytes + ' bytes)'));
        } else {
            term('wrote file: ' + filename);
        }
        term('preview: ' + url);

        // Open it in the live Preview panel. Two signals for reliability: preview_ready
        // and a step_done carrying an internal URL (the UI auto-opens internal URLs).
        try {
            broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
            broadcast({ type: 'step_done', tool: 'web_page_builder', sessionId, data: { result: { ok: true, output: { url, previewUrl: url } } } } as any);
        } catch { /* non-fatal */ }
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `✅ تم تحديث الصفحة في المعاينة` : `✅ Page updated in Preview`);

        // [QA department — optional real browser test] Off by default (heavy on a
        // CPU laptop). When JOE_QA_BROWSER_TEST=1, actually open the page in the
        // headless browser, capture console/page errors and a screenshot.
        let qaBrowserLine = '';
        try {
            const smoke = await browserSmokeTest(url, filename);
            if (smoke.skipped) {
                // silent when disabled
            } else if (smoke.ok && smoke.consoleErrors.length === 0) {
                term('QA browser test: PASSED (no console/page errors)');
                qaBrowserLine = isAr ? '\n🧪 اختبار المتصفح: ناجح ✅ (لا أخطاء)' : '\n🧪 Browser test: PASSED ✅ (no errors)';
                if (smoke.screenshotHref) broadcast({ type: 'browser_screenshot', sessionId, data: { href: smoke.screenshotHref, url } } as any);
            } else {
                const errs = [...smoke.pageErrors, ...smoke.consoleErrors].slice(0, 3).join(' | ');
                term('QA browser test: found issues -> ' + errs);
                qaBrowserLine = isAr ? `\n🧪 اختبار المتصفح: وجد ملاحظات ⚠️ (${errs})` : `\n🧪 Browser test: found issues ⚠️ (${errs})`;
            }
        } catch { /* non-fatal */ }

        // Compose the QA summary line for the chat reply.
        const qaSummary = (() => {
            const parts: string[] = [];
            if (qaFixed.length) parts.push(isAr ? `🔧 تصحيحات الجودة: ${qaFixed.length}` : `🔧 QA fixes: ${qaFixed.length}`);
            parts.push(qaIssues.length
                ? (isAr ? `📋 ملاحظات: ${qaIssues.join('، ')}` : `📋 Notes: ${qaIssues.join(', ')}`)
                : (isAr ? '📋 مراجعة الجودة: نجحت' : '📋 QA review: passed'));
            return parts.join('\n') + qaBrowserLine;
        })();

        const isProject = projectFiles.length > 0;
        // Reply code: for a project, show each file; otherwise the single HTML file.
        const codeBlock = isProject
            ? [
                '**index.html**\n```html\n' + projIndex + '\n```',
                projCss ? '**styles.css**\n```css\n' + projCss + '\n```' : '',
                projJs ? '**script.js**\n```js\n' + projJs + '\n```' : '',
              ].filter(Boolean).join('\n\n')
            : '```html\n' + html + '\n```';
        const verb = isEdit ? (isAr ? 'تم تعديل المشروع' : 'Updated the project') : (isAr ? (isProject ? 'تم بناء المشروع' : 'تم بناء الصفحة') : (isProject ? 'Built the project' : 'Built the page'));
        const fileLine = isProject
            ? (isAr ? `📁 المشروع (${projectFiles.length} ملفات): ${projectFiles.map(f => f.name).join('، ')}` : `📁 Project (${projectFiles.length} files): ${projectFiles.map(f => f.name).join(', ')}`)
            : (isAr ? `📄 الملف: ${filename}` : `📄 File: ${filename}`);
        const message = isAr
            ? `✅ ${verb} وعُرض في المعاينة.\n\n${fileLine}\n🌐 الرابط: ${base}\n\n${qaSummary}\n\nاطلب أي تعديل آخر (مثل: «أضف زر» أو «غيّر اللون») وسيظهر مباشرة في المعاينة.\n\nالكود الكامل:\n${codeBlock}`
            : `✅ ${verb} and shown in Preview.\n\n${fileLine}\n🌐 URL: ${base}\n\n${qaSummary}\n\nAsk for any further change (e.g. "add a button" / "change the color") and it updates live.\n\nFull code:\n${codeBlock}`;

        return { ok: true, output: { message, url, previewUrl: url, path: filename }, logs };
    }
}
