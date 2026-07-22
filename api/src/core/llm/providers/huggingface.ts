import OpenAI from 'openai';

// Hugging Face models available
export const HUGGINGFACE_MODELS = {
    LLAMA_3_70B: 'meta-llama/Meta-Llama-3-70B-Instruct',
    MISTRAL_7B: 'mistralai/Mistral-7B-Instruct-v0.2',
    QWEN_72B: 'Qwen/Qwen2-72B-Instruct',
    MIXTRAL_8X7B: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    DEFAULT: 'meta-llama/Meta-Llama-3-70B-Instruct'
};

const BASE_URL = 'https://api-inference.huggingface.co/v1';

export class HuggingFaceProvider {
    private client: OpenAI;
    private apiKey: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.HUGGINGFACE_API_KEY || 'hf_dummy';
        this.apiKey = key;

        this.client = new OpenAI({
            apiKey: key,
            baseURL: BASE_URL,
        });
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'hf_dummy' && this.apiKey !== 'dummy';
    }

    async chatComplete(messages: any[], model?: string): Promise<string> {
        try {
            const selectedModel = model || HUGGINGFACE_MODELS.DEFAULT;

            console.log(`[HuggingFace] Using model: ${selectedModel}`);

            const completion = await this.client.chat.completions.create({
                model: selectedModel,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
                max_tokens: 2048,
                temperature: 0.7
            });

            return completion.choices[0]?.message?.content || '';
        } catch (error: any) {
            console.error('[HuggingFace] Chat Failed:', error.message);

            // Better error messages
            if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
                throw new Error('HUGGINGFACE_AUTH_FAILED: Invalid API key. Get yours at https://huggingface.co/settings/tokens');
            }
            if (error.message?.includes('rate limit')) {
                throw new Error('HUGGINGFACE_RATE_LIMIT: Free tier limit reached. Upgrade or wait.');
            }
            if (error.message?.includes('model not found')) {
                throw new Error(`HUGGINGFACE_MODEL_NOT_FOUND: Model ${model} not available`);
            }

            throw new Error(`HuggingFace API Failed: ${error.message}`);
        }
    }
}
