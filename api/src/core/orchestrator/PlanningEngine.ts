import { StructuredIntent } from '../intelligence/IntentParser';
import { catalogueFor, registeredToolNames, capabilityRoute, inputForTool } from './toolCatalog';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';
import { normalizeIntentText, stripArabicDiacritics, foldChars } from './promptNormalizer';
import { compactHistoryForPrompt } from './history-compact';
import { enrichWorkspaceToolInput } from './workspace-evidence';
import { findActiveBuiltProject } from './active-built-project';
import { looksLikeBuild } from './buildIntent';

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

/**
 * HIS SITE'S INBOX — SAID SO PLAINLY THAT GMAIL MUST NOT ANSWER.
 *
 * «رسائل» belongs to two different worlds: the mail in his Google account,
 * and the messages visitors left in the contact form of the site Joe built
 * him. The Gmail fast-path claimed the word outright, so «اقرأ رسائل نموذج
 * التواصل» — a question about his own site — went to Google and came back
 * asking him to connect an account he never mentioned.
 *
 * This names the second world unambiguously: the word «رسائل» standing next
 * to «النموذج / الموقع / الزوار / التواصل», in either order. Where it
 * matches, the site's inbox wins and the Gmail path steps aside — the same
 * shape as the four guards already living there (a URL login, a compound
 * browse-then-email, a form field named «بريد»).
 *
 * Exported because both ends of that decision have to agree, and a shared
 * constant is the only way two regexes cannot drift apart.
 */
export const SITE_INBOX = new RegExp(
    [
        // «رسائل النموذج» — the site word first, the message word after.
        '(نموذج|النموذج|الموقع|موقعي|الزوار|زوار|التواصل|اتصل\\s*بنا|تواصل\\s*معنا)\\s*[^.\\n]{0,14}?(رسائل|رساله|رسالة|الرسائل)',
        // «رسائل الموقع» — the same two words, the other way round.
        '(رسائل|رساله|رسالة|الرسائل)\\s*[^.\\n]{0,14}?(النموذج|نموذج|الموقع|موقعي|الزوار|زوار|التواصل)',
        'contact\\s*form',
        'form\\s*(inbox|messages|submissions)',
        'site\\s*messages',
    ].join('|'),
    'i',
);

