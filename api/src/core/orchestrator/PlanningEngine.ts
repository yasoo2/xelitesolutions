import { StructuredIntent } from '../intelligence/IntentParser';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';
import { normalizeIntentText } from './promptNormalizer';
import { compactHistoryForPrompt } from './history-compact';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    agent: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
}

/** Does this string actually look like a web address? Free classifier models
 *  hallucinate the "url" field — they have returned plain Arabic words and even
 *  tool names, which Chromium happily punycodes into a bogus host and then
 *  blocks on for the full navigation timeout. A real target is either an
 *  http(s):// URL or a bare ASCII host with a dot and a plausible TLD. */
export function isLikelyUrl(value: string): boolean {
    const v = String(value || '').trim();
    if (!v || /\s/.test(v)) return false;
    let host = v;
    if (/^https?:\/\//i.test(v)) {
        try { host = new URL(v).hostname; } catch { return false; }
    } else {
        host = v.split(/[/?#]/)[0];
    }
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    // ASCII only: an Arabic "hostname" is always a hallucination here.
    if (!/^[A-Za-z0-9.-]+$/.test(host)) return false;
    return /^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(host);
}

export interface ExecutionPlan {
    id: string;
    goal: string;
    steps: ExecutionStep[];
    metadata: {
        complexity: string;
        riskLevel: string;
        estimatedDurationMs?: number;
    };
}

export class PlanningEngine {
    /** Map a high-level browser action (chosen by the model) to the exact tool. */
    static browserToolForAction(action: string): string | null {
        const map: Record<string, string> = {
            open: 'browser_launch', go: 'browser_launch', visit: 'browser_launch',
            search: 'browser_search', lookup: 'browser_search',
            summarize: 'browser_summarize', read: 'browser_readability',
            analyze: 'browser_smart_agent', full: 'browser_smart_agent', report: 'browser_smart_agent',
            audit: 'browser_ui_audit', ui: 'browser_ui_audit',
            click: 'browser_click', press: 'browser_click',
            fill: 'browser_fill_form', form: 'browser_fill_form',
            extract: 'browser_extract_data', scrape: 'browser_extract_data',
            translate: 'browser_translate', responsive: 'browser_responsive_check',
            compare: 'browser_compare', find: 'browser_find_text',
            seo: 'browser_seo_audit', performance: 'browser_performance', speed: 'browser_performance',
            links: 'browser_check_links', console: 'browser_console_scan', errors: 'browser_console_scan',
            pdf: 'browser_save_pdf', readability: 'browser_readability',
            contrast: 'browser_contrast_audit', a11y: 'browser_a11y_deep', accessibility: 'browser_a11y_deep',
            meta: 'browser_extract_meta', design: 'browser_design_tokens', colors: 'browser_design_tokens',
            autofix: 'browser_autofix', fix: 'browser_autofix', fullpage: 'browser_fullpage_shot', screenshot: 'browser_fullpage_shot',
        };
        return map[action] || null;
    }

    /** True when the request explicitly asks to SEARCH/look up something (a real
     *  search verb — not merely "open google"). Kept narrow on purpose so plain
     *  "افتح جوجل" stays an open, while "ابحث عن X" / "search for X" is a search. */
    static hasSearchIntent(goalRaw: string): boolean {
        return /(ابحث|إبحث|ابحثي|ابحثلي|دوّ?ر\s*(?:لي\s*)?عن|فتّ?ش\s*عن|بحث\s*عن|\bsearch\s*for\b|\bsearch\b|\blook\s*up\b|جِ?د\s*لي|ابغى?\s*ابحث)/i.test(goalRaw || '');
    }

    /** Extract the CLEAN search topic from natural composite phrasings, using the
     *  user's own words (never the LLM's — which mangles names like نابلس->نبعلس).
     *  Prefers text after a search verb / "عن/about/for", strips command noise and
     *  any trailing engine mention ("... في جوجل"). */
    static extractSearchQuery(goalRaw: string): string {
        let query = '';
        const about = String(goalRaw || '').match(/(?:ابحث\s*(?:لي\s*)?عن|ابحثي\s*عن|ابحثلي\s*عن|دوّ?ر\s*(?:لي\s*)?عن|فتّ?ش\s*عن|بحث\s*عن|بخصوص|على\s*موضوع|عن|حول|about|search\s*for|look\s*up|for)\s+(.+)$/i);
        if (about && about[1]) {
            query = about[1].trim();
        } else {
            query = String(goalRaw || '')
                .replace(/(افتح|شغّ?ل|ادخل|اذهب|روح|رح|open|go\s*to|launch|visit)\s*(لي\s*)?(على|الى|إلى|to)?\s*/gi, ' ')
                .replace(/(المتصفّ?ح|المتصفح|browser|جوجل|google|قوقل|غوغل|قووقل)/gi, ' ')
                .replace(/(و?اكتب|و?ابحث|و?إبحث|و?بحث|دوّ?ر|فتّ?ش|type|search|write)\s*(في\s*)?(البحث|بالبحث|خانة\s*البحث|search\s*box)?\s*(عن|for|:)?\s*/gi, ' ')
                .replace(/^(لي|من\s*فضلك|please|رجاء|و|ثم|ومن\s*ثم)\s+/i, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        // A COMMA (or semicolon) starts a new clause too: «برج إيفل، افتح مقاله، مرّر…»
        // must search for «برج إيفل» only, not the follow-up instructions. Cut there
        // first (a search phrase rarely contains a comma).
        query = query.split(/[،؛]|,\s/)[0].trim();
        // Compound requests ("ابحث عن X ومن ثم ابحث عن Y", "search X then Y") carry a
        // SECOND clause the greedy capture swallowed. Keep only the FIRST search term
        // by cutting at a clause boundary. Note: a bare "و" is NOT a boundary (so
        // "الفرق بين X و Y" stays intact) — only explicit sequencing words are.
        query = query.split(/\s+(?:ومن\s*ثم|ثم\s*ابحث|ثمّ|ثم|وبعد(?:ها|\s*ذلك)?|و\s*ابحث|وابحث|وأيضاً|وكذلك|وادخل|وأدخل|ثم\s*ادخل|وافتح|ثم\s*افتح|واذهب|ثم\s*اذهب|وانقر|and\s+then|then\s+search|then\s+open|then|after\s+that)\s+/i)[0].trim();
        // strip a trailing engine/browser mention: "... في جوجل" / "... in google"
        query = query.replace(/\s*(?:في|على|من|عبر|بواسطة|in|on|via)?\s*(?:جوجل|google|قوقل|غوغل|قووقل|المتصفّ?ح|المتصفح|النت|الإنترنت|الانترنت|الويب|browser|the\s*web)\s*$/i, '').trim();
        // strip leading residue + trailing punctuation
        query = query.replace(/^(?:لي|من\s*فضلك|please|عن|في|على|ثم|و)\s+/i, '').replace(/[.،,]+$/, '').trim();
        return query;
    }

    /**
     * Semantic REQUEST router — what the user actually wants, in any phrasing.
     *
     * The fast-paths below are keyword matches, which is precisely the wrong
     * instrument for natural language: «أضف» matched and «إضافة» did not, so one
     * spelling of one request edited the page and the other went off searching the
     * web. Every miss was answered by lengthening a regex, which only ever fixes
     * the phrasings someone already complained about.
     *
     * This asks the model instead. It runs ONLY when every deterministic path has
     * missed, so the fast, offline-safe routes still win and cost nothing; and it
     * returns null on timeout, junk, or an unknown label, leaving the previous
     * behaviour exactly as it was. Whitelisted output only — the model chooses
     * among capabilities Joe has, it does not invent one.
     */
    static async classifyRequestIntent(
        goal: string,
        opts: { hasActivePage: boolean },
        context?: any
    ): Promise<{ intent: string; repo: string } | null> {
        const sys = `You route a software agent's requests. Read the user's request in ANY language, dialect or spelling and pick the single capability that fulfils it. Output ONLY one compact JSON object, no markdown, no prose:
{"intent":"build_page|edit_page|analyze_repo|answer|other","repo":""}
Definitions:
- build_page: the user wants a NEW web page / site / landing page / UI built.
- edit_page: the user wants the page that was JUST built changed — colours, styling, text, layout, adding or removing an element. ${opts.hasActivePage ? 'A page IS currently open in this session.' : 'No page is open in this session, so edit_page is almost certainly wrong.'}
- analyze_repo: the user wants a GitHub repository/codebase analysed, reviewed or described. Put "owner/repo" in "repo" only if they named one.
- answer: the user is asking a question, chatting, or wants an explanation — no artefact to produce.
- other: anything else (running commands, files, browsing the web, email, deployment...).
Rules:
- Judge INTENT, not vocabulary. Verbal nouns, plurals, dialects and misspellings all count.
- A question ABOUT design or about a repo is "answer", not a build or an analysis.
- When genuinely unsure, output "other".`;
        let raw = '';
        try {
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' }),
                new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
            ]);
        } catch { return null; }
        const m = raw && raw.match(/\{[\s\S]*\}/);
        if (!m) return null;
        let obj: any;
        try { obj = JSON.parse(m[0]); } catch { return null; }
        const intent = String(obj?.intent || '').toLowerCase().trim();
        const allowed = ['build_page', 'edit_page', 'analyze_repo', 'answer', 'other'];
        if (!allowed.includes(intent) || intent === 'other') return null;
        // Never let the router claim an edit when there is nothing to edit.
        if (intent === 'edit_page' && !opts.hasActivePage) return null;
        const repo = String(obj?.repo || '').trim();
        return { intent, repo: /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : '' };
    }

    /**
     * Semantic browser-intent router. Uses the model to understand the request in
     * ANY language/phrasing and return {action, url, query, text, lang}. Robust:
     * strict JSON, whitelist-validated, times out, returns null on any failure so
     * the deterministic keyword paths can take over.
     */
    static async classifyBrowserIntent(goal: string, context?: any): Promise<{ action: string; tool: string; url: string; query: string; text: string; lang: string } | null> {
        const sys = `You are the intent router of a smart AI browser. Read the user's request in ANY language or phrasing and pick the single best browser action. Output ONLY one compact JSON object, no markdown/no prose:
{"action":"open|search|summarize|analyze|audit|click|fill|extract|translate|responsive|compare|find|seo|performance|links|console|pdf|readability|contrast|a11y|meta|design|autofix|fullpage|none","url":"","query":"","text":"","lang":""}
Rules:
- Wants to look up a topic / ask a question to research / "search"/"find info about" -> action="search"; put the topic in "query".
- Names a website or gives a link and wants to open it -> action="open"; put it in "url".
- Summarize/read a page -> "summarize" (url). Full/deep/comprehensive analysis -> "analyze" (url).
- Click a button/link -> "click"; put the label in "text" (and url if given).
- Fill a form -> "fill". Translate a page -> "translate" (set "lang"). Audit UI/design -> "audit".
- If the request is NOT about the web/browser at all -> action="none".
- Put a value in "url" ONLY if the user explicitly named a site or link.`;
        let raw = '';
        try {
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' }),
                new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 18000)),
            ]);
        } catch { return null; }
        const m = raw && raw.match(/\{[\s\S]*\}/);
        if (!m) return null;
        let obj: any;
        try { obj = JSON.parse(m[0]); } catch { return null; }
        const action = String(obj?.action || '').toLowerCase().trim();
        if (!action || action === 'none') return null;
        const tool = PlanningEngine.browserToolForAction(action);
        if (!tool) return null;
        return {
            action, tool,
            url: String(obj?.url || '').trim(),
            query: String(obj?.query || '').trim(),
            text: String(obj?.text || '').trim(),
            lang: String(obj?.lang || '').trim(),
        };
    }

    /**
     * Generate a dynamic multi-step execution DAG based on intent and optional memory
     */
    static async generatePlan(params: { intent: StructuredIntent, memory?: any }, traceId?: string, context?: any): Promise<ExecutionPlan> {
        const { intent, memory } = params;
        // Language-universal understanding: `probe` = the user's original words PLUS
        // a canonicalized companion (dialects, typos, and other languages mapped to
        // the keywords the fast-paths know). ALL detection regexes test the probe;
        // extraction (queries, filenames, emails) still reads the original goal so
        // the user's own words are never mangled.
        //
        // CRITICAL: intent detection must see ONLY the user's request. The runtime
        // appends coaching blocks to the goal — "[STANDING USER INSTRUCTIONS …]"
        // and "[ENGINEERING DISCIPLINE … apply when you build launch/update/deploy
        // scripts or long-running services]". Those blocks contain the very words
        // the fast-paths trigger on (deploy, launch, server, install), so a plain
        // "Build an admin dashboard" was routed to deploy_pages. Strip every
        // injected block before detection; the FULL goal still reaches the tools.
        // [ATTACHED FILES …] is injected too — and it is the most dangerous
        // block of all for detection: it carries the attachment's own words
        // (file names, «disk», «file», extracted text), which is exactly what
        // sent «حلل هذه الصوره» + an image block into the browser+file
        // compound fast-path («browse then write is.txt», field-measured).
        const rawGoal = String(intent.goal || '');
        const injectedAt = rawGoal.search(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)/i);
        const userGoal = injectedAt >= 0 ? rawGoal.slice(0, injectedAt).trim() : rawGoal;
        const goalNorm = normalizeIntentText(userGoal);
        const probe = goalNorm && goalNorm !== userGoal.toLowerCase()
            ? `${userGoal}\n${goalNorm}` : userGoal;
        const goalLower = probe.toLowerCase();

        // A recovery goal ("Fix and continue: <task>\n[THE STEP FAILED WITH THIS
        // ERROR]: …") must NEVER enter the keyword fast-paths below. The goal now
        // carries the failed task's own words plus raw error text — both full of
        // exactly the keywords the fast-paths trigger on. Measured failure modes:
        // a short recovery goal (<30 chars) fell into the chat fast-path and the
        // "repair" was a paragraph of prose; a failed search step matched the web
        // search fast-path and re-ran the identical failing search with zero
        // analysis. Recovery is planned from the error, by the real planner, always.
        if (/^fix and continue:/i.test(String(intent.goal || '').trim())) {
            return PlanningEngine.generateDynamicDag(intent, memory, context);
        }

        /**
         * [ATTACHMENTS ARE THE SUBJECT — DECIDED BEFORE EVERY FAST-PATH]
         * «حلل هذه الصورة» plus an [ATTACHED FILES …] block is a question
         * about the ATTACHED CONTENT — never a browser job, a repo job or a
         * file-write job. This guard used to sit just before the semantic
         * router, AFTER all the keyword fast-paths — and the field log shows
         * the browser+file compound path firing first on the English words
         * inside the attachment block itself and planning «browse then write
         * is.txt» for an image question. Attachment questions are therefore
         * decided HERE, at the top, from the USER'S OWN WORDS only.
         */
        // نفّذ/طبّق are BUILD verbs. They were missing, so «نفّذ هذا الـPRD»
        // with the document attached fell into the ask-about-the-attachment
        // guard and produced a chat ABOUT the requirements instead of a build.
        // DESIGN requests are builds too — field log: «اريد تصميم مختلف لهذه
        // الصوره» fell into the guard and got a CHAT about the picture. The
        // design words are matched as REQUESTS (صمّم، تصميم مختلف/جديد/صفحة،
        // redesign, design a/new…), never as bare nouns — «ما رأيك بهذا
        // التصميم؟» stays an opinion question.
        const WANTS_BUILD_RE = /\b(build|create|implement|develop|scaffold|execute|apply|redesign)\b|\bdesign\s+(a|an|new|another|different|similar)\b|ابنِ|ابني|انشئ|أنشئ|اصنع|نفّ?ذ|طبّ?ق|صمّ?م(?![ء-ي])|أ?عد\s*تصميم|تصميم\s*(مختلف|جديد|آخر|اخر|مشابه|صفح|موقع|واجه)|حوّل|حول .*موقع|موقع من|صفحة من/i;
        if (/\[ATTACHED FILES/.test(rawGoal)) {
            const userPart = rawGoal.split('[ATTACHED FILES')[0];
            if (!WANTS_BUILD_RE.test(userPart)) {
                console.log('[PlanningEngine] attachments present + no build verb → direct answer about the attached content');
                return {
                    id: `chat_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'direct_response',
                        description: 'Answering about the attached file(s)',
                        tool: 'central_answer',
                        agent: 'General',
                        input: { question: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' }
                };
            }
        }

        /**
         * [THE PRD ROUTE] «نفّذ هذا الـPRD وطبّق كل ما فيه» + an attached
         * requirements document is the user's declared end-goal for Joe.
         * The document's full text (extracted from pdf/docx/txt, or read by
         * OCR from a photographed page) already rides in the goal's
         * [ATTACHED FILES] block — what was missing is the ROUTE: a build
         * verb plus a document lands in the canonical engineering pipeline
         * (phases → execution with real checks → honest report), never in
         * a chat about the requirements and never in the one-page builder.
         */
        if (/\[ATTACHED FILES/.test(rawGoal) && WANTS_BUILD_RE.test(rawGoal.split('[ATTACHED FILES')[0])) {
            const attachSection = rawGoal.slice(rawGoal.indexOf('[ATTACHED FILES'));
            // A document attachment (anything whose declared type is not
            // pure media), or an explicit requirements word from the user —
            // including a PHOTOGRAPHED requirements page (image + OCR text).
            const hasDocAttachment = /—\s*(application|text)\//.test(attachSection);
            const prdWord = /\bPRD\b|متطلبات|مواصفات|كراس(ة)?\s*شروط|requirements?|specification|spec\b/i
                .test(rawGoal.split('[ATTACHED FILES')[0]);
            const hasOcrText = attachSection.includes('OCR — the EXACT text read inside the image');
            if (hasDocAttachment || (prdWord && hasOcrText) || (prdWord && /—\s*image\//.test(attachSection))) {
                console.log('[PlanningEngine] PRD/document + build verb → project_pipeline (build what the document says)');
                return {
                    id: `prd_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: 'تنفيذ ما يطلبه المستند المرفق: مراحل ← تنفيذ مع فحص حقيقي ← تقرير صادق',
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' }
                };
            }
        }

        /**
         * [IMAGE ANALYSIS IS AN ANSWER, NEVER A TOOL CIRCUS] «قم بتحليل هذه
         * الصوره» arriving with NO attachment block (the follow-up message
         * that lost its file, or a restart that emptied the memory) went to
         * the generic DAG, which planned exiftool (not installed on Windows),
         * grep, write-file and a BROWSER node — five failing steps and a raw
         * ENOENT as the final «answer» (field log, verbatim). Analyzing a
         * picture is central_answer's job in every case: with a description
         * it describes, without one it honestly says vision is unavailable.
         */
        {
            const asksImageAnalysis =
                /(حلل|تحليل|صِف|وصف|افحص|اقرأ|اشرح|analy[sz]e|describe|inspect|examine|explain|read)/i.test(probe)
                && /(صور|لقط|سكرين|image|photo|picture|screenshot)/i.test(probe);
            if (asksImageAnalysis && !WANTS_BUILD_RE.test(userGoal)) {
                console.log('[PlanningEngine] image-analysis request → direct answer (no tool circus, with or without the file)');
                return {
                    id: `chat_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'direct_response',
                        description: 'Analyzing the image (or honestly reporting vision state)',
                        tool: 'central_answer',
                        agent: 'General',
                        input: { question: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' }
                };
            }
        }

        // [RUN / STOP FAST-PATH] "شغّل المشروع" / "run the project" starts the
        // built system live and opens its preview; "أوقف المشروع" / "stop it"
        // stops it. Deterministic so a weak model can't turn "run my system"
        // back into a chat answer. Checked before the build path so "شغّل" is
        // never mistaken for "ابنِ".
        {
            // A question/search ("how do I run…", "ابحث عن كيفية…", "…؟") describes
            // a topic; it does NOT command run/stop/deploy — those must yield to it.
            const isQuestion = /^\s*(how|what|why|when|where|which|can|do|does|is|are|should|explain)\b/i.test(userGoal.trim())
                || /(^|\s)(كيف|ماذا|لماذا|متى|أين|هل|اشرح|وضّ?ح|ما\s+هو|ما\s+هي)(\s|$)/.test(userGoal)
                || /(ابحث|بحث|دوّ?ر\s*عن|ابغى\s*اعرف|search\s+for|google|look\s*up)/i.test(probe)
                || /\?\s*$/.test(userGoal.trim());

            // A build verb ("make a NEW one") beats run/stop — "ابنِ وشغّل" builds.
            const hasBuildVerb = /\b(build|create|make|develop|scaffold|generate|code)\b/i.test(probe)
                || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|برمج)/.test(probe);

            // A concrete project/server target — NOT a browser, NOT content. Word
            // boundaries keep "serve" out of "server" and "app" out of "happen".
            const projectTarget = /(المشروع|النظام|الخادم|السيرفر|المعاينة|\bproject\b|\bserver\b|\bapp\b|\bapplication\b|\bpreview\b|dev\s*server|localhost)/i.test(probe);
            const deployTarget = projectTarget || /(الموقع|الصفحة|\bsite\b|\bwebsite\b|\bpage\b)/i.test(probe);
            // Content that "انشر/publish" ALSO applies to — publishing an article is
            // NOT deploying a site. This is the collision that sent "انشر مقالاً" to deploy.
            const contentNoun = /(مقال|منشور|تدوينة|تغريدة|خبر|إعلان|محتوى|قصة|\barticle\b|\bpost\b|\bblog\b|\btweet\b|\bstory\b|\bcontent\b)/i.test(probe);

            const stopIntent = !isQuestion && !hasBuildVerb && projectTarget
                && /(أوقف|اوقف|إيقاف|ايقاف|اقفل|\bstop\b|\bkill\b|shut\s*down)/i.test(probe);
            const runIntent = !isQuestion && !hasBuildVerb && !stopIntent && projectTarget
                && /(شغّ?ل|تشغيل|شغلي|\brun\b|\bstart\b|\blaunch\b|\bserve\b|\bpreview\b)/i.test(probe);

            // Deploy: the unambiguous words (deploy / go live / رابط دائم / استضف)
            // fire on their own; the ambiguous ones (انشر / publish / host) need a
            // site/project target and must not be about content.
            const strongDeploy = /(\bdeploy\b|استضف|استضافة|go\s*live|رابط\s*دائم|github\s*pages|gh-pages)/i.test(probe);
            const softPublish = /(انشر|أنشر|\bpublish\b|\bhost\b)/i.test(probe);
            const deployIntent = !isQuestion && !hasBuildVerb && !contentNoun
                && (strongDeploy || (softPublish && deployTarget));

            if (stopIntent) {
                return {
                    id: `stop_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'project_stop', description: 'إيقاف الخادم', tool: 'project_stop', agent: 'Dev', input: {}, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
            if (runIntent) {
                return {
                    id: `run_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'project_run', description: 'تشغيل المشروع ومعاينته حيّاً', tool: 'project_run', agent: 'Dev', input: {}, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
            if (deployIntent) {
                return {
                    id: `deploy_${Date.now()}`, goal: intent.goal,
                    steps: [{ id: 'deploy_pages', description: 'نشر المشروع بشكل دائم على GitHub Pages', tool: 'deploy_pages', agent: 'Dev', input: {}, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [FULL-PROJECT FAST-PATH] A complete multi-file project (backend, API,
        // database, full stack) goes to the canonical engineering pipeline:
        // plan phases -> execute with verification and auto build checks ->
        // repair tickets and one self-fix on failure -> honest report. Before
        // this route existed, «ابنِ لي مشروعاً متكاملاً بباك اند» fell to the
        // page fast-path below and shipped as ONE HTML file, or to the generic
        // DAG which wrote files nothing ever executed. This must be checked
        // BEFORE the page builder — «تطبيق» matches its webNoun too.
        {
            const projectVerb = /\b(build|create|make|develop|scaffold|generate)\b/.test(goalLower)
                || /(ابن|ابني|انشئ|أنشئ|اصنع|طور|اعمل|سو)/.test(probe);
            const fullStackNoun = /(باك\s*اند|واجهة\s*خلفية|خادم|سيرفر|قاعدة\s*بيانات|مشروع\s*(متكامل|كامل)|تطبيق\s*(متكامل|كامل)|نظام\s*(متكامل|كامل|إدارة|اداره)|back\s*-?end|server\s*side|database|rest\s*api|api\s*server|full[-\s]?stack|complete\s+(project|app|application|system)|node\.?js|express|fastify|django|flask)/i.test(probe);
            if (projectVerb && fullStackNoun) {
                console.log(`[PlanningEngine] full-project fast-path -> project_pipeline "${String(intent.goal).slice(0, 80)}"`);
                return {
                    id: `project_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `Building complete project through the engineering pipeline: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' }
                };
            }
        }

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        const buildVerb = /\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو)/.test(probe);
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface)\b/.test(goalLower)
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط)/.test(probe);
        // Route follow-up edits (add button / change colour / ...) to the SAME page.
        const activeKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
        // Arabic asks for an edit with a VERBAL NOUN at least as often as with a
        // verb — «أضف» but also «إضافة», «غيّر» but also «تغيير» — and it pluralises
        // the thing being changed («لون» -> «ألوان»). Matching only the imperative
        // singular meant «اريد اضافة الوان جميله» missed the edit path entirely and
        // the request was handed to the generic planner, which went off searching
        // the web for colour palettes instead of touching the page.
        // The dialect verbs the user actually types — «ضيف زر», «حط صورة»,
        // «خلي الخلفية غامقة», «شيل القسم الأخير», «سوي الخط أكبر» — were not
        // edit verbs, so with a page open the message fell to the generic
        // planner and «جو صار يتهبل» (field report, verbatim). They are gated
        // by hasActivePage below, so they can never hijack a fresh build.
        const editIntent = /\b(add|change|modify|update|edit|remove|bigger|smaller|colou?r|button|background|header|footer|font|title|style|design|prettier|nicer)\b/i.test(goalLower)
            || /(أضف|اضف|إضافة|اضافة|غيّر|غير|تغيير|عدّل|عدل|تعديل|بدّل|بدل|تبديل|اجعل|احذف|حذف|كبّر|كبر|تكبير|صغّر|صغر|تصغير|حسّن|حسن|تحسين|تنسيق|تجميل|جمّل|امسح|أزل|ازل)/.test(probe)
            // The SHORT dialect verbs need Arabic boundaries — bare /خلي/ fires
            // inside «الداخلية» and /سوي/ inside «تساوي», turning ordinary
            // questions into page edits.
            || /(?<![ء-ي])(ضيف|ضِف|حطّ?(ي|ه|ها)?|خلّ?ي(ه|ها)?|شيل(ي|ه|ها)?|سوّ?ي(ه|ها)?|ركّ?ب|رتّ?ب|ظبط|ضبط|صلّ?ح|أصلح|اصلح)(?![ء-ي])/.test(probe)
            // Concrete page parts only. Generic words like «تصميم» or «شكل» appear in
            // ordinary questions ("ما هو تصميم قاعدة البيانات؟") and would rebuild the
            // page on a question — the verbs above already cover "improve the design".
            || /(لون|ألوان|الوان|زر|أزرار|ازرار|خلفية|خلفيه|خلفيات|حجم|أحجام|عنوان|عناوين|خط|خطوط|قسم|أقسام|اقسام|صورة|صور|فوتر|هيدر|ترويسة|تذييل|قائمة|أيقونة|ايقونة|فقرة|نصوص)/.test(probe);

        // Recovery goals were bounced out of generatePlan at the very top — by the
        // time execution reaches here the goal is a genuine user request.
        if ((buildVerb && webNoun) || (hasActivePage && editIntent)) {
            return {
                id: `build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'build_page',
                    description: `Building: ${intent.goal}`,
                    tool: 'web_page_builder',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [MY-BROWSER FAST-PATH] "... in my (real) browser" -> drive the user's OWN
        // browser through the installed Joe extension (their logins, any site).
        {
            const g = intent.goal || '';
            const myBrowser = /(في|بـ?|على)?\s*متصفّ?حي(\s*(الشخصي|الحقيقي))?|بمتصفّ?حي|my\s+(own\s+)?browser|in\s+my\s+browser|on\s+my\s+browser/i.test(probe);
            if (myBrowser) {
                const urlM = g.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
                const action = urlM ? 'open' : /(اقرأ|لخّ?ص|read|summar)/i.test(probe) ? 'read' : /(لقطة|screenshot|صورة)/i.test(probe) ? 'screenshot' : 'open';
                const input: any = { action, request: intent.goal };
                if (urlM) input.url = urlM[0].startsWith('http') ? urlM[0] : `https://${urlM[0]}`;
                return {
                    id: `mybrowser_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'user_browser', description: `user_browser ${action}`, tool: 'user_browser', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [GOOGLE ACCOUNT FAST-PATH] "read my email / calendar / drive" -> act in the
        // user's connected Google account via official APIs (needs OAuth connect first).
        {
            const g = intent.goal || '';
            const gmailRead = /(بريد|ايميل|إيميل|رسائل|جيميل|gmail|inbox|صندوق\s*الوارد|mail)/i.test(probe);
            const calList = /(تقويم|مواعيد|أجندة|اجندة|calendar|events?|اجتماعات)/i.test(probe);
            const driveList = /(درايف|ملفاتي|drive|ملفات\s*جوجل)/i.test(probe);
            const sendMail = /(أرسل|ارسل|ابعث|send)\s+(بريد|ايميل|إيميل|رسالة|mail|email)/i.test(probe);
            // Guard: "log in to https://mail.<site>" is a SITE login, not "read my
            // Gmail" — the word "mail" inside the URL must not hijack it to the API.
            const hasUrl = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)\b/i.test(probe);
            const loginToSite = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin/i.test(probe);
            // Guard: "browse a site, THEN email the result to someone@x" is a compound
            // browse->email task (handled below), not a bare "read my Gmail". The word
            // "بريد/mail" here is the delivery channel, not the target — don't hijack it.
            const emailCompound = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(probe) && /(أرسل|ارسل|ابعث|أبعث|send)/i.test(probe) && hasUrl;
            // Guard: "type in the email FIELD" / "click the mail button" is a page
            // interaction (the word «بريد/mail» names a form field, not the inbox) —
            // let the continue-on-live-page path below handle it, not the Gmail API.
            const pageInteraction = /(اضغط|انقر|اختر|عبّ?ئ|املأ|اكتب|حدّ?د|click|press|select|type|fill)/i.test(probe)
                && /(زر|الزر|حقل|الحقل|خانة|القائمة|مربع|صندوق|button|field|menu|box|input)/i.test(probe);
            if ((gmailRead || calList || driveList || sendMail) && !(hasUrl && loginToSite) && !emailCompound && !pageInteraction) {
                const action = sendMail ? 'gmail_send' : calList ? 'calendar_list' : driveList ? 'drive_list' : 'gmail_list';
                const input: any = { action, request: intent.goal };
                if (action === 'gmail_list') { const q = g.match(/(?:عن|من|بخصوص|about|from)\s+(.+)$/i); if (q) input.query = q[1].trim(); }
                return {
                    id: `google_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'google_account', description: `Google: ${action}`, tool: 'google_account', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [REPO ANALYSIS FAST-PATH] «حلل الريبو المتصل / analyze the repo» is a
        // GitHub-API task, NOT a browser or shell task. Before this path existed,
        // the DAG planner produced blind shell nodes ("Connect to the repository"
        // with no command) that failed, and recovery then hijacked the task into
        // the browser. Route it straight to github_repo_manager(action:analyze),
        // which reads the REAL repo (metadata/tree/README/commits) via the API and
        // resolves the workspace's connected repo when none is named.
        {
            const repoNoun = /(الريبو|ريبو|مستودع|المستودع|ريبوزتوري|\brepo\b|repository)/i.test(probe);
            const analyzeVerb = /(حلّ?ل|تحليل|افحص|فحص|قيّ?م|تقييم|قرأ|اقرأ|لخّ?ص|ملخص|analy[sz]e|analysis|inspect|review|summari)/i.test(probe);
            if (repoNoun && analyzeVerb) {
                // "github.com/owner/repo" first (so the domain never pollutes the
                // name), then a bare "owner/repo".
                const gh = (intent.goal || '').match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
                const named = gh ? gh : (intent.goal || '').match(/(?:^|\s)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\s|$)/);
                const input: any = { action: 'analyze', request: intent.goal };
                if (named) input.repoName = named[1].replace(/\.git$/i, '');
                console.log(`[PlanningEngine] repo-analysis fast-path -> github_repo_manager(analyze) repo="${input.repoName || '(workspace connected repo)'}"`);
                return {
                    id: `repo_analyze_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'repo_analyze', description: `تحليل المستودع ${input.repoName || 'المتصل'}`, tool: 'github_repo_manager', agent: 'General', input, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [BROWSER SMART TOOLS FAST-PATH] summarise / audit a URL reliably.
        const goalRaw = intent.goal || '';
        const urlMatch = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);

        // [INTELLIGENT BROWSER ROUTER] Understand the request semantically (any
        // language / any phrasing) with the model, instead of relying on brittle
        // keyword regexes. This is the primary path; the keyword fast-paths below
        // remain only as a deterministic fallback when the model is unavailable.
        const looksBrowser = !!urlMatch || String(intent.suggestedAgent || '') === 'Browser'
            || /(متصفح|براوزر|موقع|صفحة|الويب|الإنترنت|الانترنت|ابحث|إبحث|بحث|جد|جِد|دوّ?ر|فتّ?ش|افتح|تصفّ?ح|عايِ?ن|لخّ?ص|حلّ?ل|دقّ?ق|افحص|انقر|اضغط|املأ|عبّ?ئ|ترجم|قارن|استخرج|browser|web|site|page|search|find|look\s*up|google|open|visit|go\s*to|summari|analy|audit|click|fill|translate|compare|extract|scrape|seo)/i.test(probe);

        // [LOCAL BROWSER CONSENT GATE] When Joe is configured to drive the user's own
        // local Chrome profile (persistent mode), he must ASK permission once before
        // using it. If the user hasn't approved yet: a bare "أوافق" grants it; any
        // other browser request is intercepted with the consent prompt.
        try {
            const mgr = require('../../modules/browser/manager');
            if (mgr.isPersistentBrowserMode && mgr.isPersistentBrowserMode()) {
                const bsid = String((context && context.browserSessionId) || 'panel-browser');
                if (!mgr.hasBrowserConsent(bsid)) {
                    // NOTE: no \b after the words — \b is an ASCII word boundary and
                    // does NOT match after Arabic letters, so "اوافق" failed before.
                    const affirm = /^\s*(أوافق|اوافق|موافق|موافقة|نعم|أقبل|اقبل|أوكي|اوكي|تمام|أكيد|اكيد|ok|okay|yes|agree)(\s|$|[.،,!]|ي)/i.test(goalRaw.trim() + ' ');
                    if (affirm) {
                        return { id: `consent_${Date.now()}`, goal: intent.goal, steps: [{ id: 'browser_consent', description: 'grant local-browser consent', tool: 'browser_consent', agent: 'Browser', input: { grant: true }, dependsOn: [] }], metadata: { complexity: 'low', riskLevel: 'low' } };
                    }
                    if (looksBrowser) {
                        return { id: `consent_${Date.now()}`, goal: intent.goal, steps: [{ id: 'browser_consent', description: 'request local-browser consent', tool: 'browser_consent', agent: 'Browser', input: { grant: false }, dependsOn: [] }], metadata: { complexity: 'low', riskLevel: 'low' } };
                    }
                }
            }
        } catch { /* consent module optional; never block planning */ }

        // [CONTINUE-ON-LIVE-PAGE FAST-PATH] A bare interaction verb with NO URL
        // («اضغط على زر تسجيل الدخول», «اكتب في الحقل», «انزل تحت», «اختر من القائمة»,
        // "click the login button", "scroll down") is a CONTINUATION of the page the
        // user is already looking at — not a fresh request and definitely not a text
        // answer. Route it to the ReAct agent, which (with no start URL) observes the
        // CURRENT live page and acts on it. Fires when EITHER a UI-element noun is
        // present (deterministic) OR a browser page is actually live right now. Guarded
        // so «اكتب لي قصيدة» / «اشرح لي كذا» (no UI noun, verb used generally) never
        // gets hijacked.
        {
            const g = goalRaw;
            const interactVerb = /(اضغط|انقر|اختر|اكتب|أدخل|ادخل\s*في|مرّ?ر|انزل|اصعد|اسحب|عبّ?ئ|املأ|فعّ?ل|حدّ?د|ارجع|تابع|أكمل|اكمل|click|press|tap|scroll|select|choose|type|enter|fill|check|toggle|submit|go\s+back|continue)/i.test(probe);
            const noUrl = !urlMatch;
            const uiNoun = /(زر|الزر|زرّ|حقل|الحقل|خانة|القائمة|قائمة|رابط|الرابط|مربع|صندوق|الأيقونة|ايقونة|التبويب|علامة\s*التبويب|button|field|link|menu|dropdown|checkbox|icon|tab|box|input)/i.test(probe);
            // A navigation TARGET in the task (a known site, or an "open/go to <site>"
            // phrase) means this is NOT a pure continuation of the current page — it must
            // navigate first. Let the login / ReAct fast-paths below handle it (they
            // derive a start URL). Without this guard, «ادخل على جيت هاب واضغط الزر…»
            // was hijacked into resume-mode and never left the current page.
            const hasNavTarget = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|انست[غق]رام|instagram|جيميل|gmail|لينكد\s*ان|linkedin|ريديت|reddit|ويكيبيديا|wikipedia|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok)/i.test(probe)
                || /((ادخل|روح|اذهب)\s*(على|الى|إلى|ل)\s*\S+|افتح\s+(موقع|صفحة|رابط|\S+\.\S+)|go\s*to\s+\S+|open\s+\S+\.\S+|visit\s+\S+)/i.test(probe);
            let pageLive = false;
            try { const mgr = require('../../modules/browser/manager'); pageLive = !!(mgr.hasLiveBrowserPage && mgr.hasLiveBrowserPage()); } catch { /* optional */ }
            // Guard: orchestrator RECOVERY goals are prefixed "Fix and continue: <task>"
            // — the word "continue" matched interactVerb, so every failed NON-browser
            // node (e.g. a Dev shell step) got hijacked into browser resume-mode
            // whenever a page happened to be live. Recovery goals may only take this
            // path when the failed node itself was a Browser node.
            const nonBrowserRecovery = /^fix and continue:/i.test(String(intent.goal || '').trim())
                && String(intent.suggestedAgent || '') !== 'Browser';
            if (interactVerb && noUrl && !hasNavTarget && !nonBrowserRecovery && (uiNoun || pageLive)) {
                console.log(`[PlanningEngine] continue-on-live-page -> browser_run (resume) "${g.slice(0, 60)}"`);
                return {
                    id: `browser_continue_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_task',
                        description: intent.goal,
                        tool: 'browser_run',
                        agent: 'Browser',
                        // resume:true => the agent does NOT re-navigate; it acts on the
                        // page currently open in the panel session.
                        input: { task: intent.goal, request: intent.goal, resume: true },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [BROWSER + EMAIL COMPOUND FAST-PATH] "browse/extract X, THEN email it to
        // someone@site" — browser extracts, then google_account/gmail_send consumes the
        // result via {{FROM:browse}}. If Google isn't connected, gmail_send answers
        // honestly ("connect Google once"), it does not pretend to send.
        {
            const g = goalRaw;
            const email = (g.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
            const wantsSend = /(أرسل|ارسل|ابعث|أبعث|send|e-?mail|بريدياً)/i.test(probe);
            if (email && wantsSend && (!!urlMatch || looksBrowser)) {
                const browsePart = (g.split(/\s*(?:ثم|وبعدها|بعد\s*ذلك|بعدها|و?أرسل|و?ارسل|و?ابعث|then\b|and\s+then\b)\s*/i)[0] || g).trim() || g;
                console.log(`[PlanningEngine] browser+email compound -> browse then email ${email}`);
                return {
                    id: `browser_email_${Date.now()}`,
                    goal: intent.goal,
                    steps: [
                        { id: 'browse', description: browsePart, tool: 'browser_run', agent: 'Browser', input: { task: browsePart, request: intent.goal }, dependsOn: [] },
                        { id: 'send', description: `أرسل النتيجة بريداً إلى ${email}`, tool: 'google_account', agent: 'General', input: { action: 'gmail_send', to: email, subject: 'نتيجة من جو', body: '{{FROM:browse}}', request: intent.goal }, dependsOn: ['browse'] },
                    ],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // [BROWSER + FILE COMPOUND FAST-PATH] "browse/extract X, THEN write/save it to
        // a file" is TWO tools in one request. Build a 2-node plan — browser extracts,
        // then write_file consumes the browser result via {{FROM:browse}} — so the
        // browser chains with the other tools instead of the fast-path stopping early.
        {
            const g = goalRaw;
            const wantsFile = /(اكتب|اكتبها|احفظ|احفظها|دوّ?ن|خزّ?ن|صدّ?ر|صدّ?رها|write|save|export|store)/i.test(probe)
                && (/(ملف|file)/i.test(probe) || /\.(txt|md|csv|json|html|log)\b/i.test(probe));
            if ((!!urlMatch || looksBrowser) && wantsFile) {
                const fnameMatch = g.match(/\b([\w\-]+\.(?:txt|md|csv|json|html|log))\b/i)
                    || g.match(/(?:ملف|file)\s+["']?([\w\-.]+)["']?/i);
                let fname = (fnameMatch && fnameMatch[1]) ? fnameMatch[1] : 'joe-output.txt';
                if (!/\.[a-z0-9]{2,5}$/i.test(fname)) fname += '.txt';
                const browsePart = (g.split(/\s*(?:ثم|وبعدها|بعد\s*ذلك|بعدها|و?اكتبها?|و?احفظها?|then\b|and\s+then\b)\s*/i)[0] || g).trim() || g;
                console.log(`[PlanningEngine] browser+file compound -> browse then write ${fname}`);
                return {
                    id: `browser_file_${Date.now()}`,
                    goal: intent.goal,
                    steps: [
                        { id: 'browse', description: browsePart, tool: 'browser_run', agent: 'Browser', input: { task: browsePart, request: intent.goal }, dependsOn: [] },
                        { id: 'save', description: `احفظ النتيجة في ${fname}`, tool: 'write_file', agent: 'Dev', input: { path: fname, content: '{{FROM:browse}}' }, dependsOn: ['browse'] },
                    ],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // [BROWSER AGENT FAST-PATH] A request to LOG IN to a site, or to DO an
        // interactive action on a site (fill/post/book/order/send/subscribe…), needs
        // the closed-loop ReAct agent — not a one-shot search. Route it to the
        // "Browser" agent via a browser_run node (the orchestrator sends browser_run
        // nodes through the agent, which runs observe→decide→act until done or it
        // needs the user for 2FA/CAPTCHA/credentials). Placed AFTER the my-browser and
        // Google-account fast-paths so those keep priority, and after the consent gate.
        {
            const g = goalRaw;
            const loginIntent = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?\s*(إلى|الى|على)?\s*(حساب|موقع)|دخّ?لني\s*(إلى|الى|على)|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin|log-in/i.test(probe);
            const actionVerb = /(املأ|عبّ?ئ|انشر|احجز|اطلب|أرسل|ارسل|اشترك|قدّ?م|علّ?ق|أضف|اضف|ادفع|اشترِ?ي?|صوّ?ت|احجز|سجّ?لني|fill\s+in|fill\s+out|submit|post|publish|book|order|subscribe|apply|comment|checkout|add\s+to\s+cart|purchase|\bbuy\b|reserve|register|sign\s*up)/i.test(probe);
            // "Look at the page and DESCRIBE what you see / what's on it / read it" is a
            // question ABOUT a live page — it needs the agent to actually observe (and,
            // when the page isn't readable as text, SEE via the vision model), not a
            // blind one-shot browser_launch that just opens the URL and stops. Without
            // this, «افتح URL وصِف لي ما تراه» fell to the plain open fast-path.
            // Read/summarise a page is also a "look at the live page" task — «لخّص لي
            // عن X من ويكيبيديا» must reach the ReAct read agent (which goes straight to
            // the article and summarises), NOT the one-shot search that types the whole
            // sentence into a search box.
            const describeIntent = /(صِ?ف|وصف|اوصف|أوصف|انظر|أنظر|شاهد|اطّ?لع|اقرأ|لخّ?ص|ملخّ?ص|ماذا\s*(ترى|يوجد|فيها?)|ما\s*الذي\s*(تراه|فيها?)|ما\s*محتوى|من\s*هو|من\s*هي|ما\s*هو|ما\s*هي|أخبرني\s*(عن|بما)|اخبرني\s*(عن|بما)|describe|summari[sz]e|what\s*(do\s*you\s*)?see|what'?s\s*on|tell\s*me\s*(about|what)|who\s*is|what\s*is)/i.test(probe);
            // A named well-known site counts as a site reference too, so «سجّل الدخول
            // على جيت هاب» (no URL, no literal «موقع») still routes to the ReAct agent.
            // Content sites (Wikipedia) are included so «ادخل ويكيبيديا ولخّص عن X» routes here.
            const knownSite = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|انست[غق]رام|instagram|جيميل|gmail|جوجل|قوقل|غوغل|google|لينكد\s*ان|linkedin|ريديت|reddit|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok|ويكيبيديا|wikipedia)/i.test(probe);
            const siteRef = !!urlMatch || knownSite || /(موقع|منصّ?ة|حساب|بوابة|لوحة\s*تحكم|site|website|portal|account|dashboard)/i.test(probe);
            const hasTarget = !!urlMatch || knownSite;
            const isReactTask = (loginIntent && siteRef) || (hasTarget && (actionVerb || describeIntent));
            if (isReactTask) {
                console.log(`[PlanningEngine] browser-agent (ReAct) fast-path -> "${g.slice(0, 80)}"`);
                return {
                    id: `browser_agent_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_task',
                        description: intent.goal,                 // becomes node.task for the agent
                        tool: 'browser_run',                      // excluded from direct-tool path -> runs the agent
                        agent: 'Browser',
                        input: { task: intent.goal, request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
        }

        // [SEARCH HAS PRIORITY] A request with an explicit search verb ("ابحث عن X",
        // "search for X") is a SEARCH — even when it's wrapped in "افتح المتصفح و…".
        // The LLM classifier tends to latch onto the leading "افتح" and misroute the
        // whole thing to a plain open, and it also corrupts names (نابلس->نبعلس). So
        // we resolve search deterministically FIRST, from the user's own words, and
        // send it to the VISIBLE search tool. Only when there's no explicit site URL.
        if (looksBrowser && !urlMatch && PlanningEngine.hasSearchIntent(probe)) {
            const q = PlanningEngine.extractSearchQuery(goalRaw) || PlanningEngine.extractSearchQuery(goalNorm);
            if (q.length >= 2) {
                console.log(`[PlanningEngine] search priority -> browser_search query="${q}"`);
                return {
                    id: `browser_search_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'browser_smart', description: `Search (live typing): ${q}`, tool: 'browser_search', agent: 'Browser', input: { query: q, question: q, request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        if (looksBrowser) {
            try {
                const c = await PlanningEngine.classifyBrowserIntent(intent.goal, context);
                if (c && c.tool) {
                    let url = c.url;
                    // "search" routes to the VISIBLE search agent (browser_search):
                    // it opens the engine, types the query into the box live, then
                    // reads the results — no results-URL needed, just the query.
                    if (c.tool === 'browser_search') {
                        const q = (c.query || c.text || '').trim();
                        if (q.length >= 2) {
                            console.log(`[PlanningEngine] AI browser router -> browser_search query="${q}"`);
                            return {
                                id: `browser_ai_${Date.now()}`,
                                goal: intent.goal,
                                steps: [{ id: 'browser_smart', description: `search: ${q}`, tool: 'browser_search', agent: 'Browser', input: { query: q, question: c.query || intent.goal, request: intent.goal }, dependsOn: [] }],
                                metadata: { complexity: 'medium', riskLevel: 'low' },
                            };
                        }
                    }
                    if (!url && urlMatch) url = urlMatch[0];
                    // The classifier is a free LLM and DOES hallucinate the "url"
                    // field: it returned the Arabic word «الريبو» (Chromium then
                    // punycoded it to https://xn--mgbc0a5ewak/ and hung 30s) and
                    // even the tool's own name. Only accept something that really
                    // looks like a web address; otherwise drop it and let the
                    // deterministic paths below decide.
                    if (url && !isLikelyUrl(url)) {
                        console.warn(`[PlanningEngine] AI browser router returned a non-URL target ("${url}") — ignoring it.`);
                        url = '';
                    }
                    const input: any = { url: url || '', request: intent.goal, question: c.query || intent.goal };
                    if (c.tool === 'browser_click' && c.text) input.text = c.text;
                    if (c.tool === 'browser_find_text') input.query = c.query || c.text || '';
                    if (c.tool === 'browser_translate' && c.lang) input.target = c.lang;
                    // Tools other than launch/search need a real URL; if we
                    // don't have one, fall through to the deterministic paths.
                    const hasUsableTarget = !!url || c.tool === 'browser_launch';
                    if (hasUsableTarget) {
                        console.log(`[PlanningEngine] AI browser router -> ${c.tool} (action=${c.action}) url=${url || '(default)'}`);
                        return {
                            id: `browser_ai_${Date.now()}`,
                            goal: intent.goal,
                            steps: [{ id: 'browser_smart', description: `${c.tool} (${c.action})`, tool: c.tool, agent: 'Browser', input, dependsOn: [] }],
                            metadata: { complexity: 'medium', riskLevel: 'low' },
                        };
                    }
                }
            } catch (e) {
                console.warn('[PlanningEngine] AI browser router failed, using keyword fallback:', (e as any)?.message || e);
            }
        }

        const summarizeIntent = /(لخّ?ص|تلخيص|summari[sz]e|اقرأ\s*الصفحة|ما\s*مضمون)/i.test(probe);
        const auditIntent = /(دقّ?ق|تدقيق|افحص\s*الواجهة|audit|فحص\s*ui|راجع\s*التصميم|مشاكل\s*الواجهة|accessib)/i.test(probe);
        const extractIntent = /(استخرج|استخراج|extract|جدول|قائمة|csv|بيانات\s*الصفحة)/i.test(probe);
        const linksIntent = /(روابط\s*مكسور|مكسور|broken\s*links|فحص\s*الروابط|check\s*links)/i.test(probe);
        const perfIntent = /(أداء|السرعة|سرعة\s*الصفحة|performance|speed|زمن\s*التحميل)/i.test(probe);
        const seoIntent = /(seo|سيو|تحسين\s*محركات|meta\s*tags|الوسوم)/i.test(probe);
        const compareIntent = /(قارن|مقارنة|before\s*\/?\s*after|قبل\s*وبعد|قبل\/بعد)/i.test(probe);
        const consoleIntent = /(أخطاء|errors?|console|كونسول|جافا\s*سكربت|javascript|أعطال)/i.test(probe);
        const pdfIntent = /(pdf|احفظ.*صفحة|صدّ?ر.*صفحة|export\s*pdf|save\s*pdf)/i.test(probe);
        const readIntent = /(المقال|اقرأ\s*المقال|readab|article|نص\s*المقال|محتوى\s*نظيف)/i.test(probe);
        const contrastIntent = /(تباين|contrast|ألوان\s*الوصول|wcag)/i.test(probe);
        const a11yIntent = /(وصولية|accessib|a11y|aria|قارئ\s*الشاشة|لوحة\s*المفاتيح)/i.test(probe);
        const metaIntent = /(بيانات\s*وصفية|metadata|meta\s*tags|structured\s*data|json-?ld|الوسوم\s*الوصفية)/i.test(probe);
        const translateIntent = /(ترجم|ترجمة|translate|translation|بالعربية|to\s*(english|arabic|french))/i.test(probe);
        const responsiveIntent = /(تجاوب|responsive|الجوال|موبايل|mobile\s*view|أحجام\s*الشاشات|شاشات|breakpoints?)/i.test(probe);
        const findIntent = /(ابحث\s*عن|جد\s|find\s|أين\s*ورد|كم\s*مرة|highlight|ظلّل|علّم)/i.test(probe);
        const designIntent = /(نظام\s*التصميم|الألوان|ألوان\s*الصفحة|design\s*tokens?|palette|لوحة\s*ألوان|الخطوط\s*المستخدمة|typography)/i.test(probe);
        const clickIntent = /(انقر|اضغط|click|press|فعّل\s*الزر|اضغط\s*على)/i.test(probe);
        const fullshotIntent = /(لقطة\s*كاملة|screenshot\s*كامل|full\s*page|صورة\s*كاملة|كامل\s*الصفحة|طويلة)/i.test(probe);
        const agentIntent = /(تحليل\s*شامل|تقرير\s*شامل|حلّ?ل\s*الصفحة\s*بالكامل|وكيل\s*ذكي|smart\s*agent|full\s*analysis|analyze\s*(the\s*)?page|فحص\s*شامل|كل\s*شيء\s*عن\s*الصفحة)/i.test(probe);
        const autofixIntent = /(أصلح|اصلح|إصلاح\s*تلقائي|autofix|auto-?fix|صحّح\s*الصفحة|رقّع|عالج\s*المشاكل|fix\s*(the\s*)?(page|issues))/i.test(probe);
        if (urlMatch && (autofixIntent || agentIntent || summarizeIntent || auditIntent || extractIntent || linksIntent || perfIntent || seoIntent || compareIntent || consoleIntent || pdfIntent || readIntent || contrastIntent || a11yIntent || metaIntent || translateIntent || responsiveIntent || findIntent || designIntent || clickIntent || fullshotIntent)) {
            const tool = autofixIntent ? 'browser_autofix'
                : agentIntent ? 'browser_smart_agent'
                : clickIntent ? 'browser_click'
                : fullshotIntent ? 'browser_fullpage_shot'
                : designIntent ? 'browser_design_tokens'
                : findIntent ? 'browser_find_text'
                : responsiveIntent ? 'browser_responsive_check'
                : translateIntent ? 'browser_translate'
                : metaIntent ? 'browser_extract_meta'
                : a11yIntent ? 'browser_a11y_deep'
                : contrastIntent ? 'browser_contrast_audit'
                : readIntent ? 'browser_readability'
                : pdfIntent ? 'browser_save_pdf'
                : consoleIntent ? 'browser_console_scan'
                : compareIntent ? 'browser_compare'
                : linksIntent ? 'browser_check_links'
                : perfIntent ? 'browser_performance'
                : seoIntent ? 'browser_seo_audit'
                : extractIntent ? 'browser_extract_data'
                : auditIntent ? 'browser_ui_audit'
                : 'browser_summarize';
            const urls = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/ig) || [urlMatch[0]];
            const smartInput: any = { url: urlMatch[0], question: intent.goal, request: intent.goal };
            if (tool === 'browser_compare' && urls.length >= 2) { smartInput.before = urls[0]; smartInput.after = urls[1]; }
            if (tool === 'browser_translate') {
                const tm = goalRaw.match(/to\s+(english|arabic|french|spanish|german|turkish)|إلى\s*(الإنجليزية|الانجليزية|العربية|الفرنسية)/i);
                if (tm) smartInput.target = (tm[1] || tm[2] || '').toLowerCase();
            }
            if (tool === 'browser_find_text') {
                // pull the search term: quoted text, or the words after "find"/"ابحث عن"
                const qm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:ابحث\s*عن|جد|find|search\s*for)\s+([^\s].{0,60})/i);
                if (qm) smartInput.query = String(qm[1]).replace(/\s+(في|على|بالصفحة|in|on)\b.*$/i, '').trim();
            }
            if (tool === 'browser_click') {
                // pull the button/link label: quoted text, or the words after "click"/"انقر"
                const cm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:انقر\s*(?:على)?|اضغط\s*(?:على)?|click|press)\s+([^\s].{0,50})/i);
                if (cm) smartInput.text = String(cm[1]).replace(/\s+(في|على\s*الصفحة|زر|in|on|the\s*button)\b.*$/i, '').trim();
            }
            return {
                id: `browser_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_smart',
                    description: `${tool} on ${urlMatch[0]}`,
                    tool,
                    agent: 'Browser',
                    input: smartInput,
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [WEB SEARCH FAST-PATH] "ابحث عن X" / "search for X" -> actually SEARCH
        // (navigate to Google results for X) instead of just opening a blank Google.
        // Previously a search fell to the failover which opened the browser on the
        // homepage and did nothing.
        // NOTE: match the verb even with an attached "و" (and) prefix — e.g.
        // "افتح المتصفح وابحث عن X". The old (^|\s) anchor missed "وابحث", so the
        // request fell to the plain open-browser path and only showed Google.
        const searchIntent = PlanningEngine.hasSearchIntent(probe);
        if (searchIntent && !urlMatch) {
            // Extract the CLEAN topic from the user's own words (shared helper —
            // same logic used by the search-priority path above).
            const query = PlanningEngine.extractSearchQuery(goalRaw) || PlanningEngine.extractSearchQuery(goalNorm);
            if (query.length >= 2) {
                // Route to browser_search: it opens the engine, moves the cursor to
                // the search box, types the query LETTER-BY-LETTER in the live stream,
                // presses Enter, then reads and answers from the results — the human,
                // visible way (instead of silently jumping to a results URL).
                return {
                    id: `browser_search_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_smart',
                        description: `Search (live typing): ${query}`,
                        tool: 'browser_search',
                        agent: 'Browser',
                        input: { query, question: query, request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' }
                };
            }
        }

        // [OPEN BROWSER FAST-PATH] "open the browser", "go to <url>", "visit <site>".
        // This must be deterministic: a bare "افتح المتصفح" has no URL, so it would
        // otherwise fall through to the LLM DAG planner (which on weak free models
        // returns malformed JSON and invents non-existent tools). Route it straight
        // to browser_open, which navigates the LIVE-streamed session so the user
        // actually watches the page load.
        const openBrowserIntent = /(افتح|شغّ?ل|شغل|ادخل|روح|اذهب|استخدم|جرّ?ب|شوف|اعرض)\s*(لي\s*)?(ال)?(متصفح|براوزر|المتصفّح)|open\s*(the\s*)?browser|launch\s*browser|use\s*(the\s*)?browser|شغّ?ل\s*المتصفح/i.test(probe);
        const navigateIntent = /(اذهب\s*(إلى|الى|ل)|روح\s*(إلى|الى|ل)|افتح\s+(موقع|رابط|صفحة|الموقع)?|زر\s+(الموقع|الرابط)|ادخل\s+(موقع|على)|تصفّ?ح|عايِ?ن|افحص\s+الموقع|go\s*to|navigate\s*(to)?|visit|browse|open)\b/i.test(probe);
        const browserWord = /(متصفح|براوزر|browser|الويب\b|صفحة\s*الويب|الموقع|website|web\s*page)/i.test(probe);
        // Route to the live browser when: an explicit open/use-browser phrasing is
        // present; OR a URL is mentioned with any navigate/browser cue; OR the
        // intent analyser already decided this is a Browser task. Deterministic so
        // it never falls into the weak-model DAG planner.
        if (openBrowserIntent
            || (urlMatch && (navigateIntent || browserWord))
            || (urlMatch && String(intent.suggestedAgent || '') === 'Browser')) {
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: urlMatch ? `Open browser at ${urlMatch[0]}` : 'Open the live browser',
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url: urlMatch ? urlMatch[0] : '', request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        // (The [ATTACHMENTS ARE THE SUBJECT] guard now runs at the TOP of this
        // method, before every keyword fast-path — see above. It used to live
        // here and the browser+file compound path beat it to the goal.)

        // [SEMANTIC ROUTER] Every keyword path above has missed. Rather than hand
        // the request to the generic DAG planner — which is what produced six
        // English steps and a web search when the user asked for nicer colours —
        // ask the model what was actually meant. Deterministic paths already had
        // their chance, so this costs nothing on the requests they handle.
        if (String(intent.goal || '').trim().length >= 6) {
            const routed = await PlanningEngine.classifyRequestIntent(intent.goal, { hasActivePage }, context);
            if (routed) {
                console.log(`[PlanningEngine] semantic router -> ${routed.intent}${routed.repo ? ` (${routed.repo})` : ''}`);
                if (routed.intent === 'build_page' || routed.intent === 'edit_page') {
                    return {
                        id: `build_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'build_page',
                            description: `Building: ${intent.goal}`,
                            tool: 'web_page_builder',
                            agent: 'Dev',
                            input: { request: intent.goal },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'medium', riskLevel: 'low' }
                    };
                }
                if (routed.intent === 'analyze_repo') {
                    return {
                        id: `repo_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'repo_analyze',
                            description: routed.repo ? `تحليل المستودع ${routed.repo}` : 'تحليل المستودع المتصل',
                            tool: 'github_repo_manager',
                            agent: 'General',
                            input: { action: 'analyze', ...(routed.repo ? { repoName: routed.repo } : {}) },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'medium', riskLevel: 'low' }
                    };
                }
                if (routed.intent === 'answer') {
                    return {
                        id: `chat_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'direct_response',
                            description: `Answering: ${intent.goal}`,
                            tool: 'central_answer',
                            agent: 'General',
                            input: { question: intent.goal },
                            dependsOn: []
                        }],
                        metadata: { complexity: 'low', riskLevel: 'low' }
                    };
                }
            }
        }

        // [ELITE FAST-PATH] Direct answer for general questions or chat
        if ((intent as any).type === 'general' || (intent as any).type === 'chat' || intent.goal.length < 30) {
            return {
                id: `chat_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'direct_response',
                    description: `Answering: ${intent.goal}`,
                    tool: 'central_answer',
                    agent: 'General',
                    input: { question: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        return PlanningEngine.generateDynamicDag(intent, memory, context);
    }

    /**
     * The real planner: an LLM-generated execution DAG. Reached two ways —
     * a genuine goal that no fast-path claimed, or a RECOVERY goal that was
     * deliberately routed here past every fast-path (a repair must be planned
     * from the error, never keyword-matched back into the step that failed).
     */
    private static async generateDynamicDag(intent: StructuredIntent, memory: any, context?: any): Promise<ExecutionPlan> {
        console.log(`[PlanningEngine] Generating REAL-TIME DAG for: ${intent.goal}`);

        const isRecovery = /^fix and continue:/i.test(String(intent.goal || '').trim());
        // Compacted, never raw: one completed page-builder node used to drag an
        // entire HTML page into this prompt and the planning call itself died on
        // free-tier token limits — turning every recovery into the failover node.
        const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(compactHistoryForPrompt(memory))}` : "";
        const recoveryRules = isRecovery ? `
This is a FAILURE-RECOVERY plan. Non-negotiable rules:
- READ the error text inside the goal. Every step you propose must address its CAUSE (missing dependency -> install it; wrong path -> locate the right one; syntax error -> read the file and fix that line).
- NEVER just re-run the failed step unchanged as the whole plan; earn the retry with a diagnosis or repair step before it.
- Keep it minimal: diagnose -> repair -> re-run. Do not re-author work that already succeeded.` : '';

        const entropySeed = Math.random().toString(36).substring(7);
        const systemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${entropySeed} (Use this to explore different optimal paths if possible)

Constraints:
- Use ONLY existing tools: shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
- Define explicit dependencies (dependsOn).
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.${recoveryRules}

Goal: ${intent.goal}
Complexity: ${intent.complexity}
Risk: ${intent.riskLevel}${historyContext}

Return ONLY a JSON array of steps:
[
  {
    "id": "node_id",
    "task": "precise task description",
    "tool": "tool_name",
    "agent": "agent_type",
    "input": { "instruction": "..." },
    "dependsOn": ["prev_node_id"]
  }
]`;

        try {
            // Using routeToModel for planning
            const response = await routeToModel([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze goal and generate DAG for: ${intent.goal}` }
                // Planning is internal reasoning — the local brain writes the
                // DAG JSON; the daily quota stays for the user-facing answer.
            ], undefined, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' });

            const rawSteps = PlanningEngine.parseJsonArrayLoose(response);
            if (rawSteps) {
                const steps: ExecutionStep[] = PlanningEngine.sanitizeSteps((Array.isArray(rawSteps) ? rawSteps : []).map((step: any) => ({
                    id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
                    description: String(step.description || step.task || step.task_description || `Execute task`),
                    tool: String(step.tool || 'shell_execute'),
                    agent: String(step.agent || 'General'),
                    input: step.input || {},
                    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : []
                })), String(intent.goal || ''));

                return {
                    id: `dag_${Date.now()}`,
                    goal: intent.goal,
                    steps,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel
                    }
                };
            }
        } catch (err) {
            console.error('[PlanningEngine] Dynamic DAG generation failed:', err);
        }

        // Emergency Fallback (Dynamic but minimal)
        console.warn(`[PlanningEngine] Using failover node for: ${intent.goal}`);
        const fallbackUrl = String(intent.goal || '').match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
        const isBrowserFallback = (intent.suggestedAgent === 'Browser') || (intent.requiredTools && intent.requiredTools.includes('browser_run')) || !!fallbackUrl;
        // For browser intents, open the live browser deterministically instead of
        // the generic browser_run (which needs explicit actions and otherwise dies
        // with "actions_or_instruction_required" -> "Recovery failed").
        return {
            id: `failover_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: isBrowserFallback ? 'browser_open' : 'recovery_node',
                description: `Respond to: ${intent.goal}`,
                tool: isBrowserFallback ? 'browser_launch' : 'central_answer',
                agent: isBrowserFallback ? 'Browser' : (intent.suggestedAgent || 'General'),
                input: isBrowserFallback ? { url: fallbackUrl ? fallbackUrl[0] : '', request: intent.goal } : { question: intent.goal },
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }

    /**
     * TOLERANT JSON. The field log: «Dynamic DAG generation failed:
     * SyntaxError: Expected ',' or '}' after property value at position
     * 1306» — one bad character from a weak model threw away an otherwise
     * valid 5-node plan and dropped the run into the failover node. Broken
     * JSON is repaired in stages (fences, trailing commas, smart quotes),
     * and as the last resort every individually-valid object is salvaged —
     * four good nodes beat zero.
     */
    static parseJsonArrayLoose(text: string): any[] | null {
        const cleaned = String(text || '').replace(/```(?:json)?/gi, '');
        const m = cleaned.match(/\[[\s\S]*\]/);
        if (!m) return null;
        const raw = m[0];
        const attempts = [
            raw,
            raw.replace(/,\s*([}\]])/g, '$1'),
            raw.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1'),
            raw.replace(/\}\s*\{/g, '},{').replace(/,\s*([}\]])/g, '$1'),
        ];
        for (const a of attempts) {
            try { const v = JSON.parse(a); if (Array.isArray(v)) return v; } catch { /* next repair */ }
        }
        // Salvage: extract each balanced {...} object and keep the valid ones.
        const objs: any[] = [];
        let depth = 0, start = -1;
        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (c === '{') { if (depth === 0) start = i; depth++; }
            else if (c === '}') {
                depth--;
                if (depth === 0 && start >= 0) {
                    try { objs.push(JSON.parse(raw.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1'))); } catch { /* skip the broken one */ }
                    start = -1;
                }
            }
        }
        if (objs.length) console.warn(`[PlanningEngine] JSON was broken — salvaged ${objs.length} valid node(s) instead of failing over.`);
        return objs.length ? objs : null;
    }

    /**
     * PLAN SANITY. The field log again, verbatim: «Node node_3 failed:
     * central_answer was called without a question», «Node node_4 failed:
     * filename or path is required» — the model planned tool calls with
     * empty inputs and each one became a user-visible failure plus a
     * recovery cycle. Every step now leaves planning with the inputs its
     * tool cannot run without.
     */
    static sanitizeSteps<T extends { tool: string; description: string; input: any }>(steps: T[], goal: string): T[] {
        const userGoal = goal.split(/\n+\[(?:ATTACHED FILES|STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|RESPONSE LANGUAGE)/)[0].trim();
        for (const s of steps) {
            s.input = s.input && typeof s.input === 'object' ? s.input : {};
            const t = String(s.tool || '');
            if (t === 'central_answer' && !String(s.input.question || '').trim()) {
                s.input.question = s.description && s.description !== 'Execute task'
                    ? `${s.description}\n\n(السياق الكامل للطلب): ${userGoal}` : userGoal;
            }
            if ((t === 'browser_run' || t === 'browser_launch') && !String(s.input.task || s.input.url || s.input.instructionText || '').trim()) {
                s.input.task = s.description || userGoal;
            }
            if (t === 'write_file' && !String(s.input.path || s.input.filename || '').trim()) {
                s.input.path = `joe-output-${Date.now()}.txt`;
            }
            if (!s.input.request) s.input.request = userGoal;
        }
        return steps;
    }
}
