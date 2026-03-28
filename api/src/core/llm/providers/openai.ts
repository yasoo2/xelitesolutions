import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export class OpenAIProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || OPENAI_API_KEY;
        if (this.apiKey && this.apiKey.startsWith('sk-')) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
            });
            console.info('[OpenAI] Provider initialized with API key');
        } else {
            console.warn('[OpenAI] No valid API key found. Set OPENAI_API_KEY in environment.');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && !!this.client && this.apiKey.startsWith('sk-');
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = 'gpt-4o',
        tools?: any[]
    ): Promise<string> {
        if (!this.client) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            console.info(`[OpenAI] Attempting with model: ${model}`);
            const completion = await this.client.chat.completions.create({
                model: model,
                messages: messages as any,
                tools: tools as any,
                tool_choice: tools ? 'auto' : undefined,
            });

            const message = completion.choices[0]?.message;

            if (message?.tool_calls && message.tool_calls.length > 0) {
                return JSON.stringify({
                    type: 'tool_calls',
                    tool_calls: message.tool_calls,
                });
            }

            return message?.content || '';
        } catch (error: any) {
            console.error(`[OpenAI] Chat Failed: ${error.message}`);
            throw error;
        }
    }

    getClient(): OpenAI | null {
        return this.client;
    }
}

export const openAIProvider = new OpenAIProvider();
