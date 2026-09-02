import { analyzeContextualIntent, ConversationContext, buildConversationContext } from '../llm/context-engine';
import { looksLikeBuild, isReadOnlyRequest, isBoundedTerminalDiagnosticRequest } from '../orchestrator/buildIntent';
import intelligentRouter from '../llm/intelligent-router';
import { normalizeIntentText } from '../orchestrator/promptNormalizer';
import { parseExplicitFileRequest } from '../orchestrator/file-intent';

export interface StructuredIntent {
    goal: string;
    constraints?: string[];
    requiredTools?: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    entities?: Record<string, any>;
    suggestedAgent: string;
    rawIntent: any;
}

export class IntentParser {
    /**
     * Parse raw user input into a sophisticated StructuredIntent
     * This is a core reasoning step in the runtime engine.
     */
    static async parse(userText: string, context: ConversationContext): Promise<StructuredIntent> {
        // [SPEED FAST-PATH] An OBVIOUS web/browser request (a URL, or a clear
        // browse/search/login/describe verb — in any language via the normalizer)
        // does not need a full LLM "deep analysis": PlanningEngine resolves these
        // deterministically anyway. On a local CPU model this analysis alone cost
        // ~50s per request before the task even started. Ambiguous requests still
        // get the full analysis below.
        // A long engineering brief may mention the browser, GitHub, visual QA, or
        // "open the app" as part of its acceptance criteria.  Those words must not
        // short-circuit the request into the Browser agent before the workspace has
        // been inspected.  Keep the fast path for genuinely browser-only requests,
        // but let substantial build/develop/debug work reach the evidence-first
        // planner (and its project_pipeline route).
        const engineeringBrief = IntentParser.looksLikeEngineeringBrief(userText);
        if (engineeringBrief) {
            console.log('[IntentParser] ⚙️ Engineering brief detected — routing to evidence-first project_pipeline.');
            return {
                goal: userText,
                complexity: 'high',
                riskLevel: 'medium',
                suggestedAgent: 'Dev',
                requiredTools: ['project_pipeline'],
                constraints: ['Inspect the workspace and use evidence before implementation or verification.'],
                rawIntent: { primary: userText, engineeringBrief: true, deterministic: true },
            };
        }
        if (isBoundedTerminalDiagnosticRequest(userText)) {
            console.log('[IntentParser] ⚡ Bounded terminal diagnostic — skipping deep analysis.');
            return {
                goal: userText,
                complexity: 'low',
                riskLevel: 'low',
                suggestedAgent: 'Dev',
                requiredTools: ['shell_execute'],
                constraints: ['Read-only diagnostic: use only the bounded terminal allowlist; do not mutate, install, publish, or start services.'],
                rawIntent: { primary: userText, terminalDiagnostic: true, readOnly: true, deterministic: true },
            };
        }
        // Read-only requests are already bounded by their explicit safety
        // contract. A slow local model must not spend a minute deciding
        // whether "list files and summarize README" is a build request.
        if (isReadOnlyRequest(userText)) {
            console.log('[IntentParser] ⚡ Explicit read-only request — skipping deep analysis.');
            return {
                goal: userText,
                complexity: 'low',
                riskLevel: 'low',
                suggestedAgent: 'Dev',
                requiredTools: ['project_pipeline'],
                constraints: ['Read-only: do not mutate, install, publish, or execute project changes.'],
                rawIntent: { primary: userText, readOnly: true, deterministic: true },
            };
        }
        const explicitFile = parseExplicitFileRequest(userText);
        if (explicitFile) {
            console.log(`[IntentParser] ⚡ Explicit file contract — skipping deep analysis (${explicitFile.path}).`);
            return {
                goal: userText,
                complexity: 'low',
                riskLevel: 'low',
                suggestedAgent: 'Dev',
                requiredTools: ['write_file', ...(explicitFile.readBack ? ['read_file'] : [])],
                rawIntent: { primary: userText, fileRequest: explicitFile, deterministic: true },
            };
        }
        const quick = IntentParser.quickIntent(userText);
        if (quick) {
            console.log(`[IntentParser] ⚡ Deterministic fast intent (${quick.suggestedAgent}) — skipping LLM deep analysis.`);
            return quick;
        }

        console.log(`[IntentParser] Performing deep analysis: "${userText.substring(0, 50)}..."`);

        const systemPrompt = `You are a Senior Strategic Intent Analyst.
Analyze the user's goal and current conversation context to produce a high-fidelity execution strategy.

Context: ${JSON.stringify(context)}

Analyze:
1. Primary Intent: What is the core desired outcome?
2. Domain: Dev, Security, DevOps, Browser, or Research.
3. Complexity: low, medium, high, extreme.
4. Risk Level: low, medium, high, critical.
5. Technical Requirements: languages, frameworks, tools.
6. Success Criteria: How do we know the goal is achieved?

Return ONLY a JSON object:
{
  "primary": "string",
  "domain": "string",
  "complexity": "low|medium|high|extreme",
  "riskLevel": "low|medium|high|critical",
  "requirements": ["string"],
  "successCriteria": ["string"],
  "suggestedAgent": "Dev|Security|Browser|General"
}`;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userText }
            ];
            
            const responseText = await intelligentRouter.routeToModel(messages, {
                type: 'complex_reasoning',
                complexity: 'high',
                requiresTools: false,
                estimatedTokens: 1000,
                language: 'en'
                // Internal reasoning: never spends the user's daily quota
                // while the local brain is available (intelligence economy).
            } as any, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' });

            let analysis: any;
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
            } catch (e) {
                analysis = {};
            }
            
            return {
                goal: userText,
                complexity: analysis.complexity || 'medium',
                riskLevel: analysis.riskLevel || 'low',
                suggestedAgent: analysis.suggestedAgent || 'General',
                rawIntent: analysis,
                constraints: analysis.requirements || [],
                requiredTools: analysis.requirements || []
            };
        } catch (error) {
            // A failed semantic analysis is absence of evidence, never evidence that
            // the user wants a browser. Explicit browser requests have already been
            // caught by quickIntent above. Returning Browser here used to turn an
            // unfamiliar engineering request containing words such as "web console"
            // into a network action before the workspace was inspected.
            console.warn("[IntentParser] LLM analysis failed, returning a neutral intent for evidence-first planning.");
            return {
                goal: userText,
                complexity: 'medium',
                riskLevel: 'low',
                suggestedAgent: 'General',
                requiredTools: [],
                rawIntent: { primary: userText, analysisUnavailable: true }
            };
        }
    }

    /**
     * Detect a substantial engineering request before applying the browser fast
     * path. This is deliberately conservative: a short "open this page" request
     * remains a browser task, while a build/repository/system brief with browser
     * or GitHub acceptance criteria must be planned as engineering work.
     */
    static looksLikeEngineeringBrief(userText: string): boolean {
        const raw = String(userText || '').trim();
        if (!raw) return false;
        const probe = `${raw}\n${normalizeIntentText(raw)}`;
        const engineeringVerb = /(?:\bbuild\b|\bcreate\b|\bdevelop\b|\bimplement\b|\brefactor\b|\brepair\b|\bdebug\b|\btest\b|\bdeploy\b|\bcode\b|\bmodify\b|\bbuild\s+out\b|بناء|ابن(?:ِ|ي|ى)|انش(?:ئ|ء|ي)|تطوير|طوّ?ر|برمج|اختبر|اختبار|اصلح|إصلح|عدّ?ل|نفّ?ذ|تنفيذ)/i.test(probe);
        const engineeringNoun = /(?:\brepository\b|\brepo\b|\bcodebase\b|\bproject\b|\bsystem\b|\bplatform\b|\bapplication\b|\bapp\b|\bapi\b|\bbackend\b|\bfrontend\b|\bdatabase\b|\bsoftware\b|\bcode\b|\btests?\b|نظام|منص(?:ة|ه)|تطبيق|مشروع|مستودع|كود|برنامج|خادم|قاعدة\s+بيانات|واجهة|اختبارات?)/i.test(probe);
        // The length guard prevents ordinary short browser interactions that happen
        // to contain an engineering noun (for example, "open the app dashboard").
        return engineeringVerb && engineeringNoun && (raw.length >= 240 || /(?:production[- ]grade|from\s+scratch|from\s+beginning|من\s+الألف|من\s+الصفر|حقيقي|كامل|معقّد|complex|autonomous|real\s+working)/i.test(probe));
    }

    /** Deterministic intent for unmistakable requests (skips the slow LLM pass).
     *  Probes the user's words PLUS the language-universal canonical form, so
     *  dialects, light typos, and other languages qualify too. Returns null when
     *  the request is ambiguous — those still get the full LLM analysis. */
    static quickIntent(userText: string): StructuredIntent | null {
        const raw = String(userText || '').trim();
        if (!raw) return null;
        // Keep this helper safe when callers use it directly instead of parse().
        // Engineering briefs must never be returned as Browser intents.
        if (IntentParser.looksLikeEngineeringBrief(raw)) return null;
        const probe = `${raw}\n${normalizeIntentText(raw)}`;
        const hasUrl = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)\b/i.test(probe);
        // A well-known site named in words (dialect/transliteration) counts as a web
        // target even without a URL — so «ادخل على جيت هاب» is web, not a code task.
        const knownSite = /(جيت\s*هاب|github|يوتيوب|youtube|فيس\s*بوك|facebook|تويتر|twitter|\bx\.com\b|انست[غق]رام|instagram|جيميل|gmail|لينكد\s*ان|linkedin|ريديت|reddit|ويكيبيديا|wikipedia|قوقل|جوجل|google|امازون|amazon|نتفليكس|netflix|واتساب|whatsapp|تيك\s*توك|tiktok)/i.test(probe);
        // STRONG web verbs are unambiguously about the web — they qualify ALONE
        // (login/browse/search/visit). Without this, «سجّل الدخول الى حسابي» (no URL,
        // no literal "موقع") fell to the slow LLM analysis.
        const strongWebVerb = /(تصفّ?ح|سجّ?ل\s*(ال)?دخول|تسجيل\s*(ال)?دخول|ادخل\s*(على|الى|إلى|ل|حساب|موقع)|اذهب\s*(الى|إلى|ل)|ابحث|دوّ?ر\s*(لي\s*)?عن|open\s*(the\s*)?browser|browse\b|visit\b|go\s*to\b|log\s*-?\s*in|sign\s*-?\s*in|search\b)/i.test(probe);
        // WEAK web verbs need a web noun or a known site to qualify (so «صف لي الفرق
        // بين X و Y» is NOT hijacked to the browser).
        const weakWebVerb = /(افتح|انظر|صِ?ف|وصف|لخّ?ص|ترجم|انقر|استخرج|open\b|describe|summari|translate|click|extract)/i.test(probe);
        const webNoun = knownSite || /(متصفح|موقع|صفحة|رابط|الويب|browser|site|page|link|web)/i.test(probe);
        // A page-interaction verb + a UI-element noun («اضغط على الزر», "click the
        // button") is a continuation of the open page — unmistakably a browser task.
        const interactUi = /(اضغط|انقر|اختر|اكتب|أدخل|مرّ?ر|انزل|عبّ?ئ|املأ|حدّ?د|click|press|scroll|select|type|fill)/i.test(probe)
            && /(زر|الزر|حقل|الحقل|خانة|القائمة|قائمة|رابط|مربع|صندوق|التبويب|button|field|link|menu|dropdown|checkbox|tab|box|input)/i.test(probe);
        /**
         *  A VERB HE WANTS INSIDE HIS APP IS NOT A COMMAND TO JOE.
         *
         *  Measured live. He wrote a dental-clinic brief — five columns, a
         *  search, a total — and Joe opened a browser and typed «المريض باسمه
         *  أو تلفونه» into a search box. Nothing was built.
         *
         *      [IntentParser] Deterministic fast intent (Browser)
         *      [AgentOrchestrator] Executing node: browser_smart
         *          (Search (live typing): المريض باسمه أو تلفونه)
         *
         *  «أبحث» is a STRONG web verb here — it qualifies alone. But in his
         *  sentence it is not an instruction to Joe; it is the FEATURE he wants
         *  in the thing he is asking for. The same trap as «مواعيد» reaching
         *  for a calendar: a word lifted out of the request and read as if he
         *  had addressed it to the machine.
         *
         *  The engineering-brief gate above should have caught it and did not,
         *  because it demands 240 characters or a word like «حقيقي». Length is
         *  a property of how wordy someone is, not of what he asked for — and
         *  he writes short, plain sentences.
         *
         *  So: a request that describes something to be built, and names no web
         *  target at all, is not a browser task. If he names a site or a URL,
         *  the browser keeps it — he may well want both.
         */
        if (looksLikeBuild(raw) && !hasUrl && !knownSite) return null;
        // Unmistakable web request: URL, strong web verb, weak verb + noun, or UI interaction.
        if (!(hasUrl || strongWebVerb || interactUi || (weakWebVerb && webNoun))) return null;
        return {
            goal: raw,
            complexity: 'medium',
            riskLevel: 'low',
            suggestedAgent: 'Browser',
            requiredTools: ['browser_run'],
            rawIntent: { primary: raw, fast: true },
        };
    }

    /**
     * Helper to create context if only history is available
     */
    static createContext(userId: string, sessionId: string, history: any[], modelConfig?: any): ConversationContext {
        const ctx = buildConversationContext(userId, sessionId, history);
        if (modelConfig) {
            (ctx as any).modelConfig = modelConfig;
        }
        return ctx;
    }
}
