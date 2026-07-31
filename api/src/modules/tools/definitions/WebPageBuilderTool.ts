import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { selfCorrectionSystem } from '../../../core/llm/weak-model-enhancer';
import { reviewHtml, browserSmokeTest, splitHtmlProject } from '../../../core/quality/html-qa';
import { auditVisually, visualRepairBrief, type VisualFinding } from '../../../core/quality/visual-audit';
import { workspaceService } from '../../services/WorkspaceService';
import { buildPalette, paletteCss, designBrief, uiKitCss, uiKitScript } from '../../../core/design/design-system';
import { detectPageKind, blueprintBrief, imageBudget } from '../../../core/design/blueprints';
import { resolveImages, creditsBlock } from '../../../core/design/images';
import { extractRequirements, verifyContent, wireNavigation, repairBrief, type ContentIssue } from '../../../core/design/content-contract';
import { buildImageBrief } from '../../../core/design/image-brief';
import { pickArchetype, layoutCss, layoutBrief, pickTypePair, typographyCss, primitivesCss, primitivesBrief, iconSprite } from '../../../core/design/layouts';

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
        // The palette and page kind are remembered with the page: a follow-up edit
        // must not re-roll the colours or re-decide what the page is.
        const store: Record<string, { filename: string; html: string; multiFile?: boolean; palette?: any; kind?: any; archetype?: any; typePair?: any }> =
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

        // [DESIGN SYSTEM] The look is decided BEFORE the model writes anything:
        // a harmonious palette whose contrast is correct by construction, real
        // type/space scales, and the section blueprint for THIS kind of page.
        // The old brief was one line ("modern, beautiful, responsive"), which is
        // why every page came out looking like a different prototype.
        const palette = isEdit && (prev as any)?.palette ? (prev as any).palette : buildPalette(request);
        const kind = isEdit && (prev as any)?.kind ? (prev as any).kind : detectPageKind(request);
        const photos = imageBudget(kind);
        // The vocabulary of THIS business, so a photo search has something
        // specific to match against instead of "business people".
        const imageBrief = buildImageBrief(request);
        // Composition and type pairing are DECISIONS, made here. Left to the model
        // every page came out as the same stack of centred boxes with Arial on it.
        const archetype = (isEdit && (prev as any)?.archetype) || pickArchetype(kind, request);
        const typePair = (isEdit && (prev as any)?.typePair) || pickTypePair(request);

        const baseRules = `STRICT RULES:
- Output ONLY raw HTML for ONE complete self-contained file. No explanations, no markdown fences.
- ALL CSS in a <style> tag and ALL JS in a <script> tag (single file).
- Fully responsive, mobile-first. Icons: inline SVG (never an icon font, never a CDN).
${photos > 0
                ? `- PHOTOGRAPHS: write src="{{IMAGE:slot|specific english subject}}" wherever a real photo belongs.
  slot is one of: hero, banner, card, gallery, thumb, avatar — it tells Joe what SHAPE to fetch and
  how to crop it. e.g. src="{{IMAGE:hero|software developers pair programming}}",
  src="{{IMAGE:avatar|smiling professional woman portrait}}".
  Use about ${photos} of them, each with a DIFFERENT subject, and always a real alt attribute.
  The subject must name something THIS business actually does — "business people" or "office" are
  useless to a photo archive and will be replaced. Never link an external image URL yourself.${imageBrief.suggestions.length
                    ? `\n  Subjects that fit this brief: ${imageBrief.suggestions.slice(0, 8).join('; ')}.` : ''}`
                : `- This page type needs no photographs: use inline SVG, gradients and type instead.`}
${isAr ? '- Arabic page: <html lang="ar" dir="rtl"> with natural Arabic copy (not translated-sounding).' : ''}

${designBrief(palette)}

TOKEN BLOCK — paste verbatim at the very top of your <style>:
${paletteCss(palette)}

${blueprintBrief(kind)}

${layoutBrief(archetype, typePair)}

${primitivesBrief()}`;

        const systemPrompt = isEdit
            ? `You are an elite front-end engineer. MODIFY the existing HTML page: apply EXACTLY the change requested and keep everything else intact — same design system, same tokens, same sections unless the change asks otherwise. Return the COMPLETE updated HTML file.
${baseRules}`
            : `You are an award-winning front-end designer and engineer. Build a COMPLETE single self-contained HTML file that would pass as the work of a professional studio: considered typography, real content, genuine interaction — not a wireframe.
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

        // [TRUNCATION] A provider caps a single completion — Groq's free tier
        // allows ~4000 tokens, about 12 KB of HTML, and less for Arabic. A page
        // with a full set of sections is bigger than that, so the model stops
        // mid-element. The QA pass then quietly closes the dangling tags and the
        // run reports success: the user receives half a page and is told it is
        // finished. Detect the cut and ask the model to CONTINUE from exactly
        // where it stopped, stitching until the document closes.
        let continuations = 0;
        let stillTruncated = false;
        if (html && !/<\/html\s*>/i.test(html)) {
            while (!/<\/html\s*>/i.test(html) && continuations < 3) {
                continuations++;
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `📝 الصفحة أطول من حدّ الرد الواحد — أُكمل الجزء ${continuations + 1}`
                    : `📝 Page exceeds one response — writing part ${continuations + 1}`);
                let part = '';
                try {
                    part = await routeToModel([
                        { role: 'system', content: `You are continuing an HTML file that was cut off mid-generation. Output ONLY the raw HTML that comes NEXT — no markdown fences, no explanation, no repetition of what is already written, and do NOT start a new document. Continue from the exact character where the text below ends, and finish the document properly with </body></html>.\n\nSTYLE: keep using the same CSS custom properties and section rhythm already present.` },
                        { role: 'user', content: `The file so far ends with:\n\n${html.slice(-2400)}\n\nContinue.` },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch (e: any) { logs.push(`continuation ${continuations} failed: ${e?.message || e}`); break; }

                part = String(part || '').trim();
                const pf = part.match(/```(?:html)?\s*([\s\S]*?)```/i);
                if (pf) part = pf[1].trim();
                // A model that restarts the document instead of continuing would
                // duplicate the whole page — drop everything before its restart.
                const restart = part.search(/<!DOCTYPE html>|<html[\s>]/i);
                if (restart >= 0) part = part.slice(part.indexOf('>', restart) + 1);
                if (!part) break;
                html += (html.endsWith('\n') ? '' : '\n') + part;
                logs.push(`continuation ${continuations}: +${part.length} bytes`);
            }
            stillTruncated = !/<\/html\s*>/i.test(html);
            if (stillTruncated) logs.push('page still incomplete after continuations');
        }
        let editFellBack = false;
        if (!/<html[\s>]/i.test(html)) {
            if (isEdit && prev) { html = prev.html; editFellBack = true; }
            else { html = `<!DOCTYPE html>\n<html lang="${isAr ? 'ar' : 'en'}"${isAr ? ' dir="rtl"' : ''}>\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>XElite</title></head>\n<body>\n${html}\n</body>\n</html>`; }
        }
        // Detect a no-op edit: the model returned HTML identical to the current page
        // (weak models sometimes echo it back). We must NOT claim we changed it.
        const editNoOp = isEdit && !!prev && (editFellBack || html.trim() === prev.html.trim());

        // [CONTENT CONTRACT] The design stopped depending on the model's goodwill
        // once the rules were applied to the CSS. Content had no such check, and
        // shipped a pricing section with no prices, testimonials with no names,
        // three cards carrying one sentence with a word swapped, and two buttons
        // the user named that were never built. Content cannot be manufactured
        // here — inventing a price would be fabrication — so it is VERIFIED, the
        // mechanical parts are repaired, and the rest goes back to the model as a
        // precise list, exactly like compiler errors.
        const requirements = extractRequirements(request);
        let contentIssues: ContentIssue[] = [];
        let contentRepairs = 0;
        {
            const nav = wireNavigation(html);
            html = nav.html;
            for (const f of nav.fixed) logs.push(`content: ${f}`);

            contentIssues = verifyContent(html, requirements);
            if (contentIssues.some(i => i.repairable)) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `🔍 مراجع المحتوى: ${contentIssues.length} ملاحظة — أُعيدها للمطوّر`
                    : `🔍 Content reviewer: ${contentIssues.length} issue(s) — sending back for repair`);
                try {
                    const repaired = await routeToModel([
                        { role: 'system', content: repairBrief(contentIssues, isAr) },
                        { role: 'user', content: html },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                    let fixedHtml = String(repaired || '').trim();
                    const rf = fixedHtml.match(/```(?:html)?\s*([\s\S]*?)```/i);
                    if (rf) fixedHtml = rf[1].trim();
                    const di = fixedHtml.search(/<!DOCTYPE html>|<html[\s>]/i);
                    if (di > 0) fixedHtml = fixedHtml.slice(di);
                    // Only accept a repair that is still a complete document and did
                    // not shrink the page — a truncated "fix" is worse than the fault.
                    if (/<\/html\s*>/i.test(fixedHtml) && fixedHtml.length > html.length * 0.7) {
                        const after = verifyContent(fixedHtml, requirements);
                        if (after.length < contentIssues.length) {
                            contentRepairs = contentIssues.length - after.length;
                            html = fixedHtml;
                            contentIssues = after;
                            logs.push(`content: repaired ${contentRepairs} issue(s)`);
                        } else { logs.push('content: repair did not improve the page, kept the original'); }
                    } else { logs.push('content: repair returned an incomplete page, kept the original'); }
                } catch (e: any) { logs.push(`content repair failed: ${e?.message || e}`); }
            }
        }

        // [UI KIT] Inject the component layer as a BASE stylesheet — buttons,
        // fields, nav spacing, card hover, focus rings and scroll-reveal motion.
        // The brief asked for all of it and the model shipped a page with zero
        // transitions, zero :hover, zero :focus and no rule for `button` at all.
        // Placed right after <style> so anything the model DID write still wins.
        const baseLayer = `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${primitivesCss()}`;
        if (/<style[^>]*>/i.test(html)) {
            html = html.replace(/<style([^>]*)>/i, `<style$1>\n${baseLayer}\n`);
        } else if (/<\/head>/i.test(html)) {
            html = html.replace(/<\/head>/i, `<style>\n${baseLayer}\n</style>\n</head>`);
        }
        // The drawn icon set, once per document, before anything can reference it.
        if (!/id="i-check"/.test(html)) {
            html = /<body[^>]*>/i.test(html)
                ? html.replace(/(<body[^>]*>)/i, `$1\n${iconSprite()}`)
                : iconSprite() + html;
        }
        if (!/data-reveal/.test(html)) {
            html = /<\/body>/i.test(html)
                ? html.replace(/<\/body>/i, `${uiKitScript()}\n</body>`)
                : html + uiKitScript();
        }

        // [PHOTOGRAPHS] Turn every {{IMAGE:subject}} marker into a real licensed
        // photograph, downloaded once and served from Joe so the page keeps its
        // images with no internet. No network -> a gradient in the page's own
        // palette, never a broken image and never a claim of a photo we lack.
        let imgReal = 0, imgRequested = 0, imgBytes = 0;
        let imgCredits: Array<{ creator: string; license: string; source: string }> = [];
        if (photos > 0 && /\{\{\s*IMAGE\s*:/i.test(html)) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `🖼️ أجلب صوراً حقيقية مرخّصة للصفحة` : `🖼️ Sourcing real licensed photographs`);
            try {
                const r = await resolveImages(html, ARTIFACT_DIR, palette.hue, { max: Math.max(4, photos + 2), brief: imageBrief });
                html = r.html; imgReal = r.real; imgRequested = r.requested; imgCredits = r.credits; imgBytes = r.bytes;
                // Creative-Commons licences require attribution IN THE PAGE, not in
                // a chat message the visitor never sees. Without this the published
                // page is in breach of the licence of every photo on it.
                const credits = creditsBlock(r.credits, isAr);
                if (credits) {
                    html = /<\/body>/i.test(html)
                        ? html.replace(/<\/body>/i, `${credits}</body>`)
                        : html + credits;
                }
                logs.push(`images: ${r.real}/${r.requested} real, ${Math.round(r.bytes / 1024)} KB, rest gradient`);
            } catch (e: any) { logs.push(`image sourcing failed: ${e?.message || e}`); }
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
        store[sessionKey] = { filename, html, multiFile: isMultiFile, palette, kind, archetype, typePair };
        logs.push(`web_page_builder: ${isEdit ? 'edited' : 'wrote'} ${filename} (${html.length} bytes)${projectFiles.length ? ` + ${projectFiles.length} project files` : ''} in ${ARTIFACT_DIR}`);

        // [BROWSABLE OUTPUT] Mirror the generated file(s) into the active workspace
        // root under joe-output/<session>/ so they show up in the file explorer and
        // the user can browse/edit them. Best-effort; preview still serves from
        // ARTIFACT_DIR. Then tell the UI to refresh the tree.
        try {
            const root = workspaceService.getActiveRoot(context?.workspaceId);
            const outDir = path.join(root, 'joe-output', `joe-${sessionKey}`);
            fs.mkdirSync(outDir, { recursive: true });
            if (projectFiles.length) {
                fs.writeFileSync(path.join(outDir, 'index.html'), projIndex, 'utf-8');
                if (projCss) fs.writeFileSync(path.join(outDir, 'styles.css'), projCss, 'utf-8');
                if (projJs) fs.writeFileSync(path.join(outDir, 'script.js'), projJs, 'utf-8');
            } else {
                fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
            }
            broadcast({ type: 'workspace_updated', sessionId, data: { sessionId, path: outDir } } as any);
        } catch { /* non-fatal: preview still works from ARTIFACT_DIR */ }

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

        // [VISUAL AUDIT] Everything above reasons about HTML as text. The defects
        // the user actually saw — a page scrolling 2456px sideways, a phone screen
        // rendering empty, text at 2.79:1 — only exist once a browser has laid the
        // page out. Joe now opens his own work and measures it, then repairs what
        // the numbers say is wrong. Runs after the preview is already showing, so
        // the user never waits on it.
        let visualFindings: VisualFinding[] = [];
        let visualScore = -1;
        let visualRepairs = 0;
        try {
            const audit = await auditVisually(url, { screenshotDir: ARTIFACT_DIR, name: `audit-${sessionKey}` });
            if (audit.ran) {
                visualFindings = audit.findings;
                visualScore = audit.score;
                logs.push(`visual audit: ${audit.score}/100, ${audit.findings.length} finding(s)`);
                const brief = visualRepairBrief(audit.findings);
                if (brief) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? `👁️ راجعتُ الصفحة في متصفح حقيقي: ${audit.findings.length} ملاحظة — أُصلحها`
                        : `👁️ Measured the page in a real browser: ${audit.findings.length} finding(s) — repairing`);
                    try {
                        const fixed = await routeToModel([
                            { role: 'system', content: brief },
                            { role: 'user', content: html },
                        ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                        let out = String(fixed || '').trim();
                        const f2 = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
                        if (f2) out = f2[1].trim();
                        const d2 = out.search(/<!DOCTYPE html>|<html[\s>]/i);
                        if (d2 > 0) out = out.slice(d2);
                        if (/<\/html\s*>/i.test(out) && out.length > html.length * 0.7) {
                            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), out, 'utf-8');
                            const after = await auditVisually(url, { screenshotDir: ARTIFACT_DIR, name: `audit-${sessionKey}` });
                            // Only keep a repair the browser agrees is better.
                            if (after.ran && after.score > audit.score) {
                                visualRepairs = audit.findings.length - after.findings.length;
                                visualFindings = after.findings;
                                visualScore = after.score;
                                html = out;
                                store[sessionKey] = { ...(store[sessionKey] || {} as any), html };
                                broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
                                logs.push(`visual repair accepted: ${audit.score} -> ${after.score}`);
                            } else {
                                fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
                                logs.push('visual repair rejected (did not improve the measurements)');
                            }
                        }
                    } catch (e: any) { logs.push(`visual repair failed: ${e?.message || e}`); }
                }
            } else if (audit.skipped) { logs.push(`visual audit skipped: ${audit.skipped}`); }
        } catch (e: any) { logs.push(`visual audit error: ${e?.message || e}`); }

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
            // Say what was DECIDED, not just what was checked — the palette and the
            // page type are choices the user should be able to argue with.
            parts.push(isAr
                ? `🎨 نظام التصميم: ${kind} · تخطيط ${archetype} · خطوط ${typePair.note} · لوحة ${palette.scheme === 'analogous' ? 'متجانسة' : 'متكاملة'} حول ${palette.primary} (تباين AA مضمون)`
                : `🎨 Design system: ${kind} · ${archetype} layout · ${typePair.note} type · ${palette.scheme} palette around ${palette.primary} (AA contrast by construction)`);
            if (imgRequested) {
                // Be exact about how many photos are real: claiming "images added"
                // when the network was down would be a lie the user can see.
                const kb = Math.round(imgBytes / 1024);
                const heavy = kb > 1200;
                parts.push(isAr
                    ? `🖼️ الصور: ${imgReal} حقيقية مرخّصة من ${imgRequested} · ${kb} ك.ب${heavy ? ' ⚠️ ثقيلة — قد تبطئ التحميل' : ''}${imgReal < imgRequested ? ' (الباقي تدرّجات — تعذّر الجلب)' : ''}`
                    : `🖼️ Photos: ${imgReal}/${imgRequested} real licensed · ${kb} KB${heavy ? ' ⚠️ heavy — may slow loading' : ''}${imgReal < imgRequested ? ' (rest are gradients — could not fetch)' : ''}`);
            }
            // Never report a half-written page as finished.
            if (continuations > 0) {
                parts.push(isAr
                    ? `📝 الصفحة تجاوزت حدّ الرد الواحد — أكملتُها على ${continuations + 1} أجزاء${stillTruncated ? ' ⚠️ وما زالت ناقصة' : ''}`
                    : `📝 Page exceeded one response — completed across ${continuations + 1} parts${stillTruncated ? ' ⚠️ still incomplete' : ''}`);
            }
            if (visualScore >= 0) {
                parts.push(isAr
                    ? `👁️ الفحص البصري: ${visualScore}/100${visualRepairs > 0 ? ` (أصلحتُ ${visualRepairs})` : ''}`
                    : `👁️ Visual audit: ${visualScore}/100${visualRepairs > 0 ? ` (repaired ${visualRepairs})` : ''}`);
                const shown = visualFindings.filter(f => f.severity !== 'minor').slice(0, 4);
                if (shown.length) parts.push(shown.map(f => `   • ${isAr ? f.ar : f.en}`).join('\n'));
            }
            if (contentRepairs) parts.push(isAr ? `✍️ إصلاحات المحتوى: ${contentRepairs}` : `✍️ Content repairs: ${contentRepairs}`);
            // Never let a content failure pass silently: if the model could not fix
            // it, the user is told exactly what is still wrong.
            if (contentIssues.length) {
                parts.push((isAr ? '⚠️ ملاحظات على المحتوى:\n' : '⚠️ Content notes:\n')
                    + contentIssues.map(i => `   • ${isAr ? i.ar : i.en}`).join('\n'));
            }
            if (qaFixed.length) parts.push(isAr ? `🔧 تصحيحات الجودة: ${qaFixed.length}` : `🔧 QA fixes: ${qaFixed.length}`);
            parts.push(qaIssues.length
                ? (isAr ? `📋 ملاحظات: ${qaIssues.join('، ')}` : `📋 Notes: ${qaIssues.join(', ')}`)
                : (isAr ? '📋 مراجعة الجودة: نجحت' : '📋 QA review: passed'));
            if (imgCredits.length) {
                parts.push((isAr ? '📄 مصادر الصور: ' : '📄 Image credits: ')
                    + imgCredits.slice(0, 6).map(c => `${c.creator} (${c.license})`).join('، '));
            }
            return parts.join('\n') + qaBrowserLine;
        })();

        const isProject = projectFiles.length > 0;
        // [ARTIFACT] Machine-readable block the chat renders as an elegant artifact
        // card (open in preview / view file). Placed above the code for quick access.
        const artifactBlock = '```joe-artifact\n' + JSON.stringify({
            kind: 'web',
            filename,
            url: base,
            previewUrl: base,
            files: isProject ? projectFiles.map(f => f.name) : [filename],
        }) + '\n```';
        // Reply code: for a project, show each file; otherwise the single HTML file.
        const codeBlock = isProject
            ? [
                '**index.html**\n```html\n' + projIndex + '\n```',
                projCss ? '**styles.css**\n```css\n' + projCss + '\n```' : '',
                projJs ? '**script.js**\n```js\n' + projJs + '\n```' : '',
              ].filter(Boolean).join('\n\n')
            : '```html\n' + html + '\n```';
        const verb = editNoOp
            ? (isAr ? '⚠️ لم أستطع تطبيق التعديل تلقائياً (النموذج لم يُرجع تغييراً). أعد صياغة الطلب أو حاول مجدداً' : '⚠️ Could not apply the change automatically (the model returned no change). Rephrase or try again')
            : isEdit ? (isAr ? 'تم تعديل المشروع' : 'Updated the project') : (isAr ? (isProject ? 'تم بناء المشروع' : 'تم بناء الصفحة') : (isProject ? 'Built the project' : 'Built the page'));
        const fileLine = isProject
            ? (isAr ? `📁 المشروع (${projectFiles.length} ملفات): ${projectFiles.map(f => f.name).join('، ')}` : `📁 Project (${projectFiles.length} files): ${projectFiles.map(f => f.name).join(', ')}`)
            : (isAr ? `📄 الملف: ${filename}` : `📄 File: ${filename}`);
        const okPrefix = editNoOp ? '' : '✅ ';
        const shownTail = editNoOp ? '' : (isAr ? ' وعُرض في المعاينة.' : ' and shown in Preview.');
        const message = isAr
            ? `${okPrefix}${verb}${shownTail}\n\n${artifactBlock}\n\n${fileLine}\n\n${qaSummary}\n\nاطلب أي تعديل آخر (مثل: «أضف زر» أو «غيّر اللون») وسيظهر مباشرة في المعاينة.\n\nالكود الكامل:\n${codeBlock}`
            : `${okPrefix}${verb}${shownTail}\n\n${artifactBlock}\n\n${fileLine}\n\n${qaSummary}\n\nAsk for any further change (e.g. "add a button" / "change the color") and it updates live.\n\nFull code:\n${codeBlock}`;

        return { ok: true, output: { message, url, previewUrl: url, path: filename }, logs };
    }
}
