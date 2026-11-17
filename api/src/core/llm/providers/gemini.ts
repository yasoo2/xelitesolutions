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

interface GeminiRequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    /**
     * The model the user chose, and only that model. Without it a failure
     * walks the fallback list, which is right for Auto and wrong for a choice:
     * measured 2026-11-17 against a fake that speaks Google's wire, a 503 on
     * the chosen gemini-3.5-flash-lite was answered by gemini-flash-latest,
     * gemini-2.0-flash-exp and gemini-pro-latest in turn, and the run reported
     * the last one's 404 («the provider does not serve this model»).
     */
    exactModel?: boolean;
    /** Live tokens of a chat with no tools, as they arrive. */
    onDelta?: (piece: string) => void;
}

/** The models one call may run on: the given one, then (unless it must be exact) the fallbacks. */
function modelsToTryFor(model: string | undefined, exact: boolean | undefined): string[] {
    const raw = (exact && model ? [model] : [model, DEFAULT_MODEL, ...FALLBACK_MODELS]).filter(Boolean).map(String);
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
}

/** Google's RetryInfo delay («17s», «1.5s») in whole seconds, rounded up. */
function retryDelaySeconds(details: unknown): number | undefined {
    if (!Array.isArray(details)) return undefined;
    const info = details.find((d: any) => /RetryInfo$/.test(String(d?.['@type'] || '')));
    const m = /^(\d+(?:\.\d+)?)s$/.exec(String(info?.retryDelay || '').trim());
    return m ? Math.max(1, Math.ceil(Number(m[1]))) : undefined;
}

/**
 * ⛔ GOOGLE'S REFUSALS ARRIVED AS «400 status code (no body)».
 *
 * The OpenAI-compatible endpoint answers an error with a JSON ARRAY of one
 * error ([{"error":{code,message,status,details}}]); the OpenAI SDK reads
 * `body.error`, finds nothing, and Google's own words were lost: «API key not
 * valid», «You exceeded your current quota», «Function call is missing a
 * thought_signature». The quota's RetryInfo («retryDelay": "17s») went with
 * them, so a one-minute limit paused the provider for the router's default
 * five minutes. The body is handed to the SDK as the object it expects, and
 * the delay as the Retry-After header every reader in Joe already honours.
 */
export function geminiErrorBodyFetch(base: () => typeof fetch = () => globalThis.fetch): typeof fetch {
    return (async (input: any, init?: any) => {
        const res = await base()(input, init);
        if (res.ok) return res;
        let text = '';
        try { text = await res.text(); } catch { return res; }
        let body = text;
        let delay: number | undefined;
        try {
            const parsed = JSON.parse(text);
            const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
            if (error && typeof error === 'object') {
                body = JSON.stringify({ error });
                delay = retryDelaySeconds(error.details);
            }
        } catch { /* not JSON: passed on as it came */ }
        const headers = new Headers(res.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        if (delay && !headers.has('retry-after')) headers.set('retry-after', String(delay));
        return new Response(body, { status: res.status, statusText: res.statusText, headers });
    }) as typeof fetch;
}

function stopsModelFallback(error: any, signal?: AbortSignal): boolean {
    if (signal?.aborted || ['AbortError', 'APIUserAbortError'].includes(error?.name) || error?.code === 'ABORT_ERR') return true;
    const status = Number(error?.status ?? error?.response?.status ?? error?.error?.code);
    const detail = [error?.message, error?.code, error?.error?.message, error?.error?.status, error?.error?.code].join(' ');
    return [401, 403, 429].includes(status)
        || /\b(?:401|403|429)\b|quota|resource[_\s-]*exhausted|rate[_\s-]*limit|too many requests|unauthori[sz]ed|unauthenticated|forbidden|permission[_\s-]*denied|invalid[_\s-]*api[_\s-]*key|api[_\s-]*key[_\s-]*invalid/i.test(detail);
}

function requestOptions(options?: GeminiRequestOptions): { signal?: AbortSignal; timeout?: number } | undefined {
    if (!options) return undefined;
    const result: { signal?: AbortSignal; timeout?: number } = {};
    if (options.signal) result.signal = options.signal;
    if (Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0) result.timeout = options.timeoutMs;
    return Object.keys(result).length > 0 ? result : undefined;
}

export class GeminiProvider {
    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || GEMINI_API_KEY;
        if (this.apiKey) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: GEMINI_BASE_URL,
                maxRetries: 0,
                fetch: geminiErrorBodyFetch(),
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
        tools?: any[],
        options?: GeminiRequestOptions
    ): Promise<string> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        const modelsToTry = modelsToTryFor(model, options?.exactModel);
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
            options?.signal?.throwIfAborted();
            try {
                console.info(`[Gemini] Attempting with model: ${currentModel}`);
                const params: any = {
                    model: currentModel,
                    messages: messages as any,
                };

                if (sanitizedTools) {
                    params.tools = sanitizedTools;
                }

                //  A chat with no tools streams when the caller shows tokens live:
                //  every other provider's chat did, and Gemini's arrived whole.
                if (options?.onDelta && !sanitizedTools) {
                    const stream: any = await this.client.chat.completions.create({ ...params, stream: true }, requestOptions(options));
                    let text = '';
                    for await (const chunk of stream) {
                        options?.signal?.throwIfAborted();
                        const piece = chunk?.choices?.[0]?.delta?.content || '';
                        if (piece) { text += piece; try { options.onDelta(piece); } catch { /* the window only */ } }
                    }
                    if (text.trim()) return text;
                    lastError = new Error('Empty response from Gemini');
                    continue;
                }

                const completion = await this.client.chat.completions.create(params, requestOptions(options));

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
                if (stopsModelFallback(error, options?.signal)) throw error;

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
        model?: string,
        options?: GeminiRequestOptions
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        const modelsToTry = modelsToTryFor(model, options?.exactModel);
        let lastError: any;

        const sanitizedTools = tools.map((t: any) => this.sanitizeTool(t));

        for (const currentModel of modelsToTry) {
            options?.signal?.throwIfAborted();
            try {
                console.info(`[Gemini] Tool Chat attempting with model: ${currentModel}`);
                const completion = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: sanitizedTools,
                }, requestOptions(options));

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
                if (stopsModelFallback(error, options?.signal)) throw error;

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
        model?: string,
        options?: GeminiRequestOptions
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        if (!this.client) {
            throw new Error('Gemini API key not configured');
        }

        const modelsToTry = modelsToTryFor(model, options?.exactModel);
        let lastError: any;

        const sanitizedTools = tools.map((t: any) => this.sanitizeTool(t));

        for (const currentModel of modelsToTry) {
            options?.signal?.throwIfAborted();
            try {
                console.info(`[Gemini] Streaming Tool Chat attempting with model: ${currentModel}`);

                // @ts-ignore
                const stream = await this.client.chat.completions.create({
                    model: currentModel,
                    messages: messages as any,
                    tools: sanitizedTools,
                    stream: true,
                }, requestOptions(options));

                // Accumulate the full response while streaming chunks
                let fullContent = '';
                let toolCalls: any[] = [];
                let finishReason: string | null = null;
                let chunkCount = 0;

                // @ts-ignore
                for await (const chunk of stream) {
                    options?.signal?.throwIfAborted();
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
                if (stopsModelFallback(error, options?.signal)) throw error;

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
