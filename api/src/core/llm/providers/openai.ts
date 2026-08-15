import { noteMissingKey } from '../../../shared/startup-notes';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export interface OpenAIRequestOptions {
    maxCompletionTokens?: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    /** Bounded provider deadline; unlike Promise.race this also aborts HTTP. */
    timeoutMs?: number;
    signal?: AbortSignal;
}

export class OpenAIProvider {
    private client: OpenAI | null = null;
    private apiKey: string;
    private baseURL: string;
    private resolvedCompatibleModel: string | null = null;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || OPENAI_API_KEY;
        this.baseURL = String(process.env.OPENAI_API_BASE || '').trim();
        // The public OpenAI endpoint uses `sk-…` keys, while compatible
        // managed/local gateways can use another credential format. A
        // non-standard credential is permitted only when an operator explicitly
        // configures a compatible base URL, so it is never sent to the public
        // OpenAI endpoint by accident.
        const hasOfficialKey = this.apiKey.startsWith('sk-');
        const hasCompatibleGatewayCredential = Boolean(this.baseURL && this.apiKey);
        if (hasOfficialKey || hasCompatibleGatewayCredential) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
                ...(this.baseURL ? { baseURL: this.baseURL } : {}),
            });
            console.info('[OpenAI] Provider initialized with configured credentials');
        } else {
            noteMissingKey('OpenAI', 'OPENAI_API_KEY');
        }
    }

    isAvailable(): boolean {
        return !!this.client;
    }

    /**
     * A compatible endpoint may expose a narrower and independently changing
     * catalogue than api.openai.com. Ask its `/models` endpoint once, rather
     * than declaring every later task impossible because a historic default
     * such as `gpt-4o` is not present. Operators retain full control through
     * OPENAI_MODEL; an unavailable catalogue leaves the requested model alone.
     */
    private buildRequestOptions(options?: OpenAIRequestOptions): { signal?: AbortSignal; timeout?: number } | undefined {
        const requestOptions: { signal?: AbortSignal; timeout?: number } = {};
        if (options?.signal) requestOptions.signal = options.signal;
        const timeoutMs = Number(options?.timeoutMs);
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
            requestOptions.timeout = Math.max(1, Math.floor(timeoutMs));
        }
        return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
    }

    private async resolveModel(requestedModel: string, options?: OpenAIRequestOptions): Promise<string> {
        const configured = String(process.env.OPENAI_MODEL || '').trim();
        if (configured) return configured;
        if (!this.baseURL) return requestedModel;
        if (this.resolvedCompatibleModel) return this.resolvedCompatibleModel;

        try {
            const list = (this.client as any)?.models?.list;
            if (typeof list !== 'function') return requestedModel;
            const requestOptions = this.buildRequestOptions(options);
            const catalogue = requestOptions
                ? await list.call((this.client as any).models, requestOptions)
                : await list.call((this.client as any).models);
            const ids = Array.isArray(catalogue?.data)
                ? catalogue.data.map((item: any) => String(item?.id || '').trim()).filter(Boolean)
                : [];
            if (!ids.length) return requestedModel;

            const selected = ids.includes(requestedModel)
                ? requestedModel
                : ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-5-nano'].find(candidate => ids.includes(candidate))
                    || ids.find((id: string) => /^gpt-|^claude-|^gemini-/i.test(id))
                    || ids[0];
            this.resolvedCompatibleModel = selected;
            if (selected !== requestedModel) {
                console.info(`[OpenAI] Compatible gateway does not list ${requestedModel}; using discovered model: ${selected}`);
            }
            return selected;
        } catch (error: any) {
            console.warn(`[OpenAI] Could not list compatible gateway models; retaining requested model ${requestedModel}: ${error?.message || error}`);
            return requestedModel;
        }
    }

    async chatComplete(
        messages: Array<{ role: string; content: string | any[] }>,
        model: string = 'gpt-4o',
        tools?: any[],
        options?: OpenAIRequestOptions
    ): Promise<string> {
        if (!this.client) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const resolvedModel = await this.resolveModel(model, options);
            console.info(`[OpenAI] Attempting with model: ${resolvedModel}`);
            const request: any = {
                model: resolvedModel,
                messages: messages as any,
                tools: tools as any,
                tool_choice: tools ? 'auto' : undefined,
            };
            if (Number.isFinite(options?.maxCompletionTokens) && Number(options?.maxCompletionTokens) > 0) {
                request.max_completion_tokens = Math.floor(Number(options?.maxCompletionTokens));
            }
            if (options?.reasoningEffort) {
                request.reasoning = { effort: options.reasoningEffort };
            }
            const requestOptions = this.buildRequestOptions(options);
            const completion = requestOptions
                ? await (this.client.chat.completions.create as any)(request, requestOptions)
                : await this.client.chat.completions.create(request);

            const choices = Array.isArray((completion as any)?.choices)
                ? (completion as any).choices
                : [];
            const message = choices[0]?.message;
            if (!message) {
                const gatewayError = (completion as any)?.error?.message;
                if (gatewayError) {
                    throw new Error(`OpenAI compatible gateway error: ${String(gatewayError).slice(0, 300)}`);
                }
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
