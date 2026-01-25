
import OpenAI from 'openai';

// Models available on Pollinations (OpenAI compatible)
export const POLLINATIONS_MODELS = {
    GPT4O: 'gpt-4o', // Mapped to whatever pollinations uses
    DEFAULT: 'openai'
};

const BASE_URL = 'https://text.pollinations.ai/openai';

export class PollinationsProvider {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: 'dummy', // No key required
            baseURL: BASE_URL,
        });
    }

    async chatComplete(messages: any[], model: string = 'openai', retries: number = 3): Promise<string> {
        try {
            const completion = await this.client.chat.completions.create({
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            }, { timeout: 30000 }); // 30s timeout

            const response = completion.choices[0]?.message?.content || '';
            if (!response || response.length < 2) {
                if (retries > 0) {
                    console.warn(`[Pollinations] Empty response, retrying... (${retries} left)`);
                    return this.chatComplete(messages, model, retries - 1);
                }
            }
            return response;
        } catch (error: any) {
            const isRetryable = error.status === 429 || error.status === 503 || error.message.includes('timeout');
            if (isRetryable && retries > 0) {
                const delay = error.status === 429 ? 3000 : 1500;
                console.warn(`[Pollinations] Failed (${error.status || 'timeout'}), retrying in ${delay / 1000}s... (${retries} left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.chatComplete(messages, model, retries - 1);
            }
            console.error("Pollinations Chat Failed:", error.message);
            return ""; // Return empty string to trigger router fallback correctly
        }
    }

}
