/**
 * LLM7 Provider  (KEYLESS)
 * A free, anonymous, OpenAI-compatible gateway (https://llm7.io) that serves
 * open models (GPT-OSS, Llama 3.1, GLM, gpt-4o-mini, ...) with NO API key and
 * NO signup. Used as a primary keyless brain so Joe can run without any key.
 *
 * Optional overrides (all keyless by default):
 *   LLM7_BASE_URL   (default https://api.llm7.io/v1)
 *   LLM7_MODEL      (default gpt-4o-mini)
 *   LLM7_API_KEY    (optional; public/anonymous access works without it)
 */

import OpenAI from 'openai';

const LLM7_BASE_URL = (process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1').trim();
const LLM7_DEFAULT_MODEL = (process.env.LLM7_MODEL || 'gpt-4o-mini').trim();
// A short chain of models to try in case the default is unavailable on the gateway.
const LLM7_FALLBACK_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'llama-3.1-8b-instruct', 'gpt-o4-mini'];

export class LLM7Provider {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            // Anonymous access: any non-empty token is accepted by the public gateway.
            apiKey: (process.env.LLM7_API_KEY || 'unused').trim() || 'unused',
            baseURL: LLM7_BASE_URL,
        });
    }

    // Always available: it is keyless by design.
    isAvailable(): boolean {
        return String(process.env.LLM7_DISABLE || '').trim() !== '1';
    }

    async chatComplete(messages: any[], model?: string, tools?: any[]): Promise<string> {
        const primary = (model || LLM7_DEFAULT_MODEL).trim();
        const modelsToTry = [primary, ...LLM7_FALLBACK_MODELS.filter(m => m !== primary)];
        let lastErr: any = null;

        for (const m of modelsToTry) {
            try {
                const body: any = {
                    model: m,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                    })),
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

                const completion = await this.client.chat.completions.create(body, { timeout: 30000 });
                const message = completion.choices[0]?.message;

                if (message?.tool_calls && message.tool_calls.length > 0) {
                    return JSON.stringify({ type: 'tool_calls', tool_calls: message.tool_calls });
                }

                const content = message?.content || '';
                if (content && content.length >= 2) {
                    return content;
                }
                lastErr = new Error('LLM7 empty response');
            } catch (error: any) {
                lastErr = error;
                // Try the next model on 404/400 (model not available); otherwise keep trying briefly.
                console.warn(`[LLM7] model "${m}" failed: ${error.status || error.message}`);
            }
        }

        throw new Error(`LLM7 keyless gateway failed: ${lastErr?.message || 'unknown error'}`);
    }
}

export const llm7Provider = new LLM7Provider();
