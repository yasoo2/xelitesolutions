import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { routeToModel, isProviderFailure } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { selfCorrectionSystem } from '../../../core/llm/weak-model-enhancer';
import { reviewHtml, browserSmokeTest, splitHtmlProject } from '../../../core/quality/html-qa';
import { auditVisually, visualRepairBrief, type VisualFinding } from '../../../core/quality/visual-audit';
import { auditBehaviour, behaviourRepairBrief, type BehaviourFinding } from '../../../core/quality/behaviour-audit';
import { workspaceService } from '../../services/WorkspaceService';
import { buildPalette, paletteCss, designBrief, uiKitCss, uiKitScript, darkFirstCss } from '../../../core/design/design-system';
import { findReferenceUrl, extractReference, paletteFromReference, referenceBrief, referenceOverridesCss, referenceSummary } from '../../../core/design/reference';
import { detectPageKind, blueprintBrief, imageBudget, blueprintSections, kindLabel } from '../../../core/design/blueprints';
import { planSections, sectionPrompt, extractSection, assemblePage, shouldWriteSectionwise, type WrittenSection } from '../../../core/design/section-writer';
import { splitIntoSections, targetSections, extractEditedSection, spliceSections, sectionEditPrompt, type PageSection } from '../../../core/design/section-editor';
import { planSite, siteNav, siteNavCss, verifyInternalLinks, targetPage, type SitePlan } from '../../../core/design/site-plan';
import { cartBrief, cartRuntime, cartCss, needsCart } from '../../../core/design/commerce';
import { formBrief, formRuntime, formCss } from '../../../core/design/forms';
import { chartBrief, chartRuntime, chartCss, needsCharts } from '../../../core/design/dataviz';
import { widgetBrief, widgetRuntime, widgetCss, usesWidgets } from '../../../core/design/widgets';
import { resolveImages, creditsBlock, availableSources } from '../../../core/design/images';
import { extractRequirements, verifyContent, wireNavigation, repairBrief, type ContentIssue } from '../../../core/design/content-contract';
import { buildImageBrief } from '../../../core/design/image-brief';
import { pickArchetype, layoutCss, layoutBrief, pickTypePair, typographyCss, primitivesCss, primitivesBrief, iconSprite } from '../../../core/design/layouts';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
const PORT = String(process.env.PORT || '5002');

/**
 * Above this size, a repair that must return the WHOLE page cannot complete:
 * one completion is capped near 12 KB of HTML and the reply is truncated before
 * it finishes. Findings are reported honestly instead of a call being spent on
 * a result that will be rejected. Roughly two completions' worth, to leave a
 * margin for pages that compress well.
 */
const REPAIR_SIZE_LIMIT = Number(process.env.JOE_REPAIR_SIZE_LIMIT || 24000);

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
        const store: Record<string, { filename: string; html: string; multiFile?: boolean; palette?: any; kind?: any; archetype?: any; typePair?: any; reference?: any; site?: { dir: string; pages: any[] } }> =
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
        // [STYLE REFERENCE] «اجعله بأسلوب موقع …» — if the user pointed at a site,
        // read that site in a real browser and let it decide the identity. Joe has
        // owned this measurement for a long time; nothing ever called it while
        // building, so the reference was silently ignored. Failures are reported,
        // never faked: an unreachable site falls back to Joe's own palette and the
        // summary says so.
        const referenceUrl = isEdit && (prev as any)?.reference?.url && !findReferenceUrl(request)
            ? null                                   // a follow-up edit keeps the style already borrowed
            : findReferenceUrl(request);
        let reference: any = isEdit ? (prev as any)?.reference : undefined;
        let referenceNote = '';
        if (referenceUrl) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? `🎨 أقرأ أسلوب ${referenceUrl} من الموقع الحيّ`
                : `🎨 Reading the live design system of ${referenceUrl}`);
            const res = await extractReference(referenceUrl);
            logs.push(`reference ${referenceUrl}: ${res.ok ? 'read' : `failed — ${res.reason}`}`);
            if (res.ok && res.tokens) reference = res.tokens;
            referenceNote = referenceSummary(referenceUrl, res, false);   // fixed up below once we know
            if (!res.ok) reference = undefined;
        }

        const ownPalette = isEdit && (prev as any)?.palette ? (prev as any).palette : buildPalette(request);
        let palette = ownPalette;
        if (reference && !(isEdit && (prev as any)?.palette && !referenceUrl)) {
            const r = paletteFromReference(reference, ownPalette);
            palette = r.palette;
            if (referenceUrl) referenceNote = referenceSummary(referenceUrl, { ok: true, tokens: reference }, r.borrowed);
        }
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

