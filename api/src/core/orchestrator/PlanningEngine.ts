import { StructuredIntent } from '../intelligence/IntentParser';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    agent: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
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
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, context),
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
        const goalLower = String(intent.goal || '').toLowerCase();

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        const buildVerb = /\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو)/.test(intent.goal || '');
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface)\b/.test(goalLower)
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط)/.test(intent.goal || '');
        // Route follow-up edits (add button / change colour / ...) to the SAME page.
        const activeKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
        const editIntent = /\b(add|change|modify|update|edit|remove|bigger|smaller|colou?r|button|background|header|footer|font|title)\b/i.test(goalLower)
            || /(أضف|اضف|غيّر|غير|عدّل|عدل|بدّل|بدل|اجعل|احذف|كبّر|صغّر|لون|زر|خلفية|حجم|عنوان|خط)/.test(intent.goal || '');
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
            const myBrowser = /(في|بـ?|على)?\s*متصفّ?حي(\s*(الشخصي|الحقيقي))?|بمتصفّ?حي|my\s+(own\s+)?browser|in\s+my\s+browser|on\s+my\s+browser/i.test(g);
            if (myBrowser) {
                const urlM = g.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
                const action = urlM ? 'open' : /(اقرأ|لخّ?ص|read|summar)/i.test(g) ? 'read' : /(لقطة|screenshot|صورة)/i.test(g) ? 'screenshot' : 'open';
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
            const gmailRead = /(بريد|ايميل|إيميل|رسائل|جيميل|gmail|inbox|صندوق\s*الوارد|mail)/i.test(g);
            const calList = /(تقويم|مواعيد|أجندة|اجندة|calendar|events?|اجتماعات)/i.test(g);
            const driveList = /(درايف|ملفاتي|drive|ملفات\s*جوجل)/i.test(g);
            const sendMail = /(أرسل|ارسل|ابعث|send)\s+(بريد|ايميل|إيميل|رسالة|mail|email)/i.test(g);
            // Guard: "log in to https://mail.<site>" is a SITE login, not "read my
            // Gmail" — the word "mail" inside the URL must not hijack it to the API.
            const hasUrl = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)\b/i.test(g);
            const loginToSite = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin/i.test(g);
            if ((gmailRead || calList || driveList || sendMail) && !(hasUrl && loginToSite)) {
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

        // [BROWSER SMART TOOLS FAST-PATH] summarise / audit a URL reliably.
        const goalRaw = intent.goal || '';
        const urlMatch = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);

        // [INTELLIGENT BROWSER ROUTER] Understand the request semantically (any
        // language / any phrasing) with the model, instead of relying on brittle
        // keyword regexes. This is the primary path; the keyword fast-paths below
        // remain only as a deterministic fallback when the model is unavailable.
        const looksBrowser = !!urlMatch || String(intent.suggestedAgent || '') === 'Browser'
            || /(متصفح|براوزر|موقع|صفحة|الويب|الإنترنت|الانترنت|ابحث|إبحث|بحث|جد|جِد|دوّ?ر|فتّ?ش|افتح|تصفّ?ح|عايِ?ن|لخّ?ص|حلّ?ل|دقّ?ق|افحص|انقر|اضغط|املأ|عبّ?ئ|ترجم|قارن|استخرج|browser|web|site|page|search|find|look\s*up|google|open|visit|go\s*to|summari|analy|audit|click|fill|translate|compare|extract|scrape|seo)/i.test(goalRaw);

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

        // [BROWSER + FILE COMPOUND FAST-PATH] "browse/extract X, THEN write/save it to
        // a file" is TWO tools in one request. Build a 2-node plan — browser extracts,
        // then write_file consumes the browser result via {{FROM:browse}} — so the
        // browser chains with the other tools instead of the fast-path stopping early.
        {
            const g = goalRaw;
            const wantsFile = /(اكتب|اكتبها|احفظ|احفظها|دوّ?ن|خزّ?ن|صدّ?ر|صدّ?رها|write|save|export|store)/i.test(g)
                && (/(ملف|file)/i.test(g) || /\.(txt|md|csv|json|html|log)\b/i.test(g));
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
            const loginIntent = /(سجّ?ل|تسجيل)\s*(ال)?دخول|سجّ?ل\s*دخول|ادخل(ني)?\s*(إلى|الى|على)?\s*(حساب|موقع)|دخّ?لني\s*(إلى|الى|على)|log\s*-?\s*in|log\s*in|sign\s*-?\s*in|signin|log-in/i.test(g);
            const actionVerb = /(املأ|عبّ?ئ|انشر|احجز|اطلب|أرسل|ارسل|اشترك|قدّ?م|علّ?ق|أضف|اضف|ادفع|اشترِ?ي?|صوّ?ت|احجز|سجّ?لني|fill\s+in|fill\s+out|submit|post|publish|book|order|subscribe|apply|comment|checkout|add\s+to\s+cart|purchase|\bbuy\b|reserve|register|sign\s*up)/i.test(g);
            const siteRef = !!urlMatch || /(موقع|منصّ?ة|حساب|بوابة|لوحة\s*تحكم|site|website|portal|account|dashboard)/i.test(g);
            const isReactTask = (loginIntent && (siteRef || !!urlMatch)) || (!!urlMatch && actionVerb);
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
        if (looksBrowser && !urlMatch && PlanningEngine.hasSearchIntent(goalRaw)) {
            const q = PlanningEngine.extractSearchQuery(goalRaw);
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

        const summarizeIntent = /(لخّ?ص|تلخيص|summari[sz]e|اقرأ\s*الصفحة|ما\s*مضمون)/i.test(goalRaw);
        const auditIntent = /(دقّ?ق|تدقيق|افحص\s*الواجهة|audit|فحص\s*ui|راجع\s*التصميم|مشاكل\s*الواجهة|accessib)/i.test(goalRaw);
        const extractIntent = /(استخرج|استخراج|extract|جدول|قائمة|csv|بيانات\s*الصفحة)/i.test(goalRaw);
        const linksIntent = /(روابط\s*مكسور|مكسور|broken\s*links|فحص\s*الروابط|check\s*links)/i.test(goalRaw);
        const perfIntent = /(أداء|السرعة|سرعة\s*الصفحة|performance|speed|زمن\s*التحميل)/i.test(goalRaw);
        const seoIntent = /(seo|سيو|تحسين\s*محركات|meta\s*tags|الوسوم)/i.test(goalRaw);
        const compareIntent = /(قارن|مقارنة|before\s*\/?\s*after|قبل\s*وبعد|قبل\/بعد)/i.test(goalRaw);
        const consoleIntent = /(أخطاء|errors?|console|كونسول|جافا\s*سكربت|javascript|أعطال)/i.test(goalRaw);
        const pdfIntent = /(pdf|احفظ.*صفحة|صدّ?ر.*صفحة|export\s*pdf|save\s*pdf)/i.test(goalRaw);
        const readIntent = /(المقال|اقرأ\s*المقال|readab|article|نص\s*المقال|محتوى\s*نظيف)/i.test(goalRaw);
        const contrastIntent = /(تباين|contrast|ألوان\s*الوصول|wcag)/i.test(goalRaw);
        const a11yIntent = /(وصولية|accessib|a11y|aria|قارئ\s*الشاشة|لوحة\s*المفاتيح)/i.test(goalRaw);
        const metaIntent = /(بيانات\s*وصفية|metadata|meta\s*tags|structured\s*data|json-?ld|الوسوم\s*الوصفية)/i.test(goalRaw);
        const translateIntent = /(ترجم|ترجمة|translate|translation|بالعربية|to\s*(english|arabic|french))/i.test(goalRaw);
        const responsiveIntent = /(تجاوب|responsive|الجوال|موبايل|mobile\s*view|أحجام\s*الشاشات|شاشات|breakpoints?)/i.test(goalRaw);
        const findIntent = /(ابحث\s*عن|جد\s|find\s|أين\s*ورد|كم\s*مرة|highlight|ظلّل|علّم)/i.test(goalRaw);
        const designIntent = /(نظام\s*التصميم|الألوان|ألوان\s*الصفحة|design\s*tokens?|palette|لوحة\s*ألوان|الخطوط\s*المستخدمة|typography)/i.test(goalRaw);
        const clickIntent = /(انقر|اضغط|click|press|فعّل\s*الزر|اضغط\s*على)/i.test(goalRaw);
        const fullshotIntent = /(لقطة\s*كاملة|screenshot\s*كامل|full\s*page|صورة\s*كاملة|كامل\s*الصفحة|طويلة)/i.test(goalRaw);
        const agentIntent = /(تحليل\s*شامل|تقرير\s*شامل|حلّ?ل\s*الصفحة\s*بالكامل|وكيل\s*ذكي|smart\s*agent|full\s*analysis|analyze\s*(the\s*)?page|فحص\s*شامل|كل\s*شيء\s*عن\s*الصفحة)/i.test(goalRaw);
        const autofixIntent = /(أصلح|اصلح|إصلاح\s*تلقائي|autofix|auto-?fix|صحّح\s*الصفحة|رقّع|عالج\s*المشاكل|fix\s*(the\s*)?(page|issues))/i.test(goalRaw);
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
        const searchIntent = PlanningEngine.hasSearchIntent(goalRaw);
        if (searchIntent && !urlMatch) {
            // Extract the CLEAN topic from the user's own words (shared helper —
            // same logic used by the search-priority path above).
            const query = PlanningEngine.extractSearchQuery(goalRaw);
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
        const openBrowserIntent = /(افتح|شغّ?ل|شغل|ادخل|روح|اذهب|استخدم|جرّ?ب|شوف|اعرض)\s*(لي\s*)?(ال)?(متصفح|براوزر|المتصفّح)|open\s*(the\s*)?browser|launch\s*browser|use\s*(the\s*)?browser|شغّ?ل\s*المتصفح/i.test(goalRaw);
        const navigateIntent = /(اذهب\s*(إلى|الى|ل)|روح\s*(إلى|الى|ل)|افتح\s+(موقع|رابط|صفحة|الموقع)?|زر\s+(الموقع|الرابط)|ادخل\s+(موقع|على)|تصفّ?ح|عايِ?ن|افحص\s+الموقع|go\s*to|navigate\s*(to)?|visit|browse|open)\b/i.test(goalRaw);
        const browserWord = /(متصفح|براوزر|browser|الويب\b|صفحة\s*الويب|الموقع|website|web\s*page)/i.test(goalRaw);
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

        console.log(`[PlanningEngine] Generating REAL-TIME DAG for: ${intent.goal}`);

        const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(memory)}` : "";

        const entropySeed = Math.random().toString(36).substring(7);
        const systemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${entropySeed} (Use this to explore different optimal paths if possible)

Constraints:
- Use ONLY existing tools: shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
- Define explicit dependencies (dependsOn).
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.

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
            ], undefined, undefined, undefined, undefined, undefined, undefined, context);

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const rawSteps = JSON.parse(jsonMatch[0]);
                const steps: ExecutionStep[] = (Array.isArray(rawSteps) ? rawSteps : []).map((step: any) => ({
                    id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
                    description: String(step.description || step.task || step.task_description || `Execute task`),
                    tool: String(step.tool || 'shell_execute'),
                    agent: String(step.agent || 'General'),
                    input: step.input || {},
                    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : []
                }));
                
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
        const isBrowserFallback = (intent.suggestedAgent === 'Browser') || (intent.requiredTools && intent.requiredTools.includes('browser_run')) || !!urlMatch;
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
                input: isBrowserFallback ? { url: urlMatch ? urlMatch[0] : '', request: intent.goal } : { question: intent.goal },
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }
}
