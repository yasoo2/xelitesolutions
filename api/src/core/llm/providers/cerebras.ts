import { noteMissingKey } from '../../../shared/startup-notes';
/**
 * Cerebras Provider
 * One of the strongest FREE LLM providers (2026): ultra-fast inference on custom
 * wafer-scale silicon, ~1M free tokens/day, no credit card required.
 * OpenAI-compatible /chat/completions endpoint.
 *
 * Get a free API key: https://cloud.cerebras.ai/  (env: CEREBRAS_API_KEY)
 */

import OpenAI from 'openai';

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';

export const CEREBRAS_MODELS = {
    LLAMA_3_3_70B: 'llama-3.3-70b',
    LLAMA_3_1_8B: 'llama3.1-8b',
    QWEN_3_32B: 'qwen-3-32b',
    DEFAULT: 'llama-3.3-70b',
};

export class CerebrasProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || CEREBRAS_API_KEY;
        if (this.apiKey && this.apiKey !== 'dummy') {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: CEREBRAS_BASE_URL,
            });
            console.info('[Cerebras] Provider initialized with API key (FREE, ultra-fast)');
        } else {
            noteMissingKey('Cerebras', 'CEREBRAS_API_KEY');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'dummy' && !!this.client;
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = CEREBRAS_MODELS.DEFAULT,
        tools?: any[]
    ): Promise<string> {
        if (!this.client) {
            throw new Error('CEREBRAS_API_KEY not configured');
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
            console.error('[Cerebras] Chat failed:', error.message);
            throw error;
        }
    }
}

export const cerebrasProvider = new CerebrasProvider();
