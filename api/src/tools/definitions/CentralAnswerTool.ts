import { ToolDefinition } from '../types';

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
        type: 'object' as const,
        properties: {
            question: { type: 'string' as const },
            note: { type: 'string' as const }
        }
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

    async execute(input: { question: string }) {
        const { question } = input;

        try {
            const OpenAI = require('openai').default;
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) throw new Error('OPENAI_API_KEY not found');

            const openai = new OpenAI({ apiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'You are a helpful AI assistant. Answer the user question directly and concisely.' },
                    { role: 'user', content: question }
                ],
                max_tokens: 1000
            });

            const answer = completion.choices[0]?.message?.content || 'No response generated.';

            return {
                ok: true,
                output: {
                    question,
                    note: answer
                },
                logs: [`central_answer: Answered question: "${question.slice(0, 50)}..."`]
            };
        } catch (err: any) {
            try {
                const { PollinationsProvider } = require('../../llm/providers/pollinations');
                const provider = new PollinationsProvider();
                const response = await provider.chatComplete([
                    { role: 'system', content: 'You are a helpful AI assistant. Answer the user question directly and concisely.' },
                    { role: 'user', content: question }
                ]);

                return {
                    ok: true,
                    output: {
                        question,
                        note: response || 'No response generated (Pollinations).'
                    },
                    logs: [`central_answer: Answered via Pollinations (Fallback): "${(response || '').slice(0, 50)}..."`]
                };
            } catch (fallbackErr: any) {
                return {
                    ok: false,
                    error: `Failed to generate answer (All providers failed): ${err.message} -> ${fallbackErr.message}`,
                    logs: [`central_answer: Error: ${err.message}`]
                };
            }
        }
    }
}
