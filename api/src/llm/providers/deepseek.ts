import OpenAI from 'openai';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export const DEEPSEEK_MODELS = {
    CHAT: 'deepseek-chat', // DeepSeek-V3
    REASONER: 'deepseek-reasoner', // DeepSeek-R1
};

export class DeepSeekProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || DEEPSEEK_API_KEY;
        if (this.apiKey) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: DEEPSEEK_BASE_URL,
            });
            console.info('[DeepSeek] Provider initialized');
        } else {
            console.warn('[DeepSeek] No API key found. Set DEEPSEEK_API_KEY in environment.');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && !!this.client;
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = DEEPSEEK_MODELS.CHAT,
        tools?: any[]
    ): Promise<string> {
        if (!this.client) {
            throw new Error('DeepSeek API key not configured');
        }

        try {
            const params: any = {
                model: model,
                messages: messages as any,
                max_tokens: 4096,
            };

            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }

            const completion = await this.client.chat.completions.create(params);

            if (!completion || !completion.choices || completion.choices.length === 0) {
                throw new Error('Empty response from DeepSeek');
            }

            const message = completion.choices[0]?.message;
            if (!message) {
                throw new Error('No message in DeepSeek response');
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                return JSON.stringify({
                    type: 'tool_calls',
                    tool_calls: message.tool_calls,
                });
            }

            return message.content || '';
        } catch (error: any) {
            console.error('[DeepSeek] API Error:', error.message);
            throw error;
        }
    }
}

export const deepSeekProvider = new DeepSeekProvider();
