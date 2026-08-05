import { noteMissingKey } from '../../../shared/startup-notes';
/**
 * Google Gemini Provider
 * Uses OpenAI-compatible API endpoint for Gemini models
 */

import OpenAI from 'openai';

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
// IMPORTANT: Trailing slash is REQUIRED for the OpenAI SDK to append /chat/completions correctly
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// Robust Model List with Fallbacks
const DEFAULT_MODEL = (process.env.GEMINI_MODEL || 'models/gemini-flash-latest').trim();
const FALLBACK_MODELS = [
    'models/gemini-flash-latest',
    'models/gemini-2.0-flash-exp',
    'models/gemini-pro-latest'
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
            noteMissingKey('Gemini', 'GOOGLE_API_KEY');
        }
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'dummy' && !!this.client;
    }

    /**
     * Sanitizes a JSON schema for Gemini compatibility.
     * Aggressively strips ALL properties that Google's OpenAI-compatible endpoint rejects.
     */
    private sanitizeSchema(schema: any, depth = 0): any {
        if (!schema || typeof schema !== 'object') return schema;
        // Safety: prevent infinite recursion on circular refs
        if (depth > 10) return { type: 'string' };

        const sanitized = { ...schema };

        // Remove ALL keywords known to cause 400 on Google's OpenAI proxy
        const forbidden = [
            'additionalProperties', 'pattern', 'allOf', 'anyOf', 'oneOf',
            'default', 'minItems', 'maxItems', 'minLength', 'maxLength',
            'format', 'strict', 'example', 'examples', '$ref', '$schema',
            '$id', '$comment', 'title', 'readOnly', 'writeOnly',
            'patternProperties', 'if', 'then', 'else', 'not',
            'discriminator', 'externalDocs', 'xml', 'deprecated',
            'nullable', 'exclusiveMinimum', 'exclusiveMaximum',
            'multipleOf', 'uniqueItems', 'const', 'contentMediaType',
            'contentEncoding', 'definitions', '$defs'
        ];

        for (const key of forbidden) {
            delete sanitized[key];
        }

        // Type array handling (e.g., ["string", "null"]) -> pick first primary type
        if (Array.isArray(sanitized.type)) {
            sanitized.type = sanitized.type.find((t: string) => t !== 'null') || sanitized.type[0];
        }

        // Recursively sanitize properties
        if (sanitized.properties && typeof sanitized.properties === 'object') {
            const sanitizedProps: any = {};
            let hasProps = false;
            for (const [key, value] of Object.entries(sanitized.properties)) {
                sanitizedProps[key] = this.sanitizeSchema(value, depth + 1);
                hasProps = true;
            }
            if (hasProps) {
                sanitized.properties = sanitizedProps;
            } else {
                delete sanitized.properties;
            }
        }

        // Recursively sanitize items for arrays
        if (sanitized.items && typeof sanitized.items === 'object') {
            sanitized.items = this.sanitizeSchema(sanitized.items, depth + 1);
        }

        // Sanitize enum to only contain primitive string values
        if (Array.isArray(sanitized.enum)) {
            sanitized.enum = sanitized.enum.filter((v: any) => typeof v === 'string' || typeof v === 'number');
            if (sanitized.enum.length === 0) delete sanitized.enum;
        }

        // Ensure object type has properties or is removed
        if (sanitized.type === 'object' && (!sanitized.properties || Object.keys(sanitized.properties).length === 0)) {
            // Gemini sometimes hates empty objects in tool definitions
            // If it's a top-level parameter, we might need to keep it, but let's see
        }

        return sanitized;
    }

    /**
     * Deep sanitize a tool definition for Gemini.
     * Strips `strict` from the function level and sanitizes all schemas.
     */
    private sanitizeTool(tool: any): any {
        if (tool.type === 'function' && tool.function) {
            const fn = { ...tool.function };
            delete fn.strict; // Gemini doesn't support OpenAI's strict mode
            if (fn.parameters) {
                fn.parameters = this.sanitizeSchema(fn.parameters);
            }
            return { type: 'function', function: fn };
        }
        return tool;
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
            const raw = [model, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean).map(String);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const m of raw) {
                if (!m.trim()) continue;
                // Force models/ prefix as REQUIRED by the Google OpenAI endpoint
                const prefixed = m.startsWith('models/') ? m : `models/${m}`;
                if (seen.has(prefixed)) continue;
                seen.add(prefixed);
                out.push(prefixed);
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
                    console.warn(`[Gemini] Model ${currentModel} QUOTA EXCEEDED, trying next model...`);
                    lastError = error;
                    continue;
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
            const raw = [model, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean).map(String);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const m of raw) {
                if (!m.trim()) continue;
                const prefixed = m.startsWith('models/') ? m : `models/${m}`;
                if (seen.has(prefixed)) continue;
                seen.add(prefixed);
                out.push(prefixed);
            }
            return out;
        })();
        let lastError: any;

        const sanitizedTools = tools.map((t: any) => this.sanitizeTool(t));

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Tool Chat attempting with model: ${currentModel}`);
                const completion = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: sanitizedTools,
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
                    console.warn(`[Gemini] Tool Chat model ${currentModel} QUOTA EXHAUSTED, trying next model...`);
                    lastError = error;
                    continue;
                }

                // Extract comprehensive error details for debugging
                let errorDetail = '';
                try {
                    const errObj = error?.error ?? error?.response?.data ?? error?.response?.body ?? error?.data ?? error?.body;
                    if (errObj != null) {
                        errorDetail = typeof errObj === 'string' ? errObj : JSON.stringify(errObj);
                    }
                    if (!errorDetail && error.message) {
                        errorDetail = error.message;
                    }
                    // Also check for raw response text
                    if (!errorDetail && error.response?.text) {
                        errorDetail = await error.response.text();
                    }
                } catch { errorDetail = error.message || 'Detail parse failed'; }

                console.warn(`[Gemini] Tool Chat model ${currentModel} failed (status=${status}): ${error.message}`);
                console.warn(`[Gemini] Error details: ${errorDetail}`);
                lastError = error;
            }
        }
        throw lastError;
    }

    /**
     * Streaming version of chatWithTools.
     * Emits each text delta to `onChunk` in real-time, enabling live Neural Interaction.
     * Returns the final assembled ChatCompletion object.
     */
    async chatWithToolsStreaming(
        messages: Array<{ role: string; content: string | any[] }>,
        tools: any[],
        onChunk: (text: string) => void,
        model?: string
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        const modelsToTry = (() => {
            const raw = [model, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean).map(String);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const m of raw) {
                if (!m.trim()) continue;
                const prefixed = m.startsWith('models/') ? m : `models/${m}`;
                if (seen.has(prefixed)) continue;
                seen.add(prefixed);
                out.push(prefixed);
            }
            return out;
        })();
        let lastError: any;

        const sanitizedTools = tools.map((t: any) => this.sanitizeTool(t));

        for (const currentModel of modelsToTry) {
            try {
                console.info(`[Gemini] Streaming Tool Chat attempting with model: ${currentModel}`);

                // @ts-ignore
                const stream = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: sanitizedTools,
                    stream: true,
                });

                // Accumulate the full response while streaming chunks
                let fullContent = '';
                let toolCalls: any[] = [];
                let finishReason: string | null = null;
                let chunkCount = 0;

                // @ts-ignore
                for await (const chunk of stream) {
                    // @ts-ignore
                    const delta = chunk.choices?.[0]?.delta;
                    if (!delta) continue;

                    // Stream text content in real-time
                    if (delta.content) {
                        fullContent += delta.content;
                        chunkCount++;
                        // Emit every chunk to the Neural Indicator
                        try { onChunk(delta.content); } catch { }
                    }

                    // Accumulate tool calls
                    if (delta.tool_calls) {
                        // @ts-ignore
                        for (const tc of delta.tool_calls as any[]) {
                            const idx = (tc as any).index ?? 0;
                            if (!toolCalls[idx]) {
                                toolCalls[idx] = {
                                    id: tc.id || `call_${idx}`,
                                    type: 'function',
                                    function: { name: '', arguments: '' }
                                };
                            }
                            if (tc.function?.name) {
                                toolCalls[idx].function.name += tc.function.name;
                            }
                            if (tc.function?.arguments) {
                                toolCalls[idx].function.arguments += tc.function.arguments;
                            }
                        }
                    }

                    if (chunk.choices?.[0]?.finish_reason) {
                        finishReason = chunk.choices[0].finish_reason;
                    }
                }

                console.info(`[Gemini] Streaming complete: ${chunkCount} chunks, ${toolCalls.length} tool calls`);

                // Reconstruct a ChatCompletion-like object
                const assembled: OpenAI.Chat.Completions.ChatCompletion = {
                    id: `gemini-stream-${Date.now()}`,
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: currentModel,
                    choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: fullContent || null,
                            refusal: null,
                            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                        },
                        finish_reason: (finishReason as any) || 'stop',
                        logprobs: null,
                    }],
                };

                return assembled;
            } catch (error: any) {
                const status = Number(error?.status ?? error?.response?.status ?? NaN);
                if (status === 429) {
                    console.warn(`[Gemini] Streaming Tool Chat model ${currentModel} QUOTA EXHAUSTED, trying next model...`);
                    lastError = error;
                    continue;
                }

                // Extract comprehensive error details
                let errorDetail = '';
                try {
                    const errObj = error?.error ?? error?.response?.data ?? error?.data ?? error?.body;
                    if (errObj != null) {
                        errorDetail = typeof errObj === 'string' ? errObj : JSON.stringify(errObj);
                    }
                    if (!errorDetail) errorDetail = error.message || 'No detail';
                } catch { errorDetail = error.message || 'Detail parse failed'; }

                console.warn(`[Gemini] Streaming Tool Chat model ${currentModel} failed (status=${status}): ${error.message}`);
                console.warn(`[Gemini] Streaming error details: ${errorDetail}`);
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
