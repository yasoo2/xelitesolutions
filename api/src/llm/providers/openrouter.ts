import OpenAI from 'openai';

// OpenRouter Models (Free and Popular Paid Options)
export const OPENROUTER_MODELS = {
    // Free Models
    GEMMA_9B_FREE: 'google/gemma-2-9b-it:free',
    LLAMA_8B_FREE: 'meta-llama/llama-3-8b-instruct:free',
    KIMI_K2_FREE: 'moonshotai/kimi-k2:free',

    // MiniMax Models (Excellent for Tool Calling)
    MINIMAX_M2: 'minimax/minimax-m2',
    MINIMAX_M2_LITE: 'minimax/minimax-m2-lite',

    // Popular Paid Models (Affordable)
    GPT4O_MINI: 'openai/gpt-4o-mini',
    CLAUDE_HAIKU: 'anthropic/claude-3-haiku',
    GEMINI_FLASH: 'google/gemini-flash-1.5',
    DEEPSEEK_V3: 'deepseek/deepseek-chat',

    // Premium Models
    GPT4O: 'openai/gpt-4o',
    CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',

    // Default: MiniMax M2 for best tool calling (when user has API key)
    DEFAULT_FREE: 'moonshotai/kimi-k2:free',
    DEFAULT_PAID: 'minimax/minimax-m2'
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

    async chatComplete(messages: any[], model: string = OPENROUTER_MODELS.DEFAULT_FREE, tools?: any[]): Promise<string> {
        try {
            const body: any = {
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            };

            if (tools && tools.length > 0) {
                body.tools = tools.map((t: any) => ({
                    type: "function",
                    function: {
                        name: t.name,
                        description: t.description || "",
                        parameters: t.inputSchema || { type: "object", properties: {} },
                    },
                }));
                body.tool_choice = "auto";
            }

            const completion = await this.client.chat.completions.create(body);

            const message = completion.choices[0]?.message;
            if (message?.tool_calls && message.tool_calls.length > 0) {
                return JSON.stringify({
                    type: 'tool_calls',
                    tool_calls: message.tool_calls,
                });
            }

            return message?.content || '';
        } catch (error: any) {
            const isClerkError = error.status === 502 || error.message?.includes('Clerk');
            if (isClerkError) {
                console.warn("[OpenRouter] Clerk Auth Failed (502). This normally means the free tier token expired.");
            }
            console.error("OpenRouter Chat Failed:", error.message);
            // Throw so the intelligent router catches it and tries the next one
            throw new Error(`OpenRouter API Failed: ${error.message}`);
        }
    }

    // Get suggested model based on complexity
    getSuggestedModel(complexity: 'simple' | 'medium' | 'complex' | 'tools', hasApiKey: boolean): string {
        if (!hasApiKey) {
            // Use free models only - Kimi K2 is best free for tools
            return complexity === 'tools'
                ? OPENROUTER_MODELS.KIMI_K2_FREE
                : complexity === 'simple'
                    ? OPENROUTER_MODELS.LLAMA_8B_FREE
                    : OPENROUTER_MODELS.KIMI_K2_FREE;
        }

        // User has API key, use appropriate paid models
        switch (complexity) {
            case 'simple':
                return OPENROUTER_MODELS.GPT4O_MINI;
            case 'medium':
                return OPENROUTER_MODELS.DEEPSEEK_V3;
            case 'complex':
                return OPENROUTER_MODELS.CLAUDE_SONNET;
            case 'tools':
                // MiniMax M2 is excellent for tool calling and browser automation
                return OPENROUTER_MODELS.MINIMAX_M2;
            default:
                return OPENROUTER_MODELS.DEFAULT_PAID;
        }
    }
}
