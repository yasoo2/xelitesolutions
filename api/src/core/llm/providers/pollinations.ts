
import OpenAI from 'openai';

// Models available on Pollinations (OpenAI compatible)
export const POLLINATIONS_MODELS = {
    GPT4O: 'gpt-4o', // Mapped to whatever pollinations uses
    DEFAULT: 'openai'
};

const BASE_URL = 'https://text.pollinations.ai/openai';

export class PollinationsProvider {
    private client: OpenAI;
    private requestQueue: Promise<any> = Promise.resolve();

    constructor() {
        this.client = new OpenAI({
            apiKey: 'dummy', // No key required
            baseURL: BASE_URL,
        });
    }

    async chatComplete(messages: any[], model: string = 'openai', retries: number = 3, tools?: any[]): Promise<string> {
        const run = async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.executeChat(messages, model, retries, tools);
        };

        const result = new Promise<string>((resolve) => {
            this.requestQueue = this.requestQueue
                .then(run)
                .then(resolve)
                .catch((err) => {
                    console.error("[Pollinations Queue Error]:", err.message);
                    resolve("");
                });
        });
        return result;
    }

    private async executeChat(messages: any[], model: string = 'openai', retries: number = 3, tools?: any[]): Promise<string> {
        try {
            const body: any = {
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            };

            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = 'auto';
            }

            const completion = await this.client.chat.completions.create(body, { timeout: 30000 }); // 30s timeout

            const response = completion.choices[0]?.message?.content || '';
            const toolCalls = completion.choices[0]?.message?.tool_calls;

            if (toolCalls && toolCalls.length > 0) {
                return JSON.stringify({ tool_calls: toolCalls });
            }

            if (!response || response.length < 2) {
                if (retries > 0) {
                    console.warn(`[Pollinations] Empty response, retrying... (${retries} left)`);
                    return this.executeChat(messages, model, retries - 1, tools);
                }
            }
            return response;
        } catch (error: any) {
            const isRetryable = (error.status === 503 || error.message?.includes('timeout')) && error.status !== 402 && error.status !== 429;
            if (isRetryable && retries > 0) {
                const delay = 1000;
                console.warn(`[Pollinations] Failed (${error.status || 'timeout'}), retrying in ${delay / 1000}s... (${retries} left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.executeChat(messages, model, retries - 1, tools);
            }
            console.error(`Pollinations Chat Failed: ${error.status || error.message}`);
            return ""; // Return empty string to trigger router fallback immediately
        }
    }
}
