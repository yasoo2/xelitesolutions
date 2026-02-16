import { ToolDefinition } from '../types';
import { routeToModel } from '../../llm/intelligent-router';

/**
 * CentralAnswerTool - A simple Q&A tool for general questions
 * This tool is used when the agent needs to answer a question directly
 * without executing complex workflows.
 */
export class CentralAnswerTool implements ToolDefinition {
    name = 'central_answer';
    version = '1.0.0';
    description = 'Answer a general question or provide information directly to the user';
    tags = ['qa', 'general'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            question: {
                type: 'string' as const,
                description: 'The question to answer'
            }
        },
        required: ['question']
    };

    outputSchema = {
        type: 'string' as const
    };

    // Legacy compatibility
    get parameters() {
        return this.inputSchema;
    }

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 0;
    auditFields = [];
    mockSupported = false;

    async execute(input: { question: string }, context?: any) {
        const { question } = input;
        const lang = context?.language || 'en';
        const isAr = lang.startsWith('ar') || /[؟\u0600-\u06FF]/.test(question);

        const baseSystemPrompt = `You are **Joe**, the Elite AI Engine of **XElite Solutions**.
You are a world-class specialist in **Web Development, App Architecture, and Complex System Engineering**.
Your responses should be **powerful, enticing, and professional**. Use language that captivates the user and demonstrates superior expertise ("Elite", "Advanced", "Premium State-of-the-Art").
You have full autonomous capabilities (Files, Terminal, Browser).
Always identify as **Joe**. Never mention ChatGPT or OpenAI.
Your goal is to build the extraordinary.`;
        const systemPrompt = isAr
            ? `${baseSystemPrompt}\n\nCRITICAL INSTRUCTION: You MUST respond in **ARABIC** (اللغة العربية) ONLY. Use professional, technical Arabic terminology. Do NOT use English unless for code or specific technical terms that are better in English.`
            : baseSystemPrompt;

        try {
            const answer = await routeToModel([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ]);

            return {
                ok: true,
                output: answer,
                logs: ['central_answer: Answered via router']
            };
        } catch (e: any) {
            return {
                ok: false,
                error: `Central answer failed: ${e.message}`,
                logs: ['central_answer: Failed via router']
            };
        }
    }
}
