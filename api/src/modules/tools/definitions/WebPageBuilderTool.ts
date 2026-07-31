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
import { buildPalette, paletteCss, designBrief, uiKitCss, uiKitScript, darkFirstCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { findReferenceUrl, extractReference, paletteFromReference, referenceBrief, referenceOverridesCss, referenceSummary } from '../../../core/design/reference';
import { detectPageKind, blueprintBrief, imageBudget, blueprintSections, kindLabel } from '../../../core/design/blueprints';
import { planSections, sectionPrompt, extractSection, assemblePage, shouldWriteSectionwise, type WrittenSection } from '../../../core/design/section-writer';
import { brandFrom, pageTitle } from '../../../core/design/page-head';
import { ensureLogo, logoCss } from '../../../core/design/logo';
import { themeCss, lightOverrideCss, revealCss, themeRuntime, revealRuntime, ensureThemeToggle } from '../../../core/design/theme';
import { chromeBrief, chromeCss, chromeRuntime, authCss, authRuntime, ensureHeaderControls, wireAuthControls, repairDeadAnchors } from '../../../core/design/chrome';
import { wrongLanguage, languageRetryNote, isolateLatinRuns, bidiCss } from '../../../core/design/language';
import { splitIntoSections, targetSections, sectionsForFindings, extractEditedSection, spliceSections, sectionEditPrompt, type PageSection } from '../../../core/design/section-editor';
import { planSite, siteNav, siteNavCss, verifyInternalLinks, targetPage, type SitePlan } from '../../../core/design/site-plan';
import { cartBrief, cartRuntime, cartCss, needsCart } from '../../../core/design/commerce';
import { formBrief, formRuntime, formCss } from '../../../core/design/forms';
import { chartBrief, chartRuntime, chartCss, needsCharts } from '../../../core/design/dataviz';
import { widgetBrief, widgetRuntime, widgetCss, usesWidgets } from '../../../core/design/widgets';
import { resolveImages, creditsBlock, availableSources, IMAGE_MARKER, gradientPlaceholder } from '../../../core/design/images';
import { extractRequirements, verifyContent, wireNavigation, repairBrief, type ContentIssue } from '../../../core/design/content-contract';
import { buildImageBrief } from '../../../core/design/image-brief';
import { pickArchetype, layoutCss, layoutBrief, pickTypePair, typographyCss, primitivesCss, primitivesBrief, iconSprite, surfacePairingCss, ownedSurfaces } from '../../../core/design/layouts';

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

        /**
         * THE THEME LAYER, decided once.
         *
         * A page built against a dark style reference is dark unconditionally —
         * `darkFirstCss` overwrites the light tokens outright — so a light
         * choice there would set an attribute and change nothing on screen. A
         * control that does nothing when pressed is the exact defect this
         * codebase keeps finding and removing, so that page gets the reveal and
         * no toggle at all. Every other page gets both directions of the switch:
         * dark tokens on `[data-theme="dark"]` AND light tokens on
         * `[data-theme="light"]`, because the media query the palette already
         * emits cannot be beaten by a button in either direction on its own.
         */
        const darkFirst = reference?.mood === 'dark';
        const themeLayer = darkFirst
            ? revealCss()
            : `${themeCss(darkTokenBlock(palette))}\n${lightOverrideCss(lightTokenBlock(palette))}\n${revealCss()}`;
        const themeScript = darkFirst ? revealRuntime() : `${themeRuntime(isAr)}\n${revealRuntime()}`;

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

        /**
         * A control the user asked for needs somewhere to point.
         *
         * The landing blueprint has no "about" section, so a requested «من نحن»
         * button had no destination: the dead-link repair demoted it to plain
         * text and the content check then reported the button missing — Joe
         * removing a control and complaining that it was gone. Measured end to
         * end on the user's own request, which asked for exactly that button.
         *
         * Naming a nav control is naming a section. The blueprint gains it, so
         * the section is written, the link lands, and nothing has to be faked.
         */
        {
            const wanted = extractRequirements(request);
            const IMPLIED: Array<[string, RegExp, string]> = [
                ['من نحن', /\babout\b|who we are/i,
                    'about: who the business is — a short honest story, what it does differently, and the people behind it'],
                ['اتصل بنا', /\bcontact\b/i,
                    'contact: how to reach the business — a working form, a real address, opening hours'],
                ['خدماتنا', /\bservices?\b|what we do/i,
                    'services: what the business actually does, one card per service with a real description'],
                ['الأسعار', /\bpric|\bplans?\b|packages/i,
                    'pricing: the real packages with real numbers and what each one includes'],
            ];
            for (const [label, present, line] of IMPLIED) {
                if (!wanted.buttons.includes(label) && !wanted.sections.includes(label)) continue;
                if (blueprint.some(b => present.test(b))) continue;
                // Before the footer if there is one, so the page still reads in order.
                const footerAt = blueprint.findIndex(b => /^footer/i.test(b));
                if (footerAt > 0) blueprint.splice(footerAt, 0, line); else blueprint.push(line);
                logs.push(`blueprint: added a "${label}" section because the request asked for that control`);
            }
        }
        // `!isMultiFile` used to be part of this condition, which meant asking
        // for a proper multi-file project silently gave up the path that writes
        // the page WELL — the two were coupled for no reason. Splitting is a
        // transform applied to the finished document at write time, so how the
        // document was produced no longer has anything to do with it.
        const sectionwise = !isEdit && shouldWriteSectionwise(blueprint);
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

        /**
         * Did the user ask for something to be REMOVED?
         *
         * The only case in which an edit is allowed to come back with less than
         * it started with. Everything else — add, change, fix, translate — must
         * keep what is already on the page.
         */
        const mayShrink = /(احذف|إحذف|امسح|أزل|ازل|شيل|احذفي|اشطب|remove|delete|drop|take out|get rid of|shorten|اختصر|قلّل|قلل)/i.test(request);
        /** Sections whose edit was refused for losing content, reported to the user. */
        const editShrank: string[] = [];

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
                    /**
                     * AN EDIT THAT ADDS SOMETHING MUST NOT RETURN LESS.
                     *
                     * The prompt says "Do not shorten it. Every card, item and
                     * paragraph that is there now must still be there" — and an
                     * instruction is not enforcement. Measured end to end: asking
                     * to ADD a button to a store page came back with a section
                     * 28% smaller and the product grid gone, and the only guard
                     * was a whole-document floor of 0.6 that a 28% loss sails
                     * straight through.
                     *
                     * The comparison is per SECTION, against the exact block it
                     * replaces, because that is where the content is lost. A
                     * request that asks to REMOVE something is allowed to shrink;
                     * anything else keeps what was there.
                     */
                    const tooSmall = got.ok && !mayShrink && got.html.length < section.html.length * 0.85;
                    if (got.ok && !tooSmall) {
                        applied.push({ section, html: got.html });
                        editedSections.push(section.headings[0] || section.id);
                    } else if (tooSmall) {
                        editShrank.push(section.headings[0] || section.id);
                    }
                    logs.push(`section edit ${section.id || section.tag}: ${got.ok
                        ? (tooSmall
                            ? `rejected — came back ${Math.round((1 - got.html.length / section.html.length) * 100)}% smaller and the request did not ask to remove anything`
                            : `${got.html.length} bytes`)
                        : `rejected — ${got.reason}`}`);
                }
                if (applied.length) {
                    working = spliceSections(editBase, applied);
                    // The splice cannot lose the document — but check, because
                    // silently shipping a broken page is the failure this exists
                    // to prevent. The floor is tight unless removal was asked for.
                    const floor = mayShrink ? 0.5 : 0.9;
                    if (/<\/html\s*>/i.test(working) && working.length > editBase.length * floor) html = working;
                    else logs.push(`targeted edit discarded: the spliced document lost ${Math.round((1 - working.length / editBase.length) * 100)}% of the page`);
                }
            }
        }

        // Sections that came back in the wrong language and did not improve on a
        // retry. Reported rather than hidden: a page half in English when Arabic
        // was asked for is a defect the user must be told about.
        const languageFailures: string[] = [];
        if (sectionwise) {
            const plans = planSections(blueprint);
            const design = `${designBrief(palette)}\n\nTOKEN BLOCK (already in the page — use the tokens, do not redeclare them):\n${paletteCss(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${chromeBrief({ isArabic: isAr, withAuth: /دخول|خروج|login|logout|sign\s?in|sign\s?up|حساب/i.test(request) })}\n\n${primitivesBrief()}${reference ? `\n\n${referenceBrief(reference)}` : ''}`;
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
                let got = extractSection(raw, plan.id);

                // The prompt asks for the page's language. A build the user ran
                // came back entirely in English — "Transform Your Business",
                // "Sign up" — on a page correctly marked dir="rtl", because an
                // instruction in a prompt is not enforcement. The language of a
                // returned section is measurable, so it is measured, and a
                // section in the wrong language is asked for once more with the
                // instruction made impossible to miss.
                if (got.ok) {
                    const lang = wrongLanguage(got.html, isAr);
                    if (lang.wrong) {
                        logs.push(`section ${plan.index} (${plan.id}): ${lang.reason} — asking again`);
                        if (sessionId) broadcastThinkingDetail(sessionId, isAr
                            ? `🈯 القسم ${plan.index} عاد بالإنجليزية — أطلبه بالعربية`
                            : `🈯 Section ${plan.index} came back in the wrong language — asking again`);
                        try {
                            const retry = await routeToModel([
                                {
                                    role: 'system', content: `${sectionPrompt({
                                        plan, total: plans.length, kindLabel: kindLabel(kind), request, isArabic: isAr,
                                        designBrief: design, written: titles, photosLeft: share,
                                        imageSubjects: imageBrief.suggestions,
                                    })}\n\n${languageRetryNote(isAr)}`,
                                },
                                { role: 'user', content: `Write section ${plan.index}: ${plan.spec}` },
                            ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                            const second = extractSection(retry, plan.id);
                            // Keep the retry only if it is genuinely better on the
                            // measure that triggered it. A second English answer
                            // is not an improvement, and neither is a stub.
                            if (second.ok && !wrongLanguage(second.html, isAr).wrong
                                && second.html.length > got.html.length * 0.5) {
                                got = second;
                                logs.push(`section ${plan.index} (${plan.id}): rewritten in the requested language`);
                            } else {
                                languageFailures.push(plan.spec.split(':')[0]);
                            }
                        } catch { languageFailures.push(plan.spec.split(':')[0]); }
                    }
                }

                /**
                 * A FAILED SECTION IS A HOLE IN THE PAGE — ask once more.
                 *
                 * A build the user ran came back «10/11 أقسام ⚠️ تعذّر:
                 * faq-as-accessible»: one section returned nothing usable and
                 * the page simply shipped without it. A section fails for
                 * ordinary, transient reasons — a truncated reply, a fence that
                 * swallowed the markup, a momentary refusal — and the cheapest
                 * correct answer is to ask again. Only once: a second failure is
                 * a signal, not noise, and it is reported rather than retried
                 * into the ground.
                 */
                if (!got.ok) {
                    logs.push(`section ${plan.index} (${plan.id}): ${got.reason} — asking once more`);
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? `↻ القسم ${plan.index} لم يعد صالحًا (${got.reason}) — أطلبه مرة أخرى`
                        : `↻ Section ${plan.index} came back unusable (${got.reason}) — asking again`);
                    try {
                        const again = await routeToModel([
                            {
                                role: 'system', content: `${sectionPrompt({
                                    plan, total: plans.length, kindLabel: kindLabel(kind), request, isArabic: isAr,
                                    designBrief: design, written: titles, photosLeft: share,
                                    imageSubjects: imageBrief.suggestions,
                                })}\n\nYOUR PREVIOUS ANSWER WAS UNUSABLE: ${got.reason}. Return ONLY the
<section class="section" id="${plan.id}"> … </section> element, nothing before or after it.` },
                            { role: 'user', content: `Write section ${plan.index}: ${plan.spec}` },
                        ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                        const second = extractSection(again, plan.id);
                        if (second.ok) {
                            got = second;
                            logs.push(`section ${plan.index} (${plan.id}): recovered on the second ask`);
                        }
                    } catch (e: any) {
                        logs.push(`section ${plan.index} (${plan.id}): retry failed — ${String(e?.message || e).slice(0, 80)}`);
                    }
                }

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
                    // Not `request.slice(0, 60)`. That put the user's own
                    // instruction to Joe in the browser tab, cut off mid-word:
                    // «ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة ».
                    title: pageTitle({ request, isArabic: isAr, kindLabel: kind }),
                    isArabic: isAr,
                    tokenCss: paletteCss(palette),
                    baseLayer: `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${chromeCss()}\n${authCss()}\n${logoCss()}\n${themeLayer}\n${bidiCss()}\n${primitivesCss()}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`,
                    sections: written,
                    sprite: iconSprite(),
                    script: `${uiKitScript()}\n${chromeRuntime(isAr)}\n${authRuntime(isAr)}\n${themeScript}`,
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
        /**
         * A WHOLE-PAGE EDIT MUST NOT COME BACK WITH LESS OF THE PAGE.
         *
         * When a change cannot be scoped to one section, Joe sends the entire
         * document and asks for the entire document back. The prompt says "keep
         * everything else intact"; the model does not always. Measured end to
         * end: "add a button to the contact section" returned a page 28% shorter
         * with the product grid gone, and the only check on this path was
         * "is it HTML at all".
         *
         * Compared as CONTENT, not as bytes: `prev.html` carries Joe's injected
         * stylesheet and runtimes and the model's reply does not, so a byte
         * comparison would reject every honest edit. Visible text and section
         * count are what the user would notice missing.
         */
        let editLostContent: { text: number; sections: number } | null = null;
        if (isEdit && prev && !editFellBack && !mayShrink && /<html[\s>]/i.test(html)) {
            const textOf = (h: string) => h
                .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
                .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
            const sectionsOf = (h: string) => (h.match(/<section\b/gi) || []).length;
            const beforeText = textOf(prev.html), afterText = textOf(html);
            const beforeSections = sectionsOf(prev.html), afterSections = sectionsOf(html);
            if (afterText < beforeText * 0.8 || afterSections < beforeSections - 1) {
                editLostContent = {
                    text: Math.max(0, Math.round((1 - afterText / Math.max(1, beforeText)) * 100)),
                    sections: Math.max(0, beforeSections - afterSections),
                };
                logs.push(`edit refused: the reply dropped ${editLostContent.text}% of the text and ${editLostContent.sections} section(s); the page is unchanged`);
                html = prev.html;
            }
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

            // Controls the user NAMED. The check below already notices when one
            // is missing — a shipped page carried «الزر المطلوب «تسجيل الخروج»
            // غير موجود في الصفحة» in its report and shipped without the button.
            // Joe owns the header markup, so the control is simply added: no
            // model call, nothing that can fail, nothing to verify afterwards.
            /**
             * The corner of the page carries a mark, not the name in bold.
             * «لم يصمم لوجو لاسم الشركة وأن يضعها في زاوية الموقع» — drawn from
             * the brand name and the palette rather than asked for, because a
             * model asked for a logo returns a description of one or an <img>
             * pointing at a URL that does not exist.
             */
            {
                const brandName = brandFrom(request, isAr);
                if (brandName) {
                    const withLogo = ensureLogo(html, { brand: brandName, hue: palette.hue, isArabic: isAr });
                    if (withLogo.added) { html = withLogo.html; logs.push(`content: drew a wordmark for "${brandName}"`); }
                }
            }

            /**
             * The dark-mode switch.
             *
             * The palette has shipped a full dark scheme on every page since the
             * design system was written, reachable only by changing the whole
             * operating system. The tokens were there; the switch was not.
             * Skipped on a dark-first page, where pressing it could not change
             * anything.
             */
            if (!darkFirst) {
                const tt = ensureThemeToggle(html, isAr);
                if (tt.added) { html = tt.html; logs.push('content: added the dark-mode switch to the header'); }
            }

            if (requirements.buttons.length) {
                const ctl = ensureHeaderControls(html, { wanted: requirements.buttons, isArabic: isAr });
                if (ctl.added.length) {
                    html = ctl.html;
                    logs.push(`content: added the requested control(s) ${ctl.added.join(', ')} to the header`);
                }
            }

            // A sign-in link the model wrote points at nothing, and the repair
            // below would demote it to a <span> — honest, and it deletes the
            // button the user asked for. Joe ships a real panel, so wire it to
            // that instead. Must run BEFORE the dead-anchor repair.
            const authWired = wireAuthControls(html);
            if (authWired.wired) {
                html = authWired.html;
                logs.push(`content: wired ${authWired.wired} sign-in/out control(s) to the auth panel`);
            }

            // A link with href="#" is the model's placeholder for "a link belongs
            // here". The browser audit reports each as a dead anchor; the shipped
            // page had two, reported and unfixed.
            const anchors = repairDeadAnchors(html);
            if (anchors.fixed) {
                html = anchors.html;
                logs.push(`content: repaired ${anchors.fixed} link(s) that pointed nowhere`);
            }

            // Latin runs inside Arabic prose: <bdi> per run, so the brackets and
            // full stops around a brand name stop migrating. Deterministic, and
            // a no-op on a page that has no direction change in it.
            if (isAr) {
                const before = html;
                html = isolateLatinRuns(html);
                if (html !== before) logs.push('content: isolated Latin runs inside the Arabic text');
            }

            contentIssues = verifyContent(html, requirements);

            /**
             * A finding that NAMES its sections is repaired section by section.
             *
             * The whole-page content repair below sends the entire document, so
             * on any real page it is either truncated or refused — which is why
             * «قسم فيه بطاقات بنفس النص» was reported on build after build and
             * fixed on none. The filler check now says WHICH sections and quotes
             * the sentence they share, and that is enough to go straight at them.
             */
            const scopedIssues = contentIssues.filter(i => i.repairable && i.sections?.length);
            if (scopedIssues.length && html.length > REPAIR_SIZE_LIMIT) {
                const probes = scopedIssues.flatMap(i => i.sections!);
                const brief = `A REAL BROWSER read this page. These are measurements, not opinions:
${scopedIssues.map((i, n) => `${n + 1}. ${i.en}`).join('\n')}

Rewrite the section so every card says something DIFFERENT and specific to this
business — a different service, a different benefit, a different number. Do not
reword the same sentence three times; that is the defect. Keep the markup, the
classes and the design tokens exactly as they are, and keep every card: replace
the WORDS, not the structure.`;
                const repairDesign = `${designBrief(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}`;
                const scoped = await this.repairSections({
                    html, probes, brief, design: repairDesign, isAr, sessionId, context,
                    note: isAr ? `✍️ أُعيد كتابة الأقسام ذات المحتوى المكرّر` : `✍️ Rewriting the sections with repeated copy`,
                });
                if (scoped) {
                    const after = verifyContent(scoped, requirements);
                    // Kept only if it actually removed findings — the same rule
                    // every other repair in this file follows.
                    if (after.length < contentIssues.length) {
                        html = scoped;
                        contentRepairs += contentIssues.length - after.length;
                        contentIssues = after;
                        logs.push(`content (section-scoped): ${contentIssues.length} issue(s) left`);
                    } else {
                        // Nothing was written yet at this stage, so dropping the
                        // result IS the revert.
                        logs.push('content (section-scoped) repair did not reduce the findings — discarded');
                    }
                }
            }

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
        const baseLayer = `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${chromeCss()}\n${authCss()}\n${logoCss()}\n${themeLayer}\n${bidiCss()}\n${primitivesCss()}\n${formCss()}\n${widgetCss()}${needsCharts(kind) ? `\n${chartCss()}` : ''}${needsCart(kind) ? `\n${cartCss()}` : ''}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`;
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
        /**
         * The surfaces Joe INVERTS, re-stated after the model's stylesheet.
         *
         * Same exception, same reason as the dark flip above: a background and
         * the text colour on it are one decision, and the base layer loses to
         * the model by design. A model hero gradient under `contrast` measured
         * 1.0:1 in a browser — white on white, a blank screen — and a repainted
         * `.band` measured 1.04:1 on any composition at all.
         */
        {
            const pairing = `\n${surfacePairingCss(archetype)}\n`;
            const last = html.lastIndexOf('</style>');
            if (last >= 0) html = html.slice(0, last) + pairing + html.slice(last);
            else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `<style>${pairing}</style>\n</head>`);
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

        // [CHROME] The section-wise build gets these from assemblePage; a page
        // written in ONE pass — which is what a short blueprint falls back to —
        // was getting the header STYLESHEET and none of the header BEHAVIOUR.
        // Measured end to end: the portfolio page's dropdown was the only
        // control on it, and pressing it did nothing, because no runtime was
        // ever listening. The CSS and the code that drives it must travel
        // together or the page looks right and is dead.
        if (/<header\b|class="[^"]*site-header/i.test(html) && !/Joe page chrome/.test(html)) {
            const cr = chromeRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${cr}\n</body>`) : html + cr;
        }
        if (/data-auth=/i.test(html) && !/Joe sign-in/.test(html)) {
            const ar = authRuntime(isAr);
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${ar}\n</body>`) : html + ar;
        }

        // [THEME] Same reason as the chrome runtime above: a page written in ONE
        // pass gets the toggle's stylesheet from the base layer and none of the
        // code that drives it, so the button renders and does nothing. The
        // stylesheet and the code that drives it must travel together.
        if (!/Joe reveal —/.test(html)) {
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${themeScript}\n</body>`) : html + themeScript;
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

        /**
         * NO MARKER EVER REACHES THE BROWSER.
         *
         * Everything above can fail — no network, an archive down, an exception
         * mid-resolve — and each failure left `{{IMAGE:hero|…}}` sitting in a src
         * attribute. A page with a literal marker in it is not a page with a
         * missing photo; it is a page that 404s and looks broken. That is what
         * the user saw: no images at all, and six 404s reported in the console
         * as JavaScript errors. The designed gradient is on-palette and always
         * available, so there is no case where the marker is the better outcome.
         */
        if (/\{\{\s*IMAGE\s*:/i.test(html)) {
            let swept = 0;
            html = html.replace(IMAGE_MARKER, (_full: string, rawQuery: string) => {
                swept++;
                const subject = String(rawQuery || '').split('|').pop() || 'image';
                return gradientPlaceholder(subject.trim(), palette.hue);
            });
            logs.push(`images: ${swept} unresolved marker(s) replaced with the page gradient — each would have 404'd`);
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
            const review = reviewHtml(html, isAr, { ownedSurfaces: ownedSurfaces(archetype) });
            html = review.html;
            qaIssues = review.issues;
            qaFixed = review.fixed;
        } catch { /* non-fatal */ }

        /**
         * The <title> is Joe's, on EVERY path.
         *
         * The section-wise build composes it, but the single-shot path and the
         * edit path keep whatever the model put in its <head> — measured end to
         * end, a portfolio build shipped `<title>ص</title>`, the model's own
         * one-character placeholder, because that page kind has a short
         * blueprint and falls to the single pass. A title is the browser tab,
         * the bookmark and the search result; it is not a detail to leave to
         * whatever came back.
         *
         * An edit keeps the title the page already had, unless it is one of
         * these obvious non-titles — the user may have asked for a specific one.
         */
        try {
            const current = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
            const junk = !current
                || current.length < 4
                || /^(document|untitled|page|صفحة|my page|title|x)$/i.test(current)
                || current.startsWith(request.slice(0, 20));
            if (!isEdit || junk) {
                const want = pageTitle({ request, isArabic: isAr, kindLabel: kind }).replace(/[<>&"]/g, '');
                if (want && want !== current) {
                    html = /<title[^>]*>[\s\S]*?<\/title>/i.test(html)
                        ? html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${want}</title>`)
                        : html.replace(/<\/head>/i, `<title>${want}</title>\n</head>`);
                    if (current) qaFixed.push(`replaced the page title (was "${current.slice(0, 40)}")`);
                }
            }
        } catch { /* a title is not worth failing a build over */ }

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

            /**
             * Split into real files ALWAYS, not only when a project was asked for.
             *
             * Everything went into one artifact blob, so the file tree stayed
             * empty and the user's report was «لم يعمل ملفات في قائمة الملفات».
             * `isMultiFile` also gated the section-wise build (`sectionwise =
             * !isEdit && !isMultiFile && …`), so asking for separate files meant
             * giving up the path that writes the page well — the two were
             * needlessly coupled.
             *
             * They are not any more. The page is still WRITTEN section by
             * section into one document, and split at write time, which is a
             * pure transform of finished HTML: styles to styles.css, inline
             * scripts to script.js in document order, both re-linked. Moving the
             * scripts to the end of the body is safer than where they were —
             * every element they query is guaranteed to exist by then — and each
             * one is already wrapped in its own scope.
             */
            const split = splitHtmlProject(html);
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
                logs.push(`visual audit: ${audit.score}/100, ${audit.findings.length} finding(s)`
                    + (audit.metrics?.contrastUnmeasurable ? ` (${audit.metrics.contrastUnmeasurable} text node(s) on a photograph — contrast not measurable there)` : ''));
                const brief = visualRepairBrief(audit.findings);
                // A whole-page repair asks the model to return the whole page. On a
                // document this size the reply is truncated by the provider before
                // it ever finishes, the result is rejected, and the call was spent
                // for nothing. Report the findings instead of pretending to fix.
                if (brief && html.length > REPAIR_SIZE_LIMIT) {
                    /**
                     * Too big to return whole — but the findings NAME the text
                     * they are about. A real report read «أسوأها 1:1 (المطلوب
                     * 4.5) في «93»»: the offending element is quoted right
                     * there, and a quoted fragment locates the section holding
                     * it exactly the way a dead control's label does.
                     *
                     * This branch used to stop at "skipped", so a page scoring
                     * 27/100 shipped at 27/100 while the behaviour branch beside
                     * it repaired itself. Same machinery, same rule: keep the
                     * repair only if a second measurement agrees.
                     */
                    const probes = audit.findings
                        .flatMap(f => [...String(isAr ? f.ar : f.en).matchAll(/[«"']([^«»"']{2,60})[»"']/g)].map(m => m[1]))
                        .filter(p => p.trim().length >= 2);
                    const repairDesign = `${designBrief(palette)}\n\nTOKEN BLOCK (already in the page — use the tokens, do not redeclare them):\n${paletteCss(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}`;
                    const scoped = probes.length ? await this.repairSections({
                        html, filename, probes, brief, design: repairDesign, isAr, sessionId, context,
                        note: isAr
                            ? `👁️ الصفحة كبيرة، فأصلح الأقسام التي فيها الملاحظات`
                            : `👁️ Page is large — repairing only the sections the findings name`,
                    }) : null;
                    if (scoped) {
                        const after = await auditVisually(url, { screenshotDir: ARTIFACT_DIR, name: `audit-${sessionKey}` });
                        if (after.ran && after.score > audit.score) {
                            visualRepairs = audit.findings.length - after.findings.length;
                            visualFindings = after.findings;
                            visualScore = after.score;
                            html = scoped;
                            logs.push(`visual repair (section-scoped): ${audit.score} → ${after.score}`);
                        } else {
                            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
                            repairSkipped = true;
                            logs.push('visual repair (section-scoped) did not improve the score — reverted');
                        }
                    } else {
                        repairSkipped = true;
                        logs.push(`visual repair skipped: page is ${Math.round(html.length / 1024)} KB and the findings could not be traced to specific sections`);
                    }
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
                    // Too big to return whole — but the dead controls have
                    // LABELS, and a label locates the section it sits in. Repair
                    // those sections instead of reporting four real defects and
                    // shipping them, which is what this branch used to do.
                    const probes = b.controls.filter(c => !c.worked && c.label).map(c => String(c.label));
                    const repairDesign = `${designBrief(palette)}\n\nTOKEN BLOCK (already in the page — use the tokens, do not redeclare them):\n${paletteCss(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}`;
                    const scoped = await this.repairSections({
                        html, filename, probes, brief, design: repairDesign, isAr, sessionId, context,
                        note: isAr
                            ? `🖱️ الصفحة كبيرة، فأصلح الأقسام التي فيها الأزرار المعطّلة`
                            : `🖱️ Page is large — repairing only the sections holding the dead controls`,
                    });
                    if (scoped) {
                        const after = await auditBehaviour(url, { kind });
                        const keptControls = after.ran && after.metrics.pressed >= Math.floor(b.metrics.pressed * 0.8);
                        if (after.ran && after.score > b.score && keptControls) {
                            behaviourRepairs = b.findings.length - after.findings.length;
                            behaviourFindings = after.findings;
                            behaviourScore = after.score;
                            html = scoped;
                            logs.push(`behaviour repair (section-scoped): ${b.score} → ${after.score}`);
                        } else {
                            // The measurement did not improve, so the edit is
                            // reverted rather than kept on faith.
                            fs.writeFileSync(path.join(ARTIFACT_DIR, filename), html, 'utf-8');
                            repairSkipped = true;
                            logs.push(`behaviour repair (section-scoped) did not improve the score — reverted`);
                        }
                    } else {
                        repairSkipped = true;
                        logs.push(`behaviour repair skipped: page is ${Math.round(html.length / 1024)} KB and the findings could not be traced to specific sections`);
                    }
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
            // A page half in English when Arabic was asked for is a defect, and
            // one the user can see at a glance — so it is named, not buried.
            // A refused edit must be visible: the user asked for a change and did
            // not get it, and silence would read as "done".
            if (editLostContent) {
                parts.push(isAr
                    ? `⚠️ رفضتُ هذا التعديل: النموذج أعاد الصفحة ناقصة ${editLostContent.text}% من نصّها${editLostContent.sections ? ` و${editLostContent.sections} قسمًا` : ''}، وكان سيحذف محتوى لم تطلب حذفه. صفحتك كما هي. جرّب طلبًا أدقّ مثل «في قسم اتصل بنا أضف زر …».`
                    : `⚠️ Refused this edit: the model returned the page missing ${editLostContent.text}% of its text${editLostContent.sections ? ` and ${editLostContent.sections} section(s)` : ''}, which would have deleted content you did not ask to remove. Your page is unchanged. Try naming the section, e.g. "in the contact section, add a …".`);
            }
            if (editShrank.length) {
                parts.push(isAr
                    ? `⚠️ رفضتُ تعديل ${editShrank.length} قسم (${editShrank.slice(0, 3).join('، ')}) لأن النموذج أعادها ناقصة وكان سيحذف محتوى لم تطلب حذفه. الصفحة كما كانت — أعد صياغة الطلب أو حدّد القسم بالاسم.`
                    : `⚠️ Refused the edit to ${editShrank.length} section(s) (${editShrank.slice(0, 3).join(', ')}): the model returned less than was there and would have deleted content you did not ask to remove. The page is unchanged.`);
            }
            if (languageFailures.length) {
                parts.push(isAr
                    ? `⚠️ ${languageFailures.length} قسم عاد بالإنجليزية ولم يتحسّن بعد إعادة الطلب (${languageFailures.slice(0, 3).join('، ')}) — النموذج الحالي ضعيف في العربية. اطلب إعادة كتابة القسم وسأصلحه.`
                    : `⚠️ ${languageFailures.length} section(s) came back in the wrong language and did not improve on a retry (${languageFailures.slice(0, 3).join(', ')}).`);
            }
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
        /**
         * The chat reply lists the files; it does not paste them.
         *
         * A 45 KB page dumped into the conversation is what the user described
         * as «كتب الكود في الدردشة بطريقة غير مرتبة». The page is already on
         * disk, already open in the preview and already in the file tree — three
         * places it can be read properly, with syntax highlighting and a
         * scrollbar. Repeating it as one unbroken block adds nothing and buries
         * the quality report above it.
         */
        const fileList = (isProject ? projectFiles : [{ name: filename, bytes: html.length }])
            .map(f => `  • ${f.name} — ${Math.max(1, Math.round(f.bytes / 1024))} KB`)
            .join('\n');
        const verb = editNoOp
            ? (isAr ? '⚠️ لم أستطع تطبيق التعديل تلقائياً (النموذج لم يُرجع تغييراً). أعد صياغة الطلب أو حاول مجدداً' : '⚠️ Could not apply the change automatically (the model returned no change). Rephrase or try again')
            : isEdit ? (isAr ? 'تم تعديل المشروع' : 'Updated the project') : (isAr ? (isProject ? 'تم بناء المشروع' : 'تم بناء الصفحة') : (isProject ? 'Built the project' : 'Built the page'));
        const fileLine = isProject
            ? (isAr ? `📁 المشروع (${projectFiles.length} ملفات): ${projectFiles.map(f => f.name).join('، ')}` : `📁 Project (${projectFiles.length} files): ${projectFiles.map(f => f.name).join(', ')}`)
            : (isAr ? `📄 الملف: ${filename}` : `📄 File: ${filename}`);
        const okPrefix = editNoOp ? '' : '✅ ';
        const shownTail = editNoOp ? '' : (isAr ? ' وعُرض في المعاينة.' : ' and shown in Preview.');
        const message = isAr
            ? `${okPrefix}${verb}${shownTail}\n\n${artifactBlock}\n\n${fileLine}\n\n${qaSummary}\n\n${fileList}\n\nاطلب أي تعديل آخر (مثل: «أضف زر» أو «غيّر اللون») وسيظهر مباشرة في المعاينة.`
            : `${okPrefix}${verb}${shownTail}\n\n${artifactBlock}\n\n${fileLine}\n\n${qaSummary}\n\n${fileList}\n\nAsk for any further change (e.g. "add a button" / "change the color") and it updates live.`;

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

    /**
     * Repair a page that is too large to return in one completion, by repairing
     * only the sections the findings point at.
     *
     * The whole-page repair asks the model for the entire document. Past roughly
     * 24 KB the provider truncates the reply before it finishes, the result is
     * rejected, and the call is spent for nothing — so the build used to report
     * the findings and ship them. That was honest and it was still a page with
     * four known defects in it.
     *
     * A section is 2-6 KB. `sectionsForFindings` locates the ones that actually
     * contain what the audit named — the label of a button that did nothing, the
     * text of a link that goes nowhere — and each is rewritten on its own, then
     * spliced back at its exact character range so nothing else in the document
     * can move.
     *
     * Returns null when no section could be identified, or when nothing usable
     * came back. It never returns a page it has not written to disk, and the
     * CALLER re-measures: an edit that does not improve the score is reverted.
     */
    private async repairSections(opts: {
        html: string;
        /**
         * Where to write the result, when there is a file yet. The content stage
         * runs BEFORE the page has a filename, so it passes none and takes the
         * html back to write later.
         */
        filename?: string;
        probes: string[]; brief: string; design: string;
        isAr: boolean; sessionId: any; context: any; note: string;
    }): Promise<string | null> {
        const { html, filename, probes, brief, design, isAr, sessionId, context, note } = opts;
        const sections = splitIntoSections(html);
        const targets = sectionsForFindings(sections, probes);
        if (!targets.length) return null;

        if (sessionId) broadcastThinkingDetail(sessionId, `${note} (${targets.length})`);

        const edits: Array<{ section: PageSection; html: string }> = [];
        for (const section of targets) {
            try {
                const reply = await routeToModel([
                    { role: 'system', content: sectionEditPrompt({ request: brief, section, isArabic: isAr, designBrief: design }) },
                    { role: 'user', content: section.html },
                ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                if (isProviderFailure(reply)) continue;
                const got = extractEditedSection(String(reply || ''), section);
                // A "repair" that returns a stub is a deletion wearing a fix's
                // clothes. The section may grow; it may not collapse.
                if (got.ok && got.html.length > section.html.length * 0.6) {
                    edits.push({ section, html: got.html });
                }
            } catch { /* this section stays as it is */ }
        }
        if (!edits.length) return null;

        const out = spliceSections(html, edits);
        if (filename) fs.writeFileSync(path.join(ARTIFACT_DIR, filename), out, 'utf-8');
        return out;
    }

    private async buildSite(opts: {
        sitePlan: SitePlan; request: string; isAr: boolean; kind: any;
        palette: any; archetype: any; typePair: any; reference: any;
        imageBrief: any; photos: number; context: any; sessionId: any; logs: string[];
    }): Promise<{ entry: string; entryHtml: string; dir: string; pages: any[]; result: any } | null> {
        const { sitePlan, request, isAr, kind, palette, archetype, typePair, reference, imageBrief, context, sessionId, logs } = opts;
        const dir = `site-${String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const outDir = path.join(ARTIFACT_DIR, dir);
        fs.mkdirSync(outDir, { recursive: true });

        // The brand name the header carries on every page — taken from the
        // request rather than invented per page, so it does not drift.
        // Quotes were the ONLY signal read here, so «شركة اسمها xelitesolutions»
        // — the way the request is normally phrased — fell through to "موقعنا"
        // and the real name never reached the header or the title.
        const brand = brandFrom(request, isAr) || (isAr ? 'موقعنا' : 'Our Site');

        // A cart belongs to the SITE, not to one page: if any page sells, every
        // page needs the runtime and the badge.
        const siteHasCart = sitePlan.pages.some(p => needsCart(p.kind));

        // Same decision as the single-page path, restated here because a site is
        // built by its own function: a dark-first page gets the reveal and no
        // toggle, everything else gets both directions of the switch.
        const darkFirst = reference?.mood === 'dark';
        const themeLayer = darkFirst
            ? revealCss()
            : `${themeCss(darkTokenBlock(palette))}\n${lightOverrideCss(lightTokenBlock(palette))}\n${revealCss()}`;
        const themeScript = darkFirst ? revealRuntime() : `${themeRuntime(isAr)}\n${revealRuntime()}`;

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
                title: pageTitle({ request, isArabic: isAr, kindLabel: page.kind, pageName: page.title, brand }),
                isArabic: isAr,
                tokenCss: paletteCss(palette),
                baseLayer: `${uiKitCss()}\n${typographyCss(typePair)}\n${layoutCss(archetype)}\n${chromeCss()}\n${authCss()}\n${logoCss()}\n${themeLayer}\n${bidiCss()}\n${primitivesCss()}\n${formCss()}\n${widgetCss()}\n${chartCss()}\n${siteNavCss()}${siteHasCart ? `\n${cartCss()}` : ''}${reference ? `\n${referenceOverridesCss(reference)}` : ''}`,
                sections,
                sprite: iconSprite(),
                script: `${uiKitScript()}\n${chromeRuntime(isAr)}\n${authRuntime(isAr)}\n${themeScript}`,
            });
            // The one navigation, injected after <body> so it is identical on
            // every page and always points at files that will exist.
            pageHtml = pageHtml.replace(/(<body[^>]*>)/i, `$1\n${siteNav(sitePlan.pages, page.file, brand, { withCart: siteHasCart, isArabic: isAr, hue: palette.hue })}`);
            /**
             * The inverted surfaces, re-stated after the model's own stylesheet
             * — every page of the site, for the same reason a single page gets
             * it: a repainted `.band` keeps white text and goes blank.
             */
            {
                const pairing = `\n${surfacePairingCss(archetype)}\n`;
                const last = pageHtml.lastIndexOf('</style>');
                if (last >= 0) pageHtml = pageHtml.slice(0, last) + pairing + pageHtml.slice(last);
            }
            // The switch goes into the shared header, so it is in the same place
            // on every page of the site and the choice carries across the click.
            if (!darkFirst) pageHtml = ensureThemeToggle(pageHtml, isAr).html;
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
            /**
             * The same content passes a single page gets.
             *
             * This loop ran reviewHtml and nothing else, so every page of every
             * site skipped the dead-link repair, the auth wiring and the
             * bidirectional isolation. Measured end to end on a four-page store:
             * one href="#" on the entry page and THREE on each of the other
             * three — twelve dead links Joe would have reported on a single page
             * and silently shipped in a site.
             */
            const wired = wireAuthControls(out);
            if (wired.wired) out = wired.html;
            const anchors = repairDeadAnchors(out);
            if (anchors.fixed) { out = anchors.html; logs.push(`${file}: repaired ${anchors.fixed} dead link(s)`); }
            if (isAr) out = isolateLatinRuns(out);

            out = reviewHtml(out, isAr, { ownedSurfaces: ownedSurfaces(archetype) }).html;
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

        /**
         * A SITE IS MEASURED, LIKE A PAGE IS.
         *
         * `buildSite` returns before the audit block that every single page goes
         * through, so a site was the one thing Joe shipped without ever opening
         * it: no browser, no contrast check, no pressing the controls. The
         * end-to-end harness had been printing "Joe's own audits did not run" on
         * every site build, which is how this was found and why it was reported
         * rather than left implicit.
         *
         * Every page is opened and measured. Each one is repaired the same way a
         * single page is — section by section, keeping the repair only when a
         * second measurement agrees it is better. What still fails is named per
         * page rather than averaged into a number that hides which page is bad.
         */
        const auditNotes: string[] = [];
        let auditedPages = 0;
        for (const [file] of Array.from(written)) {
            const pageUrl = `http://localhost:${PORT}/artifacts/${dir}/${file}?v=${Date.now()}`;
            try {
                const v = await auditVisually(pageUrl, { screenshotDir: ARTIFACT_DIR, name: `audit-${dir}-${file.replace(/\W+/g, '-')}` });
                const b = await auditBehaviour(pageUrl, { kind });
                if (!v.ran && !b.ran) {
                    logs.push(`audit ${file}: did not run (${v.skipped || b.skipped || 'unknown'})`);
                    continue;
                }
                auditedPages++;
                logs.push(`audit ${file}: visual ${v.score}/100, behaviour ${b.score}/100, ${b.metrics.dead || 0} dead control(s)`
                    + (v.metrics?.contrastUnmeasurable ? ` (${v.metrics.contrastUnmeasurable} on a photograph)` : ''));

                // Repair the behaviour, page by page and section by section —
                // the same machinery, and the same rule: keep it only if the
                // browser agrees it improved.
                const brief = behaviourRepairBrief(b.findings, b.controls);
                const probes = b.controls.filter(c => !c.worked && c.label).map(c => String(c.label));
                if (brief && probes.length) {
                    const before = written.get(file)!;
                    const repairDesign = `${designBrief(palette)}\n\n${layoutBrief(archetype, typePair)}\n\n${primitivesBrief()}`;
                    const scoped = await this.repairSections({
                        html: before, filename: path.join(dir, file), probes, brief,
                        design: repairDesign, isAr, sessionId, context,
                        note: isAr ? `🖱️ أصلح الأزرار المعطّلة في ${file}` : `🖱️ Repairing dead controls in ${file}`,
                    });
                    if (scoped) {
                        const after = await auditBehaviour(pageUrl, { kind });
                        const kept = after.ran && after.metrics.pressed >= Math.floor((b.metrics.pressed || 0) * 0.8);
                        if (after.ran && after.score > b.score && kept) {
                            written.set(file, scoped);
                            logs.push(`audit ${file}: behaviour ${b.score} → ${after.score} after repair`);
                        } else {
                            fs.writeFileSync(path.join(outDir, file), before, 'utf-8');
                            logs.push(`audit ${file}: repair did not improve the score — reverted`);
                        }
                    }
                }

                const worst = [...v.findings, ...b.findings]
                    .filter(f => f.severity === 'critical' || f.severity === 'major')
                    .slice(0, 2)
                    .map(f => (isAr ? f.ar : f.en));
                if (worst.length) auditNotes.push(`${file}: ${worst.join(' · ')}`);
            } catch (e: any) {
                logs.push(`audit ${file} failed: ${e?.message || e}`);
            }
        }

        const lines: string[] = [];
        lines.push(isAr
            ? `🏗️ بُني موقع من ${written.size} صفحات مترابطة: ${sitePlan.pages.filter(p => written.has(p.file)).map(p => p.title).join(' · ')}`
            : `🏗️ Built a ${written.size}-page linked site: ${sitePlan.pages.filter(p => written.has(p.file)).map(p => p.title).join(' · ')}`);
        if (auditedPages) {
            lines.push(isAr
                ? `👁️ فُحصت ${auditedPages} صفحة في متصفح حقيقي${auditNotes.length ? '' : ' — بلا ملاحظات'}`
                : `👁️ Measured ${auditedPages} page(s) in a real browser${auditNotes.length ? '' : ' — nothing found'}`);
            for (const n of auditNotes.slice(0, 4)) lines.push(`   • ${n}`);
        } else {
            // Silence here would read as "the site was checked and is fine".
            lines.push(isAr
                ? `⚠️ لم يعمل الفحص الآلي على صفحات الموقع — لم أقِسها، ولا أدّعي أنها سليمة.`
                : `⚠️ The automatic checks did not run on this site's pages — they were not measured, and I am not claiming they are fine.`);
        }
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
