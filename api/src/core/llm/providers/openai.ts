import { noteMissingKey } from '../../../shared/startup-notes';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export class OpenAIProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || OPENAI_API_KEY;
        if (this.apiKey && this.apiKey.startsWith('sk-')) {
            // Keep the official endpoint by default, but honour an explicitly
            // configured compatible gateway (used by local and managed installs).
            const baseURL = String(process.env.OPENAI_API_BASE || '').trim();
            this.client = new OpenAI({
                apiKey: this.apiKey,
                ...(baseURL ? { baseURL } : {}),
            });
            console.info('[OpenAI] Provider initialized with API key');
        } else {
            noteMissingKey('OpenAI', 'OPENAI_API_KEY');
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

            const choices = Array.isArray((completion as any)?.choices)
                ? (completion as any).choices
                : [];
            const message = choices[0]?.message;
            if (!message) {
                throw new Error('OpenAI returned no assistant message (missing choices)');
            }

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
