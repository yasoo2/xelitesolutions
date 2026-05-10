import { analyzeContextualIntent, ConversationContext, buildConversationContext } from '../llm/context-engine';
import { advancedAnalyzeTask, TaskAnalysis } from '../llm/intelligent-router';

export interface StructuredIntent {
    goal: string;
    constraints: string[];
    requiredTools: string[];
    riskLevel: 'low' | 'medium' | 'high';
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    entities: Record<string, any>;
    suggestedAgent: string;
    rawIntent: any;
}

export class IntentParser {
    /**
     * Parse natural language input into a structured intent object
     */
    static async parse(text: string, context: ConversationContext): Promise<StructuredIntent> {
        console.log(`[IntentParser] Parsing intent: "${text.substring(0, 50)}..."`);
        
        // [REAL RUNTIME BRAIN] Use advanced LLM analysis for deep intent understanding
        const analysis: TaskAnalysis = await advancedAnalyzeTask(text);
        
        // Map TaskAnalysis to StructuredIntent
        const intent: StructuredIntent = {
            goal: text,
            constraints: [],
            requiredTools: [],
            riskLevel: analysis.complexity === 'extreme' || analysis.complexity === 'high' ? 'high' : 'medium',
            complexity: analysis.complexity,
            entities: {},
            suggestedAgent: this.mapTypeToAgent(analysis.type),
            rawIntent: analysis
        };

        return intent;
    }

    private static mapTypeToAgent(type: string): string {
        switch (type) {
            case 'code_generation': return 'Dev';
            case 'browser_task': return 'Browser';
            case 'data_analysis': return 'Dev';
            case 'complex_reasoning': return 'Dev';
            default: return 'General';
        }
    }

    /**
     * Helper to create context if only history is available
     */
    static createContext(userId: string, sessionId: string, history: any[]): ConversationContext {
        return buildConversationContext(userId, sessionId, history);
    }
}
