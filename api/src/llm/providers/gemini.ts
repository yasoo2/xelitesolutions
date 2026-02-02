/**
 * Google Gemini Provider
 * Uses OpenAI-compatible API endpoint for Gemini models
 */

import OpenAI from 'openai';

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// Robust Model List with Fallbacks
const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
];

export class GeminiProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || GEMINI_API_KEY;
        if (this.apiKey) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: GEMINI_BASE_URL,
            });
            console.info('[Gemini] Provider initialized with API key');
        } else {
            console.warn('[Gemini] No API key found. Set GOOGLE_API_KEY in environment.');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && !!this.client;
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model?: string,
        tools?: any[]
    ): Promise<string> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        // Try default model first, then fallbacks
        const modelsToTry = model ? [model] : [DEFAULT_MODEL, ...FALLBACK_MODELS];
        let lastError: any;

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Attempting with model: ${currentModel}`);
                const params: any = {
                    model: currentModel,
                    messages: messages as any,
                };

                // Add tools if provided (function calling support)
                if (tools && tools.length > 0) {
                    params.tools = tools;
                    params.tool_choice = 'auto';
                }

                const completion = await this.client.chat.completions.create(params);

                // Check for tool calls
                const message = completion.choices[0]?.message;
                if (message?.tool_calls && message.tool_calls.length > 0) {
                    return JSON.stringify({
                        type: 'tool_calls',
                        tool_calls: message.tool_calls,
                    });
                }

                return message?.content || '';
            } catch (error: any) {
                const isQuota = error.status === 429 || error.message?.includes('429');
                const isNotFound = error.status === 404 || error.message?.includes('404');

                if (isQuota) {
                    console.error(`[Gemini] Model ${currentModel} QUOTA EXCEEDED.`);
                    throw error; // Stop immediately on quota
                }

                if (isNotFound) {
                    console.warn(`[Gemini] Model ${currentModel} NOT FOUND. Switching...`);
                } else {
                    console.warn(`[Gemini] Model ${currentModel} failed: ${error.message}`);
                }

                lastError = error;
                // Continue to next model
            }
        }

        console.error('[Gemini] All models failed.');
        throw lastError;
    }

    async chatWithTools(
        messages: Array<{ role: string; content: string | any[] }>,
        tools: any[],
        model?: string
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        const modelsToTry = model ? [model] : [DEFAULT_MODEL, ...FALLBACK_MODELS];
        let lastError: any;

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Tool Chat attempting with model: ${currentModel}`);
                const completion = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: tools,
                    tool_choice: 'auto',
                });

                return completion;
            } catch (error: any) {
                const isQuota = error.status === 429 || error.message?.includes('429');
                if (isQuota) {
                    console.error(`[Gemini] Tool Chat model ${currentModel} QUOTA EXHAUSTED.`);
                    throw error;
                }
                console.warn(`[Gemini] Tool Chat Model ${currentModel} failed: ${error.message}`);
                lastError = error;
            }
        }
        throw lastError;
    }

    getClient(): OpenAI | null {
        return this.client;
    }

    getApiKey(): string {
        return this.apiKey;
    }
}

// Singleton instance
export const geminiProvider = new GeminiProvider();
