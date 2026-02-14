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
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
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

    /**
     * Sanitizes a JSON schema for Gemini compatibility.
     * Strips properties that Google's OpenAI-compatible endpoint often rejects.
     */
    private sanitizeSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') return schema;

        const sanitized = { ...schema };

        // Remove keywords known to cause 400 on Google's OpenAI proxy
        delete sanitized.additionalProperties;
        delete sanitized.pattern;
        delete sanitized.allOf;
        delete sanitized.anyOf;
        delete sanitized.oneOf;
        delete sanitized.default;

        // Recursively sanitize properties
        if (sanitized.properties && typeof sanitized.properties === 'object') {
            const sanitizedProps: any = {};
            for (const [key, value] of Object.entries(sanitized.properties)) {
                sanitizedProps[key] = this.sanitizeSchema(value);
            }
            sanitized.properties = sanitizedProps;
        }

        // Recursively sanitize items for arrays
        if (sanitized.items && typeof sanitized.items === 'object') {
            sanitized.items = this.sanitizeSchema(sanitized.items);
        }

        return sanitized;
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

        // Sanitize tool schemas if provided
        const sanitizedTools = tools && tools.length > 0 ? tools.map((t: any) => {
            if (t.type === 'function' && t.function && t.function.parameters) {
                return {
                    ...t,
                    function: {
                        ...t.function,
                        parameters: this.sanitizeSchema(t.function.parameters)
                    }
                };
            }
            return t;
        }) : undefined;

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Attempting with model: ${currentModel}`);
                const params: any = {
                    model: currentModel,
                    messages: messages as any,
                };

                if (sanitizedTools) {
                    params.tools = sanitizedTools;
                    params.tool_choice = currentModel.includes('lite') ? undefined : 'auto';
                }

                const completion = await this.client.chat.completions.create(params);

                if (!completion || !completion.choices || completion.choices.length === 0) {
                    console.warn(`[Gemini] Model ${currentModel} returned empty response, trying next model...`);
                    lastError = new Error('Empty response from Gemini');
                    continue;
                }

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
                const isBadRequest = error.status === 400 || error.message?.includes('400');

                if (isQuota) {
                    console.error(`[Gemini] Model ${currentModel} QUOTA EXCEEDED.`);
                    throw error;
                }

                const errorDetail = await (async () => {
                    try {
                        const data = (error as any)?.response?.data ?? (error as any)?.data ?? (error as any)?.error;
                        if (data == null) return error.message || 'No detail';
                        return typeof data === 'string' ? data : JSON.stringify(data);
                    } catch { return 'Detail parse failed'; }
                })();

                console.warn(`[Gemini] Model ${currentModel} failed (status=${status}): ${error.message} details=${errorDetail}`);
                lastError = error;
            }
        }

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

        const sanitizedTools = tools.map((t: any) => {
            if (t.type === 'function' && t.function && t.function.parameters) {
                return {
                    ...t,
                    function: {
                        ...t.function,
                        parameters: this.sanitizeSchema(t.function.parameters)
                    }
                };
            }
            return t;
        });

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Tool Chat attempting with model: ${currentModel}`);
                const completion = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: sanitizedTools,
                    tool_choice: currentModel.includes('lite') ? undefined : 'auto',
                });

                if (!completion || !completion.choices || completion.choices.length === 0) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} returned empty response, trying next model...`);
                    lastError = new Error('Empty response from Gemini Tool Chat');
                    continue;
                }

                const message = completion.choices[0]?.message;
                if (!message) {
                    console.warn(`[Gemini] Tool Chat model ${currentModel} returned no message, trying next model...`);
                    lastError = new Error('No message in Gemini Tool Chat response');
                    continue;
                }

                return completion;
            } catch (error: any) {
                const status = Number(error?.status ?? error?.response?.status ?? NaN);
                if (status === 429) {
                    console.error(`[Gemini] Tool Chat model ${currentModel} QUOTA EXHAUSTED.`);
                    throw error;
                }

                const errorDetail = await (async () => {
                    try {
                        const data = (error as any)?.response?.data ?? (error as any)?.data ?? (error as any)?.error;
                        if (data == null) return error.message || 'No detail';
                        return typeof data === 'string' ? data : JSON.stringify(data);
                    } catch { return 'Detail parse failed'; }
                })();

                console.warn(`[Gemini] Tool Chat model ${currentModel} failed (status=${status}): ${error.message} details=${errorDetail}`);
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