${primitivesBrief()}\n\n${formBrief()}\n\n${widgetBrief()}${needsCharts(kind) ? `\n\n${chartBrief()}` : ''}${needsCart(kind) ? `\n\n${cartBrief()}` : ''}${reference ? `\n\n${referenceBrief(reference)}` : ''}`;

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

        // [SECTION-WISE] A full store page is 25-40 KB of HTML and one completion
        // is capped near 12 KB, so a long page CANNOT be written in one breath —
        // it was being stitched from blind "continue" prompts that no longer see
        // the design system, which is why the second half of every long page came
        // out weaker than the first. Long pages are now written one section at a
        // time, each with the whole design system in front of it.
        const blueprint = blueprintSections(kind);
        const sectionwise = !isEdit && !isMultiFile && shouldWriteSectionwise(blueprint);
        let html = '';
        let sectionReport: { written: number; total: number; failed: string[] } | null = null;
        let editedSections: string[] = [];

        // [SITE] Everything above builds ONE file. A store's header says
        // «المنتجات · من نحن · تواصل» and every one of those links used to go
        // nowhere, because the pages behind them were never written. When the
        // request asks for a site, the pages are planned, each is written with
        // the same machinery, they share one real navigation, and the links
        // between them are verified against the files that actually exist.
        const sitePlan = isEdit ? null : planSite(kind, request, isAr);
        if (sitePlan?.multiPage) {
            const built = await this.buildSite({
                sitePlan, request, isAr, kind, palette, archetype, typePair, reference,
                imageBrief, photos, context, sessionId, logs,
            });
            if (built) {
                // The site is written, previewed and reported by buildSite; the
                // single-page pipeline below has nothing left to do.
                store[sessionKey] = {
                    ...(store[sessionKey] || {} as any),
                    filename: built.entry, html: built.entryHtml,
                    palette, kind, archetype, typePair, reference,
                    site: { dir: built.dir, pages: built.pages },
                };
                return built.result;
            }
            logs.push('site build did not produce enough pages — falling back to a single page');
        }

        // [TARGETED EDIT] A follow-up edit used to send the WHOLE document and ask
        // for the whole thing back. That breaks the moment a page is a real page:
        // 25 KB does not fit in one completion, the reply comes back truncated,
        // the builder restores the previous version — and the user is told the
        // edit was applied when nothing changed. The request almost always names
        // one section, so only that section makes the round trip.
        // [SITE EDIT] On a site, a follow-up has to pick the PAGE first. Without
        // this, «عدّل صفحة المنتجات» would edit whatever the entry page happens
        // to contain and report success — the same class of failure the targeted
        // section edit was built to end, one level up.
        let siteEditFile = '';
        let siteEditHtml = '';
        if (isEdit && prev?.site?.pages?.length) {
            const page = targetPage(request, prev.site.pages as any);
            const file = page?.file || 'index.html';
            const abs = path.join(ARTIFACT_DIR, prev.site.dir, file);
            try {
                siteEditHtml = fs.readFileSync(abs, 'utf-8');
                siteEditFile = file;
                logs.push(`site edit: targeting ${file}${page ? '' : ' (no page named — using the entry page)'}`);
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `📄 أعدّل صفحة «${page?.title || 'الرئيسية'}» من الموقع`
                    : `📄 Editing the "${page?.title || 'Home'}" page of the site`);
            } catch (e: any) {
                logs.push(`site edit: could not read ${file} — ${e?.message || e}`);
            }
        }

        const editBase = siteEditHtml || prev?.html || '';
        if (isEdit && prev && editBase.length > 8000) {
            const existing = splitIntoSections(editBase);
            const targets = targetSections(request, existing);
            if (targets.length) {
                const design = `${designBrief(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}`;
                let working = editBase;
                const applied: Array<{ section: PageSection; html: string }> = [];
                for (const section of targets) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? `✏️ أعدّل قسم «${section.headings[0] || section.id}» فقط بدل الصفحة كاملة`
                        : `✏️ Editing only the "${section.headings[0] || section.id}" section, not the whole page`);
                    let raw = '';
                    try {
                        raw = await routeToModel([
                            { role: 'system', content: sectionEditPrompt({ request, section, isArabic: isAr, designBrief: design }) },
                            { role: 'user', content: section.html },
                        ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                    } catch (e: any) { logs.push(`section edit ${section.id} failed: ${e?.message || e}`); continue; }
                    const got = extractEditedSection(raw, section);
                    if (got.ok) { applied.push({ section, html: got.html }); editedSections.push(section.headings[0] || section.id); }
                    logs.push(`section edit ${section.id || section.tag}: ${got.ok ? `${got.html.length} bytes` : `rejected — ${got.reason}`}`);
                }
                if (applied.length) {
                    working = spliceSections(editBase, applied);
                    // The splice cannot lose the document — but check, because
                    // silently shipping a broken page is the failure this exists
                    // to prevent.
                    if (/<\/html\s*>/i.test(working) && working.length > editBase.length * 0.6) html = working;
                    else logs.push('targeted edit discarded: the spliced document did not look intact');
                }
            }
        }

        if (sectionwise) {
            const plans = planSections(blueprint);
            const design = `${designBrief(palette)}\n\nTOKEN BLOCK (already in the page — use the tokens, do not redeclare them):\n${paletteCss(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}${reference ? `\n\n${referenceBrief(reference)}` : ''}`;
            const written: WrittenSection[] = [];
            const titles: string[] = [];
            let photosLeft = photos;

            for (const plan of plans) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `✍️ أكتب القسم ${plan.index}/${plans.length}: ${plan.spec.split(':')[0]}`
                    : `✍️ Writing section ${plan.index}/${plans.length}: ${plan.spec.split(':')[0]}`);
                // Spread the photo budget over the sections that are still to come.
                const share = Math.max(0, Math.ceil(photosLeft / Math.max(1, plans.length - plan.index + 1)));
                let raw = '';
                try {
                    raw = await routeToModel([
                        {
                            role: 'system', content: sectionPrompt({
                                plan, total: plans.length, kindLabel: kindLabel(kind), request, isArabic: isAr,
                                designBrief: design, written: titles, photosLeft: share,
                                imageSubjects: imageBrief.suggestions,
                            }),
                        },
                        { role: 'user', content: `Write section ${plan.index}: ${plan.spec}` },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch (e: any) {
                    written.push({ ...plan, html: '', ok: false, reason: String(e?.message || e).slice(0, 90) });
                    continue;
                }
                const got = extractSection(raw, plan.id);
                written.push({ ...plan, ...got });
                if (got.ok) {
                    titles.push(plan.spec.split(':')[0]);
                    photosLeft = Math.max(0, photosLeft - (got.html.match(/\{\{\s*IMAGE\s*:/gi) || []).length);
                }
                logs.push(`section ${plan.index} (${plan.id}): ${got.ok ? `${got.html.length} bytes` : `failed — ${got.reason}`}`);
            }

            const ok = written.filter(s => s.ok);
            sectionReport = { written: ok.length, total: plans.length, failed: written.filter(s => !s.ok).map(s => s.id) };
            // If almost nothing came back, the section-wise path is not working
            // for this model right now — fall back to the single-shot build
            // rather than hand the user a page with two sections in it.
            if (ok.length >= Math.max(3, Math.ceil(plans.length * 0.6))) {
                html = assemblePage({
                    title: request.slice(0, 60),
                    isArabic: isAr,
                    tokenCss: paletteCss(palette),
                    baseLayer: `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${primitivesCss()}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`,
                    sections: written,
                    sprite: iconSprite(),
                    script: uiKitScript(),
                });
                logs.push(`section-wise build: ${ok.length}/${plans.length} sections, ${html.length} bytes`);
            } else {
                logs.push(`section-wise build produced only ${ok.length}/${plans.length} sections — falling back to a single pass`);
                sectionReport = null;
            }
        }

        try {
            if (!html) html = await routeToModel(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
                undefined, undefined, undefined, undefined, undefined, undefined, context
            );
        } catch (e: any) {
            return { ok: false, error: `generation_failed: ${e?.message || e}`, logs };
        }

        // Extract clean HTML from whatever the model returned.
        html = String(html || '').trim();
        // With no provider reachable the router returns an apology string, not
        // markup. Without this the apology falls through to the "wrap it in a
        // document" branch below and Joe writes it out as the user's website.
        if (isProviderFailure(html)) {
            return { ok: false, error: html, logs: [...logs, 'no LLM provider answered; the page was not written'] };
        }
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
        const baseLayer = `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${primitivesCss()}\n${formCss()}\n${widgetCss()}${needsCharts(kind) ? `\n${chartCss()}` : ''}${needsCart(kind) ? `\n${cartCss()}` : ''}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`;
        // A section-wise build already carries the base layer — assembled by Joe,
        // not by the model — so injecting it again would duplicate ~10 KB of CSS.
        if (!/Joe UI kit — base layer/.test(html)) {
            if (/<style[^>]*>/i.test(html)) {
                html = html.replace(/<style([^>]*)>/i, `<style$1>\n${baseLayer}\n`);
            } else if (/<\/head>/i.test(html)) {
                html = html.replace(/<\/head>/i, `<style>\n${baseLayer}\n</style>\n</head>`);
            }
        }
        // A dark reference means a dark page. This is the one layer that must sit
        // ON TOP of the model's own token block, so it goes into the LAST
        // stylesheet in the document rather than the base layer.
        if (reference?.mood === 'dark') {
            const flip = `\n${darkFirstCss(palette)}\n`;
            const last = html.lastIndexOf('</style>');
            if (last >= 0) html = html.slice(0, last) + flip + html.slice(last);
            else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `<style>${flip}</style>\n</head>`);
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

        // [CART] A store's cart is Joe's runtime, not the model's: a cart held in
        // a page variable is emptied the moment the visitor clicks to another
        // page, which is exactly what a multi-page store does.
        // Forms get the same treatment: the content contract could DETECT a form
        // that only console.logs, but detection is not enforcement and the
        // repair went back to the model that wrote the problem.
        if (/<form\b/i.test(html) && !/Joe forms/.test(html)) {
            if (!/data-joe-form/i.test(html)) html = html.replace(/<form\b/i, '<form data-joe-form');
            const fr = formRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${fr}\n</body>`) : html + fr;
        }

        // A dashboard has no photographs — every visual on it is drawn — and a
        // weak model cannot draw an SVG chart from data.
        // Only when the page actually uses one — the detection is data-attribute
        // presence, so an unused widget costs nothing.
        if (usesWidgets(html) && !/Joe widgets/.test(html)) {
            const wr = widgetRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${wr}\n</body>`) : html + wr;
        }

        if (/data-chart/i.test(html) && !/Joe charts/.test(html)) {
            const cr = chartRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${cr}\n</body>`) : html + cr;
        }

        if (needsCart(kind) && !/joe-cart/.test(html)) {
            const rt = cartRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${rt}\n</body>`) : html + rt;
        }

        // [PHOTOGRAPHS] Turn every {{IMAGE:subject}} marker into a real licensed
        // photograph, downloaded once and served from Joe so the page keeps its
        // images with no internet. No network -> a gradient in the page's own
        // palette, never a broken image and never a claim of a photo we lack.
        let imgReal = 0, imgRequested = 0, imgBytes = 0;
        let imgCredits: Array<{ creator: string; license: string; source: string }> = [];
        let imgSources: Record<string, number> = {};
        let imgSourceErrors: string[] = [];
        if (photos > 0 && /\{\{\s*IMAGE\s*:/i.test(html)) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `🖼️ أجلب صوراً حقيقية مرخّصة للصفحة` : `🖼️ Sourcing real licensed photographs`);
            try {
                const r = await resolveImages(html, ARTIFACT_DIR, palette.hue, { max: Math.max(4, photos + 2), brief: imageBrief });
                html = r.html; imgReal = r.real; imgRequested = r.requested; imgCredits = r.credits; imgBytes = r.bytes;
                imgSources = r.sources; imgSourceErrors = r.sourceErrors;
                // Creative-Commons licences require attribution IN THE PAGE, not in
                // a chat message the visitor never sees. Without this the published
                // page is in breach of the licence of every photo on it.
                const credits = creditsBlock(r.credits, isAr);
                if (credits) {
                    html = /<\/body>/i.test(html)
                        ? html.replace(/<\/body>/i, `${credits}</body>`)
                        : html + credits;
                }
                logs.push(`images: ${r.real}/${r.requested} real, ${Math.round(r.bytes / 1024)} KB, rest gradient`
                    + ` [${Object.entries(r.sources).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}]`
                    + (r.sourceErrors.length ? ` (${r.sourceErrors.join('; ')})` : ''));
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
        // A site edit writes back into the site folder, under the name of the
        // page that was edited. Writing it to the flat artifact path instead
        // would leave the site untouched while reporting the edit as applied.
        const filename = siteEditFile && prev?.site
            ? path.join(prev.site.dir, siteEditFile)
            : (prev?.filename && /\.html?$/i.test(prev.filename))
                ? prev.filename
                : `joe-${sessionKey}.html`;

        // Multi-file mode: split into a real index.html + styles.css + script.js
        // project inside a per-session folder, and preview that folder's index.html.
        let base: string;
        const projectFiles: Array<{ name: string; bytes: number }> = [];
        let projIndex = '', projCss = '', projJs = '';
        try {
            fs.mkdirSync(path.dirname(path.join(ARTIFACT_DIR, filename)), { recursive: true });
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
            } else if (siteEditFile && prev?.site) {
                // Preview the page that changed, inside the site it belongs to.
                base = `http://localhost:${PORT}/artifacts/${prev.site.dir}/${siteEditFile}`;
            } else {
                base = `http://localhost:${PORT}/artifacts/${filename}`;
            }
        } catch (e: any) {
            return { ok: false, error: `write_failed: ${e?.message || e}`, logs };
        }
        // `site` must survive an edit — dropping it would turn the next follow-up
        // back into a single-page edit against the wrong file.
        store[sessionKey] = { filename, html, multiFile: isMultiFile, palette, kind, archetype, typePair, reference, site: prev?.site };

        // An edit can introduce a link to a page that does not exist. On a site
        // that is checkable, so it is checked rather than left for the user.
        let siteLinkNote = '';
        if (siteEditFile && prev?.site) {
            try {
                const dirAbs = path.join(ARTIFACT_DIR, prev.site.dir);
                const files = new Map<string, string>();
                for (const f of fs.readdirSync(dirAbs)) {
                    if (f.endsWith('.html')) files.set(f, fs.readFileSync(path.join(dirAbs, f), 'utf-8'));
                }
                const links = verifyInternalLinks(files);
                logs.push(`site links after edit: ${links.checked} checked, ${links.dead.length} dead`);
                if (links.dead.length) {
                    siteLinkNote = isAr
                        ? `\n🔗 ⚠️ ${links.dead.length} رابط داخلي لا يصل بعد التعديل: ${links.dead.slice(0, 3).map(d => `${d.from}→${d.href}`).join('، ')}`
                        : `\n🔗 ⚠️ ${links.dead.length} internal link(s) no longer resolve: ${links.dead.slice(0, 3).map(d => `${d.from}→${d.href}`).join(', ')}`;
                }
            } catch (e: any) { logs.push(`site link check failed: ${e?.message || e}`); }
        }
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
        // Set when a page is too big for a whole-page repair round trip; the user
        // is told the findings stand rather than left to assume they were fixed.
        let repairSkipped = false;
        // Reasons an audit did not run at all. Silence here would read as "the
        // page was checked and is fine" — it was not checked.
        const auditSkipped: string[] = [];
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
                // A whole-page repair asks the model to return the whole page. On a
                // document this size the reply is truncated by the provider before
                // it ever finishes, the result is rejected, and the call was spent
                // for nothing. Report the findings instead of pretending to fix.
                if (brief && html.length > REPAIR_SIZE_LIMIT) {
                    repairSkipped = true;
                    logs.push(`visual repair skipped: page is ${Math.round(html.length / 1024)} KB, larger than one completion`);
                } else if (brief) {
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
            } else if (audit.skipped) { auditSkipped.push(audit.skipped); logs.push(`visual audit skipped: ${audit.skipped}`); }
        } catch (e: any) { logs.push(`visual audit error: ${e?.message || e}`); }

        // [BEHAVIOUR AUDIT] The visual audit measures how the page LOOKS, and a
        // dead button looks perfect. The blueprint promises a cart that counts, an
        // accordion that opens and a form that does not reload the page — nothing
        // ever pressed one. This does: it clicks every control a visitor would try
        // and reports which ones changed nothing.
        let behaviourFindings: BehaviourFinding[] = [];
        let behaviourScore = -1;
        let behaviourRepairs = 0;
        try {
            const b = await auditBehaviour(url, { kind });
            if (b.ran) {
                behaviourFindings = b.findings;
                behaviourScore = b.score;
                logs.push(`behaviour audit: ${b.score}/100, ${b.metrics.dead}/${b.metrics.pressed} dead control(s), ${b.metrics.deadAnchors} dead anchor(s)`);
                const brief = behaviourRepairBrief(b.findings, b.controls);
                if (brief && html.length > REPAIR_SIZE_LIMIT) {
                    repairSkipped = true;
                    logs.push(`behaviour repair skipped: page is ${Math.round(html.length / 1024)} KB, larger than one completion`);
                } else if (brief) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? `🖱️ ضغطتُ عناصر الصفحة فعليًا: ${b.metrics.dead} منها لا تستجيب — أُصلحها`
                        : `🖱️ Actually clicked the page's controls: ${b.metrics.dead} do nothing — repairing`);
                    try {
                        const fixed = await routeToModel([
                            { role: 'system', content: brief },
                            { role: 'user', content: html },
                        ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                        let out = String(fixed || '').trim();
                        const f3 = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
                        if (f3) out = f3[1].trim();
                        const d3 = out.search(/<!DOCTYPE html>|<html[\s>]/i);
                        if (d3 > 0) out = out.slice(d3);
                        if (/<\/html\s*>/i.test(out) && out.length > html.length * 0.7) {
                            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), out, 'utf-8');
                            const after = await auditBehaviour(url, { kind });
                            // A "fix" that deletes the buttons scores well on dead
                            // controls, so the count of controls must not fall.
                            const keptControls = after.ran && after.metrics.pressed >= Math.floor(b.metrics.pressed * 0.8);
                            if (after.ran && after.score > b.score && keptControls) {
                                behaviourRepairs = b.findings.length - after.findings.length;
                                behaviourFindings = after.findings;
                                behaviourScore = after.score;
                                html = out;
                                store[sessionKey] = { ...(store[sessionKey] || {} as any), html };
                                broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
                                logs.push(`behaviour repair accepted: ${b.score} -> ${after.score}`);
                            } else {
                                fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
                                logs.push(`behaviour repair rejected (${after.ran ? `${b.score} -> ${after.score}, controls ${b.metrics.pressed} -> ${after.metrics.pressed}` : 're-audit failed'})`);
                            }
                        }
                    } catch (e: any) { logs.push(`behaviour repair failed: ${e?.message || e}`); }
                }
            } else if (b.skipped) { auditSkipped.push(b.skipped); logs.push(`behaviour audit skipped: ${b.skipped}`); }
        } catch (e: any) { logs.push(`behaviour audit error: ${e?.message || e}`); }

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
            if (referenceNote) parts.push(referenceNote);
            if (siteLinkNote) parts.push(siteLinkNote.trim());
            if (editedSections.length) {
                parts.push(isAr
                    ? `✏️ عدّلتُ القسم المقصود فقط: ${editedSections.join('، ')} — بقية الصفحة لم تُمَسّ`
                    : `✏️ Edited only the section you meant: ${editedSections.join(', ')} — the rest of the page was untouched`);
            }
            if (sectionReport) {
                // Say how the page was written and, honestly, what did not arrive.
                parts.push(isAr
                    ? `🧱 كُتبت الصفحة قسمًا بقسم: ${sectionReport.written}/${sectionReport.total} أقسام${sectionReport.failed.length ? ` ⚠️ تعذّر: ${sectionReport.failed.join('، ')}` : ''}`
                    : `🧱 Written section by section: ${sectionReport.written}/${sectionReport.total} sections${sectionReport.failed.length ? ` ⚠️ missing: ${sectionReport.failed.join(', ')}` : ''}`);
            }
            if (imgRequested) {
                // Be exact about how many photos are real: claiming "images added"
                // when the network was down would be a lie the user can see.
                const kb = Math.round(imgBytes / 1024);
                const heavy = kb > 1200;
                // Which archive actually supplied them, and — when one failed —
                // exactly what it said. A missing photo with no reason reads as a
                // bug in Joe rather than a search that came back empty.
                const from = Object.entries(imgSources).map(([k, v]) => `${k}×${v}`).join('، ');
                const why = imgSourceErrors.length ? ` — ${imgSourceErrors.join(' · ')}` : '';
                parts.push(isAr
                    ? `🖼️ الصور: ${imgReal} حقيقية مرخّصة من ${imgRequested} · ${kb} ك.ب${heavy ? ' ⚠️ ثقيلة — قد تبطئ التحميل' : ''}${from ? ` · المصادر: ${from}` : ''}${imgReal < imgRequested ? ` (الباقي تدرّجات${why})` : ''}`
                    : `🖼️ Photos: ${imgReal}/${imgRequested} real licensed · ${kb} KB${heavy ? ' ⚠️ heavy — may slow loading' : ''}${from ? ` · sources: ${from}` : ''}${imgReal < imgRequested ? ` (rest are gradients${why})` : ''}`);
                // Two more archives exist and are switched off only because they
                // need a free key. Say so once, instead of quietly using fewer.
                const dormant = availableSources().dormant;
                if (imgReal < imgRequested && dormant.length) {
                    parts.push(isAr
                        ? `💡 مصادر إضافية متاحة لو أضفت مفتاحًا مجانيًا: ${dormant.map(d => `${d.name} (${d.needs})`).join('، ')}`
                        : `💡 More archives available with a free key: ${dormant.map(d => `${d.name} (${d.needs})`).join(', ')}`);
                }
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
            if (behaviourScore >= 0) {
                parts.push(isAr
                    ? `🖱️ فحص التفاعل (ضغط حقيقي على العناصر): ${behaviourScore}/100${behaviourRepairs > 0 ? ` (أصلحتُ ${behaviourRepairs})` : ''}`
                    : `🖱️ Behaviour audit (controls really clicked): ${behaviourScore}/100${behaviourRepairs > 0 ? ` (repaired ${behaviourRepairs})` : ''}`);
                const shown = behaviourFindings.filter(f => f.severity !== 'minor').slice(0, 4);
                if (shown.length) parts.push(shown.map(f => `   • ${isAr ? f.ar : f.en}`).join('\n'));
            }
            if (auditSkipped.length) {
                parts.push(isAr
                    ? `⚠️ لم يعمل الفحص الآلي: ${auditSkipped[0]} — لم أقس هذه الصفحة، ولا أدّعي أنها سليمة.`
                    : `⚠️ The automatic checks did not run: ${auditSkipped[0]} — this page was not measured, and I am not claiming it is fine.`);
            }
            if (repairSkipped) {
                parts.push(isAr
                    ? `ℹ️ الصفحة أكبر من أن تُعاد كاملة في ردّ واحد، فلم أُشغّل الإصلاح التلقائي — الملاحظات أعلاه قائمة. اطلب تعديل قسم بعينه وسأصلحه مباشرة.`
                    : `ℹ️ The page is larger than one completion can return, so the automatic repair did not run — the findings above still stand. Ask for a specific section and I will fix it directly.`);
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

    /**
     * Build every page of a planned site.
     *
     * Each page goes through the same section-wise writer as a single page, so
     * nothing here is a second, weaker implementation. What this adds is the
     * part a model cannot do: one navigation shared across files it has never
     * seen, and a check that the links between them land.
     *
     * Returns null when too few pages survived — a site with two of its four
     * pages missing is worse than the single page it replaced, so the caller
     * falls back rather than shipping a half-site.
     */
    private async buildSite(opts: {
        sitePlan: SitePlan; request: string; isAr: boolean; kind: any;
        palette: any; archetype: any; typePair: any; reference: any;
        imageBrief: any; photos: number; context: any; sessionId: any; logs: string[];
    }): Promise<{ entry: string; entryHtml: string; dir: string; pages: any[]; result: any } | null> {
        const { sitePlan, request, isAr, palette, archetype, typePair, reference, imageBrief, context, sessionId, logs } = opts;
        const dir = `site-${String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const outDir = path.join(ARTIFACT_DIR, dir);
        fs.mkdirSync(outDir, { recursive: true });

        // The brand name the header carries on every page — taken from the
        // request rather than invented per page, so it does not drift.
        const brand = (request.match(/[«"']([^«»"']{2,40})[»"']/) || [])[1]
            || (isAr ? 'موقعنا' : 'Our Site');

        // A cart belongs to the SITE, not to one page: if any page sells, every
        // page needs the runtime and the badge.
        const siteHasCart = sitePlan.pages.some(p => needsCart(p.kind));
        const written = new Map<string, string>();
        const perPage: Array<{ file: string; sections: number; total: number }> = [];

        for (const page of sitePlan.pages) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? `📄 أبني صفحة «${page.title}» (${written.size + 1}/${sitePlan.pages.length})`
                : `📄 Building the "${page.title}" page (${written.size + 1}/${sitePlan.pages.length})`);

            const pageBlueprint = blueprintSections(page.kind);
            const pagePhotos = imageBudget(page.kind);
            const plans = planSections(pageBlueprint)
                // The header is Joe's, not the model's: it has to link to files
                // the model has never heard of.
                .filter(p => !/header/i.test(p.id));

            const design = `${designBrief(palette)}\n\nTOKEN BLOCK (already in the page — use the tokens, do not redeclare them):\n${paletteCss(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}\n\n${formBrief()}\n\n${widgetBrief()}${needsCharts(page.kind) ? `\n\n${chartBrief()}` : ''}${needsCart(page.kind) ? `\n\n${cartBrief()}` : ''}${reference ? `\n\n${referenceBrief(reference)}` : ''}
THIS PAGE: "${page.title}" — ${page.purpose}
It is one page of a ${sitePlan.pages.length}-page site (${sitePlan.pages.map(p => p.title).join(' · ')}).
Do NOT write a site header or navigation; the site already has one. Link to another page with
its filename (${sitePlan.pages.map(p => p.file).join(', ')}) when the copy calls for it.`;

            const sections: WrittenSection[] = [];
            const titles: string[] = [];
            let photosLeft = pagePhotos;

            for (const plan of plans) {
                const share = Math.max(0, Math.ceil(photosLeft / Math.max(1, plans.length - plans.indexOf(plan))));
                let raw = '';
                try {
                    raw = await routeToModel([
                        {
                            role: 'system', content: sectionPrompt({
                                plan, total: plans.length, kindLabel: kindLabel(page.kind),
                                request: `${request} — ${page.purpose}`, isArabic: isAr,
                                designBrief: design, written: titles, photosLeft: share,
                                imageSubjects: imageBrief.suggestions,
                            }),
                        },
                        { role: 'user', content: `Write section ${plan.index}: ${plan.spec}` },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch (e: any) {
                    sections.push({ ...plan, html: '', ok: false, reason: String(e?.message || e).slice(0, 90) });
                    continue;
                }
                if (isProviderFailure(raw)) {
                    logs.push(`site build aborted on ${page.file}: no LLM provider answered`);
                    return null;
                }
                const got = extractSection(raw, plan.id);
                sections.push({ ...plan, ...got });
                if (got.ok) {
                    titles.push(plan.spec.split(':')[0]);
                    photosLeft = Math.max(0, photosLeft - (got.html.match(/\{\{\s*IMAGE\s*:/gi) || []).length);
                }
            }

            const ok = sections.filter(s => s.ok);
            perPage.push({ file: page.file, sections: ok.length, total: plans.length });
            if (ok.length < Math.max(2, Math.ceil(plans.length * 0.5))) {
                logs.push(`page ${page.file}: only ${ok.length}/${plans.length} sections — page dropped`);
                continue;
            }

            let pageHtml = assemblePage({
                title: `${page.title} — ${brand}`,
                isArabic: isAr,
                tokenCss: paletteCss(palette),
                baseLayer: `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${primitivesCss()}\n${formCss()}\n${widgetCss()}\n${chartCss()}\n${siteNavCss()}${siteHasCart ? `\n${cartCss()}` : ''}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`,
                sections,
                sprite: iconSprite(),
                script: uiKitScript(),
            });
            // The one navigation, injected after <body> so it is identical on
            // every page and always points at files that will exist.
            pageHtml = pageHtml.replace(/(<body[^>]*>)/i, `$1\n${siteNav(sitePlan.pages, page.file, brand, { withCart: siteHasCart, isArabic: isAr })}`);
            // Every page of a store carries the cart runtime, so the basket
            // survives the click from products.html to index.html. Shipping it
            // only on the page with products is how a cart appears to work and
            // then empties itself.
            if (siteHasCart) {
                const rt = cartRuntime(isAr);
                pageHtml = /<\/body>/i.test(pageHtml) ? pageHtml.replace(/<\/body>/i, `${rt}\n</body>`) : pageHtml + rt;
            }
            if (usesWidgets(pageHtml)) {
                const wr = widgetRuntime(isAr);
                pageHtml = /<\/body>/i.test(pageHtml) ? pageHtml.replace(/<\/body>/i, `${wr}\n</body>`) : pageHtml + wr;
            }
            if (/data-chart/i.test(pageHtml)) {
                const cr = chartRuntime(isAr);
                pageHtml = /<\/body>/i.test(pageHtml) ? pageHtml.replace(/<\/body>/i, `${cr}\n</body>`) : pageHtml + cr;
            }
            if (/<form\b/i.test(pageHtml)) {
                if (!/data-joe-form/i.test(pageHtml)) pageHtml = pageHtml.replace(/<form\b/i, '<form data-joe-form');
                const fr = formRuntime(isAr);
                pageHtml = /<\/body>/i.test(pageHtml) ? pageHtml.replace(/<\/body>/i, `${fr}\n</body>`) : pageHtml + fr;
            }
            written.set(page.file, pageHtml);
            logs.push(`page ${page.file}: ${ok.length}/${plans.length} sections, ${pageHtml.length} bytes`);
        }

        if (!written.has('index.html') || written.size < 2) {
            return null;   // not a site; let the caller build one good page instead
        }

        // Photographs, QA and the link check — per page, with the same passes a
        // single page gets.
        let imgReal = 0, imgRequested = 0, imgBytes = 0;
        const credits: Array<{ creator: string; license: string; source: string }> = [];
        for (const [file, raw] of Array.from(written)) {
            let out = raw;
            if (/\{\{\s*IMAGE\s*:/i.test(out)) {
                try {
                    const r = await resolveImages(out, ARTIFACT_DIR, palette.hue, { max: 8, brief: imageBrief });
                    out = r.html; imgReal += r.real; imgRequested += r.requested; imgBytes += r.bytes;
                    for (const c of r.credits) if (!credits.some(x => x.source === c.source)) credits.push(c);
                    const block = creditsBlock(r.credits, isAr);
                    if (block) out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${block}</body>`) : out + block;
                } catch (e: any) { logs.push(`images on ${file} failed: ${e?.message || e}`); }
            }
            out = reviewHtml(out, isAr).html;
            written.set(file, out);
            fs.writeFileSync(path.join(outDir, file), out, 'utf-8');
        }

        // Does the site actually hold together? Asked, not assumed.
        const links = verifyInternalLinks(written);
        logs.push(`site links: ${links.checked} checked, ${links.dead.length} dead`);

        const url = `http://localhost:${PORT}/artifacts/${dir}/index.html?v=${Date.now()}`;
        try {
            broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any);
        } catch { /* preview is a courtesy; the files are written either way */ }

        const lines: string[] = [];
        lines.push(isAr
            ? `🏗️ بُني موقع من ${written.size} صفحات مترابطة: ${sitePlan.pages.filter(p => written.has(p.file)).map(p => p.title).join(' · ')}`
            : `🏗️ Built a ${written.size}-page linked site: ${sitePlan.pages.filter(p => written.has(p.file)).map(p => p.title).join(' · ')}`);
        const dropped = sitePlan.pages.filter(p => !written.has(p.file));
        if (dropped.length) {
            lines.push(isAr
                ? `⚠️ لم تكتمل: ${dropped.map(p => p.title).join('، ')} — لم تُكتب أقسامها بالقدر الكافي`
                : `⚠️ Not completed: ${dropped.map(p => p.title).join(', ')} — too few sections came back`);
        }
        lines.push(isAr
            ? `🔗 الروابط الداخلية: ${links.checked} فُحصت${links.dead.length ? ` · ⚠️ ${links.dead.length} ميتة: ${links.dead.slice(0, 3).map(d => `${d.from}→${d.href}`).join('، ')}` : ' · كلها تصل ✅'}`
            : `🔗 Internal links: ${links.checked} checked${links.dead.length ? ` · ⚠️ ${links.dead.length} dead: ${links.dead.slice(0, 3).map(d => `${d.from}→${d.href}`).join(', ')}` : ' · all resolve ✅'}`);
        if (imgRequested) {
            lines.push(isAr
                ? `🖼️ الصور: ${imgReal} حقيقية من ${imgRequested} · ${Math.round(imgBytes / 1024)} ك.ب`
                : `🖼️ Photos: ${imgReal}/${imgRequested} real · ${Math.round(imgBytes / 1024)} KB`);
        }
        if (credits.length) {
            lines.push((isAr ? '📄 مصادر الصور: ' : '📄 Image credits: ')
                + credits.slice(0, 6).map(c => `${c.creator} (${c.license})`).join('، '));
        }

        const artifact = '```joe-artifact\n' + JSON.stringify({
            kind: 'web', filename: 'index.html', url, previewUrl: url,
            files: Array.from(written.keys()),
        }) + '\n```';

        const message = (isAr ? '✅ تم بناء الموقع وعُرض في المعاينة.' : '✅ Site built and shown in Preview.')
            + `\n\n${artifact}\n\n${lines.join('\n')}\n\n`
            + (isAr
                ? 'اطلب تعديل صفحة بعينها (مثل: «عدّل صفحة المنتجات») وسأعدّلها وحدها.'
                : 'Ask for a change to one page (e.g. "edit the products page") and only that page is touched.');

        return {
            entry: `${dir}/index.html`,
            entryHtml: written.get('index.html')!,
            dir,
            pages: sitePlan.pages.filter(p => written.has(p.file)),
            result: { ok: true, output: { message, url, previewUrl: url, path: `${dir}/index.html`, files: Array.from(written.keys()) }, logs },
        };
    }
}
