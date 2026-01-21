
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

    async chatComplete(messages: any[], model: string = 'openai', retries: number = 2): Promise<string> {
        try {
            const completion = await this.client.chat.completions.create({
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            });

            return completion.choices[0]?.message?.content || '';
        } catch (error: any) {
            if (error.status === 429 && retries > 0) {
                console.warn(`[Pollinations] Rate limited (429), retrying in 2s... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.chatComplete(messages, model, retries - 1);
            }
            console.error("Pollinations Chat Failed:", error);
            throw new Error(`Pollinations API Failed: ${error.message}`);
        }
    }
}
