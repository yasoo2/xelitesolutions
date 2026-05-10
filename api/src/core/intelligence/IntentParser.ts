import { analyzeContextualIntent, ConversationContext, buildConversationContext } from '../llm/context-engine';

export interface StructuredIntent {
    goal: string;
    constraints: string[];
    requiredTools: string[];
    riskLevel: 'low' | 'medium' | 'high';
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    entities: Record<string, any>;
    rawIntent: any;
}

export class IntentParser {
    /**
     * Parse natural language input into a structured intent object
     */
    static async parse(text: string, context: ConversationContext): Promise<StructuredIntent> {
        console.log(`[IntentParser] Parsing intent: "${text.substring(0, 50)}..."`);
        
        const contextualIntent = analyzeContextualIntent(text, context);
        
        // Map contextual intent to structured intent
        const intent: StructuredIntent = {
            goal: contextualIntent.suggestedAction || text,
            constraints: [],
            requiredTools: contextualIntent.entities?.tools || [],
            riskLevel: 'low',
            complexity: 'medium',
            entities: contextualIntent.entities || {},
            rawIntent: contextualIntent
        };

        // Determine complexity and risk based on intent type and entities
        if (contextualIntent.primary === 'multi_step' || (contextualIntent.entities?.steps?.length > 2) || text.toLowerCase().includes('build a full') || text.toLowerCase().includes('كامل')) {
            intent.complexity = 'high';
            intent.riskLevel = 'medium';
        }

        if (text.toLowerCase().includes('delete') || text.toLowerCase().includes('rm -rf') || text.toLowerCase().includes('sudo') || text.toLowerCase().includes('حذف')) {
            intent.riskLevel = 'high';
            intent.constraints.push('unauthorized_deletion_blocked');
        }

        // Extract specific project goals
        if (intent.entities.projectType === 'web') {
            intent.goal = `Build/Modify web project: ${text.substring(0, 100)}`;
        }

        return intent;
    }

    /**
     * Helper to create context if only history is available
     */
    static createContext(userId: string, sessionId: string, history: any[]): ConversationContext {
        return buildConversationContext(userId, sessionId, history);
    }
}
