import { PollinationsProvider } from './pollinations';
import OpenAI from 'openai';

const pollinationsProvider = new PollinationsProvider();

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
            console.info('[DeepSeek] Provider initialized with API key');
        } else {
            console.warn('[DeepSeek] No API key found. Operating in FREE MODE via Pollinations Proxy.');
        }
    }

    isAvailable(): boolean {
        // In this system, DeepSeek is ALWAYS available because we have a free proxy fallback
        return true;
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = DEEPSEEK_MODELS.CHAT,
        tools?: any[]
    ): Promise<string> {
        // if no client, use free pollinations proxy
        if (!this.client) {
            console.info('[DeepSeek] Using Free Anonymous Proxy (Pollinations)');
            // Fix messages format for pollinations if needed (simple strings)
            const pollinationsMsgs = messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            }));
            return await pollinationsProvider.chatComplete(pollinationsMsgs, 'openai');
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
                throw new Error('Empty response from DeepSeek Official');
            }

            const message = completion.choices[0]?.message;
            if (!message) {
                throw new Error('No message in DeepSeek Official response');
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                return JSON.stringify({
                    type: 'tool_calls',
                    tool_calls: message.tool_calls,
                });
            }

            return message.content || '';
        } catch (error: any) {
            console.warn('[DeepSeek] Official API failed, falling back to Free Proxy:', error.message);
            return await pollinationsProvider.chatComplete(messages as any, 'openai');
        }
    }
}

export const deepSeekProvider = new DeepSeekProvider();
