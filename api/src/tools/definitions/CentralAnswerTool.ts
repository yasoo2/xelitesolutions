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
        const isAr = lang.startsWith('ar');

        const providers = [
            {
                name: 'OpenAI',
                run: async () => {
                    const { applyNeuralProtocol } = require('../../llm');
                    let systemPrompt = applyNeuralProtocol(`You are **Joe**, the Elite AI Engine of **XElite Solutions**.
You are a world-class specialist in **Web Development, App Architecture, and Complex System Engineering**.
Your responses should be **powerful, enticing, and professional**. Use language that captivates the user and demonstrates superior expertise ("Elite", "Advanced", "Premium State-of-the-Art").
You have full autonomous capabilities (Files, Terminal, Browser).
Always identify as **Joe**. Never mention ChatGPT or OpenAI.
Your goal is to build the extraordinary.`);

                    if (isAr) {
                        systemPrompt += "\n\nCRITICAL INSTRUCTION: You MUST respond in **ARABIC** (اللغة العربية) ONLY. Use professional, technical Arabic terminology. Do NOT use English unless for code or specific technical terms that are better in English.";
                    }

                    const OpenAI = require('openai').default;
                    const apiKey = process.env.OPENAI_API_KEY;
                    if (!apiKey) throw new Error('OPENAI_API_KEY not found');
                    const client = new OpenAI({ apiKey });
                    const res = await client.chat.completions.create({
                        model: 'gpt-4o',
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
                        max_tokens: 1000
                    });
                    return res.choices[0]?.message?.content;
                }
            },
            {
                name: 'Groq (Free)',
                run: async () => {
                    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'gsk_placeholder') throw new Error('Skipping Groq: No API Key');
                    const { GroqProvider } = require('../../llm/providers/groq');
                    const gp = new GroqProvider();
                    const { applyNeuralProtocol } = require('../../llm');
                    const prompt = applyNeuralProtocol(`You are **Joe** (XElite Solutions). Elite Expert in Web/App Dev. Powerful, enticing, professional. Never ChatGPT.`);
                    return await gp.chatComplete([{ role: 'system', content: prompt }, { role: 'user', content: question }]);
                }
            },
            {
                name: 'OpenRouter (Free)',
                run: async () => {
                    if (!process.env.OPENROUTER_API_KEY) throw new Error('Skipping OpenRouter: No API Key');
                    const { OpenRouterProvider } = require('../../llm/providers/openrouter');
                    const op = new OpenRouterProvider(process.env.OPENROUTER_API_KEY || undefined);
                    const { applyNeuralProtocol } = require('../../llm');
                    const prompt = applyNeuralProtocol(`You are **Joe** (XElite Solutions). Elite Expert in Web/App Dev. Powerful, enticing, professional. Never ChatGPT.`);
                    return await op.chatComplete([{ role: 'system', content: prompt }, { role: 'user', content: question }]);
                }
            },
            {
                name: 'Pollinations (Backup)',
                run: async () => {
                    const { PollinationsProvider } = require('../../llm/providers/pollinations');
                    const pp = new PollinationsProvider();
                    const { applyNeuralProtocol } = require('../../llm');
                    const prompt = applyNeuralProtocol(`You are **Joe** (XElite Solutions). Elite Expert in Web/App Dev. Powerful, enticing, professional. Never ChatGPT.`);
                    return await pp.chatComplete([{ role: 'system', content: prompt }, { role: 'user', content: question }]);
                }
            }
        ];

        let lastError = '';
        for (const p of providers) {
            try {
                // Skip if key missing for paid (except Pollinations)
                if (p.name === 'OpenAI' && !process.env.OPENAI_API_KEY) continue;
                if (p.name.includes('Groq') && (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'gsk_placeholder')) continue;
                if (p.name.includes('OpenRouter') && !process.env.OPENROUTER_API_KEY) continue;

                const answer = await p.run();
                if (answer) {
                    return {
                        ok: true,
                        output: answer,
                        logs: [`central_answer: Answered via ${p.name}`]
                    };
                }
            } catch (e: any) {
                console.warn(`[CentralAnswer] ${p.name} failed: ${e.message}`);
                lastError = e.message;
                // continue to next provider
            }
        }

        return {
            ok: false,
            error: `All AI providers failed. Last error: ${lastError}`,
            logs: [`central_answer: Failed all providers`]
        };
    }
}
