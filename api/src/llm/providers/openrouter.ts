import OpenAI from 'openai';

// OpenRouter Models (Free and Popular Paid Options)
export const OPENROUTER_MODELS = {
    // Free Models
    GEMMA_9B_FREE: 'google/gemma-2-9b-it:free',
    LLAMA_8B_FREE: 'meta-llama/llama-3-8b-instruct:free',

    // Popular Paid Models (Affordable)
    GPT4O_MINI: 'openai/gpt-4o-mini',
    CLAUDE_HAIKU: 'anthropic/claude-3-haiku',
    GEMINI_FLASH: 'google/gemini-flash-1.5',

    // Premium Models
    GPT4O: 'openai/gpt-4o',
    CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',

    DEFAULT_FREE: 'google/gemma-2-9b-it:free'
};

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider {
    private client: OpenAI;

    constructor(apiKey: string = 'dummy') {
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: BASE_URL,
            defaultHeaders: {
                'HTTP-Referer': 'https://xelitesolutions.com',
                'X-Title': 'Joe AI Assistant'
            }
        });
    }

    async chatComplete(messages: any[], model: string = OPENROUTER_MODELS.DEFAULT_FREE): Promise<string> {
        try {
            const completion = await this.client.chat.completions.create({
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            });

            return completion.choices[0]?.message?.content || '';
        } catch (error: any) {
            console.error("OpenRouter Chat Failed:", error);
            throw new Error(`OpenRouter API Failed: ${error.message}`);
        }
    }

    // Get suggested model based on complexity
    getSuggestedModel(complexity: 'simple' | 'medium' | 'complex', hasApiKey: boolean): string {
        if (!hasApiKey) {
            // Use free models only
            return complexity === 'simple'
                ? OPENROUTER_MODELS.LLAMA_8B_FREE
                : OPENROUTER_MODELS.GEMMA_9B_FREE;
        }

        // User has API key, use appropriate paid models
        switch (complexity) {
            case 'simple':
                return OPENROUTER_MODELS.GPT4O_MINI;
            case 'medium':
                return OPENROUTER_MODELS.CLAUDE_HAIKU;
            case 'complex':
                return OPENROUTER_MODELS.CLAUDE_SONNET;
            default:
                return OPENROUTER_MODELS.DEFAULT_FREE;
        }
    }
}
