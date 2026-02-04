/**
 * Google Gemini Provider
 * Uses OpenAI-compatible API endpoint for Gemini models
 */

import OpenAI from 'openai';

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// Robust Model List with Fallbacks
const DEFAULT_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODELS = [
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest'
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

        const modelsToTry = (() => {
            const ordered = [model, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean).map(String);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const m of ordered) {
                if (!m.trim()) continue;
                if (seen.has(m)) continue;
                seen.add(m);
                out.push(m);
            }
            return out;
        })();
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

                // Safely access response - handle empty or malformed responses
                if (!completion || !completion.choices || completion.choices.length === 0) {
                    console.warn(`[Gemini] Model ${currentModel} returned empty response, trying next model...`);
                    lastError = new Error('Empty response from Gemini');
                    continue;
                }

                // Check for tool calls
                const message = completion.choices[0]?.message;
                if (!message) {
                    console.warn(`[Gemini] Model ${currentModel} returned no message, trying next model...`);
                    lastError = new Error('No message in Gemini response');
                    continue;
                }

                if (message.tool_calls && message.tool_calls.length > 0) {
                    return JSON.stringify({
                        type: 'tool_calls',
                        tool_calls: message.tool_calls,
                    });
                }

                return message.content || '';
            } catch (error: any) {
                const status = Number(error?.status ?? error?.response?.status ?? NaN);
                const isQuota = error.status === 429 || error.message?.includes('429');
                const isNotFound = error.status === 404 || error.message?.includes('404');
                const isBadRequest = error.status === 400 || error.message?.includes('400');
                const detail = (() => {
                    try {
                        const data = (error as any)?.response?.data ?? (error as any)?.data ?? (error as any)?.error;
                        if (data == null) return '';
                        if (typeof data === 'string') return data.slice(0, 500);
                        return JSON.stringify(data).slice(0, 800);
                    } catch {
                        return '';
                    }
                })();

                if (isQuota) {
                    console.error(`[Gemini] Model ${currentModel} QUOTA EXCEEDED.`);
                    throw error; // Stop immediately on quota
                }

                if (isNotFound) {
                    console.warn(`[Gemini] Model ${currentModel} NOT FOUND (status=${Number.isFinite(status) ? status : 'n/a'}). Switching...`);
                } else if (isBadRequest) {
                    console.warn(`[Gemini] Model ${currentModel} BAD REQUEST (status=${Number.isFinite(status) ? status : 'n/a'}). Switching...${detail ? ` details=${detail}` : ''}`);
                } else {
                    console.warn(`[Gemini] Model ${currentModel} failed (status=${Number.isFinite(status) ? status : 'n/a'}): ${error.message}${detail ? ` details=${detail}` : ''}`);
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

        const modelsToTry = (() => {
            const ordered = [model, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean).map(String);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const m of ordered) {
                if (!m.trim()) continue;
                if (seen.has(m)) continue;
                seen.add(m);
                out.push(m);
            }
            return out;
        })();
        let lastError: any;

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Tool Chat attempting with model: ${currentModel}`);
                const completion = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: tools,
                });

                // Safely access response - handle empty or malformed responses
                if (!completion || !completion.choices || completion.choices.length === 0) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} returned empty response, trying next model...`);
                    lastError = new Error('Empty response from Gemini Tool Chat');
                    continue;
                }

                // Validate message exists
                const message = completion.choices[0]?.message;
                if (!message) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} returned no message, trying next model...`);
                    lastError = new Error('No message in Gemini Tool Chat response');
                    continue;
                }

                return completion;
            } catch (error: any) {
                const status = Number(error?.status ?? error?.response?.status ?? NaN);
                const isQuota = error.status === 429 || error.message?.includes('429');
                const isNotFound = error.status === 404 || error.message?.includes('404');
                const isBadRequest = error.status === 400 || error.message?.includes('400');
                const detail = (() => {
                    try {
                        const data = (error as any)?.response?.data ?? (error as any)?.data ?? (error as any)?.error;
                        if (data == null) return '';
                        if (typeof data === 'string') return data.slice(0, 500);
                        return JSON.stringify(data).slice(0, 800);
                    } catch {
                        return '';
                    }
                })();
                if (isQuota) {
                    console.error(`[Gemini] Tool Chat model ${currentModel} QUOTA EXHAUSTED.`);
                    throw error;
                }
                if (isNotFound) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} NOT FOUND (status=${Number.isFinite(status) ? status : 'n/a'}). Switching...`);
                } else if (isBadRequest) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} BAD REQUEST (status=${Number.isFinite(status) ? status : 'n/a'}). Switching...${detail ? ` details=${detail}` : ''}`);
                } else {
                    console.warn(`[Gemini] Tool Chat Model ${currentModel} failed (status=${Number.isFinite(status) ? status : 'n/a'}): ${error.message}${detail ? ` details=${detail}` : ''}`);
                }
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
