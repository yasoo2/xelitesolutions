import { analyzeContextualIntent, ConversationContext, buildConversationContext } from '../llm/context-engine';
import intelligentRouter from '../llm/intelligent-router';
import { normalizeIntentText } from '../orchestrator/promptNormalizer';

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
            } as any, undefined, undefined, undefined, undefined, undefined, context);

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
            console.warn("[IntentParser] LLM analysis failed, falling back to Browser agent default.");
            return {
                goal: userText,
                complexity: 'medium',
                riskLevel: 'low',
                suggestedAgent: 'Browser',
                requiredTools: ['browser_run'],
                rawIntent: { primary: userText }
            };
        }
    }

    /** Deterministic intent for unmistakable requests (skips the slow LLM pass).
     *  Probes the user's words PLUS the language-universal canonical form, so
     *  dialects, light typos, and other languages qualify too. Returns null when
     *  the request is ambiguous — those still get the full LLM analysis. */
    static quickIntent(userText: string): StructuredIntent | null {
        const raw = String(userText || '').trim();
        if (!raw) return null;
        const probe = `${raw}\n${normalizeIntentText(raw)}`;
        const hasUrl = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)\b/i.test(probe);
        const webVerb = /(افتح|تصفّ?ح|ادخل|اذهب|انظر|صِ?ف|ابحث|سجّ?ل\s*(ال)?دخول|تسجيل\s*دخول|لخّ?ص|ترجم|انقر|استخرج|open|visit|go\s*to|browse|search|log\s*-?\s*in|sign\s*-?\s*in|describe|summari|translate|click|extract)/i.test(probe);
        const webNoun = /(متصفح|موقع|صفحة|رابط|الويب|browser|site|page|link|web)/i.test(probe);
        // Only unmistakable web requests: a URL, or a web verb together with a web noun.
        if (!(hasUrl || (webVerb && webNoun))) return null;
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
