/**
 * Mistral AI Provider
 * Strong FREE tier (2026): broad model access, ~1B tokens/month on the free plan,
 * excellent multilingual + code performance. OpenAI-compatible /chat/completions.
 *
 * Get a free API key: https://console.mistral.ai/  (env: MISTRAL_API_KEY)
 */

import OpenAI from 'openai';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

export const MISTRAL_MODELS = {
    LARGE: 'mistral-large-latest',
    SMALL: 'mistral-small-latest',
    NEMO: 'open-mistral-nemo',
    CODESTRAL: 'codestral-latest',
    DEFAULT: 'mistral-small-latest',
};

export class MistralProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || MISTRAL_API_KEY;
        if (this.apiKey && this.apiKey !== 'dummy') {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: MISTRAL_BASE_URL,
            });
            console.info('[Mistral] Provider initialized with API key (FREE tier)');
        } else {
            console.warn('[Mistral] No API key found. Set MISTRAL_API_KEY for a free provider.');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'dummy' && !!this.client;
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = MISTRAL_MODELS.DEFAULT,
        tools?: any[]
    ): Promise<string> {
        if (!this.client) {
            throw new Error('MISTRAL_API_KEY not configured');
        }

        try {
            const body: any = {
                model,
                messages: messages as any,
                temperature: 0.7,
                max_tokens: 4096,
            };

            if (tools && tools.length > 0) {
                body.tools = tools.map((t: any) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description || '',
                        parameters: t.inputSchema || { type: 'object', properties: {} },
                    },
                }));
                body.tool_choice = 'auto';
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
            console.error('[Mistral] Chat failed:', error.message);
            throw error;
        }
    }
}

export const mistralProvider = new MistralProvider();
