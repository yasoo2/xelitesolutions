import { analyzeContextualIntent, ConversationContext, buildConversationContext } from '../llm/context-engine';
import intelligentRouter from '../llm/intelligent-router';

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
            } as any);

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
            console.warn("[IntentParser] LLM analysis failed, falling back to safe default.");
            return {
                goal: userText,
                complexity: 'medium',
                riskLevel: 'low',
                suggestedAgent: 'General',
                rawIntent: { primary: userText }
            };
        }
    }

    /**
     * Helper to create context if only history is available
     */
    static createContext(userId: string, sessionId: string, history: any[]): ConversationContext {
        return buildConversationContext(userId, sessionId, history);
    }
}