export interface ExecutionPlan {
    id: string;
    goal: string;
    steps: ExecutionStep[];
    metadata: {
        complexity: string;
        riskLevel: string;
        estimatedDurationMs?: number;
        /**
         * WHY THESE ARE DECLARED RATHER THAN CAST AWAY.
         *
         * Three plans were setting `terminalExecution`, `buildVerification`
         * and `matchedBy` on this object, and `tsc` refused two of them —
         * excess-property checks catch a fresh literal but not one that has
         * been widened on the way in, so the same mistake failed loudly in one
         * place and passed silently in another. They are real, useful facts
         * about a plan: whether it must run in the terminal, whether its
         * result has to be build-verified, and which matcher chose it.
         * Declaring them makes them readable by the orchestrator instead of
         * being a lie the compiler was talked out of.
         */
        terminalExecution?: boolean;
        buildVerification?: boolean;
        matchedBy?: string;
        /**
         * The same omission happened again one commit later: the ORION plan
         * set `deterministic` and `localOnly` and `tsc` went red while the
         * whole Jest suite stayed green — ts-jest runs with `diagnostics:
         * false` and esbuild does not typecheck, so NOTHING in the
         * test-and-build path can see this class of error. `npx tsc
         * --noEmit` is the only gate that can, which is why it is run
         * separately on every batch. Both facts are worth carrying: a
         * deterministic plan was chosen by a matcher rather than a model,
         * and a local-only plan must not reach for the network.
         */
        deterministic?: boolean;
        localOnly?: boolean;
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

    /**
     * A PAGE, AN APPLICATION, OR A SYSTEM WITH ITS OWN DATA.
     *
     * Decided from the user's own words and nothing else, so it is the same
     * answer with the brain running or dead:
     *
     *   page   — one document. «صفحة هبوط», «بورتفوليو», «قائمة طعام».
     *   app    — screens, state, interaction. «تطبيق», «لوحة تحكم», «محرّر»,
     *            or anything compared to a real product («شبيه بخرائط جوجل»).
     *   system — an app that OWNS data: accounts, a database, orders, bookings,
     *            inventory, reports, roles. It gets a backend of its own.
     */
    /**
     * Tools that can only ANSWER. None of them puts a file on disk, so a plan
     * made entirely of them has built nothing, whatever it reports.
     */
    static readonly ANSWER_ONLY = new Set([
        'central_answer', 'ask_user', 'echo', 'multi_agent_debate',
        'ambiguity_resolver', 'self_confidence_evaluator', 'request_analyzer',
    ]);

    /** Does this request ask for something to EXIST afterwards? */
    /** Moved to ./buildIntent so the router can ask the same question the
     *  planner asks. Kept as a static so every existing call site and test
     *  keeps working unchanged. */
    static looksLikeBuild = looksLikeBuild;

    /**
     * ASKING IS NOT ORDERING.
     *
     * Used by capabilityPlan to refuse a routing decision it has no business
     * making. The order of the two tests matters and is deliberate: a deed is
     * checked FIRST, because a request can be shaped like a question and still
     * be an order — «هل يمكنك بناء موقع لي؟» asks permission to do a thing, and
     * the thing is what must happen. Only a sentence that names no deed at all
     * is treated as a question.
     *
     * The word lists below are written in FOLDED spelling — «متي» not «متى»,
     * «انشي» not «أنشئ», «بنا» not «بناء» — because both sides of every
     * comparison are folded first. Listing hamza and alef-maqsura variants by
     * hand is how «أنشر» quietly stopped being a deed: measured here, the guard
     * missed it until the folding was applied instead of a longer list.
     */
    static isKnowledgeQuestion(goalRaw: string): boolean {
        const g = String(goalRaw || '').trim();
        if (!g) return false;
        const bare = foldChars(g);

        // A deed outranks a question mark.
        const ordersADeed =
            /(?:^|[\s،:؛])(?:ابن|ابني|بن|انشي|انشا|اصنع|صمم|اصمم|طور|اعمل|برمج|بنا|تصميم|شغل|اوقف|انشر|عدل|احذف|اضف|اصلح|افتح|ابحث|نفذ|حلل|ارسل|حمل|ثبت)(?=$|[\s،:؛؟.])/.test(bare)
            || /\b(build|create|make|develop|generate|scaffold|implement|deploy|publish|run|start|stop|edit|delete|remove|add|fix|open|search|execute|install|analyz|analys)\w*\b/i.test(g);
        if (ordersADeed) return false;

        return /(?:^|[\s،:؛])(?:ما|ماذا|هل|لماذا|كيف|متي|اين|كم|اي|ايهما)(?=$|[\s،:؛؟.])/.test(bare)
            || /(?:^|[\s،:؛])(?:اشرح|وضح|فسر|قارن|عرف|علمني|اخبرني)(?=$|[\s،:؛])/.test(bare)
            || /\b(what|why|how|when|which|who|explain|compare|difference|versus|vs)\b/i.test(g)
            || /[؟?]\s*$/.test(g);
    }

    /**
     * A specification is an engineering source of truth, not a bag of verbs.
     *
     * A user can legitimately say «اقرأ NEXUS_SPECIFICATION.md ثم نفّذها»
     * without also naming the future product type.  Splitting that sentence at
     * «ثم» lets keyword matching turn it into unrelated write/test tools before
     * Joe has read the file.  Require all three signals below: an explicit read,
     * a concrete local source, and an execution verb.  This deliberately does
     * not claim analysis-only requests such as «اقرأ المواصفة ولخّصها».
     */
    static isLocalSpecificationExecutionRequest(goalRaw: string): boolean {
        const goal = String(goalRaw || '');
        const boundary = '(?=$|[\\s،؛,:.!?])';
        const asksToRead = new RegExp(`(?:اقر[أا]|إقرأ|قراءة|read|inspect)${boundary}`, 'i').test(goal);
        const namesSource = /(?:\b[\w.-]+\.(?:md|mdx|txt|rst|pdf|docx?|yaml|yml|json)\b|(?:ملف|وثيقة|مستند)\s+(?:المواصفات|مواصفات|متطلبات|requirements?|spec(?:ification)?|prd))/i.test(goal);
        const asksToExecute = new RegExp(`(?:نفّ?ذ|طبّ?ق|ابنِ|ابني|انشئ|أنشئ|اصنع|طوّ?ر|طوّر|build|create|implement|develop|scaffold)${boundary}`, 'i').test(goal);
        return asksToRead && namesSource && asksToExecute;
    }

    static classifyBuildScope(goalRaw: string): 'page' | 'app' | 'system' {
        // A declared category list is field OPTIONS, not scope evidence:
        // «بفئات: طعام، مواصلات، فواتير» made an expense app a billing
        // SYSTEM because the category word «فواتير» sat in dataSignals.
        let g = String(goalRaw || '');
        try {
            const { stripDeclaredOptions } = require('../design/app-blueprints');
            g = stripDeclaredOptions(g);
        } catch { /* the classifier still answers from the raw text */ }
        // Its own data, its own users → it needs a server and a database.
        /**
         * ARABIC PLURALS THE LIST DID NOT KNOW.
         *
         * «بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات» — a system
         * with SUPPLIERS and ORDERS, which is a database by definition. The
         * list carried «طلبات» and matched neither «الطلبيات» nor «الموردون»,
         * so the scope came back «app» and he would have received a front-end
         * with nowhere to put a supplier.
         */
        const dataSignals = /(تسجيل\s*دخول|تسجيل\s*الدخول|حسابات?|مستخدمين|صلاحيات|قاعدة\s*بيانات|قواعد\s*بيانات|حجوزات?|حجز|طلبات|طلبيّ?ات|مخزون|جرد|فواتير|فاتورة|تقارير|إحصائيات|احصائيات|نقاط\s*بيع|كاشير|رواتب|موظفين|عملاء|زبائن|مورّ?دي?ن|مورّ?دون|اشتراكات|مدفوعات|دفع\s*إلكتروني|قاعدة\s*البيانات|\blogin\b|\bauth\b|\bdatabase\b|(?:registered|authenticated|multiple|admin|end)\s+users?\b|users?\s+(?:accounts?|roles?|permissions?|can\s+sign\s+in)|orders?|suppliers?|vendors?|inventory|invoices?|reports?|bookings?|payments?|subscriptions?|crm|erp|pos)/i;
        // Consuming a public or third-party API is not the same as asking Joe
        // to own a backend.  Keep explicit API-building requests as systems,
        // while allowing browser apps to call services such as Open-Meteo.
        const ownedApiSignals = /(?:\b(?:build|create|make|develop|implement|design|provide|expose)\s+(?:an?\s+)?(?:rest\s+|graphql\s+)?api\b|\b(?:build|create|make|develop|implement|design|provide|expose|own|internal|private)\s+(?:an?\s+)?backend\b|\b(?:api|backend)\s+(?:server|service|endpoint)\b|(?:ابنِ|ابني|أنشئ|انشئ|طوّر|طور|اصنع|أنشئ)\s+(?:لي\s+)?(?:واجهة\s+)?(?:برمجية|api|backend))/i;
        // Screens and behaviour rather than a single scroll.
        const appSignals = /(تطبيق|نظام|منصّ?ة|برنامج|لوحة\s*تحكم|داشبورد|محرّ?ر|أداة\s*ويب|لعبة|محادثة|دردشة|شات|خرائط|خريطة|تتبّ?ع|حاسبة|مخطّ?ط|جدولة|مهامّ?|شبيه\s*ب|مثل\s*تطبيق|clone|dashboard|applications?\b|app\b|platform|system|editor|tracker|chat|map|game|planner|scheduler|calculator|todo|to-do|tasks?|(?:web\s+)?console|background\s+(?:jobs?|workers?)|worker\s+(?:queue|process))/i;
        // A single document, said outright.
        const pageSignals = /(صفحة\s*(هبوط|واحدة)?|لاندنج|بورتفوليو|معرض\s*أعمال|سيرة\s*ذاتية|بروشور|قائمة\s*طعام|منيو|landing|portfolio|brochure|one[- ]?pager|resume|cv)/i;

        const data = dataSignals.test(g) || ownedApiSignals.test(g);
        const app = appSignals.test(g);
        const page = pageSignals.test(g);

        // «صفحة هبوط لتطبيق جوال» is a PAGE about an app, not an app: when the
        // request names the document it wants, that wins over the subject it is
        // about. Only owning data outranks it.
        if (page && !data) return 'page';
        if (data) return 'system';
        if (app) return 'app';
        return 'page';
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
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
            // Semantic routing is part of the engineering pipeline when the caller
            // is already executing a real build.  Its short chat timeout used to
            // abort the LLM7 request before the bounded engineering deadline,
            // leaving the rest of the run to mis-route numbered QA bullets into
            // browser searches.  Preserve the short fast-path for ordinary chat,
            // but inherit the caller's explicit engineering patience here.
            const inheritedContext = { ...(context || {}), purpose: 'internal' };
            const requested = Number(inheritedContext.providerTimeoutMs ?? inheritedContext.plannerTimeoutMs);
            const classifierTimeoutMs = inheritedContext.engineeringPipeline === true
                ? Math.min(180_000, Math.max(90_000, Number.isFinite(requested) && requested > 0 ? requested : 90_000))
                : 12_000;
            const timeoutPromise = new Promise<never>((_, rej) => {
                timeoutHandle = setTimeout(() => rej(new Error('timeout')), classifierTimeoutMs);
            });
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, inheritedContext),
                timeoutPromise,
            ]);
        } catch { return null; }
        finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
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
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
            // Browser-intent classification can be reached from the QA part of a
            // project pipeline.  Do not let its ordinary 18s chat guard cancel a
            // real engineering LLM7 turn; non-engineering browser requests retain
            // the original quick semantic probe.
            const inheritedContext = { ...(context || {}), purpose: 'internal' };
            const requested = Number(inheritedContext.providerTimeoutMs ?? inheritedContext.plannerTimeoutMs);
            const classifierTimeoutMs = inheritedContext.engineeringPipeline === true
                ? Math.min(180_000, Math.max(90_000, Number.isFinite(requested) && requested > 0 ? requested : 90_000))
                : 18_000;
            const timeoutPromise = new Promise<never>((_, rej) => {
                timeoutHandle = setTimeout(() => rej(new Error('timeout')), classifierTimeoutMs);
            });
            raw = await Promise.race([
                routeToModel([{ role: 'system', content: sys }, { role: 'user', content: `Request: ${goal}` }], undefined, undefined, undefined, undefined, undefined, undefined, inheritedContext),
                timeoutPromise,
            ]);
        } catch { return null; }
        finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
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
    /** A plan built from what the TOOLS say they do — or null, honestly. */
    static capabilityPlan(intent: any): any | null {
        try {
            const { capableTools, capabilityChain } = require('./capability-match');
            const goal = String(intent?.goal || '');

            // A construction request is one engineering objective, not a bag of
            // browser/deployment verbs. It must reach the evidence-first project
            // pipeline as a whole, even when a model or intent parser has failed.
            // Keeping this guard here is essential because capabilityPlan is also
            // called before the later routing guards.
            if (PlanningEngine.looksLikeBuild(goal)) return null;

            /**
             * A QUESTION IS NOT AN ORDER, AND A TECHNOLOGY'S NAME IS NOT A
             * REQUEST TO USE IT.
             *
             * This function asks one thing: «which tool PERFORMS this?» That
             * question only has an answer when something is being ordered. The
             * only guard above it was `looksLikeBuild`, so the world was sorted
             * into two boxes — build, and everything else — while it actually
             * has three: build, order, and question. A question fell into
             * «everything else» and was handed to keyword matching, where a
             * bare product name outranked the fact that nobody had asked for
             * anything to be done.
             *
             * Measured on the planner itself, before this guard:
             *
             *   «اشرح لي ما هو الفرق بين React و Vue»   → react_project
             *   «اشرح لي ما هو الفرق بين Python و Java» → execute_python → java_builder
             *
             * The second one is the whole defect in one line: asked to explain
             * two languages, Joe ran Python and then built a Java project.
             *
             * The rule «product names never decide an engineering route» was
             * already written elsewhere in this class — but it lives in the
             * later routing guards, and capabilityPlan runs BEFORE them (see the
             * comment above). Two correct layers in the wrong order, again.
             *
             * Questions that legitimately need a tool are not lost here: they
             * are claimed by their own earlier routes. Measured — «كم عدد
             * الطلبات الجديدة؟» and «أرني الطلبات» both reach orders_read while
             * capabilityPlan returns null for them, so returning null earlier
             * changes nothing for either.
             */
            if (PlanningEngine.isKnowledgeQuestion(goal)) {
                console.log('[PlanningEngine] a question, not an order → no capability route (answer it)');
                return null;
            }

            /**
             * A SENTENCE WITH FOUR VERBS IS FOUR STEPS — AND THEY FLOW.
             *
             * «الخطّة تصل إلى أداتين كحدّ أقصى، لا سلسلة طويلة» — his question,
             * and he was reading the code correctly. capableTools ranks the
             * WHOLE sentence and took the top two, and BOTH of them were handed
             * the same raw request, so nothing flowed: two attempts, not a
             * pipeline.
             *
             * When the request names its own order — «ثم», «بعد ذلك», «then»,
             * a numbered list — each part gets its own tool, and each step
             * after the first receives the PREVIOUS step's result through
             * {{FROM:id}}, which this orchestrator already resolves.
             */
            const chain = capabilityChain(goal, 5);
            if (chain.length >= 2) {
                console.log(`[PlanningEngine] capability chain -> ${chain.map((c: any) => c.name).join(' → ')}`);
                return {
                    id: `chain_${Date.now()}`,
                    goal: intent.goal,
                    steps: chain.map((c: any, i: number) => {
                        // A registry capability may match a clause without exposing
                        // a normalized `part`. Preserve the user's original request
                        // rather than throwing into the broad capabilityPlan catch
                        // and silently losing the entire multi-step workflow.
                        const taskPart = String(c?.part || goal).trim();
                        const prior = i === 0 ? '' : `\n\nنتيجة الخطوة السابقة:\n{{FROM:chain_${i - 1}}}`;
                        const text = `${taskPart}${prior}`;
                        return {
                            id: `chain_${i}`,
                            description: `${c.name} — ${taskPart.slice(0, 60)}`,
                            tool: c.name,
                            agent: 'General',
                            input: { request: text, question: text, query: text },
                            dependsOn: i === 0 ? [] : [`chain_${i - 1}`],
                        };
                    }),
                    metadata: { complexity: 'high', riskLevel: 'low', matchedBy: 'capability-chain' },
                };
            }

            const capable = capableTools(goal, 3);
            if (!capable.length) return null;
            console.log(`[PlanningEngine] capability match -> ${capable.map((c: any) => c.name).join(', ')}`);
            return {
                id: `capable_${Date.now()}`,
                goal: intent.goal,
                steps: capable.slice(0, 2).map((c: any, i: number) => ({
                    id: `capable_${i}`,
                    description: `${c.name} — matched on: ${c.why.join(', ')}`,
                    tool: c.name,
                    agent: 'General',
                    input: { request: intent.goal, question: intent.goal, query: intent.goal },
                    dependsOn: i === 0 ? [] : ['capable_0'],
                })),
                metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'capability' },
            };
        } catch { return null; }
    }

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

        /**
         * [PROJECT QUALITY REVIEW FAST-PATH] A review of the delivered result is
         * not an integration test request. A built project without a package.json
         * or test harness still needs a real-browser audit: inspect the rendered
         * build, repair measurable defects, rebuild, and measure again. The
         * generic planner used to interpret «راجع تقرير الجودة والنتيجة النهائية»
         * as auto_tester(integration), which then correctly refused because there
         * was no harness. This guard keeps the choice evidence-first and works for
         * any active built project, not a product name or a template.
         *
         * It runs before every other action route. A long review request can
         * contain words such as «الكود» or «اختبارات» and otherwise look like
         * code_reviewer/auto_tester; the existence of a measurable built artifact
         * is stronger evidence than those incidental words.
         */
        {
            const reviewVerb = /(راجع|مراجع(?:ة|ه)|افحص|فحص|دقّ?ق|تدقيق|اختبر|اختبار|review|audit|inspect|check|verify)/i.test(probe);
            const qualityTarget = /(جودة|الجودة|تقرير|النتيجة|النتائج|المخرجات|التسليم|quality|report|result|output|deliverable)/i.test(probe);
            const explicitQualityReview = /(تقرير\s*الجودة|النتيجة\s*النهائية|quality\s*report|final\s+(?:result|output|deliverable))/i.test(probe);
            const built = findActiveBuiltProject(context?.sessionId);
            // A construction brief may contain its own QA, audit, and acceptance
            // sections. Those words describe the deliverable's verification plan;
            // they must not hijack the construction request into repairing the
            // currently active (possibly unrelated) artifact. Only a request that
            // is not itself an explicit build should use this fast-path.
            const constructiveBuildRequest = PlanningEngine.looksLikeBuild(userGoal);
            if ((explicitQualityReview || (reviewVerb && qualityTarget)) && built && !constructiveBuildRequest) {
                return {
                    id: `quality_review_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: 'إعادة تدقيق البناء في متصفح حقيقي وإصلاح ما يظهر ثم إعادة البناء والقياس',
                        tool: 'project_repair',
                        agent: 'Dev',
                        input: { projectDir: built.projectDir, auditDir: built.auditDir },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low', matchedBy: 'active-built-project-quality-review' },
                };
            }
        }

        /**
         * LOCAL BUILD IS A CONTRACT, NOT A KEYWORD TIE.
         *
         * A real acceptance run asked Joe to build and preview a React dashboard
         * locally, then stated «لا نشر خارجي». The generic capability chain split
         * the sentence at «ثم», saw the bare word «نشر», and planned deploy_pages
         * anyway. The permission gate correctly blocked it, but Joe had already
         * abandoned every requested local action. When a build request explicitly
         * denies publishing, neither a chain nor the capability scorer may choose
         * deployment; the deterministic builder below owns the whole request.
         */
        const deniesExternalPublish = /(?:^|[\s،؛,:.!?])(?:(?:لا|ليس|بدون|غير)\s+(?:(?:أي|أية|اي)\s+)?|(?:do\s+not|don't|without|no)\s+(?:(?:any|external)\s+)?)(?:نشر|انشر|أنشر|رفع|استضافة|deploy|publish|host|go\s*live|github\s*pages)(?=$|[\s،؛,:.!?])/i.test(userGoal);
        const localBuildContract = PlanningEngine.looksLikeBuild(userGoal) && deniesExternalPublish;
        // A long construction brief can quote its own rollback/version-history
        // acceptance requirements. Those words are evidence about the product,
        // not an instruction to undo the currently active project. Keep the
        // direct undo fast-path for short, explicit requests, but never let a
        // build brief with an active (possibly stale) project hijack the build.
        const buildRequest = PlanningEngine.looksLikeBuild(userGoal);
        const longConstructionBrief = buildRequest && userGoal.length >= 1000;
        const localSpecificationExecution = PlanningEngine.isLocalSpecificationExecutionRequest(userGoal);

        // Product names never decide an engineering route. A request that calls
        // itself ORION, Atlas, or anything new must be classified from the work
        // it asks for, then pass through the same evidence-first pipeline as every
        // other system. This prevents a named example from becoming Joe's answer.

        /**
         * A TERMINAL REQUEST MUST EXECUTE, NOT JUST OPEN A PANEL OR ANSWER ABOUT IT.
         *
         * During a visible acceptance run, «نفّذ فحصاً محلياً باستخدام أداتك
         * الطرفية» was sent to terminal_manager and ended in a central prose
         * answer. The Terminal panel correctly waited for output, but no command
         * was ever planned. A bounded diagnostic request therefore owns a safe,
         * cross-platform command below. It deliberately does NOT interpret raw
         * command text from a natural-language request: shell_execute still owns
         * its own safety gate and real project build/edit routes retain their
         * richer pipelines.
         */
        const explicitlyRequestsTerminalExecution = /\bshell_execute\b/i.test(probe)
            || /(استخدم|استعمل|نفّ?ذ|شغّ?ل|اجري|أجرِ|قم\s+ب(?:إجراء|عمل))[^\n]{0,120}(?:طرفي[ةه]|terminal|shell|command\s*(?:line)?|سطر\s*(?:الأوامر|اوامر))|(?:طرفي[ةه]|terminal|shell)[^\n]{0,120}(?:نفّ?ذ|شغّ?ل|اجري|أجرِ|فحص|تحقّ?ق|check|verify|execute|run)/i.test(probe);
        // The user can safely say «لا تبنِ / لا تعدّل ملفات» to constrain a
        // terminal check. Those negated verbs are NOT a request to build or edit.
        const terminalDiagnosticProbe = probe.replace(
            /(?:لا|ليس|بدون|غير|do\s+not|don't|without)\s+(?:تبن[ِي]?|ابن[ِي]?|ابني|انشئ|أنشئ|طوّ?ر|تطوير|تعدّ?ل|عدّ?ل|تعديل|أصلح|اصلح|build|create|develop|implement|modify|edit|fix)(?:\s+[^\s،؛.:!?]+){0,3}/gi,
            '',
        );
        const boundedTerminalDiagnostic = /(فحص|تحقّ?ق|اختبر|حالة|إصدار|نسخ[ةه]|version|status|check|verify|test|diagnostic)/i.test(probe)
            && !/(?:ابنِ|ابني|انشئ|أنشئ|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|build|create|develop|implement|modify|edit|fix)/i.test(terminalDiagnosticProbe);

        /**
         * VERIFYING AN EXISTING PROJECT IS NOT REQUESTING A NEW PROJECT.
         *
         * "Run npm run build in folder X; do not edit" used to match the React
         * builder later in this method and silently scaffold a replacement. The
         * caller named both the execution tool and an existing simple directory,
         * so keep the operation bounded: one fixed build command, no inferred
         * shell text, and no traversal-capable cwd. This sits before every React
         * or generic build route by design.
         */
        // A phrase such as «داخل هذا المجلد» is a reference, not a directory
        // name. We only accept a directory explicitly named after «الموجود في»
        // (or the equivalent English construction), so a later pronoun cannot
        // replace the project identifier supplied earlier in the request.
        const existingProjectDirMatch = userGoal.match(
            /(?:الموجود\s+في|project\s+(?:located\s+)?in|folder\s+)(?:\s+)[`'\"]?([A-Za-z0-9_\-\u0600-\u06FF]+)[`'\"]?/i,
        );
        const existingProjectDir = String(existingProjectDirMatch?.[1] || '').trim();
        const explicitExistingProjectBuild = explicitlyRequestsTerminalExecution
            && /\bnpm\s+run\s+build\b/i.test(probe)
            && /^[A-Za-z0-9_\-\u0600-\u06FF]+$/.test(existingProjectDir);
        if (explicitExistingProjectBuild) {
            console.log(`[PlanningEngine] explicit existing-project build → shell_execute (npm run build in ${existingProjectDir})`);
            return {
                id: `terminal_build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'terminal_existing_project_build',
                    description: `تشغيل فحص بناء محلي للمشروع القائم: ${existingProjectDir}`,
                    tool: 'shell_execute',
                    agent: 'Dev',
                    input: { command: 'npm run build', cwd: existingProjectDir, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'medium', riskLevel: 'medium', terminalExecution: true, buildVerification: true },
            };
        }

        if (explicitlyRequestsTerminalExecution && boundedTerminalDiagnostic) {
            // Never execute arbitrary natural-language shell text here. We only
            // honour a deliberately small, read-only diagnostic allowlist, which
            // lets the user see the exact requested command and its real output.
            const requestedCommands: string[] = [];
            if (/\bpwd\b/i.test(userGoal)) requestedCommands.push('pwd');
            if (/\bnode\s+--version\b/i.test(userGoal)) requestedCommands.push('node --version');
            const echo = userGoal.match(/\becho\s+([A-Za-z0-9_.:/=-]{1,120})\b/i);
            if (echo) requestedCommands.push(`echo ${echo[1]}`);
            if (!requestedCommands.length) {
                requestedCommands.push("node -e \"console.log('Joe terminal execution verified')\"");
            }

            console.log(`[PlanningEngine] explicit terminal diagnostic → shell_execute (${requestedCommands.join(' → ')})`);
            return {
                id: `terminal_check_${Date.now()}`,
                goal: intent.goal,
                steps: requestedCommands.map((command, index) => ({
                    id: `terminal_diagnostic_${index}`,
                    description: `تنفيذ فحص طرفية محلي: ${command}`,
                    tool: 'shell_execute',
                    agent: 'Dev',
                    input: { command, request: intent.goal },
                    dependsOn: index === 0 ? [] : [`terminal_diagnostic_${index - 1}`],
                })),
                metadata: { complexity: 'low', riskLevel: 'low', terminalExecution: true },
            };
        }

        /**
         * A GITHUB REPOSITORY IS NOT A WEB PAGE WHEN THE USER ASKS TO WORK ON IT.
         *
         * The URL-open guard below correctly handles “open GitHub and read this
         * page”, but it used to see “افحص README” inside a long local Git workflow
         * as browser work and return immediately. The request then ended after a
         * single navigation even though it explicitly required clone, branch,
         * diff, test, and a local commit. Decide that engineering contract before
         * *any* URL route: ImportProjectTool provides the real checkout from which
         * the subsequent local operations can be proved. A plain view/open request
         * still reaches browser_launch because it has none of these work signals.
         */
        const earlyGithubRepository = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(userGoal);
        const earlyGithubLocalWork = /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|فرع|التزام|كوميت|git\s*(?:status|diff|checkout|commit|branch)|build|develop|implement|modify|edit|fix|test|run|clone|import|branch|commit|analy[sz]e|review|inspect)/i.test(probe);
        // Import is deliberately sufficient for an analysis-only request. Add the
        // constrained follow-through only when the user names actual local Git
        // deliverables. This distinction prevents a harmless “analyse this repo”
        // from silently creating a branch or commit.
        const requestsBoundedLocalGitWorkflow = /(فرع|برانش|التزام|كوميت|commit|branch|(?:docs|documentation)\/[A-Za-z0-9._/-]+\.md|ملف\s*(?:توثيق|ملاحظات)|وثّ?ق|توثيق)/i.test(probe);
        if (earlyGithubRepository && earlyGithubLocalWork) {
            const steps: ExecutionStep[] = [{
                id: 'repo_import',
                description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً وربطه بالجلسة',
                tool: 'import_project',
                agent: 'Dev',
                input: { request: intent.goal },
                dependsOn: [],
            }];
            if (requestsBoundedLocalGitWorkflow) {
                steps.push({
                    id: 'local_git_workflow',
                    description: 'إنشاء فرع محلي وملف توثيق محدود والتحقق من الفرق ثم الالتزام محلياً دون دفع أو نشر خارجي',
                    tool: 'git_local_workflow',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: ['repo_import'],
                });
            }
            console.log(`[PlanningEngine] early GitHub local-work contract → import_project${requestsBoundedLocalGitWorkflow ? ' + git_local_workflow' : ''}`);
            return {
                id: `repo_import_${Date.now()}`,
                goal: intent.goal,
                steps,
                metadata: { complexity: requestsBoundedLocalGitWorkflow ? 'high' : 'medium', riskLevel: 'medium' },
            };
        }

        // [EARLY EXPLICIT URL OPEN] A bounded navigation request is a hard
        // prerequisite for any page-local tool. Resolve it before capability
        // chains and model-guided routing, which cannot safely search a page
        // that has not been opened yet.
        const earlyUrlMatch = userGoal.match(/https?:\/\/[^\s<>'\"]+/i)
            || userGoal.match(/\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s<>'\"]*)?/i);
        const earlyOpenIntent = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(probe);
        const earlyTitleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
        const earlyPageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
        if (earlyUrlMatch && earlyOpenIntent && (earlyTitleOnly || !earlyPageWork)) {
            const url = earlyUrlMatch[0].startsWith('http') ? earlyUrlMatch[0] : `https://${earlyUrlMatch[0]}`;
            console.log(`[PlanningEngine] early explicit URL open -> browser_launch ${url}`);
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: earlyTitleOnly ? `افتح ${url} وأعد عنوان الصفحة` : `افتح ${url}`,
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low' },
            };
        }

        // A recovery goal ("Fix and continue: <task>\n[THE STEP FAILED WITH THIS
        // ERROR]: …") must NEVER enter the keyword fast-paths below. The goal now
        // carries the failed task's own words plus raw error text — both full of
        // exactly the keywords the fast-paths trigger on. Measured failure modes:
        // a short recovery goal (<30 chars) fell into the chat fast-path and the
        // "repair" was a paragraph of prose; a failed search step matched the web
        // search fast-path and re-ran the identical failing search with zero
        // analysis. Recovery is planned from the error, by the real planner, always.
        /**
         * A ROUTE THAT SAW ONE CLAUSE MUST NOT CLAIM THE WHOLE SENTENCE.
         *
         * Measured end to end: «حلّل المستودع، ثم راجع الكود، ثم اضغط الملفات»
         * hit the repo-analysis fast-path on its FIRST clause and returned a
         * single github_repo_manager step. The other two tasks — which the
         * user wrote down, in order — vanished. The chain sits below the
         * hand-written routes by design, and it never got to see this.
         *
         * So a request that names its own sequence is checked first. It defers
         * to the hand-written routes for anything that is really a BUILD:
         * those are hand-checked, richer, and «ابنِ متجراً ثم أضف صفحة» is
         * better served by them than by two generic steps.
         */
        const BUILDERS = new Set(['react_project', 'api_project', 'web_page_builder', 'project_pipeline', 'scaffold_project']);
        try {
            const { capabilityChain, hasExplicitSequence } = require('./capability-match');
            const goalText = String(intent.goal || '');
            // A GitHub link plus analysis/development verbs has a stronger
            // deterministic contract below: clone it locally before inspecting
            // or changing it. Do not let a generic multi-step chain consume the
            // first clause and lose the repository checkout.
            const isGithubWorkRequest = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(goalText)
                && /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|build|develop|implement|modify|edit|fix|test|run|clone|import|analy[sz]e|review|inspect)/i.test(probe);
            // Only an explicit «ثم»/«then» — a newline is layout, not order.
            // A build request must remain one coherent engineering plan even when
            // it contains words that describe a later verification or delivery
            // step. For example, "build an internal web console ... then test it,
            // never deploy" is NOT a browser-console step followed by deployment.
            // Splitting it here used to let generic capability scoring outrank the
            // evidence-first pipeline before that pipeline had a chance to inspect
            // the workspace. Any construction request therefore owns its whole
            // sentence; only non-build multi-task requests may use this chain.
            const early = !isGithubWorkRequest
                && !localBuildContract
                && !localSpecificationExecution
                && !PlanningEngine.looksLikeBuild(userGoal)
                && hasExplicitSequence(goalText)
                ? capabilityChain(goalText, 5)
                : [];
            if (early.length >= 2 && !early.some((c: any) => BUILDERS.has(c.name))) {
                const chained = PlanningEngine.capabilityPlan(intent);
                if (chained && chained.metadata?.matchedBy === 'capability-chain') {
                    console.log('[PlanningEngine] multi-task request — the chain outranks a single-clause route');
                    return chained;
                }
            }
        } catch { /* the registry is optional — every route below still stands */ }

        if (/^fix and continue:/i.test(String(intent.goal || '').trim())) {
            return PlanningEngine.generateDynamicDag(intent, memory, context);
        }

        /**
         * [LOCAL SPECIFICATION → EVIDENCE-FIRST ENGINEERING PIPELINE]
         *
         * The source file already exists in the selected workspace.  Joe must
         * read it, discover the actual project shape, plan from that evidence,
         * then execute and verify.  A capability chain must not split the
         * request merely because the specification also says «write» or «test».
         */
        if (localSpecificationExecution) {
            console.log('[PlanningEngine] local specification + execution verb → project_pipeline');
            return {
                id: `local_spec_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'project_pipeline',
                    description: 'اقرأ مواصفة مساحة العمل، استكشف الأدلة، ثم خطط ونفّذ وتحقق محلياً',
                    tool: 'project_pipeline',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'high', riskLevel: 'medium', localOnly: true, matchedBy: 'local-specification' },
            };
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
            // FIELD FAILURE: «قم باضافه هذه الصوره الى منتج البوس» with the
            // photo attached landed here and Joe DESCRIBED the picture back
            // instead of using it. Putting an attached image INTO the active
            // project is an edit, not a conversation about a file.
            // No lookbehind: the field wrote «قم باضافه هذه الصوره» — the verb
            // carried a «بـ» prefix and a strict boundary refused the match.
            const putsFileInProject = /(ضي?ف|أضف|اضف|إضاف[ةه]|اضاف[ةه]|حطّ?|ركّ?ب|بدّ?ل|غيّ?ر|استخدم|اجعل)[\s\S]{0,40}(هذه\s*الصور|الصور[ةه]|هالصور)|\b(add|use|set|replace|make)\b[\s\S]{0,40}\b(this\s+)?(photo|image|picture)\b/i.test(userPart);
            const hasProject = !!((global as any).joeProjects || {})[String((intent as any)?.context?.sessionId || (intent as any)?.sessionId || '')]?.dir
                || Object.keys((global as any).joeProjects || {}).length > 0;
            if (putsFileInProject && hasProject) {
                console.log('[PlanningEngine] attached image + «أضفها إلى …» → project_edit (the file is used, not described)');
                return {
                    id: `edit_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_edit',
                        description: `Surgical edit of the active project: ${intent.goal}`,
                        tool: 'project_edit',
                        args: { request: rawGoal },
                        dependencies: [],
                    }],
                    reasoning: 'attached image placed into the active project',
                } as any;
            }
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
         * [A DESIGN REQUEST OVER A PICTURE IS A BUILD — WITH OR WITHOUT A MODEL]
         *
         * «اريد تصميم مختلف لهذه الصوره» + the screenshot had no deterministic
         * route: it relied on the semantic router, and when every provider is
         * exhausted — which is exactly what the field log shows, Groq at its
         * daily limit and the mesh 429ing — the plan fell through to a CHAT
         * about the picture. Joe's determinism must not evaporate the moment
         * the quota does. A build verb aimed at an attached IMAGE builds.
         *
         * «هل هذا التصميم جميل؟» is still an opinion: the guard above already
         * requires a build verb in the user's own words.
         */
        if (/\[ATTACHED FILES/.test(rawGoal)) {
            const userPart = rawGoal.split('[ATTACHED FILES')[0];
            const attachSection = rawGoal.slice(rawGoal.indexOf('[ATTACHED FILES'));
            const imageOnly = /—\s*image\//.test(attachSection) && !/—\s*(application|text)\//.test(attachSection);
            if (imageOnly && WANTS_BUILD_RE.test(userPart)) {
                console.log('[PlanningEngine] design verb + attached image → build the page (no model needed)');
                return {
                    id: `design_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'build_page',
                        description: 'بناء صفحة انطلاقاً من التصميم المرفق',
                        tool: 'web_page_builder',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' }
                } as any;
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
                || /^\s*(كيف|ماذا|لماذا|متى|أين|هل|اشرح|وضّ?ح|ما\s+هو|ما\s+هي)(?=\s|$)/.test(userGoal)
                || /(ابحث|بحث|دوّ?ر\s*عن|ابغى\s*اعرف|search\s+for|google|look\s*up)/i.test(probe)
                || /\?\s*$/.test(userGoal.trim());

            // إنشاء مشروع جديد يتغلب على التشغيل فقط إذا ورد كفعل إنشاء صريح في
            // نص المستخدم الأصلي. لا نقرأ النسخة المطَبَّعة `probe` هنا: فهي قد
            // تحوّل الاسم «البناء» في جملة تحقق مثل «أثبت هل البناء والتشغيل نجحا»
            // إلى «ابن»، فتختطف أمراً واضحاً لتشغيل مشروع قائم.
            // أما «ابنِ المشروع ثم شغّله» فيبقى إنشاءً جديداً كما ينبغي.
            //
            // النفي جزء من النية، لا كلمة فصل يمكن إسقاطها. كان «لا تنشئ مشروعاً
            // جديداً؛ شغّل المشروع القائم» يطابق `انشئ` هنا، فيحجب مسار التشغيل
            // الحتمي ثم تسقط الجملة إلى منشئ React. نزيل فعل الإنشاء فقط حين يقع
            // مباشرة بعد نفي صريح، ونبقي أي فعل إيجابي لاحق في الجملة مرئياً.
            const userGoalWithoutNegatedBuildVerb = userGoal
                .replace(/(^|[\s،؛,:.!?])(?:لا|ليس|بدون)\s+(?:ت?نشئ|ت?نشيء|ت?بن(?:ي|ِ)?|ت?صمم|ت?طور|ت?عمل|ت?سوي|ت?سوّي|ت?ول[ّد]{1,2}|ت?برمج)(?=\s|$|[،,:؛.!?])/giu, '$1')
                .replace(/(^|[\s,;:.!?])(?:do\s+not|don't|no)\s+(?:build|create|make|develop|design|generate|code|scaffold)(?=\s|$|[,;:.!?])/giu, '$1');
            const hasBuildVerb = /\b(build|create|make|develop|scaffold|generate|code)\b/i.test(userGoalWithoutNegatedBuildVerb)
                // The imperative «ابنِ» carries a kasra after the final noon;
                // accept optional Arabic vowel marks while still matching only a
                // standalone explicit creation verb from the original user text.
                || /(^|\s)(?:ابن[\u064B-\u065F]*|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|برمج)(?=\s|$|[،,:؛.!])/i.test(userGoalWithoutNegatedBuildVerb);

            // A concrete project/server target — NOT a browser, NOT content. Word
            // boundaries keep "serve" out of "server" and "app" out of "happen".
            //  A PATTERN WRITTEN WITH THE ARTICLE MATCHES HALF THE LANGUAGE.
            //
            //  Measured through generatePlan, the real road a request takes:
            //
            //      شغّل الخادم   → project_run
            //      شغّل خادم     → central_answer
            //      أوقف الخادم   → project_stop
            //      أوقف خادم     → central_answer
            //
            //  The same sentence, one article apart, and one of them does
            //  nothing. «المشروع» already carried its bare twin «مشروع»
            //  right beside it; the other four did not, and «ال» is a
            //  PREFIX — a bare form matches both, a prefixed one matches
            //  half. Writing the article into a pattern can only subtract.
            const projectTarget = /((?:ال)?مشروع|(?:ال)?نظام|(?:ال)?خادم|(?:ال)?سيرفر|(?:ال)?معاينة|\bproject\b|\bserver\b|\bapp\b|\bapplication\b|\bpreview\b|dev\s*server|localhost)/i.test(probe);
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
                    steps: [{ id: 'project_run', description: 'تشغيل المشروع ومعاينته حيّاً', tool: 'project_run', agent: 'Dev', input: { projectQuery: userGoal }, dependsOn: [] }],
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

        // [API PROJECT FAST-PATH] An EXPLICIT backend request — «ابنِ لي API
        // للطلبات», «باك اند بقاعدة بيانات» — scaffolds a runnable Express +
        // SQLite backend with a live write/read proof. Explicit only, and a
        // request that ALSO names a site/frontend keeps its richer path
        // (pipeline or react) — this serves the backend-alone ask.
        {
            const apiNoun = /\b(api|backend|rest)\b|باك\s?[إا]ند|واجهة برمجية|قاعدة بيانات|خادم بيانات/i.test(probe);
            const frontendNoun = /\b(react|vite|spa|landing|site|website|page)\b|ريأكت|رياكت|موقع|صفحة|فيت\b/i.test(probe);
            const fullish = /(متكامل|كامل|full[-\s]?stack|complete)/i.test(probe);
            const apiBuildVerb = /\b(build|create|make|develop|scaffold|generate)\b/.test(goalLower)
                || /(ابن|ابني|انشئ|أنشئ|اصنع|طور|اعمل|سو)/.test(probe);
            // …but «نظام إدارة مخزون مع تسجيل دخول وقاعدة بيانات» is not a request
            // for a bare API. It says «نظام» and it owns data, so the scope
            // classifier calls it a SYSTEM — a backend AND the app that uses it.
            // Shipping only the server there is the same «half a thing» the user
            // objected to, from the other end.
            // «اعمل باك اند بقاعدة بيانات للمخزون» IS a bare backend ask, even
            // though it owns data — the user named the server and nothing else.
            // What turns it into a full system is naming the THING: an app, a
            // system, a platform, a dashboard.
            const namesAnApp = /(تطبيق|نظام|منصّ?ة|لوحة\s*تحكم|برنامج|\bapp\b|dashboard|platform|system)/i.test(probe);
            const bareApiAsk = !namesAnApp;
            if (apiBuildVerb && apiNoun && !frontendNoun && !fullish && bareApiAsk) {
                return {
                    id: `engineering_api_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف سياق العمل ثم خطط ونفّذ خدمة الواجهة البرمجية المطلوبة بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
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
            const fullStackNoun = /(باك\s*اند|واجهة\s*خلفية|خادم|سيرفر|قاعدة\s*بيانات|مشروع\s*(متكامل|كامل)|تطبيق\s*(متكامل|كامل)|نظام\s*(متكامل|كامل|إدارة|اداره)|back\s*-?end|\bserver\b|server\s*side|database|rest\s*api|api\s*server|full[-\s]?stack|complete\s+(project|app|application|system))/i.test(probe);
            // A general engineering signal is a distinct required capability, not
            // the product's label. Two or more signals require discovery before
            // construction because they may constrain the existing workspace,
            // architecture, test strategy, or tool selection.
            const engineeringSignals = [
                /(?:multi[\s-]?tenant|tenant|مستأجر|متعدد\s*المستأجرين)/i,
                /(?:rbac|role|permission|authorization|صلاحيات|أدوار|ادوار)/i,
                /(?:approval|workflow|موافقة|سير\s*عمل)/i,
                /(?:audit|ledger|accounting|تدقيق|دفتر|محاسبة)/i,
                /(?:inventory|orders?|payments?|stock|مخزون|طلبات|مدفوعات)/i,
                /(?:integration|event|webhook|contract|تكامل|أحداث|احداث|عقد)/i,
            ].filter((pattern) => pattern.test(probe)).length;
            const namesASystem = /(تطبيق|نظام|منصّ?ة|لوحة\s*تحكم|برنامج|\bapp\b|dashboard|platform|system|application)/i.test(probe);
            const needsEngineeringPipeline = fullStackNoun || (namesASystem && engineeringSignals >= 2);
            // A PHONE app is the page builder's job (it ships an installable
            // PWA); «تطبيق جوال متكامل» must not fall into the backend pipeline.
            const { wantsMobileApp } = require('../design/pwa');
            if (projectVerb && needsEngineeringPipeline && !wantsMobileApp(probe)) {
                console.log(`[PlanningEngine] engineering scope -> evidence-first project_pipeline (signals: ${engineeringSignals})`);
                return {
                    id: `project_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف سياق العمل ثم خطط ونفّذ النظام المطلوب بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: []
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' }
                };
            }
        }

        // [CAPABILITY ROUTER] Joe owns 151 tools; ranking them for the planner
        // was worth nothing while requests never reached the planner. Measured:
        // «دقّق السيو في موقعي» short-circuited to a spoken answer (a goal under
        // 30 characters does), and «افحص الروابط المكسورة في موقعي» was claimed
        // by the BUILD path below — Joe tried to BUILD a site in answer to a
        // request to INSPECT one, while owning a broken-link checker.
        //
        // So the ranking decides here, before the builders, and only when the
        // sentence carries an act verb AND one specialist wins clearly AND its
        // required arguments can be filled from the sentence. Anything less
        // falls through to exactly the paths that ran before.
        // An EDIT of the open page always belongs to the page's own tool: «حط
        // صورة في الأعلى» is not a request to analyse an image, and the edit
        // path below has years of dialect handling in it. The router yields.
        const editKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const pageIsOpen = !!((global as any).joePages && (global as any).joePages[editKey]);
        const looksLikeEdit = /(اضف|أضف|ضيف|ضف|حط|خلي|خلّي|شيل|سوي|سوّي|غير|غيّر|عدل|عدّل|بدل|بدّل|احذف|امسح|كبر|كبّر|صغر|صغّر|رتب|رتّب|ركب|ركّب|جمل|جمّل|حسن|حسّن)/.test(String(intent.goal || ''))
            || /\b(add|change|replace|remove|make it|set the)\b/i.test(String(intent.goal || ''));
        // The capability scorer sees token overlap only. A construction request
        // has one coherent engineering contract: inspect evidence, plan, build,
        // verify, and report. It must never be claimed by a single matching tool
        // (Git, browser, deploy, or otherwise), even when the request omits an
        // explicit «never deploy» clause. The later build routes select the
        // correct general engineering workflow from the actual workspace.
        const capable = (pageIsOpen && looksLikeEdit)
            || localBuildContract
            || PlanningEngine.looksLikeBuild(String(intent.goal || ''))
            ? null
            : capabilityRoute(String(intent.goal || ''), context);
        if (capable) {
            console.log(`[PlanningEngine] capability router -> ${capable.tool} (score ${capable.score}, runner-up ${capable.runnerUp || 'none'})`);
            return {
                id: `capability_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: capable.tool,
                    description: intent.goal,
                    tool: capable.tool,
                    agent: capable.tool.startsWith('browser_') ? 'Browser' : 'Dev',
                    input: capable.input,
                    dependsOn: [],
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' },
            };
        }

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        // A QUESTION IS NOT AN ORDER. «ما هو أفضل تصميم لموقع مطعم؟» built a
        // restaurant site: the sentence carries a build verb («تصميم») and a web
        // noun («موقع»), and nothing asked whether the user was requesting work
        // or asking about it. Interrogatives are answered, not executed.
        const isQuestion = /[؟?]\s*$/.test(String(intent.goal || '').trim())
            && /(^|\s)(ما|ماذا|لماذا|كيف|متى|اين|أين|هل|كم|ايهما|أيهما|من\s+هو|ما\s+هو|ما\s+هي)(\s|$)/.test(probe);
        const buildVerb = !isQuestion && (/\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            // «قم ببناء…» / «قم بعمل…» / «أريد بناء…» are how people actually ask.
            // Field log: «قم ببناء صفحة جميله لشركة أدوية ومعدات طبية» matched no
            // build verb, so with the brain unreachable it fell to the failover
            // node — which OPENED A BROWSER for a request to build a page.
            // «بنِ نظاماً…» — the bare imperative, and the one that cost him a
            // whole run: every noun matched, no verb did, and the request went
            // to a planner LLM whose quota was gone.
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو|شيّ?د|أقم|اقم)/.test(probe)
            || /(^|\s)بنِ?\s/.test(probe)
            || /قم\s*ب?(بناء|عمل|انشاء|إنشاء|تصميم|تطوير|صنع)/.test(probe)
            || /(اريد|أريد|ابغى|أبغى|بدي|ودي)\s*(ب?بناء|عمل|انشاء|إنشاء|تصميم|موقع|صفحة|تطبيق|متجر|نظام|منصّ?ة|لوحة|أداة|اداة)/.test(probe)
            || /\b(بناء|تصميم|إنشاء|انشاء)\s+(موقع|صفحة|تطبيق|متجر|واجهة|لوحة)/.test(probe)
            /**
             *  …AND A THIRD COPY OF THE SAME QUESTION.
             *
             *  Everything above answers «is this a build?» — and so does the
             *  shared looksLikeBuild, and so did looksLikeEngineeringBrief.
             *  Three answers to one question, and his clinic brief got a
             *  different one from each: the shared test said yes, this list
             *  said no, and because it said no, looksBrowser said yes and Joe
             *  typed «المريض باسمه أو تلفونه» into a search engine.
             *
             *  The list above stays — it carries cases the shared test does
             *  not, and every one of them was paid for. But it stops being the
             *  last word. Ask the shared question too, so a request that is a
             *  build anywhere is a build here.
             */
            || looksLikeBuild(String(intent.goal || '')));
        /**
         * THE ENGLISH LIST WAS NEVER BROUGHT UP TO THE ARABIC ONE.
         *
         * His request, verbatim: «Build a world-class e-commerce PLATFORM
         * similar to Shopify … Multi-vendor MARKETPLACE … Mobile APP …
         * Generate complete production-ready code.»
         *
         * `buildVerb` matched on «build». `webNoun` did not match ANYTHING:
         * platform, marketplace, e-commerce and a bare «app» were all missing,
         * while the Arabic branch below has known «نظام», «منصّة», «أداة» and
         * «برنامج» for months. So the build gate stayed shut, the request fell
         * through to the generic planner, and Joe answered a request for a
         * production-ready platform with FIFTEEN nodes of `central_answer` —
         * «Good evening, Younes. I'll outline the optimal project structure…».
         * Not one file was written.
         */
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface)\b/.test(goalLower)
            || /\b(platform|marketplace|e-?commerce|storefront|system|app|application|software|tool|service|portal|panel|admin|backend|api|saas|crm|erp|pos|blog|editor|tracker|planner|scheduler|booking|marketplace|network|clone|table|spreadsheet|ledger|register|list)\b/.test(goalLower)
            // «نظام نقاط بيع للمطاعم مع تقارير مبيعات» named no «موقع» and no
            // «صفحة», so the build gate never opened and Joe just TALKED about it.
            // A system, a platform, a dashboard and a tool are things people ask
            // to have built, exactly like a site.
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط|نظام|منصّ?ة|أداة|اداة|برنامج|بوابة|خدمة|محرّ?ر|مدوّ?نة|سيرة\s*ذاتية|منيو|قائمة\s*(?:طعام|أسعار|منتجات)|جدول|كشف|قائمة)/.test(probe);
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
            // Typed by a human, not by a spell-checker: «اريد اعديل علىيه بان
            // يعمل مسارات…» carried no verb this list knew, so the request fell
            // through to the semantic router and came back as a NEW marketing
            // page — while the React app it was about sat untouched on disk.
            || /(?<![ء-ي])[اأي]?ع[دّ]?[يى]?ل(ه|ها|ين|وا)?(?![ء-ي])/.test(probe)
            // A capability asked for in plain words is an edit too.
            || /(اجعله|خليه|أريد(ه)?\s+(أن\s+)?ي|اريد(ه)?\s+(ان\s+)?ي|يعمل|يدعم|يحدّد|يحدد|يعرض|ميزة|ميزه|خاصية|خاصيه|إضافة\s*ميزة)/.test(probe)
            // The SHORT dialect verbs need Arabic boundaries — bare /خلي/ fires
            // inside «الداخلية» and /سوي/ inside «تساوي», turning ordinary
            // questions into page edits.
            || /(?<![ء-ي])(ضيف|ضِف|حطّ?(ي|ه|ها)?|خلّ?ي(ه|ها)?|شيل(ي|ه|ها)?|سوّ?ي(ه|ها)?|ركّ?ب|رتّ?ب|ظبط|ضبط|صلّ?ح|أصلح|اصلح)(?![ء-ي])/.test(probe)
            // Concrete page parts only. Generic words like «تصميم» or «شكل» appear in
            // ordinary questions ("ما هو تصميم قاعدة البيانات؟") and would rebuild the
            // page on a question — the verbs above already cover "improve the design".
            || /(لون|ألوان|الوان|زر|أزرار|ازرار|خلفية|خلفيه|خلفيات|حجم|أحجام|عنوان|عناوين|خط|خطوط|قسم|أقسام|اقسام|صورة|صور|فوتر|هيدر|ترويسة|تذييل|قائمة|أيقونة|ايقونة|فقرة|نصوص)/.test(probe)
            // Version history: rollback/undo and the versions list belong to
            // the page's own tool (instant restore, no model call).
            || /(تراجع|استرجع|(ارجع|أرجع|رجّع)[^.\n]{0,20}نسخ|نسخ(ة|ه)\s*(السابق|القديم|رقم)|اعرض\s*النسخ|إصدار\s*سابق|\bundo\b|\brollback\b|\brevert\b|version\s*history)/i.test(probe);

        /**
         * [UNDO FAST-PATH] «تراجع» on a PROJECT goes to the project's own
         * history, not to the page tool's.
         *
         * The rollback sentence has always been recognised — and always routed
         * to the page builder, which is where version history lived. A session
         * whose active project is a React app would have its «تراجع» answered by
         * a tool that knows nothing about it. Projects have snapshots of their
         * own now, taken before every edit and every self-repair.
         */
        {
            /**
             * «أرجع» IS «I COME BACK». IT IS ALSO «REVERT». ONE WORD, TWO ACTS.
             *
             * Measured on the owner's machine, from a request he typed himself:
             *
             *     «… لما أسكر الصفحة وأرجع أفتحها …»   (when I close the page and come back to open it)
             *
             * A bare match on «أرجع» read that as an instruction to roll the
             * active project back. The whole 308-character brief — five fields,
             * persistence, search, two totals, a colour rule — was replaced by a
             * single `project_undo` step, and nothing was ever built. The
             * contract names this class by name and says what to do about it:
             * «أيّ مطابقةٍ على اسمٍ مجرّدٍ من هذه ستعطي معياراً خاطئاً. اشترط سياقاً.»
             *
             * So the ambiguous verbs now need an object that only an undo has:
             * a version, a release, an edit, a change, «الوراء». The verbs that
             * mean nothing else — «تراجع», «استرجع», undo, rollback, revert —
             * still stand alone, because they are not ambiguous.
             */
            const undoAlone = /(تراجع|استرجع|\bundo\b|\brollback\b|\brevert\b)/i.test(probe);
            const undoWithObject = /(ارجع|أرجع|رجّع|رجع)\s+(?:\S+\s+){0,2}?\S*(نسخ|اصدار|إصدار|تعديل|تغيير|وراء|خلف|سابق)/i.test(probe);
            const undoVerb = undoAlone || undoWithObject;
            const listVerb = /(اعرض|أظهر|اظهر|ما\s*هي)\s*(النسخ|الإصدارات|الاصدارات)|\bversions?\b|version\s*history/i.test(probe);
            const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
            const active = ((global as any).joeProjects || {})[sessionKey];
            if ((undoVerb || listVerb) && active?.dir && !longConstructionBrief) {
                return {
                    id: `undo_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_undo',
                        description: listVerb ? 'عرض النسخ المحفوظة للمشروع' : 'إرجاع المشروع إلى نسخته السابقة وإعادة بنائه',
                        tool: 'project_undo',
                        agent: 'Dev',
                        input: { projectDir: active.dir, ...(listVerb && !undoVerb ? { list: true } : {}) },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        /**
         * [UI REPAIR FAST-PATH] «اريده ان يصلح ui لاي نظام ولاي صفحة عندما
         * يطلب منه».
         *
         * «أصلح واجهة المشروع» is not an ordinary edit: it is a measured loop —
         * audit in a real browser, repair the source deterministically, rebuild,
         * measure again — and routing it to the generic editor would hand a
         * whole-project accessibility pass to a model one string at a time.
         *
         * Gated on an ACTIVE PROJECT so it can never hijack a fresh build, and
         * on the words meaning the interface ITSELF rather than one element of
         * it: «أصلح الزر» stays a surgical edit, «أصلح الواجهة» is this.
         */
        {
            const repairVerb = /(أصلح|اصلح|صلّح|صحّح|عالج|رقّع|حسّن|حسن|fix|repair|improve|clean\s*up)/i.test(probe);
            const uiWhole = /(الواجهة|واجهة\s*(المشروع|النظام|التطبيق|الموقع)|\bui\b|\bux\b|الوصولية|إمكانية\s*الوصول|accessibility|a11y|جودة\s*الواجهة|مشاكل\s*الواجهة|كل\s*(المشاكل|الملاحظات))/i.test(probe);
            const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
            const activeProject = ((global as any).joeProjects || {})[sessionKey]?.dir;
            // A build request may mention QA, accessibility, or repairing defects
            // as acceptance criteria. It must still enter the evidence-first
            // pipeline so the project is created/inspected before any UI repair;
            // otherwise a stale active-project path can trigger `no_project` and
            // abort a fresh build before project_pipeline gets a chance to run.
            if (repairVerb && uiWhole && activeProject && !buildRequest && !longConstructionBrief) {
                return {
                    id: `ui_fix_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_ui_fix',
                        description: 'قياس الواجهة في متصفح حقيقي، وإصلاح مصدرها، وإعادة القياس',
                        tool: 'browser_ui_fix',
                        agent: 'Dev',
                        input: { projectDir: activeProject },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [REACT PROJECT FAST-PATH] An EXPLICIT framework request — «مشروع
        // React», «تطبيق Vite», «SPA» — gets a real scaffolded project with a
        // verified build, not a static page. Explicit only: a plain «ابن لي
        // موقع» keeps the page builder that serves it best.
        {
            const reactNoun = /\b(react|vite|jsx|spa)\b|ريأكت|رياكت|ري أكت|فيت\b|سبا\b/i.test(probe);
            if (buildVerb && reactNoun) {
                return {
                    id: `engineering_react_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ تطبيق React المطلوب بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [IMPORT PROJECT] «استورد هذا المستودع وافهمه» — a GitHub URL plus an
        // import/understand/work verb clones it, reads it, and makes it the
        // session's active project for the surgical editor.
        {
            const hasGithub = /github\.com\/[\w.-]+\/[\w.-]+/i.test(probe);
            const importVerb = /(استورد|استيراد|اجلب|حمّل|افهم|حلل|اعمل\s*على|طوّر|طور|import|clone|understand|analy[sz]e|work\s*on)/i.test(probe);
            if (hasGithub && importVerb) {
                return {
                    id: `import_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'import_project', description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً ثم تفعيله للجلسة', tool: 'import_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // [BUSINESS PROFILE] «احفظ بيانات عملي» — Joe's business memory:
        // save/show/clear the real contact details every build injects.
        {
            const profileAsk = /(احفظ|خزن|خزّن|سجل|سجّل|اعرض|أعرض|امسح|احذف)\s*[^.\n]{0,12}?(بيانات|ملف)\s*(عملي|العمل|المشروع|النشاط|شركتي|متجري|مطعمي)|\b(business|my)\s*profile\b/i.test(probe);
            if (profileAsk) {
                return {
                    id: `profile_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'business_profile', description: 'إدارة بيانات العمل المحفوظة', tool: 'business_profile', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [ORDERS READ] «اعرض الطلبات» — the owner reads visitor orders from
        // the API project's database, in the chat, server up or not.
        {
            const ordersAsk = /(اعرض|أعرض|ارني|أرني|شوف|اقرأ|كم|هات)\s*[^.\n]{0,15}?(ال)?طلبات|طلبات\s*(جديدة|الزبائن|العملاء|الموقع)|كم\s*(من\s*)?طلب|هل\s*وصل[^.\n]{0,12}طلب|\b(show|list|read)\b[^.\n]{0,15}\borders\b/i.test(probe);
            if (ordersAsk) {
                return {
                    id: `orders_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'orders_read', description: 'قراءة طلبات الزوار من قاعدة بيانات المشروع', tool: 'orders_read', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [FORM INBOX] «اعرض رسائل النموذج» — the live-data reading path.
        {
            /**
             * «اقرأ» IS A READING VERB, AND IT WAS THE ONE MISSING.
             *
             * The list held اعرض/شوف/كم/هل and not the plainest word of them
             * all. So «اقرأ الطلبات» reached the orders inbox and «اقرأ
             * الرسائل» fell through this path entirely — and landed on the
             * Gmail fast-path below, which reads «رسائل» as the user's own
             * mailbox. He asked for his site's messages and Joe went to
             * Google. The two ends of one wire, both wrong.
             */
            const inboxAsk = SITE_INBOX.test(probe)
                || /(اعرض|أعرض|شوف|كم|هل\s*(وصل|فيه)|اقرأ|اقرا|أقرأ|ارني|أرني|وريني|راجع|جاني|وصلني)\s*[^.\n]{0,25}?(رسائل|رساله|رسالة|الرسائل)|صندوق\s*(الرسائل|النموذج|الوارد)|من\s*راسل|form\s*(inbox|messages|submissions)/i.test(probe);
            const hasArtifact = !!((global as any).joePages?.[activeKey] || (global as any).joeProjects?.[activeKey]);
            if (inboxAsk && hasArtifact) {
                return {
                    id: `inbox_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'form_inbox', description: 'قراءة رسائل نموذج الموقع', tool: 'form_inbox', agent: 'General', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
                };
            }
        }

        // [SURGICAL PROJECT EDIT] When the session's ACTIVE artifact is a
        // scaffolded project (newer than any built page), an edit belongs to
        // the diff editor — it changes lines in real files, verifies with the
        // real build, and reverts on red. A page-only session keeps the page
        // editor below.
        {
            const pageEntry = (global as any).joePages?.[activeKey];
            const projEntry = (global as any).joeProjects?.[activeKey];
            const projectNewer = !!projEntry && (!pageEntry || (Number(projEntry.updatedAt) || 0) > (Number(pageEntry.updatedAt) || 0));
            // A BUG REPORT AND AN ENHANCEMENT ARE EDITS TOO. From the field:
            // «زر get directions لا يعمل بشكل صحيح» and «The current route system
            // is not sufficient. I want to transform it into a real turn-by-turn
            // navigation system» — neither carried an edit verb, so the second
            // one built a THIRD copy of the app from scratch instead of
            // improving the one the session already had.
            const fixOrGrow = /(لا\s*يعمل|ما\s*(يشتغل|بيشتغل)|فيه\s*(مشكلة|خلل)|معطّ?ل|عطل|خطأ\s*في|غير\s*كاف|لا\s*يكفي|حوّ?له\s*إلى|طوّ?ره|حسّ?نه)|(not\s*working|does\s*not\s*work|doesn'?t\s*work|is\s*broken|not\s*sufficient|insufficient|not\s*enough|transform\s*it|turn\s*it\s*into|convert\s*it\s*into|improve\s*it|upgrade\s*it)/i.test(probe);
            /**
             * «أصلح ما تبقّى» — THE COMMAND THE DELIVERY MESSAGE OFFERS.
             *
             * When a build is handed over with defects still open, its message
             * ends with «قل ‹أصلح ما تبقّى› وسأفتح المتصفّح على هذه بالذات».
             * That sentence was a promise with nothing behind it until this
             * route existed: the phrase fell through to the surgical editor,
             * which asks a model to rewrite text it was never told about.
             *
             * It is deterministic on purpose — a repair that re-measures in a
             * real browser needs no planning, only doing.
             */
            const repairRemaining = /(أصلح|اصلح|صلّ?ح)\s*(لي\s*)?(ما\s*)?(تبقّ?ى|بقي|المتبقّ?ي|الباقي|العيوب|الأعطال)/.test(probe)
                || /\bfix\s+(what(?:'?s| is)\s+left|the\s+(rest|remaining|defects|blockers))\b/i.test(probe);
            if (repairRemaining && !!projEntry) {
                return {
                    id: `projrepair_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_repair',
                        description: `Re-audit and repair what is still broken in the active project`,
                        tool: 'project_repair', agent: 'Dev',
                        input: {}, dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }

            if (projectNewer && (editIntent || fixOrGrow) && !(buildVerb && webNoun)) {
                return {
                    id: `projedit_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_edit',
                        description: `Surgical edit of the active project: ${intent.goal}`,
                        tool: 'project_edit',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
        }

        // Recovery goals were bounced out of generatePlan at the very top — by the
        // time execution reaches here the goal is a genuine user request.
        if ((buildVerb && webNoun) || (hasActivePage && editIntent)) {
            // A PAGE IS NOT AN APPLICATION.
            //
            // «ابني تطبيق خرائط شبيه بخرائط جوجل» produced index.html + styles.css
            // — a POSTER of a maps app. Measured across six real requests, five
            // came back as a static page or as chat: a chat app, a clinic booking
            // system with a doctor's dashboard, a point-of-sale with reports.
            // Joe owns react_project (a real Vite app) and api_project (a real
            // Express + SQLite server) and almost never reached them.
            //
            // The scope is decided from the request itself, deterministically —
            // no model needed, so it holds when the brain is down:
            //   page   → one document: a landing page, a menu, a portfolio
            //   app    → screens, state, interaction: a real React project
            //   system → app + its own data: a backend, and the app wired to it
            const scope = PlanningEngine.classifyBuildScope(probe);
            if (scope !== 'page' && !(hasActivePage && editIntent)) {
                console.log(`[PlanningEngine] build scope = ${scope} -> evidence-first project_pipeline`);
                return {
                    id: `engineering_${scope}_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ التطبيق أو النظام بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
                };
            }
            /**
             * A NEW SITE IS BUILT BY THE ENGINE THAT CAN ACTUALLY BUILD.
             *
             * «ابنِ موقعاً لمشغل عطور اسمه «ريحان» بخلفية داكنة ولمسة ذهبية،
             * الشعار في المنتصف، زوايا كبسولية» — driven through the real
             * chat UI — planned web_page_builder, which asked an LLM to write
             * one HTML file. With no provider it wrote NOTHING («no LLM
             * provider answered»); with one it writes a single page that has
             * never met the design-directives reader, the design families,
             * the photo pipeline, the visible self-QA or the improvement
             * loop. The month of engine work sat unreachable behind the
             * word «موقع», because that word is in none of the scope lists
             * and 'page' is the classifier's default.
             *
             * react_project is deterministic — it builds, measures and
             * repairs with ZERO model calls, so this route also survives
             * every provider being down. web_page_builder keeps the two
             * jobs that genuinely need model eyes: editing the session's
             * ACTIVE page, and building from an attached design image.
             */
            // …and «edit» must not swallow an explicit build: editIntent hears
            // nouns like «خلفية» and «لون», which a NEW brief also carries
            // («ابنِ موقعاً بخلفية داكنة»). A build verb + a web noun is a
            // build, whatever page happens to be open.
            if (hasActivePage && editIntent && !(buildVerb && webNoun)) {
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
            console.log('[PlanningEngine] new page-scope build -> react_project (deterministic engine, no model needed)');
            return {
                id: `build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'build_page',
                    description: `Building: ${intent.goal}`,
                    tool: 'react_project',
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
            // Guard: «رسائل نموذج التواصل» is the inbox of the site Joe built
            // him, not the mail in his Google account. Without this, the word
            // «رسائل» alone sent a question about his own site to Google — and
            // the answer was a request to connect an account he never named.
            const siteInbox = SITE_INBOX.test(probe);
            //  A REQUEST TO BUILD IS NOT A REQUEST TO READ HIS GOOGLE ACCOUNT.
            //
            //  Measured live on the owner's machine. He wrote:
            //
            //      «عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم
            //       تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع …»
            //
            //  «مواعيد» matched the calendar verb, and two hundred characters of
            //  brief — five columns, a search, a total — were replaced by one
            //  line: «لم يتم ربط حساب Google بعد». Nothing was built, and he was
            //  sent to a door his own order had frozen shut.
            //
            //  «مواعيد» there is the NOUN OF WHAT HE RECORDS, not an instruction
            //  to open a calendar. The contract names this class and prescribes
            //  the cure: «اشترط سياقاً». So the account verbs need to be about
            //  HIS account — «تقويمي», «من جوجل», «افتح التقويم» — and a request
            //  that describes something to build never routes here at all.
            const buildsSomething = PlanningEngine.looksLikeBuild(userGoal);
            const googleOwned = /(تقويمي|بريدي|ايميلي|إيميلي|درايفي|حسابي|من\s*(?:جوجل|قوقل|google)|في\s*(?:جوجل|قوقل|google)|my\s+(?:calendar|inbox|drive|mail)|\bgoogle\b)/iu.test(probe);
            const googleImperative = /(افتح|اعرض|أعرض|هات|جيب|شوف|check|open|show|list|read)/iu.test(probe);
            if ((gmailRead || calList || driveList || sendMail)
                && !buildsSomething
                && (sendMail || googleOwned || googleImperative)
                && !(hasUrl && loginToSite) && !emailCompound && !pageInteraction && !siteInbox) {
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

        // [GITHUB REPOSITORY WORK FAST-PATH] A link plus an implementation verb
        // means the user expects a local, inspectable checkout — not a metadata
        // report. ImportProjectTool clones, analyzes and makes that checkout active
        // so later edit/run/test requests operate on real files. Detailed analysis
        // is local too: meaningful findings must come from tracked files, not only
        // repository metadata. A mere "view this link" still falls through.
        {
            const goalText = String(intent.goal || '');
            const hasGithubUrl = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[\/?#\s]|$)/i.test(goalText);
            const wantsLocalRepositoryWork = /(استنسخ|نسخ|انسخ|استورد|استيراد|حلّ?ل|تحليل|افهم|فهم|دقّ?ق|مراجعة|طوّ?ر|تطوير|عدّ?ل|تعديل|أصلح|اصلح|إصلاح|اختبر|اختبار|شغّ?ل|تشغيل|نفّ?ذ|بناء|build|develop|implement|modify|edit|fix|test|run|clone|import|analy[sz]e|review|inspect)/i.test(probe);
            if (hasGithubUrl && wantsLocalRepositoryWork) {
                console.log('[PlanningEngine] GitHub implementation request → import_project');
                return {
                    id: `repo_import_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'repo_import',
                        description: 'استنساخ المستودع وتحليل ملفاته ومراجعة اختباراته محلياً وربطه بالجلسة',
                        tool: 'import_project',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'medium', riskLevel: 'medium' },
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

        // [EVIDENCE-FIRST ENGINEERING PRECEDENCE]
        // A request to BUILD an application or system is engineering work, even
        // when it names a web console or local verification. The browser router
        // below is intentionally broad for research, but must never turn a new
        // engineering request into a network classifier call before Joe has
        // inspected its workspace and planned from evidence.
        {
            const scope = PlanningEngine.classifyBuildScope(probe);
            if (buildVerb && scope !== 'page') {
                console.log(`[PlanningEngine] engineering scope = ${scope} -> evidence-first project_pipeline before browser routing`);
                return {
                    id: `engineering_${scope}_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_pipeline',
                        description: `استكشف السياق ثم خطط ونفّذ التطبيق أو النظام بأدلة واختبارات: ${intent.goal}`,
                        tool: 'project_pipeline',
                        agent: 'Dev',
                        input: { request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'high', riskLevel: 'medium' },
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
        const looksBrowser = !!urlMatch || (
            !buildVerb && (
                String(intent.suggestedAgent || '') === 'Browser'
                || /(متصفح|براوزر|موقع|صفحة|الويب|الإنترنت|الانترنت|ابحث|إبحث|بحث|جد|جِد|دوّ?ر|فتّ?ش|افتح|تصفّ?ح|عايِ?ن|لخّ?ص|حلّ?ل|دقّ?ق|افحص|انقر|اضغط|املأ|عبّ?ئ|ترجم|قارن|استخرج|browser|web|site|page|search|find|look\s*up|google|open|visit|go\s*to|summari|analy|audit|click|fill|translate|compare|extract|scrape|seo)/i.test(probe)
            )
        );

        // [LOCAL BROWSER CONSENT GATE] When Joe is configured to drive the user's own
        // local Chrome profile (persistent mode), he must ASK permission once before
        // using it. If the user hasn't approved yet: a bare "أوافق" grants it; any
        // other browser request is intercepted with the consent prompt.
        try {
            const mgr = require('../../modules/browser/manager');
            if (mgr.isPersistentBrowserMode && mgr.isPersistentBrowserMode()) {
                const bsid = String((context && context.browserSessionId) || '').trim();
                // Consent is a per-browser-session capability. Never consult or
                // mutate a shared panel session when an execution context forgot
                // to carry its browser identity; BrowserAgent will fail closed.
                if (bsid && !mgr.hasBrowserConsent(bsid)) {
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

        // ORDER IS THE POINT. This gate used to sit BELOW the ReAct fast-path
        // while its own comment claimed priority — and the fast-path swallowed
        // «…وابحث عن دوله فلسطين» because the sentence named a known site. An
        // explicit search verb with no URL is a SEARCH; it is decided here,
        // first, from the user's own words.
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

        // [EXPLICIT URL OPEN FAST-PATH] A bounded request to open a URL (or to
        // return only its title) must navigate before any page-local action. The
        // ReAct route can otherwise choose `browser_find_text` against an empty
        // panel, after which recovery incorrectly proposes browser installation.
        // `browser_launch` performs the real goto and returns the final URL + title.
        {
            const explicitOpen = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(probe);
            const titleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
            const pageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
            if (urlMatch && explicitOpen && (titleOnly || !pageWork)) {
                const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
                console.log(`[PlanningEngine] explicit URL open -> browser_launch ${url}`);
                return {
                    id: `browser_open_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'browser_open',
                        description: titleOnly ? `افتح ${url} وأعد عنوان الصفحة` : `افتح ${url}`,
                        tool: 'browser_launch',
                        agent: 'Browser',
                        input: { url, request: intent.goal },
                        dependsOn: [],
                    }],
                    metadata: { complexity: 'low', riskLevel: 'low' },
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
            // ARABIC HAS NO \b, AND THAT COST A WHOLE FEATURE.
            // `صِ?ف` unanchored matches inside «المتصفّح» — so the word BROWSER
            // itself read as «describe». Field log: «قم باستخدام المتصفح وافتح
            // على جوجل وابحث عن دوله فلسطين» matched describe («صف» inside
            // المتصفح) + a known site («جوجل»), was routed to the free-form
            // ReAct agent, and that agent typed the user's own instruction into
            // Google's search box. Every Arabic verb here is now fenced by
            // Arabic-letter lookarounds so it only matches as a WORD.
            const AR = '\u0621-\u064A';
            // The TRAILING guard is what kills «صف» inside «المتصفّح». The leading
            // one must stay permissive, because Arabic glues its conjunctions and
            // articles onto the word: «ولخّص» is «and summarise», and a strict
            // letter-boundary rejected it — a fix that broke «افتح ويكيبيديا
            // ولخّص عن ابن سينا» while repairing the search misroute. Both cases
            // are in the proof.
            const arWord = (...alts: string[]) => `(?<![${AR}])(?:و|ف|ول|فل|ال)?(?:${alts.join('|')})(?![${AR}])`;
            const describeIntent = new RegExp(
                `${arWord('صِ?ف', 'وصف', 'اوصف', 'أوصف', 'انظر', 'أنظر', 'شاهد', 'اطّ?لع', 'اقرأ', 'لخّ?ص', 'ملخّ?ص')}`
                + `|ماذا\\s*(ترى|يوجد|فيها?)|ما\\s*الذي\\s*(تراه|فيها?)|ما\\s*محتوى`
                + `|${arWord('من\\s*هو', 'من\\s*هي', 'ما\\s*هو', 'ما\\s*هي')}`
                + `|أخبرني\\s*(عن|بما)|اخبرني\\s*(عن|بما)`
                + `|\\bdescribe\\b|\\bsummari[sz]e\\b|what\\s*(do\\s*you\\s*)?see|what'?s\\s*on`
                + `|tell\\s*me\\s*(about|what)|\\bwho\\s*is\\b|\\bwhat\\s*is\\b`, 'i').test(probe);
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
        // A page-title request is not a text search inside an already-open page.
        // Decide it before the smart-tool matrix, whose `findIntent` otherwise sees
        // «عنوان» and selects browser_find_text before there is a document to search.
        const explicitOpen = /(افتح|لفتح|فتح|اذهب|انتقل|زر|ادخل|go\s*to|open|visit|navigate)/i.test(probe);
        const titleOnly = /(عنوان\s*(ال)?صفحة|title\s*(of\s*(the\s*)?)?page|page\s*title)/i.test(probe);
        const pageWork = /(لخّ?ص|تلخيص|حلّ?ل|تحليل|استخرج|استخراج|انقر|اضغط|املأ|عبّ?ئ|سجّ?ل|تسجيل|دخول|summari[sz]e|analy[sz]e|extract|click|fill|log\s*-?\s*in|sign\s*-?\s*in)/i.test(probe);
        if (urlMatch && explicitOpen && (titleOnly || !pageWork)) {
            const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
            console.log(`[PlanningEngine] explicit URL open -> browser_launch ${url}`);
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: titleOnly ? `افتح ${url} وأعد عنوان الصفحة` : `افتح ${url}`,
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url, request: intent.goal },
                    dependsOn: [],
                }],
                metadata: { complexity: 'low', riskLevel: 'low' },
            };
        }
        if (urlMatch && (autofixIntent || agentIntent || summarizeIntent || auditIntent || extractIntent || linksIntent || perfIntent || seoIntent || compareIntent || consoleIntent || pdfIntent || readIntent || contrastIntent || a11yIntent || metaIntent || translateIntent || responsiveIntent || findIntent || designIntent || clickIntent || fullshotIntent)) {
            // «أصلح واجهة https://…» — a page Joe does NOT own gets the CSS
            // patch tool, not the generic autofix: it measures, applies live,
            // measures again, and hands over a file instead of claiming it
            // changed a server it cannot write to.
            const uiRepairIntent = /(أصلح|اصلح|صلّح|حسّن|حسن|عالج|fix|repair|improve)/i.test(probe)
                && /(الواجهة|التصميم|\bui\b|\bux\b|css|التباين|contrast|التجاوب|responsive|الجوال|mobile|الوصولية|accessibility)/i.test(probe);
            const tool = uiRepairIntent ? 'browser_page_fix'
                : autofixIntent ? 'browser_autofix'
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
        /**
         *  A DOOR CLOSED IS NOT A WALL.
         *
         *  The search-priority gate above asks looksBrowser first, and
         *  looksBrowser now refuses a build. This branch asks nothing but the
         *  verb — so his clinic brief walked straight past the closed door and
         *  through this one, and Joe typed «المريض باسمه أو تلفونه» into a
         *  search engine anyway. Measured directly on the planner, twice: the
         *  first fix moved nothing.
         *
         *  A defect fixed at one router is not fixed. Same property, stated
         *  here too: what he describes building is not what he asked Joe to
         *  search for.
         */
        if (searchIntent && !urlMatch && !buildVerb) {
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
                // THE SESSION'S ACTIVE ARTIFACT DECIDES WHO EDITS IT. Measured
                // in the field: right after a real React maps app was built,
                // «اريد اعديل علىيه بان يعمل مسارات للتنقل» reached this router,
                // came back as edit_page, and web_page_builder produced a
                // BROCHURE about maps — pricing plans and a stock photograph —
                // while the app itself was never opened. A project session's
                // edits belong to the project editor, always.
                {
                    const pageEntry = (global as any).joePages?.[activeKey];
                    const projEntry = (global as any).joeProjects?.[activeKey];
                    const projectIsActive = !!projEntry
                        && (!pageEntry || (Number(projEntry.updatedAt) || 0) > (Number(pageEntry.updatedAt) || 0));
                    if (projectIsActive && routed.intent === 'edit_page') {
                        return {
                            id: `projedit_${Date.now()}`,
                            goal: intent.goal,
                            steps: [{
                                id: 'project_edit',
                                description: `Surgical edit of the active project: ${intent.goal}`,
                                tool: 'project_edit', agent: 'Dev',
                                input: { request: intent.goal }, dependsOn: [],
                            }],
                            metadata: { complexity: 'medium', riskLevel: 'low' },
                        };
                    }
                    // …and a BUILD that only got this far is still scoped: an
                    // application must not become a document because the
                    // keyword paths missed it.
                    if (routed.intent === 'build_page') {
                        const scope = PlanningEngine.classifyBuildScope(probe);
                        if (scope !== 'page') {
                            // A semantic classification can identify that this is
                            // more than a page, but it cannot prescribe a stack.
                            // The evidence-first pipeline chooses and proves the
                            // implementation from the workspace and requirements.
                            console.log(`[PlanningEngine] semantic engineering scope = ${scope} -> project_pipeline`);
                            return {
                                id: `engineering_${scope}_${Date.now()}`,
                                goal: intent.goal,
                                steps: [{
                                    id: 'project_pipeline',
                                    description: `استكشف السياق ثم خطط ونفّذ الطلب الهندسي بأدلة واختبارات: ${intent.goal}`,
                                    tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                                }],
                                metadata: { complexity: 'high', riskLevel: 'medium' },
                            };
                        }
                    }
                }
                if (routed.intent === 'build_page' || routed.intent === 'edit_page') {
                    // Same split as the deterministic branch: an EDIT keeps the
                    // page editor; a NEW page-scope build belongs to the
                    // deterministic React engine — directives, QA and repairs
                    // included, model or no model.
                    return {
                        id: `build_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'build_page',
                            description: `Building: ${intent.goal}`,
                            tool: routed.intent === 'edit_page' ? 'web_page_builder' : 'react_project',
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

        /**
         *  A SHORT ORDER IS STILL AN ORDER.
         *
         *  Live round on his machine. He built a book table, then wrote,
         *  in the same chat:
         *
         *      «زيد عمود المؤلف»
         *
         *  and Joe's own log says what happened:
         *
         *      21:01:32  🗂️ Recalled your project context from memory
         *      21:01:37  ▶ central_answer
         *      21:01:40  «Let's elevate your book table with an author
         *                 column—a premium feature…»
         *
         *  It recalled the project and then TALKED about the column. The
         *  column was never added: «المؤلف» appears zero times in the
         *  source and zero times in the 151-line session log.
         *
         *  The reason is the third clause below: `goal.length < 30`. His
         *  sentence is fifteen characters. LENGTH IS NOT INTENT — every
         *  short imperative he can type («غيّر اللون», «احذف العمود»,
         *  «زيد عموداً») was routed to chat because it was short.
         *
         *  So the shortcut may not fire on text that a parser already
         *  recognises as a concrete instruction. columnEdit is one such
         *  parser — measured: «زيد عمود المؤلف» → {add:['المؤلف']} — and
         *  any future parser belongs in this same test rather than in a
         *  list of verbs.
         */
        let readsAsAnOrder = false;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { columnEdit } = require('../design/app-blueprints');
            const edit = columnEdit(intent.goal);
            readsAsAnOrder = (edit?.add?.length || 0) > 0 || (edit?.remove?.length || 0) > 0;
        } catch { readsAsAnOrder = false; }

        /**
         *  THE THING IN FRONT OF HIM DECIDES WHAT HIS WORD MEANS.
         *
         *  Live round, straight after the fast path stopped sending short
         *  orders to chat. He had a React book table on screen and typed
         *  «زيد عمود المؤلف». Joe took it as an order this time — and then
         *  went looking for a DATABASE:
         *
         *      exec=sqlite3 books.db 'CREATE TABLE IF NOT EXISTS books (…'
         *      ERROR: 'sqlite3' is not recognized as an internal command
         *      Stopped at step «Check if SQLite is installed on the system»
         *
         *  «عمود» is a column in a rendered table and a column in SQL, and
         *  the word alone cannot say which. This is the Arabic trap the
         *  contract names — «جدول» is a table and a schedule, «قائمة» is a
         *  list and a menu — and the cure is never a longer word list. It
         *  is CONTEXT: the man has a project open, its type is on record,
         *  and a column added to what he is looking at is an edit of that
         *  project. Nothing here reads the words «sqlite» or «react»; it
         *  reads whether something of his is open.
         *
         *  If no project is open the request keeps its old road, because
         *  then «add a column» really might be about a database.
         */
        if (readsAsAnOrder) {
            const sid = String((context as any)?.sessionId || (intent as any)?.context?.sessionId || (intent as any)?.sessionId || '');
            const open = ((global as any).joeProjects || {})[sid];
            if (open?.dir && open?.type !== 'api') {
                console.log(`[PlanningEngine] a column order with a project open → project_edit (${open.type})`);
                return {
                    id: `edit_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{
                        id: 'project_edit',
                        description: `Surgical edit of the active project: ${intent.goal}`,
                        tool: 'project_edit',
                        args: { request: intent.goal },
                        dependencies: [],
                    }],
                    reasoning: 'a column he asks for on the project already in front of him',
                } as any;
            }
        }

        // [ELITE FAST-PATH] Direct answer for general questions or chat
        if (!readsAsAnOrder && ((intent as any).type === 'general' || (intent as any).type === 'chat' || intent.goal.length < 30)) {
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

        /**
         * BEFORE THE MODEL — ASK THE TOOLS WHAT THEY ARE FOR.
         *
         * «جو غبي ومحدود جدا في التفكير والتنفيذ». Measured: 72 tools
         * registered, 24 names anywhere in this file — 48 capabilities no plan
         * could reach. Everything the hand-written routes do not cover fell to
         * generateDynamicDag, which asks a model; and his logs read «CRITICAL:
         * All LLM providers failed» over and over, so the plan collapsed to
         * central_answer and Joe looked stupid because it WAS.
         *
         * The routes above stay — hand-checked and better. This catches only
         * what they drop, from what every tool already says about itself, and
         * declines when nothing scores. It widens the reach; it never hijacks.
         */
        const byCapability = PlanningEngine.capabilityPlan(intent);
        if (byCapability) return byCapability;

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
        const ANSWER_ONLY_TOOLS = PlanningEngine.ANSWER_ONLY;
        const looksLikeBuildRequest = PlanningEngine.looksLikeBuild;

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
- Use ONLY tools from THIS catalogue (name(args) — purpose). An argument ending with ? is optional:
${catalogueFor(intent.goal)}
- If nothing in the catalogue fits, use central_answer(question) — never invent a tool name.
- Define explicit dependencies (dependsOn).
- DATA FLOW: when a step needs what an earlier step PRODUCED, put {{FROM:<that step's id>}} inside its input where the data belongs — it is replaced with that step's real output at run time. Describing the data instead ("the results from step 1") passes nothing. Example: [{"id":"scan","tool":"link_checker",...},{"id":"report","tool":"write_file","input":{"path":"report.md","content":"# تقرير — {{FROM:scan}}"},"dependsOn":["scan"]}]
- Any id you write inside {{FROM:...}} MUST also appear in that step's dependsOn.
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
                })), String(intent.goal || ''), context);

                /**
                 * A REQUEST TO BUILD IS NOT ANSWERED BY TALKING ABOUT BUILDING.
                 *
                 * His run, verbatim, against «Build a world-class e-commerce
                 * platform … Generate complete production-ready code»:
                 *
                 *     Executing node: define_project_structure   → central_answer
                 *     Executing node: generate_auth_system       → central_answer
                 *     Executing node: create_multi_vendor_marketplace → central_answer
                 *     «Good evening, Younes. As we embark on building …»
                 *
                 * Fifteen nodes, six essays, and not one file on disk. Worse,
                 * an essay always "succeeds", so the failed step's repair got
                 * stamped as a PROVEN cure and replayed on the next unrelated
                 * error («proven 2x» in his log).
                 *
                 * A plan that answers a BUILD with nothing but answering tools
                 * is not a plan. It is refused here, and the deterministic
                 * builders take the request instead.
                 */
                const talkOnly = steps.length > 0 && steps.every((st: any) =>
                    ANSWER_ONLY_TOOLS.has(String(st.tool || '')));
                if (talkOnly && looksLikeBuildRequest(String(intent.goal || ''))) {
                    console.warn(`[PlanningEngine] the model planned ${steps.length} talking step(s) for a BUILD — refusing invented construction.`);
                    const scope = PlanningEngine.classifyBuildScope(String(intent.goal || ''));
                    if (scope === 'page') {
                        return {
                            id: `build_page_rescue_${Date.now()}`,
                            goal: intent.goal,
                            steps: [{ id: 'build_page', description: `بناء الموقع بمحرك React الحتمي: ${intent.goal}`, tool: 'react_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                            metadata: { complexity: 'medium', riskLevel: 'low' },
                        };
                    }
                    return {
                        id: `engineering_rescue_${Date.now()}`,
                        goal: intent.goal,
                        steps: [{
                            id: 'project_pipeline',
                            description: `استكشف السياق ثم خطط ونفّذ طلب البناء بأدلة واختبارات: ${intent.goal}`,
                            tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                        }],
                        metadata: { complexity: 'high', riskLevel: 'medium' },
                    };
                }

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

        /**
         * A BUILD MUST NOT DIE BECAUSE A PLANNER RAN OUT OF QUOTA.
         *
         * From his log, in full: the DAG planner reached Groq, Groq answered
         * «429 … tokens per day (TPD): Limit 100000, Used 100000», every
         * keyless provider was dead (401/418/402), the local brain had timed
         * out — and a request to BUILD A SYSTEM ended with «تعذّر الوصول إلى
         * محرّك الذكاء». Nothing in that build needed a model: the scaffolder,
         * the database, the CRUD, the screens and the self-QA are all
         * deterministic. Only the ROUTE to them went through an LLM.
         *
         * So when planning fails and the goal is a build, the builders take it.
         * This is the same rescue the talk-only plan already gets — it just has
         * to survive the planner being unreachable, not merely wrong.
         */
        if (looksLikeBuildRequest(String(intent.goal || ''))) {
            console.warn('[PlanningEngine] the planner was unreachable for a BUILD — routing systems to evidence-first planning, never an invented stack.');
            const scope = PlanningEngine.classifyBuildScope(String(intent.goal || ''));
            if (scope === 'page') {
                return {
                    id: `build_page_offline_${Date.now()}`,
                    goal: intent.goal,
                    steps: [{ id: 'build_page', description: `بناء الموقع بمحرك React الحتمي: ${intent.goal}`, tool: 'react_project', agent: 'Dev', input: { request: intent.goal }, dependsOn: [] }],
                    metadata: { complexity: 'medium', riskLevel: 'low' },
                };
            }
            return {
                id: `engineering_offline_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'project_pipeline',
                    description: `استكشف السياق ثم خطط ونفّذ طلب البناء بأدلة واختبارات: ${intent.goal}`,
                    tool: 'project_pipeline', agent: 'Dev', input: { request: intent.goal }, dependsOn: [],
                }],
                metadata: { complexity: 'high', riskLevel: 'medium' },
            };
        }

        // Emergency Fallback (Dynamic but minimal)
        console.warn(`[PlanningEngine] Using failover node for: ${intent.goal}`);
        const fallbackUrl = String(intent.goal || '').match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
        // A planner failure must not reinterpret an engineering build as a browser
        // visit just because upstream intent analysis was unavailable or imprecise.
        // URLs remain explicit browser evidence; otherwise a browser fallback is
        // permitted only for a non-build request.
        const isBrowserFallback = !!fallbackUrl || (
            !looksLikeBuildRequest(String(intent.goal || '')) && (
                intent.suggestedAgent === 'Browser'
                || Boolean(intent.requiredTools && intent.requiredTools.includes('browser_run'))
            )
        );
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
    static sanitizeSteps<T extends { tool: string; description: string; input: any }>(steps: T[], goal: string, context?: any): T[] {
        const userGoal = goal.split(/\n+\[(?:ATTACHED FILES|STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|RESPONSE LANGUAGE)/)[0].trim();
        // A planner is now shown a REAL catalogue, so a name outside it is a
        // hallucination rather than a gap. An unknown name used to travel all
        // the way to the executor and come back as «tool not found», which the
        // recovery loop then tried to plan around. It is turned into an honest
        // answer here instead — once, at the source.
        const known = new Set(registeredToolNames());
        const { TOOL_ALIASES } = require('../../modules/services/ToolService');
        for (const s of steps) {
            const name = String(s.tool || '').trim();
            if (known.has(name)) continue;
            const viaAlias = TOOL_ALIASES?.[name];
            if (viaAlias && known.has(viaAlias)) { s.tool = viaAlias; continue; }
            console.warn(`[PlanningEngine] planner named an unknown tool «${name}» — answering instead of pretending`);
            s.tool = 'central_answer';
            s.input = { question: s.description || userGoal };
        }
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
        return PlanningEngine.wireDataFlow(PlanningEngine.fillRequiredArgs(steps as any, userGoal, context) as any) as any;
    }

    /**
     * THE MIND MAY NOT SCHEDULE WORK THE TOOLS CANNOT BE FED.
     *
     * 132 of the 151 tools declare required arguments. The sanitiser filled
     * exactly three of them by hand, so for everything else a step that named
     * the right tool and forgot its argument was scheduled anyway — and died at
     * run time with a machine word. Measured, on a sentence that CONTAINED the
     * answer:
     *
     *   «دقّق السيو في https://example.com»
     *   plan: browser_seo_audit, input {}
     *   result: ok=false, «no_url»
     *
     * The URL was in the user's own sentence. The tool was the right one. The
     * intelligence layer already knew how to fill that argument — it does it
     * for the capability router — and nobody connected the three.
     *
     * So every step is now checked against what its tool actually requires:
     *   - what the planner wrote is never overwritten;
     *   - a missing required argument is filled from the sentence, the open
     *     page, or the session's project, by the same code the router uses;
     *   - and when it truly cannot be found, the step is not scheduled to fail.
     *     It becomes a question that names what is missing, because asking is
     *     an answer and «no_url» is not.
     */
    static fillRequiredArgs<T extends { tool: string; description: string; input: any }>(steps: T[], goal: string, context?: any): T[] {
        // Arguments the RUNTIME supplies, never the planner: ToolService puts the
        // signed-in user, the workspace and the live session into every call.
        // Counting them as «missing» turned a perfectly good browser step into a
        // question asking the user for a session id — caught by the sanitizer's
        // own older test, which is why it exists.
        const RUNTIME_SUPPLIED = new Set(['sessionId', 'userId', 'workspaceId', 'context', '__userId', '__workspaceId']);
        const { tools } = require('../../modules/tools/registry');
        const byName = new Map<string, any>((tools as any[]).map(t => [t.name, t]));
        for (const s of steps) {
            const tool = byName.get(String(s.tool || ''));
            const required: string[] = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
            const requiredAny: string[][] = Array.isArray(tool?.inputSchema?.requiredAny)
                ? tool.inputSchema.requiredAny.filter((group: any) => Array.isArray(group) && group.length).map((group: any[]) => group.map(String))
                : [];
            if (!required.length && !requiredAny.length) continue;
            s.input = s.input && typeof s.input === 'object' ? s.input : {};

            // Repair omitted project evidence before the generic URL/text filler.
            // The helper only uses the active session project inside the trusted
            // workspace; it never invents a path or a test harness.
            s.input = enrichWorkspaceToolInput(String(s.tool || ''), s.input, `${s.description || ''} ${goal}`.trim(), context);

            const hasValue = (key: string) => {
                if (RUNTIME_SUPPLIED.has(key)) return true;
                const v = (s.input as any)[key];
                if (v === undefined || v === null) return false;
                if (typeof v === 'string' && !v.trim()) return false;
                if (Array.isArray(v) && !v.length) return false;
                return true;
            };
            const missing = () => required.filter(r => !hasValue(r));
            const missingAny = () => requiredAny.filter(group => !group.some(hasValue));
            if (!missing().length && !missingAny().length) continue;

            // The router's own filler: a URL from the sentence or the open page,
            // the goal for a question/query/instruction. For one-of groups copy
            // only the first alias it can derive, preserving any alias already
            // supplied by the planner.
            try {
                const filled = inputForTool(tool, `${s.description || ''} ${goal}`.trim(), context);
                if (filled) {
                    for (const k of missing()) if (filled[k] !== undefined) (s.input as any)[k] = filled[k];
                    for (const group of missingAny()) {
                        const candidate = group.find(k => filled[k] !== undefined);
                        if (candidate) (s.input as any)[candidate] = filled[candidate];
                    }
                }
            } catch { /* the filler is a helper, never a blocker */ }

            const still = missing();
            const stillAny = missingAny();
            if (!still.length && !stillAny.length) continue;
            const missingLabels = [...still, ...stillAny.map(group => group.join(' أو '))];

            console.warn(`[PlanningEngine] «${s.tool}» needs ${missingLabels.join(', ')} and nothing in the request provides it — asking instead of failing`);
            s.tool = 'central_answer';
            s.input = {
                question: `${s.description || goal}\n\n(لأنفّذ هذه الخطوة أحتاج: ${missingLabels.join('، ')} — لم أجده في الطلب. اسأل المستخدم عنه بوضوح، بلغته، ولا تختلق قيمة.)`,
                request: goal,
            };
        }
        return steps;
    }

    /**
     * THE PLAN'S DATA FLOW — the difference between two steps and one job.
     *
     * The executor has always understood `{{FROM:<id>}}`: a placeholder inside a
     * step's input that resolves to an earlier step's OUTPUT. But the planning
     * prompt never taught it, so only two hand-written fast paths ever emitted
     * one. Every plan the model wrote carried `dependsOn` as pure ORDERING —
     * «افحص الروابط المكسورة ثم اكتب تقريراً بالنتيجة» became a scan whose
     * findings were thrown away, followed by a write_file whose content was the
     * words «تقرير بالنتائج». The second step never saw the first one's work.
     *
     * The prompt now teaches the syntax, and this pass makes the graph honest:
     *
     *   - ids are unique. `completedNodes` is a Set — two nodes sharing an id
     *     make `size < nodes.length` true forever, and the run dies on the
     *     iteration limit instead of finishing.
     *   - a dependency on a step that does not exist is dropped. It could never
     *     be satisfied: the node stays "pending", the loop sees no ready nodes,
     *     and after two replans the run ends with «Execution stopped».
     *   - a dependency that would close a cycle is dropped, for the same reason.
     *   - a `{{FROM:x}}` reference IS a dependency and is declared as one.
     *     Referencing a step without depending on it resolves the placeholder
     *     BEFORE that step runs — an empty string, silently: an empty file, an
     *     empty email. A reference to an id that does not exist at all is
     *     retargeted to the step's own first dependency, or removed.
     *   - and a step that depends on another yet never mentions it gets the
     *     producer's output carried into it. Empty content slot: filled. A short
     *     one (under 400 chars — a DESCRIPTION of the material, not the material
     *     itself): appended to, never overwritten. A long one is the payload the
     *     model authored and is left untouched.
     *
     * Idempotent by construction: the carry only fires when a step contains no
     * reference at all, so running this twice cannot append twice.
     */
    static wireDataFlow<T extends { id?: string; tool?: string; input?: any; dependsOn?: any }>(steps: T[]): T[] {
        const list = (Array.isArray(steps) ? steps : []).filter(s => s && typeof s === 'object');
        if (list.length < 2) return steps;

        const FROM = /\{\{\s*FROM:([a-zA-Z0-9_-]+)\s*\}\}/g;
        const refsIn = (v: any, out: Set<string> = new Set()): Set<string> => {
            if (typeof v === 'string') { for (const m of v.matchAll(FROM)) out.add(m[1]); }
            else if (Array.isArray(v)) v.forEach(x => refsIn(x, out));
            else if (v && typeof v === 'object') Object.values(v).forEach(x => refsIn(x, out));
            return out;
        };
        const mapStrings = (v: any, f: (s: string) => string): any => {
            if (typeof v === 'string') return f(v);
            if (Array.isArray(v)) return v.map(x => mapStrings(x, f));
            if (v && typeof v === 'object') {
                const o: any = {}; for (const k of Object.keys(v)) o[k] = mapStrings(v[k], f); return o;
            }
            return v;
        };

        // 1. Unique ids. The first holder of a name keeps it, so references
        //    written against it stay valid.
        const used = new Set<string>();
        list.forEach((s, i) => {
            let id = String(s.id ?? '').trim() || `step_${i + 1}`;
            if (used.has(id)) { let n = 2; while (used.has(`${id}_${n}`)) n++; id = `${id}_${n}`; }
            used.add(id);
            s.id = id;
        });

        // 2. Edges that can actually be scheduled: the target must exist, must
        //    not be the step itself, and must not already depend on it.
        const deps = new Map<string, string[]>(list.map(s => [String(s.id), [] as string[]]));
        const dependsTransitively = (from: string, on: string, seen = new Set<string>()): boolean => {
            if (from === on) return true;
            if (seen.has(from)) return false;
            seen.add(from);
            return (deps.get(from) || []).some(d => dependsTransitively(d, on, seen));
        };
        const addEdge = (id: string, dep: string): boolean => {
            if (!deps.has(dep) || dep === id) return false;
            const mine = deps.get(id)!;
            if (mine.includes(dep)) return true;
            if (dependsTransitively(dep, id)) return false;   // would close a cycle
            mine.push(dep);
            return true;
        };
        for (const s of list) {
            const declared = Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [];
            for (const d of declared) addEdge(String(s.id), d);
        }

        // 3. Every reference is a real, declared, ordered edge — or it goes away.
        for (const s of list) {
            const id = String(s.id);
            if (!s.input || typeof s.input !== 'object') continue;
            for (const ref of refsIn(s.input)) {
                if (deps.has(ref) && addEdge(id, ref)) continue;
                const fallback = (deps.get(id) || [])[0];
                // The id charset is [A-Za-z0-9_-] — nothing here needs escaping.
                const placeholder = new RegExp(`\\{\\{\\s*FROM:${ref}\\s*\\}\\}`, 'g');
                s.input = mapStrings(s.input, (str) => str.replace(placeholder, fallback ? `{{FROM:${fallback}}}` : ''));
                if (fallback) console.warn(`[PlanningEngine] «${id}» referenced «${ref}» which is not usable — retargeted to «${fallback}»`);
                else console.warn(`[PlanningEngine] «${id}» referenced «${ref}» which does not exist — reference removed`);
            }
        }

        // 4. The carry: a step that depends on work it never mentions.
        const CONTENT_KEYS = ['content', 'body', 'text', 'markdown', 'message'];
        for (const s of list) {
            const id = String(s.id);
            const mine = deps.get(id) || [];
            s.dependsOn = mine;
            if (!mine.length) continue;
            if (!s.input || typeof s.input !== 'object') { s.input = {}; }
            if (refsIn(s.input).size) continue;                       // the plan already says it
            const carried = mine.map(d => `{{FROM:${d}}}`).join('\n\n');

            if (String(s.tool || '') === 'central_answer') {
                const q = String(s.input.question || '').trim();
                s.input.question = `${q}\n\n[نتيجة الخطوات السابقة — اعتمد عليها]\n${carried}`.trim();
                continue;
            }
            const slot = CONTENT_KEYS.find(k => k in s.input) || (String(s.tool || '') === 'write_file' ? 'content' : null);
            if (!slot) continue;
            const existing = typeof s.input[slot] === 'string' ? s.input[slot] : '';
            if (!existing.trim()) s.input[slot] = carried;
            else if (existing.length < 400) s.input[slot] = `${existing}\n\n${carried}`;
        }

        return steps;
    }
}
